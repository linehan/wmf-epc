/*
 * Event Platform Client (EPC) 
 *
 *      _/\/\/\/\/\/\________________________________________/\/\_____
 *     _/\____________/\/\__/\/\____/\/\/\____/\/\/\/\____/\/\/\/\/\_ 
 *    _/\/\/\/\/\____/\/\__/\/\__/\/\/\/\/\__/\/\__/\/\____/\/\_____  
 *   _/\/\____________/\/\/\____/\/\________/\/\__/\/\____/\/\_____   
 *  _/\/\/\/\/\/\______/\________/\/\/\/\__/\/\__/\/\____/\/\/\___    
 * ______________________________________________________________     
 *      ___/\/\/\/\/\__/\/\____/\/\______________________________/\/\_____
 *     _/\/\__________/\/\______________/\/\/\____/\/\/\/\____/\/\/\/\/\_ 
 *    _/\/\__________/\/\____/\/\____/\/\/\/\/\__/\/\__/\/\____/\/\_____  
 *   _/\/\__________/\/\____/\/\____/\/\________/\/\__/\/\____/\/\_____   
 *  ___/\/\/\/\/\__/\/\/\__/\/\/\____/\/\/\/\__/\/\__/\/\____/\/\/\___    
 * __________________________________________________________________     
 *
 * DESCRIPTION 
 *     Collects events in an input buffer, adds some metadata, places them 
 *     in an ouput buffer where they are periodically bursted to a remote 
 *     endpoint via HTTP POST.
 *
 *     Designed for use with MediaWiki browser clients producing events to 
 *     the EventGate intake service.
 *
 * LICENSE NOTICE
 *     Copyright (C) 2019 Wikimedia Foundation 
 *
 *     This program is free software; you can redistribute it and/or
 *     modify it under the terms of the GNU General Public License
 *     as published by the Free Software Foundation; either version 2
 *     of the License, or (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program; if not, write to the Free Software
 *     Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 
 *     02110-1301, USA.
 *
 * AUTHORS
 *     Jason Linehan <jlinehan@wikimedia.org>
 *     Mikhail Popov <mpopov@wikimedia.org>
 */
var EPC = (function(
        __http_post,
        __set_store,
        __get_store,
        __del_store,
        __new_id,
        __generate_uuid_v4,
        __get_iso_8601_timestamp,
        __client_cannot_be_tracked,
        __input_buffer_enqueue
) {
        /**********************************************************************
         * OUTPUT BUFFER 
         *
         * Transmissions are buffered to follow a "burst" strategy.
         * This strategy allows radio devices to remain in a sleep 
         * state for longer, improving battery life.
         *
         **********************************************************************/

        /* 
         * The number of items that can be 
         * added to QUEUE before TIMER becomes 
         * non-interruptable 
         */
        var WAIT_ITEMS = 10;

        /* 
         * The number of milliseconds during 
         * which TIMER can be interrupted and 
         * reset by the arrival of a new item.
         */
        var WAIT_MS = 2000;

        /* When FALSE, QUEUE can't be emptied */
        var ENABLED = true;

        /* Queue items are [url, body] pairs */
        var QUEUE = []; 

        /* Timeout controls the HTTP request bursting */
        var TIMER = null;

        /**
         * send_all_scheduled 
         * ------------------
         * Call send() on all enqueued elements.
         *
         * @return: nothing
         */
        function send_all_scheduled() 
        {
                clearTimeout(TIMER);

                if (ENABLED) {
                        /* 
                         * All items scheduled on QUEUE 
                         * are permanently removed. 
                         */
                        var arr = QUEUE.splice(0, QUEUE.length);
                        for (var i=0; i<arr.length; i++) {
                                /*
                                 * All data will be lost if
                                 * send() fails. It is not
                                 * added back to QUEUE. 
                                 */
                                send(arr[i][0], arr[i][1]);
                        }
                } else {
                        /* 
                         * All items scheduled on QUEUE
                         * remain queued, and could be 
                         * sent later. 
                         */
                }
        }

        /**
         * schedule 
         * --------
         * Schedule the request to be sent later.
         *
         * @url   : <string> destination of the HTTP POST request
         * @body  : <string> body of the HTTP POST request
         * @return: nothing
         */
        function schedule(url, body) 
        {
                QUEUE.push([url, body]);

                if (ENABLED) {
                        if (QUEUE.length >= WAIT_ITEMS) {
                                /* 
                                 * >= because we might have been 
                                 * disabled and accumulated who 
                                 * knows how many items.
                                 */
                                send_all_scheduled();
                        } else {
                                /*
                                 * The new item arrival interrupts
                                 * the timer and resets the countdown.
                                 */
                                clearTimeout(TIMER);
                                TIMER = setTimeout(send_all_scheduled, WAIT_MS);
                        }
                }
        }

        /**
         * send 
         * ----
         * Send an HTTP POST request with the given url and body. 
         *
         * @url   : <string> destination of the HTTP POST request
         * @body  : <string> body of the HTTP POST request
         * @return: nothing
         */
        function send(url, body) 
        {
                if (ENABLED) {
                        __http_post(url, body); 
                        /* 
                         * Since we just woke the device's
                         * radio by calling http_post(), we
                         * might as well flush the buffer.
                         */
                        send_all_scheduled();
                } else {
                        /*
                         * The output buffer is disabled;
                         * do nothing. 
                         */
                }
        }

        /**
         * enable_sending 
         * --------------
         * Enable HTTP requests from the output buffer 
         *
         * @return: nothing
         */
        function enable_sending() 
        {
                ENABLED = true;
                /*
                 * We try right away to send any messages
                 * in the queue. This behavior is handy.
                 */
                send_all_scheduled();
        }

        /**
         * disable_sending 
         * ---------------
         * Disable HTTP requests from the output buffer 
         *
         * @return: nothing
         */
        function disable_sending() 
        {
                ENABLED = false;
        }

        /**********************************************************************
         * ASSOCIATION CONTROLLER 
         **********************************************************************/

        var PAGEVIEW_ID = null;
        var SESSION_ID = null;
        
        /* Maps stream_name => activity # */
        var ACTIVITY_TABLE = null; 

        /* Monotonically incr. activity counter */
        var ACTIVITY_COUNT = null; 

        /**
         * pageview_id
         * -----------
         * Generate a pageview id 
         *
         * @return: <string>  
         *
         * Uniformly-random 80-bit integer, represented 
         * as a 0-padded 20-character string of hexadecimal 
         * digits, e.g.:
         * 
         *      "ffffffffffffffffffff",
         */
        function pageview_id() 
        {
                if (!PAGEVIEW_ID) {
                        PAGEVIEW_ID = __new_id(); 
                }
                return PAGEVIEW_ID; 
        }

        /**
         * session_id 
         * ----------
         * Generate a session id 
         *
         * @return: <string>  
         *
         * Uniformly-random 80-bit integer, represented 
         * as a 0-padded 20-character string of hexadecimal 
         * digits, e.g.:
         * 
         *      "ffffffffffffffffffff",
         */
        function session_id() 
        {
                if (!SESSION_ID) {
                        /* 
                         * If there is no runtime value 
                         * for SESSION_ID, try to load 
                         * a value from persistent store.
                         */
                        SESSION_ID = __get_store("sid");

                        if (!SESSION_ID) {
                                /* 
                                 * If there is no value in
                                 * the persistence layer,
                                 * generate a new value for 
                                 * SESSION_ID, and write the
                                 * update to the persistence 
                                 * layer.
                                 */
                                SESSION_ID = __new_id();
                                __set_store("sid", SESSION_ID);
                        }
                }
                return SESSION_ID; 
        }

        /**
         * activity_id 
         * -----------
         * Generate an activity id 
         *
         * @stream: <string> name of the relevent stream
         * @prefix: <string> hexadecimal ID prefix
         * @return: <string>  
         *
         * Concatenation of either a pageview or session ID,
         * and a 16-bit integer (the activity sequence number)
         * represented as a 0-padded 4-character string of 
         * hexadecimal digits, e.g.:
         *
         *      "ffffffffffffffffffff0123",
         */
        function activity_id(stream, prefix) 
        {
                if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                        /*
                         * If there is no runtime value for
                         * ACTIVITY_COUNT or ACTIVITY_TABLE,
                         * try to load their values from the
                         * persistent store.
                         */
                        ACTIVITY_COUNT = __get_store("ac");
                        ACTIVITY_TABLE = __get_store("at");

                        if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                                /* 
                                 * If values are missing from 
                                 * the persistent store, reset
                                 * the ACTIVITY_TABLE and 
                                 * ACTIVITY_COUNT variables,
                                 * and write the update to the 
                                 * persistent store.
                                 */
                                ACTIVITY_TABLE = {};
                                ACTIVITY_COUNT = 1;
                                __set_store("at", ACTIVITY_TABLE);
                                __set_store("ac", ACTIVITY_COUNT);
                        }
                }

                if (stream) {
                        if (!(stream in ACTIVITY_TABLE)) {
                                /*
                                 * If ACTIVITY_TABLE has not
                                 * recorded an activity number 
                                 * for @stream, assign one
                                 * using ACTIVITY_COUNT, then
                                 * increment ACTIVITY_COUNT,
                                 * and write these updates
                                 * to the persistent store.
                                 */
                                ACTIVITY_TABLE[stream] = ACTIVITY_COUNT++;
                                __set_store("at", ACTIVITY_TABLE);
                                __set_store("ac", ACTIVITY_COUNT);
                        }

                        /*
                         * Format the activity ID value by
                         * combining the ID corresponding
                         * to the given scope, and the
                         * number stored in ACTIVITY_TABLE.
                         */
                        var count = ACTIVITY_TABLE[stream];

                        /* like printf("%s%04x", id, count) */
                        return prefix+(count+0x10000).toString(16).slice(1);
                }
        }

        /**
         * begin_new_session 
	 * ----------------- 
         * Unset the session.
         *
         * @return: nothing
         */
        function begin_new_session() 
        {
                /*
                 * Clear runtime and persisted
                 * value for SESSION_ID.
                 */
                SESSION_ID = null;
                __del_store("sid"); 

                /* 
                 * A session refresh implies a 
                 * pageview refresh, so clear
                 * runtime value of PAGEVIEW_ID.
                 */ 
                PAGEVIEW_ID = null;

                /* 
                 * A session refresh implies an 
                 * activity counter refresh, so
                 * clear runtime and persisted
                 * values for ACTIVITY_TABLE 
                 * and ACTIVITY_COUNT. 
                 */
                ACTIVITY_TABLE = null;
                ACTIVITY_COUNT = null;
                __del_store("at");
                __del_store("ac");
        }

        /**
         * begin_new_activity 
         * ------------------ 
         * Unset the activity increment for a stream.
         *
         * @stream: <string> name of stream to reset
         * @return: nothing
         */
        function begin_new_activity(stream) 
        {
                /*
                 * Ensure ACTIVITY_TABLE and
                 * ACTIVITY_COUNT are loaded 
                 * from the persistent store 
                 * (or generated).
                 */
                activityID(); 

                if (stream in ACTIVITY_TABLE) {
                        /*
                         * Delete the entry under @stream,
                         * then write the update to the 
                         * persistent store. 
                         */
                        delete(ACTIVITY_TABLE[stream]);
                        __set_store("at", ACTIVITY_TABLE);
                }
        }

        /********************************************************************** 
         * SAMPLING CONTROLLER 
         **********************************************************************/

        /**
         * in_sample 
	 * --------- 
         * Compute a boolean function on a random identifier.
         *
         * @token : <string> string of random hexadecimal digits
         * @logic : <Object> sampling logic from stream configuration
         * @return: <boolean> 
         */
        function in_sample(token, logic) 
        {
                if (!logic || !logic.one_in_every) {
                        return true; // True by default
                } 

                token = parseInt( token.slice( 0, 8 ), 16 );
                return (token % logic.one_in_every) === 0;
        }

        /********************************************************************** 
         * PUBLIC API 
         **********************************************************************/

        var CONFIG = {};
        var COPIED = {};

        /**
         * configure 
	 * --------- 
         * Merge configurations with the shared CONFIG object.
         *
         * @config: <Object> stream configuration to be merged.
         * @return: nothing
         */
        function configure(config) 
        {
                if (!config) {
                        return;
                }

                /* 
                 * Merge @config into the shared 
                 * CONFIG object. Values in CONFIG 
                 * will not be overwritten.
                 */
                for (var stream in config) {
                        if (!(stream in CONFIG)) {
                                CONFIG[stream] = config[stream];
                        }
                }

                /*
                 * We assume that the shared CONFIG 
                 * object was modified, perhaps with
                 * new streams. So we re-compute the 
                 * shared COPIED object that maps a 
                 * stream to those streams it should 
                 * copy events to.
                 */
                COPIED = {};

                for (var x in CONFIG) {
                        COPIED[x] = [];
                        for (var y in CONFIG) {
                                if (y.indexOf(x+".") === 0) {
                                        COPIED[x].push(y); 
                                }
                        }
                }
                /* 
                 * TODO: InputBuffer dequeue all goes here 
                 */
        }

        /**
         * log 
         * --- 
         * Log an event according to the given stream's configuration.
         *
         * @stream: <string> name of the stream to send @object to
         * @data  : <Object> data to send to @stream
         * @return: nothing
         */
        function log(stream, data) 
        {
                if (!data.meta) {
                        /* 
                         * [0.0] 
                         * The 'meta' field is reserved. 
                         * Altering its value will result 
                         * in undefined behavior.
                         *
                         * [0.1] 
                         * An event's timestamp shall be 
                         * recorded at the moment of its 
                         * first receipt.
                         *
                         * [0.2] 
                         * Subsequent invocations shall
                         * not alter the timestamp value. 
                         */
                        data.meta = { 
                                dt: __get_iso_8601_timestamp(),
                        };
                }

                if (!CONFIG[stream]) { 
                        /* 
                         * [1.0] 
                         * If the specified stream is not
                         * yet configured, the event is
                         * enqueued to the input buffer. 
                         */
                        __input_buffer_enqueue(stream, data);
                        return;
                }

                for (var i=0; i<COPIED[stream].length; i++) { 
                        /* 
                         * [2.0] 
                         * Invocation on a stream 'x'
                         * shall result in invocation
                         * on any configured stream 
                         * matching 'x.*', with a copy
                         * of the event.
                         *
                         * [2.1] 
                         * An event's copy shall have 
                         * timestamp equal to that of 
                         * the original, regardless of
                         * when the copy is created. 
                         *
                         * [2.2] 
                         * No information besides the 
                         * original event data and the 
                         * original timestamp shall pass
                         * between stream 'x' and 'x.*'. 
                         */
                        var copy = Object.assign({}, data);
                        log(COPIED[stream][i], copy);
                }

                if (CONFIG[stream].is_available === false) {
                        /* 
                         * [3.0] 
                         * If the specified stream is
                         * configured as unavailable,
                         * it shall receive no events. 
                         */
                        return;
                }

                if (__client_cannot_be_tracked()) {
                        /* 
                         * [3.1] 
                         * If the specified stream is 
                         * not configured as private,
                         * it shall receive no events
                         * when the client has signaled
                         * that they shall not be tracked. 
                         */
                        if (CONFIG[stream].is_private !== true) {
                                return;
                        }
                }

                if (!CONFIG[stream].scope) {
                        /* 
                         * [4.0] 
                         * If the specified stream is
                         * not configured with a 'scope' 
                         * attribute, it is assigned to
                         * the 'pageview' scope. 
                         */
                        CONFIG[stream].scope = "pageview";
                }

                /* 
                 * [4.1] 
                 * The source of randomness 
                 * for sampling shall be the
                 * identifier corresponding
                 * to the stream's configured
                 * scope. 
                 */
                var scope_id;
                if (CONFIG[stream].scope === "session") {
                        scope_id = session_id();
                } else {
                        scope_id = pageview_id();
                }

                if (in_sample(scope_id, CONFIG[stream].sample)) {
                        /*
                         * [5.0] 
                         * An event shall be processed 
                         * only if the sampling controller
                         * computes true on the identifier
                         * corresponding to the stream's
                         * configured scope. 
                         */

                        /* 
                         * [5.1] 
                         * Data classified privacy-preserving
                         * shall be added for all events and
                         * streams which are in-sample.
                         */
                        data.meta.stream = stream;
                        data.meta.id     = __generate_uuid_v4();
                        data.$schema     = CONFIG[stream].$schema;

                        /* 
                         * [5.2] 
                         * Data classified as non-private
                         * shall be added according to the 
                         * stream's privacy configuration. 
                         */
                        if (CONFIG[stream].is_private !== true) {
                                object.pageview_id = pageview_id();
                                object.session_id  = session_id();
                                /* 
                                 * [5.3] 
                                 * If a stream will use an activity 
                                 * ID, that activity shall be scoped 
                                 * according to the stream's 'scope' 
                                 * attribute. 
                                 */
                                data.activity_id = activity_id(stream, scope_id); 
                        }

                        /* object = InstrumentationModule.process(stream, object); */

                        /*
                         * [5.4] 
                         * Once processing is complete, the
                         * event is serialized to the output 
                         * buffer and never altered again.
                         */
                        schedule(CONFIG[stream].url, JSON.stringify(data));
                }
        }

        return {
                "configure":configure,
                "log":log,
        };
})(
        Integration.http_post,
        Integration.set_store,
        Integration.get_store,
        Integration.del_store,
        Integration.new_id,
        Integration.generate_uuid_v4,
        Integration.get_iso_8601_timestamp,
        Integration.client_cannot_be_tracked,
        Integration.input_buffer_enqueue,
        Integration.input_buffer_dequeue
);

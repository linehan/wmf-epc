/*
 * Event Platform Client (EPC) 
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

        /* 
         * When FALSE, QUEUE can't be emptied 
         */
        var ENABLED = true;

        /* 
         * Queue items are [url, body] pairs 
         */
        var QUEUE = []; 

        /* 
         * Timeout controlling the HTTP request 
         * bursting 
         */
        var TIMER = null;

        function send_all_scheduled() 
        {
                clearTimeout(TIMER);

                if (ENABLED) {
                        /* 
                         * All items currently scheduled on QUEUE 
                         * are permanently removed from QUEUE. 
                         */
                        var arr = QUEUE.splice(0, QUEUE.length);
                        for (var i=0; i<arr.length; i++) {
                                /*
                                 * If send() fails, the data is lost.
                                 */
                                send(arr[i][0], arr[i][1]);
                        }
                } else {
                        /* 
                         * All items currently scheduled on QUEUE
                         * remain queued, and could be sent later. 
                         */
                }
        }

        function schedule(url, str) 
        {
                QUEUE.push([url, str]);

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
                                 * The new item's arrival interrupts
                                 * the timer and resets the countdown.
                                 */
                                clearTimeout(TIMER);
                                TIMER = setTimeout(send_all_scheduled, WAIT_MS);
                        }
                }
        }

        function send(url, str) 
        {
                if (ENABLED) {
                        __http_post(url, str); 
                        /* 
                         * Since we just woke the device's
                         * radio by calling http_post(), we
                         * might as well flush the buffer.
                         */
                        send_all_scheduled();
                } else {
                        /*
                         * TODO: Choose behavior:
                         * 1. If disabled, send() becomes schedule()
                         * 2. If disabled, send() becomes a no-op
                         */
                        schedule(url, str);
                }
        }

        function enable_sending() 
        {
                ENABLED = true;
                /*
                 * We try right away to send any messages
                 * in the queue. This behavior is handy.
                 */
                send_all_scheduled();
        }

        function disable_sending() 
        {
                ENABLED = false;
        }

        /**********************************************************************
         * ASSOCIATION CONTROLLER 
         *
         * Pageview and Session IDs:
         * -------------------------
         * Uniformly-random 80-bit integer, represented as 
         * a 0-padded 20-character string of hexadecimal digits, 
         * e.g.:
         * 
         *      "ffffffffffffffffffff",
         *
         * and generated once per pageview or session, respectively.
         *
         * Activity ID:
         * ------------
         * Concatenation of either a pageview or session ID,
         * and a 16-bit integer (the activity sequence number)
         * represented as a 0-padded 4-character string of 
         * hexadecimal digits, e.g.:
         *
         *      "ffffffffffffffffffff0123",
         *
         **********************************************************************/
        var PAGEVIEW_ID = null;
        var SESSION_ID = null;
        
        var ACTIVITY_TABLE = null; /* Maps stream_name => activity # */
        var ACTIVITY_COUNT = null; /* Monotonically incr. activity counter */

        function pageview_id() 
        {
                if (PAGEVIEW_ID === null) {
                        PAGEVIEW_ID = __new_id(); 
                }
                return PAGEVIEW_ID; 
        }

        function session_id() 
        {
                if (!SESSION_ID) {
                        /* 
                         * If there is no runtime value for
                         * SESSION_ID, try to load a value
                         * from the persistence layer. 
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

        function activity_id(stream_name, base_id) 
        {
                if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                        /*
                         * If there is no runtime value for
                         * ACTIVITY_COUNT or ACTIVITY_TABLE,
                         * try to load their values from the
                         * persistence layer.
                         */
                        ACTIVITY_COUNT = __get_store("ac");
                        ACTIVITY_TABLE = __get_store("at");

                        if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                                /* 
                                 * If values are missing from 
                                 * the persistence layer,
                                 * reset ACTIVITY_TABLE and
                                 * ACTIVITY_COUNT, and write 
                                 * the update to the 
                                 * persistence layer.
                                 */
                                ACTIVITY_TABLE = {};
                                ACTIVITY_COUNT = 1;
                                __set_store("at", ACTIVITY_TABLE);
                                __set_store("ac", ACTIVITY_COUNT);
                        }
                }

                if (stream_name) {
                        if (!(stream_name in ACTIVITY_TABLE)) {
                                /*
                                 * If ACTIVITY_TABLE has not
                                 * recorded an activity number 
                                 * for stream_name, assign one
                                 * using ACTIVITY_COUNT, then
                                 * increment ACTIVITY_COUNT,
                                 * and write these updates
                                 * to the persistence layer.
                                 */
                                ACTIVITY_TABLE[stream_name] = ACTIVITY_COUNT++;
                                __set_store("at", ACTIVITY_TABLE);
                                __set_store("ac", ACTIVITY_COUNT);
                        }

                        /*
                         * Format the activity ID value by
                         * combining the ID corresponding
                         * to the given scope, and the
                         * number stored in ACTIVITY_TABLE.
                         */
                        var count = ACTIVITY_TABLE[stream_name];

                        /* like printf("%s%04x", id, count) */
                        return base_id+(count+0x10000).toString(16).slice(1);
                }
        }

        function begin_new_session() 
        {
                /*
                 * Clear the runtime and persistence values 
                 * for SESSION_ID.
                 */
                SESSION_ID = null;
                __del_store("sid"); 

                /* 
                 * A new session implies a new pageview;
                 * clear the runtime value for PAGEVIEW_ID.
                 * (PAGEVIEW_ID is not persisted).
                 */ 
                PAGEVIEW_ID = null;

                /* 
                 * A new session implies the activity counter
                 * is also reset; clear the runtime and 
                 * persisted values for ACTIVITY_TABLE and
                 * ACTIVITY_COUNT. 
                 */
                ACTIVITY_TABLE = null;
                ACTIVITY_COUNT = null;
                __del_store("at");
                __del_store("ac");
        }

        function begin_new_activity(stream_name) 
        {
                /*
                 * Ensure ACTIVITY_TABLE and ACTIVITY_COUNT
                 * have been loaded from persistence, or
                 * generated.
                 */
                activityID(); 

                if (stream_name in ACTIVITY_TABLE) {
                        /*
                         * Delete the entry corresponding to 
                         * stream_name, and write the update 
                         * to the persistence layer. 
                         */
                        delete(ACTIVITY_TABLE[stream_name]);
                        __set_store("at", ACTIVITY_TABLE);
                }
        }

        /**********************************************************************
         * SAMPLING CONTROLLER 
         **********************************************************************/

        function in_sample(random_token, sample_config) 
        {
                var rand = parseInt( random_token.slice( 0, 8 ), 16 );

                if (!sample_config || !sample_config.one_in_every) {
                        /* True by default */
                        return true;
                } 
                
                return rand % sample_config.one_in_every === 0;
        }

        /**********************************************************************
         * PUBLIC API
         **********************************************************************/

        var CONFIG = {};
        var COPIED = {};

        function configure(config) 
        {
                if (!config) {
                        return;
                }

                /* 
                 * Merge @config into the shared CONFIG object. 
                 * Values in CONFIG will not be overwritten.
                 */
                for (var stream_name in config) {
                        if (!(stream_name in CONFIG)) {
                                CONFIG[stream_name] = config[stream_name];
                        }
                }

                /*
                 * We assume the shared CONFIG object was modified,
                 * perhaps adding new streams. So we re-compute the 
                 * shared COPIED object that maps a stream to those
                 * streams it should copy events to.
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

        function log(stream_name, data) 
        {
                if (!data.meta) {
                        /* 
                         * [0a] The 'meta' field is reserved. 
                         * Altering this field will result in 
                         * undefined behavior.
                         *
                         * [0b] An event's timestamp shall be 
                         * recorded at the moment of its first 
                         * receipt by the .log() method.
                         *
                         * [0c] Subsequent invocations of .log()
                         * shall not alter the timestamp value.
                         */
                        data.meta = { 
                                dt: __get_iso_8601_timestamp(),
                        };
                }

                if (!CONFIG[stream_name]) { 
                        /* 
                         * [1a] If the stream configuration is not
                         * loaded at the time the event is received,
                         * the event is placed on the InputBuffer. 
                         */
                        __input_buffer_enqueue(stream_name, data);
                        return;
                }

                for (var i=0; i<COPIED[stream_name].length; i++) { 
                        /* 
                         * [2a] A copy of an event for stream 'x' 
                         * shall be logged to streams matching 'x.*'.
                         *
                         * [2b] A copy of an event has timestamp 
                         * equal to that of the original event, 
                         * regardless of the actual time the copy
                         * was created.
                         *
                         * [2c] No information other than the original 
                         * event data and the original timestamp shall
                         * be passed between stream 'x' and 'x.*'. 
                         *
                         * NOTE
                         * In other words, each copied stream acts 
                         * independently on the event data. There is
                         * no cascading behavior. 
                         *
                         * This is a deliberate choice to prevent 
                         * dependencies between stream configurations. 
                         */
                        var copy = Object.assign({}, data);
                        log(COPIED[stream_name][i], copy);
                }

                if (CONFIG[stream_name].is_available === false) {
                        /* 
                         * [3a] Streams configured as unavailable
                         * shall receive no events. 
                         *
                         * NOTE
                         * Because CONFIG is immutable for the duration
                         * of an execution, the events are lost forever.
                         */
                        return;
                }

                if (__client_cannot_be_tracked()) {
                        /* 
                         * [3b] Streams not configured as private*
                         * shall receive no events when the client
                         * has signaled that they shall not be tracked.
                         *
                         * NOTE
                         * Because CONFIG is immutable for the duration
                         * of an execution, the events are lost forever.
                         */
                        if (CONFIG[stream_name].is_private !== true) {
                                return;
                        }
                }

                if (!CONFIG[stream_name].scope) {
                        /* 
                         * [4a] Streams not configured with a 'scope' 
                         * attribute are assigned the 'pageview' scope. 
                         */
                        CONFIG[stream_name].scope = "pageview";
                }

                /* 
                 * [4d] The identifier used for sampling shall be the
                 * identifier assigned to the stream's scope. 
                 *
                 * This ensures that a stream remains in- or out-sample 
                 * for the duration of its scope. 
                 */
                var scope_id;
                if (CONFIG[stream_name].scope === "session") {
                        scope_id = session_id();
                } else {
                        scope_id = pageview_id();
                }

                if (in_sample(scope_id, CONFIG[stream_name].sampling)) {
                        /*
                         * [5a] An event shall be processed only if its 
                         * stream is in-sample for this particular 
                         * scope. 
                         */
                        data.meta.stream = stream_name;
                        data.meta.id = __generate_uuid_v4();
                        data.$schema = CONFIG[stream_name].$schema;

                        if (CONFIG[stream_name].is_private !== true) {
                                /* 
                                 * [5b] Data that is designated as
                                 * non-private shall be added according 
                                 * to the privacy configuration of the
                                 * stream. 
                                 */

                                /* 
                                 * [5c] All events bound for non-private
                                 * streams will receive a pageview ID
                                 * and session ID.
                                 */
                                data.pageview_id = pageview_id();
                                data.session_id = session_id();

                                /* 
                                 * [5d] If a stream will use an activity 
                                 * ID, that activity shall be scoped 
                                 * according to the stream's 'scope' 
                                 * attribute. 
                                 */
                                data.activity_id = activity_id(stream_name, scope_id); 
                        }

                        /* data = InstrumentationModule.process(stream_name, data); */

                        /*
                         * [5c] When an event has completed processing,
                         * it is placed on the output buffer to await
                         * transmission.
                         */
                        schedule(CONFIG[stream_name].url, JSON.stringify(data));
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

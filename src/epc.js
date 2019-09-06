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

/******************************************************************************
 * MOCKS 
 ******************************************************************************/
function MOCK_STREAM_CONFIG()
{
        return {
                "edit": {
                        "stream": "edit",
                        "scope": "session",
                        "sample": 0.06,
                        "start_states": ["editAttemptStart"],
                        "final_states": ["editAttemptSuccess", "editAttemptFailure"],
                        "url": "/log",
                },
                "edit.firstday": {
                        /* 
                         * TODO: 
                         * Should the sub-stream have its own activity ID?
                         * Or not? 
                         *
                         * Probably not.
                         *
                         * If it does not, then we should really do cascading
                         * the way MP mentioned. That way the scope and stream
                         * name are the same as with 'edit'. 
                         *
                         * But 'stream' is used for table routing. Then we will
                         * need some other way to point. Okay.
                         */
                        "stream": "edit.firstday",
                        "scope": "session",
                        "sample": 1.0,
                        "filter": {
                                "conf_value": ["wiki_first_day"],
                        },
                        "url": "/log",
                "click": {
                        "stream": "click",
                        "sample": 0.01,
                        /* 
                         * An example of a predicate filter with fields
                         * we could support.
                         */
                        "filter": {
                                "user_status": ["login", "anon"]
                                "user_agent": ["firefox", "chrome", "safari"],
                                "wiki_lang": ["en", "cz", "jp"],
                                "localtime":["start_time", "end_time"],
                                /* 
                                 * A boolean value we can set in their user
                                 * settings and test for; to allow tagging of
                                 * cohorts and a kind of 'catch all' route for 
                                 * predicates we don't yet, or can never, 
                                 * support in the client. 
                                 */
                                "conf_value": ["wiki_first_day"],
                        },
                        "url": "/log",
                }
        };
}

function MOCK_ISO_8601_TIMESTAMP()
{
        return "1997";
}

function MOCK_WIKI_DOMAIN()
{
        return "en";
}

function MOCK_WIKI_URI()
{
        return "enwiki.myrandomthing.org";
}

function MOCK_GLOBAL_IS_COLLECTION_ENABLED();
{
        return true;
}

function MOCK_GEN_UUID_V4()
{
        return "ffffffff-ffff-ffff-ffff-ffffffffffff";
}

function MAKE_STREAM_CASCADE(streams)
{
        /* 
         * NOTE that in production code of mw.track, they are
         * not being so semantic about the '.', they are simply
         * checking for whether it is a prefix of anything else
         * at all:
         * 
         * for (var x in streams) {
         *      for (var y in streams) {
         *              if (y.indexOf(x) === 0) {
         *                      if (!(x in cascade)) { 
         *                              cascade[x] = [];
         *                      }
         *                      cascade[x].append(y);
         *              }
         *      }
         * }
         *
         * We may consider wanting to do this since it is easier.
         */
        var cascade = {};

        for (var x in streams) {
                var s = x+'.';
                var m = '.'+x+'.';
                for (var y in streams) {
                        if (y.indexOf(s) === 0 || y.indexOf(m) !== -1) {
                                if (!(x in cascade)) { 
                                        cascade[x] = [];
                                }
                                cascade[x].append(y);
                        }
                }
        }
        return cascade;
}

function generate_80_random_bits_as_hex_string()
{
        /* Support: IE 11 */
        var crypto = window.crypto || window.msCrypto;

        if ( crypto && crypto.getRandomValues && typeof Uint16Array === 'function' ) {
                /* 
                 * Fill an array with 5 random values, 
                 * each of which is 16 bits.
                 * 
                 * Note that Uint16Array is array-like, 
                 * but does not implement Array.
                 */
                var rnds = new Uint16Array( 5 );
                crypto.getRandomValues( rnds );
        } else {
                var rnds = new Array( 5 );
                /* 
                 * 0x10000 is 2^16 so the operation below will return 
                 * a number between 2^16 and zero
                 */
                for ( var i = 0; i < 5; i++ ) {
                        rnds[ i ] = Math.floor( Math.random() * 0x10000 );
                }
        }

        return  ( rnds[ 0 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                ( rnds[ 1 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                ( rnds[ 2 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                ( rnds[ 3 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                ( rnds[ 4 ] + 0x10000 ).toString( 16 ).slice( 1 );
}

/******************************************************************************
 * Output 
 *
 * The output module buffers events being transmitted to the remote intake 
 * server. It is especially helpful on mobile clients where it mitigates: 
 *
 * - Loss of connection
 *      Events generated during connection loss still persist in
 *      the buffer. If the connection is restored, they can still
 *      be transmitted. 
 *
 * - Poor battery life 
 *      The network request profile is shaped so that requests are
 *      sent in "bursts", separated by downtime, during which the
 *      request data dwells in the buffer. 
 *
 *      This has been shown to improve battery life by allowing 
 *      the radio to enter its RRC idle state and other low-power 
 *      states during the time between bursts. 
 ******************************************************************************/
var Output = (function() 
{
        var WAIT_ITEMS = 1;
        var WAIT_MS = 2000;

        var QUEUE   = [];
        var TIMEOUT = null;
        var ENABLED = true;

        function enable_sending()
        {
                ENABLED = true;
                send_all_scheduled();
        }

        function disable_sending()
        {
                ENABLED = false;
        }

        function unschedule()
        {
                clearTimeout(TIMEOUT);
        }

        /**
         * Schedule an item for sending. 
         *
         * @url   : The target of the HTTP request 
         * @str   : The data to send as the POST body
         * @return: nothing
         *
         * NOTE
         * If sending is not enabled, the scheduler will simply add the
         * item to the queue and return.
         *
         * If sending is enabled, The scheduler will check the queue length. 
         *      If there are enough items in the queue, it will trigger a burst.
         *      Otherwise, it will reset the timeout which triggers a burst.
         */
        function schedule(url, str) 
        {
                QUEUE.append([url, str]);

                if (ENABLED === true) {
                        /* 
                         * >= because we might have been disabled and 
                         * accumulated who knows how many without sending.
                         */
                        if (QUEUE.length >= WAIT_ITEMS) {
                                send_all_scheduled();
                        } else {
                                unschedule();
                                TIMER = setTimeout(send_all_scheduled, WAIT_MS);
                        }
                }
        }

        /**
         * NOTE
         * There are five ways to reach this function.
         *
         *      1. From schedule():
         *              An item made QUEUE.length >= BURST_SIZE 
         *      2. From send():
         *              We burst early because the radio is now awake
         *      3. From enable_sending():
         *              In case timer has expired while disabled, we send here 
         *      4. From the burst timeout firing:
         *              Now that events have died down, we start the burst
         *      5. From another event (e.g. 'unload') firing:
         *              The handler may call this method to flush the buffer.
         *
         * In case 1, 2, and 5, we are bursting "early", so there may be a 
         * burst timeout counting down, and we need to unschedule() it. 
         *
         * In case 3, we may be bursting "early," or we may be bursting "late",
         * but either way we need to unschedule() the timer. 
         *
         * I don't like unschedule() being a side effect of this function, 
         * but we only have control over cases 1-4. In case 5, the caller
         * would have to know to call unschedule() and that's just silly. 
         *
         * NOTE
         * Any data in QUEUE will be lost after this function returns. 
         * There is no possibility to recover from a failed HTTP request.
         *
         *      - If connection is lost during a burst, the entire burst 
         *        will be lost. The event will not fire until after this
         *        function returns (due to JS). This should be the spec.
         *
         *      - If the output is disabled during a burst, the entire
         *        burst will still be sent. The disablement will not be
         *        handled until after this function returns (due to JS).
         */
        function send_all_scheduled()
        {
                unschedule();

                if (ENABLED === true) {
                        var items = QUEUE.splice(0, QUEUE.length);
                        for (var i=0; i<items.length; i++) {
                                send(item[i][0], item[i][1]);
                        }
                } else {
                        /* 
                         * Do nothing; the data is still in the buffer
                         * and will be sent after we are enabled again.
                         */
                }
        }

        /**
         * Initiate an asynchronous HTTP POST request.
         *
         * @url   : The target of the HTTP request 
         * @str   : The data to send as the POST body
         * @return: nothing
         *
         * NOTE 
         * If output is disabled (no HTTP requests are possible), 
         * the data will be scheduled on to the buffer and will be 
         * sent when/if output is enabled again. 
         *
         * Otherwise the request will be initiated right away, and
         * the data will never hit the buffer.
         *
         * NOTE
         * Since this request will be waking up the radio, it will
         * make sense for it to trigger an "unschedule and flush"
         * operation to take advantage of the fact that we know the
         * radio is now awake.
         */
        function send(url, str)
        {
                if (ENABLED === true) {
                        navigator.sendBeacon(url, str);
                        send_all_scheduled();
                } else {
                        schedule(url, str);
                        /* 
                         * Option 1: schedule(url, str);
                         * Option 2: return; the data is silently lost 
                         */
                }
        }

        window.addEventListener('pagehide', function() {
                send_all_scheduled();
        });

        document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                        send_all_scheduled();
                }
        });

        window.addEventListener('offline', function() { 
                disable_sending();
        });
        
        window.addEventListener('online', function() { 
                enable_sending();
        });

        /* TODO: unload */

        return {
                "schedule": schedule,
                "send": send 
        };
})();


/******************************************************************************
 * Input 
 * 
 * This is kept as a small, separate module that can be loaded first, in
 * order to have the ability to store events from before the library has
 * been loaded in.
 *
 * For the web this functionality is handled by mw.track, so we do not
 * need this feature.
 *
 * On the apps, we will not be loading modules in a segmented way, so the
 * purpose of this feature is to ensure that events can be added prior to
 * the resolution of the stream configuration request and init process.
 *
 * So really, in the only cases where this feature needs to be implemented,
 * it is okay to have it be part of the library.
 *
 * That's good because also on the apps, certain information like the wiki
 * and stuff that is coupled would need to exist in this module too.
 ******************************************************************************/
var Input = (function()
{
        var QUEUE = [];
        var CALLBACK = null; 

        function set_processor(fn)
        {
                CALLBACK = fn;
        }

        function call_processor()
        {
                if (CALLBACK === null) {
                        return; 
                } else {
                        while (QUEUE.length > 0) {
                                CALLBACK.call(null, QUEUE.pop());
                        }
                }
        }

        function event(stream_name, data) 
        {
                /* 
                 * TODO: Document that timestamp needs to be added at
                 * this stage, but nothing else.
                 */
                QUEUE.push([stream_name, data, MOCK_GET_ISO_8601_TIMSTAMP()]);
                call_processor();
        }

        return {
                "set_processor": set_processor,
                "call_processor": call_processor,
                "event": event,
        }
})();




/******************************************************************************
 * Sampler 
 ******************************************************************************/
var Sampler = (function()
{
        function make_thresholds(weights, max_val)
        {
                if (typeof max_val === "undefined") {
                        max_val = 65535;
                }

                let segments = weights.map( function( weight ) {
                        return weight * max_val;
                } );
    
                for (var s = 1; s < segments.length; s++) {
                        segments[s] += segments[s - 1];
                }
    
                return segments;
        }

        function in_bucket(rand, weights, max_val)
        {
                if (typeof max_val === "undefined") {
                        max_val = 65535;
                }

                let buckets = weights.length;

                if (buckets > 1) {
                        let segments = Sampling.makeThresholds(weights, max_val);
                        for (var i = 0; i < buckets; i++) {
                                if (rand < segments[i]) {
                                        return i + 1; // number of segment aka bucket
                                }
                        }
                        return -1;
                } else {
                        return buckets;
                }
        }

        function in_sample(rand, prob, max_val)
        {
                if (typeof max_val === "undefined") {
                        max_val = 65535;
                }

                return in_bucket(rand, [prob, 1-prob], max_val) === 1;
        }

        return {
                "in_sample":in_sample
        }
})();


/******************************************************************************
 * Storage 
 ******************************************************************************/
var Storage = (function()
{
        function get_persist()
        {
                var data = window.localStorage.getItem('epc');
                return (data) ? JSON.parse(data) : {}; 
        }
        function key_persist(key)
        {
                var data = get_persist();
                return (data && (key in data)) ? data[key] : null;
        }
        function set_persist(data)
        {
                window.localStorage.setItem('epc', JSON.stringify(data));
        }
        function inc_persist(name)
        {
                var data = get_persist();

                if (name in data) {
                        data[name] += 1;
                } else {
                        data[name] = 1 + (Object.keys(data).length * 256);
                }
                set_persist(data);
        }
        function clear_persist()
        {
                window.localStorage.removeItem('epc');
        }

        return {
                "get": get_persist,
                "set": set_persist,
                "inc": inc_persist,
                "key": key_persist,
                "clear": clear_persist,
        };
})();

/******************************************************************************
 * TOKEN MANAGER
 ******************************************************************************/
var Token = (function()
{
        var SESSION_ID  = null;
        var PAGEVIEW_ID = null;
        var STREAM_SEQ = {};

        function new_id()
        {
                return generate_80_random_bits_as_hex_string() + "0000";
        }

        function session_timeout_condition()
        {
                return false;
        }

        /**
         * The session ID is always stored in persistent storage.
         * However a copy is cached in memory for faster retreival.
         */ 
        function get_session_id()
        {
                /* Pull from cache on reload, or reset if first time */
                if (SESSION_ID === null) {
                        var data = Storage.get();
                        if (!data || !("session_id" in data)) {
                                SESSION_ID = new_id();
                                Storage.set({
                                        "session_id": SESSION_ID,
                                });
                        } else {
                                SESSION_ID = data.session_id;
                        }
                }

                /* Reset on timeout */
                if (session_timeout_condition()) {
                        SESSION_ID = new_id();
                        Storage.set({
                                "session_id": SESSION_ID,
                        });
                }

                return SESSION_ID;
        }

        function get_pageview_id()
        {
                return PAGEVIEW_ID;
        }

        function inc_activity_id(name)
        {
                var scope = Stream.scope(name);

                if (scope === "session") {
                        Storage.inc_persist(name);
                } 
                if (scope === "pageview") {
                        if (name in SEQUENCE) {
                                STREAM_SEQ[name] += 1;
                        } else {
                                STREAM_SEQ[name] = 1 + (Object.keys(STREAM_SEQ).length * 256);
                        }
                }
        }

        function get_activity_id(name)
        {
                var scope = Stream.scope(name);
                var id = null;
                var seq = null;

                if (scope === "session") {
                        id = get_session_id();
                        seq = Storage.key(name);
                }
                if (scope === "pageview") {
                        id = get_pageview_id();
                        seq = STREAM_SEQ[name];
                }

                if (id && seq) {
                        return id + (seq + 0x10000).toString( 16 ).slice( 1 );
                } else {
                        /* 
                         * Without a scope or a start state passed, there
                         * will not be an activity ID.
                         */ 
                        return null;
                }
        }

        window.addEventListener('load', function() {
                PAGEVIEW_ID = new_id(); 
        });

        return {
                "get_session_id": get_session_id,
                "get_pageview_id": get_pageview_id,
                "get_activity_id":get_sequence_id 
                "inc_activity_id":inc_sequence_id 
        };
})();

/******************************************************************************
 * STREAM MANAGER 
 ******************************************************************************/
var Stream = (function()
{
        var STREAM = {};
        var CASCADE = {};

        function init()
        {
                STREAM  = MOCK_STREAM_CONFIG();
                CASCADE = MAKE_STREAM_CASCADE(STREAM);

                Input.set_processor(event);

                /* Process any events that have accumulated prior to init() */
                Input.call_processor(); 
        }

        function is_stream_enabled(name)
        {
                /* TODO: Are we disabling collection globally? */
                if (!MOCK_GLOBAL_IS_COLLECTION_ENABLED()) {
                        return false;
                }

                /* Does stream exist? */
                if (!(name in STREAM)) {
                        return false;
                }

                /* Is stream disabled in stream config? */ 
                if ("active" in STREAM[name] && STREAM[name].active === false) {
                        return false;
                }

                return true;
        }

        function is_stream_sampled(name)
        {
                /* 
                 * Here we use the various tokens, combined with the
                 * stream's sampling logic, to compute a predicate.
                 */
                return true; 
        }

        /* 
         * These are properties that can be set in the stream config that
         * will determine the client behavior.
         */
        function stream_scope(name)
        {
                return ("scope" in STREAM[name]) ? STREAM[name].scope : "none";
        }

        function stream_start(name)
        {
                return ("start" in STREAM[name]) ? STREAM[name].start : null;
        }

        function is_event_orphaned(name, data)
        {
                var start = stream_start();

                /* If there isn't a start state, we can't be orphaned. */
                if (!start) {
                        return false;
                }

                if ("action" in data) {
                        if (data.action === start) {
                                /* 
                                 * THIS IS THE ONLY WAY THAT THINGS
                                 * ARE INCREMENTED. THE USE OF THESE
                                 * 'START' STATES IN THE STREAM CONFIG
                                 */
                                Token.inc_activity_id(name);
                        } else {
                                /* 
                                 * Yes, the sequence data has been cleared due to
                                 * a session reset or a stream config reset or a
                                 * user localStorage reset, and now this funnel is
                                 * dangling and shouldn't be recorded probably? If
                                 * we are to enforce the session convention.
                                 */ 
                                if (null === Token.get_activity_id(name)) {
                                        return true;
                                }
                        }
                } else {
                        /* 
                         * TODO: there is a 'start' state but no 'action'. 
                         * This is bad and we ought to design it out.
                         */
                        return false;
                }
        }

        function event(name, data, timestamp) 
        { 
                if (!is_stream_enabled(name)) {
                        return false;
                }
                if (is_event_orphaned(name, data)) {
                        return false;
                }
                if (!is_stream_sampled(name)) {
                        return false;
                }

                var e = data;

                e.meta = {
                        "id"    : MOCK_GEN_UUID_V4(),
                        "dt"    : timestamp,
                        "domain": MOCK_WIKI_DOMAIN(),
                        "uri"   : MOCK_WIKI_URI(),
                        "stream": STREAM[name].stream_name,
                };

                e.$schema = STREAM[name].schema_url;

                e.session_id  = Token.get_session_id();
                e.pageview_id = Token.get_pageview_id(); 
                e.activity_id = Token.get_activity_id(name);

                Output.schedule(STREAM[name].url, JSON.stringify(e));

                /* Cascade the event to child events */ 
                if (name in CASCADE) { 
                        for (var i=0; i<CASCADE[name].length; i++) { 
                                /* 
                                 * TODO: We can't have this calling 
                                 * is_event_orphaned more than once! 
                                 *
                                 * If it's not orphaned but needs to get
                                 * incremented, that will happen there.
                                 */
                                event(CASCADE[name][i], data);
                        }
                }
        }

        return {
                "init": init,
                "increment": increment
                "scope": stream_scope,
        };
})();

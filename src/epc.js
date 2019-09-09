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
        var WAIT_ITEMS = 2;
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
                QUEUE.push([url, str]);

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
                        var item = QUEUE.splice(0, QUEUE.length);
                        for (var i=0; i<item.length; i++) {
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
                        navigator.sendBeacon(url, str); // TODO: CONFIGURABLE 
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
 * TOKENS 
 ******************************************************************************/
/* TODO: THis is so much code; I don't like it at all */
var Storage = (function()
{
        var EPC_STORAGE_KEY = 'epc';
        var EPC_ALLOC = 256;
        var EPC_PERSIST_ALLOWED = true;

        var CACHE = {};

        function persist_get()
        {
                return INTEGRATION_persistent_store_get(EPC_STORAGE_KEY);
        }

        function persist_set(v)
        {
                INTEGRATION_persistent_store_set(EPC_STORAGE_KEY, v);
        }

        function get(k)
        {
                /* Try the cache first */
                if (k in CACHE) {
                        return CACHE[k];
                }

                if (EPC_PERSIST_ALLOWED) {
                        var data = persist_get();
                        if (k in data) {
                                return data[k];
                        }
                }

                return null;
        }

        function set(k, v, persist)
        {
                CACHE[k] = v;

                if (EPC_PERSIST_ALLOWED && persist === true) {
                        var data = persist_get();
                        data[k] = v;
                        persist_set(data);
                }
        }

        function clr()
        {
                if (EPC_PERSIST_ALLOWED) {
                        persist_set({});
                }
        }

        function inc(k, persist)
        {
                var v = get(k);

                if (v === null) {
                        if (EPC_PERSIST_ALLOWED && persist === true) {
                                var offset = Object.keys(persist_get()).length;
                        } else {
                                var offset = Object.keys(CACHE).length;
                        }
                        v = 1 + (EPC_ALLOC * offset);
                } else {
                        v = v + 1;
                }

                set(k, v);
        }

        return {
                "get": get,
                "set": set,
                "inc": inc,
                "clr": clr
        };
})();

/*************************************************
 * RANDOMNESS INTEGRATION BRIDGE 
 *************************************************/
var Token = (function()
{
        function session()
        {
                if (!Storage.get("session") || session_timeout_condition()) {
                        Storage.clr();
                        Storage.set("session", NEW_ID(), true);
                }
                return Storage.get("session");
        }

        function pageview()
        {
                if (!Storage.get("pageview")) {
                        Storage.set("pageview", NEW_ID());
                }
                return Storage.get("pageview");
        }

        function activity(name)
        {
                var sn = Storage.get(name);
                switch (Stream.scope(name)) {
                case "session":
                        var id = get_session_id();
                        break;
                case "pageview":
                        var id = get_pageview_id();
                        break;
                }

                if (id && sn) {
                        return id + (sn + 0x10000).toString( 16 ).slice( 1 );
                } 

                return null;
        }

        function increment(name)
        {
                switch (Stream.scope(name)) {
                case "session":
                        Storage.inc(name, true);
                        break;
                case "pageview":
                        Storage.inc(name);
                        break;
                } 
        }

        return {
                "session" : session,
                "pageview": pageview,
                "activity":activity,
                "increment":increment,
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
                CASCADE = {};

                for (var x in STREAM) {
                        for (var y in STREAM) {
                                if (y.indexOf(x+'.') === 0) {
                                        if (!(x in CASCADE)) { 
                                                CASCADE[x] = [y];
                                        } else {
                                                CASCADE[x].push(y);
                                        }
                                }
                        }
                }

                Input.set_processor(event);

                /* Process any events that have accumulated prior to init() */
                Input.call_processor(); 
        }

        function is_stream_enabled(name)
        {
                if (EPC_ENABLED() && stream_exists(name) && stream_active(name)) {
                        return true;
                }
                return false;
        }

        function is_stream_sampled(name)
        {
                /* 
                 * Here we use the various tokens, combined with the
                 * stream's sampling logic, to compute a predicate.
                 */
                return true; 
        }

        function stream_exists(name)
        {
                return (name in STREAM);
        }

        function get_stream_property(name, property, if_dne)
        {
                if ((name in STREAM) && (property in STREAM[name])) {
                        return STREAM[name][property];
                }
                return if_dne;
        }

        function stream_active(name)
        {
                return get_stream_property(name, "active", true); 
        }

        function stream_scope(name)
        {
                return get_stream_property(name, "scope", "none");
        }

        function stream_start(name)
        {
                return get_stream_property(name, "start", null);
        }

        /* 
         * TODO: Do we even want to bother with this?
         */
        function is_event_orphaned(name, data)
        {
                var start = stream_start(name);

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
                                Token.increment(name);
                        } else {
                                /* 
                                 * Yes, the sequence data has been cleared due to
                                 * a session reset or a stream config reset or a
                                 * user localStorage reset, and now this funnel is
                                 * dangling and shouldn't be recorded probably? If
                                 * we are to enforce the session convention.
                                 */ 
                                if (null === Token.activity(name)) {
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
                        console.log('not enabled');
                        return false;
                }
                if (is_event_orphaned(name, data)) {
                        console.log('orphaned');
                        return false;
                }
                if (!is_stream_sampled(name)) {
                        console.log('not sampled');
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

                e.session  = Token.session();
                e.pageview = Token.pageview(); 
                e.activity = Token.activity(name);

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
                "scope": stream_scope,
        };
})();




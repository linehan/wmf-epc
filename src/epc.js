/******************************************************************************
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
 *
 ******************************************************************************/

/******************************************************************************
 * MOCKS 
 ******************************************************************************/
/**
 * Mock the stream configuration delivery mechanism. 
 *
 * In production, stream configuration JSON will be delivered 
 * either by a separate HTTP request or a ResourceLoader module. 
 */
function MOCK_STREAM_CONFIG()
{
        return {
                "foo": {
                        "stream_name": "foo",
                        "sample_rate": 0.5,
                        "url": "/log",
                },
                "bar": {
                        "stream_name": "bar",
                        "sample_rate": 0.01,
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

/**
 * Will be replaced with conditions such as "is DNT enabled" and
 * other user-defined criteria that will prevent analytics.
 */
function MOCK_GLOBAL_IS_COLLECTION_ENABLED();
{
        return true;
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

        /**
         * NOTE
         * When the service is re-enabled, there may be items on the
         * queue, that do not have any timer waiting to send them.
         * 
         * Should it be the caller's responsibility to decide whether 
         * to call send_all_scheduled() or not, after sending has been 
         * re-enabled?
         *
         * We have already decided to expose send_all_scheduled() for
         * the cases where an application event might require it, e.g.
         * 'unload'. Should we then delegate the choice to them? It still
         * exposes details of the timing mechanism. 
         *
         * Perhaps we should have it automatically try on enable. It's
         * just that it's not clear from saying 'enable_sending()' that
         * sends will actually be happening.
         *
         * No, I think it should be done. We shouldn't expose scheduling
         * details to the caller, and also, send_all_scheduled() implies
         * that "being in the buffer" is equivalent to "being scheduled";
         * therefore it should be understood that enabling sending will
         * also enable th scheduler to begin running once again. 
         */
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
        var PROCESSOR = null; 

        function set_processor(fn)
        {
                PROCESSOR = fn;
        }

        function call_processor()
        {
                if (PROCESSOR === null) {
                        return; 
                } else {
                        while (QUEUE.length > 0) {
                                PROCESSOR.call(null, QUEUE.pop());
                        }
                }
        }

        function event(stream_name, data) 
        {
                var e = data;

                /* 
                 * These values must be pre-computed at the time of
                 * receipt, and cannot be deferred until processing.
                 */
                e.meta = {
                        "id"    : "ffffffff-ffff-ffff-ffff-ffffffffffff",
                        "dt"    : MOCK_ISO_8601_TIMESTAMP(),
                        "domain": MOCK_WIKI_DOMAIN(),
                        "uri"   : MOCK_WIKI_URI(),
                };

                e.session_id  = SESSION_ID;
                e.pageview_id = PAGEVIEW_ID;
                e.activity_id = ACTIVITY_ID[stream_name];

                QUEUE.push([stream_name, e]);

                call_processor();
        }

        return {
                "set_processor":set_processor,
                "call_processor": call_processor,
                "event": event,
        }
})();



/******************************************************************************
 * STREAM MANAGER 
 ******************************************************************************/
var Stream = (function()
{
        var STREAM = {};
        var CASCADE = {};
        var SESSION_ID  = "FFFFFFFFFFFFFFFFFFFFFFFF";
        var PAGEVIEW_ID = "CCCCCCCCCCCCCCCCCCCCCCCC";

        function make_stream_cascade(streams)
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

        function init()
        {
                STREAM = MOCK_STREAM_CONFIG();
                CASCADE = make_stream_cascade(STREAM);

                Input.set_processor(event);
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

        function event(name, data) 
        { 
                if (!is_stream_enabled(name)) {
                        return false;
                }
                if (!is_stream_sampled(name)) {
                        return false;
                }

                var e = data;
                e.$schema     = STREAM[name].schema_url;
                e.meta.stream = STREAM[name].stream_name

                Output.schedule(STREAM[name].url, JSON.stringify(e));

                /* Cascade the event where applicable */
                if (name in CASCADE) { 
                        for (var i=0; i<CASCADE[name].length; i++) { 
                                event(CASCADE[name][i], data);
                        }
                }
        }

        return {
                "init": init,
        };
})();

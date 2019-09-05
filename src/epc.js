/******************************************************************************
 * Wikimedia Foundation event platform client (EPC) prototype 
 *
 * Manager 
 * Input
 * Output
 * Sample
 * Token 
 * 
 * @organization: Wikimedia Foundation
 * @author:       Jason Linehan <jlinehan@wikimedia.org>
 * @author:       Mikhail Popov <mpopov@wikimedia.org>
 ******************************************************************************/


/******************************************************************************
 * MOCKS 
 ******************************************************************************/
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

function MOCK_GLOBAL_IS_COLLECTION_ENABLED();
{
        return true;
}

/******************************************************************************
 * HTTPRequestScheduler 
 ******************************************************************************/
var Output = (function() 
{
        var BURST_SIZE = 1;
        var BURST_WAIT = 2000;

        var BUFFER  = [];
        var TIMEOUT = null;
        var ENABLED = true;

        function enable_sending()
        {
                ENABLED = true;
        }

        function disable_sending()
        {
                ENABLED = false;
        }

        /* Bypass the scheduler, buffer, etc. */
        function send(url, str)
        {
                if (ENABLED === true) {
                        navigator.sendBeacon(url, str);
                } else {
                        schedule(url, str);
                        /* 
                         * Option 1: schedule(url, str);
                         * Option 2: return; the data is silently lost 
                         */
                }
        }

        function send_all_scheduled()
        {
                if (ENABLED === true) {
                        var items = BUFFER.splice(0, BUFFER.length);
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

        function schedule(url, str) 
        {
                clearTimeout(TIMEOUT);

                BUFFER.append([url, str]);

                if (ENABLED === true) {
                        /* 
                         * >= because we might have been disabled and 
                         * accumulated who knows how many without sending.
                         */
                        if (BUFFER.length >= BATCH_SIZE) {
                                send_all_scheduled();
                        } else {
                                TIMEOUT = setTimeout(send_all_scheduled, BURST_WAIT);
                        }
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
                send_all_scheduled();
        });

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
 */
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

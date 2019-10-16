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

/*
 * EPC State Model
 * ---------------
 *
 *  Use this for the basis of documentation, recommendations,
 *  classification of events, and the drafting of standard
 *  re-usable schema. 
 *
 * instrumentation:
 *      stateless
 *              The instrumentation code has no persistence
 *              of its own beyond the EPC library and 
 *              application. 
 *      stateful
 *              The instrumentation code maintains a separate
 *              store of persistent state for the sole purpose
 *              of instrumentation.
 *
 * schema->stream:
 *      simplex 
 *              The schema and stream only carry one type of
 *              event.
 *      multiplex
 *              The schema is a union type, and the stream can
 *              carry multiple kinds of events, each marked with
 *              an 'event_type' label or similar.
 *
 * event: 
 *      aggregated
 *              Events do not carry information about the specific
 *              'run' of e.g. a funnel. 
 *      fibrated 
 *              Events carry this information in the form of e.g.
 *              activity_id and can thus be associated with 
 *              individual runs at query-time.
 *
 *      NOTE 
 *      isn't this actually a property of the schema/stream?
 *      since this field has to be specified and all...
 */
( function() {

        /*************************************************
         * INTEGRATION 
         *************************************************/

        var _ = {
                "get_store": get_store,
                "set_store": set_store,
                "http_get": http_get,
                "http_post": http_post,
                "new_id": new_id
                "generate_UUID_v4":generate_UUID_v4,
                "session_timeout_condition":function() { return false; },
        };

        function bind_output_buffer_events() 
        {
                window.addEventListener('pagehide', function() {
                        OutputBuffer.send_all_scheduled();
                });

                document.addEventListener('visibilitychange', function() {
                        if (document.hidden) {
                                OutputBuffer.send_all_scheduled();
                        }
                });

                window.addEventListener('offline', function() { 
                        OutputBuffer.disable_sending();
                });
                
                window.addEventListener('online', function() { 
                        OutputBuffer.enable_sending();
                });
        }

        /*************************************************
         * OUTPUT BUFFER 
         *************************************************/

        var OutputBuffer = (function() 
        {
                /* 
                 * The number of items that can be enqueued
                 * before the timer becomes non-interruptable 
                 */
                var WAIT_ITEMS = 10;

                /* 
                 * The number of milliseconds during which the
                 * timer can be interrupted and reset by the
                 * arrival of a new item on the queue.
                 */
                var WAIT_MS = 2000;

                /* When FALSE, queue can't be emptied */
                var ENABLED = true;

                /* Queue items are [url, body] pairs */
                var QUEUE = []; 

                /* Timeout controlling the HTTP request bursting */
                var TIMER = null;

                return {
                        send_all_scheduled: function() {
                                clearTimeout(TIMER);

                                if (ENABLED === true) {
                                        /* 
                                         * Data is permanently removed from the 
                                         * queue. If this.send() fails, the 
                                         * data will be lost.
                                         */
                                        var arr = QUEUE.splice(0, QUEUE.length);
                                        for (var i=0; i<arr.length; i++) {
                                                this.send(arr[i][0], arr[i][1]);
                                        }
                                }
                                /* 
                                 * If not enabled, the data remains in the 
                                 * queue and could be sent later. 
                                 */
                        },

                        schedule: function(url, str) {
                                QUEUE.push([url, str]);

                                if (ENABLED === true) {
                                        /* 
                                         * >= because we might have been 
                                         * disabled and accumulated who 
                                         * knows how many items.
                                         */
                                        if (QUEUE.length >= WAIT_ITEMS) {
                                                this.send_all_scheduled();
                                        } else {
                                                clearTimeout(TIMER);
                                                TIMER = setTimeout(this.send_all_scheduled, WAIT_MS);
                                        }
                                }
                        },

                        send: function(url, str) {
                                if (ENABLED === true) {
                                        _.http_post(url, str); 
                                        /* 
                                         * Since we just woke the device's
                                         * radio by calling http_post(), we
                                         * might as well flush the buffer.
                                         */
                                        this.send_all_scheduled();
                                } else {
                                        /*
                                         * TODO: Choose behavior:
                                         * 1. If disabled, send() becomes schedule()
                                         * 2. If disabled, send() becomes a no-op
                                         */
                                        this.schedule(url, str);
                                }
                        },

                        enable_sending: function() {
                                ENABLED = true;
                                /*
                                 * We try right away to send any messages
                                 * in the queue. This behavior is handy.
                                 */
                                this.send_all_scheduled();
                        },

                        disable_sending: function() {
                                ENABLED = false;
                        },
                };
        })();

        /*************************************************
         * ASSOCIATION CONTROLLER 
         *************************************************/

        var Association = (function()
        {
                var P_TOKEN = null;
                var P_TABLE; 
                var P_CLOCK; // FIXME: These clocks have max values

                var S_TOKEN = null;
                var S_TABLE;
                var S_CLOCK; // FIXME: These clocks have max values

                return {
                        begin_new_session: function() {
                                /* Diagnoses session reset */
                                S_TOKEN = null;
                                _del_store("s_token"); 

                                /* Diagnoses pageview reset */
                                P_TOKEN = null;
                        },

                        begin_new_activity: function(n) {
                                if (P_TABLE && (n in P_TABLE)) { 
                                        delete(P_TABLE[n]);
                                        return;
                                }

                                /* Make sure we have loaded from persistence */
                                this.sessionID(); 

                                if (n in S_TABLE) {
                                        delete(S_TABLE[n]);
                                        _set_store("s_table", S_TABLE);
                                }
                        },

                        sessionID: function() {
                                if (S_TOKEN === null) {
                                        /* Try to load session data */
                                        S_TOKEN = _get_store("s_token");
                                        S_TABLE = _get_store("s_table");
                                        S_CLOCK = _get_store("s_clock");

                                        /* If this fails... */
                                        if (S_TOKEN == null) {
                                                /* Generate a new session */
                                                S_TOKEN = _new_id();
                                                S_TABLE = {};
                                                S_CLOCK = 1;
                                                _set_store("s_token", S_TOKEN);
                                                _set_store("s_table", S_TABLE);
                                                _set_store("s_clock", S_CLOCK);
                                        }
                                }
                                return S_TOKEN; 
                        },

                        pageviewID: function() {
                                if (P_TOKEN === null) {
                                        P_TOKEN = _new_id(); 
                                        P_TABLE = {};
                                        P_CLOCK = 1;
                                }

                                return P_TOKEN; 
                        },

                        activityID: function(n, scope) {
                                if (scope === "session") {
                                        var tok = this.sessionID();
                                        if (!(n in S_TABLE)) {
                                                S_TABLE[n] = S_CLOCK++;
                                                _set_store("s_table", S_TABLE);
                                                _set_store("s_clock", S_CLOCK);
                                        }
                                        var inc = S_TABLE[n];
                                } else {
                                        var tok = this.pageviewID();
                                        if (!(n in P_TABLE)) {
                                                P_TABLE[n] = P_CLOCK++;
                                        }
                                        var inc = P_TABLE[n];
                                }

                                /* == printf("%s%04x", tok, inc) */ 
                                return tok+(inc+0x10000).toString(16).slice(1);
                        },

                };
        })();

        /*************************************************
         * SAMPLING CONTROLLER 
         *************************************************/

        var Sampling = (function()
        {
                return {
                        in_sample: function(token, sampling_config) {
                                return true;
                        },
                };
        })();

        
        /*************************************************
         * PUBLIC API 
         *************************************************/

        var URL = "http://pai-test.wmflabs.org/log";

        var S = {}; /* Streams */
        var C = {}; /* Cascade */

        return {
                event: function(n, e, timestamp) {
                        if (S[n] === undefined) { 
                                /* 
                                 * Events for (as-yet) unconfigured streams are
                                 * placed on the InputBuffer. 
                                 */
                                InputBuffer.event(n, data, timestamp);
                                return;
                        }

                        if (S[n].is_available === false) {
                                /* 
                                 * The stream is configured as unavailable,
                                 * and will not receive events. 
                                 */
                                return;
                        }

                        /* 
                         * (1): AssociationController 
                         */

                        e.session  = Association.sessionID();
                        e.pageview = Association.pageviewID(); 

                        if (S[n].scope !== "session") {
                                S[n].scope = "pageview";
                        }

                        e.activity = Association.activityID(n, S[n].scope); 

                        /*
                         * (2): SamplingController
                         */

                        if (Sampling.in_sample(e.activity, S[n].sampling)) {

                                /*
                                 * (3): Other processing and instrumentation 
                                 */

                                e.meta = {
                                        "id"    : _.generate_UUID_v4(),
                                        "dt"    : timestamp,
                                        "domain": MOCK_WIKI_DOMAIN(),
                                        "uri"   : MOCK_WIKI_URI(),
                                        "stream": n,
                                };

                                e.$schema = S[n].url;

                                /* e = InstrumentationModule.process(n, e); */

                                OutputBuffer.schedule(URL, JSON.stringify(e));
                        }
                        
                        /* 
                         * Cascade 
                         */

                        for (var i=0; i<C[n].length; i++) { 
                                this.event(C[n][i], data, timestamp);
                        }
                },

                streams: function(config) {
                        /* FIXME: This method is so bad */
                        for (var n in config) {
                                if (!(n in S)) {
                                        /* First assignment wins */
                                        S[n] = config[n];
                                }
                        }

                        C = {};

                        for (var x in S) {
                                C[x] = [];
                                for (var y in S) {
                                        if (y.indexOf(x+".") === 0) {
                                                C[x].push(y); 
                                        }
                                }
                        }

                        /* TODO: InputBuffer flush goes here */
                }
        };
})();

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
( function() {
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
                                        Integration.http_post(url, str); 
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

        var AssociationController = (function()
        {
                var P_TOKEN = null;
                var P_TABLE; 
                var P_CLOCK; /* FIXME: These clocks have max values */

                var S_TOKEN = null;
                var S_TABLE;
                var S_CLOCK; /* FIXME: These clocks have max values */

                return {
                        begin_new_session: function() {
                                /* Diagnoses session reset */
                                S_TOKEN = null;
                                Integration.del_store("s_token"); 

                                /* Diagnoses pageview reset */
                                P_TOKEN = null;
                        },

                        begin_new_activity: function(stream_name) {
                                if (P_TABLE && (stream_name in P_TABLE)) { 
                                        delete(P_TABLE[stream_name]);
                                        return;
                                }

                                /* Make sure we have loaded from persistence */
                                this.sessionID(); 

                                if (stream_name in S_TABLE) {
                                        delete(S_TABLE[stream_name]);
                                        Integration.set_store("s_table", S_TABLE);
                                }
                        },

                        sessionID: function() {
                                if (S_TOKEN === null) {
                                        /* Try to load session data */
                                        S_TOKEN = Integration.get_store("s_token");
                                        S_TABLE = Integration.get_store("s_table");
                                        S_CLOCK = Integration.get_store("s_clock");

                                        /* If this fails... */
                                        if (S_TOKEN == null) {
                                                /* Generate a new session */
                                                S_TOKEN = _new_id();
                                                S_TABLE = {};
                                                S_CLOCK = 1;
                                                Integration.set_store("s_token", S_TOKEN);
                                                Integration.set_store("s_table", S_TABLE);
                                                Integration.set_store("s_clock", S_CLOCK);
                                        }
                                }
                                return S_TOKEN; 
                        },

                        pageviewID: function() {
                                if (P_TOKEN === null) {
                                        P_TOKEN = Integration.new_id(); 
                                        P_TABLE = {};
                                        P_CLOCK = 1;
                                }

                                return P_TOKEN; 
                        },

                        activityID: function(stream_name, scope) {
                                if (scope === "session") {
                                        var tok = this.sessionID();
                                        if (!(stream_name in S_TABLE)) {
                                                S_TABLE[stream_name] = S_CLOCK++;
                                                Integration.set_store("s_table", S_TABLE);
                                                Integration.set_store("s_clock", S_CLOCK);
                                        }
                                        var inc = S_TABLE[stream_name];
                                } else {
                                        var tok = this.pageviewID();
                                        if (!(stream_name in P_TABLE)) {
                                                P_TABLE[stream_name] = P_CLOCK++;
                                        }
                                        var inc = P_TABLE[stream_name];
                                }
                                /* == printf("%s%04x", tok, inc) */ 
                                return tok+(inc+0x10000).toString(16).slice(1);
                        },
                };
        })();

        /*************************************************
         * SAMPLING CONTROLLER 
         *************************************************/

        var SamplingController = (function()
        {
                return {
                        in_sample: function(token, sampling_config) {
                                return true;
                        },
                };
                /* ... a/b testing ... */
        })();

        
        /*************************************************
         * PUBLIC API 
         *************************************************/

        var URL = "http://pai-test.wmflabs.org/log";

        var CONFIG = {};
        var COPIES = {};

        return {
                log: function(stream_name, data) {

                        /* Multiple dispatch of events. */
                        for (var i=0; i<COPIES[stream_name].length; i++) { 
                                this.log(COPIES[stream_name][i], data);
                        }

                        if (CONFIG[stream_name] === undefined) { 
                                /* 
                                 * Events for (as-yet) unconfigured streams are
                                 * placed on the InputBuffer. 
                                 */
                                Integration.input_buffer_append(stream_name, data);
                                return;
                        }

                        if (CONFIG[stream_name].is_available === false) {
                                /* 
                                 * The stream is configured as unavailable,
                                 * and will not receive events. 
                                 */
                                return;
                        }

                        if (Integration.client_cannot_be_tracked()) {
                                /* 
                                 * If the client cannot be tracked, then we
                                 * can only send events if they certify as
                                 * being non-identifiable.
                                 */
                                if (CONFIG[stream_name].is_nonidentifiable !== true) {
                                        return;
                                }
                        }

                        /* 
                         * (1): AssociationController 
                         */

                        var sessionID = AssociationController.sessionID();
                        var pageviewID = AssociationController.pageviewID(); 
                        var sampleID = null;

                        if (CONFIG[stream_name].scope !== "session") {
                                CONFIG[stream_name].scope = "pageview";
                                sampleID = pageviewID;
                        } else {
                                sampleID = sessionID;
                        }

                        var activityID = AssociationController.activityID(stream_name, CONFIG[stream_name].scope); 

                        /*
                         * (2): SamplingController
                         */

                        if (SamplingController.in_sample(sampleID, CONFIG[stream_name].sampling)) {

                                /*
                                 * (3): Other processing and instrumentation 
                                 */

                                data.meta = {
                                        /*
                                         * Unique ID to allow deduplication at the server. 
                                         *
                                         * Some browsers will inadvertently emit duplicate HTTP 
                                         * requests under certain conditions.
                                         *
                                         * TODO 
                                         * 'pageview' and 'dt' are sufficient for this purpose. 
                                         * Is it worth generating and sending an additional ~128 
                                         * bits of randomness per request? 
                                         */
                                        "id": Integration.generate_UUID_v4(),

                                        /*
                                         * ISO 8601 timestamp generated when event was triggered.
                                         * TODO: we need locale information like tz too, right?
                                         * TODO: Is this identifiable?
                                         */
                                        "dt": Integration.get_iso_8601_timestamp(),

                                        /* 
                                         * Name of the stream. 
                                         * Will be used by EventGate to fetch stream config.
                                         */
                                        "stream": stream_name,
                                };

                                /* name and revision of schema. */
                                data.$schema = CONFIG[stream_name].$schema,

                                if (CONFIG[stream_name].is_nonidentifiable !== true) {
                                        /* 
                                         * All identifiable information should be 
                                         * added here. This is crude and will need
                                         * to be revisited.
                                         */
                                        data.session = sessionID;
                                        data.pageview = pageviewID;
                                        data.activity = activityID;
                                }

                                /* data = InstrumentationModule.process(stream_name, data); */

                                OutputBuffer.schedule(CONFIG[stream_name].url, JSON.stringify(data));
                        }
                },

                configure: function(stream_config) {

                        for (var stream_name in stream_config) {
                                if (!(stream_name in CONFIG)) {
                                        /* First assignment wins */
                                        CONFIG[stream_name] = stream_config[stream_name];
                                }
                        }

                        COPIES = {};

                        for (var x in CONFIG) {
                                COPIES[x] = [];
                                for (var y in CONFIG) {
                                        if (y.indexOf(x+".") === 0) {
                                                COPIES[x].push(y); 
                                        }
                                }
                        }
                        /* TODO: InputBuffer flush goes here */
                }
        };
})();

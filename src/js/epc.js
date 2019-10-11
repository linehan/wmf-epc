/*
 * Event Platform Client (EPC)
 *
 * DESCRIPTION
 *     Collects events in an input buffer, adds some metadata, places them
 *     in an output buffer where they are periodically bursted to a remote
 *     endpoint via HTTP POST.
 *
 *     Designed for use with MediaWiki browser clients producing events to
 *     the EventGate intake service.
 *
 * LICENSE NOTICE
 *     Copyright 2019 Wikimedia Foundation
 *
 *     Redistribution and use in source and binary forms, with or without
 *     modification, are permitted provided that the following conditions are
 *     met:
 *
 *     1. Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *
 *     2. Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 *
 *     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 *     IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 *     THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 *     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 *     CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *     EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 *     SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * AUTHORS
 *     Jason Linehan <jlinehan@wikimedia.org>
 *     Mikhail Popov <mpopov@wikimedia.org>
 */

function MOCK_STREAM_CONFIG() {
        return {
                "edit": {
                        "stream": "edit",
                        "scope": "session",
                        "sample": 0.06,
                        "start_states": ["editAttemptStart"],
                        "final_states": ["editAttemptSuccess", "editAttemptFailure"],
                        "active": false,
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
                        "url": "/lab",
                },
                "click": {
                        "stream": "click",
                        "sample": 0.01,
                        /*
                         * An example of a predicate filter with fields
                         * we could support.
                         */
                        "active": true,
                        "filter": {
                                "user_status": ["login", "anon"],
                                "user_agent": ["firefox", "chrome", "safari"],
                                "wiki_lang": ["en", "cz", "jp"],
                                "localtime": ["start_time", "end_time"],
                                /*
                                 * A boolean value we can set in their user
                                 * settings and test for; to allow tagging of
                                 * cohorts and a kind of 'catch all' route for
                                 * predicates we don't yet, or can never,
                                 * support in the client.
                                 */
                                "conf_value": ["wiki_first_day"],
                        },
                        "url": "https://pai-test.wmflabs.org/log",
                }
        };
}


/******************************************************************************
 * INTEGRATION
 *
 * These are various functions that will link this library to platform
 * specific functionality.
 *
 * In other words, you fill this out on a per-platform basis.
 ******************************************************************************/

var Integration = {
        "get_store": function (k) {
                var data = window.localStorage.getItem(k);
                return (data) ? JSON.parse(data) : {};
        },
        "set_store": function (k, v) {
                window.localStorage.setItem(k, JSON.stringify(v));
        },

        "new_id": function () {
                /* Support: IE 11 */
                var crypto = window.crypto || window.msCrypto;

                if (crypto && crypto.getRandomValues) {
                        if (typeof Uint16Array === 'function') {
                                /*
                                 * Fill an array with 5 random values,
                                 * each of which is 16 bits.
                                 *
                                 * Note that Uint16Array is array-like,
                                 * but does not implement Array.
                                 */
                                var rnds = new Uint16Array(5);
                                crypto.getRandomValues(rnds);
                        }
                } else {
                        var rnds = new Array(5);
                        /*
                         * 0x10000 is 2^16 so the operation below will return
                         * a number between 2^16 and zero
                         */
                        for (var i = 0; i < 5; i++) {
                                rnds[i] = Math.floor(Math.random() * 0x10000);
                        }
                }

                return (rnds[0] + 0x10000).toString(16).slice(1) +
                        (rnds[1] + 0x10000).toString(16).slice(1) +
                        (rnds[2] + 0x10000).toString(16).slice(1) +
                        (rnds[3] + 0x10000).toString(16).slice(1) +
                        (rnds[4] + 0x10000).toString(16).slice(1);
        },

        "generate_UUID_v4": function () {
                return "ffffffff-ffff-ffff-ffff-ffffffffffff";
        },

        "http_get": function (url, callback) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                                var json = JSON.parse(xhr.responseText);
                                callback.call(null, json);
                        }
                };
                xhr.send();
        },

        "http_post": function (url, data) {
                navigator.sendBeacon(url, data);
        }
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
var Output = (function () {
        var WAIT_ITEMS = 2;
        var WAIT_MS = 2000;

        var QUEUE = [];
        var TIMEOUT = null;
        var ENABLED = true;

        function enable_sending() {
                ENABLED = true;
                send_all_scheduled();
        }

        function disable_sending() {
                ENABLED = false;
        }

        function unschedule() {
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
        function schedule(url, str) {
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
        function send_all_scheduled() {
                unschedule();

                if (ENABLED === true) {
                        var item = QUEUE.splice(0, QUEUE.length);
                        for (var i = 0; i < item.length; i++) {
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
        function send(url, str) {
                if (ENABLED === true) {
                        Integration.http_post(url, str);
                        send_all_scheduled();
                } else {
                        schedule(url, str);
                        /*
                         * Option 1: schedule(url, str);
                         * Option 2: return; the data is silently lost
                         */
                }
        }

        window.addEventListener('pagehide', function () {
                send_all_scheduled();
        });

        document.addEventListener('visibilitychange', function () {
                if (document.hidden) {
                        send_all_scheduled();
                }
        });

        window.addEventListener('offline', function () {
                disable_sending();
        });

        window.addEventListener('online', function () {
                enable_sending();
        });

        /* TODO: unload */

        return {
                "schedule": schedule,
                "send": send
        };
})();

/******************************************************************************
 * TOKEN
 * Handles the storage and book-keeping that controls the various
 * pageview, session, and activity tokens.
 ******************************************************************************/
var Token = (function () {
        var PAGEVIEW = null;
        var SESSION = null;

        function session_timeout_condition() {
                return false;
        }

        function new_table() {
                return { ":id": new_id(), ":sg": 1 };
        }

        function pageview_check() {
                if (PAGEVIEW === null) {
                        PAGEVIEW = new_table();
                }
        }

        function session_check() {
                /* A fresh execution will have SESSION set to null */
                if (SESSION === null) {
                        /* Attempt to load SESSION from persistent store */
                        SESSION = Integration.get_store("epc-session");

                        /* If this fails, or the data is malformed */
                        if (!SESSION || !(":id" in SESSION) || !(":sg" in SESSION)) {
                                /* Then regenerate */
                                SESSION = new_table();
                                Integration.set_store("epc-session", SESSION);
                        }
                }
                /* If the session is over, based on our criteria */
                if (session_timeout()) {
                        /* Then regenerate */
                        SESSION = new_table();
                        Integration.set_store("epc-session", SESSION);

                        /* And trigger a pageview regeneration as well */
                        PAGEVIEW = new_table();
                }
        }

        function session() {
                session_check();
                return SESSION[":id"];
        }

        function pageview() {
                pageview_check();
                return PAGEVIEW[":id"];
        }

        function activity(name, scopename) {
                var id, sn;

                if (scopename === "session") {
                        id = session();
                        if (!(name in SESSION)) {
                                SESSION[name] = SESSION[":sg"]++;
                                Integration.set_store("epc-session", SESSION);
                        }
                        sn = SESSION[name];
                        return id + (sn + 0x10000).toString(16).slice(1);
                }
                if (scopename === "pageview") {
                        id = pageview();
                        if (!(name in PAGEVIEW)) {
                                PAGEVIEW[name] = PAGEVIEW[":sg"]++;
                        }
                        sn = PAGEVIEW[name];
                        return id + (sn + 0x10000).toString(16).slice(1);
                }
                return null;
        }

        function activity_reset(name) {
                pageview_check();
                if (name in PAGEVIEW) {
                        delete (PAGEVIEW[name]);
                        /* Only one scope per event, so if it was a pageview
                         * event, we don't need to check the session data */
                        return;
                }

                session_check();
                if (name in SESSION) {
                        delete (SESSION[name]);
                        Integration.set_store("epc-session", SESSION);
                }
        }

        return {
                "session": session,
                "pageview": pageview,
                "activity": activity,
                "activity_reset": activity_reset,
        };
})();

/******************************************************************************
 * STREAM MANAGER
 ******************************************************************************/
var Stream = (function () {
        var STREAM = {};
        var CASCADE = {};

        function init() {
                STREAM = MOCK_STREAM_CONFIG();
                //Integration.http_get("https://pai-test.wmflabs.org/streams", function(json) {
                //STREAM = json;
                //});
        }

        function is_stream_enabled(name) {
                if (EPC_ENABLED() && (name in STREAM) && stream_active(name)) {
                        return true;
                }
                return false;
        }

        function is_stream_sampled(name) {
                return true;
        }

        function get_stream_property(name, property, if_dne) {
                if ((name in STREAM) && (property in STREAM[name])) {
                        return STREAM[name][property];
                }
                return if_dne;
        }

        function stream_active(name) {
                return get_stream_property(name, "active", true);
        }

        function stream_scope(name) {
                return get_stream_property(name, "scope", "none");
        }

        function is_event_orphaned(name, data) {
                /*
                 * TODO: Do we even want to bother with this?
                 */
        }

        function event(name, data, timestamp) {
                if (!is_stream_enabled(name)) {
                        return false;
                }
                if (is_event_orphaned(name, data)) {
                        return false;
                }
                if (!is_stream_sampled(name)) {
                        return false;
                }

                console.log("here");

                var e = data;

                e.meta = {
                        "id": Integration.generate_UUID_v4(),
                        "dt": timestamp,
                        "domain": MOCK_WIKI_DOMAIN(),
                        "uri": MOCK_WIKI_URI(),
                        "stream": STREAM[name].stream_name,
                };

                e.$schema = STREAM[name].schema_url;

                e.session = Token.session();
                e.pageview = Token.pageview();
                e.activity = Token.activity(name, stream_scope(name));

                Output.schedule('http://pai-test.wmflabs.org/log', JSON.stringify(e));
                //Output.schedule(STREAM[name].url, JSON.stringify(e));

                /* Cascade the event to child events */
                if (!(name in CASCADE)) {
                        CASCADE[name] = [];
                        for (var x in STREAM) {
                                if (x.indexOf(name + ".") === 0) {
                                        CASCADE[name].push(x);
                                }
                        }
                }
                for (var i = 0; i < CASCADE[name].length; i++) {
                        /* TODO: don't call is_event_orphaned more than once! */
                        event(CASCADE[name][i], data);
                }
        }

        return {
                "init": init,
                "event": stream_scope,
        };
})();

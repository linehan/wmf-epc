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
 *     Designed for use with Wikipedia Android application producing events to
 *     the EventGate intake service.
 *
 * AUTHORS
 *     Jason Linehan <jlinehan@wikimedia.org>
 *     Mikhail Popov <mpopov@wikimedia.org>
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
 */

import org.json.JSONObject;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.Map;
import java.util.Scanner;
import java.util.Timer;
import java.util.TimerTask;
import java.util.List;

public class EPC {

    /**
     * OutputBuffer: buffers events in a queue prior to transmission
     *
     * Static class
     *
     * Transmission is via HTTP POST.
     * Transmissions are not sent at a uniform offset but are shaped into
     * 'bursts' using a combination of queue size and debounce time.
     *
     * These concentrate requests (and hence, theoretically, radio awake state)
     * so as not to contribute to battery drain.
     */
    private static class OutputBuffer {
        /*
         * When an item is added to QUEUE, wait this many ms before sending.
         *
         * If another item is added to QUEUE during this time, reset the
         * countdown.
         */
        private static int WAIT_MS = 2000;

        /*
         * When QUEUE.size() exceeds this value TIMER becomes non-interruptable.
         */
        private static int WAIT_ITEMS = 10;

        /*
         * When ENABLED is false, items can be enqueued but not dequeued.
         * Timers will not be set for enqueued items.
         * QUEUE may grow beyond WAIT_ITEMS.
         */
        private static boolean ENABLED = true;

        /*
         * IMPLEMENTATION NOTE: QUEUE is a linked list of two-element arrays of
         * strings.
         *
         * The two strings in each array item are the two arguments of the
         * send() or schedule() method.
         */
        private static LinkedList<String[]> QUEUE = new LinkedList();

        /*
         * IMPLEMENTATION NOTE: Java Timer will provide the desired asynchronous
         * countdown after a new item is added to QUEUE.
         */
        private static Timer TIMER;

        /*
         * IMPLEMENTATION NOTE: Java abstract TimerTask class requires a run()
         * method be defined.
         *
         * The run() method is called when the Timer expires.
         */
        private static class Task extends TimerTask {
            public void run() {
                send_all_scheduled();
            }
        }

        /**
         * Dequeue and call send() on all scheduled items.
         */
        public static void send_all_scheduled() {
            if (TIMER != null) {
                TIMER.cancel();
            }

            if (ENABLED == true) {
                /*
                 * All items on QUEUE are permanently removed.
                 */
                String[] item = new String[2];
                while ((item = QUEUE.poll()) != null) {
                    /*
                     * Failure of send() will result in data loss.
                     * (Fire-and-forget)
                     */
                    send(item[0], item[1]);
                }
            } else {
                /*
                 * Do nothing; the data is still in the queue and will be sent
                 * after we are enabled again.
                 */
            }
        }

        /**
         * Schedule a request to be sent.
         *
         * @param url  destination of the HTTP POST request
         * @param body body of the HTTP POST request
         */
        public static void schedule(String url, String body) {
            /*
             * The actual item enqueued is an array of length 2 holding the two
             * arguments.
             */
            String[] item = {url, body};

            /*
             * Item is enqueued whether or not sending is enabled.
             */
            QUEUE.add(item);

            if (ENABLED == true) {
                if (QUEUE.size() >= WAIT_ITEMS) {
                    /*
                     * >= because while sending is disabled, any number of items
                     * could be added to QUEUE without it emptying.
                     */
                    send_all_scheduled();
                } else {
                    /*
                     * The arrival of a new item interrupts the timer and resets
                     * the countdown.
                     */
                    if (TIMER != null) {
                        TIMER.cancel();
                    }
                    TIMER = new Timer();
                    TIMER.schedule(new Task(), WAIT_MS);
                }
            }
        }

        /**
         * Attempt to send a request with the given url and body.
         *
         * @param url  destination of the HTTP POST request
         * @param body body of the HTTP POST request
         */
        public static void send(String url, String body) {
            if (ENABLED == true) {
                /*
                 * Attempt to transmit the given body to the given url via HTTP
                 * POST.
                 */
                try {
                    Integration.http_post(url, body);
                } catch (Exception e) {
                    /*
                     * FIXME: How to handle?
                     */
                }
            } else {
                /*
                 * Do nothing (transmission is disabled; items remain in QUEUE)
                 */
            }
        }

        /**
         * Enable sending
         */
        public static void enable_sending() {
            ENABLED = true;
            /*
             * Try immediately to send any enqueued items. Otherwise another
             * item must be enqueued before sending is triggered.
             */
            send_all_scheduled();
        }

        /**
         * Disable sending
         */
        public static void disable_sending() {
            ENABLED = false;
        }
    }

    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

    /**
     * AssociationController: provides associative identifiers and manage their
     * persistence
     *
     * Static class
     *
     * Identifiers correspond to various scopes e.g. 'pageview', 'session',
     * 'activity', and 'device'.
     */
    private static class AssociationController {
        private static String PAGEVIEW_ID = null;
        private static String SESSION_ID = null;

        /**
         * Generate a pageview identifier.
         *
         * @return pageview ID
         *
         * The identifier is a string of 20 zero-padded hexadecimal digits
         * representing a uniformly random 80-bit integer.
         */
        public static String pageview_id() {
            if (PAGEVIEW_ID == null) {
                PAGEVIEW_ID = Integration.generate_id();
            }
            return PAGEVIEW_ID;
        }

        /**
         * Generate a session identifier.
         *
         * @return session ID
         *
         * The identifier is a string of 20 zero-padded hexadecimal digits
         * representing a uniformly random 80-bit integer.
         */
        public static String session_id() {
            if (SESSION_ID == null) {
                /*
                 * If there is no runtime value for SESSION_ID, try to load a
                 * value from persistent store.
                 */
                SESSION_ID = Integration.get_persistent("sid");

                if (SESSION_ID == null) {
                    /*
                     * If there is no value in the persistent store, generate a
                     * new value for SESSION_ID, and write the update to the
                     * persistent store.
                     */
                    SESSION_ID = Integration.generate_id();
                    Integration.set_persistent("sid", SESSION_ID);
                }
            }
            return SESSION_ID;
        }

        /**
         * Unset the session.
         */
        public static void begin_new_session() {
            /*
             * Clear runtime and persisted value for SESSION_ID.
             */
            SESSION_ID = null;
            Integration.del_persistent("sid");

            /*
             * A session refresh implies a pageview refresh, so clear runtime
             * value of PAGEVIEW_ID.
             */
            PAGEVIEW_ID = null;
        }
    }

    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

    /**
     * SamplingController: computes various sampling functions on the client
     *
     * Static class
     *
     * Sampling is based on associative identifiers, each of which have a
     * well-defined scope, and sampling config, which each stream provides as
     * part of its configuration.
     */
    private static class SamplingController {
        /**
         * Compute a boolean function on a random identifier.
         *
         * @param token string of random hexadecimal digits
         * @param config sampling config from stream configuration
         * @return true if in sample or false otherwise
         */
        public static boolean in_sample(String token, JSONObject config) {
            if (!config.has("rate")) {
                return true; /* True by default */
            }
            return true; /* FIXME */
        }
    }

    /* ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ */

    /**
     * The static public API allows callers to configure streams and log events.
     */

    /*
     * CONFIG is the shared store of stream configuration data. Stream
     * configuration is looked up by the name of the stream.
     */
    private static JSONObject CONFIG = new JSONObject();

    /*
     * COPIED maps stream names to lists of stream names. Stream name 'x' will
     * be mapped to an array of stream names matching 'x.*'.
     */
    private static Map<String, List<String>> COPIED = new HashMap<String, List<String>>();

    /*
     * The constructor is private, so instantiation of the EPC class is
     * impossible.
     */
    private void EPC() {
    }

    /**
     * Add configuration to the shared CONFIG object.
     *
     * @param config stream configuration to be loaded into memory
     */
    public static void configure(String config) {
        /*
         * FIXME: in production this can't be so simple?
         */
        CONFIG = new JSONObject(config);
        COPIED.clear();

        for (Object xx : CONFIG.keySet()) {
            String x = (String)xx;

            COPIED.put(x, new LinkedList<String>());
            for (Object yy : CONFIG.keySet()) {
                String y = (String)yy;
                if (y.startsWith(x + ".")) {
                    COPIED.get(x).add(y);
                }
            }
        }
        /* TODO: Try inputbuffer flush here */
    }

    /**
     * Log an event according to the given stream's configuration.
     *
     * @param stream name of the stream to send @object to
     * @param arg sequence of key, value pairs, or single JSONObject
     */
    public static void log(String stream, Object... arg) throws RuntimeException {

        JSONObject data;

        if (!(arg[0] instanceof JSONObject)) {
            /*
             * The 'meta' field is reserved. Altering its value will result in
             * undefined behavior. An event's timestamp shall be recorded at the
             * moment of its first receipt. Subsequent invocations shall not
             * alter the timestamp value.
             */
            String dt = Integration.generate_iso_8601_timestamp();
            JSONObject meta = new JSONObject();
            meta.put("dt", dt);

            /*
             * IMPLEMENTATION NOTE: The log() method can be called multiple
             * times on the same data. The first time it is called, the data
             * will be presented as a variadic argument list. In all subsequent
             * calls, it will be presented as a single JSONObject. This branch
             * triggers on the first call, and this is where we wrap the
             * argument list into a JSONObject.
             */
            data = new JSONObject();

            for (int i = 0; i < arg.length; i += 2) {
                try {
                    data.put(arg[i].toString(), arg[i + 1]);
                } catch (Exception e) {
                    /* arg[i+1] not JSON-compatible type */
                    throw new RuntimeException(e);
                }
            }

            data.put("meta", meta);
        } else {
            data = (JSONObject)arg[0];
        }

        if (!CONFIG.has(stream)) {
            /*
             * If specified stream is not yet configured, event is discarded.
             */
            return;
        }

        for (String copied_stream : COPIED.get(stream)) {
            /*
             * Invocation on a stream 'x' shall result in invocation on any
             * configured stream matching 'x.*', with a copy of the event.
             *
             * An event's copy shall have timestamp equal to that of the
             * original, regardless of when the copy is created.
             *
             * No information besides the original event data and the original
             * timestamp shall pass between stream 'x' and 'x.*'.
             */
            log(copied_stream, data);
        }

        if (Integration.client_cannot_be_tracked()) {
            /*
             * If the specified stream is not configured as private, it shall
             * receive no events when the client has signaled that they shall
             * not be tracked.
             */
            return;
        }

        if (!CONFIG.getJSONObject(stream).has("scope")) {
            /*
             * TODO: need to finalize in stream spec
             */
            /*
             * If the specified stream is not configured with a 'scope'
             * attribute, it is assigned to the 'pageview' scope for
             * compatibility with other EPC implementations. App-specific
             * stream configs should specify 'device' or 'session' scopes only
             * and explicitly, as 'pageview' scope is mainly relevant to web.
             */
            CONFIG.getJSONObject(stream).put("scope", "pageview");
        }

        /*
         * The source of randomness for sampling shall be the identifier
         * corresponding to the stream's configured scope.
         */
        String scope_id;
        if (CONFIG.getJSONObject(stream).getString("scope").equals("session")) {
            scope_id = AssociationController.session_id();
        } else {
            scope_id = AssociationController.pageview_id();
        }

        if (SamplingController.in_sample(scope_id, CONFIG.getJSONObject(stream).getJSONObject("sample"))) {
            /*
             * An event shall be processed only if the sampling controller
             * computes true on the identifier corresponding to the stream's
             * configured scope.
             */

            /*
             * Retreive the meta field in order to add information besides the
             * 'dt' field.
             */
            JSONObject meta = data.getJSONObject("meta");

            /*
             * meta.id is optional and should only be done in case the client is
             * known to send duplicates of events, otherwise we don't need to
             * make the payload any heavier than it already is
             */
            meta.put("id", Integration.generate_uuid_v4());
            meta.put("stream", stream);
            data.put("meta", meta);

            /*
             * Add other root-level information
             */
            data.put("$schema", CONFIG.getJSONObject(stream).getString("$schema"));
            data.put("pageview_id", AssociationController.pageview_id());
            data.put("session_id", AssociationController.session_id());
            data.put("device_id", Integration.get_device_id());

            if (CONFIG.getJSONObject(stream).has("destination")) {
                /*
                 * FIXME: replace with a call to Log.d for production (or
                 *  abstract away to Integration?)
                 */
                System.out.print("\nScheduling event to be sent to stream '" + stream + "'");
                System.out.print(" with data: " + data.toString(2) + "\n");
                /*
                 * Schedule the event for transmission.
                 */
                OutputBuffer.schedule(CONFIG.getJSONObject(stream).getString("destination"), data.toString());
            }
        }
    }
}

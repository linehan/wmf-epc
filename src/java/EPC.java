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
import java.util.LinkedList;
import java.net.URL;
import java.util.Scanner;
import java.nio.charset.StandardCharsets;

import java.util.Map;
import java.util.HashMap;

class EPC
{
        /**********************************************************************
         * OUTPUT BUFFER 
         *
         * Stores events until they can be transmitted 
         * via HTTP POST according to various rules.
         **********************************************************************/

        public class OutputBuffer
        { 
                /* 
                 * The number of items that can be 
                 * added to QUEUE before TIMER becomes 
                 * non-interruptable 
                 */
                private static int WAIT_ITEMS = 10;

                /* 
                 * The number of milliseconds during 
                 * which TIMER can be interrupted and 
                 * reset by the arrival of a new item.
                 */
                private static int WAIT_MS    = 2000;

                /* When FALSE, QUEUE can't be emptied */
                private boolean ENABLED = true;

                /* Queue items are {url, body} pairs */
                private LinkedList<String[]> QUEUE = new LinkedList();

                /* Timer controls the HTTP request bursting */
                private Timer TIMER;

                /* Called when the timer fires (see Java TimerTask) */
                private class Task extends TimerTask
                {
                        public void run() 
                        {
                                send_all_scheduled();
                        }
                }

                /**
                 * send_all_scheduled 
                 * ------------------
                 * Call send() on all enqueued elements.
                 *
                 * @return: nothing
                 */
                public void send_all_scheduled()
                {
                        if (TIMER != null) {
                                TIMER.cancel();
                        }

                        if (ENABLED == true) {
                                /* 
                                 * All items scheduled on QUEUE 
                                 * are permanently removed. 
                                 */
                                String[] item = new String[2];
                                while ((item = QUEUE.poll()) != null) {
                                        /*
                                         * All data will be lost if
                                         * send() fails. It is not
                                         * added back to QUEUE. 
                                         */
                                        send(item[0], item[1]);
                                }
                        } else {
                                /* 
                                 * Do nothing; the data is still in the queue 
                                 * and will be sent after we are enabled again.
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
                public void schedule(String url, String body) 
                {
                        /* An array of length 2 containing the two arguments */ 
                        String[] item = { url, body };

                        QUEUE.add(item);

                        if (ENABLED == true) {
                                if (QUEUE.size() >= WAIT_ITEMS) {
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
                                        if (TIMER != null) {
                                                TIMER.cancel();
                                        }
                                        TIMER = new Timer();
                                        TIMER.schedule(new Task(), WAIT_MS);
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
                public void send(String url, String body)
                {
                        if (ENABLED == true) {
                                try {
                                        Integration.http_post(url, body);
                                } catch (Exception e) {
                                }
                                /* 
                                 * Since we just woke the device's
                                 * radio by calling __http_post(), 
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
                public void enable_sending()
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
                public void disable_sending()
                {
                        ENABLED = false;
                }
        }

        /**********************************************************************
         * ASSOCIATION CONTROLLER.
         *
         * Assigns identifiers corresponding to various 'scopes'
         * such as 'pageview', 'session', and 'activity'.
         **********************************************************************/

        class AssociationController 
        {
                String PAGEVIEW_ID = null;
                String SESSION_ID = null;

                /* Maps stream name to activity number */
                Map<String, Integer> ACTIVITY_TABLE = null;

                /* Monotonically increasing next activity number */
                Integer ACTIVITY_COUNT = 1;

                /**
                 * pageview_id
                 * -----------
                 * Generate a pageview id 
                 *
                 * @return: <string>  
                 *
                 * Uniformly-random 80-bit integer, represented 
                 * as a 0-padded 20-character string of hexadecimal 
                 * digits, e.g.: "ffffffffffffffffffff",
                 */
                public String pageview_id()
                {
                        if (PAGEVIEW_ID == null) {
                                PAGEVIEW_ID = Integration.new_id();
                        }
                        return PAGEVIEW_ID;
                }

                /**
                 * session_id 
                 * ----------
                 * Generate a session id 
                 *
                 * @return: <String>  
                 *
                 * Uniformly-random 80-bit integer, represented 
                 * as a 0-padded 20-character string of hexadecimal 
                 * digits, e.g.: "ffffffffffffffffffff",
                 */
                public String session_id()
                {
                        if (SESSION_ID == null) {
                                /* 
                                 * If there is no runtime value 
                                 * for SESSION_ID, try to load 
                                 * a value from persistent store.
                                 */
                                SESSION_ID = Integration.get_store("sid");

                                if (SESSION_ID == null) { 
                                        /* 
                                         * If there is no value in
                                         * the persistent store,
                                         * generate a new value for 
                                         * SESSION_ID, and write the
                                         * update to the persistent 
                                         * store.
                                         */
                                        SESSION_ID = Integration.new_id();
                                        Integration.set_store("sid", SESSION_ID);
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
                 * hexadecimal digits, e.g.: "ffffffffffffffffffff0123",
                 */
                public String activity_id(String stream, String prefix)
                {
                        if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                                /*
                                 * If there is no runtime value for
                                 * ACTIVITY_COUNT or ACTIVITY_TABLE,
                                 * try to load their values from the
                                 * persistent store.
                                 */
                                ACTIVITY_COUNT = Integration.get_store("ac");
                                ACTIVITY_TABLE = Integration.get_store("at");

                                if (!ACTIVITY_COUNT || !ACTIVITY_TABLE) {
                                        /* 
                                         * If values are missing from 
                                         * the persistent store, reset
                                         * the ACTIVITY_TABLE and 
                                         * ACTIVITY_COUNT variables,
                                         * and write the update to the 
                                         * persistent store.
                                         */
                                        ACTIVITY_COUNT = 1;
                                        ACTIVITY_TABLE = new HashMap<String, Integer>();
                                        Integration.set_store("ac", ACTIVITY_COUNT);
                                        Integration.set_store("at", ACTIVITY_TABLE);
                                }
                        }

                        if (stream) {
                                if (!(ACTIVITY_TABLE.containsKey(stream))) {
                                        /*
                                         * If ACTIVITY_TABLE has not
                                         * recorded an activity number 
                                         * for @stream, assign one
                                         * using ACTIVITY_COUNT, then
                                         * increment ACTIVITY_COUNT,
                                         * and write these updates
                                         * to the persistent store.
                                         */
                                        ACTIVITY_TABLE.put(stream, ACTIVITY_COUNT);
                                        ACTIVITY_COUNT = ACTIVITY_COUNT + 1;
                                        Integration.set_store("ac", ACTIVITY_COUNT);
                                        Integration.set_store("at", ACTIVITY_TABLE);
                                }

                                /*
                                 * Format the activity ID value by
                                 * combining the ID corresponding
                                 * to the given scope, and the
                                 * number stored in ACTIVITY_TABLE.
                                 */
                                Integer count = ACTIVITY_TABLE.get(stream);

                                return String.format("%s%04x", prefix, count);
                        }

                        return "";
                }

                /**
                 * begin_new_session 
                 * ----------------- 
                 * Unset the session.
                 *
                 * @return: nothing
                 */
                public void begin_new_session()
                {
                        /*
                         * Clear runtime and persisted
                         * value for SESSION_ID.
                         */
                        SESSION_ID = null;
                        Integration.del_store("sid"); 

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
                        Integration.del_store("at");
                        Integration.del_store("ac");
                }

                /**
                 * begin_new_activity 
                 * ------------------ 
                 * Unset the activity increment for a stream.
                 *
                 * @stream: <string> name of stream to reset
                 * @return: nothing
                 */
                public void begin_new_activity(String stream)
                {
                        /*
                         * Ensure ACTIVITY_TABLE and
                         * ACTIVITY_COUNT are loaded 
                         * from the persistent store 
                         * (or generated).
                         */
                        activity_id(null, null); 

                        if (ACTIVITY_TABLE != null && ACTIVITY_TABLE.containsKey(stream)) {
                                /*
                                 * Delete the entry under @stream,
                                 * then write the update to the 
                                 * persistent store. 
                                 */
                                ACTIVITY_TABLE.remove(stream);
                                Integration.set_store("at", ACTIVITY_TABLE);
                        }
                }
        }

        /********************************************************************** 
         * SAMPLING CONTROLLER  
	 * 			
	 * Determines whether the client is in- or out-sample using  
         * an identifier-based sampling function.
         **********************************************************************/

        class SamplingController
        {
                /**
                 * in_sample 
                 * --------- 
                 * Compute a boolean function on a random identifier.
                 *
                 * @token : <string> string of random hexadecimal digits
                 * @logic : <Object> sampling logic from stream configuration
                 * @return: <boolean> 
                 */
                static boolean in_sample(String token, Object logic)
                {
                        if (!logic || !logic.containsKey("one_in_every")) {
                                return true; /* True by default */
                        } 

                        /* FIXME */
                        /*
                        token = parseInt( token.slice( 0, 8 ), 16 );
                        return (token % logic.one_in_every) === 0;
                                return true;
                        }
                        */
                        return true;
                }
        }

        /********************************************************************** 
         * PUBLIC INTERFACE
         *
         * Allows a caller to provide stream configuration 
         * data and to log events. 
         **********************************************************************/

        Map<String, Object> CONFIG = new HashMap<String, Object>();
        Map<String, List<String>> COPIED = new HashMap<String, List<String>>();
        LinkedList<Object[]> InputBuffer = new LinkedList<Object[]>();

        /* Prevent instantiation */
        private void EPC(void)
        {
        }

        /**
         * configure 
	 * --------- 
         * Merge configurations with the shared CONFIG object.
         *
         * @config: <Object> stream configuration to be merged.
         * @return: nothing
         */
        public void configure(String config)
        {
                JSONObject json = new JSONObject(config);

                /* FIXME: Clobbers; this isn't what we want */
                CONFIG.putAll(Integration.jsonToMap(json));

                COPIED.clear();

                for (String x : CONFIG.keySet()) {
                        COPIED.put(x, new List<String>());
                        for (String y : CONFIG.keySet()) {
                                if (y.startsWith(x+".")) {
                                        COPIED.get(x).add(y);
                                }
                        }
                }
                /* TODO: Try inputbuffer flush here */
	}

        /**
         * log 
         * --- 
         * Log an event according to the given stream's configuration.
         *
         * @stream: <string> name of the stream to send @object to
         * @data  : <Object> sequence of key, value pairs, or JSONObject 
         * @return: nothing
         */
        public void log(String stream, Object... data) throws RuntimeException 
        {
                if (!(data instanceof JSONObject)) {
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
                        String dt = Integration.get_iso_8601_timestamp();

                        JSONObject meta = new JSONObject();
                        JSONObject data = new JSONObject();
                        int i;

                        for (i=0; i<arg.length; i+= 2) {
                                try {
                                        data.put(arg[i].toString(), arg[i+1]); 
                                } catch (Exception e) {
                                        /* arg[i+1] not a JSON-compat type */ 
                                        throw new RuntimeException(e);
                                }
                        }

                        meta.put("dt", dt);
                        data.put("meta", meta);
                }

                if (!CONFIG.containsKey(stream_name)) {
                        /* 
                         * [1.0] 
                         * If the specified stream is not
                         * yet configured, the event is
                         * enqueued to the input buffer. 
                         */
                        InputBuffer.add(new Object[]{ stream, data });
                        return;
                }

                for (String copied_stream : COPIED.get(stream)) {
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
                        log(copied_stream, data);
                }

                if (CONFIG.get(stream).get("is_available") === false) {
                        /* 
                         * [3.0] 
                         * If the specified stream is
                         * configured as unavailable,
                         * it shall receive no events. 
                         */
                        return;
                }

                if (Integration.client_cannot_be_tracked()) {
                        if (CONFIG.get(stream).get("is_private") !== true) {
                                /* 
                                 * [3.1] 
                                 * If the specified stream is 
                                 * not configured as private,
                                 * it shall receive no events
                                 * when the client has signaled
                                 * that they shall not be tracked. 
                                 */
                                return;
                        }
                }

                if (!CONFIG.get(stream).get("scope").equals("session")) {
                        /* 
                         * [4.0] 
                         * If the specified stream is
                         * not configured with a 'scope' 
                         * attribute, it is assigned to
                         * the 'pageview' scope. 
                         */
                        CONFIG.get(stream).put("scope", "pageview");
                }

                /* 
                 * [4.1] 
                 * The source of randomness 
                 * for sampling shall be the
                 * identifier corresponding
                 * to the stream's configured
                 * scope. 
                 */
                if (CONFIG.get(stream).get("scope").equals("session")) {
                        String scope_id = AssociationController.session_id();
                } else {
                        String scope_id = AssociationController.pageview_id();
                }

                if (SamplingController.in_sample(scope_id, CONFIG.get(stream).get("sample"))) {
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
                        JSONObject meta = data.get("meta");
                        meta.put("id", Integration.get_UUID_v4());
                        meta.put("stream", stream);
                        data.put("meta", meta);
                        data.put("$schema", CONFIG.get(stream).get("$schema"));

                        /* 
                         * [5.2] 
                         * Data classified as non-private
                         * shall be added according to the 
                         * stream's privacy configuration. 
                         */
                        if (CONFIG.get(stream).get("is_private") !== true) {
                                data.put("pageview_id", AssociationController.pageview_id());
                                data.put("session_id", AssociationController.session_id());
                                /* 
                                 * [5.3] 
                                 * If a stream will use an activity 
                                 * ID, that activity shall be scoped 
                                 * according to the stream's 'scope' 
                                 * attribute. 
                                 */
                                data.put("activity_id", AssociationController.activity_id(stream, scope_id));
                        }

                        /* TODO InstrumentationModule.process(n, d) */

                        OutputBuffer.schedule(CONFIG.get(stream).get("url"), data.toString());
                }
        }
}

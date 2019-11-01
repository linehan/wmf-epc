/*
 * Event Platform Client (EPC)
 *
 * DESCRIPTION
 *     Collects events in an input buffer, adds some metadata, places them
 *     in an output buffer where they are periodically bursted to a remote
 *     endpoint via HTTP POST.
 *
 *     Designed for use with Wikipedia Android application producing events to
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
import org.json.JSONObject;
import java.util.LinkedList;
import java.net.URL;
import java.util.Scanner;
import java.nio.charset.StandardCharsets;

import java.util.Map;
import java.util.HashMap;

class EPC
{
        public class OutputBuffer
        { 
                private static int WAIT_ITEMS = 10;
                private static int WAIT_MS    = 2000;

                private boolean ENABLED = true;
                private LinkedList<String[]> QUEUE = new LinkedList();
                private Timer TIMER;

                private class Task extends TimerTask
                {
                        /* Called when the timer fires (see Java TimerTask) */
                        public void run() 
                        {
                                send_all_scheduled();
                        }
                }

                public void send_all_scheduled()
                {
                        if (TIMER != null) {
                                TIMER.cancel();
                        }

                        String[] item = new String[2];

                        if (ENABLED == true) {
                                while ((item = QUEUE.poll()) != null) {
                                        send(item[0], item[1]);
                                }
                        } else {
                                /* 
                                 * Do nothing; the data is still in the queue 
                                 * and will be sent after we are enabled again.
                                 */
                        }
                }

                public void schedule(String url, String str) 
                {
                        /* An array of length 2 containing the two arguments */ 
                        String[] item = { url, str };

                        QUEUE.add(item);

                        if (ENABLED == true) {
                                /* 
                                 * >= because we might have been disabled and 
                                 * accumulated who knows how many without sending.
                                 */
                                if (QUEUE.size() >= WAIT_ITEMS) {
                                        send_all_scheduled();
                                } else {
                                        if (TIMER != null) {
                                                TIMER.cancel();
                                        }
                                        TIMER = new Timer();
                                        /* See above for definition of Task() */
                                        TIMER.schedule(new Task(), WAIT_MS);
                                }
                        }
                }

                public void send(String url, String str)
                {
                        if (ENABLED == true) {
                                try {
                                        Integration.http_post(url, str);
                                } catch (Exception e) {
                                        /* dunno */
                                }
                                send_all_scheduled();
                        } else {
                                schedule(url, str);
                                /* 
                                 * Option 1: schedule(url, str);
                                 * Option 2: return; the data is silently lost 
                                 */
                        }
                }

                public void enable_sending()
                {
                        ENABLED = true;
                        send_all_scheduled();
                }

                public void disable_sending()
                {
                        ENABLED = false;
                }
        }

        /**********************************************************************
         *********************************************************************/
        class AssociationController 
        {
                /**
                 * Data used to build pageview IDs
                 */
                String               P_TOKEN = null;
                Integer              P_CLOCK = 1;
                Map<String, Integer> P_TABLE = null;

                /**
                 * Data used to build session IDs
                 */
                String               S_TOKEN = null;
                Integer              S_CLOCK = 1;
                Map<String, Integer> S_TABLE = null;

                /* Called by whatever process detects session expiry */
                public void begin_new_session()
                {
                        /* S_TOKEN diagnoses session reset */
                        S_TOKEN = null;
                        Integration.del_store("s_token"); // TODO: Write fn

                        /* P_TOKEN diagnoses pageview reset */
                        P_TOKEN = null;
                }

                public void begin_new_activity(String stream_name)
                {
                        if (P_TABLE != null && P_TABLE.containsKey(n)) {
                                P_TABLE.remove(n);
                                /* If it was in P_TABLE, it's not in S_TABLE */
                                return;
                        }

                        /* Make sure we have loaded from persistence */ 
                        sessionID();

                        if (S_TABLE.containsKey(n)) {
                                S_TABLE.remove(n);
                                Integration.set_store("s_table", S_TABLE);
                        }
                }

                public String sessionID()
                {
                        /* A fresh execution will have SESSION set to null */
                        if (S_TOKEN == null) {
                                /* Try load SESSION from persistent store */ 
                                S_TOKEN = Integration.get_store("s_token");
                                S_TABLE = Integration.get_store("s_table");
                                S_CLOCK = Integration.get_store("s_clock");

                                /* If this fails... */ 
                                if (S_TOKEN == null) { 
                                        /* Generate a new session */
                                        S_TOKEN = Integration.new_id();
                                        S_TABLE = new HashMap<String, Integer>();
                                        S_CLOCK = 1;
                                        Integration.set_store("s_token", S_TOKEN);
                                        Integration.set_store("s_table", S_TABLE);
                                        Integration.set_store("s_clock", S_CLOCK);
                                }
                        }
                        return S_TOKEN;
                }

                public String pageviewID()
                {
                        if (P_TOKEN == null) {
                                P_TOKEN = Integration.new_id();
                                P_TABLE = new HashMap<String, Integer>();
                                P_CLOCK = 1;
                        }
                        return P_TOKEN;
                }

                public String activityID(String n, String scope_name)
                {
                        if (scope.equals("session")) {
                                tok = sessionID();
                                if (!S_TABLE.containsKey(n)) {
                                        S_TABLE.put(n, S_CLOCK);
                                        S_CLOCK = S_CLOCK + 1;
                                        Integration.set_store("s_table", S_TABLE);
                                        Integration.set_store("s_clock", S_CLOCK);
                                }
                                inc = S_TABLE.get(n);
                        } else {
                                tok = pageviewID();
                                if (!P_TABLE.containsKey(n)) {
                                        P_TABLE.put(n, P_CLOCK);
                                        P_CLOCK = P_CLOCK + 1;
                                }
                                inc = P_TABLE.get(n);
                        }

                        return String.format("%s%04x", tok, inc);
                }
        }

        /**********************************************************************
         *********************************************************************/
        class SamplingController
        {
                static boolean in_sample(String token, Object sampling_config)
                {
                        return true;
                }
        }

        /**********************************************************************
         *********************************************************************/

        Map<String, Object>            CONFIG           = new HashMap<String, Object>();
        Map<String, List<String>>      C           = new HashMap<String, List<String>>();
        LinkedList<Object[]> InputBuffer = new LinkedList<Object[]>();

        private void EPC(void)
        {
        }

        public void log(String stream_name, Object... arg) throws RuntimeException 
        {
                /*
                 * Multiple dispatch 
                 */
                for (String x : COPIES.get(stream_name)) {
                        log(x, /*arguments*/);
                }

                if (!CONFIG.containsKey(stream_name)) {
                        /*
                         * Events for (as-yet) unconfigured streams are
                         * placed on the InputBuffer
                         */
                        InputBuffer.add(new Object[]{ stream_name, arg });
                        return;
                }

                if (CONFIG.get(stream_name).get("is_available") === false) {
                        /*
                         * The stream is configured as unavailable,
                         * and will not receive events.
                         */
                        return;
                }

                /*
                 * (1) AssociationController
                 */

                if (!CONFIG.get(stream_name).get("scope").equals("session")) {
                        CONFIG.get(stream_name).put("scope", "pageview");
                        String sampleID = AssociationController.pageviewID();
                } else {
                        String sampleID = AssociationController.sessionID();
                }

                /*
                 * (2) SamplingController 
                 */

                if (SamplingController.in_sample(sampleID, CONFIG.get(stream_name).get("sampling"))) {

                        /*
                         * (3) Other processing and instrumentation
                         */

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

                        data.put("session", AssociationController.sessionID());
                        data.put("pageview", AssociationController.pageviewID());
                        data.put("activity", AssociationController.activityID(stream_name, CONFIG.get(stream_name).get("scope")));

                        meta.put("id", Integration.get_UUID_v4());
                        meta.put("dt", Integration.get_iso_8601_timestamp());
                        meta.put("domain", Integration.get_wiki_domain());
                        meta.put("uri", Integration.get_wiki_uri());
                        meta.put("stream", stream_name);

                        data.put("meta", meta);

                        /* TODO InstrumentationModule.process(n, d) */

                        OutputBuffer.schedule(CONFIG.get(stream_name).get("url"), data.toString());
                }

        }

        public void configure(String json_string_config)
        {
                JSONObject json = new JSONObject(json_string_config);

                /* FIXME: Clobbers; this isn't what we want */
                CONFIG.putAll(Integration.jsonToMap(json));

                COPIES.clear();

                for (String x : CONFIG.keySet()) {
                        COPIES.put(x, new List<String>());
                        for (String y : CONFIG.keySet()) {
                                if (y.startsWith(x+".")) {
                                        COPIES.get(x).add(y);
                                }
                        }
                }
                /* TODO: Try inputbuffer flush here */
	}
}

/*
 * Event Platform Client (EPC)
 *
 * DESCRIPTION
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
import java.util.Map;
import java.util.HashMap;
import java.util.Random;

/******************************************************************************
 * TOKEN Handles the storage and book-keeping that controls the various
 * pageview, session, and activity tokens.
 ******************************************************************************/
public class Token {
        /* Cache the ID values */
        String PAGEVIEW_ID = null;
        String SESSION_ID = null;

        /* The global clock ticks */
        Integer PAGEVIEW_CL = 1;
        Integer SESSION_CL = 1;

        /* Hash tables store sequence numbers for various scoped streams */
        Map<String, Integer> PAGEVIEW_SQ = null;
        Map<String, Integer> SESSION_SQ = null;

        /* Used to generate random numbers in new_id() */
        Random prng = null;

        private String new_id() {
                if (prng == null) {
                        prng = new Random();
                }

                return String.format("%04x%04x%04x%04x%04x%04x%04x%04x", prng.nextInt(65535), prng.nextInt(65535),
                                prng.nextInt(65535), prng.nextInt(65535), prng.nextInt(65535), prng.nextInt(65535),
                                prng.nextInt(65535), prng.nextInt(65535));
        }

        private boolean session_timeout() {
                return false;
        }

        private void pageview_check() {
                if (PAGEVIEW_ID == null) {
                        PAGEVIEW_ID = new_id();
                        PAGEVIEW_SQ = new HashMap<String, Integer>();
                        PAGEVIEW_CL = 1;
                }
        }

        private void session_check() {
                /* A fresh execution will have SESSION set to null */
                if (SESSION_ID == null) {
                        /* Attempt to load SESSION from persistent store */
                        SESSION_ID = Integration.get_store("epc-session-id");
                        SESSION_SQ = Integration.get_store("epc-session-sq");
                        SESSION_CL = Integration.get_store("epc-session-cl");

                        /* If this fails, or the data is malformed... */
                        if (SESSION_ID == null || SESSION_SQ == null) {
                                SESSION_ID = new_id();
                                SESSION_SQ = new HashMap<String, Integer>();
                                SESSION_CL = 1;
                                Integration.set_store("epc-session-id", SESSION_ID);
                                Integration.set_store("epc-session-sq", SESSION_SQ);
                                Integration.set_store("epc-session-cl", SESSION_CL);
                        }
                }
                /* If the session is over, based on our criteria ... */
                if (session_timeout()) {
                        /* ... then regenerate ... */
                        SESSION_ID = new_id();
                        SESSION_SQ = new HashMap<String, Integer>();
                        SESSION_CL = 1;
                        Integration.set_store("epc-session-id", SESSION_ID);
                        Integration.set_store("epc-session-sq", SESSION_SQ);
                        Integration.set_store("epc-session-cl", SESSION_CL);

                        /* ... and trigger a pageview regeneration as well */
                        PAGEVIEW_ID = new_id();
                        PAGEVIEW_SQ = new HashMap<String, Integer>();
                        PAGEVIEW_CL = 1;
                }
        }

        public String session() {
                session_check();
                return SESSION_ID;
        }

        public String pageview() {
                pageview_check();
                return PAGEVIEW_ID;
        }

        public String activity(String name, String scopename) {
                String id;
                Integer sn;

                if (scopename.equals("session")) {
                        id = session();
                        if (!SESSION_SQ.containsKey(name)) {
                                SESSION_SQ.put(name, SESSION_CL);
                                SESSION_CL = SESSION_CL + 1;
                                Integration.set_store("epc-session-sq", SESSION_SQ);
                                Integration.set_store("epc-session-cl", SESSION_CL);
                        }
                        sn = SESSION_SQ.get(name);
                        return String.format("%s%04x", id, sn);
                }
                if (scopename.equals("pageview")) {
                        id = pageview();
                        if (!PAGEVIEW_SQ.containsKey(name)) {
                                PAGEVIEW_SQ.put(name, PAGEVIEW_CL);
                                PAGEVIEW_CL = PAGEVIEW_CL + 1;
                        }
                        sn = PAGEVIEW_SQ.get(name);
                        return String.format("%s%04x", id, sn);
                }
                return null;
        }

        public void activity_reset(String name) {
                pageview_check();
                if (PAGEVIEW_SQ.containsKey(name)) {
                        PAGEVIEW_SQ.remove(name);
                        /*
                         * Only one scope per event, so if it was a pageview event, we don't need to
                         * check the session data
                         */
                        return;
                }

                session_check();
                if (SESSION_SQ.containsKey(name)) {
                        SESSION_SQ.remove(name);
                        Integration.set_store("epc-session-sq", SESSION_SQ);
                }
        }
}

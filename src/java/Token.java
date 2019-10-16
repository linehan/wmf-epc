/*
 * Event Platform Client (EPC) 
 *
 * DESCRIPTION 
 *     Designed for use with Wikipedia Android application producing events to 
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
import java.util.Map;
import java.util.HashMap;
import java.util.Random;

/******************************************************************************
 * TOKEN 
 * Handles the storage and book-keeping that controls the various
 * pageview, session, and activity tokens.
 *
 * ID format:
 *
 *      aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbb
 *      |------------------------------||--|
 *              pageview or session     stream
 *                      id              increment
 *
 * 1. On new pageview:
 *      a. A random pageview identifier is generated 
 *      c. The pageview increment table is deleted.
 *      b. The pageview increment clock is set to 1.
 *
 * 2. On new session:
 *      a. A random session identifier is generated.
 *      b. The session increment table is deleted.
 *      c. The session increment clock is set to 1.
 *      d. The new pageview event is applied.
 ******************************************************************************/
public class Token
{
        /**
         * Data used to build pageview IDs
         */
        String               PAGEVIEW_TOKEN = null;
        Integer              PAGEVIEW_CLOCK = 1;
        Map<String, Integer> PAGEVIEW_TABLE = null;

        /**
         * Data used to build session IDs
         */
        String               SESSION_TOKEN = null;
        Integer              SESSION_CLOCK = 1;
        Map<String, Integer> SESSION_TABLE = null;

        /**
         * Used to generate random numbers in new_id() 
         */
        Random prng = null;

        /**
         * TODO: Move to 'Integration'?
         */
        private String new_id()
        {
                if (prng == null) {
                        prng = new Random();
                }
                 
                return String.format("%04x%04x%04x%04x%04x%04x%04x%04x",
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535)
                );
        }

        /**
         * TODO: Move to 'Integration'?
         */
        private boolean session_timeout()
        {
                /* TODO: For detecting session timeout */
                return false;
        }

        /**
         * (Re)-generate state if a new pageview has started.
         */
        private void pageview_check()
        {
                if (PAGEVIEW_TOKEN == null) {
                        PAGEVIEW_TOKEN = new_id();
                        PAGEVIEW_TABLE = new HashMap<String, Integer>();
                        PAGEVIEW_CLOCK = 1;
                }
        }

        /**
         * (Re)-generate state if a new session has started.
         */
        private void session_check()
        {
                /* A fresh execution will have SESSION set to null */
                if (SESSION_TOKEN == null) {
                        /* Attempt to load SESSION from persistent store */ 
                        SESSION_TOKEN = Integration.get_store("session-token");
                        SESSION_TABLE = Integration.get_store("session-table");
                        SESSION_CLOCK = Integration.get_store("session-clock");

                        /* If this fails, or the data is malformed... */ 
                        if (SESSION_TOKEN == null || SESSION_TABLE == null) { 
                                SESSION_TOKEN = new_id();
                                SESSION_TABLE = new HashMap<String, Integer>();
                                SESSION_CLOCK = 1;
                                Integration.set_store("session-token", SESSION_TOKEN);
                                Integration.set_store("session-table", SESSION_TABLE);
                                Integration.set_store("session-clock", SESSION_CLOCK);
                        }
                }
                /* If the session is over, based on our criteria ... */
                if (session_timeout()) {
                        /* ... then regenerate ... */
                        SESSION_TOKEN = new_id();
                        SESSION_TABLE = new HashMap<String, Integer>();
                        SESSION_CLOCK = 1;
                        Integration.set_store("session-token", SESSION_TOKEN);
                        Integration.set_store("session-table", SESSION_TABLE);
                        Integration.set_store("session-clock", SESSION_CLOCK);

                        /* ... and trigger a pageview regeneration as well */
                        PAGEVIEW_TOKEN = new_id();
                        PAGEVIEW_TABLE = new HashMap<String, Integer>();
                        PAGEVIEW_CLOCK = 1;
                }
        }

        /**
         * Fetch the session ID 
         * @return: ID string of hex characters
         */
        public String session()
        {
                session_check();
                return SESSION_TOKEN;
        }

        /**
         * Fetch the pageview ID 
         * @return: ID string of hex characters
         */
        public String pageview()
        {
                pageview_check();
                return PAGEVIEW_TOKEN;
        }

        /**
         * Format an activity ID for the given stream and scope.
         *
         * @stream_name: Used to look up the stream's increment.
         * @scope_name : Used to choose which table to look in. 
         * @return     : ID string of hex characters.
         *
         * NOTE
         * This function should not require @scope_name, since a 
         * @stream_name key will appear in only one of the tables.
         * Meaning you could check them all and return the first
         * one you find. 
         *
         * The problem is that these IDs are created lazily, so
         * in the case where you find no increment in any of the
         * tables, you need to create an increment, but it is not
         * clear what table it should go in. The caller must 
         * provide this information every time.
         *
         * That sucks. Can we re-design this so it doesn't need
         * to happen?
         */
        public String activity(String stream_name, String scope_name)
        {
                String token;
                Integer increment;

                if (scope_name.equals("session")) {
                        token = session();
                        if (!SESSION_TABLE.containsKey(stream_name)) {
                                SESSION_TABLE.put(stream_name, SESSION_CLOCK);
                                SESSION_CLOCK = SESSION_CLOCK + 1;
                                Integration.set_store("session-table", SESSION_TABLE);
                                Integration.set_store("session-clock", SESSION_CLOCK);
                        }
                        increment = SESSION_TABLE.get(stream_name);
                        return String.format("%s%04x", token, increment);
                }
                if (scope_name.equals("pageview")) {
                        token = pageview();
                        if (!PAGEVIEW_TABLE.containsKey(stream_name)) {
                                PAGEVIEW_TABLE.put(stream_name, PAGEVIEW_CLOCK);
                                PAGEVIEW_CLOCK = PAGEVIEW_CLOCK + 1;
                        }
                        increment = PAGEVIEW_TABLE.get(stream_name);
                        return String.format("%s%04x", token, increment);
                }
                return null;
        }

        /**
         * Remove the given stream from the activity table
         *
         * @stream_name: Used to look up the stream's increment.
         * @return     : nothing
         *
         * NOTE
         * We don't need to provide @scope_name, because we are 
         * only deleting, not inserting. The insert will be handled
         * by a future call to activity().
         */
        public void activity_complete(String stream_name)
        {
                pageview_check();
                if (PAGEVIEW_TABLE.containsKey(stream_name)) {
                        PAGEVIEW_TABLE.remove(stream_name);
                        /* Only one scope per event, so if it was a pageview
                         * event, we don't need to check the session data */
                        return;
                }

                session_check();
                if (SESSION_TABLE.containsKey(stream_name)) {
                        SESSION_TABLE.remove(stream_name);
                        Integration.set_store("session-table", SESSION_TABLE);
                }
        }
}

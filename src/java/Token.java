/*
 * Event Platform Client (EPC) 
 *
 * DESCRIPTION 
 *     Collects events in an input buffer, adds some metadata, places them 
 *     in an ouput buffer where they are periodically bursted to a remote 
 *     endpoint via HTTP POST.
 *
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
 ******************************************************************************/
public class Token
{
        Map<String, String> PAGEVIEW = null;
        Map<String, String> SESSION = null;

        Random prng = null;

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

        private boolean session_timeout()
        {
                return false;
        }

        private Map<String, String> new_table()
        {
                Map<String, String> table = new HashMap<String, String>();
                table.put(":id", new_id());
                table.put(":sg", "1");
                return table;
        }

        private void pageview_check()
        {
                if (PAGEVIEW == null) {
                        PAGEVIEW = new_table(); 
                }
        }

        private void session_check()
        {
                /* A fresh execution will have SESSION set to null */
                if (SESSION == null) {
                        /* Attempt to load SESSION from persistent store */
                        //SESSION = Integration.get_store("epc-session");

                        /* If this fails, or the data is malformed */
                        if (null == SESSION || !SESSION.containsKey(":id") || !SESSION.containsKey(":sg")) { 
                                /* Then regenerate */
                                SESSION = new_table();
                                //Integration.set_store("epc-session", SESSION);
                        }
                }
                /* If the session is over, based on our criteria */
                if (session_timeout()) {
                        /* Then regenerate */
                        SESSION = new_table();              
                        //Integration.set_store("epc-session", SESSION);

                        /* And trigger a pageview regeneration as well */
                        PAGEVIEW = new_table();
                }
        }

        public String session()
        {
                session_check();
                return SESSION.get(":id");
        }

        public String pageview()
        {
                pageview_check();
                return PAGEVIEW.get(":id");
        }

        public String activity(String name, String scopename)
        {
                String id;
                int sn;

                if (scopename.equals("session")) {
                        id = session();
                        if (!SESSION.containsKey(name)) {
                                int sg = Integer.parseInt(SESSION.get(":sg"));
                                SESSION.put(":sg", Integer.toString(sg+1));
                                SESSION.put(name, Integer.toString(sg));
                                //Integration.set_store("epc-session", SESSION);
                        }
                        sn = Integer.parseInt(SESSION.get(name));
                        return String.format("%s%04x", id, sn);
                }
                if (scopename.equals("pageview")) {
                        id = pageview();
                        if (!PAGEVIEW.containsKey(name)) {
                                int sg = Integer.parseInt(PAGEVIEW.get(":sg"));
                                PAGEVIEW.put(":sg", Integer.toString(sg+1));
                                PAGEVIEW.put(name, Integer.toString(sg));
                        }
                        sn = Integer.parseInt(PAGEVIEW.get(name));
                        return String.format("%s%04x", id, sn);
                }
                return null;
        }

        public void activity_reset(String name)
        {
                pageview_check();
                if (PAGEVIEW.containsKey(name)) {
                        PAGEVIEW.remove(name);
                        /* Only one scope per event, so if it was a pageview
                         * event, we don't need to check the session data */
                        return;
                }

                session_check();
                if (SESSION.containsKey(name)) {
                        SESSION.remove(name);
                        //Integration.set_store("epc-session", SESSION);
                }
        }

        //public static void main(String []args)
        //{
                //Token tok = new Token();

                //System.out.printf("session:%s\n", tok.session());
                //System.out.printf("pageview:%s\n", tok.pageview());
                //System.out.printf("session activity foo:%s\n", tok.activity("foo", "session"));
                //System.out.printf("session activity bar:%s\n", tok.activity("bar", "session"));
                //System.out.printf("pageview activity baz:%s\n", tok.activity("baz", "pageview"));
                //System.out.printf("pageview activity qux:%s\n", tok.activity("qux", "pageview"));
                //System.out.printf("unknown activity baz:%s\n", tok.activity("baz", "unknown"));
        //}
}

/*
 * Event Platform Client (EPC) 
 *
 * DESCRIPTION 
 *     Designed for use with Wikipedia Android application producing events to 
 *     the EventGate intake service of the WMF Modern Event Platform.
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
import java.util.LinkedList;
import java.util.Timer;
import java.util.TimerTask;

/******************************************************************************
 * Output - Buffer outgoing HTTP requests 
 ******************************************************************************/
public class Output
{ 
        /**
         * Number of items allowed to accumulate before timer won't interrupt.
         * (User-configurable)
         */
        private static int WAIT_ITEMS = 10;

        /**
         * Number of milliseconds to wait for new items.
         * (User-configurable)
         */
        private static int WAIT_MS    = 2000;

        /**
         * If FALSE, the buffer can never be emptied.
         * (Controlled internally) 
         */
        private boolean ENABLED = true;

        /**
         * The queue structure holds items as [url, body] pairs 
         */
        private LinkedList<String[]> queue = new LinkedList();

        /**
         * Controls the HTTP request bursting 
         */
        private Timer timer;

        /**
         * Task the timer runs; must implement Java TimerTask abstract class 
         */
        private class Task extends TimerTask
        {
                /* Called when the timer fires (see Java TimerTask docs) */
                public void run() 
                {
                        send_all_scheduled();
                }
        }

        /**
         * Enable sending of events. 
         * Anything currently in the queue will be sent immediately.
         */
        public void enable_sending()
        {
                ENABLED = true;
                send_all_scheduled();
        }

        /**
         * Disable sending of events.
         * If the timer is currently active, it is cancelled. 
         */
        public void disable_sending()
        {
                ENABLED = false;
                unschedule();
        }

        /**
         * Cancel the timer. 
         */
        private void unschedule()
        {
                if (timer != null) {
                        timer.cancel();
                }
        }

        /**
         * Send all of the requests in the queue. 
         */
        private void send_all_scheduled()
        {
                unschedule();

                String[] item = new String[2];

                if (ENABLED == true) {
                        while ((item = queue.poll()) != null) {
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
         * Schedule an item to be sent 
         *
         * @url   : The target of the HTTP request 
         * @str   : The data to send as the POST body
         * @return: nothing
         *
         * NOTE
         * If sending is not enabled, the scheduler will simply add the
         * item to the queue and return.
         */
        public void schedule(String url, String str) 
        {
                /* An array of length 2 containing the two arguments */ 
                String[] item = { url, str };

                queue.add(item);

                if (ENABLED == true) {
                        /* 
                         * >= because we might have been disabled and 
                         * accumulated who knows how many without sending.
                         */
                        if (queue.size() >= WAIT_ITEMS) {
                                send_all_scheduled();
                        } else {
                                unschedule();
                                timer = new Timer();
                                /* See above for definition of Task() */
                                timer.schedule(new Task(), WAIT_MS);
                        }
                }
        }

        /**
         * Initiate an asynchronous HTTP POST request.
         *
         * @url   : The target of the HTTP request 
         * @str   : The data to send as the POST body
         * @return: nothing
         */
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
}

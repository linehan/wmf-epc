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
import java.util.LinkedList;
import java.util.Timer;
import java.util.TimerTask;

/******************************************************************************
 * Output - Buffer outgoing HTTP requests
 ******************************************************************************/
public class Output {
        /* CONFIGURABLE PARAMETERS */
        /* FOR MORE INFO, SEE OUTPUT BUFFERING SPEC */
        private static int WAIT_ITEMS = 10;
        private static int WAIT_MS = 2000;

        private boolean ENABLED = true;

        /* Queue to hold the [url, body] pairs that will be sent */
        private LinkedList<String[]> queue = new LinkedList();

        /* Timer that controls the dispatch */
        private Timer timer;

        /*
         * TimerTask is an abstract class that we need to extend with a new class having
         * a run() method that will fire when the timer is triggered.
         */
        private class Task extends TimerTask {
                public void run() {
                        send_all_scheduled();
                }
        }

        /**
         * Enable sending of events. Anything currently in the queue will be sent
         * immediately.
         */
        public void enable_sending() {
                ENABLED = true;
                send_all_scheduled();
        }

        /**
         * Disable sending of events. If the timer is currently active, it is cancelled.
         */
        public void disable_sending() {
                ENABLED = false;
                unschedule();
        }

        /**
         * Cancel the timer.
         */
        private void unschedule() {
                if (timer != null) {
                        timer.cancel();
                }
        }

        /**
         * Send all of the requests in the queue.
         */
        private void send_all_scheduled() {
                unschedule();

                String[] item = new String[2];

                if (ENABLED == true) {
                        while ((item = queue.poll()) != null) {
                                send(item[0], item[1]);
                        }
                } else {
                        /*
                         * Do nothing; the data is still in the queue and will be sent after we are
                         * enabled again.
                         */
                }
        }

        /**
         * Schedule an item to be sent
         *
         * @url : The target of the HTTP request
         * @str : The data to send as the POST body
         * @return: nothing
         *
         *          NOTE If sending is not enabled, the scheduler will simply add the
         *          item to the queue and return.
         */
        public void schedule(String url, String str) {
                /* An array of length 2 containing the two arguments */
                String[] item = { url, str };

                queue.add(item);

                if (ENABLED == true) {
                        /*
                         * >= because we might have been disabled and accumulated who knows how many
                         * without sending.
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
         * @url : The target of the HTTP request
         * @str : The data to send as the POST body
         * @return: nothing
         */
        public void send(String url, String str) {
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
                         * Option 1: schedule(url, str); Option 2: return; the data is silently lost
                         */
                }
        }
}

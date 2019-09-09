import java.util.Queue;
import java.util.LinkedList;

import java.util.Timer;
import java.util.TimerTask;

class Output
{ 
        int WAIT_ITEMS = 2;
        int WAIT_MS = 2000;
        boolean ENABLED = true;

        Queue<Output_data> QUEUE = new LinkedList();

        Timer timer;

        class Task extends TimerTask
        {
                public void run() 
                {
                        send_all_scheduled();
                }
        }

        class Output_data 
        {
                public String url; 
                public String data;
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

        private void unschedule()
        {
                if (timer != null) {
                        timer.cancel();
                }
        }

        private void send_all_scheduled()
        {
                unschedule();

                if (ENABLED == true) {
                        Output_data item;
                       
                        while ((item = QUEUE.poll()) != null) {
                                send(item.url, item.data);
                        }
                } else {
                        /* 
                         * Do nothing; the data is still in the buffer
                         * and will be sent after we are enabled again.
                         */
                }
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
         */
        public void schedule(String url, String str) 
        {
                Output_data out = new Output_data();
                out.url = url;
                out.data = str;
                QUEUE.add(out);

                if (ENABLED == true) {
                        /* 
                         * >= because we might have been disabled and 
                         * accumulated who knows how many without sending.
                         */
                        if (QUEUE.size() >= WAIT_ITEMS) {
                                send_all_scheduled();
                        } else {
                                unschedule();
                                timer = new Timer();
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
                        System.out.printf("%s %s\n", url, str);
                        send_all_scheduled();
                } else {
                        schedule(url, str);
                        /* 
                         * Option 1: schedule(url, str);
                         * Option 2: return; the data is silently lost 
                         */
                }
        }

        public static void main(String []args)
        {
                Output out = new Output();

                out.schedule("foo.com", "{ bar:3, baz:4 }");
                out.schedule("foo.org", "{ bar:3, baz:4 }");
                out.schedule("foo.net", "{ bar:3, baz:4 }");
                out.send("foo.com", "{ bar:8, baz:8 }");
        }
}

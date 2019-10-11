/*
 * Event Platform Client (EPC)
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

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/******************************************************************************
 * Collect functions that will be replaced or mapped to other platform-specific
 * functions.
 ******************************************************************************/
class Integration {
        public static String get_stream_config() {
                return "{edit: {stream: \"edit\",scope: \"session\",sample: 0.06,active: true,url: \"/log\", schema_url:'foo.foo' }}";
        }

        public static String get_wiki_uri() {
                return "en";
        }

        public static String get_wiki_domain() {
                return "wikipedia.org";
        }

        public static String get_UUID_v4() {
                return "ffffffff-ffff-ffff-ffff-ffffffffffff";
        }

        public static String get_iso_8601_timestamp() {
                return "1997";
        }

        // HTTP POST request
        public static void http_post(String url, String body) throws Exception {
                URL obj = new URL(url);
                HttpURLConnection con = (HttpURLConnection) obj.openConnection();

                // add reuqest header
                con.setRequestMethod("POST");
                // con.setRequestProperty("User-Agent", USER_AGENT);
                con.setRequestProperty("Accept-Language", "en-US,en;q=0.5");

                // Send post request
                con.setDoOutput(true);
                DataOutputStream wr = new DataOutputStream(con.getOutputStream());
                wr.writeBytes(body);
                wr.flush();
                wr.close();

                int responseCode = con.getResponseCode();
                System.out.println("\nSending 'POST' request to URL : " + url);
                System.out.println("Post body: " + body);
                System.out.println("Response Code : " + responseCode);

                BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));
                String inputLine;
                StringBuffer response = new StringBuffer();

                while ((inputLine = in.readLine()) != null) {
                        response.append(inputLine);
                }
                in.close();

                // print result
                System.out.println(response.toString());
        }

        public static <T> void set_store(String key, T value) {
                /* Do nothing */
                return;
        }

        public static <T> T get_store(String key) {
                /* Do nothing */
                return null;
        }
}

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

/******************************************************************************
 * EPC - Public library interface.
 *
 * This class ties together the library components, each of which is otherwise
 * totally encapsulated.
 ******************************************************************************/
class EPC {
        /**
         * Remote endpoint to fetch the stream configuration from.
         */
        // static String STREAM_CONFIG_URL="https://pai-test.wmflabs.org/streams";
        static String STREAM_CONFIG_URL = "http://olm.ec/streamconfig.json";

        /**
         * Will be instantiated using the stream configuration.
         */
        Stream stream = null;

        /**
         * Will hold and manage all the token and identifier caches
         */
        Token token = new Token();

        /**
         * Will buffer and schedule the transmission of events over HTTP
         */
        Output output = new Output();

        /**
         * Store events until the library is finished initializing.
         *
         * The EPC library makes an HTTP request to a remote stream configuration
         * service for information about how to evaluate incoming event data. Until this
         * initialization is complete, we store any incoming events in this buffer.
         */
        LinkedList<JSONObject> input_buffer = new LinkedList<JSONObject>();

        /**
         * Log an event to the input buffer.
         *
         * @name : Name of the event stream to send the event to.
         * @datum : Argument list of alternating string keys and typed values
         * @throws: RuntimeException
         * @return: Nothing
         *
         *          USAGE The reason for the seemingly strange argument list pattern is
         *          to provide convenience when specifying values of different types
         *          that will end up in a JSONObject:
         *
         *          EPC.event("edit", "username", "Dan", "is_happy", true, "edit_len",
         *          13 );
         */
        public void event(String name, Object... datum) throws RuntimeException {
                JSONObject meta;
                JSONObject data;
                int i;

                if (stream != null) {
                        if (!stream.is_enabled(name)) {
                                return;
                        }
                        if (!stream.is_sampled(name)) {
                                return;
                        }
                }

                meta = new JSONObject();
                data = new JSONObject();

                meta.put("id", Integration.get_UUID_v4());
                meta.put("dt", Integration.get_iso_8601_timestamp());
                meta.put("domain", Integration.get_wiki_domain());
                meta.put("uri", Integration.get_wiki_uri());
                meta.put("stream", name);

                data.put("meta", meta);
                data.put("session_id", token.session());
                data.put("pageview_id", token.pageview());

                /* Add the data fields from the argument list */
                for (i = 0; i < datum.length; i += 2) {
                        try {
                                data.put(datum[i].toString(), datum[i + 1]);
                        } catch (Exception e) {
                                /*
                                 * The type of datum[i + 1] was probably not mappable to a JSON-supported type.
                                 */
                                throw new RuntimeException(e);
                        }
                }

                if (stream != null) {
                        data.put("activity_id", token.activity(name, stream.scope(name)));
                        output.schedule(stream.url(name), data.toString());
                } else {
                        input_buffer.add(data);
                }
        }

        /**
         * Fetch stream configuration and use it to instantiate Stream.
         */
        public void init() {
                JSONObject conf;
                JSONObject ev;
                String json;
                URL url;
                String charset;

                try {
                        url = new URL(STREAM_CONFIG_URL);
                } catch (Exception e) {
                        throw new RuntimeException(e);
                }

                charset = StandardCharsets.UTF_8.toString();

                /*
                 * TODO: This code is bad and will be taken out and replaced with a common HTTP
                 * GET requester.
                 */
                try (Scanner scanner = new Scanner(url.openStream(), charset)) {
                        /*
                         * Regex '\\A' matches beginning of input. This tells Scanner to tokenize the
                         * entire stream.
                         */
                        scanner.useDelimiter("\\A");
                        json = scanner.hasNext() ? scanner.next() : "";
                } catch (Exception e) {
                        throw new RuntimeException(e);
                }

                System.out.println(json);

                try {
                        conf = new JSONObject(json);

                        stream = new Stream(conf);

                        /* Pass all the events on the input buffer */
                        while ((ev = input_buffer.pollFirst()) != null) {
                                JSONObject meta = ev.getJSONObject("meta");
                                String name = meta.getString("stream");
                                String scope = stream.scope(name);

                                if (!stream.is_enabled(name)) {
                                        continue;
                                }
                                if (!stream.is_sampled(name)) {
                                        continue;
                                }

                                ev.put("activity_id", token.activity(name, scope));

                                output.schedule(stream.url(name), ev.toString());
                        }
                } catch (Exception e) {
                        throw new RuntimeException(e);
                }
        }
}

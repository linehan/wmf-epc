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
import org.json.JSONObject;
import org.json.JSONArray;

/******************************************************************************
 * Stream - Manages information belonging to the stream configuration.
 *
 * Stores the parsed stream configuration JSON/YAML, but also provides accessors
 * for properties of named streams.
 ******************************************************************************/
public class Stream {
        private JSONObject stream_config = null;

        /**
         * Stream constructor.
         *
         * The Stream object is instantiated using a JSONObject which represents the
         * stream configuration. This object will then provide the library information
         * about the stream configuration.
         */
        public Stream(JSONObject config) {
                stream_config = config;
        }

        /*
         * PROPERTY ACCESSORS
         */

        /**
         * Get the URL to send the stream event to
         *
         * @stream: Name of the stream
         * @return: Destination URL of event
         */
        public String url(String stream) {
                try {
                        JSONObject s = stream_config.getJSONObject(stream);
                        String url = s.getString("url");
                        return url;
                } catch (Exception e) {
                        return "";
                }
        }

        /**
         * Get the scope of the stream
         *
         * @stream: Name of the stream
         * @return: 'session', 'pageview', or 'unknown'.
         */
        public String scope(String stream) {
                try {
                        JSONObject s = stream_config.getJSONObject(stream);
                        String scope = s.getString("scope");
                        return scope;
                } catch (Exception e) {
                        return "unknown";
                }
        }

        /**
         * Get whether the stream is active or not
         *
         * @stream: Name of the stream
         * @return: false if the stream is not active, otherwise true
         */
        public boolean active(String stream) {
                try {
                        JSONObject s = stream_config.getJSONObject(stream);
                        boolean active = s.getBoolean("active");
                        return active;
                } catch (Exception e) {
                        /* If you don't say otherwise, it's active */
                        return true;
                }
        }

        /**
         * Get an array of start states for the stream
         *
         * @stream: Name of the stream
         * @return: JSONArray of string state labels
         */
        public JSONArray start(String name) {
                try {
                        JSONObject s = stream_config.getJSONObject(name);
                        JSONArray start = s.getJSONArray("start");
                        return start;
                } catch (Exception e) {
                        return new JSONArray();
                }
        }

        /*
         * PREDICATES
         */

        public boolean is_enabled(String stream) {
                if (!stream_config.has(stream)) {
                        /* This name has no configuration */
                        return false;
                }
                if (!active(stream)) {
                        /* This stream has been deactivated in its config */
                        return false;
                }

                return true;
        }

        public boolean is_sampled(String stream) {
                return true;
        }
}

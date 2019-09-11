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
import org.json.JSONObject;
import org.json.JSONArray;

/******************************************************************************
 * Stream - Manages information belonging to the stream configuration. 
 *
 * Stores the parsed stream configuration JSON/YAML, but also provides 
 * accessors for properties of named streams. 
 ******************************************************************************/
public class Stream
{
        private JSONObject stream_config = null;

        /**
         * Stream constructor.
         *
         * The Stream object is instantiated using a JSONObject
         * which represents the stream configuration. This object
         * will then provide the library information about the stream
         * configuration. 
         */
        public Stream(JSONObject config)
        {
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
        public String url(String stream)
        {
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
        public String scope(String stream)
        {
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
        public boolean active(String stream)
        {
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
        public JSONArray start(String name)
        {
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


        public boolean is_enabled(String stream) 
        {
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

        public boolean is_sampled(String stream) 
        {
                return true;
        }
}


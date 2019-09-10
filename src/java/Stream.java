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
import org.json.JSONObject;

/******************************************************************************
 * Stream - Manages execution of the EPC library. 
 *
 * This class provides the public interface
 ******************************************************************************/
public class Stream
{
        private JSONObject STREAM;
        //Map<String, String> CASCADE; 

        public Stream(JSONObject stream_config)
        {
                STREAM = stream_config;
                //CASCADE = new HashMap<String, String>();
        }

        public boolean is_enabled(String name) 
        {
                //if (!MOCK_GLOBAL_IS_COLLECTION_ENABLED()) {
                        //return false;
                //}

                if (!STREAM.has(name)) {
                        //[> This name has no configuration <]
                        return false;
                }

                JSONObject stream = STREAM.getJSONObject(name);
                if (stream.has("active") && stream.getBoolean("active") == false) {
                        return false;
                }

                return true;
        }

        public boolean is_sampled(String name) 
        {
                return true;
        }

        public String url(String name)
        {
                if (STREAM.has(name)) {
                        JSONObject s = STREAM.getJSONObject(name);
                        String url;
                        try {
                                url = s.getString("url");
                        } catch (Exception e) {
                                return "";  
                        }
                        return url;
                }
                return "";
        }

        public String stream_start(String name)
        {
                return "";
        }

        public String scope(String name)
        {
                if (STREAM.has(name)) {
                        JSONObject s = STREAM.getJSONObject(name);
                        String scope;
                        try {
                                scope = s.getString("scope");
                        } catch (Exception e) {
                                return "unknown";  
                        }
                        return scope;
                }
                return "unknown"; 
        }


        //public static void main(String []args)
        //{
                //Stream s = new Stream();
                //s.init();

                //s.event("edit", new JSONObject("{msg:'hello, world!'}"), "1997");
        //}
        
        //public void event(String name, JSONObject data, String timestamp)
        //{
                //if (!STREAM.has(name)) {
                        //return;
                //}

                //JSONObject conf = STREAM.getJSONObject(name);
                //String scope = "unknown";
                //if (conf.has("scope")) {
                        //scope = conf.getString("scope");
                //}

                //JSONObject meta = new JSONObject();
                //meta.put("id", "fff");
                //meta.put("dt", timestamp);
                //meta.put("domain", Integration.get_wiki_domain());
                //meta.put("uri", Integration.get_wiki_uri());
                //meta.put("stream", conf.getString("stream"));

                //data.put("meta", meta);

                //data.put("$schema",  conf.getString("schema_url"));
                ////data.put("session",  Token.session());
                ////data.put("pageview", Token.pageview());
                ////data.put("activity", Token.activity(name, scope));

                //System.out.printf("%s\n", data.toString());
                ////Output.schedule(conf.getString("url"), data.toString());
        //}
}


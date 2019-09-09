import org.json.JSONObject
import java.util.Queue

class Stream
{
        JSONObject STREAM;
        Map<String, String> CASCADE; 

        public void init()
        {
                STREAM  = get_stream_config();
                CASCADE = new HashMap<String, String>();
        }

        private boolean is_stream_enabled(String name) 
        {
                if (!MOCK_GLOBAL_IS_COLLECTION_ENABLED()) {
                        return false;
                }

                if ("name not in stream") {
                        return false;
                }

                if ("active" in STREAM[name] && STREAM[name].active === false) { 
                        return false;
                }

                return true;
        }

        private boolean is_event_orphaned(String name)
        {
        }

        private boolean is_stream_sampled(String name) 
        {
                return true;
        }

        public String stream_scope(String name) 
        {
        }

        public String stream_start(String name)
        {
        }

        public function event(String name, JSONObject data, String timestamp)
        {
                JSONObject meta = new JSONObject();
                meta.put("id", Integration.generate_UUID_v4());
                meta.put("dt", timestamp);
                meta.put("domain", MOCK_WIKI_DOMAIN());
                meta.put("uri", MOCK_WIKI_URI());
                meta.put("stream", STREAM[name].stream_name;

                data.put("meta", meta);

                data.put("$schema", STREAM[name].schema_url);
                data.put("session", Token.session());
                data.put("pageview", Token.pageview());
                data.put("activity", Token.activity(name, stream_scope(name)));

                Output.schedule(STREAM[name].url, data.toString());
        }
}

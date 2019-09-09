import org.json.JSONObject;
//import java.util.Queue;

class Stream
{
        JSONObject STREAM;
        //Map<String, String> CASCADE; 

        private String get_stream_config()
        {
                return "{edit: {stream: \"edit\",scope: \"session\",sample: 0.06,active: true,url: \"/log\", schema_url:'foo.foo' }}";
        }

        private String MOCK_WIKI_URI()
        {
                return "en";
        }

        private String MOCK_WIKI_DOMAIN()
        {
                return "wikipedia.org";
        }

        public void init()
        {
                STREAM = new JSONObject(get_stream_config());
                //CASCADE = new HashMap<String, String>();
        }

        private boolean is_stream_enabled(String name) 
        {
                //if (!MOCK_GLOBAL_IS_COLLECTION_ENABLED()) {
                        //return false;
                //}

                if (!STREAM.has(name)) {
                        /* This name has no configuration */
                        return false;
                }

                JSONObject stream = STREAM.getJSONObject(name);
                if (stream.has("active") && stream.getBoolean("active") == false) {
                        return false;
                }

                return true;
        }

        private boolean is_stream_sampled(String name) 
        {
                return true;
        }

        public String stream_start(String name)
        {
                return "";
        }

        public void event(String name, JSONObject data, String timestamp)
        {
                if (!STREAM.has(name)) {
                        return;
                }

                JSONObject conf = STREAM.getJSONObject(name);
                String scope = "unknown";
                if (conf.has("scope")) {
                        scope = conf.getString("scope");
                }

                JSONObject meta = new JSONObject();
                meta.put("id", "fff");
                meta.put("dt", timestamp);
                meta.put("domain", MOCK_WIKI_DOMAIN());
                meta.put("uri", MOCK_WIKI_URI());
                meta.put("stream", conf.getString("stream"));

                data.put("meta", meta);

                data.put("$schema",  conf.getString("schema_url"));
                //data.put("session",  Token.session());
                //data.put("pageview", Token.pageview());
                //data.put("activity", Token.activity(name, scope));

                System.out.printf("%s\n", data.toString());
                //Output.schedule(conf.getString("url"), data.toString());
        }

        public static void main(String []args)
        {
                Stream s = new Stream();
                s.init();

                s.event("edit", new JSONObject("{msg:'hello, world!'}"), "1997");
        }
}

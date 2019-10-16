import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
/* For PRNG */
import java.util.Random;

/******************************************************************************
 * Collect functions that will be replaced or mapped to other 
 * platform-specific functions. 
 ******************************************************************************/
class Integration
{
        private static prng = new Random(); 

        public static String new_id()
        {
                if (prng == null) {
                        prng = new Random();
                }
                 
                return String.format("%04x%04x%04x%04x%04x%04x%04x%04x",
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535),
                        prng.nextInt(65535)
                );
        }

        public static boolean session_timeout()
        {
                /* TODO: For detecting session timeout */
                return false;
        }

        public static String get_stream_config()
        {
                return "{edit: {stream: \"edit\",scope: \"session\",sample: 0.06,active: true,url: \"/log\", schema_url:'foo.foo' }}";
        }

        public static String get_wiki_uri()
        {
                return "en";
        }

        public static String get_wiki_domain()
        {
                return "wikipedia.org";
        }

        public static String get_UUID_v4()
        {
                return "ffffffff-ffff-ffff-ffff-ffffffffffff";
        }

        public static String get_iso_8601_timestamp()
        {
                return "1997";
        }

	// HTTP POST request
        /* NOTE: In actual integrationt this will be handled elsewhere */
	public static String http_post(String url, String body) throws Exception 
	{
		URL obj = new URL(url);
		HttpURLConnection con = (HttpURLConnection)obj.openConnection();

		/* add request header */
		con.setRequestMethod("POST");
		//con.setRequestProperty("User-Agent", USER_AGENT);
		con.setRequestProperty("Accept-Language", "en-US,en;q=0.5");

		/* Send POST request */
		con.setDoOutput(true);
		DataOutputStream wr = new DataOutputStream(con.getOutputStream());
		wr.writeBytes(body);
		wr.flush();
		wr.close();

		int responseCode = con.getResponseCode();
		System.out.println("\nSending 'POST' request to URL : " + url);
		System.out.println("Post body: " + body);
		System.out.println("Response Code : " + responseCode);

		BufferedReader in = new BufferedReader(
		        new InputStreamReader(con.getInputStream()));
		String inputLine;
		StringBuffer response = new StringBuffer();

		while ((inputLine = in.readLine()) != null) {
			response.append(inputLine);
		}
		in.close();
		
		/* print result */
		System.out.println(response.toString());

		return response.toString();
	}

	// HTTP GET request
        /* NOTE: In actual integration this will be handled elsewhere */
        public static String http_get(String url) throws Exception
        {
		URL obj = new URL(url);
		HttpURLConnection con = (HttpURLConnection)obj.openConnection();

		/* optional default is GET */
		con.setRequestMethod("GET");

		/* add request header */
		//con.setRequestProperty("User-Agent", USER_AGENT);

		int responseCode = con.getResponseCode();
		System.out.println("\nSending 'GET' request to URL : " + url);
		System.out.println("Response Code : " + responseCode);

		BufferedReader in = new BufferedReader(
		        new InputStreamReader(con.getInputStream()));
		String inputLine;
		StringBuffer response = new StringBuffer();

		while ((inputLine = in.readLine()) != null) {
			response.append(inputLine);
		}
		in.close();

		/* print result */
		System.out.println(response.toString());

		return response.toString();
	}

        public static <T> void set_store(String key, T value)
        {
                /* Do nothing */
                return;
        }

        public static <T> T get_store(String key)
        {
                /* Do nothing */
                return null;
        }
}

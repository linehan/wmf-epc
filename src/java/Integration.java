import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/******************************************************************************
 * Collect functions that will be replaced or mapped to other 
 * platform-specific functions. 
 ******************************************************************************/
class Integration
{
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
	public static void http_post(String url, String body) throws Exception 
	{
		URL obj = new URL(url);
		HttpURLConnection con = (HttpURLConnection)obj.openConnection();

		//add reuqest header
		con.setRequestMethod("POST");
		//con.setRequestProperty("User-Agent", USER_AGENT);
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

		BufferedReader in = new BufferedReader(
		        new InputStreamReader(con.getInputStream()));
		String inputLine;
		StringBuffer response = new StringBuffer();

		while ((inputLine = in.readLine()) != null) {
			response.append(inputLine);
		}
		in.close();
		
		//print result
		System.out.println(response.toString());
	}
}

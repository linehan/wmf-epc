import org.json.JSONObject;

public class Test 
{
        public static void main(String args[])
        {
                EPC.initialize();

                EPC.event("click", "message", "hello, world!");
                EPC.event("edit", "pagename", "Antipodal Bluegill Gorilla");

                //s.init();
                //s.event("edit", new JSONObject("{msg:'hello, world!'}"), "1997");
        }
}

import org.json.JSONObject;

public class Main
{
        public static void main(String args[])
        {
                EPC epc = new EPC();

                epc.init();

                epc.event("click", "message", "hello, world!");
                epc.event("edit", "pagename", "Antipodal Bluegill Gorilla");

                //s.init();
                //s.event("edit", new JSONObject("{msg:'hello, world!'}"), "1997");
        }
}

public class Main
{
        public static void main(String args[])
        {
                String json = "{test: {destination:\"https://pai-test.wmflabs.org/log\", $schema:\"test\", scope:\"pageview\", sample:{rate:1}}}";
                EPC.configure(json);
                EPC.log("test", "message", "hello!", "lucky-number", 5);
        }
}

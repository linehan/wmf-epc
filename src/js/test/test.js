
window.onload = function() 
{
        EPC.configure({
                "clicker": {
                        url: "http://pai-test.wmflabs.org/log",
                        stream_name: "clicker",
                        $schema: "click_type_schema",
                        sample: {
                                one_out_of_every: 1,
                        },
                },
        });

        document.getElementById("clicker").addEventListener("click", function(e) {
                EPC.log("clicker", {
                        message: "Hello, world!",
                });
        });
}


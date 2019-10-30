var Integration = (function()
{
        /* 
         * Storage CRUD
         */

        function get_store( key ) 
        {
                var data = window.localStorage.getItem(key);
                return ( data ) ? JSON.parse( data ) : {}; 
        }

        function set_store( key, val ) 
        {
                window.localStorage.setItem( key, JSON.stringify( val ) );
        }

        function del_store( key ) 
        {
                window.localStorage.removeItem( key );
        }

        /* 
         * HTTP requests 
         */

        function http_get( url, callback ) 
        {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", url, true);
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                                var json = JSON.parse(xhr.responseText);
                                callback.call(null, json);
                        }
                };
                xhr.send();
        }

        function http_post( url, data ) 
        {
                navigator.sendBeacon( url, data ); 
        }

        /*
         * ID generation
         */

        function new_id() 
        {
                /* Support: IE 11 */
                var crypto = window.crypto || window.msCrypto;

                if ( crypto && crypto.getRandomValues ) {
                        if ( typeof Uint16Array === 'function' ) {
                                /* 
                                 * Fill an array with 5 random values, 
                                 * each of which is 16 bits.
                                 * 
                                 * Note that Uint16Array is array-like, 
                                 * but does not implement Array.
                                 */
                                var rnds = new Uint16Array( 5 );
                                crypto.getRandomValues( rnds );
                        }
                } else {
                        var rnds = new Array( 5 );
                        /* 
                         * 0x10000 is 2^16 so the operation below will return 
                         * a number between 2^16 and zero
                         */
                        for ( var i = 0; i < 5; i++ ) {
                                rnds[ i ] = Math.floor( Math.random() * 0x10000 );
                        }
                }

                return  ( rnds[ 0 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                        ( rnds[ 1 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                        ( rnds[ 2 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                        ( rnds[ 3 ] + 0x10000 ).toString( 16 ).slice( 1 ) +
                        ( rnds[ 4 ] + 0x10000 ).toString( 16 ).slice( 1 );
        }

        function generate_uuid_v4() 
        {
                return "ffffffff-ffff-ffff-ffff-ffffffffffff";
        }


        /*
         * Output buffer 
         */

        function output_buffer_bind_events() 
        {
                window.addEventListener('pagehide', function() {
                        OutputBuffer.send_all_scheduled();
                });

                document.addEventListener('visibilitychange', function() {
                        if (document.hidden) {
                                OutputBuffer.send_all_scheduled();
                        }
                });

                window.addEventListener('offline', function() { 
                        OutputBuffer.disable_sending();
                });
                
                window.addEventListener('online', function() { 
                        OutputBuffer.enable_sending();
                });
        }

        /*
         * Session and pageview timeout 
         */

        function is_fresh_session() 
        {
                return false;
        }

        function is_fresh_pageview() 
        {
                return false;
        }

        /*
         * Input buffer 
         */

        function input_buffer_enqueue(x) 
        {
                /* TODO */
        }

        function input_buffer_dequeue()
        {
                /* TODO */
        }

        /*
         * Other 
         */

        function get_iso_8601_timestamp()
        {
                var now = new Date();
                return now.toISOString();
        }

        function client_cannot_be_tracked()
        {
                return false; 
        }

        return {
                "get_store":get_store,
                "set_store":set_store,
                "del_store":del_store,
                "http_get":http_get,
                "http_post":http_post,
                "new_id":new_id,
                "generate_uuid_v4":generate_uuid_v4,
                "output_buffer_bind_events":output_buffer_bind_events,
                "input_buffer_enqueue":input_buffer_enqueue,
                "input_buffer_dequeue":input_buffer_dequeue,
                "get_iso_8601_timestamp":get_iso_8601_timestamp,
                "client_cannot_be_tracked":client_cannot_be_tracked,
        };
})();

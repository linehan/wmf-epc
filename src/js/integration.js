function get_store( k ) 
{
        var data = window.localStorage.getItem(k);
        return ( data ) ? JSON.parse( data ) : {}; 
}

function set_store( k, v ) 
{
        window.localStorage.setItem( k, JSON.stringify( v ) );
}

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

function generate_UUID_v4() 
{
        return "ffffffff-ffff-ffff-ffff-ffffffffffff";
}

function bind_output_buffer_events() 
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

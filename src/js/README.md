# Event Platform Client Library - JavaScript

Implements the Event Platform common client specification in
JavaScript. Designed to be integrated with MediaWiki JS, using
ResourceLoader for the loading of stream configuration.

## Supported MEP Event Stream Attributes

```
url
    type: string
    description: the URL where the events for that stream will be sent.
    
is_available 
    type: boolean
    default: true
    description: if FALSE, no events will be produced to this stream.

scope
    type: string
    allowed_values: "pageview", "session"
    default: "pageview"
    description: 
        Determines whether to use the pageview or session ID for sampling.
        Determines whether to use the pageview or session ID to prefix the activity ID.
        
sample
    type: object
    properties:
        one_in_every
            type: non-negative integer (includes 0)
            default: 1,
            description:
                Sets the sample rate at 1/sample.one_in_every.
                If 0, behavior is identical to is_available = false.
```
### Example

```
example_stream = {
        url: "http://url-to-send-events-to.com",              
        is_available: true,
        scope: "session",
        sample: {
                one_in_every: 1000,
        }
}
```

## API Overview

### Main (public)
```
void log(string stream_name, Object event_data)
void configure(Object stream_config)
```
### Output buffer (private)
```
void send(string url, string body)
void schedule(string url, string body)
void send_all_scheduled()
void enable_sending()
void disable_sending()
```

### Association controller (private)
```
string pageview_id()
string session_id()
string activity_id(string stream_name, string base_id)
void   begin_new_session()
void   begin_new_activity(string stream_name)
```

### Sampling controller (private)
```
bool in_sample(string random_id, Object sampling_logic)`
```

### Integrations (abstract)
```
void   http_post(string url, string body)
void   input_buffer_enqueue(Object item)
Object input_buffer_dequeue()
void   set_persistent(string key, Serializable value)
Object get_persistent(string key)
void   del_persistent(string key)
string generate_id()
string generate_uuid_v4()
string generate_iso_8601_timestamp()
bool   client_cannot_be_tracked()
```

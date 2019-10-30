# Event Platform Client Library - JavaScript

Implements the Event Platform common client specification in
JavaScript. Designed to be integrated with MediaWiki JS, using
ResourceLoader for the loading of stream configuration.

## API Overview

### Main (public)
- `void log(string stream_name, Object event_data)`
- `void configure(Object stream_config)`

### Output buffer (private)
- `void send(string url, string body)`
- `void schedule(string url, string body)`
- `void send_all_scheduled()`
- `void enable_sending()`
- `void disable_sending()`

### Association controller (private)
- `string pageview_id()`
- `string session_id()`
- `string activity_id(string stream_name, string base_id)`
- `void begin_new_session()`
- `void begin_new_activity(string stream_name)`

### Sampling controller (private)
- `bool in_sample(string random_id, Object sampling_logic)`

### Integrations (abstract)
- `void http_post(string url, string body)`
- `void input_buffer_enqueue(Object item)`
- `Object input_buffer_dequeue()`
- `void set_store(string key, Serializable value)`
- `Object get_store(string key)`
- `void del_store(string key)`
- `string new_id()`
- `string generate_uuid_v4()`
- `string get_iso_8601_timestamp()`
- `bool client_cannot_be_tracked()`

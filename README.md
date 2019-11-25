# Wikimedia Event Platform Clients

Prototype clients to produce analytic events to the Wikimedia Event Platform,
specifically EventGate. 

## Platforms

There is a separate library implementation for each platform:

- MediaWiki (Web browser/JavaScript)
- Wikipedia app (iOS/Swift)
- Wikipedia app (Android/Java)

Libraries conform to common behavior found in associated documentation that
will be made available.

## API Overview

```
Main (public)
    void log(string stream_name, Object event_data)
    void configure(Object stream_config)

Output buffer (internal)
    void send(string url, string body)
    void schedule(string url, string body)
    void send_all_scheduled()
    void enable_sending()
    void disable_sending()

Association controller (internal)
    String pageview_id()
    String session_id()
    String activity_id(string stream_name, string base_id)
    void   begin_new_session()
    void   begin_new_activity(string stream_name)

Sampling controller (internal)
    Bool in_sample(string random_id, Object sampling_logic)

Integrations (abstract)
    void   set_persistent(string key, Serializable value)
    Object get_persistent(string key)
    void   del_persistent(string key)
    String get_device_id()
    String generate_id()
    String generate_uuid_v4()
    String generate_iso_8601_timestamp()
    Bool   client_cannot_be_tracked()
    void   input_buffer_enqueue(Object item)
    Object input_buffer_dequeue()
    void   http_post(string url, string body)
```

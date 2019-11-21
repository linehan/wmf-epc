# Event Platform Client Library - Java

Implements the Event Platform common client specification in Java. Designed to be integrated with Wikipedia Android app, downloading stream configuration from a remote endpoint.

## API Overview
```
Main (public)
    void    log(String stream, Object... data)
    void    configure(String config)

Output buffer (internal)
    void    send(String url, String body)
    void    schedule(String url, String body)
    void    send_all_scheduled()
    void    enable_sending()
    void    disable_sending()

Association controller (internal)
    String  pageview_id()
    String  session_id()
    String  activity_id(String stream, String prefix)
    void    begin_new_session()
    void    begin_new_activity(String stream)

Sampling controller (internal)
    boolean in_sample(String token, Object logic)

Common integrations (abstract)
    String  get_stream_config()
    void    set_persistent(String key, Object value)
    Object  get_persistent(String key)
    void    del_persistent(String key)
    String  generate_id()
    String  generate_uuid_v4()
    String  generate_iso_8601_timestamp()
    boolean client_cannot_be_tracked()
    void    input_buffer_enqueue(Object item)
    Object  input_buffer_dequeue()
    void    http_post(String url, String body)
    
Specific integrations (abstract)
    Map<String, Object> jsonToMap(JSONObject json)
    Map<String, Object> toMap(JSONObject object)
    List<Object>        toList(JSONArray array)
```

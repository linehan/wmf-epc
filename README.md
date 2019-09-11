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

### External interface - the EPC class
- `EPC.init(void)`
- `EPC.event(string streamName, map eventData)`

### Internal interface - Stream
- `Stream(JSONObject streamConfiguration)`
- `Stream.get_scope(string streamName)` => `string`
- `Stream.get_start(string streamName)` => `array of string`
- `Stream.is_enabled(string streamName)` => `boolean`
- `Stream.is_sampled(string streamName)` => `boolean`

### Internal interface - Token
- `Token.session(void)` => `string`
- `Token.pageview(void)` => `string`
- `Token.activity(string streamName, string scopeName)` => `string` or `null`
- `Token.activity_reset(string streamName)`

### Internal interface - Output
- `Output.send(string url, string postBodyContent)`
- `Output.schedule(string url, string postBodyContent)`

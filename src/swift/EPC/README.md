# Event Platform Client for iOS and macOS

Collects events in an input buffer, adds some metadata, places them in an output buffer where they are periodically bursted to a remote endpoint via HTTP POST.

Designed for use with Wikipedia iOS application producing events to the EventGate intake service, but can also be used with any Wikimedia-developed application where the [Foundation framework](https://developer.apple.com/documentation/foundation) is available, such as macOS and Mac Catalyst SDKs.

## API

### Public

- `EPC.shared.log(_ stream_name: String, _ data: [String: Encodable])`: log event with EPC
- `EPC.shared.configure(_ url: String)`: configure EPC using JSON stream configuration available at `url` (e.g. [pai-test.wmflabs.org/streams](https://pai-test.wmflabs.org/streams))

**Example usage**: if `editing` and `editing.growth` are streams (using the same schema) in the downloaded configuration, the following will multi-post the same event to both streams (pending sampling):

```swift
EPC.shared.log("editing", ["page_id": 1, "action": "save"])
```

These events will be saved to a buffer if EPC has not been configured yet and will be sent to active streams once the configuration has been loaded.

### Internal

- **Output buffer**
- **Association controller**
- **Sampling controller**

### Integrations

These functions must be implemented in `Integration` class on a per-platform basis to integrate EPC into the client.

- `load_stream_config(delegate: StreamManager, url: String) -> Void`
    - Provided, can be re-implemented.
    - A `StreamManager` (`EPC`) has a public `set_stream_config(_ config: [String : [String : Any]]) -> Void` method that will be called with the downloadred stream configuration.
- `generate_id() -> String`
    - Provided, can be re-implemented.
- `generate_uuid_v4() -> String`
    - Provided, can be re-implemented.
-  `generate_iso_8601_timestamp() -> String`
    - Provided, can be re-implemented.
-  `client_cannot_be_tracked() -> Bool`
    - Needs to be implemented to query setting from Wikipedias iOS app user's preferences
-  `http_post(_ url: String, _ body: String) -> Void`
    - Provided, can be re-implemented.
- **Persistent storage**: these need to be implemented to work with existing Core Data usage
- `set_persistent(_ key: String, _ value: Encodable) -> Void`
- `get_persistent(_ key: String) -> Void`
- `del_persistent(_ key: String) -> Void`
- **Input buffer**
    -  `input_buffer_enqueue(_ item: [String: Any]) -> Void`
        - Provided, can be re-implemented.
    - `input_buffer_dequeue() -> [String: Any]`
        - Provided, can be re-implemented.

## Notes

**TODO**: [main.swift](Sources/EPC/main.swift) (required for producing a binary which can be executed) will need to be removed for production use and the following code will need to be added  to [Package.swift](Package.swift) between `name` and `dependencies` if this component is to be packaged into an external library for importing into the Wikipedia iOS app:

```
products: [
    // Products define the executables and libraries produced by a package, and make them visible to other packages.
    .library(
        name: "EPC",
        targets: ["EPC"]),
],
```

## Licensing

This and the other (JavaScript, Java) libraries are available under the 2-Clause BSD License.

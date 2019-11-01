# Event Platform Client for iOS and macOS

Collects events in an input buffer, adds some metadata, places them in an output
buffer where they are periodically bursted to a remote endpoint via HTTP POST.

Designed for use with Wikipedia iOS application producing events to the
EventGate intake service, but can also be used with any Wikimedia-developed
application where the
[Foundation framework](https://developer.apple.com/documentation/foundation) is
available, such as macOS and Mac Catalyst SDKs.

## Notes

**TODO**: [main.swift](Sources/EPC/main.swift) (required for producing a binary
which can be executed) will need to be removed for production use and the
following code will need to be added  to [Package.swift](Package.swift) between
`name` and `dependencies` if this component is to be packaged into an external
library for importing into the Wikipedia iOS app:

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

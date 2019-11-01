/*
 * Event Platform Client (EPC)
 *
 *     Designed for use with Wikipedia iOS application producing events to
 *     the EventGate intake service.
 *
 * LICENSE NOTICE
 *     Copyright 2019 Wikimedia Foundation
 *
 *     Redistribution and use in source and binary forms, with or without
 *     modification, are permitted provided that the following conditions are
 *     met:
 *
 *     1. Redistributions of source code must retain the above copyright notice,
 *     this list of conditions and the following disclaimer.
 *
 *     2. Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 *
 *     THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 *     IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 *     THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 *     PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 *     CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *     EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 *     PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *     PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 *     LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *     NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 *     SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * AUTHORS
 *     Jason Linehan <jlinehan@wikimedia.org>
 *     Mikhail Popov <mpopov@wikimedia.org>
 */

import Foundation

enum StreamErrors: Error {
    case NoStreamConfigLoaded
    case ConfigHasNoStream(_ stream: String)
    case StreamHasNoProp(_ stream: String, _ prop: String)
}

/**
 * Manages information belonging to the stream configuration.
 *
 * Stores the parsed stream configuration JSON/YAML, but also provides accessors for properties of named
 * streams.
 */
class Stream {

    private var stream_config: [String: [String: Any]]? = [:]

    init(_ config: [String: [String: Any]]) {
        print("Initializing Stream with stream configuration: \(config.description)")
        self.stream_config = config
    }

    /**
     * Helper function for getting properties (e.g. 'ur', 'active', 'scope') of streams.
     * - Parameter stream: Name of stream
     * - Parameter prop: Name of property to look for
     */
    private func get_stream_property(_ stream: String, _ prop: String) throws -> Any {
        if self.stream_config != nil {
            let sc = stream_config!
            if sc.keys.contains(stream) {
                if sc[stream]!.keys.contains(prop) {
                    return sc[stream]![prop]!
                } else {
                    throw StreamErrors.StreamHasNoProp(stream, prop)
                }
            } else {
                throw StreamErrors.ConfigHasNoStream(stream)
            }
        } else {
            throw StreamErrors.NoStreamConfigLoaded
        }
    }

    /**
     * Get the URL to send the stream event to
     * - Parameter stream: Name of the stream
     * - Returns: Destination URL of event
     */
    public func url(_ stream: String) -> String? {
        let url: String?
        do {
            url = try self.get_stream_property(stream, "url") as? String
        } catch {
            print("Error: \(error)")
            url = nil
        }
        return url
    }

    /**
     * Get the scope of the stream
     * - Parameter stream: Name of the stream
     * - Returns: 'session', 'pageview', or 'unknown'
     */
    public func scope(_ stream: String) -> String {
        let scope: String
        do {
            scope = try self.get_stream_property(stream, "scope") as! String
        } catch {
            print("Error: \(error)")
            scope = "unknown"
        }
        return scope
    }

    /**
     * Get whether the stream is active or not
     * - Parameter stream: Name of the stream
     * - Returns: `false` if the stream is not active, otherwise `true`
     */
    public func active(_ stream: String) -> Bool {
        let active: Bool
        do {
            try active = (self.get_stream_property(stream, "active") as! Int) == 1 ? true : false
        } catch StreamErrors.StreamHasNoProp(let s, let p) {
            print("Warning: stream '\(s)' has no property '\(p)', defaulting to true")
            active = true
        } catch {
            print("Error: \(error)")
            active = false
        }
        print("stream '\(stream)' is \(active ? "active" : "inactive")")
        return active
    }

    /**
     * Get an array of start states for the stream
     * - Parameter stream: Name of the stream
     * - Returns: Array of state labels
     */
    public func start(_ stream: String) -> [String]? {
        let start: [String]?
        do {
            start = try self.get_stream_property(stream, "start") as? [String]
        } catch {
            print("Error: \(error)")
            start = nil
        }
        return start
    }

    public func is_enabled(_ stream: String) -> Bool {
        let enabled: Bool
        if stream_config != nil {
            if self.stream_config!.keys.contains(stream) {
                enabled = false
            } else {
                enabled = self.active(stream)
            }
        } else {
            enabled = false
        }
        print("stream '\(stream)' is \(enabled ? "enabled" : "disabled")")
        return enabled
    }

    public func is_sampled(_ stream: String) -> Bool {
        return true
    }
}

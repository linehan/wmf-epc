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
 *     Mikhail Popov <mpopov@wikimedia.org>
 *     Jason Linehan <jlinehan@wikimedia.org>
 */

import Foundation

/**
 * Collect functions that will be replaced or mapped to other platform-specific functions.
 */
@available(iOS 10, OSX 10.12, *)
class Integration {

    // MARK: - Properties

    public static let shared = Integration() // singleton

    fileprivate let session: URLSession
    private let iso8601_formatter = ISO8601DateFormatter()

    /**
     * Store events until the library is finished initializing.
     *
     * The EPC library makes an HTTP request to a remote stream configuration service for information
     * about how to evaluate incoming event data. Until this initialization is complete, we store any incoming
     * events in this buffer.
     */
    private var input_buffer = [(stream: String, data: [String: Any])]()

    // MARK: - Methods

    private init(URLSession: URLSession = .shared) {
        self.session = URLSession
    }

    /**
     * Generates a new identifier using the same algorithm as EPC libraries for web and Android.
     */
    public func generate_id() -> String {
        var id: String = ""
        for _ in 1...8 {
            id += String(format: "%04x", arc4random_uniform(65535))
        }
        return id
    }

    /**
     * Append a `(stream, data)` pair to a queue (before stream configuration is available).
     */
    public func input_buffer_enqueue(_ item: (stream: String, data: [String: Any])) -> Void {
        input_buffer.append(item)
    }

    /**
     * Pluck oldest event from queue FIFO style (usually after stream configuration is available)
     */
    public func input_buffer_dequeue() -> (stream: String, data: [String: Any])? {
        if input_buffer.count == 0 {
            return nil
        } else {
            return input_buffer.remove(at: 0)
        }
    }

    public func client_cannot_be_tracked() -> Bool {
        return false
    }

    public func get_user_agent() -> String {
        // potentially dynamically fetch version info from a plist or other resource?
        return "Wikimedia Product Analytics Infrastructure/Event Platform Client/iOS 0.1"
    }

    /**
     * Fetches the app install ID.
     */
    public func device_id() -> String {
        let did: Any? = get_persistent("did") // like sid & pid
        if did != nil {
            return did as! String
        } else {
            return "<app install ID>"
        }
    }

    /**
     * Attempt to download the stream configuration from remote endpoint located and then relay it to the
     * stream manager.
     *
     * - Parameter url: stream configuration service public endpoint
     * - Parameter delegate: who to give the downloaded stream configuration to
     */
    public func load_stream_config(url: String, delegate: StreamManager) -> Void {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "GET"
        request.setValue(get_user_agent(), forHTTPHeaderField: "User-Agent")
        let task = self.session.dataTask(with: request) {
            data, response, error in
            if let response = response as? HTTPURLResponse, let data = data {
                if response.statusCode == 200 || response.statusCode == 304 {
                    let from_json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: [String: Any]]
                    if from_json != nil {
                        delegate.set_stream_config(from_json!)
                    } else {
                        print("Problem processing stream config from response")
                    }
                } else {
                    print("Bad response from endpoint: \(response.statusCode)")
                }
            }

        }
        task.resume()
    }

    public func generate_uuid_v4() -> String {
        // Initializes & returns a new UUID with RFC 4122 version 4 random bytes
        return UUID().uuidString
    }
    public func generate_iso_8601_timestamp() -> String {
        return iso8601_formatter.string(from: Date())
    }

    private func http_req(url: String, body: String, method: String) {
        var request = URLRequest(url: URL(string: url)!)
        let data = body.data(using: String.Encoding.utf8)
        request.httpMethod = method
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(get_user_agent(), forHTTPHeaderField: "User-Agent")
        let task = self.session.dataTask(with: request) { _, response, _ in
            if let httpResponse = response as? HTTPURLResponse {
                print("Response from \(url): \(httpResponse.statusCode)")
            }
        }
        task.resume()
    }

    /**
     * HTTP POST to public EventGate endpoint located at `url`
     */
    public func http_get(_ url: String, _ body: String) -> Void {
        http_req(url: url, body: body, method: "GET")
    }

    /**
     * HTTP GET to public EventGate endpoint located at `url`
     */
    public func http_post(_ url: String, _ body: String) -> Void {
        http_req(url: url, body: body, method: "POST")
    }

    /**
     * Fetch the value stored under key from persistent storage
     */
    public func get_persistent(_ key: String) -> Any? {
        // Integration with existent persistent storage data retrieval methods
        return nil
    }
    /**
     * Save the value stored under key to persistent storage
     */
    public func set_persistent(_ key: String, _ value: Any) -> Void {
        // Integration with existent persistent storage data retrieval methods
    }
    /**
     * Delete the value stored under key in persistent storage
     */
    public func del_persistent(_ key: String) -> Void {
        // Integration with existent persistent storage data retrieval methods
    }
}

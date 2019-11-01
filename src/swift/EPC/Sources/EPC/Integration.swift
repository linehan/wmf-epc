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

/**
 * Collect functions that will be replaced or mapped to other platform-specific functions.
 */
@available(iOS 10, OSX 10.12, *)
class Integration {

    public static let shared = Integration() // singleton

    fileprivate let session: URLSession
    private let iso8601_formatter = ISO8601DateFormatter()

    private init(URLSession: URLSession = .shared) {
        self.session = URLSession
    }

    public func get_user_agent() -> String {
        // potentially dynamically fetch version info from a plist or other resource?
        return "Wikimedia Product Analytics Infrastructure/Event Platform Client/iOS 0.1"
    }

    public func load_stream_config(delegate: StreamManager, url: String) -> Void {
        print("Attempting to download stream configs from endpoint")
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "GET"
        let task = self.session.dataTask(with: request) {
            data, response, error in
            if let response = response as? HTTPURLResponse, let data = data {
                if response.statusCode == 200 || response.statusCode == 304 {
                    print("Received data from endpoint, processing received data")
                    let from_json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: [String: Any]]
                    if from_json != nil {
                        delegate.set_stream_config(from_json!)
                    } else {
                        print("Problem processing data from response")
                    }

                } else {
                    print("Response from endpoint: \(response.statusCode)")
                }
            }

        }
        task.resume()
    }

    public func get_domain() -> String {
        return "en.wikipedia.org"
    }
    public func get_UUID_v4() -> String {
        // Initializes & returns a new UUID with RFC 4122 version 4 random bytes
        return UUID().uuidString
    }
    public func get_iso_8601_timestamp() -> String {
        return iso8601_formatter.string(from: Date())
    }

    public func http_post(_ url: String, _ body: String) throws -> Void {
        var request = URLRequest(url: URL(string: url)!)
        let data = body.data(using: String.Encoding.utf8)
        request.httpMethod = "POST"
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let task = self.session.dataTask(with: request) { _, response, _ in
            if let httpResponse = response as? HTTPURLResponse {
                print("Response from \(url): \(httpResponse.statusCode)")
            }
        }
        task.resume()
    }
}

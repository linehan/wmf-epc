/*
 * Event Platform Client (EPC)
 *
 * DESCRIPTION
 *     Collects events in an input buffer, adds some metadata, places them
 *     in an output buffer where they are periodically bursted to a remote
 *     endpoint via HTTP POST.
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
 * Event Platform Client public library interface. This class ties together the library components, each of which
 * is otherwise totally encapsulated.
 */
public class EPC: StreamManager {

    // MARK: - Properties

    /**
     * Remote endpoint to fetch the stream configuration from.
     */
    fileprivate static let STREAM_CONFIG_URL = "https://pai-test.wmflabs.org/streams";

    public static let shared = EPC() // singleton

    /**
     * Will be instantiated using the stream configuration.
     */
    private var stream: Stream? = nil;

    /**
     * Will hold and manage all the token and identifier caches
     */
    private var token = Token()

    /**
     * Will buffer and schedule the transmission of events over HTTP
     */
    private var output = Output()

    /**
     * Store events until the library is finished initializing.
     *
     * The EPC library makes an HTTP request to a remote stream
     * configuration service for information about how to evaluate
     * incoming event data. Until this initialization is complete,
     * we store any incoming events in this buffer.
     */
    private var input_buffer = [[String: Encodable]]()

    // MARK: - Methods

    /**
     * Fetch stream configuration and use it to instantiate Stream, asynchronously.
     */
    private init() {
        Integration.shared.load_stream_config(delegate: self, url: EPC.STREAM_CONFIG_URL)
    }

    private func flush_buffer() {
        if self.stream != nil && self.input_buffer.count > 0 {
            print("Stream initialized, re-trying sending \(self.input_buffer.count) events")
            while self.input_buffer.count > 0 {
                var data: [String: Encodable] = self.input_buffer.remove(at: 0)
                let meta: [String: String] = data["meta"] as! [String: String]
                let name = meta["stream"]!
                let url = self.stream!.url(name)
                if url != nil {
                    if self.stream!.active(name) {
                        data["activity_id"] = token.activity(name, self.stream!.scope(name))
                        self.output.schedule(url!, data.jsonDescription)
                    }
                }
            }
        }
    }

    public func set_stream_config(_ config: [String : [String : Any]]) {
        self.stream = Stream(config)
        self.output.enable_sending()
        self.flush_buffer() // Send cached events once stream config is loaded
    }

    /**
     * Log an event to the input buffer.
     *
     * - Parameter name: Name of the event stream to send the event to
     * - Parameter data: A dictionary of event data
     */
    public func event(_ name: String, _ data: [String: Encodable]) throws -> Void {
        var meta = [String: String]()
        var data = data

        // TODO: check if stream is enabled

        meta["id"] = Integration.shared.get_UUID_v4()
        meta["dt"] = Integration.shared.get_iso_8601_timestamp()
        meta["domain"] = Integration.shared.get_wiki_domain()
        meta["uri"] = Integration.shared.get_wiki_uri()
        meta["stream"] = name

        data["meta"] = meta
        data["session_id"] = token.session()
        data["pageview_id"] = token.pageview()

        if self.stream != nil {
            let url: String? = self.stream!.url(name)
            if url != nil {
                if self.stream!.active(name) {
                    self.output.schedule(url!, data.jsonDescription)
                }
            }
        } else {
            print("Stream not initialized yet, remembering the following data for later:\n\n\(data.description)")
            self.input_buffer.append(data)
        }

    }
}

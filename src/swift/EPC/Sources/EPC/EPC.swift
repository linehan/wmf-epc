/*
 * Event Platform Client (EPC)
 *
 *      _/\/\/\/\/\/\________________________________________/\/\_____
 *     _/\____________/\/\__/\/\____/\/\/\____/\/\/\/\____/\/\/\/\/\_
 *    _/\/\/\/\/\____/\/\__/\/\__/\/\/\/\/\__/\/\__/\/\____/\/\_____
 *   _/\/\____________/\/\/\____/\/\________/\/\__/\/\____/\/\_____
 *  _/\/\/\/\/\/\______/\________/\/\/\/\__/\/\__/\/\____/\/\/\___
 * ______________________________________________________________
 *      ___/\/\/\/\/\__/\/\____/\/\______________________________/\/\_____
 *     _/\/\__________/\/\______________/\/\/\____/\/\/\/\____/\/\/\/\/\_
 *    _/\/\__________/\/\____/\/\____/\/\/\/\/\__/\/\__/\/\____/\/\_____
 *   _/\/\__________/\/\____/\/\____/\/\________/\/\__/\/\____/\/\_____
 *  ___/\/\/\/\/\__/\/\/\__/\/\/\____/\/\/\/\__/\/\__/\/\____/\/\/\___
 * __________________________________________________________________
 *
 * DESCRIPTION
 *     Collects events in an input buffer, adds some metadata, places them in an
 *     ouput buffer where they are periodically bursted to a remote endpoint via
 *     HTTP POST.
 *
 *     Designed for use with Wikipedia iOS application producing events to the
 *     EventGate intake service.
 *
 * AUTHORS
 *     Mikhail Popov <mpopov@wikimedia.org>
 *     Jason Linehan <jlinehan@wikimedia.org>
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
 */

import Foundation

/**
 * Event Platform Client public library interface. This class ties together the library components, each of which
 * is otherwise totally encapsulated.
 * - Methods:
 *
 * The static public API via the `shared` singleton allows callers to configure streams and log events. Use
 * `configure` to attempt to fetch stream configuration asynchronously from a remote endpoint and `log`
 * to send (or schedule to be sent) event data to specific streams, cc'ing derivative streams automatically.
 */
@available(iOS 10, OSX 10.12, *)
public class EPC: StreamManager {

    // MARK: - OutputBuffer

    /**
     * Buffers events in a queue prior to transmission
     *
     * Transmission is via HTTP POST.
     * Transmissions are not sent at a uniform offset but are shaped into
     * 'bursts' using a combination of queue size and debounce time.
     *
     * These concentrate requests (and hence, theoretically, radio awake state)
     * so as not to contribute to battery drain.
     */
    fileprivate class OutputBuffer {

        /**
         * When an item is added to QUEUE, wait this many ms before sending.
         *
         * If another item is added to QUEUE during this time, reset the
         * countdown.
         */
        private let WAIT_SEC: Int = 20 // Timer requires seconds, not ms

        /**
         * When QUEUE.count exceeds this value TIMER becomes non-interruptable.
         */
        private let WAIT_ITEMS: Int = 10

        /**
         * When ENABLED is false, items can be enqueued but not dequeued.
         * Timers will not be set for enqueued items.
         * QUEUE may grow beyond WAIT_ITEMS.
         */
        private var ENABLED = true

        /**
         * The two strings in each array item are the two arguments of the
         * send() or schedule() method.
         */
        private var QUEUE = [(url: String, body: String)]()
        /**
         * Timeout controlling the HTTP request bursting.
         */
        private var TIMER: Timer?

        init() {
            reset_scheduler()
        }

        /**
         * Enable sending
         */
        public func enable_sending() -> Void {
            ENABLED = true
            /*
             * Try immediately to send any enqueued items. Otherwise another
             * item must be enqueued before sending is triggered.
             */
            send_all_scheduled()
        }

        /**
         * Disable sending
         */
        public func disable_sending() -> Void {
            ENABLED = false
            unschedule()
        }

        /**
         * Helper function to aid in resetting the timer.
         */
        private func reset_scheduler() -> Void {
            let need_timer: Bool
            if TIMER != nil {
                if TIMER!.isValid {
                    need_timer = false
                } else {
                    need_timer = true
                }
            } else {
                TIMER?.invalidate()
                need_timer = true
            }
            if need_timer {
                TIMER = Timer.scheduledTimer(
                    timeInterval: TimeInterval(WAIT_SEC),
                    target: self,
                    selector: #selector(send_all_scheduled),
                    userInfo: nil,
                    repeats: true
                )
            }
        }

        /**
         * Cancel the timer.
         */
        private func unschedule() -> Void {
            TIMER?.invalidate()
        }

        /**
         * Dequeue and call send() on all scheduled items.
         */
        @objc private func send_all_scheduled() -> Void {
            unschedule()
            if ENABLED {
                /*
                 * All items on QUEUE are permanently removed.
                 */
                var event: (url: String, body: String)
                while QUEUE.count > 0 {
                    event = QUEUE.remove(at: 0)
                    /*
                     * Failure of send() will result in data loss.
                     * (Fire-and-forget)
                     */
                    send(event.url, event.body)
                }
            } else {
                /*
                 * Do nothing; the data is still in the queue and will be sent
                 * after we are enabled again.
                 */
            }
        }

        /**
         *  Schedule an item to be sent.
         *  - Parameters:
         *      - url: destination of the HTTP POST request
         *      - body: body of the HTTP POST request
         */
        public func schedule(_ url: String, _ body: String) -> Void {
            /*
             * The actual item enqueued is an array of length 2 holding the two
             * arguments. Item is enqueued whether or not sending is enabled.
             */
            QUEUE.append((url: url, body: body))

            if ENABLED {
                if QUEUE.count >= WAIT_ITEMS {
                    /*
                     * >= because while sending is disabled, any number of items
                     * could be added to QUEUE without it emptying.
                     */
                    send_all_scheduled()
                } else {
                    /*
                     * The arrival of a new item interrupts the timer and resets
                     * the countdown.
                     */
                    reset_scheduler()
                }
            }
        }

        /**
         *  Attempt to send a request with the given url and body.
         *  - Parameters:
         *      - url: destination of the HTTP POST request
         *      - body: body of the HTTP POST request
         */
        private func send(_ url: String, _ body: String) -> Void {
            if ENABLED {
                Integration.shared.http_post(url, body)
            }
        }

    }

    // MARK: - AssociationController

    /**
     * Provides associative identifiers and manage their persistence
     *
     * Identifiers correspond to various scopes e.g. 'pageview', 'session',
     * 'activity', and 'device'.
     */
    fileprivate class AssociationController {

        // Cache the ID values:
        var PAGEVIEW_ID: String? = nil
        var SESSION_ID: String? = nil

        /**
         * Unset the session.
         */
        public func begin_new_session() -> Void {
            /*
             * Clear runtime and persisted value for SESSION_ID.
             */
            SESSION_ID = nil
            Integration.shared.del_persistent("sid")
            /*
             * A session refresh implies a pageview refresh, so clear runtime
             * value of PAGEVIEW_ID.
             */
            PAGEVIEW_ID = nil
        }

        /**
         * Generate a session identifier.
         * - Returns: session ID
         *
         * The identifier is a string of 20 zero-padded hexadecimal digits representing a uniformly random
         * 80-bit integer.
         */
        public func session_id() -> String {
            if SESSION_ID == nil {
                /*
                 * If there is no runtime value for SESSION_ID, try to load a
                 * value from persistent store.
                 */
                let sid: Any? = Integration.shared.get_persistent("sid")
                if sid == nil {
                    /*
                     * If there is no value in the persistent store, generate a
                     * new value for SESSION_ID, and write the update to the
                     * persistent store.
                     */
                    SESSION_ID = Integration.shared.generate_id()
                    Integration.shared.set_persistent("sid", SESSION_ID!)
                } else {
                    SESSION_ID = sid as? String
                }
            }
            return SESSION_ID!
        }

        /**
         * Generate a session identifier.
         * - Returns: pageview ID
         *
         * The identifier is a string of 20 zero-padded hexadecimal digits representing a uniformly random
         * 80-bit integer.
         */
        public func pageview_id() -> String {
            if PAGEVIEW_ID == nil {
                PAGEVIEW_ID = Integration.shared.generate_id()
            }
            return PAGEVIEW_ID!
        }

    }

    // MARK: - SamplingController

    /**
     * Computes various sampling functions on the client
     *
     * Sampling is based on associative identifiers, each of which have a
     * well-defined scope, and sampling config, which each stream provides as
     * part of its configuration.
     */
    fileprivate class SamplingController {
        /**
         * Compute a boolean function on a random identifier.
         * - Parameter token: string of random hexadecimal digits
         * - Parameter config: sampling config from stream configuration
         * - Returns: `true` if in sample or `false` otherwise
         */
        public func in_sample(token: String, config: [String: Any]) -> Bool {
            if !config.keys.contains("rate") {
                // TODO: Implement this
                return true
            }
            return true
        }
    }

    // MARK: - Properties

    public static let shared = EPC() // singleton

    private var CONFIG: [String: [String: Any]]? = nil;
    private var COPIED = [String: [String]]();
    private var output_buffer: OutputBuffer
    private var association_controller: AssociationController
    private let sampling_controller: SamplingController

    // MARK: - Methods

    private init() {
        output_buffer = OutputBuffer()
        association_controller = AssociationController()
        sampling_controller = SamplingController()
    }

    /**
     * Fetch stream configuration and use it to instantiate `CONFIG` asynchronously.
     * - Parameter url: The URL of the stream configuration service endpoint which returns JSON.
     */
    public func configure(_ url: String) -> Void {
        Integration.shared.load_stream_config(url: url, delegate: self)
    }

    /**
     * Called by Integration's `load_stream_config` after stream configuration has been downloaded
     * and processed.
     */
    public func set_stream_config(_ config: [String : [String : Any]]) -> Void {
        CONFIG = config
        /*
         * Figure out which streams can be cc'd (e.g. edit ~> edit.growth)
         */
        for stream in config.keys {
            let cc_streams: [String] = config.keys.filter { $0.hasPrefix("\(stream).") }
            if cc_streams.count > 0 {
                COPIED[stream] = cc_streams
            }
        }
        if CONFIG != nil {
            var cached_event: (stream: String, data: [String: Any])? = Integration.shared.input_buffer_dequeue()
            while cached_event != nil {
                log(cached_event!.stream, cached_event!.data)
                cached_event = Integration.shared.input_buffer_dequeue() // next
            }
        }
    }

    /**
     * Log an event to the input buffer.
     * - Parameters:
     *      - stream: Name of the event stream to send the event to
     *      - data: A dictionary of event data
     */
    public func log(_ stream: String, _ data: [String: Any]) -> Void {
        var meta: [String: String]
        if data.keys.contains("meta") {
            meta = data["meta"]! as! [String: String]
        } else {
            meta = [String: String]()
            meta["dt"] = Integration.shared.generate_iso_8601_timestamp()
            print("[EPC] Event for stream '\(stream)' logged at \(meta["dt"]!) with data:\n\(data.prettyPrintJSON)")
        }
        var data = data
        data["meta"] = meta

        if CONFIG == nil {
            Integration.shared.input_buffer_enqueue((stream, data))
            return
        } else {
            /*
             * Once the stream configs are loaded, we do a few checks before
             * decorating the event and actually sending it.
             */
            if !(CONFIG!.keys.contains(stream)) {
                return
            } else {
                // CC'd other streams
                if COPIED.keys.contains(stream) {
                    for cc_stream in COPIED[stream]! {
                        log(cc_stream, data)
                    }
                }
            }
        }

        if (Integration.shared.client_cannot_be_tracked()) {
            /*
             * If the client cannot be tracked, then we can only send events if
             * they certify as being non-identifiable.
             * TODO: finalize how we want to specify this in the stream spec
             */
            /* if !(CONFIG![stream_name]!["is_nonidentifiable"]!) {
             return;
             } */
            return
        }

        /*
         * Determining if event is in or out of sample based on stream scope
         */
        let scope_id: String
        let scope: Any? = CONFIG![stream]!["scope"]
        if scope != nil {
            switch scope as! String {
            case "pageview":
                scope_id = association_controller.pageview_id()
            case "device":
                scope_id = Integration.shared.device_id()
            default:
                scope_id = association_controller.session_id()
            }
        } else {
            scope_id = association_controller.session_id()
        }

        let sampling_config: Any? = CONFIG![stream]!["sample"]
        if sampling_config != nil {
            let in_sample: Bool = sampling_controller.in_sample(
                token: scope_id,
                config: sampling_config! as! [String: Any]
            )
            if !in_sample {
                /*
                 * If out of sample based on the stream's sampling
                 * configuration, give up immediately. We assume in-sample, or
                 * 100% sampling rate by default unless stream config specifies
                 * otherwise.
                 */
                return
            }
        }

        /*
         * meta.id is optional and should only be done in case the client is
         * known to send duplicates of events, otherwise we don't need to
         * make the payload any heavier than it already is
         */
        meta["id"] = Integration.shared.generate_uuid_v4()
        meta["stream"] = stream
        meta["schema"] = (CONFIG![stream]!["$schema"]! as! String)
        data["meta"] = meta // update meta

        /*
         * Add other root-level information
         */
        data["session_id"] = association_controller.session_id()
        data["pageview_id"] = association_controller.pageview_id()
        data["device_id"] = Integration.shared.device_id()

        let destination: String = CONFIG![stream]!["destination"]! as! String
        output_buffer.schedule(destination, data.jsonDescription)

    }
}

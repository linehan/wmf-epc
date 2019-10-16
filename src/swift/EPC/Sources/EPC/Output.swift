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
 * Buffer outgoing HTTP requests
 */
@available(iOS 10, OSX 10.12, *)
class Output {
    
    /* CONFIGURABLE PARAMETERS */
    /* FOR MORE INFO, SEE OUTPUT BUFFERING SPEC */
    private let WAIT_ITEMS: Int = 10
    private let WAIT_SEC: Int = 20 // Timer requires seconds, not ms
    
    private var ENABLED = false // Enable once Stream config has been loaded
    private var queue = [(url: String, str: String)]()
    private var timer: Timer?
    
    init() {
        self.reset_scheduler()
    }
    
    /**
     * Enable sending of events.
     * Anything currently in the queue will be sent immediately.
     */
    public func enable_sending() -> Void {
        print("Enabling sending")
        self.ENABLED = true
        self.send_all_scheduled()
    }
    
    /**
     * Disable sending of events.
     * If the timer is currently active, it is cancelled.
     */
    public func disable_sending() -> Void {
        print("Disabling sending")
        self.ENABLED = false
        self.unschedule()
    }
    
    private func reset_scheduler() -> Void {
        let need_timer: Bool
        if timer != nil {
            if !timer!.isValid {
                need_timer = true
            } else {
                need_timer = false
            }
        } else {
            need_timer = true
        }
        if need_timer {
            print("Re-starting a \(self.WAIT_SEC)s repeating timer")
            self.timer = Timer.scheduledTimer(timeInterval: TimeInterval(self.WAIT_SEC), target: self, selector: #selector(send_all_scheduled), userInfo: nil, repeats: true)
        }
        
    }
    
    /**
     * Cancel the timer.
     */
    private func unschedule() -> Void {
        print("Cancelling the timer")
        self.timer?.invalidate()
    }
    
    /**
     * Send all of the requests in the queue.
     */
    @objc private func send_all_scheduled() -> Void {
        while self.ENABLED && self.queue.count > 0 {
            let event = self.queue.remove(at: 0)
            self.send(event.url, event.str)
        }
    }
    
    /**
     *  Schedule an item to be sent
     *
     *  - Parameter url: The target of the HTTP request
     *  - Parameter str: The data to send as the POST body
     *
     *  If sending is not enabled, the scheduler will simply add the
     *  item to the queue and return.
     */
    public func schedule(_ url: String, _ str: String) -> Void {
        print("Scheduling data\n\n\(str)\n\nto be sent to \(url)")
        self.queue.append((url: url, str: str))
        
        if self.ENABLED {
            /*
             * >= because we might have been disabled and
             * accumulated who knows how many without sending.
             */
            if self.queue.count >= self.WAIT_ITEMS {
                self.send_all_scheduled()
            } else {
                self.timer?.fire()
            }
        }
    }
    
    /**
     *  Initiate an asynchronous HTTP POST request
     *  - Parameter url: The target of the HTTP request
     *  - Parameter str: The data to send as the POST body
     */
    public func send(_ url: String, _ str: String) -> Void {
        if self.ENABLED {
            do {
                print("Attempting to HTTP POST\n\n\(str)\n\nto \(url)")
                try Integration.shared.http_post(url, str)
            } catch {
                print("Error: \(error)")
            }
            self.send_all_scheduled()
        } else {
            print("Sending is disabled, scheduling event for later")
            self.schedule(url, str)
        }
    }
    
}

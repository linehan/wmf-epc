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
 * Handles the storage and book-keeping that controls the various pageview,
 * session, and activity tokens.
 */
class Token {
    // Cache the ID values:
    var PAGEVIEW_ID: String?
    var SESSION_ID: String?

    // The global clock ticks:
    var PAGEVIEW_CL: Int = 0
    var SESSION_CL: Int = 0

    // Dictionaries store sequence numbers for various scoped streams:
    var PAGEVIEW_SQ = [String: Int]()
    var SESSION_SQ = [String: Int]()

    init() {
        // Initialization...
    }

    private func new_id() -> String {
        var id: String = ""
        for _ in 1...8 {
            id += String(format: "%04x", arc4random_uniform(65535))
        }
        return id
    }

    private func session_timeout() -> Bool {
        return false
    }

    private func pageview_check() -> Void {
        if PAGEVIEW_ID == nil {
            PAGEVIEW_ID = new_id()
            PAGEVIEW_CL = 1
        }
    }

    private func session_check() -> Void {
        /* A fresh execution will have SESSION set to null */
        if SESSION_ID == nil {
            SESSION_ID = new_id()
            SESSION_CL = 1
        }

        /* If the session is over, based on our criteria ... */
        if session_timeout() {
            /* ... then regenerate ... */
            SESSION_ID = new_id()
            SESSION_SQ.removeAll()
            SESSION_CL = 1

            /* ... and trigger a pageview regeneration as well */
            PAGEVIEW_ID = new_id()
            PAGEVIEW_SQ.removeAll()
            PAGEVIEW_CL = 1
        }
    }

    public func session() -> String {
        self.session_check()
        return self.SESSION_ID!
    }

    public func pageview() -> String {
        pageview_check()
        return PAGEVIEW_ID!
    }

    public func activity(_ name: String, _ scope: String) -> String? {
        let id: String
        let sn: Int
        switch scope {
        case "session":
            id = session()
            if !SESSION_SQ.keys.contains(name) {
                SESSION_SQ[name] = SESSION_CL
                SESSION_CL = SESSION_CL + 1
            }
            sn = SESSION_SQ[name]!
        case "pageview":
            id = pageview()
            if !PAGEVIEW_SQ.keys.contains(name) {
                PAGEVIEW_SQ[name] = PAGEVIEW_CL
                PAGEVIEW_CL = PAGEVIEW_CL + 1
            }
            sn = PAGEVIEW_SQ[name]!
        default:
            return nil
        }
        return id + String(format: "%04x", sn)
    }

    public func activity_reset(_ name: String) -> Void {
        let p: Int? = PAGEVIEW_SQ.removeValue(forKey: name)
        if p != nil {
            print("Cleared activity data for '\(name)' at index \(p!)")
        } else {
            print("No pageview activity data to clear for '\(name)'")
        }
        let s: Int? = SESSION_SQ.removeValue(forKey: name)
        if s != nil {
            print("Cleared activity data for '\(name)' at index \(s!)")
        } else {
            print("No session activity data to clear for '\(name)'")
        }
    }
}

print("start")

import Foundation

if #available(OSX 10.12, *) {
    EPC.shared.configure("https://pai-test.wmflabs.org/streams")
    EPC.shared.log("edit", ["pagename": "Antipodal Bluegill Gorilla"])
    EPC.shared.log("click", ["message": "hello, world!"])
    EPC.shared.log("clix", ["message": "not supposed to send"])
} else {
    // Fallback on earlier versions
}

RunLoop.current.run()

print("end")

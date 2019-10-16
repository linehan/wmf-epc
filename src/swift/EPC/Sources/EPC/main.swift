print("start")

import Foundation

if #available(OSX 10.12, *) {
    try EPC.shared.event("edit", ["pagename": "Antipodal Bluegill Gorilla"])
    try EPC.shared.event("click", ["message": "hello, world!"])
} else {
    // Fallback on earlier versions
}

RunLoop.current.run()

print("end")

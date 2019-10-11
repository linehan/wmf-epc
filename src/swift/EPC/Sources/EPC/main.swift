print("start")

import Foundation

try EPC.shared.event("click", ["message": "hello, world!"])
try EPC.shared.event("edit", ["pagename": "Antipodal Bluegill Gorilla"])

RunLoop.current.run()

print("end")

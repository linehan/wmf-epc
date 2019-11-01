#
# The default starting point for the Makefile
#
# A target is considered as an executable if it contains a file named
# main.swift. The package manager will compile that file into a binary
# executable. Alternatively, there is `swift run` which will build and execute
# the binary from the .build directory.
#
default:
	swift build

#
# This is here as a convenience to run the program with
# the extra libraries in place.
#
run:
	./.build/x86_64-apple-macosx/debug/EPC

#
# Get rid of .build
#
clean:
	rm -rf ./.build

#
# List of source files, one for each class. The order does matter if there
# is dependency between the classes.
#
SOURCES = \
	Integration.java \
	Output.java \
	Token.java \
	Stream.java \
	EPC.java \
	Main.java

#
# Which of the sources has the main function?
#
MAIN = Main

#
# List of libraries, in the form of .jar files, that should be
# referenced in the classpath when building.
#
LIBRARIES = \
	json.jar

#
# The default starting point for the Makefile
#
# javac works properly only when it is being invoked on all
# the source files at the same time.
#
default:
	javac -g -classpath $(LIBRARIES) $(SOURCES)

#
# This is here as a convenience to run the program with
# the extra libraries in place.
#
run:
	java -classpath $(LIBRARIES): $(MAIN)

#
# Clean up all the generated .class files.
#
clean:
	rm -f *.class

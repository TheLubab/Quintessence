// Structural commands.
// A command is a validated, serializable state change the application applies
// to its canonical tree. Space emits commands; it never mutates that tree.
//
// Pure helpers: validateCommand(root, command), applyCommand(root, command).
// Action machinery.
// ActionDescriptor is the semantic, serializable verb offered by a kind or node.
// Intent is a proposal to use one. Handlers live in an ActionRegistry keyed by
// action id; descriptors never contain closures.
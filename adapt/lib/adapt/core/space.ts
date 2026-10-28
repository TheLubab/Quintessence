// Space runtime.
// Projection of the app-owned tree: reconcile by id, attention/focus,
// visibility, density, overflow, collision, springs, drag/drop, action ring.
// Structural gestures emit commands; Space never mutates the canonical tree.
// Receives layouts and a renderer through its factory; owns no backend code.
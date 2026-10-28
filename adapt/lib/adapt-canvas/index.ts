// adapt-canvas: the Canvas 2D host for adapt.
// This is its own library, like react-dom is to react.
//
// Implements the core Renderer contract: pixels, images, text measurement,
// clipping, pointer/wheel/pinch input, and the rAF loop.
// It knows Paint/Frame/Input from $adapt/core; never Node, Kind, or Space.
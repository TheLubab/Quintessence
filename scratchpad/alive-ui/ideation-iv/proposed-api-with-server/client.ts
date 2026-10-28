// @ts-nocheck
import { connect } from "adapt/client";
import { canvasView } from "adapt-canvas";

const adapt = connect({
  endpoint: "/api/adapt",
});

// A user can own multiple spaces.
const spaces = await adapt.spaces.list();
const space = await adapt.spaces.open("holiday");

// When the user creates a space:
const space = await adapt.spaces.create({ title: "Holiday" });
// The server assigns ownership from the authenticated user.

const session = space.session();

canvasView({
  session,
  canvas: document.querySelector("#canvas")!,
});

// Called by your file picker or drop handler.
async function bringPhoto(file: File) {
  // Upload belongs to this space and uses its access policy.
  const asset = await space.assets.upload(file);

  const photo = await space.add({
    type: "image",
    data: {
      title: file.name,
      assetId: asset.id,
    },
    actions: [{ id: "image.warm", label: "Warm the light" }],
  });

  session.focus(photo); // Local; no server round trip.
}

// Choosing an action invokes its server implementation.
await session.invoke(photoId, "image.warm");
// Progress and resulting things arrive through the connection.

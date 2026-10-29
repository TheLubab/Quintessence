// @ts-nocheck
import { connect } from "adapt/client";
import { canvasView } from "adapt-canvas";

const adapt = connect({
  endpoint: "/api/adapt",
});

// A user can own multiple spaces.
// In a real application, the user chooses which one to open.
const spaces = await adapt.spaces.list();
const existing = spaces.items[0];

const space = existing
  ? await adapt.spaces.open(existing.id)
  : await adapt.spaces.create({ title: "Holiday" });

// Attention and currently offered actions belong to this session.
const session = space.session();

const view = canvasView({
  session,
  canvas: document.querySelector<HTMLCanvasElement>("#canvas")!,
});

// Called by your file picker or drop handler.
async function bringPhoto(file: File) {
  // Upload belongs to this space and uses its access policy.
  const asset = await space.assets.upload(file);

  // Things contain data, not menus or executable handlers.
  const photoId = await space.add({
    type: "image",
    data: {
      title: file.name,
      assetId: asset.id,
    },
  });

  session.focus(photoId); // Local; no server round trip.

  // Offer an action in the context of this photo.
  // Its ID identifies the offer, not the capability.
  session.actions.replace(photoId, "photo-tools", [
    {
      id: "warm-light",
      label: "Warm the light",
      category: "editing",

      capability: "image.warm",
      targets: [photoId],
    },
  ]);

  return photoId;
}

// Called by the presenter when the user selects this offer.
async function chooseWarmLight(photoId: string) {
  // Resolves the current offer and sends its capability,
  // targets, and input to the server.
  //
  // Returns when execution has been accepted, not when it finishes.
  const operation = await session.invoke(photoId, "warm-light");

  return operation;
}

// Background code can replace its own contribution at any time.
function offerSuggestedEdit(photoId: string) {
  session.actions.replace(photoId, "image-analysis", [
    {
      id: "suggest-warmer-light",
      label: "Give this photo warmer light",
      category: "editing",

      // Same capability, different contextual offer.
      capability: "image.warm",
      targets: [photoId],

      recommendation: {
        relevance: 0.9,
        reason: "Warmer tones could suit this evening scene.",
      },
    },
  ]);
}

// Removing one contribution leaves the others intact.
function clearSuggestedEdits(photoId: string) {
  session.actions.replace(photoId, "image-analysis", []);
}

// The session notifies its presenter when:
// - offered actions change;
// - an operation starts, succeeds, or fails;
// - resulting things enter the client cache.
//
// Focus remains local and does not automatically move to a result.

// Cleanup:
// view.destroy();
// session.destroy();
// adapt.close();

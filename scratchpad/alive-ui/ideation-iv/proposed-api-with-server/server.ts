// @ts-nocheck
import { createServer } from "adapt/server";
import { image, collection } from "adapt/things";
import { sqliteStorage } from "adapt/storage/sqlite";
import { filesystemAssets } from "adapt/assets/filesystem";

import { authenticate } from "./auth";
import { warmImage } from "./tools";

const adapt = createServer({
  types: [image, collection],

  // Persistent workspace data and operation records.
  storage: sqliteStorage({
    filename: "/data/adapt.sqlite",
    journalMode: "wal",
  }),

  // Asset adapter. Handlers use the space-scoped API below.
  assets: filesystemAssets({
    directory: "/data/assets",
  }),

  // Application-supplied authentication.
  authenticate: (request) => authenticate(request),

  // Enforced for requests, operation access, and change delivery.
  authorizeSpace: ({ user, space }) => space.ownerId === user.id,
});

// Register executable behavior.
//
// Registration does not automatically offer an action,
// display a button, or modify matching things.
adapt.capability("image.warm", {
  // Applicability only. This does not grant authorization.
  supports: ({ targets }) =>
    targets.length === 1 &&
    targets[0].type === "image" &&
    typeof targets[0].data.assetId === "string",

  async run({ space, targets, signal }) {
    const [photo] = targets;

    // The server resolves targets from authoritative storage.
    // `space` and its asset API are scoped to the authorized space.
    const input = await space.assets.open(photo.data.assetId);

    // Application tool; consumes and produces streams.
    // Expensive work runs outside database transactions.
    const output = await warmImage(input, { signal });

    const asset = await space.assets.save(output, {
      mimeType: "image/jpeg",
    });

    const resultId = await space.add({
      type: "image",
      parent: photo.parent,
      data: {
        title: "Warmer version",
        assetId: asset.id,
      },
    });

    // Explicit result references become part of the operation.
    return {
      things: [resultId],
    };
  },
});

// Mount at /api/adapt using your HTTP framework.
export const handleRequest = adapt.handle;

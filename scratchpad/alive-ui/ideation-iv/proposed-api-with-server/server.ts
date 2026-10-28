// @ts-nocheck
import { createServer } from "adapt/server";
import { image, collection } from "adapt/things";
import { sqliteStorage } from "adapt/storage/sqlite";
import { filesystemAssets } from "adapt/assets/filesystem";

import { authenticate } from "./auth";
import { warmImage } from "./tools";

const assets = filesystemAssets({
  directory: "/data/assets",
});

const adapt = createServer({
  types: [image, collection],

  // Things, spaces, ownership, and operation status.
  storage: sqliteStorage({
    filename: "/data/adapt.sqlite",
    journalMode: "wal",
  }),

  // Uploaded files and generated outputs.
  assets,

  // Application-supplied authentication.
  authenticate: (request) => authenticate(request),

  // Called before accessing an existing space or its assets.
  authorizeSpace: ({ user, space }) => space.ownerId === user.id,
});

adapt.action("image.warm", {
  accepts: ["image"],

  async run({ space, target, signal }) {
    const input = await assets.open(target.data.assetId);

    // Application tool; consumes and produces streams.
    // Expensive work runs outside database transactions.
    const output = await warmImage(input, { signal });

    const asset = await assets.save(output, {
      mimeType: "image/jpeg",
    });

    return space.add({
      type: "image",
      parent: target.parent,
      data: {
        title: "Warmer version",
        assetId: asset.id,
      },
    });
  },
});

// Mount at /api/adapt using your HTTP framework.
export const handleRequest = adapt.handle;

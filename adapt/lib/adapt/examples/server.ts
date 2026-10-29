//@ts-nocheck
import { createServer } from "../server/index.ts";
import { sqliteStorage } from "../storage/sqlite/index.ts";

const adapt = createServer({
  types: [image, collection],

  storage: sqliteStorage({
    filename: "./adapt.sqlite",
  }),

  async scope(request) {
    const user = await myAuth.getUser(request);

    return user ? user.id : null;
  },

  // For one shared installation;
  // scope: () => "personal"

  onError(error) {
    myLogger.error(error);
  },
});

// Your HTTP framework mounts this at /api/adapt.
export const handleRequest = adapt.handle;

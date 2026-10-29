// @ts-nocheck
import { connect } from "../client";

const adapt = connect({
  endpoint: "/api/adapt",

  fetch(input, init) {
    const headers = new Headers(init?.headers);

    headers.set("Authorization", `Bearer ${myAuth.getAccessToken()}`);

    return fetch(input, {
      ...init,
      headers,
    });
  },
});

const space = await adapt.spaces.create({
  title: "Research",
});

const id = await space.add({
  type: "collection",
  data: { title: "Papers" },
});

const thing = space.peek(id);

// On logout or account switch, call adapt.close() and create a new client.
// That prevents the previous account’s cache from being reused.
adapt.close();

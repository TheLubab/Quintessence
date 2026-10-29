import { createAdapt } from "../server/runtime";
import { memoryStorage } from "../storage/memory";
import { sqliteStorage } from "../storage/sqlite";
import { collection, image } from "./contracts";

// Pass --memory for a temporary workspace.
const storage = process.argv.includes("--memory")
  ? memoryStorage()
  : sqliteStorage({ filename: "adapt-demo.sqlite" });

const adapt = createAdapt({
  storage,
  types: [collection, image],
});

try {
  const existing = (await adapt.spaces.list({ limit: 1 })).items[0];

  const space = existing
    ? await adapt.spaces.open(existing.id)
    : await adapt.spaces.create({ title: "Ideas" });

  if (!existing) {
    const trip = await space.add({
      type: "collection",
      data: { title: "Summer trip" },
    });

    await space.add({
      type: "image",
      parent: trip,
      data: {
        // Structured storage example; no asset upload happens here.
        assetId: "example-asset",
        title: "Evening at the lake",
      },
      actions: [{ id: "image.warm", label: "Warm the light" }],
    });
  }

  console.log(existing ? "Reopened space:" : "Created space:", space.id);

  const roots = await space.list();

  for (const thing of roots.items) {
    console.log(thing);

    if (thing.type === "collection") {
      console.log((await space.list({ parent: thing.id })).items);
    }
  }
} finally {
  await adapt.close();
}

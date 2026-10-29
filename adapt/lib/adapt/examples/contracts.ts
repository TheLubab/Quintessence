import type { Space, ThingUpdate, TypeDefinition } from "../core/index.ts";

type ImageData = {
  assetId: string;
  title?: string;
};

// Example definitions, not a standard library or a type registry implementation.
export const image: TypeDefinition<ImageData> = {
  name: "image",
  validate(data): data is ImageData {
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "assetId" in data &&
      typeof data.assetId === "string" &&
      (!("title" in data) || typeof data.title === "string")
    );
  },
};

type CollectionData = { title: string };

export const collection: TypeDefinition<CollectionData> = {
  name: "collection",
  contains: true,
  validate(data): data is CollectionData {
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "title" in data &&
      typeof data.title === "string"
    );
  },
};

// Compile-only example. A future runtime must register these definitions and
// the image.warm handler before this function can be used with a real space.
// Nothing runs on import.
export async function example(space: Space): Promise<void> {
  const trip = await space.add({
    type: collection.name,
    data: { title: "Summer trip" },
  });

  const photo = await space.add({
    type: image.name,
    parent: trip,
    data: {
      assetId: "asset-1", // An existing, accessible asset; no upload happens here.
      title: "Evening at the lake",
    } satisfies ImageData,
    actions: [{ id: "image.warm", label: "Warm the evening light" }],
  });

  const thing = await space.get(photo);
  if (!thing || thing.type !== image.name || !image.validate(thing.data)) {
    throw new Error("Expected an image");
  }

  const patch = {
    // data replaces the whole field, so retain assetId explicitly.
    data: { ...thing.data, title: "Lake at dusk" },
  } satisfies ThingUpdate<ImageData>;

  await space.update(photo, patch);
  await space.update(photo, { actions: [] });
  await space.move(photo, { parent: null });
  await space.remove(trip); // Now empty. The photo remains at the root.
}

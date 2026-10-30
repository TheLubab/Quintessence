import type { TypeDefinition } from "../core/contracts.ts";

export type CollectionData = { title: string };

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
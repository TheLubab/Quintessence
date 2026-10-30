import type { TypeDefinition } from "../core/contracts.ts";

export type ImageData = {
  assetId: string;
  title?: string;
  src?: string;
};

export const image: TypeDefinition<ImageData> = {
  name: "image",
  validate(data): data is ImageData {
    return (
      typeof data === "object" &&
      data !== null &&
      !Array.isArray(data) &&
      "assetId" in data &&
      typeof data.assetId === "string" &&
      (!("title" in data) || typeof data.title === "string") &&
      (!("src" in data) || typeof data.src === "string")
    );
  },
};
import type { TypeDefinition } from "../core/contracts.ts";

import { collection } from "./collection.ts";
import { file } from "./file.ts";
import { image } from "./image.ts";

export { collection, type CollectionData } from "./collection.ts";
export { image, type ImageData } from "./image.ts";
export { file, MAX_FILE_BYTES, type FileData } from "./file.ts";

/** Every thing type known to the standard catalog. */
export const catalog = [image, collection, file] as const;

export const types: readonly TypeDefinition[] = catalog;

export const sessionTypes = catalog.map(({ name, contains }) =>
  contains === undefined ? { name } : { name, contains },
);
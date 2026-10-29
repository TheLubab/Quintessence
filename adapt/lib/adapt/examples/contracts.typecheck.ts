import type {
  ActionDescriptor,
  Space,
  Thing,
  ThingUpdate,
  Value,
} from "../src/";

// Compile-only assertions. An unused @ts-expect-error fails the type check.
export function checkContracts(space: Space, thing: Thing): void {
  // @ts-expect-error Identity cannot be changed through update.
  void space.update("photo-1", { id: "photo-2" });
  // @ts-expect-error Type is immutable.
  void space.update("photo-1", { type: "collection" });
  // @ts-expect-error Containment changes go through move.
  void space.update("photo-1", { parent: null });
  // @ts-expect-error Explicit undefined is not an omitted field.
  void space.update("photo-1", { data: undefined });
  // @ts-expect-error A move requires an explicit destination.
  void space.move("photo-1", {});
  // @ts-expect-error Functions are not thing data.
  void space.add({ type: "image", data: { load: () => "asset-1" } });
  // @ts-expect-error Snapshot fields are read-only.
  thing.parent = null;
  // @ts-expect-error Snapshot action lists are read-only.
  thing.actions.push({ id: "image.warm", label: "Warm" });
}

// @ts-expect-error Binary contents belong in assets, not thing data.
export const binary: Value = new Uint8Array(1);
// @ts-expect-error Descriptors carry data, not executable handlers.
export const action: ActionDescriptor = { id: "warm", label: "Warm", run() {} };
export const patch: ThingUpdate<{ assetId: string; title: string }> = {
  // @ts-expect-error Supplying data requires a complete replacement.
  data: { title: "New" },
};

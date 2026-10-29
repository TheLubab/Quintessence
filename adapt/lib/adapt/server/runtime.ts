import { randomUUID } from "node:crypto";

import type {
  ListOptions,
  Page,
  Space,
  SpaceInfo,
  Thing,
  TypeDefinition,
} from "../core/contracts";

import type {
  StorageAdapter,
  StorageReader,
  StorageTransaction,
} from "../storage/contracts";

import {
  actionList,
  dataValue,
  page,
  pagination,
  parentId,
  record,
  text,
} from "../core/validation";
import { AdaptError } from "../core/errors";

export interface Adapt {
  readonly spaces: {
    create(input: { title: string }): Promise<Space>;

    open(id: string): Promise<Space>;

    list(options?: ListOptions): Promise<Page<SpaceInfo>>;
  };

  /** This runtime owns the supplied adapter's lifetime. */
  close(): Promise<void>;
}

/** Local runtime. HTTP, authentication, sessions, and jobs come later. */
export function createAdapt(options: {
  types: readonly TypeDefinition[];
  storage: StorageAdapter;
  scope?: string;
}): Adapt {
  const { storage } = options;
  const scope = text(options.scope ?? "personal", "scope");
  const types = new Map<string, TypeDefinition>();

  const requireSpace = (reader: StorageReader, id: string): SpaceInfo => {
    const space = reader.getSpace(scope, id);

    if (!space) {
      throw new AdaptError("NOT_FOUND", "Space not found");
    }

    return space;
  };

  for (const definition of options.types) {
    const name = text(definition.name, "type name");

    if (types.has(name)) {
      throw new AdaptError("CONFLICT", `Duplicate type: ${name}`);
    }

    if (
      typeof definition.validate !== "function" ||
      (definition.contains !== undefined &&
        typeof definition.contains !== "boolean")
    ) {
      throw new AdaptError("INVALID_INPUT", `Invalid type definition: ${name}`);
    }

    types.set(name, { ...definition });
  }

  function typeOf(name: string): TypeDefinition {
    const definition = types.get(name);

    if (!definition) {
      throw new AdaptError("INVALID_INPUT", `Unknown type: ${name}`);
    }

    return definition;
  }

  function validData(type: string, value: unknown) {
    const data = dataValue(value);

    if (typeOf(type).validate(data) !== true) {
      throw new AdaptError("INVALID_INPUT", `Invalid data for type: ${type}`);
    }

    return data;
  }

  function requireThing(
    reader: StorageReader,
    spaceId: string,
    id: string,
  ): Thing {
    const thing = reader.getThing(spaceId, id);

    if (!thing) {
      throw new AdaptError("NOT_FOUND", `Thing not found: ${id}`);
    }

    return thing;
  }

  function checkParent(
    reader: StorageReader,
    spaceId: string,
    parent: string | null,
  ): void {
    if (
      parent !== null &&
      !typeOf(requireThing(reader, spaceId, parent).type).contains
    ) {
      throw new AdaptError(
        "INVALID_INPUT",
        "Parent type does not allow children",
      );
    }
  }

  function openSpace(info: SpaceInfo): Space {
    const spaceId = info.id;

    function read<T>(work: (reader: StorageReader) => T): Promise<T> {
      return storage.read((reader) => {
        requireSpace(reader, spaceId);
        return work(reader);
      });
    }

    function write<T>(
      work: (transaction: StorageTransaction) => T,
    ): Promise<T> {
      return storage.write((transaction) => {
        requireSpace(transaction, spaceId);
        return work(transaction);
      });
    }

    return {
      ...info,

      async add(input) {
        const fields = record(input, ["type", "parent", "data", "actions"]);

        const type = text(fields.type, "type");

        const thing: Thing = {
          id: randomUUID(),
          type,
          parent: "parent" in fields ? parentId(fields.parent) : null,
          data: validData(type, fields.data),
          actions: "actions" in fields ? actionList(fields.actions) : [],
        };

        await write((tx) => {
          checkParent(tx, spaceId, thing.parent);
          tx.insertThing(spaceId, thing);
        });

        return thing.id;
      },

      async get(id) {
        text(id, "id");

        return read((reader) => reader.getThing(spaceId, id));
      },

      async list(options = {}) {
        const fields = record(options, ["limit", "after", "parent"]);

        const parent = "parent" in fields ? parentId(fields.parent) : null;

        const query = pagination(fields);

        return read((reader) => {
          checkParent(reader, spaceId, parent);

          const rows = reader.listThings(spaceId, parent, {
            ...query,
            limit: query.limit + 1,
          });

          return page(rows, query.limit);
        });
      },

      async update(id, patch) {
        text(id, "id");

        const fields = record(dataValue(patch), ["data", "actions"]);

        await write((tx) => {
          const thing = requireThing(tx, spaceId, id);

          if (Object.keys(fields).length === 0) {
            return;
          }

          tx.updateThing(spaceId, {
            ...thing,
            data:
              "data" in fields
                ? validData(thing.type, fields.data)
                : thing.data,
            actions:
              "actions" in fields ? actionList(fields.actions) : thing.actions,
          });
        });
      },

      async move(id, destination) {
        text(id, "id");

        const parent = parentId(record(destination, ["parent"]).parent);

        await write((tx) => {
          const thing = requireThing(tx, spaceId, id);

          checkParent(tx, spaceId, parent);

          let ancestor = parent;

          while (ancestor !== null) {
            if (ancestor === id) {
              throw new AdaptError(
                "INVALID_INPUT",
                "A move cannot create a containment cycle",
              );
            }

            ancestor = requireThing(tx, spaceId, ancestor).parent;
          }

          if (thing.parent !== parent) {
            tx.updateThing(spaceId, { ...thing, parent });
          }
        });
      },

      async remove(id, options = {}) {
        text(id, "id");

        const fields = record(options, ["recursive"]);

        if ("recursive" in fields && typeof fields.recursive !== "boolean") {
          throw new AdaptError("INVALID_INPUT", "recursive must be a boolean");
        }

        await write((tx) => {
          requireThing(tx, spaceId, id);

          if (fields.recursive !== true) {
            const children = tx.listThings(spaceId, id, {
              limit: 1,
              after: null,
            });

            if (children.length) {
              throw new AdaptError(
                "INVALID_INPUT",
                "Thing has children; use recursive: true",
              );
            }

            tx.deleteThing(spaceId, id);
            return;
          }

          // Visit only this subtree.
          const ids = [id];

          for (let index = 0; index < ids.length; index++) {
            let after: string | null = null;

            while (true) {
              const children = tx.listThings(spaceId, ids[index]!, {
                limit: 200,
                after,
              });

              ids.push(...children.map((child) => child.id));

              if (children.length < 200) {
                break;
              }

              after = children.at(-1)!.id;
            }
          }

          // Descendants must be removed before their parents.
          for (let index = ids.length - 1; index >= 0; index--) {
            tx.deleteThing(spaceId, ids[index]!);
          }
        });
      },
    };
  }

  return {
    spaces: {
      async create(input) {
        const fields = record(input, ["title"]);

        const info = {
          id: randomUUID(),
          title: text(fields.title, "title"),
        };

        await storage.write((transaction) => {
          transaction.insertSpace(scope, info);
        });

        return openSpace(info);
      },

      async open(id) {
        text(id, "id");

        const info = await storage.read((reader) => requireSpace(reader, id));

        return openSpace(info);
      },

      async list(options = {}) {
        const query = pagination(record(options, ["limit", "after"]));

        return storage.read((reader) => {
          const rows = reader.listSpaces(scope, {
            ...query,
            limit: query.limit + 1,
          });

          return page(rows, query.limit);
        });
      },
    },

    close: () => storage.close(),
  };
}

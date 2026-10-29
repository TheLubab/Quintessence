import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { createAdapt } from "../server/runtime";

import type { Space, TypeDefinition, Value } from "../core/contracts";

import type { StorageAdapter, StorageTransaction } from "../storage/contracts";

import { memoryStorage } from "../storage/memory";
import { sqliteStorage } from "../storage/sqlite";

type Note = { text: string };

const note: TypeDefinition<Note> = {
  name: "note",
  validate: (data): data is Note =>
    typeof data === "object" &&
    data !== null &&
    "text" in data &&
    typeof data.text === "string",
};

const group: TypeDefinition<null> = {
  name: "group",
  contains: true,
  validate: (data): data is null => data === null,
};

// Tests the JSON boundary independently of domain validation.
const json: TypeDefinition = {
  name: "json",
  validate: (_): _ is Value => true,
};

const types = [note, group, json];

async function fixture(t: TestContext, adapter: "memory" | "sqlite") {
  const directory = await mkdtemp(join(tmpdir(), "adapt-test-"));
  const filename = join(directory, "adapt.sqlite");

  const storage =
    adapter === "memory" ? memoryStorage() : sqliteStorage({ filename });

  const adapt = createAdapt({ types, storage });

  t.after(async () => {
    await adapt.close();
    await rm(directory, { recursive: true, force: true });
  });

  const space = await adapt.spaces.create({ title: "Test" });

  return { adapt, storage, space, filename };
}

const addNote = (space: Space, text = "Hello", parent: string | null = null) =>
  space.add({
    type: "note",
    parent,
    data: { text },
  });

for (const adapter of ["memory", "sqlite"] as const) {
  test(`${adapter}: spaces, CRUD, and replacement`, async (t) => {
    const { adapt, space } = await fixture(t, adapter);

    assert.equal((await adapt.spaces.open(space.id)).title, "Test");

    await assert.rejects(adapt.spaces.open("missing"), /Space not found/);

    const id = await addNote(space);

    assert.deepEqual(await space.get(id), {
      id,
      type: "note",
      parent: null,
      data: { text: "Hello" },
      actions: [],
    });

    await space.update(id, {
      actions: [{ id: "edit", label: "Edit" }],
    });

    await space.update(id, {
      data: { text: "Changed" },
    });

    assert.deepEqual((await space.get(id))?.actions, [
      { id: "edit", label: "Edit" },
    ]);

    await space.update(id, { actions: [] });

    const before = await space.get(id);

    await space.update(id, {});
    await space.move(id, { parent: null });

    assert.deepEqual(await space.get(id), before);

    const value = await space.add({
      type: "json",
      data: { a: 1, b: 2 },
    });

    await space.update(value, { data: { a: 3 } });

    assert.deepEqual((await space.get(value))?.data, { a: 3 });

    await space.update(value, { data: null });

    assert.equal((await space.get(value))?.data, null);

    await space.remove(id);

    assert.equal(await space.get(id), undefined);

    for (const mutation of [
      () => space.update(id, {}),
      () => space.move(id, { parent: null }),
      () => space.remove(id),
    ]) {
      await assert.rejects(mutation, /Thing not found/);
    }
  });

  test(`${adapter}: containment and space isolation`, async (t) => {
    const { adapt, space } = await fixture(t, adapter);

    const outer = await space.add({
      type: "group",
      data: null,
    });

    const inner = await space.add({
      type: "group",
      data: null,
      parent: outer,
    });

    const leaf = await addNote(space, "Leaf", inner);

    const elsewhere = await adapt.spaces.create({
      title: "Elsewhere",
    });

    const foreign = await elsewhere.add({
      type: "group",
      data: null,
    });

    assert.equal(await elsewhere.get(leaf), undefined);

    await assert.rejects(elsewhere.update(leaf, {}), /Thing not found/);

    await assert.rejects(
      elsewhere.remove(leaf, { recursive: true }),
      /Thing not found/,
    );

    for (const parent of [outer, inner]) {
      await assert.rejects(space.move(outer, { parent }), /cycle/);
    }

    for (const parent of [foreign, "missing", leaf]) {
      await assert.rejects(space.move(outer, { parent }));
      await assert.rejects(addNote(space, "Invalid", parent));
    }

    assert.equal((await space.get(outer))?.parent, null);

    await space.move(inner, { parent: null });

    assert.equal((await space.get(leaf))?.parent, inner);

    await space.remove(outer);

    await assert.rejects(space.remove(inner), /children/);

    assert.ok(await space.get(leaf));

    await space.remove(inner, { recursive: true });

    assert.equal(await space.get(inner), undefined);
    assert.equal(await space.get(leaf), undefined);
    assert.ok(await elsewhere.get(foreign));
  });

  test(`${adapter}: pagination and large subtree removal`, async (t) => {
    const { adapt, space } = await fixture(t, adapter);

    const root = await space.add({
      type: "group",
      data: null,
    });

    const keep = await addNote(space, "Keep");
    const ids: string[] = [];

    for (let i = 0; i < 205; i++) {
      ids.push(await addNote(space, String(i), root));
    }

    const found: string[] = [];
    let after: string | null = null;

    do {
      const result = await space.list({
        parent: root,
        limit: 31,
        ...(after ? { after } : {}),
      });

      assert.ok(result.items.length <= 31);

      found.push(...result.items.map((thing) => thing.id));
      after = result.next;
    } while (after !== null);

    assert.deepEqual(found, ids.sort());
    assert.equal((await space.list()).items.length, 2);

    await space.remove(root, { recursive: true });

    assert.deepEqual(
      (await space.list()).items.map((thing) => thing.id),
      [keep],
    );

    for (const id of ids) {
      assert.equal(await space.get(id), undefined);
    }

    await adapt.spaces.create({ title: "Second" });

    const first = await adapt.spaces.list({ limit: 1 });

    assert.ok(first.next);

    const second = await adapt.spaces.list({
      limit: 1,
      after: first.next,
    });

    assert.equal(second.next, null);
    assert.notEqual(first.items[0]?.id, second.items[0]?.id);

    for (const limit of [0, -1, 201, 1.5, NaN, null, undefined]) {
      await assert.rejects(
        space.list({ limit } as unknown as { limit: number }),
      );
    }

    await assert.rejects(space.list({ parent: "missing" }));
  });

  test(`${adapter}: malformed writes leave state unchanged`, async (t) => {
    const { space } = await fixture(t, adapter);

    const id = await addNote(space);
    const before = await space.get(id);

    const invalidPatches = [
      { id: "new" },
      { type: "group" },
      { parent: null },
      { data: undefined },
      { data: {} },
      { data: { text: 1 } },
      { actions: undefined },
      { actions: null },
      {
        actions: [{ id: "a", label: "A", run() {} }],
      },
      {
        actions: [
          { id: "a", label: "A" },
          { id: "a", label: "Again" },
        ],
      },
    ];

    for (const patch of invalidPatches) {
      await assert.rejects(space.update(id, patch as never));

      assert.deepEqual(await space.get(id), before);
    }

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;

    let getterCalls = 0;

    const getter = {
      get value() {
        getterCalls++;
        return 1;
      },
    };

    const invalidData = [
      undefined,
      NaN,
      Infinity,
      1n,
      new Date(),
      new Uint8Array(1),
      () => {},
      cycle,
      { nested: undefined },
      [, 1],
      getter,
      { [Symbol("x")]: 1 },
    ];

    for (const data of invalidData) {
      await assert.rejects(space.add({ type: "json", data: data as Value }));
    }

    assert.equal(getterCalls, 0);

    await assert.rejects(space.add({ type: "unknown", data: null }));

    await assert.rejects(
      space.add({
        type: "note",
        data: { text: "New" },
        unexpected: true,
      } as never),
    );

    assert.equal((await space.list()).items.length, 1);

    const repeated = { shared: true };

    // Shared references aren't cycles.
    await space.add({
      type: "json",
      data: [repeated, repeated],
    });
  });

  test(`${adapter}: snapshots and inputs are detached`, async (t) => {
    const { adapt, space } = await fixture(t, adapter);

    const data = { nested: { count: 1 } };
    const actions = [{ id: "a", label: "A" }];

    const id = await space.add({
      type: "json",
      data,
      actions,
    });

    data.nested.count = 2;
    actions[0]!.label = "Changed";

    const snapshot = (await space.get(id))!;

    (snapshot.data as typeof data).nested.count = 3;
    (snapshot.actions[0] as { label: string }).label = "Changed again";

    assert.deepEqual((await space.get(id))?.data, { nested: { count: 1 } });

    assert.equal((await space.get(id))?.actions[0]?.label, "A");

    const listed = (await space.list()).items[0]!;

    (listed.data as typeof data).nested.count = 4;

    assert.deepEqual((await space.get(id))?.data, { nested: { count: 1 } });

    const patch = { data: { nested: { count: 5 } } };

    await space.update(id, patch);
    patch.data.nested.count = 6;

    assert.deepEqual((await space.get(id))?.data, { nested: { count: 5 } });

    const info = (await adapt.spaces.list()).items[0]!;

    (info as { title: string }).title = "Changed";

    assert.equal((await adapt.spaces.open(space.id)).title, "Test");
  });

  test(`${adapter}: rollback, transaction lifetime, and close`, async (t) => {
    const { storage, space, adapt } = await fixture(t, adapter);

    const id = await addNote(space);
    let escaped: StorageTransaction | undefined;

    await assert.rejects(
      storage.write((tx) => {
        escaped = tx;

        tx.deleteThing(space.id, id);
        tx.insertSpace({
          id: "rolled-back",
          title: "No",
        });

        throw new Error("Injected failure");
      }),
      /Injected failure/,
    );

    assert.ok(await space.get(id));

    await assert.rejects(adapt.spaces.open("rolled-back"));

    assert.throws(() => escaped!.deleteThing(space.id, id), /ended/);

    await assert.rejects(
      storage.write(async (tx) => {
        tx.deleteThing(space.id, id);

        await Promise.resolve();

        tx.deleteThing(space.id, id);
      }),
      /synchronous/,
    );

    assert.ok(await space.get(id));

    await adapt.close();
    await adapt.close();

    await assert.rejects(space.get(id), /closed/);
    await assert.rejects(addNote(space), /closed/);
  });

  test(`${adapter}: recursive deletion rolls back partial failure`, async (t) => {
    const { storage, space } = await fixture(t, adapter);

    const root = await space.add({
      type: "group",
      data: null,
    });

    const children = [
      await addNote(space, "A", root),
      await addNote(space, "B", root),
    ];

    const failing: StorageAdapter = {
      ...storage,

      write: (work) =>
        storage.write((tx) => {
          let deletions = 0;

          return work({
            ...tx,

            deleteThing(spaceId, id) {
              tx.deleteThing(spaceId, id);

              if (++deletions === 2) {
                throw new Error("Injected delete failure");
              }
            },
          });
        }),
    };

    const runtime = createAdapt({
      types,
      storage: failing,
    });

    const target = await runtime.spaces.open(space.id);

    await assert.rejects(
      target.remove(root, { recursive: true }),
      /Injected delete failure/,
    );

    for (const id of [root, ...children]) {
      assert.ok(await space.get(id));
    }
  });
}

test("memory instances are independent", async () => {
  const first = createAdapt({
    types,
    storage: memoryStorage(),
  });

  const second = createAdapt({
    types,
    storage: memoryStorage(),
  });

  try {
    const space = await first.spaces.create({
      title: "Temporary",
    });

    await assert.rejects(second.spaces.open(space.id));

    assert.deepEqual((await second.spaces.list()).items, []);
  } finally {
    await first.close();
    await second.close();
  }
});

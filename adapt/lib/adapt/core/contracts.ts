/** JSON-shaped data. Runtime validation must also reject non-finite numbers and cycles. */
export type Value =
  | null
  | boolean
  | number
  | string
  | readonly Value[]
  | { readonly [key: string]: Value };

/** An available operation, not its executable implementation. */
export type ActionDescriptor = {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
};

/** A snapshot of a thing in a space. Changing this object does not update the space. */
export type Thing<D extends Value = Value> = {
  readonly id: string;
  readonly type: string;
  readonly parent: string | null;
  readonly data: D;
  readonly actions: readonly ActionDescriptor[];
};

/** Developer-supplied semantics, independent of storage and presentation. */
export type TypeDefinition<D extends Value = Value> = {
  readonly name: string;
  /** Defaults to false. Containment is represented by children's parent IDs. */
  readonly contains?: boolean;
  /** Synchronous, side-effect-free validation of this type's data. */
  readonly validate: (data: unknown) => data is D;
};

export type ThingCreate<D extends Value = Value> = {
  readonly type: string;
  readonly data: D;
  /** Defaults to null (the space root). */
  readonly parent?: string | null;
  /** Defaults to an empty array. */
  readonly actions?: readonly ActionDescriptor[];
};

/** Omitted fields stay unchanged. Supplied fields are replaced, never deep-merged. */
export type ThingUpdate<D extends Value = Value> = {
  readonly data?: D;
  readonly actions?: readonly ActionDescriptor[];
};

export type SpaceInfo = {
  readonly id: string;
  readonly title: string;
};

export type ListOptions = {
  /** Defaults to 50. Must be an integer from 1 to 200. */
  readonly limit?: number;

  /** Resume after this ID, keeping the same filters. */
  readonly after?: string;
};

export type ThingListOptions = ListOptions & {
  /** Immediate children. Defaults to null: workspace roots. */
  readonly parent?: string | null;
};

export type Page<T> = {
  readonly items: readonly T[];
  readonly next: string | null;
};

/**
 * The initial data API for one space; this is a contract, not a runtime.
 * Implementations validate all external inputs before committing a mutation.
 * Each mutation is atomic. Rejected mutations leave the space unchanged.
 */
export interface Space extends SpaceInfo {
  /** Assign a stable ID and add a thing with a registered, valid type. */
  add(input: ThingCreate): Promise<string>;

  /** Read a snapshot; return undefined if the ID does not exist in this space. */
  get(id: string): Promise<Thing | undefined>;

  /** List */
  list(options?: ThingListOptions): Promise<Page<Thing>>;

  /**
   * Replace data and/or actions. ID, type, and parent cannot be updated here.
   * An empty patch is a no-op for an existing thing. A missing thing is an error.
   */
  update(id: string, patch: ThingUpdate): Promise<void>;

  /**
   * Move a thing and its contents without changing their IDs or data.
   * The parent must permit children and exist in this space, or be null.
   * Reject missing things, self-parenting, and moves into descendants.
   * Moving to the current parent is a no-op. Child order is unspecified.
   */
  move(id: string, destination: { parent: string | null }): Promise<void>;

  /**
   * Remove a thing, rejecting missing IDs and nonempty things by default.
   * recursive: true removes its entire subtree atomically.
   * Removal never directly deletes referenced assets.
   */
  remove(id: string, options?: { recursive?: boolean }): Promise<void>;
}

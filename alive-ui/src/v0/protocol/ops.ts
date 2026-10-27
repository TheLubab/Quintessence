import type {
  ActionName,
  CheckedProps,
  EventName,
  KindName,
  PropValue,
} from "./schema";

/** Props exactly as written. `null` means `key=` with no value (remove the prop). */
export type RawProps = Record<string, string | null>;

export type Action = { type: ActionName; intent: string };

/**
 * What the parser emits and the runtime accepts.
 * Closed enums are validated by the parser. Props, id existence and tree state
 * are checked by the runtime.
 */
export type Op =
  | { t: "create"; kind: KindName; id: string; in?: string; props: RawProps }
  | { t: "update"; id: string; props: RawProps }
  | { t: "delete"; id: string }
  | {
      t: "move";
      id: string;
      in: string;
      at?: { rel: "before" | "after"; ref: string };
    }
  | { t: "rule_add"; id: string; event: EventName; action: Action }
  | { t: "rule_del"; id: string; event: EventName };

export type OpType = Op["t"];

export type CheckedOp =
  | {
      t: "create";
      kind: KindName;
      id: string;
      in?: string;
      props: Record<string, PropValue>;
      issues: string[];
      replace?: true;
    }
  | {
      t: "update";
      id: string;
      props: CheckedProps;
      issues: string[];
      noop: boolean;
    }
  | { t: "delete"; id: string }
  | {
      t: "move";
      id: string;
      in: string;
      at?: { rel: "before" | "after"; ref: string };
    }
  | { t: "rule_add"; id: string; event: EventName; action: Action }
  | { t: "rule_del"; id: string; event: EventName };

export type Patch =
  | {
      t: "create";
      id: string;
      kind: KindName;
      parent: string | null;
      index: number;
      props: Record<string, PropValue>;
      draft?: true;
    }
  | {
      t: "update";
      id: string;
      props: Record<string, PropValue>;
      removed: string[];
      draft?: true;
    }
  | { t: "move"; id: string; parent: string; index: number }
  | { t: "remove"; id: string; removed: string[] }
  | { t: "rule"; id: string; event: EventName; action: Action | null }
  | { t: "draft_remove"; id: string };

/** A rejected statement, echoed to the model next turn as `ERROR <line> :: <reason>`. */
export interface Rejection {
  line: string;
  reason: string;
}

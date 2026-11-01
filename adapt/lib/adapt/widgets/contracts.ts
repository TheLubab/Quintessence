export type WidgetField = {
  readonly key: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean";
  readonly value: string | number | boolean;
  readonly editable: boolean;
};

export type WidgetListItem = {
  readonly label: string;
  readonly detail: string | null;
  readonly target: string | null;
};

export type WidgetChartItem = {
  readonly label: string;
  readonly value: number;
};

export type WidgetTimelineItem = {
  readonly label: string;
  readonly detail: string | null;
  readonly time: string | null;
};

export type WidgetComparisonItem = {
  readonly label: string;
  readonly left: string;
  readonly right: string;
};

export type WidgetChecklistItem = {
  readonly label: string;
  readonly detail: string | null;
  readonly done: boolean;
  readonly field: string | null;
};

export type WidgetHighlightItem = {
  readonly label: string;
  readonly detail: string | null;
};

export type WidgetStepItem = {
  readonly label: string;
  readonly detail: string | null;
  readonly time: string | null;
};

export type WidgetActionKind =
  | "toggle"
  | "set"
  | "increment"
  | "decrement"
  | "append";

export type WidgetActionItem = {
  readonly id: string;
  readonly label: string;
  readonly kind: WidgetActionKind;
  readonly key: string;
  readonly value: string | number | boolean | null;
};

export type WidgetVisual = {
  readonly id: string;
  readonly kind: "visual";
  readonly title: string;
  readonly caption: string | null;
  readonly prompt: string;
  readonly src: string | null;
  readonly assetId: string | null;
};

export type Widget =
  | {
      readonly id: string;
      readonly kind: "text";
      readonly title: string;
      readonly body: string;
    }
  | {
      readonly id: string;
      readonly kind: "metric";
      readonly title: string;
      readonly value: string;
      readonly caption: string | null;
    }
  | {
      readonly id: string;
      readonly kind: "list";
      readonly title: string;
      readonly items: readonly WidgetListItem[];
    }
  | {
      readonly id: string;
      readonly kind: "table";
      readonly title: string;
      readonly columns: readonly string[];
      readonly rows: readonly (readonly string[])[];
    }
  | {
      readonly id: string;
      readonly kind: "fields";
      readonly title: string;
      readonly fields: readonly WidgetField[];
    }
  | {
      readonly id: string;
      readonly kind: "bars" | "line";
      readonly title: string;
      readonly caption: string | null;
      readonly items: readonly WidgetChartItem[];
    }
  | {
      readonly id: string;
      readonly kind: "timeline";
      readonly title: string;
      readonly items: readonly WidgetTimelineItem[];
    }
  | {
      readonly id: string;
      readonly kind: "comparison";
      readonly title: string;
      readonly left: string;
      readonly right: string;
      readonly items: readonly WidgetComparisonItem[];
    }
  | {
      readonly id: string;
      readonly kind: "checklist";
      readonly title: string;
      readonly items: readonly WidgetChecklistItem[];
    }
  | {
      readonly id: string;
      readonly kind: "highlight";
      readonly title: string;
      readonly items: readonly WidgetHighlightItem[];
    }
  | {
      readonly id: string;
      readonly kind: "steps";
      readonly title: string;
      readonly items: readonly WidgetStepItem[];
    }
  | {
      readonly id: string;
      readonly kind: "actions";
      readonly title: string;
      readonly items: readonly WidgetActionItem[];
    }
  | WidgetVisual;

import { llm } from "../llm/config";
import { Log } from "../v0/engine/log";
import { Runtime } from "../v0/engine/runtime";
import { DomRenderer } from "../v0/render/dom";
import { runOne } from "./run";
import type { EvalResult } from "./run";
import { scenarios } from "./scenarios";
import type { Scenario, ScenarioGroup } from "./scenarios";
import "../style.css";
import "./eval.css";

const STORAGE = "alive-eval-results-v1";
const GROUPS: ScenarioGroup[] = [
  "home",
  "explore",
  "make",
  "organize",
  "messy",
];

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const modelsInput = byId<HTMLInputElement>("models");
const runsInput = byId<HTMLInputElement>("runs");
const scenarioList = byId<HTMLDivElement>("scenarios");
const runButton = byId<HTMLButtonElement>("run");
const stopButton = byId<HTMLButtonElement>("stop");
const progress = byId<HTMLElement>("progress");
const summary = byId<HTMLElement>("summary");
const reasons = byId<HTMLElement>("reasons");
const resultsEl = byId<HTMLElement>("results");
const exportButton = byId<HTMLButtonElement>("export");
const clearButton = byId<HTMLButtonElement>("clear");
const selectAllButton = byId<HTMLButtonElement>("select-all");
const selectNoneButton = byId<HTMLButtonElement>("select-none");
const previewDialog = byId<HTMLDialogElement>("preview-dialog");
const previewTitle = byId<HTMLElement>("preview-title");
const previewClose = byId<HTMLButtonElement>("preview-close");
const previewRoot = byId<HTMLElement>("preview-root");
const previewLog = byId<HTMLElement>("preview-log");

modelsInput.value = llm.model ?? "";

const checks = new Map<string, HTMLInputElement>();

for (const group of GROUPS) {
  const items = scenarios.filter((scenario) => scenario.group === group);
  if (!items.length) continue;

  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = group;
  fieldset.append(legend);

  for (const scenario of items) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    checks.set(scenario.id, input);
    const name = document.createElement("span");
    name.textContent = scenario.name;
    label.append(input, name);
    if (scenario.note) label.title = scenario.note;
    fieldset.append(label);
  }

  scenarioList.append(fieldset);
}

const loadResults = (): EvalResult[] => {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is EvalResult =>
          !!item &&
          typeof item === "object" &&
          typeof (item as EvalResult).model === "string" &&
          typeof (item as EvalResult).scenarioId === "string" &&
          typeof (item as EvalResult).accepted === "number" &&
          typeof (item as EvalResult).rejected === "number" &&
          Array.isArray((item as EvalResult).rejections),
      )
      .map((item) => ({
        ...item,
        firstTokenMs:
          typeof item.firstTokenMs === "number" ? item.firstTokenMs : null,
        firstLineMs:
          typeof item.firstLineMs === "number" ? item.firstLineMs : null,
        firstOpMs: typeof item.firstOpMs === "number" ? item.firstOpMs : null,
        outputSample:
          typeof item.outputSample === "string" ? item.outputSample : "",
        state: Array.isArray(item.state) ? item.state : [],
      }));
  } catch {
    return [];
  }
};

const saveResults = (): void => {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(results.slice(-500)));
  } catch {
    // Quota or private mode: results still live in memory.
  }
};

let results = loadResults();
let running = false;
let stopRequested = false;
let controller: AbortController | null = null;

const fmtMs = (value: number | null): string => {
  if (value === null) return "—";
  return value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(1)} s`;
};

const fmtPct = (value: number | null): string =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;

const fmtDate = (value: number): string => new Date(value).toLocaleString();

const short = (text: string, max = 90): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

const table = (headers: string[]): { node: HTMLTableElement; body: HTMLTableSectionElement } => {
  const node = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of headers) headRow.append(el("th", header));
  head.append(headRow);
  const body = document.createElement("tbody");
  node.append(head, body);
  return { node, body };
};

const row = (
  body: HTMLTableSectionElement,
  cells: (string | HTMLElement)[],
): void => {
  const tr = document.createElement("tr");
  for (const value of cells) {
    tr.append(typeof value === "string" ? el("td", value) : value);
  }
  body.append(tr);
};

const empty = (text: string): HTMLElement => el("p", text, "muted");

interface Bucket {
  label: string;
  runs: number;
  accepted: number;
  lines: number;
  firstToken: number[];
  firstLine: number[];
  firstOp: number[];
  total: number[];
}

const newBucket = (label: string): Bucket => ({
  label,
  runs: 0,
  accepted: 0,
  lines: 0,
  firstToken: [],
  firstLine: [],
  firstOp: [],
  total: [],
});

const addTo = (bucket: Bucket, result: EvalResult): void => {
  bucket.runs += 1;
  bucket.accepted += result.accepted;
  bucket.lines += result.accepted + result.rejected;
  if (result.firstTokenMs !== null) bucket.firstToken.push(result.firstTokenMs);
  if (result.firstLineMs !== null) bucket.firstLine.push(result.firstLineMs);
  if (result.firstOpMs !== null) bucket.firstOp.push(result.firstOpMs);
  bucket.total.push(result.totalMs);
};

const renderSummary = (): void => {
  summary.replaceChildren();
  if (!results.length) {
    summary.append(empty("No runs yet."));
    return;
  }

  const byModel = new Map<string, Bucket>();
  const all = newBucket("All models");
  for (const result of results) {
    const bucket = byModel.get(result.model) ?? newBucket(result.model);
    addTo(bucket, result);
    addTo(all, result);
    byModel.set(result.model, bucket);
  }

  const { node, body } = table([
    "Model",
    "Runs",
    "Accepted",
    "Share",
    "Median first token",
    "Median first line",
    "Median first op",
    "Median total",
  ]);

  const addBucket = (bucket: Bucket): void => {
    row(body, [
      bucket.label,
      String(bucket.runs),
      `${bucket.accepted} / ${bucket.lines}`,
      fmtPct(bucket.lines ? bucket.accepted / bucket.lines : null),
      fmtMs(median(bucket.firstToken)),
      fmtMs(median(bucket.firstLine)),
      fmtMs(median(bucket.firstOp)),
      fmtMs(median(bucket.total)),
    ]);
  };

  for (const bucket of [...byModel.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  )) {
    addBucket(bucket);
  }
  addBucket(all);

  const wrap = el("div", undefined, "table-wrap");
  wrap.append(node);
  summary.append(wrap);
};

const renderReasons = (): void => {
  reasons.replaceChildren();
  const counts = new Map<string, { count: number; sample: string }>();

  for (const result of results) {
    for (const rejection of result.rejections) {
      const entry = counts.get(rejection.key) ?? {
        count: 0,
        sample: rejection.line,
      };
      entry.count += 1;
      counts.set(rejection.key, entry);
    }
  }

  if (!counts.size) {
    reasons.append(empty("No rejections recorded."));
    return;
  }

  const { node, body } = table(["Reason", "Count", "Example line"]);
  const ordered = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);

  for (const [key, entry] of ordered) {
    row(body, [key, String(entry.count), entry.sample]);
  }

  const wrap = el("div", undefined, "table-wrap");
  wrap.append(node);
  reasons.append(wrap);
};

const renderResults = (): void => {
  resultsEl.replaceChildren();
  if (!results.length) {
    resultsEl.append(empty("No runs yet."));
    return;
  }

  const { node, body } = table([
    "When",
    "Scenario",
    "Preview",
    "Model",
    "Run",
    "Accepted",
    "Share",
    "First token",
    "First line",
    "First op",
    "Total",
    "Issues",
    "Rejections",
    "Status",
  ]);

  const ordered = results.slice(-200).reverse();
  for (const result of ordered) {
    const lines = result.accepted + result.rejected;
    const status = result.error
      ? `error: ${short(result.error)}`
      : result.aborted
        ? "aborted"
        : "ok";
    const previewCell = document.createElement("td");
    const previewButton = el("button", "Preview");
    previewButton.type = "button";
    previewButton.addEventListener("click", () => openPreview(result));
    previewCell.append(previewButton);
    row(body, [
      fmtDate(result.at),
      result.scenario,
      previewCell,
      result.model,
      String(result.run),
      `${result.accepted} / ${lines}`,
      fmtPct(lines ? result.accepted / lines : null),
      fmtMs(result.firstTokenMs),
      fmtMs(result.firstLineMs),
      fmtMs(result.firstOpMs),
      fmtMs(result.totalMs),
      String(result.issues),
      String(result.rejections.length),
      status,
    ]);
  }

  const wrap = el("div", undefined, "table-wrap");
  wrap.append(node);
  resultsEl.append(wrap);
};

let previewRenderer: DomRenderer | null = null;

const clearPreview = (): void => {
  previewRenderer?.destroy();
  previewRenderer = null;
  previewRoot.replaceChildren();
  previewLog.textContent = "";
};

const openPreview = (result: EvalResult): void => {
  clearPreview();
  previewTitle.textContent = `${result.scenario} · ${result.model} · run ${result.run}`;

  if (!result.state.length) {
    previewLog.textContent =
      "No accepted UI state was recorded for this run.";
  } else {
    const runtime = new Runtime(new Log({ persist: false }));
    previewRenderer = new DomRenderer(previewRoot, runtime, (event) => {
      previewLog.textContent += `EVENT ${event.type} ${event.id}\n`;
    });
    runtime.beginTurn("preview");
    for (const op of result.state) {
      const submitted = runtime.submit(op);
      if (!submitted.ok) {
        previewLog.textContent += `SKIP ${op.t} :: ${submitted.reason}\n`;
      }
    }
    runtime.endTurn();
  }

  if (!previewDialog.open) previewDialog.showModal();
};

const render = (): void => {
  renderSummary();
  renderReasons();
  renderResults();
};

const setProgress = (text: string): void => {
  progress.textContent = text;
};

const parseModels = (value: string): string[] => {
  const models = value
    .split(/[\n,]+/)
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set(models.length ? models : [llm.model].filter(Boolean))];
};

const selectedScenarios = (): Scenario[] =>
  scenarios.filter((scenario) => checks.get(scenario.id)?.checked);

async function runSelected(): Promise<void> {
  if (running) return;

  const models = parseModels(modelsInput.value);
  const runs = Math.max(1, Math.min(5, Number(runsInput.value) || 1));
  const selected = selectedScenarios();

  if (!models.length) {
    setProgress("Enter at least one model id.");
    return;
  }
  if (!selected.length) {
    setProgress("Select at least one scenario.");
    return;
  }

  running = true;
  stopRequested = false;
  runButton.disabled = true;
  stopButton.disabled = false;

  const total = models.length * selected.length * runs;
  let done = 0;

  try {
    outer: for (const model of models) {
      for (const scenario of selected) {
        for (let run = 1; run <= runs; run++) {
          if (stopRequested) break outer;

          controller = new AbortController();
          setProgress(
            `Running ${done + 1}/${total} · ${model} · ${scenario.name}`,
          );

          const result = await runOne(scenario, model, run, {
            signal: controller.signal,
          });
          controller = null;

          results.push(result);
          saveResults();
          render();

          done += 1;
          setProgress(`Finished ${done}/${total} · ${result.scenario}`);
        }
      }
    }
  } finally {
    controller = null;
    running = false;
    runButton.disabled = false;
    stopButton.disabled = true;
    setProgress(
      stopRequested
        ? `Stopped after ${done}/${total} runs.`
        : `Done · ${done}/${total} runs.`,
    );
  }
}

const exportResults = (): void => {
  if (!results.length) return;
  const payload = JSON.stringify(
    { exportedAt: new Date().toISOString(), results },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `alive-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

previewClose.addEventListener("click", () => {
  previewDialog.close();
});

previewDialog.addEventListener("close", clearPreview);

runButton.addEventListener("click", () => {
  void runSelected();
});

stopButton.addEventListener("click", () => {
  stopRequested = true;
  controller?.abort();
  setProgress("Stopping…");
});

selectAllButton.addEventListener("click", () => {
  for (const input of checks.values()) input.checked = true;
});

selectNoneButton.addEventListener("click", () => {
  for (const input of checks.values()) input.checked = false;
});

exportButton.addEventListener("click", exportResults);

clearButton.addEventListener("click", () => {
  if (!results.length) return;
  if (!confirm("Clear all stored eval results?")) return;
  results = [];
  saveResults();
  render();
});

render();
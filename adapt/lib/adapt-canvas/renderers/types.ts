import type { Thing } from "../../adapt/core/contracts.ts";
import type { createCanvasPaint } from "../paint.ts";

// Renderers receive visual data, never physics, session, or input state.
export type RenderBody = { readonly thing: Thing; readonly alpha: number; readonly role: "root" | "focus" | "child" | "sibling" };
export type Paint = ReturnType<typeof createCanvasPaint>;
export type IconPainter = (
  icon: Path2D,
  x: number,
  y: number,
  size: number,
  color: string,
) => void;
export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
export type ImageFit = { image: HTMLImageElement; w: number; h: number };
export type BodyGeometry = {
  x: number;
  y: number;
  radius: number;
  halfWidth: number;
  halfHeight: number;
  shape: "circle" | "rect";
  fitted: ImageFit | null;
};
export type ThingPresentation = {
  /** Persistent filename label outside compact sibling docks. */
  labelWidth?: number;
  /** Keep the label visible even on compact nodes in the sibling dock. */
  dockLabel?: boolean;
  heading: boolean;
  zoomable: boolean;
  hoverScale: boolean;
  focusRadius: (span: number) => number;
  measure: (
    body: RenderBody,
    radius: number,
  ) => Pick<BodyGeometry, "halfWidth" | "halfHeight" | "shape" | "fitted">;
  draw: (body: RenderBody, geometry: BodyGeometry, alpha: number,
    frame: { readonly time: number; readonly reducedMotion: boolean }) => void;
};

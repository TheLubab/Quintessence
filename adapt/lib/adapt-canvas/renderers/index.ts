import type { Thing } from "../../adapt/core/contracts.ts";
import type { ThingPresentation, Paint, IconPainter } from "./types.ts";
import { createFallbackRenderer } from "./fallback.ts";
import { createCollectionRenderer } from "./collection.ts";
import { createImageRenderer } from "./image.ts";
import { createFileRenderer } from "./file.ts";

export function createRenderers(options: {
  ctx: CanvasRenderingContext2D;
  glassOrb: Paint["glassOrb"];
  pendingCard: Paint["pendingCard"];
  imageFor: (src: string) => HTMLImageElement;
  drawImageIcon: IconPainter;
  imageIcon: Path2D;
  brokenImageIcon: Path2D;
  fileIcon: Path2D;
}) {
  const {
    ctx,
    glassOrb,
    imageFor,
    drawImageIcon,
    imageIcon,
    brokenImageIcon,
    fileIcon,
  } = options;
  const fallback = createFallbackRenderer(ctx, glassOrb);
  const collection = createCollectionRenderer(ctx, fallback);
  const renderers = new Map<string, ThingPresentation>([
    [
      "image",
      createImageRenderer(
        ctx,
        imageFor,
        drawImageIcon,
        imageIcon,
        brokenImageIcon,
      ),
    ],
    [
      "file",
      createFileRenderer(ctx, drawImageIcon, fileIcon, fallback),
    ],
    ["collection", collection],
    ["group", collection],
  ]);
  return (thing: Thing): ThingPresentation =>
    renderers.get(thing.type) ?? fallback;
}
import {
  Application,
  Container,
  Filter,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Text,
  Texture,
} from "pixi.js";

import type { Thing } from "../adapt/core/contracts.ts";
import type { OfferedAction } from "../adapt/core/actions.ts";
import type { Session } from "../adapt/core/session.ts";

type Rect = { x: number; y: number; w: number; h: number };
type Role = "root" | "focus" | "child" | "sibling";
type Node = {
  thing: Thing;
  role: Role;
  x: number;
  y: number;
  r: number;
  phase: number;
  orbitRate: number;
};
type Control = Rect & {
  key: string;
  label: string;
  detail?: string;
  suggested?: boolean;
  busy?: boolean;
  run: () => void;
  view?: Container;
};
type OrbView = {
  glass: Sprite;
  root: Container;
  orb: Container;
  image: Sprite;
  glyph: Container;
  ring: Graphics;
  label: Container;
  labelText: Text;
  labelGlass: Graphics;
  src: string | null;
  kind: string;
  loadId: number;
};
type Body = Node & {
  px: number;
  py: number;
  size: number;
  alpha: number;
  pull: number;
  vx: number;
  vy: number;
  alive: boolean;
  pinned: { x: number; y: number } | null;
  view?: OrbView;
};
type Drag = {
  id: number;
  key: string | null;
  body: string | null;
  sx: number;
  sy: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moved: boolean;
  dockStart: number | null;
};

const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Adjust these to benchmark quality vs. speed on the target device.
// Resolution 1 renders one GPU pixel per CSS pixel (rather than up to 4x pixels at DPR 2).
// Native-density quality, with a pixel budget to avoid excessive GPU pressure.
const MAX_RENDER_DPR = 2;
const MAX_RENDER_PIXELS = 12_000_000;
const USE_MSAA = true;
// Per-node render textures degraded quality and increased GPU memory. Disabled.
const CACHE_ORBS = false;
const USE_COLLISIONS = true;
// Set true to print a 2-second FPS / CPU-frame sampling summary in DevTools.
const DEBUG_FPS = false;
// Strong screen-space refraction of PixiJS/Canvas-backed content behind each lens.
const GLASS_REFRACTION_PX = 56;
const GLASS_CHROMATIC_PX = 3.2;
// Bound both framebuffer pixels and screenshot-quality thumbnail uploads.
// At DPR 2, a 200px radius focus node still has enough source pixels.
const THUMBNAIL_SIZE = 640;
function renderResolution(width: number, height: number): number {
  const dpr = Math.min(
    MAX_RENDER_DPR,
    Math.max(1, window.devicePixelRatio || 1),
  );
  return Math.max(
    1,
    Math.min(dpr, Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height))),
  );
}

// PixiJS 8 needs an explicit WebGL vertex shader here. Without it, some
// versions call ensurePrecision(undefined) during Filter.from(), causing the
// "substring of undefined" initialization crash.
const GLASS_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

// Full-screen refraction uses a persistent scene texture, shared by all nodes.
// Aave-style static displacement map bends the actual scene beneath the rim.
const GLASS_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;      // reusable RG displacement map
uniform sampler2D uSceneTexture; // PixiJS scene rendered before the glass
uniform vec2 uGlassViewport;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;

void main() {
  vec4 lens = texture(uTexture, vTextureCoord);
  if (lens.a < 0.003) { finalColor = vec4(0.0); return; }

  // Decode the premultiplied displacement-map texture.
  vec3 mapValue = lens.rgb / max(lens.a, 0.003);
  vec2 direction = mapValue.rg * 2.0 - 1.0;
  float edge = clamp(mapValue.b, 0.0, 1.0);
  vec2 pixel = 1.0 / max(uGlassViewport, vec2(1.0));

  // Sample the actual PixiJS scene behind the lens, not the CSS page.
  vec2 sceneUV = (vTextureCoord * uInputSize.xy + uOutputFrame.xy)
                / max(uGlassViewport, vec2(1.0));
  vec2 displacement = direction * ${GLASS_REFRACTION_PX.toFixed(1)} * pixel;
  vec2 uv = clamp(sceneUV - displacement, pixel, vec2(1.0) - pixel);
  vec3 color = texture(uSceneTexture, uv).rgb;

  // Chromatic separation follows the same curved refraction field.
  vec2 chroma = direction * ${GLASS_CHROMATIC_PX.toFixed(1)} * pixel;
  color.r = mix(color.r, texture(uSceneTexture, clamp(uv + chroma, pixel, vec2(1.0)-pixel)).r, edge);
  color.b = mix(color.b, texture(uSceneTexture, clamp(uv - chroma, pixel, vec2(1.0)-pixel)).b, edge);

  // Thin optical highlight with opposing dark edge. No full-surface blur.
  vec2 normal = normalize(direction + vec2(0.00001));
  float light = pow(max(dot(normal, normalize(vec2(-0.7, -0.7))), 0.0), 3.0);
  float shade = pow(max(dot(normal, normalize(vec2(0.7, 0.7))), 0.0), 3.0);
  float rim = smoothstep(0.35, 0.9, edge);
  color += vec3(0.55, 0.64, 0.77) * light * rim * 0.65;
  color -= vec3(0.22, 0.25, 0.30) * shade * rim * 0.42;
  color += vec3(0.16, 0.21, 0.30) * pow(rim, 3.0) * light * 0.55;
  color = mix(color, vec3(0.97, 0.98, 1.0), 0.045 + edge * 0.06);

  // Near-opaque edges show the displaced scene; center remains largely clear.
  float opacity = lens.a * (0.16 + 0.82 * smoothstep(0.12, 0.80, edge));
  finalColor = vec4(clamp(color, 0.0, 1.0) * opacity, opacity);
}
`;

function makeGlassMask(): HTMLCanvasElement {
  // Small, reusable displacement map. It moves with each orb but is never
  // regenerated while that orb moves (the key optimization in Aave's article).
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - size / 2) / (size / 2);
      const ny = (y + 0.5 - size / 2) / (size / 2);
      const r = Math.hypot(nx, ny);
      const a = clamp((1 - r) * (size / 2) + 0.5, 0, 1);
      // Wide lens curvature: start bending halfway out, strongest near rim.
      // Fade the final pixels to avoid a jagged outline.
      const rise = clamp((r - 0.28) / 0.68, 0, 1);
      const fall = clamp((1 - r) / 0.045, 0, 1);
      const edge = Math.pow(rise, 1.45) * Math.sqrt(fall);
      const ux = r > 0.0001 ? nx / r : 0;
      const uy = r > 0.0001 ? ny / r : 0;
      const i = (y * size + x) * 4;
      data.data[i] = Math.round((0.5 + ux * edge * 0.5) * 255);
      data.data[i + 1] = Math.round((0.5 + uy * edge * 0.5) * 255);
      data.data[i + 2] = Math.round(edge * 255);
      data.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

// The background must be INSIDE WebGL for the shader to refract it;
// a CSS background behind a transparent canvas cannot be sampled by WebGL.
function makeBackdrop(
  width: number,
  height: number,
  existing?: HTMLCanvasElement,
): HTMLCanvasElement {
  const c = existing ?? document.createElement("canvas");
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  const ctx = c.getContext("2d")!;
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#b4cbdd");
  base.addColorStop(0.5, "#d4dde9");
  base.addColorStop(1, "#b5c9dc");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  for (const [x, y, radius, color] of [
    [
      width * 0.18,
      height * 0.25,
      Math.max(width, height) * 0.55,
      "rgba(70,150,237,0.2)",
    ],
    [
      width * 0.85,
      height * 0.65,
      Math.max(width, height) * 0.58,
      "rgba(155,136,222,0.16)",
    ],
  ] as const) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }
  // Stationary reference lines make actual refraction easy to see.
  ctx.strokeStyle = "rgba(43,67,97,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 48) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
  return c;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}
function title(thing: Thing): string {
  const d = thing.data;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    if ("title" in d && typeof d.title === "string") return d.title;
    if ("text" in d && typeof d.text === "string") return d.text;
  }
  return thing.type;
}
function source(thing: Thing): string | null {
  const d = thing.data;
  if (thing.type !== "image" || !d || typeof d !== "object" || !("src" in d))
    return null;
  return typeof d.src === "string" && d.src.trim() ? d.src : null;
}
function inside(x: number, y: number, r: Rect) {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}
function fit(text: string, limit: number, px = 12): string {
  // Stable, inexpensive approximation. No canvas 2D context / measureText required.
  const max = Math.max(1, Math.floor(limit / (px * 0.57)));
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}
function text(
  value: string,
  px = 12,
  color = 0x293653,
  weight: "normal" | "bold" = "normal",
) {
  return new Text({
    text: value,
    style: {
      fontFamily: "system-ui, sans-serif",
      fontSize: px,
      fill: color,
      fontWeight: weight,
    },
  });
}
function glass(rect: Rect, radius: number, alpha = 0.58): Graphics {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  const g = new Graphics();
  if (rect.w <= 0 || rect.h <= 0) return g;
  g.roundRect(rect.x, rect.y, rect.w, rect.h, r)
    .fill({ color: 0xffffff, alpha })
    .stroke({ color: 0xffffff, alpha: 0.95, width: 1.3 });
  if (rect.w > 4 && rect.h > 4) {
    g.roundRect(
      rect.x + 2,
      rect.y + 2,
      rect.w - 4,
      rect.h - 4,
      Math.max(0, r - 2),
    ).stroke({ color: 0x7684ac, alpha: 0.12, width: 1 });
  }
  return g;
}

/**
 * A drop-in replacement for adapt-canvas/canvasView, implemented in PixiJS 8.
 *
 * The API stays synchronous even though PixiJS 8 initializes asynchronously:
 *   const view = canvasView({ canvas, session });
 *   await session.refresh();
 *   view.destroy();
 *
 * Supply a canvas NOT already initialized with getContext('2d').
 */
export function canvasView(options: {
  canvas: HTMLCanvasElement;
  session: Session;
  /** Optional URL remapping for image hosts that need a same-origin proxy. */
  resolveImageSrc?: (src: string) => string;
}) {
  const { canvas, session } = options;
  const app = new Application();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const oldTouch = canvas.style.touchAction;
  const oldCursor = canvas.style.cursor;
  const oldBackground = canvas.style.background;
  const oldTabIndex = canvas.getAttribute("tabindex");
  const oldLabel = canvas.getAttribute("aria-label");

  const bodies = new Map<string, Body>();
  const collected = new Map<string, Map<string, Thing>>();
  const pending = new Set<string>();
  const textures = new Map<string, Promise<Texture>>();
  const ownedTextures = new Set<Texture>();
  const loadingImages = new Set<HTMLImageElement>();
  const loggedImageErrors = new Set<string>();
  const backChrome = new Container();
  const glassLayer = new Container();
  const backdrop = new Sprite();
  const world = new Container();
  const backgroundScene = new Container();
  const sceneSprite = new Sprite();
  const chrome = new Container();
  let backgroundTexture: Texture | null = null;
  let backdropCanvas: HTMLCanvasElement | null = null;
  let sceneTexture: RenderTexture | null = null;
  let glassMaskTexture: Texture | null = null;
  let glassFilter: Filter | null = null;
  world.sortableChildren = true;

  let contextLost = false;
  let ready = false;
  let destroyed = false;
  let state = session.snapshot();
  let children: Thing[] = [];
  let controls: Control[] = [];
  let dock: Rect | null = null;
  let siblingDock: Rect | null = null;
  let dockScroll = 0;
  let dockMaxScroll = 0;
  let dockContent: Container | null = null;
  let scene: Rect = { x: 20, y: 108, w: 1, h: 1 };
  let w = 1;
  let h = 1;
  let time = 0;
  let orbit = 0;
  let orbitVelocity = 0.075;
  let last = 0;
  let raf = 0;
  let focusKey = "";
  let hover: string | null = null;
  let keyboard: string | null = null;
  let mouse: { x: number; y: number } | null = null;
  let drag: Drag | null = null;
  let wheelAmount = 0;
  let wheelLocked = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let error: string | null = null;
  let dismissed = "";
  let paging = false;
  let pagingTries = 0;
  let pageScheduled = false;
  let chromeSignature = "";
  let fpsStart = 0;
  let fpsFrames = 0;
  let fpsCpuSum = 0;
  let fpsCpuMax = 0;

  function wake() {
    if (!raf && ready && !destroyed && !contextLost) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
    dismissed = "";
    rebuild();
  }
  function safe(run: () => void) {
    try {
      run();
    } catch (e) {
      fail(e);
    }
  }
  function actionKey(contextId: string, a: OfferedAction) {
    return `action:${JSON.stringify([contextId, a.source, a.id])}`;
  }
  async function invoke(contextId: string, action: OfferedAction) {
    const key = actionKey(contextId, action);
    if (pending.has(key) || action.busy) return;
    pending.add(key);
    error = null;
    rebuild();
    try {
      await session.invoke(contextId, action.id, action.source);
    } catch (e) {
      if (!destroyed) error = e instanceof Error ? e.message : String(e);
    } finally {
      pending.delete(key);
      if (!destroyed) rebuild();
    }
  }

  // Auto-follow the Session's paged transport: no UI pagination.
  function requestNextPage() {
    if (
      destroyed ||
      paging ||
      pageScheduled ||
      pagingTries >= 80 ||
      !state.hasNext ||
      state.loading
    )
      return;
    const key = focusKey;
    pageScheduled = true;
    queueMicrotask(async () => {
      pageScheduled = false;
      if (
        destroyed ||
        focusKey !== key ||
        paging ||
        !session.snapshot().hasNext
      )
        return;
      paging = true;
      pagingTries++;
      try {
        await Promise.resolve(session.next());
      } catch (e) {
        if (!destroyed) error = e instanceof Error ? e.message : String(e);
      } finally {
        paging = false;
        if (!destroyed && key === focusKey) rebuild();
      }
    });
  }

  // The old Assets.load() path silently rejected inaccessible remote images.
  // This loader keeps failures visible and creates *small* canvas-backed GPU textures,
  // instead of uploading a separate 4K wallpaper for every orb.
  function textureFor(src: string): Promise<Texture> {
    let result = textures.get(src);
    if (result) return result;

    result = new Promise<Texture>((resolve, reject) => {
      let url = src;
      try {
        url = options.resolveImageSrc?.(src) ?? src;
      } catch (cause) {
        reject(cause);
        return;
      }

      const image = new Image();
      loadingImages.add(image);
      // WebGL requires image data to be origin-clean, including canvas-backed
      // thumbnails. Use a same-origin proxy for hosts that lack CORS headers.
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => {
        loadingImages.delete(image);
        if (destroyed) {
          reject(new Error("Renderer destroyed"));
          return;
        }
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = THUMBNAIL_SIZE;
          const ctx = canvas.getContext("2d", { alpha: true });
          if (!ctx) throw new Error("Thumbnail Canvas 2D unavailable");
          const iw = image.naturalWidth;
          const ih = image.naturalHeight;
          if (!iw || !ih) throw new Error("Image decoded at zero size");
          const crop = Math.min(iw, ih);
          // Crop to the same circular center-cover region used by the renderer.
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(
            image,
            (iw - crop) / 2,
            (ih - crop) / 2,
            crop,
            crop,
            0,
            0,
            THUMBNAIL_SIZE,
            THUMBNAIL_SIZE,
          );
          const texture = Texture.from(canvas);
          ownedTextures.add(texture);
          resolve(texture);
        } catch (cause) {
          reject(cause);
        }
      };
      image.onerror = () => {
        loadingImages.delete(image);
        reject(
          new Error(
            `Image load failed: ${url}. If it opens in a browser tab but fails here, ` +
              "the image server probably does not permit cross-origin WebGL textures. " +
              "Serve it from the app origin or configure resolveImageSrc with a trusted proxy.",
          ),
        );
      };
      image.src = url;
    });

    // Retain a failed promise so we do not retry/log the same broken URL each frame.
    textures.set(src, result);
    return result;
  }

  // Draw each orb once. The animation updates only container transforms.
  function paintGlyph(glyph: Container, kind: string) {
    for (const child of glyph.removeChildren())
      child.destroy({ children: true });
    if (kind === "collection" || kind === "group") {
      const cards = new Graphics();
      for (let i = 0; i < 3; i++) {
        cards
          .roundRect(-25 + i * 5, -16 + i * 3.5, 37, 29, 6)
          .fill({ color: 0xffffff, alpha: i === 2 ? 0.89 : 0.48 })
          .stroke({ color: 0x6477a8, alpha: 0.32, width: 1.3 });
      }
      cards.rotation = -0.12;
      glyph.addChild(cards);
    } else {
      const letter = text(kind.slice(0, 1).toUpperCase(), 31, 0x3e5180, "bold");
      letter.anchor.set(0.5);
      glyph.addChild(letter);
    }
  }

  function makeOrb(body: Body): OrbView {
    const root = new Container();
    const orb = new Container();
    root.addChild(orb);

    // The refractive surface is rendered separately in ONE shared shader pass.
    const glass = new Sprite(glassMaskTexture ?? Texture.WHITE);
    glass.anchor.set(0.5);
    glassLayer.addChild(glass);

    const mask = new Graphics().circle(0, 0, 48).fill(0xffffff);
    const image = new Sprite();
    image.anchor.set(0.5);
    image.mask = mask;
    image.visible = false;
    orb.addChild(mask, image);

    const glyph = new Container();
    paintGlyph(glyph, body.thing.type);
    orb.addChild(glyph);

    // Thin physical edge. All visible refraction is in the shader above.
    const rim = new Graphics();
    rim.circle(0, 0, 49).stroke({ color: 0xffffff, alpha: 0.6, width: 1.2 });
    rim
      .arc(0, 0, 47.5, Math.PI * 1.04, Math.PI * 1.58)
      .stroke({ color: 0xffffff, alpha: 0.6, width: 1.2 });
    orb.addChild(rim);

    const ring = new Graphics()
      .circle(0, 0, 55)
      .stroke({ color: 0x4d7adf, alpha: 0.58, width: 2 });
    ring.visible = false;
    // Selection ring must be outside the cached orb so hovering stays live.
    root.addChild(ring);

    const label = new Container();
    const labelGlass = new Graphics();
    const labelText = text("", 12, 0x293653, "bold");
    labelText.anchor.set(0.5);
    label.addChild(labelGlass, labelText);
    root.addChild(label);
    world.addChild(root);

    const v: OrbView = {
      glass,
      root,
      orb,
      image,
      glyph,
      ring,
      label,
      labelGlass,
      labelText,
      src: null,
      kind: body.thing.type,
      loadId: 0,
    };
    // Cache the static orb + circular mask as one composited texture. Only
    // transforms change during the animation, so repeated stencil work is avoided.
    if (CACHE_ORBS) orb.cacheAsTexture({ resolution: 2, antialias: true });
    updateImage(body, v);
    return v;
  }

  function updateImage(body: Body, view: OrbView) {
    const src = source(body.thing);
    if (src === view.src) return;
    view.src = src;
    const loadId = ++view.loadId;
    view.image.visible = false;
    view.glyph.visible = true;
    if (!src) return;
    void textureFor(src)
      .then((texture) => {
        if (
          destroyed ||
          !body.alive ||
          body.view !== view ||
          view.loadId !== loadId
        )
          return;
        view.image.texture = texture;
        // Every generated texture is already a square center-cropped thumbnail.
        view.image.width = 96;
        view.image.height = 96;
        view.image.visible = true;
        view.glyph.visible = false;
        if (CACHE_ORBS) view.orb.updateCacheTexture();
        wake();
      })
      .catch((cause: unknown) => {
        if (!destroyed && body.alive && view.loadId === loadId) {
          // Keep the glyph, and log once per URL, not once per visible node.
          if (src && !loggedImageErrors.has(src)) {
            loggedImageErrors.add(src);
            console.warn("adapt-pixijs:", cause);
          }
        }
      });
  }

  function syncOrb(body: Body) {
    if (!ready) return;
    if (!body.view) body.view = makeOrb(body);
    const v = body.view;
    if (v.kind !== body.thing.type) {
      v.kind = body.thing.type;
      paintGlyph(v.glyph, v.kind);
      if (CACHE_ORBS) v.orb.updateCacheTexture();
    }
    updateImage(body, v);

    const hot =
      hover === `node:${body.thing.id}` || keyboard === `node:${body.thing.id}`;
    const picked = drag?.moved && drag.body === body.thing.id;
    const radius = body.size * (hot || picked ? 1.085 : 1) * (1 + body.pull);
    v.glass.position.set(body.px, body.py);
    v.glass.width = radius * 2;
    v.glass.height = radius * 2;
    // Images stay legible beneath the lens; empty/group nodes show stronger glass.
    v.glass.alpha =
      body.alpha *
      (body.role === "sibling" ? 0.8 : 1) *
      (source(body.thing) ? 0.95 : 1.0);
    v.root.position.set(body.px, body.py);
    v.root.alpha = body.alpha * (body.role === "sibling" ? 0.8 : 1);
    v.orb.scale.set(radius / 50);
    v.ring.scale.set(radius / 50);
    v.ring.visible = hot || !!picked;
    v.root.zIndex = picked
      ? 40
      : body.role === "focus"
        ? 30
        : hot
          ? 20
          : body.role === "sibling"
            ? 0
            : 10;

    const showLabel =
      body.role === "focus" ||
      hot ||
      (body.role === "root" && children.length <= 14) ||
      (body.role === "child" && children.length <= 9);
    v.label.visible = showLabel;
    if (showLabel) {
      const emphasis = body.role === "focus";
      const maxWidth = emphasis
        ? Math.min(scene.w - 20, 260)
        : body.role === "root"
          ? 145
          : 120;
      const labelValue = fit(
        title(body.thing),
        Math.max(20, maxWidth - 22),
        emphasis ? 15 : 12,
      );
      if (
        v.labelText.text !== labelValue ||
        v.labelText.style.fontSize !== (emphasis ? 15 : 12)
      ) {
        v.labelText.text = labelValue;
        v.labelText.style.fontSize = emphasis ? 15 : 12;
        const tw = Math.min(maxWidth, Math.ceil(v.labelText.width + 22));
        const th = emphasis ? 29 : 25;
        v.labelGlass.clear();
        v.labelGlass
          .roundRect(-tw / 2, -th / 2, tw, th, th / 2)
          .fill({ color: 0xffffff, alpha: 0.66 })
          .stroke({ color: 0xffffff, alpha: 0.94, width: 1.1 });
      }
      v.label.position.set(
        0,
        body.role === "sibling" ? -radius - 24 : radius + (emphasis ? 26 : 20),
      );
    }
  }

  function destroyOrb(b: Body) {
    if (!b.view) return;
    b.view.loadId++;
    if (CACHE_ORBS) b.view.orb.cacheAsTexture(false);
    glassLayer.removeChild(b.view.glass);
    b.view.glass.destroy();
    world.removeChild(b.view.root);
    b.view.root.destroy({ children: true });
    b.view = undefined;
  }

  function status(): {
    id: string;
    message: string;
    bad: boolean;
    busy: boolean;
  } | null {
    if (error)
      return { id: `local:${error}`, message: error, bad: true, busy: false };
    if (state.operationErrors.length) {
      const e = state.operationErrors[state.operationErrors.length - 1]!;
      return { id: `op:${e.id}`, message: e.message, bad: true, busy: false };
    }
    let latest: (typeof state.operations)[number] | undefined;
    for (const operation of state.operations) {
      if (!latest) {
        latest = operation;
        continue;
      }
      const at =
        operation.status === "running"
          ? operation.startedAt
          : operation.finishedAt;
      const bt =
        latest.status === "running" ? latest.startedAt : latest.finishedAt;
      if (at > bt) latest = operation;
    }
    if (
      pending.size ||
      state.loading ||
      state.operations.some((o) => o.status === "running")
    )
      return {
        id: "working",
        message: "Making things happen…",
        bad: false,
        busy: true,
      };
    if (state.error)
      return {
        id: `state:${state.error}`,
        message: state.error,
        bad: true,
        busy: false,
      };
    if (latest?.status === "failed")
      return {
        id: `failed:${latest.id}`,
        message: latest.error.message,
        bad: true,
        busy: false,
      };
    return null;
  }

  function drawControl(c: Control, dest: Container) {
    const outer = new Container();
    outer.position.set(c.x, c.y);
    const isAction = c.key.startsWith("action:");
    outer.addChild(
      glass(
        { x: 0, y: 0, w: c.w, h: c.h },
        isAction ? 17 : 20,
        c.suggested ? 0.79 : isAction ? 0.59 : 0.69,
      ),
    );
    if (c.suggested) {
      outer.addChild(
        new Graphics()
          .roundRect(2, 2, c.w - 4, c.h - 4, 16)
          .fill({ color: 0xa5b1ff, alpha: 0.18 }),
      );
      outer.addChild(new Graphics().circle(c.w - 11, 12, 2.5).fill(0x7867c1));
    }
    const main = text(fit(c.label, c.w - 26, 12), 12, 0x23314c, "bold");
    if (isAction) {
      main.position.set(13, c.detail ? 15 : 24);
      if (c.detail) {
        const detail = text(
          fit(c.busy ? "Working…" : c.detail, c.w - 26, 10),
          10,
          0x67748e,
        );
        detail.position.set(13, 36);
        outer.addChild(detail);
      }
    } else {
      main.anchor.set(0.5);
      main.position.set(c.w / 2, c.h / 2);
    }
    outer.addChild(main);
    outer.alpha = c.busy ? 0.55 : 0.9;
    c.view = outer;
    dest.addChild(outer);
  }

  function drawChrome() {
    if (!ready || destroyed) return;
    // Ignore frequent subscription notifications when all chrome is unchanged.
    // Actual changing page counts, actions, errors, and layout still redraw.
    const signature = JSON.stringify([
      w,
      h,
      focusKey,
      state.focus ? title(state.focus) : "",
      children.length,
      state.hasNext,
      state.loading,
      dock,
      siblingDock,
      controls.map((c) => [
        c.key,
        c.label,
        c.detail,
        c.busy,
        c.suggested,
        c.x,
        c.y,
      ]),
      status(),
      dockMaxScroll > 0,
      dismissed,
    ]);
    if (signature === chromeSignature) return;
    chromeSignature = signature;
    for (const item of chrome.removeChildren())
      item.destroy({ children: true });
    for (const item of backChrome.removeChildren())
      item.destroy({ children: true });
    dockContent = null;

    if (state.focus) {
      const heading = text(
        fit(title(state.focus), Math.max(40, w - 280), 15),
        15,
        0x293755,
        "bold",
      );
      heading.position.set(151, 29);
      chrome.addChild(heading);
    } else {
      chrome.addChild(
        new Graphics()
          .circle(41, 42, 21)
          .fill({ color: 0xffffff, alpha: 0.68 })
          .stroke({ color: 0xffffff, width: 1.4 }),
      );
      const emblem = text("a", 19, 0x526ab1, "bold");
      emblem.anchor.set(0.5);
      emblem.position.set(41, 42);
      const heading = text("Adapt", 18, 0x273450, "bold");
      heading.position.set(75, 23);
      const subtitle = text("YOUR SPACE", 11, 0x8391ae);
      subtitle.position.set(76, 51);
      chrome.addChild(emblem, heading, subtitle);
    }
    if (w > 440) {
      const counter = text(
        `${children.length}${state.hasNext ? "+" : ""} ${children.length === 1 ? "thing" : "things"}`,
        11,
        0x7785a1,
      );
      counter.anchor.set(0.5);
      counter.position.set(w - 110, 43);
      chrome.addChild(counter);
    }

    // Draw dock atmosphere behind the animated sibling sprites.
    if (siblingDock) backChrome.addChild(glass(siblingDock, 30, 0.48));
    if (dock) {
      chrome.addChild(glass(dock, 29, 0.49));
      const content = new Container();
      const mask = new Graphics()
        .roundRect(dock.x + 8, dock.y + 8, dock.w - 16, dock.h - 16, 23)
        .fill(0xffffff);
      // Action controls use absolute coordinates, with a translated content layer.
      content.mask = mask;
      chrome.addChild(mask, content);
      dockContent = content;
    }
    for (const c of controls) {
      if (c.key.startsWith("action:") && dockContent)
        drawControl(c, dockContent);
      else if (!c.key.startsWith("action:")) drawControl(c, chrome);
    }
    updateDockScroll();

    if (!state.focus && !children.length && !state.loading) {
      const empty = text(
        "A little space for everything.",
        18,
        0x42516f,
        "bold",
      );
      const note = text("Your things will appear here.", 12, 0x8995ac);
      empty.anchor.set(0.5);
      note.anchor.set(0.5);
      empty.position.set(w / 2, h / 2 - 9);
      note.position.set(w / 2, h / 2 + 21);
      chrome.addChild(empty, note);
    }

    const s = status();
    if (s && s.id !== dismissed) {
      const width = Math.max(60, Math.min(w - 40, 430));
      const rect = { x: (w - width) / 2, y: 78, w: width, h: 40 };
      chrome.addChild(glass(rect, 20, 0.83));
      chrome.addChild(
        new Graphics()
          .circle(rect.x + 18, 98, 4)
          .fill(s.bad ? 0xb95065 : 0x56699b),
      );
      const message = text(fit(s.message, width - 66, 12), 12, 0x3f506e);
      message.position.set(rect.x + 31, 89);
      chrome.addChild(message);
      if (!s.busy) {
        const close = text("×", 17, 0x3f506e);
        close.anchor.set(0.5);
        close.position.set(rect.x + width - 20, 98);
        chrome.addChild(close);
      }
    }
    if (h > 300) {
      const footer = text(
        dockMaxScroll > 0
          ? "Drag to arrange  ·  Scroll the dock for more actions"
          : "Drag to arrange  ·  Scroll up to open  ·  Scroll down to go back",
        11,
        0x697999,
      );
      footer.anchor.set(0.5);
      footer.position.set(w / 2, h - 12);
      chrome.addChild(footer);
    }
    wake();
  }
  function updateDockScroll() {
    if (dockContent) dockContent.x = -dockScroll;
  }

  function rebuild() {
    if (destroyed) return;
    state = session.snapshot();
    const key = state.focus?.id ?? "@root";
    if (focusKey !== key) {
      focusKey = key;
      pagingTries = 0;
      dockScroll = 0;
      hover = keyboard = null;
    }
    let page = collected.get(key);
    if (!page) {
      page = new Map();
      collected.set(key, page);
    }
    for (const thing of state.children) page.set(thing.id, thing);
    children = [...page.values()];
    if (state.hasNext && !state.loading) requestNextPage();

    const focused = state.focus;
    const childIds = new Set(children.map((thing) => thing.id));
    const siblings = focused
      ? state.siblings.filter((t) => t.id !== focused.id && !childIds.has(t.id))
      : [];
    const actions = focused
      ? [...state.actions].sort(
          (a, b) =>
            Number(b.recommendation !== undefined) -
              Number(a.recommendation !== undefined) ||
            (b.recommendation?.relevance ?? 0) -
              (a.recommendation?.relevance ?? 0),
        )
      : [];

    siblingDock = null;
    if (focused && siblings.length) {
      const slot = clamp((w - 80) / siblings.length, 12, 56);
      const width = Math.min(Math.max(40, w - 40), siblings.length * slot + 40);
      siblingDock = { x: (w - width) / 2, y: h - 88, w: width, h: 64 };
    }
    const dockWidth = Math.max(1, Math.min(w - 28, 900));
    const dockBottom = siblingDock ? siblingDock.y - 12 : h - 22;
    dock = actions.length
      ? { x: (w - dockWidth) / 2, y: dockBottom - 90, w: dockWidth, h: 90 }
      : null;
    scene = {
      x: 20,
      y: 109,
      w: Math.max(1, w - 40),
      h: Math.max(1, (dock?.y ?? siblingDock?.y ?? h - 32) - 128),
    };

    controls = [];
    if (focused)
      controls.push({
        key: "back",
        label: "‹  Back",
        x: 20,
        y: 22,
        w: 116,
        h: 39,
        run: () => session.back(),
      });
    controls.push({
      key: "reset",
      label: "↺",
      x: w - 58,
      y: 22,
      w: 38,
      h: 38,
      run: () => {
        for (const b of bodies.values()) b.pinned = null;
        orbitVelocity = 0.075;
        wake();
      },
    });
    if (dock && focused) {
      let x = dock.x + 14;
      for (const action of actions) {
        const actionId = actionKey(focused.id, action);
        const width = clamp(100 + action.label.length * 5.3, 136, 213);
        controls.push({
          key: actionId,
          x,
          y: dock.y + 14,
          w: width,
          h: 62,
          label: action.label,
          detail:
            action.recommendation?.reason ??
            action.description ??
            action.category ??
            "",
          suggested: action.recommendation !== undefined,
          busy: action.busy || pending.has(actionId),
          run: () => {
            void invoke(focused.id, action);
          },
        });
        x += width + 9;
      }
      dockMaxScroll = Math.max(0, x + 5 - (dock.x + dock.w));
      dockScroll = clamp(dockScroll, 0, dockMaxScroll);
    } else dockScroll = dockMaxScroll = 0;

    const centerX = scene.x + scene.w / 2;
    const centerY = scene.y + scene.h / 2;
    const next = new Map<string, Node>();
    function add(thing: Thing, role: Role, x: number, y: number, r: number) {
      next.set(thing.id, {
        thing,
        role,
        x,
        y,
        r,
        phase: hash(thing.id) * TAU,
        orbitRate:
          role === "child" ? 0.35 + hash(thing.id + "orbit") * 0.55 : 0.11,
      });
    }
    if (!focused) {
      const count = children.length;
      const radius = clamp(
        Math.sqrt((scene.w * scene.h) / Math.max(1, count)) * 0.24,
        13,
        57,
      );
      children.forEach((thing, i) => {
        const a = i * GOLDEN - Math.PI / 2;
        const spread =
          Math.sqrt((i + 0.65) / Math.max(1, count)) + hash(thing.id) * 0.11;
        add(
          thing,
          "root",
          centerX + Math.cos(a) * scene.w * 0.45 * spread,
          centerY + Math.sin(a) * scene.h * 0.43 * spread,
          radius * lerp(0.85, 1.12, hash(thing.id + "size")),
        );
      });
    } else {
      const count = children.length;
      add(
        focused,
        "focus",
        centerX,
        centerY - 4,
        clamp(Math.min(scene.w, scene.h) * 0.16, 49, 108),
      );
      const rx = Math.max(30, scene.w * 0.43);
      const ry = Math.max(30, scene.h * 0.43);
      const radius = clamp(
        Math.sqrt((scene.w * scene.h) / Math.max(1, count)) * 0.19,
        13,
        47,
      );
      children.forEach((thing, i) => {
        const a =
          count <= 8
            ? -Math.PI / 2 + (i * TAU) / Math.max(1, count)
            : i * GOLDEN;
        const radial =
          count <= 8
            ? lerp(0.79, 0.98, hash(thing.id))
            : (count <= 14 ? 0.72 : 0.35) +
              (count <= 14 ? 0.27 : 0.64) * Math.sqrt((i + 0.6) / count);
        add(
          thing,
          "child",
          centerX + Math.cos(a) * rx * radial,
          centerY + Math.sin(a) * ry * radial,
          radius,
        );
      });
      if (siblingDock) {
        const spacing = (siblingDock.w - 40) / Math.max(1, siblings.length);
        const radius = clamp(spacing * 0.4, 6, 19);
        siblings.forEach((thing, i) =>
          add(
            thing,
            "sibling",
            siblingDock!.x + 20 + (i + 0.5) * spacing,
            siblingDock!.y + siblingDock!.h / 2,
            radius,
          ),
        );
      }
    }

    for (const body of bodies.values()) body.alive = false;
    for (const node of next.values()) {
      const previous = bodies.get(node.thing.id);
      if (previous) {
        Object.assign(previous, node, { alive: true });
        if (previous.view) updateImage(previous, previous.view);
      } else {
        const parent = node.thing.parent
          ? bodies.get(node.thing.parent)
          : undefined;
        bodies.set(node.thing.id, {
          ...node,
          px: parent?.px ?? centerX,
          py: parent?.py ?? centerY,
          size: motion.matches ? node.r : 1,
          alpha: motion.matches ? 1 : 0,
          pull: 0,
          vx: 0,
          vy: 0,
          alive: true,
          pinned: null,
        });
      }
    }
    if (drag?.body && !bodies.get(drag.body)?.alive) cancelDrag();
    drawChrome();
    wake();
  }

  function tick(now: number) {
    const cpuStart = DEBUG_FPS ? performance.now() : 0;
    raf = 0;
    if (destroyed || !ready || contextLost) return;
    const dt = clamp((now - last) / 1000, 0, 0.04);
    last = now;
    time += dt;
    const instant = motion.matches;
    if (!instant && !drag?.moved) {
      orbit += orbitVelocity * dt;
      orbitVelocity = lerp(orbitVelocity, 0.075, 1 - Math.exp(-dt * 0.6));
    }
    const cx = scene.x + scene.w / 2;
    const cy = scene.y + scene.h / 2;
    const active = [...bodies.values()].filter((b) => b.alive);
    const desired = active.map((b) => {
      let x = b.x,
        y = b.y,
        pull = 0;
      if (mouse && !instant && !b.pinned && b.role === "sibling") {
        const near = clamp(1 - Math.abs(mouse.y - y) / 80, 0, 1);
        const reach = Math.max(0, 1 - Math.abs(mouse.x - x) / 90);
        const m = reach * reach * near;
        x += (mouse.x - x) * m * 0.2;
        y -= m * 14;
        pull = m * 0.95;
      }
      b.pull = instant ? pull : lerp(b.pull, pull, 1 - Math.exp(-dt * 14));
      if (!instant && !b.pinned && (b.role === "root" || b.role === "child")) {
        const a = Math.atan2(b.y - cy, b.x - cx) + orbit * b.orbitRate;
        const dist = Math.hypot(
          (b.x - cx) / Math.max(1, scene.w / 2),
          (b.y - cy) / Math.max(1, scene.h / 2),
        );
        const breathing = 1 + 0.045 * Math.sin(time * 0.57 + b.phase);
        x = cx + Math.cos(a) * scene.w * 0.5 * dist * breathing;
        y = cy + Math.sin(a) * scene.h * 0.5 * dist * breathing;
        x += Math.sin(time * 0.37 + b.phase * 2) * 6;
        y += Math.cos(time * 0.44 + b.phase * 3) * 8;
      }
      if (b.pinned) {
        x = b.pinned.x + (instant ? 0 : Math.sin(time * 0.5 + b.phase) * 2);
        y = b.pinned.y + (instant ? 0 : Math.cos(time * 0.6 + b.phase) * 2);
      }
      if (drag?.moved && drag.body === b.thing.id) {
        x = drag.x - drag.dx;
        y = drag.y - drag.dy;
      }
      return { b, x, y };
    });

    // Spatial-hash broad phase: only compare nearby nodes, rather than every
    // pair (O(n²)). Cell size covers the largest collision gap in this frame.
    if (USE_COLLISIONS && !instant && desired.length > 1) {
      let largestRadius = 0;
      for (const item of desired)
        largestRadius = Math.max(largestRadius, item.b.r);
      const cell = Math.max(32, largestRadius * 2 + 34);
      const grid = new Map<string, number[]>();
      const ix = new Int32Array(desired.length);
      const iy = new Int32Array(desired.length);
      for (let i = 0; i < desired.length; i++) {
        const item = desired[i]!;
        const gx = Math.floor(item.x / cell),
          gy = Math.floor(item.y / cell);
        ix[i] = gx;
        iy[i] = gy;
        const key = `${gx},${gy}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(i);
      }
      for (let i = 0; i < desired.length; i++) {
        const a = desired[i]!;
        for (let gx = ix[i]! - 1; gx <= ix[i]! + 1; gx++) {
          for (let gy = iy[i]! - 1; gy <= iy[i]! + 1; gy++) {
            const nearby = grid.get(`${gx},${gy}`);
            if (!nearby) continue;
            for (const j of nearby) {
              if (j <= i) continue;
              const b = desired[j]!;
              const dx = a.x - b.x,
                dy = a.y - b.y;
              const distance = Math.max(1, Math.hypot(dx, dy));
              const gap =
                a.b.r +
                b.b.r +
                (a.b.role === "focus" || b.b.role === "focus" ? 34 : 13);
              if (distance >= gap) continue;
              const push = Math.min(16, (gap - distance) * 0.3);
              const ax = (dx / distance) * push,
                ay = (dy / distance) * push;
              if (a.b.role !== "focus" && drag?.body !== a.b.thing.id) {
                a.x += ax;
                a.y += ay;
              }
              if (b.b.role !== "focus" && drag?.body !== b.b.thing.id) {
                b.x -= ax;
                b.y -= ay;
              }
            }
          }
        }
      }
    }

    let settling = false;
    for (const item of desired) {
      const b = item.b;
      const dragging = drag?.moved && drag.body === b.thing.id;
      const margin = b.r + 13;
      const inScene = b.role !== "sibling" || b.pinned || dragging;
      const minX = scene.x + margin,
        maxX = scene.x + scene.w - margin;
      const minY = scene.y + margin,
        maxY = scene.y + scene.h - margin;
      const tx = inScene
        ? minX <= maxX
          ? clamp(item.x, minX, maxX)
          : cx
        : item.x;
      const ty = inScene
        ? minY <= maxY
          ? clamp(item.y, minY, maxY)
          : cy
        : item.y;
      if (instant || dragging) {
        b.px = tx;
        b.py = ty;
        b.vx = b.vy = 0;
        b.size = instant ? b.r : lerp(b.size, b.r, 1 - Math.exp(-dt * 11));
        b.alpha = instant ? 1 : lerp(b.alpha, 1, 1 - Math.exp(-dt * 9));
      } else {
        const k = b.role === "focus" ? 9 : 5.5;
        const damping = Math.exp(-dt * 7.5);
        b.vx = (b.vx + (tx - b.px) * k * k * dt) * damping;
        b.vy = (b.vy + (ty - b.py) * k * k * dt) * damping;
        b.px += b.vx * dt;
        b.py += b.vy * dt;
        b.size = lerp(b.size, b.r, 1 - Math.exp(-dt * 11));
        b.alpha = lerp(b.alpha, 1, 1 - Math.exp(-dt * 9));
        settling ||=
          Math.abs(b.vx) + Math.abs(b.vy) > 0.07 ||
          Math.abs(b.r - b.size) > 0.07;
      }
      syncOrb(b);
    }
    for (const [id, b] of bodies) {
      if (b.alive) continue;
      b.alpha = instant ? 0 : lerp(b.alpha, 0, 1 - Math.exp(-dt * 13));
      if (b.alpha < 0.01) {
        destroyOrb(b);
        bodies.delete(id);
      } else {
        if (b.view) {
          b.view.root.alpha = b.alpha;
          b.view.glass.alpha = b.alpha;
        }
        settling = true;
      }
    }

    // Capture the unmodified scene first. Never sample from the texture we are
    // currently drawing to (that would produce feedback / undefined results).
    if (sceneTexture)
      app.renderer.render({
        container: backgroundScene,
        target: sceneTexture,
        clear: true,
      });
    app.render();
    if (DEBUG_FPS) {
      fpsFrames++;
      const cpu = performance.now() - cpuStart;
      fpsCpuSum += cpu;
      fpsCpuMax = Math.max(fpsCpuMax, cpu);
      if (!fpsStart) fpsStart = now;
      const elapsed = now - fpsStart;
      if (elapsed >= 2000) {
        console.info("adapt-pixijs", {
          fps: Math.round((fpsFrames * 1000) / elapsed),
          avgFrameCPUms: +(fpsCpuSum / fpsFrames).toFixed(2),
          maxFrameCPUms: +fpsCpuMax.toFixed(2),
          nodes: bodies.size,
          textures: textures.size,
        });
        fpsStart = now;
        fpsFrames = 0;
        fpsCpuSum = 0;
        fpsCpuMax = 0;
      }
    }
    if (!instant && (bodies.size > 0 || settling || pending.size))
      raf = requestAnimationFrame(tick);
  }

  function pos(e: PointerEvent | WheelEvent) {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) * w) / Math.max(1, box.width),
      y: ((e.clientY - box.top) * h) / Math.max(1, box.height),
    };
  }
  function hit(x: number, y: number): string | null {
    const s = status();
    const sw = Math.max(60, Math.min(w - 40, 430));
    if (
      s &&
      dismissed !== s.id &&
      inside(x, y, { x: (w - sw) / 2, y: 78, w: sw, h: 40 })
    )
      return s.busy ? null : "status:dismiss";
    for (let i = controls.length - 1; i >= 0; i--) {
      const c = controls[i]!;
      const isDock = c.key.startsWith("action:");
      if (isDock && (!dock || !inside(x, y, dock))) continue;
      if (
        inside(x, y, {
          x: c.x - (isDock ? dockScroll : 0),
          y: c.y,
          w: c.w,
          h: c.h,
        })
      )
        return c.busy ? null : c.key;
    }
    if (dock && inside(x, y, dock)) return null;
    // Check the nodes in the reverse of the actual z-order.
    const visible = [...bodies.values()]
      .filter((b) => b.alive && b.alpha > 0.25)
      .sort((a, b) => (b.view?.root.zIndex ?? 0) - (a.view?.root.zIndex ?? 0));
    for (const b of visible)
      if (Math.hypot(x - b.px, y - b.py) <= b.size * (1 + b.pull) + 9)
        return `node:${b.thing.id}`;
    return null;
  }
  function activate(key: string) {
    if (key === "status:dismiss") {
      dismissed = status()?.id ?? "";
      error = null;
      drawChrome();
      return;
    }
    const control = controls.find((c) => c.key === key);
    if (control) {
      if (!control.busy) safe(control.run);
      return;
    }
    if (key.startsWith("node:")) {
      const b = bodies.get(key.slice(5));
      if (b?.alive && b.role !== "focus") safe(() => session.focus(b.thing.id));
    }
  }
  function cancelDrag() {
    if (drag && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    drag = null;
    wake();
  }
  function down(e: PointerEvent) {
    if (drag || e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    keyboard = null;
    const p = pos(e);
    mouse = p;
    const key = hit(p.x, p.y);
    const b = key?.startsWith("node:") ? bodies.get(key.slice(5)) : null;
    drag = {
      id: e.pointerId,
      key,
      body: b && b.role !== "sibling" ? b.thing.id : null,
      sx: p.x,
      sy: p.y,
      x: p.x,
      y: p.y,
      dx: b ? p.x - b.px : 0,
      dy: b ? p.y - b.py : 0,
      moved: false,
      dockStart: dock && inside(p.x, p.y, dock) ? dockScroll : null,
    };
    canvas.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const p = pos(e);
    mouse = p;
    if (drag?.id === e.pointerId) {
      drag.x = p.x;
      drag.y = p.y;
      if (drag.dockStart !== null && Math.abs(p.x - drag.sx) > 5) {
        drag.moved = true;
        dockScroll = clamp(drag.dockStart + drag.sx - p.x, 0, dockMaxScroll);
        updateDockScroll();
        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
      if (drag.body && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 5)
        drag.moved = true;
      if (drag.moved) {
        canvas.style.cursor = "grabbing";
        wake();
        return;
      }
    }
    const next = hit(p.x, p.y);
    if (next !== hover) {
      hover = next;
      canvas.style.cursor = next ? "pointer" : "default";
      for (const c of controls)
        if (c.view && !c.busy) c.view.alpha = c.key === next ? 1 : 0.9;
      wake();
    }
  }
  function up(e: PointerEvent) {
    if (!drag || drag.id !== e.pointerId) return;
    const d = drag;
    const p = pos(e);
    const clicked = !d.moved && d.key && hit(p.x, p.y) === d.key;
    if (d.moved && d.body) {
      const b = bodies.get(d.body);
      if (b && b.role !== "focus") b.pinned = { x: p.x - d.dx, y: p.y - d.dy };
    }
    cancelDrag();
    if (clicked) activate(d.key!);
    if (e.pointerType === "touch") mouse = null;
    hover = hit(p.x, p.y);
    canvas.style.cursor = hover ? "pointer" : "default";
    wake();
  }
  function leave() {
    if (!drag) {
      hover = null;
      mouse = null;
      canvas.style.cursor = "default";
      wake();
    }
  }
  function wheel(e: WheelEvent) {
    if (e.ctrlKey || drag) return;
    e.preventDefault();
    const p = pos(e);
    if (dock && inside(p.x, p.y, dock)) {
      if (dockMaxScroll > 0) {
        dockScroll = clamp(
          dockScroll +
            (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY),
          0,
          dockMaxScroll,
        );
        updateDockScroll();
        wake();
      }
      return;
    }
    if (wheelTimer !== undefined) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelAmount = 0;
      wheelLocked = false;
    }, 180);
    if (wheelLocked) return;
    if (
      controls.some((c) => !c.key.startsWith("action:") && inside(p.x, p.y, c))
    )
      return;
    wheelAmount +=
      e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1);
    if (Math.abs(wheelAmount) < 70) return;
    wheelLocked = true;
    if (wheelAmount > 0) safe(() => session.back());
    else {
      const key = hit(p.x, p.y);
      if (key?.startsWith("node:")) activate(key);
    }
  }
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (drag) cancelDrag();
      else safe(() => session.back());
    } else if (
      ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)
    ) {
      e.preventDefault();
      const items = [
        ...controls.filter((c) => !c.busy).map((c) => c.key),
        ...[...bodies.values()]
          .filter((b) => b.alive)
          .map((b) => `node:${b.thing.id}`),
      ];
      if (!items.length) return;
      const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      keyboard =
        items[
          (items.indexOf(keyboard ?? "") + dir + items.length) % items.length
        ]!;
      const c = controls.find((c) => c.key === keyboard);
      if (c?.key.startsWith("action:") && dock) {
        if (c.x - dockScroll < dock.x + 14)
          dockScroll = clamp(c.x - dock.x - 14, 0, dockMaxScroll);
        else if (c.x + c.w - dockScroll > dock.x + dock.w - 14)
          dockScroll = clamp(
            c.x + c.w - dock.x - dock.w + 14,
            0,
            dockMaxScroll,
          );
        updateDockScroll();
      }
      wake();
    } else if ((e.key === "Enter" || e.key === " ") && keyboard && !e.repeat) {
      e.preventDefault();
      activate(keyboard);
    }
  }
  function resetPosition() {
    for (const b of bodies.values()) b.pinned = null;
    wake();
  }
  function updateBackdrop() {
    if (!ready) return;

    // Reuse the same canvas-backed texture instead of destroying a source
    // that the renderer may still have in an internal bind group.
    if (!backgroundTexture) {
      backdropCanvas = makeBackdrop(w, h);
      backgroundTexture = Texture.from(backdropCanvas);
      backdrop.texture = backgroundTexture;
    } else if (backdropCanvas) {
      backgroundTexture.source.resize(w, h);
      makeBackdrop(w, h, backdropCanvas);
      backgroundTexture.source.update();
      backgroundTexture.update();
    }
    backdrop.width = w;
    backdrop.height = h;
    glassLayer.filterArea = new Rectangle(0, 0, w, h);

    // CRITICAL: Keep the SAME texture source bound to the shader. Recreating
    // and destroying it on every resize triggered the BindGroup warnings.
    sceneTexture?.resize(w, h, renderResolution(w, h));
    sceneSprite.width = w;
    sceneSprite.height = h;
    if (glassFilter) {
      const size = glassFilter.resources.glassUniforms.uniforms
        .uGlassViewport as Float32Array;
      size[0] = w;
      size[1] = h;
    }
  }
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(rect.width));
    const nh = Math.max(1, Math.round(rect.height));
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    if (ready) {
      app.renderer.resize(w, h, renderResolution(w, h));
      updateBackdrop();
    }
    rebuild();
  }
  const changeMotion = () => wake();
  const onCancel = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) cancelDrag();
  };
  const onLostCapture = (e: PointerEvent) => {
    if (drag?.id === e.pointerId) {
      drag = null;
      wake();
    }
  };
  const onBlur = () => {
    keyboard = null;
    wake();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault(); // Permit WebGL to restore the context.
    contextLost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    if (!destroyed)
      console.warn("adapt-pixijs: WebGL context lost; pausing rendering");
  };
  const onContextRestored = () => {
    contextLost = false;
    if (!destroyed) {
      console.info("adapt-pixijs: WebGL context restored");
      wake();
    }
  };

  const unsubscribe = session.subscribe(rebuild);
  const observer = new ResizeObserver(resize);
  canvas.style.touchAction = "none";
  canvas.style.background = "#e6edf7";
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Adapt workspace. Drag to arrange. Scroll up to open, scroll down to go back. Arrow keys select, Enter opens, Escape goes back.",
  );
  observer.observe(canvas);
  window.addEventListener("resize", resize);
  motion.addEventListener("change", changeMotion);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("lostpointercapture", onLostCapture);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("dblclick", resetPosition);
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("blur", onBlur);
  resize();
  rebuild();

  // PixiJS v8 app.init is necessarily async. The public canvasView API is not.
  void (async () => {
    try {
      const resolution = renderResolution(w, h);
      await app.init({
        canvas,
        width: w,
        height: h,
        resolution,
        autoDensity: false,
        antialias: USE_MSAA,
        backgroundAlpha: 0,
        autoStart: false,
        preference: "webgl",
        powerPreference: "high-performance",
      });
      if (destroyed) {
        app.destroy({ removeView: false }, { children: true });
        return;
      }
      ready = true;
      glassMaskTexture = Texture.from(makeGlassMask());
      // The filter must have a valid source texture at construction time.
      sceneTexture = RenderTexture.create({
        width: w,
        height: h,
        resolution,
        dynamic: true,
      });
      sceneSprite.texture = sceneTexture;
      sceneSprite.width = w;
      sceneSprite.height = h;
      glassFilter = Filter.from({
        gl: { vertex: GLASS_VERTEX, fragment: GLASS_FRAGMENT },
        resources: {
          uSceneTexture: sceneTexture.source,
          uSceneSampler: sceneTexture.source.style,
          glassUniforms: {
            uGlassViewport: {
              value: new Float32Array([w, h]),
              type: "vec2<f32>",
            },
          },
        },
        resolution: "inherit",
        padding: 0,
      });
      glassLayer.filters = [glassFilter];
      backgroundScene.addChild(backdrop, backChrome, world);
      app.stage.addChild(sceneSprite, glassLayer, chrome);
      app.renderer.resize(w, h, renderResolution(w, h));
      updateBackdrop();
      rebuild();
    } catch (e) {
      if (!destroyed) {
        console.error("adapt-pixijs: failed to initialize PixiJS", e);
        error = e instanceof Error ? e.message : String(e);
      }
    }
  })();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      if (wheelTimer !== undefined) clearTimeout(wheelTimer);
      cancelDrag();
      observer.disconnect();
      unsubscribe();
      window.removeEventListener("resize", resize);
      motion.removeEventListener("change", changeMotion);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("dblclick", resetPosition);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("blur", onBlur);
      canvas.style.touchAction = oldTouch;
      canvas.style.cursor = oldCursor;
      canvas.style.background = oldBackground;
      if (oldTabIndex === null) canvas.removeAttribute("tabindex");
      else canvas.setAttribute("tabindex", oldTabIndex);
      if (oldLabel === null) canvas.removeAttribute("aria-label");
      else canvas.setAttribute("aria-label", oldLabel);
      if (ready) {
        // Remove bound textures from the shader before releasing their sources.
        glassLayer.filters = [];
        if (glassFilter) {
          glassFilter.resources.uSceneTexture = Texture.EMPTY.source;
          glassFilter.resources.uSceneSampler = Texture.EMPTY.source.style;
          glassFilter.destroy();
        }
        sceneSprite.texture = Texture.EMPTY;
        backdrop.texture = Texture.EMPTY;
        app.destroy({ removeView: false }, { children: true });
        backgroundScene.destroy({ children: true });
        sceneTexture?.destroy(true);
        glassMaskTexture?.destroy(true);
        backgroundTexture?.destroy(true);
      }
      // Release our small canvas-backed textures, even if other images are pending.
      for (const image of loadingImages) {
        image.onload = image.onerror = null;
        image.src = "";
      }
      loadingImages.clear();
      for (const texture of ownedTextures) texture.destroy(true);
      ownedTextures.clear();
      loggedImageErrors.clear();
      bodies.clear();
      collected.clear();
      pending.clear();
      textures.clear();
    },
  };
}

// Optional naming convenience. The original canvasView export remains compatible.
export const pixiView = canvasView;

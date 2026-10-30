/**
 * Reuse progressively halved images for minification. Selecting a level just
 * above the physical output size avoids resampling full-resolution detail on
 * every animation frame. Weak keys let cached levels go with their source.
 */
export function createImageSampler() {
  const cache = new WeakMap<HTMLImageElement, HTMLCanvasElement[]>();

  return (image: HTMLImageElement, width: number, height: number): CanvasImageSource => {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight) return image;
    let levels = cache.get(image);
    if (!levels) {
      levels = [];
      cache.set(image, levels);
    }

    let source: CanvasImageSource = image;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;
    let level = 0;
    while (sourceWidth / 2 >= Math.max(1, width) &&
           sourceHeight / 2 >= Math.max(1, height)) {
      let next = levels[level];
      if (!next) {
        next = document.createElement("canvas");
        next.width = Math.max(1, Math.floor(sourceWidth / 2));
        next.height = Math.max(1, Math.floor(sourceHeight / 2));
        const context = next.getContext("2d");
        if (!context) break;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, 0, 0, next.width, next.height);
        levels.push(next);
      }
      source = next;
      sourceWidth = next.width;
      sourceHeight = next.height;
      level++;
    }
    return source;
  };
}

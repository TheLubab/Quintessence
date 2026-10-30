export function beginSquirclePath(ctx: CanvasRenderingContext2D, x: number, y: number, half: number) {
      // A fourth-order superellipse gives the preview continuous, soft corners.
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const pointX = x + half * Math.sign(cos) * Math.sqrt(Math.abs(cos));
        const pointY = y + half * Math.sign(sin) * Math.sqrt(Math.abs(sin));
        if (i === 0) ctx.moveTo(pointX, pointY);
        else ctx.lineTo(pointX, pointY);
      }
      ctx.closePath();
}

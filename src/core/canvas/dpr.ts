// 返回当前显示设备在物理像素和 CSS 像素之间的分辨率比例。

// get device pixel ratio, clamped to reasonable range
export function getDpr(): number {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.devicePixelRatio || 1, 3);
}


// Apply DPR scaling to canvas context
export function applyDpr(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    w: number,
    h: number
) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h);
}
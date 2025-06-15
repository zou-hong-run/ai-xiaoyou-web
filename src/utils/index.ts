// ==================== 新增缓动函数 ====================
// 弹性缓动函数
export function easeOutElastic(t: number): number {
  if (!t) t = 0;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

// 回弹缓动函数
export function easeOutBack(t: number): number {
  if (!t) t = 0;
  const s = 1.70158;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}
// 二次缓动函数
export function easeInOutQuad(t: number): number {
  if (!t) t = 0;
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// 三次缓动函数
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}
// ==================== 新增辅助函数 ====================
// 线性插值函数
export function lerp(start: number, end: number, t: number): number {
  return start * (1 - t) + end * t;
}

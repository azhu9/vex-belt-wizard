// Geometry for a belt wrapped around up to three pulleys (all on the outside of the belt).
// All values are in mm; angles are in radians and use the same (SVG, y-down) coordinates as the points.

export interface Vec {
  x: number;
  y: number;
}

export interface Pulley extends Vec {
  r: number;
}

export interface BeltSolution {
  length: number; // pitch length of the belt path in mm
  order: number[]; // pulley indices the belt actually touches, in travel order
  wraps: number[]; // wrap angle per pulley index (0 if the belt misses it)
  path: string; // SVG path of the belt pitch line
}

const TAU = Math.PI * 2;
const normAngle = (a: number) => ((a % TAU) + TAU) % TAU;

export const pitchRadius = (teeth: number, pitch: number) => (teeth * pitch) / (2 * Math.PI);

export const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

// Outer tangent from pulley a to pulley b, with the belt on the right-hand side of travel.
// phi is the direction of the shared normal at both contact points.
const outerTangent = (a: Pulley, b: Pulley) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const c = (a.r - b.r) / d;
  if (!(d > 0) || Math.abs(c) >= 1) return null;
  return {
    phi: Math.atan2(dy, dx) - Math.acos(c),
    len: Math.sqrt(d * d - (a.r - b.r) ** 2),
  };
};

const beltAround = (ps: Pulley[], order: number[]): BeltSolution | null => {
  const n = order.length;
  const edges = [];
  for (let k = 0; k < n; k++) {
    const t = outerTangent(ps[order[k]], ps[order[(k + 1) % n]]);
    if (!t) return null;
    edges.push(t);
  }

  const wraps = ps.map(() => 0);
  let length = 0;
  let wrapSum = 0;
  const contact = (p: Pulley, phi: number) => `${p.x + p.r * Math.cos(phi)} ${p.y + p.r * Math.sin(phi)}`;
  let path = `M ${contact(ps[order[0]], edges[0].phi)}`;

  for (let k = 0; k < n; k++) {
    const j = order[(k + 1) % n];
    const p = ps[j];
    const phiIn = edges[k].phi;
    const phiOut = edges[(k + 1) % n].phi;
    const w = normAngle(phiOut - phiIn);
    wraps[j] = w;
    wrapSum += w;
    length += edges[k].len + p.r * w;
    path += ` L ${contact(p, phiIn)} A ${p.r} ${p.r} 0 ${w > Math.PI ? 1 : 0} 1 ${contact(p, phiOut)}`;
  }

  // A convex belt turns exactly one full revolution; anything else means a pulley sits inside the belt.
  if (Math.abs(wrapSum - TAU) > 1e-6) return null;
  return { length, order, wraps, path: path + " Z" };
};

// Belt around the convex hull of three pulleys. If one pulley sits inside the belt,
// the result only wraps the other two and that pulley's wrap is 0.
export const solveBelt = (ps: Pulley[]): BeltSolution | null => {
  const candidates = [
    [0, 1, 2],
    [0, 2, 1],
    [0, 1],
    [1, 2],
    [0, 2],
  ]
    .map((order) => beltAround(ps, order))
    .filter((s): s is BeltSolution => s !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, s) => (s.length > best.length ? s : best));
};

const lengthWith = (ps: Pulley[], idx: number, at: Vec) => {
  const moved = ps.map((p, i) => (i === idx ? { ...p, x: at.x, y: at.y } : p));
  return solveBelt(moved)?.length ?? NaN;
};

const midpointOfOthers = (ps: Pulley[], idx: number): Vec => {
  const others = ps.filter((_, i) => i !== idx);
  return { x: (others[0].x + others[1].x) / 2, y: (others[0].y + others[1].y) / 2 };
};

// Moving outward from a point inside the belt only ever makes the belt longer,
// so bisection along a ray finds the single point where the belt fits exactly.
const solveAlongRay = (ps: Pulley[], idx: number, target: number, origin: Vec, dir: Vec): Vec | null => {
  const at = (t: number) => ({ x: origin.x + dir.x * t, y: origin.y + dir.y * t });
  if (!(lengthWith(ps, idx, at(0)) < target)) return null;
  let lo = 0;
  let hi = target;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lengthWith(ps, idx, at(mid)) < target) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2);
};

// Every position for pulley idx (others held still) where the belt is exactly `target` mm long.
export const beltLocus = (ps: Pulley[], idx: number, target: number, samples = 180): Vec[] => {
  const origin = midpointOfOthers(ps, idx);
  const pts: Vec[] = [];
  for (let k = 0; k < samples; k++) {
    const a = (k / samples) * TAU;
    const p = solveAlongRay(ps, idx, target, origin, { x: Math.cos(a), y: Math.sin(a) });
    if (p) pts.push(p);
  }
  return pts;
};

// Point on the belt locus in the direction of `near`.
export const placeOnBelt = (ps: Pulley[], idx: number, target: number, near: Vec): Vec | null => {
  const origin = midpointOfOthers(ps, idx);
  const d = dist(origin, near);
  const dir = d > 1e-9 ? { x: (near.x - origin.x) / d, y: (near.y - origin.y) / d } : { x: 0, y: -1 };
  return solveAlongRay(ps, idx, target, origin, dir);
};

const angleGap = (a: number, b: number) => {
  const g = normAngle(a - b);
  return Math.min(g, TAU - g);
};

// Point on the circle (center, radius) where the belt fits exactly, closest to `near`.
export const placeOnCircleForBelt = (
  ps: Pulley[],
  idx: number,
  target: number,
  center: Vec,
  radius: number,
  near: Vec,
): Vec | null => {
  const at = (a: number) => ({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  const f = (a: number) => lengthWith(ps, idx, at(a)) - target;
  const nearAngle = Math.atan2(near.y - center.y, near.x - center.x);
  const steps = 360;
  let best: number | null = null;
  let prevA = 0;
  let prevF = f(0);
  for (let k = 1; k <= steps; k++) {
    const a = (k / steps) * TAU;
    const fa = f(a);
    if (Number.isFinite(prevF) && Number.isFinite(fa) && Math.sign(prevF) !== Math.sign(fa)) {
      let lo = prevA;
      let hi = a;
      const loSign = Math.sign(prevF);
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(f(mid)) === loSign) lo = mid;
        else hi = mid;
      }
      const root = (lo + hi) / 2;
      if (best === null || angleGap(root, nearAngle) < angleGap(best, nearAngle)) best = root;
    }
    prevA = a;
    prevF = fa;
  }
  return best === null ? null : at(best);
};

export const projectToCircle = (center: Vec, radius: number, p: Vec): Vec => {
  const d = dist(center, p);
  if (d < 1e-9) return { x: center.x + radius, y: center.y };
  return { x: center.x + ((p.x - center.x) / d) * radius, y: center.y + ((p.y - center.y) / d) * radius };
};

// Intersection of two circles closest to `near`, or null if they don't meet.
export const circleIntersection = (c1: Vec, r1: number, c2: Vec, r2: number, near: Vec): Vec | null => {
  const d = dist(c1, c2);
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const ux = (c2.x - c1.x) / d;
  const uy = (c2.y - c1.y) / d;
  const mx = c1.x + ux * a;
  const my = c1.y + uy * a;
  const p1 = { x: mx - uy * h, y: my + ux * h };
  const p2 = { x: mx + uy * h, y: my - ux * h };
  return dist(p1, near) <= dist(p2, near) ? p1 : p2;
};

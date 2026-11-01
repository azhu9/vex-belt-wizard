import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, Magnet, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pulley,
  Vec,
  beltLocus,
  circleIntersection,
  dist,
  pitchRadius,
  placeOnBelt,
  placeOnCircleForBelt,
  projectToCircle,
  solveBelt,
} from "@/lib/beltGeometry";

interface TrianglePlannerProps {
  unit: "mm" | "inches";
  pitch: number;
  belts: number[];
  beltLength: string;
  onBeltLengthChange: (value: string) => void;
}

type PairKey = "01" | "12" | "02";
type EditTarget = PairKey | "perp" | "along";

const PAIRS: { key: PairKey; i: number; j: number }[] = [
  { key: "01", i: 0, j: 1 },
  { key: "12", i: 1, j: 2 },
  { key: "02", i: 0, j: 2 },
];
const NAMES = ["A", "B", "C"];
const COLORS = ["hsl(217 91% 60%)", "hsl(330 81% 60%)", "hsl(142 71% 45%)"];
const HOLE_SPACING = 12.7; // VEX hole pitch, 0.5 in
const MM_TO_INCHES = 0.0393701;

const DEFAULT_POSITIONS: Vec[] = [
  { x: 0, y: 0 },
  { x: 150, y: 0 },
  { x: 60, y: -110 },
];

export const TrianglePlanner = ({ unit, pitch, belts, beltLength, onBeltLengthChange }: TrianglePlannerProps) => {
  const [teeth, setTeeth] = useState<string[]>(["20", "40", "20"]);
  const [positions, setPositions] = useState<Vec[]>(DEFAULT_POSITIONS);
  const [locks, setLocks] = useState<Record<PairKey, number | null>>({ "01": null, "12": null, "02": null });
  const [lockInputs, setLockInputs] = useState<Record<PairKey, string>>({ "01": "", "12": "", "02": "" });
  const [selected, setSelected] = useState(2);
  const [snapToBelt, setSnapToBelt] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");

  const svgRef = useRef<SVGSVGElement>(null);
  const dragOffset = useRef<Vec>({ x: 0, y: 0 });
  const frozenView = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const convertToDisplay = (mm: number) => (unit === "inches" ? mm * MM_TO_INCHES : mm);
  const convertToMm = (value: number) => (unit === "inches" ? value / MM_TO_INCHES : value);
  const formatLength = (mm: number) => convertToDisplay(mm).toFixed(unit === "mm" ? 1 : 3);

  // Re-express locked distances in the new unit when the unit changes
  useEffect(() => {
    setLockInputs((prev) => {
      const next = { ...prev };
      for (const { key } of PAIRS) {
        const mm = locks[key];
        if (mm !== null) next[key] = formatLength(mm);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  const radii = teeth.map((t) => {
    const n = parseFloat(t);
    return n > 0 ? pitchRadius(n, pitch) : 0;
  });
  const pulleys: Pulley[] = positions.map((p, i) => ({ ...p, r: radii[i] }));
  const targetTeeth = parseFloat(beltLength);
  const targetMm = targetTeeth * pitch;

  const solution = useMemo(() => solveBelt(pulleys), [JSON.stringify(pulleys)]); // eslint-disable-line react-hooks/exhaustive-deps
  const locus = useMemo(
    () => (targetMm > 0 ? beltLocus(pulleys, selected, targetMm) : []),
    // Only the other two pulleys shape the locus, so dragging the selected one doesn't recompute it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pulleys.filter((_, i) => i !== selected)), radii[selected], selected, targetMm],
  );

  const locksOn = (idx: number, lockState = locks) =>
    PAIRS.filter(({ key, i, j }) => lockState[key] !== null && (i === idx || j === idx)).map(({ key, i, j }) => ({
      key,
      partner: i === idx ? j : i,
      d: lockState[key] as number,
    }));

  // Move pulley idx as close to `desired` as its locks (and belt / grid snapping) allow
  const constrain = (
    idx: number,
    desired: Vec,
    pts: Vec[],
    lockState = locks,
    fitBelt = snapToBelt,
    primary?: PairKey,
  ): Vec => {
    const ps: Pulley[] = pts.map((p, i) => ({ ...p, r: radii[i] }));
    const held = locksOn(idx, lockState).sort((a, b) => (a.key === primary ? -1 : b.key === primary ? 1 : 0));

    if (held.length >= 2) {
      const [l1, l2] = held;
      return (
        circleIntersection(pts[l1.partner], l1.d, pts[l2.partner], l2.d, desired) ??
        projectToCircle(pts[l1.partner], l1.d, desired)
      );
    }
    if (held.length === 1) {
      const { partner, d } = held[0];
      if (fitBelt && targetMm > 0) {
        const p = placeOnCircleForBelt(ps, idx, targetMm, pts[partner], d, desired);
        if (p) return p;
      }
      return projectToCircle(pts[partner], d, desired);
    }
    if (fitBelt && targetMm > 0) {
      const p = placeOnBelt(ps, idx, targetMm, desired);
      if (p) return p;
    }
    if (snapToGrid) {
      return {
        x: Math.round(desired.x / HOLE_SPACING) * HOLE_SPACING,
        y: Math.round(desired.y / HOLE_SPACING) * HOLE_SPACING,
      };
    }
    return desired;
  };

  const toSvgPoint = (e: React.PointerEvent): Vec => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    const p = toSvgPoint(e);
    dragOffset.current = { x: positions[idx].x - p.x, y: positions[idx].y - p.y };
    svgRef.current?.setPointerCapture(e.pointerId);
    setSelected(idx);
    setDragging(idx);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const p = toSvgPoint(e);
    const desired = { x: p.x + dragOffset.current.x, y: p.y + dragOffset.current.y };
    setPositions((prev) => prev.map((q, i) => (i === dragging ? constrain(i, desired, prev) : q)));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragging === null) return;
    svgRef.current?.releasePointerCapture(e.pointerId);
    setDragging(null);
  };

  const applyLock = (key: PairKey, mm: number) => {
    const nextLocks = { ...locks, [key]: mm };
    setLocks(nextLocks);
    const { i, j } = PAIRS.find((p) => p.key === key)!;
    // Move whichever end of the pair is less tied down by other locks
    const otherLocks = (idx: number) => locksOn(idx, nextLocks).length - 1;
    const mover = otherLocks(j) > 0 && otherLocks(i) === 0 ? i : j;
    const anchor = mover === i ? j : i;
    setPositions((prev) => {
      const desired = projectToCircle(prev[anchor], mm, prev[mover]);
      return prev.map((q, k) => (k === mover ? constrain(k, desired, prev, nextLocks, false, key) : q));
    });
    const third = 3 - i - j;
    if (locksOn(third, nextLocks).length === 0) setSelected(third);
  };

  const handleLockInput = (key: PairKey, value: string) => {
    setLockInputs((prev) => ({ ...prev, [key]: value }));
    if (value.trim() === "") {
      setLocks((prev) => ({ ...prev, [key]: null }));
      return;
    }
    const v = parseFloat(value);
    if (v > 0) applyLock(key, convertToMm(v));
  };

  const toggleLock = (key: PairKey) => {
    if (locks[key] !== null) {
      setLocks((prev) => ({ ...prev, [key]: null }));
      setLockInputs((prev) => ({ ...prev, [key]: "" }));
    } else {
      const { i, j } = PAIRS.find((p) => p.key === key)!;
      const d = dist(positions[i], positions[j]);
      setLocks((prev) => ({ ...prev, [key]: d }));
      setLockInputs((prev) => ({ ...prev, [key]: formatLength(d) }));
      const third = 3 - i - j;
      if (locksOn(third).length === 0) setSelected(third);
    }
  };

  const placeSelected = () => {
    setPositions((prev) => prev.map((q, i) => (i === selected ? constrain(i, q, prev, locks, true) : q)));
  };

  const reset = () => {
    setPositions(DEFAULT_POSITIONS);
    setLocks({ "01": null, "12": null, "02": null });
    setLockInputs({ "01": "", "12": "", "02": "" });
    setSelected(2);
  };

  // Results
  const lengthMm = solution?.length ?? NaN;
  const diffMm = lengthMm - targetMm;
  const status: "good" | "tight" | "loose" = Math.abs(diffMm) < 1 ? "good" : diffMm > 0 ? "tight" : "loose";
  const beltColor =
    status === "good" ? "hsl(var(--success))" : status === "tight" ? "hsl(var(--destructive))" : "hsl(var(--warning))";

  const warnings: string[] = [];
  for (const { i, j } of PAIRS) {
    if (dist(positions[i], positions[j]) < radii[i] + radii[j]) {
      warnings.push(`Pulleys ${NAMES[i]} and ${NAMES[j]} overlap.`);
    }
  }
  if (solution) {
    solution.wraps.forEach((w, i) => {
      if (w === 0) warnings.push(`Pulley ${NAMES[i]} sits inside the belt and isn't driven.`);
    });
  }
  if (targetMm > 0 && locus.length === 0) {
    warnings.push(`A ${targetTeeth}T belt is too short to reach ${NAMES[selected]} with the other two pulleys where they are.`);
  }

  // Selected pulley measured against the center line through the other two:
  // how far it sits off that line, and where along the line (from the first pulley) its foot lands
  const [baseFrom, baseTo] = [0, 1, 2].filter((i) => i !== selected);
  const baseLen = dist(positions[baseFrom], positions[baseTo]);
  const baseDir =
    baseLen > 1e-9
      ? {
          x: (positions[baseTo].x - positions[baseFrom].x) / baseLen,
          y: (positions[baseTo].y - positions[baseFrom].y) / baseLen,
        }
      : { x: 1, y: 0 };
  const rel = { x: positions[selected].x - positions[baseFrom].x, y: positions[selected].y - positions[baseFrom].y };
  const alongMm = rel.x * baseDir.x + rel.y * baseDir.y;
  const offsetMm = baseDir.x * rel.y - baseDir.y * rel.x; // signed: which side of the line
  const perpMm = Math.abs(offsetMm);
  const foot = { x: positions[baseFrom].x + baseDir.x * alongMm, y: positions[baseFrom].y + baseDir.y * alongMm };
  // Unit normal pointing from the line toward the selected pulley (and its opposite for the along-dimension)
  const side = offsetMm >= 0 ? 1 : -1;
  const normal = { x: -baseDir.y * side, y: baseDir.x * side };

  const pairKey = (a: number, b: number) => PAIRS.find((p) => (p.i === a && p.j === b) || (p.i === b && p.j === a))!.key;

  // Move the selected pulley to a new perpendicular offset or along-line position.
  // A single lock to one end of the base line is kept by sliding around that pulley;
  // otherwise the pulley goes exactly where asked and any locked distances follow it.
  const moveSelected = (kind: "perp" | "along", value: number) => {
    const P = positions[baseFrom];
    const kP = pairKey(selected, baseFrom);
    const kQ = pairKey(selected, baseTo);
    const dP = locks[kP];
    const dQ = locks[kQ];
    const sign = (v: number) => (v >= 0 ? 1 : -1);
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    let s = alongMm;
    let h = perpMm;
    if (kind === "perp") {
      h = value;
      if (dP !== null && dQ === null) {
        h = Math.min(h, dP);
        s = sign(s) * Math.sqrt(dP * dP - h * h);
      } else if (dQ !== null && dP === null) {
        h = Math.min(h, dQ);
        s = baseLen + sign(s - baseLen) * Math.sqrt(dQ * dQ - h * h);
      }
    } else {
      s = value;
      if (dP !== null && dQ === null) {
        s = clamp(s, -dP, dP);
        h = Math.sqrt(dP * dP - s * s);
      } else if (dQ !== null && dP === null) {
        s = clamp(s, baseLen - dQ, baseLen + dQ);
        h = Math.sqrt(dQ * dQ - (s - baseLen) ** 2);
      }
    }
    const next = { x: P.x + baseDir.x * s + normal.x * h, y: P.y + baseDir.y * s + normal.y * h };
    const nextLocks = { ...locks };
    const nextInputs = { ...lockInputs };
    for (const [k, other] of [
      [kP, baseFrom],
      [kQ, baseTo],
    ] as const) {
      if (nextLocks[k] !== null) {
        nextLocks[k] = dist(next, positions[other]);
        nextInputs[k] = formatLength(nextLocks[k]!);
      }
    }
    setLocks(nextLocks);
    setLockInputs(nextInputs);
    setPositions((prev) => prev.map((q, i) => (i === selected ? next : q)));
  };

  const startEdit = (target: EditTarget, currentMm: number) => {
    setEditing(target);
    setEditValue(formatLength(currentMm));
  };

  const commitEdit = () => {
    if (editing === null) return;
    const target = editing;
    setEditing(null);
    const v = parseFloat(editValue);
    if (!Number.isFinite(v)) return;
    const mm = convertToMm(v);
    if (target === "perp") moveSelected("perp", Math.abs(mm));
    else if (target === "along") moveSelected("along", mm);
    else if (mm > 0) {
      setLockInputs((prev) => ({ ...prev, [target]: formatLength(mm) }));
      applyLock(target, mm);
    }
  };

  // View box: fit pulleys and the guide curve, but hold still while dragging so the canvas doesn't jump
  const computeView = () => {
    const xs: number[] = [];
    const ys: number[] = [];
    pulleys.forEach((p) => {
      xs.push(p.x - p.r, p.x + p.r);
      ys.push(p.y - p.r, p.y + p.r);
    });
    locus.forEach((p) => {
      xs.push(p.x - radii[selected], p.x + radii[selected]);
      ys.push(p.y - radii[selected], p.y + radii[selected]);
    });
    const pad = 30;
    let minX = Math.min(...xs) - pad;
    let maxX = Math.max(...xs) + pad;
    let minY = Math.min(...ys) - pad;
    let maxY = Math.max(...ys) + pad;
    const minSpan = 150;
    if (maxX - minX < minSpan) {
      const c = (minX + maxX) / 2;
      minX = c - minSpan / 2;
      maxX = c + minSpan / 2;
    }
    if (maxY - minY < minSpan) {
      const c = (minY + maxY) / 2;
      minY = c - minSpan / 2;
      maxY = c + minSpan / 2;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
  const view = dragging !== null && frozenView.current ? frozenView.current : computeView();
  frozenView.current = view;

  const span = Math.max(view.w, view.h);
  const fontSize = span / 32;
  const stroke = span / 300;
  const locusPath = locus.length > 2 ? `M ${locus.map((p) => `${p.x} ${p.y}`).join(" L ")} Z` : "";

  // A measurement on the drawing that turns into a text box when clicked
  const measureLabel = (
    target: EditTarget,
    currentMm: number,
    x: number,
    y: number,
    anchor: "start" | "middle" | "end",
    size: number,
    content: React.ReactNode,
    textProps: React.SVGProps<SVGTextElement> = {},
  ) => {
    if (editing === target) {
      const w = size * 6;
      const h = size * 1.7;
      const fx = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      return (
        <foreignObject key={target} x={fx} y={y - h / 2} width={w} height={h}>
          <input
            autoFocus
            type="number"
            step={unit === "mm" ? "0.1" : "0.01"}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(null);
            }}
            style={{ fontSize: size, borderWidth: size * 0.08, padding: `0 ${size * 0.25}px` }}
            className="w-full h-full rounded-sm border-primary bg-background text-foreground outline-none"
          />
        </foreignObject>
      );
    }
    return (
      <text
        key={target}
        x={x}
        y={y}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={size}
        {...textProps}
        className={`cursor-text pointer-events-auto hover:opacity-70 ${textProps.className ?? ""}`}
        style={{ textDecoration: "underline dotted" }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => startEdit(target, currentMm)}
      >
        <title>Click to edit</title>
        {content}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Three-Pulley Layout</CardTitle>
          <CardDescription>
            Pick a belt, set pulley sizes, then drag pulleys around. Type a distance between two pulleys to lock it —
            the dashed curve shows everywhere the selected pulley can go so the belt fits exactly. Click any
            measurement on the drawing to type in a new value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tri-belt">Belt Length (teeth)</Label>
              <Select value={beltLength} onValueChange={onBeltLengthChange}>
                <SelectTrigger id="tri-belt">
                  <SelectValue placeholder="Select belt size" />
                </SelectTrigger>
                <SelectContent>
                  {belts.map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}T
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {NAMES.map((name, i) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={`tri-n${i}`} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS[i] }} />
                  Pulley {name} (teeth)
                </Label>
                <Input
                  id={`tri-n${i}`}
                  type="number"
                  min="1"
                  value={teeth[i]}
                  onChange={(e) => setTeeth((prev) => prev.map((t, k) => (k === i ? e.target.value : t)))}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PAIRS.map(({ key, i, j }) => {
              const locked = locks[key] !== null;
              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`tri-d${key}`}>
                    {NAMES[i]} ↔ {NAMES[j]} distance ({unit})
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={`tri-d${key}`}
                      type="number"
                      min="0"
                      step={unit === "mm" ? "0.1" : "0.01"}
                      value={lockInputs[key]}
                      placeholder={formatLength(dist(positions[i], positions[j]))}
                      onChange={(e) => handleLockInput(key, e.target.value)}
                      className={locked ? "border-primary" : ""}
                    />
                    <Button
                      variant={locked ? "default" : "outline"}
                      size="icon"
                      onClick={() => toggleLock(key)}
                      title={locked ? "Unlock distance" : "Lock current distance"}
                    >
                      {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <Switch id="tri-snap-belt" checked={snapToBelt} onCheckedChange={setSnapToBelt} />
              <Label htmlFor="tri-snap-belt">Snap to belt while dragging</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tri-snap-grid" checked={snapToGrid} onCheckedChange={setSnapToGrid} />
              <Label htmlFor="tri-snap-grid">Snap to ½" hole grid</Label>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" onClick={placeSelected}>
                <Magnet className="h-4 w-4" />
                Place {NAMES[selected]} on belt
              </Button>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <div className="w-full flex justify-center">
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="w-full max-h-[520px] border border-border rounded-lg bg-card touch-none select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <pattern
                  id="hole-grid"
                  width={HOLE_SPACING}
                  height={HOLE_SPACING}
                  patternUnits="userSpaceOnUse"
                  x={-HOLE_SPACING / 2}
                  y={-HOLE_SPACING / 2}
                >
                  <circle
                    cx={HOLE_SPACING / 2}
                    cy={HOLE_SPACING / 2}
                    r={HOLE_SPACING * 0.08}
                    fill="hsl(var(--muted-foreground))"
                    opacity="0.35"
                  />
                </pattern>
              </defs>
              <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#hole-grid)" />

              {/* Where the selected pulley can sit for the belt to fit */}
              {locusPath && (
                <path
                  d={locusPath}
                  fill="none"
                  stroke={COLORS[selected]}
                  strokeWidth={stroke}
                  strokeDasharray={`${stroke * 4} ${stroke * 3}`}
                  opacity="0.8"
                />
              )}

              {/* Locked distances */}
              {PAIRS.filter(({ key }) => locks[key] !== null).map(({ key, i, j }) => (
                <line
                  key={key}
                  x1={positions[i].x}
                  y1={positions[i].y}
                  x2={positions[j].x}
                  y2={positions[j].y}
                  stroke="hsl(var(--primary))"
                  strokeWidth={stroke * 1.5}
                />
              ))}

              {/* Perpendicular offset of the selected pulley from the other two's center line */}
              {baseLen > 1e-9 &&
                (() => {
                  const A = positions[baseFrom];
                  const B = positions[baseTo];
                  const S = positions[selected];
                  const col = COLORS[selected];
                  const dash = `${stroke * 3} ${stroke * 2}`;
                  const end = alongMm < 0 ? A : alongMm > baseLen ? B : null;
                  const tick = fontSize * 0.5;
                  const back = alongMm > 0 ? -1 : 1;
                  const sq = fontSize * 0.4;
                  const at = (p: Vec, along: number, off: number) => ({
                    x: p.x + baseDir.x * along + normal.x * off,
                    y: p.y + baseDir.y * along + normal.y * off,
                  });
                  // Along-line dimension sits on the far side of the line from the selected pulley, clear of the belt
                  const dimOff = -(Math.max(radii[baseFrom], radii[baseTo]) + fontSize * 0.9);
                  const d1 = at(A, 0, dimOff);
                  const d2 = at(foot, 0, dimOff);
                  const perpMid = { x: (foot.x + S.x) / 2, y: (foot.y + S.y) / 2 };
                  const alongMid = at(A, alongMm / 2, dimOff - fontSize * 0.6);
                  return (
                    <g className="pointer-events-none">
                      {end && (
                        <line x1={end.x} y1={end.y} x2={foot.x} y2={foot.y} stroke={col} strokeWidth={stroke} strokeDasharray={dash} opacity="0.7" />
                      )}
                      <line x1={foot.x} y1={foot.y} x2={S.x} y2={S.y} stroke={col} strokeWidth={stroke * 1.2} strokeDasharray={dash} />
                      {perpMm > sq * 1.5 && (
                        <polyline
                          points={[at(foot, back * sq, 0), at(foot, back * sq, sq), at(foot, 0, sq)].map((p) => `${p.x},${p.y}`).join(" ")}
                          fill="none"
                          stroke={col}
                          strokeWidth={stroke}
                        />
                      )}
                      <circle cx={foot.x} cy={foot.y} r={stroke * 2} fill={col} />

                      {/* Along-line dimension from the first pulley to the foot of the perpendicular */}
                      <line x1={A.x} y1={A.y} x2={d1.x} y2={d1.y} stroke={col} strokeWidth={stroke * 0.7} opacity="0.6" />
                      <line x1={foot.x} y1={foot.y} x2={d2.x} y2={d2.y} stroke={col} strokeWidth={stroke * 0.7} opacity="0.6" />
                      <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={col} strokeWidth={stroke} />
                      {[d1, d2].map((p, k) => (
                        <line
                          key={k}
                          x1={p.x + normal.x * tick * 0.5}
                          y1={p.y + normal.y * tick * 0.5}
                          x2={p.x - normal.x * tick * 0.5}
                          y2={p.y - normal.y * tick * 0.5}
                          stroke={col}
                          strokeWidth={stroke * 1.5}
                        />
                      ))}

                      {measureLabel(
                        "perp",
                        perpMm,
                        perpMid.x + baseDir.x * fontSize * 0.5,
                        perpMid.y + baseDir.y * fontSize * 0.5,
                        baseDir.x >= 0 ? "start" : "end",
                        fontSize * 0.7,
                        <>
                          ⊥ {formatLength(perpMm)} {unit}
                        </>,
                        { fontWeight: 600, fill: col },
                      )}
                      {measureLabel(
                        "along",
                        alongMm,
                        alongMid.x,
                        alongMid.y,
                        "middle",
                        fontSize * 0.7,
                        <>
                          {formatLength(alongMm)} {unit} from {NAMES[baseFrom]}
                        </>,
                        { fontWeight: 600, fill: col },
                      )}
                    </g>
                  );
                })()}

              {solution && (
                <path d={solution.path} fill="none" stroke={beltColor} strokeWidth={stroke * 3} strokeLinejoin="round" />
              )}

              {pulleys.map((p, i) => (
                <g
                  key={i}
                  onPointerDown={handlePointerDown(i)}
                  className={dragging === i ? "cursor-grabbing" : "cursor-grab"}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(p.r, fontSize)}
                    fill="hsl(var(--muted))"
                    fillOpacity="0.85"
                    stroke={COLORS[i]}
                    strokeWidth={selected === i ? stroke * 3 : stroke * 1.5}
                  />
                  <circle cx={p.x} cy={p.y} r={stroke * 2.5} fill={COLORS[i]} />
                  <text
                    x={p.x}
                    y={p.y - fontSize * 0.4}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontWeight="600"
                    className="fill-foreground pointer-events-none"
                  >
                    {NAMES[i]}
                  </text>
                  <text
                    x={p.x}
                    y={p.y + fontSize * 1.1}
                    textAnchor="middle"
                    fontSize={fontSize * 0.75}
                    className="fill-muted-foreground pointer-events-none"
                  >
                    {teeth[i]}T
                  </text>
                </g>
              ))}

              {/* Distance labels */}
              {PAIRS.map(({ key, i, j }) =>
                measureLabel(
                  key,
                  dist(positions[i], positions[j]),
                  (positions[i].x + positions[j].x) / 2,
                  (positions[i].y + positions[j].y) / 2,
                  "middle",
                  fontSize * 0.7,
                  <>
                    {locks[key] !== null ? "🔒 " : ""}
                    {formatLength(dist(positions[i], positions[j]))} {unit}
                  </>,
                  { className: locks[key] !== null ? "fill-primary font-semibold" : "fill-muted-foreground" },
                ),
              )}
            </svg>
          </div>

          {solution && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Belt Path Length</p>
                <p className="text-3xl font-bold">{(lengthMm / pitch).toFixed(1)} T</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/10">
                <p className="text-sm text-muted-foreground mb-1">Selected Belt</p>
                <p className="text-3xl font-bold text-primary">{beltLength} T</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">Error</p>
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-bold">
                    {formatLength(Math.abs(diffMm))} {unit}
                  </p>
                  <Badge
                    variant={status === "good" ? "default" : status === "tight" ? "destructive" : "secondary"}
                    className={
                      status === "good"
                        ? "bg-success hover:bg-success/90"
                        : status === "loose"
                          ? "bg-warning hover:bg-warning/90"
                          : ""
                    }
                  >
                    {status === "good" ? "Good" : status === "tight" ? "Tight" : "Loose"}
                  </Badge>
                </div>
              </div>
              <div className="md:col-span-3 p-4 rounded-lg bg-secondary">
                <p className="text-sm text-muted-foreground mb-1">
                  Pulley {NAMES[selected]} relative to the {NAMES[baseFrom]}–{NAMES[baseTo]} center line
                </p>
                <p className="text-lg font-semibold">
                  {formatLength(perpMm)} {unit} off the line, {formatLength(alongMm)} {unit} along it from{" "}
                  {NAMES[baseFrom]}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ({formatLength(baseLen - alongMm)} {unit} from {NAMES[baseTo]})
                  </span>
                </p>
              </div>
              <div className="md:col-span-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                {NAMES.map((name, i) => (
                  <span key={name}>
                    {name}: {((solution.wraps[i] / (2 * Math.PI)) * (parseFloat(teeth[i]) || 0)).toFixed(1)} teeth
                    engaged ({((solution.wraps[i] * 180) / Math.PI).toFixed(0)}° wrap)
                  </span>
                ))}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="text-sm text-destructive space-y-1">
              {warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

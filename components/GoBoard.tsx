"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildStoneSet,
  coordEquals,
  fullWindow,
  isInBounds,
  isOccupied,
  starPoints,
  type BoardWindow,
} from "@/lib/board/board";
import type { Color, Coord, Stone } from "@/types";

type Props = {
  size: 9 | 13 | 19;
  stones: Stone[];
  toPlay: Color;
  userMove?: Coord | null;
  highlight?: Coord[]; // e.g. correct answer markers
  /** Additional stones to render on top (e.g. solution sequence). */
  extraStones?: Stone[];
  disabled?: boolean;
  onPlay?: (c: Coord) => void;
  /** Max rendered width in CSS pixels. Defaults to 520. */
  maxPx?: number;
  /** Board visual style. "classic" keeps the original light wood; "dark" uses the new dark theme. */
  boardStyle?: "classic" | "dark";
  /** Coordinate key "x,y" → move number to draw on the stone. */
  moveNumbers?: Map<string, number>;
  /** Highlight circle color. Defaults to CSS accent var. */
  highlightColor?: string;
  /** Enables focus + keyboard cursor navigation for interactive boards. */
  keyboardEnabled?: boolean;
  /** Focuses the board wrapper after mount. */
  focusOnMount?: boolean;
};

function keyOf(c: Coord): string {
  return `${c.x},${c.y}`;
}

/** Draw a single stone onto `ctx` at board coordinate `c`. Pure — does not close over any render state. */
function drawStone(
  ctx: CanvasRenderingContext2D,
  c: Coord,
  color: Color,
  stoneR: number,
  px_: (i: number) => number,
  py_: (j: number) => number,
  isDark: boolean,
  px: number,
  alpha = 1,
) {
  const cx = px_(c.x);
  const cy = py_(c.y);
  ctx.save();
  ctx.globalAlpha = alpha;

  // subtle radial gradient for polish
  const grad = ctx.createRadialGradient(
    cx - stoneR * 0.3,
    cy - stoneR * 0.3,
    stoneR * 0.1,
    cx,
    cy,
    stoneR,
  );
  if (color === "black") {
    grad.addColorStop(0, isDark ? "#333" : "#555");
    grad.addColorStop(1, "#0a0a0a");
  } else {
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, isDark ? "#c8c4ba" : "#d7d4ca");
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
  ctx.fill();

  // thin outline on white stones for contrast against board
  if (color === "white") {
    ctx.strokeStyle = isDark ? "#6b665d" : "#8a8375";
    ctx.lineWidth = Math.max(0.5, px / 1040);
    ctx.stroke();
  }
  ctx.restore();
}

export function computeBoardGeometry(px: number, cellsAcross: number) {
  if (cellsAcross <= 1) {
    const pad = px / 2;
    return { pad, usable: 0, step: 0 };
  }

  const minPad = px * 0.06;
  // Cropped 19x19 windows zoom the stones up. Use enough edge padding that
  // stones and cursor rings on the outermost visible intersections cannot clip.
  const safePad = (0.46 * px + 6 * (cellsAcross - 1)) / (cellsAcross - 1 + 0.92);
  const pad = Math.max(minPad, safePad);
  const usable = px - pad * 2;
  const step = usable / (cellsAcross - 1);

  return { pad, usable, step };
}

function findInitialKeyboardCursor(
  win: BoardWindow,
  size: 9 | 13 | 19,
  stones: Stone[],
  preferred?: Coord | null,
): Coord | null {
  if (preferred && isInBounds(preferred, size)) {
    return preferred;
  }

  const centerX = Math.round((win.xMin + win.xMax) / 2);
  const centerY = Math.round((win.yMin + win.yMax) / 2);
  const candidates: Coord[] = [];

  for (let y = win.yMin; y <= win.yMax; y++) {
    for (let x = win.xMin; x <= win.xMax; x++) {
      candidates.push({ x, y });
    }
  }

  candidates.sort((a, b) => {
    const distanceA = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
    const distanceB = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
    return distanceA - distanceB;
  });

  return candidates.find((candidate) => !isOccupied(stones, candidate)) ?? candidates[0] ?? null;
}

// Canvas-drawn Go board. HiDPI aware. Coordinates are 1-based,
// where (1, 1) is the top-left intersection and (size, size) is bottom-right.
export function GoBoard({
  size,
  stones,
  toPlay,
  userMove,
  highlight,
  extraStones,
  disabled,
  onPlay,
  maxPx = 520,
  boardStyle = "classic",
  moveNumbers,
  highlightColor,
  keyboardEnabled = false,
  focusOnMount = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchTapRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [cssSize, setCssSize] = useState(maxPx);
  const [hover, setHover] = useState<Coord | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<Coord | null>(null);
  const [keyboardCursorVisible, setKeyboardCursorVisible] = useState(false);

  const isDark = boardStyle === "dark";
  const accent = highlightColor ?? "var(--color-accent)";

  // Responsive: shrink to container width (minus small padding) but cap at maxPx.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.min(maxPx, el.clientWidth);
      // Always square and at least 240px for touch.
      setCssSize(Math.max(240, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxPx]);

  // Always render the full board.
  const win: BoardWindow = useMemo(() => fullWindow(size), [size]);

  const inWindow = useCallback(
    (c: Coord) => c.x >= win.xMin && c.x <= win.xMax && c.y >= win.yMin && c.y <= win.yMax,
    [win],
  );

  const activeKeyboardCursor = useMemo(() => {
    if (!keyboardEnabled) return null;

    if (keyboardCursor && isInBounds(keyboardCursor, size) && inWindow(keyboardCursor)) {
      return keyboardCursor;
    }

    return findInitialKeyboardCursor(win, size, stones, userMove);
  }, [keyboardEnabled, keyboardCursor, inWindow, size, stones, userMove, win]);

  useEffect(() => {
    if (!keyboardEnabled || !focusOnMount) return;
    wrapRef.current?.focus();
  }, [keyboardEnabled, focusOnMount]);

  // ---- Offscreen static layer (grid, stars, stones, userMove, moveNumbers, highlight) ----
  const drawStaticLayer = useCallback(() => {
    const px = cssSize;
    const dpr = window.devicePixelRatio || 1;
    let sc = staticCanvasRef.current;
    if (!sc) {
      sc = document.createElement("canvas");
      staticCanvasRef.current = sc;
    }
    sc.width = px * dpr;
    sc.height = px * dpr;
    const sctx = sc.getContext("2d");
    if (!sctx) return;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.scale(dpr, dpr);

    // Board background.
    sctx.fillStyle = isDark ? "#1f1611" : "#e8c594";
    sctx.fillRect(0, 0, px, px);

    // Grid geometry.
    const cellsAcross = win.xMax - win.xMin + 1;
    const { pad, step } = computeBoardGeometry(px, cellsAcross);
    const px_ = (i: number) => pad + (i - win.xMin) * step;
    const py_ = (j: number) => pad + (j - win.yMin) * step;
    const stoneR = step * 0.46;

    // Grid lines.
    sctx.strokeStyle = isDark ? "rgba(0, 242, 255, 0.28)" : "#6b4a1e";
    sctx.lineWidth = Math.max(1, px / 520);
    sctx.beginPath();
    for (let i = win.xMin; i <= win.xMax; i++) {
      sctx.moveTo(px_(i), py_(win.yMin));
      sctx.lineTo(px_(i), py_(win.yMax));
    }
    for (let j = win.yMin; j <= win.yMax; j++) {
      sctx.moveTo(px_(win.xMin), py_(j));
      sctx.lineTo(px_(win.xMax), py_(j));
    }
    sctx.stroke();

    // Star points.
    sctx.fillStyle = isDark ? "rgba(0, 242, 255, 0.5)" : "#3a2a10";
    const starR = Math.max(2.5, step * 0.09);
    for (const s of starPoints(size)) {
      if (!inWindow(s)) continue;
      sctx.beginPath();
      sctx.arc(px_(s.x), py_(s.y), starR, 0, Math.PI * 2);
      sctx.fill();
    }

    // Stones.
    const allStones = [...stones, ...(extraStones || [])];
    for (const s of allStones) {
      if (inWindow(s)) drawStone(sctx, s, s.color, stoneR, px_, py_, isDark, px);
    }
    if (userMove && inWindow(userMove))
      drawStone(sctx, userMove, toPlay, stoneR, px_, py_, isDark, px);

    // Move numbers.
    if (moveNumbers?.size) {
      sctx.textAlign = "center";
      sctx.textBaseline = "middle";
      for (const s of allStones) {
        const k = keyOf(s);
        const num = moveNumbers.get(k);
        if (num === undefined) continue;
        if (!inWindow(s)) continue;
        const cx = px_(s.x);
        const cy = py_(s.y);
        sctx.fillStyle = s.color === "black" ? "#fff" : "#0a0a0a";
        sctx.font = `bold ${Math.max(8, Math.floor(stoneR * 0.6))}px Inter, sans-serif`;
        sctx.fillText(String(num), cx, cy);
      }
    }

    // Mark the last extra stone.
    if (extraStones?.length) {
      const last = extraStones[extraStones.length - 1];
      if (inWindow(last)) {
        sctx.save();
        sctx.strokeStyle = accent === "var(--color-accent)" ? "#00f2ff" : accent;
        sctx.lineWidth = Math.max(2, px / 260);
        sctx.beginPath();
        sctx.arc(px_(last.x), py_(last.y), stoneR * 0.9, 0, Math.PI * 2);
        sctx.stroke();
        sctx.restore();
      }
    }

    // Highlight markers.
    if (highlight?.length) {
      const accentColor = accent === "var(--color-accent)" ? "#00f2ff" : accent;
      for (const h of highlight) {
        if (!inWindow(h)) continue;
        const existing = allStones.find((s) => coordEquals(s, h));
        const color = existing ? existing.color : toPlay;
        drawStone(sctx, h, color, stoneR, px_, py_, isDark, px);
        sctx.save();
        sctx.shadowColor = accentColor;
        sctx.shadowBlur = Math.max(6, px / 120);
        sctx.strokeStyle = accentColor;
        sctx.lineWidth = Math.max(2.5, px / 200);
        sctx.beginPath();
        sctx.arc(px_(h.x), py_(h.y), stoneR * 1.15, 0, Math.PI * 2);
        sctx.stroke();
        sctx.restore();
      }
    }
  }, [
    cssSize,
    size,
    stones,
    toPlay,
    userMove,
    highlight,
    extraStones,
    moveNumbers,
    isDark,
    accent,
    win,
    inWindow,
  ]);

  // ---- Composite render: drawImage(static) + dynamic (hover / keyboard cursor) ----
  // Uses the drawStaticLayer callback reference itself as the "static inputs changed" signal,
  // avoiding both manual signature tracking and setState-in-effect.
  const lastStaticDrawRef = useRef<typeof drawStaticLayer | null>(null);

  const render = useCallback(() => {
    // Rebuild offscreen static layer only when its inputs have changed.
    if (drawStaticLayer !== lastStaticDrawRef.current) {
      drawStaticLayer();
      lastStaticDrawRef.current = drawStaticLayer;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const px = cssSize;
    canvas.width = px * dpr;
    canvas.height = px * dpr;
    canvas.style.width = `${px}px`;
    canvas.style.height = `${px}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1:1 copy of static layer at physical-pixel level (identity transform).
    const sc = staticCanvasRef.current;
    if (sc) ctx.drawImage(sc, 0, 0);

    // Scale for CSS-pixel coordinate dynamic drawing.
    ctx.scale(dpr, dpr);

    // Geometry for dynamic elements.
    const cellsAcross = win.xMax - win.xMin + 1;
    const { pad, step } = computeBoardGeometry(px, cellsAcross);
    const px_ = (i: number) => pad + (i - win.xMin) * step;
    const py_ = (j: number) => pad + (j - win.yMin) * step;
    const stoneR = step * 0.46;

    const allStones = [...stones, ...(extraStones || [])];
    const stoneSet = buildStoneSet(allStones);

    // Ghost stone on hover.
    if (
      !disabled &&
      hover &&
      inWindow(hover) &&
      !isOccupied(stoneSet, hover) &&
      !(userMove && coordEquals(userMove, hover))
    ) {
      drawStone(ctx, hover, toPlay, stoneR, px_, py_, isDark, px, 0.35);
    }

    // Keyboard cursor.
    if (
      keyboardEnabled &&
      keyboardCursorVisible &&
      activeKeyboardCursor &&
      inWindow(activeKeyboardCursor)
    ) {
      const cx = px_(activeKeyboardCursor.x);
      const cy = py_(activeKeyboardCursor.y);
      ctx.save();
      ctx.strokeStyle = accent === "var(--color-accent)" ? "#00f2ff" : accent;
      ctx.lineWidth = Math.max(2, px / 220);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    cssSize,
    stones,
    extraStones,
    toPlay,
    userMove,
    disabled,
    hover,
    activeKeyboardCursor,
    keyboardCursorVisible,
    keyboardEnabled,
    win,
    inWindow,
    isDark,
    accent,
    drawStaticLayer,
  ]);

  useEffect(() => {
    render();
  }, [render]);

  const pickCoord = useCallback(
    (clientX: number, clientY: number): Coord | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = rect.width;
      const cellsAcross = win.xMax - win.xMin + 1;
      const { pad, step } = computeBoardGeometry(px, cellsAcross);
      const x = Math.round((clientX - rect.left - pad) / step) + win.xMin;
      const y = Math.round((clientY - rect.top - pad) / step) + win.yMin;
      const c = { x, y };
      if (!isInBounds(c, size)) return null;
      if (!inWindow(c)) return null;
      return c;
    },
    [size, win, inWindow],
  );

  const handleMove: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (disabled) return;
    const c = pickCoord(e.clientX, e.clientY);
    if (!c) {
      setHover(null);
      return;
    }
    if (!hover || !coordEquals(hover, c)) setHover(c);
  };

  const handleLeave = () => setHover(null);

  const placeAt = (clientX: number, clientY: number) => {
    if (disabled || !onPlay) return;
    const c = pickCoord(clientX, clientY);
    if (!c) return;
    if (isOccupied(stones, c)) return;
    if (userMove && coordEquals(userMove, c)) return;
    onPlay(c);
  };

  // Touch taps within this distance of the start point still count as a tap.
  const TAP_SLOP_PX = 12;

  const handlePointerDown: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    // Touch placement waits for pointer-up: with touch-action pan-y below md,
    // a vertical scroll that starts on the board must never drop a stone.
    if (e.pointerType === "touch") {
      touchTapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    wrapRef.current?.focus();
    placeAt(e.clientX, e.clientY);
  };

  const handlePointerUp: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    const start = touchTapRef.current;
    touchTapRef.current = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    wrapRef.current?.focus();
    placeAt(e.clientX, e.clientY);
  };

  const handlePointerCancel = () => {
    touchTapRef.current = null;
    setHover(null);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!keyboardEnabled || disabled) return;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        setKeyboardCursorVisible(true);
        setKeyboardCursor(() =>
          activeKeyboardCursor
            ? { ...activeKeyboardCursor, y: Math.max(win.yMin, activeKeyboardCursor.y - 1) }
            : activeKeyboardCursor,
        );
        break;
      case "ArrowDown":
        event.preventDefault();
        setKeyboardCursorVisible(true);
        setKeyboardCursor(() =>
          activeKeyboardCursor
            ? { ...activeKeyboardCursor, y: Math.min(win.yMax, activeKeyboardCursor.y + 1) }
            : activeKeyboardCursor,
        );
        break;
      case "ArrowLeft":
        event.preventDefault();
        setKeyboardCursorVisible(true);
        setKeyboardCursor(() =>
          activeKeyboardCursor
            ? { ...activeKeyboardCursor, x: Math.max(win.xMin, activeKeyboardCursor.x - 1) }
            : activeKeyboardCursor,
        );
        break;
      case "ArrowRight":
        event.preventDefault();
        setKeyboardCursorVisible(true);
        setKeyboardCursor(() =>
          activeKeyboardCursor
            ? { ...activeKeyboardCursor, x: Math.min(win.xMax, activeKeyboardCursor.x + 1) }
            : activeKeyboardCursor,
        );
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        if (!activeKeyboardCursor || !onPlay) return;
        if (isOccupied(stones, activeKeyboardCursor)) return;
        if (userMove && coordEquals(userMove, activeKeyboardCursor)) return;
        onPlay(activeKeyboardCursor);
        break;
    }
  };

  return (
    <div
      ref={wrapRef}
      className="flex justify-center rounded-lg focus:outline-none"
      style={{ width: maxPx, maxWidth: "100%" }}
      tabIndex={keyboardEnabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-label={`Go board, ${size} by ${size}`}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="rounded-md shadow-sm touch-pan-y md:touch-none select-none cursor-none"
        aria-hidden={keyboardEnabled || undefined}
        aria-label={`Go board, ${size} by ${size}`}
        role="img"
      />
    </div>
  );
}

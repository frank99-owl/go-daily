"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Color, Coord, Stone } from "@/types";
import { coordEquals, isInBounds, isOccupied, starPoints } from "@/lib/board";

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
  /**
   * When true, only render the bounding box of stones + markers (+ small
   * padding). Useful for 19×19 problems whose content lives in one corner.
   */
  cropToStones?: boolean;
};

/** Auto-crop padding (in board cells) around detected stones. */
const CROP_PAD = 2;

type Window = { xMin: number; xMax: number; yMin: number; yMax: number };

function fullWindow(size: number): Window {
  return { xMin: 0, xMax: size - 1, yMin: 0, yMax: size - 1 };
}

/** Compute the bounding box of all meaningful cells + padding, clamped to board. */
function computeCrop(
  size: number,
  stones: Stone[],
  extraStones: Stone[] | undefined,
  highlight: Coord[] | undefined,
  userMove: Coord | null | undefined,
): Window {
  const coords: Coord[] = [
    ...stones,
    ...(extraStones ?? []),
    ...(highlight ?? []),
  ];
  if (userMove) coords.push(userMove);

  if (coords.length === 0) return fullWindow(size);

  let xMin = size - 1,
    xMax = 0,
    yMin = size - 1,
    yMax = 0;
  for (const c of coords) {
    if (c.x < xMin) xMin = c.x;
    if (c.x > xMax) xMax = c.x;
    if (c.y < yMin) yMin = c.y;
    if (c.y > yMax) yMax = c.y;
  }

  xMin = Math.max(0, xMin - CROP_PAD);
  yMin = Math.max(0, yMin - CROP_PAD);
  xMax = Math.min(size - 1, xMax + CROP_PAD);
  yMax = Math.min(size - 1, yMax + CROP_PAD);

  // Make the window square — a non-square canvas would distort stone shapes.
  const w = xMax - xMin + 1;
  const h = yMax - yMin + 1;
  const dim = Math.max(w, h);

  if (w < dim) {
    // Prefer extending toward the far edge (away from the corner).
    const extra = dim - w;
    if (xMin === 0) {
      xMax = Math.min(size - 1, xMax + extra);
    } else {
      xMin = Math.max(0, xMin - extra);
    }
    // Clamp again if we hit an edge without reaching dim.
    if (xMax - xMin + 1 < dim)
      xMax = Math.min(size - 1, xMin + dim - 1);
  }
  if (h < dim) {
    const extra = dim - h;
    if (yMin === 0) {
      yMax = Math.min(size - 1, yMax + extra);
    } else {
      yMin = Math.max(0, yMin - extra);
    }
    if (yMax - yMin + 1 < dim)
      yMax = Math.min(size - 1, yMin + dim - 1);
  }

  return { xMin, xMax, yMin, yMax };
}

// Canvas-drawn Go board. HiDPI aware. Coordinates are 0-indexed from top-left,
// where (0, 0) is the top-left intersection and (size-1, size-1) is bottom-right.
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
  cropToStones = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cssSize, setCssSize] = useState(maxPx);
  const [hover, setHover] = useState<Coord | null>(null);

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

  // Compute the render window (full board or cropped bbox). We intentionally
  // don't include `hover` here — otherwise the visible area would wobble as
  // the user moves the pointer.
  const win: Window = useMemo(
    () =>
      cropToStones
        ? computeCrop(size, stones, extraStones, highlight, userMove)
        : fullWindow(size),
    [cropToStones, size, stones, extraStones, highlight, userMove],
  );

  const inWindow = useCallback(
    (c: Coord) =>
      c.x >= win.xMin && c.x <= win.xMax && c.y >= win.yMin && c.y <= win.yMax,
    [win],
  );

  // Derive rendering geometry.
  const render = useCallback(() => {
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
    ctx.scale(dpr, dpr);

    // Board background.
    ctx.fillStyle = "#e8c594";
    ctx.fillRect(0, 0, px, px);

    // Grid geometry: padding so edge intersections aren't right on the rim.
    const pad = px * 0.06;
    const usable = px - pad * 2;
    const cellsAcross = win.xMax - win.xMin + 1; // === cellsDown (window is square)
    const step = usable / Math.max(1, cellsAcross - 1);
    const px_ = (i: number) => pad + (i - win.xMin) * step;
    const py_ = (j: number) => pad + (j - win.yMin) * step;

    // Grid lines — only the portion within the visible window.
    ctx.strokeStyle = "#6b4a1e";
    ctx.lineWidth = Math.max(1, px / 520);
    ctx.beginPath();
    for (let i = win.xMin; i <= win.xMax; i++) {
      // vertical line at column i
      ctx.moveTo(px_(i), py_(win.yMin));
      ctx.lineTo(px_(i), py_(win.yMax));
    }
    for (let j = win.yMin; j <= win.yMax; j++) {
      // horizontal line at row j
      ctx.moveTo(px_(win.xMin), py_(j));
      ctx.lineTo(px_(win.xMax), py_(j));
    }
    ctx.stroke();

    // Star points (only those inside the window).
    ctx.fillStyle = "#3a2a10";
    const starR = Math.max(2.5, step * 0.09);
    for (const s of starPoints(size)) {
      if (!inWindow(s)) continue;
      ctx.beginPath();
      ctx.arc(px_(s.x), py_(s.y), starR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stones.
    const stoneR = step * 0.46;
    const drawStone = (c: Coord, color: Color, alpha = 1) => {
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
        grad.addColorStop(0, "#555");
        grad.addColorStop(1, "#0a0a0a");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(1, "#d7d4ca");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
      ctx.fill();

      // thin outline on white stones for contrast against board
      if (color === "white") {
        ctx.strokeStyle = "#8a8375";
        ctx.lineWidth = Math.max(0.5, px / 1040);
        ctx.stroke();
      }
      ctx.restore();
    };

    const allStones = [...stones, ...(extraStones || [])];
    for (const s of allStones) {
      if (inWindow(s)) drawStone(s, s.color);
    }
    if (userMove && inWindow(userMove)) drawStone(userMove, toPlay);

    // Mark the last extra stone (solution sequence tip).
    if (extraStones?.length) {
      const last = extraStones[extraStones.length - 1];
      if (inWindow(last)) {
        ctx.save();
        ctx.strokeStyle = "#0d9488";
        ctx.lineWidth = Math.max(2, px / 260);
        ctx.beginPath();
        ctx.arc(px_(last.x), py_(last.y), stoneR * 0.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Highlight markers (e.g. solution circles).
    if (highlight?.length) {
      ctx.save();
      ctx.strokeStyle = "#0d9488";
      ctx.lineWidth = Math.max(2, px / 260);
      for (const h of highlight) {
        if (!inWindow(h)) continue;
        ctx.beginPath();
        ctx.arc(px_(h.x), py_(h.y), stoneR * 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ghost stone on hover (only when interactive and cell is empty and in-window).
    if (
      !disabled &&
      hover &&
      inWindow(hover) &&
      !isOccupied(allStones, hover) &&
      !(userMove && coordEquals(userMove, hover))
    ) {
      drawStone(hover, toPlay, 0.35);
    }

    // When we're showing only a corner of a full board, soften the interior
    // boundaries (edges of the window that aren't the real board edge) with a
    // gradient to the board color. This communicates "the board continues here"
    // so a 19×19 corner problem isn't mistaken for a 9×9 full board.
    if (cropToStones) {
      const fadeW = Math.min(pad * 1.6, step * 1.8);
      const BOARD_BG_RGB = "232, 197, 148"; // matches #e8c594
      const drawFade = (dir: "right" | "left" | "bottom" | "top") => {
        let grad: CanvasGradient;
        if (dir === "right") grad = ctx.createLinearGradient(px - fadeW, 0, px, 0);
        else if (dir === "left") grad = ctx.createLinearGradient(fadeW, 0, 0, 0);
        else if (dir === "bottom")
          grad = ctx.createLinearGradient(0, px - fadeW, 0, px);
        else grad = ctx.createLinearGradient(0, fadeW, 0, 0);
        grad.addColorStop(0, `rgba(${BOARD_BG_RGB}, 0)`);
        grad.addColorStop(1, `rgba(${BOARD_BG_RGB}, 1)`);
        ctx.fillStyle = grad;
        if (dir === "right") ctx.fillRect(px - fadeW, 0, fadeW, px);
        else if (dir === "left") ctx.fillRect(0, 0, fadeW, px);
        else if (dir === "bottom") ctx.fillRect(0, px - fadeW, px, fadeW);
        else ctx.fillRect(0, 0, px, fadeW);
      };
      if (win.xMax < size - 1) drawFade("right");
      if (win.xMin > 0) drawFade("left");
      if (win.yMax < size - 1) drawFade("bottom");
      if (win.yMin > 0) drawFade("top");
    }
  }, [
    cssSize,
    size,
    stones,
    toPlay,
    userMove,
    highlight,
    extraStones,
    disabled,
    hover,
    win,
    inWindow,
    cropToStones,
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
      const pad = px * 0.06;
      const usable = px - pad * 2;
      const cellsAcross = win.xMax - win.xMin + 1;
      const step = usable / Math.max(1, cellsAcross - 1);
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

  const handleClick: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    if (disabled || !onPlay) return;
    const c = pickCoord(e.clientX, e.clientY);
    if (!c) return;
    if (isOccupied(stones, c)) return;
    if (userMove && coordEquals(userMove, c)) return;
    onPlay(c);
  };

  return (
    <div
      ref={wrapRef}
      className="w-full flex justify-center"
      style={{ maxWidth: maxPx }}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerDown={handleClick}
        className={
          "rounded-md shadow-sm touch-none select-none " +
          (disabled ? "cursor-default" : "cursor-pointer")
        }
        aria-label="Go board"
        role="img"
      />
    </div>
  );
}

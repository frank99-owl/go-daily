"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Color, Coord, Stone } from "@/types";
import { coordEquals, isInBounds, isOccupied, starPoints } from "@/lib/board";

type Props = {
  size: 9 | 13 | 19;
  stones: Stone[];
  toPlay: Color;
  userMove?: Coord | null;
  highlight?: Coord[]; // e.g. correct answer markers
  disabled?: boolean;
  onPlay?: (c: Coord) => void;
  /** Max rendered width in CSS pixels. Defaults to 520. */
  maxPx?: number;
};

// Canvas-drawn Go board. HiDPI aware. Coordinates are 0-indexed from top-left,
// where (0, 0) is the top-left intersection and (size-1, size-1) is bottom-right.
export function GoBoard({
  size,
  stones,
  toPlay,
  userMove,
  highlight,
  disabled,
  onPlay,
  maxPx = 520,
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
    const step = usable / (size - 1);
    const p = (i: number) => pad + i * step;

    // Grid lines.
    ctx.strokeStyle = "#6b4a1e";
    ctx.lineWidth = Math.max(1, px / 520);
    ctx.beginPath();
    for (let i = 0; i < size; i++) {
      // horizontal
      ctx.moveTo(p(0), p(i));
      ctx.lineTo(p(size - 1), p(i));
      // vertical
      ctx.moveTo(p(i), p(0));
      ctx.lineTo(p(i), p(size - 1));
    }
    ctx.stroke();

    // Star points.
    ctx.fillStyle = "#3a2a10";
    const starR = Math.max(2.5, step * 0.09);
    for (const s of starPoints(size)) {
      ctx.beginPath();
      ctx.arc(p(s.x), p(s.y), starR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stones.
    const stoneR = step * 0.46;
    const drawStone = (c: Coord, color: Color, alpha = 1) => {
      const cx = p(c.x);
      const cy = p(c.y);
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

    for (const s of stones) drawStone(s, s.color);
    if (userMove) drawStone(userMove, toPlay);

    // Highlight markers (e.g. solution circles).
    if (highlight?.length) {
      ctx.save();
      ctx.strokeStyle = "#0d9488";
      ctx.lineWidth = Math.max(2, px / 260);
      for (const h of highlight) {
        ctx.beginPath();
        ctx.arc(p(h.x), p(h.y), stoneR * 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ghost stone on hover (only when interactive and cell is empty).
    if (
      !disabled &&
      hover &&
      !isOccupied(stones, hover) &&
      !(userMove && coordEquals(userMove, hover))
    ) {
      drawStone(hover, toPlay, 0.35);
    }
  }, [cssSize, size, stones, toPlay, userMove, highlight, disabled, hover]);

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
      const step = usable / (size - 1);
      const x = Math.round((clientX - rect.left - pad) / step);
      const y = Math.round((clientY - rect.top - pad) / step);
      const c = { x, y };
      if (!isInBounds(c, size)) return null;
      return c;
    },
    [size],
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

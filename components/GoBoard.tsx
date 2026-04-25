"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  computeCropWindow,
  coordEquals,
  fullWindow,
  isInBounds,
  isOccupied,
  starPoints,
  type BoardWindow,
} from "@/lib/board";
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
  /**
   * When true, only render the bounding box of stones + markers (+ small
   * padding). Useful for 19×19 problems whose content lives in one corner.
   */
  cropToStones?: boolean;
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
  boardStyle = "classic",
  moveNumbers,
  highlightColor,
  keyboardEnabled = false,
  focusOnMount = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
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

  // Compute the render window (full board or cropped bbox). We intentionally
  // don't include `hover` here — otherwise the visible area would wobble as
  // the user moves the pointer.
  const win: BoardWindow = useMemo(
    () =>
      cropToStones
        ? computeCropWindow(size, stones, extraStones, highlight, userMove)
        : fullWindow(size),
    [cropToStones, size, stones, extraStones, highlight, userMove],
  );

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
    ctx.fillStyle = isDark ? "#1f1611" : "#e8c594";
    ctx.fillRect(0, 0, px, px);

    // Grid geometry: padding so edge intersections aren't right on the rim.
    const cellsAcross = win.xMax - win.xMin + 1; // === cellsDown (window is square)
    const { pad, step } = computeBoardGeometry(px, cellsAcross);
    const px_ = (i: number) => pad + (i - win.xMin) * step;
    const py_ = (j: number) => pad + (j - win.yMin) * step;

    // Grid lines — only the portion within the visible window.
    ctx.strokeStyle = isDark ? "rgba(0, 242, 255, 0.28)" : "#6b4a1e";
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
    ctx.fillStyle = isDark ? "rgba(0, 242, 255, 0.5)" : "#3a2a10";
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
    };

    const allStones = [...stones, ...(extraStones || [])];
    for (const s of allStones) {
      if (inWindow(s)) drawStone(s, s.color);
    }
    if (userMove && inWindow(userMove)) drawStone(userMove, toPlay);

    // Move numbers (drawn on top of stones).
    if (moveNumbers?.size) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const s of allStones) {
        const k = keyOf(s);
        const num = moveNumbers.get(k);
        if (num === undefined) continue;
        if (!inWindow(s)) continue;
        const cx = px_(s.x);
        const cy = py_(s.y);
        ctx.fillStyle = s.color === "black" ? "#fff" : "#0a0a0a";
        ctx.font = `bold ${Math.max(8, Math.floor(stoneR * 0.6))}px Inter, sans-serif`;
        ctx.fillText(String(num), cx, cy);
      }
    }

    // Mark the last extra stone (solution sequence tip).
    if (extraStones?.length) {
      const last = extraStones[extraStones.length - 1];
      if (inWindow(last)) {
        ctx.save();
        ctx.strokeStyle = accent === "var(--color-accent)" ? "#00f2ff" : accent;
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
      ctx.strokeStyle = accent === "var(--color-accent)" ? "#00f2ff" : accent;
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

    if (
      keyboardEnabled &&
      keyboardCursorVisible &&
      activeKeyboardCursor &&
      inWindow(activeKeyboardCursor)
    ) {
      const cx = px_(activeKeyboardCursor.x);
      const cy = py_(activeKeyboardCursor.y);
      ctx.save();
      ctx.strokeStyle = "#00f2ff";
      ctx.lineWidth = Math.max(2, px / 220);
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // When we're showing only a corner of a full board, soften the interior
    // boundaries (edges of the window that aren't the real board edge) with a
    // gradient to the board color. This communicates "the board continues here"
    // so a 19×19 corner problem isn't mistaken for a 9×9 full board.
    if (cropToStones) {
      const fadeW = Math.min(pad * 1.6, step * 1.8);
      const BOARD_BG_RGB = isDark ? "31, 22, 17" : "232, 197, 148";
      const drawFade = (dir: "right" | "left" | "bottom" | "top") => {
        let grad: CanvasGradient;
        if (dir === "right") grad = ctx.createLinearGradient(px - fadeW, 0, px, 0);
        else if (dir === "left") grad = ctx.createLinearGradient(fadeW, 0, 0, 0);
        else if (dir === "bottom") grad = ctx.createLinearGradient(0, px - fadeW, 0, px);
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
    activeKeyboardCursor,
    keyboardCursorVisible,
    keyboardEnabled,
    win,
    inWindow,
    cropToStones,
    isDark,
    accent,
    moveNumbers,
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

  const handleClick: React.PointerEventHandler<HTMLCanvasElement> = (e) => {
    wrapRef.current?.focus();
    if (disabled || !onPlay) return;
    const c = pickCoord(e.clientX, e.clientY);
    if (!c) return;
    if (isOccupied(stones, c)) return;
    if (userMove && coordEquals(userMove, c)) return;
    onPlay(c);
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
      style={{ width: maxPx, maxWidth: maxPx }}
      tabIndex={keyboardEnabled ? 0 : -1}
      onKeyDown={handleKeyDown}
      aria-label={`Go board, ${size} by ${size}`}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerDown={handleClick}
        className={
          "rounded-md shadow-sm touch-none select-none " +
          (disabled ? "cursor-none" : "cursor-none")
        }
        aria-hidden={keyboardEnabled || undefined}
        aria-label={`Go board, ${size} by ${size}`}
        role="img"
      />
    </div>
  );
}

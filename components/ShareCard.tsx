"use client";

import { useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { starPoints } from "@/lib/board";
import type { Locale, Puzzle, Stone } from "@/types";

type Props = {
  puzzle: Puzzle;
  correct: boolean;
  elapsedSeconds?: number;
};

const CROP_PAD = 2;

type Window = { xMin: number; xMax: number; yMin: number; yMax: number };

function fullWindow(size: number): Window {
  return { xMin: 0, xMax: size - 1, yMin: 0, yMax: size - 1 };
}

/** Compute bounding box of stones + padding, forced square (matches GoBoard). */
function computeCrop(size: number, stones: Stone[]): Window {
  if (stones.length === 0) return fullWindow(size);

  let xMin = size - 1,
    xMax = 0,
    yMin = size - 1,
    yMax = 0;
  for (const s of stones) {
    if (s.x < xMin) xMin = s.x;
    if (s.x > xMax) xMax = s.x;
    if (s.y < yMin) yMin = s.y;
    if (s.y > yMax) yMax = s.y;
  }

  xMin = Math.max(0, xMin - CROP_PAD);
  yMin = Math.max(0, yMin - CROP_PAD);
  xMax = Math.min(size - 1, xMax + CROP_PAD);
  yMax = Math.min(size - 1, yMax + CROP_PAD);

  const w = xMax - xMin + 1;
  const h = yMax - yMin + 1;
  const dim = Math.max(w, h);

  if (w < dim) {
    const extra = dim - w;
    if (xMin === 0) xMax = Math.min(size - 1, xMax + extra);
    else xMin = Math.max(0, xMin - extra);
    if (xMax - xMin + 1 < dim) xMax = Math.min(size - 1, xMin + dim - 1);
  }
  if (h < dim) {
    const extra = dim - h;
    if (yMin === 0) yMax = Math.min(size - 1, yMax + extra);
    else yMin = Math.max(0, yMin - extra);
    if (yMax - yMin + 1 < dim) yMax = Math.min(size - 1, yMin + dim - 1);
  }

  return { xMin, xMax, yMin, yMax };
}

/** Verdict font matches the Hero title font per locale. */
function getVerdictFont(locale: Locale): string {
  switch (locale) {
    case "zh":
      return '"Ma Shan Zheng", cursive';
    case "ja":
      return '"Klee One", cursive';
    case "ko":
      return '"Gowun Batang", serif';
    case "en":
      return '"Playfair Display", serif';
  }
}

/** Brand font — always English Playfair Display, regardless of locale. */
const BRAND_FONT = '"Playfair Display", Georgia, serif';

// Paints a 1080x1080 card where the frame IS the Go board.
export function ShareCard({ puzzle, correct, elapsedSeconds }: Props) {
  const { t, locale } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sharing, setSharing] = useState(false);

  function drawCard(): HTMLCanvasElement {
    const size = 1080;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    // ── Pure black background ──
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);

    // ── Render window (crop 19x19 just like the web board) ──
    const shouldCrop = puzzle.boardSize === 19;
    const win = shouldCrop
      ? computeCrop(puzzle.boardSize, puzzle.stones)
      : fullWindow(puzzle.boardSize);

    const cellsAcross = win.xMax - win.xMin + 1;

    // ── Board geometry ──
    // Full boards take up most of the frame; cropped boards mirror the web maxPx.
    const boardPx = shouldCrop ? 650 : 900;
    const boardX = (size - boardPx) / 2;
    const boardY = 140;

    const pad = boardPx * 0.06;
    const usable = boardPx - pad * 2;
    const step = usable / Math.max(1, cellsAcross - 1);
    const px_ = (i: number) => pad + (i - win.xMin) * step;
    const py_ = (j: number) => pad + (j - win.yMin) * step;

    // Board background
    ctx.fillStyle = "#1f1611";
    ctx.fillRect(boardX, boardY, boardPx, boardPx);

    // Grid lines
    ctx.strokeStyle = "rgba(0, 242, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = win.xMin; i <= win.xMax; i++) {
      ctx.moveTo(boardX + px_(i), boardY + py_(win.yMin));
      ctx.lineTo(boardX + px_(i), boardY + py_(win.yMax));
    }
    for (let j = win.yMin; j <= win.yMax; j++) {
      ctx.moveTo(boardX + px_(win.xMin), boardY + py_(j));
      ctx.lineTo(boardX + px_(win.xMax), boardY + py_(j));
    }
    ctx.stroke();

    // Star points (only those inside the window)
    ctx.fillStyle = "rgba(0, 242, 255, 0.6)";
    const starR = Math.max(3, step * 0.08);
    for (const s of starPoints(puzzle.boardSize as 9 | 13 | 19)) {
      if (s.x < win.xMin || s.x > win.xMax || s.y < win.yMin || s.y > win.yMax) continue;
      ctx.beginPath();
      ctx.arc(boardX + px_(s.x), boardY + py_(s.y), starR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Stones with 3D sphere look ──
    const stoneR = step * 0.46;
    const drawStone = (cx: number, cy: number, color: "black" | "white") => {
      const r = stoneR;

      // Main spherical gradient
      const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.05, cx, cy, r);
      if (color === "black") {
        grad.addColorStop(0, "#bbb");
        grad.addColorStop(0.08, "#555");
        grad.addColorStop(0.3, "#1a1a1a");
        grad.addColorStop(1, "#050505");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.15, "#eeeeee");
        grad.addColorStop(0.5, "#cccccc");
        grad.addColorStop(1, "#888888");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Specular highlight dot
      const hlR = r * 0.22;
      const hlX = cx - r * 0.32;
      const hlY = cy - r * 0.32;
      const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
      if (color === "black") {
        hlGrad.addColorStop(0, "rgba(255,255,255,0.5)");
        hlGrad.addColorStop(1, "rgba(255,255,255,0)");
      } else {
        hlGrad.addColorStop(0, "rgba(255,255,255,0.7)");
        hlGrad.addColorStop(1, "rgba(255,255,255,0)");
      }
      ctx.fillStyle = hlGrad;
      ctx.beginPath();
      ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const s of puzzle.stones) {
      if (s.x < win.xMin || s.x > win.xMax || s.y < win.yMin || s.y > win.yMax) continue;
      drawStone(boardX + px_(s.x), boardY + py_(s.y), s.color);
    }

    // ── Top-left brand (always Playfair Display) ──
    ctx.fillStyle = "#ffffff";
    ctx.font = `400 28px ${BRAND_FONT}`;
    ctx.fillText("GO-DAILY", 50, 70);

    // ── Top-right verdict (matches Hero title font per locale, white) ──
    const verdict = correct ? t.result.correct : t.result.wrong;
    const verdictFont = getVerdictFont(locale);

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 48px ${verdictFont}`;
    const vw = ctx.measureText(verdict).width;
    const rightX = size - vw - 50;
    ctx.fillText(verdict, rightX, 70);

    // ── Time below verdict, right-aligned ──
    if (typeof elapsedSeconds === "number") {
      const timeText = `${elapsedSeconds}s`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `400 22px ${BRAND_FONT}`;
      const tw = ctx.measureText(timeText).width;
      ctx.fillText(timeText, size - tw - 50, 105);
    }

    // ── Bottom-left date ──
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "400 20px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(puzzle.date, 50, size - 40);

    return canvas;
  }

  const handleDownload = () => {
    const canvas = drawCard();
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `go-daily-${puzzle.date}.png`;
    a.click();
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const canvas = drawCard();
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const file = new File([blob], `go-daily-${puzzle.date}.png`, {
        type: "image/png",
      });
      const shareData: ShareData = {
        files: [file],
        title: "go-daily",
        text: `${puzzle.date} · ${correct ? t.result.correct : t.result.wrong}`,
      };
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.canShare && nav.canShare(shareData)) {
        await nav.share(shareData);
      } else {
        handleDownload();
      }
    } catch {
      // User cancelled or share failed — fall back silently.
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[color:var(--color-line)] text-sm text-ink-2 hover:text-ink hover:border-[color:var(--color-accent)] transition-colors"
      >
        <Download className="h-4 w-4" />
        {t.share.download}
      </button>
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ink text-paper text-sm font-medium hover:bg-[color:var(--color-accent)] transition-colors disabled:opacity-40"
      >
        <Share2 className="h-4 w-4" />
        {t.share.share}
      </button>
    </div>
  );
}

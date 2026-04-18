"use client";

import { useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { starPoints } from "@/lib/board";
import type { Puzzle, Stone } from "@/types";

type Props = {
  puzzle: Puzzle;
  correct: boolean;
  elapsedSeconds?: number;
};

// Paints a 1080x1080 social card to an off-screen canvas and exposes
// download + Web Share.
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

    // Background.
    ctx.fillStyle = "#faf9f4";
    ctx.fillRect(0, 0, size, size);

    // Brand strip.
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "600 36px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("go-daily", 72, 110);

    ctx.fillStyle = "#4a4a4a";
    ctx.font = "400 28px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(puzzle.date, 72, 156);

    // Board.
    const boardPx = 760;
    const boardX = (size - boardPx) / 2;
    const boardY = 220;

    ctx.fillStyle = "#e8c594";
    ctx.fillRect(boardX, boardY, boardPx, boardPx);

    const pad = boardPx * 0.06;
    const usable = boardPx - pad * 2;
    const step = usable / (puzzle.boardSize - 1);
    const p = (i: number) => pad + i * step;

    ctx.strokeStyle = "#6b4a1e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < puzzle.boardSize; i++) {
      ctx.moveTo(boardX + p(0), boardY + p(i));
      ctx.lineTo(boardX + p(puzzle.boardSize - 1), boardY + p(i));
      ctx.moveTo(boardX + p(i), boardY + p(0));
      ctx.lineTo(boardX + p(i), boardY + p(puzzle.boardSize - 1));
    }
    ctx.stroke();

    ctx.fillStyle = "#3a2a10";
    const starR = Math.max(4, step * 0.09);
    for (const s of starPoints(puzzle.boardSize)) {
      ctx.beginPath();
      ctx.arc(boardX + p(s.x), boardY + p(s.y), starR, 0, Math.PI * 2);
      ctx.fill();
    }

    const stoneR = step * 0.46;
    const drawStone = (
      cx: number,
      cy: number,
      color: "black" | "white",
    ) => {
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
      if (color === "white") {
        ctx.strokeStyle = "#8a8375";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    };

    const stonesAll: Stone[] = [...puzzle.stones];
    for (const s of stonesAll)
      drawStone(boardX + p(s.x), boardY + p(s.y), s.color);

    // Verdict row.
    const verdictY = boardY + boardPx + 70;
    ctx.fillStyle = correct ? "#16a34a" : "#ef4444";
    ctx.font = "700 56px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(correct ? t.result.correct : t.result.wrong, 72, verdictY);

    // Prompt line.
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "400 30px ui-sans-serif, system-ui, sans-serif";
    const prompt = puzzle.prompt[locale];
    ctx.fillText(prompt, 72, verdictY + 56);

    // Optional time.
    if (typeof elapsedSeconds === "number") {
      ctx.fillStyle = "#4a4a4a";
      ctx.font = "400 24px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(`${elapsedSeconds}s`, 72, verdictY + 94);
    }

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
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
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

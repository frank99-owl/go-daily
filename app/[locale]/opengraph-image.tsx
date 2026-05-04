import { ImageResponse } from "next/og";

import { SUPPORTED_LOCALES } from "@/lib/i18n/localePath";
import { DICTS } from "@/lib/i18n/metadata";
import type { Locale } from "@/types";

export const alt = "go-daily — Daily Go Puzzle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE: Record<Locale, string> = {
  en: "Daily Go puzzle.",
  ja: "毎日の囲碁詰碁。",
  ko: "매일 바둑 한 문제.",
  zh: "每日围棋一题。",
};

const TAGS: Record<Locale, [string, string, string]> = {
  en: ["19 × 19", "4 languages", "Pro SRS"],
  ja: ["19 × 19", "4 言語", "Pro SRS"],
  ko: ["19 × 19", "4개 언어", "Pro SRS"],
  zh: ["19 × 19", "4 种语言", "Pro SRS"],
};

const stones = [
  { x: 2, y: 2, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 3, y: 2, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
  { x: 4, y: 3, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 5, y: 4, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
  { x: 3, y: 5, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 6, y: 6, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
] as const;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as Locale) : "en";
  const t = DICTS[locale];
  const title = TITLE[locale];
  const subtitle = t.manifest?.description ?? TITLE.en;
  const tags = TAGS[locale];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        background:
          "radial-gradient(circle at 76% 24%, rgba(0,242,255,0.22), transparent 30%), linear-gradient(135deg, #050505 0%, #11100e 48%, #241915 100%)",
        color: "#f7f1e8",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 640,
          padding: "70px 0 64px 76px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: "#00f2ff",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "#00f2ff",
              }}
            />
            go-daily
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 0.98,
              letterSpacing: 0,
            }}
          >
            {title.split(" ").map((word, i) => (
              <span key={i}>{word}</span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              color: "rgba(247,241,232,0.72)",
              fontSize: 34,
              lineHeight: 1.25,
              maxWidth: 540,
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {tags.map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                border: "1px solid rgba(247,241,232,0.18)",
                borderRadius: 999,
                padding: "10px 16px",
                color: "rgba(247,241,232,0.72)",
                fontSize: 22,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 520,
          paddingRight: 72,
        }}
      >
        <div
          style={{
            width: 430,
            height: 430,
            display: "flex",
            position: "relative",
            border: "1px solid rgba(0,242,255,0.42)",
            background: "#1f1611",
            boxShadow: "0 36px 80px rgba(0,0,0,0.44)",
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={`v-${i}`}
              style={{
                position: "absolute",
                top: 40,
                bottom: 40,
                left: 40 + i * 43.75,
                width: 1,
                background: "rgba(0,242,255,0.38)",
              }}
            />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={`h-${i}`}
              style={{
                position: "absolute",
                left: 40,
                right: 40,
                top: 40 + i * 43.75,
                height: 1,
                background: "rgba(0,242,255,0.38)",
              }}
            />
          ))}
          {[2, 4, 6].flatMap((x) =>
            [2, 4, 6].map((y) => (
              <div
                key={`star-${x}-${y}`}
                style={{
                  position: "absolute",
                  left: 40 + x * 43.75 - 4,
                  top: 40 + y * 43.75 - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "rgba(0,242,255,0.64)",
                }}
              />
            )),
          )}
          {stones.map((stone) => (
            <div
              key={`${stone.x}-${stone.y}`}
              style={{
                position: "absolute",
                left: 40 + stone.x * 43.75 - 18,
                top: 40 + stone.y * 43.75 - 18,
                width: 36,
                height: 36,
                borderRadius: 999,
                background: stone.color,
                border: `1px solid ${stone.border}`,
                boxShadow: "0 12px 18px rgba(0,0,0,0.28)",
              }}
            />
          ))}
        </div>
      </div>
    </div>,
    { ...size },
  );
}

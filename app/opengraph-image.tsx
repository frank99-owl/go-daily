import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "go-daily - Daily Go puzzle with AI Coach";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const stones = [
  { x: 2, y: 2, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 3, y: 2, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
  { x: 4, y: 3, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 5, y: 4, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
  { x: 3, y: 5, color: "#050505", border: "rgba(255,255,255,0.24)" },
  { x: 6, y: 6, color: "#f6f4ee", border: "rgba(0,0,0,0.22)" },
] as const;

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        background: "#050505",
        color: "#f7f1e8",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: "flex",
          background:
            "radial-gradient(circle at 76% 24%, rgba(0,242,255,0.22), transparent 30%), linear-gradient(135deg, #050505 0%, #11100e 48%, #241915 100%)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
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
            <span>Daily Go</span>
            <span>puzzle.</span>
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
            One tsumego a day with a Socratic AI coach.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14 }}>
          {["19 x 19", "4 languages", "Pro SRS"].map((label) => (
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
          zIndex: 1,
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
    {
      ...size,
    },
  );
}

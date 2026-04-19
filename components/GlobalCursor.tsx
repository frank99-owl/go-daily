"use client";

import { useEffect, useRef } from "react";

export function GlobalCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    const onMove = (e: MouseEvent) => {
      requestAnimationFrame(() => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      });
    };

    const onDown = () => {
      cursor.style.transform = "translate(-50%, -50%) scale(0.7)";
    };

    const onUp = () => {
      const isHovering =
        document.querySelectorAll("a:hover, button:hover, [data-hover-target]:hover").length > 0;
      cursor.style.transform = `translate(-50%, -50%) scale(${isHovering ? 2.5 : 1})`;
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("a") ||
        target.closest("button") ||
        target.closest("[data-hover-target]")
      ) {
        cursor.style.transform = "translate(-50%, -50%) scale(2.5)";
        cursor.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
        cursor.style.borderColor = "rgba(0, 242, 255, 0.6)";
      }
    };

    const onOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest("a") ||
        target.closest("button") ||
        target.closest("[data-hover-target]")
      ) {
        cursor.style.transform = "translate(-50%, -50%) scale(1)";
        cursor.style.backgroundColor = "white";
        cursor.style.borderColor = "rgba(0, 242, 255, 0.35)";
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      style={{
        width: 8,
        height: 8,
        background: "white",
        borderRadius: "50%",
        position: "fixed",
        pointerEvents: "none",
        zIndex: 100,
        transform: "translate(-50%, -50%)",
        boxShadow: "0 0 6px 2px rgba(0, 242, 255, 0.35)",
        border: "1px solid rgba(0, 242, 255, 0.35)",
        transition: "transform 0.1s ease, background-color 0.3s ease, border-color 0.3s ease",
      }}
    />
  );
}

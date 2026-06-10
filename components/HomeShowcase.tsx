"use client";

import dynamic from "next/dynamic";

import { useMediaQuery } from "@/lib/useMediaQuery";

const BoardShowcase = dynamic(() => import("./BoardShowcase").then((m) => m.BoardShowcase));

// Phones get no showcase at all: its fixed 560px board column forces the
// mobile layout viewport past the md breakpoint and breaks the whole page
// (desktop nav leaks in, fixed modals center off-screen). 768px keeps it
// on iPad and up. Gating outside BoardShowcase also keeps phones from
// downloading the chunk.
const SHOWCASE_QUERY = "(min-width: 768px)";

export function HomeShowcase() {
  const showShowcase = useMediaQuery(SHOWCASE_QUERY);
  if (!showShowcase) return null;
  return <BoardShowcase />;
}

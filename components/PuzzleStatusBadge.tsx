import { Check } from "lucide-react";
import type { PuzzleStatus } from "@/types";

/**
 * Tri-state completion dot reused across the library page, the review list,
 * and anywhere else we surface "you're N out of M through this."
 *
 *   solved      — filled accent with a tiny check inside
 *   attempted   — ring of accent, hollow (you've tried but not solved)
 *   unattempted — faint neutral dot (no record yet)
 */
export function PuzzleStatusBadge({
  status,
  size = "md",
  title,
}: {
  status: PuzzleStatus;
  size?: "sm" | "md";
  title?: string;
}) {
  const dim =
    size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const iconDim = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  if (status === "solved") {
    return (
      <span
        title={title}
        aria-label={title ?? "solved"}
        className={`inline-flex items-center justify-center rounded-full bg-[color:var(--color-accent)] text-white ${dim}`}
      >
        <Check className={iconDim} strokeWidth={3} />
      </span>
    );
  }
  if (status === "attempted") {
    return (
      <span
        title={title}
        aria-label={title ?? "attempted"}
        className={`inline-block rounded-full border-2 border-[color:var(--color-accent)] ${dim}`}
      />
    );
  }
  return (
    <span
      title={title}
      aria-label={title ?? "unattempted"}
      className={`inline-block rounded-full bg-[color:var(--color-line)] ${dim}`}
    />
  );
}

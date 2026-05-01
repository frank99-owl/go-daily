"use client";

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12 animate-pulse">
      <div className="h-8 w-48 rounded bg-white/10 mb-6" />
      <div className="h-4 w-72 rounded bg-white/5 mb-8" />
      <div className="mx-auto aspect-square max-w-sm rounded-xl bg-white/5" />
    </div>
  );
}

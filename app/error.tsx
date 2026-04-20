"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h2 className="text-3xl font-headline mb-4 font-bold text-ink">Something went wrong</h2>
      <p className="text-lg text-ink/70 mb-8 max-w-md italic">
        A mistake in reading the board. We&apos;re looking into it.
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
      >
        Try Again
      </button>
    </div>
  );
}

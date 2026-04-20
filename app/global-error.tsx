"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen flex flex-col items-center justify-center bg-paper text-ink p-4 text-center">
        <h2 className="text-3xl font-headline mb-4 font-bold">Critical Error</h2>
        <p className="text-lg text-ink/70 mb-8 max-w-md italic">
          The entire goban has collapsed. Please try reloading the session.
        </p>
        <button
          onClick={() => reset()}
          className="px-6 py-2 border border-ink/20 hover:border-ink hover:bg-ink hover:text-paper transition-colors duration-200 font-medium"
        >
          Try Again
        </button>
      </body>
    </html>
  );
}

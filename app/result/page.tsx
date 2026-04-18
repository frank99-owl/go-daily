import { Suspense } from "react";
import { ResultClient } from "./ResultClient";

export default function ResultPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
      <Suspense fallback={null}>
        <ResultClient />
      </Suspense>
    </div>
  );
}

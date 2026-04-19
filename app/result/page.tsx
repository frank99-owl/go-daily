import { Suspense } from "react";
import { ResultClient } from "./ResultClient";

export default function ResultPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-20 pb-8 sm:pt-24 sm:pb-12">
      <Suspense fallback={null}>
        <ResultClient />
      </Suspense>
    </div>
  );
}

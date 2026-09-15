"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AppError({
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
    <div className="mx-auto max-w-lg rounded-2xl border border-rule bg-cream p-8">
      <h2 className="font-serif text-2xl">Something went wrong</h2>
      <p className="mt-2 text-sm text-ink-soft">
        {error.message || "The page hit a client error. Try again, or go back to the board."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/home")}>
          Back to home
        </Button>
      </div>
    </div>
  );
}

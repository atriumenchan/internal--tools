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
    <div className="mx-auto max-w-lg rounded-md border border-border bg-surface p-8 shadow-card">
      <h2 className="font-display text-2xl font-medium tracking-tight">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted">
        {error.message || "The page hit a client error. Try again, or go back to the board."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

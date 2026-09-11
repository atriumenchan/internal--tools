"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "Georgia, serif", background: "#f6f1e8", color: "#1f1b16", padding: 48 }}>
        <h2>Something went wrong</h2>
        <p>{error.message || "A client error stopped this page."}</p>
        <button type="button" onClick={reset} style={{ marginTop: 16, padding: "8px 16px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}

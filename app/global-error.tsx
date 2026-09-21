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
      <body style={{ fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif", background: "#EEF3F0", color: "#1E2823", padding: 48 }}>
        <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em" }}>Something went wrong</h2>
        <p style={{ marginTop: 8, color: "#5E6E65" }}>{error.message || "A client error stopped this page."}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 9,
            border: 0,
            background: "linear-gradient(135deg, #E8A34C, #B4690C)",
            color: "white",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

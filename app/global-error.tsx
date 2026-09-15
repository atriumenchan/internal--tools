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
      <body style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", background: "#0B0F14", color: "#F5F7FA", padding: 48 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>Something went wrong</h2>
        <p style={{ marginTop: 8, color: "#AAB4C2" }}>{error.message || "A client error stopped this page."}</p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "10px 16px",
            borderRadius: 10,
            border: 0,
            background: "#FF5A1F",
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

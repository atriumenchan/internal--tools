/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        page: "var(--page)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        amber: "var(--amber)",
        "amber-soft": "var(--amber-soft)",
        "amber-dim": "var(--amber-dim)",
        "amber-line": "var(--amber-line)",
        teal: "var(--teal)",
        "teal-soft": "var(--teal-soft)",
        "teal-dim": "var(--teal-dim)",
        violet: "var(--violet)",
        "violet-dim": "var(--violet-dim)",
        coral: "var(--coral)",
        "coral-dim": "var(--coral-dim)",
      },
      fontFamily: {
        sans: ["var(--font-sans-face)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display-face)", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-mono-face)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        card: "0 1px 2px rgba(20, 40, 32, 0.04)",
        cta: "0 10px 22px -10px var(--amber-line)",
        float: "0 20px 45px -20px rgba(20, 40, 32, 0.18)",
      },
    },
  },
};

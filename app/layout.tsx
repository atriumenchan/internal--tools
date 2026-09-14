import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
});

export const metadata: Metadata = {
  title: "ADMEXO — Internal",
  description: "Spaces, chat, attendance, and offer letters for the ADMEXO team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${sans.className} antialiased`}>{children}</body>
    </html>
  );
}

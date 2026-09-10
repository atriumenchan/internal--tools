import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif-face",
});

export const metadata: Metadata = {
  title: "Atrium — Internal tools",
  description: "Offer letters and attendance for the Atrium team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${sans.className} antialiased`}>{children}</body>
    </html>
  );
}

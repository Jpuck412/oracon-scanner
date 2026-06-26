import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oracon Scanner",
  description: "Dual-engine real-time stock scanner — Rubicon breakout detection + Oracle VWAP/ORB momentum tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}

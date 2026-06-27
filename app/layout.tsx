import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Oracle Rubicon Scanner",
  description: "$0.20-$10 real-time momentum scanner using Oracle and Rubicon formulas"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

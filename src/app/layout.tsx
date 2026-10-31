import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cruze FuelSense · Journey intelligence",
  description:
    "Drive Smarter. Further. A simulated vehicle intelligence dashboard.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

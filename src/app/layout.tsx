import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cruze FuelSense · Journey intelligence",
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/app-icon-dark.svg", type: "image/svg+xml" },
      { url: "/brand/app-icon-dark-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/app-icon-dark-180.png",
  },
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

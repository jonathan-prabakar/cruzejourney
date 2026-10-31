import type { Metadata } from "next";
import "./globals.css";
import "./journey/journey.css";
import { ConnectedVehicleProvider } from "@/components/connected-vehicle-provider";
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
      <body><ConnectedVehicleProvider>{children}</ConnectedVehicleProvider></body>
    </html>
  );
}

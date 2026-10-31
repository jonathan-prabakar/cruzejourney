import type { Metadata } from "next";
import "./globals.css";
import { ConnectedVehicleProvider } from "@/components/connected-vehicle-provider";
export const metadata: Metadata = {
  title: "Cruze - Journey · Intelligent driving",
  icons: {
    icon: [
      { url: "/brand/favicon.ico?v=journey-20261031", sizes: "any" },
      { url: "/brand/app-icon-dark.svg?v=journey-20261031", type: "image/svg+xml" },
      { url: "/brand/app-icon-dark-192.png?v=journey-20261031", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/app-icon-dark-180.png?v=journey-20261031",
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

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavetProvider } from "@/components/navet-provider";
import { AppShell } from "@/components/app-shell";
import { ServiceWorker } from "@/components/service-worker";

export const metadata: Metadata = {
  title: { default: "Navet", template: "%s · Navet" },
  description: "Din personliga arbetsyta – uppgifter, åtaganden, idéer och kalender på ett ställe.",
  applicationName: "Navet",
  appleWebApp: { capable: true, title: "Navet", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className="h-full antialiased">
      <body className="min-h-full">
        <NavetProvider>
          <AppShell>{children}</AppShell>
        </NavetProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

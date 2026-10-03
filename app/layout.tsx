import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallHint } from "@/components/pwa/InstallHint";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GLS Plus",
  description: "Gold business dashboard",
  robots: { index: false, follow: false },
  applicationName: "GLS Plus",
  appleWebApp: {
    capable: true,
    title: "GLS Plus",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  // Legacy tag for iOS < 16.4 to launch full-screen from the home screen
  // (Next emits the modern `mobile-web-app-capable` on its own).
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf8f5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${cormorantGaramond.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
        <InstallHint />
      </body>
    </html>
  );
}

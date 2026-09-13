import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { getSiteOrigin } from "@/lib/site-url";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-14MEF81Y5H";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFB" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1424" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: {
    default: "Overdrive Radar",
    template: "%s · Overdrive Radar",
  },
  description:
    "Discover automotive events and local activities across Southern California.",
  applicationName: "Overdrive Radar",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/brand/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/overdrive-radar-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Overdrive Radar",
    description:
      "Discover automotive events and local activities across Southern California.",
    siteName: "Overdrive Radar",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Overdrive Radar",
    description:
      "Discover automotive events and local activities across Southern California.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans antialiased`}>
        {children}
        <Analytics />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}

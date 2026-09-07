import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import { AgeGate } from "@/components/age-gate";
import { SITE_URL } from "@/lib/seo";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-mono",
  weight: "100 900",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
  display: "swap",
});

const DESC =
  "Amicora is a verified companionship listing and introduction service in South Africa. " +
  "Browse companions and agencies by city and category. Adults only (18+).";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Amicora — Companions & agencies in South Africa (18+)",
    template: "%s · Amicora",
  },
  description: DESC,
  applicationName: "Amicora",
  keywords: [
    "companions",
    "companionship",
    "South Africa",
    "Cape Town",
    "Johannesburg",
    "Durban",
    "Pretoria",
    "dinner date",
    "travel companion",
    "event plus one",
    "agency",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Amicora",
    url: SITE_URL,
    title: "Amicora — Companionship, arranged with care",
    description: DESC,
    locale: "en_ZA",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Amicora" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Amicora — Companionship, arranged with care",
    description: DESC,
    images: ["/og.jpg"],
  },
  robots: { index: true, follow: true },
  // RTA ("Restricted to Adults") label — a standard, machine-readable marker
  // that parental-control and content-filtering software detects to block
  // this site on children's devices. See https://www.rtalabel.org
  other: { rating: "RTA-5042-1996-1400-1577-RTA" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} min-h-screen`}
      >
        <AuthProvider>
          <SiteHeader />
          <main className="w-full px-4 py-8 sm:px-6 lg:px-8">{children}</main>
          <SiteFooter />
          <AgeGate />
        </AuthProvider>
      </body>
    </html>
  );
}

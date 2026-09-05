import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/nav";
import { SiteFooter } from "@/components/footer";
import { AgeGate } from "@/components/age-gate";

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

export const metadata: Metadata = {
  title: "Amicora",
  description: "South African companionship listing platform.",
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
          <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">{children}</main>
          <SiteFooter />
          <AgeGate />
        </AuthProvider>
      </body>
    </html>
  );
}

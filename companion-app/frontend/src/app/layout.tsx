import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteHeader } from "@/components/nav";
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
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} min-h-screen`}
      >
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>
          <AgeGate />
        </AuthProvider>
      </body>
    </html>
  );
}

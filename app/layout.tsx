import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { Viewport } from "next";
import { Nav } from "@/components/Nav";
import { env } from "@/lib/env";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const SITE_NAME = "MnemoSong";
const DESCRIPTION =
  "Upload your study material and MnemoSong writes and sings a catchy, fact-checked song to help you memorize it.";
const metadataBase = new URL(env.appUrl());

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "MnemoSong — turn your notes into a song you'll remember",
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "MnemoSong",
    "study songs",
    "memorization",
    "mnemonics",
    "AI song generator",
    "study aid",
    "spaced learning",
  ],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "MnemoSong — turn your notes into a song you'll remember",
    description: DESCRIPTION,
    url: metadataBase,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "MnemoSong — turn your notes into a song you'll remember",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Nav />
        <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-center text-xs text-slate-500">
          Songs are AI-generated. Verify important facts against your sources.
        </footer>
      </body>
    </html>
  );
}

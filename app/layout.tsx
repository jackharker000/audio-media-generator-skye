import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { Viewport } from "next";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "MnemoSong — turn your notes into a song you'll remember",
  description:
    "Upload your study material and MnemoSong writes and sings a catchy, fact-checked song to help you memorize it.",
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
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-center text-xs text-slate-400">
          Songs are AI-generated. Verify important facts against your sources.
        </footer>
      </body>
    </html>
  );
}

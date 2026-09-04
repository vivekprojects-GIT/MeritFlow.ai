import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeritFlow · Turn any document into a course you can teach from",
  description:
    "Upload a document and MeritFlow builds a complete course: plain-language lessons with worked examples, the best video or a generated illustration per topic, plus quizzes and assignments with instructor answer keys.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      /* ThemeScript stamps data-theme on this element before React hydrates, so
         the server HTML and the client DOM legitimately differ by that one
         attribute. Suppressing here is the documented escape hatch for exactly
         this case, it applies to this element only, not the tree below it. */
      suppressHydrationWarning
    >
      <head>
        {/* Must run before first paint, or a reader who chose dark gets a white
            flash on every navigation. */}
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-surface text-ink antialiased">{children}</body>
    </html>
  );
}

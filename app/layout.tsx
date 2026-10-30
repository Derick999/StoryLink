import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--nf-display",
  subsets: ["latin"],
});

const body = Plus_Jakarta_Sans({
  variable: "--nf-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoryLink — Link YouTube jadi Story Instagram",
  description:
    "Tempel link YouTube Shorts, dapatkan gambar Story 1080x1920 siap share ke Instagram.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F3EEE4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

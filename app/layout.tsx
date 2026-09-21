import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research OS",
  description:
    "A local-first, multi-project evidence workspace for papers, ideas, hypotheses, experiments, and results.",
  icons: {
    icon: "/branding/research-os-mark.png",
    shortcut: "/branding/research-os-mark.png",
  },
  other: {
    "color-scheme": "light dark",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

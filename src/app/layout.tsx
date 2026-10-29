import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./polish-lanes.css";
import "./polish-type.css";
import "./polish-board.css";

const sans = Geist({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--f-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CAPE Refund Desk: pre-flight check before an irreversible CAPE upload",
  description: "Triage entries for a CBP CAPE (IEEPA refund) declaration before the upload that cannot be undone. Powered by Nemotron on Nebius Token Factory. Prepared for licensed customs broker review. Not legal or customs advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

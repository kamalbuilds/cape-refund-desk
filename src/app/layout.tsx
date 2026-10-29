import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAPE Refund Desk: pre-flight check before an irreversible CAPE upload",
  description: "Triage entries for a CBP CAPE (IEEPA refund) declaration before the upload that cannot be undone. Powered by Nemotron on Nebius Token Factory. Prepared for licensed customs broker review. Not legal or customs advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

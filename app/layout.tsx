import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skillcase Lead Desk",
  description: "Messy lead sheet → prioritized, AI-enriched, human-approved sales list.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Albert+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

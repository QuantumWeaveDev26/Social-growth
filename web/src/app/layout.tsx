import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BrandMint AI · Instagram and Facebook content, made and posted for you", template: "%s · BrandMint AI" },
  description: "Tell us about your business. We write, design and schedule a month of Instagram and Facebook posts and reels. Nothing goes live until you approve it.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}

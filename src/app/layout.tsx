import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "data-stockflow",
  description: "会計データベース",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}

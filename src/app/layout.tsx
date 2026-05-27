import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boss Agent Recruiting MVP",
  description: "Recruiting delivery agent MVP for job brief parsing and search mapping.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

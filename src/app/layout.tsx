import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Bilgin Admin",
  description: "Bilgin yönetim paneli",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

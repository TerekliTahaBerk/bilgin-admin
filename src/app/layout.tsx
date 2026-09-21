import type { Metadata } from "next";

import "@/app/globals.css";
import { ClientErrorObserver } from "@/components/observability/client-error-observer";

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
      <body>
        <ClientErrorObserver />
        {children}
      </body>
    </html>
  );
}

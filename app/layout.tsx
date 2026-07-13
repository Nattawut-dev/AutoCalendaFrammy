import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NANCHAYA Roster Bot",
  description: "แปลงตารางเวร NANCHAYA จาก LINE เป็น Apple Calendar",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

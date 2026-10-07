import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "کنترل پروژه و ثبت میدانی رام نور",
  description: "ثبت تولید و گردش انبار با داده‌های مشترک",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}

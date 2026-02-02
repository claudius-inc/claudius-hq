import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AutoRefresh } from "@/components/AutoRefresh";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Claudius HQ",
  description: "Mission Control for Claudius Inc",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen`}>
        <AutoRefresh />
        {children}
      </body>
    </html>
  );
}

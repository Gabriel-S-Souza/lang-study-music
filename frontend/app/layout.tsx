import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactElement, ReactNode } from "react";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-study-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-study-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "English Study Music",
  description: "Estudo de listening com YouTube, legendas e tradução.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactElement {
  return (
    <html lang="pt-BR">
      <body className={`${dmSans.variable} ${jetbrains.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono, Alfa_Slab_One, Rye } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fonte display slab vintage — títulos.
const alfaSlab = Alfa_Slab_One({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
});

// Fonte da MARCA (logo) — Rye, vintage barbershop.
const rye = Rye({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "BarberPro",
  description: "ERP para barbearias",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${alfaSlab.variable} ${rye.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}

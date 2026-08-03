import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAUCE",
  description: "Distribución digital de contenido creativo independiente sobre Arbitrum",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-sauce-canvas min-h-screen">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";

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
      <body className="bg-sauce-canvas min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

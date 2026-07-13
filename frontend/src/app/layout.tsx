import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/app.css";

export const metadata: Metadata = {
  title: "Vista Montaña Apartasuites",
  description: "Plataforma local de reservas para Vista Montaña Apartasuites."
};

// Without this Next renders the application on a 980px layout viewport on
// phones, then scales it down. The responsive breakpoints never get a chance
// to provide the reception-friendly mobile layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

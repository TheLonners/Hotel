import type { Metadata } from "next";
import "./globals.css";
import "../styles/app.css";

export const metadata: Metadata = {
  title: "Vista Montaña Apartasuites",
  description: "Plataforma local de reservas para Vista Montaña Apartasuites."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

import "./globals.css";
import { AuthProvider } from "../lib/AuthContext";

export const metadata = {
  title: "Contric — Gestão de Obras",
  description: "Sistema de gestão de obras da Contric",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0E1B3D",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-body bg-white text-textmain">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

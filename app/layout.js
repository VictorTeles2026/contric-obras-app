import "./globals.css";
import { AuthProvider } from "../lib/AuthContext";
import { ToastProvider } from "../lib/Toast";

export const metadata = {
  title: "Contric — Gestão de Obras",
  description: "Sistema de gestão de obras da Contric",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Contric", statusBarStyle: "black-translucent" },
  icons: { apple: "/icon-192.png" },
};

export const viewport = {
  themeColor: "#0E1B3D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-panel text-textmain">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

import "./globals.css";
import { AuthProvider } from "../lib/AuthContext";
import { ToastProvider } from "../lib/Toast";

export const metadata = {
  title: "Contric — Gestão de Obras",
  description: "Sistema de gestão de obras da Contric",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Contric", statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
};

export const viewport = {
  themeColor: "#0B2E44",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* aplica o tema escolhido (claro/escuro) antes de desenhar a página — evita "piscar" */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('contric:tema');if(t==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}" }} />
      </head>
      <body className="font-body bg-panel text-textmain">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

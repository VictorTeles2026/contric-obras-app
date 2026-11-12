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

const GUARDA_DATAS = `(function(){
  function eData(t){return t&&t.tagName==='INPUT'&&t.type==='date';}
  function guarda(e){var t=e.target;if(!eData(t))return;
    if(!t.value){t.setCustomValidity('');t.style.borderColor='';return;}
    var a=+t.value.slice(0,4);
    if(!(a>=2000&&a<=2100)){e.stopImmediatePropagation();t.setCustomValidity('Ano inválido: use de 2000 a 2100');t.style.borderColor='#dc2626';t.title='Ano inválido: use de 2000 a 2100';}
    else{t.setCustomValidity('');t.style.borderColor='';if(t.title==='Ano inválido: use de 2000 a 2100')t.title='';}}
  window.addEventListener('input',guarda,true);window.addEventListener('change',guarda,true);
  window.addEventListener('focusin',function(e){var t=e.target;if(!eData(t))return;if(!t.min)t.min='2000-01-01';if(!t.max)t.max='2100-12-31';},true);
})();`;

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
        {/* PROTEÇÃO GLOBAL DE DATAS (todas as telas): enquanto a pessoa digita o ano, o campo passa
            por "0002", "0020", "0202"... — esses valores NÃO chegam ao sistema (nem são gravados).
            Só passa data vazia ou com ano entre 2000 e 2100. Foi o que travou o PI227380. */}
        <script dangerouslySetInnerHTML={{ __html: GUARDA_DATAS }} />
      </head>
      <body className="font-body bg-panel text-textmain">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

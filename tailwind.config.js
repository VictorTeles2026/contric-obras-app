/** @type {import('tailwindcss').Config} */
// Cores como variáveis CSS (definidas em app/globals.css): o modo claro/escuro troca
// só os valores das variáveis, e todas as classes (bg-panel, text-muted, border-line…)
// acompanham sozinhas. Formato "R G B" para manter as opacidades (bg-cyan/10 etc.).
const cor = (nome) => `rgb(var(--cor-${nome}) / <alpha-value>)`;

module.exports = {
  // lib/ também tem classes (Toast, constantes de status) — sem ela aqui, essas classes não eram geradas
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: cor("navy"), // cores do logo Contric
        navysoft: cor("navysoft"),
        cyan: cor("cyan"),
        green: cor("green"),
        amber: cor("amber"),
        red: cor("red"),
        panel: cor("panel"),          // fundo das páginas
        superficie: cor("superficie"), // cartões, campos, barras
        line: cor("line"),
        muted: cor("muted"),
        muteddim: cor("muteddim"),
        textmain: cor("textmain"),
      },
      fontFamily: {
        head: ["Geist", "'Segoe UI'", "system-ui", "sans-serif"],
        body: ["Geist", "'Segoe UI'", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

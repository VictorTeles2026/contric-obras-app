/** @type {import('tailwindcss').Config} */
module.exports = {
  // lib/ também tem classes (Toast, constantes de status) — sem ela aqui, essas classes não eram geradas
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B2E44", // cores do logo Contric
        navysoft: "#13435E",
        cyan: "#1780AE",
        green: "#2E9E44",
        amber: "#C97A21",
        red: "#D64545",
        panel: "#F4F7FB",
        line: "#D7E0EC",
        muted: "#5B6B85",
        muteddim: "#93A2B8",
        textmain: "#0F2A44",
      },
      fontFamily: {
        head: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};

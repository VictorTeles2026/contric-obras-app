/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // a página "Utilização" virou uma aba da página Recursos — links antigos continuam funcionando
  async redirects() {
    return [{ source: "/utilizacao-recursos", destination: "/recursos?aba=utilizacao", permanent: false }];
  },
};

module.exports = nextConfig;
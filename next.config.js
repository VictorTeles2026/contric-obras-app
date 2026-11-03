/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // a página "Utilização" virou uma aba da página Recursos — links antigos continuam funcionando
  // cabeçalhos de segurança em todas as páginas
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },                       // impede o site de ser embutido em outro (clickjacking)
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // sempre HTTPS
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
      ],
    }];
  },
  async redirects() {
    return [{ source: "/utilizacao-recursos", destination: "/recursos?aba=utilizacao", permanent: false }];
  },
};

module.exports = nextConfig;
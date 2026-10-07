// Usuário de acesso (login): pode ser um e-mail OU um nome de usuário digitado
// (ex: "joao.silva"). O Supabase só aceita e-mail, então um login sem "@" vira
// internamente "<login>@usuarios.contric.local" — a pessoa nunca vê isso, digita só "joao.silva".
export const DOMINIO_LOGIN = "usuarios.contric.local";

export const normalizarLogin = (s) => String(s || "").trim().toLowerCase();
export const ehEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

// regra: e-mail válido, ou 3 a 40 caracteres entre letras, números, ponto, hífen e sublinhado
export function erroLogin(login) {
  const l = normalizarLogin(login);
  if (!l) return "Informe o usuário.";
  if (l.includes("@")) return ehEmail(l) ? null : "E-mail inválido.";
  if (!/^[a-z0-9._-]{3,40}$/.test(l)) return "Use de 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.";
  return null;
}

// e-mail usado no Supabase Auth para este login
export const emailAuthDe = (login) => {
  const l = normalizarLogin(login);
  return l.includes("@") ? l : `${l}@${DOMINIO_LOGIN}`;
};

// sugestão "nome.sobrenome" a partir do nome completo
export function sugerirLogin(nome) {
  const partes = String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").split(/\s+/).filter((p) => p.length > 1 && !["da", "de", "do", "das", "dos", "e"].includes(p));
  if (!partes.length) return "";
  return partes.length === 1 ? partes[0] : `${partes[0]}.${partes[partes.length - 1]}`;
}

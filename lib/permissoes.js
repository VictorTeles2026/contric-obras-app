// Permissões: matriz por perfil + exceções por usuário (usado nas telas E no servidor).
//
//   valor final = padrão do perfil  →  ajustado pela exceção do usuário (a exceção prevalece)
//   S = permitido · P = permitido só nos PIs em que o usuário está alocado · N = não permitido
import { CATALOGO_PERMISSOES, PADRAO_PERMISSOES } from "./permissoesPadrao";

export { CATALOGO_PERMISSOES, PADRAO_PERMISSOES };

export const ROTULO_VALOR = { S: "Sim", P: "Só PIs próprios", N: "Não" };
// o Master nunca pode perder o acesso à tela de permissões (senão ninguém conserta)
const TRAVADAS_MASTER = ["permissao.gerenciar", "acesso.painel", "usuario.editar"];

const hojeISO = () => new Date().toISOString().slice(0, 10);

// linhasPerfil: [{ codigo, valor }] do perfil · excecoes: [{ codigo, valor, valido_ate }] do usuário
export function resolverPermissoes(perfil, linhasPerfil, excecoes = []) {
  const base = { ...(PADRAO_PERMISSOES[perfil] || {}) };
  // códigos que não estão no catálogo nascem como "N" para perfis sem definição
  CATALOGO_PERMISSOES.forEach((c) => { if (!(c.codigo in base)) base[c.codigo] = "N"; });
  (linhasPerfil || []).forEach((l) => { base[l.codigo] = l.valor; });
  const hoje = hojeISO();
  (excecoes || []).forEach((e) => { if (!e.valido_ate || e.valido_ate >= hoje) base[e.codigo] = e.valor; });
  if (perfil === "master") TRAVADAS_MASTER.forEach((c) => { base[c] = "S"; });
  return base;
}

// valor bruto: "S" | "P" | "N"
export function valorPermissao(usuario, codigo) {
  if (!usuario) return "N";
  const mapa = usuario.permissoes || resolverPermissoes(usuario.perfil, null, null);
  return mapa[codigo] || "N";
}
// pode fazer (em todos os PIs ou só nos próprios)?
export function pode(usuario, codigo) {
  const v = valorPermissao(usuario, codigo);
  return v === "S" || v === "P";
}
// pode fazer em QUALQUER PI (não só nos próprios)?
export function podeTudo(usuario, codigo) {
  return valorPermissao(usuario, codigo) === "S";
}

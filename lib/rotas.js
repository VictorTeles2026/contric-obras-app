import { primeiraRotaPainel } from "./nav";

export function rotaInicialPara(usuario) {
  if (!usuario) return "/login";
  if (usuario.perfil === "cliente") return "/cliente";
  if (usuario.perfil === "lider") return "/lider";
  if (usuario.perfil === "funcionario" || usuario.perfil === "terceiro") return "/equipe";
  return primeiraRotaPainel(usuario);
}

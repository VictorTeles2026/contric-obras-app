// Menus de navegação centralizados (antes cada página repetia a própria cópia).

export const NAV_LIDER = [
  { href: "/lider", label: "Início", icone: "inicio" },
  { href: "/lider/rdo", label: "RDO", icone: "rdo" },
  { href: "/lider/horas", label: "Horas", icone: "relogio" },
  { href: "/lider/cronograma", label: "Obras", icone: "calendario" },
  { href: "/lider/solicitar", label: "Solicitar", icone: "editar" },
];

export const NAV_EQUIPE = [
  { href: "/equipe", label: "Horas", icone: "relogio" },
  { href: "/equipe/ocorrencia", label: "Ocorrência", icone: "alerta" },
];

import { pode } from "./permissoes";

// ordem do menu lateral do painel desktop — cada item aparece se o usuário tiver
// QUALQUER uma das permissões listadas (matriz de permissões)
export const NAV_PAINEL = [
  { href: "/dashboard", label: "Dashboard", icone: "painel", principal: true, permissoes: ["dashboard.ver"] },
  { href: "/cronograma", label: "Cronograma", icone: "cronograma", principal: true, permissoes: ["pi.ver"] },
  { href: "/linha-do-tempo", label: "Linha do Tempo", icone: "linhaTempo", permissoes: ["linhatempo.ver"] },
  { href: "/recursos", label: "Recursos", icone: "recursos", permissoes: ["recurso.ver"] },
  { href: "/rdo", label: "RDO", icone: "rdo", permissoes: ["rdo.ver"] },
  { href: "/minhas-horas", label: "Minhas horas", icone: "relogio", principal: true, permissoes: ["horas.lancar_proprias"] },
  { href: "/aprovacoes", label: "Aprovações", icone: "aprovar", principal: true, permissoes: ["rdo.aprovar", "horas.aprovar", "ocorrencia.aprovar", "cronograma.aprovar", "rdo.ver"] },
  { href: "/relatorios", label: "Relatórios", icone: "relatorio", permissoes: ["relatorio.ver", "horas.relatorio"] },
  { href: "/documentos", label: "Documentos", icone: "pasta", permissoes: ["doc.ver"] },
  { href: "/clientes", label: "Clientes", icone: "predio", permissoes: ["cliente.gerenciar", "cliente.acessos"] },
  { href: "/historico", label: "Histórico", icone: "historico", permissoes: ["historico.ver"] },
  { href: "/auditoria", label: "Auditoria", icone: "auditoria", permissoes: ["auditoria.ver"] },
  { href: "/usuarios", label: "Usuários", icone: "usuarios", permissoes: ["usuario.ver"] },
  { href: "/permissoes", label: "Permissões", icone: "chave", permissoes: ["permissao.gerenciar"] },
  { href: "/configuracoes", label: "Configurações", icone: "engrenagem", somenteMaster: true },
];

export const itemPermitido = (usuario, item) =>
  item.somenteMaster ? usuario?.perfil === "master" : !item.permissoes || item.permissoes.some((c) => pode(usuario, c));
export const navPermitida = (usuario) => NAV_PAINEL.filter((i) => itemPermitido(usuario, i));
// item do menu que corresponde a uma rota (ex: /cronograma/solicitacoes → Cronograma)
export const itemDaRota = (rota) => NAV_PAINEL.find((i) => rota === i.href || rota.startsWith(`${i.href}/`));
// primeira página do painel que o usuário pode abrir
export const primeiraRotaPainel = (usuario) => navPermitida(usuario)[0]?.href || "/dashboard";

// rota inicial de cada perfil (antes em lib/rotas.js)
export function rotaInicialPara(usuario) {
  if (!usuario) return "/login";
  if (usuario.perfil === "cliente") return "/cliente";
  if (usuario.perfil === "lider") return "/lider";
  if (usuario.perfil === "funcionario" || usuario.perfil === "terceiro") return "/equipe";
  return primeiraRotaPainel(usuario);
}

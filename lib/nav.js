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

// Menu do painel organizado pelo processo (ver "Mapa do Sistema Contric"), em grupos.
// Cada item aparece se o usuário tiver QUALQUER uma das permissões listadas; sem
// "permissoes" = todos do painel veem. `rotas`: outras páginas que acendem o item.
// Itens com "?aba=" abrem direto numa aba da página (ex: Utilização dentro de Recursos).
export const GRUPOS_PAINEL = ["Visão geral", "Obras", "Campo", "Análise", "Cadastros", "Administração"];
export const NAV_PAINEL = [
  // Visão geral
  { grupo: "Visão geral", href: "/dashboard", label: "Dashboard", icone: "painel", principal: true, permissoes: ["dashboard.ver"] },
  { grupo: "Visão geral", href: "/aprovacoes", label: "Aprovações", icone: "aprovar", principal: true, rotas: ["/historico"],
    permissoes: ["rdo.aprovar", "horas.aprovar", "ocorrencia.aprovar", "cronograma.aprovar", "rdo.ver", "historico.ver"] },
  { grupo: "Visão geral", href: "/auditoria", label: "Auditoria", icone: "auditoria" }, // consulta liberada para todos
  // Obras
  { grupo: "Obras", href: "/pi", label: "PIs", icone: "obra", principal: true, permissoes: ["pi.ver"] }, // Página do PI
  { grupo: "Obras", href: "/cronograma", label: "Cronograma", icone: "cronograma", permissoes: ["pi.ver"] },
  { grupo: "Obras", href: "/linha-do-tempo", label: "Linha do Tempo", icone: "linhaTempo", permissoes: ["linhatempo.ver"] },
  { grupo: "Obras", href: "/recursos?aba=utilizacao", label: "Utilização de recursos", icone: "grafico", permissoes: ["recurso.ver"] },
  { grupo: "Obras", href: "/documentos", label: "Documentos", icone: "pasta", permissoes: ["doc.ver"] },
  // Campo
  { grupo: "Campo", href: "/rdo", label: "RDO", icone: "rdo", permissoes: ["rdo.ver"] },
  { grupo: "Campo", href: "/minhas-horas", label: "Minhas horas", icone: "relogio", principal: true, permissoes: ["horas.lancar_proprias"] },
  // Análise
  { grupo: "Análise", href: "/relatorios", label: "Relatórios", icone: "relatorio", permissoes: ["relatorio.ver", "horas.relatorio"] },
  // Cadastros
  { grupo: "Cadastros", href: "/recursos", label: "Recursos", icone: "recursos", permissoes: ["recurso.ver"] },
  { grupo: "Cadastros", href: "/recursos?aba=empresas", label: "Empresas terceiras", icone: "predio", permissoes: ["empresa.gerenciar", "recurso.ver"] },
  { grupo: "Cadastros", href: "/clientes", label: "Clientes", icone: "obra", permissoes: ["cliente.gerenciar", "cliente.acessos"] },
  { grupo: "Cadastros", href: "/usuarios", label: "Usuários", icone: "usuarios", permissoes: ["usuario.ver"] },
  // Administração
  { grupo: "Administração", href: "/permissoes", label: "Permissões", icone: "chave", permissoes: ["permissao.gerenciar"] },
  { grupo: "Administração", href: "/configuracoes", label: "Configurações", icone: "engrenagem", somenteMaster: true },
];

export const itemPermitido = (usuario, item) =>
  item.somenteMaster ? usuario?.perfil === "master" : !item.permissoes || item.permissoes.some((c) => pode(usuario, c));
export const navPermitida = (usuario) => NAV_PAINEL.filter((i) => itemPermitido(usuario, i));
// separa os itens por grupo, na ordem do menu (grupos vazios somem)
export const navAgrupada = (itens) => GRUPOS_PAINEL.map((g) => [g, itens.filter((i) => i.grupo === g)]).filter(([, l]) => l.length);

// item do menu da rota atual. `busca` = "?aba=..." (diferencia Recursos × Utilização × Empresas)
const caminhoDe = (href) => href.split("?")[0];
const abaDe = (href) => new URLSearchParams(href.split("?")[1] || "").get("aba") || "";
export function itemAtivo(item, rota, busca = "") {
  const caminho = caminhoDe(item.href);
  const naRota = [caminho, ...(item.rotas || [])].some((r) => rota === r || rota.startsWith(`${r}/`));
  if (!naRota) return false;
  // na mesma página, as abas com item próprio (?aba=) só acendem o seu item
  const abaAtual = new URLSearchParams(busca).get("aba") || "";
  const irmaos = NAV_PAINEL.filter((i) => caminhoDe(i.href) === caminho);
  if (irmaos.length < 2) return true;
  const abasComItem = irmaos.map((i) => abaDe(i.href)).filter(Boolean);
  return abasComItem.includes(abaAtual) ? abaDe(item.href) === abaAtual : !abaDe(item.href);
}
export const itemDaRota = (rota, busca = "") => NAV_PAINEL.find((i) => itemAtivo(i, rota, busca));
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

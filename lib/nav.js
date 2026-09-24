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

export const NAV_PAINEL = [
  { href: "/dashboard", label: "Dashboard", icone: "painel", principal: true },
  { href: "/cronograma", label: "Cronograma", icone: "cronograma", principal: true },
  { href: "/aprovacoes", label: "Aprovações", icone: "aprovar", principal: true },
  { href: "/rdo", label: "RDO", icone: "rdo", principal: true },
  { href: "/linha-do-tempo", label: "Linha do Tempo", icone: "linhaTempo" },
  { href: "/recursos", label: "Recursos", icone: "recursos" },
  { href: "/utilizacao-recursos", label: "Utilização", icone: "grafico" },
  { href: "/historico", label: "Histórico", icone: "historico" },
  { href: "/auditoria", label: "Auditoria", icone: "auditoria" },
  { href: "/usuarios", label: "Usuários", icone: "usuarios" },
];

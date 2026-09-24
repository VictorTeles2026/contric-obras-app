export const STATUS_ETAPA = {
  nao_iniciada: { rotulo: "Não iniciada", classe: "bg-panel text-muted", barra: "#93A2B8" },
  em_andamento: { rotulo: "Em andamento", classe: "bg-cyan/10 text-cyan", barra: "#0B84A5" },
  concluida: { rotulo: "Concluída", classe: "bg-green/10 text-green", barra: "#2E9E44" },
  parada: { rotulo: "Parada", classe: "bg-red/10 text-red", barra: "#D64545" },
};
export const LISTA_STATUS_ETAPA = Object.entries(STATUS_ETAPA).map(([v, s]) => [v, s.rotulo]);

export const CATEGORIAS_OCORRENCIA = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export const AREAS = [
  "Engenharia Mecânica", "Engenharia Elétrica", "Vendas", "Cliente",
  "Suprimentos", "Produção", "Líder de Obra", "Coordenador de Obra", "Financeiro",
];

export const TIPOS_RECURSO = [
  ["mao_obra_propria", "Mão de obra própria"],
  ["mao_obra_terceira", "Mão de obra terceira"],
  ["ferramenta", "Ferramenta"],
  ["veiculo", "Veículo"],
  ["equipamento", "Equipamento"],
  ["canteiro", "Canteiro"],
  ["conteiner", "Contêiner"],
];

export const STATUS_PI = { ativo: "Ativo", pausado: "Pausado", concluido: "Concluído", cancelado: "Cancelado" };
export const COR_STATUS_PI = {
  ativo: "bg-green/10 text-green", pausado: "bg-amber/10 text-amber",
  concluido: "bg-cyan/10 text-cyan", cancelado: "bg-panel text-muted",
};

export const STATUS_SOLICITACAO = {
  pendente_coordenador: { rotulo: "Aguardando Coordenador", classe: "bg-amber/10 text-amber" },
  rejeitada_coordenador: { rotulo: "Rejeitada (Coordenador)", classe: "bg-red/10 text-red" },
  pendente_gerente: { rotulo: "Aguardando Gerente", classe: "bg-amber/10 text-amber" },
  rejeitada_gerente: { rotulo: "Rejeitada (Gerente)", classe: "bg-red/10 text-red" },
  aprovada: { rotulo: "Aprovada", classe: "bg-green/10 text-green" },
};

export const porOrdem = (a, b) => (a.ordem ?? 999999) - (b.ordem ?? 999999);

// macro-etapas ordenadas, cada uma seguida das suas sub-etapas
export function etapasEmArvore(etapasDoPi) {
  const macros = etapasDoPi.filter((e) => !e.parent_etapa_id).sort(porOrdem);
  return macros.flatMap((m) => [
    { ...m, nivel: 0 },
    ...etapasDoPi.filter((e) => e.parent_etapa_id === m.id).sort(porOrdem).map((s) => ({ ...s, nivel: 1 })),
  ]);
}

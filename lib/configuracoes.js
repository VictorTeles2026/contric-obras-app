// Configurações estruturais editáveis pelo Master (página Configurações).
// Cada chave tem um padrão (em lib/constantes.js). O que estiver salvo na tabela
// "configuracoes" é aplicado POR CIMA dos padrões no login — as listas são alteradas
// no próprio lugar, então todas as telas que já usam AREAS, FUNCOES etc. passam a
// enxergar os valores novos sem precisar mudar cada tela.
import {
  AREAS, FUNCOES, CATEGORIAS_OCORRENCIA, TIPOS_RECURSO, UNIDADES, CLASSIFICACOES_DOC,
  PRAZOS, FERIADOS_EXTRAS, STATUS_ETAPA, LISTA_STATUS_ETAPA, STATUS_PI, EQUIPE_CAMPO,
} from "./constantes";

const copia = (v) => JSON.parse(JSON.stringify(v));
// tipos de recurso com regra própria no sistema (não podem ser removidos)
export const TIPOS_RECURSO_FIXOS = ["mao_obra_propria", "mao_obra_terceira"];

// padrões guardados antes de qualquer alteração (para "restaurar padrão")
export const PADROES = {
  equipes: copia(AREAS),
  funcoes: copia(FUNCOES),
  categorias_ocorrencia: copia(CATEGORIAS_OCORRENCIA),
  tipos_recurso: copia(TIPOS_RECURSO),
  unidades: copia(UNIDADES),
  classificacoes_doc: copia(CLASSIFICACOES_DOC),
  prazos: copia(PRAZOS),
  feriados_extras: copia(FERIADOS_EXTRAS),
  status_etapa: Object.fromEntries(Object.entries(STATUS_ETAPA).map(([k, v]) => [k, { rotulo: v.rotulo, barra: v.barra }])),
  status_pi: copia(STATUS_PI),
};

const trocarLista = (alvo, nova) => { if (Array.isArray(nova)) alvo.splice(0, alvo.length, ...nova); };

// aplica um mapa { chave: valor } por cima dos padrões
export function aplicarConfiguracoes(mapa = {}) {
  const v = (k) => (mapa[k] !== undefined && mapa[k] !== null ? mapa[k] : PADROES[k]);
  // a equipe Campo tem regra própria (aba Usuários de Campo): sempre presente
  const equipes = [...v("equipes")];
  if (!equipes.includes(EQUIPE_CAMPO)) equipes.push(EQUIPE_CAMPO);
  trocarLista(AREAS, equipes);
  trocarLista(FUNCOES, v("funcoes"));
  trocarLista(CATEGORIAS_OCORRENCIA, v("categorias_ocorrencia"));
  // tipos fixos nunca somem
  const tipos = [...v("tipos_recurso")];
  TIPOS_RECURSO_FIXOS.forEach((k) => { if (!tipos.some(([c]) => c === k)) tipos.unshift(PADROES.tipos_recurso.find(([c]) => c === k)); });
  trocarLista(TIPOS_RECURSO, tipos);
  trocarLista(UNIDADES, v("unidades"));
  trocarLista(CLASSIFICACOES_DOC, v("classificacoes_doc"));
  Object.assign(PRAZOS, PADROES.prazos, v("prazos"));
  trocarLista(FERIADOS_EXTRAS, v("feriados_extras"));
  const st = v("status_etapa");
  Object.keys(STATUS_ETAPA).forEach((k) => { if (st[k]) Object.assign(STATUS_ETAPA[k], st[k]); });
  trocarLista(LISTA_STATUS_ETAPA, Object.entries(STATUS_ETAPA).map(([k, s]) => [k, s.rotulo]));
  Object.assign(STATUS_PI, PADROES.status_pi, v("status_pi"));
}

// carrega do banco (cliente supabase passado por quem chama) e aplica; sem a tabela, ficam os padrões
export async function carregarConfiguracoes(supabase) {
  const { data, error } = await supabase.from("configuracoes").select("chave, valor");
  if (error) return {};
  const mapa = Object.fromEntries((data || []).map((l) => [l.chave, l.valor]));
  aplicarConfiguracoes(mapa);
  return mapa;
}

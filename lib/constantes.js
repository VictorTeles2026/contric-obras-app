export const STATUS_ETAPA = {
  nao_iniciada: { rotulo: "Não iniciada", classe: "bg-panel text-muted", barra: "#93A2B8" },
  em_andamento: { rotulo: "Em andamento", classe: "bg-cyan/10 text-cyan", barra: "#0B84A5" },
  concluida: { rotulo: "Concluída", classe: "bg-green/10 text-green", barra: "#2E9E44" },
  parada: { rotulo: "Parada", classe: "bg-red/10 text-red", barra: "#D64545" },
};
export const LISTA_STATUS_ETAPA = Object.entries(STATUS_ETAPA).map(([v, s]) => [v, s.rotulo]);

export const CATEGORIAS_OCORRENCIA = ["Atraso", "Retrabalho", "Reclamação do cliente", "Prejuízo", "Outro"];

export const AREAS = [
  "Engenharia Mecânica", "Engenharia Elétrica", "Automação", "Vendas", "Cliente",
  "Suprimentos", "Produção", "Líder de Obra", "Coordenador de Obra", "Financeiro", "Campo",
];
// equipe cujos usuários aparecem na aba "Usuários de Campo"
export const EQUIPE_CAMPO = "Campo";

// funções — lista única usada no cadastro de usuários e de recursos
export const FUNCOES = [
  "Líder", "Programador", "Eletricista", "Eletricista Eletromecânico", "Eletricista Força e Controle",
  "Mecânico", "Serralheiro", "Encanador", "Téc. Automação", "Téc. Eletrotécnica",
  "Téc. Mecatrônico", "Pedreiro", "Técnico de Segurança",
  "Projetista Mecânico", "Projetista Elétrico", "Gerente de Engenharia Elétrica",
  "Gerente de Engenharia Mecânica", "Gestor de Projetos", "Gerente de Engenharia", "Diretor",
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

// modo de apropriação de custo dos recursos
export const UNIDADES = [["hora", "Hora"], ["diaria", "Diária"], ["semana", "Semana"], ["quinzena", "Quinzena"], ["mes", "Mês"]];

// classificação dos arquivos enviados em Documentos: o prefixo vai no início do nome do arquivo
export const CLASSIFICACOES_DOC = [
  ["ATA_REUNIAO", "Ata de reunião"], ["CONTRATO", "Contrato"], ["PROPOSTA", "Proposta / orçamento"], ["PROJETO", "Projeto / desenho"],
  ["RELATORIO", "Relatório"], ["NF", "Nota fiscal"], ["FOTO", "Foto"], ["DOC", "Outro documento"],
];

// prazos dos alertas (em dias)
export const PRAZOS = {
  urgente: 1,        // Linha do Tempo: contorno vermelho quando faltam até N dias
  atencao: 3,        // Linha do Tempo: contorno laranja quando faltam até N dias
  medicoes: 20,      // Dashboard: medições "próximas" dentro de N dias
};

// jornada: intervalo de almoço descontado automaticamente de todo lançamento de horas
// (manual e check-in/check-out) — editável em Configurações → Jornada
export const JORNADA = { almocoInicio: "12:00", almocoFim: "13:00" };

// alertas por e-mail: padrão de cada tipo (o Master muda em Configurações → Alertas; cada usuário
// liga/desliga os seus no sininho). Silêncio: e-mails gerados nesse horário saem no fim dele.
export const TIPOS_ALERTA = [
  ["decisoes", "Decisões sobre o que eu lancei", "Horas, RDO, ocorrência ou solicitação aprovados, reprovados ou editados."],
  ["aprovacoes", "Resumo diário de aprovações pendentes", "Para quem aprova: o que está aguardando decisão."],
  ["prazos", "Resumo diário de prazos e atrasos", "Etapas atrasadas ou vencendo, medições próximas e check-in esquecido aberto."],
  ["alocacao", "Alocação em PI", "Na hora: foi alocado, teve o período alterado ou saiu de uma etapa. Coordenador/gerente do PI recebe cópia."],
  ["pendentes", "Atividades pendentes (diário)", "Horas não lançadas, RDO não enviado, itens reprovados a corrigir e etapas sem % atualizado."],
  ["agenda", "Prazos das atividades alocadas", "Diário: o que tenho hoje e nos próximos dias · Segunda-feira: a semana inteira."],
  ["lembrete", "Alertas programados nas etapas", "Avisos de antecedência configurados em cada etapa do cronograma, para quem está alocado ou é responsável."],
];
// modelo dos e-mails para a equipe (Configurações → Modelo de e-mail). Variáveis: {nome} {titulo} {data}
// introducoes: texto opcional antes do conteúdo, por tipo de alerta
export const MODELO_EMAIL = {
  assunto: "[SGO Contric] {titulo}",
  cabecalho: "SGO Contric",
  saudacao: "Olá, {nome}!",
  introducoes: {},
  botao: "Abrir no SGO Contric",
  assinatura: "Equipe Contric",
  rodape: "Mensagem automática do SGO Contric — não responda este e-mail. Para parar de receber, ajuste em Notificações → Receber por e-mail.",
};

// monta o e-mail da equipe a partir do modelo (usado no envio e na pré-visualização de Configurações)
const escHtml = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function montarEmailEquipe(modelo, { nome, titulo, mensagem, tipo, link, data }) {
  const m = { ...MODELO_EMAIL, ...(modelo || {}) };
  const troca = (t) => String(t || "").replace(/\{nome\}/g, nome || "").replace(/\{titulo\}/g, titulo || "").replace(/\{data\}/g, data || "");
  const intro = troca(m.introducoes?.[tipo]);
  const linhas = String(mensagem || "").split("\n");
  const p = (t, extra = "") => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#27272a;${extra}">${t}</p>`;
  const corpo = [
    m.saudacao ? p(escHtml(troca(m.saudacao))) : "",
    intro ? p(escHtml(intro).replace(/\n/g, "<br>")) : "",
    `<div style="margin:0 0 12px;padding:12px 14px;background:#f4f4f5;border-radius:10px;font-size:14px;line-height:1.55;color:#27272a">${linhas.map((l) => escHtml(l) || "&nbsp;").join("<br>")}</div>`,
    link && m.botao ? `<p style="margin:20px 0"><a href="${escHtml(link)}" style="background:#27272a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;display:inline-block">${escHtml(troca(m.botao))}</a></p>` : "",
    m.assinatura ? p(escHtml(troca(m.assinatura)).replace(/\n/g, "<br>"), "margin-top:18px") : "",
  ].join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#27272a;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${escHtml(troca(m.cabecalho) || "SGO Contric")}</div>
      <div style="padding:24px"><h2 style="margin:0 0 14px;font-size:18px;color:#18181b">${escHtml(titulo)}</h2>${corpo}</div>
      ${m.rodape ? `<div style="padding:14px 24px;font-size:12px;color:#71717a;border-top:1px solid #e4e4e7">${escHtml(troca(m.rodape))}</div>` : ""}
    </div></div>`;
  const texto = [troca(m.saudacao), intro, titulo, mensagem, link ? `${troca(m.botao) || "Abrir"}: ${link}` : "", troca(m.assinatura), m.rodape ? `—\n${troca(m.rodape)}` : ""].filter(Boolean).join("\n\n");
  return { assunto: troca(m.assunto) || titulo, html, texto };
}

// ---- macro-etapa = resultado das sub-etapas (padrão em todo o sistema) ----
// Mesma regra do gatilho do banco (cronograma-macros.sql); usada nas telas para refletir na hora.
export function resumoDasSubs(subs) {
  if (!subs?.length) return null;
  const ini = subs.map((s) => s.data_prevista_inicio).filter(Boolean).sort()[0] || null;
  const fim = subs.map((s) => s.data_prevista_fim).filter(Boolean).sort().pop() || null;
  const pcts = subs.map((s) => (s.status === "concluida" ? 100 : Math.max(0, Math.min(100, Number(s.percentual) || 0))));
  const pct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const tem = (st) => subs.some((s) => s.status === st);
  const status = subs.every((s) => s.status === "concluida") ? "concluida"
    : tem("parada") && !tem("em_andamento") ? "parada"
    : tem("em_andamento") || tem("concluida") || pct > 0 ? "em_andamento" : "nao_iniciada";
  return { data_prevista_inicio: ini, data_prevista_fim: fim, percentual: pct, status };
}
// devolve a lista com as macros que têm sub-etapas já consolidadas (marca `calculada: true`)
// Data plausível para cronograma (anos 2000–2100). Um ano digitado errado (ex: "0202" ou
// "20255", gravado enquanto a pessoa digitava) fazia o sistema percorrer milhares de anos
// dia a dia e TRAVAVA a página — foi o caso do PI227380.
export const ANO_MIN = 2000, ANO_MAX = 2100;
export function dataPlausivel(iso) {
  if (!iso) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).slice(0, 10));
  if (!m) return false;
  const ano = Number(m[1]);
  return ano >= ANO_MIN && ano <= ANO_MAX && !isNaN(new Date(`${m[0]}T00:00:00`));
}
// datas impossíveis viram vazio (para não travar contas e gráficos) e ficam guardadas em `datasInvalidas`
function limparDatas(e) {
  const ruins = {};
  ["data_prevista_inicio", "data_prevista_fim", "data_real_inicio", "data_real_fim"].forEach((c) => { if (e[c] && !dataPlausivel(e[c])) ruins[c] = e[c]; });
  if (!Object.keys(ruins).length) return e;
  const limpa = { ...e, datasInvalidas: ruins };
  Object.keys(ruins).forEach((c) => { limpa[c] = null; });
  return limpa;
}
export function consolidarMacros(etapasOriginais) {
  const etapas = (etapasOriginais || []).map(limparDatas);
  return etapas.map((e) => {
    if (e.parent_etapa_id) return e;
    const r = resumoDasSubs(etapas.filter((s) => s.parent_etapa_id === e.id));
    return r ? { ...e, ...r, calculada: true } : e;
  });
}

// alertas de prazo programados na etapa (Configurar Cronograma → Alertas):
// etapa.alertas = { ref: "inicio" | "fim", dias: [7, 3, 1] } (até 3 antecedências, em dias corridos)
export function datasAlertaEtapa(etapa) {
  const cfg = etapa?.alertas;
  const base = cfg?.ref === "inicio" ? etapa.data_prevista_inicio : etapa?.data_prevista_fim;
  if (!base || !Array.isArray(cfg?.dias)) return [];
  return [...new Set(cfg.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 365))].slice(0, 3)
    .map((d) => ({ dias: d, data: new Date(new Date(`${base}T12:00:00`).getTime() - d * 86400000).toISOString().slice(0, 10), ref: cfg.ref === "inicio" ? "início" : "término", base }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

// tudo começa DESLIGADO: o Master liga por usuário em Usuários → Alertas (clientes: chave geral do portal)
// diasSemPercentual: etapa em andamento sem atualização de % há N dias entra em "Atividades pendentes"
export const ALERTAS = { decisoes: false, aprovacoes: false, prazos: false, alocacao: false, pendentes: false, agenda: false, lembrete: true, clientes: false, silencioInicio: "20:00", silencioFim: "07:00", diasSemPercentual: 7 };

// feriados além dos nacionais e de SP (cálculo de dias úteis no Cronograma).
// data "MM-DD" = todo ano · "AAAA-MM-DD" = só naquele ano
export const FERIADOS_EXTRAS = [];

// Lista de valores que o Master pode alterar em Configurações. Os valores acima são o
// PADRÃO; no login o sistema aplica por cima o que estiver salvo no banco (lib/configuracoes.js).

export const STATUS_PI = { nao_iniciado: "Não Iniciado", ativo: "Ativo", pausado: "Pausado", concluido: "Concluído", cancelado: "Cancelado" };
export const COR_STATUS_PI = {
  nao_iniciado: "bg-navy/10 text-navy", ativo: "bg-green/10 text-green", pausado: "bg-amber/10 text-amber",
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

// ---------------- login (antes em lib/login.js) ----------------
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

// ---------------- MODELOS DE CRONOGRAMA ----------------
// Estruturas prontas para não digitar o cronograma do zero. Cada modelo: macro-etapas com
// sub-etapas e duração em DIAS CORRIDOS. Ao aplicar, as etapas são encadeadas a partir da data
// de início (cada uma começa no dia seguinte ao fim da anterior). Os modelos criados pelos
// usuários ficam em Configurações (chave "modelos_cronograma") e somam-se a estes.
export const MODELOS_CRONOGRAMA_PADRAO = [
  { id: "padrao-automacao", nome: "Dispositivo / automação — completo", descricao: "Projeto, fabricação, try-out, instalação e entregas finais (modelo das obras de dispositivos e automação).", etapas: [
    { nome: "Reunião de KICK-OFF", dias: 1 },
    { nome: "PROJETO", subs: [{ nome: "Projeto Mecânico - 3D", dias: 15 }, { nome: "Projeto Mecânico - Detalhamento e lista de materiais", dias: 10 }, { nome: "Projeto Pneumático", dias: 7 }, { nome: "Projeto Elétrico", dias: 10 }, { nome: "SW off-line", dias: 10 }, { nome: "Apreciação de Riscos - Adequação NR-12", dias: 5 }, { nome: "Aprovação do projeto pelo cliente", dias: 5 }] },
    { nome: "SUPRIMENTOS", subs: [{ nome: "Compra de materiais e componentes", dias: 20 }, { nome: "Recebimento e conferência", dias: 5 }] },
    { nome: "FABRICAÇÃO / TRY-OUT INTERNO", subs: [{ nome: "Fabricação / usinagem", dias: 20 }, { nome: "Montagem mecânica", dias: 10 }, { nome: "Montagem elétrica e pneumática", dias: 7 }, { nome: "Try-out interno", dias: 5 }, { nome: "FAT - aceite na Contric", dias: 2 }] },
    { nome: "INSTALAÇÃO / COMISSIONAMENTO", subs: [{ nome: "Transporte", dias: 2 }, { nome: "Instalação no cliente", dias: 5 }, { nome: "Comissionamento", dias: 5 }, { nome: "Try-out / acompanhamento de produção", dias: 10 }, { nome: "SAT - aceite no cliente", dias: 1 }] },
    { nome: "ENTREGAS FINAIS (Documentação)", subs: [{ nome: "Data book e manuais", dias: 5 }, { nome: "Treinamento", dias: 2 }, { nome: "Encerramento do PI", dias: 1 }] },
  ] },
  { id: "padrao-montagem-campo", nome: "Montagem / instalação em campo", descricao: "Obra executada no cliente: mobilização, execução, comissionamento e desmobilização.", etapas: [
    { nome: "PLANEJAMENTO", subs: [{ nome: "Levantamento em campo", dias: 3 }, { nome: "Plano de trabalho e APR", dias: 3 }, { nome: "Liberação de acesso / integração de segurança", dias: 2 }] },
    { nome: "MOBILIZAÇÃO", subs: [{ nome: "Mobilização de equipe e ferramentas", dias: 2 }, { nome: "Canteiro e área de trabalho", dias: 2 }] },
    { nome: "EXECUÇÃO", subs: [{ nome: "Montagem mecânica", dias: 15 }, { nome: "Montagem elétrica", dias: 10 }, { nome: "Instrumentação e automação", dias: 7 }] },
    { nome: "COMISSIONAMENTO", subs: [{ nome: "Testes a frio", dias: 3 }, { nome: "Testes a quente / start-up", dias: 3 }, { nome: "Aceite do cliente", dias: 1 }] },
    { nome: "DESMOBILIZAÇÃO", subs: [{ nome: "Limpeza e desmobilização", dias: 2 }, { nome: "As built e documentação", dias: 5 }] },
  ] },
  { id: "padrao-retrofit", nome: "Retrofit de máquina / linha", descricao: "Diagnóstico, projeto, preparação, parada para execução e retomada da produção.", etapas: [
    { nome: "DIAGNÓSTICO", subs: [{ nome: "Levantamento técnico", dias: 5 }, { nome: "Relatório e proposta técnica", dias: 5 }] },
    { nome: "PROJETO", subs: [{ nome: "Projeto mecânico", dias: 10 }, { nome: "Projeto elétrico e software", dias: 10 }, { nome: "Aprovação do cliente", dias: 3 }] },
    { nome: "PREPARAÇÃO", subs: [{ nome: "Compra de materiais", dias: 15 }, { nome: "Pré-montagem na Contric", dias: 10 }] },
    { nome: "PARADA / EXECUÇÃO", subs: [{ nome: "Desmontagem", dias: 3 }, { nome: "Montagem do retrofit", dias: 7 }, { nome: "Testes e ajustes", dias: 3 }] },
    { nome: "RETOMADA", subs: [{ nome: "Acompanhamento de produção", dias: 5 }, { nome: "Treinamento e documentação", dias: 3 }] },
  ] },
  { id: "padrao-parada", nome: "Parada de manutenção programada", descricao: "Planejamento, preparação, execução da parada e encerramento.", etapas: [
    { nome: "PLANEJAMENTO DA PARADA", subs: [{ nome: "Escopo e lista de serviços", dias: 5 }, { nome: "Programação e recursos", dias: 3 }] },
    { nome: "PREPARAÇÃO", subs: [{ nome: "Materiais e peças", dias: 10 }, { nome: "Pré-fabricação", dias: 5 }] },
    { nome: "EXECUÇÃO", subs: [{ nome: "Bloqueios e liberação da área", dias: 1 }, { nome: "Serviços da parada", dias: 5 }, { nome: "Testes e liberação", dias: 1 }] },
    { nome: "ENCERRAMENTO", subs: [{ nome: "Relatório da parada", dias: 3 }] },
  ] },
  { id: "padrao-fases", nome: "Somente fases (estrutura enxuta)", descricao: "Cinco macro-etapas sem sub-etapas, para detalhar depois.", etapas: [
    { nome: "PROJETO", dias: 20 }, { nome: "SUPRIMENTOS", dias: 20 }, { nome: "FABRICAÇÃO", dias: 25 }, { nome: "INSTALAÇÃO", dias: 10 }, { nome: "ENTREGA", dias: 5 },
  ] },
];
// dias corridos totais de um modelo (do início da 1ª etapa ao fim da última)
export const duracaoModelo = (m) => (m?.etapas || []).reduce((s, e) => s + (e.subs?.length ? e.subs.reduce((a, x) => a + (Number(x.dias) || 1), 0) : Number(e.dias) || 1), 0);
// gera as linhas de etapas (macro e sub) a partir de uma data de início — ref/paiRef ligam a sub à macro
export function etapasDoModelo(modelo, inicioIso) {
  const linhas = [];
  let cursor = new Date(`${inicioIso}T12:00:00`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const avancar = (dias) => { const ini = new Date(cursor); const fim = new Date(cursor); fim.setDate(fim.getDate() + Math.max(1, Number(dias) || 1) - 1); cursor = new Date(fim); cursor.setDate(cursor.getDate() + 1); return [iso(ini), iso(fim)]; };
  (modelo?.etapas || []).forEach((m, i) => {
    const ref = `m${i}`;
    if (m.subs?.length) {
      const inicioMacro = iso(cursor);
      const subs = m.subs.map((s, k) => { const [a, b] = avancar(s.dias); return { ref: `${ref}s${k}`, paiRef: ref, nome: s.nome, inicio: a, fim: b, ordem: k }; });
      linhas.push({ ref, paiRef: null, nome: m.nome, inicio: inicioMacro, fim: subs[subs.length - 1].fim, ordem: i }, ...subs);
    } else {
      const [a, b] = avancar(m.dias);
      linhas.push({ ref, paiRef: null, nome: m.nome, inicio: a, fim: b, ordem: i });
    }
  });
  return linhas;
}
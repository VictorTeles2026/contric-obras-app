import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirPermissao, rotaSegura } from "../../../lib/authServidor";
import { AREAS } from "../../../lib/constantes";

// Assistente de cronograma por IA (texto ou voz transcrita).
// A IA só INTERPRETA o pedido e devolve uma lista de ações; nada é gravado aqui.
// A tela mostra a prévia e quem aplica é o próprio usuário (com as permissões dele).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELO = "claude-opus-5-5";

const SISTEMA = `Você é o assistente de cronogramas do SGO Contric (empresa de automação industrial e segurança NR12).
Recebe o cronograma atual de UM PI (projeto/obra) e um pedido em português, muitas vezes ditado por voz (pode ter erros de transcrição).
Converta o pedido em ações sobre as etapas. Regras do cronograma:
- Há macro-etapas (sem pai) e sub-etapas (com pai). Uma macro COM sub-etapas é calculada pelas subs: nunca altere datas, status ou % dela; altere as subs.
- Datas no formato AAAA-MM-DD. "Hoje" é informado no pedido. Durações em dias corridos, contando início e fim (5 dias a partir de 10/11 = 10/11 a 14/11).
- Quando o pedido disser "depois de X", a etapa começa no dia seguinte ao término de X e pode ganhar dependência de X.
- Status possíveis: nao_iniciada, em_andamento, concluida, parada. Percentual de 0 a 100.
- Responsável é texto livre (ex: "Contric", "CLIENTE / Contric", nome de pessoa).
- Para etapas que já existem, use o id delas em "ref". Para etapas novas, invente refs curtas ("nova1", "nova2") e use essas refs em pai_ref / depende_de_ref de outras ações.
- Ao "atrasar"/"adiar" uma etapa, mova início e fim mantendo a duração; se pedirem para empurrar as dependentes, inclua ações para elas também.
- Campos que não mudam: string vazia "" (ou -1 no percentual). Não invente dados que o pedido não traz; se faltar algo essencial, explique em "duvidas".
- Equipes: use SOMENTE nomes da lista "equipes" recebida (escreva exatamente igual). equipes_modo: "definir" (substitui), "adicionar", "remover" ou "" (não mexe).
- Alocação de recursos: use SOMENTE ids da lista "recursos" (procure pelo nome falado, mesmo com erro de transcrição). alocar_recursos = ids a alocar na etapa (período da etapa, 100% do dia); desalocar_recursos = ids a tirar. Listas vazias se não mexe.
- Alertas de prazo por e-mail: alertas_ref = "inicio" ou "fim" (de qual data contar), "remover" para tirar os alertas, ou "" (não mexe); alertas_dias = até 3 antecedências em dias (ex: [7,3,1]; 0 = no dia).
- Medição: medicao = "sim", "nao" ou "" (não mexe); medicao_percentual e medicao_valor (R$) = -1 se não muda.
- Se o pedido for só uma pergunta (ex: "o que está atrasado?"), não gere ações e responda em "resumo".
Responda sempre em português do Brasil.`;

const STR = { type: "string" };
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "acoes", "duvidas"],
  properties: {
    resumo: { type: "string", description: "Uma ou duas frases explicando o que será feito (ou a resposta, se for pergunta)." },
    duvidas: { type: "string", description: "O que ficou ambíguo ou faltou; vazio se nada." },
    acoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "ref", "pai_ref", "nome", "inicio", "fim", "status", "percentual", "responsavel", "depende_de_ref",
          "equipes_modo", "equipes", "alocar_recursos", "desalocar_recursos", "alertas_ref", "alertas_dias", "medicao", "medicao_percentual", "medicao_valor", "explicacao"],
        properties: {
          tipo: { type: "string", enum: ["criar_etapa", "alterar_etapa", "excluir_etapa", "criar_dependencia"] },
          ref: STR, pai_ref: STR, nome: STR, inicio: STR, fim: STR,
          status: { type: "string", enum: ["", "nao_iniciada", "em_andamento", "concluida", "parada"] },
          percentual: { type: "integer", description: "0 a 100, ou -1 se não muda" },
          responsavel: STR, depende_de_ref: STR,
          equipes_modo: { type: "string", enum: ["", "definir", "adicionar", "remover"] },
          equipes: { type: "array", items: STR },
          alocar_recursos: { type: "array", items: STR, description: "ids de recursos" },
          desalocar_recursos: { type: "array", items: STR, description: "ids de recursos" },
          alertas_ref: { type: "string", enum: ["", "inicio", "fim", "remover"] },
          alertas_dias: { type: "array", items: { type: "integer" } },
          medicao: { type: "string", enum: ["", "sim", "nao"] },
          medicao_percentual: { type: "number", description: "-1 se não muda" },
          medicao_valor: { type: "number", description: "R$; -1 se não muda" },
          explicacao: { type: "string", description: "Frase curta do que esta ação faz." },
        },
      },
    },
  },
};

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await exigirPermissao(req, ["etapa.editar", "pi.editar"]);
  if (resposta) return resposta;
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "A IA ainda não foi configurada: falta a variável ANTHROPIC_API_KEY na Vercel." }, { status: 400 });
  }
  const { piId, texto } = await req.json().catch(() => ({}));
  const pedido = String(texto || "").trim().slice(0, 4000);
  if (!piId || !pedido) return NextResponse.json({ error: "Diga ou escreva o que deseja fazer no cronograma." }, { status: 400 });

  const [{ data: pi }, { data: etapas }, { data: deps }, { data: recursos }, { data: alocs }, { data: cfgEquipes }] = await Promise.all([
    admin.from("pis").select("id,codigo,cliente,projeto").eq("id", piId).maybeSingle(),
    admin.from("etapas").select("*").eq("pi_id", piId),
    admin.from("etapa_dependencias").select("etapa_id,depende_de_etapa_id"),
    admin.from("recursos").select("id,nome,tipo,ativo,equipes"),
    admin.from("alocacoes_recurso").select("recurso_id,etapa_id").eq("pi_id", piId),
    admin.from("configuracoes").select("valor").eq("chave", "equipes").maybeSingle(),
  ]);
  const equipes = Array.isArray(cfgEquipes?.valor) && cfgEquipes.valor.length ? cfgEquipes.valor : AREAS;
  if (!pi) return NextResponse.json({ error: "PI não encontrado." }, { status: 404 });
  const ids = new Set((etapas || []).map((e) => e.id));
  const cronograma = (etapas || []).sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999)).map((e) => ({
    id: e.id, nome: e.nome, pai: e.parent_etapa_id, inicio: e.data_prevista_inicio, fim: e.data_prevista_fim,
    status: e.status, percentual: Number(e.percentual) || 0, responsavel: e.responsavel_texto || "",
    depende_de: (deps || []).filter((d) => d.etapa_id === e.id && ids.has(d.depende_de_etapa_id)).map((d) => d.depende_de_etapa_id),
    equipes: e.areas || [], recursos_alocados: [...new Set((alocs || []).filter((a) => a.etapa_id === e.id).map((a) => a.recurso_id))],
    alertas: e.alertas || null, medicao: !!e.medicao, medicao_percentual: e.medicao_percentual ?? null, medicao_valor: e.medicao_valor ?? null,
  }));
  const listaRecursos = (recursos || []).filter((r) => r.ativo !== false).map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, equipes: r.equipes || [] }));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const client = new Anthropic();
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      messages: [{
        role: "user",
        content: `Hoje: ${hoje}\nPI: ${pi.codigo} - ${pi.cliente || ""}${pi.projeto ? ` - ${pi.projeto}` : ""}\n\nEquipes cadastradas: ${JSON.stringify(equipes)}\n\nRecursos cadastrados (JSON): ${JSON.stringify(listaRecursos)}\n\nCronograma atual (JSON):\n${JSON.stringify(cronograma)}\n\nPedido do usuário:\n${pedido}`,
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Chave da IA inválida (ANTHROPIC_API_KEY)." }, { status: 400 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "A IA está ocupada no momento. Tente de novo em alguns segundos." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Erro da IA (${e.status}): ${e.message}` }, { status: 502 });
    throw e;
  }
  if (msg.stop_reason === "refusal") return NextResponse.json({ error: "A IA não conseguiu atender a este pedido. Reformule e tente de novo." }, { status: 400 });
  if (msg.stop_reason === "max_tokens") return NextResponse.json({ error: "O pedido gerou mudanças demais de uma vez. Divida em partes menores." }, { status: 400 });
  const texto2 = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let resultado;
  try { resultado = JSON.parse(texto2); } catch { return NextResponse.json({ error: "A resposta da IA veio incompleta. Tente de novo." }, { status: 502 }); }

  await admin.from("logs_auditoria").insert({ usuario_id: interno.id, usuario_nome: interno.nome, acao: "Usou assistente de IA no cronograma", detalhe: `${pi.codigo} — "${pedido.slice(0, 200)}" · ${resultado.acoes?.length || 0} ação(ões) sugerida(s)` });
  return NextResponse.json(resultado);
});

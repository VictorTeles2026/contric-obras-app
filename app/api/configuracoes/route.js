import { NextResponse } from "next/server";
import { identificar, rotaSegura } from "../../../lib/authServidor";

// Configurações estruturais — SOMENTE Master. Tudo vai para a Auditoria.
const CHAVES = ["equipes", "funcoes", "categorias_ocorrencia", "tipos_recurso", "unidades", "classificacoes_doc", "prazos", "feriados_extras", "status_etapa", "status_pi"];
const ROTULO = {
  equipes: "Equipes", funcoes: "Funções", categorias_ocorrencia: "Categorias de ocorrência", tipos_recurso: "Tipos de recurso",
  unidades: "Modos de apropriação", classificacoes_doc: "Classificações de documentos", prazos: "Prazos de alerta",
  feriados_extras: "Feriados adicionais", status_etapa: "Status das etapas", status_pi: "Status dos PIs",
};
const ausente = (e) => /does not exist|could not find|schema cache/i.test(e?.message || "");

export const POST = rotaSegura(async (req) => {
  const { admin, interno, resposta } = await identificar(req);
  if (resposta) return resposta;
  if (interno?.perfil !== "master") return NextResponse.json({ error: "Somente o Master altera as configurações." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const log = (acao, detalhe) => admin.from("logs_auditoria").insert({ usuario_id: interno.id, usuario_nome: interno.nome, acao, detalhe });
  const erroTabela = (e) => NextResponse.json({ error: /configuracoes/.test(e.message) ? "Rode o script configuracoes.sql no Supabase." : e.message }, { status: 400 });

  // ---- salvar uma lista/valor ----
  if (b.acao === "salvar") {
    if (!CHAVES.includes(b.chave) || b.valor === undefined) return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
    const { error } = await admin.from("configuracoes").upsert({ chave: b.chave, valor: b.valor, atualizado_por: interno.nome, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return erroTabela(error);
    await log("Alterou configuração", `${ROTULO[b.chave]}${b.resumo ? ` · ${b.resumo}` : ""}`);
    return NextResponse.json({ ok: true });
  }

  // ---- voltar ao padrão do sistema ----
  if (b.acao === "restaurar") {
    if (!CHAVES.includes(b.chave)) return NextResponse.json({ error: "Configuração inválida." }, { status: 400 });
    const { error } = await admin.from("configuracoes").delete().eq("chave", b.chave);
    if (error) return erroTabela(error);
    await log("Restaurou configuração padrão", ROTULO[b.chave]);
    return NextResponse.json({ ok: true });
  }

  // ---- renomear um item e atualizar os registros que já usam o nome antigo ----
  if (b.acao === "renomear") {
    const de = String(b.de || "").trim(), para = String(b.para || "").trim();
    if (!de || !para || de === para) return NextResponse.json({ error: "Informe o nome antigo e o novo." }, { status: 400 });
    let total = 0;
    const trocarEmArray = async (tabela, coluna) => {
      const { data, error } = await admin.from(tabela).select(`id, ${coluna}`).contains(coluna, [de]);
      if (error) { if (ausente(error)) return; throw new Error(`${tabela}: ${error.message}`); }
      for (const l of data || []) {
        const novo = [...new Set((l[coluna] || []).map((x) => (x === de ? para : x)))];
        await admin.from(tabela).update({ [coluna]: novo }).eq("id", l.id);
        total++;
      }
    };
    const trocarTexto = async (tabela, coluna) => {
      const { data, error } = await admin.from(tabela).update({ [coluna]: para }).eq(coluna, de).select("id");
      if (error) { if (ausente(error)) return; throw new Error(`${tabela}: ${error.message}`); }
      total += (data || []).length;
    };
    if (b.lista === "equipes") {
      await trocarEmArray("usuarios", "equipes");
      await trocarEmArray("recursos", "equipes");
      await trocarEmArray("etapas", "areas");
    } else if (b.lista === "funcoes") {
      await trocarTexto("usuarios", "funcao");
      const { data: recs } = await admin.from("recursos").select("id, atributos");
      for (const r of (recs || []).filter((x) => x.atributos?.funcao === de)) {
        await admin.from("recursos").update({ atributos: { ...r.atributos, funcao: para } }).eq("id", r.id);
        total++;
      }
    } else if (b.lista === "categorias_ocorrencia") {
      await trocarTexto("ocorrencias", "categoria");
    } else {
      return NextResponse.json({ error: "Lista inválida." }, { status: 400 });
    }
    await log("Renomeou item de configuração", `${ROTULO[b.lista]}: "${de}" → "${para}" · ${total} registro(s) atualizado(s)`);
    return NextResponse.json({ ok: true, total });
  }

  // ---- categorias de orçamento (tabela própria) ----
  if (b.acao === "categoria_salvar") {
    const c = b.categoria || {};
    const linha = { codigo: String(c.codigo || "").trim().toUpperCase(), nome: String(c.nome || "").trim(), grupo: c.grupo, ordem: c.ordem === "" || c.ordem == null ? null : Number(c.ordem), ativo: c.ativo !== false };
    if (!linha.codigo || !linha.nome || !["compra_reais", "moi_horas"].includes(linha.grupo)) return NextResponse.json({ error: "Informe código, nome e grupo." }, { status: 400 });
    const { error } = c.id
      ? await admin.from("categorias_orcamento").update(linha).eq("id", c.id)
      : await admin.from("categorias_orcamento").insert(linha);
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? `Já existe a categoria ${linha.codigo}.` : error.message }, { status: 400 });
    await log(c.id ? "Editou categoria de orçamento" : "Criou categoria de orçamento", `${linha.codigo} — ${linha.nome}${linha.ativo ? "" : " (desativada)"}`);
    return NextResponse.json({ ok: true });
  }
  if (b.acao === "categoria_excluir") {
    const { count } = await admin.from("orcamento_pi_item").select("id", { count: "exact", head: true }).eq("categoria_id", b.id);
    if (count) return NextResponse.json({ error: `Esta categoria já tem valores em ${count} PI(s). Desative em vez de excluir.` }, { status: 400 });
    const { data: cat } = await admin.from("categorias_orcamento").select("codigo, nome").eq("id", b.id).maybeSingle();
    const { error } = await admin.from("categorias_orcamento").delete().eq("id", b.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await log("Excluiu categoria de orçamento", `${cat?.codigo} — ${cat?.nome}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
});

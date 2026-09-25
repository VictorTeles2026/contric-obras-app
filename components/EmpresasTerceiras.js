"use client";

import { useRef, useState } from "react";
import { registrarLog } from "../lib/dados";
import { supabase } from "../lib/supabase";
import { BUCKET_DOCUMENTOS, linkTemporario } from "../lib/pdfRdo";
import { diasAte, formatarData } from "../lib/datas";
import { useToast } from "../lib/Toast";
import { ConfirmarExclusao } from "./AcoesMaster";
import { Modal, Campo, Aviso, EstadoVazio, Esqueleto, Spinner } from "./ui";
import Icone from "./Icone";

// ---- CNPJ: máscara e dígitos verificadores ----
export function mascaraCnpj(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
export function cnpjValido(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(d.slice(0, 12)) === Number(d[12]) && calc(d.slice(0, 13)) === Number(d[13]);
}
const limparNome = (t) => String(t || "EMPRESA").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase() || "EMPRESA";

function SeloValidade({ validade }) {
  if (!validade) return <span className="selo bg-panel text-muted">sem validade</span>;
  const d = diasAte(validade);
  if (d < 0) return <span className="selo bg-red/10 text-red">vencido há {Math.abs(d)}d</span>;
  if (d <= 30) return <span className="selo bg-amber/10 text-amber">vence em {d}d</span>;
  return <span className="selo bg-green/10 text-green">válido</span>;
}

export default function EmpresasTerceiras({ empresas, carregando, recursos, editavel, usuario, onMudou, erroTabela }) {
  const { avisar } = useToast();
  const [editando, setEditando] = useState(null); // objeto (edição) | {} (nova) | null
  const [excluindo, setExcluindo] = useState(null);
  const [busca, setBusca] = useState("");
  const [mostrarInativas, setMostrarInativas] = useState(true);
  const [alternando, setAlternando] = useState(null);

  const termo = busca.trim().toLowerCase();
  const lista = empresas
    .filter((e) => (mostrarInativas || e.ativa) && (!termo || `${e.nome} ${e.cnpj || ""}`.toLowerCase().includes(termo)))
    .sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome));
  const qtdRecursos = (id) => recursos.filter((r) => r.empresa_terceira_id === id).length;

  const abrirContrato = async (e) => {
    const aba = window.open("", "_blank");
    try { const url = await linkTemporario(e.contrato_path); if (aba) aba.location.href = url; else window.location.href = url; }
    catch (err) { aba?.close(); avisar(`Não foi possível abrir o contrato: ${err.message}`, "erro"); }
  };

  const alternarAtiva = async (e) => {
    setAlternando(e.id);
    const { error } = await supabase.from("empresas_terceiras").update({ ativa: !e.ativa }).eq("id", e.id);
    setAlternando(null);
    if (error) { avisar(`Não foi possível alterar: ${error.message}`, "erro"); return; }
    await registrarLog(usuario, e.ativa ? "Inativou empresa terceira" : "Ativou empresa terceira", `${e.nome}${e.cnpj ? ` (${e.cnpj})` : ""}`);
    avisar(e.ativa ? `${e.nome} inativada — não aparece mais para novos recursos.` : `${e.nome} ativada.`, "info");
    onMudou();
  };

  const excluir = async (e, motivo) => {
    const { error } = await supabase.from("empresas_terceiras").delete().eq("id", e.id);
    if (error) return { erro: error.message };
    if (e.contrato_path) await supabase.storage.from(BUCKET_DOCUMENTOS).remove([e.contrato_path]);
    await registrarLog(usuario, "Excluiu empresa terceira", `${e.nome}${e.cnpj ? ` (${e.cnpj})` : ""} · ${qtdRecursos(e.id)} recurso(s) desvinculado(s)${motivo ? ` · motivo: ${motivo}` : ""}`);
    avisar("Empresa excluída — registrado na Auditoria.", "info");
    onMudou();
    return { ok: true };
  };

  return (
    <div className="max-w-5xl">
      {erroTabela && (
        <Aviso tipo="erro" className="mb-4">O banco ainda não tem o cadastro de empresas. Rode o script <strong>empresas-terceiras.sql</strong> no SQL Editor do Supabase.</Aviso>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CNPJ" className="input pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap cursor-pointer px-1">
          <input type="checkbox" className="accent-cyan w-4 h-4" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} /> Mostrar inativas
        </label>
        {editavel && <button onClick={() => setEditando({})} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Nova empresa</button>}
      </div>

      {carregando && <Esqueleto linhas={3} altura={72} />}
      {!carregando && lista.length === 0 && (
        <EstadoVazio icone="usuarios" titulo="Nenhuma empresa" texto={empresas.length ? "Nada encontrado." : "Cadastre as empresas terceiras para vincular à mão de obra terceira."} />
      )}

      <div className="flex flex-col gap-2">
        {lista.map((e) => (
          <div key={e.id} className={`cartao p-4 flex flex-col md:flex-row md:items-center gap-3 ${e.ativa ? "" : "opacity-60"}`}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex flex-wrap items-center gap-2">
                {e.nome}
                <span className={`selo ${e.ativa ? "bg-green/10 text-green" : "bg-panel text-muted"}`}>{e.ativa ? "Ativa" : "Inativa"}</span>
              </div>
              <div className="text-sm text-muted font-mono">{e.cnpj || "CNPJ não informado"}</div>
              <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-2">
                <span>Validade do contrato: <strong className="text-textmain">{e.validade_contrato ? formatarData(e.validade_contrato) : "—"}</strong></span>
                <SeloValidade validade={e.validade_contrato} />
                <span>· {qtdRecursos(e.id)} recurso(s)</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {e.contrato_path
                ? <button onClick={() => abrirContrato(e)} className="btn btn-contorno btn-sm"><Icone nome="pdf" className="w-4 h-4" /> Contrato</button>
                : <span className="text-xs text-muteddim">sem contrato anexado</span>}
              {editavel && (
                <>
                  <button onClick={() => setEditando(e)} className="btn btn-contorno btn-sm"><Icone nome="editar" className="w-4 h-4" /> Editar</button>
                  <button onClick={() => alternarAtiva(e)} disabled={alternando === e.id}
                    className={`btn btn-sm border ${e.ativa ? "border-amber/40 text-amber bg-white hover:bg-amber/5" : "border-green/40 text-green bg-white hover:bg-green/5"}`}>
                    {alternando === e.id ? <Spinner className="w-3.5 h-3.5" /> : e.ativa ? "Inativar" : "Ativar"}
                  </button>
                  <button onClick={() => setExcluindo(e)} className="btn btn-contorno-perigo btn-sm"><Icone nome="lixo" className="w-4 h-4" /> Excluir</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {editando && <FormEmpresa inicial={editando} usuario={usuario} onFechar={() => setEditando(null)} onSalvo={onMudou} />}
      {excluindo && (
        <ConfirmarExclusao titulo={`Excluir ${excluindo.nome}`}
          descricao={`A empresa e o PDF do contrato serão apagados.${qtdRecursos(excluindo.id) ? ` ${qtdRecursos(excluindo.id)} recurso(s) ficarão sem empresa vinculada.` : ""} Se ela só deixou de prestar serviço, prefira "Inativar".`}
          onFechar={() => setExcluindo(null)} onConfirmar={(motivo) => excluir(excluindo, motivo)} />
      )}
    </div>
  );
}

function FormEmpresa({ inicial, usuario, onFechar, onSalvo }) {
  const { avisar } = useToast();
  const novo = !inicial.id;
  const [nome, setNome] = useState(inicial.nome || "");
  const [cnpj, setCnpj] = useState(inicial.cnpj || "");
  const [validade, setValidade] = useState(inicial.validade_contrato || "");
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef(null);
  const cnpjDigitos = cnpj.replace(/\D/g, "");
  const cnpjOk = !cnpjDigitos || cnpjValido(cnpj);
  const pode = nome.trim() && cnpjOk && !salvando;

  const salvar = async () => {
    setSalvando(true); setErro("");
    const dados = { nome: nome.trim(), cnpj: cnpjDigitos ? mascaraCnpj(cnpj) : null, validade_contrato: validade || null };
    let registro = inicial;
    if (novo) {
      const { data, error } = await supabase.from("empresas_terceiras").insert({ ...dados, ativa: true }).select().single();
      if (error) { setSalvando(false); setErro(error.message); return; }
      registro = data;
    } else {
      const { error } = await supabase.from("empresas_terceiras").update(dados).eq("id", inicial.id);
      if (error) { setSalvando(false); setErro(error.message); return; }
    }
    if (arquivo) {
      const caminho = `empresas/${registro.id}/CONTRATO_${limparNome(dados.nome)}.pdf`;
      const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(caminho, arquivo, { upsert: true, contentType: "application/pdf" });
      if (error) { setSalvando(false); setErro(`Empresa salva, mas o contrato não foi enviado: ${error.message}`); onSalvo(); return; }
      if (inicial.contrato_path && inicial.contrato_path !== caminho) await supabase.storage.from(BUCKET_DOCUMENTOS).remove([inicial.contrato_path]);
      await supabase.from("empresas_terceiras").update({ contrato_path: caminho, contrato_nome: arquivo.name }).eq("id", registro.id);
    }
    await registrarLog(usuario, novo ? "Cadastrou empresa terceira" : "Editou empresa terceira",
      `${dados.nome}${dados.cnpj ? ` (${dados.cnpj})` : ""}${dados.validade_contrato ? ` · validade ${formatarData(dados.validade_contrato)}` : ""}${arquivo ? " · contrato anexado" : ""}`);
    setSalvando(false);
    avisar(novo ? "Empresa cadastrada." : "Empresa atualizada.");
    onSalvo(); onFechar();
  };

  return (
    <Modal titulo={novo ? "Nova empresa terceira" : `Editar — ${inicial.nome}`} onFechar={onFechar} largura="max-w-md"
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma" disabled={salvando}>Cancelar</button>
        <button onClick={salvar} disabled={!pode} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : novo ? "Cadastrar" : "Salvar alterações"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome / razão social"><input value={nome} onChange={(e) => setNome(e.target.value)} className="input" autoFocus /></Campo>
        <Campo rotulo="CNPJ">
          <input value={mascaraCnpj(cnpj)} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00"
            className={`input font-mono ${cnpjOk ? "" : "!border-red"}`} />
          {!cnpjOk && <span className="block text-xs text-red mt-1">CNPJ inválido — confira os números.</span>}
        </Campo>
        <Campo rotulo="Validade do contrato"><input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="input" /></Campo>
        <div>
          <span className="rotulo">Contrato (PDF)</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="btn btn-contorno btn-sm"><Icone nome="upload" className="w-4 h-4" /> {inicial.contrato_path || arquivo ? "Trocar PDF" : "Anexar PDF"}</button>
            <span className="text-sm text-muted truncate">{arquivo ? arquivo.name : inicial.contrato_nome || (inicial.contrato_path ? "contrato anexado" : "nenhum arquivo")}</span>
          </div>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              if (f.type && f.type !== "application/pdf") { setErro("O contrato precisa ser um arquivo PDF."); return; }
              if (f.size > 20 * 1024 * 1024) { setErro("PDF muito grande (máx. 20 MB)."); return; }
              setErro(""); setArquivo(f);
            }} />
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

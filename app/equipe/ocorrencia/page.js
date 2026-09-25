"use client";

import { useState } from "react";
import { registrarLog, useTabela, gravarTolerante } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { useMinhasPis, agruparPorCliente } from "../../../lib/minhasPis";
import { NAV_EQUIPE } from "../../../lib/nav";
import { CATEGORIAS_OCORRENCIA } from "../../../lib/constantes";
import { formatarDataHora } from "../../../lib/datas";
import { gerarPdfOcorrenciaSeguro } from "../../../lib/pdfRdo";
import { useToast } from "../../../lib/Toast";
import MobileShell from "../../../components/MobileShell";
import CapturaMidia from "../../../components/CapturaMidia";
import ColetaAssinatura, { assinaturaValida, faltaNaAssinatura } from "../../../components/ColetaAssinatura";
import { EditorOcorrencia } from "../../../components/Editores";
import { Esqueleto, EstadoVazio, Spinner } from "../../../components/ui";
import Icone from "../../../components/Icone";

const COR = { pendente: "bg-amber/10 text-amber", aprovada: "bg-green/10 text-green", rejeitada: "bg-red/10 text-red" };
const ROTULO = { pendente: "Aguardando aprovação", aprovada: "Aprovada", rejeitada: "Reprovada" };
const ASSINATURA_VAZIA = { ativo: false, nome: "", imagem: null };

export default function EquipeOcorrenciaPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { meusPis, todosPis, carregando } = useMinhasPis(usuario);
  const porCliente = agruparPorCliente(meusPis);
  const { dados: minhasOcorrencias, recarregar } = useTabela("ocorrencias", {
    order: { coluna: "created_at", asc: false }, filtro: [["registrado_por", usuario?.id]],
  });

  const [piIdEscolhido, setPiId] = useState("");
  const piId = piIdEscolhido || (meusPis.length === 1 ? meusPis[0].id : "");
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState("");
  const [midias, setMidias] = useState([]);
  const [assinatura, setAssinatura] = useState(ASSINATURA_VAZIA);
  const [enviando, setEnviando] = useState("");
  const [editando, setEditando] = useState(null);

  const podeEnviar = piId && categoria && assinaturaValida(assinatura) && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando("Enviando...");
    const { data: oc, error } = await gravarTolerante({
      pi_id: piId, categoria, descricao: descricao.trim() || null, midias, registrado_por: usuario.id, status: "pendente",
      assinatura_cliente: assinatura.ativo, assinatura_cliente_imagem: assinatura.ativo ? assinatura.imagem : null,
      assinatura_cliente_nome: assinatura.ativo ? assinatura.nome.trim() : null,
    }, (d) => supabase.from("ocorrencias").insert(d).select().single());
    if (error) { setEnviando(""); avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Registrou ocorrência", `${categoria} — ${meusPis.find((p) => p.id === piId)?.codigo}`);
    setEnviando("Gerando PDF...");
    await gerarPdfOcorrenciaSeguro(oc.id, avisar);
    setEnviando("");
    setCategoria(null); setDescricao(""); setMidias([]); setAssinatura(ASSINATURA_VAZIA);
    avisar("Ocorrência enviada para aprovação.");
    recarregar();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const codigoPi = (id) => todosPis.find((p) => p.id === id)?.codigo;

  return (
    <MobileShell nav={NAV_EQUIPE} perfis={["funcionario", "terceiro"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="pt-1">
          <div className="font-head font-bold text-2xl">Registrar ocorrência</div>
          <p className="text-sm text-muted mt-1">Atrasos, retrabalho, problemas com o cliente — registre com foto se puder. O líder ou o coordenador aprova.</p>
        </div>

        {carregando ? <Esqueleto linhas={2} altura={140} /> : meusPis.length === 0 ? (
          <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você ainda não está alocado em nenhuma obra." /></div>
        ) : (
          <>
            <div className="cartao p-4 flex flex-col gap-4">
              <label className="block">
                <span className="rotulo">Obra</span>
                <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input input-lg">
                  <option value="">Selecione...</option>
                  {porCliente.map(([cliente, pisDoCliente]) => (
                    <optgroup key={cliente} label={cliente}>
                      {pisDoCliente.map((p) => <option key={p.id} value={p.id}>{p.codigo}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div>
                <span className="rotulo">Tipo</span>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIAS_OCORRENCIA.map((c) => (
                    <button key={c} type="button" onClick={() => setCategoria(c)} aria-pressed={categoria === c}
                      className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-colors ${categoria === c ? "bg-amber text-white border-amber" : "border-line text-muted bg-white"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="rotulo">Descrição (opcional)</span>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="input input-lg" placeholder="O que aconteceu?" />
              </label>
              <div>
                <span className="rotulo">Foto ou vídeo (opcional)</span>
                <CapturaMidia value={midias} onChange={setMidias} />
              </div>
            </div>

            <ColetaAssinatura value={assinatura} onChange={setAssinatura} />

            <div>
              <button onClick={enviar} disabled={!podeEnviar} className="btn btn-alerta btn-lg w-full">
                {enviando ? <><Spinner /> {enviando}</> : "Enviar ocorrência para aprovação"}
              </button>
              {(!piId || !categoria) && <div className="text-xs text-center text-muteddim mt-1.5">Escolha a obra e o tipo.</div>}
              {faltaNaAssinatura(assinatura) && <div className="text-xs text-center text-amber font-semibold mt-1.5">{faltaNaAssinatura(assinatura)}</div>}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="titulo-secao">Minhas ocorrências</div>
          {minhasOcorrencias.filter((o) => !o.rdo_id).slice(0, 20).map((o) => {
            const st = o.status || "aprovada";
            return (
              <div key={o.id} className="cartao p-4 text-base">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-amber font-semibold">{o.categoria}</span>
                    <div className="text-xs text-muteddim">{codigoPi(o.pi_id)} · {formatarDataHora(o.created_at)}</div>
                  </div>
                  <span className={`selo shrink-0 ${COR[st] || "bg-panel text-muted"}`}>{ROTULO[st] || st}</span>
                </div>
                {o.descricao && <div className="text-sm text-muted mt-1">{o.descricao}</div>}
                {o.midias?.length > 0 && <div className="text-sm text-muteddim mt-1">📎 {o.midias.length} anexo(s)</div>}
                {o.assinatura_cliente && <div className="text-sm text-muteddim mt-1">✍ Assinada por {o.assinatura_cliente_nome || "cliente"}</div>}
                {st === "rejeitada" && o.motivo_rejeicao && <div className="text-sm text-red bg-red/5 rounded-lg px-3 py-2 mt-2">Motivo: {o.motivo_rejeicao}</div>}
                {st === "pendente" && (
                  <button onClick={() => setEditando(o)} className="btn btn-contorno btn-sm w-full mt-2.5">
                    <Icone nome="editar" className="w-4 h-4" /> Editar (até ser aprovada)
                  </button>
                )}
              </div>
            );
          })}
          {minhasOcorrencias.length === 0 && <div className="text-sm text-muteddim">Nenhuma ocorrência ainda.</div>}
        </div>
      </div>
      {editando && <EditorOcorrencia oc={editando} pis={todosPis} comoAprovador={false} onFechar={() => setEditando(null)} onSalvo={recarregar} />}
    </MobileShell>
  );
}

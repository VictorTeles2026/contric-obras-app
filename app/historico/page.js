"use client";

import { useState } from "react";
import { useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { formatarData, formatarDataHora, formatarHoras } from "../../lib/datas";
import { STATUS_ETAPA } from "../../lib/constantes";
import { excluirRdo, excluirHoras, excluirOcorrencia } from "../../lib/exclusoes";
import { supabase } from "../../lib/supabase";
import PainelShell from "../../components/PainelShell";
import AcoesMaster from "../../components/AcoesMaster";
import { EditorRdo, EditorHoras, EditorOcorrencia } from "../../components/Editores";
import { CabecalhoPagina, EstadoVazio, Esqueleto } from "../../components/ui";
import Icone from "../../components/Icone";

const POR_PAGINA = 30;
const ICONE = { rdo: "rdo", horas: "relogio", ocorrencia: "alerta" };
const COR = { rdo: "bg-cyan/10 text-cyan", horas: "bg-amber/10 text-amber", ocorrencia: "bg-[#8E5CD9]/10 text-[#8E5CD9]" };
const TITULO = { rdo: "RDO", horas: "Horas", ocorrencia: "Ocorrência" };

export default function HistoricoPage() {
  const { usuario } = useAuth();
  const { dados: pis } = useTabela("pis");
  const { dados: usuarios } = useTabela("usuarios");
  const { dados: rdosTodos, carregando: c1, recarregar: rRdos } = useTabela("rdos", { order: { coluna: "created_at", asc: false } });
  const { dados: horasTodas, carregando: c2, recarregar: rHoras } = useTabela("apontamentos_horas", { order: { coluna: "created_at", asc: false } });
  const { dados: ocorrencias, recarregar: rOc } = useTabela("ocorrencias", { order: { coluna: "created_at", asc: false } });

  const [filtro, setFiltro] = useState("");
  const [filtroPi, setFiltroPi] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [editando, setEditando] = useState(null); // { tipo, item, ocorrencias? }
  const piDe = (id) => pis.find((p) => p.id === id);
  const pessoa = (id) => usuarios.find((u) => u.id === id);
  const nomeUsuario = (id) => pessoa(id)?.nome || "—";
  const recarregarTudo = () => { rRdos(); rHoras(); rOc(); };

  const decididos = (s) => s && s !== "pendente";
  const registros = [
    ...rdosTodos.filter((r) => decididos(r.status)).map((r) => ({ tipo: "rdo", ...r })),
    ...horasTodas.filter((h) => decididos(h.status)).map((h) => ({ tipo: "horas", ...h })),
    ...ocorrencias.filter((o) => !o.rdo_id && o.status && decididos(o.status)).map((o) => ({ tipo: "ocorrencia", ...o })),
  ].filter((r) => (!filtro || r.tipo === filtro) && (!filtroPi || r.pi_id === filtroPi))
    .sort((a, b) => new Date(b.decidido_em || b.created_at) - new Date(a.decidido_em || a.created_at));

  const abrirEdicao = async (r) => {
    if (r.tipo === "rdo") {
      const { data } = await supabase.from("ocorrencias").select("*").eq("rdo_id", r.id);
      setEditando({ tipo: "rdo", item: r, ocorrencias: data || [] });
    } else setEditando({ tipo: r.tipo, item: r });
  };
  const excluir = (r) => (motivo) => {
    const pi = piDe(r.pi_id);
    if (r.tipo === "rdo") return excluirRdo({ rdo: r, pi, usuario, motivo });
    if (r.tipo === "horas") return excluirHoras({ registro: r, pi, pessoa: pessoa(r.usuario_id), usuario, motivo });
    return excluirOcorrencia({ oc: r, pi, usuario, motivo });
  };
  const autor = (r) => (r.tipo === "rdo" ? r.lider_id : r.tipo === "horas" ? r.usuario_id : r.registrado_por);
  const aprovado = (s) => s === "aprovado" || s === "aprovada";

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-4xl mx-auto">
        <CabecalhoPagina titulo="Histórico" subtitulo="Tudo o que já foi decidido — RDOs, horas e ocorrências." />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {[["", "Todos"], ["rdo", "RDOs"], ["horas", "Horas"], ["ocorrencia", "Ocorrências"]].map(([v, l]) => (
            <button key={v} onClick={() => { setFiltro(v); setLimite(POR_PAGINA); }} className={`chip ${filtro === v ? "chip-ativo" : ""}`}>{l}</button>
          ))}
          <select value={filtroPi} onChange={(e) => { setFiltroPi(e.target.value); setLimite(POR_PAGINA); }} className="input !w-auto sm:ml-auto">
            <option value="">Todos os PIs</option>
            {[...pis].sort((a, b) => (a.codigo || "").localeCompare(b.codigo || "")).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}</option>)}
          </select>
        </div>

        {(c1 || c2) && <Esqueleto linhas={4} altura={72} />}
        {!c1 && !c2 && registros.length === 0 && <EstadoVazio icone="historico" titulo="Nada por aqui" texto="Nenhum registro decidido com esses filtros." />}

        <div className="flex flex-col gap-2">
          {registros.slice(0, limite).map((r) => (
            <div key={r.tipo + r.id} className="cartao p-4">
              <div className="flex justify-between items-start gap-3 mb-1">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${COR[r.tipo]}`}>
                    <Icone nome={ICONE[r.tipo]} className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      <span className="font-mono text-cyan">{piDe(r.pi_id)?.codigo || "?"}</span> · {TITULO[r.tipo]} de {nomeUsuario(autor(r))}
                    </div>
                    <div className="text-xs text-muted">
                      {r.tipo === "ocorrencia" ? formatarDataHora(r.created_at) : formatarData(r.data)} · decidido por {nomeUsuario(r.decidido_por)}{r.decidido_em ? ` em ${formatarDataHora(r.decidido_em)}` : ""}
                      {r.editado_por ? ` · editado por ${nomeUsuario(r.editado_por)}` : ""}
                    </div>
                  </div>
                </div>
                <span className={`selo shrink-0 ${aprovado(r.status) ? "text-green bg-green/10" : "text-red bg-red/10"}`}>{aprovado(r.status) ? "Aprovado" : "Reprovado"}</span>
              </div>
              {r.tipo === "rdo" && (r.atividades || []).length > 0 && (
                <div className="mt-2 pl-12 flex flex-col gap-0.5">
                  {(r.atividades || []).map((a, i) => (
                    <div key={i} className="flex justify-between gap-2 text-xs py-0.5">
                      <span className="truncate">{a.nome}</span>
                      <span className="text-muted shrink-0">{STATUS_ETAPA[a.status]?.rotulo || a.status}{a.status === "em_andamento" ? ` · ${a.percentual}%` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {r.tipo === "horas" && (
                <div className="text-sm text-muted pl-12 mt-1">
                  {formatarHoras(r.horas_normais ?? r.horas_totais)} normais{Number(r.horas_extras) > 0 ? ` + ${formatarHoras(r.horas_extras)} extras` : ""}
                </div>
              )}
              {r.tipo === "ocorrencia" && (
                <div className="text-sm pl-12 mt-1"><span className="text-amber font-semibold">{r.categoria}</span>{r.descricao ? <span className="text-muted"> — {r.descricao}</span> : ""}</div>
              )}
              {r.motivo_rejeicao && <div className="text-xs text-red mt-2 pl-12">Motivo: {r.motivo_rejeicao}</div>}
              <div className="flex justify-end mt-2">
                <AcoesMaster onEditar={() => abrirEdicao(r)} excluir={excluir(r)} onExcluido={recarregarTudo}
                  tituloExclusao={`Excluir ${TITULO[r.tipo].toLowerCase()}`}
                  descricaoExclusao={r.tipo === "rdo" ? "O RDO, as ocorrências registradas nele e o PDF serão apagados." : r.tipo === "ocorrencia" ? "A ocorrência e o PDF serão apagados." : "O lançamento de horas será apagado."} />
              </div>
            </div>
          ))}
        </div>
        {registros.length > limite && (
          <button onClick={() => setLimite((l) => l + POR_PAGINA)} className="btn btn-contorno w-full mt-4">
            Mostrar mais ({registros.length - limite} restantes)
          </button>
        )}
      </div>

      {editando?.tipo === "rdo" && (
        <EditorRdo rdo={editando.item} pi={piDe(editando.item.pi_id)} pis={pis} comoAprovador ocorrenciasOriginais={editando.ocorrencias}
          onFechar={() => setEditando(null)} onSalvo={recarregarTudo} />
      )}
      {editando?.tipo === "horas" && <EditorHoras registro={editando.item} pis={pis} comoAprovador onFechar={() => setEditando(null)} onSalvo={recarregarTudo} />}
      {editando?.tipo === "ocorrencia" && <EditorOcorrencia oc={editando.item} pis={pis} comoAprovador onFechar={() => setEditando(null)} onSalvo={recarregarTudo} />}
    </PainelShell>
  );
}

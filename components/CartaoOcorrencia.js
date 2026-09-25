"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useToast } from "../lib/Toast";
import { decidirOcorrencia } from "../lib/edicoes";
import { formatarDataHora } from "../lib/datas";
import { EditorOcorrencia } from "./Editores";
import { Spinner } from "./ui";
import Icone from "./Icone";

// Ocorrência aguardando aprovação: Aprovar · Editar · Reprovar (motivo obrigatório).
// Usado pelo líder (celular) e pelo coordenador/gerente (Aprovações, no painel).
export default function CartaoOcorrencia({ oc, pi, pessoa, pis, podeDecidir = true, compacto = false, onMudou }) {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const [editando, setEditando] = useState(false);
  const [reprovando, setReprovando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [verAssinatura, setVerAssinatura] = useState(false);

  const decidir = async (aprovar) => {
    setOcupado(true);
    const r = await decidirOcorrencia({ oc, aprovar, motivo: motivo.trim(), pis, usuario, avisar });
    setOcupado(false);
    if (r.erro) { avisar(r.erro, "erro", 6000); onMudou?.(); return; }
    avisar(aprovar ? "Ocorrência aprovada." : "Ocorrência reprovada — quem registrou foi notificado.", aprovar ? "sucesso" : "info");
    setReprovando(false); setMotivo("");
    onMudou?.();
  };

  const botao = compacto ? "btn btn-sm" : "btn";
  return (
    <div className="cartao p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold"><span className="font-mono text-cyan">{pi?.codigo || "?"}</span> · {pi?.cliente || "—"}</div>
          <div className="text-xs text-muted">por <strong>{pessoa?.nome || "—"}</strong>{pessoa?.funcao ? ` (${pessoa.funcao})` : ""} · {formatarDataHora(oc.created_at)}</div>
        </div>
        <span className="selo bg-amber/10 text-amber shrink-0">Pendente</span>
      </div>
      <div className="mt-2 text-sm"><span className="text-amber font-semibold">{oc.categoria}</span>{oc.descricao ? ` — ${oc.descricao}` : ""}</div>
      {oc.midias?.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {oc.midias.map((m) => (
            <a key={m.url} href={m.url} target="_blank" rel="noreferrer">
              {m.tipo === "foto"
                ? <img src={m.url} alt={m.nome || "foto"} className="w-16 h-16 object-cover rounded-lg border border-line" />
                : <span className="w-16 h-16 rounded-lg border border-line bg-panel flex items-center justify-center text-muted"><Icone nome="video" className="w-6 h-6" /></span>}
            </a>
          ))}
        </div>
      )}
      {oc.assinatura_cliente && oc.assinatura_cliente_imagem && (
        <div className="mt-2 text-sm">
          <button onClick={() => setVerAssinatura((v) => !v)} className="text-cyan font-semibold hover:underline py-1">
            ✓ Assinada por {oc.assinatura_cliente_nome || "cliente"} — {verAssinatura ? "ocultar" : "ver"}
          </button>
          {verAssinatura && <img src={oc.assinatura_cliente_imagem} alt="Assinatura do cliente" className="mt-1 max-h-28 border border-line rounded-lg bg-white" />}
        </div>
      )}

      {reprovando ? (
        <div className="mt-3 rounded-xl border border-red/30 bg-red/5 p-3 flex flex-col gap-2">
          <span className="rotulo !text-red !mb-0">Explique o motivo da reprovação</span>
          <textarea autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Quem registrou receberá esta explicação." />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setReprovando(false); setMotivo(""); }} className={`${botao} btn-fantasma`} disabled={ocupado}>Cancelar</button>
            <button onClick={() => decidir(false)} disabled={!motivo.trim() || ocupado} className={`${botao} btn-perigo`}>{ocupado ? <Spinner /> : "Confirmar reprovação"}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <button onClick={() => decidir(true)} disabled={!podeDecidir || ocupado} className={`${botao} btn-sucesso`}>
            {ocupado ? <Spinner /> : <Icone nome="aprovar" className="w-4 h-4" strokeWidth={2.4} />} Aprovar
          </button>
          <button onClick={() => setEditando(true)} disabled={!podeDecidir || ocupado} className={`${botao} btn-contorno`}><Icone nome="editar" className="w-4 h-4" /> Editar</button>
          <button onClick={() => setReprovando(true)} disabled={!podeDecidir || ocupado} className={`${botao} btn-contorno-perigo`}><Icone nome="fechar" className="w-4 h-4" /> Reprovar</button>
        </div>
      )}
      {editando && <EditorOcorrencia oc={oc} pis={pis} comoAprovador onFechar={() => setEditando(false)} onSalvo={onMudou} />}
    </div>
  );
}

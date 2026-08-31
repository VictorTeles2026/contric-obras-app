"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeEditar } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import PainelShell from "../../components/PainelShell";

export default function AprovacoesPage() {
  const { usuario } = useAuth();
  const editavel = podeEditar(usuario);
  const { dados: pis } = useTabela("pis");
  const { dados: rdosTodos, recarregar: recarregarRdos } = useTabela("rdos", { order: { coluna: "created_at" } });
  const { dados: horasTodas, recarregar: recarregarHoras } = useTabela("apontamentos_horas", { order: { coluna: "created_at" } });

  const rdosPendentes = rdosTodos.filter((r) => r.status === "pendente");
  const horasPendentes = horasTodas.filter((h) => h.status === "pendente");
  const piNome = (id) => pis.find((p) => p.id === id)?.codigo || "?";

  const aprovarRdo = async (rdo) => {
    await supabase.from("rdos").update({ status: "aprovado", decidido_por: usuario.id, decidido_em: new Date().toISOString() }).eq("id", rdo.id);
    await registrarLog(usuario, "Validou RDO", `${piNome(rdo.pi_id)} — ${rdo.data}`);
    recarregarRdos();
  };
  const rejeitarRdo = async (rdo, motivo) => {
    await supabase.from("rdos").update({ status: "rejeitado", decidido_por: usuario.id, decidido_em: new Date().toISOString(), motivo_rejeicao: motivo }).eq("id", rdo.id);
    await registrarLog(usuario, "Rejeitou RDO", `${piNome(rdo.pi_id)} · motivo: ${motivo}`);
    recarregarRdos();
  };
  const aprovarHoras = async (h, normais, extras) => {
    await supabase.from("apontamentos_horas").update({
      status: "aprovado", decidido_por: usuario.id, decidido_em: new Date().toISOString(),
      horas_normais: normais, horas_extras: extras,
    }).eq("id", h.id);
    await registrarLog(usuario, "Validou horas", `${piNome(h.pi_id)} — ${normais}h normais + ${extras}h extras`);
    recarregarHoras();
  };

  return (
    <PainelShell>
    <div className="p-6">
      <h1 className="font-head font-bold text-xl mb-1">Aprovações</h1>
      <p className="text-sm text-muted mb-5">RDOs e horas aguardando validação.</p>

      <div className="mb-8">
        <div className="text-[11px] font-mono text-muteddim mb-2">RDOS PENDENTES ({rdosPendentes.length})</div>
        <div className="flex flex-col gap-2">
          {rdosPendentes.map((rdo) => (
            <RdoCard key={rdo.id} rdo={rdo} piNome={piNome} editavel={editavel} onAprovar={() => aprovarRdo(rdo)} onRejeitar={(m) => rejeitarRdo(rdo, m)} />
          ))}
          {rdosPendentes.length === 0 && <div className="text-xs text-muteddim">Nenhum RDO pendente.</div>}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-mono text-muteddim mb-2">HORAS PENDENTES ({horasPendentes.length})</div>
        <div className="flex flex-col gap-2">
          {horasPendentes.map((h) => (
            <HorasCard key={h.id} registro={h} piNome={piNome} editavel={editavel} onAprovar={aprovarHoras} />
          ))}
          {horasPendentes.length === 0 && <div className="text-xs text-muteddim">Nenhum registro de horas pendente.</div>}
        </div>
      </div>
    </div>
    </PainelShell>
  );
}

function RdoCard({ rdo, piNome, editavel, onAprovar, onRejeitar }) {
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div className="border border-line rounded-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold">{piNome(rdo.pi_id)} · {rdo.data}</span>
        <span className="text-[10px] font-mono text-amber bg-amber/10 rounded-full px-2 py-0.5">PENDENTE</span>
      </div>
      {(rdo.atividades || []).map((a, i) => (
        <div key={i} className="flex justify-between text-xs py-0.5">
          <span>{a.nome}</span><span className="font-mono text-cyan">{a.percentual}%</span>
        </div>
      ))}
      {editavel && (
        rejeitando ? (
          <div className="flex flex-col gap-2 mt-2">
            <input placeholder="Motivo da rejeição" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-line text-xs" />
            <div className="flex gap-2">
              <button onClick={() => onRejeitar(motivo)} disabled={!motivo.trim()} className="px-3 py-1.5 rounded-lg bg-red text-white text-xs font-semibold disabled:opacity-50">Confirmar rejeição</button>
              <button onClick={() => setRejeitando(false)} className="px-3 py-1.5 text-xs text-muted">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-2">
            <button onClick={onAprovar} className="flex-1 py-1.5 rounded-lg bg-green text-white text-xs font-semibold">✓ Validar RDO</button>
            <button onClick={() => setRejeitando(true)} className="px-3 py-1.5 rounded-lg border border-red text-red text-xs font-semibold">Rejeitar</button>
          </div>
        )
      )}
    </div>
  );
}

function HorasCard({ registro, piNome, editavel, onAprovar }) {
  const total = registro.horas_totais || 0;
  const [normais, setNormais] = useState(total);
  const [extras, setExtras] = useState(0);
  return (
    <div className="border border-line rounded-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold">{piNome(registro.pi_id)} · {registro.data}</span>
        <span className="text-[10px] font-mono text-amber bg-amber/10 rounded-full px-2 py-0.5">PENDENTE</span>
      </div>
      <div className="text-xs text-muted mb-2">{total.toFixed(1)}h total</div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[10px] text-muteddim mb-1">NORMAIS</div>
          <input type="number" step="0.5" value={normais} onChange={(e) => { setNormais(Number(e.target.value)); setExtras(Math.max(0, total - Number(e.target.value))); }} className="w-full px-2 py-1 rounded-lg border border-line text-xs" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-muteddim mb-1">EXTRAS</div>
          <input type="number" step="0.5" value={extras} onChange={(e) => { setExtras(Number(e.target.value)); setNormais(Math.max(0, total - Number(e.target.value))); }} className="w-full px-2 py-1 rounded-lg border border-line text-xs" />
        </div>
      </div>
      {editavel && (
        <button onClick={() => onAprovar(registro, normais, extras)} className="w-full mt-2 py-1.5 rounded-lg bg-green text-white text-xs font-semibold">✓ Validar horas</button>
      )}
    </div>
  );
}

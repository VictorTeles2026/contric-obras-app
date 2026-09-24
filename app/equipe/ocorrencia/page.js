"use client";

import { useState } from "react";
import { registrarLog, useTabela } from "../../../lib/dados";
import { useAuth } from "../../../lib/AuthContext";
import { supabase } from "../../../lib/supabase";
import { useMinhasPis, agruparPorCliente } from "../../../lib/minhasPis";
import { NAV_EQUIPE } from "../../../lib/nav";
import { CATEGORIAS_OCORRENCIA } from "../../../lib/constantes";
import { formatarDataHora } from "../../../lib/datas";
import { useToast } from "../../../lib/Toast";
import MobileShell from "../../../components/MobileShell";
import CapturaMidia from "../../../components/CapturaMidia";
import { Esqueleto, EstadoVazio, Spinner } from "../../../components/ui";

export default function EquipeOcorrenciaPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const { meusPis, carregando } = useMinhasPis(usuario);
  const porCliente = agruparPorCliente(meusPis);
  const { dados: minhasOcorrencias, recarregar } = useTabela("ocorrencias", {
    order: { coluna: "created_at", asc: false }, filtro: [["registrado_por", usuario?.id]],
  });

  const [piIdEscolhido, setPiId] = useState("");
  const piId = piIdEscolhido || (meusPis.length === 1 ? meusPis[0].id : "");
  const [categoria, setCategoria] = useState(null);
  const [descricao, setDescricao] = useState("");
  const [midias, setMidias] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const podeEnviar = piId && categoria && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    const { error } = await supabase.from("ocorrencias").insert({ pi_id: piId, categoria, descricao: descricao.trim() || null, midias, registrado_por: usuario.id });
    setEnviando(false);
    if (error) { avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Registrou ocorrência", `${categoria} — ${meusPis.find((p) => p.id === piId)?.codigo}`);
    setCategoria(null); setDescricao(""); setMidias([]);
    avisar("Ocorrência registrada.");
    recarregar();
  };

  const codigoPi = (id) => meusPis.find((p) => p.id === id)?.codigo;

  return (
    <MobileShell nav={NAV_EQUIPE} perfis={["funcionario", "terceiro"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="pt-1">
          <div className="font-head font-bold text-2xl">Registrar ocorrência</div>
          <p className="text-sm text-muted mt-1">Atrasos, retrabalho, problemas com o cliente — registre com foto se puder.</p>
        </div>

        {carregando ? <Esqueleto linhas={2} altura={140} /> : meusPis.length === 0 ? (
          <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você ainda não está alocado em nenhuma obra." /></div>
        ) : (
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
            <button onClick={enviar} disabled={!podeEnviar} className="btn btn-alerta btn-lg w-full">
              {enviando ? <><Spinner /> Enviando...</> : "Registrar ocorrência"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <div className="titulo-secao">Minhas ocorrências</div>
          {minhasOcorrencias.slice(0, 20).map((o) => (
            <div key={o.id} className="cartao p-4 text-base">
              <div className="flex items-start justify-between gap-2">
                <span className="text-amber font-semibold">{o.categoria}</span>
                <span className="text-xs text-muteddim shrink-0">{codigoPi(o.pi_id)} · {formatarDataHora(o.created_at)}</span>
              </div>
              {o.descricao && <div className="text-sm text-muted mt-1">{o.descricao}</div>}
              {o.midias?.length > 0 && <div className="text-sm text-muteddim mt-1">📎 {o.midias.length} anexo(s)</div>}
            </div>
          ))}
          {minhasOcorrencias.length === 0 && <div className="text-sm text-muteddim">Nenhuma ocorrência ainda.</div>}
        </div>
      </div>
    </MobileShell>
  );
}

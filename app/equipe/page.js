"use client";

import { useState } from "react";
import { registrarLog, useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import MobileShell from "../../components/MobileShell";
import LeitorQR from "../../components/LeitorQR";
import { useMinhasPis } from "../lider/page";

const NAV = [
  { href: "/equipe", label: "Horas", icone: "⏱" },
  { href: "/equipe/ocorrencia", label: "Ocorrência", icone: "⚠" },
];

function horasEntre(iniISO, fimISO) {
  return Math.max(0, (new Date(fimISO) - new Date(iniISO)) / 3600000);
}
function horaCurta(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function EquipeHorasPage() {
  const { usuario } = useAuth();
  const meusPis = useMinhasPis(usuario);
  const { dados: todosPis } = useTabela("pis");
  const [modo, setModo] = useState("checkin"); // "checkin" | "manual"

  return (
    <MobileShell nav={NAV}>
      <div className="p-5 flex flex-col gap-5">
        <div className="font-head font-bold text-xl">Minhas horas de hoje</div>

        <div className="flex bg-white border border-line rounded-full p-1">
          <button onClick={() => setModo("checkin")} className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${modo === "checkin" ? "bg-cyan text-white" : "text-muted"}`}>
            Check-in / Check-out
          </button>
          <button onClick={() => setModo("manual")} className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${modo === "manual" ? "bg-cyan text-white" : "text-muted"}`}>
            Lançar manualmente
          </button>
        </div>

        {modo === "checkin" ? <CheckInOut usuario={usuario} todosPis={todosPis} /> : <LancamentoManual usuario={usuario} meusPis={meusPis} />}
      </div>
    </MobileShell>
  );
}

function CheckInOut({ usuario, todosPis }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { dados: apontamentosHoje, recarregar } = useTabela("apontamentos_horas", {
    filtro: [["usuario_id", usuario?.id], ["data", hoje]],
  });
  const sessaoAberta = apontamentosHoje.find((a) => a.entrada && !a.saida);
  const piDaSessao = sessaoAberta ? todosPis.find((p) => p.id === sessaoAberta.pi_id) : null;

  const [codigoPi, setCodigoPi] = useState("");
  const [scannerAberto, setScannerAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  const fazerCheckin = async (textoLivre) => {
    const termo = (textoLivre ?? codigoPi).trim().toLowerCase();
    if (!termo) return;
    const pi = todosPis.find((p) => p.codigo.toLowerCase() === termo || p.codigo.toLowerCase().includes(termo));
    if (!pi) { setErro("Nenhuma obra encontrada com esse número."); return; }
    setErro(""); setProcessando(true);
    await supabase.from("apontamentos_horas").insert({ usuario_id: usuario.id, pi_id: pi.id, data: hoje, entrada: new Date().toISOString(), status: "pendente" });
    await registrarLog(usuario, "Check-in", pi.codigo);
    setCodigoPi(""); setProcessando(false);
    recarregar();
  };

  const fazerCheckout = async () => {
    if (!sessaoAberta) return;
    setProcessando(true);
    const saida = new Date().toISOString();
    const horasTotais = horasEntre(sessaoAberta.entrada, saida);
    await supabase.from("apontamentos_horas").update({ saida, horas_totais: horasTotais }).eq("id", sessaoAberta.id);
    await registrarLog(usuario, "Check-out", `${piDaSessao?.codigo} — ${horasTotais.toFixed(1)}h`);
    setProcessando(false);
    recarregar();
  };

  if (sessaoAberta) {
    return (
      <div className="bg-white rounded-xl border border-cyan p-5 flex flex-col items-center text-center gap-2">
        <div className="text-xs font-mono text-muteddim">VOCÊ ESTÁ EM</div>
        <div className="font-head font-bold text-2xl text-cyan">{piDaSessao?.codigo || "—"}</div>
        <div className="text-base text-muted">desde as {horaCurta(sessaoAberta.entrada)}</div>
        <button onClick={fazerCheckout} disabled={processando} className="w-full mt-3 py-4 rounded-xl bg-red text-white font-semibold text-base disabled:opacity-60">
          {processando ? "Registrando..." : "Fazer check-out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setScannerAberto(true)} className="py-4 rounded-xl bg-cyan text-white font-semibold text-base flex items-center justify-center gap-2">
        📷 Ler QR Code da obra
      </button>
      <div className="text-center text-sm text-muteddim">ou</div>
      <div className="bg-white rounded-xl border border-line p-4 flex flex-col gap-3">
        <div className="text-sm text-muteddim">Digite o número da obra (ex: PI-001)</div>
        <input value={codigoPi} onChange={(e) => setCodigoPi(e.target.value)} placeholder="PI-001"
          className="w-full px-4 py-3 rounded-lg border border-line text-base" />
        {erro && <div className="text-sm text-red">{erro}</div>}
        <button onClick={() => fazerCheckin()} disabled={!codigoPi.trim() || processando} className="py-3.5 rounded-lg bg-green text-white font-semibold text-base disabled:opacity-50">
          {processando ? "Registrando..." : "Fazer check-in"}
        </button>
      </div>

      {scannerAberto && (
        <LeitorQR
          onLido={(texto) => { setScannerAberto(false); fazerCheckin(texto); }}
          onFechar={() => setScannerAberto(false)}
        />
      )}
    </div>
  );
}

function LancamentoManual({ usuario, meusPis }) {
  const [pisSelecionados, setPisSelecionados] = useState([]);
  const [horaInicio, setHoraInicio] = useState("07:00");
  const [horaFim, setHoraFim] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const togglePi = (id) => setPisSelecionados((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const horasTotais = horaInicio && horaFim
    ? Math.max(0, (new Date(`2000-01-01T${horaFim}`) - new Date(`2000-01-01T${horaInicio}`)) / 3600000)
    : 0;

  const enviar = async () => {
    if (pisSelecionados.length === 0 || horasTotais <= 0) return;
    setEnviando(true);
    const horasPorPi = horasTotais / pisSelecionados.length;
    await supabase.from("apontamentos_horas").insert(
      pisSelecionados.map((pid) => ({ usuario_id: usuario.id, pi_id: pid, horas_totais: horasPorPi, status: "pendente" }))
    );
    await registrarLog(usuario, "Enviou horas do dia", `${pisSelecionados.length} PI(s) — ${horasTotais.toFixed(1)}h`);
    setEnviando(false);
    setEnviado(true);
  };

  if (meusPis.length === 0) {
    return <div className="text-base text-muteddim leading-relaxed">Você ainda não está alocado em nenhuma obra. Fale com seu líder.</div>;
  }

  if (enviado) {
    return (
      <div className="p-6 flex flex-col items-center text-center gap-3 mt-6 bg-white rounded-xl border border-line">
        <div className="text-5xl">✓</div>
        <div className="font-head font-bold text-xl">Horas enviadas</div>
        <p className="text-base text-muted">Seu líder vai validar em breve.</p>
        <button onClick={() => setEnviado(false)} className="mt-4 px-6 py-3 rounded-lg bg-cyan text-white text-base font-semibold">Lançar de novo</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-sm text-muteddim mb-2">Em quais obras você trabalhou hoje?</div>
        <div className="flex flex-wrap gap-2">
          {meusPis.map((p) => (
            <button key={p.id} type="button" onClick={() => togglePi(p.id)}
              className={`px-4 py-2.5 rounded-full text-base border ${pisSelecionados.includes(p.id) ? "bg-cyan text-white border-cyan" : "border-line text-muted bg-white"}`}>
              {p.codigo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm text-muteddim mb-1.5">Horário de início</div>
          <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-line text-base bg-white" />
        </div>
        <div>
          <div className="text-sm text-muteddim mb-1.5">Horário de término</div>
          <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-line text-base bg-white" />
        </div>
      </div>

      {horasTotais > 0 && pisSelecionados.length > 0 && (
        <div className="text-base text-muted bg-white rounded-lg border border-line p-4 leading-relaxed">
          {horasTotais.toFixed(1)}h ÷ {pisSelecionados.length} obra(s) = <strong>{(horasTotais / pisSelecionados.length).toFixed(1)}h</strong> cada
        </div>
      )}

      <button onClick={enviar} disabled={pisSelecionados.length === 0 || horasTotais <= 0 || enviando}
        className="py-4 rounded-xl bg-amber text-white font-semibold text-base disabled:opacity-50">
        {enviando ? "Enviando..." : "Enviar horas do dia"}
      </button>
    </div>
  );
}

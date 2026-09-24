"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { registrarLog, useTabela } from "../../lib/dados";
import { useAuth } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { useMinhasPis, encontrarPiPorCodigo } from "../../lib/minhasPis";
import { NAV_EQUIPE } from "../../lib/nav";
import { hojeISO, horaCurta, formatarData, formatarHoras } from "../../lib/datas";
import { useToast } from "../../lib/Toast";
import MobileShell from "../../components/MobileShell";
import FormHoras from "../../components/FormHoras";
import UltimosLancamentos from "../../components/UltimosLancamentos";
import { Esqueleto, EstadoVazio, Segmentado, Aviso, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

// o leitor (jsqr) só é baixado quando a câmera é aberta — deixa a tela mais leve no 4G
const LeitorQR = dynamic(() => import("../../components/LeitorQR"), { ssr: false });

const PERFIS_EQUIPE = ["funcionario", "terceiro"];

function horasEntre(iniISO, fimISO) {
  return Math.max(0, (new Date(fimISO) - new Date(iniISO)) / 3600000);
}

export default function EquipeHorasPage() {
  const { usuario } = useAuth();
  const { meusPis, todosPis, carregando } = useMinhasPis(usuario);
  const [modo, setModo] = useState("checkin"); // "checkin" | "manual"
  const [versao, setVersao] = useState(0);
  const mudou = () => setVersao((v) => v + 1);

  return (
    <MobileShell nav={NAV_EQUIPE} perfis={PERFIS_EQUIPE}>
      <div className="p-4 flex flex-col gap-5">
        <div className="font-head font-bold text-2xl pt-1">Minhas horas</div>

        <Segmentado valor={modo} onChange={setModo} opcoes={[["checkin", "Check-in / out"], ["manual", "Lançar manual"]]} />

        {carregando ? <Esqueleto linhas={2} altura={120} /> : modo === "checkin"
          ? <CheckInOut usuario={usuario} todosPis={todosPis} meusPis={meusPis} onMudou={mudou} />
          : meusPis.length === 0
            ? <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você ainda não está alocado em nenhuma obra. Fale com seu líder ou use o check-in pelo QR Code." /></div>
            : <FormHoras usuario={usuario} pis={meusPis} onEnviado={mudou} />}

        {!carregando && <UltimosLancamentos usuario={usuario} pis={todosPis} versao={versao} />}
      </div>
    </MobileShell>
  );
}

function Cronometro({ desde }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const min = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 60000));
  return <>{Math.floor(min / 60)}h {String(min % 60).padStart(2, "0")}min</>;
}

function CheckInOut({ usuario, todosPis, meusPis, onMudou }) {
  const { avisar } = useToast();
  // sem filtro de data: uma sessão esquecida aberta ontem precisa aparecer para ser fechada
  const { dados: meusApontamentos, carregando, recarregar } = useTabela("apontamentos_horas", {
    filtro: [["usuario_id", usuario?.id]], order: { coluna: "created_at", asc: false },
  });
  const sessaoAberta = meusApontamentos.find((a) => a.entrada && !a.saida);
  const piDaSessao = sessaoAberta ? todosPis.find((p) => p.id === sessaoAberta.pi_id) : null;
  const sessaoDeOutroDia = sessaoAberta && sessaoAberta.data && sessaoAberta.data !== hojeISO();

  const [codigoPi, setCodigoPi] = useState("");
  const [scannerAberto, setScannerAberto] = useState(false);
  const [erro, setErro] = useState("");
  const [processando, setProcessando] = useState(false);

  const fazerCheckin = async (piOuTexto) => {
    if (processando) return;
    const pi = typeof piOuTexto === "object" ? piOuTexto : encontrarPiPorCodigo(todosPis, piOuTexto ?? codigoPi);
    if (!pi) { setErro("Nenhuma obra encontrada com esse número. Confira e tente de novo."); return; }
    setErro(""); setProcessando(true);
    const { error } = await supabase.from("apontamentos_horas").insert({
      usuario_id: usuario.id, pi_id: pi.id, data: hojeISO(), entrada: new Date().toISOString(), status: "pendente",
    });
    setProcessando(false);
    if (error) { avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Check-in", pi.codigo);
    avisar(`Check-in em ${pi.codigo} registrado.`);
    setCodigoPi("");
    recarregar(); onMudou?.();
  };

  const fazerCheckout = async () => {
    if (!sessaoAberta || processando) return;
    setProcessando(true);
    const saida = new Date().toISOString();
    const horasTotais = Math.round(horasEntre(sessaoAberta.entrada, saida) * 100) / 100;
    const { error } = await supabase.from("apontamentos_horas").update({ saida, horas_totais: horasTotais }).eq("id", sessaoAberta.id);
    setProcessando(false);
    if (error) { avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Check-out", `${piDaSessao?.codigo} — ${horasTotais.toFixed(1)}h`);
    avisar(`Check-out registrado: ${formatarHoras(horasTotais)}.`);
    recarregar(); onMudou?.();
  };

  if (carregando) return <Esqueleto linhas={1} altura={200} />;

  if (sessaoAberta) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-navy to-navysoft text-white p-6 flex flex-col items-center text-center gap-1.5 shadow-lg animar-surgir">
        <div className="flex items-center gap-2 text-xs font-semibold text-green bg-green/15 rounded-full px-3 py-1 mb-2">
          <span className="w-2 h-2 rounded-full bg-green animate-pulse" /> EM TRABALHO
        </div>
        <div className="font-head font-bold text-3xl text-white">{piDaSessao?.codigo || "—"}</div>
        {piDaSessao?.cliente && <div className="text-base font-semibold text-slate-200">{piDaSessao.cliente}</div>}
        {piDaSessao?.projeto && <div className="text-sm text-slate-400">{piDaSessao.projeto}</div>}
        <div className="font-head font-bold text-4xl mt-4 tabular-nums"><Cronometro desde={sessaoAberta.entrada} /></div>
        <div className="text-sm text-slate-300">
          desde {sessaoDeOutroDia ? `${formatarData(sessaoAberta.data)} às ` : "as "}{horaCurta(sessaoAberta.entrada)}
        </div>
        {sessaoDeOutroDia && (
          <Aviso tipo="alerta" className="mt-3 text-left !bg-amber/15 !text-amber !border-amber/30">
            Este check-in ficou aberto desde outro dia. Faça o check-out e avise seu líder para corrigir as horas.
          </Aviso>
        )}
        <button onClick={fazerCheckout} disabled={processando} className="btn btn-perigo btn-lg w-full mt-5">
          {processando ? <><Spinner /> Registrando...</> : "Fazer check-out"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 animar-fade">
      <button onClick={() => setScannerAberto(true)} className="rounded-2xl bg-gradient-to-br from-cyan to-[#0a6a86] text-white p-6 flex flex-col items-center gap-2 shadow-md active:scale-[0.99] transition-transform">
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center"><Icone nome="qr" className="w-8 h-8" /></div>
        <div className="font-head font-bold text-lg">Ler QR Code da obra</div>
        <div className="text-sm text-white/80">para fazer o check-in</div>
      </button>

      {meusPis.length > 0 && (
        <div className="cartao p-4">
          <div className="rotulo">Ou toque na sua obra</div>
          <div className="flex flex-col gap-2">
            {meusPis.map((p) => (
              <button key={p.id} onClick={() => fazerCheckin(p)} disabled={processando}
                className="flex items-center justify-between gap-3 text-left rounded-xl border border-line px-4 py-3 hover:border-cyan active:bg-cyan/5 transition-colors disabled:opacity-50">
                <div className="min-w-0">
                  <div className="font-semibold">{p.codigo}</div>
                  <div className="text-xs text-muted truncate">{p.projeto || p.cliente}</div>
                </div>
                <span className="text-sm font-semibold text-green shrink-0">Check-in →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cartao p-4 flex flex-col gap-3">
        <div className="rotulo !mb-0">Ou digite o número da obra</div>
        <form onSubmit={(e) => { e.preventDefault(); fazerCheckin(); }} className="flex gap-2">
          <input value={codigoPi} onChange={(e) => { setCodigoPi(e.target.value); setErro(""); }} placeholder="Ex: PI-001"
            autoCapitalize="characters" className="input input-lg flex-1" />
          <button type="submit" disabled={!codigoPi.trim() || processando} className="btn btn-sucesso btn-lg shrink-0">
            {processando ? <Spinner /> : "OK"}
          </button>
        </form>
        {erro && <div className="text-sm text-red">{erro}</div>}
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

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

        {!carregando && <UltimosLancamentos usuario={usuario} pis={todosPis} pisEditaveis={meusPis} versao={versao} />}
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

  // confirmação antes de registrar: { tipo: "checkin", pi } | { tipo: "checkout" } | null
  const [confirmar, setConfirmar] = useState(null);

  // 1º passo: identifica a obra e pede confirmação (nada é gravado ainda)
  const prepararCheckin = (piOuTexto) => {
    if (processando) return;
    const pi = typeof piOuTexto === "object" ? piOuTexto : encontrarPiPorCodigo(todosPis, piOuTexto ?? codigoPi);
    if (!pi) { setErro("Nenhuma obra encontrada com esse número. Confira e tente de novo."); return; }
    setErro("");
    if (navigator.vibrate) navigator.vibrate(40);
    setConfirmar({ tipo: "checkin", pi });
  };

  const fazerCheckin = async (pi) => {
    if (processando) return;
    setProcessando(true);
    const { error } = await supabase.from("apontamentos_horas").insert({
      usuario_id: usuario.id, pi_id: pi.id, data: hojeISO(), entrada: new Date().toISOString(), status: "pendente",
    });
    setProcessando(false);
    if (error) { avisar(`Não foi possível registrar: ${error.message}`, "erro", 6000); return; }
    await registrarLog(usuario, "Check-in", pi.codigo);
    avisar(`Check-in em ${pi.codigo} registrado.`);
    setCodigoPi(""); setConfirmar(null);
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
    setConfirmar(null);
    recarregar(); onMudou?.();
  };

  if (carregando) return <Esqueleto linhas={1} altura={200} />;

  const telaConfirmacao = confirmar && (
    <ConfirmacaoPonto
      tipo={confirmar.tipo}
      pi={confirmar.tipo === "checkin" ? confirmar.pi : piDaSessao}
      foraDasMinhasObras={confirmar.tipo === "checkin" && !meusPis.some((p) => p.id === confirmar.pi.id)}
      entrada={sessaoAberta?.entrada}
      processando={processando}
      onConfirmar={() => (confirmar.tipo === "checkin" ? fazerCheckin(confirmar.pi) : fazerCheckout())}
      onCancelar={() => setConfirmar(null)}
    />
  );

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
        <button onClick={() => setConfirmar({ tipo: "checkout" })} disabled={processando} className="btn btn-perigo btn-lg w-full mt-5">
          Fazer check-out
        </button>
        {telaConfirmacao}
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
              <button key={p.id} onClick={() => prepararCheckin(p)} disabled={processando}
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
        <form onSubmit={(e) => { e.preventDefault(); prepararCheckin(); }} className="flex gap-2">
          <input value={codigoPi} onChange={(e) => { setCodigoPi(e.target.value); setErro(""); }} placeholder="Ex: PI-001"
            autoCapitalize="characters" className="input input-lg flex-1" />
          <button type="submit" disabled={!codigoPi.trim() || processando} className="btn btn-sucesso btn-lg shrink-0">
            "OK"
          </button>
        </form>
        {erro && <div className="text-sm text-red">{erro}</div>}
      </div>

      {scannerAberto && (
        <LeitorQR
          onLido={(texto) => { setScannerAberto(false); prepararCheckin(texto); }}
          onFechar={() => setScannerAberto(false)}
        />
      )}
      {telaConfirmacao}
    </div>
  );
}

// Tela cheia de confirmação — botões grandes, informação clara, fácil cancelar.
function ConfirmacaoPonto({ tipo, pi, entrada, foraDasMinhasObras, processando, onConfirmar, onCancelar }) {
  const [agora, setAgora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15000); return () => clearInterval(t); }, []);
  const ehCheckin = tipo === "checkin";
  const horas = !ehCheckin && entrada ? Math.max(0, (agora - new Date(entrada)) / 3600000) : 0;
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center animar-fade" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 animar-modal text-textmain" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3 ${ehCheckin ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}>
          <Icone nome={ehCheckin ? "entrar" : "sair"} className="w-8 h-8" />
        </div>
        <div className="text-center font-head font-bold text-2xl">{ehCheckin ? "Confirmar check-in?" : "Confirmar check-out?"}</div>
        <div className="mt-4 rounded-2xl bg-panel p-4 text-center">
          <div className="font-head font-bold text-2xl text-cyan">{pi?.codigo || "—"}</div>
          {pi?.cliente && <div className="font-semibold">{pi.cliente}</div>}
          {pi?.projeto && <div className="text-sm text-muted">{pi.projeto}</div>}
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            {ehCheckin ? (
              <div className="col-span-2"><span className="text-muted">Entrada agora:</span> <strong className="text-lg">{hora}</strong></div>
            ) : (
              <>
                <div><div className="text-muted text-xs">Entrada</div><strong className="text-lg">{entrada ? new Date(entrada).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div>
                <div><div className="text-muted text-xs">Saída</div><strong className="text-lg">{hora}</strong></div>
                <div className="col-span-2 pt-1 border-t border-line"><span className="text-muted">Total:</span> <strong className="text-lg">{formatarHoras(horas)}</strong></div>
              </>
            )}
          </div>
        </div>
        {foraDasMinhasObras && (
          <Aviso tipo="alerta" className="mt-3">Você não está alocado nesta obra. Confira se é a obra certa antes de confirmar.</Aviso>
        )}
        <div className="flex flex-col gap-2 mt-5">
          <button onClick={onConfirmar} disabled={processando} className={`btn btn-lg w-full ${ehCheckin ? "btn-sucesso" : "btn-perigo"}`}>
            {processando ? <><Spinner /> Registrando...</> : ehCheckin ? "Sim, fazer check-in" : "Sim, fazer check-out"}
          </button>
          <button onClick={onCancelar} disabled={processando} className="btn btn-contorno btn-lg w-full">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

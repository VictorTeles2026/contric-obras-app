"use client";

import { useState } from "react";
import Link from "next/link";
import { useTabela, chamarApi } from "../lib/dados";
import { supabase } from "../lib/supabase";
import { formatarDataHora } from "../lib/datas";
import { ALERTAS, TIPOS_ALERTA } from "../lib/constantes";
import { useToast } from "../lib/Toast";
import { Modal } from "./ui";
import Icone from "./Icone";

// o que também chega por e-mail (cada usuário escolhe; sem escolha, vale o padrão de Configurações → Alertas)
function PreferenciasAlertas({ usuario }) {
  const { avisar } = useToast();
  const [aberto, setAberto] = useState(false);
  const [prefs, setPrefs] = useState(usuario?.alertas || {});
  const [salvando, setSalvando] = useState(null);
  const semEmail = !usuario?.email || /@usuarios\.contric\.local$/i.test(usuario.email);
  const alternar = async (k, valor) => {
    const novo = { ...prefs, [k]: valor };
    setSalvando(k);
    const r = await chamarApi("/api/alertas", { acao: "preferencias", alertas: novo });
    setSalvando(null);
    if (!r.ok) { avisar(`Não foi possível salvar: ${r.json?.error || "erro"}`, "erro", 6000); return; }
    setPrefs(novo);
    if (usuario) usuario.alertas = novo;
  };
  return (
    <div className="mb-3 rounded-xl border border-line">
      <button type="button" onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold">
        <span>Receber por e-mail</span><span className="text-cyan text-xs">{aberto ? "Fechar" : "Preferências"}</span>
      </button>
      {aberto && (
        <div className="px-3.5 pb-3 flex flex-col gap-2.5 border-t border-line pt-3">
          {semEmail && <div className="text-xs text-amber">Seu login não tem e-mail cadastrado — os alertas ficam só aqui no sininho.</div>}
          {/* o usuário só pode DESLIGAR; quem liga é o administrador em Usuários → Alertas */}
          {TIPOS_ALERTA.map(([k, rotulo, dica]) => (
            <label key={k} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" disabled={semEmail || salvando === k || (prefs[k] ?? ALERTAS[k]) !== true} checked={(prefs[k] ?? ALERTAS[k]) === true}
                onChange={(e) => alternar(k, e.target.checked)} className="mt-1 w-4 h-4 accent-cyan" />
              <span className="text-sm"><strong className="font-medium">{rotulo}</strong><span className="texto-apoio block">{dica}</span></span>
            </label>
          ))}
          <div className="texto-apoio">Os alertas são ligados pelo administrador (Usuários → Alertas); aqui você pode desligar os seus. Sem e-mails entre {ALERTAS.silencioInicio} e {ALERTAS.silencioFim} — o que surgir nesse horário chega pela manhã.</div>
        </div>
      )}
    </div>
  );
}

// Sininho com as notificações do usuário (edições e reprovações feitas pelo aprovador).
// `escuro`: ícone claro para cabeçalhos com fundo azul-marinho.
export default function SinoNotificacoes({ usuario, escuro = true }) {
  const { dados, recarregar } = useTabela("notificacoes", {
    filtro: [["usuario_id", usuario?.id]], order: { coluna: "created_at", asc: false },
  });
  const [aberto, setAberto] = useState(false);
  const naoLidas = dados.filter((n) => !n.lida);

  const marcarTodasLidas = async () => {
    if (naoLidas.length === 0) return;
    await supabase.from("notificacoes").update({ lida: true }).eq("usuario_id", usuario.id).eq("lida", false);
    recarregar();
  };
  const abrir = () => { setAberto(true); };
  const fechar = () => { setAberto(false); marcarTodasLidas(); };

  return (
    <>
      <button onClick={abrir} aria-label={`Notificações${naoLidas.length ? ` (${naoLidas.length} novas)` : ""}`}
        className={`relative p-2.5 rounded-lg ${escuro ? "text-slate-200 hover:bg-white/10" : "text-muted hover:bg-panel"}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {naoLidas.length > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas.length > 9 ? "9+" : naoLidas.length}
          </span>
        )}
      </button>

      {aberto && (
        <Modal titulo="Notificações" onFechar={fechar} confirmarAoFechar={false}>
          <PreferenciasAlertas usuario={usuario} />
          {dados.length === 0 && <div className="text-sm text-muteddim text-center py-8">Nenhuma notificação.</div>}
          <div className="flex flex-col gap-2">
            {dados.slice(0, 40).map((n) => {
              const conteudo = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm leading-snug flex items-center gap-2">
                      {!n.lida && <span className="w-2 h-2 rounded-full bg-cyan shrink-0" />}
                      {n.titulo}
                    </div>
                    <span className="text-[11px] text-muteddim shrink-0">{formatarDataHora(n.created_at)}</span>
                  </div>
                  {n.mensagem && <div className="text-sm text-muted mt-1 whitespace-pre-line">{n.mensagem}</div>}
                </>
              );
              const classe = `block rounded-xl border px-3.5 py-3 ${n.lida ? "border-line bg-white" : "border-cyan/30 bg-cyan/5"}`;
              return n.link
                ? <Link key={n.id} href={n.link} onClick={fechar} className={`${classe} hover:border-cyan/50`}>{conteudo}</Link>
                : <div key={n.id} className={classe}>{conteudo}</div>;
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Icone from "./Icone";

export function Logo({ tamanho = "md", claro = false }) {
  const t = tamanho === "lg" ? "w-10 h-10 text-lg" : tamanho === "sm" ? "w-7 h-7 text-sm" : "w-8 h-8 text-base";
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${t} rounded-xl bg-gradient-to-br from-cyan to-[#0a6a86] flex items-center justify-center font-head font-bold text-white shadow-sm`}>C</div>
      <span className={`font-head font-bold ${tamanho === "lg" ? "text-xl" : "text-[15px]"} ${claro ? "text-white" : "text-textmain"}`}>Contric</span>
    </div>
  );
}

export function TelaCarregando({ texto = "Carregando..." }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 bg-panel">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan to-[#0a6a86] flex items-center justify-center font-head font-bold text-white text-lg animate-pulse">C</div>
      <div className="text-sm text-muted">{texto}</div>
    </div>
  );
}

export function Spinner({ className = "w-4 h-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Esqueleto({ linhas = 3, altura = 64 }) {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: linhas }).map((_, i) => <div key={i} className="esqueleto" style={{ height: altura }} />)}
    </div>
  );
}

export function EstadoVazio({ icone = "info", titulo, texto, acao }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6 animar-fade">
      <div className="w-12 h-12 rounded-2xl bg-white border border-line flex items-center justify-center text-muteddim mb-1">
        <Icone nome={icone} className="w-6 h-6" />
      </div>
      {titulo && <div className="font-head font-bold text-base text-textmain">{titulo}</div>}
      {texto && <p className="text-sm text-muted max-w-xs leading-relaxed">{texto}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function CabecalhoPagina({ titulo, subtitulo, acoes }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="font-head font-bold text-xl md:text-2xl text-textmain leading-tight">{titulo}</h1>
        {subtitulo && <p className="text-sm text-muted mt-1">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 shrink-0">{acoes}</div>}
    </div>
  );
}

export function Campo({ rotulo, dica, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {rotulo && <span className="rotulo">{rotulo}</span>}
      {children}
      {dica && <span className="block text-xs text-muteddim mt-1">{dica}</span>}
    </label>
  );
}

export function Aviso({ tipo = "info", children, className = "" }) {
  const estilos = {
    info: "bg-cyan/5 border-cyan/25 text-[#0a6a86]",
    alerta: "bg-amber/10 border-amber/30 text-[#9a5a14]",
    erro: "bg-red/10 border-red/30 text-red",
    sucesso: "bg-green/10 border-green/30 text-[#23793a]",
  };
  const icones = { info: "info", alerta: "alerta", erro: "alerta", sucesso: "check" };
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed ${estilos[tipo]} ${className}`} role={tipo === "erro" ? "alert" : undefined}>
      <Icone nome={icones[tipo]} className="w-[18px] h-[18px] shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Modal que vira "bottom sheet" no celular (mais fácil de alcançar com o polegar).
export function Modal({ titulo, onFechar, children, rodape, largura = "max-w-lg" }) {
  // no celular, acompanha a área visível (o teclado encolhe a tela): a janela nunca fica atrás dele
  const [area, setArea] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setArea({ altura: vv.height, topo: vv.offsetTop });
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir); };
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onFechar?.();
    window.addEventListener("keydown", onKey);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflowAnterior; };
  }, [onFechar]);

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animar-fade" role="dialog" aria-modal="true"
      style={{ height: area ? area.altura : "100dvh", top: area ? area.topo : 0 }}>
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-[2px]" onClick={onFechar} />
      <div className={`relative w-full ${largura} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94%] animar-modal`}>
        <div className="sm:hidden mx-auto mt-2 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="font-head font-bold text-lg leading-tight min-w-0 truncate">{titulo}</div>
          <button onClick={onFechar} className="btn btn-fantasma !p-2 -mr-2 shrink-0" aria-label="Fechar">
            <Icone nome="fechar" className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto overscroll-contain rolagem-fina flex-1 min-h-0"
          onFocus={(e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }}>
          {children}
        </div>
        {rodape && (
          <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

// Tela de sucesso usada no fim dos fluxos mobile (RDO, horas...)
export function TelaSucesso({ titulo, texto, children }) {
  return (
    <div className="p-6 flex flex-col items-center text-center gap-3 mt-8 animar-surgir">
      <div className="w-20 h-20 rounded-full bg-green/10 text-green flex items-center justify-center mb-1">
        <Icone nome="aprovar" className="w-10 h-10" strokeWidth={2.4} />
      </div>
      <div className="font-head font-bold text-2xl">{titulo}</div>
      {texto && <p className="text-base text-muted leading-relaxed max-w-xs">{texto}</p>}
      <div className="flex flex-col gap-2 w-full max-w-xs mt-4">{children}</div>
    </div>
  );
}

// seletor segmentado (abas pequenas)
export function Segmentado({ opcoes, valor, onChange, className = "" }) {
  return (
    <div className={`flex bg-white border border-line rounded-xl p-1 gap-1 ${className}`} role="tablist">
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={valor === v} onClick={() => onChange(v)}
          className={`flex-1 py-2.5 px-2 rounded-lg text-sm font-semibold transition-all ${valor === v ? "bg-cyan text-white shadow-sm" : "text-muted hover:text-textmain"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

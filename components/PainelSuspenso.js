"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Lista suspensa que abre SEMPRE em primeiro plano.
// Antes os painéis ficavam dentro do contêiner do botão: eram cortados por áreas com rolagem
// e cobertos por elementos vizinhos (linhas seguintes, barras fixas). Agora o painel é
// renderizado direto no <body>, com posição fixa calculada a partir do botão (ancoraRef).
// Se não houver espaço embaixo, abre para cima. Fecha ao clicar fora, com Esc e ao rolar a página para longe.
export default function PainelSuspenso({ ancoraRef, aberto, onFechar, largura = 256, alturaMax = 288, children, className = "" }) {
  const painelRef = useRef(null);
  const [pos, setPos] = useState(null);

  const calcular = () => {
    const ancora = ancoraRef.current;
    if (!ancora) return;
    const r = ancora.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, margem = 8;
    const w = Math.min(largura, vw - 2 * margem);
    const espacoAbaixo = vh - r.bottom - margem, espacoAcima = r.top - margem;
    const abrirParaCima = espacoAbaixo < Math.min(alturaMax, 180) && espacoAcima > espacoAbaixo;
    const altura = Math.max(120, Math.min(alturaMax, abrirParaCima ? espacoAcima - 4 : espacoAbaixo - 4));
    const left = Math.min(Math.max(margem, r.left), vw - w - margem);
    setPos({ left, width: w, maxHeight: altura, ...(abrirParaCima ? { bottom: vh - r.top + 4 } : { top: r.bottom + 4 }) });
  };

  useLayoutEffect(() => { if (aberto) calcular(); else setPos(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e) => {
      if (painelRef.current?.contains(e.target) || ancoraRef.current?.contains(e.target)) return;
      onFechar();
    };
    const aoTeclar = (e) => { if (e.key === "Escape") onFechar(); };
    const aoRolar = (e) => { if (painelRef.current?.contains(e.target)) return; calcular(); };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("touchstart", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("resize", calcular);
    window.addEventListener("scroll", aoRolar, true); // captura: acompanha rolagem de qualquer contêiner
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("touchstart", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("resize", calcular);
      window.removeEventListener("scroll", aoRolar, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, onFechar]);

  if (!aberto || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={painelRef} role="listbox"
      className={`fixed z-[70] bg-white border border-line rounded-xl shadow-2xl p-1.5 overflow-auto rolagem-fina animar-fade text-textmain ${className}`}
      style={pos}>
      {children}
    </div>,
    document.body
  );
}

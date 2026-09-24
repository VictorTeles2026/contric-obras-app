"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// Usa Pointer Events (dedo, caneta e mouse com o mesmo código). Os handlers de touch
// do React são "passive", então o preventDefault() antigo era ignorado e gerava erro
// no console; e o canvas era dimensionado uma única vez — girar o celular deixava o
// traço desalinhado com o dedo.
export default function AssinaturaCanvas({ onMudar }) {
  const canvasRef = useRef(null);
  const desenhandoRef = useRef(false);
  const temTracoRef = useRef(false);
  const [vazio, setVazio] = useState(true);

  const configurar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = "#0E1B3D";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    configurar();
    let larguraAnterior = canvasRef.current?.getBoundingClientRect().width;
    const aoRedimensionar = () => {
      // no celular, a barra de endereço aparecendo/sumindo dispara "resize" só com
      // mudança de ALTURA da janela — isso não pode apagar a assinatura
      const largura = canvasRef.current?.getBoundingClientRect().width;
      if (!largura || largura === larguraAnterior) return;
      larguraAnterior = largura;
      // redimensionar apaga o desenho; avisa o formulário para pedir de novo
      configurar();
      if (temTracoRef.current) { temTracoRef.current = false; setVazio(true); onMudar(null); }
    };
    window.addEventListener("orientationchange", aoRedimensionar);
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      window.removeEventListener("orientationchange", aoRedimensionar);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, [configurar, onMudar]);

  const posicao = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const iniciar = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    desenhandoRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = posicao(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1); // permite "pontos"
    ctx.stroke();
  };
  const mover = (e) => {
    if (!desenhandoRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = posicao(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!temTracoRef.current) { temTracoRef.current = true; setVazio(false); }
  };
  const finalizar = () => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    if (temTracoRef.current) onMudar(canvasRef.current.toDataURL("image/png"));
  };
  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    temTracoRef.current = false;
    setVazio(true);
    onMudar(null);
  };

  return (
    <div>
      <div className="text-sm text-muted mb-2">Peça para o cliente assinar abaixo, com o dedo</div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          className={`w-full bg-white border-2 border-dashed rounded-xl touch-none cursor-crosshair transition-colors ${vazio ? "border-line" : "border-cyan/50"}`}
          style={{ height: 200 }}
          onPointerDown={iniciar} onPointerMove={mover} onPointerUp={finalizar} onPointerCancel={finalizar} onPointerLeave={finalizar}
        />
        {vazio && (
          <div className="absolute inset-x-6 bottom-10 border-b border-line pointer-events-none">
            <span className="absolute -top-6 left-0 text-muteddim text-lg">✕</span>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mt-2">
        <span className={`text-sm ${vazio ? "text-muteddim" : "text-green font-semibold"}`}>{vazio ? "Ainda sem assinatura" : "✓ Assinatura capturada"}</span>
        <button type="button" onClick={limpar} disabled={vazio} className="btn btn-fantasma btn-sm">Limpar</button>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useEffect } from "react";

export default function AssinaturaCanvas({ onMudar }) {
  const canvasRef = useRef(null);
  const desenhandoRef = useRef(false);
  const [vazio, setVazio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#0E1B3D";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const posicao = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ponto = e.touches ? e.touches[0] : e;
    return { x: ponto.clientX - rect.left, y: ponto.clientY - rect.top };
  };

  const iniciar = (e) => {
    e.preventDefault();
    desenhandoRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = posicao(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const mover = (e) => {
    if (!desenhandoRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = posicao(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vazio) setVazio(false);
  };
  const finalizar = () => {
    if (!desenhandoRef.current) return;
    desenhandoRef.current = false;
    if (!vazio) onMudar(canvasRef.current.toDataURL("image/png"));
  };
  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setVazio(true);
    onMudar(null);
  };

  return (
    <div>
      <div className="text-sm text-muteddim mb-1.5">Peça para o cliente assinar abaixo, com o dedo</div>
      <canvas
        ref={canvasRef}
        className="w-full bg-white border-2 border-dashed border-line rounded-lg touch-none"
        style={{ height: 180 }}
        onMouseDown={iniciar} onMouseMove={mover} onMouseUp={finalizar} onMouseLeave={finalizar}
        onTouchStart={iniciar} onTouchMove={mover} onTouchEnd={finalizar}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-muteddim">{vazio ? "Ainda sem assinatura" : "✓ Assinatura capturada"}</span>
        <button type="button" onClick={limpar} className="text-xs text-muted underline">Limpar</button>
      </div>
    </div>
  );
}

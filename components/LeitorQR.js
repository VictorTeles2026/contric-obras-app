"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export default function LeitorQR({ onLido, onFechar }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (e) {
        setErro("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
      }
    }

    function tick() {
      const video = videoRef.current, canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imageData.data, imageData.width, imageData.height);
        if (codigo && codigo.data) {
          onLido(codigo.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    iniciar();
    return () => {
      cancelado = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <span className="font-head font-bold">Aponte para o QR Code</span>
        <button onClick={onFechar} className="text-sm underline">Cancelar</button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 border-4 border-white/70 rounded-2xl" />
        </div>
      </div>
      {erro && <div className="p-4 text-sm text-red bg-white">{erro}</div>}
    </div>
  );
}

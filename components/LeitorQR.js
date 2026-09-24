"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import Icone from "./Icone";

export default function LeitorQR({ onLido, onFechar }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lidoRef = useRef(false);
  const onLidoRef = useRef(onLido);
  onLidoRef.current = onLido;
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    let ultimoFrame = 0;

    const parar = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro("Este navegador não permite usar a câmera. Abra o sistema pelo endereço https ou digite o número da obra.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErro(e?.name === "NotAllowedError"
          ? "Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador."
          : "Não foi possível acessar a câmera. Você pode digitar o número da obra.");
      }
    }

    function tick(agora) {
      if (cancelado || lidoRef.current) return;
      const video = videoRef.current, canvas = canvasRef.current;
      // ~8 leituras por segundo bastam e poupam bateria
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && agora - ultimoFrame > 120) {
        ultimoFrame = agora;
        // reduz a imagem: leitura mais rápida em celulares simples
        const escala = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codigo = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (codigo && codigo.data) {
          lidoRef.current = true;
          if (navigator.vibrate) navigator.vibrate(80);
          parar();
          onLidoRef.current(codigo.data);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    iniciar();
    return () => { cancelado = true; parar(); };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col animar-fade">
      <div className="flex items-center justify-between px-4 pb-3 text-white" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <span className="font-head font-bold text-lg">Aponte para o QR Code</span>
        <button onClick={onFechar} className="p-2.5 rounded-full bg-white/10 active:bg-white/20" aria-label="Fechar leitor">
          <Icone nome="fechar" />
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {!erro && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64 max-w-[75vw] max-h-[75vw] rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute inset-0 rounded-3xl border-[3px] border-white/80" />
              <div className="absolute left-4 right-4 h-0.5 bg-cyan shadow-[0_0_12px_#0B84A5] animate-[pulse_1.2s_ease-in-out_infinite] top-1/2" />
            </div>
          </div>
        )}
      </div>
      {erro ? (
        <div className="p-5 bg-white text-sm text-textmain" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
          <div className="text-red font-semibold mb-3">{erro}</div>
          <button onClick={onFechar} className="btn btn-escuro btn-lg w-full">Digitar o número da obra</button>
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-slate-300" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          O check-in é feito automaticamente ao ler o código.
        </div>
      )}
    </div>
  );
}

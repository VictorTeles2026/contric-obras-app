"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import Icone from "./Icone";
import { Modal, Spinner } from "./ui";

// ======================= QR Code do PI =======================
// O QR guarda o NÚMERO do PI — o mesmo formato que o leitor de QR do líder reconhece.
export const gerarQrPi = (pi, tamanho = 600) =>
  QRCode.toDataURL(String(pi.codigo || ""), { width: tamanho, margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B2E44", light: "#FFFFFF" } });

// PDF A4 (retrato) com as informações GRANDES: nº do PI, cliente, descrição e o QR ocupando a folha
async function pdfQrPi(pi) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, M = 15;
  const qr = await gerarQrPi(pi, 1200);
  doc.setTextColor(11, 46, 68);
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("CONTRIC — GESTÃO DE OBRAS", L / 2, 20, { align: "center" });
  doc.setFontSize(54);
  doc.text(`PI ${pi.codigo}`, L / 2, 46, { align: "center" });
  doc.setFontSize(26);
  const cliente = doc.splitTextToSize(String(pi.cliente || ""), L - 2 * M);
  doc.text(cliente, L / 2, 62, { align: "center" });
  let y = 62 + cliente.length * 10;
  if (pi.projeto) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(18);
    const proj = doc.splitTextToSize(String(pi.projeto), L - 2 * M);
    doc.text(proj, L / 2, y + 2, { align: "center" });
    y += proj.length * 7.5 + 4;
  }
  // QR o maior possível no espaço que sobra (até 165 mm)
  const lado = Math.min(165, 282 - y - 22);
  doc.addImage(qr, "PNG", (L - lado) / 2, y + 6, lado, lado);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(91, 107, 133);
  doc.text("Aponte a câmera do app Contric (Ler QR) para abrir esta obra.", L / 2, Math.min(287, y + lado + 16), { align: "center" });
  return doc;
}
export async function baixarPdfQrPi(pi) {
  (await pdfQrPi(pi)).save(`QR_PI_${String(pi.codigo).replace(/[^\w-]+/g, "-")}.pdf`);
}
// imprime o mesmo PDF (já ajustado para A4) — abre a janela de impressão do navegador
export async function imprimirQrPi(pi) {
  const janela = window.open("", "_blank"); // abre antes do await: senão o navegador bloqueia como pop-up
  const doc = await pdfQrPi(pi);
  doc.autoPrint();
  const url = doc.output("bloburl");
  if (janela) janela.location.href = url; else window.open(url, "_blank");
}

// Janela com o QR Code + cliente e descrição. `comPdf`: mostra os botões PDF e Imprimir (painel)
export function ModalQrPi({ pi, onFechar, comPdf = false }) {
  const [img, setImg] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  useEffect(() => { let vivo = true; gerarQrPi(pi).then((u) => vivo && setImg(u)); return () => { vivo = false; }; }, [pi]);
  const acao = async (tipo) => { setOcupado(tipo); try { await (tipo === "pdf" ? baixarPdfQrPi(pi) : imprimirQrPi(pi)); } finally { setOcupado(null); } };
  return (
    <Modal titulo={`QR Code — PI ${pi.codigo}`} onFechar={onFechar} confirmarAoFechar={false} largura="max-w-md"
      rodape={comPdf ? <>
        <button onClick={() => acao("pdf")} disabled={!!ocupado} className="btn btn-contorno">{ocupado === "pdf" ? <Spinner /> : <Icone nome="download" className="w-4 h-4" />} Gerar PDF</button>
        <button onClick={() => acao("imprimir")} disabled={!!ocupado} className="btn btn-primario">{ocupado === "imprimir" ? <Spinner /> : <Icone nome="pdf" className="w-4 h-4" />} Imprimir</button>
      </> : <button onClick={onFechar} className="btn btn-primario w-full">Fechar</button>}>
      <div className="text-center">
        <div className="font-head font-bold text-3xl text-navy">PI {pi.codigo}</div>
        <div className="text-lg font-semibold mt-1">{pi.cliente}</div>
        {pi.projeto && <div className="text-sm text-muted mt-0.5">{pi.projeto}</div>}
        <div className="mx-auto mt-4 w-64 h-64 max-w-full aspect-square flex items-center justify-center rounded-xl border border-line bg-white p-2">
          {img ? <img src={img} alt={`QR Code do PI ${pi.codigo}`} className="w-full h-full" /> : <Spinner className="w-6 h-6 text-cyan" />}
        </div>
        <p className="texto-apoio mt-3">O QR Code contém o número do PI — use “Ler QR” no app para abrir a obra.</p>
      </div>
    </Modal>
  );
}

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

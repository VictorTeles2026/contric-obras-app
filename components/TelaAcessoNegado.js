"use client";

import { Logo } from "./ui";
import Icone from "./Icone";

// Mostrada quando há login mas não há cadastro utilizável (sem vínculo, desativado
// ou falha de rede). Antes a tela simplesmente ficava em branco.
export default function TelaAcessoNegado({ mensagem, onSair }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-panel p-5">
      <div className="cartao w-full max-w-sm p-6 text-center animar-surgir">
        <div className="flex justify-center mb-5"><Logo /></div>
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber/10 text-amber flex items-center justify-center mb-3">
          <Icone nome="alerta" className="w-6 h-6" />
        </div>
        <div className="font-head font-bold text-lg mb-1">Não foi possível entrar</div>
        <p className="text-sm text-muted leading-relaxed mb-5">{mensagem || "Não encontramos seu cadastro."}</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => window.location.reload()} className="btn btn-contorno w-full">Tentar novamente</button>
          <button onClick={onSair} className="btn btn-escuro w-full">Sair e entrar com outra conta</button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";

export default function LoginPage() {
  const { entrar, sessao } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  if (sessao) {
    router.replace("/dashboard");
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const error = await entrar(email, senha);
    setCarregando(false);
    if (error) {
      setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-panel px-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-line p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-cyan flex items-center justify-center text-white font-bold font-head">C</div>
          <span className="font-head font-bold text-lg text-textmain">Contric</span>
        </div>
        <h1 className="font-head font-bold text-xl mb-1">Entrar</h1>
        <p className="text-sm text-muted mb-6">Gestão de obras — acesso restrito.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-mono text-muteddim">E-MAIL</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-cyan"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muteddim">SENHA</label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:border-cyan"
            />
          </div>

          {erro && <div className="text-sm text-red bg-red/10 rounded-lg px-3 py-2">{erro}</div>}

          <button
            type="submit"
            disabled={carregando}
            className="mt-2 w-full py-2.5 rounded-lg bg-navy text-white font-semibold text-sm disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

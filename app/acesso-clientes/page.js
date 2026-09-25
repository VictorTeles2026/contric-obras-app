"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { rotaInicialPara } from "../../lib/rotas";
import { Spinner } from "../../components/ui";

// Entrada do portal de clientes — identidade própria em cinza escuro.
export default function AcessoClientesLogin() {
  const { entrar, sessao, usuario, carregando: carregandoAuth, erroCadastro, sair } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!carregandoAuth && sessao && usuario) router.replace(rotaInicialPara(usuario));
  }, [carregandoAuth, sessao, usuario, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErro(""); setCarregando(true);
    const error = await entrar(email, senha);
    setCarregando(false);
    if (error) setErro(/invalid login/i.test(error.message) ? "E-mail ou senha incorretos." : /banned/i.test(error.message) ? "Seu acesso está desativado. Fale com a Contric." : error.message);
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-900 text-zinc-100 flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-zinc-700/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 w-96 h-96 rounded-full bg-zinc-600/20 blur-3xl" />
      </div>
      <div className="relative flex-1 flex items-center justify-center p-5" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center font-head font-bold text-lg">C</div>
            <div>
              <div className="font-head font-bold text-lg leading-tight">Acesso Clientes</div>
              <div className="text-sm text-zinc-400 leading-tight">Contric — Gestão de Obras</div>
            </div>
          </div>
          <div className="rounded-2xl bg-zinc-800/90 border border-zinc-700 p-6 shadow-2xl">
            <h1 className="font-head font-bold text-2xl mb-1">Entrar</h1>
            <p className="text-sm text-zinc-400 mb-6">Acompanhe as informações das suas obras.</p>
            {!carregandoAuth && sessao && !usuario && erroCadastro ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3.5 py-3">{erroCadastro}</div>
                <button onClick={sair} className="w-full py-3 rounded-xl bg-zinc-100 text-zinc-900 font-semibold">Sair</button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <label className="block">
                  <span className="block text-xs font-medium text-zinc-400 mb-1">E-mail</span>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoCapitalize="none"
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-400" placeholder="seu@email.com" />
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-zinc-400 mb-1">Senha</span>
                  <div className="relative">
                    <input type={mostrar ? "text" : "password"} required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password"
                      className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 pr-20 text-base text-zinc-100 focus:outline-none focus:border-zinc-400" />
                    <button type="button" onClick={() => setMostrar((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 px-2 py-1.5">
                      {mostrar ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </label>
                {erro && <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3.5 py-3">{erro}</div>}
                <button type="submit" disabled={carregando || !email || !senha}
                  className="w-full py-3.5 rounded-xl bg-zinc-100 text-zinc-900 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition">
                  {carregando ? <><Spinner /> Entrando...</> : "Entrar"}
                </button>
              </form>
            )}
          </div>
          <p className="text-xs text-zinc-500 text-center mt-6">Recebeu o acesso por e-mail? Use o usuário e a senha enviados.</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { rotaInicialPara } from "../../lib/rotas";
import { Logo, Spinner, Aviso } from "../../components/ui";
import Icone from "../../components/Icone";

function traduzirErro(msg = "") {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado.";
  if (/banned|user is banned/i.test(msg)) return "Seu acesso está desabilitado. Fale com o administrador.";
  if (/failed to fetch|network/i.test(msg)) return "Sem conexão. Verifique a internet e tente de novo.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return msg;
}

export default function LoginPage() {
  const { entrar, sessao, usuario, carregando: carregandoAuth, erroCadastro, sair } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // redireciona dentro de um efeito (antes era chamado durante a renderização,
  // o que gera aviso do React e às vezes não navegava)
  useEffect(() => {
    if (!carregandoAuth && sessao && usuario) router.replace(rotaInicialPara(usuario));
  }, [carregandoAuth, sessao, usuario, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const error = await entrar(email, senha);
    setCarregando(false);
    if (error) setErro(traduzirErro(error.message));
    // o redirecionamento certo (por perfil) acontece no efeito acima, assim que "usuario" carregar
  };

  const logadoSemCadastro = !carregandoAuth && sessao && !usuario && erroCadastro;

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row bg-panel">
      {/* painel da marca (desktop) / faixa (mobile) */}
      <div className="relative overflow-hidden bg-navy text-white lg:w-[44%] px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-10 lg:p-12 flex flex-col justify-between">
        <div className="absolute -right-24 -top-24 w-72 h-72 rounded-full bg-cyan/20 blur-3xl" />
        <div className="absolute -left-16 bottom-0 w-60 h-60 rounded-full bg-cyan/10 blur-3xl" />
        <div className="relative"><Logo tamanho="lg" claro /></div>
        <div className="relative mt-8 lg:mt-0">
          <h2 className="font-head font-bold text-2xl lg:text-4xl leading-tight">Gestão de obras,<br className="hidden lg:block" /> do escritório ao canteiro.</h2>
          <p className="text-slate-300 mt-3 text-sm lg:text-base max-w-md">Cronograma, RDO, horas e recursos em um só lugar — no computador e no celular.</p>
        </div>
        <div className="relative hidden lg:block text-xs text-slate-400">© Contric</div>
      </div>

      <div className="flex-1 flex items-start lg:items-center justify-center px-4 -mt-6 lg:mt-0 pb-10">
        <div className="w-full max-w-sm cartao p-6 sm:p-8 shadow-xl lg:shadow-sm animar-surgir">
          <h1 className="font-head font-bold text-2xl mb-1">Entrar</h1>
          <p className="text-sm text-muted mb-6">Acesso restrito à equipe Contric.</p>

          {logadoSemCadastro ? (
            <div className="flex flex-col gap-3">
              <Aviso tipo="alerta">{erroCadastro}</Aviso>
              <button onClick={sair} className="btn btn-escuro btn-lg w-full">Sair e tentar outra conta</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
              <label className="block">
                <span className="rotulo">E-mail</span>
                <input type="email" required autoComplete="username" inputMode="email" autoCapitalize="none"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com" className="input input-lg" />
              </label>
              <label className="block">
                <span className="rotulo">Senha</span>
                <div className="relative">
                  <input type={mostrarSenha ? "text" : "password"} required autoComplete="current-password"
                    value={senha} onChange={(e) => setSenha(e.target.value)}
                    className="input input-lg pr-20" />
                  <button type="button" onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted px-2 py-1.5 rounded-md hover:bg-panel">
                    {mostrarSenha ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>

              {erro && <Aviso tipo="erro">{erro}</Aviso>}

              <button type="submit" disabled={carregando || !email || !senha} className="btn btn-escuro btn-lg w-full mt-1">
                {carregando ? <><Spinner /> Entrando...</> : <><Icone nome="entrar" className="w-5 h-5" /> Entrar</>}
              </button>
            </form>
          )}
          <a href="/acesso-clientes" className="block text-center text-sm text-muted hover:text-textmain mt-5">Sou cliente → <strong>Acesso Clientes Contric</strong></a>
        </div>
      </div>
    </div>
  );
}

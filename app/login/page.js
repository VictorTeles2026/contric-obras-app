"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { rotaInicialPara } from "../../lib/nav";
import { Logo, Spinner, Aviso } from "../../components/ui";
import Icone from "../../components/Icone";

function traduzirErro(msg = "") {
  if (/invalid login credentials/i.test(msg)) return "Usuário/e-mail ou senha incorretos.";
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
    // a imagem (16:9) fica sempre inteira e centralizada na tela; a parte azul ocupa
    // ~67% da largura e o login fica centralizado na faixa branca à direita.
    // Em telas estreitas (celular) usa a versão vertical como fundo (preso ao topo, na
    // largura da tela) e o login fica centralizado abaixo do título da imagem.
    <div className="min-h-[100dvh] bg-[#020f24] bg-[url(/tela-login-mobile.webp)] bg-[length:100%_auto] bg-top bg-no-repeat lg:bg-none lg:bg-white flex items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="relative w-full min-h-[100dvh] lg:min-h-0 lg:w-[min(100vw,calc(100dvh*16/9))] lg:aspect-[16/9] flex flex-col lg:block">
        <img src="/tela-login.webp" alt="Sistema de Gestão de Obras Contric"
          className="hidden lg:block lg:absolute lg:inset-0 lg:w-full lg:h-full lg:object-contain select-none" draggable={false} />
        <h1 className="sr-only lg:hidden">Sistema de Gestão de Obras Contric</h1>
      <div className="relative flex-1 pt-[calc(36vw+1rem)] pb-8 lg:pt-6 lg:absolute lg:top-0 lg:bottom-0 lg:right-0 lg:left-[67%] flex items-center justify-center px-4 lg:p-6">
        <div className="w-full max-w-sm cartao p-6 sm:p-8 shadow-2xl animar-surgir bg-white">
          <div className="flex justify-center mb-6"><Logo tamanho="xl" /></div>
          {logadoSemCadastro ? (
            <div className="flex flex-col gap-3">
              <Aviso tipo="alerta">{erroCadastro}</Aviso>
              <button onClick={sair} className="btn btn-escuro btn-lg w-full">Sair e tentar outra conta</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
              <label className="block">
                <span className="rotulo">E-mail ou usuário</span>
                <input type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com ou nome.usuario" className="input input-lg" />
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
    </div>
  );
}

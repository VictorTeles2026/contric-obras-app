"use client";

import { useMemo, useState } from "react";
import { useTabela, registrarLog, chamarApi } from "../../lib/dados";
import { useAuth, podeGerenciarUsuarios, pode } from "../../lib/AuthContext";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Modal, Campo, Aviso, Esqueleto, EstadoVazio, Spinner, SeletorEquipes } from "../../components/ui";
import { AREAS, FUNCOES, EQUIPE_CAMPO } from "../../lib/constantes";
import { normalizarLogin, erroLogin, ehEmail, sugerirLogin } from "../../lib/login";
import Icone from "../../components/Icone";
import VerSenhas from "../../components/VerSenhas";
import { ConfirmacaoDupla } from "../../components/AcoesMaster";

const PERFIS = [
  ["master", "Master (acesso total)"],
  ["gerente", "Gerente de Obras"],
  ["coordenador", "Coordenador de Equipes"],
  ["lider", "Líder Local"],
  ["funcionario", "Funcionário (mão de obra própria)"],
  ["terceiro", "Terceiro (mão de obra)"],
  ["visualizador", "Visualizador"],
];
const PERFIS_COM_FUNCAO = ["lider", "funcionario", "terceiro", "gerente", "coordenador"];
const COR_PERFIL = {
  master: "bg-navy text-white", gerente: "bg-cyan/10 text-cyan", coordenador: "bg-cyan/10 text-cyan",
  lider: "bg-green/10 text-green", funcionario: "bg-panel text-muted", terceiro: "bg-amber/10 text-amber", visualizador: "bg-panel text-muted",
};
// equipes do usuário como lista, venha do banco como vier (lista, texto "{A,B}" ou JSON)
function equipesDe(u) {
  const e = u?.equipes;
  if (Array.isArray(e)) return e.map((x) => String(x));
  if (typeof e === "string" && e.trim()) {
    try { const j = JSON.parse(e); if (Array.isArray(j)) return j.map(String); } catch { /* formato {A,B} */ }
    return e.replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
  }
  return [];
}
// é da equipe Campo? (sem diferenciar maiúsculas/minúsculas nem espaços nas pontas)
const ehDeCampo = (u) => equipesDe(u).some((x) => x.trim().toLowerCase() === EQUIPE_CAMPO.toLowerCase());
// login exibido: o campo "login"; usuários antigos (antes do campo existir) usam o e-mail
const loginDe = (u) => u.login || u.email || "";

export default function UsuariosPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const souMaster = podeGerenciarUsuarios(usuario); // pode criar/editar/habilitar (permissão usuario.editar)
  const podeVerSenha = pode(usuario, "usuario.senha");
  const podeExcluirUsuario = pode(usuario, "usuario.excluir");
  const { dados: usuarios, carregando, recarregar } = useTabela("usuarios", { order: { coluna: "nome" } });
  const { dados: empresas } = useTabela("empresas_terceiras", { order: { coluna: "nome" } });
  const empresasAtivas = empresas.filter((e) => e.ativa !== false);

  const [aba, setAba] = useState("geral"); // "geral" | "campo"
  const [modalAberto, setModalAberto] = useState(false);
  const [loteAberto, setLoteAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pinGerado, setPinGerado] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("");
  const [filtroEquipe, setFiltroEquipe] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState(""); // aba Usuários de Campo
  const [mostrarInativos, setMostrarInativos] = useState(true);
  const [alternando, setAlternando] = useState(null);
  const [vendoSenha, setVendoSenha] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  const abrirNovo = () => { setEditando(null); setModalAberto(true); };
  const abrirEdicao = (u) => { setEditando(u); setModalAberto(true); };

  const toggleAtivo = async (u) => {
    setAlternando(u.id);
    const { ok, json } = await chamarApi("/api/atualizar-usuario", { id: u.id, ativo: !u.ativo });
    setAlternando(null);
    if (!ok) { avisar(json.error || "Não foi possível alterar.", "erro", 6000); return; }
    await registrarLog(usuario, u.ativo ? "Desabilitou usuário" : "Habilitou usuário", u.nome);
    avisar(u.ativo ? `${u.nome} desabilitado.` : `${u.nome} habilitado.`);
    recarregar();
  };

  // a aba "Usuários de Campo" lista quem é da equipe Campo; a principal, os demais
  const daAba = usuarios.filter((u) => (aba === "campo" ? ehDeCampo(u) : !ehDeCampo(u)));
  const termo = busca.trim().toLowerCase();
  const filtrados = daAba.filter((u) =>
    (!filtroPerfil || u.perfil === filtroPerfil) && (!filtroEquipe || equipesDe(u).some((x) => x.trim().toLowerCase() === filtroEquipe.toLowerCase())) &&
    (aba !== "campo" || !filtroEmpresa || (filtroEmpresa === "__propria" ? u.perfil !== "terceiro" : (u.empresa_terceira || "").trim().toLowerCase() === filtroEmpresa)) && (mostrarInativos || u.ativo) &&
    (!termo || [u.nome, u.email, loginDe(u), u.funcao, u.empresa_terceira].some((c) => (c || "").toLowerCase().includes(termo))));
  const qtdCampo = usuarios.filter(ehDeCampo).length;

  // aba Usuários de Campo: funcionários (Contric) primeiro e depois os terceiros, um grupo por
  // empresa (empresas em ordem alfabética); dentro de cada grupo, ordem alfabética por nome
  const porNome = (a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR", { sensitivity: "base" });
  const grupos = useMemo(() => {
    if (aba !== "campo") return [{ titulo: null, itens: filtrados }];
    const proprios = filtrados.filter((u) => u.perfil !== "terceiro").sort(porNome);
    const porEmpresa = new Map();
    filtrados.filter((u) => u.perfil === "terceiro").forEach((u) => {
      const nome = (u.empresa_terceira || "").trim() || "Terceiros sem empresa";
      const chave = nome.toLowerCase();
      if (!porEmpresa.has(chave)) porEmpresa.set(chave, { titulo: nome, itens: [] });
      porEmpresa.get(chave).itens.push(u);
    });
    const terceiros = [...porEmpresa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }))
      .map((g) => ({ ...g, titulo: `Terceiros — ${g.titulo}`, itens: g.itens.sort(porNome) }));
    return [...(proprios.length ? [{ titulo: "Funcionários Contric", itens: proprios }] : []), ...terceiros];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, filtrados]);

  return (
    <PainelShell>
      <div className="p-4 md:p-8">
        <CabecalhoPagina
          titulo="Usuários e Acessos"
          subtitulo={`${usuarios.filter((u) => u.ativo).length} ativos de ${usuarios.length} cadastrados`}
          acoes={souMaster ? (
            <>
              {aba === "campo" && <button onClick={() => setLoteAberto(true)} className="btn btn-contorno !border-cyan !text-cyan hover:!bg-cyan/5"><Icone nome="mais2" className="w-4 h-4" /> Novos Usuários</button>}
              <button onClick={abrirNovo} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Novo usuário</button>
            </>
          ) : <span className="text-xs text-muteddim">Seu usuário não pode gerenciar usuários</span>}
        />

        <div className="flex gap-1 border-b border-line mb-4">
          {[["geral", "Usuários", usuarios.length - qtdCampo], ["campo", "Usuários de Campo", qtdCampo]].map(([v, l, n]) => (
            <button key={v} onClick={() => setAba(v)} className={`relative px-4 py-2.5 text-sm font-semibold ${aba === v ? "text-cyan" : "text-muted hover:text-textmain"}`}>
              {l} <span className="selo bg-panel text-muted ml-1">{n}</span>
              {aba === v && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
            </button>
          ))}
        </div>
        {aba === "campo" && <p className="text-sm text-muted mb-3">Usuários da equipe <strong>Campo</strong>. Use <strong>+ Novos Usuários</strong> para cadastrar várias pessoas de uma vez (ex: equipe nova numa obra).</p>}

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, usuário, e-mail, função ou empresa" className="input pl-9" />
          </div>
          <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} className="input sm:!w-56">
            <option value="">Todos os perfis</option>
            {PERFIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filtroEquipe} onChange={(e) => setFiltroEquipe(e.target.value)} className="input sm:!w-52">
            <option value="">Todas as equipes</option>
            {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {aba === "campo" && (
            <select value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} className={`input sm:!w-52 ${filtroEmpresa ? "!border-cyan/40 !text-cyan" : ""}`} aria-label="Filtrar por empresa terceira">
              <option value="">Todas as empresas</option>
              <option value="__propria">Contric (mão de obra própria)</option>
              {[...new Set([...empresas.map((e) => e.nome), ...daAba.map((u) => u.empresa_terceira).filter(Boolean)].map((n) => n.trim()))]
                .sort((a, b) => a.localeCompare(b, "pt-BR"))
                .map((n) => <option key={n} value={n.toLowerCase()}>{n}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap px-1 cursor-pointer">
            <input type="checkbox" className="accent-cyan w-4 h-4" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar desabilitados
          </label>
        </div>

        {carregando && <Esqueleto linhas={5} altura={64} />}
        {!carregando && filtrados.length === 0 && (
          <EstadoVazio icone="usuarios" titulo="Ninguém encontrado"
            texto={aba === "campo" && !daAba.length ? "Nenhum usuário da equipe Campo ainda." : "Ajuste a busca ou os filtros."}
            acao={aba === "campo" && souMaster && !daAba.length && <button onClick={() => setLoteAberto(true)} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Novos Usuários</button>} />
        )}

        {grupos.map((g) => (
        <div key={g.titulo || "todos"} className="mb-5">
          {g.titulo && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-sm font-semibold text-cyan">{g.titulo}</span>
              <span className="selo bg-panel text-muted">{g.itens.length}</span>
              <span className="flex-1 h-px bg-line" />
            </div>
          )}
        <div className="flex flex-col gap-2">
          {g.itens.map((u) => (
            <div key={u.id} className={`cartao flex flex-wrap items-center gap-3 p-3 md:p-4 transition-opacity ${!u.ativo ? "opacity-60" : ""}`}>
              <div className="w-10 h-10 rounded-full bg-panel border border-line flex items-center justify-center font-semibold text-sm text-muted shrink-0">
                {(u.nome || "?").split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  {u.nome}
                  {u.id === usuario?.id && <span className="selo bg-cyan/10 text-cyan">você</span>}
                </div>
                <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap mt-0.5">
                  <span className={`selo ${COR_PERFIL[u.perfil] || "bg-panel text-muted"}`}>{PERFIS.find((p) => p[0] === u.perfil)?.[1]?.split(" (")[0] || u.perfil}</span>
                  {u.funcao && <span>{u.funcao}</span>}
                  {equipesDe(u).map((a) => <span key={a} className="selo bg-cyan/10 text-cyan">{a}</span>)}
                </div>
              </div>
              <div className="text-xs text-muted min-w-[160px] break-all">
                {u.perfil === "terceiro" && u.tipo_terceiro === "avulso" ? (
                  <>{u.empresa_terceira || "—"}<div className="text-[11px]">Avulso · PIN {u.pin}</div></>
                ) : (
                  <>
                    <div title="Usuário de acesso"><Icone nome="chave" className="w-3 h-3 inline -mt-0.5 mr-1" /><span className="text-textmain font-medium">{loginDe(u) || "—"}</span></div>
                    {u.email && u.email !== loginDe(u) && <div>{u.email}</div>}
                    {u.perfil === "terceiro" && <div>{u.empresa_terceira || "—"}</div>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {podeVerSenha && u.auth_user_id && (
                  <button onClick={() => setVendoSenha(u)} className="btn btn-contorno btn-sm" title="Ver senha registrada"><Icone nome="chave" className="w-4 h-4" /> Senha</button>
                )}
                {souMaster && <button onClick={() => abrirEdicao(u)} className="btn btn-contorno btn-sm">Editar</button>}
                {podeExcluirUsuario && u.id !== usuario?.id && (
                  <button onClick={() => setExcluindo(u)} className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" title="Excluir usuário" aria-label={`Excluir ${u.nome}`}>
                    <Icone nome="lixo" className="w-4 h-4" />
                  </button>
                )}
                {souMaster && u.id !== usuario?.id ? (
                  <button onClick={() => toggleAtivo(u)} disabled={alternando === u.id} title={u.ativo ? "Clique para desabilitar" : "Clique para habilitar"}
                    className={`btn btn-sm border ${u.ativo ? "border-green/40 text-green bg-green/5 hover:bg-green/10" : "border-line text-muted bg-white hover:bg-panel"}`}>
                    {alternando === u.id ? <Spinner className="w-3.5 h-3.5" /> : <span className={`w-2 h-2 rounded-full ${u.ativo ? "bg-green" : "bg-muteddim"}`} />}
                    {u.ativo ? "Ativo" : "Desabilitado"}
                  </button>
                ) : (
                  <span className={`selo ${u.ativo ? "bg-green/10 text-green" : "bg-panel text-muted"}`}>{u.ativo ? "Ativo" : "Desabilitado"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
        ))}

        {excluindo && (
          <ConfirmacaoDupla titulo="Excluir usuário" onFechar={() => setExcluindo(null)}
            pergunta={<>Tem certeza que deseja excluir o usuário <strong>{excluindo.nome}</strong>?</>}
            perdas={<>O login é apagado e também tudo o que foi lançado por ele: horas, RDOs (com os PDFs), ocorrências registradas, solicitações e notificações. Onde ele só aparece como aprovador ou responsável, o registro fica sem o vínculo. Para apenas bloquear o acesso, use o botão Ativo/Desabilitado.</>}
            onConfirmar={async () => {
              const { ok, json } = await chamarApi("/api/excluir-usuario", { id: excluindo.id });
              if (!ok) return { erro: json.error || "Não foi possível excluir." };
              avisar(`${excluindo.nome} excluído — registrado na Auditoria.`, "info"); recarregar();
              return { ok: true };
            }} />
        )}
        {vendoSenha && <VerSenhas authUserId={vendoSenha.auth_user_id} nome={vendoSenha.nome} onFechar={() => setVendoSenha(null)} />}
        {modalAberto && (
          <ModalUsuario
            usuarioInicial={editando} deCampo={aba === "campo"} empresas={empresasAtivas}
            onClose={() => setModalAberto(false)}
            onSalvo={(msg) => { setModalAberto(false); avisar(msg); recarregar(); }}
            onPinGerado={setPinGerado}
          />
        )}
        {loteAberto && <CadastroEmLote usuariosExistentes={usuarios} empresas={empresasAtivas} onFechar={() => setLoteAberto(false)} onCriados={recarregar} />}

        {pinGerado && (
          <Modal titulo="Código gerado" onFechar={() => setPinGerado(null)} largura="max-w-xs"
            rodape={<button onClick={() => setPinGerado(null)} className="btn btn-primario w-full">Concluir</button>}>
            <div className="text-center">
              <div className="text-4xl font-mono font-bold text-cyan tracking-[0.3em] my-3">{pinGerado}</div>
              <p className="text-sm text-muted">Repasse pessoalmente. É reutilizável nas próximas obras.</p>
            </div>
          </Modal>
        )}
      </div>
    </PainelShell>
  );
}

function ModalUsuario({ usuarioInicial, deCampo, empresas = [], onClose, onSalvo, onPinGerado }) {
  const { usuario: usuarioAtual } = useAuth();
  const ehMaster = usuarioAtual?.perfil === "master"; // só o Master define o usuário (login)
  const editando = !!usuarioInicial;
  const [nome, setNome] = useState(usuarioInicial?.nome || "");
  const [perfil, setPerfil] = useState(usuarioInicial?.perfil || (deCampo ? "funcionario" : "lider"));
  const [funcao, setFuncao] = useState(usuarioInicial?.funcao || "");
  const [email, setEmail] = useState(usuarioInicial?.email || "");
  const loginInicial = usuarioInicial ? loginDe(usuarioInicial) : "";
  // "email" = o usuário de acesso é o próprio e-mail; "outro" = digitado
  const [modoLogin, setModoLogin] = useState(!usuarioInicial || !loginInicial || loginInicial === (usuarioInicial.email || "") ? "email" : "outro");
  const [loginDigitado, setLoginDigitado] = useState(modoLogin === "outro" ? loginInicial : "");
  const [senha, setSenha] = useState("");
  const [tipoTerceiro, setTipoTerceiro] = useState(usuarioInicial?.tipo_terceiro || "fixo");
  const [empresaTerceira, setEmpresaTerceira] = useState(usuarioInicial?.empresa_terceira || "");
  // ao editar, corrige a grafia das equipes para a da lista oficial (ex: "campo " → "Campo") — salvando, fica certo no banco
  const [equipes, setEquipes] = useState(() => usuarioInicial
    ? [...new Set(equipesDe(usuarioInicial).map((x) => AREAS.find((a) => a.toLowerCase() === x.trim().toLowerCase()) || x.trim()))]
    : (deCampo ? [EQUIPE_CAMPO] : []));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const mostraFuncao = PERFIS_COM_FUNCAO.includes(perfil);
  const ehTerceiroAvulso = perfil === "terceiro" && tipoTerceiro === "avulso";
  const precisaLoginNovo = !ehTerceiroAvulso && (!editando || !usuarioInicial?.auth_user_id);
  const senhaCurta = senha && senha.length < 6;
  const emailValido = !email || ehEmail(email);
  const login = normalizarLogin(modoLogin === "email" ? email : loginDigitado);
  const problemaLogin = !ehTerceiroAvulso && (modoLogin === "outro" || email) ? erroLogin(login) : null;
  const semLogin = !ehTerceiroAvulso && !login;
  const faltaEmpresa = perfil === "terceiro" && !empresaTerceira.trim();
  const podeSalvar = nome.trim() && !faltaEmpresa && !senhaCurta && emailValido && !problemaLogin && !semLogin && (!precisaLoginNovo || senha) && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErro("");
    const comum = { nome, perfil, funcao: mostraFuncao ? funcao : null, email: email || null, tipoTerceiro, empresaTerceira, equipes, ...(ehMaster ? { login } : {}) };
    const { ok, json } = editando
      ? await chamarApi("/api/atualizar-usuario", { id: usuarioInicial.id, ...comum, email: ehTerceiroAvulso ? null : comum.email, novaSenha: senha || undefined })
      : await chamarApi("/api/criar-usuario", { ...comum, senha });
    setSalvando(false);
    if (!ok) { setErro(json.error || "Não foi possível salvar."); return; }
    await registrarLog(usuarioAtual, editando ? "Editou usuário" : "Criou usuário", editando ? nome : `${nome} (${PERFIS.find((p) => p[0] === perfil)?.[1]})`);
    if (json.usuario?.pin && !usuarioInicial?.pin) onPinGerado(json.usuario.pin);
    onSalvo(editando ? "Alterações salvas." : `${nome} criado.`);
  };

  return (
    <Modal titulo={editando ? `Editar — ${usuarioInicial.nome}` : "Novo usuário"} onFechar={onClose}
      rodape={<>
        <button onClick={onClose} className="btn btn-fantasma">Cancelar</button>
        <button onClick={salvar} disabled={!podeSalvar} className="btn btn-primario">
          {salvando ? <><Spinner /> Salvando...</> : editando ? "Salvar alterações" : "Criar usuário"}
        </button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="flex flex-col gap-4">
        <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} className="input" autoFocus /></Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo rotulo="Perfil">
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="input">
              {PERFIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Campo>
          {mostraFuncao && (
            <Campo rotulo="Função">
              <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="input">
                <option value="">Selecione...</option>
                {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
                {funcao && !FUNCOES.includes(funcao) && <option value={funcao}>{funcao} (antiga)</option>}
              </select>
            </Campo>
          )}
        </div>

        <Campo rotulo="Equipes (opcional — pode marcar mais de uma; quem é da equipe Campo aparece na aba Usuários de Campo)">
          <SeletorEquipes opcoes={AREAS} valor={equipes} onChange={setEquipes} />
        </Campo>

        {perfil === "terceiro" && (
          <>
            <div>
              <span className="rotulo">Tipo de terceiro</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTipoTerceiro("fixo")} className={`chip ${tipoTerceiro === "fixo" ? "chip-ativo" : ""}`}>Fixo (login)</button>
                <button type="button" onClick={() => setTipoTerceiro("avulso")} className={`chip ${tipoTerceiro === "avulso" ? "!bg-amber !text-white !border-amber" : ""}`}>Avulso (PIN)</button>
              </div>
              {editando && usuarioInicial?.pin && ehTerceiroAvulso && (
                <div className="text-xs text-muteddim mt-1.5">PIN atual: {usuarioInicial.pin}</div>
              )}
            </div>
            <Campo rotulo="Empresa terceira (obrigatório)">
              <SeletorEmpresa empresas={empresas} valor={empresaTerceira} onChange={setEmpresaTerceira} />
            </Campo>
          </>
        )}

        {!ehTerceiroAvulso && (
          <>
            <Campo rotulo={modoLogin === "email" ? "E-mail (é também o usuário de acesso)" : "E-mail (opcional — contato)"}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="off" />
              {!emailValido && <span className="block text-xs text-red mt-1">E-mail inválido.</span>}
            </Campo>
            <div>
              <span className="rotulo">Usuário de acesso (login){!ehMaster && " — só o Master altera"}</span>
              <div className="flex flex-wrap gap-2 mb-2">
                <button type="button" disabled={!ehMaster} onClick={() => setModoLogin("email")} className={`chip ${modoLogin === "email" ? "chip-ativo" : ""}`}>Usar o e-mail</button>
                <button type="button" disabled={!ehMaster} onClick={() => { setModoLogin("outro"); if (!loginDigitado) setLoginDigitado(sugerirLogin(nome)); }} className={`chip ${modoLogin === "outro" ? "chip-ativo" : ""}`}>Outro (digitar)</button>
              </div>
              {modoLogin === "outro" ? (
                <input value={loginDigitado} onChange={(e) => setLoginDigitado(e.target.value.toLowerCase().replace(/\s/g, ""))} disabled={!ehMaster}
                  className={`input ${problemaLogin ? "!border-red" : ""}`} placeholder="ex: joao.silva" autoComplete="off" />
              ) : (
                <div className="text-sm text-muted">{email ? <>A pessoa entra com <strong className="text-textmain">{normalizarLogin(email)}</strong></> : "Preencha o e-mail acima."}</div>
              )}
              {problemaLogin && <span className="block text-xs text-red mt-1">{problemaLogin}</span>}
            </div>
            <Campo rotulo={editando && !precisaLoginNovo ? "Nova senha (opcional)" : "Senha inicial"}>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="input" autoComplete="new-password"
                placeholder={editando && !precisaLoginNovo ? "Deixe em branco para manter" : "Mínimo 6 caracteres"} />
              {senhaCurta && <span className="block text-xs text-red mt-1">Mínimo de 6 caracteres.</span>}
            </Campo>
          </>
        )}

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ---------- cadastro em batelada (aba Usuários de Campo) ----------
const PERFIS_LOTE = PERFIS.filter(([v]) => ["funcionario", "terceiro", "lider", "visualizador"].includes(v));
const linhaVazia = () => ({ chave: Math.random().toString(36).slice(2), nome: "", login: "", loginEditado: false, email: "", senha: "", perfil: "funcionario", funcao: "", empresa: "", status: null, erro: "" });
const gerarSenha = () => {
  const letras = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => letras[Math.floor(Math.random() * letras.length)]).join("");
};

function CadastroEmLote({ usuariosExistentes, empresas = [], onFechar, onCriados }) {
  const { usuario: usuarioAtual } = useAuth();
  const { avisar } = useToast();
  const ehMaster = usuarioAtual?.perfil === "master";
  const [linhas, setLinhas] = useState(() => Array.from({ length: 5 }, linhaVazia));
  const [enviando, setEnviando] = useState(false);
  const [criados, setCriados] = useState([]); // { nome, login, senha }

  const alterar = (i, patch) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const preenchidas = linhas.filter((l) => l.nome.trim() && l.status !== "ok");
  const loginsUsados = new Set(usuariosExistentes.map((u) => normalizarLogin(loginDe(u))));
  const problemaDa = (l, i) => {
    if (!l.nome.trim()) return null;
    const lg = normalizarLogin(l.login || l.email);
    const e = erroLogin(lg);
    if (e) return e;
    if (loginsUsados.has(lg)) return "Usuário já existe.";
    if (linhas.some((o, k) => k !== i && o.nome.trim() && normalizarLogin(o.login || o.email) === lg)) return "Usuário repetido na tabela.";
    if (l.email && !ehEmail(l.email)) return "E-mail inválido.";
    if (!l.senha || l.senha.length < 6) return "Senha com 6+ caracteres.";
    if (l.perfil === "terceiro" && !l.empresa.trim()) return "Informe a empresa.";
    return null;
  };
  const comProblema = linhas.some((l, i) => l.status !== "ok" && problemaDa(l, i));

  // ao digitar o nome, sugere o usuário "nome.sobrenome" (se ainda não foi editado à mão)
  const mudarNome = (i, nome) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, nome, ...(l.loginEditado || !ehMaster ? {} : { login: sugerirLogin(nome) }) } : l)));
  const gerarSenhas = () => setLinhas((p) => p.map((l) => (l.nome.trim() && !l.senha ? { ...l, senha: gerarSenha() } : l)));
  const repetirParaBaixo = (campo) => setLinhas((p) => { const v = p[0][campo]; return p.map((l) => ({ ...l, [campo]: v })); });

  const enviar = async () => {
    if (!preenchidas.length || comProblema) return;
    setEnviando(true);
    const alvo = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.nome.trim() && l.status !== "ok");
    const { ok, json } = await chamarApi("/api/criar-usuario", {
      lote: alvo.map(({ l }) => ({
        nome: l.nome.trim(), email: l.email.trim() || null, login: ehMaster ? normalizarLogin(l.login || l.email) : undefined,
        senha: l.senha, perfil: l.perfil, funcao: l.funcao || null, tipoTerceiro: "fixo", empresaTerceira: l.empresa.trim() || null,
        equipes: [EQUIPE_CAMPO],
      })),
    });
    setEnviando(false);
    if (!ok) { avisar(json.error || "Não foi possível criar.", "erro", 7000); return; }
    const novos = [];
    setLinhas((p) => p.map((l, k) => {
      const pos = alvo.findIndex((a) => a.i === k);
      if (pos === -1) return l;
      const r = json.resultados[pos];
      if (r?.usuario) novos.push({ nome: l.nome.trim(), login: r.usuario.login || normalizarLogin(l.login || l.email), senha: l.senha });
      return r?.usuario ? { ...l, status: "ok", erro: "" } : { ...l, status: "erro", erro: r?.erro || "Falhou." };
    }));
    setCriados((c) => [...c, ...novos]);
    const falhas = json.resultados.filter((r) => !r.usuario).length;
    onCriados();
    // tudo certo: mostra a tela de conclusão (com os usuários e senhas para copiar e o botão Concluir)
    if (!falhas) { setConcluido(true); return; }
    avisar(`${json.resultados.length - falhas} usuário(s) criado(s) · ${falhas} com erro (veja na tabela).`, "erro", 7000);
  };
  const [concluido, setConcluido] = useState(false);

  const copiarCredenciais = async () => {
    const texto = criados.map((c) => `${c.nome}\nUsuário: ${c.login}\nSenha: ${c.senha}`).join("\n\n");
    try { await navigator.clipboard.writeText(texto); avisar("Credenciais copiadas."); } catch { avisar("Não foi possível copiar.", "erro"); }
  };

  const cel = "px-1.5 py-1.5 align-top";
  const inp = "input !py-1.5 !px-2 !text-sm";

  if (concluido) {
    return (
      <Modal titulo="Usuários criados" onFechar={onFechar} confirmarAoFechar={false} largura="max-w-2xl"
        rodape={<>
          <button onClick={copiarCredenciais} className="btn btn-contorno"><Icone nome="copiar" className="w-4 h-4" /> Copiar usuários e senhas</button>
          <button onClick={() => { setConcluido(false); setLinhas(Array.from({ length: 5 }, linhaVazia)); }} className="btn btn-fantasma">Criar mais</button>
          <button onClick={onFechar} className="btn btn-primario">Concluir</button>
        </>}>
        <Aviso tipo="sucesso" className="mb-3">{criados.length} usuário(s) criado(s) na equipe Campo. Copie os usuários e senhas para entregar à equipe — as senhas não aparecem de novo.</Aviso>
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b border-line"><th className="py-2 titulo-secao">Nome</th><th className="py-2 titulo-secao">Usuário</th><th className="py-2 titulo-secao">Senha</th></tr></thead>
          <tbody>
            {criados.map((c) => (
              <tr key={c.login} className="border-b border-line/60">
                <td className="py-1.5">{c.nome}</td><td className="py-1.5 font-medium">{c.login}</td><td className="py-1.5 font-mono">{c.senha}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    );
  }

  return (
    <Modal titulo="Novos usuários de campo (em lote)" onFechar={() => !enviando && onFechar()} largura="max-w-[min(1200px,96vw)]"
      rodape={<>
        <span className="text-sm text-muted mr-auto self-center">{preenchidas.length} para criar{criados.length ? ` · ${criados.length} criado(s)` : ""}</span>
        {criados.length > 0 && <button onClick={copiarCredenciais} className="btn btn-contorno"><Icone nome="copiar" className="w-4 h-4" /> Copiar usuários e senhas</button>}
        <button onClick={onFechar} disabled={enviando} className="btn btn-fantasma">Fechar</button>
        <button onClick={enviar} disabled={!preenchidas.length || comProblema || enviando} className="btn btn-primario">
          {enviando ? <><Spinner /> Criando...</> : `Criar ${preenchidas.length || ""} usuário(s)`}
        </button>
      </>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => setLinhas((p) => [...p, linhaVazia()])} className="btn btn-contorno btn-sm"><Icone nome="mais2" className="w-4 h-4" /> 1 linha</button>
        <button onClick={() => setLinhas((p) => [...p, ...Array.from({ length: 10 }, linhaVazia)])} className="btn btn-contorno btn-sm"><Icone nome="mais2" className="w-4 h-4" /> 10 linhas</button>
        <button onClick={gerarSenhas} className="btn btn-contorno btn-sm">Gerar senhas vazias</button>
        <span className="texto-apoio">Todos entram na equipe <strong>Campo</strong>. O usuário é sugerido a partir do nome (nome.sobrenome){ehMaster ? " e pode ser editado" : ""}.</span>
      </div>
      <div className="overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm min-w-[1080px]">
          <thead className="bg-panel sticky top-0 z-10">
            <tr className="text-left">
              <th className="px-2 py-2 titulo-secao w-8">#</th>
              <th className="px-2 py-2 titulo-secao">Nome *</th>
              <th className="px-2 py-2 titulo-secao">Usuário (login) *</th>
              <th className="px-2 py-2 titulo-secao">E-mail</th>
              <th className="px-2 py-2 titulo-secao">Senha *</th>
              <th className="px-2 py-2 titulo-secao">Perfil <button onClick={() => repetirParaBaixo("perfil")} className="normal-case font-normal text-cyan hover:underline ml-1" title="Repetir o valor da 1ª linha em todas">↓ repetir</button></th>
              <th className="px-2 py-2 titulo-secao">Função <button onClick={() => repetirParaBaixo("funcao")} className="normal-case font-normal text-cyan hover:underline ml-1" title="Repetir o valor da 1ª linha em todas">↓ repetir</button></th>
              <th className="px-2 py-2 titulo-secao">Empresa (terceiro) <button onClick={() => repetirParaBaixo("empresa")} className="normal-case font-normal text-cyan hover:underline ml-1" title="Repetir o valor da 1ª linha em todas">↓ repetir</button></th>
              <th className="px-2 py-2 titulo-secao w-10" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const travada = l.status === "ok";
              return (
                <tr key={l.chave} className={`border-t border-line ${travada ? "bg-green/5" : l.status === "erro" ? "bg-red/5" : ""}`}>
                  <td className={`${cel} text-muteddim pt-3`}>{i + 1}</td>
                  <td className={cel}><input value={l.nome} disabled={travada} onChange={(e) => mudarNome(i, e.target.value)} className={inp} placeholder="Nome completo" /></td>
                  <td className={cel}><input value={l.login} disabled={travada || !ehMaster} onChange={(e) => alterar(i, { login: e.target.value.toLowerCase().replace(/\s/g, ""), loginEditado: true })} className={inp} placeholder={ehMaster ? "nome.sobrenome" : "usa o e-mail"} /></td>
                  <td className={cel}><input value={l.email} disabled={travada} onChange={(e) => alterar(i, { email: e.target.value })} className={inp} placeholder="opcional" /></td>
                  <td className={cel}><input value={l.senha} disabled={travada} onChange={(e) => alterar(i, { senha: e.target.value })} className={`${inp} font-mono`} placeholder="6+ caracteres" /></td>
                  <td className={cel}>
                    <select value={l.perfil} disabled={travada} onChange={(e) => alterar(i, { perfil: e.target.value })} className={inp}>
                      {PERFIS_LOTE.map(([v, t]) => <option key={v} value={v}>{t.split(" (")[0]}</option>)}
                    </select>
                  </td>
                  <td className={cel}>
                    <select value={l.funcao} disabled={travada} onChange={(e) => alterar(i, { funcao: e.target.value })} className={inp}>
                      <option value="">—</option>
                      {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                  <td className={cel}>{l.perfil === "terceiro"
                    ? <SeletorEmpresa empresas={empresas} valor={l.empresa} disabled={travada} onChange={(v) => alterar(i, { empresa: v })} compacto />
                    : <span className="text-muteddim text-xs pl-1">—</span>}</td>
                  <td className={`${cel} pt-2`}>
                    {travada ? <span className="text-green font-bold" title="Criado">✓</span> : (
                      <button onClick={() => setLinhas((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : [linhaVazia()]))} className="p-1.5 rounded-lg text-muteddim hover:text-red hover:bg-red/5" aria-label="Remover linha"><Icone nome="lixo" className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* pendências por linha (antes de criar) e erros devolvidos pelo servidor */}
      {linhas.some((l, i) => (l.status !== "ok" && problemaDa(l, i)) || l.erro) && (
        <div className="mt-3 flex flex-col gap-1 text-xs">
          {linhas.map((l, i) => {
            const msg = l.erro || (l.status !== "ok" ? problemaDa(l, i) : null);
            return msg ? <div key={l.chave} className="text-red">Linha {i + 1} ({l.nome || "sem nome"}): {msg}</div> : null;
          })}
        </div>
      )}
    </Modal>
  );
}

// Lista das empresas terceiras cadastradas (Recursos → Empresas terceiras).
// O cadastro do usuário guarda o NOME da empresa; um nome antigo fora da lista continua aparecendo.
function SeletorEmpresa({ empresas, valor, onChange, disabled, compacto }) {
  const nomes = empresas.map((e) => e.nome);
  const fora = valor && !nomes.some((n) => n.trim().toLowerCase() === valor.trim().toLowerCase());
  return (
    <>
      <select value={fora ? valor : (nomes.find((n) => n.trim().toLowerCase() === (valor || "").trim().toLowerCase()) || "")} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} className={compacto ? "input !py-1.5 !px-2 !text-sm" : `input ${!valor ? "!border-amber" : ""}`}>
        <option value="">Selecione a empresa...</option>
        {empresas.map((e) => <option key={e.id} value={e.nome}>{e.nome}{e.cnpj && !compacto ? ` — ${e.cnpj}` : ""}</option>)}
        {fora && <option value={valor}>{valor} (não cadastrada)</option>}
      </select>
      {!compacto && !empresas.length && <span className="block text-xs text-amber mt-1">Nenhuma empresa cadastrada — cadastre em Recursos → Empresas terceiras.</span>}
    </>
  );
}
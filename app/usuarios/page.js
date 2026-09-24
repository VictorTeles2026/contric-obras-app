"use client";

import { useState } from "react";
import { useTabela, registrarLog, chamarApi } from "../../lib/dados";
import { useAuth, podeGerenciarUsuarios } from "../../lib/AuthContext";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Modal, Campo, Aviso, Esqueleto, EstadoVazio, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const PERFIS = [
  ["master", "Master (acesso total)"],
  ["gerente", "Gerente de Obras"],
  ["coordenador", "Coordenador de Equipes"],
  ["lider", "Líder Local"],
  ["funcionario", "Funcionário (mão de obra própria)"],
  ["terceiro", "Terceiro (mão de obra)"],
  ["visualizador", "Visualizador"],
];
const FUNCOES = [
  "Líder", "Programador", "Eletricista Eletromecânico", "Eletricista Força e Controle",
  "Mecânico", "Serralheiro", "Encanador", "Téc. Automação", "Téc. Eletrotécnica",
  "Téc. Mecatrônico", "Pedreiro", "Técnico de Segurança",
  "Projetista Mecânico", "Projetista Elétrico", "Gerente de Engenharia Elétrica",
  "Gerente de Engenharia Mecânica", "Gestor de Projetos", "Gerente de Engenharia", "Diretor",
];
const PERFIS_COM_FUNCAO = ["lider", "funcionario", "terceiro", "gerente", "coordenador"];
const COR_PERFIL = {
  master: "bg-navy text-white", gerente: "bg-cyan/10 text-cyan", coordenador: "bg-cyan/10 text-cyan",
  lider: "bg-green/10 text-green", funcionario: "bg-panel text-muted", terceiro: "bg-amber/10 text-amber", visualizador: "bg-panel text-muted",
};

export default function UsuariosPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const souMaster = podeGerenciarUsuarios(usuario);
  const { dados: usuarios, carregando, recarregar } = useTabela("usuarios", { order: { coluna: "nome" } });

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pinGerado, setPinGerado] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(true);
  const [alternando, setAlternando] = useState(null);

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

  const termo = busca.trim().toLowerCase();
  const filtrados = usuarios.filter((u) =>
    (!filtroPerfil || u.perfil === filtroPerfil) && (mostrarInativos || u.ativo) &&
    (!termo || [u.nome, u.email, u.funcao, u.empresa_terceira].some((c) => (c || "").toLowerCase().includes(termo))));

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <CabecalhoPagina
          titulo="Usuários e Acessos"
          subtitulo={`${usuarios.filter((u) => u.ativo).length} ativos de ${usuarios.length} cadastrados`}
          acoes={souMaster
            ? <button onClick={abrirNovo} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Novo usuário</button>
            : <span className="text-xs text-muteddim">Somente o Master pode gerenciar usuários</span>}
        />

        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail, função ou empresa" className="input pl-9" />
          </div>
          <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} className="input sm:!w-56">
            <option value="">Todos os perfis</option>
            {PERFIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted whitespace-nowrap px-1 cursor-pointer">
            <input type="checkbox" className="accent-cyan w-4 h-4" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar desabilitados
          </label>
        </div>

        {carregando && <Esqueleto linhas={5} altura={64} />}
        {!carregando && filtrados.length === 0 && <EstadoVazio icone="usuarios" titulo="Ninguém encontrado" texto="Ajuste a busca ou os filtros." />}

        <div className="flex flex-col gap-2">
          {filtrados.map((u) => (
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
                </div>
              </div>
              <div className="text-xs text-muted min-w-[160px] break-all">
                {u.perfil === "terceiro" ? (
                  <>
                    {u.empresa_terceira || "—"}
                    <div className="font-mono text-[11px]">{u.tipo_terceiro === "avulso" ? `Avulso · PIN ${u.pin}` : "Fixo · login"}</div>
                  </>
                ) : (u.email || "—")}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {souMaster && (
                  <button onClick={() => abrirEdicao(u)} className="btn btn-contorno btn-sm">Editar</button>
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

        {modalAberto && (
          <ModalUsuario
            usuarioInicial={editando}
            onClose={() => setModalAberto(false)}
            onSalvo={(msg) => { setModalAberto(false); avisar(msg); recarregar(); }}
            onPinGerado={setPinGerado}
          />
        )}

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

function ModalUsuario({ usuarioInicial, onClose, onSalvo, onPinGerado }) {
  const { usuario: usuarioAtual } = useAuth();
  const editando = !!usuarioInicial;
  const [nome, setNome] = useState(usuarioInicial?.nome || "");
  const [perfil, setPerfil] = useState(usuarioInicial?.perfil || "lider");
  const [funcao, setFuncao] = useState(usuarioInicial?.funcao || "");
  const [email, setEmail] = useState(usuarioInicial?.email || "");
  const [senha, setSenha] = useState("");
  const [tipoTerceiro, setTipoTerceiro] = useState(usuarioInicial?.tipo_terceiro || "fixo");
  const [empresaTerceira, setEmpresaTerceira] = useState(usuarioInicial?.empresa_terceira || "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const mostraFuncao = PERFIS_COM_FUNCAO.includes(perfil);
  const ehTerceiroAvulso = perfil === "terceiro" && tipoTerceiro === "avulso";
  const precisaLoginNovo = !ehTerceiroAvulso && (!editando || !usuarioInicial?.auth_user_id);
  const senhaCurta = senha && senha.length < 6;
  const emailValido = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // login novo (criação, ou terceiro avulso que passa a ter login) exige e-mail e senha
  const podeSalvar = nome.trim() && !senhaCurta && emailValido && (!precisaLoginNovo || (email.trim() && senha)) && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErro("");
    if (editando) {
      const { ok, json } = await chamarApi("/api/atualizar-usuario", {
        id: usuarioInicial.id, nome, perfil, funcao: mostraFuncao ? funcao : null,
        email: ehTerceiroAvulso ? null : email, novaSenha: senha || undefined,
        tipoTerceiro, empresaTerceira,
      });
      setSalvando(false);
      if (!ok) { setErro(json.error || "Não foi possível salvar."); return; }
      await registrarLog(usuarioAtual, "Editou usuário", nome);
      if (json.usuario?.pin && !usuarioInicial.pin) onPinGerado(json.usuario.pin);
      onSalvo("Alterações salvas.");
    } else {
      const { ok, json } = await chamarApi("/api/criar-usuario", {
        nome, perfil, funcao: mostraFuncao ? funcao : null, email, senha, tipoTerceiro, empresaTerceira,
      });
      setSalvando(false);
      if (!ok) { setErro(json.error || "Não foi possível criar."); return; }
      await registrarLog(usuarioAtual, "Criou usuário", `${nome} (${PERFIS.find((p) => p[0] === perfil)?.[1]})`);
      if (json.usuario?.pin) onPinGerado(json.usuario.pin);
      onSalvo(`${nome} criado.`);
    }
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
              </select>
            </Campo>
          )}
        </div>

        {perfil === "terceiro" && (
          <>
            <div>
              <span className="rotulo">Tipo de terceiro</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTipoTerceiro("fixo")} className={`chip ${tipoTerceiro === "fixo" ? "chip-ativo" : ""}`}>Fixo (login)</button>
                <button type="button" onClick={() => setTipoTerceiro("avulso")} className={`chip ${tipoTerceiro === "avulso" ? "!bg-amber !text-white !border-amber" : ""}`}>Avulso (PIN)</button>
              </div>
              {editando && usuarioInicial?.pin && ehTerceiroAvulso && (
                <div className="text-xs font-mono text-muteddim mt-1.5">PIN atual: {usuarioInicial.pin}</div>
              )}
            </div>
            <Campo rotulo="Empresa terceira"><input value={empresaTerceira} onChange={(e) => setEmpresaTerceira(e.target.value)} className="input" /></Campo>
          </>
        )}

        {!ehTerceiroAvulso && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo rotulo="E-mail (login)">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="off" />
              {!emailValido && <span className="block text-xs text-red mt-1">E-mail inválido.</span>}
            </Campo>
            <Campo rotulo={editando && !precisaLoginNovo ? "Nova senha (opcional)" : "Senha inicial"}>
              <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="input" autoComplete="new-password"
                placeholder={editando && !precisaLoginNovo ? "Deixe em branco para manter" : "Mínimo 6 caracteres"} />
              {senhaCurta && <span className="block text-xs text-red mt-1">Mínimo de 6 caracteres.</span>}
            </Campo>
          </div>
        )}

        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

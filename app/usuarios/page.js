"use client";

import { useState } from "react";
import { useTabela, registrarLog } from "../../lib/dados";
import { useAuth, podeGerenciarUsuarios } from "../../lib/AuthContext";
import PainelShell from "../../components/PainelShell";

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
];
const PERFIS_COM_FUNCAO = ["lider", "funcionario", "terceiro"];

export default function UsuariosPage() {
  const { usuario } = useAuth();
  const souMaster = podeGerenciarUsuarios(usuario);
  const { dados: usuarios, recarregar } = useTabela("usuarios", { order: { coluna: "created_at" } });

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pinGerado, setPinGerado] = useState(null);

  const abrirNovo = () => { setEditando(null); setModalAberto(true); };
  const abrirEdicao = (u) => { setEditando(u); setModalAberto(true); };

  const toggleAtivo = async (u) => {
    await fetch("/api/atualizar-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, ativo: !u.ativo, auth_user_id: u.auth_user_id }),
    });
    await registrarLog(usuario, u.ativo ? "Desabilitou usuário" : "Habilitou usuário", u.nome);
    recarregar();
  };

  return (
    <PainelShell>
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-head font-bold text-xl">Usuários e Acessos</h1>
          <p className="text-sm text-muted">Quem acessa o sistema, com qual perfil.</p>
        </div>
        {souMaster ? (
          <button onClick={abrirNovo} className="px-4 py-2 rounded-lg bg-cyan text-white text-sm font-semibold">
            + Novo usuário
          </button>
        ) : (
          <span className="text-xs font-mono text-muteddim">👁 Somente o Master pode gerenciar usuários</span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div key={u.id} className={`flex flex-wrap items-center gap-3 p-3 rounded-lg bg-panel ${!u.ativo ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-[160px]">
              <div className="text-sm font-semibold">{u.nome}</div>
              <div className="text-[11px] font-mono text-muteddim">
                {PERFIS.find((p) => p[0] === u.perfil)?.[1]}{u.funcao ? ` · ${u.funcao}` : ""}
              </div>
            </div>
            <div className="text-xs text-muted min-w-[140px]">
              {u.perfil === "terceiro" ? (
                <>
                  {u.empresa_terceira}
                  <div className="font-mono text-[10.5px]">
                    {u.tipo_terceiro === "fixo" ? "Fixo · login" : `Avulso · PIN ${u.pin}`}
                  </div>
                </>
              ) : (u.email || "—")}
            </div>
            {souMaster && (
              <button onClick={() => abrirEdicao(u)} className="text-xs border border-line rounded-full px-3 py-1 text-muted">
                Editar
              </button>
            )}
            {souMaster ? (
              <button onClick={() => toggleAtivo(u)} className={`text-xs rounded-full px-3 py-1 border font-mono ${u.ativo ? "border-green text-green" : "border-muteddim text-muteddim"}`}>
                {u.ativo ? "ATIVO" : "DESABILITADO"}
              </button>
            ) : (
              <span className={`text-xs rounded-full px-3 py-1 border font-mono ${u.ativo ? "border-green text-green" : "border-muteddim text-muteddim"}`}>
                {u.ativo ? "ATIVO" : "DESABILITADO"}
              </span>
            )}
          </div>
        ))}
      </div>

      {modalAberto && (
        <ModalUsuario
          usuarioInicial={editando}
          onClose={() => setModalAberto(false)}
          onSalvo={() => { setModalAberto(false); recarregar(); }}
          onPinGerado={setPinGerado}
        />
      )}

      {pinGerado && (
        <div className="fixed inset-0 bg-navy/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-xs p-6 text-center">
            <div className="font-head font-bold mb-2">Código gerado</div>
            <div className="text-3xl font-mono font-bold text-cyan tracking-widest my-3">{pinGerado}</div>
            <p className="text-xs text-muted mb-4">Repasse pessoalmente. É reutilizável nas próximas obras.</p>
            <button onClick={() => setPinGerado(null)} className="w-full py-2 rounded-lg bg-cyan text-white text-sm font-semibold">
              Concluir
            </button>
          </div>
        </div>
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
  const podeSalvar = nome.trim() && (editando || perfil !== "terceiro" || tipoTerceiro === "avulso" || (email && senha));

  const salvar = async () => {
    setSalvando(true); setErro("");
    if (editando) {
      const res = await fetch("/api/atualizar-usuario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: usuarioInicial.id, nome, funcao: mostraFuncao ? funcao : null }),
      });
      const json = await res.json();
      setSalvando(false);
      if (!res.ok) { setErro(json.error); return; }
      await registrarLog(usuarioAtual, "Editou usuário", nome);
      onSalvo();
    } else {
      const res = await fetch("/api/criar-usuario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, perfil, funcao: mostraFuncao ? funcao : null, email, senha, tipoTerceiro, empresaTerceira }),
      });
      const json = await res.json();
      setSalvando(false);
      if (!res.ok) { setErro(json.error); return; }
      await registrarLog(usuarioAtual, "Criou usuário", `${nome} (${PERFIS.find((p) => p[0] === perfil)?.[1]})`);
      if (json.usuario?.pin) onPinGerado(json.usuario.pin);
      onSalvo();
    }
  };

  return (
    <div className="fixed inset-0 bg-navy/50 flex items-start justify-center p-4 pt-16 z-50 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <div className="font-head font-bold mb-4">{editando ? `Editar — ${usuarioInicial.nome}` : "Novo usuário"}</div>

        <div className="flex flex-col gap-3">
          <Campo label="NOME"><input value={nome} onChange={(e) => setNome(e.target.value)} className="input" /></Campo>

          {!editando && (
            <Campo label="PERFIL">
              <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="input">
                {PERFIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Campo>
          )}

          {mostraFuncao && (
            <Campo label="FUNÇÃO">
              <select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="input">
                <option value="">Selecione...</option>
                {FUNCOES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Campo>
          )}

          {!editando && perfil === "terceiro" && (
            <>
              <Campo label="TIPO DE TERCEIRO">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTipoTerceiro("fixo")} className={`px-3 py-1.5 rounded-full text-xs border ${tipoTerceiro === "fixo" ? "bg-cyan text-white border-cyan" : "border-line text-muted"}`}>Fixo (login)</button>
                  <button type="button" onClick={() => setTipoTerceiro("avulso")} className={`px-3 py-1.5 rounded-full text-xs border ${tipoTerceiro === "avulso" ? "bg-amber text-white border-amber" : "border-line text-muted"}`}>Avulso (PIN)</button>
                </div>
              </Campo>
              <Campo label="EMPRESA TERCEIRA"><input value={empresaTerceira} onChange={(e) => setEmpresaTerceira(e.target.value)} className="input" /></Campo>
            </>
          )}

          {!editando && (perfil !== "terceiro" || tipoTerceiro === "fixo") && (
            <>
              <Campo label="E-MAIL (login)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></Campo>
              <Campo label="SENHA INICIAL"><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="input" /></Campo>
            </>
          )}

          {erro && <div className="text-xs text-red bg-red/10 rounded-lg px-3 py-2">{erro}</div>}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-2 text-sm text-muted">Cancelar</button>
          <button onClick={salvar} disabled={!podeSalvar || salvando} className="px-4 py-2 rounded-lg bg-cyan text-white text-sm font-semibold disabled:opacity-50">
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar usuário"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .input { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #D7E0EC; font-size: 13px; }
      `}</style>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-mono text-muteddim mb-1">{label}</div>
      {children}
    </div>
  );
}

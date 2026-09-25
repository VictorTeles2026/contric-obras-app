"use client";

import { useState } from "react";
import { useTabela, chamarApi } from "../../lib/dados";
import { useAuth, podeGerenciarClientes } from "../../lib/AuthContext";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import VerSenhas from "../../components/VerSenhas";
import { ConfirmarExclusao } from "../../components/AcoesMaster";
import { CabecalhoPagina, EstadoVazio, Esqueleto, Aviso, Modal, Campo, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const ACESSOS = [["ver_atas", "Atas de reuniões"], ["ver_rdos_assinados", "RDOs assinados (PDF)"], ["ver_linha_tempo", "Linha do tempo"]];
const mascaraTelefone = (v) => {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  return d.length <= 10 ? d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2") : d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

export default function ClientesPage() {
  const { usuario } = useAuth();
  const { avisar } = useToast();
  const pode = podeGerenciarClientes(usuario);
  const master = usuario?.perfil === "master";
  const { dados: clientes, carregando, erro: erroTabela, recarregar } = useTabela("clientes", { order: { coluna: "nome" } });
  const { dados: acessos, recarregar: recarregarAcessos } = useTabela("cliente_acessos");
  const { dados: pis } = useTabela("pis", { order: { coluna: "codigo" } });
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(null);            // {} novo | cliente (edição)
  const [credenciais, setCredenciais] = useState(null); // resultado de criar / nova senha
  const [gerenciando, setGerenciando] = useState(null); // cliente → acessos
  const [vendoSenha, setVendoSenha] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  if (usuario && !pode) {
    return <PainelShell><div className="p-8"><Aviso tipo="erro">Página disponível somente para Master, Gerente de Obras e Coordenador de Obras.</Aviso></div></PainelShell>;
  }

  const termo = busca.trim().toLowerCase();
  const lista = clientes.filter((c) => !termo || [c.nome, c.empresa, c.email, c.funcao].some((x) => (x || "").toLowerCase().includes(termo)));
  const acessosDe = (id) => acessos.filter((a) => a.cliente_id === id);
  const piDe = (id) => pis.find((p) => p.id === id);

  const acao = async (c, corpo, msgOk) => {
    setOcupado(c.id);
    const { ok, json } = await chamarApi("/api/clientes", { id: c.id, ...corpo });
    setOcupado(null);
    if (!ok) { avisar(json.error || "Não foi possível concluir.", "erro", 6000); return null; }
    if (msgOk) avisar(msgOk);
    recarregar();
    return json;
  };
  const novaSenha = async (c) => {
    if (!window.confirm(`Gerar uma nova senha para ${c.nome}? A senha atual deixará de funcionar.`)) return;
    const r = await acao(c, { acao: "redefinir_senha" });
    if (r) setCredenciais({ cliente: c, ...r, titulo: "Nova senha gerada" });
  };

  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <CabecalhoPagina titulo="Clientes" subtitulo="Acesso dos clientes às informações das suas obras (Acesso Clientes Contric)."
          acoes={<button onClick={() => setForm({})} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Novo cliente</button>} />
        {erroTabela && <Aviso tipo="erro" className="mb-4">O banco ainda não tem o cadastro de clientes. Rode o script <strong>clientes-senhas.sql</strong> no Supabase.</Aviso>}

        <div className="relative mb-4">
          <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, empresa, e-mail ou função" className="input pl-9" />
        </div>

        {carregando && <Esqueleto linhas={3} altura={90} />}
        {!carregando && lista.length === 0 && <EstadoVazio icone="predio" titulo="Nenhum cliente" texto={clientes.length ? "Nada encontrado." : "Cadastre o primeiro cliente para dar acesso às informações das obras."} />}

        <div className="flex flex-col gap-3">
          {lista.map((c) => {
            const meus = acessosDe(c.id);
            return (
              <div key={c.id} className={`cartao p-4 ${c.ativo ? "" : "opacity-60"}`}>
                <div className="flex flex-col md:flex-row md:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex flex-wrap items-center gap-2">
                      {c.nome}
                      <span className={`selo ${c.ativo ? "bg-green/10 text-green" : "bg-panel text-muted"}`}>{c.ativo ? "Ativo" : "Desativado"}</span>
                    </div>
                    <div className="text-sm text-muted">{[c.funcao, c.empresa].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="text-sm text-muted">{c.email}{c.telefone ? ` · ${c.telefone}` : ""}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setGerenciando(c)} className="btn btn-primario btn-sm"><Icone nome="obra" className="w-4 h-4" /> Acessos ({meus.length})</button>
                    <button onClick={() => setForm(c)} className="btn btn-contorno btn-sm"><Icone nome="editar" className="w-4 h-4" /> Editar</button>
                    <button onClick={() => novaSenha(c)} disabled={ocupado === c.id} className="btn btn-contorno btn-sm">Nova senha</button>
                    {master && c.auth_user_id && <button onClick={() => setVendoSenha(c)} className="btn btn-contorno btn-sm"><Icone nome="chave" className="w-4 h-4" /> Senha</button>}
                    <button onClick={() => acao(c, { acao: "ativo", ativo: !c.ativo }, c.ativo ? "Cliente desativado — não consegue mais entrar." : "Cliente reativado.")} disabled={ocupado === c.id}
                      className={`btn btn-sm border ${c.ativo ? "border-amber/40 text-amber bg-white" : "border-green/40 text-green bg-white"}`}>
                      {ocupado === c.id ? <Spinner className="w-3.5 h-3.5" /> : c.ativo ? "Desativar" : "Ativar"}
                    </button>
                    {master && <button onClick={() => setExcluindo(c)} className="btn btn-contorno-perigo btn-sm"><Icone nome="lixo" className="w-4 h-4" /></button>}
                  </div>
                </div>
                {meus.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line/70">
                    {meus.map((a) => {
                      const pi = piDe(a.pi_id);
                      return (
                        <span key={a.id} className="rounded-lg bg-panel px-2.5 py-1.5 text-xs">
                          <strong className="font-mono text-cyan">{pi?.codigo || "?"}</strong>
                          <span className="text-muted"> · {ACESSOS.filter(([k]) => a[k]).map(([, l]) => l).join(", ")}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {form && <FormCliente inicial={form} onFechar={() => setForm(null)} onSalvo={(r) => { recarregar(); if (r?.senha) setCredenciais({ ...r, titulo: "Cliente cadastrado" }); }} />}
      {credenciais && <Credenciais dados={credenciais} onFechar={() => setCredenciais(null)} />}
      {gerenciando && (
        <GerenciarAcessos cliente={gerenciando} pis={pis} acessos={acessosDe(gerenciando.id)} onFechar={() => setGerenciando(null)} onMudou={recarregarAcessos} />
      )}
      {vendoSenha && <VerSenhas authUserId={vendoSenha.auth_user_id} nome={vendoSenha.nome} onFechar={() => setVendoSenha(null)} />}
      {excluindo && (
        <ConfirmarExclusao titulo={`Excluir ${excluindo.nome}`} descricao="O cliente perde o acesso à plataforma e o cadastro é apagado. Para só bloquear, use Desativar."
          onFechar={() => setExcluindo(null)}
          onConfirmar={async (motivo) => {
            const { ok, json } = await chamarApi("/api/clientes", { acao: "excluir", id: excluindo.id, motivo });
            if (!ok) return { erro: json.error };
            avisar("Cliente excluído — registrado na Auditoria.", "info"); recarregar(); recarregarAcessos();
            return { ok: true };
          }} />
      )}
    </PainelShell>
  );
}

function FormCliente({ inicial, onFechar, onSalvo }) {
  const novo = !inicial.id;
  const [v, setV] = useState({ nome: inicial.nome || "", empresa: inicial.empresa || "", funcao: inicial.funcao || "", telefone: inicial.telefone || "", email: inicial.email || "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim());
  const pode = v.nome.trim() && emailOk && !salvando;
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: k === "telefone" ? mascaraTelefone(e.target.value) : e.target.value }));

  const salvar = async () => {
    setSalvando(true); setErro("");
    const { ok, json } = await chamarApi("/api/clientes", novo ? { acao: "criar", ...v } : { acao: "editar", id: inicial.id, ...v });
    setSalvando(false);
    if (!ok) { setErro(json.error || "Não foi possível salvar."); return; }
    onSalvo(json); onFechar();
  };

  return (
    <Modal titulo={novo ? "Novo cliente" : `Editar — ${inicial.nome}`} onFechar={onFechar} largura="max-w-md"
      rodape={<>
        <button onClick={onFechar} className="btn btn-fantasma" disabled={salvando}>Cancelar</button>
        <button onClick={salvar} disabled={!pode} className="btn btn-primario">{salvando ? <><Spinner /> Salvando...</> : novo ? "Cadastrar e enviar acesso" : "Salvar"}</button>
      </>}>
      <div className="flex flex-col gap-3.5">
        <Campo rotulo="Nome"><input value={v.nome} onChange={set("nome")} className="input" autoFocus /></Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Empresa"><input value={v.empresa} onChange={set("empresa")} className="input" /></Campo>
          <Campo rotulo="Função"><input value={v.funcao} onChange={set("funcao")} className="input" placeholder="Ex: Engenheiro de manutenção" /></Campo>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Telefone"><input value={v.telefone} onChange={set("telefone")} inputMode="tel" className="input" placeholder="(11) 90000-0000" /></Campo>
          <Campo rotulo="E-mail (usuário de acesso)">
            <input type="email" value={v.email} onChange={set("email")} className={`input ${v.email && !emailOk ? "!border-red" : ""}`} />
          </Campo>
        </div>
        {novo && <Aviso tipo="info">Uma senha aleatória será criada e enviada ao e-mail do cliente, junto com o endereço da plataforma.</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
    </Modal>
  );
}

// credenciais recém-criadas: status do e-mail + mensagem pronta para WhatsApp / copiar
function Credenciais({ dados, onFechar }) {
  const { avisar } = useToast();
  const { cliente, senha, envio, mensagem, titulo } = dados;
  const fone = String(cliente?.telefone || "").replace(/\D/g, "");
  const copiar = async () => { try { await navigator.clipboard.writeText(mensagem); avisar("Mensagem copiada."); } catch { avisar("Não foi possível copiar.", "erro"); } };
  return (
    <Modal titulo={titulo} onFechar={onFechar} largura="max-w-md"
      rodape={<button onClick={onFechar} className="btn btn-primario">Concluir</button>}>
      <div className="flex flex-col gap-3">
        {envio?.enviado
          ? <Aviso tipo="sucesso">E-mail enviado para <strong>{cliente.email}</strong> com o usuário e a senha.</Aviso>
          : <Aviso tipo="alerta">O e-mail <strong>não</strong> foi enviado ({envio?.motivo}). Envie a mensagem abaixo por WhatsApp ou e-mail.</Aviso>}
        <div className="rounded-xl bg-panel p-3.5 text-sm">
          <div><span className="text-muted">Usuário:</span> <strong>{cliente.email}</strong></div>
          <div><span className="text-muted">Senha:</span> <strong className="font-mono text-base tracking-wider">{senha}</strong></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={copiar} className="btn btn-contorno btn-sm">Copiar mensagem</button>
          {fone && <a href={`https://wa.me/55${fone}?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer" className="btn btn-contorno btn-sm">Enviar por WhatsApp</a>}
          <a href={`mailto:${cliente.email}?subject=${encodeURIComponent("Seu acesso à plataforma Contric")}&body=${encodeURIComponent(mensagem)}`} className="btn btn-contorno btn-sm">Abrir no e-mail</a>
        </div>
      </div>
    </Modal>
  );
}

function GerenciarAcessos({ cliente, pis, acessos, onFechar, onMudou }) {
  const { avisar } = useToast();
  const [piId, setPiId] = useState("");
  const [flags, setFlags] = useState({ ver_atas: true, ver_rdos_assinados: true, ver_linha_tempo: true });
  const [salvando, setSalvando] = useState(null);
  const jaTem = (id) => acessos.find((a) => a.pi_id === id);

  const salvar = async (pi, valores, chave) => {
    setSalvando(chave);
    const { ok, json } = await chamarApi("/api/clientes", { acao: "acesso", id: cliente.id, piId: pi, ...valores });
    setSalvando(null);
    if (!ok) { avisar(json.error || "Não foi possível salvar.", "erro", 6000); return; }
    avisar(json.removido ? "Acesso removido." : json.envio?.enviado ? "Acesso salvo — cliente avisado por e-mail." : `Acesso salvo${json.envio?.motivo && json.envio.motivo !== "sem alterações" ? ` (e-mail não enviado: ${json.envio.motivo})` : ""}.`);
    onMudou();
    if (chave === "novo") setPiId("");
  };

  return (
    <Modal titulo={`Acessos — ${cliente.nome}`} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-3.5 flex flex-col gap-3">
          <div className="font-semibold text-sm">Dar acesso a um PI</div>
          <select value={piId} onChange={(e) => setPiId(e.target.value)} className="input">
            <option value="">Selecione o PI...</option>
            {pis.filter((p) => !jaTem(p.id)).map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.cliente}{p.projeto ? ` — ${p.projeto}` : ""}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            {ACESSOS.map(([k, l]) => (
              <label key={k} className={`chip cursor-pointer ${flags[k] ? "chip-ativo" : ""}`}>
                <input type="checkbox" className="hidden" checked={flags[k]} onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))} /> {flags[k] ? "✓ " : ""}{l}
              </label>
            ))}
          </div>
          <button onClick={() => salvar(piId, flags, "novo")} disabled={!piId || !Object.values(flags).some(Boolean) || salvando} className="btn btn-primario self-start">
            {salvando === "novo" ? <><Spinner /> Salvando...</> : "Dar acesso e avisar o cliente"}
          </button>
        </div>

        <div className="titulo-secao">PIs com acesso ({acessos.length})</div>
        {acessos.length === 0 && <div className="text-sm text-muteddim">Nenhum PI liberado ainda.</div>}
        {acessos.map((a) => {
          const pi = pis.find((p) => p.id === a.pi_id);
          return (
            <div key={a.id} className="rounded-xl border border-line p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0 text-sm"><strong className="font-mono text-cyan">{pi?.codigo}</strong> · {pi?.cliente}{pi?.projeto ? <span className="text-muted"> · {pi.projeto}</span> : ""}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {ACESSOS.map(([k, l]) => (
                  <button key={k} disabled={!!salvando} onClick={() => salvar(a.pi_id, { ver_atas: a.ver_atas, ver_rdos_assinados: a.ver_rdos_assinados, ver_linha_tempo: a.ver_linha_tempo, [k]: !a[k] }, a.id)}
                    className={`chip ${a[k] ? "chip-ativo" : ""}`} title={a[k] ? "Clique para retirar" : "Clique para liberar"}>{a[k] ? "✓ " : ""}{l}</button>
                ))}
                <button disabled={!!salvando} onClick={() => salvar(a.pi_id, { ver_atas: false, ver_rdos_assinados: false, ver_linha_tempo: false }, a.id)}
                  className="p-2 rounded-lg text-muteddim hover:text-red hover:bg-red/5" title="Remover acesso a este PI"><Icone nome="lixo" className="w-4 h-4" /></button>
                {salvando === a.id && <Spinner className="w-4 h-4 text-cyan" />}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

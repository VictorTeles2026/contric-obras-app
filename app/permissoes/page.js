"use client";

import { Fragment, useMemo, useState } from "react";
import { useTabela, chamarApi } from "../../lib/dados";
import { useAuth, ROTULO_PERFIL } from "../../lib/AuthContext";
import { CATALOGO_PERMISSOES, PADRAO_PERMISSOES, ROTULO_VALOR, resolverPermissoes } from "../../lib/permissoes";
import { useToast } from "../../lib/Toast";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, Aviso, Spinner } from "../../components/ui";
import Icone from "../../components/Icone";

const PERFIS = ["master", "gerente", "coordenador", "visualizador", "lider", "funcionario", "terceiro"];
const COR_VALOR = { S: "bg-green/10 text-green border-green/30", P: "bg-amber/10 text-amber border-amber/30", N: "bg-red/5 text-red border-red/20" };
const MODULOS = [...new Set(CATALOGO_PERMISSOES.map((c) => c.modulo))];

function SeletorValor({ valor, onChange, disabled, titulo }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled} title={titulo}
      className={`rounded-md border px-1.5 py-1 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${COR_VALOR[valor] || ""}`}>
      <option value="S">S</option><option value="P">P</option><option value="N">N</option>
    </select>
  );
}

// Matriz de permissões: padrão por perfil + exceções por usuário (somente quem tem "permissao.gerenciar")
export default function PermissoesPage() {
  const { usuario } = useAuth();
  const [aba, setAba] = useState("perfil");
  return (
    <PainelShell>
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <CabecalhoPagina titulo="Permissões" subtitulo="S = permitido · P = só nos PIs em que a pessoa está alocada · N = não permitido. As alterações valem no próximo acesso de cada usuário." />
        <div className="flex gap-1 border-b border-line mb-5">
          {[["perfil", "Por perfil"], ["usuario", "Por usuário (exceções)"]].map(([v, l]) => (
            <button key={v} onClick={() => setAba(v)} className={`relative px-4 py-2.5 text-sm font-semibold ${aba === v ? "text-cyan" : "text-muted hover:text-textmain"}`}>
              {l}{aba === v && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
            </button>
          ))}
        </div>
        {aba === "perfil" ? <MatrizPerfis usuario={usuario} /> : <ExcecoesUsuario />}
      </div>
    </PainelShell>
  );
}

function MatrizPerfis() {
  const { avisar } = useToast();
  const { dados: linhas, erro, recarregar } = useTabela("permissoes_perfil");
  const [salvando, setSalvando] = useState(null);
  const [busca, setBusca] = useState("");
  const valorDe = (perfil, codigo) => linhas.find((l) => l.perfil === perfil && l.codigo === codigo)?.valor || PADRAO_PERMISSOES[perfil]?.[codigo] || "N";
  const travada = (perfil, codigo) => perfil === "master" && ["permissao.gerenciar", "acesso.painel", "usuario.editar"].includes(codigo);

  const alterar = async (perfil, codigo, valor) => {
    setSalvando(`${perfil}|${codigo}`);
    const { ok, json } = await chamarApi("/api/permissoes", { acao: "perfil", perfil, codigo, valor });
    setSalvando(null);
    if (!ok) { avisar(json.error || "Não foi possível salvar.", "erro", 7000); return; }
    recarregar();
  };
  const termo = busca.trim().toLowerCase();
  const itens = CATALOGO_PERMISSOES.filter((c) => !termo || `${c.modulo} ${c.acao} ${c.descricao} ${c.codigo}`.toLowerCase().includes(termo));

  return (
    <>
      {erro && <Aviso tipo="erro" className="mb-4">A matriz ainda não está no banco — rode o script <strong>permissoes.sql</strong> no Supabase. Até lá vale o padrão da planilha.</Aviso>}
      <div className="relative mb-3 max-w-md">
        <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ação..." className="input pl-9" />
      </div>
      <div className="cartao overflow-auto" style={{ maxHeight: "calc(100dvh - 260px)" }}>
        <table className="w-full text-sm min-w-[860px]">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2.5 titulo-secao">Ação</th>
              {PERFIS.map((p) => <th key={p} className="px-2 py-2.5 titulo-secao text-center">{ROTULO_PERFIL[p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULOS.map((m) => {
              const doModulo = itens.filter((c) => c.modulo === m);
              if (!doModulo.length) return null;
              return (
                <Fragment key={m}>
                  <tr><td colSpan={PERFIS.length + 1} className="px-3 pt-4 pb-1.5 text-sm font-semibold text-cyan">{m}</td></tr>
                  {doModulo.map((c) => (
                    <tr key={c.codigo} className="border-b border-line/60 hover:bg-panel/50">
                      <td className="px-3 py-2">
                        <div>{c.acao}</div>
                        {c.descricao && <div className="texto-apoio">{c.descricao}</div>}
                      </td>
                      {PERFIS.map((p) => (
                        <td key={p} className="px-2 py-2 text-center">
                          {salvando === `${p}|${c.codigo}` ? <Spinner className="w-4 h-4 text-cyan inline" /> : (
                            <SeletorValor valor={valorDe(p, c.codigo)} disabled={travada(p, c.codigo)}
                              titulo={travada(p, c.codigo) ? "Sempre permitido ao Master (evita perder o acesso)" : ROTULO_VALOR[valorDe(p, c.codigo)]}
                              onChange={(v) => alterar(p, c.codigo, v)} />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExcecoesUsuario() {
  const { avisar } = useToast();
  const { dados: usuarios } = useTabela("usuarios", { order: { coluna: "nome" } });
  const { dados: matriz } = useTabela("permissoes_perfil");
  const { dados: excecoes, erro, recarregar } = useTabela("permissoes_usuario");
  const [usuarioId, setUsuarioId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [validoAte, setValidoAte] = useState("");
  const [salvando, setSalvando] = useState(null);
  const [soExcecoes, setSoExcecoes] = useState(false);

  const u = usuarios.find((x) => x.id === usuarioId);
  const minhas = excecoes.filter((e) => e.usuario_id === usuarioId);
  const doPerfil = useMemo(() => (u ? resolverPermissoes(u.perfil, matriz.filter((l) => l.perfil === u.perfil), []) : {}), [u, matriz]);
  const finais = useMemo(() => (u ? resolverPermissoes(u.perfil, matriz.filter((l) => l.perfil === u.perfil), minhas) : {}), [u, matriz, minhas]);
  const qtdPorUsuario = (id) => excecoes.filter((e) => e.usuario_id === id).length;

  const definir = async (codigo, valor) => {
    const atual = minhas.find((e) => e.codigo === codigo);
    setSalvando(codigo);
    const r = valor === ""
      ? await chamarApi("/api/permissoes", { acao: "remover_excecao", id: atual?.id })
      : await chamarApi("/api/permissoes", { acao: "excecao", usuarioId, codigo, valor, motivo, validoAte: validoAte || null });
    setSalvando(null);
    if (!r.ok) { avisar(r.json.error || "Não foi possível salvar.", "erro", 7000); return; }
    avisar(valor === "" ? "Exceção removida — volta ao padrão do perfil." : "Exceção salva.");
    recarregar();
  };

  return (
    <>
      {erro && <Aviso tipo="erro" className="mb-4">Rode o script <strong>permissoes.sql</strong> no Supabase para usar exceções por usuário.</Aviso>}
      <div className="cartao p-4 mb-4 grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_1fr_180px] gap-3 items-end">
        <label className="block">
          <span className="rotulo">Usuário</span>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className="input">
            <option value="">Selecione o usuário...</option>
            {usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome} — {ROTULO_PERFIL[x.perfil] || x.perfil}{qtdPorUsuario(x.id) ? ` (${qtdPorUsuario(x.id)} exceção(ões))` : ""}{x.ativo === false ? " · desabilitado" : ""}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="rotulo">Motivo (vai junto com as próximas exceções salvas)</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" placeholder="Ex: responsável pela qualidade dos RDOs" />
        </label>
        <label className="block">
          <span className="rotulo">Válido até (opcional)</span>
          <input type="date" value={validoAte} onChange={(e) => setValidoAte(e.target.value)} className="input" />
        </label>
      </div>

      {!u && <div className="text-sm text-muteddim text-center py-8">Escolha um usuário para ver e ajustar as permissões dele.</div>}
      {u && (
        <>
          <label className="flex items-center gap-2 text-sm text-muted mb-2 cursor-pointer">
            <input type="checkbox" className="accent-cyan w-4 h-4" checked={soExcecoes} onChange={(e) => setSoExcecoes(e.target.checked)} />
            Mostrar só as exceções ({minhas.length})
          </label>
          <div className="cartao overflow-auto" style={{ maxHeight: "calc(100dvh - 330px)" }}>
            <table className="w-full text-sm min-w-[760px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2.5 titulo-secao">Ação</th>
                  <th className="px-3 py-2.5 titulo-secao text-center">Padrão do perfil</th>
                  <th className="px-3 py-2.5 titulo-secao">Exceção deste usuário</th>
                  <th className="px-3 py-2.5 titulo-secao text-center">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {MODULOS.map((m) => {
                  const doModulo = CATALOGO_PERMISSOES.filter((c) => c.modulo === m && (!soExcecoes || minhas.some((e) => e.codigo === c.codigo)));
                  if (!doModulo.length) return null;
                  return (
                    <Fragment key={m}>
                      <tr><td colSpan={4} className="px-3 pt-4 pb-1.5 text-sm font-semibold text-cyan">{m}</td></tr>
                      {doModulo.map((c) => {
                        const ex = minhas.find((e) => e.codigo === c.codigo);
                        return (
                          <tr key={c.codigo} className={`border-b border-line/60 ${ex ? "bg-cyan/5" : ""}`}>
                            <td className="px-3 py-2">{c.acao}</td>
                            <td className="px-3 py-2 text-center"><span className={`selo border ${COR_VALOR[doPerfil[c.codigo]]}`}>{ROTULO_VALOR[doPerfil[c.codigo]]}</span></td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <select value={ex?.valor || ""} disabled={salvando === c.codigo} onChange={(e) => definir(c.codigo, e.target.value)} className="input !w-auto !py-1 !text-xs">
                                  <option value="">— padrão do perfil —</option>
                                  <option value="S">Conceder: Sim</option>
                                  <option value="P">Conceder: só PIs próprios</option>
                                  <option value="N">Revogar: Não</option>
                                </select>
                                {salvando === c.codigo && <Spinner className="w-4 h-4 text-cyan" />}
                              </div>
                              {ex && <div className="texto-apoio mt-1">{[ex.motivo, ex.valido_ate && `até ${new Date(ex.valido_ate + "T00:00:00").toLocaleDateString("pt-BR")}`, ex.criado_por && `por ${ex.criado_por}`].filter(Boolean).join(" · ")}</div>}
                            </td>
                            <td className="px-3 py-2 text-center"><span className={`selo border ${COR_VALOR[finais[c.codigo]]}`}>{ROTULO_VALOR[finais[c.codigo]]}</span></td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

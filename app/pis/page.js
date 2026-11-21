"use client";

import { useState } from "react";
import Link from "next/link";
import { useTabela, compararPis, gravarTolerante, registrarLog } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { supabase } from "../../lib/supabase";
import { useToast } from "../../lib/Toast";
import { STATUS_PI, COR_STATUS_PI } from "../../lib/constantes";
import { formatarData } from "../../lib/datas";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto, BotaoLimpar, Modal, Campo, Aviso } from "../../components/ui";
import Icone from "../../components/Icone";
import { JanelaPi, ModalAplicarModelo } from "../../components/Editores";

// Cadastro de PIs: incluir e editar os PIs (dados, responsável no cliente e orçamento).
// A mesma janela continua disponível em Configurar Cronograma.
export default function CadastroPisPage() {
  const { usuario } = useAuth();
  const { dados: pis, carregando, recarregar } = useTabela("pis", { order: { coluna: "codigo" } });
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativo");
  const [janela, setJanela] = useState(null); // { modo: "create" | "edit", pi }
  const podeCriar = pode(usuario, "pi.criar");
  const podeEditarPi = pode(usuario, "pi.editar");

  const termo = busca.trim().toLowerCase();
  const lista = pis.filter((p) => (!filtroStatus || p.status === filtroStatus) &&
    (!termo || [p.codigo, p.cliente, p.projeto, p.responsavel_cliente_nome].some((c) => (c || "").toLowerCase().includes(termo)))).sort(compararPis);
  const qtd = (s) => pis.filter((p) => !s || p.status === s).length;
  // contrato: cada PI Pai seguido das suas obras (filhos), recuadas
  const filhosDe = (id) => pis.filter((p) => p.pi_pai_id === id);
  const naLista = new Set(lista.map((p) => p.id));
  const ordenada = lista.filter((p) => !p.pi_pai_id || !naLista.has(p.pi_pai_id))
    .flatMap((p) => [p, ...lista.filter((f) => f.pi_pai_id === p.id).sort(compararPis)]);
  const [criandoObras, setCriandoObras] = useState(null); // PI Pai
  const [modeloObras, setModeloObras] = useState(null);   // obras recém-criadas → aplicar modelo

  return (
    <PainelShell>
      <div className="p-4 md:p-8">
        <CabecalhoPagina titulo="Cadastro de PIs" subtitulo="Abertura e edição dos PIs: dados da obra, responsável no cliente e orçamento."
          acoes={podeCriar && <button onClick={() => setJanela({ modo: "create", pi: null })} className="btn btn-primario"><Icone nome="mais2" className="w-4 h-4" /> Novo PI</button>} />

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Icone nome="buscar" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muteddim" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número, cliente, projeto ou responsável" className="input pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[["", "Todos"], ...Object.entries(STATUS_PI)].map(([v, l]) => (
              <button key={v} onClick={() => setFiltroStatus(v)} className={`chip ${filtroStatus === v ? "chip-ativo" : ""}`}>{l} ({qtd(v)})</button>
            ))}
          </div>
          <BotaoLimpar qtd={(busca ? 1 : 0) + (filtroStatus !== "ativo" ? 1 : 0)} onClick={() => { setBusca(""); setFiltroStatus("ativo"); }} className="self-center" />
        </div>

        {carregando && <Esqueleto linhas={5} altura={48} />}
        {!carregando && lista.length === 0 && (
          <EstadoVazio icone="obra" titulo="Nenhum PI encontrado" texto={pis.length ? "Ajuste a busca ou o filtro de status." : "Cadastre o primeiro PI."}
            acao={podeCriar && !pis.length && <button onClick={() => setJanela({ modo: "create", pi: null })} className="btn btn-primario">Novo PI</button>} />
        )}
        {!carregando && lista.length > 0 && (
          <div className="cartao overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2.5 titulo-secao">PI</th>
                  <th className="px-4 py-2.5 titulo-secao">Cliente / projeto</th>
                  <th className="px-4 py-2.5 titulo-secao">Responsável no cliente</th>
                  <th className="px-4 py-2.5 titulo-secao">Prazo</th>
                  <th className="px-4 py-2.5 titulo-secao">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {ordenada.map((p) => (
                  <tr key={p.id} className={`border-b border-line/60 hover:bg-panel/50 ${filhosDe(p.id).length ? "bg-navy/[0.03]" : ""}`}>
                    <td className={`px-4 py-2.5 font-mono font-bold text-cyan whitespace-nowrap ${p.pi_pai_id ? "pl-9" : ""}`}>
                      {p.pi_pai_id ? "↳ " : ""}{p.codigo}
                      {filhosDe(p.id).length > 0 && <div className="selo bg-navy/10 text-navy mt-1 font-sans">PI Pai · {filhosDe(p.id).length} obras</div>}
                    </td>
                    <td className="px-4 py-2.5"><div className="font-semibold">{p.cliente || "—"}</div>{p.projeto && <div className="texto-apoio">{p.projeto}</div>}</td>
                    <td className="px-4 py-2.5">{p.responsavel_cliente_nome || <span className="text-muteddim">—</span>}
                      {p.responsavel_cliente_email && <div className="texto-apoio">{p.responsavel_cliente_email}</div>}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{p.prazo ? formatarData(p.prazo) : "—"}</td>
                    <td className="px-4 py-2.5"><span className={`selo ${COR_STATUS_PI[p.status] || "bg-panel text-muted"}`}>{STATUS_PI[p.status] || p.status}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {podeCriar && !p.pi_pai_id && (
                          <button onClick={() => setCriandoObras(p)} className="btn btn-contorno btn-sm" title="Criar as obras (PIs filhos) deste contrato">
                            <Icone nome="mais2" className="w-4 h-4" /> Obras
                          </button>
                        )}
                        {podeEditarPi && <button onClick={() => setJanela({ modo: "edit", pi: p })} className="btn btn-contorno btn-sm"><Icone nome="editar" className="w-4 h-4" /> Editar</button>}
                        <Link href={`/cronograma?pi=${p.id}`} className="btn btn-fantasma btn-sm" title="Configurar o cronograma deste PI"><Icone nome="cronograma" className="w-4 h-4" /></Link>
                        <Link href={`/pi?id=${p.id}`} className="btn btn-fantasma btn-sm" title="Abrir a página do PI"><Icone nome="obra" className="w-4 h-4" /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {janela && <JanelaPi key={janela.pi?.id || "novo"} modo={janela.modo} pi={janela.pi} onFechar={() => setJanela(null)} onSalvo={() => recarregar()} />}
      {criandoObras && <CriarObras pai={criandoObras} pis={pis} usuario={usuario} onFechar={() => setCriandoObras(null)}
        onCriadas={(novas, comModelo) => { recarregar(); setCriandoObras(null); if (comModelo && novas.length) setModeloObras(novas); }} />}
      {modeloObras && <ModalAplicarModelo alvos={modeloObras} titulo={`Cronograma das ${modeloObras.length} obras`} onFechar={() => setModeloObras(null)} />}
    </PainelShell>
  );
}

// Cria as obras (PIs filhos) de um contrato: 227500 → 227500-01, 227500-02...
// Copiam cliente, prazo, status e responsável do PI Pai. Cada obra tem o próprio orçamento,
// cronograma, horas e alocações; o PI Pai só consolida.
function CriarObras({ pai, pis, usuario, onFechar, onCriadas }) {
  const { avisar } = useToast();
  const existentes = pis.filter((p) => p.pi_pai_id === pai.id);
  const [qtd, setQtd] = useState(10);
  const [inicio, setInicio] = useState(existentes.length + 1);
  const [nomeBase, setNomeBase] = useState("OBRA");
  const [comModelo, setComModelo] = useState(true);
  const [criando, setCriando] = useState(false);
  const n = Math.max(1, Math.min(50, Number(qtd) || 1));
  const codigos = Array.from({ length: n }, (_, i) => `${pai.codigo}-${String(Number(inicio) + i).padStart(2, "0")}`);
  const repetidos = codigos.filter((c) => pis.some((p) => String(p.codigo).toLowerCase() === c.toLowerCase()));
  const criar = async () => {
    setCriando(true);
    const linhas = codigos.map((codigo, i) => ({
      codigo, pi_pai_id: pai.id, cliente: pai.cliente, projeto: `${String(nomeBase || "OBRA").trim().toLocaleUpperCase("pt-BR")} ${String(Number(inicio) + i).padStart(2, "0")}`,
      prazo: pai.prazo, status: "ativo", responsavel_cliente_nome: pai.responsavel_cliente_nome || null,
      responsavel_cliente_email: pai.responsavel_cliente_email || null, responsavel_cliente_telefone: pai.responsavel_cliente_telefone || null,
    }));
    const { data, error, colunasIgnoradas } = await gravarTolerante(linhas, (d) => supabase.from("pis").insert(d).select());
    setCriando(false);
    if (error) { avisar(`Não foi possível criar: ${error.message}`, "erro", 8000); return; }
    if (colunasIgnoradas?.includes("pi_pai_id")) { avisar("Obras criadas SEM vínculo com o PI Pai: rode o script contratos-pi-pai.sql no Supabase e vincule em Editar.", "erro", 10000); }
    await registrarLog(usuario, "Criou obras do contrato", `${pai.codigo} — ${codigos.join(", ")}`);
    avisar(`${codigos.length} obra(s) criada(s) no contrato ${pai.codigo}.`);
    onCriadas(data || [], comModelo);
  };
  return (
    <Modal titulo={`Obras do contrato — ${pai.codigo}`} onFechar={() => !criando && onFechar()} largura="max-w-lg"
      rodape={<>
        <button onClick={onFechar} disabled={criando} className="btn btn-fantasma">Cancelar</button>
        <button onClick={criar} disabled={criando || repetidos.length > 0} className="btn btn-primario">{criando ? "Criando..." : `Criar ${n} obra(s)`}</button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted">{pai.cliente}{pai.projeto ? ` · ${pai.projeto}` : ""}{existentes.length ? ` · já tem ${existentes.length} obra(s)` : ""}</div>
        <div className="grid grid-cols-3 gap-3">
          <Campo rotulo="Quantidade"><input type="number" min="1" max="50" value={qtd} onChange={(e) => setQtd(e.target.value)} className="input" /></Campo>
          <Campo rotulo="Começar no nº"><input type="number" min="1" max="99" value={inicio} onChange={(e) => setInicio(e.target.value)} className="input" /></Campo>
          <Campo rotulo="Nome do projeto"><input value={nomeBase} onChange={(e) => setNomeBase(e.target.value)} className="input uppercase" /></Campo>
        </div>
        <div className="rounded-xl bg-panel px-3 py-2 text-sm"><span className="text-muted">Serão criados:</span> <strong className="font-mono">{codigos[0]}</strong>{n > 1 && <> até <strong className="font-mono">{codigos[n - 1]}</strong></>} <span className="text-muted">({nomeBase.toUpperCase()} {String(Number(inicio)).padStart(2, "0")}…)</span></div>
        {repetidos.length > 0 && <Aviso tipo="erro">Já existem: {repetidos.join(", ")}. Ajuste o número inicial.</Aviso>}
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-cyan w-4 h-4" checked={comModelo} onChange={(e) => setComModelo(e.target.checked)} /> Em seguida, aplicar um modelo de cronograma em todas as obras</label>
        <div className="text-xs text-muteddim">Cada obra copia cliente, prazo e responsável do PI Pai e tem orçamento, cronograma, horas e alocações próprios. Informe o valor e o orçamento de cada obra em Editar. Clientes com acesso ao PI Pai veem todas as obras e o consolidado.</div>
      </div>
    </Modal>
  );
}

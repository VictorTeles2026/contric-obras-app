"use client";

import { useState } from "react";
import Link from "next/link";
import { useTabela, compararPis } from "../../lib/dados";
import { useAuth, pode } from "../../lib/AuthContext";
import { STATUS_PI, COR_STATUS_PI } from "../../lib/constantes";
import { formatarData } from "../../lib/datas";
import PainelShell from "../../components/PainelShell";
import { CabecalhoPagina, EstadoVazio, Esqueleto } from "../../components/ui";
import Icone from "../../components/Icone";
import { JanelaPi } from "../../components/Editores";

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
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-line/60 hover:bg-panel/50">
                    <td className="px-4 py-2.5 font-mono font-bold text-cyan whitespace-nowrap">{p.codigo}</td>
                    <td className="px-4 py-2.5"><div className="font-semibold">{p.cliente || "—"}</div>{p.projeto && <div className="texto-apoio">{p.projeto}</div>}</td>
                    <td className="px-4 py-2.5">{p.responsavel_cliente_nome || <span className="text-muteddim">—</span>}
                      {p.responsavel_cliente_email && <div className="texto-apoio">{p.responsavel_cliente_email}</div>}</td>
                    <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{p.prazo ? formatarData(p.prazo) : "—"}</td>
                    <td className="px-4 py-2.5"><span className={`selo ${COR_STATUS_PI[p.status] || "bg-panel text-muted"}`}>{STATUS_PI[p.status] || p.status}</span></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
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
    </PainelShell>
  );
}

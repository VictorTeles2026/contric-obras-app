"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Abas do Cronograma: o cronograma em si e o registro de solicitações de alteração do PI
export default function AbasCronograma({ piId, qtdPendentes = 0 }) {
  const pathname = usePathname();
  const q = piId ? `?pi=${piId}` : "";
  const abas = [
    ["/cronograma", "Cronograma"],
    ["/cronograma/solicitacoes", "Solicitações de alteração"],
  ];
  return (
    <div className="flex gap-1 overflow-x-auto bg-white border-b border-line px-4 md:px-6" role="tablist">
      {abas.map(([href, rotulo]) => {
        const ativa = pathname === href;
        return (
          <Link key={href} href={`${href}${q}`} role="tab" aria-selected={ativa}
            className={`relative px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${ativa ? "text-cyan" : "text-muted hover:text-textmain"}`}>
            {rotulo}
            {href.endsWith("solicitacoes") && qtdPendentes > 0 && <span className="ml-2 selo bg-amber/15 text-amber">{qtdPendentes} pendente(s)</span>}
            {ativa && <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-cyan rounded-full" />}
          </Link>
        );
      })}
    </div>
  );
}

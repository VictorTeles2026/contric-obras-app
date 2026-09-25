"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AbasRelatorios() {
  const pathname = usePathname();
  const abas = [["/relatorios", "PI — orçado × realizado"], ["/relatorios/horas", "Controle de Horas"]];
  return (
    <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto print:hidden" role="tablist">
      {abas.map(([href, rotulo]) => {
        const ativa = pathname === href;
        return (
          <Link key={href} href={href} role="tab" aria-selected={ativa}
            className={`relative px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${ativa ? "text-cyan" : "text-muted hover:text-textmain"}`}>
            {rotulo}
            {ativa && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-cyan rounded-full" />}
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import AssinaturaCanvas from "./AssinaturaCanvas";
import Icone from "./Icone";

// Assinatura do cliente: ao marcar, exige o NOME de quem assina + a assinatura desenhada.
// value = { ativo, nome, imagem }
export function assinaturaValida(v) {
  return !v?.ativo || (!!v.nome?.trim() && !!v.imagem);
}
export function faltaNaAssinatura(v) {
  if (!v?.ativo) return null;
  if (!v.nome?.trim()) return "Digite o nome do cliente que está assinando.";
  if (!v.imagem) return "Falta a assinatura do cliente.";
  return null;
}

export default function ColetaAssinatura({ value, onChange }) {
  const v = value || { ativo: false, nome: "", imagem: null };
  const nomeFaltando = v.ativo && !v.nome?.trim();
  return (
    <div className="flex flex-col gap-3">
      <label className="cartao p-4 flex items-center gap-3 text-base cursor-pointer">
        <input type="checkbox" className="w-5 h-5 accent-cyan" checked={v.ativo}
          onChange={(e) => onChange(e.target.checked ? { ...v, ativo: true } : { ativo: false, nome: "", imagem: null })} />
        <Icone nome="assinatura" className="w-5 h-5 text-muted" />
        <span className="flex-1">Coletar assinatura do cliente</span>
      </label>
      {v.ativo && (
        <div className="cartao p-4 flex flex-col gap-3 animar-fade">
          <label className="block">
            <span className="rotulo">Nome do cliente (obrigatório)</span>
            <input value={v.nome} onChange={(e) => onChange({ ...v, nome: e.target.value })} autoComplete="off"
              placeholder="Nome completo de quem assina" className={`input input-lg ${nomeFaltando ? "!border-amber" : ""}`} />
          </label>
          <AssinaturaCanvas onMudar={(imagem) => onChange({ ...v, imagem })} />
        </div>
      )}
    </div>
  );
}

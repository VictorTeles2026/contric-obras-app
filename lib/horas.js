// Horas normais / extras de um lançamento:
// aprovado usa o que o aprovador definiu; pendente conta tudo como normal;
// check-in ainda aberto (sem saída) não soma nada.
export function horasDoLancamento(a) {
  if (a.entrada && !a.saida) return { normais: 0, extras: 0, aberto: true };
  if (a.status === "aprovado") return { normais: Number(a.horas_normais ?? a.horas_totais) || 0, extras: Number(a.horas_extras) || 0 };
  return { normais: Number(a.horas_totais) || 0, extras: 0 };
}

export const fmtH = (n, casas = 2) => `${(Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas })} h`;

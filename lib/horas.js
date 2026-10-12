import { JORNADA } from "./constantes";

// Horas normais / extras de um lançamento:
// aprovado usa o que o aprovador definiu; pendente conta tudo como normal;
// check-in ainda aberto (sem saída) não soma nada.
export function horasDoLancamento(a) {
  if (a.entrada && !a.saida) return { normais: 0, extras: 0, aberto: true };
  if (a.status === "aprovado") return { normais: Number(a.horas_normais ?? a.horas_totais) || 0, extras: Number(a.horas_extras) || 0 };
  return { normais: Number(a.horas_totais) || 0, extras: 0 };
}

export const fmtH = (n, casas = 2) => `${(Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas })} h`;

// ---------------- almoço (desconto automático) ----------------
// Intervalo padrão 12:00–13:00 (editável em Configurações → Jornada). Desconta só a parte
// do trabalho que cai dentro do intervalo: quem trabalhou 07–12 não perde nada; 07–17 perde 1 h.
const paraMin = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const sobreposicao = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

// horários "HH:MM" do lançamento manual → { brutas, almoco, liquidas, viraDia } (em horas)
export function horasComAlmoco(inicio, fim) {
  if (!inicio || !fim) return { brutas: 0, almoco: 0, liquidas: 0, viraDia: false };
  const ini = paraMin(inicio);
  let f = paraMin(fim);
  const viraDia = f < ini;
  if (viraDia) f += 24 * 60;
  const a1 = paraMin(JORNADA.almocoInicio), a2 = paraMin(JORNADA.almocoFim);
  // o intervalo de almoço do mesmo dia e, se virou a noite, o do dia seguinte
  const almocoMin = sobreposicao(ini, f, a1, a2) + sobreposicao(ini, f, a1 + 1440, a2 + 1440);
  const brutas = (f - ini) / 60, almoco = almocoMin / 60;
  return { brutas, almoco, liquidas: Math.max(0, brutas - almoco), viraDia };
}

// check-in/check-out (datas ISO) → horas descontando o almoço de cada dia trabalhado
export function horasPontoComAlmoco(entradaISO, saidaISO) {
  const ini = new Date(entradaISO).getTime(), fim = new Date(saidaISO).getTime();
  if (!(fim > ini)) return 0;
  let almocoMs = 0;
  const d = new Date(ini); d.setHours(0, 0, 0, 0);
  for (; d.getTime() <= fim; d.setDate(d.getDate() + 1)) {
    const base = d.getTime();
    almocoMs += sobreposicao(ini, fim, base + paraMin(JORNADA.almocoInicio) * 60000, base + paraMin(JORNADA.almocoFim) * 60000);
  }
  return Math.max(0, (fim - ini - almocoMs) / 3600000);
}

// ---------------- divisão do dia entre PIs ----------------
// Divide `total` horas igualmente em `n` partes, em blocos de 15 min; a sobra vai para a última
// (assim a soma sempre bate com o total do dia).
export function dividirHoras(total, n) {
  if (!n) return [];
  const quartos = Math.round(total * 4); // total em blocos de 15 min
  const base = Math.floor(quartos / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? quartos - base * (n - 1) : base) / 4);
}
// reparte horas normais/extras do dia entre os PIs, proporcional às horas de cada um
export function repartirNormaisExtras(horasPorPi, normaisDia) {
  const total = horasPorPi.reduce((s, h) => s + h, 0) || 1;
  let restante = Math.round(normaisDia * 100) / 100;
  return horasPorPi.map((h, i) => {
    const ultimo = i === horasPorPi.length - 1;
    const normais = ultimo ? Math.min(h, Math.max(0, restante)) : Math.min(h, Math.round((h * normaisDia / total) * 100) / 100);
    restante = Math.round((restante - normais) * 100) / 100;
    return { normais, extras: Math.round((h - normais) * 100) / 100 };
  });
}

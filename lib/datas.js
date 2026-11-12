// Utilitários de data sempre no fuso LOCAL do aparelho.
//
// Motivo: `new Date().toISOString().slice(0, 10)` devolve a data em UTC — no Brasil
// (UTC-3) isso vira "amanhã" a partir das 21h, e RDOs/horas lançados à noite caíam
// no dia errado. Do mesmo jeito, `new Date("2026-01-10")` é interpretado como meia-noite
// UTC (= 21h do dia anterior aqui), deslocando barras e rótulos das linhas do tempo.

export function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function hojeISO() {
  return isoLocal(new Date());
}

// "YYYY-MM-DD" → Date à meia-noite local
export function dataLocal(iso) {
  return new Date(String(iso).slice(0, 10) + "T00:00:00");
}

// "YYYY-MM-DD" → timestamp (ms) à meia-noite local, ou null
export function tsLocal(iso) {
  if (!iso) return null;
  const d = dataLocal(iso);
  const t = d.getTime();
  // ano fora de 2000–2100 = data digitada errada: ignora (senão a escala dos gráficos vira séculos e trava)
  if (Number.isNaN(t) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
  return t;
}

// dia válido para lançamento (horas, RDO...): preenchido, ano plausível e não no futuro.
// (o atributo max do campo não impede digitar uma data futura em todos os navegadores)
// `diasAtras`: limite opcional para trás (ex: 60) — evita lançar num ano errado por engano.
export function diaLancavel(iso, diasAtras = null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || tsLocal(iso) === null) return false;
  const hoje = new Date(); const h = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (iso > h) return false;
  if (diasAtras !== null && iso < addDias(h, -diasAtras)) return false;
  return true;
}

export function addDias(iso, n) {
  const d = dataLocal(iso);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

// dias de hoje até a data (negativo = já passou)
export function diasAte(iso) {
  if (!iso) return null;
  return Math.round((dataLocal(iso) - dataLocal(hojeISO())) / 86400000);
}

export function formatarData(iso) {
  return iso ? dataLocal(iso).toLocaleDateString("pt-BR") : "—";
}

export function formatarDataCurta(iso) {
  return iso ? dataLocal(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
}

export function formatarDataHora(isoTs) {
  if (!isoTs) return "—";
  return new Date(isoTs).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function horaCurta(isoTs) {
  return new Date(isoTs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Horas entre dois horários "HH:MM". Se o término for antes do início, considera que
// virou o dia (turno noturno / parada industrial).
export function horasEntreHorarios(inicio, fim) {
  if (!inicio || !fim) return { horas: 0, viraDia: false };
  const [hi, mi] = inicio.split(":").map(Number);
  const [hf, mf] = fim.split(":").map(Number);
  let minutos = hf * 60 + mf - (hi * 60 + mi);
  const viraDia = minutos < 0;
  if (viraDia) minutos += 24 * 60;
  return { horas: minutos / 60, viraDia };
}

export function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export function formatarHoras(h) {
  const n = Number(h) || 0;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

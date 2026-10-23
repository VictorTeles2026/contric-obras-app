"use client";

import PainelShell from "../../components/PainelShell";
import CronogramaVisao from "../../components/CronogramaVisao";

// Cronograma (visão multi-PI). O conteúdo mora em components/CronogramaVisao.js,
// que também é usado na aba Cronograma da Página do PI.
export default function CronogramaPage() {
  return <PainelShell><CronogramaVisao /></PainelShell>;
}

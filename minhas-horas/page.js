"use client";

import { useAuth } from "../../lib/AuthContext";
import PainelShell from "../../components/PainelShell";
import PontoHoras from "../../components/PontoHoras";

// Check-in/out e lançamento de horas para master, gerente, coordenador e visualizador
export default function MinhasHorasPage() {
  const { usuario } = useAuth();
  return <PainelShell>{usuario && <PontoHoras usuario={usuario} />}</PainelShell>;
}

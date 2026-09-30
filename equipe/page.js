"use client";

import { useAuth } from "../../lib/AuthContext";
import { NAV_EQUIPE } from "../../lib/nav";
import MobileShell from "../../components/MobileShell";
import PontoHoras from "../../components/PontoHoras";

export default function EquipeHorasPage() {
  const { usuario } = useAuth();
  return (
    <MobileShell nav={NAV_EQUIPE} perfis={["funcionario", "terceiro"]}>
      {usuario && <PontoHoras usuario={usuario} />}
    </MobileShell>
  );
}
"use client";

import { useAuth } from "../../../lib/AuthContext";
import { NAV_LIDER } from "../../../lib/nav";
import MobileShell from "../../../components/MobileShell";
import PontoHoras from "../../../components/PontoHoras";

export default function LiderHorasPage() {
  const { usuario } = useAuth();
  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      {usuario && <PontoHoras usuario={usuario} />}
    </MobileShell>
  );
}
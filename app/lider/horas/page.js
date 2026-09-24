"use client";

import { useState } from "react";
import { useAuth } from "../../../lib/AuthContext";
import { useMinhasPis } from "../../../lib/minhasPis";
import { NAV_LIDER } from "../../../lib/nav";
import MobileShell from "../../../components/MobileShell";
import FormHoras from "../../../components/FormHoras";
import UltimosLancamentos from "../../../components/UltimosLancamentos";
import { Esqueleto, EstadoVazio } from "../../../components/ui";

export default function LiderHorasPage() {
  const { usuario } = useAuth();
  const { meusPis, todosPis, carregando } = useMinhasPis(usuario);
  const [versao, setVersao] = useState(0);

  return (
    <MobileShell nav={NAV_LIDER} perfis={["lider"]}>
      <div className="p-4 flex flex-col gap-5">
        <div className="font-head font-bold text-2xl pt-1">Minhas horas</div>
        {carregando && <Esqueleto linhas={3} />}
        {!carregando && meusPis.length === 0 && (
          <div className="cartao"><EstadoVazio icone="obra" titulo="Nenhuma obra" texto="Você não está alocado em nenhuma obra." /></div>
        )}
        {!carregando && meusPis.length > 0 && <FormHoras usuario={usuario} pis={meusPis} onEnviado={() => setVersao((v) => v + 1)} />}
        {!carregando && <UltimosLancamentos usuario={usuario} pis={todosPis} versao={versao} />}
      </div>
    </MobileShell>
  );
}

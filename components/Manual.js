"use client";

// ============================================================================================
// MANUAL INTERATIVO DO SGO CONTRIC
// Botão "Manual" (painel, app do líder/equipe) → janela com:
//   • Cursos: rápido para Líder de obra e completo do sistema (passo a passo, com progresso)
//   • Manual por tema, com busca (leva direto ao tema), telas ilustradas com marcadores
//     numerados (onde clicar) e tabela "o que preencher"
//   • Itens exclusivos do Master só aparecem para o Master
// Para incluir/alterar um tema: edite a lista TEMAS abaixo (id, grupo, titulo, rota, palavras,
// resumo, tela, passos, campos, dicas).
// ============================================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------- peças das telas
// marcador numerado: indica ONDE clicar / preencher (o número corresponde ao passo)
function N({ n }) {
  if (!n) return null;
  return <span className="absolute -top-2 -right-2 z-10 w-[18px] h-[18px] rounded-full bg-[#E8590C] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow manual-pulso">{n}</span>;
}
const Bt = ({ n, v = "p", children, className = "" }) => (
  <span className={`relative inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold whitespace-nowrap ${v === "p" ? "bg-[#0E89B0] text-white" : v === "n" ? "bg-[#0B2E44] text-white" : v === "v" ? "bg-[#2E9E44] text-white" : v === "r" ? "border border-[#D64545]/50 text-[#D64545] bg-white" : "border border-[#D5DCE5] bg-white text-[#24324A]"} ${className}`}>{children}<N n={n} /></span>
);
const Cp = ({ n, r, v = "", w = "", sel, className = "" }) => (
  <span className={`relative flex flex-col gap-0.5 min-w-0 ${w} ${className}`}>
    {r && <span className="text-[9px] font-medium text-[#6B7A90]">{r}</span>}
    <span className={`rounded-md border px-1.5 py-1 text-[10px] truncate ${n ? "border-[#E8590C] ring-2 ring-[#E8590C]/25 bg-white" : "border-[#D5DCE5] bg-white"} text-[#24324A]`}>{v || " "}{sel && " ▾"}</span>
    <N n={n} />
  </span>
);
const Chip = ({ n, on, children }) => <span className={`relative inline-flex rounded-full border px-2 py-0.5 text-[9px] font-medium ${on ? "bg-[#0E89B0] border-[#0E89B0] text-white" : "bg-white border-[#D5DCE5] text-[#6B7A90]"}`}>{children}<N n={n} /></span>;
const Card = ({ n, children, className = "" }) => <div className={`relative rounded-lg border border-[#D5DCE5] bg-white p-2 ${className}`}>{children}<N n={n} /></div>;
const Tit = ({ children }) => <div className="text-[12px] font-bold text-[#0B2E44] mb-1.5">{children}</div>;
const Txt = ({ children, c = "" }) => <div className={`text-[9.5px] text-[#6B7A90] leading-snug ${c}`}>{children}</div>;
const Barra = ({ p = 40, cor = "#0E89B0", fundo = true }) => (
  <span className={`block h-2 rounded-full overflow-hidden ${fundo ? "bg-[#0E89B0]/20" : ""}`}><span className="block h-full rounded-full" style={{ width: `${p}%`, background: cor }} /></span>
);
const Ico = ({ n, children = "•", className = "" }) => <span className={`relative inline-flex w-5 h-5 items-center justify-center rounded-md bg-white border border-[#D5DCE5] text-[10px] ${className}`}>{children}<N n={n} /></span>;
// moldura de tela (navegador ou celular)
function Tela({ url = "", cel = false, children }) {
  return (
    <div className={`rounded-xl border border-[#C9D2DE] bg-[#EEF2F6] overflow-hidden shadow-sm ${cel ? "max-w-[300px] mx-auto" : ""}`} aria-hidden="true">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0B2E44]">
        {!cel && <><span className="w-2 h-2 rounded-full bg-[#ff5f57]" /><span className="w-2 h-2 rounded-full bg-[#febc2e]" /><span className="w-2 h-2 rounded-full bg-[#28c840]" /></>}
        <span className="ml-1 text-[9px] text-white/70 font-mono truncate">{cel ? "📱 app Contric" : `sgo.contric · ${url}`}</span>
      </div>
      <div className="p-2.5 flex flex-col gap-2 text-[#24324A] select-none">{children}</div>
    </div>
  );
}
const Linha = ({ children, className = "" }) => <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>{children}</div>;
const Grade = ({ c = 2, children }) => <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${c}, minmax(0,1fr))` }}>{children}</div>;
const Kpi = ({ r, v, cor = "#24324A", n }) => <Card n={n}><div className="text-[8.5px] text-[#6B7A90] uppercase">{r}</div><div className="text-[14px] font-bold" style={{ color: cor }}>{v}</div></Card>;
const Gantt = ({ itens }) => (
  <Card>
    {itens.map(([nome, ini, larg, p, cor, sub, n], i) => (
      <div key={i} className="relative flex items-center gap-2 py-0.5 border-b border-[#EEF2F6] last:border-0">
        <span className={`w-[38%] truncate text-[9.5px] ${sub ? "pl-3 text-[#6B7A90]" : "font-semibold"}`}>{nome}</span>
        <span className="relative flex-1 h-3">
          <span className="absolute top-0.5 h-2 rounded-full overflow-hidden" style={{ left: `${ini}%`, width: `${larg}%`, background: `${cor || "#0E89B0"}33` }}><span className="block h-full" style={{ width: `${p}%`, background: cor || "#0E89B0" }} /></span>
          <span className="absolute top-0 bottom-0 w-px bg-[#D64545]" style={{ left: "45%" }} />
        </span>
        <N n={n} />
      </div>
    ))}
  </Card>
);

// ---------------------------------------------------------------------------- conteúdo
// grupo: seção do manual · rota: "Ir para a página" · master: só para o Master
// passos: [nº do marcador na tela (ou null), texto] · campos: [campo, o que preencher, obrigatório?]
const GRUPOS = ["Primeiros passos", "Visão geral", "Planejamento", "Execução", "Análises", "Cadastros", "App do líder e da equipe", "Portal do cliente", "Administração (Master)"];

const TEMAS = [
  // ================================================================ PRIMEIROS PASSOS
  {
    id: "acesso", grupo: "Primeiros passos", titulo: "Entrar no sistema, senha e tema", rota: "/login",
    palavras: "login entrar senha usuario acesso esqueci tema escuro claro sair celular instalar app",
    resumo: "Como entrar com seu usuário, trocar a senha, mudar o tema (claro/escuro) e sair. Funciona no computador e no celular (pode ser instalado como app).",
    tela: (
      <Tela url="login">
        <div className="mx-auto w-[70%] flex flex-col gap-2 py-2">
          <div className="text-center text-[12px] font-bold text-[#0B2E44]">SGO Contric</div>
          <Cp n={1} r="Usuário" v="joao.silva" />
          <Cp n={2} r="Senha" v="••••••••" />
          <Bt n={3} className="justify-center">Entrar</Bt>
        </div>
        <Linha className="justify-end border-t border-[#D5DCE5] pt-2"><Txt>Rodapé do menu:</Txt><Ico n={4}>☀</Ico><Ico n={5}>🔑</Ico><Ico n={6}>⎋</Ico></Linha>
      </Tela>
    ),
    passos: [
      [1, "Digite seu usuário (ex.: joao.silva) ou o e-mail cadastrado. Não diferencia maiúsculas."],
      [2, "Digite a senha recebida da Contric (no primeiro acesso, troque-a)."],
      [3, "Clique em Entrar. O sistema abre a página inicial do seu perfil (Painel, app do Líder ou da Equipe)."],
      [4, "Tema: alterna entre claro e escuro (fica salvo no aparelho)."],
      [5, "Chave: altera a sua senha (pede a senha atual e a nova, mínimo 8 caracteres)."],
      [6, "Sair: encerra a sessão neste aparelho."],
    ],
    dicas: [
      "No celular, use o menu do navegador → \"Adicionar à tela inicial\" para usar como aplicativo.",
      "Esqueceu a senha? Peça a um gestor (Usuários → editar → gerar nova senha).",
      "Login desabilitado ou sem cadastro mostra uma mensagem — fale com o administrador.",
    ],
  },
  {
    id: "navegacao", grupo: "Primeiros passos", titulo: "Menu, navegação e notificações", rota: "/dashboard",
    palavras: "menu navegar sino notificacao avisos mais celular barra inferior grupos",
    resumo: "O menu mostra só o que o seu perfil pode usar, organizado pelo processo da obra: Visão geral, Planejamento, Execução, Análises, Cadastros e Administração.",
    tela: (
      <Tela url="dashboard">
        <div className="flex gap-2">
          <Card n={1} className="w-[34%] !p-1.5 flex flex-col gap-1">
            {["Dashboard", "Aprovações", "PIs", "— Planejamento", "Configurar Cronograma", "— Execução", "Cronograma", "Lançar Horas", "— Análises", "Relatórios"].map((t) => <span key={t} className={`text-[9px] ${t.startsWith("—") ? "text-[#9AA6B8] uppercase mt-1" : "px-1 py-0.5 rounded " + (t === "Dashboard" ? "bg-[#0E89B0]/10 text-[#0E89B0] font-semibold" : "")}`}>{t.replace("— ", "")}</span>)}
          </Card>
          <div className="flex-1 flex flex-col gap-1.5">
            <Linha className="justify-end"><Ico n={2}>🔔</Ico><Ico n={3}>?</Ico></Linha>
            <Grade c={2}><Kpi r="PIs ativos" v="12" /><Kpi r="Aprovações" v="5" cor="#C97A21" /></Grade>
          </div>
        </div>
        <Card n={4} className="!p-1"><Linha className="justify-around text-[9px]"><span>🏠 Dashboard</span><span>✔ Aprovações</span><span>🏗 PIs</span><span>☰ Mais</span></Linha></Card>
      </Tela>
    ),
    passos: [
      [1, "Menu lateral (computador): clique na página desejada. Os títulos (Planejamento, Execução...) agrupam as funções."],
      [2, "Sino: avisos do sistema para você (aprovações, alterações nos seus lançamentos, alocações). Clique para ver e marcar como lido."],
      [3, "Manual: abre este manual a qualquer momento, já no tema da página em que você está."],
      [4, "No celular, o menu fica embaixo: atalhos principais + \"Mais\" com todas as outras páginas."],
    ],
    dicas: ["Se uma página não aparece no seu menu, o seu perfil não tem permissão — peça ao Master (Permissões)."],
  },
  {
    id: "filtros", grupo: "Primeiros passos", titulo: "Filtros (várias opções, encadeados, limpar)", rota: "/relatorios/horas",
    palavras: "filtro filtrar selecionar varios multipla escolha encadeado limpar buscar",
    resumo: "Em todas as listas com filtro você pode marcar várias opções. Os filtros são encadeados: escolhido um cliente, a lista de PIs mostra só os PIs dele.",
    tela: (
      <Tela url="relatorios/horas">
        <Grade c={3}><Cp n={1} r="Cliente" v="Bridgestone" sel /><Cp n={2} r="PI" v="2 selecionados" sel /><Cp r="Situação" v="Aprovadas e pendentes" sel /></Grade>
        <Card className="w-[60%]">
          <Linha className="justify-between text-[9px] mb-1"><span className="text-[#0E89B0]">Marcar todos</span><span className="text-[#6B7A90]">Limpar</span></Linha>
          {["227380 — Bridgestone", "227391 — Bridgestone"].map((t) => <div key={t} className="text-[9.5px] py-0.5">☑ {t}</div>)}
        </Card>
        <Linha className="justify-end"><Bt n={3} v="c">✕ Limpar filtros (2)</Bt></Linha>
      </Tela>
    ),
    passos: [
      [1, "Abra o filtro e marque uma ou mais opções. Listas grandes têm campo de busca."],
      [2, "Os outros filtros passam a mostrar só opções que combinam com o que já foi escolhido."],
      [3, "Limpar filtros volta tudo ao padrão (o número mostra quantos filtros estão ativos)."],
    ],
    dicas: ["Nada marcado = todos. Passe o mouse sobre o filtro para ver o que está marcado."],
  },

  // ================================================================ VISÃO GERAL
  {
    id: "dashboard", grupo: "Visão geral", titulo: "Dashboard", rota: "/dashboard",
    palavras: "dashboard painel indicadores quadros arrastar mover pis nao iniciados medicoes atrasadas documentos",
    resumo: "Painel de acompanhamento com indicadores e quadros que você pode mover e redimensionar.",
    tela: (
      <Tela url="dashboard">
        <Grade c={4}><Kpi n={1} r="PIs ativos" v="12" cor="#0E89B0" /><Kpi r="Aprovações" v="5" cor="#C97A21" /><Kpi r="Atrasadas" v="3" cor="#D64545" /><Kpi r="Medições 20d" v="2" cor="#8E5CD9" /></Grade>
        <Grade c={2}>
          <Card n={2}><Tit>PIs</Tit><Linha><Chip on>Ativo</Chip><Chip>Pausado</Chip></Linha><Txt c="mt-1">227380 — MBB · 28%</Txt></Card>
          <Card n={3}><Tit>PIs não iniciados</Tit><Linha><Chip on>Todos</Chip><Chip>Sem cronograma</Chip></Linha><Txt c="mt-1">227401 · Configurar →</Txt></Card>
        </Grade>
      </Tela>
    ),
    passos: [
      [1, "Indicadores: clique para ir à página correspondente (Cronograma, Aprovações...)."],
      [2, "Quadro PIs: busca por nº/cliente/projeto e filtro por status. Clique no PI para abrir a Página do PI."],
      [3, "Quadro PIs não iniciados: PIs ativos sem cronograma ou sem nenhuma etapa iniciada, com atalho para configurar."],
      [null, "Arraste os quadros pelo título para reorganizar e puxe o canto para redimensionar — o layout fica salvo para você."],
    ],
    dicas: ["Outros quadros: Medições próximas (com valores, se permitido), Documentos não abertos, etapas atrasadas."],
  },
  {
    id: "aprovacoes", grupo: "Visão geral", titulo: "Aprovações (RDO, horas, ocorrências, solicitações)", rota: "/aprovacoes",
    palavras: "aprovar reprovar aprovacao rdo horas ocorrencia solicitacao motivo normais extras classificacao categoria validar",
    resumo: "Tudo o que aguarda decisão: RDOs, lançamentos de horas, ocorrências avulsas e solicitações de alteração do cronograma.",
    tela: (
      <Tela url="aprovacoes">
        <Linha><Chip n={1} on>Horas (4)</Chip><Chip>RDOs (2)</Chip><Chip>Ocorrências</Chip><Chip>Solicitações (1)</Chip></Linha>
        <Card>
          <Linha className="justify-between"><span className="text-[10px] font-semibold">João Silva · 227380 · 12/11</span><span className="text-[10px] font-bold">9h</span></Linha>
          <Grade c={4}><Cp n={2} r="Normais" v="8" /><Cp r="Extras" v="1" /><Cp n={3} r="Classif. normal" v="CN Campo" sel /><Cp r="Classif. extra" v="CE Campo" sel /></Grade>
          <Linha className="justify-end mt-1.5"><Bt n={5} v="r">Reprovar</Bt><Bt n={4} v="v">Aprovar</Bt></Linha>
        </Card>
      </Tela>
    ),
    passos: [
      [1, "Escolha o tipo. O número mostra quantos itens aguardam."],
      [2, "Horas: confira/ajuste a divisão entre horas normais e extras (a soma deve dar o total)."],
      [3, "Classifique as horas (tipo de hora do orçamento: CN, CE, CI...). É o que alimenta o consumo de horas do PI."],
      [4, "Aprovar: confirma o item (fica no Histórico)."],
      [5, "Reprovar: pede o motivo, que é enviado a quem lançou."],
      [null, "RDOs e ocorrências podem ser abertos, editados (a pessoa é notificada do que mudou) e o PDF é gerado automaticamente."],
      [null, "Solicitações de alteração (data/nome de etapa): ao aprovar, a etapa é alterada no cronograma."],
    ],
    campos: [["Horas normais", "Parte do total em jornada normal", true], ["Classificação", "Tipo de hora do orçamento do PI", true], ["Motivo (reprovar)", "Explique o que deve ser corrigido", true]],
    dicas: ["Aba Histórico: tudo o que já foi decidido, com filtro por tipo e por PI; permite editar ou excluir (com motivo, registrado na Auditoria)."],
  },
  {
    id: "pagina-pi", grupo: "Visão geral", titulo: "Página do PI (tudo da obra num só lugar)", rota: "/pi",
    palavras: "pagina do pi obra resumo abas equipe campo documentos financeiro cliente qr code consumo avanco medicoes pdf excel enviar",
    resumo: "Lista de PIs e, ao abrir um, todas as informações da obra em abas: Resumo, Cronograma, Equipe e recursos, Campo, Documentos, Financeiro e Cliente.",
    tela: (
      <Tela url="pi?id=…">
        <Linha className="justify-between"><span><b className="text-[#0E89B0] text-[11px]">PI 227380</b> <span className="text-[10px]">MBB — Dispositivos</span></span><Linha><Bt n={1} v="c">QR Code</Bt><Bt v="p">Configurar Cronograma</Bt></Linha></Linha>
        <Linha className="border-b border-[#D5DCE5] pb-1"><Chip n={2} on>Resumo</Chip><Chip>Cronograma</Chip><Chip>Equipe</Chip><Chip>Campo</Chip><Chip>Documentos</Chip><Chip>Financeiro</Chip><Chip>Cliente</Chip></Linha>
        <Grade c={4}><Kpi n={3} r="Avanço" v="28%" cor="#0E89B0" /><Kpi r="Consumo horas" v="22%" cor="#2E9E44" /><Kpi r="Atrasadas" v="1" cor="#D64545" /><Kpi r="Pendências" v="3" cor="#C97A21" /></Grade>
      </Tela>
    ),
    passos: [
      [1, "QR Code do PI: mostrar, imprimir ou gerar PDF para colar na obra (o líder escaneia para lançar horas/RDO)."],
      [2, "Abas: cada uma traz uma parte da obra. Só aparecem as abas permitidas ao seu perfil."],
      [3, "Resumo: avanço do cronograma e consumo de material/horas (verde = consumo igual ou abaixo do avanço; vermelho = acima)."],
      [null, "Cronograma: visão do PI + gerar PDF/Excel e enviar ao cliente (baixar, salvar no SGO, enviar por e-mail)."],
      [null, "Equipe e recursos: quem está alocado e quando · Campo: RDOs, horas e ocorrências · Documentos: arquivos do PI."],
      [null, "Financeiro: orçado × realizado (Compra R$ e Horas). Líderes veem só horas (orçado × consumo × resultado)."],
      [null, "Cliente: quais clientes têm acesso ao portal deste PI e o que veem."],
    ],
    dicas: ["Com um PI aberto, a aba fina \"Lista de PIs\" à esquerda troca de obra sem voltar."],
  },

  // ================================================================ PLANEJAMENTO
  {
    id: "cadastro-pis", grupo: "Planejamento", titulo: "Cadastro de PIs (abrir e editar um PI)", rota: "/pis",
    palavras: "cadastro pi novo pi abrir editar orcamento categorias responsavel cliente prazo status numero",
    resumo: "Abertura do PI: dados da obra, responsável no cliente e orçamento (Compra em R$ e horas por tipo de hora).",
    tela: (
      <Tela url="pis">
        <Linha className="justify-between"><Tit>Cadastro de PIs</Tit><Bt n={1}>+ Novo PI</Bt></Linha>
        <Card>
          <Grade c={3}><Cp n={2} r="Nº do PI *" v="227380" /><Cp n={3} r="Cliente *" v="MBB" /><Cp r="Status" v="Ativo" sel /></Grade>
          <Grade c={2}><Cp n={4} r="Projeto" v="Dispositivos de elevação" /><Cp n={5} r="Prazo" v="31/12/2027" /></Grade>
          <Grade c={3}><Cp n={6} r="Resp. no cliente" v="Júlio" /><Cp r="E-mail" v="julio@…" /><Cp r="Telefone" v="(11)…" /></Grade>
          <Txt c="mt-1 font-semibold text-[#0E89B0]">Horas (MOI + Contric)</Txt>
          <Grade c={4}><Cp n={7} r="CN Campo" v="320 h" /><Cp r="CE Campo" v="40 h" /><Cp r="EM Eng. Mec." v="180 h" /><Cp r="PR Programador" v="60 h" /></Grade>
          <Linha className="justify-end mt-1.5"><Bt n={8} v="v">Salvar</Bt></Linha>
        </Card>
      </Tela>
    ),
    passos: [
      [1, "Clique em + Novo PI (ou no PI da lista para editar)."],
      [2, "Número do PI (único)."], [3, "Cliente (empresa)."], [4, "Nome do projeto."], [5, "Prazo contratual."],
      [6, "Responsável no cliente: nome, e-mail e telefone (pode virar contato do portal)."],
      [7, "Orçamento: valores de Compra (R$) e horas orçadas por tipo de hora. Base de Relatórios e Horas orçadas."],
      [8, "Salvar."],
    ],
    campos: [["Nº do PI", "Código único da obra", true], ["Cliente", "Empresa cliente", true], ["Projeto", "Descrição curta", false], ["Prazo", "Data limite contratual", false], ["Status", "Ativo, Pausado, Concluído, Cancelado", true], ["Orçamento", "R$ por categoria de compra e horas por tipo de hora", false]],
    dicas: ["As categorias do orçamento são definidas pelo Master em Configurações → Categorias de orçamento."],
  },
  {
    id: "configurar-cronograma", grupo: "Planejamento", titulo: "Configurar Cronograma — passo a passo completo", rota: "/cronograma",
    palavras: "configurar cronograma etapa macro sub etapa datas inicio termino responsavel percentual status equipe alocacao dependencia arrastar reordenar alerta prazo medicao cronograma base baseline dias uteis feriados",
    resumo: "Onde o cronograma do PI é montado: macro-etapas, sub-etapas, datas, responsável, %, status, equipes, alocação de recursos, dependências, alertas de prazo, medições e Cronograma Base.",
    tela: (
      <Tela url="cronograma">
        <Linha>
          <Cp n={1} r="" v="227380 — MBB — Dispositivos" sel w="w-[42%]" />
          <Bt v="c">Página do PI</Bt><Bt v="c">Editar PI</Bt><Bt n={2} v="n">🎤 Assistente IA</Bt><Bt n={3} v="c" className="!border-[#C97A21] !text-[#C97A21]">⚠ Salvar Cronograma Base</Bt>
        </Linha>
        <Card className="!p-1.5">
          <Linha className="text-[9.5px]">
            <Ico n={4}>⋮⋮</Ico><span className="w-2 h-2 rounded-full bg-[#0E89B0] relative"><N n={5} /></span>
            <Cp n={6} v="PROJETO" w="w-[24%]" /><Cp n={7} v="Contric" w="w-[12%]" />
            <Cp n={8} v="03/11/26" w="w-[13%]" /><Cp v="28/11/26" w="w-[13%]" /><Cp n={9} v="40 %" w="w-[8%]" /><Cp n={10} v="Em andamento" sel w="w-[15%]" />
          </Linha>
          <Linha className="mt-1"><Bt n={11} v="c">Equipe</Bt><Bt n={12} v="c">Alocação</Bt><Bt n={13} v="c">🔔 Alertas</Bt><Bt n={14} v="c">M-R$ Medição</Bt><Ico>🗑</Ico></Linha>
          <div className="ml-4 mt-1 border-l-2 border-[#D5DCE5] pl-2 flex flex-col gap-1">
            <Linha className="text-[9.5px]"><Ico>⋮⋮</Ico><Cp v="Projeto Mecânico - 3D" w="w-[40%]" /><Cp v="10/11" w="w-[14%]" /><Cp v="05/12" w="w-[14%]" /><Cp v="40 %" w="w-[10%]" /></Linha>
            <Bt n={15} v="c" className="self-start">+ sub-etapa em "PROJETO"</Bt>
          </div>
        </Card>
        <Bt n={16} v="p" className="self-start">+ Macro-etapa</Bt>
      </Tela>
    ),
    passos: [
      [1, "Escolha o PI (busca por nº, cliente ou projeto). Sem PI ainda? Use + Novo PI ao lado."],
      [2, "Assistente IA: monta ou altera o cronograma por voz ou texto (veja o tema \"Assistente de IA por voz\")."],
      [3, "Cronograma Base: congela a versão atual como referência para comparar atrasos e mudanças (laranja = ainda não salvo; verde = salvo, clique para atualizar)."],
      [4, "⋮⋮ Arrastar: solte na borda de CIMA/BAIXO de outra etapa para mover antes/depois; solte no MEIO de uma macro para virar sub-etapa dela; solte entre macros para sub virar macro. A linha azul mostra onde vai cair."],
      [5, "Bolinha azul: arraste até outra etapa para criar DEPENDÊNCIA (a outra só começa depois desta). Clique com o botão direito na seta para excluí-la."],
      [6, "Nome da etapa (até 70 caracteres — o contador aparece perto do limite)."],
      [7, "Responsável: texto livre (ex.: Contric, Cliente / Contric, nome da pessoa); há sugestões."],
      [8, "Datas de início e término. Abaixo aparecem dias corridos, dias úteis e feriados no período. Ano inválido fica vermelho e não é salvo."],
      [9, "% concluído (0 a 100)."],
      [10, "Status: Não iniciada, Em andamento, Concluída, Parada."],
      [11, "Equipe: áreas responsáveis. Na macro, marcar uma equipe distribui para todas as sub-etapas."],
      [12, "Alocação: marque os recursos (pessoas, equipamentos) — o período da etapa é usado. Na macro, vale para todas as sub-etapas."],
      [13, "Alertas: até 3 avisos por e-mail X dias antes do início ou do término (o sino aparece na etapa)."],
      [14, "Medição: marque se a etapa gera medição e informe % e valor (R$). Aparece no Dashboard e no Financeiro."],
      [15, "+ sub-etapa: cria uma sub-etapa dentro da macro."],
      [16, "+ Macro-etapa: cria uma nova fase do PI."],
    ],
    campos: [
      ["Nome", "Descrição da etapa, até 70 caracteres", true], ["Início / Término", "Datas previstas (ano de 2000 a 2100)", true],
      ["Responsável", "Quem responde pela etapa (texto livre)", false], ["%", "Avanço 0–100", false], ["Status", "Situação atual", true],
      ["Equipe / Alocação", "Áreas e recursos que executam", false], ["Alertas", "Dias de antecedência para e-mail", false], ["Medição", "% e valor a medir", false],
    ],
    dicas: [
      "Macro com sub-etapas é CALCULADA: datas, % e status vêm das sub-etapas (os campos ficam só leitura).",
      "Tudo salva sozinho ao digitar — não há botão salvar. Erros aparecem numa faixa vermelha no topo.",
      "Aba \"Solicitações\": pedidos de alteração vindos do campo para este PI.",
      "Excluir PI (somente Master) apaga o PI e tudo ligado a ele — pede confirmação dupla.",
    ],
  },
  {
    id: "ia-voz", grupo: "Planejamento", titulo: "Assistente de IA por voz (no Configurar Cronograma)", rota: "/cronograma",
    palavras: "ia inteligencia artificial voz falar microfone ditar assistente interpretar aplicar pedido criar etapas automatico",
    resumo: "Fale ou escreva o que quer no cronograma; a IA transforma o pedido em ações (criar, alterar, excluir etapas, dependências, equipes, alocações, alertas, medições). Você revisa e aplica.",
    tela: (
      <Tela url="cronograma · Assistente de IA">
        <Card>
          <Tit>Assistente de IA — 227380</Tit>
          <div className="relative rounded-md border border-[#E8590C] ring-2 ring-[#E8590C]/25 bg-white p-1.5 text-[9.5px] min-h-[42px]">
            "Cria a macro Elétrica com levantamento de 3 dias a partir de 3/11 e projeto executivo de 9 dias depois dele, responsável Contric"
            <N n={2} />
            <span className="absolute right-1 top-1 w-6 h-6 rounded-full bg-[#D64545] text-white flex items-center justify-center text-[10px]">🎤<N n={1} /></span>
          </div>
          <Linha className="justify-end mt-1.5"><Bt v="c">Fechar</Bt><Bt n={3}>Interpretar pedido</Bt></Linha>
        </Card>
        <Card>
          <Txt><b>IA:</b> vou criar 1 macro e 2 sub-etapas…</Txt>
          {[["Criar", "Elétrica", "#2E9E44"], ["Criar", "Levantamento · 03/11 a 05/11", "#2E9E44"], ["Dependência", "Projeto executivo depende de Levantamento", "#8E5CD9"]].map(([t, d, c], i) => (
            <Linha key={i} className="relative border border-[#D5DCE5] rounded-md px-1.5 py-1 mt-1"><span>☑</span><span className="text-[9px] font-bold" style={{ color: c }}>{t}</span><span className="text-[9.5px]">{d}</span>{i === 0 && <N n={4} />}</Linha>
          ))}
          <Linha className="justify-end mt-1.5"><Bt v="c">Refazer pedido</Bt><Bt n={5} v="v">Aplicar 3 alterações</Bt></Linha>
        </Card>
      </Tela>
    ),
    passos: [
      [null, "Em Configurar Cronograma, escolha o PI e clique no botão escuro \"🎤 Assistente IA\"."],
      [1, "Microfone: clique e fale (o botão fica vermelho e pulsando). Pode fazer pausas — ele continua ouvindo até você clicar de novo. Na primeira vez, o navegador pede permissão do microfone: clique em Permitir."],
      [2, "O texto falado aparece na caixa — confira e corrija à vontade (também dá para só digitar). É exatamente isso que a IA recebe (até 20.000 caracteres)."],
      [3, "Interpretar pedido: a IA lê o cronograma atual do PI e devolve um resumo e a lista de ações."],
      [4, "Revise: desmarque o que não quiser. Dúvidas da IA aparecem em amarelo."],
      [5, "Aplicar: grava as ações marcadas com as suas permissões. Fica registrado na Auditoria."],
    ],
    dicas: [
      "Exemplos: \"Atrasa o comissionamento em 4 dias e empurra o startup\" · \"Marca o levantamento como concluído\" · \"Aloca o João e a equipe Elétrica na montagem\" · \"Coloca alerta 7 e 3 dias antes do término do try-out\" · \"Medição de 30% e R$ 50 mil no fim da fabricação\".",
      "Voz funciona no Chrome e no Edge (computador e celular). Em outro navegador, digite o pedido.",
      "Pedidos muito grandes podem passar do tempo limite: faça em partes (uma macro-etapa por vez).",
      "Nada é gravado sem você clicar em Aplicar. O pedido e o cronograma do PI são enviados à IA apenas para interpretar.",
    ],
  },
  {
    id: "solicitacoes", grupo: "Planejamento", titulo: "Solicitações de alteração do cronograma", rota: "/cronograma/solicitacoes",
    palavras: "solicitacao solicitar alteracao mudar data nome etapa pedido campo aprovar justificativa",
    resumo: "Quem não edita o cronograma pede alterações (datas, nome, outro) com justificativa; o gestor aprova ou reprova.",
    tela: (
      <Tela url="cronograma/solicitacoes">
        <Linha><Chip on>Pendentes (2)</Chip><Chip>Aprovadas</Chip><Chip>Reprovadas</Chip></Linha>
        <Card n={1}><Txt><b>Montagem</b> · Data de término → 20/12/2026</Txt><Txt>Justificativa: material atrasou · por Carlos (líder)</Txt><Linha className="justify-end mt-1"><Bt v="r">Reprovar</Bt><Bt n={2} v="v">Aprovar</Bt></Linha></Card>
      </Tela>
    ),
    passos: [[1, "Cada pedido mostra a etapa, o campo, o novo valor e a justificativa."], [2, "Aprovar altera a etapa automaticamente; reprovar pede o motivo. O solicitante é notificado."]],
    dicas: ["No app do líder: menu Solicitar → escolha obra, etapa, o que mudar, o novo valor e a justificativa."],
  },
  {
    id: "alocacao", grupo: "Planejamento", titulo: "Alocação de recursos", rota: "/recursos?aba=alocacao",
    palavras: "alocacao alocar recurso pessoa equipamento periodo percentual cadencia etapa massa varios sobreposicao",
    resumo: "Aloca pessoas e equipamentos em PIs/etapas por período e % do dia (ou cadência). Inclui alocação em massa.",
    tela: (
      <Tela url="recursos?aba=alocacao">
        <div className="flex gap-2">
          <Card n={1} className="w-[35%]"><Cp r="" v="Buscar recurso..." /><Txt c="mt-1">● João Silva · Montador</Txt><Txt>● Guindaste 30t</Txt></Card>
          <Card className="flex-1">
            <Grade c={2}><Cp n={2} r="PI" v="227380" sel /><Cp n={3} r="Etapa" v="Montagem" sel /></Grade>
            <Grade c={3}><Cp n={4} r="Início" v="10/11" /><Cp r="Fim" v="30/11" /><Cp n={5} r="Uso (%)" v="100" /></Grade>
            <Linha className="justify-end mt-1.5"><Bt n={6} v="n">⚡ Alocar vários</Bt><Bt n={7} v="v">Salvar alocação</Bt></Linha>
          </Card>
        </div>
      </Tela>
    ),
    passos: [[1, "Escolha o recurso (filtro por equipe e busca)."], [2, "PI."], [3, "Etapa (opcional): usa as datas da etapa, igual à alocação em Configurar Cronograma."], [4, "Período."], [5, "Uso do dia em % (avisa se passar de 100% somando outras alocações no mesmo período)."], [6, "Alocar vários: o mesmo PI/etapa/período para vários recursos de uma vez."], [7, "Salvar."]],
    dicas: ["A pessoa alocada recebe aviso no sino e passa a ver a obra no app (Meus PIs, Atualizar avanço)."],
  },

  // ================================================================ EXECUÇÃO
  {
    id: "cronograma-visao", grupo: "Execução", titulo: "Cronograma (visão de todos os PIs), Meus PIs e Atualizar avanço", rota: "/linha-do-tempo",
    palavras: "cronograma visao gantt linha do tempo meus pis atualizar avanco percentual status zoom periodo hoje filtro equipe recurso cliente",
    resumo: "Gantt de vários PIs para acompanhamento e apresentação, com filtros por cliente, equipe e recurso. \"Meus PIs\" mostra onde você está alocado e permite atualizar o avanço das suas etapas.",
    tela: (
      <Tela url="linha-do-tempo">
        <Linha className="justify-between"><Tit>Cronograma</Tit><Linha><Bt n={1} v="p">👥 Meus PIs (3)</Bt><Bt n={2} v="c">PIs (8 de 20)</Bt></Linha></Linha>
        <Linha><Cp n={3} v="Todos os clientes" sel w="w-[24%]" /><Cp v="Todas as equipes" sel w="w-[24%]" /><Cp v="Todos os recursos" sel w="w-[24%]" /><Bt>Filtrar</Bt></Linha>
        <Linha><Bt n={4} v="c">−</Bt><Cp v="60 dias" sel w="w-[14%]" /><Bt v="c">+</Bt><span className="flex-1 h-1.5 rounded bg-[#D5DCE5]" /><Bt v="r">Hoje</Bt></Linha>
        <Card className="!p-1"><Linha className="justify-between text-[9.5px] bg-[#EEF2F6] rounded px-1 py-0.5"><span><b className="text-[#0E89B0]">227380</b> — MBB</span><Bt n={5}>✎ Atualizar avanço</Bt></Linha></Card>
        <Gantt itens={[["PROJETO", 10, 50, 40], ["Projeto Mecânico - 3D", 20, 30, 40, null, true], ["Montagem", 55, 35, 0, "#93A2B8", true]]} />
      </Tela>
    ),
    passos: [
      [1, "Meus PIs: só os PIs em que o seu recurso está alocado em ao menos uma etapa."],
      [2, "PIs: escolha quais obras aparecem (padrão: as ativas)."],
      [3, "Filtros por cliente, equipe e recurso — as etapas que batem ganham a cor do filtro."],
      [4, "Período visível: − / + muda o zoom; a barra e as setas deslocam o período; Hoje centraliza no dia atual."],
      [5, "Atualizar avanço: aparece nos PIs em que você está alocado. Abre só as SUAS etapas para alterar status e %. Se você está alocado na macro-etapa, pode atualizar todas as sub-etapas dela. Fica registrado na Auditoria."],
      [null, "Clique no nome do PI para alternar: tudo → só macro-etapas → contraído."],
    ],
    dicas: ["Marcadores: ◆ M = medição no fim do período · 🔔 = alerta de prazo · contorno vermelho/laranja = prazo próximo."],
  },
  {
    id: "rdo-painel", grupo: "Execução", titulo: "RDO no painel (consulta e lançamento)", rota: "/rdo",
    palavras: "rdo relatorio diario obra atividades ocorrencias fotos assinatura pdf tecnico",
    resumo: "RDO (Relatório Diário de Obra): atividades do dia com status e %, ocorrências com fotos, assinatura do cliente e PDF automático.",
    tela: (
      <Tela url="rdo">
        <Grade c={2}><Cp n={1} r="PI" v="227380" sel /><Cp n={2} r="Data" v="12/11/2026" /></Grade>
        <Card n={3}><Txt><b>Montagem</b></Txt><Linha><Chip on>Em andamento</Chip><Chip>Concluída</Chip><Cp v="60 %" w="w-[18%]" /></Linha></Card>
        <Card n={4}><Txt><b>Ocorrência</b> · Atraso · "Chuva parou a montagem" · 📷 2 fotos</Txt></Card>
        <Linha className="justify-end"><Bt n={5} v="v">Enviar RDO</Bt></Linha>
      </Tela>
    ),
    passos: [[1, "PI."], [2, "Data do RDO."], [3, "Para cada etapa trabalhada: status e % do dia."], [4, "Ocorrências do dia (categoria, descrição, fotos/vídeos, assinatura do cliente se houver)."], [5, "Enviar: vai para Aprovações; o PDF é gerado automaticamente."]],
    dicas: ["Há também o RDO técnico (início/fim, deslocamento, atividades técnicas) conforme o modelo do PI."],
  },
  {
    id: "lancar-horas", grupo: "Execução", titulo: "Lançar Horas (ponto, manual e para recursos)", rota: "/minhas-horas",
    palavras: "horas lancar ponto checkin checkout entrada saida manual almoco recursos equipe normais extras qr",
    resumo: "Lançamento de horas: check-in/check-out (ponto), lançamento manual (entrada/saída) e, para gestores, lançamento para recursos (equipe, equipamentos), com horas normais e extras.",
    tela: (
      <Tela url="minhas-horas">
        <Linha className="border-b border-[#D5DCE5] pb-1"><Chip n={1} on>Check-in / out</Chip><Chip>Lançar manual</Chip><Chip>Lançar para recursos</Chip></Linha>
        <Grade c={4}><Kpi r="Hoje" v="8h" /><Kpi r="Semana" v="32h" /><Kpi r="Pendentes" v="2" cor="#C97A21" /><Kpi r="Reprovados" v="0" /></Grade>
        <Card>
          <Grade c={2}><Cp n={2} r="Obra" v="227380 — MBB" sel /><Cp n={3} r="Dia" v="Hoje" /></Grade>
          <Grade c={2}><Cp n={4} r="Entrada" v="07:00" /><Cp r="Saída" v="17:00" /></Grade>
          <Txt c="mt-1">Total: 9h (almoço −1h descontado)</Txt>
          <Linha className="justify-end"><Bt n={5} v="v">Enviar horas</Bt></Linha>
        </Card>
      </Tela>
    ),
    passos: [
      [1, "Escolha o modo: Ponto (registra entrada agora e saída depois), Manual (informa os horários) ou Para recursos (gestores)."],
      [2, "Obra (pode ler o QR Code do PI). Líderes podem marcar várias obras e dividir as horas."],
      [3, "Dia trabalhado (hoje, ontem ou outra data — não aceita data futura)."],
      [4, "Entrada e saída. O almoço configurado é descontado automaticamente; saída depois da meia-noite conta como dia seguinte."],
      [5, "Enviar: vai para aprovação. Enquanto pendente, dá para editar em \"Últimos lançamentos\"."],
    ],
    campos: [["Obra", "PI trabalhado", true], ["Dia", "Data do trabalho", true], ["Entrada/Saída", "Horários (máx. 16h brutas)", true], ["Extras (recursos)", "Parte do total que é hora extra", false]],
  },
  {
    id: "documentos", grupo: "Execução", titulo: "Documentos (arquivos do PI, pastas e liberação ao cliente)", rota: "/documentos",
    palavras: "documentos arquivos enviar upload pasta classificacao liberar cliente ata contrato pdf baixar excluir",
    resumo: "Arquivos do PI organizados por pastas (classificações). Envio, consulta, exclusão e liberação de arquivos ou pastas inteiras para clientes do portal.",
    tela: (
      <Tela url="documentos">
        <Linha><Cp n={1} r="" v="227380 — MBB" sel w="w-[50%]" /><Bt n={2}>Buscar</Bt></Linha>
        <Linha><Chip on>Todos</Chip><Chip>PDF</Chip><Chip>Imagens</Chip><Cp v="Filtrar por nome..." w="w-[30%]" /></Linha>
        <Card n={3}><Linha><Txt><b>Pastas</b></Txt><Chip on>Todas</Chip><Chip>ATA</Chip><Chip>CONTRATO</Chip><Bt v="c">+ Nova pasta</Bt></Linha></Card>
        <Card><Linha className="justify-between"><Txt>📄 ATA_20261105_PI-227380.pdf</Txt><Linha><Bt n={4} v="c">👁 Liberar ao cliente</Bt><Ico>🗑</Ico></Linha></Linha></Card>
        <Bt n={5} className="self-start">⬆ Enviar arquivos</Bt>
      </Tela>
    ),
    passos: [[1, "Escolha o PI."], [2, "Buscar lista os arquivos."], [3, "Pastas: filtre, crie pastas e libere uma pasta inteira a clientes."], [4, "Liberar ao cliente: o arquivo aparece no portal do cliente escolhido (ele recebe e-mail)."], [5, "Enviar arquivos: escolha a classificação; o nome é padronizado (ex.: ATA_AAAAMMDD_PI.pdf)."]],
    dicas: ["Atas (prefixo ATA_) aparecem no portal para clientes com acesso \"Atas\"."],
  },
  {
    id: "utilizacao", grupo: "Execução", titulo: "Utilização de recursos", rota: "/recursos?aba=utilizacao",
    palavras: "utilizacao recursos grafico ocupacao percentual sobrecarga tipo periodo",
    resumo: "Gráfico de ocupação dos recursos ao longo do tempo (soma das alocações), para achar sobrecarga e ociosidade.",
    tela: (
      <Tela url="recursos?aba=utilizacao">
        <Linha><Chip n={1} on>Mão de obra</Chip><Chip>Equipamentos</Chip><Bt v="c">Hoje</Bt></Linha>
        <Gantt itens={[["João Silva", 5, 60, 100, "#2E9E44", false, 2], ["Maria Souza", 30, 40, 100, "#D64545"], ["Guindaste 30t", 50, 30, 100, "#0E89B0"]]} />
      </Tela>
    ),
    passos: [[1, "Filtre por tipo de recurso."], [2, "Cada barra é uma alocação; vermelho indica mais de 100% no período. Passe o mouse para ver PI, etapa e %."]],
  },

  // ================================================================ ANÁLISES
  {
    id: "relatorios", grupo: "Análises", titulo: "Relatório de Horas (orçado × realizado) — PDF e impressão", rota: "/relatorios",
    palavras: "relatorio orcado realizado financeiro compra horas pdf imprimir valores realizados diferenca",
    resumo: "Orçado × realizado de cada PI: Compra (R$) e Horas por categoria. Valores realizados podem ser digitados; horas vêm dos lançamentos aprovados. Gera PDF e impressão.",
    tela: (
      <Tela url="relatorios">
        <Linha className="justify-between"><Linha><Chip on>Relatório de Horas</Chip><Chip>Controle de Horas</Chip></Linha><Linha><Bt n={3} v="c">⬇ Gerar PDF</Bt><Bt v="c">Imprimir</Bt></Linha></Linha>
        <Cp n={1} r="PI" v="227380 — MBB" sel w="w-[50%]" />
        <Card><Linha className="justify-between text-[9.5px] font-semibold border-b border-[#D5DCE5] pb-0.5"><span>Categoria</span><span>Orçado · Realizado · Diferença</span></Linha>
          <Linha className="justify-between text-[9.5px]"><span>CN Campo</span><span className="relative">320 h · <span className="border border-[#E8590C] rounded px-1">210 h<N n={2} /></span> · <b className="text-[#2E9E44]">+110 h</b></span></Linha></Card>
      </Tela>
    ),
    passos: [[1, "Escolha o PI."], [2, "Realizado: horas aprovadas + ajuste manual (quem tem permissão pode digitar/limpar)."], [3, "Gerar PDF (A4 paisagem com cabeçalho do PI e logo) ou Imprimir."]],
    dicas: ["Diferença = Orçado − Realizado: verde dentro do orçado, vermelho acima."],
  },
  {
    id: "controle-horas", grupo: "Análises", titulo: "Controle de Horas (lançadas e orçadas) e Excel", rota: "/relatorios/horas",
    palavras: "controle de horas lancadas orcadas tipo de hora excel exportar dia a dia agrupar pessoa pi cliente empresa",
    resumo: "Horas lançadas por período com agrupamentos e visão dia a dia, e Horas orçadas por tipo de hora × PI (ou cliente). Exporta para Excel.",
    tela: (
      <Tela url="relatorios/horas">
        <Linha><Chip n={1} on>Horas lançadas</Chip><Chip>Horas orçadas</Chip><Bt n={4} v="c" className="ml-auto">⬇ Exportar Excel</Bt></Linha>
        <Grade c={4}><Cp n={2} r="De" v="01/11" /><Cp r="Até" v="18/11" /><Cp r="PI" v="Todos" sel /><Cp r="Cliente" v="Todos" sel /></Grade>
        <Linha><Txt>Agrupar por:</Txt><Chip n={3} on>Pessoa</Chip><Chip>PI</Chip><Chip>Cliente</Chip><Chip>Empresa</Chip></Linha>
        <Grade c={4}><Kpi r="Total" v="412h" /><Kpi r="Normais" v="380h" /><Kpi r="Extras" v="32h" /><Kpi r="Pessoas" v="14" /></Grade>
      </Tela>
    ),
    passos: [[1, "Horas lançadas ou Horas orçadas (tipo de hora × PI; passe o mouse no nº do PI para ver o projeto)."], [2, "Período, PI, cliente, empresa, recurso e situação (filtros múltiplos e encadeados)."], [3, "Agrupamento e soma (total, normais, extras); a tabela dia a dia mostra cada dia do período."], [4, "Exportar Excel com logo."]],
  },

  // ================================================================ CADASTROS
  {
    id: "recursos", grupo: "Cadastros", titulo: "Recursos (pessoas, equipamentos, veículos)", rota: "/recursos",
    palavras: "recurso cadastro pessoa equipamento veiculo ferramenta usuario vinculado custo funcao equipe desabilitar",
    resumo: "Cadastro de tudo o que é alocado nas obras. Recursos de mão de obra podem ser vinculados a um usuário (para ver suas obras e lançar horas).",
    tela: (
      <Tela url="recursos">
        <Linha><Bt n={1}>+ Novo recurso</Bt><Bt v="n">⚡ Alocar vários</Bt></Linha>
        <Card><Grade c={3}><Cp n={2} r="Nome" v="João Silva" /><Cp n={3} r="Tipo" v="Mão de obra própria" sel /><Cp n={4} r="Usuário" v="joao.silva" sel /></Grade>
          <Grade c={3}><Cp r="Função" v="Montador" sel /><Cp r="Equipes" v="Campo" sel /><Cp r="Custo" v="R$ 45 / hora" /></Grade></Card>
      </Tela>
    ),
    passos: [[1, "+ Novo recurso."], [2, "Nome."], [3, "Tipo (mão de obra própria/terceira, equipamento, veículo...). Terceiros pedem a empresa."], [4, "Usuário vinculado: necessário para a pessoa ver as obras dela, usar Meus PIs e Atualizar avanço."]],
    dicas: ["Desabilitar um recurso o tira das listas sem apagar o histórico."],
  },
  {
    id: "empresas", grupo: "Cadastros", titulo: "Empresas terceiras", rota: "/recursos?aba=empresas",
    palavras: "empresa terceira terceirizada cnpj contrato validade contato",
    resumo: "Cadastro das empresas de mão de obra terceira (CNPJ, contato, validade do contrato), usadas em recursos, usuários e filtros.",
    tela: (<Tela url="recursos?aba=empresas"><Linha><Bt n={1}>+ Nova empresa</Bt></Linha><Card><Grade c={3}><Cp n={2} r="Nome" v="Montagens ABC" /><Cp r="CNPJ" v="00.000.000/0001-00" /><Cp n={3} r="Validade do contrato" v="31/12/2026" /></Grade></Card></Tela>),
    passos: [[1, "+ Nova empresa."], [2, "Nome e dados."], [3, "Validade do contrato (alerta quando vencer)."]],
  },
  {
    id: "clientes", grupo: "Cadastros", titulo: "Clientes do portal e liberação de acessos", rota: "/clientes",
    palavras: "cliente portal acesso liberar cronograma atas rdo ocorrencias assinadas credenciais senha email convite",
    resumo: "Cadastro dos contatos dos clientes e liberação, por PI, do que cada um vê no portal: Cronograma, Atas, RDOs assinados, Ocorrências assinadas.",
    tela: (
      <Tela url="clientes">
        <Linha><Bt n={1}>+ Novo cliente</Bt></Linha>
        <Card><Txt><b>Júlio Gonçalves</b> · MBB · julio@…</Txt>
          <Linha className="mt-1"><Cp n={2} v="227380 — MBB" sel w="w-[36%]" /><Chip n={3} on>Cronograma</Chip><Chip on>Atas</Chip><Chip>RDOs assinados</Chip><Chip>Ocorrências</Chip></Linha>
          <Linha className="justify-end mt-1"><Bt n={4} v="c">✉ Enviar credenciais</Bt></Linha></Card>
      </Tela>
    ),
    passos: [[1, "+ Novo cliente: nome, empresa, e-mail (o login do portal)."], [2, "Escolha o PI."], [3, "Marque o que ele pode ver. Ele recebe e-mail a cada liberação."], [4, "Enviar credenciais: confirma com a sua senha e envia usuário/senha ao cliente."]],
    dicas: ["Desmarcar tudo remove o acesso ao PI (e os documentos liberados individualmente)."],
  },
  {
    id: "usuarios", grupo: "Cadastros", titulo: "Usuários (perfis, equipe de campo, lote e alertas)", rota: "/usuarios",
    palavras: "usuario cadastro perfil master gerente coordenador lider funcionario terceiro visualizador campo lote senha alertas email habilitar",
    resumo: "Cadastro de quem usa o sistema: perfil, função, equipes, empresa (terceiros), login e senha. Aba de Usuários de Campo (cadastro em lote) e Alertas por usuário.",
    tela: (
      <Tela url="usuarios">
        <Linha className="border-b border-[#D5DCE5] pb-1"><Chip on>Usuários</Chip><Chip n={4}>Usuários de Campo</Chip><Chip n={5}>Alertas</Chip><Bt n={1} className="ml-auto">+ Novo usuário</Bt></Linha>
        <Card><Grade c={3}><Cp r="Nome" v="Carlos Lima" /><Cp n={2} r="Usuário (login)" v="carlos.lima" /><Cp n={3} r="Perfil" v="Líder Local" sel /></Grade><Grade c={3}><Cp r="Função" v="Encarregado" sel /><Cp r="Equipes" v="Campo" sel /><Cp r="Empresa" v="—" /></Grade></Card>
      </Tela>
    ),
    passos: [[1, "+ Novo usuário."], [2, "Login: e-mail ou nome de usuário (letras, números, ponto) — sugestão automática nome.sobrenome. A senha é gerada e mostrada uma única vez."], [3, "Perfil define o que a pessoa acessa (ajustável em Permissões)."], [4, "Usuários de Campo: cadastro de várias pessoas de uma vez; copie usuários e senhas para entregar."], [5, "Alertas: liga/desliga, por usuário, os e-mails automáticos (aprovações, prazos, alocação...)."]],
    campos: [["Nome", "Nome completo", true], ["Login", "Usuário ou e-mail", true], ["Perfil", "Master, Gerente, Coordenador, Líder, Funcionário, Terceiro, Visualizador", true]],
    dicas: ["Só o Master cria/altera usuários Master. Desabilitar bloqueia o acesso sem apagar o histórico."],
  },

  // ================================================================ APP DO LÍDER E DA EQUIPE
  {
    id: "lider-inicio", grupo: "App do líder e da equipe", titulo: "App do líder: Início e atalhos", rota: "/lider", lider: true,
    palavras: "lider app celular inicio atalhos pendencias minhas obras qr code",
    resumo: "Tela inicial do líder no celular: atalhos para Lançar horas, RDO, Obras, Solicitar e Ocorrência, e pendências/reprovações para corrigir.",
    tela: (
      <Tela cel>
        <Tit>Olá, Carlos</Tit>
        <Grade c={2}><Card n={1}><Txt c="!text-[11px] font-semibold text-[#C97A21]">⏱ Lançar horas</Txt></Card><Card n={2}><Txt c="!text-[11px] font-semibold text-[#0E89B0]">📝 RDO do dia</Txt></Card><Card><Txt c="!text-[11px] font-semibold">🏗 Minhas obras</Txt></Card><Card><Txt c="!text-[11px] font-semibold text-[#D64545]">⚠ Ocorrência</Txt></Card></Grade>
        <Card n={3}><Txt>Reprovado: horas de 10/11 — "faltou a obra" · <b>Corrigir</b></Txt></Card>
        <Card n={4} className="!p-1"><Linha className="justify-around text-[8.5px]"><span>Início</span><span>RDO</span><span>Horas</span><span>Obras</span><span>Solicitar</span></Linha></Card>
      </Tela>
    ),
    passos: [[1, "Lançar horas do dia."], [2, "RDO do dia."], [3, "Itens reprovados aparecem com o motivo — toque para corrigir e reenviar."], [4, "Menu inferior: Início, RDO, Horas, Obras, Solicitar e Ocorrência."]],
    dicas: ["No topo: tema, alterar senha, Manual, e \"Painel\" (se o seu perfil também acessa o painel)."],
  },
  {
    id: "lider-horas", grupo: "App do líder e da equipe", titulo: "App do líder: lançar horas (uma ou várias obras)", rota: "/lider/horas", lider: true,
    palavras: "lider horas lancar ponto entrada saida varias obras dividir qr code",
    resumo: "O líder marca uma ou várias obras do dia; as horas são divididas igualmente (ou ajustadas à mão) e enviadas para aprovação.",
    tela: (
      <Tela cel>
        <Tit>Em quais obras você trabalhou hoje?</Tit>
        <Grade c={2}><Card n={1} className="!bg-[#0E89B0] !text-white"><Txt c="!text-white font-semibold">227380 ✓</Txt></Card><Card><Txt c="font-semibold">227391</Txt></Card></Grade>
        <Linha><Chip n={2} on>Hoje</Chip><Chip>Ontem</Chip></Linha>
        <Grade c={2}><Cp n={3} r="Entrada" v="07:00" /><Cp r="Saída" v="17:00" /></Grade>
        <Bt n={4} v="v" className="justify-center">Enviar horas (9h)</Bt>
      </Tela>
    ),
    passos: [[1, "Toque nas obras trabalhadas (pode marcar várias)."], [2, "Dia."], [3, "Entrada e saída (almoço descontado automaticamente). Com várias obras, \"Ajustar divisão\" permite distribuir as horas."], [4, "Enviar: fica pendente até a aprovação."]],
  },
  {
    id: "lider-rdo", grupo: "App do líder e da equipe", titulo: "App do líder: RDO do dia (atividades, ocorrências, fotos, assinatura)", rota: "/lider/rdo", lider: true,
    palavras: "lider rdo relatorio diario atividade status percentual ocorrencia foto video assinatura cliente enviar",
    resumo: "O líder registra o que foi feito em cada etapa (status e %), ocorrências com fotos/vídeos e pode colher a assinatura do cliente na tela.",
    tela: (
      <Tela cel>
        <Cp n={1} r="Obra" v="227380 — MBB" sel />
        <Card n={2}><Txt c="font-semibold">Montagem</Txt><Grade c={2}><Chip on>Em andamento</Chip><Chip>Concluída</Chip></Grade><Cp r="%" v="60" w="w-[40%]" /></Card>
        <Card n={3}><Txt><b>+ Ocorrência</b> · categoria · descrição · 📷 foto/vídeo</Txt></Card>
        <Card n={4}><Txt>✍ Assinatura do cliente (opcional)</Txt></Card>
        <Bt n={5} v="v" className="justify-center">Enviar RDO</Bt>
      </Tela>
    ),
    passos: [[1, "Obra (ou leia o QR Code)."], [2, "Em cada etapa trabalhada: status e % de avanço."], [3, "Ocorrências: categoria (Atraso, Retrabalho...), descrição e fotos/vídeos."], [4, "Assinatura do cliente: o responsável assina com o dedo; o RDO assinado fica disponível no portal do cliente."], [5, "Enviar: vai para aprovação; o PDF é gerado."]],
  },
  {
    id: "lider-obras", grupo: "App do líder e da equipe", titulo: "App do líder: Minhas obras, resumo e horas do PI", rota: "/lider/cronograma", lider: true,
    palavras: "lider obras minhas obras cronograma etapas resumo avanco atrasadas consumo horas orcado resultado classificacao qr ocorrencia",
    resumo: "Lista das obras em que o líder está alocado, com resumo (avanço, atrasos, consumo de horas), horas orçadas × consumo × resultado por classificação e as etapas do cronograma.",
    tela: (
      <Tela cel>
        <Linha className="justify-between"><span className="text-[10px]"><b className="text-[#0E89B0]">227380</b> Dispositivos</span><Linha><Ico n={4}>⚠</Ico><Ico>▦</Ico></Linha></Linha>
        <Card n={1}><Grade c={3}><Kpi r="Avanço" v="28%" cor="#0E89B0" /><Kpi r="Atrasadas" v="1" cor="#D64545" /><Kpi r="Horas" v="22%" cor="#2E9E44" /></Grade><Txt c="mt-1 text-[#0E89B0] font-semibold relative">▸ Ver horas por classificação<N n={2} /></Txt></Card>
        <Card n={3}><Txt c="font-semibold">PROJETO</Txt><Barra p={40} /><Txt>▸ Ver 6 sub-etapa(s)</Txt></Card>
      </Tela>
    ),
    passos: [[1, "Resumo da obra: avanço, etapas atrasadas e consumo de horas (verde = dentro do avanço)."], [2, "Horas por classificação: Orçado, Consumo e Resultado (sem valores em R$)."], [3, "Etapas com datas, status e %; toque para ver as sub-etapas."], [4, "Atalhos: registrar ocorrência nesta obra e QR Code."]],
  },
  {
    id: "lider-solicitar", grupo: "App do líder e da equipe", titulo: "App do líder: solicitar alteração e ocorrência avulsa", rota: "/lider/solicitar", lider: true,
    palavras: "lider solicitar alteracao data etapa justificativa ocorrencia avulsa foto",
    resumo: "Pedir mudança de data/nome de etapa (com justificativa) e registrar ocorrência fora do RDO.",
    tela: (
      <Tela cel>
        <Cp n={1} r="Obra" v="227380" sel /><Cp n={2} r="Etapa" v="Montagem" sel />
        <Grade c={2}><Chip n={3} on>Data de término</Chip><Chip>Nome</Chip></Grade>
        <Cp n={4} r="Novo valor" v="20/12/2026" /><Cp n={5} r="Justificativa" v="Material atrasou" />
        <Bt n={6} v="v" className="justify-center">Enviar solicitação</Bt>
      </Tela>
    ),
    passos: [[1, "Obra."], [2, "Etapa."], [3, "O que mudar (início, término, nome ou outro)."], [4, "Novo valor."], [5, "Justificativa (obrigatória)."], [6, "Enviar: o gestor aprova em Aprovações → Solicitações."], [null, "Ocorrência avulsa: menu Ocorrência → obra, categoria, descrição, fotos e (se houver) assinatura do cliente."]],
  },
  {
    id: "equipe-app", grupo: "App do líder e da equipe", titulo: "App da equipe (funcionários e terceiros)", rota: "/equipe",
    palavras: "equipe funcionario terceiro horas ponto ocorrencia celular",
    resumo: "Funcionários e terceiros usam o app para lançar as próprias horas (ponto ou manual) e registrar ocorrências nas obras em que estão alocados.",
    tela: (<Tela cel><Linha><Chip n={1} on>Ponto</Chip><Chip>Manual</Chip></Linha><Cp n={2} r="Obra" v="227380" sel /><Bt n={3} v="v" className="justify-center">▶ Registrar entrada</Bt><Card><Txt>Últimos lançamentos · 10/11 · 9h · pendente</Txt></Card></Tela>),
    passos: [[1, "Ponto (entrada agora, saída depois) ou manual."], [2, "Obra."], [3, "Registrar entrada/saída ou enviar. O status aparece em Últimos lançamentos."]],
  },

  // ================================================================ PORTAL DO CLIENTE
  {
    id: "portal-cliente", grupo: "Portal do cliente", titulo: "Portal do cliente (o que o cliente vê)", rota: "/clientes",
    palavras: "portal cliente acesso clientes contric cronograma pdf atas rdos assinados ocorrencias documentos baixar",
    resumo: "O cliente entra em /acesso-clientes e vê só o que foi liberado: cronograma (com PDF igual ao da Contric), atas, RDOs e ocorrências assinados e documentos.",
    tela: (
      <Tela url="cliente">
        <div className="flex gap-2">
          <Card n={1} className="w-[30%]"><Txt c="font-semibold">Minhas obras</Txt><Txt c="mt-1 bg-[#0B2E44] text-white rounded px-1">227380</Txt><Txt>222222</Txt></Card>
          <div className="flex-1 flex flex-col gap-1.5">
            <Grade c={4}><Kpi n={2} r="Avanço" v="28%" /><Kpi r="Concluídas" v="1/11" /><Kpi r="Atraso" v="1" cor="#D64545" /><Kpi r="Término" v="30/04" /></Grade>
            <Linha className="justify-between"><Txt c="font-semibold">Cronograma</Txt><Bt n={3} v="n">⬇ Baixar PDF</Bt></Linha>
            <Gantt itens={[["PROJETO", 10, 50, 40], ["Montagem", 55, 35, 0, "#93A2B8", true]]} />
          </div>
        </div>
      </Tela>
    ),
    passos: [[1, "Obras liberadas para o cliente."], [2, "Indicadores da obra."], [3, "Baixar PDF do cronograma (mesmo modelo da Contric)."], [null, "Abaixo: Atas, RDOs assinados, Ocorrências assinadas e Documentos liberados, cada um com botão Abrir."]],
    dicas: ["O portal atualiza sozinho ao voltar para a aba. Libere acessos em Clientes ou na aba Cliente da Página do PI."],
  },

  // ================================================================ AUDITORIA (todos) e ADMINISTRAÇÃO (Master)
  {
    id: "auditoria", grupo: "Visão geral", titulo: "Auditoria (registro de todas as ações)", rota: "/auditoria",
    palavras: "auditoria log historico quem fez acao registro rastreabilidade erro na tela",
    resumo: "Registro de quem fez o quê e quando: criação/edição/exclusão de PIs e etapas, aprovações, alocações, avanço atualizado, uso da IA, acessos de clientes, erros de tela e muito mais.",
    tela: (
      <Tela url="auditoria">
        <Linha><Cp n={1} r="" v="Buscar por ação, detalhe ou pessoa..." w="w-[55%]" /><Cp n={2} v="Todos os usuários" sel w="w-[30%]" /></Linha>
        <Card n={3}>
          {[["18/11 09:12", "Carlos Lima", "Atualizou avanço de etapa", "227380 — \"Montagem\": Não iniciada 0% → Em andamento 40%"], ["18/11 08:40", "Ana (Master)", "Aplicou alterações do assistente de IA", "227380 — 3 de 3 ação(ões)"], ["17/11 17:02", "Sistema", "Erro na tela", "/relatorios — …"]].map(([d, u, a, t]) => (
            <div key={d} className="border-b border-[#EEF2F6] py-0.5 last:border-0"><Txt><b>{a}</b> · {u} · {d}</Txt><Txt>{t}</Txt></div>
          ))}
        </Card>
      </Tela>
    ),
    passos: [[1, "Busca por texto (ação, detalhe ou pessoa)."], [2, "Filtro por usuário (várias opções)."], [3, "Lista do mais recente para o mais antigo; role para carregar mais."]],
    dicas: [
      "Exclusões (RDO, horas, ocorrências, documentos, PI) sempre pedem motivo e ficam registradas.",
      "\"Erro na tela\" registra falhas inesperadas que alguém encontrou — útil para corrigir antes de virar reclamação.",
    ],
  },
  {
    id: "permissoes", grupo: "Administração (Master)", titulo: "Permissões (matriz por perfil e exceções por usuário)", rota: "/permissoes", master: true,
    palavras: "permissoes matriz perfil excecao usuario validade sim nao proprios pis financeiro horas acesso",
    resumo: "Define o que cada perfil pode fazer (Sim, Só PIs próprios, Não) e exceções por usuário com data de validade.",
    tela: (
      <Tela url="permissoes">
        <Linha><Chip n={1} on>Por perfil</Chip><Chip n={4}>Por usuário</Chip></Linha>
        <Card><Linha className="justify-between text-[9px] font-semibold border-b border-[#D5DCE5] pb-0.5"><span className="w-[40%]">Ação</span><span>Master · Gerente · Coord. · Líder</span></Linha>
          {[["Ver relatórios", "S · S · S · N"], ["Ver financeiro só de HORAS", "S · S · S · P"], ["Editar etapas", "S · S · S · N"]].map(([a, v], i) => <Linha key={a} className="justify-between text-[9.5px] py-0.5"><span className="w-[40%]">{a}</span><span className="relative font-mono">{v}{i === 1 && <N n={2} />}</span></Linha>)}
        </Card>
        <Linha className="justify-end"><Bt n={3} v="v">Salvar</Bt></Linha>
      </Tela>
    ),
    passos: [[1, "Por perfil: a matriz padrão de cada perfil."], [2, "Clique na célula para alternar: S (sim, em todos os PIs) · P (só nos PIs em que a pessoa está alocada) · N (não)."], [3, "Salvar aplica a todos daquele perfil."], [4, "Por usuário: exceções para uma pessoa (ex.: liberar Relatórios até 31/12). A exceção prevalece sobre o perfil."]],
    dicas: ["O Master nunca perde Permissões, Usuários e acesso ao painel (proteção contra bloqueio)."],
  },
  {
    id: "configuracoes", grupo: "Administração (Master)", titulo: "Configurações do sistema", rota: "/configuracoes", master: true,
    palavras: "configuracoes equipes funcoes categorias ocorrencia tipos recurso unidades classificacoes documentos orcamento status etapa pi prazos jornada almoco alertas email modelo feriados",
    resumo: "Listas e regras usadas em todo o sistema, editáveis pelo Master sem programação.",
    tela: (
      <Tela url="configuracoes">
        <div className="flex gap-2">
          <Card n={1} className="w-[38%] flex flex-col gap-0.5">{["Equipes", "Funções", "Categorias de ocorrência", "Tipos de recurso", "Modos de apropriação", "Classificações de documentos", "Categorias de orçamento", "Status das etapas", "Status dos PIs", "Prazos de alerta", "Jornada", "Alertas por e-mail", "Modelo de e-mail", "Feriados adicionais"].map((t, i) => <span key={t} className={`text-[9px] px-1 rounded ${i === 0 ? "bg-[#0E89B0]/10 text-[#0E89B0] font-semibold" : ""}`}>{t}</span>)}</Card>
          <Card className="flex-1"><Tit>Equipes</Tit>{["Campo", "Elétrica", "Mecânica"].map((t, i) => <Linha key={t} className="py-0.5"><Cp v={t} w="w-[70%]" n={i === 0 ? 2 : undefined} /><Ico>🗑</Ico></Linha>)}<Bt v="c" className="mt-1">+ Adicionar</Bt><Linha className="justify-end mt-1"><Bt n={3} v="v">Salvar</Bt></Linha></Card>
        </div>
      </Tela>
    ),
    passos: [[1, "Escolha a seção."], [2, "Edite os nomes, adicione ou remova itens (itens em uso não podem ser removidos; renomear atualiza os registros que já usam o nome)."], [3, "Salvar (ou Descartar / Restaurar padrão)."]],
    campos: [
      ["Equipes / Funções", "Áreas e funções de usuários e recursos", false], ["Categorias de ocorrência", "Tipos usados no RDO e ocorrências", false],
      ["Tipos de recurso / Modos de apropriação", "Agrupamento e unidade de custo (hora, diária...)", false], ["Classificações de documentos", "Prefixo e nome das pastas de arquivos", false],
      ["Categorias de orçamento", "Itens de Compra (R$) e tipos de hora (CN, CE, CI...) com ordem e ativo/desativado", false],
      ["Status das etapas / dos PIs", "Nomes e cores exibidos", false], ["Prazos de alerta", "Dias para contorno urgente/atenção e janela de medições", false],
      ["Jornada", "Almoço descontado automaticamente nas horas", false], ["Alertas por e-mail", "Padrão dos alertas e horário de silêncio", false],
      ["Modelo de e-mail", "Assunto, saudação, textos, assinatura e rodapé", false], ["Feriados adicionais", "Municipais/da empresa (todo ano ou só um ano) para dias úteis", false],
    ],
  },
  {
    id: "excluir-pi", grupo: "Administração (Master)", titulo: "Excluir PI e itens (Master)", rota: "/cronograma", master: true,
    palavras: "excluir apagar pi deletar confirmacao dupla motivo",
    resumo: "O Master pode excluir um PI inteiro (etapas, horas, RDOs, documentos, acessos). Exige confirmação dupla digitando o número do PI.",
    tela: (<Tela url="cronograma"><Linha><Cp v="227999 — Teste" sel w="w-[45%]" /><Bt n={1} v="r">🗑 Excluir PI</Bt></Linha><Card><Txt>Digite <b>227999</b> para confirmar</Txt><Cp n={2} v="227999" /><Linha className="justify-end mt-1"><Bt n={3} v="r">Excluir definitivamente</Bt></Linha></Card></Tela>),
    passos: [[1, "Em Configurar Cronograma, com o PI selecionado, clique em Excluir PI."], [2, "Digite o número do PI."], [3, "Confirme. A exclusão fica na Auditoria e não pode ser desfeita."]],
  },
];

// ---------------------------------------------------------------------------- cursos
const CURSOS = [
  { id: "lider", titulo: "Curso rápido — Líder de obra", descricao: "As funções do dia a dia do líder no celular: acessar, lançar horas, RDO, obras, solicitar alterações e atualizar o avanço.", duracao: "≈ 15 min",
    temas: ["acesso", "lider-inicio", "lider-horas", "lider-rdo", "lider-obras", "lider-solicitar", "cronograma-visao"] },
  { id: "completo", titulo: "Curso completo do sistema", descricao: "Todas as funções, na ordem do processo da obra: do cadastro do PI à análise de horas, com administração para o Master.", duracao: "≈ 1h30",
    temas: TEMAS.map((t) => t.id) },
];

// rota atual → tema do manual (abre o manual já no assunto da página)
const TEMA_DA_ROTA = [["/cronograma/solicitacoes", "solicitacoes"], ["/cronograma", "configurar-cronograma"], ["/linha-do-tempo", "cronograma-visao"], ["/relatorios/horas", "controle-horas"], ["/relatorios", "relatorios"],
  ["/recursos", "recursos"], ["/minhas-horas", "lancar-horas"], ["/lider/horas", "lider-horas"], ["/lider/rdo", "lider-rdo"], ["/lider/cronograma", "lider-obras"], ["/lider/solicitar", "lider-solicitar"], ["/lider", "lider-inicio"],
  ["/equipe", "equipe-app"], ["/dashboard", "dashboard"], ["/aprovacoes", "aprovacoes"], ["/historico", "aprovacoes"], ["/pis", "cadastro-pis"], ["/pi", "pagina-pi"], ["/documentos", "documentos"],
  ["/rdo", "rdo-painel"], ["/clientes", "clientes"], ["/usuarios", "usuarios"], ["/auditoria", "auditoria"], ["/permissoes", "permissoes"], ["/configuracoes", "configuracoes"]];

const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lerProgresso = (uid) => { try { return JSON.parse(localStorage.getItem(`manual:vistos:${uid}`) || "[]"); } catch { return []; } };
const gravarProgresso = (uid, l) => { try { localStorage.setItem(`manual:vistos:${uid}`, JSON.stringify(l)); } catch { /* sem armazenamento */ } };

// ---------------------------------------------------------------------------- janela do manual
// estado do manual guardado na sessão: ao trocar de página o painel continua aberto no mesmo tema
const CHAVE_SESSAO = "manual:estado";
const lerSessao = () => { try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || "null"); } catch { return null; } };
const gravarSessao = (v) => { try { v ? sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(v)) : sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ } };
const LARGURA = { normal: 460, amplo: 760 };

// Painel NÃO bloqueante: fica ao lado do sistema (computador: à direita, empurrando a página;
// celular: metade de baixo da tela). Dá para ler e aplicar na hora, sem fechar o manual.
function JanelaManual({ usuario, onFechar, inicial }) {
  const pathname = usePathname() || "";
  const master = usuario?.perfil === "master";
  const temas = useMemo(() => TEMAS.filter((t) => !t.master || master), [master]);
  const daRota = TEMA_DA_ROTA.find(([r]) => pathname === r || pathname.startsWith(`${r}/`))?.[1];
  const [temaId, setTemaId] = useState(() => (inicial?.temaId !== undefined ? inicial.temaId : temas.some((t) => t.id === daRota) ? daRota : null));
  const [curso, setCurso] = useState(inicial?.curso || null); // id do curso em andamento
  const [busca, setBusca] = useState("");
  const [menuAberto, setMenuAberto] = useState(false); // lista de temas (gaveta)
  const [tamanho, setTamanho] = useState(inicial?.tamanho || "normal");
  const [minimizado, setMinimizado] = useState(!!inicial?.minimizado);
  const [vistos, setVistos] = useState(() => lerProgresso(usuario?.id));
  const [celular, setCelular] = useState(false);
  const conteudoRef = useRef(null);

  useEffect(() => { gravarSessao({ temaId, curso, tamanho, minimizado }); }, [temaId, curso, tamanho, minimizado]);
  useEffect(() => {
    const medir = () => setCelular(window.innerWidth < 768);
    medir(); window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  // abre espaço para o painel: a página encolhe (computador) ou ganha folga embaixo (celular)
  useEffect(() => {
    const b = document.body.style;
    const antes = { mr: b.marginRight, pb: b.paddingBottom, tr: b.transition };
    b.transition = "margin-right .2s";
    if (minimizado) { b.marginRight = ""; b.paddingBottom = ""; }
    else if (celular) { b.marginRight = ""; b.paddingBottom = "52dvh"; }
    else b.marginRight = `${LARGURA[tamanho]}px`;
    return () => { b.marginRight = antes.mr; b.paddingBottom = antes.pb; b.transition = antes.tr; };
  }, [celular, tamanho, minimizado]);
  const abrir = (id, cursoId = curso) => {
    setTemaId(id); setCurso(cursoId); setMenuAberto(false); setBusca(""); setMinimizado(false);
    if (id && !vistos.includes(id)) { const n = [...vistos, id]; setVistos(n); gravarProgresso(usuario?.id, n); }
    setTimeout(() => conteudoRef.current?.scrollTo({ top: 0 }), 0);
  };

  // busca: título, palavras-chave, resumo, passos e campos (sem acento)
  const termo = sem(busca.trim());
  const resultados = termo ? temas.map((t) => {
    const alvo = sem([t.titulo, t.palavras, t.resumo, ...(t.passos || []).map((p) => p[1]), ...(t.campos || []).flat(), ...(t.dicas || [])].join(" "));
    const palavras = termo.split(/\s+/).filter(Boolean);
    if (!palavras.every((p) => alvo.includes(p))) return null;
    const pontos = palavras.reduce((s, p) => s + (sem(t.titulo).includes(p) ? 5 : 0) + (sem(t.palavras).includes(p) ? 3 : 0) + 1, 0);
    return { t, pontos };
  }).filter(Boolean).sort((a, b) => b.pontos - a.pontos).map((r) => r.t) : [];

  const tema = temas.find((t) => t.id === temaId);
  const cursoAtual = CURSOS.find((c) => c.id === curso);
  const listaCurso = cursoAtual ? cursoAtual.temas.filter((id) => temas.some((t) => t.id === id)) : [];
  const posCurso = listaCurso.indexOf(temaId);

  const Lateral = (
    <div className="flex flex-col gap-4">
      <div>
        <div className="manual-rotulo">Cursos</div>
        {CURSOS.map((c) => {
          const ids = c.temas.filter((id) => temas.some((t) => t.id === id));
          const feitos = ids.filter((id) => vistos.includes(id)).length;
          return (
            <button key={c.id} onClick={() => abrir(ids[0], c.id)} className={`w-full text-left rounded-lg px-2.5 py-2 mb-1 border ${curso === c.id ? "border-cyan bg-cyan/10" : "border-line hover:bg-panel"}`}>
              <div className="text-[13px] font-semibold leading-snug">{c.id === "lider" ? "⚡ " : "🎓 "}{c.titulo}</div>
              <div className="flex items-center gap-2 mt-1"><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-cyan" style={{ width: `${(feitos / ids.length) * 100}%` }} /></span><span className="text-[11px] text-muted tabular-nums">{feitos}/{ids.length}</span></div>
            </button>
          );
        })}
      </div>
      {GRUPOS.map((g) => {
        const doGrupo = temas.filter((t) => t.grupo === g);
        if (!doGrupo.length) return null;
        return (
          <div key={g}>
            <div className="manual-rotulo">{g}</div>
            {doGrupo.map((t) => (
              <button key={t.id} onClick={() => abrir(t.id, null)}
                className={`w-full text-left text-[13px] leading-snug rounded-md px-2.5 py-1.5 flex items-start gap-1.5 ${temaId === t.id ? "bg-cyan/10 text-cyan font-semibold" : "hover:bg-panel text-textmain"}`}>
                <span className={`mt-0.5 text-[10px] ${vistos.includes(t.id) ? "text-green" : "text-muteddim"}`}>{vistos.includes(t.id) ? "✓" : "○"}</span>
                <span className="min-w-0">{t.titulo}{t.master && <span className="ml-1 text-[10px] font-semibold text-[#8E5CD9]">MASTER</span>}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );

  const largo = !celular && tamanho === "amplo"; // painel largo no computador: lista de temas fixa ao lado

  // minimizado: só uma etiqueta no canto, o sistema fica livre por inteiro
  if (minimizado) {
    return createPortal(
      <button onClick={() => setMinimizado(false)} className="fixed z-[90] right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 rounded-full bg-[#0B2E44] text-white shadow-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2 hover:opacity-90">
        📘 Manual{tema ? <span className="font-normal text-white/70 max-w-[180px] truncate">· {tema.titulo}</span> : null}
      </button>, document.body);
  }

  return createPortal(
    <div className={`fixed z-[90] bg-superficie shadow-[0_0_40px_rgba(11,46,68,0.25)] flex flex-col overflow-hidden border-line
      ${celular ? "left-0 right-0 bottom-0 h-[52dvh] rounded-t-2xl border-t" : "top-0 right-0 bottom-0 border-l"}`}
      style={celular ? undefined : { width: LARGURA[tamanho] }} role="complementary" aria-label="Manual do sistema">
        {/* topo: título e ações (Fechar no canto superior direito) + busca */}
        <div className="bg-[#0B2E44] text-white px-3 pt-2.5 pb-2.5 flex flex-col gap-2" style={celular ? undefined : { paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-1.5">
            {!largo && <button onClick={() => setMenuAberto((v) => !v)} className={`px-2 py-1.5 rounded-lg text-sm font-semibold ${menuAberto ? "bg-white/20" : "hover:bg-white/10"}`} aria-label="Temas do manual">☰ Temas</button>}
            <button onClick={() => { setTemaId(null); setCurso(null); setBusca(""); setMenuAberto(false); }} className="font-head font-bold text-[15px] whitespace-nowrap hover:opacity-80 ml-1 mr-auto">📘 Manual</button>
            {!celular && (
              <button onClick={() => setTamanho((t) => (t === "normal" ? "amplo" : "normal"))} className="px-2 py-1.5 rounded-lg text-xs hover:bg-white/10" title={tamanho === "normal" ? "Ampliar o painel" : "Reduzir o painel"}>
                {tamanho === "normal" ? "⇤ Ampliar" : "⇥ Reduzir"}
              </button>
            )}
            <button onClick={() => setMinimizado(true)} className="px-2 py-1.5 rounded-lg text-xs hover:bg-white/10" title="Minimizar (o manual continua no mesmo ponto)">▁ Minimizar</button>
            <button onClick={() => { gravarSessao(null); onFechar(); }} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/15 hover:bg-white/25" aria-label="Fechar manual">Fechar</button>
          </div>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tema (ex.: horas extras, IA por voz, liberar cliente...)"
            className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus:bg-white focus:text-[#24324A] focus:placeholder:text-[#9AA6B8]" aria-label="Buscar no manual" />
        </div>

        <div className="flex-1 min-h-0 flex relative">
          {/* temas: fixos ao lado no painel amplo; gaveta (☰ Temas) no painel normal e no celular */}
          <aside className={`${largo ? "block w-[260px] border-r" : menuAberto ? "absolute inset-0 z-20 block w-full" : "hidden"} bg-superficie shrink-0 border-line overflow-y-auto rolagem-fina p-3`}>{Lateral}</aside>

          <div ref={conteudoRef} className="flex-1 min-w-0 overflow-y-auto rolagem-fina">
            {termo ? (
              <div className="p-4 md:p-6">
                <div className="text-sm text-muted mb-3">{resultados.length} tema(s) para "<strong className="text-textmain">{busca}</strong>"</div>
                {!resultados.length && <div className="text-sm text-muteddim">Nada encontrado. Tente outra palavra (ex.: "aprovar", "QR Code", "orçamento").</div>}
                <div className={`grid gap-2 ${largo ? "grid-cols-2" : "grid-cols-1"}`}>
                  {resultados.map((t) => (
                    <button key={t.id} onClick={() => abrir(t.id, null)} className="text-left cartao cartao-interativo p-3">
                      <div className="text-[11px] text-muteddim">{t.grupo}</div>
                      <div className="font-semibold text-sm">{t.titulo}</div>
                      <div className="text-xs text-muted mt-0.5 line-clamp-2">{t.resumo}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : tema ? (
              <article className="p-4 md:p-6 max-w-[900px]">
                {cursoAtual && (
                  <div className="rounded-xl bg-cyan/5 border border-cyan/20 px-3 py-2 mb-4 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-cyan">{cursoAtual.titulo}</span>
                    <span className="text-muted">· lição {posCurso + 1} de {listaCurso.length}</span>
                    <span className="flex-1 min-w-[80px] h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-cyan" style={{ width: `${((posCurso + 1) / listaCurso.length) * 100}%` }} /></span>
                    <button onClick={() => setCurso(null)} className="text-xs text-muted hover:underline">sair do curso</button>
                  </div>
                )}
                <div className="text-xs text-muteddim">{tema.grupo}{tema.master && <span className="ml-2 selo bg-[#8E5CD9]/10 text-[#8E5CD9]">Somente Master</span>}</div>
                <h2 className="font-head text-xl md:text-2xl font-bold leading-tight mt-0.5">{tema.titulo}</h2>
                <p className="text-[15px] text-muted mt-2 leading-relaxed">{tema.resumo}</p>
                {tema.rota && pathname !== tema.rota.split("?")[0] && <a href={tema.rota} className="btn btn-contorno btn-sm mt-3" title="Abre a página — o manual continua aberto ao lado">Ir para a página →</a>}
                {tema.rota && pathname === tema.rota.split("?")[0] && <div className="selo bg-green/10 text-green mt-3">✓ Você está nesta página — siga os passos ao lado</div>}

                {tema.tela && (
                  <section className="mt-5">
                    <div className="manual-rotulo">Tela — os números indicam onde clicar ou preencher</div>
                    <div className="max-w-[720px]">{tema.tela}</div>
                  </section>
                )}
                {tema.passos?.length > 0 && (
                  <section className="mt-5">
                    <div className="manual-rotulo">Passo a passo</div>
                    <ol className="flex flex-col gap-2">
                      {tema.passos.map(([n, texto], i) => (
                        <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed">
                          {n ? <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#E8590C] text-white text-xs font-bold flex items-center justify-center">{n}</span>
                            : <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-panel border border-line text-muted text-xs flex items-center justify-center">•</span>}
                          <span>{texto}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {tema.campos?.length > 0 && (
                  <section className="mt-5">
                    <div className="manual-rotulo">O que preencher</div>
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full text-sm">
                        <thead><tr className="bg-panel text-left"><th className="px-3 py-2 titulo-secao">Campo</th><th className="px-3 py-2 titulo-secao">O que informar</th><th className="px-3 py-2 titulo-secao text-center">Obrigatório</th></tr></thead>
                        <tbody>{tema.campos.map(([c, d, o]) => <tr key={c} className="border-t border-line/70"><td className="px-3 py-2 font-semibold whitespace-nowrap">{c}</td><td className="px-3 py-2 text-muted">{d}</td><td className="px-3 py-2 text-center">{o ? "Sim" : "—"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </section>
                )}
                {tema.dicas?.length > 0 && (
                  <section className="mt-5 rounded-xl bg-amber/10 border border-amber/30 p-3.5">
                    <div className="manual-rotulo !text-[#9a5a14]">💡 Dicas</div>
                    <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed">{tema.dicas.map((d) => <li key={d}>• {d}</li>)}</ul>
                  </section>
                )}

                {/* navegação: dentro do curso (anterior/próxima lição) ou temas do mesmo grupo */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-line">
                  {cursoAtual ? <>
                    <button disabled={posCurso <= 0} onClick={() => abrir(listaCurso[posCurso - 1])} className="btn btn-contorno">← Lição anterior</button>
                    {posCurso < listaCurso.length - 1
                      ? <button onClick={() => abrir(listaCurso[posCurso + 1])} className="btn btn-primario">Próxima lição →</button>
                      : <button onClick={() => { setCurso(null); setTemaId(null); }} className="btn btn-sucesso">✓ Concluir curso</button>}
                  </> : <>
                    {(() => { const i = temas.indexOf(tema); return <>
                      <button disabled={i <= 0} onClick={() => abrir(temas[i - 1].id, null)} className="btn btn-contorno">← {temas[i - 1]?.titulo.slice(0, 28) || "Anterior"}</button>
                      <button disabled={i >= temas.length - 1} onClick={() => abrir(temas[i + 1].id, null)} className="btn btn-contorno">{temas[i + 1]?.titulo.slice(0, 28) || "Próximo"} →</button>
                    </>; })()}
                  </>}
                </div>
              </article>
            ) : (
              // página inicial do manual
              <div className="p-4 md:p-6 max-w-[900px]">
                <h2 className="font-head text-xl md:text-2xl font-bold">Bem-vindo ao manual, {String(usuario?.nome || "").split(" ")[0]}!</h2>
                <p className="text-muted mt-1">Escolha um curso guiado ou um tema. Use a busca no topo para ir direto ao assunto. Cada tema mostra a tela, onde clicar (números laranja) e o que preencher.</p>
                <div className={`grid gap-3 mt-4 ${largo ? "grid-cols-2" : "grid-cols-1"}`}>
                  {CURSOS.map((c) => {
                    const ids = c.temas.filter((id) => temas.some((t) => t.id === id));
                    const feitos = ids.filter((id) => vistos.includes(id)).length;
                    return (
                      <button key={c.id} onClick={() => abrir(ids.find((id) => !vistos.includes(id)) || ids[0], c.id)} className="text-left cartao cartao-interativo p-4">
                        <div className="text-2xl">{c.id === "lider" ? "⚡" : "🎓"}</div>
                        <div className="font-head font-bold mt-1">{c.titulo}</div>
                        <div className="text-sm text-muted mt-1">{c.descricao}</div>
                        <div className="flex items-center gap-2 mt-3 text-xs text-muted"><span>{ids.length} lições · {c.duracao}</span><span className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><span className="block h-full bg-cyan" style={{ width: `${(feitos / ids.length) * 100}%` }} /></span><span>{feitos ? (feitos === ids.length ? "concluído" : "continuar") : "começar"} →</span></div>
                      </button>
                    );
                  })}
                </div>
                <div className="manual-rotulo mt-6">Temas</div>
                <div className={`grid gap-2 ${largo ? "grid-cols-2" : "grid-cols-1"}`}>
                  {GRUPOS.map((g) => {
                    const doGrupo = temas.filter((t) => t.grupo === g);
                    if (!doGrupo.length) return null;
                    return (
                      <div key={g} className="cartao p-3">
                        <div className="font-semibold text-sm mb-1">{g}</div>
                        {doGrupo.map((t) => <button key={t.id} onClick={() => abrir(t.id, null)} className="block w-full text-left text-[13px] text-cyan hover:underline py-0.5 leading-snug">{t.titulo}</button>)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      <style>{`.manual-rotulo{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgb(var(--cor-muteddim,148 160 178));margin-bottom:.4rem}
        @keyframes manualPulso{0%,100%{box-shadow:0 0 0 0 rgba(232,89,12,.55)}60%{box-shadow:0 0 0 6px rgba(232,89,12,0)}}.manual-pulso{animation:manualPulso 1.8s infinite}`}</style>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------- botão
// variante: "painel" (rodapé do menu) · "topo" (barra escura do app/celular) · "claro" (barra clara)
// variante: "menu" (item fixo do menu lateral, com o texto Manual) · "topo" (barra escura do app) · "claro" (barra clara do celular)
// Só UMA instância deve existir por tela (o painel reabre sozinho ao trocar de página, no mesmo tema).
// principal: a instância que desenha o painel (as outras só pedem para abrir, via evento)
export default function BotaoManual({ usuario, variante = "menu", principal = true }) {
  const [estado, setEstado] = useState(null); // null = fechado; objeto = aberto (estado inicial)
  useEffect(() => {
    if (!principal) return;
    const s = lerSessao(); if (s) setEstado(s);
    const pedir = () => setEstado({ ...(lerSessao() || {}), minimizado: false, _t: Date.now() });
    window.addEventListener("abrir-manual", pedir);
    return () => window.removeEventListener("abrir-manual", pedir);
  }, [principal]);
  const icone = <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13" /><path d="M10 8.5a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9v.4M12 14.2v.01" /></svg>;
  const abrir = () => window.dispatchEvent(new Event("abrir-manual"));
  return (
    <>
      {variante === "menu" ? (
        <button onClick={abrir} title="Manual do sistema: cursos, passo a passo e busca" aria-label="Abrir o manual do sistema"
          className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors ${estado ? "bg-cyan/10 text-cyan" : "text-textmain hover:bg-superficie"}`}>
          {icone}<span>Manual</span>
        </button>
      ) : (
        <button onClick={abrir} title="Manual do sistema" aria-label="Abrir o manual do sistema"
          className={variante === "topo" ? "p-2.5 rounded-lg text-slate-200 hover:bg-white/10" : "p-2 rounded-lg text-muted hover:bg-panel"}>{icone}</button>
      )}
      {principal && estado && <JanelaManual key={estado._t || 0} usuario={usuario} inicial={estado} onFechar={() => setEstado(null)} />}
    </>
  );
}

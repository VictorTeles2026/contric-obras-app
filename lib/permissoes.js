// Permissões: matriz por perfil + exceções por usuário (usado nas telas E no servidor).
//
//   valor final = padrão do perfil  →  ajustado pela exceção do usuário (a exceção prevalece)
//   S = permitido · P = permitido só nos PIs em que o usuário está alocado · N = não permitido




export const ROTULO_VALOR = { S: "Sim", P: "Só PIs próprios", N: "Não" };
// o Master nunca pode perder o acesso à tela de permissões (senão ninguém conserta)
const TRAVADAS_MASTER = ["permissao.gerenciar", "acesso.painel", "usuario.editar"];

const hojeISO = () => new Date().toISOString().slice(0, 10);

// linhasPerfil: [{ codigo, valor }] do perfil · excecoes: [{ codigo, valor, valido_ate }] do usuário
export function resolverPermissoes(perfil, linhasPerfil, excecoes = []) {
  const base = { ...(PADRAO_PERMISSOES[perfil] || {}) };
  // códigos que não estão no catálogo nascem como "N" para perfis sem definição
  CATALOGO_PERMISSOES.forEach((c) => { if (!(c.codigo in base)) base[c.codigo] = "N"; });
  (linhasPerfil || []).forEach((l) => { base[l.codigo] = l.valor; });
  const hoje = hojeISO();
  (excecoes || []).forEach((e) => { if (!e.valido_ate || e.valido_ate >= hoje) base[e.codigo] = e.valor; });
  if (perfil === "master") TRAVADAS_MASTER.forEach((c) => { base[c] = "S"; });
  return base;
}

// valor bruto: "S" | "P" | "N"
export function valorPermissao(usuario, codigo) {
  if (!usuario) return "N";
  const mapa = usuario.permissoes || resolverPermissoes(usuario.perfil, null, null);
  return mapa[codigo] || "N";
}
// pode fazer (em todos os PIs ou só nos próprios)?
export function pode(usuario, codigo) {
  const v = valorPermissao(usuario, codigo);
  return v === "S" || v === "P";
}
// pode fazer em QUALQUER PI (não só nos próprios)?
export function podeTudo(usuario, codigo) {
  return valorPermissao(usuario, codigo) === "S";
}

// GERADO a partir de 'Matriz de Permissoes - Contric.xlsx' (carga inicial).
// Catálogo de ações e matriz padrão por perfil. O valor vigente fica no banco
// (tabelas permissoes_perfil / permissoes_usuario) e é editado na tela Permissões;
// este padrão só é usado se o banco ainda não tiver a matriz.

export const CATALOGO_PERMISSOES = [
 {
  "codigo": "acesso.painel",
  "modulo": "Acesso",
  "acao": "Entrar no painel (computador)",
  "descricao": "Menu lateral completo: Dashboard, Cronograma, Relatórios..."
 },
 {
  "codigo": "acesso.mobile",
  "modulo": "Acesso",
  "acao": "Entrar no app de campo (celular)",
  "descricao": "Telas do líder / equipe: RDO, horas, ocorrência"
 },
 {
  "codigo": "dashboard.ver",
  "modulo": "Dashboard",
  "acao": "Ver Dashboard",
  "descricao": "Indicadores, lista de PIs, medições, documentos não abertos"
 },
 {
  "codigo": "dashboard.valores",
  "modulo": "Dashboard",
  "acao": "Ver valores financeiros (R$)",
  "descricao": "Valores de medição e orçamento"
 },
 {
  "codigo": "pi.ver",
  "modulo": "PIs / Cronograma",
  "acao": "Ver cronograma dos PIs",
  "descricao": "P = só dos PIs em que está alocado"
 },
 {
  "codigo": "pi.criar",
  "modulo": "PIs / Cronograma",
  "acao": "Criar PI",
  "descricao": "Abertura de PI com orçamento"
 },
 {
  "codigo": "pi.editar",
  "modulo": "PIs / Cronograma",
  "acao": "Editar dados do PI",
  "descricao": "Cliente, projeto, prazo, status, orçamento, responsável no cliente"
 },
 {
  "codigo": "pi.excluir",
  "modulo": "PIs / Cronograma",
  "acao": "Excluir PI (e tudo associado)",
  "descricao": "Ação irreversível"
 },
 {
  "codigo": "etapa.editar",
  "modulo": "PIs / Cronograma",
  "acao": "Criar / editar / excluir etapas",
  "descricao": "Macro e sub-etapas, datas, dependências, áreas"
 },
 {
  "codigo": "etapa.percentual",
  "modulo": "PIs / Cronograma",
  "acao": "Atualizar % de avanço das etapas",
  "descricao": ""
 },
 {
  "codigo": "cronograma.base",
  "modulo": "PIs / Cronograma",
  "acao": "Salvar Cronograma Base",
  "descricao": "Congela a versão de referência"
 },
 {
  "codigo": "cronograma.solicitar",
  "modulo": "PIs / Cronograma",
  "acao": "Solicitar alteração de cronograma",
  "descricao": "Pedido de mudança de data/escopo"
 },
 {
  "codigo": "cronograma.aprovar",
  "modulo": "PIs / Cronograma",
  "acao": "Aprovar solicitações de alteração",
  "descricao": ""
 },
 {
  "codigo": "linhatempo.ver",
  "modulo": "Linha do Tempo",
  "acao": "Ver Linha do Tempo",
  "descricao": ""
 },
 {
  "codigo": "rdo.criar",
  "modulo": "RDO",
  "acao": "Fazer RDO",
  "descricao": "P = só nos PIs em que está alocado"
 },
 {
  "codigo": "rdo.ver",
  "modulo": "RDO",
  "acao": "Ver RDOs",
  "descricao": ""
 },
 {
  "codigo": "rdo.aprovar",
  "modulo": "RDO",
  "acao": "Aprovar / reprovar RDO",
  "descricao": ""
 },
 {
  "codigo": "rdo.editar",
  "modulo": "RDO",
  "acao": "Editar RDO já enviado",
  "descricao": "O PDF é refeito"
 },
 {
  "codigo": "rdo.excluir",
  "modulo": "RDO",
  "acao": "Excluir RDO",
  "descricao": ""
 },
 {
  "codigo": "ocorrencia.registrar",
  "modulo": "Ocorrências",
  "acao": "Registrar ocorrência",
  "descricao": ""
 },
 {
  "codigo": "ocorrencia.aprovar",
  "modulo": "Ocorrências",
  "acao": "Aprovar / reprovar ocorrência",
  "descricao": ""
 },
 {
  "codigo": "ocorrencia.editar",
  "modulo": "Ocorrências",
  "acao": "Editar ocorrência",
  "descricao": ""
 },
 {
  "codigo": "ocorrencia.excluir",
  "modulo": "Ocorrências",
  "acao": "Excluir ocorrência",
  "descricao": ""
 },
 {
  "codigo": "horas.lancar_proprias",
  "modulo": "Horas",
  "acao": "Lançar as próprias horas",
  "descricao": ""
 },
 {
  "codigo": "horas.lancar_equipe",
  "modulo": "Horas",
  "acao": "Lançar horas da equipe",
  "descricao": ""
 },
 {
  "codigo": "horas.aprovar",
  "modulo": "Horas",
  "acao": "Aprovar / reprovar horas",
  "descricao": ""
 },
 {
  "codigo": "horas.relatorio",
  "modulo": "Horas",
  "acao": "Ver relatório de horas",
  "descricao": ""
 },
 {
  "codigo": "horas.excluir",
  "modulo": "Horas",
  "acao": "Excluir lançamento de horas",
  "descricao": ""
 },
 {
  "codigo": "doc.ver",
  "modulo": "Documentos",
  "acao": "Ver documentos dos PIs",
  "descricao": "PDFs, atas, fotos, vídeos"
 },
 {
  "codigo": "doc.enviar",
  "modulo": "Documentos",
  "acao": "Enviar documentos",
  "descricao": ""
 },
 {
  "codigo": "doc.cliente",
  "modulo": "Documentos",
  "acao": "Disponibilizar documento a cliente",
  "descricao": ""
 },
 {
  "codigo": "doc.excluir",
  "modulo": "Documentos",
  "acao": "Excluir documento",
  "descricao": ""
 },
 {
  "codigo": "recurso.ver",
  "modulo": "Recursos",
  "acao": "Ver recursos e utilização",
  "descricao": ""
 },
 {
  "codigo": "recurso.editar",
  "modulo": "Recursos",
  "acao": "Criar / editar recursos",
  "descricao": "Inclui equipes e Ativo/Desabilitado"
 },
 {
  "codigo": "recurso.alocar",
  "modulo": "Recursos",
  "acao": "Alocar recursos em PIs/etapas",
  "descricao": ""
 },
 {
  "codigo": "recurso.excluir",
  "modulo": "Recursos",
  "acao": "Excluir recurso",
  "descricao": ""
 },
 {
  "codigo": "empresa.gerenciar",
  "modulo": "Recursos",
  "acao": "Gerenciar empresas terceiras",
  "descricao": ""
 },
 {
  "codigo": "relatorio.ver",
  "modulo": "Relatórios",
  "acao": "Ver relatórios (orçado x realizado)",
  "descricao": ""
 },
 {
  "codigo": "relatorio.editar",
  "modulo": "Relatórios",
  "acao": "Digitar / limpar valores realizados",
  "descricao": ""
 },
 {
  "codigo": "cliente.gerenciar",
  "modulo": "Clientes",
  "acao": "Cadastrar / editar clientes",
  "descricao": ""
 },
 {
  "codigo": "cliente.acessos",
  "modulo": "Clientes",
  "acao": "Liberar acessos de clientes aos PIs",
  "descricao": ""
 },
 {
  "codigo": "cliente.senha",
  "modulo": "Clientes",
  "acao": "Ver / gerar senha de cliente",
  "descricao": ""
 },
 {
  "codigo": "cliente.excluir",
  "modulo": "Clientes",
  "acao": "Excluir cliente",
  "descricao": ""
 },
 {
  "codigo": "usuario.ver",
  "modulo": "Usuários",
  "acao": "Ver lista de usuários",
  "descricao": ""
 },
 {
  "codigo": "usuario.editar",
  "modulo": "Usuários",
  "acao": "Criar / editar / habilitar usuários",
  "descricao": ""
 },
 {
  "codigo": "usuario.senha",
  "modulo": "Usuários",
  "acao": "Ver senhas registradas",
  "descricao": ""
 },
 {
  "codigo": "usuario.excluir",
  "modulo": "Usuários",
  "acao": "Excluir usuário",
  "descricao": ""
 },
 {
  "codigo": "auditoria.ver",
  "modulo": "Auditoria",
  "acao": "Ver Auditoria",
  "descricao": ""
 },
 {
  "codigo": "historico.ver",
  "modulo": "Histórico",
  "acao": "Ver Histórico de aprovações",
  "descricao": ""
 },
 {
  "codigo": "permissao.gerenciar",
  "modulo": "Permissões",
  "acao": "Alterar matriz de permissões",
  "descricao": "Por perfil e por usuário"
 }
];

export const PADRAO_PERMISSOES = {
 "master": {
  "acesso.painel": "S",
  "acesso.mobile": "S",
  "dashboard.ver": "S",
  "dashboard.valores": "S",
  "pi.ver": "S",
  "pi.criar": "S",
  "pi.editar": "S",
  "pi.excluir": "S",
  "etapa.editar": "S",
  "etapa.percentual": "S",
  "cronograma.base": "S",
  "cronograma.solicitar": "S",
  "cronograma.aprovar": "S",
  "linhatempo.ver": "S",
  "rdo.criar": "S",
  "rdo.ver": "S",
  "rdo.aprovar": "S",
  "rdo.editar": "S",
  "rdo.excluir": "S",
  "ocorrencia.registrar": "S",
  "ocorrencia.aprovar": "S",
  "ocorrencia.editar": "S",
  "ocorrencia.excluir": "S",
  "horas.lancar_proprias": "S",
  "horas.lancar_equipe": "S",
  "horas.aprovar": "S",
  "horas.relatorio": "S",
  "horas.excluir": "S",
  "doc.ver": "S",
  "doc.enviar": "S",
  "doc.cliente": "S",
  "doc.excluir": "S",
  "recurso.ver": "S",
  "recurso.editar": "S",
  "recurso.alocar": "S",
  "recurso.excluir": "S",
  "empresa.gerenciar": "S",
  "relatorio.ver": "S",
  "relatorio.editar": "S",
  "cliente.gerenciar": "S",
  "cliente.acessos": "S",
  "cliente.senha": "S",
  "cliente.excluir": "S",
  "usuario.ver": "S",
  "usuario.editar": "S",
  "usuario.senha": "S",
  "usuario.excluir": "S",
  "auditoria.ver": "S",
  "historico.ver": "S",
  "permissao.gerenciar": "S"
 },
 "gerente": {
  "acesso.painel": "S",
  "acesso.mobile": "S",
  "dashboard.ver": "S",
  "dashboard.valores": "S",
  "pi.ver": "S",
  "pi.criar": "S",
  "pi.editar": "S",
  "pi.excluir": "N",
  "etapa.editar": "S",
  "etapa.percentual": "S",
  "cronograma.base": "S",
  "cronograma.solicitar": "S",
  "cronograma.aprovar": "S",
  "linhatempo.ver": "S",
  "rdo.criar": "S",
  "rdo.ver": "S",
  "rdo.aprovar": "S",
  "rdo.editar": "S",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "S",
  "ocorrencia.aprovar": "S",
  "ocorrencia.editar": "S",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "S",
  "horas.lancar_equipe": "S",
  "horas.aprovar": "S",
  "horas.relatorio": "S",
  "horas.excluir": "N",
  "doc.ver": "S",
  "doc.enviar": "S",
  "doc.cliente": "S",
  "doc.excluir": "N",
  "recurso.ver": "S",
  "recurso.editar": "S",
  "recurso.alocar": "S",
  "recurso.excluir": "N",
  "empresa.gerenciar": "S",
  "relatorio.ver": "S",
  "relatorio.editar": "S",
  "cliente.gerenciar": "S",
  "cliente.acessos": "S",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "S",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "S",
  "historico.ver": "S",
  "permissao.gerenciar": "N"
 },
 "coordenador": {
  "acesso.painel": "S",
  "acesso.mobile": "S",
  "dashboard.ver": "S",
  "dashboard.valores": "S",
  "pi.ver": "S",
  "pi.criar": "S",
  "pi.editar": "S",
  "pi.excluir": "N",
  "etapa.editar": "S",
  "etapa.percentual": "S",
  "cronograma.base": "S",
  "cronograma.solicitar": "S",
  "cronograma.aprovar": "S",
  "linhatempo.ver": "S",
  "rdo.criar": "S",
  "rdo.ver": "S",
  "rdo.aprovar": "S",
  "rdo.editar": "S",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "S",
  "ocorrencia.aprovar": "S",
  "ocorrencia.editar": "S",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "S",
  "horas.lancar_equipe": "S",
  "horas.aprovar": "S",
  "horas.relatorio": "S",
  "horas.excluir": "N",
  "doc.ver": "S",
  "doc.enviar": "S",
  "doc.cliente": "S",
  "doc.excluir": "N",
  "recurso.ver": "S",
  "recurso.editar": "S",
  "recurso.alocar": "S",
  "recurso.excluir": "N",
  "empresa.gerenciar": "S",
  "relatorio.ver": "S",
  "relatorio.editar": "N",
  "cliente.gerenciar": "S",
  "cliente.acessos": "S",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "S",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "S",
  "historico.ver": "S",
  "permissao.gerenciar": "N"
 },
 "visualizador": {
  "acesso.painel": "S",
  "acesso.mobile": "S",
  "dashboard.ver": "S",
  "dashboard.valores": "S",
  "pi.ver": "S",
  "pi.criar": "N",
  "pi.editar": "N",
  "pi.excluir": "N",
  "etapa.editar": "N",
  "etapa.percentual": "N",
  "cronograma.base": "N",
  "cronograma.solicitar": "S",
  "cronograma.aprovar": "N",
  "linhatempo.ver": "S",
  "rdo.criar": "N",
  "rdo.ver": "S",
  "rdo.aprovar": "N",
  "rdo.editar": "N",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "S",
  "ocorrencia.aprovar": "N",
  "ocorrencia.editar": "N",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "N",
  "horas.lancar_equipe": "N",
  "horas.aprovar": "N",
  "horas.relatorio": "S",
  "horas.excluir": "N",
  "doc.ver": "S",
  "doc.enviar": "N",
  "doc.cliente": "N",
  "doc.excluir": "N",
  "recurso.ver": "S",
  "recurso.editar": "N",
  "recurso.alocar": "N",
  "recurso.excluir": "N",
  "empresa.gerenciar": "N",
  "relatorio.ver": "S",
  "relatorio.editar": "N",
  "cliente.gerenciar": "N",
  "cliente.acessos": "N",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "S",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "S",
  "historico.ver": "S",
  "permissao.gerenciar": "N"
 },
 "lider": {
  "acesso.painel": "P",
  "acesso.mobile": "P",
  "dashboard.ver": "N",
  "dashboard.valores": "P",
  "pi.ver": "P",
  "pi.criar": "N",
  "pi.editar": "N",
  "pi.excluir": "N",
  "etapa.editar": "N",
  "etapa.percentual": "P",
  "cronograma.base": "N",
  "cronograma.solicitar": "P",
  "cronograma.aprovar": "N",
  "linhatempo.ver": "P",
  "rdo.criar": "P",
  "rdo.ver": "P",
  "rdo.aprovar": "N",
  "rdo.editar": "P",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "P",
  "ocorrencia.aprovar": "N",
  "ocorrencia.editar": "N",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "P",
  "horas.lancar_equipe": "P",
  "horas.aprovar": "N",
  "horas.relatorio": "P",
  "horas.excluir": "N",
  "doc.ver": "P",
  "doc.enviar": "P",
  "doc.cliente": "N",
  "doc.excluir": "N",
  "recurso.ver": "P",
  "recurso.editar": "N",
  "recurso.alocar": "N",
  "recurso.excluir": "N",
  "empresa.gerenciar": "N",
  "relatorio.ver": "P",
  "relatorio.editar": "N",
  "cliente.gerenciar": "N",
  "cliente.acessos": "N",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "N",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "N",
  "historico.ver": "P",
  "permissao.gerenciar": "N"
 },
 "funcionario": {
  "acesso.painel": "N",
  "acesso.mobile": "P",
  "dashboard.ver": "N",
  "dashboard.valores": "N",
  "pi.ver": "N",
  "pi.criar": "N",
  "pi.editar": "N",
  "pi.excluir": "N",
  "etapa.editar": "N",
  "etapa.percentual": "N",
  "cronograma.base": "N",
  "cronograma.solicitar": "N",
  "cronograma.aprovar": "N",
  "linhatempo.ver": "N",
  "rdo.criar": "N",
  "rdo.ver": "N",
  "rdo.aprovar": "N",
  "rdo.editar": "N",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "P",
  "ocorrencia.aprovar": "N",
  "ocorrencia.editar": "N",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "P",
  "horas.lancar_equipe": "N",
  "horas.aprovar": "N",
  "horas.relatorio": "N",
  "horas.excluir": "N",
  "doc.ver": "N",
  "doc.enviar": "N",
  "doc.cliente": "N",
  "doc.excluir": "N",
  "recurso.ver": "N",
  "recurso.editar": "N",
  "recurso.alocar": "N",
  "recurso.excluir": "N",
  "empresa.gerenciar": "N",
  "relatorio.ver": "N",
  "relatorio.editar": "N",
  "cliente.gerenciar": "N",
  "cliente.acessos": "N",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "N",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "N",
  "historico.ver": "N",
  "permissao.gerenciar": "N"
 },
 "terceiro": {
  "acesso.painel": "N",
  "acesso.mobile": "P",
  "dashboard.ver": "N",
  "dashboard.valores": "N",
  "pi.ver": "N",
  "pi.criar": "N",
  "pi.editar": "N",
  "pi.excluir": "N",
  "etapa.editar": "N",
  "etapa.percentual": "N",
  "cronograma.base": "N",
  "cronograma.solicitar": "N",
  "cronograma.aprovar": "N",
  "linhatempo.ver": "N",
  "rdo.criar": "N",
  "rdo.ver": "N",
  "rdo.aprovar": "N",
  "rdo.editar": "N",
  "rdo.excluir": "N",
  "ocorrencia.registrar": "P",
  "ocorrencia.aprovar": "N",
  "ocorrencia.editar": "N",
  "ocorrencia.excluir": "N",
  "horas.lancar_proprias": "P",
  "horas.lancar_equipe": "N",
  "horas.aprovar": "N",
  "horas.relatorio": "N",
  "horas.excluir": "N",
  "doc.ver": "N",
  "doc.enviar": "N",
  "doc.cliente": "N",
  "doc.excluir": "N",
  "recurso.ver": "N",
  "recurso.editar": "N",
  "recurso.alocar": "N",
  "recurso.excluir": "N",
  "empresa.gerenciar": "N",
  "relatorio.ver": "N",
  "relatorio.editar": "N",
  "cliente.gerenciar": "N",
  "cliente.acessos": "N",
  "cliente.senha": "N",
  "cliente.excluir": "N",
  "usuario.ver": "N",
  "usuario.editar": "N",
  "usuario.senha": "N",
  "usuario.excluir": "N",
  "auditoria.ver": "N",
  "historico.ver": "N",
  "permissao.gerenciar": "N"
 }
};

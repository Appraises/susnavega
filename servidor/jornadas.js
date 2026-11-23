'use strict';

const { randomUUID } = require('node:crypto');
const { exigir, texto, dataValida, permitir } = require('./validacao.js');

const SITUACOES_ETAPA = ['Aguardando', 'Agendado', 'Em andamento', 'Concluído', 'Pendente', 'Devolvido'];

async function carregarJornada(conexao, id, bloquear = false) {
  const consulta = await conexao.query(`SELECT * FROM jornadas WHERE id = $1${bloquear ? ' FOR UPDATE' : ''}`, [id]);
  exigir(consulta.rowCount, 'Jornada não encontrada.', 404);
  const registro = consulta.rows[0];
  const etapas = await conexao.query('SELECT dados FROM etapas WHERE jornada_id = $1 ORDER BY ordem', [id]);
  return { ...registro, etapas: etapas.rows.map((linha) => linha.dados) };
}

function conferirVersao(jornada, versao) {
  exigir(Number.isInteger(versao), 'Informe a versão da jornada.');
  exigir(jornada.versao === versao, 'Outra pessoa atualizou esta jornada. Confira os dados atualizados antes de salvar novamente.', 409);
}

function exigirJornadaAberta(jornada) {
  exigir(!['Suspensa', 'Concluída'].includes(jornada.situacao), 'Reabra a jornada antes de alterar seus registros.', 409);
}

function pendenciasAbertas(etapa) {
  return (etapa.pending || []).filter((pendencia) => pendencia.status === 'Aberta');
}

function validarDependencias(etapas) {
  const visitando = new Set();
  const visitadas = new Set();
  function visitar(etapa) {
    exigir(!visitando.has(etapa.id), 'As dependências não podem formar ciclos.');
    if (visitadas.has(etapa.id)) return;
    visitando.add(etapa.id);
    for (const id of etapa.dependsOn) {
      const anterior = etapas.find((item) => item.id === id);
      exigir(anterior && anterior.id !== etapa.id, 'Os pré-requisitos devem ser outras etapas da mesma jornada.');
      visitar(anterior);
    }
    visitando.delete(etapa.id);
    visitadas.add(etapa.id);
  }
  etapas.forEach(visitar);
}

async function registrarEvento(conexao, jornada, usuario, titulo, detalhes = {}) {
  const evento = { id: randomUUID(), journeyId: jornada?.id || null, title: titulo, actor: usuario.nome, actorId: usuario.id, at: new Date().toISOString(), ...detalhes };
  await conexao.query('INSERT INTO historico VALUES ($1,$2,$3)', [evento.id, evento.journeyId, evento]);
  return evento;
}

async function salvarEtapas(conexao, jornada, usuario, titulo, detalhes = {}) {
  for (const etapa of jornada.etapas) {
    await conexao.query('UPDATE etapas SET dados = $1 WHERE id = $2 AND jornada_id = $3', [etapa, etapa.id, jornada.id]);
  }
  await conexao.query('UPDATE jornadas SET situacao = $1, versao = versao + 1, atualizada_em = $2 WHERE id = $3', [jornada.situacao, new Date().toISOString(), jornada.id]);
  await registrarEvento(conexao, jornada, usuario, titulo, detalhes);
  return jornada.id;
}

async function criarJornada(conexao, usuario, dados) {
  permitir(usuario, 'profissional');
  const paciente = await conexao.query('SELECT id FROM pacientes WHERE id = $1', [dados.pacienteId]);
  exigir(paciente.rowCount, 'Paciente não encontrado.', 404);
  const titulo = texto(dados.titulo, 'nome da jornada', true, 150);
  const tipo = texto(dados.tipo, 'tipo', true, 100);
  const unidade = texto(dados.unidade, 'unidade', true, 150);
  const inicio = dataValida(dados.inicio);
  const objetivo = texto(dados.objetivo, 'objetivo');
  exigir(Array.isArray(dados.etapas) && dados.etapas.length >= 1 && dados.etapas.length <= 6, 'Defina de 1 a 6 etapas.');
  const id = `JN-${randomUUID().slice(0, 8).toUpperCase()}`;
  for (const entrada of dados.etapas) {
    exigir(entrada && typeof entrada === 'object', 'Informe os dados de cada etapa.');
    exigir(entrada.preRequisitos === undefined || Array.isArray(entrada.preRequisitos), 'Os pré-requisitos devem ser uma lista.');
  }
  const etapas = dados.etapas.map((entrada, ordem) => ({
    id: `${id}-S${ordem + 1}`, title: texto(entrada.nome, 'nome da etapa', true, 150),
    owner: texto(entrada.responsavel, 'responsável', true, 150), status: 'Aguardando', date: '',
    location: unidade, summary: 'Etapa registrada pela equipe responsável.', observation: '', pending: [],
    dependsOn: (entrada.preRequisitos ?? (ordem ? [ordem - 1] : [])).map((indice) => {
      exigir(Number.isInteger(indice) && indice >= 0 && indice < dados.etapas.length, 'Pré-requisito inválido.');
      return `${id}-S${indice + 1}`;
    })
  }));
  validarDependencias(etapas);
  await conexao.query('INSERT INTO jornadas VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9)', [id, dados.pacienteId, titulo, tipo, unidade, inicio, objetivo, 'Planejada', new Date().toISOString()]);
  for (const [ordem, etapa] of etapas.entries()) {
    await conexao.query('INSERT INTO etapas VALUES ($1,$2,$3,$4)', [etapa.id, id, ordem, etapa]);
  }
  await registrarEvento(conexao, { id }, usuario, 'Jornada criada', { to: 'Planejada' });
  return id;
}

async function atualizarEtapa(conexao, usuario, jornadaId, etapaId, dados) {
  permitir(usuario, 'profissional');
  const jornada = await carregarJornada(conexao, jornadaId, true);
  conferirVersao(jornada, dados.versao);
  exigirJornadaAberta(jornada);
  const etapa = jornada.etapas.find((item) => item.id === etapaId);
  exigir(etapa, 'Etapa não encontrada.', 404);
  const anterior = structuredClone(etapa);
  exigir(SITUACOES_ETAPA.includes(dados.situacao), 'Situação de etapa inválida.');
  exigir(etapa.status !== 'Concluído' || dados.situacao === 'Concluído', 'Uma etapa concluída deve preservar seu estado.');
  const responsavel = texto(dados.responsavel, 'responsável', true, 150);
  const data = dataValida(dados.data, false);
  const observacao = texto(dados.observacao, 'observação', false);
  exigir(!(dados.resolverPendencia && dados.pendencia), 'Resolva a pendência anterior antes de registrar outra.');
  if (dados.resolverPendencia) {
    for (const pendencia of pendenciasAbertas(etapa)) {
      exigir(!String(pendencia.id || '').startsWith('REF-'), 'A pendência do encaminhamento deve ser resolvida pelo Secretariado.', 403);
      pendencia.status = 'Resolvida';
      pendencia.resolvedAt = new Date().toISOString();
    }
  }
  let tituloEvento = 'Etapa atualizada';
  if (dados.pendencia) {
    const entrada = dados.pendencia;
    const pendencia = {
      id: randomUUID(), status: 'Aberta', reason: texto(entrada.motivo, 'motivo'),
      action: texto(entrada.acao, 'ação necessária'), owner: texto(entrada.responsavel, 'responsável pela pendência', true, 150),
      dueDate: dataValida(entrada.prazo, false), blocking: entrada.bloqueante !== false, createdAt: new Date().toISOString()
    };
    exigir(['Paciente', 'Profissional de Saúde', 'Equipe hospitalar', 'Equipe APS', 'Secretariado'].includes(pendencia.owner), 'Responsável pela pendência inválido.');
    etapa.pending.push(pendencia);
    tituloEvento = 'Pendência registrada';
  }
  if (['Em andamento', 'Concluído'].includes(dados.situacao)) {
    exigir(etapa.dependsOn.every((id) => jornada.etapas.find((item) => item.id === id)?.status === 'Concluído'), 'Conclua os pré-requisitos desta etapa.');
    exigir(!pendenciasAbertas(etapa).some((pendencia) => pendencia.blocking !== false), 'Resolva as pendências impeditivas desta etapa.');
  }
  if (['Pendente', 'Devolvido'].includes(dados.situacao)) exigir(pendenciasAbertas(etapa).length, 'Informe motivo, ação e responsável pela pendência.');
  Object.assign(etapa, { status: dados.situacao, owner: responsavel, date: data, observation: observacao, updatedAt: new Date().toISOString() });
  if (jornada.situacao === 'Planejada' && ['Em andamento', 'Concluído'].includes(etapa.status)) jornada.situacao = 'Ativa';
  if (dados.resolverPendencia) tituloEvento = 'Pendência resolvida';
  return salvarEtapas(conexao, jornada, usuario, tituloEvento, { stageId: etapa.id, before: anterior, after: etapa });
}

async function alterarSituacao(conexao, usuario, id, dados) {
  permitir(usuario, 'profissional');
  const jornada = await carregarJornada(conexao, id, true);
  conferirVersao(jornada, dados.versao);
  const anterior = jornada.situacao;
  const motivo = texto(dados.motivo, 'motivo');
  if (dados.acao === 'suspender') {
    exigir(anterior === 'Ativa', 'Somente uma jornada ativa pode ser suspensa.', 409);
    jornada.situacao = 'Suspensa';
  } else if (dados.acao === 'reabrir') {
    exigir(['Suspensa', 'Concluída'].includes(anterior), 'Esta jornada não pode ser reaberta.', 409);
    jornada.situacao = 'Ativa';
  } else if (dados.acao === 'concluir') {
    exigir(anterior === 'Ativa', 'A jornada precisa estar ativa para ser concluída.', 409);
    exigir(jornada.etapas.every((etapa) => etapa.status === 'Concluído'), 'Conclua todas as etapas antes de concluir a jornada.');
    exigir(!jornada.etapas.some((etapa) => pendenciasAbertas(etapa).some((pendencia) => pendencia.blocking !== false)), 'Resolva as pendências impeditivas.');
    jornada.situacao = 'Concluída';
  } else exigir(false, 'Ação inválida.');
  // Reabrir altera somente a jornada: os estados das etapas são preservados.
  return salvarEtapas(conexao, jornada, usuario, `${anterior} → ${jornada.situacao}`, { type: 'journey-situation', from: anterior, to: jornada.situacao, reason: motivo });
}

module.exports = { carregarJornada, conferirVersao, exigirJornadaAberta, validarDependencias, pendenciasAbertas, registrarEvento, salvarEtapas, criarJornada, atualizarEtapa, alterarSituacao };

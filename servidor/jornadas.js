'use strict';

const { randomUUID } = require('node:crypto');
const { exigir, texto, dataValida, permitir } = require('./validacao.js');


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

module.exports = { validarDependencias, registrarEvento, criarJornada };

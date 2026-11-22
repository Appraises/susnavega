'use strict';

const { exigir, permitir } = require('./validacao.js');

async function buscarPacientes(conexao, usuario, busca = '') {
  permitir(usuario, 'profissional');
  const consulta = await conexao.query(
    'SELECT dados FROM pacientes WHERE nome ILIKE $1 OR cns LIKE $1 OR id ILIKE $1 ORDER BY nome LIMIT 30',
    [`%${String(busca).slice(0, 150)}%`]
  );
  return consulta.rows.map((linha) => linha.dados);
}

async function consultarEstado(conexao, usuario, pacienteId) {
  permitir(usuario, 'paciente', 'profissional');
  if (usuario.perfil === 'paciente') {
    exigir(!pacienteId || pacienteId === usuario.paciente_id, 'Você só pode consultar sua própria jornada.', 403);
    pacienteId = usuario.paciente_id;
  }
  if (!pacienteId) pacienteId = (await conexao.query('SELECT id FROM pacientes ORDER BY id LIMIT 1')).rows[0]?.id;
  const cadastro = await conexao.query('SELECT dados FROM pacientes WHERE id=$1', [pacienteId]);
  exigir(cadastro.rowCount, 'Paciente não encontrado.', 404);
  const consulta = await conexao.query('SELECT * FROM jornadas WHERE paciente_id=$1 ORDER BY atualizada_em DESC, id', [pacienteId]);
  const etapas = await conexao.query('SELECT e.* FROM etapas e JOIN jornadas j ON j.id=e.jornada_id WHERE j.paciente_id=$1 ORDER BY e.ordem', [pacienteId]);
  const jornadas = consulta.rows.map((registro) => ({
    id: registro.id, patientId: registro.paciente_id, title: registro.titulo, type: registro.tipo,
    unit: registro.unidade, startDate: registro.inicio, objective: registro.objetivo, updatedAt: registro.atualizada_em,
    situation: { Planejada: 'Aguardando', Ativa: 'Em andamento', Suspensa: 'Suspensa', Concluída: 'Concluída' }[registro.situacao],
    situacao: registro.situacao, versao: registro.versao,
    stages: etapas.rows.filter((etapa) => etapa.jornada_id === registro.id).map((etapa) => etapa.dados)
  }));
  const historico = await conexao.query('SELECT h.dados FROM historico h JOIN jornadas j ON j.id=h.jornada_id WHERE j.paciente_id=$1 ORDER BY h.dados->>\'at\' DESC LIMIT 100', [pacienteId]);
  return { version: 3, patient: cadastro.rows[0].dados, journeys: jornadas, events: historico.rows.map((linha) => linha.dados) };
}

module.exports = { buscarPacientes, consultarEstado };

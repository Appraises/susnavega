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
  const encaminhamentos = await conexao.query(
    `SELECT en.*, j.titulo AS titulo_jornada, j.versao AS versao_jornada,
      p.nome AS nome_paciente, u.nome AS atualizado_por, e.dados->>'title' AS nome_etapa
     FROM encaminhamentos en
     JOIN jornadas j ON j.id = en.jornada_id
     JOIN pacientes p ON p.id = j.paciente_id
     JOIN usuarios u ON u.id = en.atualizado_por_id
     JOIN etapas e ON e.id = en.etapa_id AND e.jornada_id = en.jornada_id
     WHERE j.paciente_id = $1
     ORDER BY en.atualizado_em DESC, en.id`,
    [pacienteId]
  );
  const jornadas = consulta.rows.map((registro) => ({
    id: registro.id, patientId: registro.paciente_id, title: registro.titulo, type: registro.tipo,
    unit: registro.unidade, startDate: registro.inicio, objective: registro.objetivo, updatedAt: registro.atualizada_em,
    situation: { Planejada: 'Aguardando', Ativa: 'Em andamento', Suspensa: 'Suspensa', Concluída: 'Concluída' }[registro.situacao],
    situacao: registro.situacao, versao: registro.versao,
    stages: etapas.rows.filter((etapa) => etapa.jornada_id === registro.id).map((etapa) => etapa.dados)
  }));
  const historico = await conexao.query('SELECT h.dados FROM historico h JOIN jornadas j ON j.id=h.jornada_id WHERE j.paciente_id=$1 ORDER BY h.dados->>\'at\' DESC LIMIT 100', [pacienteId]);
  return {
    version: 3,
    patient: cadastro.rows[0].dados,
    journeys: jornadas,
    events: historico.rows.map((linha) => linha.dados),
    referrals: encaminhamentos.rows.map((registro) => {
      const etapa = etapas.rows.find((linha) => linha.id === registro.etapa_id);
      const pendencia = (etapa?.dados.pending || []).find((item) => item.id === `REF-${registro.id}` && item.status === 'Aberta');
      return {
        id: registro.id,
        patient: registro.nome_paciente,
        patientId: pacienteId,
        journey: registro.jornada_id,
        journeyTitle: registro.titulo_jornada,
        stageId: registro.etapa_id,
        stage: registro.nome_etapa,
        destination: registro.destino,
        date: registro.data,
        status: registro.situacao,
        reason: registro.motivo,
        owner: pendencia?.owner || '',
        nextAction: pendencia?.action || '',
        updatedBy: registro.atualizado_por,
        updatedAt: registro.atualizado_em,
        version: registro.versao,
        journeyVersion: registro.versao_jornada
      };
    })
  };
}

module.exports = { buscarPacientes, consultarEstado };

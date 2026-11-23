'use strict';

const { randomUUID } = require('node:crypto');
const { exigir, texto, dataValida, permitir } = require('./validacao.js');
const { carregarJornada, conferirVersao, exigirJornadaAberta, salvarEtapas } = require('./jornadas.js');

const TRANSICOES = {
  Solicitado: ['Aguardando agendamento', 'Devolvido'],
  'Aguardando agendamento': ['Agendado', 'Devolvido'],
  Agendado: ['Realizado', 'Devolvido'],
  Devolvido: ['Solicitado'],
  Realizado: []
};

async function listarEncaminhamentos(conexao, usuario) {
  permitir(usuario, 'secretariado');
  const consulta = await conexao.query(
    `SELECT en.id, en.jornada_id, j.titulo AS titulo_jornada, j.versao AS versao_jornada,
      en.etapa_id, e.dados->>'title' AS nome_etapa, p.id AS paciente_id, p.nome AS nome_paciente,
      en.destino, en.data, en.situacao, en.motivo, en.versao,
      u.nome AS atualizado_por, en.atualizado_em,
      e.dados->'pending' AS pendencias
     FROM encaminhamentos en
     JOIN jornadas j ON j.id = en.jornada_id
     JOIN pacientes p ON p.id = j.paciente_id
     JOIN etapas e ON e.id = en.etapa_id AND e.jornada_id = en.jornada_id
     JOIN usuarios u ON u.id = en.atualizado_por_id
     ORDER BY en.atualizado_em DESC, en.id`
  );
  return consulta.rows.map((registro) => formatarEncaminhamento(registro));
}

async function listarOpcoes(conexao, usuario) {
  permitir(usuario, 'secretariado');
  const consulta = await conexao.query(
    `SELECT p.id AS paciente_id, p.nome AS nome_paciente,
      j.id AS jornada_id, j.titulo AS titulo_jornada, j.versao AS versao_jornada,
      e.id AS etapa_id, e.dados->>'title' AS nome_etapa
     FROM pacientes p
     JOIN jornadas j ON j.paciente_id = p.id
     JOIN etapas e ON e.jornada_id = j.id
     WHERE j.situacao NOT IN ('Suspensa', 'Concluída')
       AND e.dados->>'status' <> 'Concluído'
     ORDER BY p.nome, j.atualizada_em DESC, e.ordem`
  );
  return consulta.rows.map((registro) => ({
    patientId: registro.paciente_id,
    patient: registro.nome_paciente,
    journeyId: registro.jornada_id,
    journey: registro.titulo_jornada,
    journeyVersion: registro.versao_jornada,
    stageId: registro.etapa_id,
    stage: registro.nome_etapa
  }));
}

function formatarEncaminhamento(registro) {
  const pendencias = Array.isArray(registro.pendencias) ? registro.pendencias : [];
  const pendencia = pendencias.find((item) => item.id === `REF-${registro.id}` && item.status === 'Aberta');
  return {
    id: registro.id,
    patientId: registro.paciente_id,
    patient: registro.nome_paciente,
    journey: registro.jornada_id,
    journeyTitle: registro.titulo_jornada,
    journeyVersion: registro.versao_jornada,
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
    version: registro.versao
  };
}

async function salvarEncaminhamento(conexao, usuario, dados, id = null) {
  permitir(usuario, 'secretariado');

  let registro;
  if (id) {
    const consulta = await conexao.query('SELECT * FROM encaminhamentos WHERE id = $1 FOR UPDATE', [id]);
    exigir(consulta.rowCount, 'Encaminhamento não encontrado.', 404);
    registro = consulta.rows[0];
  }

  const jornadaId = registro?.jornada_id || texto(dados.jornadaId, 'jornada', true, 80);
  const jornada = await carregarJornada(conexao, jornadaId, true);
  conferirVersao(jornada, dados.versao);
  exigirJornadaAberta(jornada);

  const etapaId = registro?.etapa_id || texto(dados.etapaId, 'etapa', true, 100);
  const etapa = jornada.etapas.find((item) => item.id === etapaId);
  exigir(etapa, 'A etapa não pertence à jornada informada.', 422);
  exigir(etapa.status !== 'Concluído', 'Não é possível encaminhar uma etapa concluída.', 409);

  const situacao = texto(dados.situacao, 'situação', true, 40);
  if (registro) {
    exigir(TRANSICOES[registro.situacao]?.includes(situacao), 'Transição de encaminhamento não permitida.', 409);
  } else {
    exigir(situacao === 'Solicitado', 'Um novo encaminhamento começa como Solicitado.');
  }

  const motivo = texto(dados.motivo, 'motivo da devolução', situacao === 'Devolvido', 1000);
  const destino = registro?.destino || texto(dados.destino, 'destino interno', true, 150);
  const data = registro?.data || dataValida(dados.data);
  const protocolo = registro?.id || `ENC-${randomUUID().slice(0, 8).toUpperCase()}`;
  const agora = new Date().toISOString();

  if (registro) {
    await conexao.query(
      `UPDATE encaminhamentos
       SET situacao = $1, motivo = $2, atualizado_por_id = $3, atualizado_em = $4, versao = versao + 1
       WHERE id = $5`,
      [situacao, situacao === 'Devolvido' ? motivo : '', usuario.id, agora, protocolo]
    );
  } else {
    await conexao.query(
      `INSERT INTO encaminhamentos
       (id,jornada_id,etapa_id,destino,data,situacao,motivo,criado_por_id,atualizado_por_id,criado_em,atualizado_em,versao)
       VALUES ($1,$2,$3,$4,$5,$6,'',$7,$7,$8,$8,1)`,
      [protocolo, jornada.id, etapa.id, destino, data, situacao, usuario.id, agora]
    );
  }

  const pendenciaId = `REF-${protocolo}`;
  let pendencia = etapa.pending.find((item) => item.id === pendenciaId);
  if (situacao === 'Devolvido') {
    if (!pendencia) {
      pendencia = { id: pendenciaId, createdAt: agora };
      etapa.pending.push(pendencia);
    }
    Object.assign(pendencia, {
      status: 'Aberta',
      blocking: true,
      reason: motivo,
      action: 'O Secretariado deve conferir e reenviar o documento do encaminhamento.',
      owner: 'Secretariado'
    });
  } else if (registro?.situacao === 'Devolvido' && pendencia?.status === 'Aberta') {
    pendencia.status = 'Resolvida';
    pendencia.resolvedAt = agora;
  }

  const evento = {
    type: 'referral',
    stageId: etapa.id,
    protocol: protocolo,
    from: registro?.situacao || null,
    to: situacao,
    reason: situacao === 'Devolvido' ? motivo : ''
  };
  await salvarEtapas(conexao, jornada, usuario, `${protocolo} · ${situacao}`, evento);

  return {
    id: protocolo,
    jornadaId: jornada.id,
    etapaId: etapa.id,
    version: (registro?.versao || 0) + 1,
    journeyVersion: jornada.versao + 1
  };
}

module.exports = { listarEncaminhamentos, listarOpcoes, salvarEncaminhamento, TRANSICOES };

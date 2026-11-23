'use strict';

const { Pool } = require('pg');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const modelo = require('../dist/model.js');

function criarConexao(endereco = process.env.DATABASE_URL, configuracao = {}) {
  if (!endereco) throw new Error('Configure DATABASE_URL no arquivo .env. Consulte o README.');
  const banco = new Pool({ connectionString: endereco, max: 10, connectionTimeoutMillis: 5000, ...configuracao });
  banco.on('error', (erro) => console.error('Conexão com o PostgreSQL interrompida:', erro.message));
  return banco;
}

async function transacao(banco, operacao) {
  const conexao = await banco.connect();
  try {
    await conexao.query('BEGIN');
    const resultado = await operacao(conexao);
    await conexao.query('COMMIT');
    return resultado;
  } catch (erro) {
    await conexao.query('ROLLBACK');
    throw erro;
  } finally {
    conexao.release();
  }
}

async function prepararBanco(banco) {
  const esquema = await readFile(join(__dirname, 'esquema.sql'), 'utf8');
  await transacao(banco, async (conexao) => {
    // Duas inicializações simultâneas não podem cadastrar as contas duas vezes.
    await conexao.query('SELECT pg_advisory_xact_lock(26012026)');
    await conexao.query(esquema);
    const existentes = await conexao.query('SELECT id FROM pacientes LIMIT 1');
    if (!existentes.rowCount) await criarDadosIniciais(conexao);
    await garantirContaSecretariado(conexao);
  });
}

async function garantirContaSecretariado(conexao) {
  const email = 'secretariado@fluxsus.demo';
  const existente = await conexao.query('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (existente.rowCount) return;

  const sal = randomBytes(16).toString('hex');
  const resumo = scryptSync('123456', sal, 64).toString('hex');
  await conexao.query(
    'INSERT INTO usuarios (id,email,nome,perfil,paciente_id,sal,senha_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
    ['US-003', email, 'João Lima', 'secretariado', null, sal, resumo]
  );
}

async function criarDadosIniciais(conexao) {
  const estado = modelo.normalizeState(modelo.seedState());
  const pacientes = [estado.patient, { id: 'PAC-002', name: 'Pedro Oliveira', shortName: 'Pedro Oliveira', cns: '0000004822', birthDate: '1985-06-10', unit: 'Hospital Universitário' }];
  for (const paciente of pacientes) {
    paciente.unit = 'Hospital Universitário';
    await conexao.query('INSERT INTO pacientes VALUES ($1,$2,$3,$4)', [paciente.id, paciente.name, paciente.cns, paciente]);
  }
  const contas = [
    ['US-001', 'paciente', 'paciente@fluxsus.demo', 'Maria Costa', 'PAC-001'],
    ['US-002', 'profissional', 'profissional@fluxsus.demo', 'Dra. Carla Reis', null],
    ['US-003', 'secretariado', 'secretariado@fluxsus.demo', 'João Lima', null],
    ['US-005', 'paciente', 'pedro@fluxsus.demo', 'Pedro Oliveira', 'PAC-002']
  ];
  for (const [id, perfil, email, nome, pacienteId] of contas) {
    const sal = randomBytes(16).toString('hex');
    const resumo = scryptSync('123456', sal, 64).toString('hex');
    await conexao.query('INSERT INTO usuarios VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, email, nome, perfil, pacienteId, sal, resumo]);
  }
  for (const jornada of estado.journeys) {
    const ativa = jornada.stages.some((etapa) => etapa.status !== 'Aguardando');
    await conexao.query('INSERT INTO jornadas VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9)', [jornada.id, jornada.patientId, jornada.title, jornada.type, 'Hospital Universitário', jornada.startDate, '', ativa ? 'Ativa' : 'Planejada', jornada.updatedAt]);
    for (const [ordem, etapa] of jornada.stages.entries()) {
      if (etapa.location.includes('UBS') || etapa.location.includes('Clínica')) etapa.location = 'Hospital Universitário';
      if (etapa.owner === 'Equipe APS') etapa.owner = 'Equipe hospitalar';
      etapa.pending.forEach((pendencia) => { pendencia.blocking = false; });
      await conexao.query('INSERT INTO etapas VALUES ($1,$2,$3,$4)', [etapa.id, jornada.id, ordem, etapa]);
    }
  }
}

module.exports = { criarConexao, prepararBanco, transacao };

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { criarConexao, prepararBanco } = require('../servidor/banco.js');
const { criarAplicacao } = require('../servidor/servidor.js');
const modelo = require('../dist/model.js');

let banco, administrador, servidor, endereco;
let profissional, paciente, outroPaciente;
const esquema = 'teste_' + randomUUID().replaceAll('-', '');

function criarCliente() {
  let cookie = '';
  return async function chamar(caminho, metodo = 'GET', dados, cabecalhos = {}) {
    const resposta = await fetch(endereco + caminho, {
      method: metodo,
      headers: { Cookie: cookie, ...(dados === undefined ? {} : { 'Content-Type': 'application/json' }), ...cabecalhos },
      body: dados === undefined ? undefined : JSON.stringify(dados)
    });
    if (resposta.headers.has('set-cookie')) cookie = resposta.headers.get('set-cookie').split(';')[0];
    const conteudo = await resposta.json();
    return { codigo: resposta.status, conteudo, cabecalhos: resposta.headers };
  };
}

async function acessar(email) {
  const cliente = criarCliente();
  const resposta = await cliente('/api/entrar', 'POST', { email: email + '@fluxsus.demo', senha: '123456' });
  assert.equal(resposta.codigo, 200);
  assert.match(resposta.cabecalhos.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  return cliente;
}

async function estado(cliente = profissional, pacienteId = 'PAC-001') {
  const resposta = await cliente('/api/estado?paciente=' + pacienteId);
  assert.equal(resposta.codigo, 200);
  return resposta.conteudo;
}

async function criar(etapas = [{ nome: 'Avaliação', responsavel: 'Equipe hospitalar', preRequisitos: [] }], pacienteId = 'PAC-001') {
  const resposta = await profissional('/api/jornadas', 'POST', { pacienteId, titulo: 'Jornada de teste', objetivo: 'Verificar o fluxo integrado', tipo: 'Consulta', unidade: 'Hospital Universitário', inicio: '2026-11-21', etapas });
  assert.equal(resposta.codigo, 201, JSON.stringify(resposta.conteudo));
  return (await estado(profissional, pacienteId)).journeys.find((jornada) => jornada.id === resposta.conteudo.id);
}

function dadosEtapa(jornada, situacao = 'Concluído', adicionais = {}) {
  return { versao: jornada.versao, situacao, responsavel: 'Equipe hospitalar', data: '', observacao: '', ...adicionais };
}

before(async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'Configure TEST_DATABASE_URL para um banco dedicado a testes.');
  assert.match(new URL(url).pathname, /_test$/);
  administrador = criarConexao(url);
  await administrador.query(`CREATE SCHEMA ${esquema}`);
  banco = criarConexao(url, { options: `-c search_path=${esquema}` });
  await prepararBanco(banco);
  servidor = criarAplicacao(banco).listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  endereco = 'http://127.0.0.1:' + servidor.address().port;
  profissional = await acessar('profissional'); paciente = await acessar('paciente');
  outroPaciente = await acessar('pedro');
});

after(async () => {
  if (servidor) await new Promise((resolver) => servidor.close(resolver));
  if (banco) await banco.end();
  if (administrador) {
    await administrador.query(`DROP SCHEMA ${esquema} CASCADE`);
    await administrador.end();
  }
});

test('RF007: exige sessão, recusa senha inválida e encerra a sessão', async () => {
  const anonimo = criarCliente();
  assert.equal((await anonimo('/api/estado')).codigo, 401);
  assert.equal((await anonimo('/api/entrar', 'POST', { email: 'paciente@fluxsus.demo', senha: 'errada' })).codigo, 401);
  const temporario = await acessar('paciente');
  assert.equal((await temporario('/api/sair', 'POST', {})).codigo, 200);
  assert.equal((await temporario('/api/estado')).codigo, 401);
});

test('isolamento das versões: o cookie da aplicação completa não autentica no recorte P3', async () => {
  const resposta = await fetch(endereco + '/api/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'paciente@fluxsus.demo', senha: '123456' })
  });
  assert.equal(resposta.status, 200);
  const cookie = resposta.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^fluxsus_p3_sessao=/);
  const cookieOutraVersao = cookie.replace('fluxsus_p3_sessao=', 'fluxsus_sessao=');
  assert.equal((await fetch(endereco + '/api/estado', { headers: { Cookie: cookieOutraVersao } })).status, 401);
});

test('RN04: paciente não consulta outro paciente, busca cadastro ou cria jornada', async () => {
  assert.equal((await paciente('/api/estado?paciente=PAC-002')).codigo, 403);
  assert.equal((await outroPaciente('/api/estado?paciente=PAC-001')).codigo, 403);
  assert.equal((await paciente('/api/jornadas', 'POST', {})).codigo, 403);
  assert.equal((await paciente('/api/pacientes?busca=Pedro')).codigo, 403);
});

test('segurança: recusa mutação de outra origem e não serve arquivos do servidor', async () => {
  const resposta = await profissional('/api/jornadas', 'POST', {}, { Origin: 'https://outro-site.example' });
  assert.equal(resposta.codigo, 403);
  const arquivo = await fetch(endereco + '/servidor/esquema.sql');
  assert.equal(arquivo.status, 404);
});

test('RF007: sessão expirada não permite consultar dados', async () => {
  const resposta = await fetch(endereco + '/api/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'paciente@fluxsus.demo', senha: '123456' })
  });
  assert.equal(resposta.status, 200);
  const cookie = resposta.headers.get('set-cookie').split(';')[0];
  const resumo = createHash('sha256').update(cookie.split('=')[1]).digest('hex');
  await banco.query('UPDATE sessoes SET expira_em=$1 WHERE token_hash=$2', [Date.now() - 1, resumo]);
  assert.equal((await fetch(endereco + '/api/estado', { headers: { Cookie: cookie } })).status, 401);
});

test('recorte P3: um perfil reservado ao P4 não recebe sessão mesmo com senha correta', async () => {
  await banco.query("INSERT INTO usuarios SELECT 'US-P4','gestor@fluxsus.demo','Gestor sintético','gestor',NULL,sal,senha_hash FROM usuarios WHERE id='US-002'");
  const cliente = criarCliente();
  assert.equal((await cliente('/api/entrar', 'POST', { email: 'gestor@fluxsus.demo', senha: '123456' })).codigo, 403);
  assert.equal((await banco.query("SELECT COUNT(*) FROM sessoes WHERE usuario_id='US-P4'")).rows[0].count, '0');
});

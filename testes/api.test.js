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

test('RF004/RNF005: profissional cria jornada planejada e outro cliente lê exatamente os dados salvos', async () => {
  const jornada = await criar();
  assert.equal(jornada.situacao, 'Planejada');
  assert.equal(jornada.stages[0].status, 'Aguardando');
  const vistaPaciente = (await estado(paciente)).journeys.find((item) => item.id === jornada.id);
  assert.deepEqual(vistaPaciente, jornada);
  assert.equal((await estado(outroPaciente, 'PAC-002')).journeys.length, 0);
});

test('RN01: rejeita ciclos e dependências inválidas sem criar jornada nem histórico', async () => {
  const antes = await banco.query('SELECT COUNT(*) FROM jornadas');
  const resposta = await profissional('/api/jornadas', 'POST', { pacienteId: 'PAC-001', titulo: 'Ciclo', objetivo: 'Verificar ciclos', tipo: 'Teste', unidade: 'Hospital Universitário', inicio: '2026-11-21', etapas: [
    { nome: 'A', responsavel: 'Equipe', preRequisitos: [1] }, { nome: 'B', responsavel: 'Equipe', preRequisitos: [0] }
  ] });
  assert.equal(resposta.codigo, 422);
  assert.equal((await banco.query('SELECT COUNT(*) FROM jornadas')).rows[0].count, antes.rows[0].count);
});

test('RNF005: atualização inválida desfaz pendência, histórico e versão na mesma transação', async () => {
  const jornada = await criar();
  const antes = await banco.query('SELECT COUNT(*) FROM historico');
  const resposta = await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`, 'PUT', dadosEtapa(jornada, 'Concluído', { pendencia: { motivo: 'Falta documento', acao: 'Conferir', responsavel: 'Paciente' } }));
  assert.equal(resposta.codigo, 422);
  const depois = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.equal(depois.versao, jornada.versao);
  assert.deepEqual(depois.stages[0].pending, []);
  assert.equal((await banco.query('SELECT COUNT(*) FROM historico')).rows[0].count, antes.rows[0].count);
});

test('RNF005: duas edições simultâneas geram um sucesso e um conflito HTTP 409', async () => {
  const jornada = await criar();
  const caminho = `/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`;
  const respostas = await Promise.all([profissional(caminho, 'PUT', dadosEtapa(jornada, 'Em andamento')), profissional(caminho, 'PUT', dadosEtapa(jornada, 'Agendado'))]);
  assert.deepEqual(respostas.map((resposta) => resposta.codigo).sort(), [200, 409]);
  assert.equal((await banco.query('SELECT COUNT(*) FROM historico WHERE jornada_id=$1', [jornada.id])).rows[0].count, '2');
});

test('RN01/RF002: bloqueio em A preserva B disponível; consulta depende dos dois', async () => {
  let jornada = await criar([
    { nome: 'A', responsavel: 'Equipe', preRequisitos: [] },
    { nome: 'B', responsavel: 'Equipe', preRequisitos: [] },
    { nome: 'Consulta', responsavel: 'Equipe', preRequisitos: [0, 1] }
  ]);
  const resposta = await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`, 'PUT', dadosEtapa(jornada, 'Pendente', { pendencia: { motivo: 'Documento ilegível', acao: 'Reenviar', responsavel: 'Secretariado', bloqueante: true } }));
  assert.equal(resposta.codigo, 200);
  jornada = (await estado(paciente)).journeys.find((item) => item.id === jornada.id);
  assert.deepEqual(modelo.availableStages(jornada).map((etapa) => etapa.title), ['B']);
  assert.equal(modelo.nextStep(jornada).title, 'B');
  assert.equal((await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[2].id}`, 'PUT', dadosEtapa(jornada))).codigo, 422);
});

test('RF012: só profissional altera situação; conclusão exige etapas prontas; reabrir preserva progresso', async () => {
  let jornada = await criar();
  const caminho = `/api/jornadas/${jornada.id}/situacao`;
  assert.equal((await paciente(caminho, 'POST', { versao: jornada.versao, acao: 'reabrir', motivo: 'Teste' })).codigo, 403);
  assert.equal((await profissional(caminho, 'POST', { versao: jornada.versao, acao: 'concluir', motivo: 'Teste' })).codigo, 409);
  assert.equal((await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`, 'PUT', dadosEtapa(jornada, 'Em andamento'))).codigo, 200);
  jornada = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.equal((await profissional(caminho, 'POST', { versao: jornada.versao, acao: 'suspender', motivo: 'Aguardar avaliação' })).codigo, 200);
  jornada = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.equal((await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`, 'PUT', dadosEtapa(jornada))).codigo, 409);
  assert.equal((await profissional(caminho, 'POST', { versao: jornada.versao, acao: 'reabrir', motivo: 'Retomar' })).codigo, 200);
  jornada = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.equal((await profissional(`/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`, 'PUT', dadosEtapa(jornada))).codigo, 200);
  jornada = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.equal((await profissional(caminho, 'POST', { versao: jornada.versao, acao: 'concluir', motivo: 'Etapas finalizadas' })).codigo, 200);
  jornada = (await estado()).journeys.find((item) => item.id === jornada.id);
  const etapas = structuredClone(jornada.stages);
  assert.equal((await profissional(caminho, 'POST', { versao: jornada.versao, acao: 'reabrir', motivo: 'Reavaliar acompanhamento' })).codigo, 200);
  jornada = (await estado(paciente)).journeys.find((item) => item.id === jornada.id);
  assert.equal(jornada.situacao, 'Ativa'); assert.deepEqual(jornada.stages, etapas);
  assert.equal(modelo.progress(jornada).percent, 100);
});

test('segurança: recusa mutação de outra origem e não serve arquivos do servidor', async () => {
  const resposta = await profissional('/api/jornadas', 'POST', {}, { Origin: 'https://outro-site.example' });
  assert.equal(resposta.codigo, 403);
  const arquivo = await fetch(endereco + '/servidor/esquema.sql');
  assert.equal(arquivo.status, 404);
});

test('RF008: busca o paciente por nome, CNS e identificador', async () => {
  for (const busca of ['Maria', 'PAC-001', (await estado()).patient.cns]) {
    const resposta = await profissional('/api/pacientes?busca=' + encodeURIComponent(busca));
    assert.equal(resposta.codigo, 200);
    assert.ok(resposta.conteudo.some((cadastro) => cadastro.id === 'PAC-001'));
  }
  assert.deepEqual((await profissional('/api/pacientes?busca=NAO-EXISTE-TESTE')).conteudo, []);
});

test('RF010/RF011: paciente vê motivo, ação, responsável, resolução e próximo passo salvos pela equipe', async () => {
  let jornada = await criar([
    { nome: 'Exame inicial', responsavel: 'Equipe hospitalar' },
    { nome: 'Consulta de retorno', responsavel: 'Especialista' }
  ]);
  const caminho = `/api/jornadas/${jornada.id}/etapas/${jornada.stages[0].id}`;
  const pendencia = { motivo: 'Documento ilegível', acao: 'Apresentar uma cópia legível', responsavel: 'Paciente', prazo: '2026-12-01', bloqueante: true };
  assert.equal((await profissional(caminho, 'PUT', dadosEtapa(jornada, 'Pendente', { pendencia }))).codigo, 200);
  let visao = await estado(paciente);
  jornada = visao.journeys.find((item) => item.id === jornada.id);
  const registro = jornada.stages[0].pending[0];
  assert.equal(registro.reason, pendencia.motivo);
  assert.equal(registro.action, pendencia.acao);
  assert.equal(registro.owner, pendencia.responsavel);
  assert.equal(registro.dueDate, pendencia.prazo);
  assert.equal(modelo.nextStep(jornada).kind, 'pending');
  assert.deepEqual(jornada, (await estado()).journeys.find((item) => item.id === jornada.id));
  const evento = visao.events.find((item) => item.journeyId === jornada.id && item.title === 'Pendência registrada');
  assert.equal(evento.actorId, 'US-002');
  assert.ok(Date.parse(evento.at));
  assert.equal(evento.after.pending[0].reason, pendencia.motivo);
  assert.equal((await profissional(caminho, 'PUT', dadosEtapa(jornada, 'Concluído', { resolverPendencia: true }))).codigo, 200);
  visao = await estado(paciente);
  jornada = visao.journeys.find((item) => item.id === jornada.id);
  assert.equal(jornada.stages[0].pending[0].status, 'Resolvida');
  assert.ok(jornada.stages[0].pending[0].resolvedAt);
  assert.equal(modelo.progress(jornada).percent, 50);
  assert.equal(modelo.nextStep(jornada).title, 'Consulta de retorno');
});

test('RF013: encaminhamentos ficam restritos ao Secretariado e outras operações seguem fora do P3', async () => {
  for (const [caminho, metodo] of [
    ['/api/indicadores', 'GET'], ['/api/resultados', 'POST'],
    ['/api/avisos/inexistente/ler', 'POST'],
    ['/api/jornadas/inexistente/etapas/inexistente/reuso', 'POST']
  ]) assert.equal((await profissional(caminho, metodo, metodo === 'GET' ? undefined : {})).codigo, 404);
  for (const [caminho, metodo] of [
    ['/api/encaminhamentos', 'GET'], ['/api/encaminhamentos', 'POST'],
    ['/api/encaminhamentos/opcoes', 'GET']
  ]) assert.equal((await profissional(caminho, metodo, metodo === 'GET' ? undefined : {})).codigo, 403);
  const tabelas = await banco.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename', [esquema]);
  assert.deepEqual(tabelas.rows.map((linha) => linha.tablename), ['encaminhamentos', 'etapas', 'historico', 'jornadas', 'pacientes', 'sessoes', 'usuarios']);
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

test('persistência: jornadas e sessões continuam disponíveis após reiniciar a API e suas conexões', async () => {
  const jornada = await criar();
  await new Promise((resolver) => servidor.close(resolver));
  await banco.end();
  banco = criarConexao(process.env.TEST_DATABASE_URL, { options: `-c search_path=${esquema}` });
  servidor = criarAplicacao(banco).listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  endereco = 'http://127.0.0.1:' + servidor.address().port;
  const recuperada = (await estado()).journeys.find((item) => item.id === jornada.id);
  assert.deepEqual(recuperada, jornada);
});

test('RF007: limita tentativas de login concorrentes e aceita acesso válido após falhas', async () => {
  const servidorIsolado = criarAplicacao(banco).listen(0, '127.0.0.1');
  await new Promise((resolver) => servidorIsolado.once('listening', resolver));
  const enderecoIsolado = `http://127.0.0.1:${servidorIsolado.address().port}`;

  async function entrarComSenha(senha) {
    const resposta = await fetch(`${enderecoIsolado}/api/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'paciente@fluxsus.demo', senha })
    });
    await resposta.arrayBuffer();
    return resposta.status;
  }

  try {
    assert.equal(await entrarComSenha('senha-incorreta'), 401);
    assert.equal(await entrarComSenha('senha-incorreta'), 401);
    assert.equal(await entrarComSenha('123456'), 200);

    const respostas = await Promise.all(Array.from({ length: 20 }, () => entrarComSenha('senha-incorreta')));
    assert.equal(respostas.filter((codigo) => codigo === 401).length, 15);
    assert.equal(respostas.filter((codigo) => codigo === 429).length, 5);
  } finally {
    await new Promise((resolver) => servidorIsolado.close(resolver));
  }
});

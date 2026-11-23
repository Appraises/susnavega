'use strict';

const express = require('express');
const { join } = require('node:path');
const { criarConexao, prepararBanco, transacao } = require('./banco.js');
const { entrar, sair, identificarUsuario, cookieSessao, usuarioParaTela } = require('./autenticacao.js');
const { exigir } = require('./validacao.js');
const { consultarEstado, buscarPacientes } = require('./consultas.js');
const { criarJornada, atualizarEtapa, alterarSituacao } = require('./jornadas.js');
const { listarEncaminhamentos, listarOpcoes, salvarEncaminhamento } = require('./encaminhamentos.js');

function criarAplicacao(banco, opcoes = {}) {
  const aplicacao = express();
  const tentativas = new Map();
  aplicacao.disable('x-powered-by');
  aplicacao.use((requisicao, resposta, proximo) => {
    resposta.set('X-Content-Type-Options', 'nosniff');
    resposta.set('Referrer-Policy', 'same-origin');
    resposta.set('X-Frame-Options', 'DENY');
    if (requisicao.path.startsWith('/api/')) resposta.set('Cache-Control', 'no-store');
    proximo();
  });
  aplicacao.get('/api/saude', async (requisicao, resposta) => {
    await banco.query('SELECT 1');
    resposta.json({ situacao: 'disponivel', banco: 'PostgreSQL' });
  });
  aplicacao.use('/api', (requisicao, resposta, proximo) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(requisicao.method)) {
      exigir(requisicao.is('application/json'), 'Envie os dados como JSON.', 415);
      const origem = requisicao.get('origin');
      exigir(!origem || origem === `${requisicao.protocol}://${requisicao.get('host')}`, 'Origem da requisição não permitida.', 403);
      exigir(requisicao.get('sec-fetch-site') !== 'cross-site', 'Origem da requisição não permitida.', 403);
    }
    proximo();
  });
  aplicacao.use(express.json({ limit: '100kb' }));
  aplicacao.post('/api/entrar', async (requisicao, resposta) => {
    const chave = requisicao.ip;
    const agora = Date.now();
    for (const [endereco, tentativa] of tentativas) if (tentativa.ate < agora) tentativas.delete(endereco);
    const tentativa = tentativas.get(chave) || { quantidade: 0, ate: agora + 15 * 60 * 1000 };
    exigir(tentativa.quantidade < 15, 'Muitas tentativas. Aguarde 15 minutos.', 429);
    tentativa.quantidade += 1;
    tentativas.set(chave, tentativa);
    const acesso = await entrar(banco, requisicao.body || {});
    tentativas.delete(chave);
    resposta.set('Set-Cookie', cookieSessao(acesso.token, opcoes.cookieSeguro));
    resposta.json({ usuario: usuarioParaTela(acesso.usuario) });
  });
  aplicacao.use('/api', async (requisicao, resposta, proximo) => {
    requisicao.usuario = await identificarUsuario(banco, requisicao);
    proximo();
  });
  aplicacao.get('/api/sessao', (requisicao, resposta) => resposta.json({ usuario: usuarioParaTela(requisicao.usuario) }));
  aplicacao.post('/api/sair', async (requisicao, resposta) => {
    await sair(banco, requisicao);
    resposta.set('Set-Cookie', cookieSessao('', opcoes.cookieSeguro)).json({ mensagem: 'Sessão encerrada.' });
  });
  aplicacao.get('/api/pacientes', async (requisicao, resposta) => resposta.json(await buscarPacientes(banco, requisicao.usuario, requisicao.query.busca)));
  aplicacao.get('/api/estado', async (requisicao, resposta) => {
    const estado = await transacao(banco, async (conexao) => {
      await conexao.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return consultarEstado(conexao, requisicao.usuario, requisicao.query.paciente);
    });
    resposta.json(estado);
  });
  aplicacao.get('/api/encaminhamentos/opcoes', async (requisicao, resposta) => {
    resposta.json({ opcoes: await listarOpcoes(banco, requisicao.usuario) });
  });
  aplicacao.get('/api/encaminhamentos', async (requisicao, resposta) => {
    resposta.json({ encaminhamentos: await listarEncaminhamentos(banco, requisicao.usuario) });
  });
  aplicacao.post('/api/encaminhamentos', async (requisicao, resposta) => {
    const resultado = await transacao(banco, (conexao) => salvarEncaminhamento(conexao, requisicao.usuario, requisicao.body || {}));
    resposta.status(201).json(resultado);
  });
  aplicacao.put('/api/encaminhamentos/:id', async (requisicao, resposta) => {
    const resultado = await transacao(banco, (conexao) => salvarEncaminhamento(conexao, requisicao.usuario, requisicao.body || {}, requisicao.params.id));
    resposta.json(resultado);
  });
  aplicacao.post('/api/jornadas', async (requisicao, resposta) => {
    const id = await transacao(banco, (conexao) => criarJornada(conexao, requisicao.usuario, requisicao.body || {}));
    resposta.status(201).json({ id });
  });
  aplicacao.put('/api/jornadas/:jornada/etapas/:etapa', async (requisicao, resposta) => {
    const id = await transacao(banco, (conexao) => atualizarEtapa(conexao, requisicao.usuario, requisicao.params.jornada, requisicao.params.etapa, requisicao.body || {}));
    resposta.json({ id });
  });
  aplicacao.post('/api/jornadas/:jornada/situacao', async (requisicao, resposta) => {
    const id = await transacao(banco, (conexao) => alterarSituacao(conexao, requisicao.usuario, requisicao.params.jornada, requisicao.body || {}));
    resposta.json({ id });
  });
  aplicacao.use('/api', (requisicao, resposta) => resposta.status(404).json({ mensagem: 'Operação não encontrada.' }));
  aplicacao.use(express.static(join(__dirname, '../dist'), { dotfiles: 'deny', index: 'index.html' }));
  aplicacao.use((erro, requisicao, resposta, proximo) => {
    const codigo = erro.codigo || (erro.type === 'entity.too.large' ? 413 : erro.type === 'entity.parse.failed' ? 400 : 500);
    if (codigo === 500) console.error('Falha no servidor:', erro.message);
    resposta.status(codigo).json({ mensagem: codigo === 500 ? 'Não foi possível concluir a operação.' : erro.message });
  });
  return aplicacao;
}

async function iniciarServidor() {
  const banco = criarConexao();
  await prepararBanco(banco);
  const aplicacao = criarAplicacao(banco, { cookieSeguro: process.env.COOKIE_SEGURO === 'true' });
  const porta = Number(process.env.PORTA || 4175);
  const endereco = process.env.ENDERECO || '127.0.0.1';
  const servidor = aplicacao.listen(porta, endereco, () => console.log(`FLUXSUS disponível em http://${endereco}:${porta}`));
  servidor.on('error', async (erro) => { console.error('Não foi possível abrir a porta:', erro.message); await banco.end(); process.exitCode = 1; });
  for (const sinal of ['SIGINT', 'SIGTERM']) process.once(sinal, () => servidor.close(async () => { await banco.end(); }));
}

if (require.main === module) iniciarServidor().catch((erro) => { console.error('Falha ao iniciar:', erro.message); process.exitCode = 1; });
module.exports = { criarAplicacao };

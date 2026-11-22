'use strict';

const express = require('express');
const { join } = require('node:path');
const { criarConexao, prepararBanco, transacao } = require('./banco.js');
const { exigir } = require('./validacao.js');

function criarAplicacao(banco, opcoes = {}) {
  const aplicacao = express();
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

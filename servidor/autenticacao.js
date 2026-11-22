'use strict';

const { randomBytes, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { exigir, texto, permitir } = require('./validacao.js');
const calcularSenha = promisify(scrypt);
const DURACAO_SESSAO = 8 * 60 * 60;

function resumirToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function entrar(banco, dados) {
  const email = texto(dados.email, 'usuário', true, 150).toLowerCase();
  const senha = texto(dados.senha, 'senha', true, 200);
  const consulta = await banco.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const usuario = consulta.rows[0];
  const resumo = await calcularSenha(senha, usuario?.sal || 'usuario-inexistente', 64);
  exigir(usuario && timingSafeEqual(resumo, Buffer.from(usuario.senha_hash, 'hex')), 'Confira o usuário e a senha.', 401);
  permitir(usuario, 'paciente', 'profissional');
  const token = randomBytes(32).toString('hex');
  await banco.query('DELETE FROM sessoes WHERE expira_em <= $1', [Date.now()]);
  await banco.query('INSERT INTO sessoes VALUES ($1,$2,$3)', [resumirToken(token), usuario.id, Date.now() + DURACAO_SESSAO * 1000]);
  return { token, usuario };
}

function lerToken(requisicao) {
  return (requisicao.headers.cookie || '').split(';').map((parte) => parte.trim()).find((parte) => parte.startsWith('fluxsus_p3_sessao='))?.slice('fluxsus_p3_sessao='.length) || '';
}

async function identificarUsuario(banco, requisicao) {
  const token = lerToken(requisicao);
  const consulta = token && await banco.query('SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = $1 AND s.expira_em > $2', [resumirToken(token), Date.now()]);
  const usuario = consulta?.rows?.[0];
  exigir(usuario, 'Entre para acessar o sistema.', 401);
  return usuario;
}

async function sair(banco, requisicao) {
  await banco.query('DELETE FROM sessoes WHERE token_hash = $1', [resumirToken(lerToken(requisicao))]);
}

function cookieSessao(token, seguro = false) {
  return `fluxsus_p3_sessao=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? DURACAO_SESSAO : 0}${seguro ? '; Secure' : ''}`;
}

function usuarioParaTela(usuario) {
  const perfis = { paciente: 'patient', profissional: 'professional', secretariado: 'secretariat', gestor: 'manager' };
  const rotulos = { paciente: 'Paciente', profissional: 'Profissional de Saúde', secretariado: 'Secretariado', gestor: 'Gestão hospitalar' };
  return { id: usuario.id, role: perfis[usuario.perfil], name: usuario.nome, label: rotulos[usuario.perfil], initials: usuario.nome.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('') };
}

module.exports = { entrar, identificarUsuario, sair, cookieSessao, usuarioParaTela };

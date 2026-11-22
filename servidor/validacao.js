'use strict';

function exigir(condicao, mensagem, codigo = 422) {
  if (!condicao) {
    const erro = new Error(mensagem);
    erro.codigo = codigo;
    throw erro;
  }
}

function texto(valor, nome, obrigatorio = true, limite = 2000) {
  exigir(valor === undefined || valor === null || typeof valor === 'string', `${nome}: informe um texto.`);
  const conteudo = (valor || '').trim();
  exigir(!obrigatorio || conteudo.length > 0, `Preencha ${nome}.`);
  exigir(conteudo.length <= limite, `${nome}: use até ${limite} caracteres.`);
  return conteudo;
}

function dataValida(valor, obrigatoria = true) {
  if (!valor && !obrigatoria) return '';
  exigir(typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor), 'Informe uma data no formato AAAA-MM-DD.');
  const data = new Date(`${valor}T12:00:00Z`);
  exigir(!Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor, 'A data informada não existe.');
  return valor;
}

function permitir(usuario, ...perfis) {
  exigir(perfis.includes(usuario.perfil), 'Seu perfil não pode realizar esta operação.', 403);
}

module.exports = { exigir, texto, dataValida, permitir };

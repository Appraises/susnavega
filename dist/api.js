'use strict';

// A sessão fica em um cookie HttpOnly. O navegador não guarda cópia do banco.
async function requisitarApi(caminho, metodo = 'GET', dados) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: dados === undefined ? {} : { 'Content-Type': 'application/json' },
      body: dados === undefined ? undefined : JSON.stringify(dados)
    });
  } catch {
    throw new Error('Não foi possível acessar o servidor. Confira a conexão e tente novamente.');
  }
  const conteudo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(conteudo.mensagem || 'Não foi possível concluir a operação.');
    erro.codigo = resposta.status;
    throw erro;
  }
  return conteudo;
}

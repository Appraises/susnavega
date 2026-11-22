'use strict';

let atualizandoDados = false;
let salvandoAlteracao = false;

function estadoVazio() {
  return { patient: { id: '', name: '', shortName: '', cns: '', unit: '' }, journeys: [], events: [] };
}

async function carregarEstado(pacienteId) {
  const parametro = pacienteId || state.patient.id;
  state = await requisitarApi('/estado' + (parametro ? '?paciente=' + encodeURIComponent(parametro) : ''));
}

async function salvarAlteracao(caminho, metodo, dados) {
  if (salvandoAlteracao) throw new Error('Aguarde a gravação em andamento.');
  salvandoAlteracao = true;
  try {
    const resposta = await requisitarApi(caminho, metodo, dados);
    await carregarEstado();
    renderAll();
    return resposta;
  } catch (erro) {
    if (erro.codigo === 409) {
      await carregarEstado();
      closeModal(); closeSituationModal();
      renderAll();
    }
    if (erro.codigo === 401) { session = null; state = estadoVazio(); showLogin(); }
    throw erro;
  } finally {
    salvandoAlteracao = false;
  }
}

async function iniciarAplicacao() {
  showLogin();
  try {
    session = (await requisitarApi('/sessao')).usuario;
    await carregarEstado();
    applySession();
  } catch (erro) {
    session = null;
    if (erro.codigo !== 401) {
      document.querySelector('#auth-error').textContent = erro.message;
      document.querySelector('#auth-error').hidden = false;
    }
  }
}

async function atualizarDados() {
  const editando = document.querySelector('.modal-backdrop.open, dialog[open], #professional-create.active');
  if (!session || atualizandoDados || salvandoAlteracao || editando || document.hidden) return;
  atualizandoDados = true;
  try { await carregarEstado(); renderAll(); }
  catch (erro) { if (erro.codigo === 401) { session = null; showLogin(); } }
  finally { atualizandoDados = false; }
}

'use strict';

function escaparHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function lerDataLocal(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function dataPorExtenso(value) {
  const date = lerDataLocal(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'Ainda não definida';
}

function dataResumida(value) {
  const date = lerDataLocal(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date) : 'Sem data';
}

function dataDoEvento(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

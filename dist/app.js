'use strict';

const Model = window.FluxsusModel;
const screens = [...document.querySelectorAll('.screen')];
const menuButton = document.querySelector('.mobile-menu');
const modal = document.getElementById('update-modal');
const situationModal = document.getElementById('situation-modal');
const referralModal = document.getElementById('referral-modal');
const createForm = document.getElementById('create-journey-form');
const updateForm = document.getElementById('update-form');
const situationForm = document.getElementById('situation-form');
const referralForm = document.getElementById('referral-form');
const pendingToggle = document.getElementById('has-pending');
const pendingFields = document.getElementById('pending-fields');
const resolveToggle = document.getElementById('resolve-pending');
let toastTimer;
let focusBeforeModal;
let showCompleted = false;
const PATIENT_SCREENS = new Set(['patient-home', 'patient-journey']);
const PROFESSIONAL_SCREENS = new Set(['professional-search', 'professional-history', 'professional-create', 'professional-manage']);
const SECRETARIAT_SCREENS = new Set(['secretariat-referrals']);
let session = null;
let state = estadoVazio();
let versaoEdicao = null;
let referralEditId = null;

let patientJourneyId = state.journeys[0]?.id;
let professionalJourneyId = patientJourneyId;
let patientStageId = null;
let professionalStageId = null;

function findJourney(id) { return state.journeys.find((journey) => journey.id === id); }
function selectedJourney(id) { return findJourney(id) || state.journeys[0]; }

function progress(journey) {
  return Model.progress(journey);
}

function statusClass(status) {
  if (status === 'Agendado') return 'scheduled';
  if (status === 'Pendente' || status === 'Devolvido') return 'pending-status';
  if (status === 'Suspensa') return 'paused-status';
  if (status === 'Aguardando conclusão') return 'ready-status';
  if (['Aguardando', 'Planejada'].includes(status)) return 'waiting';
  return 'active-status';
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}"><i></i>${escaparHtml(status)}</span>`;
}

function journeySymbol(journey) {
  if (/cardio/i.test(journey.title)) return { glyph: '♥', css: 'cardio' };
  if (/oftal/i.test(journey.title)) return { glyph: '◉', css: 'eye' };
  return { glyph: '✚', css: 'generic' };
}

function showToast(title, message) {
  const toast = document.querySelector('.toast');
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function closeMenu() {
  document.body.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
}

function showLogin() {
  document.querySelector('#auth-screen').hidden = false;
  document.querySelector('.prototype-shell').hidden = true;
  closeMenu();
  document.querySelector('.toast').classList.remove('show');
}

function applySession() {
  if (!session) { showLogin(); return; }
  document.querySelector('#auth-screen').hidden = true;
  document.querySelector('.prototype-shell').hidden = false;
  const professional = session.role === 'professional';
  const secretariat = session.role === 'secretariat';
  document.querySelector('.patient-nav').classList.toggle('hidden', professional || secretariat);
  document.querySelector('.professional-nav').classList.toggle('hidden', !professional);
  document.querySelector('.secretariat-nav').classList.toggle('hidden', !secretariat);
  document.querySelector('.profile-name').textContent = session.name;
  document.querySelector('.profile-meta').textContent = session.label;
  document.querySelector('.header-profile .avatar').textContent = session.initials;
  document.querySelector('.session-role').textContent = professional ? 'Profissional' : secretariat ? 'Secretariado' : 'Paciente';
  showScreen(professional ? 'professional-search' : secretariat ? 'secretariat-referrals' : 'patient-home');
}

function showScreen(id) {
  if (!state.journeys.length && id === 'patient-journey') {
    id = 'patient-home';
    showToast('Nenhuma jornada', 'A equipe ainda não registrou uma jornada para você.');
  }
  if (!state.journeys.length && id === 'professional-manage') {
    id = 'professional-history';
    showToast('Nenhuma jornada', 'Crie uma jornada para este paciente antes de gerenciar etapas.');
  }
  const allowed = session?.role === 'professional' ? PROFESSIONAL_SCREENS
    : session?.role === 'patient' ? PATIENT_SCREENS
      : session?.role === 'secretariat' ? SECRETARIAT_SCREENS : null;
  if (!allowed?.has(id) || !document.getElementById(id)) return;
  renderAll();
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.screen === id));
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPatientHome() {
  document.querySelector('#patient-home h1').textContent = 'Olá, ' + (session?.role === 'patient' ? session.name.split(' ')[0] : state.patient.shortName.split(' ')[0]);
  const active = state.journeys.filter((journey) => Model.journeyStatus(journey) !== 'Concluída');
  const complete = state.journeys.filter((journey) => Model.journeyStatus(journey) === 'Concluída');
  const visible = showCompleted ? complete : active;
  const section = document.querySelector('#patient-home');
  section.querySelector('.section-heading h2').textContent = showCompleted ? 'Jornadas concluídas' : 'Jornadas em andamento';
  section.querySelector('.count-pill').textContent = `${visible.length} ${visible.length === 1 ? 'jornada' : 'jornadas'}`;
  section.querySelector('.journey-grid').innerHTML = visible.length ? visible.map((journey) => {
    const info = progress(journey);
    const next = Model.nextStep(journey);
    const symbol = journeySymbol(journey);
    return `<article class="journey-card featured" role="button" tabindex="0" data-screen="patient-journey" data-journey-id="${escaparHtml(journey.id)}" aria-label="Abrir ${escaparHtml(journey.title)}">
      <div class="card-top">${statusPill(Model.journeyStatus(journey))}<span class="card-code">${escaparHtml(journey.id)}</span></div>
      <div class="journey-symbol ${symbol.css}" aria-hidden="true">${symbol.glyph}</div>
      <h3>${escaparHtml(journey.title)}</h3><p>${escaparHtml(journey.unit)} · ${escaparHtml(journey.type)}</p>
      <div class="mini-progress"><span style="width:${info.percent}%"></span></div>
      <div class="card-progress-label"><span>${info.completed} de ${info.total} concluídas</span><strong>${escaparHtml(next.kind === 'complete' ? 'Concluída' : next.kind === 'paused' ? 'Jornada suspensa' : next.kind === 'awaiting-completion' ? 'Aguardando conclusão' : next.kind === 'pending' ? next.owner === 'Paciente' ? 'Ação necessária' : `Aguardando ${next.owner}` : `Próximo: ${next.title}`)}</strong></div>
      <footer><span>Atualizada ${escaparHtml(dataResumida(journey.updatedAt.slice(0, 10)))}</span><span class="card-link">Ver jornada →</span></footer>
    </article>`;
  }).join('') : '<p class="empty-state">Nenhuma jornada nesta categoria.</p>';

  const pendingJourney = active.find((journey) => Model.openPendings(journey).some((item) => item.owner === 'Paciente'));
  const target = pendingJourney || active.find((journey) => Model.openPendings(journey).length) || active[0];
  const attention = section.querySelector('.attention-card');
  const button = attention.querySelector('button');
  if (target) {
    const next = Model.nextStep(target);
    const hasPending = next.kind === 'pending';
    const patientAction = hasPending && next.owner === 'Paciente';
    attention.classList.toggle('is-calm', !hasPending);
    attention.querySelector('.attention-icon').textContent = hasPending ? '!' : '→';
    attention.querySelector('.eyebrow').textContent = patientAction ? 'PRECISA DA SUA ATENÇÃO' : hasPending ? 'PENDÊNCIA COM A EQUIPE' : ['paused', 'awaiting-completion'].includes(next.kind) ? 'SITUAÇÃO DA JORNADA' : 'PRÓXIMO PASSO';
    attention.querySelector('strong').textContent = hasPending ? patientAction ? next.title : `${next.owner}: ${next.title}` : next.kind === 'stage' ? `Próximo: ${next.title}` : next.title;
    attention.querySelector('.attention-meta').textContent = hasPending ? `Motivo: ${next.reason} · Responsável: ${next.owner}` : target.title;
    button.dataset.journeyId = target.id;
    button.textContent = hasPending ? 'Ver pendência →' : 'Ver jornada →';
    button.hidden = false;
  } else {
    attention.classList.add('is-calm');
    attention.querySelector('.attention-icon').textContent = '✓';
    attention.querySelector('.eyebrow').textContent = 'ACOMPANHAMENTO';
    attention.querySelector('strong').textContent = 'Nenhuma jornada em andamento.';
    attention.querySelector('.attention-meta').textContent = '';
    button.hidden = true;
  }

  const allPendings = state.journeys.reduce((count, journey) => count + Model.openPendings(journey).length, 0);
  section.querySelector('.insight-row strong').textContent = allPendings ? `${allPendings} ${allPendings === 1 ? 'pendência aberta' : 'pendências abertas'}` : 'Você está em dia';
  section.querySelector('.insight-row small').textContent = allPendings ? 'Confira motivo, ação e responsável em cada jornada.' : 'Nenhuma pendência registrada nas jornadas.';
  section.querySelector('.insight-icon').textContent = allPendings ? '!' : '✓';
  section.querySelector('.insight-icon').classList.toggle('has-pending', Boolean(allPendings));
  const concludedLink = section.querySelector('.insight-row a');
  concludedLink.hidden = !complete.length && !showCompleted;
  concludedLink.textContent = showCompleted ? 'Ver jornadas em andamento →' : 'Ver jornadas concluídas →';
}

function curvedPath(points, mobile = false) {
  if (!points.length) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const next = points[index];
    path += mobile
      ? ` C ${previous.x} ${previous.y + 85} ${next.x} ${next.y - 85} ${next.x} ${next.y}`
      : ` C ${previous.x + (next.x - previous.x) * .55} ${previous.y} ${next.x - (next.x - previous.x) * .55} ${next.y} ${next.x} ${next.y}`;
  }
  return path;
}

function renderPatientJourney() {
  const journey = selectedJourney(patientJourneyId);
  if (!journey) return;
  patientJourneyId = journey.id;
  const current = Model.currentIndex(journey);
  if (!journey.stages.some((stage) => stage.id === patientStageId)) patientStageId = journey.stages[Math.max(0, current)]?.id;
  const info = progress(journey);
  const screen = document.querySelector('#patient-journey');
  screen.querySelector('.journey-breadcrumb-title').textContent = journey.title;
  screen.querySelector('#patient-journey-title').textContent = journey.title;
  screen.querySelector('.journey-subtitle').textContent = `${journey.unit} · Iniciada em ${dataPorExtenso(journey.startDate)}`;
  screen.querySelector('.journey-heading .status-pill').outerHTML = statusPill(Model.journeyStatus(journey));
  screen.querySelector('.journey-code strong').textContent = journey.id;
  const situation = Model.journeyStatus(journey);
  screen.querySelector('.timeline-header h2').textContent = situation === 'Concluída' ? 'Jornada concluída' : current === -1 ? 'Todas as etapas concluídas' : `Você está na etapa ${info.position} de ${info.total}`;
  screen.querySelector('.journey-hint').textContent = `${info.completed} de ${info.total} etapas concluídas. Selecione uma etapa para ver os detalhes.`;
  screen.querySelector('.progress-ring').style.background = `conic-gradient(var(--teal-500) ${info.percent}%, #e6edef 0)`;
  screen.querySelector('.progress-ring span').textContent = `${info.percent}%`;
  screen.querySelector('.progress-ring').setAttribute('aria-label', `${info.completed} de ${info.total} etapas concluídas, ${info.percent} por cento`);
  const situationBanner = screen.querySelector('#patient-situation-banner');
  situationBanner.hidden = !['Suspensa', 'Concluída', 'Aguardando conclusão'].includes(situation);
  situationBanner.classList.toggle('is-complete', situation !== 'Suspensa');
  if (!situationBanner.hidden) situationBanner.innerHTML = situation === 'Suspensa'
    ? `<strong>Jornada suspensa pela equipe</strong>${escaparHtml(journey.situationReason || 'Aguarde a equipe de saúde informar a retomada.')}`
    : situation === 'Concluída' ? '<strong>Jornada concluída</strong>O acompanhamento desta jornada foi finalizado pela equipe.'
      : '<strong>Etapas concluídas</strong>A equipe ainda precisa confirmar formalmente a conclusão da jornada.';

  const count = journey.stages.length;
  const desktop = journey.stages.map((_, index) => ({ x: count === 1 ? 500 : 90 + index * 800 / (count - 1), y: index % 2 ? 150 : 104 }));
  const mobile = journey.stages.map((_, index) => ({ x: index % 2 ? 304 : 96, y: 80 + index * 180 }));
  const doneCount = info.completed;
  const canvas = screen.querySelector('.timeline-canvas');
  canvas.classList.add('dynamic-canvas');
  canvas.style.setProperty('--mobile-canvas-height', `${count * 180 + 40}px`);
  canvas.style.setProperty('--mobile-path-height', `${(count - 1) * 180 + 120}px`);
  canvas.innerHTML = `<svg class="journey-path desktop-path" viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true"><path class="path-shadow" d="${curvedPath(desktop)}"/><path class="path-done" d="${curvedPath(desktop.slice(0, doneCount))}"/></svg>
    <svg class="journey-path mobile-path" viewBox="0 0 400 ${(count - 1) * 180 + 120}" preserveAspectRatio="none" aria-hidden="true"><path class="path-shadow" d="${curvedPath(mobile, true)}"/><path class="path-done" d="${curvedPath(mobile.slice(0, doneCount), true)}"/></svg>
    ${journey.stages.map((stage, index) => {
      const pendingItem = (stage.pending || []).find((item) => item.status === 'Aberta');
      const pending = Boolean(pendingItem);
      const stateClass = stage.status === 'Concluído' ? 'done' : index === current ? 'current' : 'future';
      const label = index === current ? situation === 'Suspensa' ? 'JORNADA SUSPENSA' : 'ETAPA ATUAL' : stage.status === 'Concluído' ? dataResumida(stage.date).toUpperCase() : 'PRÓXIMA ETAPA';
      return `<button type="button" class="timeline-node dynamic-node ${stateClass} ${pending ? 'has-pending' : ''} ${stage.id === patientStageId ? 'selected' : ''}" data-stage-id="${escaparHtml(stage.id)}" style="--desktop-left:${desktop[index].x / 10 - 8}%;--desktop-top:${desktop[index].y - 26}px;--mobile-left:${index % 2 ? 54 : 2}%;--mobile-top:${48 + index * 180}px" ${index === current ? 'aria-current="step"' : ''}>
        ${index === current ? `<span class="current-callout">${situation === 'Suspensa' ? 'SUSPENSA' : pending ? pendingItem.owner === 'Paciente' ? 'AÇÃO NECESSÁRIA' : 'PENDÊNCIA DA EQUIPE' : 'VOCÊ ESTÁ AQUI'}</span><span class="pulse"></span>` : ''}
        <span class="node-dot">${stage.status === 'Concluído' ? '✓' : index + 1}</span>
        <span class="node-copy"><small>${escaparHtml(label)}</small><strong>${escaparHtml(stage.title)}</strong><em>${escaparHtml(pending ? `Pendência: ${pendingItem.owner}` : stage.status === 'Agendado' && stage.date ? `Agendado para ${dataResumida(stage.date)}` : stage.status)}</em></span>
      </button>`;
    }).join('')}`;
  renderPatientDetail(journey);
  renderEncaminhamentosDaJornada('#patient-referrals', journey.id);
}

function renderPatientDetail(journey) {
  const stage = journey.stages.find((item) => item.id === patientStageId) || journey.stages[0];
  if (!stage) return;
  const panel = document.querySelector('#patient-journey .detail-panel');
  panel.querySelector('.detail-top .status-pill').outerHTML = statusPill(stage.status);
  panel.querySelector('.detail-title').textContent = stage.title;
  panel.querySelector('.detail-summary').textContent = stage.summary || 'Etapa registrada pela equipe responsável.';
  const details = panel.querySelectorAll('.detail-list strong');
  details[0].textContent = dataPorExtenso(stage.date);
  details[1].textContent = stage.location || journey.unit;
  details[2].textContent = stage.owner;
  const pending = (stage.pending || []).find((item) => item.status === 'Aberta');
  const box = panel.querySelector('.pending-box');
  box.classList.toggle('neutral', !pending);
  box.innerHTML = pending
    ? `<div class="pending-title"><span>!</span><strong>Pendência aberta</strong></div><dl><div><dt>Motivo</dt><dd>${escaparHtml(pending.reason)}</dd></div><div><dt>Ação necessária</dt><dd>${escaparHtml(pending.action)}</dd></div><div><dt>Responsável</dt><dd>${escaparHtml(pending.owner)}</dd></div>${pending.dueDate ? `<div><dt>Prazo</dt><dd>${escaparHtml(dataPorExtenso(pending.dueDate))}</dd></div>` : ''}</dl>`
    : `<div class="pending-title"><span>✓</span><strong>Sem pendência aberta</strong></div><p>${escaparHtml(stage.observation || stage.note || 'Nenhuma ação adicional registrada para esta etapa.')}</p>`;
  panel.querySelector('footer').textContent = `Última atualização: ${dataDoEvento(journey.updatedAt)} · Dados simulados`;
}

function encaminhamentosDaJornada(jornadaId) {
  return (state.referrals || []).filter((item) => item.journey === jornadaId);
}

function classeSituacaoEncaminhamento(situacao) {
  if (situacao === 'Devolvido') return 'returned';
  if (situacao === 'Realizado') return 'complete';
  return statusClass(situacao);
}

function textoDataEncaminhamento(data) {
  return data ? dataPorExtenso(data) : 'Não informada';
}

function cartaoEncaminhamento(encaminhamento, administrativo = false) {
  const atualizadoEm = encaminhamento.updatedAt ? dataDoEvento(encaminhamento.updatedAt) : 'Não informado';
  const transicoes = {
    Solicitado: ['Aguardando agendamento', 'Devolvido'],
    'Aguardando agendamento': ['Agendado', 'Devolvido'],
    Agendado: ['Realizado', 'Devolvido'],
    Devolvido: ['Solicitado'],
    Realizado: []
  };
  const podeAtualizar = administrativo && transicoes[encaminhamento.status]?.length;
  return `<article class="referral-card">
    <div>
      <div class="referral-card-top"><span class="referral-code">${escaparHtml(encaminhamento.id)}</span><span class="status-pill ${classeSituacaoEncaminhamento(encaminhamento.status)}"><i></i>${escaparHtml(encaminhamento.status)}</span></div>
      <h3>${escaparHtml(encaminhamento.journeyTitle || 'Jornada de cuidado')}</h3>
      <p class="referral-patient">${escaparHtml(encaminhamento.patient || 'Paciente')} · ${escaparHtml(encaminhamento.stage || 'Etapa')}</p>
    </div>
    ${podeAtualizar ? `<button class="referral-update" type="button" data-update-referral="${escaparHtml(encaminhamento.id)}">Atualizar situação</button>` : ''}
    <div class="referral-details">
      <div><small>Destino</small><strong>${escaparHtml(encaminhamento.destination || 'Não informado')}</strong></div>
      <div><small>Data prevista</small><strong>${escaparHtml(textoDataEncaminhamento(encaminhamento.date))}</strong></div>
      <div><small>Atualizado por</small><strong>${escaparHtml(encaminhamento.updatedBy || 'Não informado')}</strong></div>
      <div><small>Atualizado em</small><strong>${escaparHtml(atualizadoEm)}</strong></div>
      ${encaminhamento.reason ? `<p class="referral-reason"><strong>Motivo da devolução:</strong> ${escaparHtml(encaminhamento.reason)}</p>` : ''}
      ${encaminhamento.owner ? `<div><small>Responsável pela pendência</small><strong>${escaparHtml(encaminhamento.owner)}</strong></div>` : ''}
      ${encaminhamento.nextAction ? `<div class="referral-next-action"><small>Próxima ação</small><strong>${escaparHtml(encaminhamento.nextAction)}</strong></div>` : ''}
    </div>
  </article>`;
}

function renderEncaminhamentosDaJornada(elemento, jornadaId) {
  const secao = document.querySelector(elemento);
  const lista = secao.querySelector('[data-journey-referrals]');
  const encaminhamentos = encaminhamentosDaJornada(jornadaId);
  secao.hidden = encaminhamentos.length === 0;
  lista.innerHTML = encaminhamentos.length
    ? encaminhamentos.map((item) => cartaoEncaminhamento(item)).join('')
    : '';
}

function renderSecretariat() {
  const encaminhamentos = state.referrals || [];
  document.querySelector('#referral-count-active').textContent = String(encaminhamentos.filter((item) => !['Realizado', 'Devolvido'].includes(item.status)).length);
  document.querySelector('#referral-count-scheduled').textContent = String(encaminhamentos.filter((item) => item.status === 'Agendado').length);
  document.querySelector('#referral-count-returned').textContent = String(encaminhamentos.filter((item) => item.status === 'Devolvido').length);
  document.querySelector('#referral-list').innerHTML = encaminhamentos.length
    ? encaminhamentos.map((item) => cartaoEncaminhamento(item, true)).join('')
    : '<p class="referral-empty">Nenhum encaminhamento registrado ainda. Use “Novo encaminhamento” para iniciar o fluxo.</p>';
  document.querySelector('#new-referral-button').disabled = !(state.referralOptions || []).length;
  document.querySelector('#new-referral-button').title = state.referralOptions?.length ? '' : 'Não há etapas abertas disponíveis para encaminhar.';
}

async function renderSearch() {
  if (session?.role !== 'professional') return;
  try {
    const busca = document.querySelector('#patient-search').value;
    const pacientes = await requisitarApi('/pacientes?busca=' + encodeURIComponent(busca));
    if (document.querySelector('#patient-search').value !== busca) return;
    document.querySelector('.results-wrap h2').textContent = pacientes.length + (pacientes.length === 1 ? ' paciente encontrado' : ' pacientes encontrados');
    document.querySelectorAll('.results-wrap .patient-result').forEach((item) => item.remove());
    document.querySelector('.results-wrap').insertAdjacentHTML('beforeend', pacientes.map((paciente) => `<button type="button" class="patient-result" data-escolher-paciente="${escaparHtml(paciente.id)}"><span class="avatar">${escaparHtml(paciente.shortName[0])}</span><span><strong>${escaparHtml(paciente.name)}</strong><small>CNS sintético: ${escaparHtml(paciente.cns)}</small></span><span>Consultar →</span></button>`).join(''));
  } catch (erro) { showToast('Busca indisponível', erro.message); }
}

function renderProfessionalHistory() {
  document.querySelector('#professional-history-title').textContent = state.patient.name;
  document.querySelector('#professional-history .breadcrumb span:last-child').textContent = state.patient.name;
  document.querySelector('#professional-history .patient-header p').textContent = 'CNS sintético · ' + state.patient.cns;
  document.querySelector('#professional-history .avatar').textContent = state.patient.shortName.split(' ').slice(0, 2).map((parte) => parte[0]).join('');
  const active = state.journeys.filter((journey) => Model.journeyStatus(journey) !== 'Concluída').length;
  const pending = state.journeys.reduce((count, journey) => count + Model.openPendings(journey).length, 0);
  const stats = document.querySelectorAll('.stat-strip strong');
  stats[0].textContent = String(active);
  stats[1].textContent = String(pending);
  stats[2].textContent = state.events[0] ? dataDoEvento(state.events[0].at) : '—';
  stats[3].textContent = state.patient.unit;
  document.querySelector('#professional-journeys').innerHTML = state.journeys.map((journey) => {
    const info = progress(journey);
    const stage = journey.stages[Model.currentIndex(journey) === -1 ? journey.stages.length - 1 : Model.currentIndex(journey)];
    const situation = Model.journeyStatus(journey);
    const symbol = journeySymbol(journey);
    return `<article class="professional-journey-card" role="button" tabindex="0" data-screen="professional-manage" data-journey-id="${escaparHtml(journey.id)}" aria-label="Gerenciar ${escaparHtml(journey.title)}">
      <div class="pj-icon ${symbol.css === 'eye' ? 'alt' : ''}">${symbol.glyph}</div><div class="pj-main"><div>${statusPill(situation)}<small>${escaparHtml(journey.id)}</small></div>
      <h3>${escaparHtml(journey.title)}</h3><p>${escaparHtml(situation === 'Concluída' ? 'Jornada concluída' : situation === 'Aguardando conclusão' ? 'Etapas concluídas · confirmação pendente' : situation === 'Suspensa' ? `Suspensa · etapa ${info.position} de ${info.total}` : `Etapa atual: ${stage.title} · ${info.position} de ${info.total} etapas`)} · ${info.completed} concluídas</p><div class="mini-progress"><span style="width:${info.percent}%"></span></div></div><span class="result-arrow">→</span>
    </article>`;
  }).join('');
  const activity = document.querySelector('.activity-card');
  activity.querySelectorAll('.activity-item').forEach((item) => item.remove());
  activity.insertAdjacentHTML('beforeend', state.events.slice(0, 4).map((item) => `<div class="activity-item"><span></span><div><strong>${escaparHtml(item.title)}</strong><small>${escaparHtml(dataDoEvento(item.at))} · ${escaparHtml(item.actor)}</small></div></div>`).join(''));
}

function renderProfessionalManage() {
  const journey = selectedJourney(professionalJourneyId);
  if (!journey) return;
  professionalJourneyId = journey.id;
  const current = Model.currentIndex(journey);
  if (!journey.stages.some((stage) => stage.id === professionalStageId)) professionalStageId = journey.stages[current === -1 ? journey.stages.length - 1 : current]?.id;
  const selected = journey.stages.find((stage) => stage.id === professionalStageId) || journey.stages[0];
  const screen = document.querySelector('#professional-manage');
  const situation = Model.journeyStatus(journey);
  screen.querySelector('.breadcrumb span:last-child').textContent = journey.id;
  screen.querySelector('.manage-heading .status-pill').outerHTML = statusPill(situation);
  screen.querySelector('#professional-manage-title').textContent = journey.title;
  screen.querySelector('.manage-heading p').textContent = `${state.patient.name} · ${journey.id}`;
  const info = progress(journey);
  screen.querySelector('.manage-timeline .count-pill').textContent = `${info.completed} de ${info.total} concluídas`;
  screen.querySelector('#open-situation-modal').disabled = journey.situacao === 'Planejada';
  screen.querySelector('#open-update-modal').disabled = ['Suspensa', 'Concluída'].includes(situation);
  screen.querySelector('#open-update-modal').title = ['Suspensa', 'Concluída'].includes(situation) ? 'Reabra a jornada antes de atualizar uma etapa.' : '';
  screen.querySelector('.linear-timeline').innerHTML = journey.stages.map((stage, index) => `<button type="button" class="linear-step ${stage.status === 'Concluído' ? 'done' : index === current ? 'current' : ''} ${stage.id === professionalStageId ? 'selected' : ''}" data-stage-id="${escaparHtml(stage.id)}"><span>${stage.status === 'Concluído' ? '✓' : index + 1}</span><div><small>${escaparHtml(stage.date ? dataResumida(stage.date).toUpperCase() : index === current ? 'ETAPA ATUAL' : 'SEM DATA')}</small><strong>${escaparHtml(stage.title)}</strong><p>${escaparHtml(stage.owner)}</p></div><em>${escaparHtml(stage.status)}</em></button>`).join('');
  const pending = (selected.pending || []).find((item) => item.status === 'Aberta');
  screen.querySelector('.manage-info h2').textContent = selected.title;
  const values = screen.querySelectorAll('.manage-info dd');
  values[0].textContent = selected.owner;
  values[1].textContent = dataPorExtenso(selected.date);
  values[2].innerHTML = statusPill(selected.status);
  const box = screen.querySelector('.open-pending');
  box.classList.toggle('neutral', !pending);
  box.innerHTML = pending
    ? `<div><span>!</span><strong>Pendência aberta</strong></div><dl><div><dt>Motivo</dt><dd>${escaparHtml(pending.reason)}</dd></div><div><dt>Ação</dt><dd>${escaparHtml(pending.action)}</dd></div><div><dt>Responsável</dt><dd>${escaparHtml(pending.owner)}</dd></div></dl>`
    : '<div><span>✓</span><strong>Sem pendência aberta</strong></div><p>Esta etapa não possui uma ação pendente.</p>';
  screen.querySelector('.situation-card h2').textContent = situation;
  const situationEvent = state.events.find((event) => event.journeyId === journey.id && event.type === 'journey-situation');
  screen.querySelector('.situation-history').innerHTML = situationEvent
    ? `<strong>Última alteração: ${escaparHtml(situationEvent.from)} → ${escaparHtml(situationEvent.to)}</strong><small>Motivo: ${escaparHtml(situationEvent.reason)}</small><small>${escaparHtml(situationEvent.actor)} · ${escaparHtml(dataDoEvento(situationEvent.at))}</small>`
    : '<small>Nenhuma mudança de situação registrada nesta jornada.</small>';
  renderEncaminhamentosDaJornada('#professional-referrals', journey.id);
}

function renderCreateSummary() {
  document.querySelector('#professional-create .breadcrumb button').textContent = '← ' + state.patient.shortName;
  document.querySelector('#professional-create input[disabled]').value = state.patient.name;
  document.querySelector('.summary-patient strong').textContent = state.patient.shortName;
  document.querySelector('.summary-patient small').textContent = 'CNS sintético · ' + state.patient.cns;
  const values = document.querySelectorAll('.form-summary dd');
  values[0].textContent = document.querySelector('#journey-type').value || 'Não definido';
  values[1].textContent = `${document.querySelectorAll('.stage-row').length} definidas`;
  values[2].textContent = document.querySelector('#journey-unit').value;
}

function renderAll() {
  if (session?.role === 'secretariat') {
    renderSecretariat();
    return;
  }
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase();
  renderPatientHome();
  renderPatientJourney();
  renderSearch();
  renderProfessionalHistory();
  renderProfessionalManage();
  renderCreateSummary();
}

function renumberStages() {
  const rows = [...document.querySelectorAll('.stage-row')];
  rows.forEach((row, index) => {
    row.querySelector('span').textContent = String(index + 1);
    row.querySelector('.stage-name').setAttribute('aria-label', `Nome da etapa ${index + 1}`);
    row.querySelector('.stage-owner').setAttribute('aria-label', `Responsável pela etapa ${index + 1}`);
    row.querySelector('.move-stage').disabled = index === rows.length - 1;
  });
  renderCreateSummary();
}

function togglePendingFields() {
  pendingFields.classList.toggle('hidden', !pendingToggle.checked);
  document.querySelector('#pending-reason').required = pendingToggle.checked;
  document.querySelector('#pending-action').required = pendingToggle.checked;
  if (pendingToggle.checked) resolveToggle.checked = false;
}

function fillModalStage() {
  const journey = selectedJourney(professionalJourneyId);
  const stage = journey?.stages.find((item) => item.id === professionalStageId);
  if (!stage) return;
  document.querySelector('#modal-title').textContent = stage.title;
  document.querySelector('#update-stage').value = stage.id;
  document.querySelector('#stage-status').value = stage.status;
  document.querySelector('#update-date').value = Model.localDate(new Date());
  document.querySelector('#stage-date').value = stage.date || '';
  document.querySelector('#update-owner').value = stage.owner;
  document.querySelector('#update-observation').value = stage.observation || '';
  const pending = (stage.pending || []).find((item) => item.status === 'Aberta');
  pendingToggle.checked = false;
  resolveToggle.checked = false;
  document.querySelector('#resolve-pending-row').classList.toggle('hidden', !pending);
  document.querySelector('#pending-reason').value = pending?.reason || '';
  document.querySelector('#pending-action').value = pending?.action || '';
  document.querySelector('#pending-owner').value = pending?.owner || 'Paciente';
  document.querySelector('#pending-blocking').checked = pending?.blocking !== false;
  document.querySelector('#pending-due').value = pending?.dueDate || '';
  togglePendingFields();
}

function openModal() {
  versaoEdicao = selectedJourney(professionalJourneyId)?.versao;
  if (session?.role !== 'professional') return;
  const journey = selectedJourney(professionalJourneyId);
  if (!journey) return;
  if (['Suspensa', 'Concluída'].includes(Model.journeyStatus(journey))) {
    showToast('Jornada indisponível', 'Reabra a jornada antes de atualizar uma etapa.');
    return;
  }
  focusBeforeModal = document.activeElement;
  document.querySelector('#update-stage').innerHTML = journey.stages.map((stage) => `<option value="${escaparHtml(stage.id)}">${escaparHtml(stage.title)}</option>`).join('');
  fillModalStage();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.querySelector('#update-stage').focus();
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  focusBeforeModal?.focus();
}

function situationOptions(journey) {
  const status = Model.journeyStatus(journey);
  if (status === 'Aguardando conclusão') return [{ value: 'complete', label: 'Concluir jornada' }];
  if (['Suspensa', 'Concluída'].includes(status)) return [{ value: 'reopen', label: 'Reabrir jornada' }];
  return journey.situacao === 'Planejada' ? [] : [{ value: 'suspend', label: 'Suspender jornada' }];
}

function updateSituationRule() {
  const journey = selectedJourney(professionalJourneyId);
  const action = document.querySelector('#situation-action').value;
  const from = Model.journeyStatus(journey);
  const text = action === 'complete'
    ? 'A conclusão só é permitida após todas as etapas serem concluídas e todas as pendências resolvidas.'
    : action === 'reopen' && from === 'Concluída'
      ? 'Ao reabrir, a jornada volta a Ativa. As etapas concluídas e o progresso são preservados.'
      : action === 'reopen' ? 'A jornada volta a “Em andamento”; as etapas mantêm seus registros.'
        : 'A jornada ficará suspensa. Etapas não poderão ser atualizadas até a reabertura.';
  situationModal.querySelector('.situation-rule').textContent = `${text} Somente o profissional pode alterar a situação da jornada, com motivo registrado.`;
}

function openSituationModal() {
  versaoEdicao = selectedJourney(professionalJourneyId)?.versao;
  if (session?.role !== 'professional') return;
  const journey = selectedJourney(professionalJourneyId);
  if (!journey) return;
  focusBeforeModal = document.activeElement;
  situationModal.querySelector('.situation-current strong').textContent = Model.journeyStatus(journey);
  document.querySelector('#situation-action').innerHTML = situationOptions(journey)
    .map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
  document.querySelector('#situation-reason').value = '';
  situationModal.querySelector('.situation-audit').textContent = `Registro em nome de ${session.name}, com data e horário da confirmação.`;
  updateSituationRule();
  situationModal.classList.add('open');
  situationModal.setAttribute('aria-hidden', 'false');
  document.querySelector('#situation-action').focus();
}

function closeSituationModal() {
  situationModal.classList.remove('open');
  situationModal.setAttribute('aria-hidden', 'true');
  focusBeforeModal?.focus();
}

function mostrarMotivoDevolucao() {
  const precisaMotivo = document.querySelector('#referral-status').value === 'Devolvido';
  const campo = document.querySelector('#referral-reason-wrap');
  campo.classList.toggle('hidden', !precisaMotivo);
  document.querySelector('#referral-reason').required = precisaMotivo;
}

function abrirModalEncaminhamentoNovo() {
  if (session?.role !== 'secretariat') return;
  const opcoes = state.referralOptions || [];
  if (!opcoes.length) {
    showToast('Nenhuma etapa disponível', 'As jornadas abertas não têm etapas pendentes de encaminhamento.');
    return;
  }
  referralEditId = null;
  focusBeforeModal = document.activeElement;
  referralForm.reset();
  document.querySelector('#referral-modal-title').textContent = 'Novo encaminhamento';
  document.querySelector('#referral-create-fields').classList.remove('hidden');
  document.querySelector('#referral-update-fields').classList.add('hidden');
  document.querySelector('#referral-option').required = true;
  document.querySelector('#referral-destination').required = true;
  document.querySelector('#referral-date').required = true;
  document.querySelector('#referral-status').required = false;
  document.querySelector('#referral-reason-wrap').classList.add('hidden');
  document.querySelector('#referral-reason').required = false;
  document.querySelector('#referral-reason').value = '';
  document.querySelector('#referral-option').innerHTML = opcoes.map((item, index) =>
    `<option value="${index}">${escaparHtml(item.patient)} · ${escaparHtml(item.journey)} · ${escaparHtml(item.stage)}</option>`
  ).join('');
  document.querySelector('#referral-submit').textContent = 'Registrar encaminhamento';
  referralModal.classList.add('open');
  referralModal.setAttribute('aria-hidden', 'false');
  document.querySelector('#referral-option').focus();
}

function abrirModalAtualizarEncaminhamento(id) {
  if (session?.role !== 'secretariat') return;
  const encaminhamento = (state.referrals || []).find((item) => item.id === id);
  const transicoes = {
    Solicitado: ['Aguardando agendamento', 'Devolvido'],
    'Aguardando agendamento': ['Agendado', 'Devolvido'],
    Agendado: ['Realizado', 'Devolvido'],
    Devolvido: ['Solicitado'],
    Realizado: []
  };
  const opcoes = transicoes[encaminhamento?.status] || [];
  if (!encaminhamento || !opcoes.length) return;
  referralEditId = encaminhamento.id;
  focusBeforeModal = document.activeElement;
  referralForm.reset();
  document.querySelector('#referral-modal-title').textContent = `Atualizar ${encaminhamento.id}`;
  document.querySelector('#referral-create-fields').classList.add('hidden');
  document.querySelector('#referral-update-fields').classList.remove('hidden');
  document.querySelector('#referral-option').required = false;
  document.querySelector('#referral-destination').required = false;
  document.querySelector('#referral-date').required = false;
  document.querySelector('#referral-status').required = true;
  document.querySelector('#referral-context').textContent = `${encaminhamento.patient} · ${encaminhamento.journeyTitle} · ${encaminhamento.stage} · situação atual: ${encaminhamento.status}`;
  document.querySelector('#referral-status').innerHTML = opcoes.map((situacao) => `<option value="${escaparHtml(situacao)}">${escaparHtml(situacao)}</option>`).join('');
  document.querySelector('#referral-reason').value = '';
  mostrarMotivoDevolucao();
  document.querySelector('#referral-submit').textContent = 'Salvar atualização';
  referralModal.classList.add('open');
  referralModal.setAttribute('aria-hidden', 'false');
  document.querySelector('#referral-status').focus();
}

function closeReferralModal() {
  referralModal.classList.remove('open');
  referralModal.setAttribute('aria-hidden', 'true');
  referralEditId = null;
  focusBeforeModal?.focus();
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('#new-referral-button')) { abrirModalEncaminhamentoNovo(); return; }
  const botaoAtualizarEncaminhamento = event.target.closest('[data-update-referral]');
  if (botaoAtualizarEncaminhamento) { abrirModalAtualizarEncaminhamento(botaoAtualizarEncaminhamento.dataset.updateReferral); return; }
  const pacienteEscolhido = event.target.closest('[data-escolher-paciente]');
  if (pacienteEscolhido) {
    try {
      await carregarEstado(pacienteEscolhido.dataset.escolherPaciente);
      patientJourneyId = state.journeys[0]?.id; professionalJourneyId = patientJourneyId;
      showScreen('professional-history');
    } catch (erro) { showToast('Não foi possível consultar', erro.message); }
    return;
  }
  const destination = event.target.closest('[data-screen]');
  if (destination) {
    if (destination.dataset.journeyId) {
      if (destination.dataset.screen === 'patient-journey') { patientJourneyId = destination.dataset.journeyId; patientStageId = null; }
      if (destination.dataset.screen === 'professional-manage') { professionalJourneyId = destination.dataset.journeyId; professionalStageId = null; }
    }
    showScreen(destination.dataset.screen);
    return;
  }
  const patientNode = event.target.closest('#patient-journey .timeline-node[data-stage-id]');
  if (patientNode) { patientStageId = patientNode.dataset.stageId; renderPatientJourney(); return; }
  const professionalNode = event.target.closest('#professional-manage .linear-step[data-stage-id]');
  if (professionalNode) { professionalStageId = professionalNode.dataset.stageId; renderProfessionalManage(); return; }
  if (event.target.closest('.insight-row a')) { event.preventDefault(); showCompleted = !showCompleted; renderPatientHome(); }
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-screen]')) {
    event.preventDefault(); event.target.click();
  }
  const activeModal = referralModal.classList.contains('open') ? referralModal
    : situationModal.classList.contains('open') ? situationModal
      : modal.classList.contains('open') ? modal : null;
  if (!activeModal) {
    return;
  }
  if (event.key === 'Escape') {
    if (activeModal === referralModal) closeReferralModal();
    else if (activeModal === modal) closeModal();
    else closeSituationModal();
    return;
  }
  if (event.key === 'Tab') {
    const controls = [...activeModal.querySelectorAll('button, input, select, textarea')].filter((item) => !item.disabled && !item.closest('.hidden'));
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

document.querySelectorAll('.auth-account').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('#login-identifier').value = button.dataset.demoUser;
  document.querySelector('#login-password').value = '123456';
  document.querySelector('#auth-error').hidden = true;
  document.querySelector('.auth-submit').focus();
}));
document.querySelector('#login-form').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const botao = document.querySelector('.auth-submit');
  botao.disabled = true;
  try {
    const resposta = await requisitarApi('/entrar', 'POST', { email: document.querySelector('#login-identifier').value, senha: document.querySelector('#login-password').value });
    session = resposta.usuario;
    state = estadoVazio();
    await carregarEstado();
    document.querySelector('#auth-error').hidden = true;
    document.querySelector('#login-password').value = '';
    applySession();
  } catch (erro) {
    session = null;
    const mensagem = document.querySelector('#auth-error');
    mensagem.textContent = erro.message;
    mensagem.hidden = false;
  } finally { botao.disabled = false; }
});

document.querySelector('.logout-button').addEventListener('click', async () => {
  try {
    await requisitarApi('/sair', 'POST', {});
    session = null; state = estadoVazio();
    showLogin();
    document.querySelector('#login-identifier').value = '';
    document.querySelector('#login-password').value = '';
    document.querySelector('#login-identifier').focus();
  } catch (erro) { showToast('Não foi possível sair', erro.message); }
});

menuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
document.querySelectorAll('.help-button').forEach((button) => button.addEventListener('click', () => showToast('Demonstração FLUXSUS', 'Entre com uma conta de demonstração. Para trocar de perfil, saia e acesse a outra conta.')));

document.querySelector('#search-button').addEventListener('click', renderSearch);
document.querySelector('#patient-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); renderSearch(); } });

document.querySelector('.add-stage').addEventListener('click', () => {
  const rows = document.querySelectorAll('.stage-row');
  if (rows.length >= 6) { showToast('Limite da demonstração', 'Esta trilha comporta até 6 etapas.'); return; }
  const row = document.createElement('div');
  row.className = 'stage-row';
  row.innerHTML = '<span></span><input class="stage-name" placeholder="Nome da etapa" required /><select class="stage-owner"><option>Equipe hospitalar</option><option>Laboratório</option><option>Especialista</option><option>Secretariado</option></select><button type="button" class="move-stage" aria-label="Mover etapa para baixo" title="Mover etapa para baixo">↓</button>';
  document.querySelector('.stage-builder').insertBefore(row, document.querySelector('.add-stage'));
  renumberStages();
  row.querySelector('input').focus();
});
document.querySelector('.stage-builder').addEventListener('click', (event) => {
  const button = event.target.closest('.move-stage');
  if (!button) return;
  const row = button.closest('.stage-row');
  const next = row.nextElementSibling;
  if (next?.classList.contains('stage-row')) { next.after(row); renumberStages(); button.focus(); }
});
createForm.addEventListener('input', renderCreateSummary);
createForm.addEventListener('change', renderCreateSummary);
createForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (session?.role !== 'professional' || !createForm.reportValidity()) return;
  try {
    const linhas = [...createForm.querySelectorAll('.stage-row')];
    const etapas = linhas.map((linha, indice) => ({
      nome: linha.querySelector('.stage-name').value, responsavel: linha.querySelector('.stage-owner').value,
      preRequisitos: indice ? [indice - 1] : []
    }));
    const criada = await salvarAlteracao('/jornadas', 'POST', {
      pacienteId: state.patient.id, titulo: document.querySelector('#journey-name').value,
      tipo: document.querySelector('#journey-type').value, objetivo: document.querySelector('#journey-objective').value,
      inicio: document.querySelector('#journey-start').value, unidade: document.querySelector('#journey-unit').value, etapas
    });
    professionalJourneyId = criada.id; professionalStageId = null;
    showScreen('professional-manage');
    showToast('Jornada criada', 'A jornada planejada já está disponível para o paciente.');
  } catch (erro) { showToast('Confira a jornada', erro.message); }
});

document.querySelector('#open-update-modal').addEventListener('click', openModal);
document.querySelector('.modal-close').addEventListener('click', closeModal);
document.querySelector('.modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.querySelector('#update-stage').addEventListener('change', (event) => {
  professionalStageId = event.target.value;
  renderProfessionalManage();
  fillModalStage();
});
pendingToggle.addEventListener('change', togglePendingFields);
resolveToggle.addEventListener('change', () => { if (resolveToggle.checked) { pendingToggle.checked = false; togglePendingFields(); } });
document.querySelector('#stage-status').addEventListener('change', (event) => {
  const journey = selectedJourney(professionalJourneyId);
  const stage = journey?.stages.find((item) => item.id === professionalStageId);
  if (['Pendente', 'Devolvido'].includes(event.target.value) && !(stage.pending || []).some((item) => item.status === 'Aberta')) {
    pendingToggle.checked = true;
    togglePendingFields();
  }
});
updateForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!updateForm.reportValidity()) return;
  try {
    await salvarAlteracao(`/jornadas/${professionalJourneyId}/etapas/${professionalStageId}`, 'PUT', {
      versao: versaoEdicao, situacao: document.querySelector('#stage-status').value,
      data: document.querySelector('#stage-date').value, responsavel: document.querySelector('#update-owner').value,
      observacao: document.querySelector('#update-observation').value, resolverPendencia: resolveToggle.checked,
      pendencia: pendingToggle.checked ? {
        motivo: document.querySelector('#pending-reason').value, acao: document.querySelector('#pending-action').value,
        responsavel: document.querySelector('#pending-owner').value, prazo: document.querySelector('#pending-due').value,
        bloqueante: document.querySelector('#pending-blocking').checked
      } : null
    });
    closeModal();
    showToast('Alteração salva', 'Etapa e próximo passo atualizados também para o paciente.');
  } catch (erro) { showToast('Alteração não salva', erro.message); }
});

document.querySelector('#open-situation-modal').addEventListener('click', openSituationModal);
document.querySelector('.situation-close').addEventListener('click', closeSituationModal);
document.querySelector('.situation-cancel').addEventListener('click', closeSituationModal);
situationModal.addEventListener('click', (event) => { if (event.target === situationModal) closeSituationModal(); });
document.querySelector('#situation-action').addEventListener('change', updateSituationRule);
situationForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!situationForm.reportValidity()) return;
  try {
    const acoes = { suspend: 'suspender', complete: 'concluir', reopen: 'reabrir' };
    await salvarAlteracao(`/jornadas/${professionalJourneyId}/situacao`, 'POST', {
      versao: versaoEdicao, acao: acoes[document.querySelector('#situation-action').value], motivo: document.querySelector('#situation-reason').value
    });
    closeSituationModal();
    showToast('Situação atualizada', 'A alteração e sua autoria foram registradas no servidor.');
  } catch (erro) { showToast('Alteração não salva', erro.message); }
});

document.querySelector('.referral-close').addEventListener('click', closeReferralModal);
document.querySelector('.referral-cancel').addEventListener('click', closeReferralModal);
referralModal.addEventListener('click', (event) => { if (event.target === referralModal) closeReferralModal(); });
document.querySelector('#referral-status').addEventListener('change', mostrarMotivoDevolucao);
referralForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!referralForm.reportValidity()) return;
  const editando = Boolean(referralEditId);
  try {
    let caminho, metodo, dados;
    if (referralEditId) {
      const encaminhamento = state.referrals.find((item) => item.id === referralEditId);
      caminho = `/encaminhamentos/${encodeURIComponent(referralEditId)}`;
      metodo = 'PUT';
      dados = {
        versao: encaminhamento.journeyVersion,
        situacao: document.querySelector('#referral-status').value,
        motivo: document.querySelector('#referral-reason').value
      };
    } else {
      const opcao = state.referralOptions[Number(document.querySelector('#referral-option').value)];
      caminho = '/encaminhamentos';
      metodo = 'POST';
      dados = {
        jornadaId: opcao.journeyId,
        etapaId: opcao.stageId,
        destino: document.querySelector('#referral-destination').value,
        data: document.querySelector('#referral-date').value,
        situacao: 'Solicitado',
        motivo: '',
        versao: opcao.journeyVersion
      };
    }
    await salvarAlteracao(caminho, metodo, dados);
    closeReferralModal();
    showToast(editando ? 'Encaminhamento atualizado' : 'Encaminhamento registrado', 'A atualização ficou disponível nas jornadas vinculadas.');
  } catch (erro) {
    showToast('Não foi possível salvar', erro.message);
  }
});

window.addEventListener('focus', atualizarDados);
setInterval(atualizarDados, 8000);

document.querySelector('#journey-start').value = Model.localDate(new Date());
renumberStages();
iniciarAplicacao();

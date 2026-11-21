'use strict';

const Model = window.FluxsusModel;
const screens = [...document.querySelectorAll('.screen')];
const menuButton = document.querySelector('.mobile-menu');
const modal = document.getElementById('update-modal');
const situationModal = document.getElementById('situation-modal');
const referralModal = document.getElementById('referral-modal');
const notificationPanel = document.getElementById('notification-panel');
const createForm = document.getElementById('create-journey-form');
const updateForm = document.getElementById('update-form');
const situationForm = document.getElementById('situation-form');
const referralForm = document.getElementById('referral-form');
const referralStatus = document.getElementById('referral-status');
const referralReason = document.getElementById('referral-reason');
const referralReasonWrap = document.getElementById('referral-reason-wrap');
const pendingToggle = document.getElementById('has-pending');
const pendingFields = document.getElementById('pending-fields');
const resolveToggle = document.getElementById('resolve-pending');
let toastTimer;
let focusBeforeModal;
let showCompleted = false;
const SESSION_KEY = 'fluxsus-demo-session';
const REFERRAL_STORAGE_KEY = 'fluxsus-referrals-v1';
const PATIENT_SCREENS = new Set(['patient-home', 'patient-journey']);
const PROFESSIONAL_SCREENS = new Set(['professional-search', 'professional-history', 'professional-create', 'professional-manage']);
const SECRETARIAT_SCREENS = new Set(['secretariat-referrals']);

function loadSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (saved && ['patient', 'professional', 'secretariat'].includes(saved.role) && saved.name && saved.initials) return saved;
  } catch (_) { /* The demo remains usable without session persistence. */ }
  return null;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(Model.STORAGE_KEY));
    if ([1, 2].includes(saved?.version) && saved.patient?.id && Array.isArray(saved.journeys) && Array.isArray(saved.events)) {
      const migrated = Model.normalizeState(saved);
      if (JSON.stringify(migrated) !== JSON.stringify(saved)) {
        try { localStorage.setItem(Model.STORAGE_KEY, JSON.stringify(migrated)); }
        catch (_) { /* Preserve the existing journey in memory if storage is restricted. */ }
      }
      return migrated;
    }
  } catch (_) { /* Storage may be unavailable in a restricted browser. */ }
  const initial = Model.seedState();
  try { localStorage.setItem(Model.STORAGE_KEY, JSON.stringify(initial)); } catch (_) { /* Keep the demo in memory. */ }
  return initial;
}

let state = loadState();
let session = loadSession();
function seedReferrals() {
  return [
    { id: 'ENC-0027', patient: 'Maria da Conceição Costa', journey: 'JN-2048', stage: 'Eletrocardiograma', destination: 'Cardiologia · Hospital Universitário', date: '2026-09-16', status: 'Agendado', reason: '', updatedBy: 'João Lima · Secretariado', updatedAt: '2026-09-18T11:14:00.000Z' },
    { id: 'ENC-0026', patient: 'João Pedro Lima', journey: 'JN-1832', stage: 'Avaliação oftalmológica', destination: 'Oftalmologia · Clínica Escola', date: '2026-09-19', status: 'Devolvido', reason: 'O documento recebido está ilegível. Pedir um novo arquivo.', updatedBy: 'João Lima · Secretariado', updatedAt: '2026-09-20T17:32:00.000Z' },
    { id: 'ENC-0025', patient: 'Maria da Conceição Costa', journey: 'JN-2048', stage: 'Consulta cardiológica', destination: 'Ambulatório 4 · Hospital Universitário', date: '2026-09-20', status: 'Aguardando agendamento', reason: '', updatedBy: 'João Lima · Secretariado', updatedAt: '2026-09-20T13:05:00.000Z' }
  ];
}
function loadReferrals() {
  try {
    const saved = JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch (_) { /* Keep the synthetic demonstration available without storage. */ }
  const initial = seedReferrals();
  try { localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(initial)); } catch (_) { /* Keep referrals in memory. */ }
  return initial;
}
let referrals = loadReferrals();
let editingReferralId = null;
let patientJourneyId = state.journeys[0]?.id;
let professionalJourneyId = patientJourneyId;
let patientStageId = null;
let professionalStageId = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function parseLocalDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function longDate(value) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'Ainda não definida';
}

function shortDate(value) {
  const date = parseLocalDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date) : 'Sem data';
}

function eventDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function referralStatusClass(status) {
  if (status === 'Devolvido') return 'returned';
  if (status === 'Realizado') return 'complete';
  if (status === 'Agendado') return 'scheduled';
  return 'waiting';
}

function renderReferrals() {
  const list = document.querySelector('#referral-list');
  if (!list) return;
  list.innerHTML = referrals.map((referral) => `
    <article class="referral-card">
      <div>
        <div class="referral-card-top"><span class="referral-code">${escapeHtml(referral.id)} · ${escapeHtml(referral.journey)}</span><span class="status-pill ${referralStatusClass(referral.status)}"><i></i>${escapeHtml(referral.status)}</span></div>
        <h3>${escapeHtml(referral.stage)}</h3>
        <p class="referral-patient">${escapeHtml(referral.patient)}</p>
      </div>
      <button class="referral-update" type="button" data-update-referral="${escapeHtml(referral.id)}">Atualizar situação</button>
      <div class="referral-details">
        <div><small>Destino</small><strong>${escapeHtml(referral.destination)}</strong></div>
        <div><small>Solicitado em</small><strong>${escapeHtml(new Date(`${referral.date}T12:00:00`).toLocaleDateString('pt-BR'))}</strong></div>
        <div><small>Atualizado por</small><strong>${escapeHtml(referral.updatedBy)}</strong></div>
        <div><small>Última alteração</small><strong>${escapeHtml(eventDate(referral.updatedAt))}</strong></div>
      </div>
      ${referral.reason ? `<p class="referral-reason"><strong>Motivo da devolução:</strong> ${escapeHtml(referral.reason)}</p>` : ''}
    </article>`).join('');
  document.querySelector('#referral-open-count').textContent = String(referrals.filter((item) => !['Realizado', 'Devolvido'].includes(item.status)).length);
  document.querySelector('#referral-scheduled-count').textContent = String(referrals.filter((item) => item.status === 'Agendado').length);
  document.querySelector('#referral-returned-count').textContent = String(referrals.filter((item) => item.status === 'Devolvido').length);
  document.querySelector('#referral-total-count').textContent = `${referrals.length} ${referrals.length === 1 ? 'registro' : 'registros'}`;
}

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
  if (status === 'Aguardando') return 'waiting';
  return 'active-status';
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}"><i></i>${escapeHtml(status)}</span>`;
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

function saveState(nextState) {
  try { localStorage.setItem(Model.STORAGE_KEY, JSON.stringify(nextState)); }
  catch (_) {
    showToast('Não foi possível salvar', 'O navegador não permitiu armazenar a alteração.');
    return false;
  }
  state = nextState;
  renderAll();
  return true;
}

function closeMenu() {
  document.body.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
}

function closeNotifications(restoreFocus = false) {
  const wasOpen = !notificationPanel.hidden;
  notificationPanel.hidden = true;
  document.querySelector('.notification').setAttribute('aria-expanded', 'false');
  if (restoreFocus && wasOpen) document.querySelector('.notification').focus();
}

function showLogin() {
  document.querySelector('#auth-screen').hidden = false;
  document.querySelector('.prototype-shell').hidden = true;
  closeNotifications();
  closeMenu();
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
  const allowed = session?.role === 'professional' ? PROFESSIONAL_SCREENS : session?.role === 'secretariat' ? SECRETARIAT_SCREENS : session?.role === 'patient' ? PATIENT_SCREENS : null;
  if (!allowed?.has(id) || !document.getElementById(id)) return;
  closeNotifications();
  renderAll();
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.screen === id));
  closeMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPatientHome() {
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
    return `<article class="journey-card featured" role="button" tabindex="0" data-screen="patient-journey" data-journey-id="${escapeHtml(journey.id)}" aria-label="Abrir ${escapeHtml(journey.title)}">
      <div class="card-top">${statusPill(Model.journeyStatus(journey))}<span class="card-code">${escapeHtml(journey.id)}</span></div>
      <div class="journey-symbol ${symbol.css}" aria-hidden="true">${symbol.glyph}</div>
      <h3>${escapeHtml(journey.title)}</h3><p>${escapeHtml(journey.unit)} · ${escapeHtml(journey.type)}</p>
      <div class="mini-progress"><span style="width:${info.percent}%"></span></div>
      <div class="card-progress-label"><span>${info.completed} de ${info.total} concluídas</span><strong>${escapeHtml(next.kind === 'complete' ? 'Concluída' : next.kind === 'paused' ? 'Jornada suspensa' : next.kind === 'awaiting-completion' ? 'Aguardando conclusão' : next.kind === 'pending' ? next.owner === 'Paciente' ? 'Ação necessária' : `Aguardando ${next.owner}` : `Próximo: ${next.title}`)}</strong></div>
      <footer><span>Atualizada ${escapeHtml(shortDate(journey.updatedAt.slice(0, 10)))}</span><span class="card-link">Ver jornada →</span></footer>
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

function renderNotifications() {
  const items = state.journeys.flatMap((journey) => Model.openPendings(journey)
    .map((pending) => ({ journey, pending })))
    .filter(({ journey }) => session?.role === 'professional' || journey.patientId === state.patient.id);
  const badge = document.querySelector('.notification span');
  badge.textContent = String(items.length);
  badge.hidden = !items.length;
  notificationPanel.querySelector('.notification-list').innerHTML = items.length
    ? items.map(({ journey, pending }) => `<button type="button" class="notification-item" role="listitem" data-notification-journey="${escapeHtml(journey.id)}" data-notification-stage="${escapeHtml(pending.stageId)}"><span>!</span><span><strong>${escapeHtml(pending.action)}</strong><small>${escapeHtml(journey.title)} · ${escapeHtml(pending.stageTitle)}</small><em>Motivo: ${escapeHtml(pending.reason)} · Responsável: ${escapeHtml(pending.owner)}</em></span></button>`).join('')
    : '<p class="notification-empty">Nenhuma pendência aberta para este perfil.</p>';
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
  screen.querySelector('.journey-subtitle').textContent = `${journey.unit} · Iniciada em ${longDate(journey.startDate)}`;
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
    ? `<strong>Jornada suspensa pela equipe</strong>${escapeHtml(journey.situationReason || 'Aguarde a equipe de saúde informar a retomada.')}`
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
      const label = index === current ? situation === 'Suspensa' ? 'JORNADA SUSPENSA' : 'ETAPA ATUAL' : stage.status === 'Concluído' ? shortDate(stage.date).toUpperCase() : 'PRÓXIMA ETAPA';
      return `<button type="button" class="timeline-node dynamic-node ${stateClass} ${pending ? 'has-pending' : ''} ${stage.id === patientStageId ? 'selected' : ''}" data-stage-id="${escapeHtml(stage.id)}" style="--desktop-left:${desktop[index].x / 10 - 8}%;--desktop-top:${desktop[index].y - 26}px;--mobile-left:${index % 2 ? 54 : 2}%;--mobile-top:${48 + index * 180}px" ${index === current ? 'aria-current="step"' : ''}>
        ${index === current ? `<span class="current-callout">${situation === 'Suspensa' ? 'SUSPENSA' : pending ? pendingItem.owner === 'Paciente' ? 'AÇÃO NECESSÁRIA' : 'PENDÊNCIA DA EQUIPE' : 'VOCÊ ESTÁ AQUI'}</span><span class="pulse"></span>` : ''}
        <span class="node-dot">${stage.status === 'Concluído' ? '✓' : index + 1}</span>
        <span class="node-copy"><small>${escapeHtml(label)}</small><strong>${escapeHtml(stage.title)}</strong><em>${escapeHtml(pending ? `Pendência: ${pendingItem.owner}` : stage.status === 'Agendado' && stage.date ? `Agendado para ${shortDate(stage.date)}` : stage.status)}</em></span>
      </button>`;
    }).join('')}`;
  renderPatientDetail(journey);
}

function renderPatientDetail(journey) {
  const stage = journey.stages.find((item) => item.id === patientStageId) || journey.stages[0];
  if (!stage) return;
  const panel = document.querySelector('#patient-journey .detail-panel');
  panel.querySelector('.detail-top .status-pill').outerHTML = statusPill(stage.status);
  panel.querySelector('.detail-title').textContent = stage.title;
  panel.querySelector('.detail-summary').textContent = stage.summary || 'Etapa registrada pela equipe responsável.';
  const details = panel.querySelectorAll('.detail-list strong');
  details[0].textContent = longDate(stage.date);
  details[1].textContent = stage.location || journey.unit;
  details[2].textContent = stage.owner;
  const pending = (stage.pending || []).find((item) => item.status === 'Aberta');
  const box = panel.querySelector('.pending-box');
  box.classList.toggle('neutral', !pending);
  box.innerHTML = pending
    ? `<div class="pending-title"><span>!</span><strong>Pendência aberta</strong></div><dl><div><dt>Motivo</dt><dd>${escapeHtml(pending.reason)}</dd></div><div><dt>Ação necessária</dt><dd>${escapeHtml(pending.action)}</dd></div><div><dt>Responsável</dt><dd>${escapeHtml(pending.owner)}</dd></div>${pending.dueDate ? `<div><dt>Prazo</dt><dd>${escapeHtml(longDate(pending.dueDate))}</dd></div>` : ''}</dl>`
    : `<div class="pending-title"><span>✓</span><strong>Sem pendência aberta</strong></div><p>${escapeHtml(stage.observation || stage.note || 'Nenhuma ação adicional registrada para esta etapa.')}</p>`;
  panel.querySelector('footer').textContent = `Última atualização: ${eventDate(journey.updatedAt)} · Dados simulados`;
}

function renderSearch() {
  const query = document.querySelector('#patient-search').value.trim().toLocaleLowerCase('pt-BR');
  const patient = state.patient;
  const found = !query || patient.name.toLocaleLowerCase('pt-BR').includes(query) || patient.cns.includes(query);
  document.querySelector('.results-wrap h2').textContent = found ? '1 paciente encontrado' : 'Nenhum paciente encontrado';
  document.querySelector('.patient-result').hidden = !found;
  document.querySelectorAll('.patient-result .patient-meta strong')[1].textContent = String(state.journeys.filter((journey) => Model.journeyStatus(journey) !== 'Concluída').length);
}

function renderProfessionalHistory() {
  const active = state.journeys.filter((journey) => Model.journeyStatus(journey) !== 'Concluída').length;
  const pending = state.journeys.reduce((count, journey) => count + Model.openPendings(journey).length, 0);
  const stats = document.querySelectorAll('.stat-strip strong');
  stats[0].textContent = String(active);
  stats[1].textContent = String(pending);
  stats[2].textContent = state.events[0] ? eventDate(state.events[0].at) : '—';
  stats[3].textContent = state.patient.unit;
  document.querySelector('#professional-journeys').innerHTML = state.journeys.map((journey) => {
    const info = progress(journey);
    const stage = journey.stages[Model.currentIndex(journey) === -1 ? journey.stages.length - 1 : Model.currentIndex(journey)];
    const situation = Model.journeyStatus(journey);
    const symbol = journeySymbol(journey);
    return `<article class="professional-journey-card" role="button" tabindex="0" data-screen="professional-manage" data-journey-id="${escapeHtml(journey.id)}" aria-label="Gerenciar ${escapeHtml(journey.title)}">
      <div class="pj-icon ${symbol.css === 'eye' ? 'alt' : ''}">${symbol.glyph}</div><div class="pj-main"><div>${statusPill(situation)}<small>${escapeHtml(journey.id)}</small></div>
      <h3>${escapeHtml(journey.title)}</h3><p>${escapeHtml(situation === 'Concluída' ? 'Jornada concluída' : situation === 'Aguardando conclusão' ? 'Etapas concluídas · confirmação pendente' : situation === 'Suspensa' ? `Suspensa · etapa ${info.position} de ${info.total}` : `Etapa atual: ${stage.title} · ${info.position} de ${info.total} etapas`)} · ${info.completed} concluídas</p><div class="mini-progress"><span style="width:${info.percent}%"></span></div></div><span class="result-arrow">→</span>
    </article>`;
  }).join('');
  const activity = document.querySelector('.activity-card');
  activity.querySelectorAll('.activity-item').forEach((item) => item.remove());
  activity.insertAdjacentHTML('beforeend', state.events.slice(0, 4).map((item) => `<div class="activity-item"><span></span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(eventDate(item.at))} · ${escapeHtml(item.actor)}</small></div></div>`).join(''));
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
  screen.querySelector('#open-update-modal').disabled = ['Suspensa', 'Concluída'].includes(situation);
  screen.querySelector('#open-update-modal').title = ['Suspensa', 'Concluída'].includes(situation) ? 'Reabra a jornada antes de atualizar uma etapa.' : '';
  screen.querySelector('.linear-timeline').innerHTML = journey.stages.map((stage, index) => `<button type="button" class="linear-step ${stage.status === 'Concluído' ? 'done' : index === current ? 'current' : ''} ${stage.id === professionalStageId ? 'selected' : ''}" data-stage-id="${escapeHtml(stage.id)}"><span>${stage.status === 'Concluído' ? '✓' : index + 1}</span><div><small>${escapeHtml(stage.date ? shortDate(stage.date).toUpperCase() : index === current ? 'ETAPA ATUAL' : 'SEM DATA')}</small><strong>${escapeHtml(stage.title)}</strong><p>${escapeHtml(stage.owner)}</p></div><em>${escapeHtml(stage.status)}</em></button>`).join('');
  const pending = (selected.pending || []).find((item) => item.status === 'Aberta');
  screen.querySelector('.manage-info h2').textContent = selected.title;
  const values = screen.querySelectorAll('.manage-info dd');
  values[0].textContent = selected.owner;
  values[1].textContent = longDate(selected.date);
  values[2].innerHTML = statusPill(selected.status);
  const box = screen.querySelector('.open-pending');
  box.classList.toggle('neutral', !pending);
  box.innerHTML = pending
    ? `<div><span>!</span><strong>Pendência aberta</strong></div><dl><div><dt>Motivo</dt><dd>${escapeHtml(pending.reason)}</dd></div><div><dt>Ação</dt><dd>${escapeHtml(pending.action)}</dd></div><div><dt>Responsável</dt><dd>${escapeHtml(pending.owner)}</dd></div></dl>`
    : '<div><span>✓</span><strong>Sem pendência aberta</strong></div><p>Esta etapa não possui uma ação pendente.</p>';
  screen.querySelector('.situation-card h2').textContent = situation;
  const situationEvent = state.events.find((event) => event.journeyId === journey.id && event.type === 'journey-situation');
  screen.querySelector('.situation-history').innerHTML = situationEvent
    ? `<strong>Última alteração: ${escapeHtml(situationEvent.from)} → ${escapeHtml(situationEvent.to)}</strong><small>Motivo: ${escapeHtml(situationEvent.reason)}</small><small>${escapeHtml(situationEvent.actor)} · ${escapeHtml(eventDate(situationEvent.at))}</small>`
    : '<small>Nenhuma mudança de situação registrada nesta jornada.</small>';
}

function renderCreateSummary() {
  const values = document.querySelectorAll('.form-summary dd');
  values[0].textContent = document.querySelector('#journey-type').value || 'Não definido';
  values[1].textContent = `${document.querySelectorAll('.stage-row').length} definidas`;
  values[2].textContent = document.querySelector('#journey-unit').value;
}

function renderAll() {
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase();
  renderPatientHome();
  renderPatientJourney();
  renderSearch();
  renderProfessionalHistory();
  renderProfessionalManage();
  renderReferrals();
  renderCreateSummary();
  renderNotifications();
}

function syncReferralReason() {
  const returned = referralStatus.value === 'Devolvido';
  referralReasonWrap.classList.toggle('hidden', !returned);
  referralReason.required = returned;
}

function openReferralModal(referral = null) {
  if (session?.role !== 'secretariat') return;
  editingReferralId = referral?.id || null;
  focusBeforeModal = document.activeElement;
  referralForm.reset();
  const fields = ['referral-patient', 'referral-journey', 'referral-stage', 'referral-destination', 'referral-date'];
  if (referral) {
    document.querySelector('#referral-modal-title').textContent = 'Atualizar situação';
    document.querySelector('#referral-submit').textContent = 'Salvar alteração';
    document.querySelector('#referral-patient').value = referral.patient;
    document.querySelector('#referral-journey').value = referral.journey;
    document.querySelector('#referral-stage').value = referral.stage;
    document.querySelector('#referral-destination').value = referral.destination;
    document.querySelector('#referral-date').value = referral.date;
    referralStatus.value = referral.status;
    referralReason.value = referral.reason || '';
    fields.forEach((id) => { document.querySelector(`#${id}`).disabled = true; });
  } else {
    document.querySelector('#referral-modal-title').textContent = 'Novo encaminhamento';
    document.querySelector('#referral-submit').textContent = 'Salvar encaminhamento';
    document.querySelector('#referral-date').value = Model.localDate(new Date());
    fields.forEach((id) => { document.querySelector(`#${id}`).disabled = false; });
  }
  syncReferralReason();
  referralModal.classList.add('open');
  referralModal.setAttribute('aria-hidden', 'false');
  (referral ? referralStatus : document.querySelector('#referral-patient')).focus();
}

function closeReferralModal() {
  referralModal.classList.remove('open');
  referralModal.setAttribute('aria-hidden', 'true');
  focusBeforeModal?.focus();
  editingReferralId = null;
}

function persistReferrals() {
  try { localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(referrals)); }
  catch (_) { showToast('Não foi possível salvar', 'O navegador não permitiu armazenar o encaminhamento.'); return false; }
  return true;
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
  document.querySelector('#pending-due').value = pending?.dueDate || '';
  togglePendingFields();
}

function openModal() {
  if (session?.role !== 'professional') return;
  const journey = selectedJourney(professionalJourneyId);
  if (!journey) return;
  if (['Suspensa', 'Concluída'].includes(Model.journeyStatus(journey))) {
    showToast('Jornada indisponível', 'Reabra a jornada antes de atualizar uma etapa.');
    return;
  }
  focusBeforeModal = document.activeElement;
  document.querySelector('#update-stage').innerHTML = journey.stages.map((stage) => `<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.title)}</option>`).join('');
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
  return [{ value: 'suspend', label: 'Suspender jornada' }];
}

function updateSituationRule() {
  const journey = selectedJourney(professionalJourneyId);
  const action = document.querySelector('#situation-action').value;
  const from = Model.journeyStatus(journey);
  const text = action === 'complete'
    ? 'A conclusão só é permitida após todas as etapas serem concluídas e todas as pendências resolvidas.'
    : action === 'reopen' && from === 'Concluída'
      ? 'Ao reabrir uma jornada concluída, a última etapa volta a “Em andamento” para permitir a continuidade.'
      : action === 'reopen' ? 'A jornada volta a “Em andamento”; as etapas mantêm seus registros.'
        : 'A jornada ficará suspensa. Etapas não poderão ser atualizadas até a reabertura.';
  situationModal.querySelector('.situation-rule').textContent = `${text} Regra provisória até a validação de Q02/Q03.`;
}

function openSituationModal() {
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

document.addEventListener('click', (event) => {
  const referralUpdate = event.target.closest('[data-update-referral]');
  if (referralUpdate) {
    const referral = referrals.find((item) => item.id === referralUpdate.dataset.updateReferral);
    if (referral) openReferralModal(referral);
    return;
  }
  const notificationItem = event.target.closest('.notification-item');
  if (notificationItem) {
    if (session?.role === 'professional') {
      professionalJourneyId = notificationItem.dataset.notificationJourney;
      professionalStageId = notificationItem.dataset.notificationStage;
      showScreen('professional-manage');
    } else {
      patientJourneyId = notificationItem.dataset.notificationJourney;
      patientStageId = notificationItem.dataset.notificationStage;
      showScreen('patient-journey');
    }
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
  if (!event.target.closest('.notification-wrap')) closeNotifications();
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-screen]')) {
    event.preventDefault(); event.target.click();
  }
  const activeModal = referralModal.classList.contains('open') ? referralModal : situationModal.classList.contains('open') ? situationModal : modal.classList.contains('open') ? modal : null;
  if (!activeModal) {
    if (event.key === 'Escape') closeNotifications(true);
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
document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    session = Model.authenticateDemo(document.querySelector('#login-identifier').value, document.querySelector('#login-password').value);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (_) { /* Session lasts until this page is closed. */ }
    document.querySelector('#auth-error').hidden = true;
    document.querySelector('#login-password').value = '';
    applySession();
  } catch (error) {
    const message = document.querySelector('#auth-error');
    message.textContent = error.message;
    message.hidden = false;
  }
});
document.querySelector('.logout-button').addEventListener('click', () => {
  session = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* In-memory session is cleared above. */ }
  showLogin();
  document.querySelector('#login-identifier').value = '';
  document.querySelector('#login-password').value = '';
  document.querySelector('#login-identifier').focus();
});
menuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
document.querySelector('.notification').addEventListener('click', () => {
  notificationPanel.hidden = !notificationPanel.hidden;
  document.querySelector('.notification').setAttribute('aria-expanded', String(!notificationPanel.hidden));
  if (!notificationPanel.hidden) notificationPanel.querySelector('.notification-close').focus();
});
document.querySelector('.notification-close').addEventListener('click', () => closeNotifications(true));
document.querySelectorAll('.help-button').forEach((button) => button.addEventListener('click', () => showToast('Demonstração FLUXSUS', 'Entre com uma conta de demonstração. Para trocar de perfil, saia e acesse a outra conta.')));

document.querySelector('#open-referral-modal').addEventListener('click', () => openReferralModal());
document.querySelector('#referral-modal-close').addEventListener('click', closeReferralModal);
document.querySelector('#referral-cancel').addEventListener('click', closeReferralModal);
referralStatus.addEventListener('change', syncReferralReason);
referralModal.addEventListener('click', (event) => { if (event.target === referralModal) closeReferralModal(); });
referralForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (session?.role !== 'secretariat' || !referralForm.reportValidity()) return;
  const updating = Boolean(editingReferralId);
  const now = new Date();
  const input = {
    patient: document.querySelector('#referral-patient').value.trim(),
    journey: document.querySelector('#referral-journey').value.trim(),
    stage: document.querySelector('#referral-stage').value.trim(),
    destination: document.querySelector('#referral-destination').value.trim(),
    date: document.querySelector('#referral-date').value,
    status: referralStatus.value,
    reason: referralStatus.value === 'Devolvido' ? referralReason.value.trim() : '',
    updatedBy: `${session.name} · ${session.label}`,
    updatedAt: now.toISOString()
  };
  if (editingReferralId) {
    const existing = referrals.find((item) => item.id === editingReferralId);
    if (!existing) { showToast('Encaminhamento não encontrado', 'Atualize a lista e tente novamente.'); return; }
    Object.assign(existing, { status: input.status, reason: input.reason, updatedBy: input.updatedBy, updatedAt: input.updatedAt });
  } else {
    const nextNumber = Math.max(0, ...referrals.map((item) => Number(item.id.match(/(\d+)$/)?.[1] || 0))) + 1;
    referrals.unshift({ id: `ENC-${String(nextNumber).padStart(4, '0')}`, ...input });
  }
  if (!persistReferrals()) return;
  renderReferrals();
  closeReferralModal();
  showToast(updating ? 'Situação atualizada' : 'Encaminhamento registrado', 'A lista foi atualizada com responsável e horário.');
});

document.querySelector('#search-button').addEventListener('click', renderSearch);
document.querySelector('#patient-search').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); renderSearch(); } });

document.querySelector('.add-stage').addEventListener('click', () => {
  const rows = document.querySelectorAll('.stage-row');
  if (rows.length >= 6) { showToast('Limite da demonstração', 'Esta trilha comporta até 6 etapas.'); return; }
  const row = document.createElement('div');
  row.className = 'stage-row';
  row.innerHTML = '<span></span><input class="stage-name" placeholder="Nome da etapa" required /><select class="stage-owner"><option>Equipe APS</option><option>Laboratório</option><option>Especialista</option><option>Secretariado</option></select><button type="button" class="move-stage" aria-label="Mover etapa para baixo" title="Mover etapa para baixo">↓</button>';
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
createForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (session?.role !== 'professional') return;
  if (!createForm.reportValidity()) return;
  try {
    const stages = [...createForm.querySelectorAll('.stage-row')].map((row) => ({ title: row.querySelector('.stage-name').value, owner: row.querySelector('.stage-owner').value }));
    const created = Model.createJourney(state, {
      title: document.querySelector('#journey-name').value, type: document.querySelector('#journey-type').value,
      startDate: document.querySelector('#journey-start').value, unit: document.querySelector('#journey-unit').value, stages
    });
    if (!saveState(created.state)) return;
    professionalJourneyId = created.journey.id;
    professionalStageId = created.journey.stages[0].id;
    showScreen('professional-manage');
    showToast('Jornada criada', `${created.journey.title} já aparece também na área do paciente.`);
  } catch (error) { showToast('Confira a jornada', error.message); }
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
updateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (session?.role !== 'professional') return;
  if (!updateForm.reportValidity()) return;
  try {
    const updated = Model.updateStage(state, professionalJourneyId, professionalStageId, {
      status: document.querySelector('#stage-status').value,
      updateDate: document.querySelector('#update-date').value,
      stageDate: document.querySelector('#stage-date').value,
      owner: document.querySelector('#update-owner').value,
      observation: document.querySelector('#update-observation').value,
      resolvePending: resolveToggle.checked,
      pending: pendingToggle.checked ? {
        reason: document.querySelector('#pending-reason').value,
        action: document.querySelector('#pending-action').value,
        owner: document.querySelector('#pending-owner').value,
        dueDate: document.querySelector('#pending-due').value
      } : null
    });
    if (!saveState(updated.state)) return;
    closeModal();
    showToast('Alteração salva', 'Etapa, pendência e próximo passo atualizados também para o paciente.');
  } catch (error) { showToast('Alteração não salva', error.message); }
});

document.querySelector('#open-situation-modal').addEventListener('click', openSituationModal);
document.querySelector('.situation-close').addEventListener('click', closeSituationModal);
document.querySelector('.situation-cancel').addEventListener('click', closeSituationModal);
situationModal.addEventListener('click', (event) => { if (event.target === situationModal) closeSituationModal(); });
document.querySelector('#situation-action').addEventListener('change', updateSituationRule);
situationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!situationForm.reportValidity()) return;
  try {
    const changed = Model.changeJourneySituation(
      state, professionalJourneyId, document.querySelector('#situation-action').value,
      document.querySelector('#situation-reason').value, session
    );
    if (!saveState(changed.state)) return;
    closeSituationModal();
    showToast('Situação atualizada', `A jornada está ${Model.journeyStatus(changed.journey).toLowerCase()} e a alteração foi registrada.`);
  } catch (error) { showToast('Alteração não salva', error.message); }
});

window.addEventListener('storage', (event) => {
  if (event.key === Model.STORAGE_KEY) { state = loadState(); if (session) renderAll(); }
  if (event.key === REFERRAL_STORAGE_KEY) { referrals = loadReferrals(); if (session?.role === 'secretariat') renderReferrals(); }
});

document.querySelector('#journey-start').value = Model.localDate(new Date());
renumberStages();
if (session) applySession();
else showLogin();

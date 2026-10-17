const screens = [...document.querySelectorAll('.screen')];
const navItems = [...document.querySelectorAll('[data-screen]')];
const roleButtons = [...document.querySelectorAll('.role-button')];
const profileName = document.querySelector('.profile-name');
const profileMeta = document.querySelector('.profile-meta');
const menuButton = document.querySelector('.mobile-menu');

function closeMenu() {
  document.body.classList.remove('menu-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
}

function showScreen(id) {
  const target = document.getElementById(id);
  if (!target) return;
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.screen === id));
  const isProfessional = id.startsWith('professional');
  setRole(isProfessional ? 'professional' : 'patient', false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeMenu();
}

function setRole(role, navigate = true) {
  const professional = role === 'professional';
  document.querySelector('.patient-nav').classList.toggle('hidden', professional);
  document.querySelector('.professional-nav').classList.toggle('hidden', !professional);
  roleButtons.forEach((button) => {
    const active = button.dataset.role === role;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  profileName.textContent = professional ? 'Dra. Carla Reis' : 'Maria Costa';
  profileMeta.textContent = professional ? 'Equipe APS' : 'Paciente';
  document.querySelector('.header-profile .avatar').textContent = professional ? 'CR' : 'MC';
  if (navigate) showScreen(professional ? 'professional-search' : 'patient-home');
}

navItems.forEach((item) => item.addEventListener('click', () => showScreen(item.dataset.screen)));
roleButtons.forEach((button) => button.addEventListener('click', () => setRole(button.dataset.role)));
menuButton.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});

const detailContent = {
  referral: { status: 'Concluído', title: 'Encaminhamento recebido', summary: 'A UBS registrou e enviou seu encaminhamento para a cardiologia.', date: '28 de agosto de 2026', location: 'UBS Centro', owner: 'Equipe APS', note: 'Nenhuma ação necessária.' },
  triage: { status: 'Concluído', title: 'Triagem cardiológica', summary: 'A equipe realizou a avaliação inicial e definiu os próximos exames.', date: '03 de setembro de 2026', location: 'Hospital Universitário', owner: 'Enf. Carla Reis', note: 'Etapa concluída sem pendências.' },
  exam: { status: 'Agendado', title: 'Eletrocardiograma', summary: 'Exame que registra a atividade elétrica do coração e ajuda na avaliação cardiológica.', date: '24 de setembro, às 09:30', location: 'Hospital Universitário — Bloco B', owner: 'Setor de Cardiologia', note: 'Leve um documento com foto e chegue com 15 minutos de antecedência.' },
  consult: { status: 'Previsto', title: 'Consulta cardiológica', summary: 'Consulta para avaliação dos exames e definição da conduta clínica.', date: '02 de outubro de 2026', location: 'Hospital Universitário — Ambulatório 4', owner: 'Equipe de Cardiologia', note: 'A confirmação depende da conclusão do eletrocardiograma.' },
  diagnosis: { status: 'Aguardando', title: 'Avaliação e diagnóstico', summary: 'Integração dos resultados e registro da avaliação profissional.', date: 'Ainda não definida', location: 'Hospital Universitário', owner: 'Cardiologia', note: 'Nenhuma ação necessária neste momento.' },
  followup: { status: 'Aguardando', title: 'Plano de acompanhamento', summary: 'Definição das orientações e do acompanhamento após a avaliação.', date: 'Ainda não definida', location: 'UBS Centro', owner: 'Equipe APS', note: 'Esta etapa será liberada após a avaliação.' }
};

document.querySelectorAll('.timeline-node').forEach((node) => {
  node.addEventListener('click', () => {
    document.querySelectorAll('.timeline-node').forEach((item) => item.classList.remove('selected'));
    node.classList.add('selected');
    const info = detailContent[node.dataset.step];
    const panel = document.querySelector('.detail-panel');
    panel.querySelector('.status-pill').textContent = info.status;
    panel.querySelector('.detail-title').textContent = info.title;
    panel.querySelector('.detail-summary').textContent = info.summary;
    const details = panel.querySelectorAll('.detail-list strong');
    details[0].textContent = info.date;
    details[1].textContent = info.location;
    details[2].textContent = info.owner;
    panel.querySelector('.pending-box p').textContent = info.note;
  });
});

const modal = document.getElementById('update-modal');
const pendingToggle = document.getElementById('has-pending');
const pendingFields = document.getElementById('pending-fields');
function openModal() { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); modal.querySelector('select').focus(); }
function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
document.getElementById('open-update-modal').addEventListener('click', openModal);
document.querySelector('.modal-close').addEventListener('click', closeModal);
document.querySelector('.modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
pendingToggle.addEventListener('change', () => pendingFields.classList.toggle('hidden', !pendingToggle.checked));
document.getElementById('stage-status').addEventListener('change', (event) => {
  if (event.target.value === 'Pendente' || event.target.value === 'Devolvido') {
    pendingToggle.checked = true;
    pendingFields.classList.remove('hidden');
  }
});

function showToast(title, message) {
  const toast = document.querySelector('.toast');
  toast.querySelector('strong').textContent = title;
  toast.querySelector('small').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

document.getElementById('update-form').addEventListener('submit', (event) => {
  event.preventDefault();
  closeModal();
  showToast('Alteração salva', 'A jornada foi atualizada com sucesso.');
});

document.getElementById('create-journey-form').addEventListener('submit', (event) => {
  event.preventDefault();
  showToast('Jornada criada', 'A nova jornada já está disponível no histórico.');
  setTimeout(() => showScreen('professional-history'), 650);
});

document.getElementById('search-button').addEventListener('click', () => showToast('Busca concluída', '1 paciente encontrado.'));

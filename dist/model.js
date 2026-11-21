(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FluxsusModel = api;
})(globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'fluxsus-demo-v1';
  const STAGE_STATUSES = ['Aguardando', 'Agendado', 'Em andamento', 'Concluído', 'Pendente', 'Devolvido'];
  const DEMO_USERS = [
    { role: 'patient', identifier: 'paciente@fluxsus.demo', password: '123456', name: 'Maria Costa', label: 'Paciente', initials: 'MC' },
    { role: 'professional', identifier: 'profissional@fluxsus.demo', password: '123456', name: 'Dra. Carla Reis', label: 'Equipe APS', initials: 'CR' },
    { role: 'secretariat', identifier: 'secretariado@fluxsus.demo', password: '123456', name: 'João Lima', label: 'Secretariado', initials: 'JL' }
  ];

  function authenticateDemo(identifier, password) {
    const user = DEMO_USERS.find((item) => item.identifier === String(identifier || '').trim().toLowerCase() && item.password === password);
    if (!user) throw new Error('Confira o usuário e a senha de demonstração.');
    return { role: user.role, name: user.name, label: user.label, initials: user.initials };
  }

  function localDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function offsetDate(base, days) {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    return localDate(date);
  }

  function seedState(now = new Date()) {
    const stamp = now.toISOString();
    const stage = (id, title, status, date, owner, location, summary, note = '') => ({
      id, title, status, date, owner, location, summary, note, observation: '', pending: []
    });
    const cardiology = [
      stage('JN-2048-S1', 'Encaminhamento recebido', 'Concluído', offsetDate(now, -27), 'Equipe APS', 'UBS Centro', 'A UBS registrou e enviou seu encaminhamento para a cardiologia.', 'Nenhuma ação necessária.'),
      stage('JN-2048-S2', 'Triagem cardiológica', 'Concluído', offsetDate(now, -20), 'Enf. Carla Reis', 'Hospital Universitário', 'A equipe realizou a avaliação inicial e definiu os próximos exames.', 'Etapa concluída sem pendências.'),
      stage('JN-2048-S3', 'Eletrocardiograma', 'Agendado', offsetDate(now, 7), 'Setor de Cardiologia', 'Hospital Universitário — Bloco B', 'Exame que registra a atividade elétrica do coração e ajuda na avaliação cardiológica.'),
      stage('JN-2048-S4', 'Consulta cardiológica', 'Aguardando', offsetDate(now, 15), 'Equipe de Cardiologia', 'Hospital Universitário — Ambulatório 4', 'Consulta para avaliação dos exames e definição da conduta clínica.'),
      stage('JN-2048-S5', 'Avaliação e diagnóstico', 'Aguardando', '', 'Cardiologia', 'Hospital Universitário', 'Integração dos resultados e registro da avaliação profissional.'),
      stage('JN-2048-S6', 'Plano de acompanhamento', 'Aguardando', '', 'Equipe APS', 'UBS Centro', 'Definição das orientações e do acompanhamento após a avaliação.')
    ];
    cardiology[2].pending.push({
      id: 'JN-2048-P1', status: 'Aberta', reason: 'Documento de identificação necessário',
      action: 'Leve um documento com foto no dia do exame.', owner: 'Paciente',
      dueDate: offsetDate(now, 7), createdAt: stamp
    });

    return {
      version: 2,
      patient: { id: 'PAC-001', name: 'Maria da Conceição Costa', shortName: 'Maria Costa', cns: '0000004821', birthDate: '1978-03-14', unit: 'UBS Centro' },
      journeys: [
        { id: 'JN-2048', patientId: 'PAC-001', title: 'Acompanhamento cardiológico', type: 'Acompanhamento especializado', unit: 'Hospital Universitário', startDate: offsetDate(now, -27), updatedAt: stamp, stages: cardiology },
        { id: 'JN-1832', patientId: 'PAC-001', title: 'Acompanhamento oftalmológico', type: 'Acompanhamento especializado', unit: 'Clínica Escola', startDate: offsetDate(now, -8), updatedAt: stamp, stages: [
          stage('JN-1832-S1', 'Encaminhamento à oftalmologia', 'Aguardando', '', 'Secretariado', 'Clínica Escola', 'O secretariado confere o encaminhamento e informa o próximo agendamento.'),
          stage('JN-1832-S2', 'Avaliação oftalmológica', 'Aguardando', '', 'Oftalmologia', 'Clínica Escola', 'Avaliação inicial com a equipe de oftalmologia.'),
          stage('JN-1832-S3', 'Exames complementares', 'Aguardando', '', 'Oftalmologia', 'Clínica Escola', 'Exames definidos pela equipe responsável.'),
          stage('JN-1832-S4', 'Plano de acompanhamento', 'Aguardando', '', 'Equipe APS', 'UBS Centro', 'Orientações e acompanhamento após a avaliação.')
        ] }
      ],
      events: [
        { id: 'EV-1', journeyId: 'JN-2048', title: 'Triagem concluída', actor: 'Enf. Carla Reis', at: stamp },
        { id: 'EV-2', journeyId: 'JN-2048', title: 'Exame agendado', actor: 'Secretariado', at: stamp }
      ]
    };
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function clean(value) { return String(value || '').trim(); }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

  function normalizeState(source) {
    const state = copy(source);
    state.version = 2;
    state.journeys.forEach((journey) => {
      journey.stages.forEach((stage) => {
        if (stage.owner === 'Regulação') stage.owner = 'Secretariado';
        if (stage.title === 'Análise da regulação') {
          stage.title = 'Encaminhamento à oftalmologia';
          stage.summary = 'O secretariado confere o encaminhamento e informa o próximo agendamento.';
        }
        (stage.pending || []).forEach((pending) => {
          if (pending.owner === 'Regulação') pending.owner = 'Secretariado';
        });
      });
    });
    state.events.forEach((event) => { if (event.actor === 'Regulação') event.actor = 'Secretariado'; });
    return state;
  }

  function currentIndex(journey) {
    return journey.stages.findIndex((stage) => stage.status !== 'Concluído');
  }

  function progress(journey) {
    const total = journey.stages.length;
    const completed = journey.stages.filter((stage) => stage.status === 'Concluído').length;
    const current = currentIndex(journey);
    return { position: current === -1 ? total : current + 1, completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
  }

  function journeyStatus(journey) {
    if (journey.situation === 'Suspensa' || journey.situation === 'Concluída') return journey.situation;
    if (currentIndex(journey) === -1) return 'Aguardando conclusão';
    if (journey.situation === 'Em andamento') return 'Em andamento';
    return journey.stages.some((stage) => stage.status !== 'Aguardando') ? 'Em andamento' : 'Aguardando';
  }

  function openPendings(journey) {
    return journey.stages.flatMap((stage) => (stage.pending || [])
      .filter((pending) => pending.status === 'Aberta')
      .map((pending) => ({ ...pending, stageId: stage.id, stageTitle: stage.title })));
  }

  function nextStep(journey) {
    const situation = journeyStatus(journey);
    if (situation === 'Suspensa') return { kind: 'paused', title: 'Jornada suspensa: aguarde a equipe de saúde.' };
    if (situation === 'Concluída') return { kind: 'complete', title: 'Jornada concluída' };
    const pending = openPendings(journey).find((item) => item.owner === 'Paciente') || openPendings(journey)[0];
    if (pending) return { kind: 'pending', title: pending.action, owner: pending.owner, reason: pending.reason, stageId: pending.stageId };
    const index = currentIndex(journey);
    if (index === -1) return { kind: 'awaiting-completion', title: 'Aguardando conclusão pela equipe de saúde' };
    return { kind: 'stage', title: journey.stages[index].title, stageId: journey.stages[index].id };
  }

  function nextId(journeys) {
    const numbers = journeys.map((journey) => Number(journey.id.match(/^JN-(\d+)$/)?.[1] || 0));
    return `JN-${Math.max(2048, ...numbers) + 1}`;
  }

  function createJourney(state, input, now = new Date()) {
    const title = clean(input.title);
    const type = clean(input.type);
    const unit = clean(input.unit);
    const startDate = clean(input.startDate);
    const rows = Array.isArray(input.stages) ? input.stages : [];
    if (!title || !type || !unit || !validDate(startDate)) throw new Error('Preencha nome, tipo, data e unidade da jornada.');
    if (rows.length < 1 || rows.length > 6) throw new Error('Defina de 1 a 6 etapas para a jornada.');
    if (rows.some((row) => !clean(row.title) || !clean(row.owner))) throw new Error('Todas as etapas precisam de nome e responsável.');

    const result = copy(state);
    const id = nextId(result.journeys);
    const journey = {
      id, patientId: result.patient.id, title, type, unit, startDate, updatedAt: now.toISOString(),
      stages: rows.map((row, index) => ({
        id: `${id}-S${index + 1}`, title: clean(row.title), owner: clean(row.owner),
        status: index === 0 ? 'Em andamento' : 'Aguardando', date: index === 0 ? startDate : '',
        location: unit, summary: 'Etapa registrada pela equipe responsável.', note: '', observation: '', pending: []
      }))
    };
    result.journeys.unshift(journey);
    result.events.unshift({ id: `EV-${now.getTime()}`, journeyId: id, title: 'Jornada criada', actor: 'Dra. Carla Reis', at: now.toISOString() });
    return { state: result, journey };
  }

  function updateStage(state, journeyId, stageId, input, now = new Date()) {
    const result = copy(state);
    const journey = result.journeys.find((item) => item.id === journeyId);
    const stage = journey?.stages.find((item) => item.id === stageId);
    if (!stage) throw new Error('Etapa não encontrada. Atualize a página e tente novamente.');
    if (['Suspensa', 'Concluída'].includes(journeyStatus(journey))) throw new Error('Reabra a jornada antes de atualizar uma etapa.');

    const status = clean(input.status);
    const owner = clean(input.owner);
    const updateDate = clean(input.updateDate);
    const stageDate = clean(input.stageDate);
    if (!STAGE_STATUSES.includes(status) || !owner || !validDate(updateDate) || (stageDate && !validDate(stageDate))) {
      throw new Error('Confira o estado, o responsável e as datas informadas.');
    }
    if (stage.status === 'Concluído' && status !== 'Concluído') {
      throw new Error('Uma etapa concluída não pode ser reaberta nesta demonstração.');
    }
    if (status === 'Concluído') {
      const position = journey.stages.findIndex((item) => item.id === stageId);
      if (journey.stages.slice(0, position).some((item) => item.status !== 'Concluído')) {
        throw new Error('Conclua as etapas anteriores antes de avançar esta etapa.');
      }
    }
    if (input.resolvePending && input.pending) throw new Error('Resolva a pendência anterior antes de registrar outra.');

    const open = (stage.pending || []).find((item) => item.status === 'Aberta');
    if (input.resolvePending && open) { open.status = 'Resolvida'; open.resolvedAt = now.toISOString(); }

    if (input.pending) {
      const reason = clean(input.pending.reason);
      const action = clean(input.pending.action);
      const pendingOwner = clean(input.pending.owner);
      const dueDate = clean(input.pending.dueDate);
      if (!reason || !action || !pendingOwner || (dueDate && !validDate(dueDate))) {
        throw new Error('Informe motivo, ação necessária e responsável pela pendência.');
      }
      const data = { reason, action, owner: pendingOwner, dueDate };
      if (open) Object.assign(open, data);
      else stage.pending.push({ id: `${stage.id}-P${stage.pending.length + 1}`, status: 'Aberta', ...data, createdAt: now.toISOString() });
    }

    const stillOpen = stage.pending.some((item) => item.status === 'Aberta');
    if (['Pendente', 'Devolvido'].includes(status) && !stillOpen) throw new Error('Esse estado exige uma pendência com motivo, ação e responsável.');
    if (status === 'Concluído' && stillOpen) throw new Error('Resolva a pendência aberta antes de concluir a etapa.');

    stage.status = status;
    stage.owner = owner;
    stage.date = stageDate;
    stage.observation = clean(input.observation);
    stage.updatedAt = now.toISOString();
    stage.updatedDate = updateDate;
    journey.updatedAt = now.toISOString();
    result.events.unshift({
      id: `EV-${now.getTime()}`, journeyId, stageId,
      title: input.resolvePending ? `Pendência resolvida · ${stage.title}` : input.pending ? `Pendência registrada · ${stage.title}` : `Etapa atualizada · ${stage.title}`,
      actor: 'Dra. Carla Reis', at: now.toISOString()
    });
    return { state: result, journey, stage };
  }

  function changeJourneySituation(state, journeyId, action, reason, actor, now = new Date()) {
    if (actor?.role !== 'professional' || !clean(actor.name)) throw new Error('Somente um profissional identificado pode alterar a situação.');
    if (!clean(reason)) throw new Error('Informe o motivo da alteração da jornada.');
    const result = copy(state);
    const journey = result.journeys.find((item) => item.id === journeyId);
    if (!journey) throw new Error('Jornada não encontrada.');
    const from = journeyStatus(journey);
    let to;
    if (action === 'suspend' && ['Aguardando', 'Em andamento'].includes(from)) to = 'Suspensa';
    else if (action === 'complete' && from === 'Aguardando conclusão' && !openPendings(journey).length) to = 'Concluída';
    else if (action === 'reopen' && ['Suspensa', 'Concluída'].includes(from)) to = 'Em andamento';
    else throw new Error('Esta mudança não é permitida na situação atual da jornada.');

    if (action === 'reopen' && from === 'Concluída') {
      const last = journey.stages[journey.stages.length - 1];
      last.status = 'Em andamento';
      last.updatedAt = now.toISOString();
    }
    journey.situation = to;
    journey.situationReason = clean(reason);
    journey.situationAt = now.toISOString();
    journey.situationActor = clean(actor.name);
    journey.updatedAt = now.toISOString();
    result.events.unshift({
      id: `EV-${now.getTime()}-${journeyId}-${action}`, journeyId, type: 'journey-situation',
      title: `${from} → ${to}`, from, to, reason: clean(reason), actor: clean(actor.name), at: now.toISOString()
    });
    return { state: result, journey };
  }

  return { STORAGE_KEY, STAGE_STATUSES, authenticateDemo, localDate, seedState, normalizeState, currentIndex, progress, journeyStatus, openPendings, nextStep, createJourney, updateStage, changeJourneySituation };
});

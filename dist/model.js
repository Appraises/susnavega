(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FluxsusModel = api;
})(globalThis, function () {
  'use strict';

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

  function normalizeState(source) {
    const state = copy(source);
    state.version = 2;
    state.journeys.forEach((journey) => {
      journey.stages.forEach((stage) => {
        if (!Array.isArray(stage.dependsOn)) {
          const index = journey.stages.indexOf(stage);
          stage.dependsOn = index ? [journey.stages[index - 1].id] : [];
        }
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

  function stageAvailability(journey, stage) {
    const missing = (stage.dependsOn || []).filter((id) => journey.stages.find((item) => item.id === id)?.status !== 'Concluído');
    const blocked = (stage.pending || []).some((item) => item.status === 'Aberta' && item.blocking !== false);
    return { available: stage.status !== 'Concluído' && !missing.length && !blocked && !['Suspensa', 'Concluída'].includes(journey.situation), missing, blocked };
  }

  function availableStages(journey) {
    return journey.stages.filter((stage) => stageAvailability(journey, stage).available)
      .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || journey.stages.indexOf(a) - journey.stages.indexOf(b));
  }

  function validateDependencies(journey) {
    const visiting = new Set(), visited = new Set();
    function visit(stage) {
      if (visiting.has(stage.id)) throw new Error('As dependências não podem formar um ciclo.');
      if (visited.has(stage.id)) return;
      visiting.add(stage.id);
      for (const id of stage.dependsOn || []) {
        const prerequisite = journey.stages.find((item) => item.id === id);
        if (!prerequisite || id === stage.id) throw new Error('Escolha outra etapa da mesma jornada como pré-requisito.');
        visit(prerequisite);
      }
      visiting.delete(stage.id); visited.add(stage.id);
    }
    journey.stages.forEach(visit);
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
    if (journey.situacao === 'Planejada') return 'Planejada';
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
    const available = availableStages(journey);
    if (available.length) return { kind: 'stage', title: available[0].title, stageId: available[0].id };
    const pending = openPendings(journey).find((item) => item.owner === 'Paciente') || openPendings(journey)[0];
    if (pending) return { kind: 'pending', title: pending.action, owner: pending.owner, reason: pending.reason, stageId: pending.stageId };
    const index = currentIndex(journey);
    if (index === -1) return { kind: 'awaiting-completion', title: 'Aguardando conclusão pela equipe de saúde' };
    return { kind: 'waiting', title: 'Aguarde a conclusão dos pré-requisitos pela equipe.' };
  }

  return { localDate, seedState, normalizeState, stageAvailability, availableStages, validateDependencies, currentIndex, progress, journeyStatus, openPendings, nextStep };
});

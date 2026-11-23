CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, cns TEXT NOT NULL UNIQUE, dados JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK(perfil IN ('paciente','profissional','secretariado','gestor')),
  paciente_id TEXT REFERENCES pacientes(id), sal TEXT NOT NULL, senha_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), expira_em BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS jornadas (
  id TEXT PRIMARY KEY, paciente_id TEXT NOT NULL REFERENCES pacientes(id), titulo TEXT NOT NULL,
  tipo TEXT NOT NULL, unidade TEXT NOT NULL, inicio TEXT NOT NULL, objetivo TEXT NOT NULL DEFAULT '',
  situacao TEXT NOT NULL CHECK(situacao IN ('Planejada','Ativa','Suspensa','Concluída')),
  versao INTEGER NOT NULL DEFAULT 1, atualizada_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jornadas_paciente ON jornadas(paciente_id);
CREATE TABLE IF NOT EXISTS etapas (
  id TEXT PRIMARY KEY, jornada_id TEXT NOT NULL REFERENCES jornadas(id), ordem INTEGER NOT NULL,
  dados JSONB NOT NULL, UNIQUE(id, jornada_id)
);
CREATE TABLE IF NOT EXISTS encaminhamentos (
  id TEXT PRIMARY KEY,
  jornada_id TEXT NOT NULL,
  etapa_id TEXT NOT NULL,
  destino TEXT NOT NULL,
  data TEXT NOT NULL,
  situacao TEXT NOT NULL CHECK(situacao IN ('Solicitado','Aguardando agendamento','Agendado','Realizado','Devolvido')),
  motivo TEXT NOT NULL DEFAULT '',
  criado_por_id TEXT NOT NULL REFERENCES usuarios(id),
  atualizado_por_id TEXT NOT NULL REFERENCES usuarios(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(etapa_id, jornada_id) REFERENCES etapas(id, jornada_id)
);
CREATE INDEX IF NOT EXISTS encaminhamentos_jornada ON encaminhamentos(jornada_id, atualizado_em DESC);
CREATE TABLE IF NOT EXISTS historico (
  id TEXT PRIMARY KEY, jornada_id TEXT REFERENCES jornadas(id), dados JSONB NOT NULL
);

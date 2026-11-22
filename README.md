# FLUXSUS — Incremento P3

Este recorte demonstra uma jornada compartilhada entre profissional e paciente. O profissional localiza o paciente, cria uma jornada, atualiza etapas e registra ou resolve uma pendência. O paciente consulta os mesmos dados em outra sessão. O PostgreSQL guarda as alterações e o histórico com autoria e horário.

O servidor usa Node.js, Express e PostgreSQL. A interface em HTML, CSS e JavaScript é atendida pelo mesmo servidor. Os campos em inglês das respostas foram mantidos para aproveitar a interface existente; as funções novas do servidor usam nomes em português.

## O que está incluído

- Login, restauração de sessão e saída, com cookie HttpOnly e senha de demonstração armazenada com sal e hash.
- Busca de pacientes por nome, CNS sintético ou identificador.
- Criação de jornada Planejada com uma a seis etapas, apresentadas em sequência no formulário.
- Atualização de estado, data, responsável e observação da etapa.
- Pendência com motivo, ação, responsável, prazo opcional, bloqueio e resolução.
- Consulta da jornada pelo paciente, progresso por etapas concluídas e próximo passo.
- Suspensão, conclusão e reabertura pelo profissional, preservando etapas e exigindo justificativa.
- Histórico gravado na mesma transação das alterações e proteção contra edição de versão desatualizada (HTTP 409).

RF001, RF002, RF004, RF005, RF007–RF012 têm demonstração ou cobertura delimitada por esse fluxo. Isso não significa que todos os critérios desses requisitos já tenham sido validados. Acessibilidade, usabilidade e desempenho ainda precisam de avaliação própria.

## Preparar e executar no Windows

Pré-requisitos: Node.js >= 24.15.0 e < 25, npm e PostgreSQL 18. Use apenas dados sintéticos. Os comandos devem ser executados na raiz desta pasta.

```powershell
npm ci
Copy-Item .env.example .env
powershell -NoProfile -File scripts/iniciar-postgres.ps1
npm start
```

Não sobrescreva um `.env` já configurado. Se o PostgreSQL estiver em outro diretório:

```powershell
powershell -NoProfile -File scripts/iniciar-postgres.ps1 -PastaPostgres "C:\caminho\postgresql\bin"
```

O script usa uma instância própria na porta **55433**, com os bancos `fluxsus_p3` e `fluxsus_p3_test`. Ele não troca a configuração da versão completa, que usa outra porta. O servidor abre em **http://127.0.0.1:4175/**. O endereço e a porta vêm do `.env`; a carga sintética ocorre no primeiro início e não apaga uma base já preenchida.

A sessão usa o cookie `fluxsus_p3_sessao`, separado do cookie da versão completa. Assim, abrir as duas versões no mesmo navegador não substitui a sessão de uma pela da outra.

Como alternativa ao PostgreSQL nativo, com Docker disponível:

```powershell
docker compose up -d banco
docker compose exec banco createdb -U fluxsus fluxsus_p3_test
```

Execute `createdb` somente se o banco de teste ainda não existir. Escolha a instância nativa ou o Compose: ambos usam a mesma porta. O Compose prepara o banco; a API continua sendo executada com `npm start`.

Contas sintéticas (senha `123456`):

| Perfil | Usuário |
| --- | --- |
| Paciente | paciente@fluxsus.demo |
| Profissional | profissional@fluxsus.demo |
| Outro paciente, sem jornada inicial | pedro@fluxsus.demo |

Os perfis Secretariado e Gestor fazem parte do escopo geral do projeto, mas não têm acesso operacional neste recorte. O servidor não cria sessões para esses perfis.

## Testar e empacotar

Com o PostgreSQL preparado:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://fluxsus:fluxsus_demo@127.0.0.1:55433/fluxsus_p3_test'
npm run verificar
npm run lint
npm test
npm run build
```

Os testes abrem a API em uma porta temporária e criam um schema aleatório dentro de um banco com nome terminado em `_test`. No final removem apenas o schema criado pela execução. Nunca configure o banco da demonstração como banco de teste.

O build cria `pacote/`, com os arquivos necessários à execução. Para usar esse artefato: configurar o banco e o `.env`, instalar com `npm ci --omit=dev` e executar `npm start`. Os testes e a configuração do CI pertencem ao projeto-fonte, não ao pacote de execução.

O workflow verifica instalação, sintaxe, lint, testes e build em `main`, `feature/**`, `fix/**`, `chore/**`, `test/**` e `docs/**`, além de PRs para `main`. Uma execução local não comprova uma execução no GitHub. Bloquear merge após falha também exige configurar a proteção da branch no repositório.

## Roteiro curto da demonstração

1. Entrar como profissional e buscar Maria pelo nome ou CNS.
2. Criar uma jornada com duas etapas, abrir seu gerenciamento e iniciar a primeira.
3. Registrar nela uma pendência: motivo, ação, responsável e bloqueio.
4. Em outro navegador ou janela anônima, entrar como paciente e abrir a jornada criada. Conferir os dados, o progresso e a pendência.
5. Pelo profissional, resolver a pendência e concluir a etapa. Recarregar a consulta do paciente e conferir o próximo passo.
6. Reiniciar a API, mantendo o banco, e consultar a jornada novamente. A sessão e os dados continuam disponíveis dentro do prazo de validade.

## Estrutura

- `servidor/`: inicialização, sessões, validações, consultas, jornadas e PostgreSQL.
- `dist/`: interface, cliente HTTP, apresentação e cálculos do próximo passo.
- `testes/`: testes de API com PostgreSQL real.
- `scripts/`: PostgreSQL local, verificação de sintaxe e empacotamento.
- `.github/workflows/`: CI do incremento.
- `docs/escopo-p3.md`: cobertura, limitações e trabalho reservado para o P4.

## Limites desta versão

Não inclui rotas, tabelas ou telas operacionais de encaminhamentos, notificações, FHIR, reúso ou indicadores da gestão. Uma pendência é exibida na própria jornada; não representa um sistema completo de notificações. A formulação do próximo passo ainda é feita pelo modelo da interface. O servidor confere dependências antes de permitir avanço, mas o formulário do P3 trabalha com uma sequência.

Os dados são acadêmicos e sintéticos, sem conexão com hospitais. Não foram comprovadas metas de desempenho, acessibilidade ou benefícios clínicos. Não há hospedagem pública, Gov.br/OIDC, cancelamento de jornada, paginação completa, migrações versionadas nem implantação automática. A versão completa foi preservada fora deste recorte para revisão e integração no P4.

# Escopo da versão reduzida

O P3 usa um fluxo completo entre profissional e paciente para demonstrar a aplicação web, API autenticada, persistência PostgreSQL e histórico transacional. Esta separação não comprova autoria nem data de desenvolvimento; registra o conteúdo escolhido para a entrega.

| Incluído | Verificação prevista |
| --- | --- |
| Sessões e isolamento entre pacientes | Recusas de acesso, senha, expiração e logout pela API |
| Busca e criação de jornada | Busca por nome/CNS/ID e consulta do registro criado em outra sessão |
| Etapas e pendências | Motivo, ação, responsável, bloqueio, resolução, próximo passo e histórico |
| Transações e controle de versão | Rollback e duas gravações concorrentes com uma resposta 409 |
| Suspender/concluir/reabrir | Permissões e guardas; etapas e progresso preservados |
| Encaminhamentos internos — etapa de servidor | Conta sintética do Secretariado, registro, atualização, devolução com motivo, reenvio, auditoria e controle de versão |
| Persistência | Reinício da API e nova leitura dos dados e sessão |
| Execução e qualidade | Instalação limpa, sintaxe, lint, testes e build |

O resultado real das verificações deve ser registrado depois da execução e vinculado à versão entregue. A tabela não significa que os checks já passaram no GitHub.

## Entrega da interface do Secretariado

A API e a persistência dos encaminhamentos estão nesta etapa. A tela administrativa e a demonstração de que paciente, profissional e Secretariado veem a atualização correspondente ficam para a entrega seguinte. Até lá, o fluxo entre os três perfis não deve ser marcado como completo.

## Integração posterior no P4

Notificações individuais, importação FHIR, confirmação de reúso e indicadores da gestão continuam fora da API, do esquema e da interface deste recorte. A API dos encaminhamentos ainda precisa da interface para demonstrar o fluxo completo. O algoritmo existente de dependências e a proteção de versão foram mantidos, sem retirar proteções já implementadas. Paralelismo completo na interface, centralização do próximo passo no backend, paginação, refatorações e ensaios de qualidade continuam como evolução ou validação.

## Alinhamento do relatório

A seção 1.2 do PDF do P3 marca encaminhamentos e FHIR como Funcional. Esses status e as afirmações de implementação nas seções 1, 2, 5, 8 e 12 precisam corresponder a este recorte. O PDF diz que o gestor reabre jornadas, enquanto a regra aprovada para esta implementação permite ao profissional suspender, concluir e reabrir. O relatório e o ADR devem refletir essa regra antes da entrega. Cancelamento não está implementado.

Os pacotes antigos de 63 etapas contêm a versão mais ampla. Não aplicá-los nesta pasta. Novos pacotes devem partir do recorte verificado, preservando os arquivos completos de referência para o P4.

## Verificação local em 22/11/2026

Passaram a instalação limpa, a sintaxe de 14 arquivos JavaScript, o lint, os 16 testes de API com PostgreSQL e o build. O pacote de execução foi instalado em outra pasta com `npm ci --omit=dev`, iniciado com um schema vazio de teste e conferido por HTTP.

Também foi executado um roteiro automatizado no Microsoft Edge: busca e criação pelo profissional, registro de pendência, leitura em uma sessão independente de paciente, resolução e progresso após recarga, suspensão, reabertura e logout. Não ocorreram erros de JavaScript nesse roteiro. A jornada foi conferida sem transbordamento horizontal em 360, 768 e 1440 pixels. Isso não substitui uma avaliação de acessibilidade ou usabilidade.

As evidências foram salvas ao lado da pasta do recorte. Ainda não houve execução do CI no GitHub, publicação de tag ou validação do relatório compartilhado para esta versão.

# Cenários de verificação dos encaminhamentos

Execute os cenários com a aplicação e o PostgreSQL em funcionamento. Use apenas as contas sintéticas e compare o protocolo do encaminhamento nos três perfis. As capturas devem ser feitas na versão que será entregue, depois da execução; este roteiro não substitui evidência real.

## 1. Registrar encaminhamento

1. Entre como Secretariado (`secretariado@fluxsus.demo`, senha `123456`).
2. Abra **Novo encaminhamento**, escolha paciente, jornada e etapa disponíveis, informe destino e data e registre.
3. Confira na lista o protocolo, a situação **Solicitado**, o paciente, a jornada, a etapa, o destino, a data, quem registrou e quando.

## 2. Conferir a propagação para os outros perfis

1. Guarde o protocolo mostrado na lista do Secretariado.
2. Saia e entre como Profissional (`profissional@fluxsus.demo`). Abra a mesma jornada e localize o protocolo na área **Encaminhamentos da jornada**.
3. Saia e entre como o paciente dono da jornada. Abra **Minha jornada** e localize o mesmo protocolo em **Atualizações do Secretariado**.
4. Compare protocolo, paciente, título da jornada, etapa, destino, situação e data nos três perfis.

## 3. Devolver com motivo

1. Como Secretariado, atualize o encaminhamento para **Devolvido** e informe um motivo objetivo.
2. Confira que não é possível confirmar a devolução sem motivo.
3. Na lista do Secretariado, confirme motivo, autoria e horário. Nos perfis do Profissional e do paciente, confirme o mesmo protocolo, motivo, responsável **Secretariado** e a ação de conferir e reenviar o documento.
4. Verifique também a pendência administrativa vinculada à etapa na jornada. Ela deve impedir o avanço enquanto estiver aberta.

## 4. Reenviar e conferir a resolução

1. Como Secretariado, atualize o encaminhamento devolvido para **Solicitado**.
2. Confirme que a pendência ligada ao protocolo foi resolvida e que o histórico mostra a atualização.
3. Confira, na jornada do paciente e na consulta profissional, o novo estado e que a pendência correspondente não aparece mais como aberta.
4. Se a etapa tiver outra pendência aberta sem relação com esse protocolo, confirme que ela continua aberta.

## 5. Seguir o fluxo até o fim

1. Avance o mesmo encaminhamento por **Aguardando agendamento**, **Agendado** e **Realizado**.
2. Depois de cada atualização, confira o mesmo protocolo e a situação nos outros dois perfis.
3. Confirme que **Realizado** não oferece novas transições.

## 6. Conferir o limite de acesso

Com a sessão do Secretariado, tente abrir `GET /api/estado` e confirme a resposta de acesso negado. As rotas de encaminhamento devem continuar funcionando sem expor os dados clínicos completos da jornada.

## Capturas a guardar

Depois de executar os cenários, guardar capturas reais e legíveis, sem dados pessoais reais:

- `prints/54-encaminhamento-secretariado.png` — lista com protocolo, situação, destino, autoria e horário.
- `prints/55-encaminhamento-devolvido.png` — devolução com motivo e ação administrativa.
- `prints/56-encaminhamento-paciente.png` — mesmo protocolo e pendência na jornada do paciente.
- `prints/57-encaminhamento-profissional.png` — mesmo protocolo na jornada consultada pelo profissional.
- `prints/58-encaminhamento-reenviado.png` — estado após reenvio e pendência vinculada resolvida.

Registre no relatório quais cenários foram executados, a versão/commit conferido e os nomes das capturas geradas. Não marque cenário como aprovado antes de executá-lo.

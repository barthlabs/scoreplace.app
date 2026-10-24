# Substituição durante o torneio

Decisão do organizador: uma troca direta pode ocorrer depois de outros jogos da dupla terem placar e até com o jogo atual já chamado para a quadra. Se o jogo atual tem placar parcial, a troca espera a correção ou o encerramento desse placar. A operação é transacional e relê os documentos antes de alterar a vaga.

O botão **Trocar participante** é uma substituição de pessoa, inclusive quando ambas as inscrições são manuais. Ele cria uma identidade nova para quem entra e retira a inscrição antiga. Para corrigir a grafia da mesma pessoa inscrita manualmente, o organizador usa o lápis ao lado do nome na tela **Inscritos**; esse controle chama `renameTournamentParticipant`. O nome de quem tem conta é alterado pela própria pessoa no perfil. A presença e a ausência anteriores continuam ligadas à pessoa original; quem entra registra a própria presença.

Para substituir, o organizador clica no nome da vaga ativa na **Análise**, em **Inscritos** ou na **Chave**. As três entradas abrem a mesma confirmação. A troca aceita manual→manual, manual→conta, conta→manual e conta→conta. Digita-se o nome de destino e escolhe-se explicitamente se ele será uma inscrição manual ou uma conta encontrada pelo nome; a opção de conta leva o UID, que o servidor confere novamente. O clique no nome de um jogo concluído não oferece substituição para aquele jogo histórico.

Jogos concluídos mantêm a formação original, os nomes, o placar e os horários. Jogos atuais sem placar e futuros usam a nova identidade. O `fixedPairId` continua representando a vaga competitiva da dupla: o histórico de adversários segue com a vaga para evitar pareamento repetido. O histórico de W.O. permanece como evento anterior, sem ser atribuído à pessoa nova. Uma classificação congelada que referencia nominalmente a pessoa ou a dupla bloqueia a substituição; nesse formato ainda não há reconciliação segura dos pontos.

O torneio encerrado usa `status: 'finished'` no fluxo de encerramento (`js/views/bracket-logic.js`); a substituição é recusada nesse estado.

O organizador escolhe o desfecho esportivo. A troca direta não aplica W.O. O W.O. individual com suplente e o W.O. da dupla são ações próprias no jogo, com seus fluxos de confirmação e resultado. Se não houver suplente elegível, o W.O. individual falha sem gravar derrota; cabe ao organizador escolher o W.O. da dupla separadamente. Entre suplentes elegíveis, o motor ainda segue a ordem da espera configurada; a escolha nominal de outro suplente exige um fluxo próprio.

Ao publicar a mudança da callable, uma aba antiga ainda aberta pode chamar a versão anterior da tela sem `operation: 'replace'` e receber `invalid-argument`. Atualizar a página carrega a tela nova. A publicação deve atualizar o servidor e o Hosting em sequência, e a operação de troca só é anunciada como disponível após a versão servida ser confirmada.

O teste de emulador `tests/edit-canonical-slot-emulator.test.js` cobre as quatro combinações de identidade manual/conta, jogo anterior concluído, jogo atual chamado sem placar, presença e histórico preservados, além dos bloqueios para classificação nominal, rodadas embutidas e histórico de W.O.

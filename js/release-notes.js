// scoreplace.app — Release notes (lazy-loaded)
// Loaded on demand when the user opens "Notas de versões" in help modal.
//
// Convenção de versão (a partir de 30 Abr 2026): MAJOR.MINOR.PATCH-channel.
// Em beta, PATCH incrementa a cada release (1.0.3-beta → 1.0.4-beta).
// Histórico completo da fase alpha → beta exportado pra
// docs/scoreplace_relatorio_alpha_to_beta.docx (registro local do dono).
// Histórico completo da fase beta → 1.0 (385 notas, 29 Abr → 13 Jul 2026)
// exportado pra docs/scoreplace_relatorio_beta_to_1.0.docx — a partir da v1.0
// o app mostra só as notas de 1.0 em diante.

window._RELEASE_NOTES_HTML = (function () {
  var html =
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📋 v1.3.16 — Chamada direto na tela do torneio <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(19 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>👥 Fim da página duplicada:</b> pro organizador, a chamada (marcar Presente/Ausente + W.O.) agora acontece <b>direto na tela do torneio</b> — em torneios individuais e de duplas. Cada inscrito tem o toggle e o W.O. no próprio card, e a contagem de presentes/ausentes fica presa no topo da lista. O botão "Inscritos / Chamada" saiu (era uma segunda tela pro mesmo trabalho).</li>' +
        '<li style="color:var(--text-muted);">A tela de inscritos do participante continua igual.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #94a3b8;border-radius:12px;padding:14px 16px;background:rgba(148,163,184,0.08);">' +
      '<div style="font-weight:800; color:#cbd5e1; font-size:1rem; margin-bottom:8px;">🧹 v1.3.15 — Detalhe do torneio mais limpo <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(19 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⏱️ Duração estimada sem repetição:</b> a tabela de simulações (8/16/32/64 inscritos) saiu do detalhe — ela é planejamento e fica na tela de <b>edição</b>. No detalhe fica só a <b>Estimativa de duração real</b> (com o número atual de inscritos), abaixo da contagem regressiva.</li>' +
        '<li><b>📋 Chamada mais direta:</b> o box "Chamada antes do sorteio" saiu — o sorteio já tem seu botão próprio (🎲 Sortear), que decide o que fazer com os ausentes. A contagem de presentes/ausentes continua no topo da lista.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.08);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">✅ v1.3.14 — Presença marca a pessoa certa (por identidade, não por nome) <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(19 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>👥 Dois jogadores com o mesmo nome não se confundem mais:</b> ao marcar <b>Presente</b> (na chave, na lista de espera e na lista de inscritos), a presença agora é registrada pela <b>identidade</b> de cada pessoa — nunca pelo nome. Antes, com dois homônimos, marcar um podia marcar o outro. Corrigido em todas as telas de check-in.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #a855f7;border-radius:12px;padding:14px 16px;background:rgba(168,85,247,0.08);">' +
      '<div style="font-weight:800; color:#c084fc; font-size:1rem; margin-bottom:8px;">🎾 v1.3.13 — Tie-break respeita a configuração do torneio <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(19 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Os campos do tie-break aparecem no placar certo:</b> quem manda no gatilho é a <b>configuração de pontuação do torneio</b> (games por set). Num set de <b>6 games</b>, o tie-break é no <b>6-6</b> → placar final <b>7-6</b> — é aí que os campos de pontos do TB aparecem. Num set de <b>5 games</b>, é no <b>5-5</b> → <b>6-5</b>. Nada de abrir o TB num 6-5 quando o set é de 6 games. Você digita o placar final de games e preenche os pontos do tie-break.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.08);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">📡 v1.3.11 — Placar ao vivo: escolher o sacador ficou simples <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 1º sacador com um toque:</b> ao iniciar o placar ao vivo, você escolhe quem saca primeiro <b>tocando no nome</b> (ele ganha uma borda e a bolinha da modalidade ao lado). <b>Iniciar</b> (verde, à direita) começa a partida com esse sacador; <b>Fechar</b> (à esquerda) começa sem rastrear saque.</li>' +
        '<li><b>🔁 2º sacador entre o 1º e o 2º game:</b> nas duplas, ao terminar o 1º game aparece uma tela igual, só com os <b>dois jogadores do outro time</b>, pra você indicar quem saca o 2º game e tocar em <b>Confirmar</b>.</li>' +
        '<li><b>📱 Cabe em qualquer tela:</b> os botões ficam fixos no topo e a lista rola quando precisa — nada de jogador ou botão cortado fora da tela em celular menor.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">✅ v1.3.10 — Aprovar placar volta a funcionar (duplas) <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>✅ "Confirmar" confirma de novo:</b> quando um time lançava o placar, o adversário (em duplas) às vezes não conseguia <b>Confirmar/Contestar</b> — o app não reconhecia de que lado a pessoa estava. Corrigido: agora o reconhecimento é <b>pela conta (login) de cada jogador</b>, então cada um dos quatro é identificado certo, mesmo com nomes parecidos ou dupla renomeada.</li>' +
        '<li><b>🔒 Um placar por vez:</b> depois que um lado lança, o campo de placar do <b>outro lado trava</b> — ele só <b>Confirma, Edita ou Contesta</b>, sem lançar um placar concorrente por cima. Fim do vai-e-volta que deixava o jogo preso.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.08);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔢 v1.3.9 — A primeira rodada é sempre R1 (nunca R0) <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🔢 Fim do "Rodada 0":</b> em torneios com <b>repescagem</b>, a primeira rodada aparecia como "Rodada 0" em alguns cards (tela inicial). Agora a contagem começa sempre em <b>R1</b> — a primeira rodada é R1 (seja ela oitavas, quartas ou semi), a próxima R2, e assim por diante.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fbbf24;border-radius:12px;padding:14px 16px;background:rgba(251,191,36,0.08);">' +
      '<div style="font-weight:800; color:#fcd34d; font-size:1rem; margin-bottom:8px;">📝 v1.3.8 — Inscrições da fase não fecham por surpresa + controle ao vivo <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>✅ A eliminatória segue a inscrição que você abriu:</b> se você deixou as inscrições <b>abertas</b> (suplentes ou novos confrontos) na fase inicial, a <b>eliminatória agora herda</b> essa regra por padrão — em vez de fechar sozinha e recusar quem tentava se inscrever. Quer que a eliminatória tenha regra <b>própria</b>? É só ajustar no painel dela, como antes.</li>' +
        '<li><b>⏱️ Abrir/fechar a inscrição da fase <b>ao vivo</b>:</b> nas Ferramentas do Organizador, com o torneio já em andamento, apareceu um controle <b>Fechadas · Suplentes · Novos Confrontos</b> pra você mudar a inscrição da fase atual <b>a qualquer momento</b> — inclusive reabrir uma fase que estava fechada.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f87171;border-radius:12px;padding:14px 16px;background:rgba(239,68,68,0.08);">' +
      '<div style="font-weight:800; color:#fca5a5; font-size:1rem; margin-bottom:8px;">🚫 v1.3.7 — Faltou alguém da dupla? O desfecho é combinado <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🤝 Desfecho do W.O. negociado entre os times:</b> nas eliminatórias com placar lançado pelos jogadores, quando <b>um jogador de uma dupla</b> não pôde vir (e o parceiro segue no jogo), o desfecho deixa de ser decidido no automático. Depois que o outro time <b>confirma a falta</b>, <b>quem ficou no jogo propõe</b> como ele continua — <b>puxar um suplente</b> da lista de espera, seguir com um <b>"Jogador X"</b> no lugar do ausente, ou <b>desclassificar</b> (o adversário avança). O time adversário <b>aceita ou rejeita</b>. Não chegando a um acordo, o <b>organizador decide</b>. O organizador também pode resolver a qualquer momento.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #60a5fa;border-radius:12px;padding:14px 16px;background:rgba(96,165,250,0.08);">' +
      '<div style="font-weight:800; color:#93c5fd; font-size:1rem; margin-bottom:8px;">⏱️ v1.3.4 — Estimativa de duração logo abaixo da regressiva <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⏱️ Quanto tempo o torneio deve durar:</b> logo abaixo da contagem regressiva — na tela inicial e na página do torneio — aparece a <b>estimativa de duração</b> pro número atual de inscritos, com o total de jogos previsto e a duração em <b>dias · horas · min</b>. Ex.: "(21 participantes / 20 jogos) — 00:04:30". Aparece mesmo quando o torneio já tem hora de término definida (ajuda a comparar o previsto com o planejado). Some sozinha só em Pontos Corridos/temporada ou com menos de 2 inscritos.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25D366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.08);">' +
      '<div style="font-weight:800; color:#25D366; font-size:1rem; margin-bottom:8px;">💬 v1.3.1 — Entrar no grupo do WhatsApp bem na sua frente <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(18 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 "Entrar no grupo" ao lado de "Desinscrever-se":</b> quando o torneio já tem grupo do WhatsApp, o botão de entrar aparece logo à esquerda do "Desinscrever-se" — tanto na tela inicial quanto na página do torneio. Fica na cara de quem está inscrito, sem precisar caçar o link.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #34d399;border-radius:12px;padding:14px 16px;background:rgba(52,211,153,0.08);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">👥 v1.2.44 — Organizador inscrito volta a aparecer entre os inscritos <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>👥 A lista de inscritos mostra todo mundo:</b> quando o organizador se inscrevia no próprio torneio, o card dele sumia da lista — o topo dizia "14 inscritos" e apareciam 13, enquanto o botão dele já dizia "Desinscrever-se". Agora quem está inscrito aparece, sempre: organizador e co-organizador inclusive. <b>Organizar não desinscreve ninguém</b> — a lista mostra exatamente quem está inscrito.</li>' +
        '<li><b>🔐 Quem é quem não depende mais de e-mail nem de nome:</b> o app identificava participante e organizador comparando e-mail ou nome. Isso errava a pessoa quando dois inscritos dividem o mesmo e-mail (casal, família), quando alguém trocou de e-mail ou refez a conta, ou quando dois jogadores têm nomes iguais — a ponto de um inscrito comum poder aparecer como organizador. Cada pessoa com conta agora é reconhecida pela conta dela, e só por ela.</li>' +
        '<li><b>✅ Botão "Inscrever-se / Desinscrever-se" confiável:</b> pela mesma razão, o botão podia dizer que você estava inscrito num torneio de um homônimo — e a desinscrição saía por esse mesmo caminho. Corrigido.</li>' +
        '<li><b>🙋 Jogador convidado (sem conta) segue pelo nome:</b> quem o organizador cadastra na mão, sem conta no app, continua sendo identificado pelo nome digitado — como sempre foi.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #fb923c;border-radius:12px;padding:14px 16px;background:rgba(251,146,60,0.08);">' +
      '<div style="font-weight:800; color:#fb923c; font-size:1rem; margin-bottom:8px;">⏱️ v1.2.37 — O relógio e o número do jogo agora falam a verdade <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎲 Regressiva pro sorteio:</b> na Liga/Pontos Corridos, antes do 1º sorteio o relógio agora conta pro <b>sorteio</b> — e diz "Próximo sorteio", não "Início da Temporada" quando a temporada já começou. Antes ele podia mostrar "Fim do torneio" mesmo faltando o sorteio.</li>' +
        '<li><b>▶️ Rodada em andamento não some mais:</b> com um jogo rolando, o box mostra a rodada e o tempo — a regressiva de fim de torneio não esconde mais isso.</li>' +
        '<li><b>👑 "Jogo N" bate com a chave:</b> no Rei/Rainha, o card "Próximo Jogo" da tela inicial mostrava um número diferente do que aparecia no chaveamento (ex.: 73 em vez de 19). Agora os dois vêm da mesma fonte e sempre coincidem.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #58a6ff;border-radius:12px;padding:14px 16px;background:rgba(88,166,255,0.08);">' +
      '<div style="font-weight:800; color:#58a6ff; font-size:1rem; margin-bottom:8px;">↺ v1.2.34 — Voltar pro padrão sugerido com um clique <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(17 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>↺ Restaurar sugestão (Pontos Avançados):</b> na criação/edição do torneio, um botão volta todos os valores e chaves da pontuação (participação, vitória, games, tie-break, W.O., etc.) pros números sugeridos pelo app — sem precisar ajustar campo por campo.</li>' +
        '<li><b>↺ Restaurar padrão (Critérios de Desempate):</b> outro botão devolve os critérios e a ordem deles pro arranjo sugerido, incluindo o que fica em "não considerados". Mexeu demais e quer recomeçar? Um clique resolve.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#818cf8; font-size:1rem; margin-bottom:8px;">📞 v1.2.30 — Novo canal do desenvolvedor <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(16 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📞 Fale com o Desenvolvedor:</b> o WhatsApp de contato mudou para <b>+55 11 98772-6873</b>. O botão verde no app já aponta pro número novo — é só clicar e falar com a gente.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25D366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.08);">' +
      '<div style="font-weight:800; color:#25D366; font-size:1rem; margin-bottom:8px;">💬 v1.2.24 — O grupo do WhatsApp entra no app <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 Grupo do jogo:</b> no seu jogo do chaveamento agora tem <b>Criar grupo</b>. Você cria um grupo vazio no WhatsApp, cola o link de convite no app — e os outros jogadores daquele jogo passam a ver <b>Abrir grupo</b>. Ninguém precisa salvar o telefone de ninguém, e nenhum telefone é exposto.</li>' +
        '<li><b>🏆 Grupo do torneio:</b> o organizador cria o grupo oficial nas Ferramentas do Organizador, e quem está inscrito ganha o botão <b>Entrar no grupo</b>. A tela ensina a deixar o grupo só seu: mural (só admin escreve) e <b>Aprovar novos membros</b>, que é a trava de quem entra.</li>' +
        '<li><b>⭐ Favoritos e torneios ocultados agora seguem a sua conta:</b> antes moravam só no navegador e sumiam sozinhos (o iPhone limpa esse armazenamento de tempos em tempos) ou não apareciam em outro aparelho. Agora entram junto com o seu login, em qualquer celular ou computador.</li>' +
        '<li><b>📊 Análise de Inscritos no celular:</b> as colunas Feminino e Masculino cabem na tela (a de Masculino ficava cortada), os nomes ficaram menores e o botão de criar categoria aparece em todas as habilidades.</li>' +
        '<li><b>🎯 Chaveamento:</b> os botões de um mesmo jogo ficam todos na mesma altura e não pulam mais pra linha de baixo; e ao abrir o torneio a tela para sempre no mesmo ponto do seu grupo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.08);">' +
      '<div style="font-weight:800; color:#6ee7b7; font-size:1rem; margin-bottom:8px;">🔑 v1.2.10 — Esqueceu a senha e o e-mail não chega? Agora tem saída <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📱 Voltou o "Redefinir por celular".</b> Em "Esqueci minha senha", se a sua conta tem celular cadastrado, agora aparece o botão pra receber um <b>código por SMS</b> e trocar a senha. O caminho existia, mas estava escondido por um erro nosso — ninguém conseguia chegar nele.</li>' +
        '<li><b>⚠️ Hotmail, Outlook, UOL, BOL, Terra:</b> esses provedores costumam segurar nosso e-mail. Agora o app <b>avisa</b> e já oferece o SMS como caminho recomendado, em vez de mandar o link e deixar você esperando um e-mail que talvez nunca chegue.</li>' +
        '<li><b>✅ Fim de um aviso errado.</b> Se você tocasse duas vezes seguidas em "Esqueci minha senha", o app dizia que tinha mandado um <b>SMS</b> — mas não tinha mandado nada. Agora só falamos do que realmente saiu.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">💬 v1.2.9 — WhatsApp: agora é você quem manda <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(15 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 O grupo do jogo e do torneio continua igual:</b> você cria o grupo no seu WhatsApp, cola o link no app e todo mundo entra num toque. Nada muda aqui — é o caminho que não depende de ninguém além de você.</li>' +
        '<li><b>📵 O app parou de mandar mensagem por WhatsApp.</b> O número que enviava foi bloqueado pelo WhatsApp e não volta. Em vez de prometer o que não chega, tiramos: seus avisos vão por <b>notificação no app</b> e <b>e-mail</b>, que sempre funcionaram.</li>' +
        '<li><b>🔑 Login e senha por celular agora são só por SMS.</b> Se o SMS não sair, o app <b>avisa na hora</b> e mostra a saída pelo e-mail — antes ficava um aviso discreto porque o WhatsApp era o plano B.</li>' +
        '<li><b>⚙️ O botão "WhatsApp" no seu perfil mudou de sentido:</b> antes ligava o envio de avisos; agora diz se <b>você aceita ser chamado no WhatsApp</b> — pelo organizador, pelos outros jogadores, e se entra nos grupos. Desligou? Falam com você por e-mail e pelas notificações do app. Quem já tem celular cadastrado continua ligado, como estava.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">📊 v1.1.24 — Seu histórico ficou mais interessante <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📊 Seu retrospecto:</b> no Histórico de jogos agora aparece <b>com quem você mais joga</b> e <b>contra quem</b>, com seu aproveitamento ao lado de cada um — algo que o letzplay não mostra. Acompanha os filtros: escolha um torneio e veja o retrospecto só dele.</li>' +
        '<li><b>🏆 Nome real do torneio:</b> os jogos importados agora exibem o nome verdadeiro da competição, não só a categoria.</li>' +
        '<li><b>📅 Data certa em qualquer país:</b> jogo de 07/08 aparecia como 06/08 dependendo do fuso. Corrigido no mundo todo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">⏳ v1.1.20 — Busca com tempo na tela <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⏳ Quanto falta, na tela:</b> as três buscas (verificar, completa e importar o seu histórico) mostram um cronômetro regressivo que se ajusta sozinho — e chega a zero exatamente quando chega a 100%.</li>' +
        '<li><b>🐢 Se o letzplay pedir calma, o tempo sobe:</b> a espera entra na conta em vez de o número mentir. 100 inscritos na verificação levam ~14min.</li>' +
        '<li><b>📚 Busca completa num job só:</b> o organizador puxa o histórico de todos os inscritos de uma vez, começando pelos mais desatualizados. Mostra quanto falta, dá pra <b>interromper quando quiser</b>, e cada pessoa é salva assim que fica pronta — nada do que já veio se perde.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">🐢 v1.1.19 — Busca do letzplay que não mente <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🟢 Quem foi verificado aparece verde:</b> se o nível veio do próprio letzplay, o nome fica verde na hora — antes só saía do roxo depois que a própria pessoa entrasse no app, o que podia nunca acontecer.</li>' +
        '<li><b>👤 A busca já preenche o perfil do inscrito:</b> gênero, nível e histórico entram direto, sem depender de o jogador logar.</li>' +
        '<li><b>🐢 Navegação no ritmo de gente:</b> a busca agora vai no compasso de quem lê a página, com pausas irregulares, e <b>aprende</b> o limite do letzplay — se ele pede calma, o app desacelera e <b>não esquece</b> na próxima vez. Demora mais e traz tudo.</li>' +
        '<li><b>🚫 Fim da "busca concluída" sem trazer nada:</b> quando o letzplay bloqueia, o app mostra que está esperando em vez de parecer travado, e nunca mais dá a busca por completa sem os jogos.</li>' +
        '<li><b>⬇️ Extensão a um clique:</b> botão pra baixar a versão certa, e o app avisa se a sua estiver velha (a antiga desistia calada e não trazia os jogos).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">⚡ v1.1.17 — Casual, presença e análise mais espertas <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(14 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⚡ Partida casual lembra sua última configuração:</b> a modalidade e o placar que você usou por último voltam já selecionados — chega de começar e só perceber no primeiro ponto que estava em Pickleball em vez de Beach Tennis.</li>' +
        '<li><b>📍 "Cheguei pra jogar":</b> ao chegar num local, o app pergunta com os <b>botões de modalidade</b> (como no "planejar ida") já marcados com o que você jogou por último — não mais todas as modalidades de uma vez. É só confirmar ou ajustar.</li>' +
        '<li><b>🟣 "Autorizado" na análise de inscritos:</b> na tela do organizador, quem tem o letzplay no perfil e <b>autorizou</b> a importação aparece em <b>violeta</b>; quem não autorizou fica em branco. O cinza "sem verificação" saiu.</li>' +
        '<li><b>⚠️ W.O. contestado avisa a organização inteira:</b> ao contestar um W.O., agora o <b>organizador e os co-organizadores</b> são notificados — antes só o criador do torneio sabia.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #22c55e;border-radius:12px;padding:14px 16px;background:rgba(34,197,94,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">📱 v1.1.12 — Verificar celular e recuperar conta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📲 O SMS de verificação volta a chegar:</b> o botão <b>"Verificar e vincular"</b> do celular no perfil estava dando <b>erro interno</b> e o código não era enviado. Corrigido — o SMS sai normalmente agora.</li>' +
        '<li><b>🔀 Recuperar sua conta ao reinstalar o app:</b> se você entrar com um nome que já era seu (mesmo telefone ou e-mail), o app agora oferece <b>unir as contas</b> em vez de bloquear com "esse nome já é de outra pessoa".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #84cc16;border-radius:12px;padding:14px 16px;background:rgba(132,204,22,0.08);">' +
      '<div style="font-weight:800; color:#a3e635; font-size:1rem; margin-bottom:8px;">🎾 v1.1.3 — Nome real dos torneios do letzplay <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🏷️ Nome de verdade nas estatísticas:</b> jogos importados do letzplay agora mostram o <b>nome real do torneio</b> (não mais só a categoria tipo "Masculina D") no Histórico, no gráfico de forma e no card "Seu nível". Reimporte para preencher os nomes nos jogos antigos (extensão v1.29).</li>' +
        '<li><b>📇 Card "Seu nível" mais legível:</b> <b>OFICIAL (torneio)</b> mostra só <b>nome + data</b> (uma linha, nomes longos quebram linha); <b>RANKING</b> mostra o <b>saldo</b> (um número, V−D) à direita. Liga/Pontos Corridos entra como ranking, não como torneio.</li>' +
        '<li><b>🔁 Reimportar não regride:</b> se a reimportação não trouxer nada novo (ou o letzplay limitar a leitura), o histórico é <b>mantido</b> e só a data da conferida é atualizada — nunca apaga nomes já resolvidos.</li>' +
        '<li><b>⏱️ Importação sem "limite de requisições":</b> o app agora <b>espaça as buscas e repete</b> quando o letzplay responde 403/429 (muitas leituras de uma vez) — resolve o erro que impedia o nome real de vir. Se ainda aparecer, é só esperar ~1 min.</li>' +
        '<li><b>🔎 Erro de importação com dica:</b> quando a importação falha, o app explica o que houve e mostra os <b>detalhes técnicos</b> (qual endereço/erro) — fim do "deu erro e não sei por quê".</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⌚ v1.1 — Placar no relógio <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⌚ Apple Watch e Wear OS:</b> controle o <b>placar ao vivo</b> direto do relógio — marque ponto de cada time, desfaça, resolva empates (prorrogar/tie-break) e, em partida casual, jogue novamente. O relógio espelha o placar do celular em tempo real, com a bola no sacador; toda a regra continua no celular (fonte única).</li>' +
        '<li><b>📲 Instalação simples:</b> o app do relógio agora acompanha o app do iPhone/Android — aparece pra instalar (ou instala sozinho) sem precisar procurar na lojinha do relógio.</li>' +
        '<li><b>🎾 Sacador em sincronia:</b> ao trocar o sacador no celular, o relógio reflete na hora.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #10b981;border-radius:12px;padding:14px 16px;background:rgba(16,185,129,0.08);">' +
      '<div style="font-weight:800; color:#34d399; font-size:1rem; margin-bottom:8px;">🔊 v1.0.9 — Sons nos momentos-chave <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🔊 Feedback sonoro:</b> sons discretos nos momentos que importam — <b>sino</b> ao concluir sortear/inscrever/adicionar participante, <b>apito</b> ao iniciar a partida ao vivo, toques ao fechar <b>game/set</b>, <b>torcida</b> ao vencer a partida e uma pequena fanfarra quando o torneio <b>sagra o campeão</b>. Tudo gerado no app, sem download.</li>' +
        '<li><b>⚙️ Liga/desliga no Perfil:</b> novo toggle <b>"Sons"</b> na aparência do perfil, <b>desligado por padrão</b>. Fica em silêncio se o aparelho estiver no mudo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #818cf8;border-radius:12px;padding:14px 16px;background:rgba(129,140,248,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">📳 v1.0.8 — Vibração no toque <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>📳 Vibração ao tocar:</b> todo botão e toggle do app agora dá um tique de vibração ao ser tocado. Nos apps instalados (iPhone e Android) usa o motor de vibração real do aparelho; no navegador Android usa a vibração do sistema.</li>' +
        '<li><b>⚙️ Liga/desliga no Perfil:</b> novo toggle <b>"Vibração"</b> na seção de aparência do perfil, <b>ligado por padrão</b>. Desligar silencia a vibração no aparelho.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🏷️ v1.0.4 — Importe seu histórico do letzplay + Estatísticas repaginadas + Análise de Inscritos anti-gato <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(13 de Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Traga seu histórico do letzplay:</b> uma extensão do Chrome (desktop) importa seus jogos do letzplay pro scoreplace, na sua sessão logada — eles entram no seu <b>Histórico de jogos</b> unificado (letzplay + scoreplace), com os nomes reais de parceiros e adversários. O botão <b>"Importar do letzplay"</b> aparece no <b>Perfil</b> (abaixo da conta letzplay) e nas <b>Estatísticas</b>; no celular ele fica desabilitado com o aviso de que a importação é feita no computador.</li>' +
        '<li><b>📊 Estatísticas repaginadas:</b> novo <b>gráfico de Forma</b> (sobe e desce) com slider de janela temporal (tudo ↔ última semana), marcos de data e filtro Geral / Rankings / Torneios. As <b>barras</b> e os <b>Top parceiros/adversários</b> somam letzplay + scoreplace, lado a lado; o card <b>"Seu nível (geral)"</b> mistura as duas fontes.</li>' +
        '<li><b>🗂️ Análise de Inscritos repaginada — "Categorias · apuração pelo letzplay":</b> matriz <b>Gênero × Categoria</b> com os inscritos agrupados por habilidade, cada nome <b>pintado pela verificação</b> do letzplay (🟢 coerente · 🟡 pode subir · 🔴 deve subir · 🔵 rebaixar · ⚪ sem verificação). A busca do organizador puxa o <b>perfil inteiro</b> (rankings com a banda real + torneios + jogos), em modo <b>Essencial</b> ou <b>Completa</b>.</li>' +
        '<li><b>⚖️ Anti-gato pela regra da federação:</b> só quem <b>domina</b> (título ou topo da tabela) numa categoria igual/mais fácil é sinalizado pra subir. Estar ranqueado numa banda acima sem dominar é permitido — competir acima pode, abaixo não.</li>' +
        '<li><b>➕ Criar categorias direto da matriz:</b> botões formalizam categorias por <b>gênero</b> e por <b>habilidade</b>, com o box "Categorias no torneio" mostrando a contagem; arraste os inscritos entre categorias pra estudar a divisão.</li>' +
        '<li><b>🎚️ Rigor da inscrição:</b> ao criar/editar um torneio você define, no topo das Categorias, o quão exigente é a inscrição — de <b>Casual</b> (não liga pro histórico) a <b>Oficial</b> (exige perfil/histórico compatível).</li>' +
      '</ul>' +
    '</div>';
  return html;
})();

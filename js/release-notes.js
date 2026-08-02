// scoreplace.app — Release notes (lazy-loaded)
// Loaded on demand when the user opens "Notas de versões" in help modal.
//
// Convenção de versão (a partir de 30 Abr 2026): MAJOR.MINOR.PATCH-channel.
//
// ⚠️ NOTAS RESUMIDAS POR VERSÃO NATIVA (a partir de jul/2026, pedido do dono):
// as notas mostradas ao usuário são CONSOLIDADAS no nível da versão nativa/loja
// (MINOR — 1.0, 1.1, 1.2, 1.3…) — UMA nota-resumo por minor, com os destaques
// agrupados por tema. NÃO ter mais nota detalhada por patch (1.x.y). Cada patch
// bumpado no dia continua no changelog técnico (git/commits); aqui o usuário vê o
// resumo da versão que foi/vai pra loja. Ao promover um novo minor, dobrar os
// destaques dos patches daquele ciclo num único bloco.
//
// Histórico completo da fase alpha → beta exportado pra
// docs/scoreplace_relatorio_alpha_to_beta.docx (registro local do dono).
// Histórico completo da fase beta → 1.0 (385 notas, 29 Abr → 13 Jul 2026)
// exportado pra docs/scoreplace_relatorio_beta_to_1.0.docx — a partir da v1.0
// o app mostra só as notas de 1.0 em diante.

window._RELEASE_NOTES_HTML = (function () {
  var html =
    '<div style="margin-bottom:1rem;border:2px solid #22d3ee;border-radius:12px;padding:14px 16px;background:rgba(34,211,238,0.08);">' +
      '<div style="font-weight:800; color:#67e8f9; font-size:1rem; margin-bottom:8px;">🌳 v1.6 — Chave enxuta, repescagem justa, histórico grande do letzplay e o treino do relógio contando <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🌳 Chave mínima, sem folga de graça:</b> a chave agora nasce do <b>tamanho real</b> do torneio, em vez de inflar até a próxima potência de 2. Com 12 duplas são 6 jogos, depois 3, 2 e a final — e o <b>último inscrito nunca folga</b>. Da 2ª rodada em diante a chave fecha redonda, sem BYE no meio do caminho.</li>' +
        '<li><b>🎟️ Repescagem justa e transparente:</b> a vaga de repescagem fica <b>vazia até a rodada inteira fechar</b> — nada de nome provisório que troca depois. Quem volta é o <b>melhor derrotado</b> segundo os critérios de desempate <b>do próprio organizador</b>, e a chave se corrige sozinha ao ser aberta.</li>' +
        '<li><b>⏱️ Quem chega depois entra na hora:</b> inscrição tardia (sozinho ou em dupla) vira <b>jogo de verdade</b> na mesma hora, na chave de cima e com o pouso certo na de baixo. Marcar presença depois do sorteio <b>sempre</b> gera o confronto — nunca mais fica ninguém de fora sem aviso.</li>' +
        '<li><b>🤝 Duplas sem mistura:</b> ninguém mais entra em duas duplas ao mesmo tempo. <b>Desfazer dupla</b> voltou a funcionar (antes falhava calado), desinscrever um dos dois <b>mantém o parceiro</b> como individual, e quem entra na chave passa a contar como inscrito de fato.</li>' +
        '<li><b>🧹 Chave mais limpa de ler:</b> BYE não vira mais card — a rodada mostra só confrontos verdadeiros, e o nome da rodada conta só os <b>jogos reais</b>. O avanço de fase parou de perguntar "Ajuste de Chaveamento" quando não há o que ajustar.</li>' +
        '<li><b>⌚ O treino do relógio agora CONTA:</b> a partida vira <b>exercício registrado</b> — no iPhone vai pro app Saúde (conta nos anéis de atividade) e no Android é gravado no <b>Health Connect</b>, entrando nos seus exercícios e na atividade diária. O relógio mostra os <b>batimentos ao vivo</b> durante o jogo e o esforço não é mais descartado no fim da partida. Os batimentos ficam no <b>alto do mostrador</b>, dentro de uma marca colorida pela <b>faixa de queima</b> (5 faixas, do azul ao vermelho) — dá pra ver o esforço de relance, sem tirar os olhos do placar.</li>' +
        '<li><b>⌚ Escolher quem saca, no pulso:</b> na tela de início, tocar num nome já <b>acende a escolha</b> (moldura na cor do time e a bolinha da modalidade ao lado) e tocar em outro troca — a confirmação sai no <b>Iniciar</b>. O mesmo vale na pergunta do <b>2º sacador</b>, entre o primeiro e o segundo game. Antes o toque não dava sinal nenhum de que tinha sido registrado.</li>' +
        '<li><b>📚 Histórico grande do letzplay agora vem inteiro:</b> trazer um histórico com centenas de jogos parava no meio e não gravava nada — funcionava só com perfis pequenos. Agora a leitura <b>não tem prazo</b>: ela vai até o fim, grava o que já leu a cada torneio e a cada punhado de páginas, e se o letzplay pedir uma pausa ela <b>continua sozinha de onde parou</b>, sem você clicar de novo. Testado com 472 e com 2.000 jogos. O botão virou <b>Suspender</b>: o que veio fica guardado e a próxima leitura retoma do ponto exato.</li>' +
        '<li><b>👑 Aceitar co-organização funciona (e dá pra tentar de novo):</b> o convite de co-organização estava sendo <b>recusado pelo servidor</b> pra todo convidado com conta — o organizador recebia "aceitou" e o card continuava em "Pendente de aceite". Agora o aceite passa pelo servidor de verdade, e os botões <b>Aceitar / Recusar</b> ficam na notificação <b>enquanto o convite estiver pendente</b>: se algo falhar, você responde de novo em vez de perder o convite.</li>' +
        '<li><b>🎾 Só conta como jogo o que foi jogado:</b> no histórico e na ficha do atleta, agora só aparece partida <b>com placar</b> — jogo apenas sorteado deixou de contar. Cada card mostra <b>parceiro e adversário</b> (antes aparecia "—", e às vezes a própria pessoa do outro lado), o placar sai do lado certo e vitória não é mais confundida com derrota. Torneios de teste do desenvolvedor não entram em estatística de ninguém.</li>' +
        '<li><b>⏸️ Torneio abandonado para de ocupar a tela:</b> torneio que ficou sem placar novo é <b>encerrado automaticamente</b> — e o organizador é avisado <b>48h antes</b>, com o que resolve: preencher as datas de início e término mantém o torneio ativo. Encerrar assim <b>não fecha a classificação</b> (sem pódio, sem título, sem troféu) e o organizador pode <b>reabrir</b> a qualquer momento informando as datas, pra concluir normalmente. Pontos Corridos nunca é encerrado por isso — é temporada contínua. Torneio que nunca teve nenhum jogo simplesmente sai da vitrine, sem ser encerrado.</li>' +
        '<li><b>🗑️ Apagar um torneio apaga tudo dele:</b> os placares de um torneio apagado continuavam guardados e voltavam a aparecer no histórico das pessoas, como se o torneio ainda existisse. Agora somem junto.</li>' +
        '<li><b>🧽 Apagar informação do perfil agora vale:</b> esvaziar um campo do perfil (data de nascimento, cidade, gênero, modalidades, locais, CEPs) e salvar <b>apaga de verdade</b> — antes a informação voltava na próxima vez que você abria o perfil. A proteção que impede o perfil de sumir sozinho continua de pé: só apaga o que <b>você</b> apagou na tela.</li>' +
        '<li><b>📅 O convite mostra até quando o torneio vai:</b> em torneio com <b>duas fases</b>, o convite compartilhado (WhatsApp, e-mail, folheto) mostrava só as datas da <b>fase classificatória</b> — parecia que o torneio acabava antes da eliminatória começar. Agora a fase eliminatória tem o seu próprio <b>Término da fase</b> no criador de torneios, e o convite passa a mostrar a janela inteira: do início da classificatória ao fim da eliminatória. Em branco, nada muda — o torneio termina junto com a classificatória, como antes. O término pode ser ajustado <b>com a eliminatória já rolando</b>, pra estender ou antecipar o fim.</li>' +
        '<li><b>📌 Detalhes que incomodavam:</b> o aviso de "faltam N equipes" gruda no topo ao rolar (não some mais), o card não fica preso na tela se você soltar o arraste no meio, e o "meu jogo" rola até a posição certa sem cortar o topo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">✨ v1.5 — Entrada tardia madura, busca nas chaves e identidade blindada <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Entrada tardia sempre entra:</b> na Dupla Eliminatória, quem chega depois do sorteio entra <b>na hora</b> — vira um confronto novo que faz a chave crescer (nunca "passa de BYE" de graça), com repescagem no número ímpar. O painel de chaveamento sumiu pra Eliminatória: potência de 2 é resolvida <b>sozinha</b>; só o resto abre decisão.</li>' +
        '<li><b>🔎 Busca nas chaves e na classificação:</b> nova barra de busca no chaveamento e na tabela — ache seu jogo ou sua posição na hora. E a <b>sua linha aparece em verde</b> (nome e colocação) pra você se achar de relance.</li>' +
        '<li><b>🆔 Identidade pela conta, sem confusão de nomes:</b> excluir inscrito, desfazer dupla e registrar W.O. passam a usar a <b>conta</b> (uid) de cada pessoa — dois homônimos não se misturam, e trocar o nome no perfil não quebra nada. W.O. de time chaveia pelos <b>dois</b> membros.</li>' +
        '<li><b>🏷️ Categorias mais claras:</b> a categoria Misto virou um <b>indicador destacado</b> acima do grid (Fem · Misto · Masc centralizado), em vez de uma coluna solta.</li>' +
        '<li><b>🎯 Tie-break explicado:</b> o resumo do torneio agora diz <b>onde</b> o tie-break entra (5-5 ou 6-6), e o botão do grupo do WhatsApp aparece já no raio padrão.</li>' +
        '<li><b>📱 App iOS reconectado:</b> corrigida a conversa do app iOS com a nuvem (CORS <code>capacitor://</code>) — login e dados voltam a funcionar no aplicativo.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #6366f1;border-radius:12px;padding:14px 16px;background:rgba(99,102,241,0.08);">' +
      '<div style="font-weight:800; color:#a5b4fc; font-size:1rem; margin-bottom:8px;">🏆 v1.4 — Eliminatórias com repescagem redondas, do sorteio ao campeão <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Repescagem como deve ser:</b> a Dupla Eliminatória usa a <b>árvore mínima</b> (chaves superior e inferior espelhadas, sem BYE artificial) e quem chega atrasado entra <b>na hora</b>: o jogo novo nasce contra o <b>melhor derrotado</b> da 1ª rodada — já definido, sem "a definir" pendurado. Chegou um segundo atrasado antes do jogo acontecer? Os dois se enfrentam e o repescado <b>volta pro jogo original dele</b> na chave inferior.</li>' +
        '<li><b>⚖️ Desempate visível:</b> empate de saldo e pontos entre derrotados resolve pela <b>ordem dos jogos na tela</b> — o critério que o organizador consegue conferir olhando a chave.</li>' +
        '<li><b>🤝 Lista de espera viva:</b> formar dupla na espera coloca o time <b>direto na chave</b>, sem re-sortear e sem mexer em nenhum jogo existente; a chave inferior se reorganiza sozinha e nunca "some". Cada pessoa é reconhecida pela <b>conta</b> (uid) — ninguém entra duas vezes, nem com nome trocado.</li>' +
        '<li><b>📋 Presença de torneio estável:</b> marcações em rajada não se atropelam mais (cada toque grava só o próprio campo), com cores canônicas — <b>verde</b> presente, <b>azul</b> confirmado, âmbar "falta um da dupla".</li>' +
        '<li><b>🖥️ Sorteio 100% no servidor:</b> o sorteio, a formação de duplas e a integração de atrasados rodam na nuvem com tela de processamento — sem depender do celular do organizador, e o Cancelar restaura o elenco exatamente como estava.</li>' +
        '<li><b>🎯 Tie-break configurável</b> por torneio (dispara em 5-5 ou 6-6) valendo no placar ao vivo e no lançamento de resultado.</li>' +
        '<li><b>⏱️ Estimativa honesta:</b> a duração prevista do torneio conta <b>equipes efetivas</b> (14 duplas = chave de 14), não pessoas nem inscrições soltas.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #25D366;border-radius:12px;padding:14px 16px;background:rgba(37,211,102,0.08);">' +
      '<div style="font-weight:800; color:#4ade80; font-size:1rem; margin-bottom:8px;">🎾 v1.3 — Torneio ao vivo, grupo do WhatsApp e presença <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 Grupo do WhatsApp completo:</b> o organizador cria o grupo oficial e <b>notifica todos os inscritos</b> — no app, por e-mail (com o botão <b>"Entrar no grupo"</b>) e no celular; o e-mail chega em <b>todos</b> os seus e-mails vinculados. O botão de entrar fica na cara, ao lado do "Desinscrever-se", e o card mostra <b>quando</b> foi a última notificação.</li>' +
        '<li><b>📋 Chamada direto na tela do torneio:</b> marcar Presente/Ausente e W.O. no próprio card do inscrito, com a contagem presa no topo. E <b>você mesmo marca sua presença</b>: fica <b>verde (presente)</b> se o GPS confirmar que está no local, <b>azul (confirmado)</b> se for um "eu venho" — e o check-in no local vira presente sozinho.</li>' +
        '<li><b>🆔 Cada pessoa reconhecida pela conta, não pelo nome:</b> presença, aprovação de placar em duplas e os jogos do sorteio passam a usar a <b>identidade</b> de cada um — dois homônimos não se confundem mais, e trocar o nome no perfil não quebra os jogos.</li>' +
        '<li><b>🚫 Faltou alguém da dupla?</b> O desfecho do W.O. é <b>combinado entre os times</b> — puxar suplente, seguir com "Jogador X" ou desclassificar; o adversário aceita ou rejeita, e o organizador decide se não houver acordo.</li>' +
        '<li><b>📡 Placar ao vivo melhor:</b> escolha o 1º sacador com um toque (e o 2º entre os games), tudo cabendo na tela; o tie-break dispara no game certo conforme a pontuação do torneio.</li>' +
        '<li><b>📝 Controle da fase ao vivo:</b> a eliminatória herda a inscrição que você abriu na fase inicial, e dá pra abrir/fechar suplentes e novos confrontos a qualquer momento; a 1ª rodada é sempre R1.</li>' +
        '<li><b>⏱️ Estimativa de duração</b> abaixo da regressiva, detalhe do torneio mais limpo e <b>lembrete confiável</b> (1 semana, 2 dias e no dia, enviado pelo servidor).</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #8b5cf6;border-radius:12px;padding:14px 16px;background:rgba(139,92,246,0.08);">' +
      '<div style="font-weight:800; color:#a78bfa; font-size:1rem; margin-bottom:8px;">💬 v1.2 — WhatsApp no app e recuperação de conta <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>💬 Grupo do WhatsApp entra no app:</b> grupo do jogo (os jogadores do confronto) e grupo oficial do torneio, sem expor o telefone de ninguém — você cria o grupo, cola o link e todo mundo entra num toque. Favoritos e torneios ocultados passam a seguir a sua conta em qualquer aparelho.</li>' +
        '<li><b>📵 O app parou de mandar mensagem por WhatsApp</b> (o número foi bloqueado): seus avisos vão por notificação no app e e-mail. O toggle "WhatsApp" do perfil virou "<b>aceito ser chamado no WhatsApp</b>", e o login por celular passou a ser só por SMS.</li>' +
        '<li><b>🔑 Esqueceu a senha e o e-mail não chega?</b> Voltou o "<b>Redefinir por celular</b>" (código por SMS), e o app avisa quando o provedor costuma segurar o e-mail (Hotmail, Outlook, UOL…).</li>' +
        '<li><b>👥 A lista de inscritos mostra todo mundo</b> — organizador inscrito inclusive — com cada pessoa identificada pela conta, não por e-mail ou nome.</li>' +
        '<li><b>⏱️ Relógio e número do jogo corretos:</b> regressiva pro sorteio na Liga/Pontos Corridos, e o "Jogo N" bate com o do chaveamento.</li>' +
        '<li><b>↺ Restaurar o padrão sugerido</b> (pontuação e critérios de desempate) com um clique, e novo <b>WhatsApp do desenvolvedor</b>.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;background:rgba(245,158,11,0.08);">' +
      '<div style="font-weight:800; color:#fbbf24; font-size:1rem; margin-bottom:8px;">⌚ v1.1 — Placar no relógio e letzplay <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>⌚ Placar no relógio (Apple Watch e Wear OS):</b> controle o placar ao vivo do pulso — ponto de cada time, desfazer, resolver empates e jogar de novo no casual; o relógio espelha o celular em tempo real e instala junto com o app do telefone.</li>' +
        '<li><b>🎾 letzplay mais fiel:</b> os jogos importados mostram o <b>nome real do torneio</b>, quem foi verificado aparece <b>verde na hora</b>, a busca preenche o perfil do inscrito e respeita o ritmo do letzplay (não trava nem "conclui" sem trazer nada), com <b>cronômetro na tela</b> e busca completa de todos os inscritos num job só.</li>' +
        '<li><b>📊 Histórico mais interessante:</b> veja <b>com quem</b> e <b>contra quem</b> você mais joga, com seu aproveitamento ao lado — e data certa em qualquer fuso.</li>' +
        '<li><b>📱 Verificar celular por SMS</b> voltou a funcionar, e ao reinstalar o app dá pra <b>unir contas</b> em vez de bloquear por nome repetido.</li>' +
        '<li><b>⚡ Espertezas do dia a dia:</b> a partida casual lembra sua última configuração, o check-in sugere a última modalidade, quem "autorizou" o letzplay aparece em violeta na análise, e um W.O. contestado avisa a organização inteira.</li>' +
      '</ul>' +
    '</div>' +
    '<div style="margin-bottom:1rem;border:2px solid #38bdf8;border-radius:12px;padding:14px 16px;background:rgba(56,189,248,0.08);">' +
      '<div style="font-weight:800; color:#7dd3fc; font-size:1rem; margin-bottom:8px;">🏷️ v1.0 — Importe o letzplay, estatísticas e feedback <span style="color:var(--text-muted); font-weight:400; font-size:0.78rem;">(Julho, 2026)</span></div>' +
      '<ul style="margin:0; padding-left:1.1rem; font-size:0.86rem; line-height:1.5; color:var(--text-main);">' +
        '<li><b>🎾 Traga seu histórico do letzplay:</b> uma extensão do Chrome importa seus jogos pro scoreplace, unificados no seu Histórico com os nomes reais de parceiros e adversários.</li>' +
        '<li><b>📊 Estatísticas repaginadas:</b> gráfico de <b>Forma</b> com janela temporal e filtros, e Top parceiros/adversários somando letzplay + scoreplace lado a lado.</li>' +
        '<li><b>🗂️ Análise de Inscritos anti-gato:</b> matriz Gênero × Categoria com cada nome pintado pela verificação do letzplay, criação de categorias direto da matriz, e o <b>rigor da inscrição</b> (de Casual a Oficial) — sinalizando pra subir só quem realmente domina uma categoria mais fácil.</li>' +
        '<li><b>📳 Vibração no toque</b> e <b>🔊 sons nos momentos-chave</b> (sortear, iniciar a partida, fechar game/set, vencer), com liga/desliga no perfil.</li>' +
      '</ul>' +
    '</div>';
  return html;
})();

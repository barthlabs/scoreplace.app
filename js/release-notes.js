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

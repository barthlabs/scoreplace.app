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

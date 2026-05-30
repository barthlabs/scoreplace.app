// ── Visual Hints System (Dicas Visuais) v2 ──────────────────────────────────
// Contextual, progressive visual hints. Only shows for elements truly visible
// on screen. Balloon arrow points precisely at the target element.

(function() {
  'use strict';
  var _t = window._t || function(k) { return k; };

  // v1.0.26-beta: tempos dobrados pra dicas não incomodarem aparecendo
  // muito cedo. Feedback do user: "estão aborrecendo as pessoas aparecendo
  // muito cedo". HINT_DISPLAY_TIME (quanto tempo fica visível depois que
  // apareceu) preservado — só dobrei delay-de-aparição (idle) e gap entre
  // dicas consecutivas (cooldown).
  var IDLE_TIMEOUT = 12000;         // ms of inactivity before showing a hint (era 6000)
  var HINT_DISPLAY_TIME = 10000;    // ms a hint stays visible (sem mudança)
  var HINT_COOLDOWN = 10000;        // ms between consecutive hints (era 5000)
  var STRATEGIC_BOOST = 0.30;       // probability boost for strategic hints
  var LS_KEY = 'scoreplace_hints';
  var LS_DISABLED_KEY = 'scoreplace_hints_disabled';

  // ── State ──────────────────────────────────────────────────────────────────
  var _idleTimer = null;
  var _cooldownTimer = null;
  var _autoDismissTimer = null;
  var _activeHint = null;
  var _activeEl = null;
  var _onCooldown = false;
  var _initialized = false;
  var _seenHints = {};
  var _sessionShown = {};
  var _lastHintId = null;    // avoid repeating same hint back-to-back

  // ── Hint Catalog ───────────────────────────────────────────────────────────
  var _hints = [
    // ═══════════════════════════════════════════════════════════════════════════
    // GLOBAL / TOPBAR
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'login-cta', selector: '#btn-login', text: 'Faça login para criar e gerenciar torneios! Use suas redes sociais se preferir.', context: 'global', priority: 10, position: 'bottom', requiresLogout: true },
    { id: 'hamburger', selector: '.hamburger-btn', text: 'Toque aqui para abrir o menu e navegar pelo app!', context: 'global', priority: 9, position: 'bottom' },
    { id: 'profile', selector: '#btn-login', text: 'Acesse seu perfil, veja estatísticas e configure notificações.', context: 'global', priority: 7, position: 'bottom', requiresLogin: true },
    { id: 'theme', selector: '#theme-toggle-btn', text: 'Experimente trocar o tema! Temos Noturno, Claro, Pôr do Sol e Oceano.', context: 'global', priority: 4, position: 'bottom' },
    { id: 'help', selector: 'button[onclick*="\'#help\'"], a[href="#help"]', text: 'Dúvidas? Aqui tem o manual completo com todas as funcionalidades!', context: 'global', priority: 5, position: 'bottom' },
    { id: 'quick-search', selector: '.hamburger-btn', text: 'Dica: use Ctrl+K para buscar torneios e jogadores rapidamente!', context: 'global', priority: 3, position: 'bottom', requiresLogin: true },
    { id: 'notifications', selector: 'a[href="#notifications"]', text: 'Fique por dentro! Aqui você recebe avisos de torneios e convites.', context: 'global', priority: 5, position: 'bottom', requiresLogin: true },
    { id: 'explore-nav', selector: '#btn-people', text: 'Explore jogadores da comunidade, veja amigos em comum e descubra torneios abertos para inscrição!', context: 'dashboard', priority: 6, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // STRATEGIC (Apoie / Pro)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'apoie-dash', selector: '#btn-support-pix', text: 'Gostando do scoreplace? Seu apoio via PIX mantém a plataforma gratuita e nos ajuda a crescer!', context: 'dashboard', priority: 8, strategic: true, position: 'bottom' },
    { id: 'pro-dash', selector: '#btn-upgrade-pro', text: 'Desbloqueie torneios ilimitados, upload de logo e Modo TV sem marca! Apenas R$19,90/mês.', context: 'dashboard', priority: 8, strategic: true, position: 'bottom', requiresPlan: 'free' },
    { id: 'apoie-detail', selector: '#btn-support-pix', text: 'Cada contribuição faz diferença! Apoie via PIX e ajude a manter o scoreplace gratuito.', context: 'tournament-detail', priority: 6, strategic: true, position: 'bottom' },
    { id: 'pro-detail', selector: '#btn-upgrade-pro', text: 'Com o plano Pro você pode criar torneios ilimitados e personalizar com sua marca!', context: 'tournament-detail', priority: 6, strategic: true, position: 'bottom', requiresPlan: 'free' },

    // ═══════════════════════════════════════════════════════════════════════════
    // DASHBOARD
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'new-tournament', selector: '#btn-create-tournament-in-box', text: 'Crie seu próprio torneio! Escolha o esporte, defina o formato e convide os participantes — leva menos de 1 minuto.', context: 'dashboard', priority: 10, position: 'bottom' },
    { id: 'hero-filter-todos', selector: '[onclick*="_applyDashFilter(\'todos\')"]', text: 'Veja todos os torneios de uma vez — organizados por você e os que participa.', context: 'dashboard', priority: 4, position: 'top', requiresLogin: true },
    { id: 'hero-filter-organizados', selector: '[onclick*="_applyDashFilter(\'organizados\')"]', text: 'Filtre só os torneios que você organiza. Ideal para gerenciar vários eventos.', context: 'dashboard', priority: 5, position: 'top', requiresLogin: true },
    { id: 'hero-filter-participando', selector: '[onclick*="_applyDashFilter(\'participando\')"]', text: 'Veja apenas os torneios em que você está inscrito como participante.', context: 'dashboard', priority: 5, position: 'top', requiresLogin: true },
    { id: 'hero-filter-abertos', selector: '[onclick*="_applyDashFilter(\'abertos\')"]', text: 'Torneios com inscrições abertas para você! Inscreva-se e comece a competir.', context: 'dashboard', priority: 6, position: 'top', requiresLogin: true },
    { id: 'hero-filter-favoritos', selector: '[onclick*="_applyDashFilter(\'favoritos\')"]', text: 'Seus torneios favoritados ficam aqui. Clique no coração ♥ em qualquer card para favoritar!', context: 'dashboard', priority: 4, position: 'top', requiresLogin: true },
    { id: 'hero-filter-encerrados', selector: '[onclick*="_applyDashFilter(\'encerrados\')"]', text: 'Reveja torneios encerrados: classificação final, podium e histórico de partidas.', context: 'dashboard', priority: 3, position: 'top', requiresLogin: true },
    { id: 'dashboard-filters', selector: '[data-filter]', text: 'Use os filtros para ver só os torneios que organiza, participa ou favoritou.', context: 'dashboard', priority: 4, position: 'bottom', requiresLogin: true },
    { id: 'dashboard-compact', selector: '[onclick*="_setDashView"]', text: 'Prefere uma visualização mais compacta? Alterne entre cards e lista!', context: 'dashboard', priority: 3, position: 'top' },
    { id: 'dashboard-card-fav', selector: '[data-fav-id]', text: 'Clique no coração ♥ para favoritar um torneio e encontrá-lo mais rápido!', context: 'dashboard', priority: 4, position: 'top' },
    { id: 'dashboard-sport-filter', selector: '[onclick*="_applyDashSport"]', text: 'Filtre por esporte: veja apenas torneios de Beach Tennis, Tênis, Padel ou outra modalidade.', context: 'dashboard', priority: 3, position: 'top' },
    { id: 'dashboard-location-filter', selector: '[onclick*="_applyDashLocation"]', text: 'Filtre por local para ver torneios perto de você ou em um local específico.', context: 'dashboard', priority: 3, position: 'top' },
    { id: 'dashboard-format-filter', selector: '[onclick*="_applyDashFormat"]', text: 'Filtre por formato: Eliminatórias, Dupla Eliminatória, Grupos + Eliminatórias e Liga.', context: 'dashboard', priority: 3, position: 'top' },
    { id: 'dashboard-load-more', selector: '[onclick*="_dashPage"]', text: 'Você tem mais torneios! Clique para carregar os próximos.', context: 'dashboard', priority: 2, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // TOURNAMENT DETAIL — Participant Actions
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'invite-friends', selector: '[onclick*="_shareTournament"]', text: 'Convide amigos! Compartilhe o link por WhatsApp, QR Code ou copie o link.', context: 'tournament-detail', priority: 7, position: 'top' },
    { id: 'enroll-btn', selector: '[onclick*="enrollInTournament"]', text: 'Inscreva-se para participar! O organizador será notificado automaticamente.', context: 'tournament-detail', priority: 8, position: 'top' },
    { id: 'unenroll-btn', selector: '[onclick*="unenrollFrom"]', text: 'Cancele sua inscrição. Você poderá se inscrever novamente se as inscrições estiverem abertas.', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'qr-code', selector: '[onclick*="_showQRCode"]', text: 'Gere um QR Code para projetar no local do evento. Participantes escaneiam e se inscrevem!', context: 'tournament-detail', priority: 4, position: 'top' },
    { id: 'detail-participants', selector: '[onclick*="participants"]', text: 'Veja a lista completa de participantes, faça check-in e gerencie inscritos.', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'detail-rules', selector: '[onclick*="rules"]', text: 'Confira as regras do torneio, critérios de desempate e histórico de atividades.', context: 'tournament-detail', priority: 4, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // TOURNAMENT DETAIL — Organizer Tools
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'org-edit-new', selector: '[onclick*="openEditModal"]', text: 'Edite os detalhes do seu torneio — local, datas, formato, categorias e mais.', context: 'tournament-detail', priority: 10, position: 'top' },
    { id: 'org-communicate', selector: '[onclick*="_sendOrgCommunication"]', text: 'Envie mensagens para todos os inscritos — ideal para avisos de horário ou local.', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'org-sortear', selector: '[onclick*="_handleSortearClick"]', text: 'Sorteie o chaveamento! Os participantes serão distribuídos automaticamente.', context: 'tournament-detail', priority: 9, position: 'top' },
    { id: 'org-add-participant', selector: '[onclick*="addParticipantFunction"]', text: 'Adicione um participante manualmente digitando nome e e-mail.', context: 'tournament-detail', priority: 6, position: 'top' },
    { id: 'org-add-team', selector: '[onclick*="addTeamFunction"]', text: 'Adicione um time completo (dupla ou mais jogadores) de uma vez.', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'org-categories', selector: '[onclick*="_openCategoryManager"]', text: 'Gerencie categorias: mova participantes entre categorias, mescle ou separe por gênero/nível.', context: 'tournament-detail', priority: 6, position: 'top' },
    { id: 'org-toggle-registration', selector: '[onclick*="toggleRegistrationStatus"]', text: 'Encerre ou reabra as inscrições. Quando encerradas, ninguém mais poderá se inscrever.', context: 'tournament-detail', priority: 7, position: 'top' },
    { id: 'org-save-template', selector: '[onclick*="_saveAsTemplate"]', text: 'Salve as configurações como template para criar torneios similares no futuro rapidamente.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'org-clone', selector: '[onclick*="_cloneTournament"]', text: 'Crie uma cópia deste torneio com as mesmas configurações mas sem participantes.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'org-finish-tournament', selector: '[onclick*="finishTournament"]', text: 'Encerre o torneio definitivamente. O pódio e a classificação final serão exibidos.', context: 'tournament-detail', priority: 4, position: 'top' },
    { id: 'org-delete-tournament', selector: '[onclick*="deleteTournamentFunction"]', text: 'Exclua o torneio permanentemente. Esta ação não pode ser desfeita!', context: 'tournament-detail', priority: 2, position: 'top' },
    { id: 'org-cohost-picker', selector: '[onclick*="_openOrgPickerDialog"]', text: 'Compartilhe a organização! Convide um participante para ser co-organizador ou transfira a organização.', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'start-tournament', selector: '[onclick*="_startTournament"]', text: 'Inicie o torneio! As partidas serão liberadas para lançamento de resultados.', context: 'tournament-detail', priority: 9, position: 'top' },
    { id: 'detail-view-bracket', selector: '[onclick*="bracket"]', text: 'Veja o chaveamento completo com todas as partidas, placares e classificação.', context: 'tournament-detail', priority: 7, position: 'top' },
    { id: 'detail-export-csv', selector: '[onclick*="_exportTournamentCSV"]', text: 'Exporte todos os resultados para uma planilha CSV (Excel/Google Sheets).', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'liga-toggle-active', selector: '[onchange*="_toggleLigaActive"]', text: 'Ative para participar dos sorteios da Liga. Desativado = folga com 0 pontos na rodada. Quem fica de fora por falta de jogadores recebe a média dos seus pontos.', context: 'tournament-detail', priority: 6, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // CREATE / EDIT TOURNAMENT — Form Fields
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'ct-sport', selector: '.sport-btn, #select-sport', text: 'Escolha o esporte: cada modalidade tem padrões de pontuação próprios (sets, games, pontos).', context: 'create-tournament', priority: 8, position: 'bottom' },
    { id: 'ct-format', selector: '.formato-btn, #select-formato', text: 'Formato do torneio: Eliminatória (mata-mata), Dupla Eliminatória, Grupos + Elim. ou Liga. Suíço aparece como solução automática no painel de potência de 2.', context: 'create-tournament', priority: 8, position: 'bottom' },
    { id: 'ct-draw-mode', selector: '.draw-mode-btn', text: 'Modo de sorteio: "Sorteio" distribui aleatoriamente, "Rei/Rainha" forma grupos de 4 com parceiros rotativos.', context: 'create-tournament', priority: 7, position: 'bottom' },
    { id: 'ct-enroll-mode', selector: '.enroll-mode-btn', text: 'Modo de inscrição: Individual (cada um por si), Apenas Times (duplas/equipes) ou Misto (ambos).', context: 'create-tournament', priority: 6, position: 'bottom' },
    { id: 'ct-game-type', selector: '[onclick*="_selectGameType"]', text: 'Tipo de jogo: Simples (1 vs 1) ou Duplas (2 vs 2). Define como os times são formados.', context: 'create-tournament', priority: 6, position: 'bottom' },
    { id: 'ct-venue', selector: '#tourn-venue', text: 'Informe o local! A busca mostra endereços reais e até previsão do tempo para o dia do evento.', context: 'create-tournament', priority: 6, position: 'bottom' },
    { id: 'ct-venue-access', selector: '#toggle-venue-public, [onclick*="_onVenueAccessToggle"]', text: 'Endereço público: visível na aba Explorar. Desative para manter o endereço privado para os inscritos.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-court-count', selector: '#tourn-court-count', text: 'Quantas quadras/mesas disponíveis? Usado para calcular a duração estimada do torneio.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-categories', selector: '#btn-cat-fem, #btn-cat-masc', text: 'Ative categorias por gênero (Fem, Masc, Misto) para criar chaveamentos separados por categoria.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-skill-categories', selector: '#tourn-skill-categories', text: 'Categorias por nível: digite A, B, C separados por vírgula. Combinam com gênero (ex: Fem A, Masc B).', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-gsm', selector: '#btn-gsm-config', text: 'Configure sets, games e tiebreaks! Ideal para tênis, beach tennis, padel e vôlei.', context: 'create-tournament', priority: 7, position: 'bottom' },
    { id: 'ct-logo', selector: '#logo-preview', text: 'Gere uma logo automática para o torneio! Você também pode fazer upload da sua.', context: 'create-tournament', priority: 4, position: 'top' },
    { id: 'ct-public', selector: '#tourn-public, #toggle-public', text: 'Torneio público aparece na aba Explorar — ótimo para atrair novos participantes!', context: 'create-tournament', priority: 5, position: 'top' },
    { id: 'ct-dates', selector: '#tourn-start-date', text: 'Defina datas de início e fim. Os participantes verão contagem regressiva nos cards!', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-reg-date', selector: '#tourn-reg-date', text: 'Prazo de inscrição: as inscrições serão encerradas automaticamente nesta data.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-max-participants', selector: '#tourn-max-participants', text: 'Limite de participantes. Deixe vazio para sem limite.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-auto-close', selector: '#tourn-auto-close', text: 'Fecha inscrições automaticamente quando atingir o limite de participantes (potência de 2).', context: 'create-tournament', priority: 3, position: 'bottom' },
    { id: 'ct-time-estimates', selector: '#tourn-game-duration', text: 'Duração da partida em minutos. Usado para calcular a duração total estimada do torneio.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-monarch-classified', selector: '.monarch-cls-btn', text: 'Quantos jogadores avançam de cada grupo Rei/Rainha para a fase eliminatória: 1 (só o melhor) ou 2.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-groups-config', selector: '#grupos-count', text: 'Número de grupos e classificados por grupo na fase de grupos.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-swiss-rounds', selector: '#suico-rounds', text: 'Número de rodadas no formato Suíço. Recomendado: log₂ do número de participantes (ex: 8 jogadores = 3 rodadas).', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-wo-scope', selector: '[onclick*="_selectWOScope"]', text: 'W.O. Individual: só o jogador ausente perde. W.O. do Time: todo o time é eliminado por uma ausência.', context: 'create-tournament', priority: 3, position: 'bottom' },
    { id: 'ct-late-enrollment', selector: '[onclick*="_selectLatePolicy"]', text: 'O que acontece com inscrições tardias: Fechado (recusa), Standby (fila de espera) ou Expansão (aceita e ajusta chave).', context: 'create-tournament', priority: 3, position: 'bottom' },
    { id: 'ct-tiebreakers', selector: '#tiebreaker-list', text: 'Arraste para reordenar os critérios de desempate. O primeiro critério tem prioridade máxima.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-load-template', selector: '#btn-load-template-create', text: 'Carregue um template salvo para preencher o formulário com configurações prontas!', context: 'create-tournament', priority: 5, position: 'bottom' },

    // ── Create Tournament: Liga-specific ──
    { id: 'ct-liga-season', selector: '#liga-season-months', text: 'Duração da temporada da Liga. Ao final, a classificação é congelada e o campeão é coroado.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-liga-open-enrollment', selector: '#liga-open-enrollment', text: 'Inscrições sempre abertas: novos jogadores podem entrar a qualquer momento durante a temporada.', context: 'create-tournament', priority: 4, position: 'bottom' },
    { id: 'ct-liga-manual-draw', selector: '#liga-manual-draw', text: 'Sorteio manual: você decide quando gerar cada rodada. Desative para agendar sorteios automáticos.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-liga-draw-schedule', selector: '#liga-first-draw-date', text: 'Agende sorteios automáticos: defina a data/hora do primeiro e o intervalo entre eles.', context: 'create-tournament', priority: 5, position: 'bottom' },
    { id: 'ct-liga-nps', selector: '.liga-nps-btn', text: 'Pontuação de novos jogadores: Zero (começa do zero), Mínimo, Média dos demais, ou decisão do organizador.', context: 'create-tournament', priority: 3, position: 'bottom' },
    { id: 'ct-liga-inactivity', selector: '.liga-inact-btn', text: 'Regra de inatividade: Manter (nada muda), Decair (perde pontos), Remover (excluído da Liga).', context: 'create-tournament', priority: 3, position: 'bottom' },
    { id: 'ct-liga-round-format', selector: '[onclick*="ligaRoundFormat"]', text: 'Formato da rodada: Padrão (1 vs 1) ou Rei/Rainha (grupos de 4 com parceiros rotativos).', context: 'create-tournament', priority: 5, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERLAY: Invite Modal
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'inv-friends', selector: '[id^="invite-friends-btn"]', text: 'Envie convites para todos os seus amigos da plataforma com um clique!', context: 'invite-modal', priority: 8, position: 'bottom' },
    { id: 'inv-whatsapp', selector: '.btn-whatsapp', text: 'Compartilhe o convite direto no WhatsApp — ideal para grupos!', context: 'invite-modal', priority: 7, position: 'bottom' },
    { id: 'inv-link', selector: '.btn-primary', text: 'Copie o link e cole onde quiser: Instagram, Telegram, SMS...', context: 'invite-modal', priority: 7, position: 'bottom' },
    { id: 'inv-qr', selector: 'img[alt="QR Code"]', text: 'Projete ou mostre este QR Code no evento. Os jogadores escaneiam e se inscrevem na hora!', context: 'invite-modal', priority: 6, position: 'top' },
    { id: 'inv-email', selector: '[id^="invite-email"]', text: 'Digite o e-mail de quem quer convidar e envie diretamente.', context: 'invite-modal', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERLAY: Power of 2 Panel
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'p2-nash', selector: '.p2-option', text: 'As cores indicam o equilíbrio de Nash: verde é a opção mais equilibrada, azul a menos. O percentual mostra o score.', context: 'p2-panel', priority: 9, position: 'top' },
    { id: 'p2-reopen', selector: '[onclick*="handleP2Option"][onclick*="reopen"]', text: 'Reabre as inscrições para completar a potência de 2 com novos participantes.', context: 'p2-panel', priority: 7, position: 'top' },
    { id: 'p2-bye', selector: '[onclick*="handleP2Option"][onclick*="bye"]', text: 'BYE: alguns participantes avançam direto para a 2ª rodada sem jogar.', context: 'p2-panel', priority: 7, position: 'top' },
    { id: 'p2-playin', selector: '[onclick*="handleP2Option"][onclick*="playin"]', text: 'Play-in: os excedentes disputam vagas numa rodada extra antes do chaveamento principal.', context: 'p2-panel', priority: 6, position: 'top' },
    { id: 'p2-swiss', selector: '[onclick*="handleP2Option"][onclick*="swiss"]', text: 'Formato Suíço: todos jogam várias rodadas antes de afunilar para os melhores classificados.', context: 'p2-panel', priority: 6, position: 'top' },
    { id: 'p2-poll', selector: '[onclick*="handleP2Option"][onclick*="poll"]', text: 'Enquete: deixe os participantes votarem na solução que preferem!', context: 'p2-panel', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERLAY: Incomplete Teams Panel
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'it-nash', selector: '[onclick*="handleIncompleteOption"]', text: 'Cada opção tem um score de Nash indicando a solução mais equilibrada entre justiça, inclusão e praticidade.', context: 'incomplete-panel', priority: 9, position: 'top' },
    { id: 'it-reopen', selector: '[onclick*="handleIncompleteOption"][onclick*="reopen"]', text: 'Reabre inscrições para que novos jogadores completem os times.', context: 'incomplete-panel', priority: 7, position: 'top' },
    { id: 'it-lottery', selector: '[onclick*="handleIncompleteOption"][onclick*="lottery"]', text: 'Bots: preenche as vagas faltantes com nomes fictícios para completar times.', context: 'incomplete-panel', priority: 6, position: 'top' },
    { id: 'it-dissolve', selector: '[onclick*="handleIncompleteOption"][onclick*="dissolve"]', text: 'Ajuste Manual: reorganize jogadores entre times arrastando e soltando.', context: 'incomplete-panel', priority: 6, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERLAY: Poll Creation / Voting
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'poll-create-deadline', selector: '#poll-deadline', text: 'Defina até quando os participantes podem votar. Após o prazo a enquete encerra automaticamente.', context: 'poll-creation', priority: 8, position: 'bottom' },
    { id: 'poll-create-options', selector: '[data-poll-option]', text: 'Marque as opções que deseja incluir na enquete. O badge Nash indica a mais equilibrada.', context: 'poll-creation', priority: 7, position: 'top' },
    { id: 'poll-vote', selector: '[onclick*="castPollVote"]', text: 'Escolha a opção que prefere. Você pode mudar seu voto até o encerramento da enquete.', context: 'poll-voting', priority: 9, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERLAY: GSM Config / Set Scoring
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'gsm-sets', selector: '#gsm-sets-to-win', text: 'Quantos sets para vencer a partida. Ex: tênis profissional usa 3, amador usa 1 ou 2.', context: 'gsm-config', priority: 8, position: 'bottom' },
    { id: 'gsm-games', selector: '#gsm-games-per-set', text: 'Games por set. Padrão 6 para tênis, 11 para tênis de mesa, 25 para vôlei.', context: 'gsm-config', priority: 7, position: 'bottom' },
    { id: 'gsm-tiebreak', selector: '#gsm-tiebreak-toggle', text: 'Ative o tiebreak para sets empatados. Comum em todos os esportes de raquete.', context: 'gsm-config', priority: 6, position: 'bottom' },
    { id: 'gsm-super-tb', selector: '#gsm-super-tb-toggle', text: 'Super tiebreak: o set decisivo é jogado em formato curto (10 pontos). Popular no beach tennis e duplas.', context: 'gsm-config', priority: 5, position: 'bottom' },
    { id: 'gsm-counting', selector: '#gsm-counting-type', text: 'Tipo de contagem: Numérica (1, 2, 3...) ou Tênis (15, 30, 40, game).', context: 'gsm-config', priority: 5, position: 'bottom' },
    { id: 'gsm-advantage', selector: '#gsm-advantage-toggle', text: 'Regra de vantagem (deuce/advantage): ao empatar em 40-40, exige 2 pontos de diferença.', context: 'gsm-config', priority: 4, position: 'bottom' },
    { id: 'set-scoring-input', selector: '.set-score-row', text: 'Insira o placar de cada set. O sistema calcula automaticamente quem venceu a partida.', context: 'set-scoring', priority: 9, position: 'top' },
    { id: 'set-scoring-save', selector: '#btn-save-sets', text: 'Salve o placar dos sets. O vencedor será determinado automaticamente.', context: 'set-scoring', priority: 8, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // BRACKET / STANDINGS
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'bracket-zoom', selector: '.zoom-slider', text: 'Use o zoom para ver o chaveamento completo. Dica: arraste para navegar!', context: 'bracket', priority: 4, position: 'top' },
    { id: 'bracket-print', selector: '[onclick*="_printBracket"]', text: 'Imprima o chaveamento para colar na parede do evento!', context: 'bracket', priority: 3, position: 'top' },
    { id: 'bracket-export', selector: '[onclick*="_exportTournamentCSV"]', text: 'Exporte resultados em CSV para abrir no Excel ou Google Sheets.', context: 'bracket', priority: 3, position: 'top' },
    { id: 'standings-sort', selector: 'th[onclick*="_sortStandingsTable"]', text: 'Clique nos cabeçalhos da tabela para ordenar por qualquer coluna!', context: 'bracket', priority: 5, position: 'bottom' },
    { id: 'bracket-share', selector: '[onclick*="_shareMatchResult"]', text: 'Compartilhe o resultado de cada partida direto no WhatsApp!', context: 'bracket', priority: 4, position: 'top' },
    { id: 'tv-mode', selector: '[onclick*="_tvMode"]', text: 'Modo TV: projete o placar ao vivo em um telão no local do torneio! Auto-atualiza a cada 30s.', context: 'bracket', priority: 5, position: 'top' },
    { id: 'score-inline-input', selector: 'input[id^="s1-"]', text: 'Digite o placar diretamente aqui. Clique em ✓ para confirmar ou use "Lançar Sets" para placar detalhado.', context: 'bracket', priority: 6, position: 'top' },
    { id: 'score-confirm-inline', selector: 'button[id^="confirm-"]', text: 'Confirme o placar para registrar o resultado da partida.', context: 'bracket', priority: 7, position: 'top' },
    { id: 'score-edit', selector: '[onclick*="_editResult"]', text: 'Edite o resultado de uma partida já registrada.', context: 'bracket', priority: 4, position: 'top' },
    { id: 'bracket-round-hide', selector: '[onclick*="_toggleRoundVisibility"]', text: 'Oculte ou mostre rodadas já concluídas para economizar espaço na tela.', context: 'bracket', priority: 3, position: 'top' },
    { id: 'org-close-round', selector: '[onclick*="_closeRound"]', text: 'Feche a rodada atual e gere a próxima automaticamente com base nos resultados.', context: 'bracket', priority: 8, position: 'top' },
    { id: 'org-advance-elimination', selector: '[onclick*="_advanceToElimination"]', text: 'Avance os classificados dos grupos para a fase eliminatória (mata-mata).', context: 'bracket', priority: 8, position: 'top' },
    { id: 'player-stats', selector: '[onclick*="_showPlayerStats"]', text: 'Clique no nome de um jogador para ver suas estatísticas globais em todos os torneios!', context: 'bracket', priority: 5, position: 'top' },
    { id: 'player-history', selector: '[onclick*="_showPlayerHistory"]', text: 'Veja o histórico completo de partidas deste jogador no torneio: adversários, placares e resultados.', context: 'bracket', priority: 4, position: 'top' },
    { id: 'my-matches-toggle', selector: '#my-matches-toggle', text: 'Filtre para ver apenas as suas partidas no chaveamento.', context: 'bracket', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PARTICIPANTS / CHECK-IN
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'participant-vip', selector: '[onclick*="_toggleVip"]', text: 'Marque como VIP para prioridade no cabeçamento do chaveamento (cabeça de chave).', context: 'tournament-detail', priority: 4, position: 'top' },
    { id: 'participant-remove', selector: '[onclick*="removeParticipantFunction"]', text: 'Remova este participante do torneio.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'checkin-toggle', selector: '.toggle-switch', text: 'Faça check-in: confirme a presença dos participantes antes de iniciar o torneio.', context: 'tournament-detail', priority: 6, position: 'top' },
    { id: 'checkin-filter', selector: '[onclick*="_setCheckInFilter"]', text: 'Filtre a lista: Todos, Presentes ou Ausentes. Facilita o controle no dia do evento.', context: 'tournament-detail', priority: 4, position: 'top' },
    { id: 'checkin-reset', selector: '[onclick*="_resetCheckIn"]', text: 'Limpe todos os check-ins para recomeçar a chamada do zero.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'participants-sort', selector: '[onclick*="_enrollSortMode"]', text: 'Ordene a lista: alfabética (A-Z), cronológica (primeiro inscrito) ou inversa.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'checkin-wo', selector: '[onclick*="_markAbsent"]', text: 'Marque W.O. (walkover): se houver alguém presente na lista de espera, substitui automaticamente. Senão, marca ausente e aguarda substituto.', context: 'bracket', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-DRAW
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'predraw-confirm-draw', selector: '[onclick*="_runPreDrawConfirm"]', text: 'Confirme o sorteio! O chaveamento será gerado com base nas configurações definidas.', context: 'tournament-detail', priority: 9, position: 'top' },
    { id: 'predraw-rename-cat', selector: '[onclick*="_renameCat"]', text: 'Renomeie esta categoria antes do sorteio.', context: 'tournament-detail', priority: 3, position: 'top' },
    { id: 'predraw-merge-cat', selector: '[onclick*="_mergeCat"]', text: 'Mescle duas categorias em uma só (ex: quando poucas inscrições em uma categoria).', context: 'tournament-detail', priority: 4, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // EXPLORE
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'explore-search', selector: '#explore-search', text: 'Busque por nome, esporte, formato ou cidade para encontrar torneios perto de você!', context: 'explore', priority: 6, position: 'bottom' },
    { id: 'explore-friend-request', selector: '[onclick*="_sendFriendRequest"]', text: 'Envie um pedido de amizade para se conectar e ser convidado para torneios futuros.', context: 'explore', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'notif-accept-host', selector: '[onclick*="_acceptHostInvite"]', text: 'Aceite o convite para ser co-organizador deste torneio.', context: 'global', priority: 7, position: 'top' },
    { id: 'notif-accept-friend', selector: '[onclick*="_acceptFriend"]', text: 'Aceite o pedido de amizade para trocar convites de torneio!', context: 'global', priority: 6, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE MODAL
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'profile-gender', selector: '#profile-edit-gender', text: 'Selecione seu gênero para ser distribuído automaticamente nas categorias corretas ao se inscrever.', context: 'global', priority: 5, position: 'bottom' },
    { id: 'profile-language', selector: '#profile-lang-flags button, [onclick*="_setLang"]', text: 'Escolha o idioma do app: Português (🇧🇷) ou English (🇺🇸).', context: 'global', priority: 4, position: 'bottom' },
    { id: 'profile-sports', selector: '#profile-edit-sports', text: 'Marque seus esportes: filtra torneios na dashboard, locais no 📍 Place e pré-seleciona modalidades no check-in. Após marcar cada esporte, escolha seu nível (A/B/C/D/FUN) — você pode ter nível diferente por modalidade!', context: 'global', priority: 4, position: 'bottom' },
    { id: 'profile-location', selector: '#profile-location-search', text: 'Adicione sua localização para encontrar torneios perto de você e receber notificações.', context: 'global', priority: 5, position: 'bottom' },
    { id: 'profile-notify-level', selector: '[onclick*="_toggleNotifyFilter"]', text: 'Configure o nível de notificações: Todas, Só Importantes ou Só Fundamentais.', context: 'global', priority: 4, position: 'top' },
    { id: 'profile-hints-toggle', selector: '[onclick*="hintSystem"]', text: 'Ative ou desative as dicas visuais que aparecem quando você fica parado.', context: 'global', priority: 3, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // CASUAL MATCH
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'casual-start', context: 'casual-match', selector: '#btn-casual-match', text: 'Jogue uma partida rápida sem criar torneio. Escolha esporte, defina se é single ou dupla e convide jogadores por QR code.', priority: 4 },
    { id: 'casual-sport', context: 'casual-match', selector: '.casual-sport-btn', text: 'Cada esporte tem pontuação padrão diferente (sets, games, tie-break). Toque na engrenagem ⚙️ para personalizar.', priority: 3 },
    { id: 'casual-doubles', context: 'casual-match', selector: '#casual-toggle-doubles', text: 'Ative para jogar em duplas (4 jogadores). Desative para single (2 jogadores).', priority: 3 },
    { id: 'casual-shuffle', context: 'casual-match', selector: '#casual-toggle-shuffle', text: 'Sortear ON = duplas aleatórias ao iniciar. OFF = monte os times manualmente arrastando jogadores.', priority: 3 },
    { id: 'casual-invite', context: 'casual-match', selector: '.casual-invite-btn', text: 'Convide jogadores presentes mostrando o QR Code ou compartilhando o código da sala de 6 caracteres.', priority: 4 },
    { id: 'casual-lobby', context: 'casual-match', selector: '.casual-lobby-section', text: 'O lobby mostra quem já entrou na partida em tempo real. Atualizações automáticas a cada 3 segundos.', priority: 2 },
    { id: 'casual-serve', context: 'casual-match', selector: '.serve-card', text: 'Defina a ordem de saque. Use ⇅ para trocar qual jogador do time saca primeiro. A alternância entre times é automática.', priority: 3 },
    { id: 'casual-tiebreak', context: 'casual-match', selector: '[onclick*="liveResolveTie"]', text: 'No empate, escolha Prorrogar (vantagem de 2 games) ou Tie-break. Na prorrogação, o botão Tie-break fica disponível para ativar a qualquer momento.', priority: 3 },
    { id: 'casual-tiebreak-rule', context: 'casual-match', selector: '[onclick*="liveResolveTie"]', text: 'No tie-break vence quem fizer 7 pontos primeiro com 2 de vantagem. Se empatar em 7, o tie-break se estende até alguém abrir 2 de frente.', priority: 2 },
    { id: 'casual-lobby-teams', context: 'casual-match', selector: '.casual-lobby-section', text: 'Os times montados pelo organizador já aparecem no seu lobby. Quando ele terminar, vocês entram juntos na tela ao vivo.', priority: 2 },
    { id: 'casual-leave', context: 'casual-match', selector: '[onclick*="_casualLeaveMatch"]', text: 'Sair libera sua vaga na sala — outro jogador pode ocupar o seu lugar imediatamente.', priority: 3 },
    { id: 'casual-close-match', context: 'casual-match', selector: '[onclick*="_closeLiveScoring"]', text: 'Fechar abandona a partida casual e libera sua vaga. Você volta para o dashboard — nada fica preso.', priority: 2 },
    { id: 'casual-serve-lock', context: 'casual-match', selector: '[data-serve-ball]', text: 'Arraste a bolinha para trocar o sacador. Após 2 jogos ela trava 🔒 e a ordem não pode mais mudar.', priority: 3 },
    { id: 'casual-player-card', context: 'casual-match', selector: 'button[onclick*="_showPlayerMatchStats"]', text: 'Toque em qualquer card de jogador para ver suas estatísticas individuais detalhadas (saque por game e por ponto).', priority: 3 },
    { id: 'casual-momentum', context: 'casual-match', selector: '#mom-replay-btn', text: 'O gráfico Momentum mostra o desempenho das duas duplas ponto a ponto. Clique em ↻ Replay para rever a animação.', priority: 3 },
    { id: 'casual-compare', context: 'casual-match', selector: '[style*="Comparação"]', text: 'Compare os times com barras: Sets, Games, Pontos, % Pontos no Saque, % na Recepção, Games Mantidos, Quebras, Killer Points (40-40), Maior Sequência e Maior Vantagem.', priority: 2 },
    { id: 'casual-restart', context: 'casual-match', selector: '[onclick*="_liveScoreRestart"]', text: 'Jogar Novamente zera o placar e começa outra partida. Ative "Re-sortear duplas" para redistribuir os jogadores nos times.', priority: 3 },

    // ═══════════════════════════════════════════════════════════════════════════
    // PROFILE — Persistent Stats
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'profile-detailed-stats', selector: '#profile-detailed-stats', text: 'Suas estatísticas detalhadas ficam salvas na sua conta e sobrevivem mesmo se o torneio ou a partida casual for apagada.', context: 'global', priority: 4, position: 'top', requiresLogin: true },
    { id: 'profile-h2h', selector: '#profile-detailed-stats', text: 'Veja seus Confrontos Diretos (H2H) — compare seu desempenho contra cada oponente em casuais e em torneios separadamente.', context: 'global', priority: 3, position: 'top', requiresLogin: true },
    { id: 'profile-partnerships', selector: '#profile-detailed-stats', text: 'As tabelas de Parcerias mostram com quais parceiros você mais joga e ganha — descubra a dupla perfeita!', context: 'global', priority: 3, position: 'top', requiresLogin: true },

    // ═══════════════════════════════════════════════════════════════════════════
    // PLAYER STATS MODAL (Estatísticas Detalhadas)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'stats-voltar', selector: '#player-stats-overlay .sticky-back-header .btn-outline', text: 'Use o botão Voltar para fechar as estatísticas e retornar ao app. Ele fica sempre visível no topo, mesmo ao rolar.', context: 'player-stats', priority: 6, position: 'bottom' },
    { id: 'stats-avatar', selector: '#player-stats-overlay h3', text: 'Toque no nome de qualquer jogador em outras telas para abrir as estatísticas detalhadas dele aqui.', context: 'player-stats', priority: 4, position: 'bottom' },
    { id: 'stats-persistent', selector: '#persist-stats-unified', text: 'Desempenho: partidas casuais ⚡ e torneios 🏆 lado a lado. Os ícones 🏆 ficam nas extremidades e ⚡ por dentro.', context: 'player-stats', priority: 8, position: 'bottom' },
    { id: 'stats-wins-bar', selector: '#persist-stats-unified', text: 'Barras divergentes: derrotas à esquerda (vermelho), vitórias à direita (verde). O tamanho é proporcional ao total.', context: 'player-stats', priority: 7, position: 'bottom' },
    { id: 'stats-tb-rows', selector: '#persist-stats-unified', text: 'Logo após Tiebreaks: Pontos TB Médios (média em TBs perdidos vs vencidos), TB Vencidos (mín/máx pts nos vencidos) e TB Perdidos (mín/máx pts nos perdidos).', context: 'player-stats', priority: 6, position: 'bottom' },
    { id: 'stats-pct-bars', selector: '#persist-stats-unified', text: 'Barras casuais (azul claro) vs torneios (azul escuro) para aproveitamento, saque, recepção, quebras e sequências.', context: 'player-stats', priority: 5, position: 'bottom' },
    { id: 'stats-h2h', selector: '#player-stats-overlay [style*="Adversários"]', text: 'Top 3 Adversários mostra contra quem você mais joga. Casuais e torneios listados separadamente.', context: 'player-stats', priority: 4, position: 'top' },
    { id: 'stats-partners', selector: '#player-stats-overlay [style*="Parceiros"]', text: 'Top 3 Parceiros: com quem você mais joga em duplas. Descubra sua dupla perfeita pelas vitórias compartilhadas.', context: 'player-stats', priority: 4, position: 'top' },
    { id: 'stats-tournaments', selector: '#player-stats-overlay details', text: 'Toque em "📋 Torneios Disputados" para ver a lista com links diretos para cada torneio.', context: 'player-stats', priority: 3, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // VENUES — Descoberta (#venues)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'venues-location', selector: '#venues-location', text: 'Digite uma cidade, bairro ou endereço. O mapa centraliza automaticamente. Ou use o botão 📍 GPS.', context: 'venues', priority: 7, position: 'bottom' },
    { id: 'venues-geo', selector: '#venues-geo-btn', text: 'Usa sua localização precisa via GPS. Prioridade máxima sobre o campo de texto.', context: 'venues', priority: 5, position: 'bottom' },
    { id: 'venues-sport-filter', selector: '#venues-sport', text: 'Filtre por modalidade: Beach Tennis, Pickleball, Tênis, Padel, Tênis de Mesa. "Qualquer" traz todos.', context: 'venues', priority: 5, position: 'bottom' },
    { id: 'venues-distance', selector: 'input[oninput*="_venuesSetDistance"]', text: 'Raio de busca em km. Default 10. Vira círculo visual no mapa.', context: 'venues', priority: 4, position: 'bottom' },
    { id: 'venues-tab-map', selector: '#venues-tab-map', text: 'Visão espacial — pins nos locais. Verde = você, âmbar = cadastrados, índigo = Pro, cinza = sugestões do Google.', context: 'venues', priority: 6, position: 'bottom' },
    { id: 'venues-tab-list', selector: '#venues-tab-list', text: 'Visão em lista — cards com nome, modalidades, quadras, preço. Útil quando há muitos venues no raio.', context: 'venues', priority: 4, position: 'bottom' },
    { id: 'venues-summary', selector: '#venues-map-summary button', text: 'Sem resultados? Expande o raio em 3× com um clique e re-renderiza o mapa.', context: 'venues', priority: 5, position: 'top' },
    { id: 'venues-cta-register', selector: 'a[href="#my-venues"]', text: 'Qualquer jogador pode cadastrar um local que frequenta — estilo Wikipedia. O dono reivindica depois.', context: 'venues', priority: 4, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // VENUE DETAIL MODAL (inline, sobreposto à #venues ou #tournaments)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'venue-quickcheckin', selector: '#venue-quickcheckin-btn', text: 'Check-in inline sem sair da modal — notifica seus amigos com 1 tap. Seu avatar aparece em "Movimento no local".', context: 'venue-detail', priority: 8, position: 'top' },
    { id: 'venue-quickplan', selector: '#venue-quickplan-btn', text: 'Planejar ida pro local. Vai pra #presence com o dialog de agendamento auto-aberto.', context: 'venue-detail', priority: 7, position: 'top' },
    { id: 'venue-share', selector: '[onclick*="_venuesShare"]', text: 'Compartilhe o link do venue — WhatsApp, DM, SMS. Link canônico abre a mesma modal pra quem receber.', context: 'venue-detail', priority: 5, position: 'top' },
    { id: 'venue-create-tournament', selector: '[onclick*="_venuesStartTournamentHere"]', text: 'Cria um torneio já com o venue pré-preenchido. Atalho quando você gosta do local que acabou de descobrir.', context: 'venue-detail', priority: 5, position: 'top' },
    { id: 'venue-review', selector: '[onclick*="_venuesOpenReviewDialog"]', text: 'Avalie de 1 a 5 estrelas + texto opcional. Anônimo se deixar em branco. Cada usuário: 1 review por venue.', context: 'venue-detail', priority: 4, position: 'top' },
    { id: 'venue-claim', selector: '[onclick*="_venueOwnerEditExisting"]', text: 'É o proprietário? Reivindique pra ganhar a tag "✅ Informações oficiais" e controle total sobre os dados.', context: 'venue-detail', priority: 6, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // PRESENCE (#presence)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'presence-venue-select', selector: '#presence-venue-select', text: 'Escolha o local. A lista combina seus locais preferidos do perfil + venues dos seus torneios.', context: 'presence', priority: 7, position: 'bottom' },
    { id: 'presence-sports', selector: '#presence-picker button[onclick*="_presenceToggleSport"]', text: 'Pills de modalidade — selecione uma ou mais. Um local pode oferecer várias; o doc de presença fica queryable por qualquer uma.', context: 'presence', priority: 6, position: 'bottom' },
    { id: 'presence-checkin', selector: '[onclick*="_presenceCheckIn"]', text: 'Check-in imediato (3h). Amigos recebem notificação "📡 Fulano chegou pra jogar X. Vem junto!".', context: 'presence', priority: 8, position: 'top' },
    { id: 'presence-plan', selector: '[onclick*="_presencePlanDialog"]', text: 'Agendamento futuro. Escolha início e (opcional) saída. Amigos recebem "🗓️ Fulano vai jogar X às HH:mm".', context: 'presence', priority: 7, position: 'top' },
    { id: 'presence-calendar', selector: '[onclick*="_presenceAddToCalendar"]', text: 'Adicione sua presença planejada ao Google Calendar, Outlook ou Apple Calendar. Um clique, evento com horário + local.', context: 'presence', priority: 5, position: 'top' },
    { id: 'presence-cancel', selector: '[onclick*="_presenceCancel"]', text: 'Cancelar sua presença. Silenciosamente remove — amigos não são notificados do cancelamento.', context: 'presence', priority: 3, position: 'top' },
    { id: 'presence-chart', selector: '#presence-chart', text: 'Movimento por hora no local hoje. Avatares = amigos, números = outros usuários. Torneios entram como presenças virtuais.', context: 'presence', priority: 4, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // CASUAL MATCH (additions — existing ones migrated above)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'casual-notify-friends', selector: '#casual-notify-friends-btn', text: 'Com 1 clique avisa todos seus amigos do scoreplace. Eles recebem notificação "⚡ Entrar na partida" que leva direto pro lobby.', context: 'casual-match', priority: 7, position: 'top' },
    { id: 'casual-share-result', selector: '[onclick*="_liveScoreShareCasual"]', text: 'Compartilhe o resultado — WhatsApp, Instagram DM, clipboard. Inclui placar set-a-set e vencedor.', context: 'casual-match', priority: 6, position: 'bottom' },
    { id: 'casual-room-code', selector: '#casual-qr-overlay [style*="letter-spacing"]', text: 'Código de 6 caracteres da sala. Amigo digita na dashboard ("📷 Escanear QR") ou acessa /#casual/CODIGO pra entrar.', context: 'casual-match', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // DASHBOARD — Novos widgets (v0.15.x)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'dash-my-venues', selector: '#dashboard-presences-widget + div', text: 'Seus locais preferidos em acesso rápido. Botão 📍 verde faz check-in direto sem navegar — 2 cliques em vez de 5.', context: 'dashboard', priority: 5, position: 'top', requiresLogin: true },
    { id: 'dash-my-active', selector: '#dashboard-myactive-widget', text: 'Sua presença ativa aparece aqui. Dot verde = check-in em andamento. ⚡ = partida casual em andamento (botão "Voltar"). Clique "Cancelar" pra remover presença.', context: 'dashboard', priority: 7, position: 'bottom', requiresLogin: true },
    { id: 'dash-friends-presence', selector: '#dashboard-presences-widget', text: 'Amigos com check-in ativo ou presença planejada hoje. Clique num card pra ver o local e se juntar.', context: 'dashboard', priority: 5, position: 'top', requiresLogin: true },
    { id: 'dash-profile-nudge', selector: '#dash-profile-nudge', text: 'Complete seu perfil pra ativar torneios perto de você, sugestões de parceiros e presença rápida.', context: 'dashboard', priority: 6, position: 'top', requiresLogin: true },
    { id: 'dash-place-btn', selector: 'a[href="#place"], button[onclick*="#place"]', text: '📍 Place — descubra quadras/clubes próximos no mapa, marque presença no local, veja amigos jogando. Tudo unificado numa tela só.', context: 'dashboard', priority: 6, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // TOURNAMENT DETAIL — Calendário (v0.15.16)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'tournament-calendar', selector: '[onclick*="_tournamentAddToCalendar"]', text: 'Adicione à sua agenda (Google Calendar, Outlook ou Apple .ics). Evita o "me esqueci do horário".', context: 'tournament-detail', priority: 5, position: 'top' },
    { id: 'tournament-venue-link', selector: '[onclick*="_openVenueFromTournament"]', text: 'Ver detalhes do local: movimento ao vivo, torneios futuros, contatos e reviews. Do torneio pro venue em 1 tap.', context: 'tournament-detail', priority: 5, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // MY VENUES (#my-venues)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'myvenues-search', selector: '#venue-owner-search', text: 'Digite o nome do local. Sugestões do Google Places aparecem conforme você digita.', context: 'my-venues', priority: 7, position: 'bottom' },
    { id: 'myvenues-claim', selector: 'input[type="checkbox"][onclick*="claim"]', text: 'Marque se você é o proprietário oficial. Ganha tag "✅ Informações oficiais" e bloqueio contra edições de terceiros.', context: 'my-venues', priority: 6, position: 'top' },
    { id: 'myvenues-access', selector: '#venue-owner-access', text: 'Política de acesso: Público (aluguel aberto), Só sócios, Sócios + convidados de torneios, ou Privado. Define se o venue aparece como "alugável" pra jogadores.', context: 'my-venues', priority: 5, position: 'bottom' },
    { id: 'myvenues-courts', selector: '#venue-courts-list', text: 'Camada colaborativa: qualquer jogador cadastra "tantas quadras de [modalidade]". Quando o dono reivindica, ele assume tudo e vira único editor.', context: 'my-venues', priority: 7, position: 'top' },
    { id: 'myvenues-add-court', selector: 'button[onclick*="_venueCourtAddDialog"]', text: 'Adicione uma entrada de quadra. Ex: "4 quadras de Beach Tennis compartilhadas com Futvôlei" ou "2 saibro exclusivas de Tênis".', context: 'my-venues', priority: 7, position: 'top' },
    { id: 'myvenues-view', selector: '#venue-owner-list button[onclick*="#venues/"]', text: 'Previsão pública: veja como os usuários veem seu local (movimento, reviews, contatos). Útil antes de compartilhar.', context: 'my-venues', priority: 4, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS (#notifications)
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'notif-mark-read', selector: '#notif-list .card', text: 'Clique num card pra marcar como lida. Também abre o link associado (torneio, venue, partida).', context: 'notifications', priority: 4, position: 'top' },
    { id: 'notif-casual-invite', selector: '[onclick*="#casual/"]', text: 'Convite pra partida casual. Um tap leva direto pro lobby — sem precisar do QR Code.', context: 'notifications', priority: 6, position: 'top' },
    { id: 'notif-presence-checkin', selector: 'button[style*="presence"]', text: 'Amigo chegou num local. Botão leva pra modal do venue onde você marca sua própria presença.', context: 'notifications', priority: 5, position: 'top' },

    // ═══════════════════════════════════════════════════════════════════════════
    // INVITE PAGE (#invite) — v0.15.72
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'invite-page-qr', selector: '#invite-qr-img', text: 'QR Code do app — projete numa TV ou mostre no celular pra outros baixarem com 1 scan.', context: 'invite', priority: 8, position: 'bottom' },
    { id: 'invite-page-share', selector: 'button[onclick*="navigator.share"], a[href*="wa.me"]', text: 'Compartilhe via WhatsApp/Telegram/SMS — link curto que abre o app direto.', context: 'invite', priority: 7, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // SUPPORT PAGE (#support) — v0.15.72
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'support-pix', selector: '#support-pix-qr, [data-pix-key]', text: 'PIX voluntário — ajuda a manter o scoreplace.app gratuito. Chave CNPJ ou QR Code copia-e-cola.', context: 'support', priority: 8, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // TERMS ACCEPTANCE MODAL — v0.17.78
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'terms-checkbox', selector: '#terms-accept-checkbox', text: 'Marque pra confirmar que leu Termos + Privacy. Sem isso o botão Confirmar fica desabilitado.', context: 'global', priority: 9, position: 'top' },
    { id: 'terms-links', selector: '#terms-accept-link-terms, #terms-accept-link-privacy', text: 'Abre Termos/Privacy em nova aba — leia antes de aceitar. O modal fica esperando.', context: 'global', priority: 8, position: 'bottom' },

    // ═══════════════════════════════════════════════════════════════════════════
    // META
    // ═══════════════════════════════════════════════════════════════════════════
    { id: 'hints-meta', selector: '#btn-login', text: 'Essas dicas aparecem quando você fica parado. Para desativá-las, clique "Desativar dicas" aqui embaixo — ou reative no seu Perfil quando quiser.', context: 'global', priority: 2, position: 'bottom' }
  ];

  // ── Utility ────────────────────────────────────────────────────────────────
  function _isDisabled() {
    try { return localStorage.getItem(LS_DISABLED_KEY) === '1'; } catch (e) { return false; }
  }

  function _loadSeen() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      _seenHints = raw ? JSON.parse(raw) : {};
    } catch (e) { _seenHints = {}; }
  }

  function _saveSeen() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_seenHints)); } catch (e) {}
  }

  function _getCurrentContext() {
    // Overlay contexts take priority — if a blocking overlay is open, use its context
    var _inviteOpen = document.querySelector('.invite-modal-container[style*="display: flex"], .invite-modal-container[style*="display:flex"]');
    if (_inviteOpen) return 'invite-modal';
    if (document.getElementById('unified-resolution-panel')) return 'p2-panel';
    if (document.getElementById('p2-resolution-panel')) return 'p2-panel';
    if (document.getElementById('incomplete-teams-panel')) return 'incomplete-panel';
    if (document.getElementById('poll-creation-dialog')) return 'poll-creation';
    if (document.getElementById('poll-voting-dialog')) return 'poll-voting';
    if (document.getElementById('gsm-config-overlay')) return 'gsm-config';
    if (document.getElementById('set-scoring-overlay')) return 'set-scoring';
    if (document.getElementById('dissolve-panel')) return 'dissolve-panel';
    if (document.getElementById('draw-visibility-dialog')) return 'draw-visibility';
    if (document.getElementById('player-stats-overlay')) return 'player-stats';
    var ctModal = document.getElementById('modal-create-tournament');
    if (ctModal && ctModal.classList.contains('active')) return 'create-tournament';
    var qcModal = document.getElementById('modal-quick-create');
    if (qcModal && qcModal.classList.contains('active')) return 'create-tournament';

    // Casual match overlays são full-screen + não têm hash na URL.
    // Detectamos pelo elemento DOM. Prioridade alta pra não cair em
    // contexto de dashboard só porque o hash ainda é #dashboard.
    if (document.getElementById('live-scoring-overlay')) return 'casual-match';
    if (document.getElementById('casual-match-overlay')) return 'casual-match';
    var venueDetailOverlay = document.getElementById('venues-detail-overlay');
    if (venueDetailOverlay) return 'venue-detail';

    var hash = window.location.hash || '#dashboard';
    if (hash.indexOf('#dashboard') === 0) return 'dashboard';
    if (hash.indexOf('#tournaments/') === 0 || hash.indexOf('#tournament/') === 0) return 'tournament-detail';
    if (hash.indexOf('#bracket/') === 0) return 'bracket';
    if (hash.indexOf('#explore') === 0) return 'explore';
    if (hash.indexOf('#venues/') === 0 || hash === '#venues') return 'venues';
    if (hash.indexOf('#presence') === 0) return 'presence';
    if (hash.indexOf('#casual/') === 0) return 'casual-match';
    if (hash.indexOf('#my-venues') === 0) return 'my-venues';
    if (hash.indexOf('#notifications') === 0) return 'notifications';
    // v1.3.10-beta: novas page-routes — perfil e análise de inscritos.
    // Antes essas rotas caíam no default 'dashboard' e disparavam hints
    // de dashboard fora de contexto. User: "as dicas devem aparecer apenas
    // na pagina que está visivel".
    if (hash.indexOf('#profile') === 0) return 'profile';
    if (hash.indexOf('#analise/') === 0) return 'enrollment-report';
    if (hash.indexOf('#categorias/') === 0) return 'category-manager';
    if (hash.indexOf('#novo-torneio') === 0) return 'create-tournament';
    if (hash.indexOf('#help') === 0) return 'help';
    if (hash.indexOf('#support') === 0) return 'support';
    if (hash.indexOf('#privacy') === 0) return 'privacy';
    if (hash.indexOf('#terms') === 0) return 'terms';
    if (hash.indexOf('#invite') === 0) return 'invite';
    return 'dashboard';
  }

  function _isLoggedIn() {
    return !!(window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.email);
  }

  function _getUserPlan() {
    if (!window.AppStore || !window.AppStore.currentUser) return 'free';
    return window.AppStore.currentUser.plan || 'free';
  }

  // ── Known blocking overlay IDs ──────────────────────────────────────────────
  // These are full-screen fixed overlays (z-index 99999+) that cover the entire
  // viewport. When any of them is present, hints should only target elements
  // INSIDE the overlay, never elements on the background page.
  var _blockingOverlayIds = [
    'p2-resolution-panel',
    'incomplete-teams-panel',
    'dissolve-panel',
    'draw-visibility-dialog',
    'incomplete-team-dialog',
    'poll-creation-dialog',
    'poll-voting-dialog',
    'gsm-config-overlay',
    'set-scoring-overlay',
    'category-manager-overlay'
  ];

  // Returns the topmost blocking overlay element, or null if none is open.
  function _getBlockingOverlay() {
    for (var i = 0; i < _blockingOverlayIds.length; i++) {
      var el = document.getElementById(_blockingOverlayIds[i]);
      if (el) return el;
    }
    // Also check for any active modal-overlay (modals like create-tournament, help, profile)
    var modal = document.querySelector('.modal-overlay.active');
    if (modal) return modal;
    return null;
  }

  // ── Strict visibility check ────────────────────────────────────────────────
  // Element must: exist, have real dimensions, not be display:none,
  // not be inside a hidden parent, be within the visible viewport, AND
  // not be occluded by another element on top (modal, overlay, page).
  // v1.3.10-beta: adicionado check de occlusão via elementFromPoint —
  // garante que o elemento está realmente VISÍVEL na tela. User:
  // "as dicas devem aparecer apenas na pagina que está visivel e na
  // parte da pagina que esta visivel."
  function _isElementVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    var rect = el.getBoundingClientRect();
    // Must have real dimensions
    if (rect.width === 0 && rect.height === 0) return false;

    // Must be within viewport (with small margin)
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    if (rect.bottom < -10 || rect.top > vh + 10) return false;
    if (rect.right < -10 || rect.left > vw + 10) return false;

    // BLOCKING OVERLAY CHECK: if an overlay is open, element must be inside it
    var blockingOverlay = _getBlockingOverlay();
    if (blockingOverlay) {
      if (!blockingOverlay.contains(el)) return false;
    }

    // Check that no ancestor is hidden (walk up max 10 levels)
    var parent = el.parentElement;
    var depth = 0;
    while (parent && depth < 10) {
      var ps = window.getComputedStyle(parent);
      if (ps.display === 'none' || ps.visibility === 'hidden') return false;
      // Check overflow:hidden + scroll position hiding the child
      if (ps.overflow === 'hidden' || ps.overflowY === 'hidden' || ps.overflowX === 'hidden') {
        var pRect = parent.getBoundingClientRect();
        // If element is completely outside parent's visible area
        if (rect.bottom < pRect.top || rect.top > pRect.bottom ||
            rect.right < pRect.left || rect.left > pRect.right) return false;
      }
      parent = parent.parentElement;
      depth++;
    }

    // OCCLUSION CHECK: testar 5 pontos do elemento (centro + 4 cantos
    // recuados). Pelo menos UM precisa retornar o próprio el (ou
    // descendente/ancestral). Senão tem outro elemento tampando.
    // Pula esse check pra elementos position:fixed do topbar/back-header
    // (eles podem estar tecnicamente atrás do hamburger-dropdown mas
    // ainda são "visíveis" na UI corrente — não queremos falso negativo).
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    // Garantir que o centro está dentro do viewport pra elementFromPoint funcionar
    cx = Math.max(1, Math.min(vw - 1, cx));
    cy = Math.max(1, Math.min(vh - 1, cy));

    function _isAtPoint(x, y) {
      var topmost = document.elementFromPoint(x, y);
      if (!topmost) return false;
      // Match: o próprio el OU descendente/ancestral (cobre casos onde
      // o el é wrapper e elementFromPoint retorna filho clicável).
      return topmost === el || el.contains(topmost) || topmost.contains(el);
    }

    // Checa centro + 4 quadrantes recuados em 25%
    var qx = rect.width / 4;
    var qy = rect.height / 4;
    var points = [
      [cx, cy],
      [Math.max(1, rect.left + qx), Math.max(1, rect.top + qy)],
      [Math.min(vw - 1, rect.right - qx), Math.max(1, rect.top + qy)],
      [Math.max(1, rect.left + qx), Math.min(vh - 1, rect.bottom - qy)],
      [Math.min(vw - 1, rect.right - qx), Math.min(vh - 1, rect.bottom - qy)]
    ];
    for (var p = 0; p < points.length; p++) {
      if (_isAtPoint(points[p][0], points[p][1])) return true;
    }
    // Nenhum dos 5 pontos deu match — elemento está completamente coberto.
    return false;
  }

  // ── Find first visible element matching selector ───────────────────────────
  function _findVisibleEl(selector) {
    // selector can have commas — try each part separately too
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) {
      if (_isElementVisible(els[i])) return els[i];
    }
    return null;
  }

  // ── Pick next hint ─────────────────────────────────────────────────────────
  function _pickHint() {
    var ctx = _getCurrentContext();
    var loggedIn = _isLoggedIn();
    var plan = _getUserPlan();

    // Overlay contexts block global hints — only show hints for the overlay itself
    var _overlayContexts = ['p2-panel', 'incomplete-panel', 'poll-creation', 'poll-voting', 'gsm-config', 'set-scoring', 'dissolve-panel', 'draw-visibility', 'create-tournament', 'invite-modal'];
    var _isOverlay = _overlayContexts.indexOf(ctx) !== -1;
    // player-stats is a non-blocking overlay (topbar stays above it) — allow its own
    // hints AND global (menu) hints, but suppress dashboard/tournament-detail/etc.
    var _isStatsOverlay = (ctx === 'player-stats');

    var eligible = _hints.filter(function(h) {
      // Stats overlay: allow own context OR global (menu stays interactive above it)
      if (_isStatsOverlay) { if (h.context !== 'player-stats' && h.context !== 'global') return false; }
      // In blocking-overlay context: only show hints matching that overlay, never global
      else if (_isOverlay) { if (h.context !== ctx) return false; }
      // In page context: match context or global
      else if (h.context !== ctx && h.context !== 'global') return false;
      // Don't repeat the hint we just showed
      if (h.id === _lastHintId) return false;
      // Check login requirement
      if (h.requiresLogin && !loggedIn) return false;
      // Check logout requirement (hints only for non-logged users)
      if (h.requiresLogout && loggedIn) return false;
      // Check plan requirement
      if (h.requiresPlan && h.requiresPlan !== plan) return false;
      // STRICT: Must have a truly visible target element on screen
      var el = _findVisibleEl(h.selector);
      if (!el) return false;
      // Session limit: max 2 times per session
      if ((_sessionShown[h.id] || 0) >= 2) return false;
      return true;
    });

    if (eligible.length === 0) return null;

    // Score: priority + freshness + strategic boost - session penalty + random jitter
    var scored = eligible.map(function(h) {
      var seenCount = _seenHints[h.id] || 0;
      var sessionCount = _sessionShown[h.id] || 0;
      var freshness = seenCount === 0 ? 5 : Math.max(0, 3 - seenCount);
      var stratBoost = h.strategic ? 3 : 0;
      var sessionPenalty = sessionCount * 5;
      var score = h.priority + freshness + stratBoost - sessionPenalty + (Math.random() * 3);
      return { hint: h, score: score };
    });

    scored.sort(function(a, b) { return b.score - a.score; });

    // Strategic boost roll
    if (!scored[0].hint.strategic) {
      var bestStrat = scored.find(function(s) { return s.hint.strategic; });
      if (bestStrat && Math.random() < STRATEGIC_BOOST) {
        return bestStrat.hint;
      }
    }

    return scored[0].hint;
  }

  // ── Show hint ──────────────────────────────────────────────────────────────
  function _showHint(hint) {
    var el = _findVisibleEl(hint.selector);
    if (!el) return;

    _activeHint = hint;
    _activeEl = el;
    _lastHintId = hint.id;

    // Add glow to target
    el.classList.add('hint-glow');

    // Create balloon
    var balloon = document.createElement('div');
    balloon.className = 'hint-balloon';
    balloon.setAttribute('data-hint-id', hint.id);
    balloon.innerHTML =
      '<div class="hint-balloon-arrow"></div>' +
      '<div class="hint-balloon-body">' +
        '<div class="hint-balloon-content">' +
          '<span class="hint-balloon-icon">' + (hint.strategic ? '💡' : '👋') + '</span>' +
          '<span class="hint-balloon-text">' + hint.text + '</span>' +
        '</div>' +
        '<div class="hint-balloon-actions">' +
          '<button class="hint-balloon-got-it">Entendi</button>' +
          '<button class="hint-balloon-disable">Desativar dicas</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(balloon);

    // Position balloon + arrow to point at element center
    _positionBalloon(balloon, el, hint.position || 'bottom');

    // Animate in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        balloon.classList.add('hint-balloon-visible');
      });
    });

    // Listeners
    balloon.querySelector('.hint-balloon-got-it').addEventListener('click', function(e) {
      e.stopPropagation();
      _dismissHint(true);
    }, { once: true });
    balloon.querySelector('.hint-balloon-disable').addEventListener('click', function(e) {
      e.stopPropagation();
      _disableHints();
    }, { once: true });

    // Click target = dismiss
    el.addEventListener('click', _onTargetClick, { once: true });

    // Auto-dismiss and queue next
    _autoDismissTimer = setTimeout(function() {
      if (_activeHint && _activeHint.id === hint.id) _dismissHint(true);
    }, HINT_DISPLAY_TIME);

    // Track
    _seenHints[hint.id] = (_seenHints[hint.id] || 0) + 1;
    _sessionShown[hint.id] = (_sessionShown[hint.id] || 0) + 1;
    _saveSeen();
  }

  // ── Position balloon relative to element ───────────────────────────────────
  function _positionBalloon(balloon, el, preferredPos) {
    var rect = el.getBoundingClientRect();
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    var vh = window.innerHeight;
    var vw = window.innerWidth;

    // Decide actual position based on available space
    var pos = preferredPos;
    var spaceBelow = vh - rect.bottom;
    var spaceAbove = rect.top;
    var balloonHeight = 140; // estimated

    if (pos === 'bottom' && spaceBelow < balloonHeight && spaceAbove > balloonHeight) pos = 'top';
    if (pos === 'top' && spaceAbove < balloonHeight && spaceBelow > balloonHeight) pos = 'bottom';

    // Element center in page coordinates
    var elCenterX = rect.left + scrollX + rect.width / 2;
    var elCenterY = rect.top + scrollY + rect.height / 2;
    var arrowEl = balloon.querySelector('.hint-balloon-arrow');
    var margin = 10;

    balloon.style.position = 'absolute';
    balloon.style.zIndex = '100000';
    balloon.setAttribute('data-pos', pos);

    // Reset styles that may conflict between positions
    balloon.style.top = '';
    balloon.style.bottom = '';
    balloon.style.left = '';
    balloon.style.transform = '';

    if (pos === 'bottom') {
      balloon.style.top = (rect.bottom + scrollY + margin) + 'px';
      balloon.style.left = elCenterX + 'px';
      balloon.style.transform = 'translateX(-50%)';
      // Arrow at top of balloon, pointing up
      arrowEl.style.cssText = 'position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(45deg);width:12px;height:12px;';
    } else if (pos === 'top') {
      // Use top + translateY(-100%) so position works in page coords (survives scroll/resize)
      balloon.style.top = (rect.top + scrollY - margin) + 'px';
      balloon.style.left = elCenterX + 'px';
      balloon.style.transform = 'translate(-50%, -100%)';
      // Arrow at bottom of balloon, pointing down
      arrowEl.style.cssText = 'position:absolute;bottom:-6px;left:50%;transform:translateX(-50%) rotate(225deg);width:12px;height:12px;';
    } else if (pos === 'left') {
      balloon.style.top = elCenterY + 'px';
      balloon.style.left = (rect.left + scrollX - margin) + 'px';
      balloon.style.transform = 'translate(-100%, -50%)';
      arrowEl.style.cssText = 'position:absolute;right:-6px;top:50%;transform:translateY(-50%) rotate(135deg);width:12px;height:12px;';
    } else { // right
      balloon.style.top = elCenterY + 'px';
      balloon.style.left = (rect.right + scrollX + margin) + 'px';
      balloon.style.transform = 'translateY(-50%)';
      arrowEl.style.cssText = 'position:absolute;left:-6px;top:50%;transform:translateY(-50%) rotate(-45deg);width:12px;height:12px;';
    }

    // Apply arrow theme colors
    var theme = document.documentElement.getAttribute('data-theme') || 'dark';
    var arrowBg = theme === 'light' ? '#ffffff' : theme === 'sunset' ? '#292018' : theme === 'ocean' ? '#1c3d5e' : '#1e293b';
    var arrowBorder = theme === 'light' ? 'rgba(37,99,235,0.35)' : theme === 'sunset' ? 'rgba(245,158,11,0.4)' : theme === 'ocean' ? 'rgba(34,211,238,0.4)' : 'rgba(251,191,36,0.4)';
    arrowEl.style.background = arrowBg;
    arrowEl.style.borderLeft = '1.5px solid ' + arrowBorder;
    arrowEl.style.borderTop = '1.5px solid ' + arrowBorder;

    // Clamp horizontally within viewport
    // Use translateY component based on position (top uses -100%, others don't)
    var translateY = pos === 'top' ? ', -100%' : '';
    requestAnimationFrame(function() {
      var bRect = balloon.getBoundingClientRect();
      if (bRect.right > vw - 8) {
        var overflow = bRect.right - vw + 16;
        balloon.style.transform = 'translate(calc(-50% - ' + overflow + 'px)' + translateY + ')';
        // Shift arrow to still point at element
        if (pos === 'bottom' || pos === 'top') {
          var arrowLeft = (rect.left + rect.width / 2) - bRect.left + overflow;
          arrowEl.style.left = Math.max(16, Math.min(bRect.width - 16, arrowLeft)) + 'px';
        }
      }
      if (bRect.left < 8) {
        var shift = 8 - bRect.left;
        balloon.style.transform = 'translate(calc(-50% + ' + shift + 'px)' + translateY + ')';
        if (pos === 'bottom' || pos === 'top') {
          var arrowLeft2 = (rect.left + rect.width / 2) - (bRect.left + shift);
          arrowEl.style.left = Math.max(16, Math.min(bRect.width - 16, arrowLeft2)) + 'px';
        }
      }
    });
  }

  // ── Reposition balloon on resize/scroll ─────────────────────────────────────
  var _repositionRAF = null;
  function _repositionActiveBalloon() {
    if (_repositionRAF) return; // throttle via rAF
    _repositionRAF = requestAnimationFrame(function() {
      _repositionRAF = null;
      if (!_activeHint || !_activeEl) return;
      var balloon = document.querySelector('.hint-balloon[data-hint-id="' + _activeHint.id + '"]');
      if (!balloon) return;
      // If the target element is no longer visible, dismiss
      if (!_isElementVisible(_activeEl)) {
        _dismissHint(true);
        return;
      }
      var pos = balloon.getAttribute('data-pos') || _activeHint.position || 'bottom';
      _positionBalloon(balloon, _activeEl, pos);
    });
  }

  window.addEventListener('resize', _repositionActiveBalloon, { passive: true });
  window.addEventListener('scroll', function() {
    if (!_activeHint || !_activeEl) return;
    // If target scrolled out of viewport, dismiss immediately
    if (!_isElementVisible(_activeEl)) {
      _dismissHint(true);
    } else {
      _repositionActiveBalloon();
    }
  }, { passive: true });

  // Dismiss hint on page navigation (hash change)
  window.addEventListener('hashchange', function() {
    if (_activeHint) _dismissHint(true);
  });

  function _onTargetClick() {
    _dismissHint(true);
  }

  // ── Dismiss ────────────────────────────────────────────────────────────────
  function _dismissHint(scheduleNext) {
    if (!_activeHint) return;
    var hintId = _activeHint.id;

    // Clear auto-dismiss timer
    clearTimeout(_autoDismissTimer);
    _autoDismissTimer = null;

    // Remove glow
    if (_activeEl) {
      _activeEl.classList.remove('hint-glow');
      _activeEl.removeEventListener('click', _onTargetClick);
    }

    // Animate out balloon
    var balloon = document.querySelector('.hint-balloon[data-hint-id="' + hintId + '"]');
    if (balloon) {
      balloon.classList.remove('hint-balloon-visible');
      balloon.style.opacity = '0';
      balloon.style.transition = 'opacity 0.25s ease';
      setTimeout(function() { if (balloon.parentNode) balloon.parentNode.removeChild(balloon); }, 300);
    }

    _activeHint = null;
    _activeEl = null;

    // Cooldown then restart idle timer for next hint
    _onCooldown = true;
    clearTimeout(_cooldownTimer);
    _cooldownTimer = setTimeout(function() {
      _onCooldown = false;
      // If scheduleNext, restart idle detection so more hints can appear
      if (scheduleNext && !_isDisabled()) {
        _resetIdleTimer();
      }
    }, HINT_COOLDOWN);
  }

  // ── Disable / Enable ──────────────────────────────────────────────────────
  function _disableHints() {
    _dismissHint(false);
    try { localStorage.setItem(LS_DISABLED_KEY, '1'); } catch (e) {}
    _stopIdleWatch();
    window.removeEventListener('resize', _repositionActiveBalloon);
    window.removeEventListener('scroll', _repositionActiveBalloon);
    if (typeof showNotification === 'function') {
      showNotification(_t('hints.disabled'), _t('hints.disabledMsg'), 'info');
    }
  }

  function _enableHints() {
    try { localStorage.removeItem(LS_DISABLED_KEY); } catch (e) {}
    window.addEventListener('resize', _repositionActiveBalloon, { passive: true });
    window.addEventListener('scroll', _repositionActiveBalloon, { passive: true });
    _startIdleWatch();
    if (typeof showNotification === 'function') {
      showNotification(_t('hints.enabled'), _t('hints.enabledMsg'), 'info');
    }
  }

  // ── Idle Detection ─────────────────────────────────────────────────────────
  // Any user interaction (scroll, click, typing) dismisses the current hint
  // and resets the idle timer.
  var _activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'click', 'scroll', 'input'];

  function _resetIdleTimer() {
    clearTimeout(_idleTimer);
    // If a hint is showing and user interacts, dismiss it
    if (_activeHint) {
      _dismissHint(true);
      return;
    }
    if (_isDisabled() || _onCooldown) return;
    _idleTimer = setTimeout(_onIdle, IDLE_TIMEOUT);
  }

  function _onIdle() {
    if (_isDisabled() || _activeHint || _onCooldown) return;
    // Blocking overlay / modal detection is now handled inside _isElementVisible().
    // If an overlay is open, only hints targeting elements INSIDE that overlay
    // will pass the visibility check — background hints are automatically suppressed.

    var hint = _pickHint();
    if (hint) _showHint(hint);
  }

  function _startIdleWatch() {
    _activityEvents.forEach(function(evt) {
      document.addEventListener(evt, _resetIdleTimer, { passive: true });
    });
    _resetIdleTimer();
  }

  function _stopIdleWatch() {
    clearTimeout(_idleTimer);
    _activityEvents.forEach(function(evt) {
      document.removeEventListener(evt, _resetIdleTimer);
    });
    _dismissHint(false);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function _init() {
    if (_initialized) return;
    _initialized = true;
    _loadSeen();
    // If hints were disabled but no hints were ever seen, re-enable (first-time UX)
    if (_isDisabled() && Object.keys(_seenHints).length === 0) {
      try { localStorage.removeItem(LS_DISABLED_KEY); } catch(e) {}
    }
    if (!_isDisabled()) {
      _startIdleWatch();
      window._log('[hints] system active, idle timeout=' + IDLE_TIMEOUT + 'ms');
    }
  }

  function _resetHints() {
    _seenHints = {};
    _sessionShown = {};
    _lastHintId = null;
    _saveSeen();
    if (typeof showNotification === 'function') {
      showNotification(_t('hints.reset'), _t('hints.resetMsg'), 'info');
    }
  }

  // ── Force show a specific hint by id (used for post-creation scroll) ────────
  function _forceShowHint(hintId) {
    if (_isDisabled()) return;
    if (_activeHint) _dismissHint(false);
    var hint = _hints.find(function(h) { return h.id === hintId; });
    if (!hint) return;
    var el = _findVisibleEl(hint.selector);
    if (!el) return;
    _showHint(hint);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window._forceShowHint = _forceShowHint;
  window._hintSystem = {
    init: _init,
    enable: _enableHints,
    disable: _disableHints,
    reset: _resetHints,
    isDisabled: _isDisabled,
    dismiss: function() { _dismissHint(false); },
    forceShow: _forceShowHint
  };

  // Auto-init — v1.0.26-beta: delay inicial dobrado de 2s pra 4s pra
  // sistema de hints só ativar depois do user ter tempo de se ambientar.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_init, 4000); });
  } else {
    setTimeout(_init, 4000);
  }

  // Re-evaluate on hash change
  window.addEventListener('hashchange', function() {
    if (_activeHint) _dismissHint(false);
    _onCooldown = false;
    _lastHintId = null;
    clearTimeout(_cooldownTimer);
    _resetIdleTimer();
  });

})();

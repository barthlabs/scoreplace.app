// scoreplace.app — Trophy Catalog
// v1.0.0-beta
//
// Catálogo estático de troféus e marcos (milestones). Não tem dependência de
// Firebase ou estado do usuário — é carregado uma vez e usado por trophies.js.
//
// Estrutura de troféu:
//   id:        string único (snake_case)
//   category:  'perfil' | 'casual' | 'torneio' | 'presenca' | 'social' | 'especial'
//   title:     nome curto (≤30 chars)
//   desc:      o que o usuário precisa fazer (presente, concreto)
//   icon:      emoji
//   tier:      null (calculado dinamicamente via raridade) | 'bronze'|'prata'|'ouro'|'platina'
//   hidden:    true → só aparece após conquistado (troféus surpresa)
//   trigger:   qual evento dispara a checagem
//   check:     function(ctx) → boolean — verificação idempotente
//
// Estrutura de milestone:
//   id:          string base (e.g. 'casual_jogadas')
//   category:    mesma lista dos troféus
//   metric:      chave em userStats (e.g. 'casualMatchesPlayed')
//   step:        incremento aritmético entre níveis (e.g. 25)
//   startAt:     primeiro threshold (e.g. 25)
//   icon:        emoji
//   titleFn:     function(n) → label do nível (e.g. '25 Partidas Casuais')
//   descFn:      function(n, next) → desc do que falta
//   trigger:     evento que dispara a checagem
//
// ─── Catálogo de Troféus Fixos ────────────────────────────────────────────────
// ~40 troféus cobrindo os 5 pilares + especiais.
// Tier "null" → calculado dinamicamente por raridade em trophies.js.
// Tier fixo → sempre essa raridade independente de %  (ex: troféu especial/hidden).

window.TROPHY_CATALOG = [

  // ── PERFIL ────────────────────────────────────────────────────────────────
  {
    id: 'perfil_completo',
    category: 'perfil',
    title: 'Identidade Completa',
    desc: 'Preencha nome, foto real, gênero, nascimento, cidade, modalidade, habilidade, telefone e local favorito.',
    icon: '👤',
    tier: null,
    trigger: 'profile_saved',
    check: function(ctx) {
      var u = ctx.currentUser;
      if (!u) return false;
      // 1. Nome real (não genérico)
      var hasName = !!(u.displayName && typeof window._isUnfriendlyName === 'function'
                       ? !window._isUnfriendlyName(u.displayName)
                       : u.displayName);
      // 2. Foto real (não dicebear/iniciais)
      var hasPhoto = !!(u.photoURL && typeof u.photoURL === 'string'
                       && u.photoURL.length > 0
                       && u.photoURL.indexOf('dicebear.com') === -1);
      // 3. Sexo
      var hasGender = !!(u.gender && String(u.gender).trim().length > 0
                        && u.gender !== 'nao_informar');
      // 4. Data de nascimento
      var hasBirth = !!(u.birthDate && String(u.birthDate).trim().length > 0);
      // 5. Cidade
      var hasCity = !!(u.city && String(u.city).trim().length > 0);
      // 6. Modalidade preferida (≥1)
      var hasSports = !!(Array.isArray(u.preferredSports) && u.preferredSports.length > 0);
      // 7. Habilidade
      var hasSkill = !!(u.skill || (u.skillBySport && Object.keys(u.skillBySport).length > 0));
      // 8. Telefone
      var hasPhone = !!(u.phone && String(u.phone).trim().length > 0);
      // 9. Local favorito (≥1)
      var hasLocation = !!(Array.isArray(u.preferredLocations) && u.preferredLocations.length > 0);
      return hasName && hasPhoto && hasGender && hasBirth && hasCity
             && hasSports && hasSkill && hasPhone && hasLocation;
    }
  },
  {
    id: 'perfil_foto',
    category: 'perfil',
    title: 'Com Rosto',
    desc: 'Adicione uma foto de perfil real (Google, Apple ou upload direto).',
    icon: '📸',
    tier: null,
    trigger: 'login',
    // v1.6.10-beta: revocable=true — se o usuário perder a foto, o troféu é
    // revogado no próximo bootstrap, evitando que usuários com avatar de
    // iniciais (dicebear ou Google default) mantenham o troféu incorretamente.
    revocable: true,
    check: function(ctx) {
      var u = ctx.currentUser;
      if (!u) return false;
      // Fonte autoritativa: Firebase Auth currentUser (evita valor stale do Firestore
      // em AppStore.currentUser.photoURL que o startProfileListener pode sobrescrever
      // com uma URL antiga mesmo quando o usuário não tem mais foto real).
      var fbUser = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      var photoURL = (fbUser && fbUser.photoURL)
                     ? fbUser.photoURL
                     : (u.photoURL || '');

      // v1.6.13-beta: diagnóstico exposto em window pra auditoria via console
      // (DevTools: window._lastPhotoCheckURL retorna a URL avaliada).
      // Permite ao dono inspecionar URLs estranhas reportadas por usuários
      // quando o troféu aparece/some incorretamente, sem precisar logar
      // no Sentry ou fazer redeploy só pra coletar a URL real.
      try { window._lastPhotoCheckURL = photoURL; window._lastPhotoCheckFbHas = !!(fbUser && fbUser.photoURL); } catch(_e) {}

      if (!photoURL || typeof photoURL !== 'string' || photoURL.length === 0) return false;

      // v1.6.29-beta: 2 fontes confiáveis de "tem foto real":
      // (a) UPLOAD via app — URL contém firebasestorage.googleapis.com.
      //     Evidência forte e direta: usuário fez upload pela tela de perfil.
      // (b) Google People API confirmou foto real — flag hasGooglePhotoReal
      //     === true no profile do usuário. Esse flag é setado no login
      //     Google (auth.js v1.6.29) consultando o campo `default` da
      //     People API: default=true significa monograma gerado, default=
      //     false significa foto real cadastrada pelo usuário no Google.
      //     Resposta autoritativa do próprio Google — substitui as
      //     heurísticas frágeis (URL patterns v1.6.13, pixel sampling
      //     v1.6.24) que sempre tinham falsos positivos.
      if (photoURL.indexOf('firebasestorage.googleapis.com') !== -1) return true;
      if (photoURL.indexOf('googleusercontent.com') !== -1 && u.hasGooglePhotoReal === true) return true;
      // Tudo o resto: REJEITA. Google avatar sem confirmação da People API,
      // dicebear, ui-avatars, vazio — nenhum vale.
      return false;
    }
  },
  {
    id: 'perfil_local',
    category: 'perfil',
    title: 'Estou na área',
    desc: 'Adicione pelo menos um local esportivo favorito ao seu perfil.',
    icon: '📍',
    tier: null,
    trigger: 'profile_saved',
    check: function(ctx) {
      var u = ctx.currentUser;
      return !!(u && u.preferredLocations && u.preferredLocations.length > 0);
    }
  },
  {
    id: 'perfil_skills',
    category: 'perfil',
    title: 'Multiesportista',
    desc: 'Declare seu nível de habilidade em 3 ou mais modalidades.',
    icon: '🏅',
    tier: null,
    trigger: 'profile_saved',
    check: function(ctx) {
      var u = ctx.currentUser;
      return !!(u && u.skillBySport && Object.keys(u.skillBySport).length >= 3);
    }
  },

  // ── PARTIDAS CASUAIS ──────────────────────────────────────────────────────
  {
    id: 'casual_primeira',
    category: 'casual',
    title: 'Primeira Bola',
    desc: 'Jogue sua primeira partida casual.',
    icon: '⚡',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualMatchesPlayed || 0) >= 1; }
  },
  {
    id: 'casual_primeira_vitoria',
    category: 'casual',
    title: 'Gostinho de Vitória',
    desc: 'Vença sua primeira partida casual.',
    icon: '🏆',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualMatchesWon || 0) >= 1; }
  },
  {
    id: 'casual_virada',
    category: 'casual',
    title: 'Nunca Desisto',
    desc: 'Vença uma partida casual estando perdendo no primeiro set.',
    icon: '🔄',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return !!(ctx.matchResult && ctx.matchResult.wasComeback); }
  },
  {
    id: 'casual_sequencia_5',
    category: 'casual',
    title: '5 em Sequência',
    desc: 'Vença 5 partidas casuais consecutivas.',
    icon: '🔥',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualWinStreak || 0) >= 5; }
  },
  {
    id: 'casual_maratonista',
    category: 'casual',
    title: 'Maratonista',
    desc: 'Jogue partidas casuais em 7 dias diferentes no mesmo mês.',
    icon: '🗓️',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualActiveDaysThisMonth || 0) >= 7; }
  },
  {
    id: 'casual_multimodalidade',
    category: 'casual',
    title: 'Poliesportista',
    desc: 'Jogue partidas casuais em 3 modalidades diferentes.',
    icon: '🎮',
    tier: null,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualSportsPlayed || 0) >= 3; }
  },

  // ── TORNEIOS ──────────────────────────────────────────────────────────────
  {
    id: 'torneio_primeiro_inscrito',
    category: 'torneio',
    title: 'Presente!',
    desc: 'Se inscreva em seu primeiro torneio.',
    icon: '📋',
    tier: null,
    trigger: 'tournament_enrolled',
    check: function(ctx) { return (ctx.stats.tournamentsEnrolled || 0) >= 1; }
  },
  {
    id: 'torneio_primeira_vitoria',
    category: 'torneio',
    title: 'Estreia com Pé Direito',
    desc: 'Vença sua primeira partida em um torneio.',
    icon: '🎯',
    tier: null,
    trigger: 'tournament_match_result',
    check: function(ctx) { return (ctx.stats.tournamentMatchesWon || 0) >= 1; }
  },
  {
    id: 'torneio_campeao',
    category: 'torneio',
    title: 'Campeão!',
    desc: 'Vença seu primeiro torneio.',
    icon: '🥇',
    tier: null,
    trigger: 'tournament_finished',
    check: function(ctx) { return (ctx.stats.tournamentWins || 0) >= 1; }
  },
  {
    id: 'torneio_podio',
    category: 'torneio',
    title: 'No Pódio',
    desc: 'Termine em 1º, 2º ou 3º lugar em um torneio.',
    icon: '🥈',
    tier: null,
    trigger: 'tournament_finished',
    check: function(ctx) { return (ctx.stats.tournamentPodiums || 0) >= 1; }
  },
  {
    id: 'torneio_criou_primeiro',
    category: 'torneio',
    title: 'Organizador',
    desc: 'Crie e publique seu primeiro torneio.',
    icon: '🏗️',
    tier: null,
    trigger: 'tournament_created',
    check: function(ctx) { return (ctx.stats.tournamentsCreated || 0) >= 1; }
  },
  {
    id: 'torneio_50_inscritos',
    category: 'torneio',
    title: 'Arena Cheia',
    desc: 'Organize um torneio com 50 ou mais inscritos.',
    icon: '🏟️',
    tier: null,
    trigger: 'tournament_created',
    check: function(ctx) { return !!(ctx.tournamentData && ctx.tournamentData.maxParticipantsReached >= 50); }
  },
  {
    id: 'torneio_liga',
    category: 'torneio',
    title: 'Temporadista',
    desc: 'Participe de uma Liga (temporada completa com rodadas múltiplas).',
    icon: '🔄',
    tier: null,
    trigger: 'tournament_enrolled',
    check: function(ctx) { return !!(ctx.stats.ligaParticipations || 0); }
  },

  // ── PRESENÇA ──────────────────────────────────────────────────────────────
  {
    id: 'presenca_primeira',
    category: 'presenca',
    title: 'Estou Aqui!',
    desc: 'Faça seu primeiro check-in em um local esportivo.',
    icon: '📡',
    tier: null,
    trigger: 'checkin',
    check: function(ctx) { return (ctx.stats.checkinsTotal || 0) >= 1; }
  },
  {
    id: 'presenca_planejou',
    category: 'presenca',
    title: 'Planejador',
    desc: 'Use "Planejar ida" para avisar amigos que você vai jogar.',
    icon: '🗓️',
    tier: null,
    trigger: 'plan_created',
    check: function(ctx) { return (ctx.stats.plansCreated || 0) >= 1; }
  },
  {
    id: 'presenca_3_locais',
    category: 'presenca',
    title: 'Explorador',
    desc: 'Faça check-in em 3 locais esportivos diferentes.',
    icon: '🗺️',
    tier: null,
    trigger: 'checkin',
    check: function(ctx) { return (ctx.stats.uniqueVenuesVisited || 0) >= 3; }
  },
  {
    id: 'presenca_madrugador',
    category: 'presenca',
    title: 'Madrugador',
    desc: 'Faça check-in antes das 8h da manhã.',
    icon: '🌅',
    tier: null,
    hidden: true,
    trigger: 'checkin',
    check: function(ctx) {
      if (!ctx.presencePayload) return false;
      var h = new Date(ctx.presencePayload.startsAt).getHours();
      return h < 8;
    }
  },
  {
    id: 'presenca_noturno',
    category: 'presenca',
    title: 'Coruja',
    desc: 'Faça check-in após as 21h.',
    icon: '🌙',
    tier: null,
    hidden: true,
    trigger: 'checkin',
    check: function(ctx) {
      if (!ctx.presencePayload) return false;
      var h = new Date(ctx.presencePayload.startsAt).getHours();
      return h >= 21;
    }
  },
  {
    id: 'presenca_toda_semana',
    category: 'presenca',
    title: 'Frequentador VIP',
    desc: 'Faça check-in em 4 semanas seguidas.',
    icon: '🎽',
    tier: null,
    trigger: 'checkin',
    check: function(ctx) { return (ctx.stats.checkInWeekStreak || 0) >= 4; }
  },

  // ── SOCIAL ────────────────────────────────────────────────────────────────
  {
    id: 'social_primeiro_amigo',
    category: 'social',
    title: 'Primeiro Amigo',
    desc: 'Adicione seu primeiro amigo no scoreplace.',
    icon: '🤝',
    tier: null,
    trigger: 'friend_added',
    check: function(ctx) { return (ctx.stats.friendsCount || 0) >= 1; }
  },
  {
    id: 'social_convidou',
    category: 'social',
    title: 'Evangelista',
    desc: 'Convide alguém para entrar no scoreplace via link de convite.',
    icon: '📨',
    tier: null,
    trigger: 'invite_sent',
    check: function(ctx) { return (ctx.stats.invitesSent || 0) >= 1; }
  },
  {
    id: 'social_encontrou_amigos',
    category: 'social',
    title: 'Rede Formada',
    desc: 'Tenha 5 amigos no scoreplace.',
    icon: '👥',
    tier: null,
    trigger: 'friend_added',
    check: function(ctx) { return (ctx.stats.friendsCount || 0) >= 5; }
  },
  {
    id: 'social_10_amigos',
    category: 'social',
    title: 'Turma Grande',
    desc: 'Tenha 10 amigos no scoreplace.',
    icon: '🫂',
    tier: null,
    trigger: 'friend_added',
    check: function(ctx) { return (ctx.stats.friendsCount || 0) >= 10; }
  },
  {
    id: 'social_notificou_amigos',
    category: 'social',
    title: 'Galera Avisada',
    desc: 'Notifique seus amigos de check-in ou plano em 5 ocasiões.',
    icon: '📣',
    tier: null,
    trigger: 'checkin',
    check: function(ctx) { return (ctx.stats.friendNotifications || 0) >= 5; }
  },

  // ── ESPECIAIS (hidden) ────────────────────────────────────────────────────
  {
    id: 'especial_fundador',
    category: 'especial',
    title: 'Fundador Beta',
    desc: 'Uma das primeiras 50 pessoas a usar o scoreplace em beta.',
    icon: '🧪',
    tier: 'platina',
    hidden: false,
    trigger: 'login',
    check: function(ctx) {
      // Conquistado na inicialização se a conta foi criada antes de 2026-06-01
      var u = ctx.currentUser;
      if (!u || !u.createdAt) return false;
      var created = new Date(u.createdAt);
      var cutoff = new Date('2026-06-01T00:00:00Z');
      return created < cutoff;
    }
  },
  {
    id: 'especial_streak_30',
    category: 'especial',
    title: 'Mês de Ferro',
    desc: 'Use o scoreplace (qualquer ação) em 30 dias consecutivos.',
    icon: '💎',
    tier: null,
    hidden: true,
    trigger: 'daily_activity',
    check: function(ctx) { return (ctx.stats.activityDayStreak || 0) >= 30; }
  },
  {
    id: 'especial_all_modalities',
    category: 'especial',
    title: 'Omniesportista',
    desc: 'Jogue partidas casuais em todas as 9 modalidades do app.',
    icon: '🌟',
    tier: 'ouro',
    hidden: true,
    trigger: 'casual_match_finished',
    check: function(ctx) { return (ctx.stats.casualSportsPlayed || 0) >= 9; }
  },
  {
    id: 'especial_organizador_serie',
    category: 'especial',
    title: 'Organizador Série',
    desc: 'Organize 5 torneios diferentes com pelo menos 10 inscritos cada.',
    icon: '🎪',
    tier: null,
    hidden: false,
    trigger: 'tournament_created',
    check: function(ctx) { return (ctx.stats.tournamentsWithTenPlus || 0) >= 5; }
  },

  // ── TROFEUS DE CATEGORIA COMPLETA ────────────────────────────────────────────
  // Concedido ao completar TODOS os troféus de uma categoria.
  // IDs prefixados com cat_ para que o bootstrap os trate em segundo passo.

  {
    id: 'cat_perfil',
    category: 'perfil',
    title: 'Perfil Perfeito',
    desc: 'Complete todos os troféus da categoria Perfil.',
    icon: '⭐',
    tier: 'ouro',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['perfil']) || [];
      var earned = ctx.userTrophies || {};
      return all.length > 0 && all.every(function(t) {
        return t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  },
  {
    id: 'cat_casual',
    category: 'casual',
    title: 'Mestre Casual',
    desc: 'Complete todos os troféus da categoria Partidas Casuais.',
    icon: '🎮',
    tier: 'platina',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['casual']) || [];
      var earned = ctx.userTrophies || {};
      return all.length > 0 && all.every(function(t) {
        return t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  },
  {
    id: 'cat_torneio',
    category: 'torneio',
    title: 'Lorde dos Torneios',
    desc: 'Complete todos os troféus da categoria Torneios.',
    icon: '👑',
    tier: 'platina',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['torneio']) || [];
      var earned = ctx.userTrophies || {};
      return all.length > 0 && all.every(function(t) {
        return t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  },
  {
    id: 'cat_presenca',
    category: 'presenca',
    title: 'Presença Total',
    desc: 'Complete todos os troféus da categoria Presença.',
    icon: '🌍',
    tier: 'ouro',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['presenca']) || [];
      var earned = ctx.userTrophies || {};
      return all.length > 0 && all.every(function(t) {
        return t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  },
  {
    id: 'cat_social',
    category: 'social',
    title: 'Alma Social',
    desc: 'Complete todos os troféus da categoria Social.',
    icon: '🌐',
    tier: 'ouro',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['social']) || [];
      var earned = ctx.userTrophies || {};
      return all.length > 0 && all.every(function(t) {
        return t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  },
  {
    id: 'cat_especial',
    category: 'especial',
    title: 'Lenda do scoreplace',
    desc: 'Complete todos os troféus Especiais (exceto Fundador Beta).',
    icon: '💎',
    tier: 'platina',
    trigger: 'category_complete',
    check: function(ctx) {
      var all = (window.TROPHY_CATALOG_BY_CATEGORY && window.TROPHY_CATALOG_BY_CATEGORY['especial']) || [];
      var earned = ctx.userTrophies || {};
      // Exclui especial_fundador (reconhecimento por data, não é missão) e os próprios cat_
      var skip = { cat_especial: true, especial_fundador: true };
      return all.length > 0 && all.every(function(t) {
        return skip[t.id] || t.id.indexOf('cat_') === 0 || !!earned[t.id];
      });
    }
  }
];

// ─── Catálogo de Milestones (Progressão Aritmética) ───────────────────────────
// Cada milestone gera thresholds infinitos com step constante.
// Exemplo: casual matches, step=25 → 25, 50, 75, 100, 125, ... para sempre.

window.MILESTONE_CATALOG = [

  // PARTIDAS CASUAIS: +25 por nível (começa em 25)
  {
    id: 'milestone_casual_jogadas',
    category: 'casual',
    metric: 'casualMatchesPlayed',
    step: 25,
    startAt: 25,
    icon: '⚡',
    titleFn: function(n) { return n + ' Partidas Casuais'; },
    descFn: function(n, next) {
      return 'Você jogou ' + n + ' partidas casuais. Próximo nível: ' + next + '.';
    },
    trigger: 'casual_match_finished'
  },

  // VITÓRIAS CASUAIS: +25 por nível (começa em 25)
  {
    id: 'milestone_casual_vitorias',
    category: 'casual',
    metric: 'casualMatchesWon',
    step: 25,
    startAt: 25,
    icon: '🏆',
    titleFn: function(n) { return n + ' Vitórias Casuais'; },
    descFn: function(n, next) {
      return 'Você venceu ' + n + ' partidas casuais. Próximo: ' + next + '.';
    },
    trigger: 'casual_match_finished'
  },

  // TORNEIOS PARTICIPADOS: +3 por nível (começa em 3)
  {
    id: 'milestone_torneios_participados',
    category: 'torneio',
    metric: 'tournamentsEnrolled',
    step: 3,
    startAt: 3,
    icon: '📋',
    titleFn: function(n) { return n + ' Torneios Jogados'; },
    descFn: function(n, next) {
      return 'Você participou de ' + n + ' torneios. Próximo: ' + next + '.';
    },
    trigger: 'tournament_enrolled'
  },

  // VITÓRIAS DE TORNEIO: +2 por nível (começa em 2)
  {
    id: 'milestone_torneios_campeao',
    category: 'torneio',
    metric: 'tournamentWins',
    step: 2,
    startAt: 2,
    icon: '🥇',
    titleFn: function(n) { return n + ' Títulos'; },
    descFn: function(n, next) {
      return 'Você venceu ' + n + ' torneios. Próximo: ' + next + '.';
    },
    trigger: 'tournament_finished'
  },

  // TORNEIOS CRIADOS: +3 por nível (começa em 3)
  {
    id: 'milestone_torneios_criados',
    category: 'torneio',
    metric: 'tournamentsCreated',
    step: 3,
    startAt: 3,
    icon: '🏗️',
    titleFn: function(n) { return n + ' Torneios Organizados'; },
    descFn: function(n, next) {
      return 'Você organizou ' + n + ' torneios. Próximo: ' + next + '.';
    },
    trigger: 'tournament_created'
  },

  // VITÓRIAS EM PARTIDAS DE TORNEIO: +25 por nível (começa em 25)
  {
    id: 'milestone_partidas_torneio_vitorias',
    category: 'torneio',
    metric: 'tournamentMatchesWon',
    step: 25,
    startAt: 25,
    icon: '🎯',
    titleFn: function(n) { return n + ' Vitórias em Torneios'; },
    descFn: function(n, next) {
      return n + ' vitórias em partidas de torneio. Próximo: ' + next + '.';
    },
    trigger: 'tournament_match_result'
  },

  // CHECK-INS: +10 por nível (começa em 10)
  {
    id: 'milestone_checkins',
    category: 'presenca',
    metric: 'checkinsTotal',
    step: 10,
    startAt: 10,
    icon: '📍',
    titleFn: function(n) { return n + ' Check-ins'; },
    descFn: function(n, next) {
      return 'Você fez ' + n + ' check-ins. Próximo: ' + next + '.';
    },
    trigger: 'checkin'
  },

  // LOCAIS ÚNICOS VISITADOS: +5 por nível (começa em 5)
  {
    id: 'milestone_locais_visitados',
    category: 'presenca',
    metric: 'uniqueVenuesVisited',
    step: 5,
    startAt: 5,
    icon: '🏢',
    titleFn: function(n) { return n + ' Locais Visitados'; },
    descFn: function(n, next) {
      return 'Você visitou ' + n + ' locais únicos. Próximo: ' + next + '.';
    },
    trigger: 'checkin'
  },

  // AMIGOS: +5 por nível (começa em 5)
  {
    id: 'milestone_amigos',
    category: 'social',
    metric: 'friendsCount',
    step: 5,
    startAt: 5,
    icon: '👥',
    titleFn: function(n) { return n + ' Amigos'; },
    descFn: function(n, next) {
      return 'Você tem ' + n + ' amigos no scoreplace. Próximo: ' + next + '.';
    },
    trigger: 'friend_added'
  }
];

// ─── Índices para acesso rápido ───────────────────────────────────────────────

window.TROPHY_CATALOG_BY_ID = {};
window.TROPHY_CATALOG.forEach(function(t) {
  window.TROPHY_CATALOG_BY_ID[t.id] = t;
});

window.TROPHY_CATALOG_BY_CATEGORY = {};
window.TROPHY_CATALOG.forEach(function(t) {
  if (!window.TROPHY_CATALOG_BY_CATEGORY[t.category]) {
    window.TROPHY_CATALOG_BY_CATEGORY[t.category] = [];
  }
  window.TROPHY_CATALOG_BY_CATEGORY[t.category].push(t);
});

window.MILESTONE_CATALOG_BY_ID = {};
window.MILESTONE_CATALOG.forEach(function(m) {
  window.MILESTONE_CATALOG_BY_ID[m.id] = m;
});

window.MILESTONE_CATALOG_BY_TRIGGER = {};
window.MILESTONE_CATALOG.forEach(function(m) {
  if (!window.MILESTONE_CATALOG_BY_TRIGGER[m.trigger]) {
    window.MILESTONE_CATALOG_BY_TRIGGER[m.trigger] = [];
  }
  window.MILESTONE_CATALOG_BY_TRIGGER[m.trigger].push(m);
});

window.TROPHY_CATALOG_BY_TRIGGER = {};
window.TROPHY_CATALOG.forEach(function(t) {
  if (!window.TROPHY_CATALOG_BY_TRIGGER[t.trigger]) {
    window.TROPHY_CATALOG_BY_TRIGGER[t.trigger] = [];
  }
  window.TROPHY_CATALOG_BY_TRIGGER[t.trigger].push(t);
});

// ─── Helper: calcula threshold do nível N (1-based) de um milestone ──────────
window._milestoneThresholdAt = function(milestone, level) {
  // level=1 → startAt; level=2 → startAt+step; ...
  return milestone.startAt + milestone.step * (level - 1);
};

// ─── Helper: dado um valor atual, retorna o nível conquistado (0 se nenhum) ──
window._milestoneCurrentLevel = function(milestone, currentValue) {
  if (!currentValue || currentValue < milestone.startAt) return 0;
  return Math.floor((currentValue - milestone.startAt) / milestone.step) + 1;
};

// ─── Helper: tier por label ───────────────────────────────────────────────────
window.TROPHY_TIER_ORDER = ['bronze', 'prata', 'ouro', 'platina'];
window.TROPHY_TIER_COLORS = {
  bronze:  { bg: 'rgba(180,100,40,0.15)',  border: 'rgba(180,100,40,0.4)',  text: '#cd7f32', glow: 'rgba(180,100,40,0.25)' },
  prata:   { bg: 'rgba(160,165,175,0.15)', border: 'rgba(160,165,175,0.4)', text: '#a8a9ad', glow: 'rgba(160,165,175,0.25)' },
  ouro:    { bg: 'rgba(218,165,32,0.15)',  border: 'rgba(218,165,32,0.5)',  text: '#fbbf24', glow: 'rgba(218,165,32,0.35)' },
  platina: { bg: 'rgba(120,200,255,0.15)', border: 'rgba(120,200,255,0.5)', text: '#67e8f9', glow: 'rgba(120,200,255,0.4)' }
};

// Tier por raridade: % de usuários que têm o troféu → tier
// >60% → bronze | 20-60% → prata | 5-20% → ouro | <5% → platina
window._trophyTierFromPct = function(pct) {
  if (pct > 60) return 'bronze';
  if (pct > 20) return 'prata';
  if (pct > 5)  return 'ouro';
  return 'platina';
};

// Tier de milestone por nível: cada 10 níveis sobe um tier
window._milestoneTierFromLevel = function(level) {
  if (level <= 4)  return 'bronze';
  if (level <= 8)  return 'prata';
  if (level <= 12) return 'ouro';
  return 'platina';
};

// ─── Anti-fraude: regras de qualificação para troféus e milestones ────────────
// Impede que partidas/torneios fabricados (solo, bots, muito rápidos) contem.
//
// Regras para uma partida casual qualificar:
//   1. status === 'finished'
//   2. hostUid e guestUid distintos, não-vazios, não-bot, não self-play
//   3. Duração mínima 3 min (se createdAt + finishedAt disponíveis)
//
window._isCasualMatchQualified = function(match) {
  if (!match) return false;
  if (match.status !== 'finished') return false;

  var hUid = String(match.hostUid || '').trim();
  var gUid = String(match.guestUid || '').trim();

  // Dois jogadores distintos obrigatórios
  if (!hUid || !gUid) return false;
  if (hUid === gUid) return false;

  // Rejeita UIDs de bot (bot_, bot- ou literal "bot")
  if (/^bot[_\-]|^bot$/i.test(hUid) || /^bot[_\-]|^bot$/i.test(gUid)) return false;

  // Duração mínima: 3 minutos (quando timestamps disponíveis)
  var created  = match.createdAt  || match.startedAt;
  var finished = match.finishedAt || match.updatedAt;
  if (created && finished) {
    var t0 = (created.toDate  ? created.toDate()  : new Date(created )).getTime();
    var t1 = (finished.toDate ? finished.toDate() : new Date(finished)).getTime();
    if (!isNaN(t0) && !isNaN(t1) && t1 > t0 && (t1 - t0) < 3 * 60 * 1000) return false;
  }

  return true;
};

// Limite diário: máximo N partidas por dia-calendário contam para milestones
// (evita grinding de partidas rápidas em série no mesmo dia).
window.TROPHY_DAILY_MATCH_LIMIT = 5;

// Recebe array de match objects já qualificados individualmente.
// Retorna subconjunto respeitando TROPHY_DAILY_MATCH_LIMIT por dia.
window._applyDailyMatchLimit = function(matches, limitPerDay) {
  if (typeof limitPerDay !== 'number') limitPerDay = window.TROPHY_DAILY_MATCH_LIMIT;
  var byDay = {};
  var out   = [];
  for (var i = 0; i < matches.length; i++) {
    var m  = matches[i];
    var ts = m.finishedAt || m.updatedAt || m.createdAt;
    if (!ts) { out.push(m); continue; }
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) { out.push(m); continue; }
    var key = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    byDay[key] = (byDay[key] || 0) + 1;
    if (byDay[key] <= limitPerDay) out.push(m);
  }
  return out;
};

// Torneio qualifica para troféus de vitória/participação se:
//   1. status === 'finished'
//   2. Mínimo 4 participantes (impede torneios solo/fabricados)
window._isTournamentQualifiedForTrophy = function(t) {
  if (!t) return false;
  if (t.status !== 'finished') return false;
  var count = (t.participants && t.participants.length) ||
              (t.memberEmails && t.memberEmails.length) || 0;
  return count >= 4;
};

window._log('[trophy-catalog] loaded — ' + window.TROPHY_CATALOG.length + ' trophies, ' + window.MILESTONE_CATALOG.length + ' milestones');

'use strict';
/* CONTRATO ÚNICO das chamadas do cliente às Cloud Functions.
 *
 * ⛔ POR QUE EXISTE: duas suítes perguntam coisas diferentes sobre o MESMO conjunto —
 * `uma-porta-para-chamar-a-cf` ("quantas casas de transporte existem?") e
 * `portas-que-o-app-chama-existem` ("todo nome chamado existe como export?"). Cada uma
 * escrevendo a sua lista viraria duas verdades sobre a mesma coisa, que é exatamente a
 * classe de defeito que as duas levas vieram consertar.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* O ÚNICO construtor dinâmico autorizado: monta a URL a partir do parâmetro. */
const CONSTRUTOR_DINAMICO = { arquivo: 'js/views/tournaments-draw.js', funcao: '_callCF' };

/* O wrapper: NÃO monta URL (isso acabou na leva do transporte). A isenção dele vale só
 * para o ENCAMINHAMENTO `name → _callCF(name, …)` — não para a função inteira. */
const WRAPPER_ENCAMINHA = { arquivo: 'js/firebase-db.js', funcao: '_callFn', delega: '_callCF' };

/* As URLs literais que sobreviveram, com a classe de transporte de cada uma. `callable`
 * fala o envelope {data}; `http` é onRequest com corpo próprio. */
const URLS_LITERAIS = [
  { nome: 'checkAccount',         arquivo: 'js/views/auth.js',                 classe: 'callable' },
  { nome: 'mergePhoneAccount',    arquivo: 'js/views/auth.js',                 classe: 'callable' },
  /* ⚠️ NÃO é literal: é concatenação . */
  { nome: 'integrateLateEntries', arquivo: 'js/views/tournaments-draw.js', classe: 'callable', forma: 'concatenada' },
  { nome: 'createCheckoutSession', arquivo: 'js/store.js',                     classe: 'http' },
];

/* Os três entrypoints que declaram exports publicáveis. */
const ENTRYPOINTS = [
  { arquivo: 'functions/index.js',           modulo: false },
  { arquivo: 'functions-autodraw/index.js',  modulo: false },
  { arquivo: 'functions-stripe/index.js',    modulo: true  },
];

/* Tipos que TÊM endereço para o cliente chamar. Gatilho não entra. */
const TIPOS_CHAMAVEIS = ['onCall', 'onRequest'];
const TRANSPORTE_EXIGE = { httpsCallable: ['onCall'], _callCF: ['onCall'], _callFn: ['onCall'], url: ['onCall', 'onRequest'] };


/* ⭐ PROJETO — a URL é montada com ele, então ele é do contrato e é CONFERIDO contra o
 * `.firebaserc` (projects.default). Sonda apontada para outro projeto mediria outro
 * endpoint e reportaria `ausente` FALSO — o erro que esta ferramenta existe para não cometer. */
const PROJECT_ID = 'scoreplace-app';
const montarUrl = ({ nome, regiao }) => 'https://' + regiao + '-' + PROJECT_ID + '.cloudfunctions.net/' + nome;

/* ⭐ TABELA CANÔNICA: UMA LINHA POR NOME, sem regra geral e SEM FALLBACK.
 * `modo` é POLÍTICA (sondo ou não) — `sondavel` só para `onCall`, `naoSondada` obrigatório
 * para `onRequest`, que não fala o protocolo callable. A CLASSIFICAÇÃO (o que voltou) vive
 * só no resultado e no baseline: política e medida são coisas diferentes.
 * `origemRegiao` diz DE ONDE a região saiu, e o teste confere contra o código — sem isso a
 * tabela envelhece em silêncio. Nome novo sem linha ⇒ o teste reprova, de propósito. */
const TABELA = [
  { nome: "acceptFriendRequest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "acceptLigaSubstitutionInvite", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "acceptOwnTerms", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "addTournamentPlaceholders", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "advanceTournamentPhase", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyCategoryCommunicationMarkers", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyDrawPollResult", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyEnrollmentAssignments", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyLigaGroupWO", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyMatchResult", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyMonarchGroupWO", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyTournamentFormat", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "applyTournamentWO", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "assignMatchCourt", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "autoAssignTournamentCategories", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "backfillAllUserTrophies", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "cacheVenuePhoto", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "cancelDrawPreparation", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "cancelFriendRequest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "cancelLigaSubstitutionInvites", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "cancelTournamentPairRequest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "castDrawPollVote", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "checkAccount", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "checkDisplayNameAvailability", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "checkNameConflict", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "closeDrawPoll", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "closeExpiredEnrollment", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "closeExpiredLeagueSeason", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "closePhaseLeagueRound", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "closeRound", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "completeOwnEligibilityProfile", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "confirmEmailMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "confirmSecondaryEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "createCheckoutSession", regiao: "southamerica-east1", modo: "naoSondada", origemRegiao: {"tipo":"literal"} },
  { nome: "createDrawPoll", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "createSandbox", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "createTournament", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "declineLigaSubstitutionInvite", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "deduplicateTournamentParticipants", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "deenrollParticipant", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "deleteAccount", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "deleteEmptyTournamentCategory", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "deleteTournament", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "desfazerFusao", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "dismissDuplicateAccount", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "dismissDuplicateSuspicion", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "dispatchAccountRecovery", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "dissolveIncompleteTeams", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "drainTournamentWaitlists", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "drawRound", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "enrollParticipant", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "fillLigaGuest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "finishTournament", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "formLatePair", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "formPair", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "generateExtraTournamentRound", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "getCommunicationStats", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "getOwnEmailMergeCandidates", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "getTournamentDuplicateAccounts", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "getTournamentEnrollmentProfiles", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "getTournamentParticipantContact", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "getTournamentRosterContacts", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "healOrphanTournamentMatchLabels", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "initializeUserProfile", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "integrateLateEntries", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "inviteLigaSubstitutes", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "leaveStandby", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "listCommunications", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "listLegacyFriendships", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "manageTournamentReferee", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "manageWOClaim", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "markDrawPollNotificationsRead", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "markOwnSession", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "materializeOwnCasualMatchHistory", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "mergePhoneAccount", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "mergeTournamentCategories", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "mutateHostOrganization", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "mutateOpinionPoll", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "normalizeTournamentCategories", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "occupyTournamentPlaceholder", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "pedirProvaDaSegundaConta", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "phonePasswordLogin", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "reconcileBracket", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "reconcileMonarchEnrollment", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "recordPhoneVerificationAttempt", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "registerPhonePassword", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "rejectFriendRequest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "removeFriend", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "removeOwnCasualMatchHistory", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "removeTournamentParticipant", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "renameTournamentParticipant", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "reopenDrawEnrollment", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "reopenDrawPoll", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "reopenEnrollmentForTarget", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "reopenTournament", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "requestEmailMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "requestNameMergeProof", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "requestParticipantMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "requestSecondaryEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "requestTournamentPair", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resetTournamentCheckIn", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resetTournamentToEnrollment", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resolveLoginRedirect", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "resolveMergedLogin", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "resolveParticipantMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resolvePendingDraw", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resolvePhaseInactives", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resolveProfileTournamentCategoryChange", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "resolveWOSubstitutionChoice", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "respondHostInvite", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "revertLigaGroupWO", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "revertMonarchGroupWO", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "runEnrollmentSlotsDraw", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "saveTournamentReplay", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "sendCoHostInviteEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendFriendRequest", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"constante","nome":"_AMIZADE_OPTS"} },
  { nome: "sendOrgCommunication", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendPairInviteEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendPasswordReset", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendPasswordResetPhone", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendTournamentInvite", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendVerificationCode", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "sendVerificationEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setDefaultTournamentScoring", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setDrawBalanceChoice", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setDrawPreparationSuspension", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setLateDrawDecision", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setLigaAvailability", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setMatchSchedule", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setMatchWhatsAppGroup", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setOwnActiveCasualRoom", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setParticipantContactPhone", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setParticipantLetzplay", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setPhaseLateEnrollment", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setPhasePromotion", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentBranding", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentCategoryConfig", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentEnrollmentStatus", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentFlyerPrefs", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentParticipantVip", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setTournamentPresence", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "setTournamentPresenceWithWOSubstitution", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentWOAbsence", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "setTournamentWhatsAppGroup", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "splitLatePair", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "splitPair", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "splitTournamentParticipant", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "startTournament", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "substituteLigaGroupDirect", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "syncProfileTournamentCategory", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "undoInferredTournamentCategoryMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "undoTournamentCategoryMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "undoTournamentParticipantMerge", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "unlinkOwnLinkedPhone", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "unlinkSecondaryEmail", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnBlockedUser", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnCasualLast", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnCasualScoringPreferences", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnContactPrivacy", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnFriendRequestPreference", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnGooglePhotoMarker", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnInterfacePreferences", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnLiveAlerts", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnLiveScorePreferences", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnNotificationPreferences", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnPreferredLocations", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnPresencePreferences", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnProfile", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnPushToken", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateOwnTournamentPreference", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "updateTournamentConfiguration", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"default"} },
  { nome: "verifyEmailCode", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "verifyPasswordResetPhone", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "verifyPasswordResetPhoneToken", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
  { nome: "verifyPhoneGate", regiao: "us-central1", modo: "sondavel", origemRegiao: {"tipo":"literal"} },
];
const REGIOES = ['us-central1', 'southamerica-east1'];
const CLASSIFICACOES = ['presente', 'ausente', 'desconhecido', 'naoSondada'];

module.exports = { PROJECT_ID, montarUrl, TABELA, REGIOES, CLASSIFICACOES, ROOT, CONSTRUTOR_DINAMICO, WRAPPER_ENCAMINHA, URLS_LITERAIS, ENTRYPOINTS, TIPOS_CHAMAVEIS, TRANSPORTE_EXIGE };

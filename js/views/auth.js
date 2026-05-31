// ========================================
// scoreplace.app — Firebase Auth + Firestore Init
// ========================================
// Project: scoreplace-app (Firebase Console)

// v1.0.30-beta: Magic Link Wrapper Resolver — corre antes de qualquer outra
// coisa pra interceptar URLs no formato /?ml=TOKEN. Bug reportado por múltiplos
// beta testers: "entrou mas deu link expirado pelo magic link". Causa: email
// scanners (Gmail, Outlook, corporate security) prefetcham os links pra
// análise anti-phishing — Firebase oobCode é one-time-use, então quem chega
// antes do usuário humano consume. Solução: o email aponta pra wrapper URL
// nossa que SÓ executa o redirect via JS no browser real do humano. Scanners
// fazem GET/HEAD e param antes do JS rodar, então não tocam no oobCode.
(function _handleMagicLinkWrapper() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('ml');
    if (!token) return;

    // Loading screen — usuário sabe que tá entrando, não acha que travou.
    var bg = '#0f172a';
    var fg = '#fbbf24';
    document.documentElement.style.background = bg;
    var showStatus = function(emoji, title, subtitle, isError) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;flex-direction:column;gap:14px;padding:24px;text-align:center;">' +
        '<div style="font-size:2.4rem;line-height:1;">' + emoji + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:' + (isError ? '#ef4444' : fg) + ';">' + title + '</div>' +
        (subtitle ? '<div style="font-size:0.85rem;color:#94a3b8;max-width:340px;line-height:1.5;">' + subtitle + '</div>' : '') +
        (isError ? '<a href="/" style="margin-top:8px;color:' + fg + ';font-size:0.85rem;text-decoration:none;border:1px solid ' + fg + ';padding:8px 18px;border-radius:8px;">Voltar e pedir novo link</a>' : '') +
        '</div>';
    };
    showStatus('🎾', 'Entrando no scoreplace.app...', 'Carregando seu acesso seguro');

    // Aguarda Firestore estar pronto (firebase-db.js carrega antes deste).
    var tries = 0;
    var resolve = function() {
      var db = window.FirestoreDB && window.FirestoreDB.db;
      if (!db) {
        if (tries++ < 60) return setTimeout(resolve, 100); // até 6s
        showStatus('⚠️', 'Não foi possível carregar', 'Verifique sua conexão e tente abrir o link de novo, ou peça um novo link.', true);
        return;
      }
      db.collection('magicLinks').doc(token).get().then(function(doc) {
        if (!doc.exists) {
          showStatus('🔗', 'Link inválido ou expirado', 'Esse link não existe mais. Volte e peça um novo no campo de login.', true);
          return;
        }
        var data = doc.data() || {};
        if (!data.firebaseLink) {
          showStatus('🔗', 'Link inválido', 'Esse link está corrompido. Peça um novo.', true);
          return;
        }
        // Salva email no localStorage pra signInWithEmailLink completar
        // sem perguntar. Cross-device também: o Firebase auth handler
        // anexa ?eml=email ao continueUrl (já no actionCodeSettings).
        if (data.email) {
          try { window.localStorage.setItem('scoreplace_emailForSignIn', data.email); } catch(_){}
        }
        // Redireciona o BROWSER pro firebaseLink real — só agora o oobCode
        // será efetivamente consumido. Scanners não chegam aqui.
        window.location.replace(data.firebaseLink);
      }).catch(function(err) {
        window._error('[magicLink] erro ao buscar token:', err);
        if (typeof window._captureException === 'function') {
          window._captureException(err, { area: 'magicLinkWrapper', token: token.substring(0, 6) + '...' });
        }
        showStatus('⚠️', 'Erro ao validar o link', 'Tente abrir de novo. Se persistir, peça um novo link.', true);
      });
    };
    resolve();
  } catch (e) {
    window._error('[magicLink] handler crashed:', e);
  }
})();

// v1.3.83-beta: WhatsApp Magic Link Wrapper — detecta /?wt=TOKEN gerado por
// sendWhatsAppMagicLink (Cloud Function). Diferente do ?ml= (email magic link
// que redireciona pro Firebase), o ?wt= usa signInWithCustomToken — login
// direto sem OTP, sem redirecionamento extra.
(function _handleWhatsAppMagicLink() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('wt');
    if (!token) return;

    var bg = '#0f172a';
    var fg = '#25d366'; // verde WhatsApp
    document.documentElement.style.background = bg;

    var showStatus = function(emoji, title, subtitle, isError, extraHtml) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;flex-direction:column;gap:14px;padding:24px;text-align:center;">' +
        '<div style="font-size:2.4rem;line-height:1;">' + emoji + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:' + (isError ? '#ef4444' : fg) + ';">' + title + '</div>' +
        (subtitle ? '<div style="font-size:0.85rem;color:#94a3b8;max-width:340px;line-height:1.5;">' + subtitle + '</div>' : '') +
        (isError ? '<a href="/" style="margin-top:8px;color:' + fg + ';font-size:0.85rem;text-decoration:none;border:1px solid ' + fg + ';padding:8px 18px;border-radius:8px;">Voltar ao início</a>' : '') +
        (extraHtml || '') +
        '</div>';
    };

    // Detecta iOS + browser não-Safari (Chrome, Firefox, Edge no iPhone/iPad).
    // No iPhone, apenas o Safari suporta instalação como PWA e tem melhor suporte
    // a cookies/auth de terceiros. Se o link abriu em outro browser, oferecemos
    // abrir no Safari via o scheme x-safari-https:// (abre o Safari diretamente).
    var _ua = navigator.userAgent || '';
    var _isIOS = /iPad|iPhone|iPod/.test(_ua) && !window.MSStream;
    var _isSafari = /Safari/.test(_ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(_ua);
    if (_isIOS && !_isSafari) {
      var safarUri = 'x-safari-https://scoreplace.app/?wt=' + encodeURIComponent(token);
      var btnStyle = 'display:inline-block;margin-top:6px;background:' + fg + ';color:#000;font-weight:700;font-size:0.9rem;padding:12px 22px;border-radius:10px;text-decoration:none;';
      var skipStyle = 'display:inline-block;margin-top:10px;color:#64748b;font-size:0.78rem;text-decoration:underline;cursor:pointer;';
      showStatus('🧭', 'Abra no Safari', 'No iPhone, o login pelo WhatsApp funciona melhor no Safari.',
        false,
        '<a href="' + safarUri + '" style="' + btnStyle + '">Abrir no Safari</a>' +
        '<div style="' + skipStyle + '" onclick="document.getElementById(\'wt-continue\').style.display=\'block\';this.style.display=\'none\';">Continuar no Chrome mesmo assim</div>' +
        '<div id="wt-continue" style="display:none;margin-top:10px;color:#94a3b8;font-size:0.78rem;">Aguarde...</div>'
      );
      // Ouve clique em "Continuar no Chrome" para disparar o fluxo normal
      var waitContinue = setInterval(function() {
        var el = document.getElementById('wt-continue');
        if (el && el.style.display !== 'none') {
          clearInterval(waitContinue);
          continueLogin();
        }
      }, 200);
      return;
    }

    showStatus('💬', 'Entrando via WhatsApp...', 'Validando seu link de acesso seguro');
    continueLogin();

    function continueLogin() {
      var tries = 0;
      var resolve = function() {
        var db = window.FirestoreDB && window.FirestoreDB.db;
        var auth = window.firebase && window.firebase.auth && window.firebase.auth();
        if (!db || !auth) {
          if (tries++ < 80) return setTimeout(resolve, 100); // até 8s
          showStatus('⚠️', 'Não foi possível carregar', 'Verifique sua conexão e tente abrir o link de novo.', true);
          return;
        }
        db.collection('magicLinks').doc(token).get().then(function(doc) {
          if (!doc.exists) {
            showStatus('🔗', 'Link inválido ou expirado', 'Esse link não existe mais. Volte ao app e faça login novamente.', true);
            return;
          }
          var data = doc.data() || {};
          if (data.type !== 'customToken' || !data.customToken) {
            showStatus('🔗', 'Link inválido', 'Formato de link não reconhecido. Peça um novo pelo app.', true);
            return;
          }
          // Verifica expiração client-side (defense-in-depth)
          if (data.expiresAt) {
            var exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
            if (exp < new Date()) {
              showStatus('⏱️', 'Link expirado', 'O link de WhatsApp expirou. Abra o app e faça login novamente.', true);
              return;
            }
          }
          showStatus('💬', 'Quase lá...', 'Abrindo sua conta');
          auth.signInWithCustomToken(data.customToken).then(function() {
            // IMPORTANTE: showStatus() substituiu todo o document.body.innerHTML,
            // então o #view-container não existe mais. Não adianta só fazer
            // replaceState — o router não acharia o container. Fazemos um reload
            // completo para /#dashboard. O auth token foi persistido por
            // signInWithCustomToken (IndexedDB), então Firebase Auth verá o
            // usuário logado após o reload e o app abre normalmente.
            showStatus('✅', 'Você entrou!', 'Carregando o app...');
            setTimeout(function() {
              window.location.replace('/#dashboard');
            }, 400);
          }).catch(function(err) {
            window._error('[wtMagicLink] signInWithCustomToken failed:', err);
            if (typeof window._captureException === 'function') {
              window._captureException(err, { area: 'wtMagicLink', token: token.substring(0, 6) + '...' });
            }
            showStatus('⚠️', 'Não foi possível entrar', 'O link pode ter expirado. Tente fazer login pelo app normalmente.', true);
          });
        }).catch(function(err) {
          window._error('[wtMagicLink] Firestore fetch failed:', err);
          showStatus('⚠️', 'Erro ao validar o link', 'Tente abrir de novo. Se persistir, faça login pelo app.', true);
        });
      };
      resolve();
    }
  } catch (e) {
    window._error('[wtMagicLink] handler crashed:', e);
  }
})();

const firebaseConfig = {
  apiKey: "AIzaSyB7AyOojV_Pm50Kr7bovVY4jVTTNbKOK0A",
  authDomain: "scoreplace-app.firebaseapp.com",
  projectId: "scoreplace-app",
  storageBucket: "scoreplace-app.firebasestorage.app",
  messagingSenderId: "382268772878",
  appId: "1:382268772878:web:7c164933f3beacba4be25f",
  measurementId: "G-PZ25D36JSV"
};

// ─── Safari detection ───────────────────────────────────────────────────────
// Safari (desktop + iOS) has ITP that breaks popup-based OAuth when the auth
// domain is cross-origin (firebaseapp.com). We detect Safari + in-app webviews
// (iOS Chrome, Facebook/Instagram browser) and route those users through the
// redirect flow, which is ITP-friendly.
function _isSafariOrIOSWebView() {
  try {
    var ua = navigator.userAgent || '';
    var isChromium = /Chrome|Chromium|CriOS|EdgA|EdgiOS/.test(ua);
    var isSafariUA = /Safari/.test(ua) && !isChromium;
    var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isIOSWebView = isIOS && !/Safari/.test(ua);
    // iOS always — even Chrome on iOS uses WebKit and suffers the same ITP issues
    return isSafariUA || isIOS || isIOSWebView;
  } catch (e) { return false; }
}
window._isSafariOrIOSWebView = _isSafariOrIOSWebView;

// Initialize Firebase + Firestore
let authProvider = null;
try {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    authProvider = new firebase.auth.GoogleAuthProvider();
    // NOTE: Sensitive People API scopes (gender, birthday, addresses, phone)
    // require Google OAuth app verification. Without verification, Google shows
    // an "unverified app" warning that silently rejects the login flow for many
    // users. We use only default scopes (profile, email) — users can fill in
    // demographics manually in their profile.
  } else if (firebase.auth && firebase.auth.GoogleAuthProvider) {
    authProvider = new firebase.auth.GoogleAuthProvider();
  }
  // v1.0.59-beta: inicializa Analytics (GA4) logo após initializeApp.
  // Idempotente — _initAnalytics tem guard interno. measurementId já vem
  // no firebaseConfig. Failsafe — se SDK não carregou (ad-blocker etc),
  // todas as chamadas viram no-op, app continua funcionando.
  try {
    if (typeof window._initAnalytics === 'function') window._initAnalytics();
  } catch (_e) {}
  // v0.16.38: força o seletor de conta Google a aparecer SEMPRE no popup.
  // Sem isso, usuários com múltiplas contas Google (ex: pessoal + trabalho)
  // entram automaticamente na última conta usada, sem chance de escolher.
  // 'select_account' obriga Google a mostrar o picker mesmo quando há sessão
  // ativa — comportamento esperado após logoff explícito do app.
  if (authProvider && typeof authProvider.setCustomParameters === 'function') {
    authProvider.setCustomParameters({ prompt: 'select_account' });
  }
  // Force LOCAL persistence so auth survives page reloads in Safari/ITP contexts.
  // (LOCAL is already the default, but Safari sometimes downgrades silently —
  // setting it explicitly also surfaces storage-blocked errors early.)
  if (firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch(function(err) { window._warn('setPersistence error:', err); });
  }
  // Initialize Firestore
  if (window.FirestoreDB) {
    window.FirestoreDB.init();
  }
} catch (e) {
  window._warn("Firebase initialization error:", e);
}

// ─── Helper: force-close the login modal ────────────────────────────────────
// v0.17.83: belt+suspenders modal close. simulateLoginSuccess closes it but can
// early-bail on the inProgress guard, or fail before reaching the close call.
// This helper is called from every auth success entry point (popup, redirect,
// onAuthStateChanged) BEFORE simulateLoginSuccess, so the modal disappears the
// moment the auth provider returns success — independently of downstream code.
function _forceCloseLoginModal() {
  try {
    var modal = document.getElementById('modal-login');
    if (modal) {
      modal.classList.remove('active');
      // Defensive: also hide via inline style in case CSS gets overridden
      modal.style.display = 'none';
      // Re-enable display in next tick so subsequent opens work
      setTimeout(function() { try { modal.style.display = ''; } catch(_e) {} }, 50);
    }
    // Clear any HTML5 validation popups by resetting form state
    var loginForm = document.getElementById('form-login');
    if (loginForm && typeof loginForm.reset === 'function') {
      try { loginForm.reset(); } catch(_e) {}
    }
    // v1.0.4-beta: probe `_captureMessage('login modal force-closed', 'info')`
    // removido. Foi adicionado em v0.17.83 pra diagnosticar bug do modal não
    // fechar; cumpriu o papel — agora só polui Sentry com 36 events em 2d
    // (issue #1, level info, sem valor diagnóstico atual).
  } catch (e) {
    window._warn('[scoreplace-auth] _forceCloseLoginModal error:', e);
    if (typeof window._captureException === 'function') {
      window._captureException(e, { area: 'forceCloseLoginModal' });
    }
  }
}
window._forceCloseLoginModal = _forceCloseLoginModal;

// ─── Helper: update topbar avatar + name + logoff button ─────────────────
// v0.17.93: extraído de simulateLoginSuccess para ser chamável tanto early
// (logo após currentUser ser setado) quanto no fim. Idempotente.
// Bug reportado: nome do usuário não aparecia no topbar após login Google
// quando algum await intermediário (loadUserProfile, terms gate) demorava
// ou falhava — topbar update só rodava no fim da função.
window._updateTopbarForUser = function(user) {
  if (!user) return;
  var btnLogin = document.getElementById('btn-login');
  if (!btnLogin) return;
  try {
    var _t = (typeof window._t === 'function') ? window._t : function(k){return k;};
    var _sh = (typeof window._safeHtml === 'function')
      ? window._safeHtml
      : function(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

    btnLogin.className = 'd-flex align-center';
    btnLogin.style.background = 'transparent';
    btnLogin.style.border = 'none';
    btnLogin.style.padding = '0';
    btnLogin.style.color = 'var(--text-main)';
    btnLogin.style.cursor = 'pointer';
    btnLogin.style.flexWrap = 'nowrap';
    btnLogin.style.flexDirection = 'row';
    btnLogin.style.alignItems = 'center';

    // v1.0.16-beta: prefere AppStore.currentUser (merged do Firestore via
    // loadUserProfile) sobre o `user` recebido como parâmetro (que pode ser
    // firebase.auth().currentUser com displayName STALE da Google OAuth).
    // Bug: usuário muda nome no perfil, Firestore atualiza, AppStore.
    // currentUser.displayName fica novo, mas onAuthStateChanged re-dispara
    // simulateLoginSuccess(fbUser) que chama _updateTopbarForUser(fbUser)
    // com o nome velho — topbar reverte. Solução: ler de AppStore quando
    // disponível e o uid bate.
    var cu = window.AppStore && window.AppStore.currentUser;
    var preferCU = cu && user.uid && cu.uid === user.uid;
    var effectiveName = preferCU && cu.displayName ? cu.displayName : user.displayName;
    var effectivePhoto = preferCU && cu.photoURL ? cu.photoURL : user.photoURL;

    // Fallback chain: displayName (se não for genérico) → email → telefone → defaultUser
    // v1.8.60: _isUnfriendlyName verifica se é "Usuário", "usuário", número puro etc.
    var _nameIsReal = effectiveName && !(typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(effectiveName));
    var displayFirstName;
    if (_nameIsReal) {
      displayFirstName = effectiveName.split(' ')[0];
    } else if (user.email || (cu && cu.email)) {
      var _em = user.email || (cu && cu.email) || '';
      displayFirstName = _em.split('@')[0];
    } else if (user.phoneNumber || (cu && cu.phone)) {
      // SMS login sem nome — mostra o telefone formatado em vez de "usuário"
      // Tenta usar o número local do perfil (já com DDI stripado) quando
      // disponível (chamada tardia pós-loadUserProfile). Na chamada antecipada
      // (antes do Firestore retornar), cai no E.164 direto.
      var _phD = (cu && cu.phone)
        ? ((typeof window._phoneLocalDigits === 'function')
            ? window._phoneLocalDigits(cu.phone, (cu && cu.phoneCountry) || '55')
            : String(cu.phone).replace(/\D/g, ''))
        : '';
      if (_phD.length >= 8 && typeof _formatPhoneDisplay === 'function') {
        displayFirstName = _formatPhoneDisplay(_phD, (cu && cu.phoneCountry) || '55');
      } else {
        // Chamada antecipada: perfil Firestore ainda não carregou
        var _rawPh = (user.phoneNumber || '').replace(/^\+/, '');
        // Formata para exibição com máscara (+55 (DDD) XXXXX-XXXX)
        if (_rawPh && typeof window._maskBRPhone === 'function') {
          var _localD = (_rawPh.startsWith('55') && _rawPh.length > 11) ? _rawPh.substring(2) : _rawPh;
          displayFirstName = '+55 ' + window._maskBRPhone(_localD);
        } else {
          displayFirstName = (_rawPh ? '+' + _rawPh : '') || _t('auth.defaultUser');
        }
      }
    } else {
      displayFirstName = _t('auth.defaultUser');
    }
    // v1.0.23-beta: cartoons dicebear/notionists (que o user reclamou) trocados
    // por iniciais geradas do nome do usuário. Foto real (Google/Apple) tem
    // prioridade.
    var photoUrl = (typeof window._profileAvatarUrl === 'function')
      ? window._profileAvatarUrl(effectiveName || displayFirstName, effectivePhoto, 64)
      : (effectivePhoto || ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(displayFirstName || '?') + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=64'));

    // Defensive guard: evita TypeError se auth.js ainda não terminou de
    // carregar durante transição de SW ou race de cache parcial.
    btnLogin.setAttribute('onclick', 'if(typeof window._onProfileBtnClick==="function") window._onProfileBtnClick(event)');
    // Indicador de carregamento: se _profileLoaded ainda não é true, mostrar
    // spinner sutil ao lado do nome — previne cliques prematuros que abririam
    // modal de login para usuário já autenticado mas com AppStore ainda carregando.
    var _profileLoading = !(cu && cu._profileLoaded);
    var _loadingIndicator = _profileLoading
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:rgba(251,191,36,0.7);margin-left:4px;animation:pulseDot 1s infinite;" title="Carregando perfil…"></span>'
      : '';
    btnLogin.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:center; gap:8px;" title="Meu Perfil">' +
        '<img src="' + _sh(photoUrl) + '" style="width:32px; height:32px; border-radius:50%; border: 2px solid var(--primary-color); object-fit:cover;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
        '<div style="display:none;width:32px;height:32px;border-radius:50%;background:var(--primary-color);color:white;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;">👤</div>' +
        '<span class="user-name-label" style="font-weight:600; font-size:1rem;">' + _sh(displayFirstName) + '</span>' +
        _loadingIndicator +
      '</div>' +
      '<div title="Sair da Conta" class="logoff-btn" style="color: var(--danger-color); margin-left: 8px; display:flex; align-items:center; cursor:pointer; opacity: 0.8;" onmouseover="this.style.opacity=\'1\'" onmouseout="this.style.opacity=\'0.8\'">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
      '</div>';
  } catch (e) {
    window._warn('[scoreplace-auth] _updateTopbarForUser error:', e);
  }
};

// ─── Handle redirect result on page load ────────────────────────────────────
// When a user returns from Google's OAuth redirect (Safari/iOS flow), we need
// to capture the credential + access token here (onAuthStateChanged won't give
// us access to the OAuth credential). This also lets us finish pending account-
// link operations just like the popup flow does.
if (firebase && firebase.auth) {
  try {
    window._log('[scoreplace-auth] Checking getRedirectResult on page load...');
    firebase.auth().getRedirectResult().then(function(result) {
      window._log('[scoreplace-auth] getRedirectResult:', result && result.user ? { uid: result.user.uid, email: result.user.email } : 'no user');
      if (!result || !result.user) return;
      var user = result.user;

      // v0.17.83: belt+suspenders — fecha modal-login imediatamente quando o
      // redirect retorna sucesso (Safari/iOS flow). Mesma rationale do popup.
      if (typeof _forceCloseLoginModal === 'function') _forceCloseLoginModal();

      try {
        if (typeof showNotification === 'function') {
          showNotification(_t('auth.loginDone'), _t('auth.welcomeName', {name: user.displayName || user.email}), 'success');
        }
      } catch(e) {}
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        window.FirestoreDB.saveUserProfile(user.uid, {
          authProvider: 'google.com',
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        }).catch(function() {});
      }
      try { _tryLinkPendingCredential(result); } catch(e) {}

      // Explicitly drive the login flow from the redirect callback
      // instead of relying solely on onAuthStateChanged. On iOS Safari and
      // iOS Chrome (which uses WebKit), ITP + 3rd-party cookie blocking
      // against the cross-origin authDomain (firebaseapp.com) can prevent
      // onAuthStateChanged from firing after a redirect. The
      // _simulateLoginInProgress guard makes this safe if both fire.
      try {
        localStorage.setItem('scoreplace_authCache', JSON.stringify({
          uid: user.uid, email: user.email,
          displayName: user.displayName, photoURL: user.photoURL
        }));
      } catch(e) {}
      window._log('[scoreplace-auth] Calling simulateLoginSuccess directly from getRedirectResult');
      if (typeof simulateLoginSuccess === 'function') {
        simulateLoginSuccess({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL
        });
      }
    }).catch(function(error) {
      if (!error || !error.code) return;
      window._warn('[scoreplace-auth] getRedirectResult error:', error);
      if (error.code === 'auth/account-exists-with-different-credential') {
        _handleAccountLinking(error, 'Google');
      } else if (error.code !== 'auth/credential-already-in-use' && error.code !== 'auth/no-auth-event') {
        try { showNotification(_t('auth.googleError'), _t('auth.googleErrorMsg'), 'error'); } catch(e) {}
      }
    });
  } catch (e) { window._warn('getRedirectResult init error:', e); }
}

// Listen for auth state changes to auto-login returning users
if (firebase && firebase.auth) {
  // Debounce handler: Safari/iOS can emit transient null auth-state events
  // during IndexedDB rehydration or ITP cookie transients. Without debouncing,
  // a user who is actually signed-in sees the app briefly treat them as logged
  // out (wiping authCache, rerouting to login) before bouncing back — which
  // causes the "flickering" between lobby and login screens on invite links.
  // We wait _AUTH_SIGNOUT_GRACE_MS before committing a sign-out so a quick
  // re-resolution with a user cancels it.
  var _AUTH_SIGNOUT_GRACE_MS = 2500;
  var _pendingSignoutTimer = null;

  function _commitSignOut() {
    // v0.17.92: skip se não havia sessão pra deslogar — usuário visitante
    // que ABRE a página e clica login durante a janela de 2.5s do grace
    // timer estava tendo o modal-login fechado pelo initRouter abaixo
    // (chamado dentro de _commitSignOut → _dismissAllOverlays strippa
    // .active de TODOS .modal-overlay.active, incluindo o que ele acabou
    // de abrir). Bug reportado: "ao clicar no login na primeira vez,
    // abre rapidamente e fecha. Segunda clicada fica."
    var hadSession = !!(window.AppStore && window.AppStore.currentUser);
    var loginModalActive = !!document.querySelector('#modal-login.active');

    if (!hadSession) {
      window._log('[scoreplace-auth] _commitSignOut: skipping — no prior session');
      try { localStorage.removeItem('scoreplace_authCache'); } catch(e) {}
      // v1.3.81-beta: removido initRouter() daqui (regressão v1.3.80 — causava
      // fechamento do hamburger ~2500ms após o load para usuários não logados).
      // O caso de authCache stale agora é tratado dentro do próprio router.js:
      // quando _authStateResolved=true + _hasAuthCacheNow=true, o router limpa
      // o cache inline e renderiza a landing sem precisar de initRouter() externo.
      return;
    }

    window._log('[scoreplace-auth] onAuthStateChanged: committing sign-out after grace period');
    try { localStorage.removeItem('scoreplace_authCache'); } catch(e) {}
    if (window.AppStore) {
      window.AppStore.currentUser = null;
      if (window.AppStore.stopRealtimeListener) window.AppStore.stopRealtimeListener();
      // Visitor mode — no background fetch. Before v0.14.59 we started a
      // listener on every public tournament for anonymous users, which
      // scaled with the size of the DB (full snapshot per visitor per
      // remote change). Visitors only ever land on the landing page or
      // follow direct #tournaments/{id} links; the router handles the
      // latter via FirestoreDB.loadTournamentById() (tournaments.js:445),
      // so a blanket feed buys nothing. Kick the router once and stop.
      window.AppStore.tournaments = [];
      window.AppStore._saveToCache();
      // v0.17.92: skip initRouter se user está com modal-login aberto —
      // ele tá ativamente tentando logar, dismissAllOverlays mataria o modal.
      if (loginModalActive) {
        window._log('[scoreplace-auth] _commitSignOut: skipping initRouter — login modal active');
      } else {
        if (typeof initRouter === 'function') initRouter();
      }
    }
  }

  // v0.17.92: helper público pra cancelar o timer de signout deferred.
  // Chamado por openModal('modal-login') — user clicando em Login expressa
  // intenção de logar; signout pendente de 2.5s é irrelevante e prejudicial.
  window._cancelPendingSignout = function() {
    if (_pendingSignoutTimer) {
      window._log('[scoreplace-auth] cancelling pending signout — user is logging in');
      clearTimeout(_pendingSignoutTimer);
      _pendingSignoutTimer = null;
    }
  };

  firebase.auth().onAuthStateChanged(async function(user) {
    window._log('[scoreplace-auth] onAuthStateChanged fired:', user ? { uid: user.uid, email: user.email } : 'null');
    window._authStateResolved = true;
    if (user) {
      // Cancel any pending sign-out — auth came back with a user before grace elapsed
      if (_pendingSignoutTimer) {
        window._log('[scoreplace-auth] cancelling pending sign-out — auth re-resolved');
        clearTimeout(_pendingSignoutTimer);
        _pendingSignoutTimer = null;
      }
      // v1.3.39-beta: cancelar o timer do null-handler (se existir) —
      // Firebase resolveu com usuário, não queremos chamar initRouter()
      // com null depois.
      clearTimeout(window._authNullRouterTimer);
      window._authNullRouterTimer = null;
      // v1.3.39-beta: cancelar também o fallback de 3 s do router —
      // usuário presente, router vai ser chamado via simulateLoginSuccess.
      clearTimeout(window._authNoCacheFallback);
      window._authNoCacheFallback = null;
      // Skip if email registration is still updating displayName profile
      if (window._pendingProfileUpdate) {
        window._log('[scoreplace-auth] onAuthStateChanged skipped (pending profile update)');
        return;
      }
      // Cache login state for instant restore on next page load
      try {
        localStorage.setItem('scoreplace_authCache', JSON.stringify({
          uid: user.uid, email: user.email,
          displayName: user.displayName, photoURL: user.photoURL
        }));
      } catch(e) {}

      // v0.17.83: belt+suspenders — close login modal here too, in case popup
      // and redirect handlers didn't fire (e.g. tab visibility changes,
      // restored session). Idempotent.
      if (typeof _forceCloseLoginModal === 'function') _forceCloseLoginModal();

      // User is signed in — load data from Firestore and update UI
      await simulateLoginSuccess({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      });
    } else {
      // If a manual logout is in progress, commit immediately — the user pressed
      // "Sair" and we don't want to wait for the grace period.
      if (window._manualLogoutInProgress) {
        window._log('[scoreplace-auth] onAuthStateChanged: signed out (manual logout — committing immediately)');
        _commitSignOut();
        return;
      }
      // Transient null event — defer the clear so a quick re-resolution
      // (common on Safari) cancels it silently.
      window._log('[scoreplace-auth] onAuthStateChanged: null — deferring sign-out ' + _AUTH_SIGNOUT_GRACE_MS + 'ms');
      if (_pendingSignoutTimer) clearTimeout(_pendingSignoutTimer);
      _pendingSignoutTimer = setTimeout(function() {
        _pendingSignoutTimer = null;
        // Re-check current auth state — if it's back to a user, don't sign out
        var now = firebase.auth().currentUser;
        if (now) {
          window._log('[scoreplace-auth] deferred sign-out aborted — user is present');
          return;
        }
        _commitSignOut();
      }, _AUTH_SIGNOUT_GRACE_MS);

      // v1.3.39-beta: para usuários novos (hadSession=false), _commitSignOut
      // não chama initRouter() — o router fica preso no spinner para sempre.
      // Este timer de 300 ms dispara initRouter() após Firebase confirmar
      // definitivamente null, permitindo ao router comutar de "aguardando"
      // para landing. 300 ms < 2500 ms do grace period, portanto se Firebase
      // re-resolver com usuário antes disso, o cancelamento acima (no branch
      // user) já limpou o timer e evita chamada dupla.
      clearTimeout(window._authNullRouterTimer);
      window._authNullRouterTimer = setTimeout(function() {
        window._authNullRouterTimer = null;
        if (!firebase.auth().currentUser && (!window.AppStore || !window.AppStore.currentUser)) {
          var v = (window.location.hash || '#dashboard').replace('#', '').split('/')[0];
          if (v === '' || v === 'dashboard') {
            clearTimeout(window._authNoCacheFallback);
            window._authNoCacheFallback = null;
            if (typeof initRouter === 'function') initRouter();
          }
        }
      }, 300);
    }
  });
}

function handleGoogleLogin() {
  var isLocalFile = window.location.protocol === 'file:';

  // v0.17.85: reset defensivo do guard a cada nova tentativa de login.
  // Previne caso degenerado onde guard ficou preso de tentativa anterior.
  if (typeof window._resetLoginGuard === 'function') window._resetLoginGuard();

  if (isLocalFile) {
    // Offline/Local development mode - simulate login
    showNotification(_t('auth.simLogin'), _t('auth.simLoginMsg'), 'info');
    simulateLoginSuccess({
      uid: 'local_user',
      displayName: 'Organizador Teste',
      email: 'organizador@scoreplace.app',
      photoURL: '' // v1.0.23-beta: vazio → fallback gera iniciais do displayName
    });
    return;
  }

  // Real Firebase authentication
  if (!authProvider) {
    showNotification(_t('auth.error'), _t('auth.firebaseError'), 'error');
    return;
  }

  showNotification(_t('auth.connecting'), _t('auth.connectingMsg'), 'info');

  // Try popup on ALL platforms (including iOS/Safari) — modern iOS Safari 16+
  // handles popup auth via postMessage without requiring 3rd-party cookies.
  // If popup fails (blocked, unsupported, cookies disabled), the error handler
  // falls back to signInWithRedirect.
  // v0.16.39: re-aplica setCustomParameters('select_account') JUST-IN-TIME no
  // momento do clique. Belt+suspenders contra qualquer reset do provider entre
  // a inicialização do módulo e a hora do clique. Garante que o picker de
  // contas Google aparece SEMPRE, mesmo após logoff explícito do app.
  if (authProvider && typeof authProvider.setCustomParameters === 'function') {
    authProvider.setCustomParameters({ prompt: 'select_account' });
  }
  window._log('[scoreplace-auth] Google popup starting (prompt=select_account)... UA:', navigator.userAgent);
  firebase.auth().signInWithPopup(authProvider)
    .then(function(result) {
      var user = result.user;
      window._log('[scoreplace-auth] Popup success:', { uid: user && user.uid, email: user && user.email });

      // v0.17.83: belt+suspenders — close login modal IMMEDIATELY upon popup
      // success, before any other logic. simulateLoginSuccess also closes it
      // but can fail/early-bail; this guarantees the user sees the modal go
      // away the moment Google auth returns.
      _forceCloseLoginModal();

      showNotification(_t('auth.loginDone'), _t('auth.welcomeName', {name: user.displayName}), 'success');

      // Save auth provider + displayName/photoURL to Firestore on first Google login
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        window.FirestoreDB.saveUserProfile(user.uid, {
          authProvider: 'google.com',
          displayName: user.displayName || '',
          photoURL: user.photoURL || ''
        }).catch(function() {});
      }

      // v1.6.29-beta: detecta se o usuário tem FOTO REAL no Google (não
      // monograma default) via People API. Substitui as heurísticas de
      // URL pattern (frágeis) e pixel sampling (CORS-blocked) por uma
      // resposta autoritativa do próprio Google. Campo `default: true`
      // no objeto photos[0] significa "user nunca cadastrou foto, isso
      // é monograma gerado". Salva hasGooglePhotoReal no profile pra
      // que a check do trofeu perfil_foto use como source of truth.
      // Falha graceful: se People API der erro/CORS/quota, fallback fica
      // sem flag e a check só aceita upload via app (comportamento v1.6.28).
      try {
        var _credential = firebase.auth.GoogleAuthProvider.credentialFromResult && firebase.auth.GoogleAuthProvider.credentialFromResult(result);
        var _googleAccessToken = _credential && _credential.accessToken;
        if (_googleAccessToken && user.uid) {
          fetch('https://people.googleapis.com/v1/people/me?personFields=photos', {
            headers: { 'Authorization': 'Bearer ' + _googleAccessToken }
          }).then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
              if (!data || !Array.isArray(data.photos) || data.photos.length === 0) return;
              var primary = data.photos.find(function(p) { return p.metadata && p.metadata.primary; }) || data.photos[0];
              var hasReal = !primary['default']; // bracket pra evitar reserved word issues
              window._log('[scoreplace-auth] Google People API photo.default=', primary['default'], '→ hasGooglePhotoReal=', hasReal);
              if (window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
                window.FirestoreDB.saveUserProfile(user.uid, { hasGooglePhotoReal: hasReal }).catch(function() {});
              }
              // Atualiza AppStore.currentUser pra check do trofeu pegar imediatamente
              if (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid === user.uid) {
                window.AppStore.currentUser.hasGooglePhotoReal = hasReal;
              }
            }).catch(function(err) {
              window._warn('[scoreplace-auth] People API error (non-fatal):', err && err.message);
            });
        }
      } catch (_peopleErr) {
        window._warn('[scoreplace-auth] People API setup error (non-fatal):', _peopleErr && _peopleErr.message);
      }

      // Try linking pending credential from another provider.
      // v0.17.85: try/catch — sem ele, exception aqui pulava simulateLoginSuccess.
      try { _tryLinkPendingCredential(result); } catch(_lkErr) {
        window._warn('[scoreplace-auth] _tryLinkPendingCredential error (non-fatal):', _lkErr);
        if (typeof window._captureException === 'function') {
          window._captureException(_lkErr, { area: 'tryLinkPendingCredential' });
        }
      }

      // Explicitly drive the login flow from the popup success callback
      // instead of relying solely on onAuthStateChanged. Chrome's 3rd-party
      // cookie deprecation + cross-origin auth domain (firebaseapp.com) can
      // cause onAuthStateChanged to not fire reliably. simulateLoginSuccess
      // has a _simulateLoginInProgress guard so this is safe if both fire.
      try {
        localStorage.setItem('scoreplace_authCache', JSON.stringify({
          uid: user.uid, email: user.email,
          displayName: user.displayName, photoURL: user.photoURL
        }));
      } catch(e) {}
      window._log('[scoreplace-auth] Calling simulateLoginSuccess directly from popup callback');
      simulateLoginSuccess({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL
      });
    })
    .catch(function(error) {
      window._error('[scoreplace-auth] Firebase auth error:', error);
      if (typeof window._captureException === 'function') {
        window._captureException(error, { area: 'googleLogin', code: error && error.code });
      }
      // Popup blocked / failed — fall back to redirect flow so the user can still log in.
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment' || error.code === 'auth/web-storage-unsupported') {
        // v0.16.39: garante prompt=select_account também no fallback de redirect
        if (authProvider && typeof authProvider.setCustomParameters === 'function') {
          authProvider.setCustomParameters({ prompt: 'select_account' });
        }
        firebase.auth().signInWithRedirect(authProvider).catch(function(err2) {
          window._error('Redirect fallback error:', err2);
          showNotification(_t('auth.popupBlocked'), _t('auth.popupBlockedMsg'), 'error');
        });
        return;
      }
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // User cancelled, no need for error
      } else if (_handleAccountLinking(error, 'Google')) {
        // handled
      } else {
        // v1.0.13-beta: mensagem específica por error.code com sugestão de
        // workaround. Antes era sempre "Não foi possível realizar o login
        // com Google" — usuário ficava sem direção. Bug reportado: esposa
        // em Paris recebeu erro genérico, sem saber que poderia tentar
        // SMS ou Link Mágico, ou que Safari Private Browsing pode estar
        // bloqueando Firebase Auth IndexedDB.
        var code = (error && error.code) || 'unknown';
        var msg = _t('auth.googleErrorMsg');
        if (code === 'auth/network-request-failed') {
          msg = 'Sem conexão estável com Google. Tente Wi-Fi ou outra rede. Ou use SMS / Link Mágico abaixo.';
        } else if (code === 'auth/too-many-requests') {
          msg = 'Muitas tentativas. Aguarde alguns minutos e tente de novo. Ou use SMS / Link Mágico.';
        } else if (code === 'auth/internal-error') {
          msg = 'Erro interno do Firebase. Tente novamente em instantes. Se persistir, use SMS / Link Mágico abaixo.';
        } else if (code === 'auth/unauthorized-domain') {
          msg = 'Domínio não autorizado no Firebase Auth. Reporte: scoreplace.app@gmail.com';
        } else if (code === 'auth/user-disabled') {
          msg = 'Sua conta Google está desativada. Entre em contato: scoreplace.app@gmail.com';
        } else if (code === 'auth/operation-not-allowed') {
          msg = 'Login Google indisponível no momento. Use SMS ou Link Mágico abaixo.';
        } else {
          // Genérica + código pra debug/suporte
          msg = 'Não foi possível realizar o login com Google. Tente SMS ou Link Mágico abaixo.\n\n(código: ' + code + ')';
        }
        showNotification(_t('auth.googleError'), msg, 'error');
      }
    });
}

// ─── Account linking helper ─────────────────────────────────────────────────
// When user tries to sign in with a provider but already has an account with
// the same email via a different provider, Firebase throws
// auth/account-exists-with-different-credential. This helper detects the
// existing provider and guides the user to link accounts.
function _handleAccountLinking(error, providerName) {
  if (error.code !== 'auth/account-exists-with-different-credential') return false;
  var email = error.customData ? error.customData.email : (error.email || '');
  var pendingCred = error.credential || null;
  if (!email) {
    showNotification(_t('auth.accountExists'), _t('auth.accountExistsMsg'), 'warning');
    return true;
  }

  // Fetch which providers are linked to this email
  firebase.auth().fetchSignInMethodsForEmail(email).then(function(methods) {
    if (!methods || methods.length === 0) {
      showNotification(_t('auth.error'), _t('auth.identifyError'), 'error');
      return;
    }
    var existingProvider = methods[0]; // e.g. 'google.com', 'password', 'emailLink', 'phone'
    var providerNames = {
      'google.com': 'Google',
      'password': _t('auth.providerPassword'),
      'emailLink': 'Link de E-mail',
      'phone': _t('auth.providerPhone')
    };
    var existingName = providerNames[existingProvider] || existingProvider;

    // Save pending credential so we can link after successful sign-in
    if (pendingCred) {
      window._pendingLinkCredential = pendingCred;
      window._pendingLinkEmail = email;
    }

    showNotification(
      _t('auth.accountAlreadyExists'),
      _t('auth.accountLinkMsg', {email: email, existing: existingName, newProvider: providerName}),
      'info'
    );
  }).catch(function(err) {
    window._warn('fetchSignInMethodsForEmail error:', err);
    showNotification(_t('auth.accountExists'), _t('auth.accountExistsMsg'), 'warning');
  });
  return true;
}

// After a successful sign-in, check if there's a pending credential to link
function _tryLinkPendingCredential(result) {
  if (!window._pendingLinkCredential) return;
  var user = result.user;
  if (!user) return;
  var cred = window._pendingLinkCredential;
  window._pendingLinkCredential = null;
  window._pendingLinkEmail = null;
  user.linkWithCredential(cred).then(function() {
    showNotification(_t('auth.accountLinked'), _t('auth.accountLinkedMsg'), 'success');
  }).catch(function(err) {
    window._warn('Account link error:', err);
    // Not critical — user is already logged in
  });
}

// ─── Identidade verificada do usuário atual (LGPD guard) ────────────────────
// Retorna apenas campos CONFIRMADOS pelo Firebase Auth para o uid ativo.
// Usar em toda operação que persiste dados de identidade no Firestore
// (inscrições, presenças, notificações) para evitar contaminação cruzada.
// NUNCA usar AppStore.currentUser.email diretamente — sempre usar esta função.
window._verifiedCurrentUser = function() {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid) return null;
  // Fonte da verdade: Firebase Auth
  var fbUser = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
  if (!fbUser) return cu; // sem Firebase (offline/mock), confia no AppStore
  // Se o uid não bate, a sessão está contaminada — não liberar dados pessoais
  if (fbUser.uid !== cu.uid) {
    window._warn('[LGPD] _verifiedCurrentUser: uid mismatch Firebase=' + fbUser.uid + ' AppStore=' + cu.uid + ' — retornando só uid Firebase');
    return { uid: fbUser.uid, email: fbUser.email || null, displayName: fbUser.displayName || null, photoURL: fbUser.photoURL || null, phone: fbUser.phoneNumber || null };
  }
  // uid bate: complementar com dados do AppStore (tem campos extras do perfil)
  // mas sobrescrever email com o do Firebase Auth (ground truth)
  return Object.assign({}, cu, {
    email: fbUser.email || null,          // Firebase Auth é a fonte da verdade para email
    displayName: fbUser.displayName || cu.displayName || null,
    photoURL: fbUser.photoURL || cu.photoURL || null,
    phone: fbUser.phoneNumber || cu.phone || null
  });
};

// ─── Unified Login Input (email magic link OR SMS) ──────────────────────────
// v1.0.22-beta: feedback do user — ter dois campos (Link Mágico e SMS) com
// dois "Enviar" estava confundindo. Botão verde do SMS parecia mais
// destacado que o transparente do magic link, induzindo escolha errada.
// Agora um único campo detecta automaticamente:
//   - input contém '@' → email magic link (Cloud Function sendMagicLink)
//   - 8-15 dígitos → SMS (handlePhoneLogin com DDI do dropdown que aparece)
//   - ambíguo → erro com instrução clara
// Notação SMS comunicada de forma explícita via placeholder + helper text
// dinâmico — usuário vê 🇧🇷 +55 (DDI) ao lado do que digitou (DDD + número).
// v1.8.17-beta: máscara de telefone BR — formata dígitos progressivamente
// conforme o usuário digita: (DDD) 9XXXX-XXXX ou (DDD) XXXX-XXXX
// Exposto como window._ para uso em _repairNullIdentityParticipants e outros.
window._maskBRPhone = function _maskBRPhone(digits) {
  var d = String(digits || '').replace(/\D/g, '');
  if (d.length === 0) return '';
  if (d.length <= 2) return '(' + d;
  if (d.length <= 6) return '(' + d.substring(0, 2) + ') ' + d.substring(2);
  if (d.length <= 10) return '(' + d.substring(0, 2) + ') ' + d.substring(2, 6) + '-' + d.substring(6);
  return '(' + d.substring(0, 2) + ') ' + d.substring(2, 7) + '-' + d.substring(7, 11);
}

function _detectInputModeRaw(value) {
  if (!value) return null;
  var v = String(value).trim();
  if (v.indexOf('@') !== -1) return 'email';
  // Se contém letras, é início de e-mail sem @ — aguardar digitação do @.
  if (/[a-zA-Z]/.test(v)) return null;
  var digits = v.replace(/\D/g, '');
  // v1.8.17-beta: threshold reduzido de 8 para 3 dígitos — detecta celular
  // assim que DDD (2 dígitos) + 1º dígito do número são digitados (ex: 119).
  // Sem letras = certamente tentativa de celular, não e-mail incompleto.
  if (digits.length >= 3 && digits.length <= 15) return 'phone';
  return null;
}

window._detectLoginInputMode = function() {
  var unifiedEl = document.getElementById('login-unified');
  var countryEl = document.getElementById('login-unified-country');
  var helperEl = document.getElementById('login-unified-helper');
  var rowEl = document.getElementById('login-unified-row');
  if (!unifiedEl) return;
  var mode = _detectInputModeRaw(unifiedEl.value);

  // v1.8.17-beta: aplicar máscara de telefone BR progressivamente
  if (mode === 'phone') {
    var rawDigits = unifiedEl.value.replace(/\D/g, '');
    var masked = _maskBRPhone(rawDigits);
    if (unifiedEl.value !== masked) unifiedEl.value = masked;
    unifiedEl.dataset.rawPhone = rawDigits;
  } else if (unifiedEl.dataset && unifiedEl.dataset.rawPhone) {
    // Saiu do modo phone (voltou a 2 dígitos ou digitou @) — mostra raw digits
    var cleanDigits = unifiedEl.value.replace(/\D/g, '');
    if (cleanDigits !== unifiedEl.value.trim()) unifiedEl.value = cleanDigits;
    delete unifiedEl.dataset.rawPhone;
  }

  if (countryEl) countryEl.style.display = (mode === 'phone') ? '' : 'none';
  if (rowEl) rowEl.style.gridTemplateColumns = (mode === 'phone') ? 'auto 1fr auto' : '1fr auto';
  if (helperEl) {
    if (mode === 'email') {
      helperEl.innerHTML = '✉️ Vamos enviar um <b>link de acesso</b> pro seu e-mail. Clique no link e entra direto.';
    } else if (mode === 'phone') {
      var ddi = (countryEl && countryEl.value) || '55';
      helperEl.innerHTML = '📱 Vamos enviar <b>SMS com código</b> pro <b>+' + ddi + '</b> + o número que você digitou. Pra trocar país, use o seletor 🇧🇷 que apareceu à esquerda.';
    } else {
      helperEl.innerHTML = 'Aceita <b>e-mail</b> (recebe link mágico) ou <b>celular com DDD</b> (recebe SMS com código). Pra celular, o seletor de país aparece automaticamente — padrão 🇧🇷 +55.';
    }
  }
  // Botão Enviar fica verde quando há valor válido no campo
  var enviarBtn = document.getElementById('btn-enviar-magic');
  if (enviarBtn) {
    var isValid = (mode === 'email' || mode === 'phone');
    enviarBtn.style.background = isValid ? 'linear-gradient(135deg,#10b981,#059669)' : '';
    enviarBtn.style.borderColor = isValid ? '#059669' : '';
  }
  // Exclusão mútua: bloco "E-mail e Senha" fica desbilitado enquanto este tem conteúdo
  if (typeof window._loginMutualExclude === 'function') window._loginMutualExclude();
};

// Exclusão mútua entre os blocos de login. Quando um bloco tem conteúdo,
// o outro fica com opacity reduzida e pointer-events desativado. Ao apagar
// tudo do bloco ativo, o outro volta ao normal.
window._loginMutualExclude = function() {
  var unifiedEl = document.getElementById('login-unified');
  var loginEmailEl = document.getElementById('login-email');
  var loginPassEl = document.getElementById('login-password');
  var regNameEl = document.getElementById('register-name');
  var regEmailEl = document.getElementById('register-email');
  var regPassEl = document.getElementById('register-password');
  var block1 = document.getElementById('login-unified-step');
  var block2 = document.getElementById('login-block-email');
  var hasBlock1 = !!(unifiedEl && unifiedEl.value.trim().length > 0);
  var hasBlock2 = !!(
    (loginEmailEl && loginEmailEl.value.trim().length > 0) ||
    (loginPassEl && loginPassEl.value.length > 0) ||
    (regNameEl && regNameEl.value.trim().length > 0) ||
    (regEmailEl && regEmailEl.value.trim().length > 0) ||
    (regPassEl && regPassEl.value.length > 0)
  );
  if (block1) {
    block1.style.opacity = hasBlock2 ? '0.4' : '1';
    block1.style.pointerEvents = hasBlock2 ? 'none' : '';
  }
  if (block2) {
    block2.style.opacity = hasBlock1 ? '0.4' : '1';
    block2.style.pointerEvents = hasBlock1 ? 'none' : '';
  }
};

// Valida o bloco "E-mail e Senha": atualiza o label dinâmico da senha
// (mostra o e-mail digitado como identificador) e torna o botão verde
// quando ambos os campos têm valores válidos.
window._updateEmailSenhaValidity = function() {
  var emailEl = document.getElementById('login-email');
  var passEl = document.getElementById('login-password');
  var passLabelEl = document.getElementById('login-senha-label');
  var entrarBtn = document.getElementById('btn-email-entrar');
  var email = emailEl ? emailEl.value.trim() : '';
  var pass = passEl ? passEl.value : '';
  var emailValid = email.indexOf('@') !== -1 && email.length > 4;
  var passValid = pass.length >= 6;
  // Label dinâmico: mostra o e-mail digitado pra o usuário saber de qual conta é a senha
  if (passLabelEl) {
    if (emailValid) {
      passLabelEl.textContent = email;
      passLabelEl.style.color = 'var(--text-bright)';
      passLabelEl.style.fontWeight = '700';
    } else {
      passLabelEl.textContent = 'Senha';
      passLabelEl.style.color = 'var(--text-muted)';
      passLabelEl.style.fontWeight = '400';
    }
  }
  // Botão Entrar fica verde quando ambos válidos
  if (entrarBtn) {
    if (emailValid && passValid) {
      entrarBtn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
      entrarBtn.style.borderColor = '#059669';
      entrarBtn.style.color = '#fff';
    } else {
      entrarBtn.style.background = '';
      entrarBtn.style.borderColor = '';
      entrarBtn.style.color = '';
    }
  }
  if (typeof window._loginMutualExclude === 'function') window._loginMutualExclude();
};

window.handleUnifiedLogin = function() {
  var unifiedEl = document.getElementById('login-unified');
  var raw = unifiedEl ? unifiedEl.value.trim() : '';
  if (!raw) {
    showNotification('Digite e-mail ou celular', 'Informe um e-mail ou número de celular pra continuar.', 'warning');
    if (unifiedEl) unifiedEl.focus();
    return;
  }
  var mode = _detectInputModeRaw(raw);
  if (mode === 'email') {
    var emailEl = document.getElementById('login-email-link');
    if (emailEl) emailEl.value = raw;
    handleEmailLinkLogin();
  } else if (mode === 'phone') {
    var phoneEl = document.getElementById('login-phone');
    var unifiedCountry = document.getElementById('login-unified-country');
    var hiddenCountry = document.getElementById('login-phone-country');
    // v1.8.17-beta: se máscara foi aplicada, usar dígitos puros (sem parênteses
    // e traços) para o handler de SMS que concatena com o DDI do país.
    if (phoneEl) phoneEl.value = (unifiedEl.dataset && unifiedEl.dataset.rawPhone) || raw.replace(/\D/g, '');
    // Sincroniza country code do dropdown visível pro hidden input
    // (handlePhoneLogin lê de login-phone-country).
    if (unifiedCountry && hiddenCountry) hiddenCountry.value = unifiedCountry.value;
    handlePhoneLogin();
  } else {
    showNotification('Formato não reconhecido', 'Digite um e-mail (com @) ou celular com DDD (ex: 11 99999-8888).', 'warning');
    if (unifiedEl) unifiedEl.focus();
  }
};

// ─── Email Link (Passwordless) Login ────────────────────────────────────────
function handleEmailLinkLogin() {
  var emailEl = document.getElementById('login-email-link');
  var email = emailEl ? emailEl.value.trim() : '';
  if (!email) {
    showNotification(_t('auth.enterEmail'), _t('auth.enterEmailMsg'), 'warning');
    if (emailEl) emailEl.focus();
    return;
  }

  // v1.0.20-beta: troca firebase.auth().sendSignInLinkToEmail() (envia email
  // feio via firebaseapp.com sem botão estilizado, parando no spam) por
  // Cloud Function `sendMagicLink` que gera o link via Admin SDK e enfileira
  // email rico HTML com botão grande na collection `mail/` (extension
  // firestore-send-email envia). Mesmo padrão dos emails de notificação que
  // já têm boa renderização.
  showNotification(_t('auth.sending'), _t('auth.sendingLinkMsg', {email: email}), 'info');
  var sendMagicLinkFn = firebase.functions().httpsCallable('sendMagicLink');
  sendMagicLinkFn({ email: email })
    .then(function() {
      // Save the email locally so we can complete sign-in when user clicks the link
      window.localStorage.setItem('scoreplace_emailForSignIn', email);
      // v1.0.14-beta: substituir o conteúdo do modal-login por um painel
      // persistente "verifique seu e-mail" em vez de toast efêmero. Bug
      // reportado: usuária recebeu link mas foi pra spam, e a toast com a
      // dica "(e spam)" sumiu rápido demais. Painel persistente fica visível
      // até o usuário fechar manualmente, com info do remetente pra
      // whitelistear pra próximas vezes.
      var modalBody = document.querySelector('#modal-login .modal-body');
      var safeEmail = (window._safeHtml || function(s){return s;})(email);
      if (modalBody) {
        modalBody.innerHTML =
          '<div style="text-align:center;padding:1rem 0;">' +
            '<div style="font-size:3rem;margin-bottom:0.5rem;">📬</div>' +
            '<div style="font-size:1.05rem;font-weight:800;color:var(--text-bright);margin-bottom:0.5rem;">Link enviado!</div>' +
            '<p style="font-size:0.88rem;color:var(--text-color);margin:0 0 1rem 0;">Enviamos um link de acesso pra <b>' + safeEmail + '</b>. Clique no link do e-mail pra entrar.</p>' +
            '<div style="background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.35);border-radius:10px;padding:10px 12px;margin-bottom:0.75rem;text-align:left;">' +
              '<div style="font-size:0.8rem;font-weight:700;color:#fbbf24;margin-bottom:4px;">⚠️ Não chegou? Cheque o spam.</div>' +
              '<div style="font-size:0.76rem;color:var(--text-muted);line-height:1.45;">' +
                'Primeira vez geralmente cai lá. O remetente é <code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;font-size:0.72rem;">scoreplace.app@gmail.com</code>. ' +
                'Adicione aos contatos pra próximas vezes não cair no spam.' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
              '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'modal-login\').classList.remove(\'active\')" style="font-size:0.82rem;">Fechar</button>' +
              '<button class="btn btn-primary btn-sm" id="resend-magic-btn" onclick="window._resendMagicLink && window._resendMagicLink()" style="font-size:0.82rem;">Reenviar</button>' +
            '</div>' +
          '</div>';
        // v1.3.82-beta: botão Reenviar chama a função de envio real em vez de
        // recarregar a página (que não reenviar nada, só ia pro router).
        window._resendMagicLink = function() {
          var btn = document.getElementById('resend-magic-btn');
          if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
          var sendMagicLinkFnR = firebase.functions().httpsCallable('sendMagicLink');
          sendMagicLinkFnR({ email: email })
            .then(function() {
              if (btn) { btn.disabled = false; btn.textContent = 'Enviado ✓'; }
              showNotification('📬', 'Novo link enviado pra ' + email, 'success');
            })
            .catch(function() {
              if (btn) { btn.disabled = false; btn.textContent = 'Reenviar'; }
              showNotification('⚠️', 'Não foi possível reenviar. Tente de novo.', 'error');
            });
        };
      } else {
        // Fallback se modal não existe — toast normal.
        showNotification(_t('auth.linkSent'), _t('auth.linkSentMsg', {email: email}), 'success');
      }
    })
    .catch(function(error) {
      window._error('Email link send error:', error);
      // v1.0.40-beta: filtra erros do Firebase Messaging que vazam pra cá.
      // Bug reportado via screenshot: usuário clicou Enviar e viu "Erro:
      // Messaging: We are unable to register the default service worker..."
      // Isso é o FCM tentando registrar /firebase-messaging-sw.js (path
      // default que não existe — usamos /sw.js). Erro irrelevante pro fluxo
      // de magic link, mas estava sendo surfaced confundindo o usuário.
      var msg = error && error.message;
      var code = error && error.code;
      var isMessagingNoise = (typeof msg === 'string' && msg.indexOf('Messaging:') === 0)
                          || (typeof code === 'string' && code.indexOf('messaging/') === 0);
      if (isMessagingNoise) {
        window._warn('[handleEmailLinkLogin] Ignoring FCM messaging noise:', msg || code);
        // Tenta novamente — provavelmente o magic link ENVIOU OK mas o erro
        // de FCM veio depois. Só não conseguimos confirmar; mostra panel
        // otimista pro usuário.
        var modalBody2 = document.querySelector('#modal-login .modal-body');
        var safeEmail2 = (window._safeHtml || function(s){return s;})(email);
        if (modalBody2) {
          modalBody2.innerHTML =
            '<div style="text-align:center;padding:1rem 0;">' +
              '<div style="font-size:3rem;margin-bottom:0.5rem;">📬</div>' +
              '<div style="font-size:1.05rem;font-weight:800;color:var(--text-bright);margin-bottom:0.5rem;">Confira seu e-mail</div>' +
              '<p style="font-size:0.88rem;color:var(--text-color);margin:0 0 1rem 0;">Se o link foi enviado pra <b>' + safeEmail2 + '</b>, deve chegar em até 1 minuto. Cheque inbox e spam.</p>' +
              '<div style="display:flex;gap:8px;justify-content:center;">' +
                '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'modal-login\').classList.remove(\'active\')" style="font-size:0.82rem;">Fechar</button>' +
                '<button class="btn btn-primary btn-sm" onclick="window.location.reload()" style="font-size:0.82rem;">Tentar novamente</button>' +
              '</div>' +
            '</div>';
        }
        return;
      }
      if (error.code === 'auth/invalid-email') {
        showNotification(_t('auth.invalidEmail'), _t('auth.invalidEmailMsg'), 'error');
      } else if (error.code === 'auth/operation-not-allowed') {
        showNotification(_t('auth.notAvailable'), _t('auth.emailLinkUnavailable'), 'warning');
      } else {
        showNotification(_t('auth.error'), error.message || _t('auth.loginErrorMsg'), 'error');
      }
    });
}

// Complete email link sign-in when user arrives via the link
function _completeEmailLinkSignIn() {
  if (!firebase.auth().isSignInWithEmailLink(window.location.href)) return;

  var email = window.localStorage.getItem('scoreplace_emailForSignIn');
  // v1.0.17-beta: fallback chain pro email, em ordem de confiança:
  //   1. localStorage (mesmo browser que pediu o link) — preferred
  //   2. URL param `?eml=` (incluído pelo handleEmailLinkLogin v1.0.17)
  //      pra cobrir cross-device (clicou no link no celular, pediu no
  //      desktop)
  //   3. window.prompt() — último recurso, só pra users muito antigos
  //      (links pré-v1.0.17 não têm `eml` no URL).
  if (!email) {
    try {
      var urlSearch = window.location.search || '';
      var emlMatch = urlSearch.match(/[?&]eml=([^&]+)/);
      if (emlMatch) email = decodeURIComponent(emlMatch[1]);
    } catch (e) {}
  }
  if (!email) {
    email = window.prompt('Por favor, confirme seu e-mail para completar o login:');
    if (!email) return;
  }

  firebase.auth().signInWithEmailLink(email, window.location.href)
    .then(async function(result) {
      // Clear stored email
      window.localStorage.removeItem('scoreplace_emailForSignIn');
      var user = result.user;
      // Save auth provider to Firestore.
      // v1.0.43-beta: cross-reference por email (mesma lógica que phone) —
      // se já existe outro doc users com este email, herda displayName,
      // photoURL, phone, phoneCountry e acceptedTerms. Pra emails idênticos
      // o Firebase Auth normalmente já retorna o mesmo uid (setting "One
      // account per email" default), mas em edge cases (migração, conta
      // criada por bug) podem existir 2 docs distintos.
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        var profileData = { authProvider: 'emailLink', updatedAt: new Date().toISOString() };
        if (user.email) profileData.email = user.email;
        try {
          if (user.email) {
            var snap = await window.FirestoreDB.db.collection('users')
              .where('email_lower', '==', String(user.email).toLowerCase())
              .limit(5).get();
            var matches = [];
            var matchIds = [];
            snap.forEach(function(doc) {
              if (doc.id !== user.uid) { matches.push(doc.data()); matchIds.push(doc.id); }
            });
            if (matches.length > 0) {
              var best = matches.find(function(m) {
                return m.displayName && !/^\+?\d{6,}$/.test(String(m.displayName).trim());
              }) || matches[0];
              if (best.displayName && !user.displayName) {
                profileData.displayName = best.displayName;
                try { await user.updateProfile({ displayName: best.displayName }); } catch(_e) {}
              }
              if (best.photoURL && !user.photoURL) {
                profileData.photoURL = best.photoURL;
                try { await user.updateProfile({ photoURL: best.photoURL }); } catch(_e) {}
              }
              if (best.phone) profileData.phone = best.phone;
              if (best.phoneCountry) profileData.phoneCountry = best.phoneCountry;
              if (best.acceptedTerms === true) {
                profileData.acceptedTerms = true;
                if (best.acceptedTermsAt) profileData.acceptedTermsAt = best.acceptedTermsAt;
                if (best.acceptedTermsVersion) profileData.acceptedTermsVersion = best.acceptedTermsVersion;
              }
              // v1.0.49-beta: stash cross-ref data pra simulateLoginSuccess mergear
              // antes do terms gate (evita race com Firestore save assíncrono).
              window._pendingCrossRef = Object.assign({}, profileData, { uid: user.uid });
              // v1.7.9-beta: email magic link = ownership verificado → agendar merge automático
              var _bestMatchIdx = matches.indexOf(best);
              var _bestMatchId = matchIds[_bestMatchIdx >= 0 ? _bestMatchIdx : 0];
              if (_bestMatchId && !best.mergedInto) {
                window._pendingCrossRefOldUid = _bestMatchId;
              }
              window._log('[email-link] cross-ref por email encontrado, herdando:',
                Object.keys(profileData).filter(function(k){ return k !== 'authProvider' && k !== 'updatedAt' && k !== 'email'; }));
            }
          }
        } catch (e) {
          window._warn('[email-link] cross-ref por email falhou:', e);
        }
        // Fallback: se não temos displayName herdado nem do Firebase, usa
        // o email completo como nome inicial (mais identificável que o local-part).
        // O usuário pode trocar no perfil a qualquer momento.
        if (!profileData.displayName && !user.displayName && email) {
          profileData.displayName = email;
        }
        // Fix retroativo: se o Firebase Auth tem um nome genérico ("Usuário" etc),
        // substituir pelo email enquanto a pessoa não preenche o perfil.
        if (profileData.displayName && typeof window._isUnfriendlyName === 'function' &&
            window._isUnfriendlyName(profileData.displayName) && email) {
          profileData.displayName = email;
        }
        window.FirestoreDB.saveUserProfile(user.uid, profileData).catch(function() {});
      }
      showNotification(_t('auth.loginDone'), user.displayName ? _t('auth.welcomeName', {name: user.displayName}) : _t('auth.welcome'), 'success');
      // v1.8.65: verificar se este login é resultado de um pedido de vinculação de email
      if (user.email && typeof window._checkEmailLinkIntent === 'function') {
        setTimeout(function() { window._checkEmailLinkIntent(user.email); }, 1500);
      }
      // Clean the URL (remove sign-in link parameters)
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '#dashboard');
      }
    })
    .catch(function(error) {
      window._error('Email link sign-in error:', error);
      window.localStorage.removeItem('scoreplace_emailForSignIn');
      if (error.code === 'auth/invalid-action-code') {
        showNotification(_t('auth.linkExpired'), _t('auth.linkExpiredMsg'), 'error');
      } else if (error.code === 'auth/invalid-email') {
        showNotification(_t('auth.emailMismatch'), _t('auth.emailMismatchMsg'), 'error');
      } else {
        showNotification(_t('auth.loginError'), error.message || _t('auth.loginErrorMsg'), 'error');
      }
    });
}

// Run email link check on page load
try { _completeEmailLinkSignIn(); } catch(e) { window._warn('Email link check error:', e); }

// ─── Phone/SMS Login ────────────────────────────────────────────────────────
window._phoneConfirmationResult = null;
window._phoneRecaptchaVerifier = null;
window._phoneRecaptchaWidgetId = null;
window._phoneLoginInFlight = false;

function handlePhoneLogin() {
  var phoneEl = document.getElementById('login-phone');
  var countryEl = document.getElementById('login-phone-country');
  var rawPhone = phoneEl ? phoneEl.value.trim() : '';
  // v0.17.84: lê DDI do dropdown (default '55' se ausente). Persiste
  // escolha em localStorage pra reabrir já com o último país selecionado.
  var countryCode = (countryEl && countryEl.value) || '55';
  try { localStorage.setItem('scoreplace_loginPhoneCountry', countryCode); } catch(_e) {}

  if (!rawPhone) {
    showNotification(_t('auth.enterPhone'), _t('auth.enterPhoneMsg'), 'warning');
    if (phoneEl) phoneEl.focus();
    return;
  }

  // Format phone number: add country code if user didn't provide one
  var phone = rawPhone.replace(/[\s\-\(\)]/g, '');
  if (!phone.startsWith('+')) {
    // Remove leading zero if present (Brasil/Argentina convention)
    if (phone.startsWith('0')) phone = phone.substring(1);
    phone = '+' + countryCode + phone;
  }

  // Validate basic format
  if (phone.length < 8 || phone.length > 16) {
    showNotification(_t('auth.invalidPhone'), _t('auth.invalidPhoneMsg'), 'warning');
    return;
  }

  // v1.6.106-beta: guard de in-flight para iOS. No iOS, eventos de toque
  // podem disparar handlePhoneLogin() duas vezes em rápida sucessão — o
  // segundo call ocorre enquanto o render() do primeiro ainda está em voo,
  // causando dois render() concorrentes no mesmo container →
  // "reCAPTCHA has already been rendered in this element" (SCOREPLACE-WEB-10).
  if (window._phoneLoginInFlight) return;
  window._phoneLoginInFlight = true;

  // v1.3.76-beta: mover container pro body ANTES de qualquer operação de
  // reCAPTCHA. Isso garante que o iframe do reCAPTCHA não fica clipado
  // por overflow:hidden do modal. Substitui o guard recaptchaContainer
  // antigo (que só verificava existência, não localização no DOM).
  _ensureRecaptchaInBody();

  // Show loading
  showNotification(_t('auth.verifying'), _t('auth.sendingSms', {phone: phone}), 'info');

  // v1.1.5-beta: SEMPRE reset+recreate o verifier antes de cada tentativa.
  // Sentry SCOREPLACE-WEB-D: reuse causava 'reCAPTCHA has already been
  // rendered in this element' quando user fez logoff → login de novo →
  // verify() interno chama recaptcha.render() que falha pq elemento já
  // tinha render anterior. Reset garante DOM limpo + nova instância.
  _resetPhoneRecaptcha();
  window._phoneRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    size: 'invisible',
    callback: function() {
      // reCAPTCHA solved — will proceed with phone sign-in
    },
    'expired-callback': function() {
      showNotification(_t('auth.recaptchaExpired'), _t('auth.tryAgain'), 'warning');
      _resetPhoneRecaptcha();
    }
  });

  // v1.3.76-beta: chamar render() explicitamente ANTES de signInWithPhoneNumber.
  // No iOS Safari, o render tardio (dentro de signInWithPhoneNumber) falha
  // porque iOS exige que a interação com reCAPTCHA seja iniciada dentro da
  // janela de gesto do usuário. render() pré-warms o widget no contexto do
  // clique, e signInWithPhoneNumber reutiliza o iframe já ancorado.
  window._phoneRecaptchaVerifier.render()
    .then(function() {
      // v1.3.89-beta: WhatsApp magic link dispara em PARALELO com o SMS,
      // imediatamente após reCAPTCHA render() — não depende do SMS ter sucesso.
      // Se SMS falhar por rate-limit, o WA já foi enviado antes do erro.
      // Guardamos o resultado em window._waMagicLinkResult para o catch usar.
      window._waMagicLinkResult = null;
      (function() {
        var waStatus = document.getElementById('phone-step-wa-status');
        if (waStatus) waStatus.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">⏳ Verificando WhatsApp...</span>';
        var WA_FN_URL = 'https://us-central1-scoreplace-app.cloudfunctions.net/sendWhatsAppMagicLink';
        fetch(WA_FN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { phone: phone } })
        })
        .then(function(r) { return r.json(); })
        .then(function(body) {
          var d = body && body.result;
          window._log('[WA magic link] resultado:', JSON.stringify(d));
          window._waMagicLinkResult = d;
          var ws = document.getElementById('phone-step-wa-status');
          if (!ws) return;
          if (d && d.ok) {
            ws.innerHTML = '<span style="color:#10b981;font-size:0.72rem;">✅ Link enviado pelo WhatsApp também.</span>';
          } else {
            var reason = (d && d.reason) || 'unknown';
            ws.innerHTML = reason === 'user-not-found' ? '' :
              '<span style="color:var(--text-muted);font-size:0.72rem;">ℹ️ WA: ' + reason + '</span>';
          }
        })
        .catch(function(err) {
          window._warn('[WA magic link] fetch falhou:', err && err.message);
          var ws = document.getElementById('phone-step-wa-status');
          if (ws) ws.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">ℹ️ WA: rede</span>';
        });
      })();

      return firebase.auth().signInWithPhoneNumber(phone, window._phoneRecaptchaVerifier);
    })
    .then(function(confirmationResult) {
      window._phoneLoginInFlight = false;
      window._phoneConfirmationResult = confirmationResult;
      // Show verification code input
      _showPhoneVerificationStep();
      showNotification(_t('auth.codeSent'), _t('auth.codeSentMsg', {phone: phone}), 'success');
    })
    .catch(function(error) {
      window._error('Phone sign-in error:', error);
      // v1.3.75-beta: envia error.message ao Sentry (além do code) para
      // diagnosticar casos onde error.code é undefined (erros JS nativos,
      // reCAPTCHA iOS Safari, etc).
      window._phoneLoginInFlight = false;
      if (typeof window._captureException === 'function') {
        window._captureException(error, {
          area: 'phoneLogin',
          code: error && error.code,
          message: error && error.message
        });
      }
      _resetPhoneRecaptcha();
      // v1.0.17-beta: mensagens específicas + surface error.code pra debug.
      // Bug reportado: "SMS não mandou pra ninguém". Sem error.code visível,
      // impossível diagnosticar (provider não habilitado, quota, formato,
      // reCAPTCHA, etc). Sugere fallback (Link Mágico) em todos os casos.
      // v1.3.75-beta: error.code === undefined (código: unknown) pode
      // indicar falha do reCAPTCHA invisível no iOS Safari ou erro JS
      // nativo. Inclui error.message no toast para diagnóstico. Também
      // cobre auth/internal-error que Firebase retorna em falhas de
      // reCAPTCHA não mapeadas.
      // v1.3.89-beta: se SMS falhou mas WA foi enviado com sucesso, mensagem
      // de erro menciona o link do WhatsApp como alternativa imediata.
      var waOk = window._waMagicLinkResult && window._waMagicLinkResult.ok;
      var code = (error && error.code) || 'unknown';
      var rawMsg = (error && error.message) || '';
      var waSuffix = waOk ? '\n\n💬 Mas o link de acesso foi enviado pelo WhatsApp — verifique suas mensagens.' : '';
      var msg;
      if (code === 'auth/invalid-phone-number') {
        msg = 'Número inválido. Confira o DDI + DDD + número (ex: +55 11 99999-8888).';
      } else if (code === 'auth/too-many-requests') {
        msg = waOk
          ? 'Muitas tentativas de SMS. Mas o link de acesso já foi enviado pelo WhatsApp — clique nele para entrar.'
          : 'Muitas tentativas. Aguarde 30 minutos. Ou use Link Mágico por E-mail.';
      } else if (code === 'auth/operation-not-allowed') {
        msg = 'Login por SMS não está habilitado nesta conta Firebase. Reporte: scoreplace.app@gmail.com\n\nUse Link Mágico por E-mail enquanto isso.';
      } else if (code === 'auth/captcha-check-failed' || code === 'auth/internal-error') {
        msg = 'Verificação reCAPTCHA falhou. Recarregue a página e tente de novo. Ou use Link Mágico.' + (rawMsg ? '\n\n(' + rawMsg.substring(0, 120) + ')' : '');
      } else if (code === 'auth/quota-exceeded') {
        msg = 'Cota diária de SMS Firebase esgotada (limite free tier). Use Link Mágico por E-mail.' + waSuffix;
      } else if (code === 'auth/network-request-failed') {
        msg = 'Sem conexão estável com Firebase. Tente Wi-Fi ou outra rede. Ou use Link Mágico.';
      } else {
        // Inclui rawMsg para diagnóstico quando error.code é undefined
        msg = 'Não foi possível enviar SMS. Use Link Mágico por E-mail.\n\n(código: ' + code + (rawMsg ? ' — ' + rawMsg.substring(0, 120) : '') + ')' + waSuffix;
      }
      showNotification('SMS — falha', msg, 'error');
    });
}

function _showPhoneVerificationStep() {
  // v1.0.22-beta: campo unificado substituiu phone-step-number — agora
  // escondemos o login-unified-step (campo único email/celular) e mostramos
  // o phone-step-code (input do código de 6 dígitos).
  var unifiedStep = document.getElementById('login-unified-step');
  var phoneStepLegacy = document.getElementById('phone-step-number'); // pré-v1.0.22 (defensivo)
  var codeStep = document.getElementById('phone-step-code');
  if (unifiedStep) unifiedStep.style.display = 'none';
  if (phoneStepLegacy) phoneStepLegacy.style.display = 'none';
  if (codeStep) codeStep.style.display = 'block';
  var codeInput = document.getElementById('login-phone-code');
  if (codeInput) { codeInput.value = ''; codeInput.focus(); }
}

function handlePhoneVerifyCode() {
  var codeEl = document.getElementById('login-phone-code');
  var code = codeEl ? codeEl.value.trim() : '';
  if (!code || code.length < 6) {
    showNotification(_t('auth.invalidCode'), _t('auth.invalidCodeMsg'), 'warning');
    if (codeEl) codeEl.focus();
    return;
  }

  if (!window._phoneConfirmationResult) {
    showNotification(_t('auth.error'), _t('auth.sessionExpiredMsg'), 'error');
    _resetPhoneLoginUI();
    return;
  }

  showNotification(_t('auth.verifying'), _t('auth.confirmingCode'), 'info');
  window._phoneConfirmationResult.confirm(code)
    .then(async function(result) {
      var user = result.user;
      // Save auth provider to Firestore.
      // v1.0.43-beta: cross-reference por telefone — quando user SMS faz
      // login pela primeira vez, procura outro doc users com o mesmo
      // phone (ex: ele já tem conta Google que registrou esse telefone
      // no perfil). Se achar, herda displayName, photoURL E acceptedTerms
      // pro novo doc — assim a saudação não vira "Bem-vindo,
      // +5511997237733!" (bug reportado) e os termos não são pedidos de
      // novo se ele já aceitou na outra conta. Limitação: não funde os
      // dois Firebase Auth uids — stats/torneios continuam separados,
      // mas pelo menos a UX inicial fica coerente.
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        var profileData = { authProvider: 'phone', updatedAt: new Date().toISOString() };
        // v1.3.77-beta: lê savedCountry ANTES de salvar phone para stripar o DDI
        // do E.164 e armazenar só o número local (DDD+número). Antes salvava
        // user.phoneNumber completo (+5511997237733) e _formatPhoneDisplay tratava
        // os 2 dígitos do DDI como DDD → exibia "(55) 11997-2377" em vez de
        // "(11) 99972-3777". phoneCountry continua salvo separado pra pré-popular
        // o seletor de DDI no editor de perfil.
        var savedCountry = null;
        try { savedCountry = localStorage.getItem('scoreplace_loginPhoneCountry'); } catch (_e) {}
        if (savedCountry) profileData.phoneCountry = savedCountry;
        if (user.phoneNumber) {
          // v1.4.7-beta: armazena em formato E.164 completo (+5511997237733).
          // Antes (v1.3.77-beta) stripava o DDI — gerava inconsistência com perfis
          // antigos que guardavam com +55, impedindo cross-ref por telefone.
          profileData.phone = (typeof window._normalizePhoneE164 === 'function')
            ? window._normalizePhoneE164(user.phoneNumber, savedCountry || '55')
            : user.phoneNumber;
        }

        // Lookup cross-reference por telefone. Tenta achar um user EXISTENTE
        // (uid diferente) com este phone — pode ser conta Google/email do
        // mesmo human que já cadastrou o telefone no perfil.
        try {
          if (user.phoneNumber) {
            // v1.4.7-beta: banco normalizado — todos os phones são E.164 (+55...).
            // Mantém fallback local (sem +55) por backward-compat com docs ainda
            // não migrados que possam existir fora da janela de migração.
            var _e164Phone = profileData.phone || user.phoneNumber;
            var _localFallback = _e164Phone.replace(/^\+55/, '');
            var _crossRefPhones = [_e164Phone];
            if (_localFallback !== _e164Phone) _crossRefPhones.push(_localFallback);
            var snap = await window.FirestoreDB.db.collection('users')
              .where('phone', 'in', _crossRefPhones)
              .limit(5).get();
            var matches = [];
            var matchIds = [];
            snap.forEach(function(doc) {
              if (doc.id !== user.uid) { matches.push(doc.data()); matchIds.push(doc.id); }
            });
            if (matches.length > 0) {
              // Pega o match com mais info (preferência: tem displayName não-vazio
              // e não-numérico, e tem photoURL real).
              var best = matches.find(function(m) {
                return m.displayName && !/^\+?\d{6,}$/.test(String(m.displayName).trim());
              }) || matches[0];
              if (best.displayName && !user.displayName) {
                profileData.displayName = best.displayName;
                // Sincroniza Firebase Auth displayName também — saudação puxa daí.
                try { await user.updateProfile({ displayName: best.displayName }); } catch(_e) {}
              }
              if (best.photoURL && !user.photoURL) {
                profileData.photoURL = best.photoURL;
                try { await user.updateProfile({ photoURL: best.photoURL }); } catch(_e) {}
              }
              if (best.acceptedTerms === true) {
                profileData.acceptedTerms = true;
                if (best.acceptedTermsAt) profileData.acceptedTermsAt = best.acceptedTermsAt;
                if (best.acceptedTermsVersion) profileData.acceptedTermsVersion = best.acceptedTermsVersion;
              }
              // v1.0.49-beta: stash cross-ref data em window pra simulateLoginSuccess
              // mergear no existingProfile/currentUser ANTES do terms gate. Sem isso
              // existe race entre saveUserProfile (assíncrono) e a leitura do
              // existingProfile em simulateLoginSuccess — terms eram pedidos de
              // novo mesmo o human já tendo aceitado em outra conta.
              window._pendingCrossRef = Object.assign({}, profileData, { uid: user.uid });
              // v1.7.9-beta: SMS = número verificado → agendar merge automático
              var _bestPhoneMatchIdx = matches.indexOf(best);
              var _bestPhoneMatchId = matchIds[_bestPhoneMatchIdx >= 0 ? _bestPhoneMatchIdx : 0];
              if (_bestPhoneMatchId && !best.mergedInto) {
                window._pendingCrossRefOldUid = _bestPhoneMatchId;
              }
              window._log('[phone-login] cross-ref encontrado, herdando:',
                Object.keys(profileData).filter(function(k){ return k !== 'authProvider' && k !== 'updatedAt' && k !== 'phone'; }));
            }
          }
        } catch (e) {
          window._warn('[phone-login] cross-ref por phone falhou:', e);
        }

        // Fallback: se ainda não temos displayName e não achamos cross-ref,
        // deixa null pra que o nudge "Complete seu perfil" peça depois —
        // melhor que mostrar o telefone na saudação.
        // (Antes da v1.0.43, setávamos profileData.displayName = phoneNumber.)

        window.FirestoreDB.saveUserProfile(user.uid, profileData).catch(function() {});
      }
      window._phoneConfirmationResult = null;
      _resetPhoneRecaptcha();
      showNotification(_t('auth.loginDone'), _t('auth.welcome'), 'success');
      var modal = document.getElementById('modal-login');
      if (modal) modal.classList.remove('active');
      _resetPhoneLoginUI();
    })
    .catch(function(error) {
      window._error('Phone verify error:', error);
      if (error.code === 'auth/invalid-verification-code') {
        showNotification(_t('auth.wrongCode'), _t('auth.wrongCodeMsg'), 'error');
      } else if (error.code === 'auth/code-expired') {
        showNotification(_t('auth.codeExpired'), _t('auth.codeExpiredMsg'), 'error');
        _resetPhoneLoginUI();
      } else {
        showNotification(_t('auth.error'), error.message || _t('auth.loginErrorMsg'), 'error');
      }
    });
}

function _resetPhoneRecaptcha() {
  if (window._phoneRecaptchaVerifier) {
    try { window._phoneRecaptchaVerifier.clear(); } catch(e) {}
    window._phoneRecaptchaVerifier = null;
  }
  var container = document.getElementById('recaptcha-container');
  if (container) container.innerHTML = '';
}

// v1.3.76-beta: garante que recaptcha-container está diretamente no body,
// FORA de qualquer modal/overlay com overflow:hidden. No iOS Safari, o
// reCAPTCHA invisível injeta um iframe via position:absolute que fica
// clipado quando o container está dentro de um .modal com overflow:hidden
// — causando falha silenciosa sem error.code (código: unknown).
// Posicionado fora da tela mas NÃO display:none (reCAPTCHA precisa
// estar no layout para o iframe receber dimensões reais).
function _ensureRecaptchaInBody() {
  var el = document.getElementById('recaptcha-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'recaptcha-container';
    document.body.appendChild(el);
  } else if (el.parentNode !== document.body) {
    // Move para body — sai do interior do modal
    document.body.appendChild(el);
  }
  el.style.cssText = 'position:fixed;bottom:0;right:0;z-index:0;width:1px;height:1px;overflow:hidden;';
}

function _resetPhoneLoginUI() {
  // v1.0.22-beta: campo unificado — restaura login-unified-step e esconde
  // o passo de verificação de código.
  var unifiedStep = document.getElementById('login-unified-step');
  var phoneStepLegacy = document.getElementById('phone-step-number'); // pré-v1.0.22 (defensivo)
  var codeStep = document.getElementById('phone-step-code');
  if (unifiedStep) unifiedStep.style.display = 'block';
  if (phoneStepLegacy) phoneStepLegacy.style.display = 'block';
  if (codeStep) codeStep.style.display = 'none';
  window._phoneConfirmationResult = null;
}

// ─── Email/Password Login ────────────────────────────────────────────────────
function handleEmailLogin() {
  var email = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  if (!email || !password) {
    showNotification(_t('auth.requiredFields'), _t('auth.fillEmailPassword'), 'warning');
    return;
  }

  showNotification(_t('auth.signingIn'), _t('auth.signingInMsg'), 'info');
  firebase.auth().signInWithEmailAndPassword(email, password)
    .then(function(result) {
      var user = result.user;
      // Track auth provider
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        window.FirestoreDB.saveUserProfile(user.uid, { authProvider: 'password', updatedAt: new Date().toISOString() }).catch(function() {});
      }
      _tryLinkPendingCredential(result);
      showNotification(_t('auth.loginDone'), user.displayName ? _t('auth.welcomeName', {name: user.displayName}) : _t('auth.welcome'), 'success');
      var modal = document.getElementById('modal-login');
      if (modal) modal.classList.remove('active');
    })
    .catch(function(error) {
      window._error('Email login error:', error);
      if (typeof window._captureException === 'function') {
        window._captureException(error, { area: 'emailLogin', code: error && error.code });
      }
      // v1.0.19-beta: msgs específicas + sugere fallback. Bug reportado:
      // beta tester travada em auth/network-request-failed sem indicação
      // de o que tentar (rede móvel, ITP iOS, ad blocker).
      var code = (error && error.code) || 'unknown';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        showNotification(_t('auth.invalidCreds'), _t('auth.invalidCredsMsg'), 'error');
      } else if (code === 'auth/wrong-password') {
        showNotification(_t('auth.wrongPassword'), _t('auth.wrongPasswordMsg'), 'error');
      } else if (code === 'auth/too-many-requests') {
        showNotification(_t('auth.tooManyAttempts'), _t('auth.tooManyLogin'), 'warning');
      } else if (code === 'auth/operation-not-allowed') {
        showNotification(_t('auth.notAvailable'), _t('auth.emailPasswordUnavailable'), 'warning');
      } else if (code === 'auth/network-request-failed') {
        showNotification('Sem conexão com Firebase',
          'Network blip ou bloqueio. Tente:\n' +
          '1. Trocar Wi-Fi ↔ 4G/5G\n' +
          '2. Desabilitar VPN/ad-blocker\n' +
          '3. Usar Link Mágico por E-mail (acima)', 'error');
      } else {
        showNotification('Erro no Login',
          (error.message || 'Não foi possível entrar') +
          '\n\n(código: ' + code + ')\n\nUse Link Mágico por E-mail acima.', 'error');
      }
    });
}

// ─── Email/Password Registration ─────────────────────────────────────────────
function handleEmailRegister() {
  var name = document.getElementById('register-name').value.trim();
  var email = document.getElementById('register-email').value.trim();
  var password = document.getElementById('register-password').value;
  if (!name || !email || !password) {
    showNotification(_t('auth.requiredFields'), _t('auth.fillNameEmailPassword'), 'warning');
    return;
  }
  // v1.1.3-beta: validação anti-placeholder revertida. User: 'as pessoas
  // já tem dificuldade de entrar no programa (por incompetencia delas
  // muitas vezes) e vc vai implementar uma trava? melhor deixar entrar
  // e depois editamos o nome do usuário.' Trade-off correto: friction
  // no onboarding > qualidade do nome cadastrado.
  if (password.length < 6) {
    showNotification(_t('auth.weakPassword'), _t('auth.weakPasswordMsg'), 'warning');
    return;
  }

  showNotification(_t('auth.creatingAccount'), _t('auth.creatingAccountMsg'), 'info');
  // Flag to delay onAuthStateChanged until profile is updated with displayName
  window._pendingProfileUpdate = true;
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(function(result) {
      var user = result.user;
      // Update profile with display name FIRST, then let onAuthStateChanged handle login
      return user.updateProfile({ displayName: name }).then(function() {
        // Send email verification
        user.sendEmailVerification().then(function() {
          showNotification(_t('auth.verifyEmail'), _t('auth.verifyEmailMsg', {email: email}), 'info');
        }).catch(function(e) {
          window._warn('Email verification send error:', e);
        });
        showNotification(_t('auth.accountCreated'), _t('auth.accountCreatedMsg', {name: name}), 'success');
        var modal = document.getElementById('modal-login');
        if (modal) modal.classList.remove('active');
        // Save auth provider to Firestore
        if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
          window.FirestoreDB.saveUserProfile(user.uid, {
            authProvider: 'password',
            displayName: name,
            email: email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }).catch(function() {});
        }
        // Clear flag and trigger login flow via simulateLoginSuccess (onAuthStateChanged may have fired before updateProfile)
        window._pendingProfileUpdate = false;
        return simulateLoginSuccess({
          uid: user.uid,
          email: user.email,
          displayName: name,
          photoURL: user.photoURL
        });
      });
    })
    .catch(function(error) {
      window._pendingProfileUpdate = false;
      window._error('Email register error:', error);
      var code = (error && error.code) || 'unknown';
      // v1.3.23-beta: NÃO mandar pra Sentry códigos esperados de UX
      // (user errou senha, email já cadastrado, etc.) — esses já têm
      // tratamento no client e poluiam digest do scoreplace-sentry-check.
      // Bugs reais (network-request-failed transient com count alto,
      // operation-not-allowed, unknown) continuam reportados.
      var EXPECTED_AUTH_CODES = ['auth/email-already-in-use', 'auth/invalid-email', 'auth/weak-password'];
      if (typeof window._captureException === 'function' && EXPECTED_AUTH_CODES.indexOf(code) === -1) {
        window._captureException(error, { area: 'emailRegister', code: code });
      }
      // v1.0.19-beta: msgs específicas + sugere fallback. Bug reportado por
      // beta tester (Cátia) com auth/network-request-failed travando criação
      // de conta sem indicar o que tentar.
      if (code === 'auth/email-already-in-use') {
        showNotification(_t('auth.emailInUse'), _t('auth.emailInUseMsg'), 'error');
      } else if (code === 'auth/invalid-email') {
        showNotification(_t('auth.invalidEmail'), _t('auth.invalidEmailMsg'), 'error');
      } else if (code === 'auth/weak-password') {
        showNotification(_t('auth.weakPassword'), _t('auth.weakPasswordMsg'), 'warning');
      } else if (code === 'auth/operation-not-allowed') {
        showNotification(_t('auth.notAvailable'), _t('auth.registerUnavailable'), 'warning');
      } else if (code === 'auth/network-request-failed') {
        showNotification('Sem conexão com Firebase',
          'Network blip ou bloqueio. Tente:\n' +
          '1. Trocar Wi-Fi ↔ 4G/5G\n' +
          '2. Desabilitar VPN/ad-blocker\n' +
          '3. Usar Link Mágico por E-mail (acima) — não precisa criar senha', 'error');
      } else {
        showNotification('Erro no Registro',
          (error.message || 'Não foi possível criar conta') +
          '\n\n(código: ' + code + ')\n\nUse Link Mágico por E-mail acima — entrada rápida sem precisar de senha.', 'error');
      }
    });
}

// ─── Password Reset ──────────────────────────────────────────────────────────
function handlePasswordReset() {
  var emailEl = document.getElementById('login-email');
  var email = emailEl ? emailEl.value.trim() : '';
  if (!email) {
    showNotification(_t('auth.enterEmail'), _t('auth.enterEmailReset'), 'info');
    if (emailEl) emailEl.focus();
    return;
  }

  showNotification(_t('auth.sending'), _t('auth.sendingReset'), 'info');
  firebase.auth().sendPasswordResetEmail(email, {
    url: 'https://scoreplace.app/#dashboard',
    handleCodeInApp: false
  })
    .then(function() {
      showNotification(_t('auth.emailSent'), _t('auth.emailSentMsg', {email: email}), 'success');
    })
    .catch(function(error) {
      window._error('Password reset error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
        showNotification(_t('auth.emailNotFound'), _t('auth.emailNotFoundMsg'), 'error');
      } else if (error.code === 'auth/too-many-requests') {
        showNotification(_t('auth.tooManyAttempts'), _t('auth.tooManyReset'), 'warning');
      } else if (error.code === 'auth/operation-not-allowed') {
        showNotification(_t('auth.notAvailable'), _t('auth.resetUnavailable'), 'warning');
      } else {
        showNotification(_t('auth.error'), error.message || _t('auth.resetErrorMsg'), 'error');
      }
    });
}

// ─── Toggle between login and register mode ──────────────────────────────────
function toggleEmailMode(mode) {
  var loginDiv = document.getElementById('email-login-mode');
  var registerDiv = document.getElementById('email-register-mode');
  if (mode === 'register') {
    if (loginDiv) loginDiv.style.display = 'none';
    if (registerDiv) registerDiv.style.display = 'block';
  } else {
    if (loginDiv) loginDiv.style.display = 'block';
    if (registerDiv) registerDiv.style.display = 'none';
  }
}

// ─── Switch login tabs ──────────────────────────────────────────────────────
function switchLoginTab(tabId) {
  var tabs = ['social', 'email', 'emaillink', 'phone'];
  tabs.forEach(function(t) {
    var panel = document.getElementById('login-panel-' + t);
    var tab = document.getElementById('tab-' + t);
    if (panel) panel.style.display = (t === tabId) ? 'block' : 'none';
    if (tab) {
      tab.style.background = (t === tabId) ? 'var(--primary-color)' : 'var(--surface-color)';
      tab.style.color = (t === tabId) ? '#fff' : 'var(--text-muted)';
    }
  });
  // Reset phone UI when switching away
  if (tabId !== 'phone') _resetPhoneLoginUI();
}

// Busca dados demográficos do Google via People API e salva no Firestore
function _fetchGoogleDemographics(accessToken, uid) {
  fetch('https://people.googleapis.com/v1/people/me?personFields=genders,birthdays,ageRanges,locales,addresses,phoneNumbers', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (!window.AppStore.currentUser) return;
    var profileUpdates = {};

    // Gênero
    if (data.genders && data.genders.length > 0) {
      var googleGender = data.genders[0].value;
      var genderMap = { 'male': 'masculino', 'female': 'feminino', 'unspecified': '' };
      var genderPt = genderMap[googleGender] || '';
      if (genderPt && !window.AppStore.currentUser.gender) {
        window.AppStore.currentUser.gender = genderPt;
        profileUpdates.gender = genderPt;
        // Google gender detected
      }
    }

    // Data de nascimento e idade
    if (data.birthdays && data.birthdays.length > 0) {
      var bd = data.birthdays[0].date;
      if (bd && bd.year && bd.month && bd.day) {
        var birthDateStr = bd.year + '-' + String(bd.month).padStart(2, '0') + '-' + String(bd.day).padStart(2, '0');
        if (!window.AppStore.currentUser.birthDate) {
          window.AppStore.currentUser.birthDate = birthDateStr;
          profileUpdates.birthDate = birthDateStr;
          // Calcula idade
          var today = new Date();
          var birthDate = new Date(bd.year, bd.month - 1, bd.day);
          var age = today.getFullYear() - birthDate.getFullYear();
          var monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
          window.AppStore.currentUser.age = age;
          profileUpdates.age = age;
          // Google age detected
        }
      }
    }

    // Localidade/idioma
    if (data.locales && data.locales.length > 0) {
      var locale = data.locales[0].value;
      if (locale && !window.AppStore.currentUser.locale) {
        window.AppStore.currentUser.locale = locale;
        profileUpdates.locale = locale;
      }
    }

    // Endereço/cidade
    if (data.addresses && data.addresses.length > 0) {
      var addr = data.addresses[0];
      if (addr.city && !window.AppStore.currentUser.city) {
        window.AppStore.currentUser.city = addr.city;
        profileUpdates.city = addr.city;
      }
      if (addr.region && !window.AppStore.currentUser.state) {
        window.AppStore.currentUser.state = addr.region;
        profileUpdates.state = addr.region;
      }
      if (addr.country && !window.AppStore.currentUser.country) {
        window.AppStore.currentUser.country = addr.country;
        profileUpdates.country = addr.country;
      }
    }

    // Telefone
    if (data.phoneNumbers && data.phoneNumbers.length > 0) {
      var rawPhone = data.phoneNumbers[0].canonicalForm || data.phoneNumbers[0].value || '';
      var digits = rawPhone.replace(/\D/g, '');
      if (digits && !window.AppStore.currentUser.phone) {
        // Detecta código do país
        var countryCode = '55'; // default Brasil
        if (digits.length > 11 && digits.startsWith('55')) {
          countryCode = '55';
          digits = digits.substring(2);
        } else if (digits.length > 10 && digits.startsWith('1')) {
          countryCode = '1';
          digits = digits.substring(1);
        } else if (rawPhone.startsWith('+')) {
          // Tenta extrair código do país do número original
          var intlDigits = rawPhone.replace(/\D/g, '');
          if (intlDigits.length > 11) {
            countryCode = intlDigits.substring(0, intlDigits.length - 11);
            digits = intlDigits.substring(countryCode.length);
          }
        }
        window.AppStore.currentUser.phone = digits;
        window.AppStore.currentUser.phoneCountry = countryCode;
        profileUpdates.phone = digits;
        profileUpdates.phoneCountry = countryCode;
        // Google phone detected
      }
    }

    // Salva no Firestore se houve atualizações
    if (Object.keys(profileUpdates).length > 0 && window.FirestoreDB && window.FirestoreDB.db && uid) {
      window.FirestoreDB.saveUserProfile(uid, profileUpdates).catch(function(err) {
        window._warn('Erro ao salvar dados demográficos:', err);
      });
    }
  })
  .catch(function(err) {
    // People API (demographics) not available
  });
}

// Auto-amizade quando alguém aceita convite de torneio (com ?ref=UID no link)
function _autoFriendOnInvite(inviterUid, currentUser) {
  if (!inviterUid || !currentUser || !window.FirestoreDB || !window.FirestoreDB.db) return;
  var myUid = currentUser.uid || currentUser.email;
  if (inviterUid === myUid) return; // Não se auto-adicionar

  // Verifica se já são amigos
  var myFriends = currentUser.friends || [];
  if (myFriends.indexOf(inviterUid) !== -1) return;

  // Torna amigos mutuamente (sem necessidade de aceite — veio via convite)
  window.FirestoreDB.db.collection('users').doc(myUid).set({
    friends: firebase.firestore.FieldValue.arrayUnion(inviterUid)
  }, { merge: true });
  window.FirestoreDB.db.collection('users').doc(inviterUid).set({
    friends: firebase.firestore.FieldValue.arrayUnion(myUid)
  }, { merge: true });

  // Remove convites pendentes entre eles se houver
  window.FirestoreDB.db.collection('users').doc(myUid).set({
    friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(inviterUid),
    friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(inviterUid)
  }, { merge: true });
  window.FirestoreDB.db.collection('users').doc(inviterUid).set({
    friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(myUid),
    friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(myUid)
  }, { merge: true });

  // Atualiza estado local (com dedup)
  if (!currentUser.friends) currentUser.friends = [];
  if (currentUser.friends.indexOf(inviterUid) === -1) {
    currentUser.friends.push(inviterUid);
  }

  // Notifica quem convidou
  window.FirestoreDB.addNotification(inviterUid, {
    type: 'friend_accepted',
    fromUid: myUid,
    fromName: currentUser.displayName || '',
    fromPhoto: currentUser.photoURL || '',
    fromEmail: currentUser.email || '',
    message: _t('auth.friendAcceptedMsg', {name: currentUser.displayName || _t('auth.someone')}),
    createdAt: new Date().toISOString(),
    read: false
  });

  // Auto-friendship via invite
}

async function simulateLoginSuccess(user) {
  // v0.17.85: timestamp-based guard substituiu boolean. Antes era flag bool
  // _simulateLoginInProgress que só era resetado no FINAL bem-sucedido da
  // função — qualquer throw em await intermediário (loadUserProfile,
  // showTermsAcceptanceModal, fetch, etc.) deixava a flag stuck=true. Próxima
  // tentativa de login (mesma sessão) era silent no-op: modal fechava (graças
  // ao _forceCloseLoginModal v0.17.83), toast aparecia, mas AppStore.currentUser
  // nunca era setado. Sintoma: "logou mas não está logado".
  // Agora flag carrega timestamp da entrada. >10s = stale (deixa passar).
  var now = Date.now();
  var inProgressAt = window._simulateLoginInProgressAt || 0;
  var inProgressUid = window._simulateLoginInProgressUid || '';
  var STALE_MS = 10000; // 10s
  var newUid = user && user.uid;
  window._log('[scoreplace-auth] simulateLoginSuccess called for', user && user.email,
    'inProgressAt:', inProgressAt, 'staleAfter:', STALE_MS + 'ms', 'isStale:', (now - inProgressAt) > STALE_MS);
  if (inProgressAt && (now - inProgressAt) <= STALE_MS) {
    // LGPD GUARD: o guard de 10s só é válido para a MESMA conta.
    // Se chegar um uid diferente enquanto outro login está em andamento,
    // limpar imediatamente o currentUser e deixar passar — impede que dados
    // da conta anterior contaminem ações do novo usuário.
    if (inProgressUid && newUid && inProgressUid !== newUid) {
      window._warn('[scoreplace-auth] uid diferente durante login ativo — limpando currentUser para prevenir contaminação de dados (LGPD)');
      window.AppStore.currentUser = null;
      // Não retornar — deixa prosseguir com o novo usuário
    } else {
      window._log('[scoreplace-auth] simulateLoginSuccess: skipping — fresh in-progress (' + (now - inProgressAt) + 'ms ago)');
      return;
    }
  }
  if (inProgressAt && inProgressUid === newUid) {
    window._warn('[scoreplace-auth] simulateLoginSuccess: previous attempt stale (' + (now - inProgressAt) + 'ms), proceeding');
  }
  window._simulateLoginInProgressAt = now;
  window._simulateLoginInProgressUid = newUid || '';
  window._simulateLoginInProgress = true; // mantido pra compat com callers antigos

  try {

  // Set AppStore.currentUser with the user object.
  // v0.17.86: NON-DESTRUCTIVE merge SE o uid bate (mesma conta) — preserva
  // campos como acceptedTerms, plan, presenceVisibility que já estavam em
  // currentUser. Antes era assign direto (`= user`), wipeava esses campos e
  // forçava re-load via loadUserProfile a cada onAuthStateChanged. Se o
  // load não restaurasse algum campo crítico, modal de termos voltava.
  // Se o uid mudou (account switch), substituição completa.
  var existingUser = window.AppStore.currentUser || {};
  var sameUser = existingUser.uid && user.uid && existingUser.uid === user.uid;
  window.AppStore.currentUser = sameUser
    ? Object.assign({}, existingUser, user)
    : Object.assign({}, user);
  window._log('[scoreplace-auth] currentUser set (' + (sameUser ? 'merged' : 'replaced') + '), running early router refresh');

  // v0.17.93: atualizar topbar IMEDIATAMENTE com o user do Google.
  // Antes, topbar só era atualizado no fim da função (linha 1274+) DEPOIS
  // de loadUserProfile, terms gate, auto-enroll, casual rejoin etc. Se
  // qualquer await dessas etapas demorasse ou falhasse, o nome nunca
  // aparecia. Bug reportado: "fiz login com Google e não veio o nome".
  // Agora atualiza early; ainda re-atualiza no fim com photoURL/name
  // potencialmente novos do Firestore.
  try {
    if (typeof window._updateTopbarForUser === 'function') {
      window._updateTopbarForUser(user);
    }
  } catch (e) { window._warn('Early topbar update failed:', e); }

  // Close any open login modal + hamburger, and immediately refresh the route
  // so the landing page gives way to the dashboard BEFORE any async Firestore
  // call has a chance to throw and skip the initRouter at the end of the function.
  try {
    var _lm = document.getElementById('modal-login');
    if (_lm) _lm.classList.remove('active');
    if (typeof window._closeHamburger === 'function') window._closeHamburger();
    if (typeof initRouter === 'function' &&
        (window.location.hash === '' || window.location.hash === '#dashboard' || window.location.hash === '#')) {
      initRouter();
    }
  } catch (e) { window._warn('Early post-login refresh failed:', e); }

  // Load user profile from Firestore (merge extra fields like gender, sports)
  var uid = user.uid || user.email;
  var existingProfile = null;
  // v1.0.61-beta: retry loop pra resolver race "perfil não carregou".
  // Bug reportado: "voltou a pedir os termos de uso e apresentar o complete
  // seu perfil para um usuário que já estava cadastrado e tinha perfil
  // completo não carregado ainda". Causa: primeira chamada de loadUserProfile
  // pode voltar null porque Firestore SDK ainda tá inicializando IndexedDB
  // cache local — race do default `get()` que tenta cache primeiro e às
  // vezes retorna doc.exists=false antes do servidor responder.
  //
  // Estratégia: detecta returning user via Firebase Auth metadata
  // (lastSignInTime > creationTime + 60s = veterano). Se sim, tenta até
  // 4 vezes com delays crescentes (0, 500, 1000, 1500ms = max 3s). Se não
  // (signup novo legítimo), só 1 tentativa — não atrasa o flow do user
  // que está vendo o modal de termos pela primeira vez.
  //
  // Importante: durante retries intermediários, reseta cu._profileLoaded
  // pra suprimir o nudge "Complete seu perfil" que disparava prematuro.
  if (window.AppStore.loadUserProfile && uid) {
    var _isReturning = false;
    try {
      var _fbu = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) || user;
      if (_fbu && _fbu.metadata && _fbu.metadata.creationTime && _fbu.metadata.lastSignInTime) {
        var _created = new Date(_fbu.metadata.creationTime).getTime();
        var _signed = new Date(_fbu.metadata.lastSignInTime).getTime();
        _isReturning = (_signed - _created) > 60000;
      }
    } catch (_metaErr) {}
    var _maxAttempts = _isReturning ? 4 : 1;
    window._log('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] profile load — isReturning=' + _isReturning + ', maxAttempts=' + _maxAttempts);
    for (var _attempt = 0; _attempt < _maxAttempts; _attempt++) {
      if (_attempt > 0) {
        // Suprime nudge durante retries
        if (window.AppStore.currentUser) window.AppStore.currentUser._profileLoaded = false;
        await new Promise(function(r) { setTimeout(r, 500 * _attempt); });
      }
      try {
        existingProfile = await window.AppStore.loadUserProfile(uid);
        if (existingProfile && Object.keys(existingProfile).length > 0) {
          if (_attempt > 0) {
            window._log('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] profile loaded on retry attempt #' + _attempt);
          }
          break;
        }
      } catch (_loadErr) {
        window._warn('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] loadUserProfile attempt ' + _attempt + ' threw:', _loadErr && _loadErr.message);
      }
    }
    if (_isReturning && (!existingProfile || Object.keys(existingProfile).length === 0)) {
      window._warn('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] returning user but profile load failed after ' + _maxAttempts + ' attempts');
    }
  }

  // v1.0.59-beta: GA4 — identify + login/signup event. Detecta método de
  // login pelos providerData; signup vs login pela existência do doc no
  // Firestore. uid pseudonimizado é OK no GA4 (não é PII pra LGPD —
  // não tem email atrás dele sem acesso ao Firebase Console).
  try {
    var _method = 'unknown';
    try {
      var pd = (user && user.providerData) || [];
      if (pd[0] && pd[0].providerId) {
        var pid = pd[0].providerId;
        if (pid === 'google.com') _method = 'google';
        else if (pid === 'phone') _method = 'sms';
        else if (pid === 'password') _method = 'email_link';
        else _method = pid;
      } else if (user && user.email) {
        _method = 'email_link';
      } else if (user && user.phoneNumber) {
        _method = 'sms';
      }
    } catch (_pdErr) {}
    if (typeof window._identify === 'function') {
      window._identify(uid, {
        plan: (existingProfile && existingProfile.plan) || 'free',
        login_method: _method
      });
    }
    var _isFirstTime = !existingProfile;
    if (_isFirstTime && typeof window._trackSignup === 'function') {
      window._trackSignup(_method);
    } else if (typeof window._trackLogin === 'function') {
      window._trackLogin(_method);
    }
  } catch (_aErr) {}

  // v1.0.49-beta: consome cross-ref pendente (handlePhoneVerifyCode/email-link
  // setam window._pendingCrossRef quando descobrem que esse uid é o mesmo
  // human de outra conta — herdam displayName/photoURL/acceptedTerms/etc).
  // Sem isso, race entre saveUserProfile (async) e essa leitura do Firestore
  // fazia terms gate disparar mesmo o human já tendo aceitado em outra conta.
  // Aplica o cross-ref no existingProfile E no currentUser pra ambos os
  // caminhos do gate (`existingProfile || currentUser`) refletirem o estado.
  if (window._pendingCrossRef && window._pendingCrossRef.uid === user.uid) {
    var _xref = window._pendingCrossRef;
    window._pendingCrossRef = null;
    window._log('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] consuming pendingCrossRef:', Object.keys(_xref).filter(function(k){return k!=='uid';}));
    if (!existingProfile) existingProfile = {};
    Object.keys(_xref).forEach(function(k) {
      if (k === 'uid') return;
      if (_xref[k] === undefined || _xref[k] === null) return;
      // Não sobrescreve fields que existingProfile JÁ TEM (Firestore wins
      // quando o save async já landou — evita reverter pra cross-ref stale).
      if (existingProfile[k] === undefined || existingProfile[k] === null || existingProfile[k] === '') {
        existingProfile[k] = _xref[k];
      }
    });
    if (window.AppStore.currentUser) {
      Object.keys(_xref).forEach(function(k) {
        if (k === 'uid') return;
        if (_xref[k] === undefined || _xref[k] === null) return;
        if (window.AppStore.currentUser[k] === undefined || window.AppStore.currentUser[k] === null || window.AppStore.currentUser[k] === '') {
          window.AppStore.currentUser[k] = _xref[k];
        }
      });
    }
  }

  // v1.7.9-beta: auto-merge conta antiga — cross-ref de email-link ou SMS
  // marcou window._pendingCrossRefOldUid com o uid da conta anterior.
  // Executa com delay de 3s pra dar tempo do login completar e do modal fechar.
  if (window._pendingCrossRefOldUid) {
    var _autoMergeOldUid = window._pendingCrossRefOldUid;
    window._pendingCrossRefOldUid = null;
    setTimeout(function() {
      if (typeof window._executePhoneAccountMerge === 'function') {
        window._log('[scoreplace-auth] auto-merge cross-ref account:', _autoMergeOldUid);
        window._executePhoneAccountMerge(_autoMergeOldUid);
      }
    }, 3000);
  }

  // v1.7.9-beta: cross-ref por e-mail para login Google — mescla conta anterior
  // se existir outro doc com o mesmo email_lower (conta phone/email criada antes).
  // Só roda se login é Google (não duplica a verificação do email-link acima).
  if (user.email && _method === 'google' && uid &&
      window.FirestoreDB && window.FirestoreDB.db) {
    (function() {
      var _gCrossEmail = String(user.email).toLowerCase();
      var _gCrossUid = uid;
      window.FirestoreDB.db.collection('users')
        .where('email_lower', '==', _gCrossEmail)
        .limit(5).get()
        .then(function(gSnap) {
          gSnap.forEach(function(gDoc) {
            if (gDoc.id !== _gCrossUid && !gDoc.data().mergedInto) {
              setTimeout(function() {
                if (typeof window._executePhoneAccountMerge === 'function') {
                  window._log('[google-login] auto-merge conta anterior por email:', gDoc.id);
                  window._executePhoneAccountMerge(gDoc.id);
                }
              }, 3000);
            }
          });
        })
        .catch(function(e) { window._warn('[google-login] email cross-ref error:', e); });
    })();
  }

  // v1.7.9-beta: defaults de notificação — ativa notifyEmail/notifyWhatsApp
  // se ainda não configurado na conta. Preserva escolhas explícitas do usuário:
  // notifyEmail: false (ou true) já definido → NÃO é sobrescrito.
  // Roda para contas novas E para contas existentes sem o campo definido.
  if (uid && window.FirestoreDB && window.FirestoreDB.db) {
    try {
      var _notifyPatch = {};
      var _ep = existingProfile || {};
      // notifyEmail = true para contas com e-mail (emailLink, Google, password)
      if (typeof _ep.notifyEmail === 'undefined' && user.email) {
        _notifyPatch.notifyEmail = true;
      }
      // notifyWhatsApp = true para contas com telefone (SMS)
      if (typeof _ep.notifyWhatsApp === 'undefined' && user.phoneNumber) {
        _notifyPatch.notifyWhatsApp = true;
      }
      if (Object.keys(_notifyPatch).length > 0) {
        window.FirestoreDB.saveUserProfile(uid, _notifyPatch).catch(function() {});
        if (window.AppStore.currentUser) Object.assign(window.AppStore.currentUser, _notifyPatch);
        if (existingProfile) Object.assign(existingProfile, _notifyPatch);
        window._log('[scoreplace-auth] notify defaults set:', _notifyPatch);
      }
    } catch (_notifyErr) {
      window._warn('[scoreplace-auth] notify defaults error (non-fatal):', _notifyErr);
    }
  }

  // Migrate legacy doc: if user has a doc keyed by email, merge it into the UID doc
  if (window.FirestoreDB && window.FirestoreDB.db && uid && user.email && uid !== user.email) {
    try {
      var legacyDoc = await window.FirestoreDB.db.collection('users').doc(user.email).get();
      if (legacyDoc.exists) {
        var legacyData = legacyDoc.data();
        // Merge legacy data into UID doc (friends, requests, etc.)
        var mergeData = {};
        if (legacyData.friends && legacyData.friends.length > 0) mergeData.friends = firebase.firestore.FieldValue.arrayUnion.apply(null, legacyData.friends);
        if (legacyData.friendRequestsReceived && legacyData.friendRequestsReceived.length > 0) mergeData.friendRequestsReceived = firebase.firestore.FieldValue.arrayUnion.apply(null, legacyData.friendRequestsReceived);
        if (legacyData.friendRequestsSent && legacyData.friendRequestsSent.length > 0) mergeData.friendRequestsSent = firebase.firestore.FieldValue.arrayUnion.apply(null, legacyData.friendRequestsSent);
        // Copy profile fields if not already set
        if (legacyData.displayName && (!existingProfile || !existingProfile.displayName)) mergeData.displayName = legacyData.displayName;
        if (legacyData.photoURL && (!existingProfile || !existingProfile.photoURL)) mergeData.photoURL = legacyData.photoURL;
        if (Object.keys(mergeData).length > 0) {
          mergeData.email = user.email;
          await window.FirestoreDB.db.collection('users').doc(uid).set(mergeData, { merge: true });
        }
        // Update all other users who reference the old email ID in their friends/requests
        var allUsers = await window.FirestoreDB.db.collection('users').get();
        var batch = window.FirestoreDB.db.batch();
        var batchCount = 0;
        allUsers.forEach(function(doc) {
          if (doc.id === user.email || doc.id === uid) return;
          var d = doc.data();
          var ref = window.FirestoreDB.db.collection('users').doc(doc.id);
          var updates = {};
          if (d.friends && d.friends.indexOf(user.email) !== -1) {
            updates.friends = firebase.firestore.FieldValue.arrayUnion(uid);
            batch.update(ref, { friends: firebase.firestore.FieldValue.arrayRemove(user.email) });
            batchCount++;
          }
          if (d.friendRequestsSent && d.friendRequestsSent.indexOf(user.email) !== -1) {
            updates.friendRequestsSent = firebase.firestore.FieldValue.arrayUnion(uid);
            batch.update(ref, { friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(user.email) });
            batchCount++;
          }
          if (d.friendRequestsReceived && d.friendRequestsReceived.indexOf(user.email) !== -1) {
            updates.friendRequestsReceived = firebase.firestore.FieldValue.arrayUnion(uid);
            batch.update(ref, { friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(user.email) });
            batchCount++;
          }
          if (Object.keys(updates).length > 0) {
            batch.update(ref, updates);
            batchCount++;
          }
        });
        if (batchCount > 0) await batch.commit();
        // Delete the legacy doc
        await window.FirestoreDB.db.collection('users').doc(user.email).delete();
        // Migrated legacy user doc
        // Reload profile after migration
        if (window.AppStore.loadUserProfile) {
          existingProfile = await window.AppStore.loadUserProfile(uid);
        }
      }
    } catch (e) {
      window._warn('Legacy doc migration error:', e);
    }
  }

  // Auto-save basic profile data to Firestore if profile is missing fields
  if (window.FirestoreDB && window.FirestoreDB.db && uid) {
    var needsSave = false;
    var basicData = {};
    // Set / fix displayName: covers (1) no name yet, (2) generic placeholder
    // "Usuário" saved by old app versions or i18n default.
    var _storedDN = (existingProfile && existingProfile.displayName) || user.displayName || '';
    var _needsBetterDN = !_storedDN || (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(_storedDN));
    if (_needsBetterDN) {
      var _betterDN = null;
      var _profEmail = (existingProfile && existingProfile.email) || user.email || '';
      var _profPhone = (existingProfile && existingProfile.phone) || '';
      if (user.displayName && !(typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(user.displayName))) {
        // Firebase Auth has a real name (e.g. Google account) — use it
        _betterDN = user.displayName;
      } else if (_profEmail) {
        // Use full email — clearest identifier for magic-link users
        _betterDN = _profEmail;
      } else if (_profPhone) {
        _betterDN = _profPhone;
      } else if (user.phoneNumber) {
        _betterDN = user.phoneNumber;
      }
      if (_betterDN) { basicData.displayName = _betterDN; needsSave = true; }
    }
    // Persist displayName from Google auth if Firestore doc doesn't have it yet
    if ((!existingProfile || !existingProfile.displayName) && user.displayName) {
      basicData.displayName = user.displayName; needsSave = true;
    }
    if (!existingProfile || !existingProfile.email) {
      if (user.email) { basicData.email = user.email; needsSave = true; }
    }
    // Backfill the denormalized lowercase fields used by searchUsers() range
    // queries. Older profiles created before v0.14.57 won't have them.
    if (existingProfile && existingProfile.displayName && !existingProfile.displayName_lower) {
      basicData.displayName = existingProfile.displayName;
      needsSave = true;
    }
    if (existingProfile && existingProfile.email && !existingProfile.email_lower) {
      basicData.email = existingProfile.email;
      needsSave = true;
    }
    if (!existingProfile || !existingProfile.photoURL) {
      if (user.photoURL) { basicData.photoURL = user.photoURL; needsSave = true; }
    }
    // Detect auth provider from Firebase Auth user
    if (!existingProfile || !existingProfile.authProvider) {
      try {
        var fbUser = firebase.auth().currentUser;
        if (fbUser && fbUser.providerData && fbUser.providerData.length > 0) {
          basicData.authProvider = fbUser.providerData[0].providerId;
          needsSave = true;
        }
      } catch(e) {}
    }
    if (!existingProfile || !existingProfile.createdAt) {
      basicData.createdAt = new Date().toISOString();
      needsSave = true;
    }
    if (needsSave) {
      basicData.updatedAt = new Date().toISOString();
      window.FirestoreDB.saveUserProfile(uid, basicData).catch(function(err) {
        window._warn('Erro ao salvar dados básicos do perfil:', err);
      });
    }
  }

  // Stop old (public-only) listener before starting full listener for logged-in user
  if (window.AppStore.stopRealtimeListener) {
    window.AppStore.stopRealtimeListener();
  }

  // Start real-time listener scoped to the user's own tournaments
  // (creator / organizer / active co-host / participant via memberEmails[]).
  // Without the scope every change in the DB fires a full snapshot to every
  // client — doesn't scale past a few users.
  if (window.AppStore.startRealtimeListener) {
    window.AppStore.startRealtimeListener(window.AppStore.currentUser && window.AppStore.currentUser.email);
  } else if (window.AppStore.loadFromFirestore) {
    await window.AppStore.loadFromFirestore();
  }

  // Start real-time listener for user notifications
  if (window.AppStore.startNotificationsListener) {
    window.AppStore.startNotificationsListener();
  }
  // Start real-time listener for user profile (theme sync across devices)
  if (window.AppStore.startProfileListener) {
    window.AppStore.startProfileListener();
  }

  // Quando perfil carregar: remover dot de carregamento da topbar e re-renderizar botão
  // Ouvinte único — remove-se após disparar pra não acumular listeners entre logins.
  (function() {
    function _onProfileLoaded(evt) {
      document.removeEventListener('scoreplace:profile-loaded', _onProfileLoaded);
      var cu = window.AppStore && window.AppStore.currentUser;
      if (cu && typeof window._updateTopbarForUser === 'function') {
        var fbU = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
        if (fbU) window._updateTopbarForUser(fbU);
      }
    }
    document.addEventListener('scoreplace:profile-loaded', _onProfileLoaded);
  })();

  // Check tournament reminders and nearby tournaments (delayed to let data load)
  setTimeout(function() {
    // Auto-detect and fix stale participant names in tournaments
    // (handles cases where user changed name before propagation code existed)
    if (typeof window._autoFixStaleNames === 'function') {
      window._autoFixStaleNames().catch(function(e) { window._warn('Auto-fix stale names error:', e); });
    }

    // Load templates from Firestore (with localStorage migration)
    if (typeof window._loadTemplates === 'function') {
      window._loadTemplates().catch(function(e) { window._warn('Template load error:', e); });
    }
    if (typeof window._checkTournamentReminders === 'function') {
      window._checkTournamentReminders().catch(function(e) { window._warn('Reminder check error:', e); });
    }
    if (typeof window._checkNearbyTournaments === 'function') {
      window._checkNearbyTournaments().catch(function(e) { window._warn('Nearby check error:', e); });
    }
    // Prime the discovery feed (public open tournaments the user isn't in).
    // Used by the dashboard "Descobrir torneios" section — separate query
    // so it scales independently of the user's scoped listener.
    if (window.AppStore && typeof window.AppStore.loadPublicDiscovery === 'function') {
      window.AppStore.loadPublicDiscovery().then(function() {
        if (typeof window._softRefreshView === 'function') window._softRefreshView();
      }).catch(function(e) { window._warn('Discovery load error:', e); });
    }
    // Initialize FCM push notifications (requests permission + saves token)
    if (typeof window._initFCM === 'function') {
      window._initFCM().catch(function(e) { window._warn('FCM init error:', e); });
    }
    // Geolocation check — suggests or auto-creates presence if at a preferred venue.
    // Respects presenceMuteUntil, presenceVisibility and presenceAutoCheckin flags.
    if (typeof window._presenceGeoCheck === 'function') {
      try { window._presenceGeoCheck(); } catch (e) { window._warn('Presence geo error:', e); }
    }
    // Kick Liga auto-draw poller once immediately after login; the interval
    // keeps it ticking thereafter (wired in main.js).
    if (typeof window._checkLigaAutoDraws === 'function') {
      window._checkLigaAutoDraws().catch(function(e) { window._warn('Liga auto-draw error:', e); });
    }
    // Bootstrap trophy engine — varre todos os troféus/milestones ao logar.
    // Não-bloqueante; roda após 3s para não competir com auth/routing init.
    if (typeof window._bootstrapTrophiesForUser === 'function' && window.AppStore.currentUser && window.AppStore.currentUser.uid) {
      window._bootstrapTrophiesForUser(window.AppStore.currentUser.uid);
    }
    if (typeof window._trophyOnLogin === 'function') {
      window._trophyOnLogin();
    }
  }, 3000);

  // v0.17.93: helper extraído pra ser chamável early na função (vide
  // chamada acima após currentUser-set) E aqui no flow normal. Idempotente.
  if (typeof window._updateTopbarForUser === 'function') {
    window._updateTopbarForUser(user);
  }

  // Expose profile-open + logout dispatch as a global so the inline onclick attribute
  // (cloned into the hamburger dropdown) keeps working. cloneNode(true) preserves
  // `onclick` attributes but NOT addEventListener listeners — hence inline wiring.
  window._onProfileBtnClick = function(e) {
    try {
      // Clique no botão de logout (→) — sempre faz logout
      if (e && e.target && e.target.closest && e.target.closest('[title="Sair da Conta"]')) {
        e.stopPropagation();
        if (typeof window._closeHamburger === 'function') window._closeHamburger();
        handleLogout();
        return;
      }
      // Clique na área do perfil (avatar/nome)
      // Se já está na página de perfil, não fazer nada — evita re-render desnecessário
      var currentHash = (window.location.hash || '').replace('#', '').split('/')[0];
      if (currentHash === 'profile') return;
      if (typeof window._closeHamburger === 'function') window._closeHamburger();
      window._openMyProfileModal();
    } catch (err) { window._warn('_onProfileBtnClick error', err); }
  };

  // Populate all form fields in the profile modal from window.AppStore.currentUser.
  // Extracted from _openMyProfileModal so we can re-populate after a fresh
  // Firestore fetch lands (guards against PWA-reinstall race where the modal
  // opens before loadUserProfile() merges the saved fields into currentUser).
  window._populateProfileModalFields = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;

    // Fallback robusto pra dados que vieram do provedor (Google/Apple/FB).
    try {
      var fbUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      if (fbUser) {
        if (!cu.displayName && fbUser.displayName) { cu.displayName = fbUser.displayName; }
        if (!cu.photoURL && fbUser.photoURL) { cu.photoURL = fbUser.photoURL; }
        if (!cu.email && fbUser.email) { cu.email = fbUser.email; }
        if (!cu.phone && fbUser.phoneNumber) {
          cu.phone = (typeof window._normalizePhoneE164 === 'function')
            ? window._normalizePhoneE164(fbUser.phoneNumber, '55')
            : fbUser.phoneNumber;
          if (!cu.phoneCountry) cu.phoneCountry = '55';
        }
        if (!cu.authProvider && fbUser.providerData && fbUser.providerData.length > 0) {
          cu.authProvider = fbUser.providerData[0].providerId;
        }
      }
    } catch (e) { window._warn('Profile fallback from firebase auth failed:', e); }

    if (!cu.phoneCountry) {
      try {
        var _lang = navigator.language || navigator.userLanguage || '';
        if (/pt-br/i.test(_lang)) cu.phoneCountry = '55';
        else if (/en-us/i.test(_lang)) cu.phoneCountry = '1';
      } catch (e) {}
    }

    // v1.0.23-beta: avatar agora é sempre iniciais (a menos que tenha foto
    // real do Google/Apple). Helper detecta dicebear.com URLs antigas como
    // "sem foto" e re-deriva iniciais do nome atual.
    var avatarName = cu.displayName || (cu.firstName && cu.lastName ? (cu.firstName + ' ' + cu.lastName) : '') || (cu.email ? cu.email.split('@')[0] : '?');
    var photoUrl = (typeof window._profileAvatarUrl === 'function')
      ? window._profileAvatarUrl(avatarName, cu.photoURL, 60)
      : (cu.photoURL || ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(avatarName) + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=60'));
    var avatar = document.getElementById('profile-avatar');
    if (avatar) { avatar.src = photoUrl; avatar.style.display = 'block'; }
    var _setVal = function(id, val) { var el = document.getElementById(id); if (el) el.value = val == null ? '' : val; };
    // v1.0.43-beta: descarta displayName que parece telefone (regression de
    // SMS login antigo que setava displayName=phoneNumber) — pega fallback
    // do email ou deixa vazio pra user preencher.
    var _dn = cu.displayName || '';
    var _dnLooksLikePhone = /^\+?\d[\d\s().-]{5,}$/.test(String(_dn).trim());
    var _fallbackName = (_dn && !_dnLooksLikePhone) ? _dn
                     : (cu.firstName && cu.lastName ? (cu.firstName + ' ' + cu.lastName) : '')
                     || (cu.email ? cu.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, function(c){return c.toUpperCase();}) : '')
                     || '';
    // v1.8.27: se usuário não tem nome amigável, pré-preenche com telefone ou
    // email formatado pra que o campo nunca apareça em branco — mas adiciona
    // nudge pedindo para trocar por um nome real.
    var _isUnfriendly = !_fallbackName;
    var _nudgeText = '';
    if (_isUnfriendly) {
      // Pré-preencher com phone formatado ou email
      if (cu.phone && typeof window._maskBRPhone === 'function') {
        var _phD2 = String(cu.phone).replace(/\D/g, '');
        if (_phD2.length > 11 && _phD2.startsWith('55')) _phD2 = _phD2.substring(2);
        _fallbackName = '+55 ' + window._maskBRPhone(_phD2);
        _nudgeText = '📱 Seu nome aparece como número de telefone. Coloque um nome para se apresentar melhor!';
      } else if (cu.email) {
        _fallbackName = cu.email;
        _nudgeText = '✉️ Seu nome aparece como e-mail. Coloque um nome para se apresentar melhor!';
      }
    } else if (_dnLooksLikePhone || (cu.displayName && cu.displayName === cu.email)) {
      _nudgeText = '💡 Adicione um nome amigável para que outros usuários te reconheçam!';
    }
    _setVal('profile-edit-name', _fallbackName);
    // Exibir/ocultar nudge abaixo do campo nome
    var _nudgeEl = document.getElementById('profile-name-nudge');
    if (_nudgeEl) {
      if (_nudgeText) {
        _nudgeEl.textContent = _nudgeText;
        _nudgeEl.style.display = 'block';
      } else {
        _nudgeEl.style.display = 'none';
      }
    }
    // v1.0.43-beta: read-only display do email autenticado.
    // v1.7.9-beta: phone-only accounts show add-email input by default.
    var emailDisplay = document.getElementById('profile-email-display');
    var emailText = document.getElementById('profile-email-text');
    var emailEditWrap = document.getElementById('profile-email-edit-wrap');
    var editEmailInp = document.getElementById('profile-edit-email');
    if (emailDisplay && emailText) {
      if (cu.email) {
        emailText.textContent = cu.email;
        emailDisplay.style.display = '';
        if (emailEditWrap) { emailEditWrap.style.display = 'none'; }
        if (editEmailInp) { editEmailInp.value = ''; }
      } else {
        emailDisplay.style.display = 'none';
        // Phone-only account: show add-email field so user can add email easily
        if (emailEditWrap) {
          emailEditWrap.style.display = '';
          if (editEmailInp) { editEmailInp.value = ''; }
        }
      }
    }
    _setVal('profile-edit-gender', cu.gender || '');
    _setVal('profile-edit-birthdate', (typeof window._isoToDisplayDate === 'function') ? window._isoToDisplayDate(cu.birthDate) : (cu.birthDate || ''));
    _setVal('profile-edit-city', cu.city || '');
    (function() {
      var raw = cu.preferredSports;
      var arr = [];
      if (Array.isArray(raw)) arr = raw.slice();
      else if (typeof raw === 'string' && raw.trim()) arr = raw.split(/[,;]/).map(function(s){return s.trim();}).filter(Boolean);
      window._profileSelectedSports = arr;

      // v1.3.6-beta: skillBySport — carrega map de habilidade por modalidade.
      // Backward-compat: se perfil antigo só tem defaultCategory + 1 sport,
      // auto-aplica defaultCategory como skill desse sport.
      var skillMap = {};
      if (cu.skillBySport && typeof cu.skillBySport === 'object') {
        Object.keys(cu.skillBySport).forEach(function(s) {
          if (cu.skillBySport[s]) skillMap[s] = cu.skillBySport[s];
        });
      }
      // Backward-compat: defaultCategory + 1 sport e nada em skillBySport pra esse sport
      if (cu.defaultCategory && arr.length >= 1) {
        arr.forEach(function(s) {
          if (!skillMap[s]) skillMap[s] = cu.defaultCategory;
        });
      }
      window._profileSkillBySport = skillMap;

      // v1.6.1-beta: canRefereeBySport — posso arbitrar por modalidade.
      var refMap = {};
      if (cu.canRefereeBySport && typeof cu.canRefereeBySport === 'object') {
        Object.keys(cu.canRefereeBySport).forEach(function(s) {
          refMap[s] = !!cu.canRefereeBySport[s];
        });
      }
      window._profileCanRefereeBySport = refMap;

      if (typeof window._applyProfileSportsUI === 'function') window._applyProfileSportsUI(arr);
      if (typeof window._renderProfileSkillBySport === 'function') window._renderProfileSkillBySport();
    })();
    var phoneCountrySel = document.getElementById('profile-phone-country');
    var phoneInput = document.getElementById('profile-edit-phone');
    if (phoneCountrySel && cu.phoneCountry) phoneCountrySel.value = cu.phoneCountry;
    if (phoneInput && cu.phone) {
      var _cc0 = phoneCountrySel ? phoneCountrySel.value : (cu.phoneCountry || '55');
      var digits = (typeof window._phoneLocalDigits === 'function')
        ? window._phoneLocalDigits(cu.phone, _cc0)
        : (cu.phone || '').replace(/\D/g, '');
      phoneInput.setAttribute('data-digits', digits);
      if (typeof _formatPhoneDisplay === 'function') {
        phoneInput.value = _formatPhoneDisplay(digits, _cc0);
      } else {
        phoneInput.value = digits;
      }
    }
    var _hintsEnabled = !(window._hintSystem && window._hintSystem.isDisabled());
    [
      { id: 'profile-accept-friends', val: cu.acceptFriendRequests !== false },
      { id: 'profile-notify-platform', val: cu.notifyPlatform !== false },
      { id: 'profile-notify-email', val: cu.notifyEmail !== false },
      // v1.3.41-beta: default ON se já tem telefone cadastrado e não escolheu OFF explicitamente
      { id: 'profile-notify-whatsapp', val: cu.notifyWhatsApp === true || (cu.notifyWhatsApp !== false && !!(cu.phone && String(cu.phone).replace(/\D/g,'').length >= 8)) },
      { id: 'profile-hints-enabled', val: _hintsEnabled },
      { id: 'profile-presence-auto-checkin', val: !!cu.presenceAutoCheckin }
    ].forEach(function(t) { var el = document.getElementById(t.id); if (el) el.checked = t.val; });
    window._profileLocations = Array.isArray(cu.preferredLocations) ? cu.preferredLocations.slice() : [];
    var cepsEl = document.getElementById('profile-edit-ceps'); if (cepsEl) cepsEl.value = cu.preferredCeps || '';
    var _pv = cu.presenceVisibility || 'friends';
    var _until = Number(cu.presenceMuteUntil || 0);
    var _active = _until > Date.now();
    var _daysLeft = _active ? Math.max(1, Math.ceil((_until - Date.now()) / (24 * 3600 * 1000))) : (Number(cu.presenceMuteDays) || 7);
    if (typeof window._applyPresenceVisibilityUI === 'function') window._applyPresenceVisibilityUI(_pv);
    if (typeof window._applyPresenceMuteUI === 'function') window._applyPresenceMuteUI({ active: _active, days: _daysLeft });
    if (typeof window._applyNotifyFilterUI === 'function') window._applyNotifyFilterUI(cu.notifyLevel || 'todas');
    var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (typeof window._applyProfileThemeUI === 'function') window._applyProfileThemeUI(curTheme);
    // Renderizar emails vinculados
    if (typeof window._profileRenderLinkedEmails === 'function') window._profileRenderLinkedEmails();
  };

  // v1.3.5-beta: perfil agora é uma rota (#profile), não modal-overlay.
  // Padrão centralizado igual a #support, #privacy, #invite, #terms — usa
  // _renderBackHeader, topbar fica visível, hamburger empurra conteúdo
  // scrollável. Compat: _openMyProfileModal e _showProfileModal redirecionam
  // pra hash #profile pra preservar todos os call-sites antigos.
  window._openMyProfileModal = function () {
    // Se já está na página de perfil, não fazer nada
    if ((window.location.hash || '').replace('#','').split('/')[0] === 'profile') return;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      // Sem sessão — verificar se está em andamento (perfil carregando)
      var fbUser = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      if (fbUser) {
        // Firebase confirma sessão ativa mas AppStore ainda carregando — aguardar
        // em vez de abrir modal de login (evita abrir login para quem já está logado)
        var _waitForProfile = setInterval(function() {
          var cu2 = window.AppStore && window.AppStore.currentUser;
          if (cu2) { clearInterval(_waitForProfile); window.location.hash = '#profile'; }
        }, 150);
        setTimeout(function() { clearInterval(_waitForProfile); }, 5000);
        return;
      }
      // Realmente sem sessão → abrir login
      if (typeof openModal === 'function') openModal('modal-login');
      return;
    }
    window.location.hash = '#profile';
  };
  window._showProfileModal = window._openMyProfileModal;

  // v1.3.5-beta: helper centralizado pra fechar a página de perfil. Funciona
  // tanto pro novo flow (rota #profile → navega pro dashboard) quanto pro
  // legacy (modal-overlay → tira .active).
  window._closeProfilePage = function () {
    if (window.location.hash === '#profile') {
      window.location.hash = '#dashboard';
      return;
    }
    var modal = document.getElementById('modal-profile');
    if (modal) modal.classList.remove('active');
  };

  // ─── renderProfilePage: rota #profile ────────────────────────────────
  // Move o .modal (criado por setupProfileModal) pro view-container,
  // adicionando o back-header padronizado. Topbar permanece visível.
  // Setup async do profile (loadUserProfile + populate) acontece aqui.
  window.renderProfilePage = async function (container) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      // Sem login — manda pro dashboard (que abre modal-login se preciso).
      window.location.replace('#dashboard');
      return;
    }
    if (!container) return;

    // Garantir que setupProfileModal já criou a estrutura DOM.
    if (!document.getElementById('modal-profile') && typeof window.setupProfileModal === 'function') {
      window.setupProfileModal();
    }

    // Pegar o .modal (form completo) — pode estar no wrapper #modal-profile
    // (primeira render) OU já no view-container (re-render via i18n).
    var modalEl = document.getElementById('modal-profile');
    var modalInner = modalEl ? modalEl.querySelector('.modal') : null;
    if (!modalInner) {
      // Wrapper foi destruído ou .modal sumiu — rebuilda do zero.
      if (modalEl) modalEl.remove();
      if (typeof window.setupProfileModal === 'function') window.setupProfileModal();
      modalEl = document.getElementById('modal-profile');
      modalInner = modalEl ? modalEl.querySelector('.modal') : null;
    }
    if (!modalInner) return;

    // Back-header padronizado: Voltar (esquerda) + título (centro) + Salvar (direita).
    // Hamburger fica oculto neste contexto (não-overlay) — topbar acima já tem o seu.
    var _t = window._t || function (k) { return k; };
    // v1.3.29-beta: Save button compacto, sólido, ícone + label.
    // width:auto + max-width:120px constrange contra flex-stretch do parent.
    // Bug reportado: "salvar visivelmente errado" — antes botão crescia
    // pra ocupar todo o lado direito da back-header.
    var saveBtnHtml = '<button type="button" class="btn btn-primary btn-sm hover-lift" onclick="if(window._spinButton)window._spinButton(this, \'Salvando...\'); if(typeof saveUserProfile===\'function\')saveUserProfile()" style="flex:0 0 auto;width:auto;max-width:120px;background:#10b981;color:#fff;border:1px solid #059669;font-weight:700;padding:7px 14px;border-radius:10px;font-size:0.82rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(16,185,129,0.3);">💾 ' + _t('btn.save') + '</button>';
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
        href: '#dashboard',
        label: 'Voltar',
        middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">' + _t('profile.myProfile') + '</span>',
        rightHtml: saveBtnHtml,
      })
      : '';

    container.innerHTML = hdr;
    // Mover o .modal pra dentro do container (preserva listeners + state).
    container.appendChild(modalInner);
    // v1.3.29-beta: limpar inline `overflow-y: auto` que setupProfileModal
    // setou pra fazer o modal scrollar internamente quando dentro do
    // modal-overlay. No page-route, queremos que o BODY scrolle naturalmente.
    // Sem isso, modal vira scroll container interno e fica preso ao
    // viewport — bug reportado: "perfil não scrola".
    modalInner.style.overflowY = 'visible';
    modalInner.style.overflowX = 'visible';
    modalInner.style.maxHeight = 'none';
    modalInner.style.height = 'auto';
    // Wrapper #modal-profile fica vazio na body — limpar pra evitar
    // confusão de listeners antigos referenciando-o.
    if (modalEl && modalEl.parentNode === document.body) modalEl.remove();

    // Setup specifics (search, map) — chamados pelo modal antigo via setTimeout.
    setTimeout(function () { if (typeof _setupProfileSearch === 'function') _setupProfileSearch(); }, 100);
    setTimeout(function () { if (typeof window._initProfileMap === 'function') window._initProfileMap(); }, 300);

    // Populate now (snappy, no blank flash) então refresh from Firestore.
    if (typeof window._populateProfileModalFields === 'function') {
      window._populateProfileModalFields();
    }

    // Banner âmbar de loading enquanto profile faz refresh do Firestore.
    var _loadingBanner = null;
    if (!cu._profileLoaded) {
      _loadingBanner = document.createElement('div');
      _loadingBanner.id = 'profile-loading-banner';
      _loadingBanner.style.cssText = 'background:linear-gradient(90deg,rgba(251,191,36,0.18),rgba(251,191,36,0.08));border:1px solid rgba(251,191,36,0.35);border-radius:10px;padding:8px 14px;margin:10px 14px 0;display:flex;align-items:center;gap:10px;font-size:0.82rem;color:#fbbf24;font-weight:600;';
      _loadingBanner.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(251,191,36,0.35);border-top-color:#fbbf24;border-radius:50%;animation:spin 0.8s linear infinite;"></span><span>Carregando seu perfil…</span>';
      modalInner.insertBefore(_loadingBanner, modalInner.firstChild);
      if (!document.getElementById('_profile-loading-spin-style')) {
        var style = document.createElement('style');
        style.id = '_profile-loading-spin-style';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
    }

    if (window.AppStore && typeof window.AppStore.loadUserProfile === 'function' && cu.uid) {
      try {
        await window.AppStore.loadUserProfile(cu.uid);
        // Re-populate só se ainda na rota #profile.
        if (window.location.hash === '#profile') {
          window._populateProfileModalFields();
        }
      } catch (e) { window._warn('Profile refresh on open failed:', e); }
    }
    // Remove loading banner.
    if (_loadingBanner && _loadingBanner.parentNode) {
      _loadingBanner.parentNode.removeChild(_loadingBanner);
    }
    var _stuckBanner = document.getElementById('profile-loading-banner');
    if (_stuckBanner && _stuckBanner.parentNode) _stuckBanner.parentNode.removeChild(_stuckBanner);

    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  };

  // Update notification badge (immediate + periodic refresh every 30s)
  if (typeof _updateNotificationBadge === 'function') {
    _updateNotificationBadge();
    if (!window._notifBadgeInterval) {
      window._notifBadgeInterval = setInterval(function() {
        if (window.AppStore.currentUser && typeof _updateNotificationBadge === 'function') {
          _updateNotificationBadge();
        }
      }, 30000);
    }
  }

  // Recheck topbar wrap after profile button changed size
  if (typeof window._checkTopbarWrap === 'function') setTimeout(window._checkTopbarWrap, 100);

  // v0.17.42: viewMode/botão Visão removidos — permissões agora são per-torneio.
  window.AppStore.viewMode = 'organizer'; // legacy field, kept always 'organizer'

  // Close login modal — usar _forceCloseLoginModal (mais agressivo: classList
  // .remove + style.display='none' temporário) em vez de só classList.remove.
  // v1.0.12-beta: cobre relato "modal de login não some" — algum CSS ou
  // sobrecarga de styles pode estar mantendo o modal visível mesmo sem
  // .active. _forceCloseLoginModal força display:none por 50ms e depois
  // limpa, garantindo um "tick" de invisibilidade.
  if (typeof _forceCloseLoginModal === 'function') {
    _forceCloseLoginModal();
  } else {
    var modal = document.getElementById('modal-login');
    if (modal) modal.classList.remove('active');
  }

  // v0.17.78: gate de aceite de Termos + Privacy. Bloqueia o flow pós-login
  // (auto-enroll, casual rejoin, invite redirect) até que o usuário marque o
  // checkbox no modal de aceite. Sem aceite, dispara logout e aborta.
  // Compliance LGPD pra entrada na fase beta.
  //
  // v1.0.12-beta: usa existingProfile (retorno raw do firebase-db.loadUser
  // Profile) PRIMEIRO em vez de currentUser. Bug reportado: "termos
  // aparecem a cada novo login mesmo de usuários já cadastrados". Causa
  // mais provável: race entre store.js.loadUserProfile (que faz merge em
  // currentUser) e essa checagem — se o merge não completou, currentUser.
  // acceptedTerms ficava undefined mesmo com Firestore tendo true. Usar
  // existingProfile direto evita a etapa de merge.
  // Fallback pra currentUser caso existingProfile seja null (login pós-
  // migração legacy doc, race em load, etc.). Diagnóstico via console.
  var _termsCheckProfile = existingProfile || window.AppStore.currentUser;
  window._log('[scoreplace-auth v' + window.SCOREPLACE_VERSION + '] terms-gate check:', {
    existingProfile_exists: !!existingProfile,
    existingProfile_acceptedTerms: existingProfile && existingProfile.acceptedTerms,
    existingProfile_acceptedAt: existingProfile && existingProfile.acceptedTermsAt,
    existingProfile_version: existingProfile && existingProfile.acceptedTermsVersion,
    currentUser_acceptedTerms: window.AppStore.currentUser && window.AppStore.currentUser.acceptedTerms,
    currentUser_acceptedAt: window.AppStore.currentUser && window.AppStore.currentUser.acceptedTermsAt,
    currentUser_version: window.AppStore.currentUser && window.AppStore.currentUser.acceptedTermsVersion,
    needsAcceptance: typeof window._needsTermsAcceptance === 'function'
      ? window._needsTermsAcceptance(_termsCheckProfile)
      : '_needsTermsAcceptance-undefined'
  });
  // v1.0.52-beta: defensive re-fetch direto do Firestore antes de mostrar
  // modal. Bug reportado: "continua caindo nos termos quando relogamos
  // usuários cadastrados". Race possível: loadUserProfile retornou null
  // (network blip, cache stale) ou o doc carregado tinha campos faltando
  // por alguma migração legada. Antes de incomodar o user com modal,
  // tenta UMA leitura direta — se aparecer sinal de aceitação, pula o
  // modal e atualiza currentUser.
  if (typeof window._needsTermsAcceptance === 'function' &&
      window._needsTermsAcceptance(_termsCheckProfile)) {
    try {
      if (window.FirestoreDB && window.FirestoreDB.db && uid) {
        var freshDoc = await window.FirestoreDB.db.collection('users').doc(uid).get();
        if (freshDoc.exists) {
          var freshData = freshDoc.data();
          window._log('[terms-gate v1.0.53] re-fetch result:', {
            acceptedTerms: freshData.acceptedTerms,
            acceptedTermsAt: freshData.acceptedTermsAt,
            acceptedTermsVersion: freshData.acceptedTermsVersion,
            createdAt: freshData.createdAt,
            hasDisplayName: !!freshData.displayName,
            friendsCount: Array.isArray(freshData.friends) ? freshData.friends.length : 0
          });
          // Merge fresh data dentro do check profile
          if (!_termsCheckProfile) _termsCheckProfile = {};
          // Merge TUDO do freshData (não só acceptedTerms*) pra grandfather
          // logic poder inspecionar createdAt, displayName, friends, etc.
          Object.keys(freshData).forEach(function(k) {
            if (freshData[k] !== undefined) _termsCheckProfile[k] = freshData[k];
          });
          // Sincroniza currentUser também
          if (window.AppStore.currentUser) {
            ['acceptedTerms', 'acceptedTermsAt', 'acceptedTermsVersion'].forEach(function(k) {
              if (freshData[k] !== undefined) window.AppStore.currentUser[k] = freshData[k];
            });
          }
        } else {
          window._log('[terms-gate v1.0.53] re-fetch: doc não existe pra uid=' + uid);
        }
      }
    } catch (_freshErr) {
      window._warn('[terms-gate v1.0.53] re-fetch failed:', _freshErr && _freshErr.message);
    }
  }
  // v1.0.53-beta: GRANDFATHER de usuários existentes. Bug reportado por
  // múltiplas vezes: "continua caindo nos termos". Auditei toda a stack
  // (v1.0.49 lenient version, v1.0.52 round-trip + re-fetch + 4 sinais)
  // e ainda assim algum users empacam no modal. Causa-raiz definitiva:
  // antes da v1.0.52 o save da terms-acceptance.js podia ser silenciosamente
  // pulado (Firestore SDK não inicializado no momento do confirm). User
  // clicava Confirmar, modal fechava, mas Firestore nunca recebia a
  // gravação. Próximo login → mesma coisa. Loop infinito.
  //
  // Solução: se o doc tem evidência de uso passado da app (createdAt,
  // displayName preenchido, friends, sports preferidos, etc.), o user
  // OBVIAMENTE já passou pelo modal de termos em algum momento (impossível
  // ter usado o app sem isso) — apenas o save não persistiu o boolean.
  // Backfill automático de acceptedTerms=true em vez de incomodar pra
  // sempre. Compliance: o user JÁ aceitou em sessão passada — só estamos
  // gravando o registro que devia ter sido gravado. Marker
  // `acceptedTermsGrandfathered: true` pra analytics distinguir histórico.
  // Truly new users (doc inexistente OU doc só com {uid, email, displayName}
  // sem nenhum sinal de uso) ainda passam pelo modal normalmente.
  if (typeof window._needsTermsAcceptance === 'function' &&
      window._needsTermsAcceptance(_termsCheckProfile)) {
    var _profile = _termsCheckProfile || {};
    var _hasUsageEvidence = !!(
      _profile.createdAt ||
      _profile.updatedAt ||
      (Array.isArray(_profile.friends) && _profile.friends.length > 0) ||
      (Array.isArray(_profile.preferredSports) && _profile.preferredSports.length > 0) ||
      (Array.isArray(_profile.preferredLocations) && _profile.preferredLocations.length > 0) ||
      _profile.gender ||
      _profile.birthDate ||
      _profile.city ||
      _profile.phone ||
      (_profile.theme && _profile.theme !== 'dark') ||
      _profile.acceptFriendRequests !== undefined ||
      _profile.notifyLevel ||
      _profile.plan
    );
    // v1.0.61-beta: Firebase Auth metadata também conta como evidência —
    // se lastSignInTime > creationTime + 60s, o user já logou antes (PROVA
    // do auth provider, independe de ler o doc no Firestore). Cobre o caso
    // raro em que retries de loadUserProfile esgotaram mas o user é
    // demonstravelmente returning.
    if (!_hasUsageEvidence) {
      try {
        var _fbu2 = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) || user;
        if (_fbu2 && _fbu2.metadata && _fbu2.metadata.creationTime && _fbu2.metadata.lastSignInTime) {
          var _c2 = new Date(_fbu2.metadata.creationTime).getTime();
          var _s2 = new Date(_fbu2.metadata.lastSignInTime).getTime();
          if ((_s2 - _c2) > 60000) {
            _hasUsageEvidence = true;
            window._log('[terms-gate v1.0.61] grandfather via Firebase Auth metadata (returning user, lastSignIn-creation=' + Math.round((_s2-_c2)/60000) + 'min)');
          }
        }
      } catch (_fbErr) {}
    }
    window._log('[terms-gate v1.0.53] grandfather check — hasUsageEvidence:', _hasUsageEvidence,
      'fields present:', Object.keys(_profile).sort().slice(0, 20).join(','));
    if (_hasUsageEvidence && window.FirestoreDB && window.FirestoreDB.db && uid) {
      try {
        var _grandfatherPayload = {
          acceptedTerms: true,
          acceptedTermsAt: new Date().toISOString(),
          acceptedTermsVersion: window._CURRENT_TERMS_VERSION,
          acceptedTermsGrandfathered: true
        };
        await window.FirestoreDB.db.collection('users').doc(uid).set(_grandfatherPayload, { merge: true });
        // Sincroniza estado local
        Object.assign(_termsCheckProfile, _grandfatherPayload);
        if (window.AppStore.currentUser) Object.assign(window.AppStore.currentUser, _grandfatherPayload);
        window._log('[terms-gate v1.0.53] grandfathered existing user — modal SKIPPED');
      } catch (_gfErr) {
        window._warn('[terms-gate v1.0.53] grandfather save failed:', _gfErr && _gfErr.message);
      }
    }
  }
  if (typeof window._needsTermsAcceptance === 'function' &&
      window._needsTermsAcceptance(_termsCheckProfile)) {
    window._log('[terms-gate v1.0.53] showing modal — no acceptance signal AND no usage evidence (truly new user)');
    var accepted = await window._showTermsAcceptanceModal();
    if (!accepted) {
      window._log('[scoreplace-auth] Terms not accepted — logging out');
      window._simulateLoginInProgress = false;
      if (typeof handleLogout === 'function') handleLogout();
      return;
    }
    window._log('[scoreplace-auth] Terms accepted, version=' + window._CURRENT_TERMS_VERSION);
  }

  // Auto-enroll if there was a pending enrollment
  var pendingEnrollId = window._pendingEnrollTournamentId || null;
  try {
    if (!pendingEnrollId) pendingEnrollId = sessionStorage.getItem('_pendingEnrollTournamentId');
  } catch(e) {}

  // Extrair ?ref= do hash (quem convidou)
  var _inviteRefUid = null;
  try {
    var _hashFull = window.location.hash || '';
    var _refMatch = _hashFull.match(/[?&]ref=([^&]+)/);
    if (_refMatch) _inviteRefUid = decodeURIComponent(_refMatch[1]);
    // Também checar sessionStorage (salvo pelo router)
    if (!_inviteRefUid) _inviteRefUid = sessionStorage.getItem('_inviteRefUid');
  } catch(e) {}

  if (pendingEnrollId) {
    window._pendingEnrollTournamentId = null;
    try { sessionStorage.removeItem('_pendingEnrollTournamentId'); } catch(e) {}

    // Wait for tournaments to be loaded, then enroll
    var _enrollAttempts = 0;
    var _tryAutoEnroll = function() {
      _enrollAttempts++;
      var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(pendingEnrollId); });
      if (!t && _enrollAttempts < 20) {
        // Tournaments not loaded yet, retry
        setTimeout(_tryAutoEnroll, 300);
        return;
      }
      if (t && window.AppStore.currentUser) {
        // Block auto-enrollment if enrollments are closed
        var _isLigaFmt = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
        var _ligaOpenEnroll = _isLigaFmt && t.ligaOpenEnrollment;
        var _sorteioFeito = (Array.isArray(t.matches) && t.matches.length > 0) ||
                            (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                            (Array.isArray(t.groups) && t.groups.length > 0);
        var _canEnroll = (t.status !== 'closed' && t.status !== 'finished' && !_sorteioFeito) || _ligaOpenEnroll;
        if (!_canEnroll) {
          // Enrollments closed — just navigate to tournament without enrolling
          if (typeof showNotification === 'function') {
            showNotification(_t('auth.enrollClosed'), _t('auth.enrollClosedMsg'), 'warning');
          }
          window.location.hash = '#tournaments/' + pendingEnrollId;
          if (typeof initRouter === 'function') initRouter();
          window._simulateLoginInProgress = false;
          return;
        }

        var _u = window.AppStore.currentUser;
        var participantObj = { name: _u.displayName, email: _u.email, displayName: _u.displayName };

        // Include gender if available (needed for category auto-assignment)
        if (_u.gender) participantObj.gender = _u.gender;

        // Auto-assign categories if tournament has them and user has gender
        var hasCats = (t.combinedCategories && t.combinedCategories.length > 0) ||
                      (t.genderCategories && t.genderCategories.length > 0) ||
                      (t.skillCategories && t.skillCategories.length > 0);
        if (hasCats && _u.gender && typeof window._userGenderToCatCodes === 'function') {
          var genderCodes = window._userGenderToCatCodes(_u.gender);
          var genderLabels = { fem: _t('auth.genderFem'), masc: _t('auth.genderMasc'), misto_aleatorio: _t('auth.genderMistoAl'), misto_obrigatorio: _t('auth.genderMistoOb') };
          var combined = t.combinedCategories || [];
          var genderCats = t.genderCategories || [];
          var skillCats = t.skillCategories || [];
          var eligible = [];
          if (combined.length > 0) {
            combined.forEach(function(c) {
              var matchesGender = genderCodes.some(function(gc) {
                return c.toLowerCase().startsWith((genderLabels[gc] || gc).toLowerCase());
              });
              if (matchesGender) eligible.push(c);
            });
          } else if (genderCats.length > 0 && skillCats.length === 0) {
            genderCats.forEach(function(gc) {
              if (genderCodes.indexOf(gc) !== -1) eligible.push(genderLabels[gc] || gc);
            });
          } else if (skillCats.length > 0 && genderCats.length === 0) {
            eligible = skillCats.slice();
          }
          if (eligible.length > 0 && typeof window._groupEligibleCategories === 'function') {
            var groups = window._groupEligibleCategories(eligible);
            var autoCategories = [];
            if (groups.exclusive.length === 1) autoCategories.push(groups.exclusive[0]);
            autoCategories = autoCategories.concat(groups.nonExclusive);
            if (autoCategories.length > 0) {
              participantObj.categories = autoCategories;
              participantObj.category = autoCategories[0];
              participantObj.categorySource = 'perfil';
            }
          }
        }

        // Use atomic Firestore transaction to prevent race conditions
        if (window.FirestoreDB && window.FirestoreDB.enrollParticipant) {
          window.FirestoreDB.enrollParticipant(pendingEnrollId, participantObj).then(function(result) {
            if (result.enrollmentClosed) {
              if (typeof showNotification === 'function') showNotification(_t('auth.enrollClosed'), _t('auth.enrollClosedMsg'), 'warning');
              window.location.hash = '#tournaments/' + pendingEnrollId;
              if (typeof initRouter === 'function') initRouter();
              return;
            }
            if (result.alreadyEnrolled) return;
            t.participants = result.participants;
            var catMsg = participantObj.categories ? ' na categoria ' + (typeof window._displayCategoryName === 'function' ? window._displayCategoryName(participantObj.categories[0]) : participantObj.categories[0]) : '';
            if (typeof showNotification !== 'undefined') {
              showNotification(_t('auth.enrolled'), _t('auth.enrolledMsg', {name: t.name, cat: catMsg}), 'success');
            }
            // Auto-amizade: apenas com quem convidou (ref no link)
            if (_inviteRefUid) {
              _autoFriendOnInvite(_inviteRefUid, window.AppStore.currentUser);
              try { sessionStorage.removeItem('_inviteRefUid'); } catch(e) {}
            }
            // Notify organizer about new enrollment
            if (t.organizerEmail && t.organizerEmail !== _u.email && typeof window._resolveOrganizerUid === 'function') {
              window._resolveOrganizerUid(t).then(function(orgUid) {
                if (orgUid && typeof window._sendUserNotification === 'function') {
                  window._sendUserNotification(orgUid, {
                    type: 'enrollment_new',
                    message: _t('auth.participantEnrolledMsg', {name: _u.displayName || _t('auth.someParticipant'), tournament: t.name}),
                    tournamentId: String(t.id),
                    tournamentName: t.name || '',
                    level: 'all'
                  });
                }
              }).catch(function(e) { window._warn('Notify organizer error:', e); });
            }
            // Navigate to tournament details after enrollment
            window.location.hash = '#tournaments/' + pendingEnrollId;
            if (typeof initRouter === 'function') initRouter();
          }).catch(function(err) {
            window._warn('Auto-enroll transaction error:', err);
          });
        } else {
          // Fallback: navigate to tournament page
          window.location.hash = '#tournaments/' + pendingEnrollId;
          if (typeof initRouter === 'function') initRouter();
        }
      } else {
        // Tournament not found after retries — navigate and warn user
        window.location.hash = '#tournaments/' + pendingEnrollId;
        if (typeof initRouter === 'function') initRouter();
        if (_enrollAttempts >= 20 && typeof showNotification === 'function') {
          showNotification(_t('auth.enrollPending'), _t('auth.enrollPendingMsg'), 'warning');
        }
      }
      // Clear flag after auto-enroll attempt completes (success or fallback)
      window._simulateLoginInProgress = false;
    };
    setTimeout(_tryAutoEnroll, 300);
    return;
  }

  // Auto-rejoin pending casual match room (user came in via #casual/XXX while logged out)
  var pendingCasualRoom = null;
  try { pendingCasualRoom = sessionStorage.getItem('_pendingCasualRoom'); } catch(e) {}
  if (pendingCasualRoom) {
    try { sessionStorage.removeItem('_pendingCasualRoom'); } catch(e) {}
    window.location.hash = '#casual/' + pendingCasualRoom;
    if (typeof initRouter === 'function') initRouter();
    window._simulateLoginInProgress = false;
    return;
  }

  // Redirect to pending invite tournament if there was one
  if (window._pendingInviteHash) {
    var dest = window._pendingInviteHash;
    window._pendingInviteHash = null;
    window.location.hash = dest;
  }

  // Show/hide Pro upgrade button based on plan
  var proBtn = document.getElementById('btn-upgrade-pro');
  if (proBtn) {
    proBtn.style.display = window._isPro() ? 'none' : 'flex';
  }

  // Initialize router to load appropriate views
  if (typeof initRouter === 'function') initRouter();

  } catch (loginErr) {
    // v0.17.85: catch + finally garantem que o guard nunca fica stuck.
    // Captura no Sentry mas não rethrow — login parcial é melhor que login zero.
    window._error('[scoreplace-auth] simulateLoginSuccess body error:', loginErr);
    if (typeof window._captureException === 'function') {
      window._captureException(loginErr, { area: 'simulateLoginSuccess', uid: user && user.uid });
    }
  } finally {
    window._simulateLoginInProgress = false;
    window._simulateLoginInProgressAt = 0;
  }
}

// v0.17.85: helper público pra resetar o guard manualmente. Chamar antes de
// disparar nova tentativa de login se desconfia que o guard ficou preso.
window._resetLoginGuard = function() {
  window._simulateLoginInProgress = false;
  window._simulateLoginInProgressAt = 0;
};

function setupLoginModal() {
  if (!document.getElementById('modal-login')) {
    var modalHtml = '<div class="modal-overlay" id="modal-login">' +
      '<div class="modal" style="max-width: 420px;">' +
        '<div class="modal-header">' +
          '<h2 class="card-title">Entrar no scoreplace.app</h2>' +
          '<button class="modal-close" onclick="document.getElementById(\'modal-login\').classList.remove(\'active\')">&times;</button>' +
        '</div>' +
        '<div class="modal-body">' +

          // --- 1. Entrar com 1 clique (email mágico OU SMS — campo único) ---
          // v1.0.22-beta: feedback do user — ter 2 campos (Link Mágico e SMS)
          // com 2 botões "Enviar" estava confundindo. Botão verde do SMS
          // parecia mais destacado que o transparente do magic link, induzindo
          // escolha errada. Agora um único input detecta automaticamente:
          //   - tem '@' → email magic link
          //   - 8-15 dígitos → SMS
          //   - ambíguo → erro
          // O DDI dropdown só aparece quando phone detectado. Hidden inputs
          // delegam pros handlers existentes (handleEmailLinkLogin /
          // handlePhoneLogin) sem duplicar lógica.
          '<div id="login-unified-step" style="margin-bottom:4px;background:rgba(6,182,212,0.07);border:1px solid rgba(6,182,212,0.22);border-radius:12px;padding:14px 14px 10px 14px;transition:opacity 0.2s;">' +
            '<div style="margin-bottom:10px;">' +
              '<div style="font-size:0.9rem;font-weight:700;color:#22d3ee;line-height:1.3;">✉️📱 Entrar com 1 clique</div>' +
              '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">(seu@email.com  ou  11 9999-8888)</div>' +
            '</div>' +
            '<form novalidate onsubmit="event.preventDefault(); handleUnifiedLogin();">' +
              // v1.0.31-beta: DDI volta a ser oculto no estado inicial (UX
              // da v1.0.27-beta). User clarificou: "ja aparecer direto a
              // bandeira e o +55 induz o usuário a achar que apenas um
              // telefone pode ser colocado ali no campo (quando um email
              // tambem é permitido)". O DDI só aparece quando o usuário
              // começa a digitar dígitos (modo phone detectado por
              // _detectLoginInputMode). Antes da digitação, o campo é
              // neutro — placeholder mostra os dois formatos possíveis.
              '<div id="login-unified-row" style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;">' +
                '<select id="login-unified-country" aria-label="DDI do telefone" class="form-control" style="display:none;width:auto;min-width:0;font-size:0.82rem;padding:8px 6px;">' +
                  (typeof _phoneCountries !== 'undefined' ? _phoneCountries.map(function(c) {
                    return '<option value="' + c.code + '"' + (c.code === '55' ? ' selected' : '') + '>' + c.flag + ' +' + c.code + '</option>';
                  }).join('') : '<option value="55">🇧🇷 +55</option>') +
                '</select>' +
                '<input type="text" id="login-unified" class="form-control" placeholder="seu@email.com  ou  11 99999-8888" required autocomplete="off" oninput="window._detectLoginInputMode && window._detectLoginInputMode()" style="width:100%;min-width:0;box-sizing:border-box;font-size:0.92rem;padding:11px 12px;">' +
                '<button type="submit" id="btn-enviar-magic" class="btn btn-primary" style="font-size:0.82rem;white-space:nowrap;padding:9px 16px;font-weight:700;width:auto;justify-self:end;transition:background 0.2s,border-color 0.2s;">Enviar</button>' +
              '</div>' +
              '<div id="login-unified-helper" style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;line-height:1.4;">' +
                'Aceita <b>e-mail</b> (recebe link mágico) ou <b>celular com DDD</b> (recebe SMS com código). Pra celular, o seletor de país aparece automaticamente — padrão 🇧🇷 +55.' +
              '</div>' +
            '</form>' +
            // Hidden inputs — handlers existentes leem destes IDs.
            '<input type="hidden" id="login-email-link">' +
            '<input type="hidden" id="login-phone">' +
            '<input type="hidden" id="login-phone-country" value="55">' +
          '</div>' +

          // SMS code verification step (mostrado só após handlePhoneLogin enviar SMS)
          '<div id="phone-step-code" style="display:none;margin-bottom:4px;">' +
            '<div style="font-size:0.78rem;font-weight:600;color:var(--text-bright);margin-bottom:6px;">📱 Confirme o código</div>' +
            '<p style="color:var(--text-muted);font-size:0.78rem;margin-bottom:6px;">Digite o código de 6 dígitos recebido por SMS — ou clique no link que chegou no <strong>WhatsApp</strong> para entrar direto:</p>' +
            // v1.0.27-beta: grid 1fr auto pra distribuição determinística —
            // input toma todo o espaço, botão Verificar só seu conteúdo.
            '<form onsubmit="event.preventDefault(); handlePhoneVerifyCode();">' +
              '<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;">' +
                '<input type="text" id="login-phone-code" class="form-control" placeholder="123456" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" style="width:100%;min-width:0;box-sizing:border-box;text-align:center;font-size:1.1rem;letter-spacing:6px;font-weight:700;">' +
                '<button type="submit" class="btn btn-success" style="font-size:0.78rem;white-space:nowrap;padding:9px 14px;width:auto;justify-self:end;">Verificar</button>' +
              '</div>' +
            '</form>' +
            '<div id="phone-step-wa-status" style="text-align:center;margin-top:4px;min-height:1em;"></div>' +
            '<div style="text-align:center;margin-top:4px;">' +
              '<a href="#" onclick="event.preventDefault();_resetPhoneLoginUI();handlePhoneLogin();" style="color:var(--text-muted);font-size:0.72rem;">Reenviar</a>' +
              '<span style="color:var(--text-muted);font-size:0.72rem;margin:0 6px;">|</span>' +
              '<a href="#" onclick="event.preventDefault();_resetPhoneLoginUI();" style="color:var(--text-muted);font-size:0.72rem;">Voltar</a>' +
            '</div>' +
          '</div>' +
          '<div id="recaptcha-container"></div>' +
          '<div id="login-panel-emaillink" style="display:none;"></div>' +
          '<div id="login-panel-phone" style="display:none;"></div>' +

          // --- Divider ---
          '<div style="display:flex;align-items:center;gap:12px;margin:14px 0;">' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
            '<span style="color:var(--text-muted);font-size:1rem;font-weight:700;letter-spacing:1px;">ou</span>' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
          '</div>' +

          // --- 3. E-mail e Senha ---
          '<div id="login-block-email" style="margin-bottom:4px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:14px 14px 10px 14px;transition:opacity 0.2s;">' +
            '<div style="font-size:0.9rem;font-weight:700;color:#a5b4fc;margin-bottom:8px;">🔑 E-mail e Senha</div>' +
            '<div id="email-login-mode" style="display:block;">' +
              '<form id="form-login" novalidate onsubmit="event.preventDefault(); handleEmailLogin();">' +
                '<div style="margin-bottom:8px;">' +
                  '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:3px;">E-mail <span style="font-style:italic;font-size:0.72rem;">(seu@email.com)</span></div>' +
                  '<input type="email" id="login-email" class="form-control" placeholder="seu@email.com" required autocomplete="email" style="font-size:0.88rem;" oninput="window._updateEmailSenhaValidity && window._updateEmailSenhaValidity()">' +
                '</div>' +
                '<div style="margin-bottom:8px;">' +
                  '<div id="login-senha-label" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:3px;font-weight:400;transition:color 0.2s;">Senha</div>' +
                  '<input type="password" id="login-password" class="form-control" placeholder="" required minlength="6" autocomplete="current-password" style="font-size:0.88rem;" oninput="window._updateEmailSenhaValidity && window._updateEmailSenhaValidity()">' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">' +
                  '<button type="submit" id="btn-email-entrar" class="btn btn-secondary" style="font-size:0.85rem;white-space:nowrap;padding:8px 16px;transition:background 0.2s,border-color 0.2s,color 0.2s;">Entrar</button>' +
                '</div>' +
              '</form>' +
              '<div style="text-align:center;margin-top:10px;font-size:0.88rem;">' +
                '<a href="#" onclick="event.preventDefault();toggleEmailMode(\'register\')" style="color:var(--primary-color);font-weight:700;">Criar conta</a>' +
                '<span style="color:var(--text-muted);margin:0 8px;">|</span>' +
                '<a href="#" onclick="event.preventDefault();handlePasswordReset()" style="color:var(--text-muted);font-weight:500;">Esqueci a senha</a>' +
              '</div>' +
            '</div>' +
            '<div id="email-register-mode" style="display:none;">' +
              '<form id="form-register" novalidate onsubmit="event.preventDefault(); handleEmailRegister();">' +
                '<div style="margin-bottom:6px;">' +
                  '<input type="text" id="register-name" class="form-control" placeholder="Seu nome" required style="font-size:0.88rem;" oninput="window._loginMutualExclude && window._loginMutualExclude()">' +
                '</div>' +
                '<div style="margin-bottom:6px;">' +
                  '<input type="email" id="register-email" class="form-control" placeholder="seu@email.com" required style="font-size:0.88rem;" oninput="window._loginMutualExclude && window._loginMutualExclude()">' +
                '</div>' +
                '<div style="margin-bottom:6px;">' +
                  '<input type="password" id="register-password" class="form-control" placeholder="Senha (mín. 6)" required minlength="6" style="font-size:0.88rem;" oninput="window._loginMutualExclude && window._loginMutualExclude()">' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">' +
                  '<button type="submit" class="btn btn-primary" style="font-size:0.8rem;white-space:nowrap;padding:8px 14px;">Criar Conta</button>' +
                '</div>' +
              '</form>' +
              '<div style="text-align:center;margin-top:6px;">' +
                '<a href="#" onclick="event.preventDefault();toggleEmailMode(\'login\')" style="color:var(--primary-color);font-size:0.75rem;font-weight:600;">Ja tem conta? Entrar</a>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="login-panel-email" style="display:none;"></div>' +

          // --- Divider ---
          '<div style="display:flex;align-items:center;gap:12px;margin:14px 0;">' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
            '<span style="color:var(--text-muted);font-size:1rem;font-weight:700;letter-spacing:1px;">ou</span>' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
          '</div>' +

          // --- 4. Google ---
          '<div style="margin-bottom:4px;">' +
            '<button type="button" class="btn hover-lift btn-block" onclick="handleGoogleLogin()" style="background:#fff;color:#333;border:1px solid #ddd;padding:12px 16px;font-size:0.88rem;font-weight:600;">' +
              '<svg width="18" height="18" viewBox="0 0 48 48" style="vertical-align:middle;margin-right:8px;"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.77.9 7.34 2.44 10.5l8.09-5.91z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
              _t('auth.signInGoogle') +
            '</button>' +
          '</div>' +
          '<div id="login-panel-google" style="display:none;"></div>' +

          // Hidden containers for backward compat
          '<div id="login-panel-social" style="display:none;"></div>' +
          '<div id="login-tabs" style="display:none;"></div>' +

          // v0.17.72: aceite implícito de Termos+Privacy (LGPD-ready alpha→beta).
          // Texto pequeno embaixo do bloco de login: ao escolher qualquer
          // método (link mágico, SMS, email, Google), usuário implicitamente
          // aceita os termos. Conformidade legal mínima sem modal extra.
          '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-color);font-size:0.7rem;color:var(--text-muted);text-align:center;line-height:1.5;">' +
            'Ao continuar, você concorda com os <a href="#terms" onclick="document.getElementById(\'modal-login\').classList.remove(\'active\')" style="color:var(--primary-color);">Termos de Uso</a> e a <a href="#privacy" onclick="document.getElementById(\'modal-login\').classList.remove(\'active\')" style="color:var(--primary-color);">Política de Privacidade</a>.' +
          '</div>' +

        '</div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(createInteractiveElement(modalHtml));
  }

  var btnLogin = document.getElementById('btn-login');
  if (btnLogin) {
    btnLogin.addEventListener('click', function() {
      openModal('modal-login');
      // v0.17.84/v1.0.22-beta: restaura último DDI escolhido pra reabrir o
      // modal já com o país correto selecionado. Aplica em ambos os selects
      // (visível login-unified-country + hidden login-phone-country que o
      // handler real lê).
      try {
        var saved = localStorage.getItem('scoreplace_loginPhoneCountry');
        var selVisible = document.getElementById('login-unified-country');
        var selHidden = document.getElementById('login-phone-country');
        if (saved) {
          if (selVisible) selVisible.value = saved;
          if (selHidden) selHidden.value = saved;
        }
      } catch(_e) {}
    });
  }
}

function handleLogout() {
  // Flag this as a manual logout so onAuthStateChanged(null) commits immediately
  // rather than waiting for the grace period (that grace period exists to absorb
  // Safari's transient null auth events, not intentional user logouts).
  window._manualLogoutInProgress = true;
  // Sign out from Firebase
  if (firebase && firebase.auth) {
    firebase.auth().signOut().catch(function(error) {
      window._error('Firebase sign out error:', error);
    }).finally(function() {
      // Clear flag shortly after so future transient nulls are debounced again
      setTimeout(function() { window._manualLogoutInProgress = false; }, 3000);
    });
  }

  // v0.17.94: limpar authCache do localStorage IMEDIATAMENTE.
  // Antes só era removido em _commitSignOut do listener Firebase, criando
  // janela onde currentUser=null + scoreplace_authCache ainda presente.
  // Router lia esse estado e mostrava "⏳ Carregando..." sem nunca sair —
  // condition em router.js:147 era `!loggedIn && hasCache`. Bug reportado:
  // "ao logoff, fica preso na tela de Carregando, era pra mostrar landing."
  try { localStorage.removeItem('scoreplace_authCache'); } catch(e) {}

  // Stop real-time listener and clear AppStore state
  if (window.AppStore.stopRealtimeListener) window.AppStore.stopRealtimeListener();
  window.AppStore.currentUser = null;
  window.AppStore.tournaments = [];
  window.AppStore.viewMode = 'participant';

  // Update topbar button to show Login button
  var btnLogin = document.getElementById('btn-login');
  if (btnLogin) {
    btnLogin.innerHTML = 'Login';
    btnLogin.className = 'btn btn-outline';
    btnLogin.style = 'font-size: 0.82rem; padding: 0 16px; height: 38px;';
    // Inline onclick survives cloneNode(true) into the hamburger dropdown.
    btnLogin.setAttribute('onclick', "if(typeof window._closeHamburger==='function')window._closeHamburger(); if(typeof openModal==='function')openModal('modal-login');");
  }

  // Close profile modal if open
  var modalProfile = document.getElementById('modal-profile');
  if (modalProfile) modalProfile.classList.remove('active');

  // Update view mode visibility
  if (typeof window.updateViewModeVisibility === 'function') {
    window.updateViewModeVisibility();
  }

  // Show notification and reinitialize router
  showNotification(_t('auth.loggedOut'), _t('auth.loggedOutMsg'), 'info');
  // v1.6.10-beta: navegar sempre para a landing ao fazer logoff,
  // independente da rota em que o usuário estava (#profile, #tournaments/xyz etc).
  // Sem isso, initRouter processa o hash atual e pode renderizar uma view
  // que não tem guard de autenticação, ou ficar em estado indefinido.
  window.location.hash = '';
  if (typeof initRouter === 'function') initRouter();
}

// === Excluir conta ===
window._confirmDeleteAccount = function() {
  var user = window.AppStore.currentUser;
  if (!user) return;

  // First confirmation
  var overlay = document.createElement('div');
  overlay.id = 'modal-delete-account';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100001;';
  overlay.innerHTML =
    '<div style="background:var(--surface-color);border:1px solid var(--border-color);border-radius:16px;max-width:400px;width:92%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:1.2rem;text-align:center;">' +
        '<div style="font-size:2rem;margin-bottom:0.2rem;">⚠️</div>' +
        '<div style="font-size:1.1rem;font-weight:800;color:#fff;">Excluir conta</div>' +
      '</div>' +
      '<div style="padding:1.5rem;text-align:center;">' +
        '<p style="color:var(--text-color);font-size:0.9rem;margin-bottom:0.8rem;line-height:1.6;font-weight:600;">Tem certeza que deseja excluir sua conta?</p>' +
        '<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:1.2rem;line-height:1.5;">Esta ação é <strong style="color:#ef4444;">irreversível</strong>. Todos os seus dados serão apagados permanentemente:</p>' +
        '<ul style="text-align:left;color:var(--text-muted);font-size:0.8rem;margin-bottom:1.2rem;padding-left:1.2rem;line-height:1.8;">' +
          '<li>Seu perfil e preferências</li>' +
          '<li>Suas notificações</li>' +
          '<li>Suas inscrições em torneios</li>' +
          '<li>Torneios que você organizou</li>' +
        '</ul>' +
        '<p style="color:var(--text-muted);font-size:0.78rem;margin-bottom:1rem;">Digite <strong style="color:#ef4444;">EXCLUIR</strong> para confirmar:</p>' +
        '<input type="text" id="delete-account-confirm-input" placeholder="Digite EXCLUIR" style="width:100%;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-dark);color:var(--text-color);font-size:0.9rem;text-align:center;margin-bottom:1rem;box-sizing:border-box;" />' +
        '<div style="display:flex;gap:10px;">' +
          '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'modal-delete-account\').remove()" style="flex:1;">Cancelar</button>' +
          '<button class="btn btn-danger btn-sm" id="btn-confirm-delete-account" onclick="window._executeDeleteAccount()" style="flex:1;opacity:0.4;pointer-events:none;">Excluir Conta</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  // Enable button only when user types EXCLUIR
  var input = document.getElementById('delete-account-confirm-input');
  var btn = document.getElementById('btn-confirm-delete-account');
  if (input && btn) {
    input.addEventListener('input', function() {
      var match = input.value.trim().toUpperCase() === 'EXCLUIR';
      btn.style.opacity = match ? '1' : '0.4';
      btn.style.pointerEvents = match ? 'auto' : 'none';
    });
    input.focus();
  }
};

window._executeDeleteAccount = async function() {
  var user = window.AppStore.currentUser;
  var firebaseUser = firebase.auth().currentUser;
  if (!user || !firebaseUser) return;

  var uid = user.uid || firebaseUser.uid;
  var email = user.email || firebaseUser.email;
  var db = window.FirestoreDB.db;

  // Show loading state
  var btn = document.getElementById('btn-confirm-delete-account');
  if (btn) { btn.textContent = _t('auth.verifying'); btn.style.pointerEvents = 'none'; btn.style.opacity = '0.6'; }

  try {
    // 1. Delete all user data first, then delete auth account
    if (btn) btn.textContent = _t('auth.deletingData');

    // 2a. Delete user notifications subcollection
    try {
      var notifsSnap = await db.collection('users').doc(uid).collection('notifications').get();
      var batch = db.batch();
      var count = 0;
      notifsSnap.forEach(function(doc) {
        batch.delete(doc.ref);
        count++;
        if (count >= 450) {
          batch.commit();
          batch = db.batch();
          count = 0;
        }
      });
      if (count > 0) await batch.commit();
    } catch (e) { window._warn('Erro ao excluir notificações:', e); }

    // 2b. Remove user from tournament participants
    try {
      var tournsSnap = await db.collection('tournaments').get();
      var tBatch = db.batch();
      var tCount = 0;
      tournsSnap.forEach(function(doc) {
        var data = doc.data();
        var participants = data.participants || [];
        var filtered = participants.filter(function(p) {
          return p.email !== email && p.uid !== uid;
        });
        if (filtered.length !== participants.length) {
          tBatch.update(doc.ref, { participants: filtered });
          tCount++;
        }
        if (tCount >= 450) {
          tBatch.commit();
          tBatch = db.batch();
          tCount = 0;
        }
      });
      if (tCount > 0) await tBatch.commit();
    } catch (e) { window._warn('Erro ao remover inscrições:', e); }

    // 2c. Delete tournaments organized by this user
    try {
      var myTournsSnap = await db.collection('tournaments').where('organizerEmail', '==', email).get();
      var dBatch = db.batch();
      var dCount = 0;
      myTournsSnap.forEach(function(doc) {
        dBatch.delete(doc.ref);
        dCount++;
      });
      if (dCount > 0) await dBatch.commit();
    } catch (e) { window._warn('Erro ao excluir torneios:', e); }

    // 2d. Delete user profile document
    try {
      await db.collection('users').doc(uid).delete();
    } catch (e) { window._warn('Erro ao excluir perfil:', e); }

    // 3. Delete Firebase Auth account — best effort, no re-auth popup
    try {
      await firebaseUser.delete();
    } catch (e) {
      // If requires-recent-login, just sign out — all data is already gone
      // Firebase will clean up orphaned auth accounts
      window._warn('Auth delete:', e.code || e.message);
      try { await firebase.auth().signOut(); } catch (so) {}
    }

    // 4. Clean up local state
    if (window.AppStore.stopRealtimeListener) window.AppStore.stopRealtimeListener();
    window.AppStore.currentUser = null;
    window.AppStore.tournaments = [];
    window.AppStore.viewMode = 'participant';
    // v1.0.6-beta: limpar localStorage de auth/cache pra evitar loop "Carregando..."
    // Bug reportado: após excluir conta, router via `currentUser=null` (loggedIn=false)
    // mas `scoreplace_authCache` ainda presente (loggedIn=false + hasCache=true) →
    // router caía no branch da tennis ball "Carregando..." esperando auth resolver
    // que nunca vai resolver porque a conta foi excluída. Limpando o cache, router
    // vê (loggedIn=false + hasCache=false) → renderLanding() → usuário volta pra
    // landing page, comportamento correto.
    var _toCleanup = [
      'scoreplace_authCache',
      'scoreplace_fcm_dismissed',
      'scoreplace_deleted_ids',
      'scoreplace_casual_history',
      'scoreplace_casual_history_v2',
      'scoreplace_casual_last',
      'scoreplace_casual_prefs',
      'scoreplace_analytics_open'
    ];
    _toCleanup.forEach(function(k) { try { localStorage.removeItem(k); } catch (_e) {} });
    // Apagar IndexedDB do Firebase Auth também (evita auto-restore da sessão Google
    // antiga; sem isso, Firebase Auth lembra da conta apesar do delete).
    try {
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        indexedDB.databases().then(function (dbs) {
          (dbs || []).forEach(function (db) {
            if (db.name && /firebase|firestore|firebaseauth/i.test(db.name)) {
              try { indexedDB.deleteDatabase(db.name); } catch (_e) {}
            }
          });
        }).catch(function () {});
      }
    } catch (_e) {}

    // 5. Close modals and update UI
    var modal = document.getElementById('modal-delete-account');
    if (modal) modal.remove();
    var profileModal = document.getElementById('modal-profile');
    if (profileModal) profileModal.classList.remove('active');

    var btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
      btnLogin.innerHTML = 'Login';
      btnLogin.className = 'btn btn-outline';
      btnLogin.style = 'font-size: 0.82rem; padding: 0 16px; height: 38px;';
      btnLogin.setAttribute('onclick', "if(typeof window._closeHamburger==='function')window._closeHamburger(); if(typeof openModal==='function')openModal('modal-login');");
    }

    var proBtn = document.getElementById('btn-upgrade-pro');
    if (proBtn) proBtn.style.display = 'none';

    showNotification(_t('auth.accountDeleted'), _t('auth.accountDeletedMsg'), 'info');
    window.location.hash = '#dashboard';
    if (typeof initRouter === 'function') initRouter();

  } catch (err) {
    window._error('Erro ao excluir conta:', err);
    showNotification(_t('auth.error'), _t('auth.deleteErrorMsg'), 'error');
    if (btn) { btn.textContent = _t('auth.deleteAccountBtn'); btn.style.pointerEvents = 'auto'; btn.style.opacity = '1'; }
  }
};

// === Helpers para máscara de telefone ===
var _phoneCountries = [
  { code: '55', flag: '\uD83C\uDDE7\uD83C\uDDF7', name: 'Brasil', mask: '(##) #####-####' },
  { code: '1', flag: '\uD83C\uDDFA\uD83C\uDDF8', name: 'EUA', mask: '(###) ###-####' },
  { code: '351', flag: '\uD83C\uDDF5\uD83C\uDDF9', name: 'Portugal', mask: '### ### ###' },
  { code: '54', flag: '\uD83C\uDDE6\uD83C\uDDF7', name: 'Argentina', mask: '## ####-####' },
  { code: '598', flag: '\uD83C\uDDFA\uD83C\uDDFE', name: 'Uruguai', mask: '## ### ###' },
  { code: '595', flag: '\uD83C\uDDF5\uD83C\uDDFE', name: 'Paraguai', mask: '### ### ###' },
  { code: '56', flag: '\uD83C\uDDE8\uD83C\uDDF1', name: 'Chile', mask: '# #### ####' },
  { code: '57', flag: '\uD83C\uDDE8\uD83C\uDDF4', name: 'Colômbia', mask: '### ### ####' },
  { code: '34', flag: '\uD83C\uDDEA\uD83C\uDDF8', name: 'Espanha', mask: '### ## ## ##' },
  { code: '44', flag: '\uD83C\uDDEC\uD83C\uDDE7', name: 'UK', mask: '#### ### ####' }
];

function _formatPhoneDisplay(digits, countryCode) {
  var country = _phoneCountries.find(function(c) { return c.code === countryCode; });
  if (!country || !digits) return digits || '';
  var mask = country.mask;
  var result = '';
  var di = 0;
  for (var i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === '#') {
      result += digits[di];
      di++;
    } else {
      result += mask[i];
    }
  }
  return result;
}

function _setupPhoneMask(inputEl, countryCode) {
  inputEl.addEventListener('input', function() {
    var raw = this.value.replace(/\D/g, '');
    this.setAttribute('data-digits', raw);
    this.value = _formatPhoneDisplay(raw, countryCode || '55');
  });
  inputEl.addEventListener('keydown', function(e) {
    // Allow backspace to work naturally on formatted input
    if (e.key === 'Backspace' && this.selectionStart === this.selectionEnd) {
      var pos = this.selectionStart;
      if (pos > 0 && /\D/.test(this.value[pos - 1])) {
        // Skip over separator chars
        e.preventDefault();
        var raw = (this.getAttribute('data-digits') || '').slice(0, -1);
        this.setAttribute('data-digits', raw);
        var cc = document.getElementById('profile-phone-country');
        this.value = _formatPhoneDisplay(raw, cc ? cc.value : '55');
      }
    }
  });
}

// ─── Birthdate mask (dd/mm/aaaa PT ou mm/dd/yyyy EN) ─────────────────────
// Input handler: formata conforme o usuário digita (só números) e insere
// barras automaticamente. Aceita colado (ex: "25021974" → "25/02/1974").
// Limita a 10 chars. Conversões pra/de ISO (YYYY-MM-DD) são feitas no load
// e save — Firestore armazena sempre em ISO pra que a ordenação/queries
// funcionem independente de locale.
window._maskBirthdate = function(el) {
  if (!el) return;
  var digits = (el.value || '').replace(/\D/g, '').slice(0, 8);
  var parts = [];
  if (digits.length <= 2) parts.push(digits);
  else if (digits.length <= 4) parts.push(digits.slice(0, 2), digits.slice(2));
  else parts.push(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4));
  el.value = parts.filter(Boolean).join('/');
};

// Converte ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SSZ) pra display format
// baseado na língua do app. Entradas inválidas retornam string vazia.
window._isoToDisplayDate = function(iso) {
  if (!iso) return '';
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  var y = m[1], mo = m[2], d = m[3];
  return (window._currentLang === 'en') ? (mo + '/' + d + '/' + y) : (d + '/' + mo + '/' + y);
};

// Converte display format pra ISO. Aceita dd/mm/aaaa (PT) ou mm/dd/yyyy (EN)
// conforme _currentLang. Valida ranges razoáveis (ano 1900-2100, mês 1-12,
// dia 1-31). Retorna '' se inválido — o save depois ignora e mantém o
// birthDate antigo.
window._displayDateToIso = function(str) {
  if (!str) return '';
  var m = String(str).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  var a = m[1], b = m[2], y = m[3];
  var d, mo;
  if (window._currentLang === 'en') { mo = a; d = b; } else { d = a; mo = b; }
  var dN = parseInt(d, 10), moN = parseInt(mo, 10), yN = parseInt(y, 10);
  if (isNaN(dN) || isNaN(moN) || isNaN(yN)) return '';
  if (yN < 1900 || yN > 2100) return '';
  if (moN < 1 || moN > 12) return '';
  if (dN < 1 || dN > 31) return '';
  return y + '-' + String(moN).padStart(2, '0') + '-' + String(dN).padStart(2, '0');
};

// ─── Profile sports pills (toggle + UI apply) ────────────────────────────
// Fonte de verdade: window._profileSelectedSports (array). Os pills do DOM
// refletem esse array via _applyProfileSportsUI, e o toggle atualiza o
// array + re-renderiza o estilo. Hidden input #profile-edit-sports recebe
// CSV pra compatibilidade com readers legacy que usam .split(',').
//
// v1.3.6-beta: skillBySport — quando uma modalidade é selecionada, abre
// mini-picker de habilidade (A/B/C/D/FUN) específico daquela modalidade.
// Fonte de verdade: window._profileSkillBySport = { 'Beach Tennis': 'D' }.
// User pode ser C em tênis e D em beach tennis.
window._SKILL_PILLS_PROFILE = ['A', 'B', 'C', 'D', 'FUN'];

window._toggleProfileSport = function(sport) {
  if (!Array.isArray(window._profileSelectedSports)) window._profileSelectedSports = [];
  if (!window._profileSkillBySport || typeof window._profileSkillBySport !== 'object') {
    window._profileSkillBySport = {};
  }
  var idx = window._profileSelectedSports.indexOf(sport);
  if (idx >= 0) {
    window._profileSelectedSports.splice(idx, 1);
    delete window._profileSkillBySport[sport];
  } else {
    window._profileSelectedSports.push(sport);
    // Não pré-popula skill — user escolhe. Se não escolher, fica null.
    if (!window._profileSkillBySport[sport]) {
      window._profileSkillBySport[sport] = null;
    }
  }
  if (typeof window._applyProfileSportsUI === 'function') {
    window._applyProfileSportsUI(window._profileSelectedSports);
  }
  if (typeof window._renderProfileSkillBySport === 'function') {
    window._renderProfileSkillBySport();
  }
};

window._setProfileSkillForSport = function(sport, skill) {
  if (!window._profileSkillBySport || typeof window._profileSkillBySport !== 'object') {
    window._profileSkillBySport = {};
  }
  // Toggle behavior: clicar no skill ativo deseleciona
  if (window._profileSkillBySport[sport] === skill) {
    window._profileSkillBySport[sport] = null;
  } else {
    window._profileSkillBySport[sport] = skill;
  }
  if (typeof window._renderProfileSkillBySport === 'function') {
    window._renderProfileSkillBySport();
  }
};

// v1.6.1-beta: toggle "posso arbitrar" por modalidade.
window._toggleProfileRefereeForSport = function(sport) {
  if (!window._profileCanRefereeBySport || typeof window._profileCanRefereeBySport !== 'object') {
    window._profileCanRefereeBySport = {};
  }
  window._profileCanRefereeBySport[sport] = !window._profileCanRefereeBySport[sport];
  if (typeof window._renderProfileSkillBySport === 'function') {
    window._renderProfileSkillBySport();
  }
};

window._renderProfileSkillBySport = function() {
  var container = document.getElementById('profile-skill-by-sport');
  var hidden = document.getElementById('profile-edit-skill-by-sport');
  if (!container) return;
  var sports = Array.isArray(window._profileSelectedSports) ? window._profileSelectedSports : [];
  var map = window._profileSkillBySport && typeof window._profileSkillBySport === 'object' ? window._profileSkillBySport : {};

  if (sports.length === 0) {
    container.innerHTML = '';
    if (hidden) hidden.value = '';
    return;
  }

  // v1.3.7-beta: layout compacto — cada modalidade ativa fica numa única
  // linha minimalista sem card de fundo. Muito menos espaço vertical.
  // Estrutura: "Beach Tennis · [A][B][C][D][FUN]" inline, com nome do sport
  // em texto leve âmbar e 5 mini-pills de skill em indigo.
  var refMap = (window._profileCanRefereeBySport && typeof window._profileCanRefereeBySport === 'object')
    ? window._profileCanRefereeBySport : {};

  var html = '';
  sports.forEach(function(sport) {
    var current = map[sport] || null;
    var safeS = String(sport).replace(/'/g, "\\'");
    var canRef = !!refMap[sport];
    // v1.6.6-beta: toggle árbitro como switch explícito com label "Arbitrar"
    var trackBg  = canRef ? 'rgba(20,184,166,0.45)' : 'rgba(255,255,255,0.12)';
    var knobLeft = canRef ? '14px' : '2px';
    var knobBg   = canRef ? '#2dd4bf' : 'rgba(255,255,255,0.4)';
    var lblColor = canRef ? '#2dd4bf' : 'var(--text-muted)';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 0;">';
    html += '<span style="font-size:0.74rem;font-weight:600;color:#fbbf24;min-width:90px;flex:0 0 auto;opacity:0.9;">' + window._safeHtml(sport) + '</span>';
    html += '<div style="display:flex;gap:3px;flex-wrap:nowrap;">';
    window._SKILL_PILLS_PROFILE.forEach(function(skill) {
      var active = current === skill;
      var style = active
        ? 'padding:3px 8px;border-radius:5px;font-size:0.7rem;cursor:pointer;border:1.5px solid #6366f1;background:rgba(99,102,241,0.22);color:#a5b4fc;font-weight:700;line-height:1;'
        : 'padding:3px 8px;border-radius:5px;font-size:0.7rem;cursor:pointer;border:1px solid rgba(255,255,255,0.15);background:transparent;color:var(--text-muted);font-weight:500;line-height:1;';
      html += '<button type="button" onclick="window._setProfileSkillForSport(\'' + safeS + '\',\'' + skill + '\')" style="' + style + '">' + skill + '</button>';
    });
    html += '</div>';
    // Toggle switch "Arbitrar" — label + switch visual
    html += '<span onclick="window._toggleProfileRefereeForSport(\'' + safeS + '\')" title="Posso arbitrar ' + window._safeHtml(sport) + '" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;user-select:none;">';
    html +=   '<span style="font-size:0.68rem;font-weight:600;color:' + lblColor + ';transition:color 0.2s;">Arbitrar</span>';
    html +=   '<span style="position:relative;display:inline-block;width:28px;height:16px;flex-shrink:0;">';
    html +=     '<span style="position:absolute;inset:0;background:' + trackBg + ';border-radius:8px;transition:background 0.2s;"></span>';
    html +=     '<span style="position:absolute;top:2px;left:' + knobLeft + ';width:12px;height:12px;background:' + knobBg + ';border-radius:50%;transition:left 0.2s,background 0.2s;"></span>';
    html +=   '</span>';
    html += '</span>';
    html += '</div>';
  });

  container.innerHTML = html;
  // Hidden input recebe JSON pra save flow
  if (hidden) {
    var clean = {};
    Object.keys(map).forEach(function(k) {
      if (sports.indexOf(k) !== -1 && map[k]) clean[k] = map[k];
    });
    hidden.value = JSON.stringify(clean);
  }
};

window._applyProfileSportsUI = function(arr) {
  var selected = (Array.isArray(arr) ? arr : []).map(function(s) { return String(s).toLowerCase(); });
  var container = document.getElementById('profile-sports-pills');
  if (container) {
    var btns = container.querySelectorAll('button[data-sport]');
    btns.forEach(function(b) {
      var val = b.getAttribute('data-sport') || '';
      var active = selected.indexOf(val.toLowerCase()) !== -1;
      if (active) {
        b.style.background = 'rgba(251,191,36,0.18)';
        b.style.color = '#fbbf24';
        b.style.border = '2px solid #fbbf24';
        b.style.fontWeight = '700';
      } else {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
        b.style.border = '1.5px solid var(--border-color)';
        b.style.fontWeight = '500';
      }
    });
  }
  // Mantém hidden input sincronizado com CSV pra compat com readers legacy.
  var hidden = document.getElementById('profile-edit-sports');
  if (hidden) hidden.value = (Array.isArray(arr) ? arr : []).join(', ');
  // Re-renderiza skill rows também
  if (typeof window._renderProfileSkillBySport === 'function') {
    window._renderProfileSkillBySport();
  }
};

// ─── Auto-detect & fix stale participant names ─────────────────────────────���
// Defined at module level so available immediately on script load (not inside setupProfileModal).
window._autoFixStaleNames = async function(forceTournamentId) {
  if (!window.AppStore || !Array.isArray(window.AppStore.tournaments)) return;
  if (!window.FirestoreDB || !window.FirestoreDB.db) return;
  if (window.AppStore.tournaments.length === 0) return;
  var now = Date.now();
  // Skip cooldown if forcing a specific tournament
  if (!forceTournamentId) {
    if (window._autoFixStaleNames._lastRun && (now - window._autoFixStaleNames._lastRun) < 30000) return;
  }
  window._autoFixStaleNames._lastRun = now;

  // v1.8.19-beta: reparar participantes sem nome (phone-only auth) PRIMEIRO,
  // antes do restante do fix de nomes obsoletos.
  if (typeof window._repairNullIdentityParticipants === 'function') {
    await window._repairNullIdentityParticipants();
  }

  var tournamentsToScan = forceTournamentId
    ? window.AppStore.tournaments.filter(function(t) { return t.id === forceTournamentId; })
    : window.AppStore.tournaments;
  window._debug('[AutoFixNames] Scanning ' + tournamentsToScan.length + ' tournaments...');

  var uidMap = {};
  var emailMap = {};
  tournamentsToScan.forEach(function(t) {
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p) {
      if (typeof p === 'object' && p !== null) {
        var pName = p.displayName || p.name || '';
        if (!pName) return;
        var pUid = p.uid && p.uid.length > 0 ? p.uid : null;
        if (pUid && !uidMap[pUid]) {
          uidMap[pUid] = { storedName: pName, email: p.email || '' };
        }
        if (p.email && !emailMap[p.email]) {
          emailMap[p.email] = pName;
        }
      }
    });
    // Also scan match players (p1/p2) — they may reference stale names even when participant objects are updated
    var _scanMatch = function(m) {
      if (!m) return;
      // Extract individual names from team strings
      [m.p1, m.p2].forEach(function(pStr) {
        if (!pStr || typeof pStr !== 'string') return;
        var names = pStr.indexOf(' / ') !== -1 ? pStr.split(' / ').map(function(n) { return n.trim(); }) : [pStr];
        names.forEach(function(name) {
          if (!name || name === 'BYE' || name === 'TBD') return;
          // Check if this name exists as a participant object with different name
          parts.forEach(function(p2) {
            if (typeof p2 !== 'object' || p2 === null) return;
            var p2Name = p2.displayName || p2.name || '';
            if (!p2Name || p2Name === name) return;
            // Same uid or email but different display name → stale name in match
            if ((p2.uid && p2.uid.length > 0) || p2.email) {
              // Will be caught by the uid/email map comparison below
            }
          });
        });
      });
    };
    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(_scanMatch);
    } else {
      // Defensive fallback: bracket-model.js not loaded.
      if (Array.isArray(t.matches)) t.matches.forEach(_scanMatch);
      if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_scanMatch); });
      if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
        if (!g) return;
        if (Array.isArray(g.matches)) g.matches.forEach(_scanMatch);
        if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_scanMatch); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_scanMatch); });
      });
    }
  });

  var uids = Object.keys(uidMap);
  var emails = Object.keys(emailMap);
  window._debug('[AutoFixNames] Found ' + uids.length + ' UIDs and ' + emails.length + ' emails to check');
  if (uids.length === 0 && emails.length === 0) return;

  var profileMap = {};
  var emailProfileMap = {};
  try {
    for (var i = 0; i < uids.length; i += 10) {
      var batch = uids.slice(i, i + 10);
      var snap = await window.FirestoreDB.db.collection('users')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batch).get();
      snap.forEach(function(doc) {
        var data = doc.data();
        if (data.displayName) {
          profileMap[doc.id] = { displayName: data.displayName, email: data.email || '', previousDisplayNames: Array.isArray(data.previousDisplayNames) ? data.previousDisplayNames : [] };
          if (data.email) emailProfileMap[data.email] = { displayName: data.displayName, uid: doc.id, previousDisplayNames: Array.isArray(data.previousDisplayNames) ? data.previousDisplayNames : [] };
        }
      });
    }
    var emailsToFetch = emails.filter(function(e) { return !emailProfileMap[e]; });
    for (var j = 0; j < emailsToFetch.length; j += 10) {
      var emailBatch = emailsToFetch.slice(j, j + 10);
      var esnap = await window.FirestoreDB.db.collection('users')
        .where('email', 'in', emailBatch).get();
      esnap.forEach(function(doc) {
        var data = doc.data();
        if (data.displayName && data.email) {
          emailProfileMap[data.email] = { displayName: data.displayName, uid: doc.id, previousDisplayNames: Array.isArray(data.previousDisplayNames) ? data.previousDisplayNames : [] };
        }
      });
    }
  } catch(e) {
    window._warn('[AutoFixNames] Error fetching profiles:', e);
    return;
  }

  // Build reverse map: currentProfileName → { uid, email } for detecting stale names in matches
  var _currentNameToProfile = {};
  Object.keys(profileMap).forEach(function(uid) {
    var p = profileMap[uid];
    _currentNameToProfile[p.displayName] = { uid: uid, email: p.email };
  });
  Object.keys(emailProfileMap).forEach(function(email) {
    var p = emailProfileMap[email];
    if (!_currentNameToProfile[p.displayName]) _currentNameToProfile[p.displayName] = { uid: p.uid, email: email };
  });

  var fixes = [];
  var _addFix = function(oldN, newN, uid, email) {
    if (!oldN || !newN || oldN === newN) return;
    if (!fixes.some(function(f) { return f.oldName === oldN && f.newName === newN; })) {
      fixes.push({ oldName: oldN, newName: newN, uid: uid, email: email });
    }
  };

  uids.forEach(function(uid) {
    var stored = uidMap[uid].storedName;
    var profile = profileMap[uid];
    if (profile && stored && profile.displayName !== stored) {
      _addFix(stored, profile.displayName, uid, uidMap[uid].email || profile.email);
    }
  });
  emails.forEach(function(email) {
    var stored = emailMap[email];
    var profile = emailProfileMap[email];
    if (profile && stored && profile.displayName !== stored) {
      _addFix(stored, profile.displayName, profile.uid || null, email);
    }
  });

  // Also scan match p1/p2 and sorteioRealizado for stale names not caught above
  // (e.g., when participant object was already updated but match strings still have old name)
  tournamentsToScan.forEach(function(t) {
    var _knownCurrentNames = {};
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p) {
      if (typeof p === 'object' && p !== null) {
        var nm = p.displayName || p.name || '';
        if (nm) _knownCurrentNames[nm] = { uid: p.uid || null, email: p.email || null };
      }
    });
    var _checkStaleInStr = function(str) {
      if (!str || typeof str !== 'string') return;
      var names = str.indexOf(' / ') !== -1 ? str.split(' / ').map(function(n) { return n.trim(); }) : [str];
      names.forEach(function(name) {
        if (!name || name === 'BYE' || name === 'TBD' || _knownCurrentNames[name]) return;
        // This name is in a match but NOT a current participant name — check all profiles
        Object.keys(_currentNameToProfile).forEach(function(profileName) {
          if (profileName === name) return; // name IS current — no fix needed
          var prof = _currentNameToProfile[profileName];
          // Check if this stale name was previously used by this profile's uid/email
          if (prof.uid && uidMap[prof.uid] && uidMap[prof.uid].storedName === name) {
            _addFix(name, profileName, prof.uid, prof.email);
          } else if (prof.email && emailMap[prof.email] === name) {
            _addFix(name, profileName, prof.uid, prof.email);
          }
        });
      });
    };
    var _scanMatchStale = function(m) { if (!m) return; _checkStaleInStr(m.p1); _checkStaleInStr(m.p2); _checkStaleInStr(m.winner); };
    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(_scanMatchStale);
    } else {
      // Defensive fallback: bracket-model.js not loaded.
      if (Array.isArray(t.matches)) t.matches.forEach(_scanMatchStale);
      if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_scanMatchStale); });
      if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
        if (!g) return;
        if (Array.isArray(g.matches)) g.matches.forEach(_scanMatchStale);
        if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_scanMatchStale); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_scanMatchStale); });
      });
    }
    // g.players is a roster field (not a match), handled separately.
    if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
      if (g && Array.isArray(g.players)) g.players.forEach(function(pl) { _checkStaleInStr(pl); });
    });
    if (Array.isArray(t.sorteioRealizado)) t.sorteioRealizado.forEach(function(item) {
      if (typeof item === 'string') _checkStaleInStr(item);
      else if (typeof item === 'object' && item) { _checkStaleInStr(item.name); _checkStaleInStr(item.displayName); }
    });
  });

  // Also check previousDisplayNames: scan ALL tournament strings for old names
  // This catches the case where participant object is already updated but team strings have old name
  var _prevNameMap = {}; // oldName → { newName, uid, email }
  Object.keys(profileMap).forEach(function(uid) {
    var p = profileMap[uid];
    if (p.previousDisplayNames && p.previousDisplayNames.length > 0) {
      p.previousDisplayNames.forEach(function(oldN) {
        _prevNameMap[oldN] = { newName: p.displayName, uid: uid, email: p.email };
      });
    }
  });
  Object.keys(emailProfileMap).forEach(function(email) {
    var p = emailProfileMap[email];
    if (p.previousDisplayNames && p.previousDisplayNames.length > 0) {
      p.previousDisplayNames.forEach(function(oldN) {
        if (!_prevNameMap[oldN]) _prevNameMap[oldN] = { newName: p.displayName, uid: p.uid, email: email };
      });
    }
  });

  if (Object.keys(_prevNameMap).length > 0) {
    window._debug('[AutoFixNames] Previous display names found:', Object.keys(_prevNameMap));
    // Scan ALL tournament data for these old names
    tournamentsToScan.forEach(function(t) {
      var parts = Array.isArray(t.participants) ? t.participants : [];
      var _allStrings = [];
      // Collect all string data to search
      parts.forEach(function(p) { if (typeof p === 'string') _allStrings.push(p); });
      var _collectFromMatch = function(m) {
        if (!m) return;
        if (m.p1) _allStrings.push(m.p1);
        if (m.p2) _allStrings.push(m.p2);
        if (m.winner) _allStrings.push(m.winner);
      };
      if (typeof window._collectAllMatches === 'function') {
        window._collectAllMatches(t).forEach(_collectFromMatch);
      } else {
        // Defensive fallback: bracket-model.js not loaded.
        if (Array.isArray(t.matches)) t.matches.forEach(_collectFromMatch);
        if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_collectFromMatch); });
        if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
          if (!g) return;
          if (Array.isArray(g.matches)) g.matches.forEach(_collectFromMatch);
          if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_collectFromMatch); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_collectFromMatch); });
        });
      }
      // g.players is a roster field (not a match), handled separately.
      if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
        if (g && Array.isArray(g.players)) g.players.forEach(function(pl) { _allStrings.push(pl); });
      });
      if (Array.isArray(t.sorteioRealizado)) t.sorteioRealizado.forEach(function(item) {
        if (typeof item === 'string') _allStrings.push(item);
        else if (typeof item === 'object' && item) { if (item.name) _allStrings.push(item.name); if (item.displayName) _allStrings.push(item.displayName); }
      });

      // Check each string for old names
      _allStrings.forEach(function(str) {
        Object.keys(_prevNameMap).forEach(function(oldName) {
          if (str === oldName || (str.indexOf(oldName) !== -1 && str.indexOf(' / ') !== -1)) {
            var info = _prevNameMap[oldName];
            _addFix(oldName, info.newName, info.uid, info.email);
          }
        });
      });
    });
  }

  if (fixes.length > 0) {
    window._debug('[AutoFixNames] Fixing ' + fixes.length + ' stale name(s):', fixes.map(function(f) { return '"' + f.oldName + '" → "' + f.newName + '"'; }));
    fixes.forEach(function(f) {
      window._propagateNameChange(f.oldName, f.newName, f.uid, f.email);
    });
    setTimeout(function() { if (typeof window._softRefreshView === 'function') window._softRefreshView(); }, 500);
  } else {
    window._debug('[AutoFixNames] All names up to date');
  }
};

// ─── Repair null-identity participants (phone-only Firebase auth) ──────────
// Participantes que se inscreveram por celular (sem e-mail, sem displayName)
// ficam com name/displayName/email = null no Firestore e aparecem como
// "Participante N" na UI. Esta função:
//   1. Encontra participantes com uid mas sem nenhum identificador textual
//   2. Busca o perfil em users/{uid}
//   3. Atualiza com email (preferência) ou telefone formatado "+55 (DDD) XXXXX-XXXX"
//   4. Salva os torneios afetados e propaga o nome em matches/brackets
// Chamada automaticamente por _autoFixStaleNames na carga de dados.
window._repairNullIdentityParticipants = async function() {
  if (!window.AppStore || !Array.isArray(window.AppStore.tournaments)) return 0;
  if (!window.FirestoreDB || !window.FirestoreDB.db) return 0;
  var cu = window.AppStore.currentUser;
  if (!cu) return 0;

  // Formata telefone → "+55 (DDD) XXXXX-XXXX" (DDI sempre presente no BD).
  function _phoneRawDigits(raw) {
    if (!raw) return '';
    var d = String(raw).replace(/\D/g, '');
    if (d.length > 11 && d.substring(0, 2) === '55') d = d.substring(2);
    if (d.length > 11) d = d.substring(d.length - 11);
    if (d.length === 11) return '+55 (' + d.substring(0,2) + ') ' + d.substring(2,7) + '-' + d.substring(7);
    if (d.length === 10) return '+55 (' + d.substring(0,2) + ') ' + d.substring(2,6) + '-' + d.substring(6);
    return raw;
  }

  // Coletar uid → [{t, idx}] de participantes sem nome
  var needsFix = {}; // uid → [{t, idx}]
  window.AppStore.tournaments.forEach(function(t) {
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p, idx) {
      if (typeof p !== 'object' || !p || !p.uid) return;
      if (p.displayName || p.name || p.email) return; // já tem identificador
      if (!needsFix[p.uid]) needsFix[p.uid] = [];
      needsFix[p.uid].push({ t: t, idx: idx });
    });
  });

  var uids = Object.keys(needsFix);
  if (uids.length === 0) return 0;
  window._log('[RepairNullIdentity] ' + uids.length + ' participante(s) sem nome encontrado(s)');

  // Buscar perfis em lotes de 10
  var profileMap = {};
  try {
    for (var i = 0; i < uids.length; i += 10) {
      var batch = uids.slice(i, i + 10);
      var snap = await window.FirestoreDB.db.collection('users')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batch).get();
      snap.forEach(function(doc) {
        var d = doc.data();
        profileMap[doc.id] = {
          displayName: d.displayName || '',
          email: d.email || '',
          phone: d.phone || ''
        };
      });
    }
  } catch(e) {
    window._warn('[RepairNullIdentity] Erro ao buscar perfis:', e);
    return 0;
  }

  var modifiedTournaments = new Set();
  var repairCount = 0;
  uids.forEach(function(uid) {
    var profile = profileMap[uid];
    if (!profile) return;
    // Melhor identificador: displayName > email > dígitos do telefone (sem máscara)
    // A máscara é aplicada ao exibir por _pNameDisplay() em store.js.
    var identifier = profile.displayName || profile.email || _phoneRawDigits(profile.phone);
    if (!identifier) return;

    needsFix[uid].forEach(function(entry) {
      var p = entry.t.participants[entry.idx];
      if (typeof p !== 'object' || !p) return;
      p.displayName = identifier;
      p.name = identifier;
      if (!p.email && profile.email) p.email = profile.email;
      if (!p.phone && profile.phone) p.phone = profile.phone;
      modifiedTournaments.add(entry.t);
      repairCount++;
      window._log('[RepairNullIdentity] uid=' + uid.substring(0, 8) + '... → "' + identifier + '"');
    });
  });

  if (modifiedTournaments.size === 0) return 0;

  // Salvar somente torneios onde o usuário é organizador (tem permissão Firestore)
  var saved = 0;
  modifiedTournaments.forEach(function(t) {
    var canWrite = (t.organizerEmail && cu.email && t.organizerEmail === cu.email) ||
                   (t.creatorUid && cu.uid && t.creatorUid === cu.uid) ||
                   (Array.isArray(t.coHosts) && t.coHosts.some(function(ch) {
                     return ch.status === 'active' && (ch.uid === cu.uid || ch.email === cu.email);
                   }));
    if (!canWrite) return;
    if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
      window.FirestoreDB.saveTournament(t).catch(function(e) {
        window._warn('[RepairNullIdentity] Erro ao salvar torneio', t.id, e);
      });
      saved++;
    }
  });

  window._log('[RepairNullIdentity] ' + repairCount + ' participante(s) corrigido(s) em ' + saved + ' torneio(s) salvo(s)');
  if (saved > 0) {
    setTimeout(function() {
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }, 800);
  }
  return repairCount;
};

// ─── Propagate displayName change across all tournaments ─────────────────
window._propagateNameChange = function _propagateNameChange(oldName, newName, targetUid, targetEmail) {
  if (!oldName || !newName || oldName === newName) return;
  if (!window.AppStore || !Array.isArray(window.AppStore.tournaments)) return;
  window._debug('[PropageName] "' + oldName + '" → "' + newName + '" (uid=' + (targetUid || 'none') + ', email=' + (targetEmail || 'none') + ')');

  var user = window.AppStore.currentUser;
  var matchUid = targetUid || (user ? user.uid : null);
  var matchEmail = targetEmail || (user ? user.email : null);
  var modifiedTournaments = [];

  window.AppStore.tournaments.forEach(function(t) {
    var changed = false;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p, idx) {
      if (typeof p === 'string') {
        if (p === oldName) { parts[idx] = newName; changed = true; }
        // Handle team strings: "OldName / Partner" → "NewName / Partner"
        else if (p.indexOf(oldName) !== -1 && p.indexOf(' / ') !== -1) {
          var newTeam = p.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newTeam !== p) { parts[idx] = newTeam; changed = true; }
        }
        return;
      }
      if (typeof p === 'object' && p !== null) {
        var isUser = (matchUid && p.uid === matchUid) || (matchEmail && p.email === matchEmail) || p.displayName === oldName || p.name === oldName;
        if (isUser) {
          // v1.8.63: quando encontrado por uid, sempre atualizar para o novo
          // nome — mesmo que o nome armazenado não seja o oldName esperado
          // (ex: telefone formatado diferente, nome antigo de outra sessão).
          if (matchUid && p.uid === matchUid) {
            if (p.displayName !== newName) { p.displayName = newName; changed = true; }
            if (p.name !== newName) { p.name = newName; changed = true; }
          } else {
            if (p.displayName === oldName) { p.displayName = newName; changed = true; }
            if (p.name === oldName) { p.name = newName; changed = true; }
          }
          if (matchUid && !p.uid) { p.uid = matchUid; changed = true; }
          if (matchEmail && !p.email) { p.email = matchEmail; changed = true; }
          // Não propagar photoURL diretamente — fotos são buscadas por uid
          // em _preloadPlayerPhotos (bracket.js v1.8.58) diretamente do
          // perfil real do usuário, sem depender do objeto participante.
        }
      }
    });

    function _updateMatch(m) {
      if (!m) return;
      if (m.p1 === oldName) { m.p1 = newName; changed = true; }
      if (m.p2 === oldName) { m.p2 = newName; changed = true; }
      if (m.winner === oldName) { m.winner = newName; changed = true; }
      if (Array.isArray(m.team1)) { var i1 = m.team1.indexOf(oldName); if (i1 !== -1) { m.team1[i1] = newName; changed = true; } }
      if (Array.isArray(m.team2)) { var i2 = m.team2.indexOf(oldName); if (i2 !== -1) { m.team2[i2] = newName; changed = true; } }
      if (m.p1 && m.p1.indexOf(oldName) !== -1 && m.p1.indexOf(' / ') !== -1) {
        var newP1 = m.p1.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
        if (newP1 !== m.p1) { m.p1 = newP1; changed = true; }
      }
      if (m.p2 && m.p2.indexOf(oldName) !== -1 && m.p2.indexOf(' / ') !== -1) {
        var newP2 = m.p2.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
        if (newP2 !== m.p2) { m.p2 = newP2; changed = true; }
      }
      if (m.winner && m.winner.indexOf(oldName) !== -1 && m.winner.indexOf(' / ') !== -1) {
        var newW = m.winner.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
        if (newW !== m.winner) { m.winner = newW; changed = true; }
      }
    }

    if (typeof window._collectAllMatches === 'function') {
      window._collectAllMatches(t).forEach(_updateMatch);
    } else {
      // Defensive fallback: bracket-model.js not loaded.
      if (Array.isArray(t.matches)) t.matches.forEach(_updateMatch);
      _updateMatch(t.thirdPlaceMatch);
      if (Array.isArray(t.rounds)) { t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); }); }
      if (Array.isArray(t.groups)) {
        t.groups.forEach(function(g) {
          if (!g) return;
          if (Array.isArray(g.matches)) g.matches.forEach(_updateMatch);
          if (Array.isArray(g.rounds)) { g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_updateMatch); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_updateMatch); }); }
        });
      }
      if (Array.isArray(t.rodadas)) { t.rodadas.forEach(function(r) { if (Array.isArray(r)) r.forEach(_updateMatch); else if (r && Array.isArray(r.matches)) r.matches.forEach(_updateMatch); }); }
    }
    // g.players is a roster field (not a match), handled separately.
    if (Array.isArray(t.groups)) {
      t.groups.forEach(function(g) {
        if (g && Array.isArray(g.players)) {
          var pi = g.players.indexOf(oldName);
          if (pi !== -1) { g.players[pi] = newName; changed = true; }
        }
      });
    }
    if (t.classification && t.classification[oldName] !== undefined) { t.classification[newName] = t.classification[oldName]; delete t.classification[oldName]; changed = true; }
    ['checkedIn', 'absent', 'vips'].forEach(function(field) {
      if (!t[field]) return;
      if (t[field][oldName] !== undefined) { t[field][newName] = t[field][oldName]; delete t[field][oldName]; changed = true; }
      // Also handle team string keys: "OldName / Partner" → "NewName / Partner"
      Object.keys(t[field]).forEach(function(k) {
        if (k.indexOf(oldName) !== -1 && k.indexOf(' / ') !== -1) {
          var newKey = k.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newKey !== k) { t[field][newKey] = t[field][k]; delete t[field][k]; changed = true; }
        }
      });
    });
    if (Array.isArray(t.standings)) { t.standings.forEach(function(s) { if (s.name === oldName) { s.name = newName; changed = true; } if (s.player === oldName) { s.player = newName; changed = true; } }); }
    if (Array.isArray(t.sorteioRealizado)) { t.sorteioRealizado.forEach(function(item, idx) {
      if (typeof item === 'string') {
        if (item === oldName) { t.sorteioRealizado[idx] = newName; changed = true; }
        else if (item.indexOf(oldName) !== -1 && item.indexOf(' / ') !== -1) {
          var newSR = item.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (newSR !== item) { t.sorteioRealizado[idx] = newSR; changed = true; }
        }
      } else if (typeof item === 'object' && item !== null) {
        if (item.name === oldName) { item.name = newName; changed = true; }
        if (item.displayName === oldName) { item.displayName = newName; changed = true; }
      }
    }); }
    if (t.organizerName === oldName) { t.organizerName = newName; changed = true; }
    if (changed) modifiedTournaments.push(t);
  });

  if (modifiedTournaments.length > 0 && window.FirestoreDB && window.FirestoreDB.saveTournament) {
    window._debug('[PropageName] Saving ' + modifiedTournaments.length + ' tournament(s) to Firestore');
    var savePromises = modifiedTournaments.map(function(t) {
      t.updatedAt = new Date().toISOString();
      return window.FirestoreDB.saveTournament(t).catch(function(err) { window._warn('[PropageName] Save error for ' + t.id + ':', err); });
    });
    Promise.all(savePromises).then(function() {
      window._debug('[PropageName] All saves complete, refreshing UI');
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    });
    if (typeof showNotification !== 'undefined') {
      showNotification(_t('auth.nameUpdated'), _t('auth.nameUpdatedMsg', {old: oldName, new: newName, n: modifiedTournaments.length}), 'info');
    }
  } else {
    window._debug('[PropageName] No tournaments needed updating');
  }
};

// v1.8.63: propagar mudança de perfil (nome E/OU foto) para torneios.
// Quando só a foto muda, garante que memberUids está atualizado (para
// que o usuário phone-only possa salvar via regras do Firestore).
// NÃO armazena photoURL no objeto participante — fotos são buscadas
// diretamente de users/{uid} em _preloadPlayerPhotos (v1.8.58).
function _propagatePhotoToTournaments(newPhotoURL) {
  if (!window.AppStore || !Array.isArray(window.AppStore.tournaments)) return;
  var user = window.AppStore.currentUser;
  if (!user) return;
  var matchUid = user.uid;
  var matchEmail = user.email;
  var modifiedTournaments = [];
  window.AppStore.tournaments.forEach(function(t) {
    var changed = false;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    parts.forEach(function(p) {
      if (typeof p !== 'object' || p === null) return;
      var isUser = (matchUid && p.uid === matchUid) ||
                   (matchEmail && p.email === matchEmail);
      // Garantir que uid está setado no participante (para regras Firestore)
      if (isUser && matchUid && !p.uid) { p.uid = matchUid; changed = true; }
    });
    if (changed) modifiedTournaments.push(t);
  });
  if (modifiedTournaments.length > 0 && window.FirestoreDB && window.FirestoreDB.saveTournament) {
    window._debug('[PropagatePhoto] Saving ' + modifiedTournaments.length + ' tournament(s)');
    modifiedTournaments.forEach(function(t) {
      t.updatedAt = new Date().toISOString();
      window.FirestoreDB.saveTournament(t).catch(function(err) {
        window._warn('[PropagatePhoto] Save error for ' + t.id + ':', err);
      });
    });
    setTimeout(function() {
      if (typeof window._softRefreshView === 'function') window._softRefreshView();
    }, 500);
  }
}

// v0.17.87: exposto explicitamente em window pra _setLang poder rebuildar
// o modal de perfil quando o usuário muda idioma com o perfil aberto.
window.setupProfileModal = setupProfileModal;
function setupProfileModal() {
  var _t = window._t || function(k) { return k; };
  if (!document.getElementById('modal-profile')) {
    // Country select options
    var countryOpts = _phoneCountries.map(function(c) {
      return '<option value="' + c.code + '">' + c.flag + ' +' + c.code + '</option>';
    }).join('');

    // v1.3.5-beta: setupProfileModal continua criando a estrutura DOM (chamada
    // 1x no boot via main.js + i18n re-render). renderProfilePage move o
    // .modal pro view-container e adiciona o back-header padronizado lá.
    var modalHtml = '<div class="modal-overlay" id="modal-profile">' +
      '<div class="modal" style="overflow-y: auto; overflow-x: hidden; box-sizing: border-box;">' +
        '<div class="modal-body" style="padding: 1rem 1.25rem; overflow-x: hidden; max-width: 760px; margin: 0 auto; width: 100%; box-sizing: border-box;">' +
          // Avatar row
          // v1.0.23-beta: feedback do user — "esses ícones são ridículos.
          // vamos usar as iniciais dos nomes invés dessa porcaria". Removido
          // o picker de cartoons (notionists) e o overlay de pencil/edit. O
          // avatar agora é sempre derivado do displayName (iniciais geradas
          // automaticamente via dicebear /initials). Foto real do Google/
          // Apple é preservada quando existe.
          '<div style="display: flex; align-items: center; gap: 14px; margin-bottom: 0.5rem;">' +
            '<div style="flex-shrink: 0; position: relative;" title="Clique para trocar a foto">' +
              '<img id="profile-avatar" src="" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid var(--primary-color); object-fit: cover; display: none; cursor: pointer;" onclick="document.getElementById(\'profile-photo-input\').click()">' +
              '<div id="profile-avatar-edit-icon" style="position:absolute;bottom:0;right:0;width:18px;height:18px;border-radius:50%;background:var(--primary-color);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:0.6rem;border:2px solid var(--bg-dark);" onclick="document.getElementById(\'profile-photo-input\').click()" title="Trocar foto">✏️</div>' +
              '<input type="file" id="profile-photo-input" accept="image/*,.gif" style="display:none;" onchange="window._handleProfilePhotoUpload && window._handleProfilePhotoUpload(this)">' +
            '</div>' +
            '<div style="flex: 1; min-width: 0;">' +
              '<label for="profile-edit-name" class="form-label" style="font-size: 0.75rem; margin-bottom: 2px;">' + _t('profile.labelName') + '</label>' +
              '<input type="text" id="profile-edit-name" aria-label="' + _t('profile.labelName') + '" class="form-control" style="width: 100%; box-sizing: border-box;" required oninput="window._refreshProfileAvatarFromName && window._refreshProfileAvatarFromName()">' +
              '<div id="profile-name-nudge" style="display:none;margin-top:6px;padding:7px 10px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;font-size:0.75rem;color:#fbbf24;line-height:1.4;"></div>' +
            '</div>' +
          '</div>' +
          // v1.0.43-beta: display do email autenticado.
          // v1.7.9-beta: adicionado botão "Alterar" e campo de edição/adição.
          // Contas phone-only mostram o campo de adição de e-mail por padrão
          // (via _populateProfileModalFields). Contas com e-mail mostram
          // display + botão "Alterar" que expõe o campo de edição.
          '<div id="profile-email-display" style="display:none;margin:0 0 0.5rem 0;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;font-size:0.82rem;color:var(--text-muted);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
              '<div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;">' +
                '<span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;opacity:0.7;flex-shrink:0;">📧</span>' +
                '<span id="profile-email-text" style="font-family:var(--font-body);color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
              '</div>' +
              '<button type="button" onclick="window._profileShowEmailEdit()" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--text-muted);padding:3px 10px;border-radius:6px;font-size:0.72rem;cursor:pointer;white-space:nowrap;flex-shrink:0;line-height:1.4;">Alterar</button>' +
            '</div>' +
          '</div>' +
          '<div id="profile-email-edit-wrap" style="display:none;margin:0 0 1rem 0;">' +
            '<label class="form-label" style="font-size:0.75rem;">📧 E-mail</label>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<input type="email" id="profile-edit-email" class="form-control" placeholder="seu@email.com" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;">' +
              '<button type="button" onclick="window._profileCancelEmailEdit()" style="background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--text-muted);padding:6px 10px;border-radius:8px;font-size:0.82rem;cursor:pointer;white-space:nowrap;line-height:1;">✕</button>' +
            '</div>' +
            '<span style="font-size:0.68rem;color:var(--text-muted);opacity:0.7;margin-top:4px;display:block;">O e-mail será salvo ao clicar em Salvar.</span>' +
          '</div>' +
          // ── Emails vinculados ──
          '<div style="margin:0 0 1rem 0;">' +
            '<label class="form-label" style="font-size:0.75rem;">🔗 E-mails vinculados</label>' +
            '<div id="profile-linked-emails" style="margin-bottom:6px;display:flex;flex-direction:column;gap:4px;"></div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<input type="email" id="profile-link-email-input" class="form-control" placeholder="outro@email.com" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;font-size:0.85rem;">' +
              '<button type="button" onclick="window._profileSendEmailLink()" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;padding:6px 10px;border-radius:8px;font-size:0.78rem;cursor:pointer;white-space:nowrap;line-height:1.4;">Verificar</button>' +
            '</div>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);opacity:0.7;margin-top:4px;display:block;">Você receberá um link de verificação nesse e-mail. Clicando, ele será vinculado à sua conta.</span>' +
          '</div>' +
          '<form id="form-edit-profile" onsubmit="event.preventDefault(); saveUserProfile()" style="overflow: hidden;">' +
            // Telefone: País + Número
            '<div class="form-group" style="margin-bottom: 10px;">' +
              '<label class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelWhatsApp') + '</label>' +
              '<div style="display: flex; gap: 6px;">' +
                '<select id="profile-phone-country" aria-label="DDI do telefone" class="form-control" style="width: 120px; flex-shrink: 0; box-sizing: border-box; font-size: 0.85rem;" onchange="var inp=document.getElementById(\'profile-edit-phone\'); var d=inp.getAttribute(\'data-digits\')||\'\'; inp.value=_formatPhoneDisplay(d,this.value);">' +
                  countryOpts +
                '</select>' +
                '<input type="tel" id="profile-edit-phone" class="form-control" style="flex: 1; min-width: 0; box-sizing: border-box;" placeholder="(11) 9999-8888" data-digits="">' +
              '</div>' +
            '</div>' +
            // Row: Sexo + Nascimento (2 colunas)
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">' +
              '<div class="form-group" style="margin: 0;">' +
                '<label for="profile-edit-gender" class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelSex') + '</label>' +
                '<select id="profile-edit-gender" aria-label="' + _t('profile.labelSex') + '" class="form-control" style="width: 100%; box-sizing: border-box;">' +
                  '<option value="">' + _t('profile.sexNotInform') + '</option>' +
                  '<option value="masculino">' + _t('profile.sexMasc') + '</option>' +
                  '<option value="feminino">' + _t('profile.sexFem') + '</option>' +
                  '<option value="outro">' + _t('profile.sexOther') + '</option>' +
                '</select>' +
              '</div>' +
              '<div class="form-group" style="margin: 0;">' +
                '<label class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelBirth') + '</label>' +
                // Masked text input — native <input type="date"> renderiza
                // datas em formato longo no iOS/Android ("25 de fev. de 1974")
                // e esquisito no desktop; também fica mais alto que os
                // irmãos por causa do date-picker button. Usamos text com
                // inputmode="numeric" + mask JS pra garantir dd/mm/aaaa
                // consistente em todos os dispositivos. Placeholder adapta
                // pra língua escolhida (pt-BR: dd/mm/aaaa, en: mm/dd/yyyy).
                '<input type="text" inputmode="numeric" id="profile-edit-birthdate" class="form-control" placeholder="' + ((window._currentLang === 'en') ? 'mm/dd/yyyy' : 'dd/mm/aaaa') + '" maxlength="10" autocomplete="bday" style="width: 100%; box-sizing: border-box;" oninput="window._maskBirthdate(this)">' +
              '</div>' +
            '</div>' +
            // Row: Cidade (1 coluna agora — categoria virou per-modalidade na v1.3.6-beta)
            '<div class="form-group" style="margin-bottom: 10px;">' +
              '<label class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelCity') + '</label>' +
              '<input type="text" id="profile-edit-city" class="form-control" style="width: 100%; box-sizing: border-box;" placeholder="Ex: São Paulo">' +
            '</div>' +
            // Esportes Preferidos — pill buttons toggleáveis (v0.15.19).
            // v1.3.6-beta: ao selecionar uma modalidade, abre mini-picker de
            // habilidade (A/B/C/D/FUN) específico daquela modalidade.
            // v1.3.7-beta: lista de 5 → 7 modalidades (alinhada com app
            // canônico — venues.js SPORTS, _sportScoringDefaults). Layout
            // compacto: cada modalidade ativa fica numa linha minimalista
            // sem card de fundo, usando muito menos espaço vertical.
            '<div class="form-group" style="margin-bottom: 10px;">' +
              '<label class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelSports') + '</label>' +
              '<div id="profile-sports-pills" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' +
                ['Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei'].map(function(s) {
                  var safeS = String(s).replace(/'/g, "\\'");
                  return '<button type="button" data-sport="' + window._safeHtml(s) + '" onclick="window._toggleProfileSport(\'' + safeS + '\')" class="btn btn-sm" style="font-size:0.72rem;padding:6px 12px;border-radius:999px;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">' + window._safeHtml(s) + '</button>';
                }).join('') +
              '</div>' +
              '<input type="hidden" id="profile-edit-sports" value="">' +
              '<span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.6; margin-top: 4px; display: block;">Selecione as modalidades que você joga. Sua habilidade abrirá pra cada uma.</span>' +
              // Skill por modalidade — renderizado dinamicamente conforme
              // modalidades são selecionadas. Vazio quando não há modalidade ativa.
              '<div id="profile-skill-by-sport" style="margin-top:8px;display:flex;flex-direction:column;gap:4px;"></div>' +
              '<input type="hidden" id="profile-edit-skill-by-sport" value="">' +
            '</div>' +
            // Presença — visibilidade + silenciar
            '<div style="height: 1px; background: var(--border-color); margin: 1rem 0;"></div>' +
            '<div class="form-group" style="margin-bottom: 1rem;">' +
              '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">📍 Presença no local</label>' +
              '<p style="font-size: 0.7rem; color: var(--text-muted); margin: 0 0 8px 0;">Quem pode ver quando você registra que está num local jogando.</p>' +
              '<div id="presence-visibility-group" style="display:flex;gap:6px;flex-wrap:nowrap;margin-bottom:10px;">' +
                // v1.0.5-beta: pills nascem com style "desativado" inline (idem #2 fix).
                // _applyPresenceVisibilityUI sobrescreve o ativo com bg/cor preenchida.
                '<button type="button" data-pv="friends" onclick="window._setPresenceVisibility(\'friends\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">👥 Amigos</button>' +
                '<button type="button" data-pv="public" onclick="window._setPresenceVisibility(\'public\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">🌐 Todos</button>' +
                '<button type="button" data-pv="off" onclick="window._setPresenceVisibility(\'off\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">🚫 Ninguém</button>' +
              '</div>' +
              '<div style="margin-top:4px;margin-bottom:6px;">' +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-presence-auto-checkin', label: 'Auto check-in ao chegar no local (usa GPS)', icon: '📡', checked: false, color: '#10b981', desc: 'Se você estiver em um local preferido, registra presença automaticamente. Senão, o app sugere.' }) : '') +
              '</div>' +
              '<div id="presence-mute-wrap" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;">' +
                '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.78rem;color:var(--text-bright);">' +
                  '<input type="checkbox" id="profile-presence-mute-toggle" onchange="window._onPresenceMuteToggle(this.checked)" style="width:16px;height:16px;cursor:pointer;">' +
                  '<span>🔕 Silenciar presença temporariamente</span>' +
                '</label>' +
                '<div id="profile-presence-mute-days-wrap" style="display:none;align-items:center;gap:6px;font-size:0.75rem;color:var(--text-muted);">' +
                  '<span>por</span>' +
                  '<input type="number" id="profile-presence-mute-days" min="1" max="365" value="7" style="width:64px;padding:6px 8px;border-radius:8px;background:var(--bg-darker);border:1px solid var(--border-color);color:var(--text-bright);font-size:0.82rem;text-align:center;">' +
                  '<span>dias</span>' +
                '</div>' +
              '</div>' +
              '<p style="font-size:0.68rem;color:var(--text-muted);margin:4px 0 0 0;">Enquanto silenciado, suas presenças não são criadas e você não aparece para amigos. Volta automático ao fim do prazo.</p>' +
              '<input type="hidden" id="profile-presence-visibility" value="friends">' +
            '</div>' +
            '<div style="height: 1px; background: var(--border-color); margin: 1rem 0;"></div>' +
            // Locais de preferência (mapa)
            '<div class="form-group" style="margin-bottom: 1rem;">' +
              '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">' + _t('profile.labelLocations') + '</label>' +
              '<p style="font-size: 0.7rem; color: var(--text-muted); margin: 0 0 8px 0;">' + _t('profile.locationsDesc') + '</p>' +
              '<div style="position:relative;display:flex;gap:6px;margin-bottom:8px;">' +
                '<input type="text" id="profile-location-search" class="form-control" placeholder="' + _t('profile.searchLocation') + '" style="flex:1;box-sizing:border-box;font-size:0.8rem;" autocomplete="off">' +
                '<button type="button" id="profile-locate-btn" onclick="window._profileLocateMe()" class="btn btn-sm" style="background:var(--primary-color);color:#fff;border:none;white-space:nowrap;font-size:0.75rem;padding:6px 10px;" title="Usar minha localização">📍</button>' +
                '<div id="profile-location-suggestions" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:9999;background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.5);max-height:240px;overflow-y:auto;margin-top:4px;"></div>' +
              '</div>' +
              '<div id="profile-map-container" style="width:100%;height:200px;border-radius:10px;overflow:hidden;border:1px solid var(--border-color);margin-bottom:8px;background:#1a1a2e;"></div>' +
              '<div id="profile-locations-list" style="display:flex;flex-direction:column;gap:4px;"></div>' +
              '<input type="hidden" id="profile-edit-ceps" value="">' +
            '</div>' +
            '<div style="height: 1px; background: var(--border-color); margin: 1rem 0;"></div>' +
            // Social toggle + notification filters
            '<div style="margin-bottom: 1rem;">' +
              '<label class="form-label" style="display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.8rem;">' + _t('profile.socialCommsTitle') + '</label>' +
              '<p style="font-size: 0.75rem; color: var(--text-muted); margin: 0 0 8px 0;">' + _t('profile.socialCommsDesc') + '</p>' +
              (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-accept-friends', label: _t('profile.acceptFriends'), icon: '🤝', checked: true, color: '#3b82f6' }) : '') +
              '<div style="margin-top:6px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">' + _t('profile.receiveComms') + '</div>' +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-filter-todas', label: _t('profile.notifAll'), icon: '🟢', checked: true, color: '#22c55e', onchange: 'window._onNotifyToggle(\'todas\')' }) : '') +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-filter-importantes', label: _t('profile.notifImportant'), icon: '🟡', checked: true, color: '#f59e0b', onchange: 'window._onNotifyToggle(\'importantes\')' }) : '') +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-filter-fundamentais', label: _t('profile.notifFundamental'), icon: '🔴', checked: true, color: '#ef4444', onchange: 'window._onNotifyToggle(\'fundamentais\')' }) : '') +
              '</div>' +
              '<div style="margin-top:10px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">' + _t('profile.notifChannels') + '</div>' +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-notify-platform', label: _t('profile.notifPlatform'), icon: '🔔', checked: true }) : '') +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-notify-email', label: _t('profile.notifEmail'), icon: '✉️', checked: true, color: '#3b82f6' }) : '') +
                (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-notify-whatsapp', label: _t('profile.notifWhatsApp'), icon: '💬', checked: false, color: '#25d366' }) : '') +
              '</div>' +
            '</div>' +
            '<div style="height: 1px; background: var(--border-color); margin: 1rem 0;"></div>' +
            // Theme — exclusive buttons
            '<div class="form-group" style="margin-bottom: 1rem;">' +
              '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">' + _t('profile.labelAppearance') + '</label>' +
              '<div id="theme-btn-group" style="display:flex;gap:6px;flex-wrap:nowrap;">' +
                // v1.0.5-beta: idem fix #2 — pills nascem desativadas, _applyProfileThemeUI ativa o atual.
                '<button type="button" data-theme-val="dark" onclick="window._setProfileTheme(\'dark\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">' + _t('profile.themeNight') + '</button>' +
                '<button type="button" data-theme-val="light" onclick="window._setProfileTheme(\'light\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">' + _t('profile.themeLight') + '</button>' +
                '<button type="button" data-theme-val="sunset" onclick="window._setProfileTheme(\'sunset\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">' + _t('profile.themeSunset') + '</button>' +
                '<button type="button" data-theme-val="ocean" onclick="window._setProfileTheme(\'ocean\')" class="btn btn-sm" style="flex:1;font-size:0.72rem;padding:7px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">' + _t('profile.themeOcean') + '</button>' +
              '</div>' +
            '</div>' +
            // Visual Hints toggle
            '<div style="margin-bottom: 1rem;">' +
              (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-hints-enabled', label: _t('profile.visualHints'), icon: '💡', checked: true, color: '#fbbf24', desc: _t('profile.hintsDesc') }) : '') +
            '</div>' +
            // Language selector — flag buttons
            '<div style="margin-bottom: 1rem;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<label class="form-label" style="font-size: 0.8rem; font-weight: 600; margin: 0; flex-shrink: 0;">' + _t('profile.language') + '</label>' +
                '<div style="display:flex;gap:6px;flex-shrink:0;" id="profile-lang-flags">' +
                  '<button type="button" onclick="if(typeof window._setLang===\'function\'){window._setLang(\'pt\');document.querySelectorAll(\'#profile-lang-flags button\').forEach(function(b){b.style.opacity=\'0.4\';b.style.transform=\'scale(1)\';b.style.boxShadow=\'none\'});this.style.opacity=\'1\';this.style.transform=\'scale(1.15)\';this.style.boxShadow=\'0 0 8px rgba(251,191,36,0.4)\'}" style="font-size:1.4rem;background:none;border:2px solid ' + (window._lang === 'pt' ? '#fbbf24' : 'transparent') + ';border-radius:8px;padding:3px 6px;cursor:pointer;opacity:' + (window._lang === 'pt' ? '1' : '0.4') + ';transform:scale(' + (window._lang === 'pt' ? '1.15' : '1') + ');transition:all 0.2s;' + (window._lang === 'pt' ? 'box-shadow:0 0 8px rgba(251,191,36,0.4)' : '') + '" title="Português">🇧🇷</button>' +
                  '<button type="button" onclick="if(typeof window._setLang===\'function\'){window._setLang(\'en\');document.querySelectorAll(\'#profile-lang-flags button\').forEach(function(b){b.style.opacity=\'0.4\';b.style.transform=\'scale(1)\';b.style.boxShadow=\'none\'});this.style.opacity=\'1\';this.style.transform=\'scale(1.15)\';this.style.boxShadow=\'0 0 8px rgba(251,191,36,0.4)\'}" style="font-size:1.4rem;background:none;border:2px solid ' + (window._lang === 'en' ? '#fbbf24' : 'transparent') + ';border-radius:8px;padding:3px 6px;cursor:pointer;opacity:' + (window._lang === 'en' ? '1' : '0.4') + ';transform:scale(' + (window._lang === 'en' ? '1.15' : '1') + ');transition:all 0.2s;' + (window._lang === 'en' ? 'box-shadow:0 0 8px rgba(251,191,36,0.4)' : '') + '" title="English">🇺🇸</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            // Meus locais — conta separada do perfil de jogador. Acesso via
            // CTA "Cadastrar meu local" em #place ou via hash #my-venues direto.
            // Buttons
            /* Salvar/Sair buttons moved to sticky header */ '' +
            '<div style="text-align: center; padding: 0.5rem 0 0.5rem;">' +
              '<button type="button" class="btn btn-ghost btn-micro" onclick="window._confirmDeleteAccount()" style="text-decoration:underline;">' + _t('profile.deleteAccountPerm') + '</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>';
    document.body.appendChild(createInteractiveElement(modalHtml));

    // Setup phone mask
    var phoneInput = document.getElementById('profile-edit-phone');
    var countrySelect = document.getElementById('profile-phone-country');
    if (phoneInput) {
      _setupPhoneMask(phoneInput, '55');
      if (countrySelect) {
        countrySelect.addEventListener('change', function() {
          var digits = phoneInput.getAttribute('data-digits') || '';
          phoneInput.value = _formatPhoneDisplay(digits, this.value);
        });
      }
      // v1.3.41-beta: auto-ativa WhatsApp toggle quando usuário digita um celular válido
      phoneInput.addEventListener('input', function() {
        var digits = (phoneInput.getAttribute('data-digits') || '').replace(/\D/g,'');
        if (digits.length >= 8) {
          var waToggle = document.getElementById('profile-notify-whatsapp');
          // Só ativa automaticamente se ainda não foi explicitamente desativado
          // (ou seja, se o toggle ainda está desligado). Não sobrescreve escolha manual.
          if (waToggle && !waToggle.checked) {
            var cu = window.AppStore && window.AppStore.currentUser;
            if (!cu || cu.notifyWhatsApp !== false) {
              waToggle.checked = true;
            }
          }
        }
      });
    }

    // Notification filter toggles: todas (green), importantes (yellow), fundamentais (red)
    // todas ON = receive everything; importantes ON = important + fundamental; fundamentais ON = fundamental only
    // Cascade: todas ON → imp+fund ON; todas OFF keeps imp/fund as-is; fund OFF → confirm warning
    window._applyNotifyFilterUI = function(level) {
      var todasEl = document.getElementById('profile-filter-todas');
      var impEl = document.getElementById('profile-filter-importantes');
      var funEl = document.getElementById('profile-filter-fundamentais');
      if (todasEl) todasEl.checked = (level === 'todas');
      if (impEl) impEl.checked = (level === 'todas' || level === 'importantes');
      if (funEl) funEl.checked = true; // fundamentais always on by default
      if (level === 'none') {
        if (todasEl) todasEl.checked = false;
        if (impEl) impEl.checked = false;
        if (funEl) funEl.checked = false;
      }
    };

    window._onNotifyToggle = function(which) {
      var todasEl = document.getElementById('profile-filter-todas');
      var impEl = document.getElementById('profile-filter-importantes');
      var funEl = document.getElementById('profile-filter-fundamentais');
      if (!todasEl || !impEl || !funEl) return;

      if (which === 'todas') {
        if (todasEl.checked) {
          // Turning ON todas → auto-enable importantes + fundamentais
          impEl.checked = true;
          funEl.checked = true;
        }
        // Turning OFF todas just means user doesn't want "all" — imp/fund stay as-is
      } else if (which === 'importantes') {
        if (impEl.checked) {
          // Turning ON importantes → also turn on fundamentais (it's a subset)
          funEl.checked = true;
        }
        // Turning OFF importantes → also turn off todas
        if (!impEl.checked) todasEl.checked = false;
      } else if (which === 'fundamentais') {
        if (!funEl.checked) {
          // Warn before disabling fundamentais
          if (typeof showConfirmDialog === 'function') {
            showConfirmDialog(
              _t('auth.disableFundTitle'),
              _t('auth.disableFundMsg'),
              function() {
                // Confirmed: disable all
                funEl.checked = false;
                impEl.checked = false;
                todasEl.checked = false;
              },
              function() {
                // Cancelled: revert
                funEl.checked = true;
              }
            );
            // Revert immediately (dialog is async) — confirmed callback will re-set
            funEl.checked = true;
            return;
          }
        }
        // Turning OFF fundamentais → also off importantes and todas
        if (!funEl.checked) {
          impEl.checked = false;
          todasEl.checked = false;
        }
      }
    };

    // ─── Profile Theme Buttons ──────────────────────────────────────────────
    var _themeColors = { dark: '#6366f1', light: '#f59e0b', sunset: '#ef4444', ocean: '#0ea5e9' };

    window._setProfileTheme = function(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('scoreplace_theme', theme); } catch(e) {}
      if (typeof window._applyThemeIcon === 'function') window._applyThemeIcon(theme);
      window._applyProfileThemeUI(theme);
      // v0.17.89: persist theme to Firestore (mesma lógica de _toggleTheme).
      // Sem isso, mudar tema dentro do perfil só afetava localStorage —
      // próximo loadUserProfile (token refresh, abrir em outro device,
      // reload limpando cache) re-aplicava o `profile.theme` salvo
      // anteriormente no Firestore, sobrescrevendo a escolha do usuário.
      try {
        var cu = window.AppStore && window.AppStore.currentUser;
        var uid = cu && (cu.uid || cu.email);
        if (cu) cu.theme = theme;
        if (uid && window.FirestoreDB && window.FirestoreDB.saveUserProfile) {
          window.FirestoreDB.saveUserProfile(uid, { theme: theme }).catch(function() {});
        }
      } catch (e) {}
    };

    window._applyProfileThemeUI = function(theme) {
      var group = document.getElementById('theme-btn-group');
      if (!group) return;
      var btns = group.querySelectorAll('button[data-theme-val]');
      btns.forEach(function(btn) {
        var val = btn.getAttribute('data-theme-val');
        var isActive = (val === theme);
        var color = _themeColors[val] || '#6366f1';
        btn.style.background = isActive ? color : 'transparent';
        btn.style.color = isActive ? '#fff' : 'var(--text-muted)';
        btn.style.border = isActive ? ('2px solid ' + color) : '1.5px solid var(--border-color)';
        btn.style.boxShadow = isActive ? ('0 0 10px ' + color + '40') : 'none';
        btn.style.fontWeight = isActive ? '700' : '500';
      });
    };

    // ─── Presence visibility + mute toggles ─────────────────────────────────
    var _presenceVisColors = { friends: '#3b82f6', public: '#22c55e', off: '#ef4444' };

    window._setPresenceVisibility = function(val) {
      var hidden = document.getElementById('profile-presence-visibility');
      if (hidden) hidden.value = val;
      window._applyPresenceVisibilityUI(val);
    };
    window._applyPresenceVisibilityUI = function(val) {
      var hidden = document.getElementById('profile-presence-visibility');
      if (hidden) hidden.value = val;
      var group = document.getElementById('presence-visibility-group');
      if (!group) return;
      group.querySelectorAll('button[data-pv]').forEach(function(btn) {
        var v = btn.getAttribute('data-pv');
        var isActive = (v === val);
        var color = _presenceVisColors[v] || '#6366f1';
        btn.style.background = isActive ? color : 'transparent';
        btn.style.color = isActive ? '#fff' : 'var(--text-muted)';
        btn.style.border = isActive ? ('2px solid ' + color) : '1.5px solid var(--border-color)';
        btn.style.boxShadow = isActive ? ('0 0 10px ' + color + '40') : 'none';
        btn.style.fontWeight = isActive ? '700' : '500';
      });
    };

    // Mute is now a simple toggle + days input. Reflect UI state from whatever
    // the profile currently holds; expiration is enforced at load time.
    window._onPresenceMuteToggle = function(checked) {
      var wrap = document.getElementById('profile-presence-mute-days-wrap');
      if (wrap) wrap.style.display = checked ? 'flex' : 'none';
    };

    window._applyPresenceMuteUI = function(state) {
      // state = { active: boolean, days: number }
      var toggle = document.getElementById('profile-presence-mute-toggle');
      var daysWrap = document.getElementById('profile-presence-mute-days-wrap');
      var daysInput = document.getElementById('profile-presence-mute-days');
      if (toggle) toggle.checked = !!(state && state.active);
      if (daysWrap) daysWrap.style.display = (state && state.active) ? 'flex' : 'none';
      if (daysInput && state && state.days) daysInput.value = state.days;
    };

    // Translate a days count into absolute ms timestamp. 0 = no mute.
    window._presenceMuteToUntil = function(days) {
      var n = parseInt(days, 10);
      if (!n || n < 1) return 0;
      if (n > 365) n = 365;
      return Date.now() + n * 24 * 3600 * 1000;
    };

    // ─── Profile Map: location picker ────────────────────────────────────────
    window._profileLocations = window._profileLocations || [];
    var _profileMap = null;
    var _profileMarkers = [];
    var _profilePlacesLib = null;

    window._initProfileMap = async function() {
      var container = document.getElementById('profile-map-container');
      if (!container || !window.google || !window.google.maps) return;
      try {
        var { Map } = await google.maps.importLibrary('maps');
        var { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
        _profilePlacesLib = await google.maps.importLibrary('places');

        // Default center: São Paulo or first saved location
        var locs = window._profileLocations || [];
        var center = locs.length > 0
          ? { lat: locs[0].lat, lng: locs[0].lng }
          : { lat: -23.55, lng: -46.63 };
        var zoom = locs.length > 0 ? 12 : 10;

        _profileMap = new Map(container, {
          center: center,
          zoom: zoom,
          mapId: 'scoreplace-profile-map',
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          colorScheme: 'DARK'
        });

        // Click on map to add pin
        _profileMap.addListener('click', function(e) {
          if (!e.latLng) return;
          var lat = e.latLng.lat();
          var lng = e.latLng.lng();
          // Reverse geocode to get label
          _reverseGeocode(lat, lng, function(label) {
            _addProfileLocation({ lat: lat, lng: lng, label: label || (lat.toFixed(4) + ', ' + lng.toFixed(4)) });
          });
        });

        // Render existing pins
        _renderProfileMarkers();
        _renderProfileLocationsList();

        // Setup search
        _setupProfileSearch();
      } catch (e) {
        window._warn('[profile-map] init error:', e);
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.75rem;">' + _t('auth.mapUnavailable') + '</div>';
      }
    };

    function _reverseGeocode(lat, lng, callback) {
      if (!window.google || !window.google.maps) { callback(null); return; }
      var geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
        if (status === 'OK' && results && results[0]) {
          // Try to get a short label: neighborhood, sublocality, or formatted
          var comps = results[0].address_components || [];
          var neighborhood = '', city = '', short = '';
          comps.forEach(function(c) {
            if (c.types.indexOf('sublocality_level_1') !== -1 || c.types.indexOf('neighborhood') !== -1) neighborhood = c.long_name;
            if (c.types.indexOf('administrative_area_level_2') !== -1 || c.types.indexOf('locality') !== -1) city = c.long_name;
            if (c.types.indexOf('postal_code') !== -1) short = c.long_name;
          });
          var label = neighborhood ? (neighborhood + (city ? ', ' + city : '')) : (results[0].formatted_address || '');
          if (label.length > 60) label = label.substring(0, 57) + '...';
          callback(label);
        } else {
          callback(null);
        }
      });
    }

    function _addProfileLocation(loc) {
      if (!loc || !loc.lat || !loc.lng) return;
      // Max 5 locations
      var locs = window._profileLocations || [];
      if (locs.length >= 5) {
        if (typeof showNotification === 'function') showNotification(_t('auth.venueLimit'), _t('auth.venueLimitMsg'), 'warning');
        return;
      }
      // v0.16.66: dedup primário por placeId (Google) quando AMBOS têm — ID
      // estável vence margem de 200m em coordenadas. Mas se ambos têm placeId
      // e são DIFERENTES, são entidades distintas mesmo em coords próximas
      // (Google é preciso o suficiente pra diferenciar venues vizinhos).
      // Fallback de coordenadas só roda quando ao menos um lado é legacy
      // (sem placeId — clique no mapa, _locateMe, profile antigo).
      var isDup = locs.some(function(l) {
        if (loc.placeId && l.placeId) return loc.placeId === l.placeId;
        return Math.abs(l.lat - loc.lat) < 0.002 && Math.abs(l.lng - loc.lng) < 0.002;
      });
      if (isDup) {
        if (typeof showNotification === 'function') showNotification(_t('auth.venueDuplicate'), _t('auth.venueDuplicateMsg'), 'info');
        return;
      }
      // v0.16.66: aproveita TODOS os campos do Google quando disponíveis
      // (placeId, name, address, city). Preferreds com placeId real (ChIJ...)
      // permitem que _resolvePreferredVenue chame VenueDB.loadVenue diretamente
      // (sem fallback de matching por nome/coords) e que o widget de amigos
      // dedup-e venues por ID estável em vez de coordenadas. Preferreds
      // sem placeId (clique no mapa, _locateMe sem reverse-establishment)
      // continuam funcionando via synthetic `pref_lat_lng` em _prefSyntheticPid.
      var entry = { lat: loc.lat, lng: loc.lng, label: loc.label || '' };
      if (loc.placeId) entry.placeId = loc.placeId;
      if (loc.name) entry.name = loc.name;
      if (loc.address) entry.address = loc.address;
      if (loc.city) entry.city = loc.city;
      locs.push(entry);
      window._profileLocations = locs;
      _renderProfileMarkers();
      _renderProfileLocationsList();
      _syncCepsFromLocations();
    }

    window._removeProfileLocation = function(idx) {
      var locs = window._profileLocations || [];
      if (idx >= 0 && idx < locs.length) {
        locs.splice(idx, 1);
        window._profileLocations = locs;
        _renderProfileMarkers();
        _renderProfileLocationsList();
        _syncCepsFromLocations();
      }
    };

    function _renderProfileMarkers() {
      // Clear existing markers
      _profileMarkers.forEach(function(m) { m.map = null; });
      _profileMarkers = [];
      if (!_profileMap) return;

      var locs = window._profileLocations || [];
      var bounds = new google.maps.LatLngBounds();

      locs.forEach(function(loc, idx) {
        var pin = document.createElement('div');
        pin.style.cssText = 'width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700;cursor:pointer;';
        pin.textContent = String(idx + 1);

        var marker = new google.maps.marker.AdvancedMarkerElement({
          map: _profileMap,
          position: { lat: loc.lat, lng: loc.lng },
          content: pin,
          title: loc.label || ''
        });
        _profileMarkers.push(marker);
        bounds.extend({ lat: loc.lat, lng: loc.lng });
      });

      if (locs.length > 1) {
        _profileMap.fitBounds(bounds, { top: 20, right: 20, bottom: 20, left: 20 });
      } else if (locs.length === 1) {
        _profileMap.setCenter({ lat: locs[0].lat, lng: locs[0].lng });
        _profileMap.setZoom(13);
      }
    }

    function _renderProfileLocationsList() {
      var listEl = document.getElementById('profile-locations-list');
      if (!listEl) return;
      var locs = window._profileLocations || [];
      if (locs.length === 0) {
        listEl.innerHTML = '<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:6px;">' + _t('auth.noLocationAdded') + '</div>';
        return;
      }
      // v0.16.66: quando a entry vem do Google (tem placeId), exibe o nome
      // em destaque + endereço em segunda linha + badge "📍 Google" — comunica
      // visualmente que esse preferred terá ficha rica (ID estável, dedup
      // confiável, matching com venue cadastrado, ✕ inline, etc.). Entries
      // legacy só com label seguem renderizando como antes.
      listEl.innerHTML = locs.map(function(loc, idx) {
        var primary = loc.name || loc.label || '';
        var secondary = loc.name && loc.address ? loc.address : '';
        var hasGoogle = !!loc.placeId;
        var badge = hasGoogle
          ? '<span style="font-size:0.55rem;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35);color:#10b981;padding:1px 5px;border-radius:6px;font-weight:700;flex-shrink:0;" title="Local do Google — ficha completa">📍 Google</span>'
          : '';
        var titleAttr = window._safeHtml((primary || '') + (secondary ? '\n' + secondary : ''));
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;">' +
          '<span style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:0.65rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (idx + 1) + '</span>' +
          '<div style="flex:1;min-width:0;" title="' + titleAttr + '">' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<span style="font-size:0.74rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;">' + window._safeHtml(primary) + '</span>' +
              badge +
            '</div>' +
            (secondary ? '<div style="font-size:0.65rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px;">' + window._safeHtml(secondary) + '</div>' : '') +
          '</div>' +
          '<button type="button" onclick="window._removeProfileLocation(' + idx + ')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;padding:2px 4px;line-height:1;flex-shrink:0;" title="Remover">&times;</button>' +
        '</div>';
      }).join('');
    }

    function _syncCepsFromLocations() {
      // Keep hidden CEP field updated for backward compat
      // (not critical — distance matching is the primary method now)
      var cepsEl = document.getElementById('profile-edit-ceps');
      if (cepsEl) {
        var labels = (window._profileLocations || []).map(function(l) { return l.label || ''; });
        cepsEl.value = labels.join(', ');
      }
    }

    var _profileSearchSetup = false;
    function _setupProfileSearch() {
      var input = document.getElementById('profile-location-search');
      var sugBox = document.getElementById('profile-location-suggestions');
      if (!input || !sugBox || _profileSearchSetup) return;
      _profileSearchSetup = true;

      // Proactively load Places library
      if (typeof google !== 'undefined' && google.maps && google.maps.importLibrary) {
        google.maps.importLibrary('places').then(function() {
          _profilePlacesLib = true;
        }).catch(function() {});
      }

      // Dynamic search: 2 char minimum (era 3) + 150ms debounce (era 300ms)
      // — resposta mais imediata conforme o usuário digita. Abaixo de 2
      // chars a API devolve ruído; 2+ já começa a retornar bairros/POIs
      // relevantes. Debounce reduzido cobre digitação rápida sem spammar
      // o Places API.
      var _debounce = null;
      input.addEventListener('input', function() {
        clearTimeout(_debounce);
        var query = input.value.trim();
        if (query.length < 2) { sugBox.style.display = 'none'; return; }
        _debounce = setTimeout(function() { _searchProfileLocation(query); }, 150);
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { sugBox.style.display = 'none'; }
      });

      // Close on blur (with delay so mousedown click registers first)
      input.addEventListener('blur', function() {
        setTimeout(function() { sugBox.style.display = 'none'; }, 200);
      });

      // Reopen on focus if there are results (min matches input handler: 2+)
      input.addEventListener('focus', function() {
        if (input.value.trim().length >= 2 && sugBox.children.length > 0) {
          sugBox.style.display = 'block';
        }
      });
    }

    async function _searchProfileLocation(query) {
      var sugBox = document.getElementById('profile-location-suggestions');
      if (!sugBox) return;
      // Lazy-load places lib if not yet available
      if (!_profilePlacesLib && window.google && window.google.maps) {
        try { await google.maps.importLibrary('places'); _profilePlacesLib = true; } catch(e) {}
      }
      if (!_profilePlacesLib) {
        sugBox.innerHTML = '<div style="padding:10px 14px;color:#94a3b8;font-size:0.8rem;">Carregando API do Google...</div>';
        sugBox.style.display = 'block';
        return;
      }

      try {
        var request = {
          input: query,
          includedRegionCodes: ['br'],
          includedPrimaryTypes: ['establishment', 'geocode'],
          language: 'pt-BR'
        };
        var result = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        var suggestions = result.suggestions || [];
        if (suggestions.length === 0) {
          sugBox.innerHTML = '<div style="padding:10px 14px;color:#94a3b8;font-size:0.8rem;">Nenhum resultado encontrado</div>';
          sugBox.style.display = 'block';
          return;
        }

        sugBox.innerHTML = '';
        suggestions.slice(0, 5).forEach(function(s, i) {
          var pred = s.placePrediction;
          if (!pred) return;
          var main = pred.mainText ? pred.mainText.text : '';
          var secondary = pred.secondaryText ? pred.secondaryText.text : '';

          var item = document.createElement('div');
          item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);transition:background 0.15s;';
          item.innerHTML = '<div style="color:var(--text-bright);font-size:0.85rem;font-weight:500;">📍 ' + window._safeHtml(main) + '</div>' +
            (secondary ? '<div style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;">' + window._safeHtml(secondary) + '</div>' : '');

          item.addEventListener('mouseenter', function() { item.style.background = 'rgba(129,140,248,0.15)'; });
          item.addEventListener('mouseleave', function() { item.style.background = 'transparent'; });
          item.addEventListener('mousedown', function(e) {
            e.preventDefault(); // Prevent blur from hiding suggestions
            _selectProfileSuggestion(pred);
            sugBox.style.display = 'none';
          });

          sugBox.appendChild(item);
        });

        sugBox.style.display = 'block';
      } catch (e) {
        window._warn('[profile-map] search error:', e);
        sugBox.innerHTML = '<div style="padding:10px 14px;color:#f87171;font-size:0.8rem;">' + _t('auth.locationSearchError', {msg: window._safeHtml(e.message || 'API indisponível')}) + '</div>';
        sugBox.style.display = 'block';
      }
    }

    async function _selectProfileSuggestion(prediction) {
      try {
        var place = prediction.toPlace();
        // v0.16.66: campos expandidos pra capturar TODA a info do Google.
        // Antes só pegava location+displayName+formattedAddress; faltavam id
        // (placeId estável) e addressComponents (pra extrair city). Sem placeId,
        // o preferred virava label-only com synthetic `pref_lat_lng` — quebrava
        // dedup (v0.16.63), ✕ inline (v0.16.65) e matching com ficha de venue.
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id', 'addressComponents'] });
        var lat = place.location.lat();
        var lng = place.location.lng();
        var name = place.displayName || '';
        var addr = place.formattedAddress || '';
        var pid = place.id || '';
        // Extrai cidade (mesmo padrão do venue-owner.js _selectPlace).
        var city = '';
        if (place.addressComponents) {
          for (var i = 0; i < place.addressComponents.length; i++) {
            var comp = place.addressComponents[i];
            if ((comp.types || []).indexOf('administrative_area_level_2') !== -1) { city = comp.longText || comp.shortText; break; }
            if ((comp.types || []).indexOf('locality') !== -1) { city = comp.longText || comp.shortText; break; }
          }
        }
        // Label combinado (display visual). Mantido pra retro-compat com
        // _renderProfileLocationsList legado e _syncCepsFromLocations.
        var label = name + (addr ? ' — ' + addr : '');
        if (label.length > 60) label = label.substring(0, 57) + '...';
        _addProfileLocation({
          lat: lat, lng: lng, label: label,
          placeId: pid, name: name, address: addr, city: city
        });
        // Clear search
        var input = document.getElementById('profile-location-search');
        if (input) input.value = '';
        // Pan map
        if (_profileMap) {
          _profileMap.panTo({ lat: lat, lng: lng });
          _profileMap.setZoom(14);
        }
      } catch (e) {
        window._warn('[profile-map] select error:', e);
      }
    }

    window._profileLocateMe = function() {
      if (!navigator.geolocation) {
        if (typeof showNotification === 'function') showNotification(_t('auth.geoError'), _t('auth.geoNotSupported'), 'warning');
        return;
      }
      var btn = document.getElementById('profile-locate-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          if (btn) { btn.disabled = false; btn.textContent = '📍'; }
          _reverseGeocode(lat, lng, function(label) {
            _addProfileLocation({ lat: lat, lng: lng, label: label || _t('auth.myLocation') });
            if (_profileMap) {
              _profileMap.panTo({ lat: lat, lng: lng });
              _profileMap.setZoom(14);
            }
          });
        },
        function(err) {
          if (btn) { btn.disabled = false; btn.textContent = '📍'; }
          if (typeof showNotification === 'function') showNotification(_t('auth.geoError'), _t('auth.geoFailed'), 'warning');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    };
    // ─── End Profile Map ──────────────────────────────────────────────────────

    // Re-renderiza o avatar do perfil enquanto o usuário digita o nome —
    // pra que iniciais reflitam imediatamente o que ele tá editando.
    // v1.8.27: upload de foto de perfil — abre FileReader, converte para
    // base64 e atualiza o avatar localmente. O save persiste em Firebase Storage
    // (quando disponível) ou como base64 no Firestore (fallback).
    window._handleProfilePhotoUpload = function(input) {
      if (!input || !input.files || !input.files[0]) return;
      var file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        if (typeof showNotification === 'function') showNotification('Arquivo muito grande', 'Máximo 5 MB para foto de perfil.', 'warning');
        input.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        var rawDataUrl = e.target.result;
        // Abrir editor de crop/zoom (círculo pra foto de perfil)
        function _applyPhoto(dataUrl) {
          var avatarEl = document.getElementById('profile-avatar');
          if (avatarEl) avatarEl.src = dataUrl;
          var cu = window.AppStore && window.AppStore.currentUser;
          if (cu) { cu.photoURL = dataUrl; cu._pendingPhotoUpload = dataUrl; }
          if (typeof showNotification === 'function') showNotification('Foto atualizada', 'Clique em Salvar para confirmar.', 'success');
        }
        if (typeof window._openImageCropEditor === 'function') {
          window._openImageCropEditor(rawDataUrl,
            { shape: 'circle', size: 400, title: '📸 Ajustar foto de perfil' },
            _applyPhoto
          );
        } else {
          _applyPhoto(rawDataUrl);
        }
      };
      reader.readAsDataURL(file);
      input.value = '';
    };

    window._refreshProfileAvatarFromName = function() {
      var nameEl = document.getElementById('profile-edit-name');
      var avatarEl = document.getElementById('profile-avatar');
      if (!nameEl || !avatarEl) return;
      var cu = window.AppStore && window.AppStore.currentUser;
      var hasRealPhoto = cu && cu.photoURL && typeof cu.photoURL === 'string' && cu.photoURL.indexOf('dicebear.com') === -1;
      if (hasRealPhoto) return; // foto Google/Apple não muda com nome
      var nm = (nameEl.value || '').trim() || '?';
      avatarEl.src = (typeof window._profileAvatarUrl === 'function')
        ? window._profileAvatarUrl(nm, '', 60)
        : ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(nm) + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=60');
    };

    // v0.16.9: reescrita do save de perfil, do zero.
    //
    // ── Helper: detecta e mescla conta antiga de celular ──────────────────
    // Quando o usuário salva um phone no perfil, verifica no Firestore se
    // existe outro doc de usuário com o mesmo phone (conta phone-auth anterior).
    // Se encontrar, oferece mesclagem via Cloud Function mergePhoneAccount.
    window._checkPhoneAccountMerge = function(phone, currentUid) {
      if (!phone || !currentUid) return;
      if (!window.FirestoreDB || !window.FirestoreDB.db) return;
      var db = window.FirestoreDB.db;
      db.collection('users')
        .where('phone', '==', phone)
        .limit(5)
        .get()
        .then(function(snap) {
          var oldDoc = null;
          snap.forEach(function(doc) {
            if (doc.id !== currentUid && !doc.data().mergedInto) {
              oldDoc = doc;
            }
          });
          if (!oldDoc) return;
          var oldData = oldDoc.data();
          var oldName = oldData.displayName || oldData.name || '';
          var label = oldName ? ' (nome: ' + oldName + ')' : '';
          var confirmMsg = 'Encontramos uma conta anterior vinculada a este celular' + label + '.\n\nDeseja mesclar? As inscrições em torneios e o histórico de partidas daquela conta serão transferidos para a sua conta atual.';
          if (typeof showConfirmDialog === 'function') {
            showConfirmDialog(
              '📱 Conta anterior encontrada',
              confirmMsg,
              function() { window._executePhoneAccountMerge(oldDoc.id); },
              function() {},
              'Mesclar contas',
              'Não, ignorar'
            );
          } else if (confirm(confirmMsg)) {
            window._executePhoneAccountMerge(oldDoc.id);
          }
        })
        .catch(function(e) {
          window._warn('[PhoneMerge] query error:', e);
        });
    };

    window._executePhoneAccountMerge = function(oldUid) {
      if (!oldUid) return;
      if (typeof showNotification !== 'undefined') {
        showNotification('Mesclando contas...', 'Aguarde um momento.', 'info');
      }
      try {
        var mergeFunc = firebase.functions().httpsCallable('mergePhoneAccount');
        mergeFunc({ oldUid: oldUid })
          .then(function(result) {
            var r = result.data || {};
            var msg = 'Contas mescladas com sucesso!';
            if (r.tournaments > 0) msg += ' ' + r.tournaments + ' torneio(s) transferido(s).';
            if (r.casualMatches > 0) msg += ' ' + r.casualMatches + ' partida(s) casual transferida(s).';
            if (typeof showNotification !== 'undefined') {
              showNotification('✅ Contas mescladas', msg, 'success');
            }
            if (typeof window.AppStore !== 'undefined' && typeof window.AppStore.loadFromFirestore === 'function') {
              window.AppStore.loadFromFirestore();
            }
          })
          .catch(function(err) {
            var msg = (err && err.message) || 'Erro desconhecido';
            if (typeof showNotification !== 'undefined') {
              showNotification('Erro ao mesclar contas', msg, 'error');
            }
            window._error('[PhoneMerge] merge error:', err);
          });
      } catch(e) {
        window._error('[PhoneMerge] httpsCallable error:', e);
      }
    };

    // v1.7.9-beta: _triggerAccountMerge — ponte genérica chamada quando
    // qualquer fluxo de detecção de duplicata (name conflict, email overlap)
    // encontra candidato a mesclagem. Mostra diálogo de confirmação e delega
    // pra _executePhoneAccountMerge (Cloud Function mergePhoneAccount).
    window._triggerAccountMerge = function(oldUid, oldData) {
      if (!oldUid) return;
      var oldName = (oldData && (oldData.displayName || oldData.name)) || '';
      var label = oldName ? ' (nome: ' + oldName + ')' : '';
      var confirmMsg = 'Encontramos uma conta anterior com os mesmos dados' + label + '.\n\nDeseja mesclar? As inscrições em torneios e o histórico de partidas daquela conta serão transferidos para a sua conta atual.';
      if (typeof showConfirmDialog === 'function') {
        showConfirmDialog(
          '🔀 Conta anterior encontrada',
          confirmMsg,
          function() { window._executePhoneAccountMerge(oldUid); },
          function() {},
          'Mesclar contas',
          'Não, ignorar'
        );
      } else if (confirm(confirmMsg)) {
        window._executePhoneAccountMerge(oldUid);
      }
    };

    // v1.7.9-beta: _profileShowEmailEdit / _profileCancelEmailEdit —
    // expõe/oculta o campo de edição/adição de e-mail no formulário de perfil.
    window._profileShowEmailEdit = function() {
      var wrap = document.getElementById('profile-email-edit-wrap');
      var display = document.getElementById('profile-email-display');
      if (display) display.style.display = 'none';
      if (wrap) wrap.style.display = '';
      var inp = document.getElementById('profile-edit-email');
      if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 60); }
    };

    window._profileCancelEmailEdit = function() {
      var wrap = document.getElementById('profile-email-edit-wrap');
      var display = document.getElementById('profile-email-display');
      var _cu = window.AppStore && window.AppStore.currentUser;
      if (wrap) wrap.style.display = 'none';
      if (display && _cu && _cu.email) display.style.display = '';
      var inp = document.getElementById('profile-edit-email');
      if (inp) inp.value = '';
    };

    // ── Emails vinculados ─────────────────────────────────────────────────
    window._profileRenderLinkedEmails = function() {
      var cu = window.AppStore && window.AppStore.currentUser;
      var container = document.getElementById('profile-linked-emails');
      if (!container || !cu) return;
      var linked = Array.isArray(cu.linkedEmails) ? cu.linkedEmails : [];
      container.innerHTML = linked.map(function(em) {
        return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);">' +
          '<span style="flex:1;font-size:0.82rem;color:var(--text-bright);">✅ ' + window._safeHtml(em) + '</span>' +
          '<button type="button" onclick="window._profileUnlinkEmail(\'' + em.replace(/'/g,"\\'") + '\')" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:0.9rem;padding:0 2px;" title="Remover">×</button>' +
        '</div>';
      }).join('');
    };

    window._profileSendEmailLink = function() {
      var inp = document.getElementById('profile-link-email-input');
      var cu = window.AppStore && window.AppStore.currentUser;
      if (!inp || !cu || !cu.uid) return;
      var email = (inp.value || '').trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (window.showNotification) window.showNotification('E-mail inválido', 'Digite um e-mail válido.', 'warning');
        return;
      }
      if (cu.email && email === cu.email.toLowerCase()) {
        if (window.showNotification) window.showNotification('Mesmo e-mail', 'Este já é o seu e-mail principal.', 'warning');
        return;
      }
      // Salvar intenção no localStorage para detectar quando o link for clicado
      try {
        localStorage.setItem('scoreplace_linkEmailIntent', JSON.stringify({
          ownerUid: cu.uid,
          emailToLink: email,
          requestedAt: Date.now()
        }));
      } catch(e) {}
      // Enviar magic link para o email secundário
      var sendFn = firebase.functions().httpsCallable('sendMagicLink');
      inp.disabled = true;
      if (window.showNotification) window.showNotification('📧 Enviando verificação...', email, 'info');
      sendFn({ email: email })
        .then(function() {
          if (window.showNotification) window.showNotification('✅ Link enviado!', 'Verifique ' + email + ' e clique no link para vincular.', 'success');
          inp.value = '';
          inp.disabled = false;
        })
        .catch(function(err) {
          inp.disabled = false;
          if (window.showNotification) window.showNotification('Erro ao enviar', (err && err.message) || 'Tente novamente.', 'error');
        });
    };

    window._profileUnlinkEmail = function(email) {
      var cu = window.AppStore && window.AppStore.currentUser;
      if (!cu || !cu.uid || !window.FirestoreDB || !window.FirestoreDB.db) return;
      if (!confirm('Remover ' + email + ' dos seus e-mails vinculados?')) return;
      var linked = Array.isArray(cu.linkedEmails) ? cu.linkedEmails.slice() : [];
      var idx = linked.indexOf(email);
      if (idx !== -1) linked.splice(idx, 1);
      cu.linkedEmails = linked;
      window.FirestoreDB.db.collection('users').doc(cu.uid).update({
        linkedEmails: linked
      }).then(function() {
        window._profileRenderLinkedEmails();
        if (window.showNotification) window.showNotification('E-mail removido', email, 'info');
      }).catch(function(e) { window._warn('[LinkedEmail] unlink error:', e); });
    };

    // Detectar link de vinculação ao completar login via magic link
    window._checkEmailLinkIntent = function(signedInEmail) {
      try {
        var raw = localStorage.getItem('scoreplace_linkEmailIntent');
        if (!raw) return;
        var intent = JSON.parse(raw);
        // Expirado (>30 min) ou email não bate
        if (!intent || !intent.ownerUid || !intent.emailToLink) return;
        if (Date.now() - (intent.requestedAt || 0) > 30 * 60 * 1000) {
          localStorage.removeItem('scoreplace_linkEmailIntent');
          return;
        }
        if ((signedInEmail || '').toLowerCase() !== intent.emailToLink.toLowerCase()) return;
        // Email confere — vincular ao ownerUid
        localStorage.removeItem('scoreplace_linkEmailIntent');
        var db = window.FirestoreDB && window.FirestoreDB.db;
        if (!db) return;
        db.collection('users').doc(intent.ownerUid).get().then(function(doc) {
          if (!doc.exists) return;
          var data = doc.data() || {};
          var ownerName = data.displayName || 'Outra conta';
          // Mostrar confirmação para o usuário
          if (typeof showConfirmDialog === 'function') {
            showConfirmDialog(
              '🔗 Vincular e-mail?',
              'O e-mail "' + signedInEmail + '" será vinculado à conta "' + ownerName + '". Confirma?',
              function() {
                var linked = Array.isArray(data.linkedEmails) ? data.linkedEmails.slice() : [];
                if (linked.indexOf(signedInEmail.toLowerCase()) === -1) {
                  linked.push(signedInEmail.toLowerCase());
                }
                db.collection('users').doc(intent.ownerUid).update({ linkedEmails: linked })
                  .then(function() {
                    if (window.showNotification) window.showNotification('✅ E-mail vinculado!', signedInEmail + ' agora faz parte da conta "' + ownerName + '".', 'success');
                  });
              },
              function() { /* cancelou */ },
              'Vincular', 'Cancelar'
            );
          }
        }).catch(function(e) { window._warn('[LinkEmail] confirm error:', e); });
      } catch(e) { window._warn('[LinkEmail] intent check error:', e); }
    };

    // Porque reescrever: a cadeia anterior (auth.js → currentUser → store.js
    // saveUserProfileToFirestore → firebase-db.js saveUserProfile → Firestore
    // set merge) tinha 4 camadas, 3 conversões, 2 "clobber guards"
    // (_writeIfNonEmpty em auth.js, strip empty em store.js) e um round-trip
    // a parte. O diagnóstico da v0.16.8 surfacearia falhas, mas:
    // (1) _hintSystem.enable/disable era chamado INCONDICIONALMENTE a cada
    //     save, mostrando "Dicas ativadas" em cima do toast de diagnóstico;
    // (2) em caso de erro, v0.16.8 fazia `throw e` em store.js — o bloco
    //     de diagnóstico em auth.js NUNCA chegava a rodar;
    // (3) intermediação via currentUser criava janela de race onde o
    //     currentUser podia ter estado inconsistente no momento do save.
    //
    // O novo fluxo: lê form → constrói payload direto (sem passar por
    // currentUser) → grava direto no Firestore → re-lê pra verificar →
    // atualiza currentUser com o que efetivamente persistiu → toast
    // SEMPRE aparece (sucesso ou erro, com versão visível).
    window.saveUserProfile = async function() {
      // Dump state upfront para debug via DevTools — independente de qual guard dispara
      try {
        window._log('[Profile v' + window.SCOREPLACE_VERSION + '] save start',
          'hasAppStore:', !!window.AppStore,
          'hasCurrentUser:', !!(window.AppStore && window.AppStore.currentUser),
          'currentUser:', window.AppStore && window.AppStore.currentUser,
          'hasFirestoreDB:', !!window.FirestoreDB,
          'hasFirestoreDB.db:', !!(window.FirestoreDB && window.FirestoreDB.db)
        );
      } catch(e) {}

      if (!window.AppStore || !window.AppStore.currentUser) {
        if (typeof showNotification !== 'undefined') {
          showNotification('Perfil — erro', '⚠️ Sem sessão ativa · v' + window.SCOREPLACE_VERSION, 'error');
        }
        return;
      }
      var cu = window.AppStore.currentUser;
      // Mesmo fallback histórico do saveUserProfileToFirestore antigo — em
      // alguns caminhos de login, currentUser.uid pode estar vazio mas email
      // existe, e o doc do Firestore é keyed pelo email nesse caso.
      var uid = cu.uid || cu.email;
      if (!uid) {
        if (typeof showNotification !== 'undefined') {
          showNotification('Perfil — erro', '⚠️ Sem UID/email · v' + window.SCOREPLACE_VERSION, 'error');
        }
        return;
      }
      // Retry init on demand — se o script firebase-db.js carregou tarde
      // (ou se firebase.firestore() falhou na primeira tentativa), ensureDb
      // tenta de novo antes de desistir.
      if (!window.FirestoreDB) {
        if (typeof showNotification !== 'undefined') {
          showNotification('Perfil — erro', '⚠️ FirestoreDB ausente (reload a página) · v' + window.SCOREPLACE_VERSION, 'error');
        }
        return;
      }
      if (!window.FirestoreDB.db) {
        if (typeof window.FirestoreDB.ensureDb === 'function') {
          window.FirestoreDB.ensureDb();
        } else {
          try { window.FirestoreDB.init(); } catch (e) {}
        }
      }
      if (!window.FirestoreDB.db) {
        var initErr = window.FirestoreDB.lastInitError || 'causa desconhecida';
        if (typeof showNotification !== 'undefined') {
          showNotification('Perfil — erro', '⚠️ Firestore não inicializado: ' + initErr + ' · v' + window.SCOREPLACE_VERSION, 'error');
        }
        return;
      }

      var _oldDisplayName = cu.displayName || '';

      // ── 1. LER O FORM — snapshot bruto do que o usuário vê ──────────────
      function _v(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
      }
      function _chk(id, dflt) {
        var el = document.getElementById(id);
        return el ? !!el.checked : !!dflt;
      }

      var nameIn = (_v('profile-edit-name') || '').trim();
      var genderIn = _v('profile-edit-gender'); // select value ('', 'feminino', 'masculino', 'outro')
      var birthRaw = _v('profile-edit-birthdate');
      var cityIn = (_v('profile-edit-city') || '').trim();
      var phoneEl = document.getElementById('profile-edit-phone');
      var phoneDigits = (phoneEl && (phoneEl.getAttribute('data-digits') || '')).replace(/\D/g, '');
      var phoneCountry = _v('profile-phone-country') || '55';
      // v1.7.9-beta: email pode ser adicionado/alterado via profile-edit-email
      var emailIn = (_v('profile-edit-email') || '').trim().toLowerCase();
      var sportsArr = Array.isArray(window._profileSelectedSports)
        ? window._profileSelectedSports.slice()
        : [];
      // v1.3.6-beta: skillBySport — habilidade por modalidade.
      // Filtra: só mantém entries de sports atualmente selecionados.
      var skillBySport = {};
      if (window._profileSkillBySport && typeof window._profileSkillBySport === 'object') {
        Object.keys(window._profileSkillBySport).forEach(function(s) {
          if (sportsArr.indexOf(s) !== -1 && window._profileSkillBySport[s]) {
            skillBySport[s] = window._profileSkillBySport[s];
          }
        });
      }
      // defaultCategory foi removido da UI e do Firestore em v1.3.98-beta.
      // Skill por modalidade vive em skillBySport{sport→skill}.
      // Leitores legados (enrollment-report) continuam lendo o campo antigo
      // de docs que já existiam no banco, mas novos saves não escrevem mais.
      var preferredCeps = (_v('profile-edit-ceps') || '').trim();
      var preferredLocations = Array.isArray(window._profileLocations)
        ? window._profileLocations.slice()
        : [];

      var acceptFriends = _chk('profile-accept-friends', true);
      var notifyPlatform = _chk('profile-notify-platform', true);
      var notifyEmail = _chk('profile-notify-email', true);
      var notifyWhatsApp = _chk('profile-notify-whatsapp', false);
      var presenceAutoCheckin = _chk('profile-presence-auto-checkin', false);
      var hintsEnabled = _chk('profile-hints-enabled', true);

      // v1.7.9-beta: auto-enable notifyWhatsApp quando celular está sendo adicionado
      // e auto-enable notifyEmail quando e-mail está sendo adicionado ao perfil.
      var _cuPhoneDigits = (cu.phone || '').replace(/\D/g, '');
      if ((_cuPhoneDigits.length < 8) && (phoneDigits.length >= 8)) {
        // Phone is being newly added — auto-enable WhatsApp notifications
        notifyWhatsApp = true;
      }
      var _savedEmailLower = (cu.email || '').toLowerCase();
      var _emailIsValid = emailIn.length >= 6 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailIn);
      var _emailChanged = _emailIsValid && emailIn !== _savedEmailLower;
      var _emailNewlyAdded = _emailChanged && !_savedEmailLower;
      if (_emailNewlyAdded) {
        // Email is being newly added to a phone-only account — auto-enable email notifications
        notifyEmail = true;
      }

      var notifyLevel = _chk('profile-filter-todas', true)
        ? 'todas'
        : (_chk('profile-filter-importantes', false)
          ? 'importantes'
          : (_chk('profile-filter-fundamentais', false) ? 'fundamentais' : 'none'));

      var presenceVisibility = _v('profile-presence-visibility') || 'friends';
      var muteActive = _chk('profile-presence-mute-toggle', false);
      var muteDays = parseInt(_v('profile-presence-mute-days'), 10);
      if (!muteDays || muteDays < 1) muteDays = 7;
      if (muteDays > 365) muteDays = 365;
      var muteUntil = muteActive
        ? ((typeof window._presenceMuteToUntil === 'function') ? window._presenceMuteToUntil(muteDays) : 0)
        : 0;

      // Converter birthdate: display ("dd/mm/yyyy") → ISO ("yyyy-mm-dd").
      // Se o parse falhar, mantém o valor existente (evita apagar por typo).
      var birthDate = (typeof window._displayDateToIso === 'function')
        ? window._displayDateToIso(birthRaw)
        : birthRaw;
      if (!birthDate && birthRaw && cu.birthDate) birthDate = cu.birthDate;

      // Calcular age a partir do birthDate
      var age = null;
      if (birthDate) {
        var parts = String(birthDate).split('-');
        if (parts.length === 3) {
          var bd = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          var today = new Date();
          age = today.getFullYear() - bd.getFullYear();
          var mDiff = today.getMonth() - bd.getMonth();
          if (mDiff < 0 || (mDiff === 0 && today.getDate() < bd.getDate())) age--;
        }
      }

      // ── 2. NAME FALLBACK — nunca salvar displayName vazio ou genérico ──
      // Usuário apagou o campo sem querer → preserva o anterior.
      // Para phone-only: usa o telefone formatado como identificador.
      var finalName = nameIn;
      if (!finalName || (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(finalName))) {
        // Tenta o nome anterior (se não for genérico)
        if (_oldDisplayName && !(typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(_oldDisplayName))) {
          finalName = _oldDisplayName;
        } else if (phoneDigits.length >= 8) {
          // v1.8.60: usuário phone-only sem nome real → usa telefone formatado
          finalName = (typeof window._formatPhoneDisplay === 'function')
            ? window._formatPhoneDisplay(phoneDigits, phoneCountry || '55')
            : ('+' + (phoneCountry || '55') + phoneDigits);
        } else if (cu.phone) {
          var _phD2 = (typeof window._phoneLocalDigits === 'function')
            ? window._phoneLocalDigits(cu.phone, cu.phoneCountry || '55')
            : String(cu.phone).replace(/\D/g, '');
          if (_phD2.length >= 8) {
            finalName = (typeof window._formatPhoneDisplay === 'function')
              ? window._formatPhoneDisplay(_phD2, cu.phoneCountry || '55')
              : cu.phone;
          }
        } else {
          try {
            var fbUser = (typeof firebase !== 'undefined' && firebase.auth)
              ? firebase.auth().currentUser : null;
            if (fbUser && fbUser.displayName) finalName = fbUser.displayName;
          } catch (e) {}
        }
      }

      // v1.1.3-beta: validação anti-placeholder revertida (estava em v1.1.2).
      // User: 'as pessoas já tem dificuldade de entrar no programa e vc vai
      // implementar uma trava? melhor deixar entrar e depois editamos o
      // nome do usuário.' Trade-off correto: nunca bloquear save de perfil
      // por nome. Organizadores corrigem manualmente nomes ruins via UI.

      // ── 2b. NOME ÚNICO — verifica conflito antes de salvar ──────────────
      // Só verifica quando o nome realmente mudou.
      if (finalName && finalName.toLowerCase() !== (_oldDisplayName || '').toLowerCase()) {
        try {
          var nameLower = finalName.toLowerCase();
          var nameConflictSnap = await window.FirestoreDB.db.collection('users')
            .where('displayName_lower', '==', nameLower)
            .limit(5)
            .get();
          var conflicts = nameConflictSnap.docs.filter(function(d) { return d.id !== uid; });
          if (conflicts.length > 0) {
            // Verifica se algum conflito é candidato a mesclagem (mesmo phone ou email)
            var myPhone = (typeof window._normalizePhoneE164 === 'function' && phoneDigits)
              ? window._normalizePhoneE164(phoneDigits, phoneCountry || '55')
              : phoneDigits;
            var myEmail = (cu.email || '').toLowerCase();
            var mergeCandidate = null;
            for (var ci = 0; ci < conflicts.length; ci++) {
              var cd = conflicts[ci].data() || {};
              var cdPhone = cd.phone || '';
              var cdEmail = (cd.email || cd.email_lower || '').toLowerCase();
              if ((myPhone && cdPhone && myPhone === cdPhone) ||
                  (myEmail && cdEmail && myEmail === cdEmail)) {
                mergeCandidate = { uid: conflicts[ci].id, data: cd };
                break;
              }
            }
            if (mergeCandidate) {
              // Candidato a mesclagem — acionar fluxo existente de merge
              if (typeof window._triggerAccountMerge === 'function') {
                window._triggerAccountMerge(mergeCandidate.uid, mergeCandidate.data);
              }
            } else {
              // Nome em uso por conta distinta — bloquear save
              if (typeof showNotification === 'function') {
                showNotification('Perfil', 'Este nome de exibição já está em uso na plataforma. Escolha outro.', 'error');
              }
              return;
            }
          }
        } catch (nameCheckErr) {
          window._warn('[Profile] unique name check failed (non-blocking):', nameCheckErr);
          // Falha na verificação não bloqueia o save — worst-case: nome duplicado
        }
      }

      // ── 3. CONSTRUIR PAYLOAD — só inclui campos não-vazios ──────────────
      // Regra: Firestore set({merge:true}) preserva campos omitidos. Então
      // CAMPO VAZIO = CAMPO OMITIDO = VALOR EXISTENTE PRESERVADO.
      // Só envia strings/arrays vazias quando é intencional (toggles/defaults).
      // Single source of truth: só o que está no payload vai pro Firestore E
      // pro currentUser, evitando o drift de estado da v0.16.8.
      var payload = {
        updatedAt: new Date().toISOString()
      };

      // Strings: só envia se preenchido
      if (finalName) payload.displayName = finalName;
      if (genderIn) payload.gender = genderIn;          // "" = "Não informar" = preserva
      if (birthDate) payload.birthDate = birthDate;
      if (age != null) payload.age = age;
      if (cityIn) payload.city = cityIn;
      if (phoneDigits) payload.phone = (typeof window._normalizePhoneE164 === 'function')
        ? window._normalizePhoneE164(phoneDigits, phoneCountry || '55')
        : phoneDigits;
      // v1.7.9-beta: include email when user adds/changes it in profile
      if (_emailChanged) {
        payload.email = emailIn;
        payload.email_lower = emailIn;
      }
      // defaultCategory removido — v1.3.98-beta (skill vive em skillBySport)
      if (preferredCeps) payload.preferredCeps = preferredCeps;

      // v1.8.39-beta: foto de perfil — persiste quando usuário fez upload
      // (flag _pendingPhotoUpload setada em _handleProfilePhotoUpload).
      if (cu._pendingPhotoUpload) {
        payload.photoURL = cu._pendingPhotoUpload;
      }

      // Arrays: só envia se tem pelo menos 1 item
      if (sportsArr.length > 0) payload.preferredSports = sportsArr;
      if (preferredLocations.length > 0) payload.preferredLocations = preferredLocations;
      // v1.3.6-beta: skillBySport — só envia se tem pelo menos 1 entrada.
      // Sempre envia o campo (mesmo vazio) pra possibilitar reset quando user
      // deseleciona todas as modalidades — Firestore merge preserva
      // null/undefined, então usar {} explicitamente quando vazio.
      payload.skillBySport = skillBySport;

      // v1.6.1-beta: canRefereeBySport + refereeSports (array para query Firestore).
      var canRefereeBySport = {};
      var refereeSports = [];
      if (window._profileCanRefereeBySport && typeof window._profileCanRefereeBySport === 'object') {
        sportsArr.forEach(function(s) {
          if (window._profileCanRefereeBySport[s]) {
            canRefereeBySport[s] = true;
            refereeSports.push(s);
          }
        });
      }
      payload.canRefereeBySport = canRefereeBySport;
      payload.refereeSports = refereeSports;

      // Booleans / defaults: sempre envia (UI tem valor definido)
      payload.phoneCountry = phoneCountry;
      payload.acceptFriendRequests = acceptFriends;
      payload.notifyPlatform = notifyPlatform;
      payload.notifyEmail = notifyEmail;
      payload.notifyWhatsApp = notifyWhatsApp;
      payload.notifyLevel = notifyLevel;
      payload.presenceVisibility = presenceVisibility;
      payload.presenceMuteDays = muteDays;
      payload.presenceMuteUntil = muteUntil;
      payload.presenceAutoCheckin = presenceAutoCheckin;

      // Denormalizados para lookups case-insensitive
      if (payload.displayName) payload.displayName_lower = String(payload.displayName).toLowerCase();
      // v1.7.9-beta: email_lower — usa payload.email se email está sendo alterado,
      // senão usa cu.email. Evita duplicar se _emailChanged já setou email_lower.
      if (!payload.email_lower && cu.email) payload.email_lower = String(cu.email).toLowerCase();

      // ── 4. INSTRUMENTAÇÃO — tudo visível no console e em window ─────────
      window._log('[Profile v0.16.9] uid:', uid);
      window._log('[Profile v0.16.9] form raw:', {
        name: nameIn, gender: genderIn, birthRaw: birthRaw, city: cityIn,
        phone: phoneDigits, sports: sportsArr
      });
      window._log('[Profile v0.16.9] payload:', JSON.parse(JSON.stringify(payload)));
      window._lastProfileSave = {
        uid: uid,
        version: window.SCOREPLACE_VERSION,
        at: new Date().toISOString(),
        payload: payload,
        fields: Object.keys(payload).sort()
      };

      // ── 5. GRAVAR DIRETO NO FIRESTORE ───────────────────────────────────
      var saveError = null;
      try {
        await window.FirestoreDB.db.collection('users').doc(uid).set(payload, { merge: true });
        window._lastProfileSave.ok = true;
        window._log('[Profile v0.16.9] save ok');
        // v1.8.39-beta: limpar flag de foto pendente após save bem-sucedido
        if (cu._pendingPhotoUpload) {
          delete cu._pendingPhotoUpload;
        }
      } catch (e) {
        saveError = (e && e.message) || String(e);
        window._lastProfileSave.ok = false;
        window._lastProfileSave.error = saveError;
        window._error('[Profile v0.16.9] save FAILED:', e);
      }

      // ── 6. RE-LER PRA CONFIRMAR (round-trip por valor) ──────────────────
      var mismatch = [];
      if (!saveError) {
        try {
          var snap = await window.FirestoreDB.db.collection('users').doc(uid).get();
          var got = snap.exists ? (snap.data() || {}) : {};
          window._lastProfileLoad = {
            uid: uid,
            version: window.SCOREPLACE_VERSION,
            at: new Date().toISOString(),
            hasProfile: snap.exists,
            gender: got.gender,
            city: got.city,
            phone: got.phone,
            birthDate: got.birthDate,
            fields: Object.keys(got).sort(),
            data: got
          };
          // Stable stringify — sorts object keys recursively so that
          // {lat,lng} vs {lng,lat} don't trigger false-positive divergence.
          // Firestore preserves values but NOT key insertion order on read-back.
          function _stableStringify(v) {
            if (v === null || v === undefined) return JSON.stringify(v);
            if (typeof v !== 'object') return JSON.stringify(v);
            if (Array.isArray(v)) {
              return '[' + v.map(_stableStringify).join(',') + ']';
            }
            var keys = Object.keys(v).sort();
            return '{' + keys.map(function(k) {
              return JSON.stringify(k) + ':' + _stableStringify(v[k]);
            }).join(',') + '}';
          }
          Object.keys(payload).forEach(function(k) {
            if (k === 'updatedAt' || k === 'displayName_lower' || k === 'email_lower') return;
            var sent = _stableStringify(payload[k]);
            var gotVal = _stableStringify(got[k]);
            if (sent !== gotVal) {
              mismatch.push({ field: k, sent: payload[k], got: got[k] });
            }
          });
          window._lastProfileSave.mismatch = mismatch;
          window._log('[Profile v0.16.9] readback gender:', got.gender, '· mismatch:', mismatch.length);

          // Atualiza currentUser com o que REALMENTE está no Firestore —
          // single source of truth. Próximo load não vai divergir.
          Object.keys(got).forEach(function(k) { cu[k] = got[k]; });
          cu.name = cu.displayName; // compat com código que ainda lê .name
        } catch (e) {
          window._lastProfileSave.readbackError = (e && e.message) || String(e);
          window._warn('[Profile v0.16.9] readback failed:', e);
        }
      }

      // ── 7. TOAST — sucesso simples; erro/divergência ainda mostram detalhe ──
      // Bugs de persistência foram fechados nas versões anteriores. A partir
      // daqui, sucesso = "Perfil atualizado" sem ruído; só mantemos o toast
      // de diagnóstico quando algo realmente dá errado.
      if (typeof showNotification !== 'undefined') {
        if (saveError) {
          showNotification(
            'Perfil — erro',
            '⚠️ ' + saveError,
            'error'
          );
        } else if (mismatch.length > 0) {
          var desc = mismatch.slice(0, 3).map(function(m) {
            return m.field + ': ' + JSON.stringify(m.sent) + '→' + JSON.stringify(m.got);
          }).join(', ');
          showNotification(
            'Perfil — divergência',
            '⚠️ ' + desc,
            'error'
          );
        } else {
          showNotification(
            'Perfil atualizado',
            'Suas alterações foram salvas.',
            'success'
          );
          // Trophy hook — checa troféus de perfil após salvar com sucesso
          setTimeout(function() {
            if (typeof window._trophyOnProfileSaved === 'function') window._trophyOnProfileSaved();
          }, 500);
          // v1.7.9-beta: se e-mail foi adicionado/alterado, refresh o display do e-mail no perfil
          if (_emailChanged) {
            var _emailDispEl = document.getElementById('profile-email-display');
            var _emailTextEl = document.getElementById('profile-email-text');
            var _emailEditWrap = document.getElementById('profile-email-edit-wrap');
            if (_emailTextEl) _emailTextEl.textContent = emailIn;
            if (_emailDispEl) _emailDispEl.style.display = '';
            if (_emailEditWrap) _emailEditWrap.style.display = 'none';
          }
        }
      }

      // ── 8. HINTS — só toggle quando state REALMENTE mudou ──────────────
      // Antes: enable/disable era chamado incondicionalmente a cada save,
      // gerando toast "Dicas ativadas" que sobrepunha o toast de diagnóstico.
      if (window._hintSystem) {
        var wasDisabled = window._hintSystem.isDisabled ? window._hintSystem.isDisabled() : false;
        var wantDisabled = !hintsEnabled;
        if (wasDisabled !== wantDisabled) {
          if (hintsEnabled) window._hintSystem.enable();
          else window._hintSystem.disable();
        }
      }

      var name = finalName; // compat com código abaixo

      // v1.0.16-beta: sincronizar displayName + photoURL com Firebase Auth.
      // Bug reportado: usuário muda nome no perfil, welcome card mostra
      // "Bem-vindo, Toninho!" (vem de AppStore.currentUser.displayName que
      // foi merged do Firestore) MAS topbar continua mostrando "topi3838"
      // (vem de firebase.auth().currentUser.displayName, do Google OAuth).
      // Quando simulateLoginSuccess re-roda (onAuthStateChanged por token
      // refresh), ele chama _updateTopbarForUser(user) com o user do
      // Firebase Auth que tem o nome STALE — topbar reverte pra topi3838.
      // Fix: chamar firebase.auth().currentUser.updateProfile() pra
      // sincronizar Firebase Auth com Firestore. Best effort — falha é
      // silenciosa (catch) pra não bloquear o save.
      try {
        var fbUser = firebase.auth().currentUser;
        if (fbUser && (fbUser.displayName !== name || fbUser.photoURL !== (window.AppStore.currentUser.photoURL || null))) {
          fbUser.updateProfile({
            displayName: name,
            photoURL: window.AppStore.currentUser.photoURL || null
          }).catch(function(e) { window._warn('[Profile] Firebase Auth updateProfile failed:', e); });
        }
      } catch (e) { window._warn('[Profile] Firebase Auth sync error:', e); }

      // Propagate name change to all tournaments if displayName changed
      if (name && _oldDisplayName && name !== _oldDisplayName) {
        // Save previousDisplayName to Firestore for future auto-fix of orphaned names
        try {
          var user = window.AppStore.currentUser;
          if (user && user.uid && window.FirestoreDB && window.FirestoreDB.db) {
            var _prevNames = Array.isArray(user.previousDisplayNames) ? user.previousDisplayNames.slice() : [];
            if (_prevNames.indexOf(_oldDisplayName) === -1) _prevNames.push(_oldDisplayName);
            // Keep last 5
            if (_prevNames.length > 5) _prevNames = _prevNames.slice(_prevNames.length - 5);
            window.FirestoreDB.db.collection('users').doc(user.uid).update({
              previousDisplayNames: _prevNames
            }).catch(function(e) { window._warn('[Profile] Failed to save previousDisplayNames:', e); });
            window.AppStore.currentUser.previousDisplayNames = _prevNames;
          }
        } catch(e) { window._warn('[Profile] previousDisplayNames error:', e); }

        _propagateNameChange(_oldDisplayName, name);
        // Invalidar cache de foto para o nome antigo E novo — força re-fetch
        // na próxima renderização via _preloadPlayerPhotos
        if (window._playerPhotoCache) {
          delete window._playerPhotoCache[(_oldDisplayName || '').toLowerCase()];
          delete window._playerPhotoCache[(name || '').toLowerCase()];
        }
        // Update auth cache with new name
        try {
          var _ac = JSON.parse(localStorage.getItem('scoreplace_authCache') || '{}');
          _ac.displayName = name;
          localStorage.setItem('scoreplace_authCache', JSON.stringify(_ac));
        } catch(e) {}
      } else if (!saveError && payload.photoURL) {
        // Foto mudou, nome igual — invalidar cache de foto para forçar re-fetch
        if (window._playerPhotoCache) {
          delete window._playerPhotoCache[(name || '').toLowerCase()];
        }
        // Propagar: encontrar participantes por uid e garantir memberUids atualizado
        _propagatePhotoToTournaments(payload.photoURL);
      }

      // Update header UI with new name and photo
      // v1.0.23-beta: iniciais geradas do nome substituem cartoon padrão.
      var photoUrl = (typeof window._profileAvatarUrl === 'function')
        ? window._profileAvatarUrl(name, window.AppStore.currentUser.photoURL, 32)
        : (window.AppStore.currentUser.photoURL || ('https://api.dicebear.com/9.x/initials/svg?seed=' + encodeURIComponent(name || '?') + '&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=32'));
      var firstName = name ? name.split(' ')[0] : _t('auth.defaultUser');
      var btnLogin = document.getElementById('btn-login');
      if (btnLogin) {
        var avatarImg = btnLogin.querySelector('img');
        var nameSpan = btnLogin.querySelector('span[style*="font-weight"]');
        if (avatarImg) avatarImg.src = photoUrl;
        if (nameSpan) nameSpan.textContent = firstName;
      }

      // ── 9. PHONE MERGE — detectar conta anterior com mesmo celular ──────
      // Roda em background (não bloqueia o fechamento do perfil).
      // Só dispara quando o save foi bem-sucedido e o usuário preencheu phone.
      if (!saveError && payload.phone) {
        setTimeout(function() {
          if (typeof window._checkPhoneAccountMerge === 'function') {
            window._checkPhoneAccountMerge(payload.phone, uid);
          }
        }, 800);
      }

      // ── 9b. EMAIL MERGE — detectar conta anterior com mesmo e-mail ──────
      // v1.7.9-beta: só dispara quando o e-mail foi adicionado/alterado neste save.
      // Busca outras contas com o mesmo email_lower e oferece mesclagem via dialog.
      if (!saveError && _emailChanged && window.FirestoreDB && window.FirestoreDB.db) {
        setTimeout(function() {
          window.FirestoreDB.db.collection('users')
            .where('email_lower', '==', emailIn)
            .limit(5)
            .get()
            .then(function(snap) {
              var oldDoc = null;
              snap.forEach(function(doc) {
                if (doc.id !== uid && !doc.data().mergedInto) oldDoc = doc;
              });
              if (!oldDoc) return;
              var oldData = oldDoc.data();
              var oldName = oldData.displayName || '';
              var label = oldName ? ' (nome: ' + oldName + ')' : '';
              var confirmMsg = 'Encontramos uma conta anterior vinculada a este e-mail' + label + '.\n\nDeseja mesclar? As inscrições em torneios e o histórico de partidas daquela conta serão transferidos para a sua conta atual.';
              if (typeof showConfirmDialog === 'function') {
                showConfirmDialog(
                  '📧 Conta anterior encontrada',
                  confirmMsg,
                  function() { window._executePhoneAccountMerge(oldDoc.id); },
                  function() {},
                  'Mesclar contas',
                  'Não, ignorar'
                );
              } else if (confirm(confirmMsg)) {
                window._executePhoneAccountMerge(oldDoc.id);
              }
            })
            .catch(function(e) { window._warn('[EmailMerge] query error:', e); });
        }, 1200);
      }

      // v1.3.5-beta: usar helper centralizado que trata tanto rota #profile
      // quanto modal-overlay legacy.
      if (typeof window._closeProfilePage === 'function') {
        window._closeProfilePage();
      } else {
        var _modalEl = document.getElementById('modal-profile');
        if (_modalEl) _modalEl.classList.remove('active');
      }
      // v1.0.12-beta: defensivo — se modal-login ficou com .active escondido
      // atrás do modal-profile (bug do close não disparar pós-Google login),
      // fecha aqui pra evitar que ele apareça quando o profile fecha. Bug
      // reportado: "toda vez que salva o perfil a tela de login volta".
      if (typeof _forceCloseLoginModal === 'function') {
        _forceCloseLoginModal();
      }
      // v0.16.7: toast genérico "Perfil atualizado" removido — substituído
      // pelo toast de diagnóstico acima que mostra campos + versão.

      // v1.0.0-beta-3: re-render a view ATUAL (qualquer que seja) usando
      // _softRefreshView. Cobre #place (preferredLocations + preferredSports),
      // #dashboard (welcome card), #tournaments etc. Antes só dashboard era
      // tratado — bug reportado: adicionar local preferido no perfil exigia
      // sair de #place e voltar pra ver o card aparecer.
      if (typeof window._softRefreshView === 'function') {
        window._softRefreshView();
      } else {
        // Fallback pre-_softRefreshView
        var container = document.getElementById('view-container');
        if (container && window.location.hash.includes('dashboard') && typeof renderDashboard === 'function') {
          renderDashboard(container);
        }
      }
    };
  }
}

// ─── Top-level fallbacks pra rota #profile ──────────────────────────────
// v1.3.29-beta: window.renderProfilePage e window._closeProfilePage estavam
// DENTRO de simulateLoginSuccess (linhas 2074-2176), o que significava que
// só existiam DEPOIS de um login bem-sucedido. Usuário com auth cache que
// landed direto em #profile via deep-link, ou caso o login terminasse num
// path que não disparou simulateLoginSuccess (race), via "perfil não abre"
// — router chamava renderProfilePage undefined → silent fail → tela em
// branco / não scrola / save errado (na verdade tela errada).
//
// Aqui definimos as 2 funções no escopo top-level. Se simulateLoginSuccess
// rodar depois e re-atribuir, não tem problema — mesma implementação,
// idempotente.

if (typeof window.renderProfilePage !== 'function') {
  window.renderProfilePage = async function (container) {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) {
      window.location.replace('#dashboard');
      return;
    }
    if (!container) return;

    if (!document.getElementById('modal-profile') && typeof window.setupProfileModal === 'function') {
      window.setupProfileModal();
    }
    var modalEl = document.getElementById('modal-profile');
    var modalInner = modalEl ? modalEl.querySelector('.modal') : null;
    if (!modalInner) {
      if (modalEl) modalEl.remove();
      if (typeof window.setupProfileModal === 'function') window.setupProfileModal();
      modalEl = document.getElementById('modal-profile');
      modalInner = modalEl ? modalEl.querySelector('.modal') : null;
    }
    if (!modalInner) return;

    var _t = window._t || function (k) { return k; };
    // v1.3.29-beta: idem ao primary path — Save compacto + width-constrained.
    var saveBtnHtml = '<button type="button" class="btn btn-primary btn-sm hover-lift" onclick="if(window._spinButton)window._spinButton(this,\'Salvando...\'); if(typeof saveUserProfile===\'function\')saveUserProfile()" style="flex:0 0 auto;width:auto;max-width:120px;background:#10b981;color:#fff;border:1px solid #059669;font-weight:700;padding:7px 14px;border-radius:10px;font-size:0.82rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(16,185,129,0.3);">💾 ' + _t('btn.save') + '</button>';
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
        href: '#dashboard',
        label: 'Voltar',
        middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">' + _t('profile.myProfile') + '</span>',
        rightHtml: saveBtnHtml,
      })
      : '';

    container.innerHTML = hdr;
    container.appendChild(modalInner);
    // v1.3.29-beta: limpar overflow inline (idem primary path)
    modalInner.style.overflowY = 'visible';
    modalInner.style.overflowX = 'visible';
    modalInner.style.maxHeight = 'none';
    modalInner.style.height = 'auto';
    if (modalEl && modalEl.parentNode === document.body) modalEl.remove();

    setTimeout(function () { if (typeof window._setupProfileSearch === 'function') window._setupProfileSearch(); }, 100);
    setTimeout(function () { if (typeof window._initProfileMap === 'function') window._initProfileMap(); }, 300);

    if (typeof window._populateProfileModalFields === 'function') {
      window._populateProfileModalFields();
    }

    if (window.AppStore && typeof window.AppStore.loadUserProfile === 'function' && cu.uid) {
      try {
        await window.AppStore.loadUserProfile(cu.uid);
        if (window.location.hash === '#profile' && typeof window._populateProfileModalFields === 'function') {
          window._populateProfileModalFields();
        }
      } catch (e) { window._warn('Profile refresh on open failed:', e); }
    }

    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  };
}

if (typeof window._closeProfilePage !== 'function') {
  window._closeProfilePage = function () {
    if (window.location.hash === '#profile') {
      window.location.hash = '#dashboard';
      return;
    }
    var modal = document.getElementById('modal-profile');
    if (modal) modal.classList.remove('active');
  };
}

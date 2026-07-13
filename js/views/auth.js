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

// ── Verificação de email secundário (?verify_email=TOKEN) ────────────────────
// Quando o usuário clica no link de confirmação enviado pela função _profileSendEmailLink,
// lê o token, busca no Firestore, adiciona o email a linkedEmails[] do dono.
(function _handleEmailVerification() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('verify_email');
    if (!token) return;

    // Limpar parâmetro da URL imediatamente
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '/#dashboard');
    }

    // Aguardar Firestore estar pronto
    var tries = 0;
    var resolve = function() {
      var db = window.FirestoreDB && window.FirestoreDB.db;
      if (!db) {
        if (tries++ < 60) return setTimeout(resolve, 100);
        return;
      }
      db.collection('emailVerifications').doc(token).get().then(function(doc) {
        if (!doc.exists) {
          if (window.showNotification) window.showNotification('Link inválido', 'Este link de verificação não existe ou já foi usado.', 'error');
          return;
        }
        var data = doc.data() || {};
        if (data.verified) {
          if (window.showNotification) window.showNotification('Já confirmado', data.emailToVerify + ' já está vinculado.', 'info');
          return;
        }
        if (new Date(data.expiresAt) < new Date()) {
          if (window.showNotification) window.showNotification('Link expirado', 'Solicite uma nova verificação no seu perfil.', 'warning');
          return;
        }
        var ownerUid = data.ownerUid;
        var emailToVerify = data.emailToVerify;
        // Adicionar à linkedEmails do dono
        db.collection('users').doc(ownerUid).get().then(function(userDoc) {
          var userData = userDoc.exists ? (userDoc.data() || {}) : {};
          var linked = Array.isArray(userData.linkedEmails) ? userData.linkedEmails.slice() : [];
          if (linked.indexOf(emailToVerify) === -1) linked.push(emailToVerify);
          return db.collection('users').doc(ownerUid).update({ linkedEmails: linked });
        }).then(function() {
          // Marcar token como usado
          return doc.ref.update({ verified: true, verifiedAt: new Date().toISOString() });
        }).then(function() {
          if (window.showNotification) {
            window.showNotification('✅ E-mail confirmado!', emailToVerify + ' foi vinculado à sua conta.', 'success');
          }
          // Atualizar currentUser em memória se for o dono
          var cu = window.AppStore && window.AppStore.currentUser;
          if (cu && cu.uid === ownerUid) {
            var linked2 = Array.isArray(cu.linkedEmails) ? cu.linkedEmails.slice() : [];
            if (linked2.indexOf(emailToVerify) === -1) linked2.push(emailToVerify);
            cu.linkedEmails = linked2;
            if (typeof window._profileRenderLinkedEmails === 'function') window._profileRenderLinkedEmails();
          }
        }).catch(function(e) {
          window._warn('[EmailVerify] update error:', e);
          if (window.showNotification) window.showNotification('Erro ao vincular', e && e.message, 'error');
        });
      }).catch(function(e) {
        window._warn('[EmailVerify] read error:', e);
      });
    };
    setTimeout(resolve, 500);
  } catch(e) {}
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
        // Só chama auth() quando o APP estiver inicializado (fb.apps.length) —
        // chamar antes do initializeApp lança "No Firebase App created".
        var _appReady = window.firebase && window.firebase.apps && window.firebase.apps.length;
        var auth = (_appReady && window.firebase.auth) ? window.firebase.auth() : null;
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

// v3.0.59: União de contas por e-mail — ?mh=TOKEN gerado por requestEmailMerge.
// Clicar no link (que só chegou no e-mail da conta B) PROVA a posse dessa conta.
// Chama confirmEmailMerge → funde A+B mantendo a conta MAIS ANTIGA. Depois desloga
// e manda entrar de novo: a credencial fica na conta sobrevivente e o login (celular
// OU e-mail) cai nela via resolveMergedLogin. Sem precisar logar na outra conta.
(function _handleEmailMergeLink() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('mh');
    if (!token) return;
    var bg = '#0f172a', fg = '#10b981';
    document.documentElement.style.background = bg;
    var showStatus = function(emoji, title, subtitle, isError, extraHtml) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;flex-direction:column;gap:14px;padding:24px;text-align:center;">' +
        '<div style="font-size:2.4rem;line-height:1;">' + emoji + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:' + (isError ? '#ef4444' : fg) + ';">' + title + '</div>' +
        (subtitle ? '<div style="font-size:0.85rem;color:#94a3b8;max-width:360px;line-height:1.5;">' + subtitle + '</div>' : '') +
        (extraHtml || '') +
        '<a href="/" style="margin-top:8px;color:' + fg + ';font-size:0.85rem;text-decoration:none;border:1px solid ' + fg + ';padding:8px 18px;border-radius:8px;">Ir pro app</a>' +
        '</div>';
    };
    showStatus('🔗', 'Unindo suas contas...', 'Confirmando e juntando seus dados numa conta só');
    var tries = 0;
    var run = function() {
      var _appReady = window.firebase && window.firebase.apps && window.firebase.apps.length;
      var fns = (_appReady && window.firebase.functions) ? window.firebase.functions() : null;
      if (!fns) {
        if (tries++ < 80) return setTimeout(run, 100); // até 8s
        showStatus('⚠️', 'Não foi possível carregar', 'Verifique a conexão e abra o link de novo.', true);
        return;
      }
      fns.httpsCallable('confirmEmailMerge')({ token: token }).then(function(res) {
        var d = (res && res.data) || {};
        if (!d.ok) { showStatus('⚠️', 'Não deu pra unir', 'O link pode ter expirado ou já foi usado. Peça de novo no perfil.', true); return; }
        var auth = (window.firebase && window.firebase.auth) ? window.firebase.auth() : null;
        var finish = function() {
          showStatus('✅', 'Contas unidas!', 'Pronto — tudo numa conta só (a mais antiga). Entre de novo com seu <b>e-mail</b> OU <b>celular</b> pra continuar.', false);
          setTimeout(function() { window.location.replace('/#dashboard'); }, 2200);
        };
        // Desloga a sessão atual (pode ser a conta absorvida) e manda reentrar.
        if (auth && auth.signOut) { auth.signOut().then(finish).catch(finish); } else { finish(); }
      }).catch(function(err) {
        var msg = (err && (err.message || err.code)) || 'falha';
        if (typeof window._captureException === 'function') { try { window._captureException(err, { area: 'mhMerge' }); } catch (_e) {} }
        showStatus('⚠️', 'Não deu pra unir', window._safeHtml ? window._safeHtml(String(msg)) : String(msg), true);
      });
    };
    run();
  } catch (e) { if (window._error) window._error('[mhMerge] handler crashed:', e); }
})();

// ── Autenticação por celular pelo botão do WhatsApp (?gv=TOKEN) ──────────────
// v2.4.24: alternativa ao link do e-mail quando o e-mail de confirmação não
// chega (ex.: UOL filtra). A pessoa toca no botão que mandamos no WhatsApp →
// o Cloud Function verifyPhoneGateToken marca emailVerified + salva o telefone
// e devolve um custom token pra logar direto, sem digitar nada.
(function _handlePhoneGateToken() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('gv');
    if (!token) return;

    var bg = '#0f172a';
    var fg = '#25d366';
    document.documentElement.style.background = bg;
    var showStatus = function(emoji, title, subtitle, isError) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;flex-direction:column;gap:14px;padding:24px;text-align:center;">' +
        '<div style="font-size:2.4rem;line-height:1;">' + emoji + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:' + (isError ? '#ef4444' : fg) + ';">' + title + '</div>' +
        (subtitle ? '<div style="font-size:0.85rem;color:#94a3b8;max-width:340px;line-height:1.5;">' + subtitle + '</div>' : '') +
        (isError ? '<a href="/" style="margin-top:8px;color:' + fg + ';font-size:0.85rem;text-decoration:none;border:1px solid ' + fg + ';padding:8px 18px;border-radius:8px;">Voltar ao início</a>' : '') +
        '</div>';
    };

    showStatus('💬', 'Confirmando sua conta...', 'Validando o código do WhatsApp');

    var tries = 0;
    (function resolve() {
      var fb = window.firebase;
      // IMPORTANTE: esperar o APP inicializar (fb.apps.length), não só o SDK.
      // firebase.initializeApp() roda DEPOIS destes IIFEs no mesmo auth.js — se
      // chamarmos fb.functions() antes do init, lança "No Firebase App created"
      // e a tela mostra "Erro ao carregar" (bug do reset por link, v2.6.12).
      if (!fb || !fb.auth || !fb.functions || !(fb.apps && fb.apps.length)) {
        if (tries++ < 80) return setTimeout(resolve, 100); // até 8s
        showStatus('⚠️', 'Não foi possível carregar', 'Verifique sua conexão e tente abrir o link de novo.', true);
        return;
      }
      var fn;
      try { fn = fb.functions().httpsCallable('verifyPhoneGateToken'); }
      catch (e) { showStatus('⚠️', 'Erro ao carregar', 'Tente abrir o link de novo.', true); return; }
      fn({ token: token }).then(function(res) {
        var d = (res && res.data) || {};
        if (!d.ok) {
          if (d.reason === 'expired') { showStatus('⏱️', 'Link expirado', 'O código do WhatsApp expirou. Abra o app e peça um novo.', true); return; }
          showStatus('🔗', 'Link inválido', 'Esse link não é mais válido. Abra o app e tente de novo.', true);
          return;
        }
        if (d.customToken) {
          fb.auth().signInWithCustomToken(d.customToken).then(function() {
            showStatus('✅', 'Conta confirmada!', 'Entrando no app...');
            setTimeout(function() { window.location.replace('/#dashboard'); }, 500);
          }).catch(function() {
            showStatus('✅', 'Conta confirmada!', 'Volte ao app e faça login com seu e-mail e senha.', false);
          });
        } else {
          showStatus('✅', 'Conta confirmada!', 'Volte ao app e faça login com seu e-mail e senha.', false);
        }
      }).catch(function(err) {
        if (window._error) window._error('[gvToken] failed:', err);
        showStatus('⚠️', 'Erro ao confirmar', 'Tente abrir o link de novo. Se persistir, entre pelo app.', true);
      });
    })();
  } catch (e) {
    if (window._error) window._error('[gvToken] handler crashed:', e);
  }
})();

// ── Redefinir senha pelo botão do WhatsApp (?pr=TOKEN) ───────────────────────
// v2.4.97: a pessoa pediu reset por celular e tocou no botão do WhatsApp →
// verifyPasswordResetPhoneToken devolve um custom token; logamos a conta e
// mostramos a tela de nova senha (e-mail pré-preenchido) direto aqui.
(function _handlePasswordResetToken() {
  try {
    var qs = (typeof URLSearchParams === 'function') ? new URLSearchParams(window.location.search) : null;
    var token = qs && qs.get('pr');
    if (!token) return;

    var bg = '#0f172a';
    var fg = '#25d366';
    document.documentElement.style.background = bg;
    var showStatus = function(emoji, title, subtitle, isError) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:' + bg + ';color:#fff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;flex-direction:column;gap:14px;padding:24px;text-align:center;">' +
        '<div style="font-size:2.4rem;line-height:1;">' + emoji + '</div>' +
        '<div style="font-size:1.05rem;font-weight:700;color:' + (isError ? '#ef4444' : fg) + ';">' + title + '</div>' +
        (subtitle ? '<div style="font-size:0.85rem;color:#94a3b8;max-width:340px;line-height:1.5;">' + subtitle + '</div>' : '') +
        (isError ? '<a href="/" style="margin-top:8px;color:' + fg + ';font-size:0.85rem;text-decoration:none;border:1px solid ' + fg + ';padding:8px 18px;border-radius:8px;">Voltar ao início</a>' : '') +
        '</div>';
    };

    showStatus('💬', 'Validando…', 'Confirmando seu link de redefinição');

    var tries = 0;
    (function resolve() {
      var fb = window.firebase;
      // IMPORTANTE: esperar o APP inicializar (fb.apps.length), não só o SDK.
      // firebase.initializeApp() roda DEPOIS destes IIFEs no mesmo auth.js — se
      // chamarmos fb.functions() antes do init, lança "No Firebase App created"
      // e a tela mostra "Erro ao carregar" (bug do reset por link, v2.6.12).
      if (!fb || !fb.auth || !fb.functions || !(fb.apps && fb.apps.length)) {
        if (tries++ < 80) return setTimeout(resolve, 100); // até 8s
        showStatus('⚠️', 'Não foi possível carregar', 'Verifique sua conexão e tente abrir o link de novo.', true);
        return;
      }
      var fn;
      try { fn = fb.functions().httpsCallable('verifyPasswordResetPhoneToken'); }
      catch (e) { showStatus('⚠️', 'Erro ao carregar', 'Tente abrir o link de novo.', true); return; }
      fn({ token: token }).then(function(res) {
        var d = (res && res.data) || {};
        if (!d.ok) {
          if (d.reason === 'expired') { showStatus('⏱️', 'Link expirado', 'O código do WhatsApp expirou. Abra o app e peça um novo.', true); return; }
          showStatus('🔗', 'Link inválido', 'Esse link não é mais válido. Abra o app e tente de novo.', true);
          return;
        }
        if (d.customToken) {
          fb.auth().signInWithCustomToken(d.customToken).then(function() {
            if (typeof window._resetShowNewPassword === 'function') {
              window._resetShowNewPassword(d.email || '');
            } else {
              showStatus('✅', 'Quase lá!', 'Volte ao app pra definir sua nova senha.', false);
            }
          }).catch(function() {
            showStatus('⚠️', 'Erro ao entrar', 'Tente abrir o link de novo.', true);
          });
        } else {
          showStatus('✅', 'Confirmado!', 'Volte ao app pra definir sua nova senha.', false);
        }
      }).catch(function(err) {
        if (window._error) window._error('[prToken] failed:', err);
        showStatus('⚠️', 'Erro ao confirmar', 'Tente abrir o link de novo. Se persistir, entre pelo app.', true);
      });
    })();
  } catch (e) {
    if (window._error) window._error('[prToken] handler crashed:', e);
  }
})();

// ── Confirmar posse do celular pelo link do WhatsApp (?pv=TOKEN) ──────────────
// v2.6.x: quem abre o link JÁ LOGADO na conta principal confirma o número em 1
// toque (sem digitar código). Precisa da sessão principal — se não estiver
// logado, guarda o token e processa após o login. Self-contained (não depende do
// código do perfil). Fluxo: verifyPhoneOwnershipToken → custom token da conta de
// telefone → instância secundária (prova) → mergePhoneAccount (dryRun → reivindica
// se número novo, ou pede confirmação se for unir contas).
window._handlePhoneOwnershipLink = function () {
  try {
    var token = null;
    try {
      var qs = new URLSearchParams(window.location.search);
      token = qs.get('pv') || null;
    } catch (e) {}
    if (!token) { try { token = sessionStorage.getItem('sp_pvToken') || null; } catch (e) {} }
    if (!token || window._pvHandling) return;
    var fb = window.firebase;
    if (!fb || !fb.auth || !fb.functions) return;
    var cu = window.AppStore && window.AppStore.currentUser;
    function ov(html) {
      var o = document.getElementById('pv-overlay');
      if (!o) { o = document.createElement('div'); o.id = 'pv-overlay'; document.body.appendChild(o); }
      o.style.cssText = 'position:fixed;inset:0;z-index:100061;background:rgba(0,0,0,0.62);display:flex;align-items:center;justify-content:center;padding:24px;';
      o.innerHTML = '<div style="max-width:360px;width:100%;background:var(--bg-card,#0f172a);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:22px;text-align:center;color:var(--text-bright,#fff);font-size:0.9rem;line-height:1.5;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' + html + '</div>';
      return o;
    }
    function close() { var o = document.getElementById('pv-overlay'); if (o) o.remove(); }
    if (!cu || !cu.uid) {
      try { sessionStorage.setItem('sp_pvToken', token); } catch (e) {}
      ov('<div style="font-size:1.8rem;">📱</div><div style="margin-top:8px;">Pra confirmar este celular, <b>entre na sua conta</b> primeiro.</div><button onclick="if(window.openModal)openModal(\'modal-login\')" style="margin-top:14px;background:#25d366;color:#0a1f12;border:none;padding:9px 18px;border-radius:10px;font-weight:800;cursor:pointer;">Entrar</button>');
      return;
    }
    window._pvHandling = true;
    try { sessionStorage.removeItem('sp_pvToken'); } catch (e) {}
    try { history.replaceState(null, '', window.location.pathname + window.location.hash); } catch (e) {}
    ov('<div style="font-size:1.8rem;">📱</div><div style="margin-top:8px;">Confirmando seu celular…</div>');
    var survivor = cu.uid;
    fb.functions().httpsCallable('verifyPhoneOwnershipToken')({ token: token }).then(function (res) {
      var d = (res && res.data) || {};
      if (!d.ok || !d.customToken) {
        ov('<div style="font-size:1.8rem;">⚠️</div><div style="margin-top:8px;color:#fca5a5;">' + (d.reason === 'expired' ? 'Esse link expirou. Peça um novo no app.' : 'Link inválido. Tente pelo app.') + '</div><button onclick="document.getElementById(\'pv-overlay\').remove()" style="margin-top:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 18px;border-radius:10px;cursor:pointer;">Fechar</button>');
        window._pvHandling = false;
        return;
      }
      var cfg = fb.app().options;
      var sapp = fb.apps.find(function (a) { return a.name === 'profilephone'; }) || fb.initializeApp(cfg, 'profilephone');
      try { sapp.auth().setPersistence(fb.auth.Auth.Persistence.NONE); } catch (e) {}
      sapp.auth().signInWithCustomToken(d.customToken).then(function (cred) {
        var phoneUser = cred.user;
        function setStatus(html) { ov(html); }
        function callMerge(dry) {
          return phoneUser.getIdToken().then(function (proof) {
            return fb.auth().currentUser.getIdToken().then(function (mainTok) {
              return fetch('https://us-central1-scoreplace-app.cloudfunctions.net/mergePhoneAccount', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mainTok },
                body: JSON.stringify({ data: { oldUid: phoneUser.uid, proofIdToken: proof, dryRun: !!dry } })
              });
            });
          }).then(function (r) { return r.json(); }).then(function (j) { return (j && j.result) || (j && j.error ? { _error: j.error } : null); });
        }
        function done(merged) {
          try { sapp.auth().signOut(); } catch (e) {}
          setStatus('<div style="font-size:1.8rem;">✅</div><div style="margin-top:8px;">' + (merged ? 'Contas unidas e celular vinculado!' : 'Celular verificado e vinculado!') + '</div>');
          setTimeout(function () { try { window.location.hash = '#profile'; } catch (e) {} window.location.reload(); }, 1500);
        }
        function fail(m) { try { sapp.auth().signOut(); } catch (e) {} window._pvHandling = false; setStatus('<div style="font-size:1.8rem;">⚠️</div><div style="margin-top:8px;color:#fca5a5;">Não foi possível: ' + (window._safeHtml ? window._safeHtml(String(m || 'erro')) : 'erro') + '</div><button onclick="document.getElementById(\'pv-overlay\').remove()" style="margin-top:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 18px;border-radius:10px;cursor:pointer;">Fechar</button>'); }
        function eMsg(r) { return (r && r._error && (r._error.message || r._error.status)) || 'erro'; }
        if (phoneUser.uid === survivor) { done(false); return; }
        callMerge(true).then(function (rep) {
          if (!rep || rep._error) { fail(eMsg(rep)); return; }
          if (rep.merged === false) { callMerge(false).then(function (r2) { (r2 && r2.ok) ? done(false) : fail(eMsg(r2)); }); return; }
          var bits = [];
          if (rep.tournaments) bits.push(rep.tournaments + ' torneio(s)');
          if (rep.casualMatches) bits.push(rep.casualMatches + ' partida(s)');
          if (rep.presences) bits.push(rep.presences + ' presença(s)');
          var resumo = bits.length ? (' Vamos trazer ' + bits.join(', ') + ' pra esta conta.') : '';
          var doIt = function () { setStatus('<div style="margin-top:8px;">Unindo as contas…</div>'); callMerge(false).then(function (r2) { (r2 && r2.ok) ? done(true) : fail(eMsg(r2)); }); };
          var cancel = function () { try { sapp.auth().signOut(); } catch (e) {} window._pvHandling = false; close(); };
          if (typeof showConfirmDialog === 'function') {
            showConfirmDialog('🔀 Esse número já é de outra conta sua', 'Esse celular pertence a outra conta sua.' + resumo + ' Quer unir as duas contas?', doIt, cancel, 'Unir contas', 'Cancelar');
          } else { doIt(); }
        }).catch(function (e) { fail(e && (e.code || e.message)); });
      }).catch(function (e) { window._pvHandling = false; ov('<div style="color:#fca5a5;">Erro ao confirmar. Tente pelo app.</div>'); });
    }).catch(function () { window._pvHandling = false; ov('<div style="color:#fca5a5;">Erro. Tente de novo.</div>'); });
  } catch (e) { if (window._error) window._error('[pvLink] crashed:', e); }
};

// ─── Config Firebase: PRODUÇÃO por padrão, STAGING só por hostname ────────────
// scoreplace.app (e qualquer host que NÃO seja o staging, incl. localhost de
// preview) usa exatamente os valores de produção de sempre — INTOCADO. Só o
// ambiente de staging (scoreplace-staging.web.app / .firebaseapp.com) aponta pro
// 2º projeto Firebase isolado (scoreplace-staging), pra testar mudanças
// arriscadas sem encostar nos dados reais do Confra. Ver docs/staging.md.
var _firebaseConfigProd = {
  apiKey: "AIzaSyB7AyOojV_Pm50Kr7bovVY4jVTTNbKOK0A",
  authDomain: "scoreplace-app.firebaseapp.com",
  projectId: "scoreplace-app",
  storageBucket: "scoreplace-app.firebasestorage.app",
  messagingSenderId: "382268772878",
  appId: "1:382268772878:web:7c164933f3beacba4be25f",
  measurementId: "G-PZ25D36JSV"
};
var _firebaseConfigStaging = {
  apiKey: "AIzaSyDCFcrAr49iq3cDAh00Y_LlDLFsNJSsW8k",
  authDomain: "scoreplace-staging.firebaseapp.com",
  projectId: "scoreplace-staging",
  storageBucket: "scoreplace-staging.firebasestorage.app",
  messagingSenderId: "5066307789",
  appId: "1:5066307789:web:b04d0b448b94eb1fb39184"
};
var _isStagingHost = (function () {
  try { return /scoreplace-staging/.test(window.location.hostname || ''); } catch (e) { return false; }
})();
window.SCOREPLACE_ENV = _isStagingHost ? 'staging' : 'prod';
const firebaseConfig = _isStagingHost ? _firebaseConfigStaging : _firebaseConfigProd;

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
    // v2.5.2: e-mails NATIVOS do Firebase (verificação/reset usados só como
    // fallback quando a Cloud Function rica em PT não responde a tempo — ex.:
    // cold start) saíam em INGLÊS por falta de locale. Força pt-BR pra qualquer
    // e-mail do Firebase Auth vir em português.
    try { firebase.auth().languageCode = 'pt-BR'; } catch (_lc) {}
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

    // v1.9.55: nome resolvido pelo helper canônico window._friendlyUserName —
    // MESMA fonte de verdade que a saudação do dashboard. Antes a topbar e a
    // saudação tinham cadeias de fallback DUPLICADAS e divergentes: a topbar
    // caía em email-prefix ("krbenini") e a saudação caía em "Visitante" pro
    // MESMO currentUser sem displayName. Causa-raiz do bug reportado. Unificar
    // num único helper garante que as duas nunca mais divirjam.
    // Constrói o "usuário efetivo" mesclando o arg `user` (firebase) com o cu
    // (AppStore, já com merge do Firestore) — preferindo cu quando o uid bate.
    var _effUser = {
      displayName: effectiveName,
      email: user.email || (cu && cu.email) || '',
      phone: (cu && cu.phone) || user.phoneNumber || '',
      phoneCountry: (cu && cu.phoneCountry) || '55'
    };
    var displayFirstName = (typeof window._friendlyUserName === 'function')
      ? (window._friendlyUserName(_effUser) || _t('auth.defaultUser'))
      : (effectiveName || _t('auth.defaultUser'));
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
    // v2.3.38: o botão de perfil contém SÓ avatar + nome. O logoff virou um
    // botão SEPARADO (irmão, #btn-logoff) — evita logoff acidental ao tocar no
    // perfil e faz a dica do perfil não englobar o logoff.
    btnLogin.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:center; gap:8px;" title="Meu Perfil">' +
        '<img src="' + _sh(photoUrl) + '" style="width:32px; height:32px; border-radius:50%; border: 2px solid var(--primary-color); object-fit:cover;" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
        '<div style="display:none;width:32px;height:32px;border-radius:50%;background:var(--primary-color);color:white;align-items:center;justify-content:center;font-size:0.85rem;flex-shrink:0;">👤</div>' +
        '<span class="user-name-label" style="font-weight:600; font-size:1rem;">' + _sh(window._firstNameOnly ? window._firstNameOnly(displayFirstName) : displayFirstName) + '</span>' +
        _loadingIndicator +
      '</div>';
    if (typeof window._ensureTopbarLogoff === 'function') window._ensureTopbarLogoff(btnLogin);
    // v4.5.44: o perfil logado (avatar + nome + Sair) é mais largo que o botão
    // "Login" — re-avalia o encolhimento da topbar AGORA. Sem isto, quando o
    // login resolve async depois do check de load (comum em PWA já logado a
    // largura fixa), a topbar ficava sem hamburger com labels cortados.
    if (typeof window._checkTopbarWrap === 'function') {
      requestAnimationFrame(function() { window._checkTopbarWrap(); });
    }
  } catch (e) {
    window._warn('[scoreplace-auth] _updateTopbarForUser error:', e);
  }
};

// v2.3.38: botão de logoff SEPARADO do botão de perfil (irmão na profile-group).
window._ensureTopbarLogoff = function(btnLogin) {
  try {
    var grp = btnLogin && btnLogin.parentNode;
    if (!grp) return;
    var lo = document.getElementById('btn-logoff');
    if (!lo) {
      lo = document.createElement('button');
      lo.id = 'btn-logoff';
      lo.setAttribute('aria-label', 'Sair da conta');
      lo.setAttribute('title', 'Sair da Conta');
      lo.setAttribute('onclick', 'if(typeof window._onLogoffBtnClick==="function") window._onLogoffBtnClick(event)');
    }
    lo.className = 'logoff-btn'; // reusa CSS responsivo (flex-shrink + margem)
    // garante que fica logo após o botão de perfil
    if (lo.previousSibling !== btnLogin || lo.parentNode !== grp) {
      if (btnLogin.nextSibling) grp.insertBefore(lo, btnLogin.nextSibling); else grp.appendChild(lo);
    }
    lo.style.cssText = 'background:transparent;border:none;color:var(--danger-color);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:6px;margin-left:8px;opacity:0.8;border-radius:8px;';
    lo.onmouseover = function(){ lo.style.opacity = '1'; };
    lo.onmouseout = function(){ lo.style.opacity = '0.8'; };
    lo.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
  } catch (e) {}
};
window._removeTopbarLogoff = function() {
  var lo = document.getElementById('btn-logoff');
  if (lo && lo.parentNode) lo.parentNode.removeChild(lo);
};
window._onLogoffBtnClick = function(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  if (typeof window._closeHamburger === 'function') window._closeHamburger();
  if (typeof handleLogout === 'function') handleLogout();
};

// ─── Handle redirect result on page load ────────────────────────────────────
// When a user returns from Google's OAuth redirect (Safari/iOS flow), we need
// to capture the credential + access token here (onAuthStateChanged won't give
// us access to the OAuth credential). This also lets us finish pending account-
// link operations just like the popup flow does.
// v2.4.18-beta: `typeof firebase` — identificador NU `firebase` em código
// top-level lança ReferenceError ("Can't find variable: firebase") quando o
// SDK do gstatic.com falha/é bloqueado ao carregar (iOS Safari + Prevent
// Cross-Site Tracking, proxy corporativo, rede móvel instável). Como auth.js
// NÃO é IIFE, esse throw ABORTA todo o resto do arquivo — _verifiedCurrentUser,
// simulateLoginSuccess, _tryAutoEnroll e dezenas de funções deixam de existir →
// inscrição quebra e o botão "Inscrever-se" fica girando pra sempre (Sentry
// SCOREPLACE-WEB-35). Com typeof, o bloco é pulado com segurança e o resto do
// auth.js sempre carrega (sem firebase, a inscrição falha com toast + rollback,
// não com spin infinito).
if (typeof firebase !== 'undefined' && firebase.auth) {
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
          showNotification(_t('auth.loginDone'), _t('auth.welcomeName', {greeting: window._welcomeWord(user), name: user.displayName || user.email}), 'success');
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
          displayName: user.displayName, photoURL: user.photoURL,
          authProvider: 'google.com'
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
// v2.4.18-beta: typeof guard — ver nota no getRedirectResult acima (linha ~495).
// Identificador nu `firebase` aqui abortaria o resto do arquivo se o SDK não
// carregasse.
if (typeof firebase !== 'undefined' && firebase.auth) {
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
    // v1.8.70: mostrar banner de retorno rápido se há cache do usuário
    setTimeout(function() {
      if (typeof window._showQuickReturnBanner === 'function') window._showQuickReturnBanner();
    }, 100);
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
        // v2.1.94: guarda authProvider para o banner "Bem-vindo de volta"
        // mostrar o botão correto (Google, senha ou telefone) sem magic link.
        var _cachedProvider = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || '';
        var _existingCache = JSON.parse(localStorage.getItem('scoreplace_authCache') || '{}');
        localStorage.setItem('scoreplace_authCache', JSON.stringify({
          uid: user.uid, email: user.email,
          displayName: user.displayName, photoURL: user.photoURL,
          authProvider: _cachedProvider || _existingCache.authProvider || ''
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
      // v3.1.44: para os listeners Firestore IMEDIATAMENTE — o token já morreu,
      // então mantê-los anexados durante o grace de 2,5s só gera permission-denied
      // em massa (Sentry WEB-62/63: todos os onSnapshot falhando ao mesmo tempo
      // às 3h, expiração de sessão). Se a auth re-resolver dentro do grace, o
      // simulateLoginSuccess religa tudo (os guards _xUnsubscribe evitam duplicar).
      if (window.AppStore && window.AppStore.stopRealtimeListener) {
        try { window.AppStore.stopRealtimeListener(); } catch (e) {}
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

  // App NATIVO (iOS): o popup/redirect do Firebase é bloqueado no WebView do
  // Capacitor (auth/invalid-cordova-configuration / popup bloqueado). Usa o
  // Google Sign-In NATIVO via plugin @capgo/capacitor-social-login → idToken →
  // firebase signInWithCredential. Mesmo padrão do Sign in with Apple.
  var _capG = window.Capacitor;
  if (_capG && _capG.isNativePlatform && _capG.isNativePlatform()
      && _capG.getPlatform && _capG.getPlatform() === 'ios'
      && _capG.Plugins && _capG.Plugins.SocialLogin) {
    _googleNativeLogin(_capG.Plugins.SocialLogin);
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

      showNotification(_t('auth.loginDone'), _t('auth.welcomeName', {greeting: window._welcomeWord(user), name: user.displayName}), 'success');

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
          displayName: user.displayName, photoURL: user.photoURL,
          authProvider: 'google.com'
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
          msg = 'Sem conexão estável com Google. Tente Wi-Fi ou outra rede. Ou entre com e-mail e senha acima.';
        } else if (code === 'auth/too-many-requests') {
          msg = 'Muitas tentativas. Aguarde alguns minutos e tente de novo. Ou entre com e-mail e senha acima.';
        } else if (code === 'auth/internal-error') {
          msg = 'Erro interno do Firebase. Tente novamente em instantes. Se persistir, entre com e-mail e senha acima.';
        } else if (code === 'auth/unauthorized-domain') {
          msg = 'Domínio não autorizado no Firebase Auth. Reporte: scoreplace.app@gmail.com';
        } else if (code === 'auth/user-disabled') {
          msg = 'Sua conta Google está desativada. Entre em contato: scoreplace.app@gmail.com';
        } else if (code === 'auth/operation-not-allowed') {
          msg = 'Login Google indisponível no momento. Entre com e-mail e senha acima.';
        } else {
          // Genérica + código pra debug/suporte
          msg = 'Não foi possível realizar o login com Google. Tente entrar com e-mail e senha acima.\n\n(código: ' + code + ')';
        }
        showNotification(_t('auth.googleError'), msg, 'error');
      }
    });
}

// ─── Google Sign-In NATIVO (iOS/Capacitor) ──────────────────────────────────
// O popup/redirect do Firebase não funciona no WebView do app; usa o plugin
// @capgo/capacitor-social-login (Google Sign-In nativo) → idToken → Firebase.
var _socialLoginInited = false;
function _googleNativeLogin(plugin) {
  if (typeof window._resetLoginGuard === 'function') window._resetLoginGuard();
  showNotification(_t('auth.connecting'), _t('auth.connectingMsg'), 'info');
  // iOS client ID do GoogleService-Info.plist (não é segredo — vai no app bundle).
  var iosClientId = '382268772878-9uqbuaa7ho56q6d76t7cq5cbcc9edeum.apps.googleusercontent.com';
  var initP = _socialLoginInited
    ? Promise.resolve()
    : plugin.initialize({ google: { iOSClientId: iosClientId } }).then(function(){ _socialLoginInited = true; });
  initP.then(function() {
    return plugin.login({ provider: 'google', options: { scopes: ['profile', 'email'], forcePrompt: true } });
  }).then(function(res) {
    var r = (res && res.result) ? res.result : res;
    var idToken = r && r.idToken;
    var accessToken = r && r.accessToken && (r.accessToken.token || r.accessToken);
    if (!idToken) throw new Error('Google: idToken ausente na resposta do plugin');
    var cred = firebase.auth.GoogleAuthProvider.credential(idToken, (typeof accessToken === 'string' ? accessToken : null));
    return firebase.auth().signInWithCredential(cred);
  }).then(function(result) {
    _onGoogleAuthSuccess(result.user, result);
  }).catch(function(err) {
    var code = String((err && (err.code || err.message)) || 'unknown');
    // cancelamento do usuário — silencioso (iOS: -5/1001/canceled/SIGN_IN_CANCELLED)
    if (/cancel|1001|(^|[^0-9])-5([^0-9]|$)|SIGN_IN_CANCELLED|the user canceled/i.test(code)) return;
    window._error && window._error('[scoreplace-auth] Google nativo erro:', err);
    if (typeof window._captureException === 'function') {
      window._captureException(err, { area: 'googleNativeLogin', code: code });
    }
    if (typeof _handleAccountLinking === 'function' && _handleAccountLinking(err, 'Google')) return;
    showNotification(_t('auth.error'), 'Não foi possível entrar com o Google. Tente Apple, e-mail ou celular.', 'error');
  });
}
window._googleNativeLogin = _googleNativeLogin;

function _onGoogleAuthSuccess(user, result) {
  if (typeof _forceCloseLoginModal === 'function') _forceCloseLoginModal();
  var name = (user && (user.displayName || user.email)) || _t('auth.defaultUser');
  showNotification(_t('auth.loginDone'), _t('auth.welcomeName', { greeting: window._welcomeWord(user), name: name }), 'success');
  if (window.FirestoreDB && window.FirestoreDB.db && user && user.uid) {
    window.FirestoreDB.saveUserProfile(user.uid, {
      authProvider: 'google.com',
      displayName: user.displayName || '',
      photoURL: user.photoURL || ''
    }).catch(function(){});
  }
  try { _tryLinkPendingCredential(result); } catch (e) {
    window._warn && window._warn('[scoreplace-auth] google _tryLinkPendingCredential (non-fatal):', e);
  }
  try {
    localStorage.setItem('scoreplace_authCache', JSON.stringify({
      uid: user.uid, email: user.email,
      displayName: user.displayName, photoURL: user.photoURL, authProvider: 'google.com'
    }));
  } catch (e) {}
  simulateLoginSuccess({ uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL });
}

// ─── Sign in with Apple (Guideline 4.8) ─────────────────────────────────────
// Mostra o botão em iOS-nativo + web (qualquer navegador). Esconde no Android
// nativo (não é exigido lá e o fluxo web é frágil em WebView de arquivos locais).
window._shouldShowAppleBtn = function() {
  try {
    var p = (window.Capacitor && window.Capacitor.getPlatform) ? window.Capacitor.getPlatform() : 'web';
    return p !== 'android';
  } catch (e) { return true; }
};

// Nonce aleatório + SHA-256 (Apple exige o hash; Firebase valida o rawNonce)
function _appleRandomNonce(len) {
  var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';
  var out = '';
  var rnd = new Uint8Array(len || 32);
  (window.crypto || window.msCrypto).getRandomValues(rnd);
  for (var i = 0; i < rnd.length; i++) { out += chars[rnd[i] % chars.length]; }
  return out;
}
function _appleSha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return window.crypto.subtle.digest('SHA-256', data).then(function(buf) {
    var arr = Array.prototype.slice.call(new Uint8Array(buf));
    return arr.map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  });
}

function handleAppleLogin() {
  if (typeof window._resetLoginGuard === 'function') window._resetLoginGuard();

  // Modo dev/local (file://) — simula, igual ao Google
  if (window.location.protocol === 'file:') {
    showNotification(_t('auth.simLogin'), _t('auth.simLoginMsg'), 'info');
    simulateLoginSuccess({ uid: 'local_user', displayName: 'Organizador Teste', email: 'organizador@scoreplace.app', photoURL: '' });
    return;
  }

  if (!firebase || !firebase.auth) {
    showNotification(_t('auth.error'), _t('auth.firebaseError'), 'error');
    return;
  }

  showNotification(_t('auth.connecting'), _t('auth.connectingMsg'), 'info');

  var cap = window.Capacitor;
  var isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var platform = (cap && cap.getPlatform) ? cap.getPlatform() : 'web';
  var nativePlugin = cap && cap.Plugins && cap.Plugins.SignInWithApple;

  // iOS nativo → folha nativa da Apple via plugin + Firebase signInWithCredential
  if (isNative && platform === 'ios' && nativePlugin) {
    var rawNonce = _appleRandomNonce(32);
    _appleSha256Hex(rawNonce).then(function(hashedNonce) {
      return nativePlugin.authorize({ scopes: 'email name', nonce: hashedNonce });
    }).then(function(res) {
      var r = (res && res.response) ? res.response : res;
      var idToken = r && r.identityToken;
      if (!idToken) throw new Error('Apple: identityToken ausente');
      var provider = new firebase.auth.OAuthProvider('apple.com');
      var credential = provider.credential({ idToken: idToken, rawNonce: rawNonce });
      var fullName = [r && r.givenName, r && r.familyName].filter(Boolean).join(' ').trim();
      return firebase.auth().signInWithCredential(credential).then(function(result) {
        // Apple só envia o nome no PRIMEIRO login; grava se ainda não houver.
        var u = result.user;
        if (fullName && u && !u.displayName && u.updateProfile) {
          return u.updateProfile({ displayName: fullName }).catch(function(){}).then(function(){ return { result: result, fullName: fullName }; });
        }
        return { result: result, fullName: fullName };
      });
    }).then(function(pack) {
      _onAppleAuthSuccess(pack.result.user, pack.result, pack.fullName);
    }).catch(function(err) {
      _onAppleAuthError(err);
    });
    return;
  }

  // Web (qualquer navegador) → Firebase popup com provedor Apple
  var webProvider = new firebase.auth.OAuthProvider('apple.com');
  webProvider.addScope('email');
  webProvider.addScope('name');
  firebase.auth().signInWithPopup(webProvider)
    .then(function(result) {
      var name = result.user && (result.user.displayName || '');
      _onAppleAuthSuccess(result.user, result, name);
    })
    .catch(function(error) {
      if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment')) {
        firebase.auth().signInWithRedirect(webProvider).catch(function(err2) {
          _onAppleAuthError(err2);
        });
        return;
      }
      _onAppleAuthError(error);
    });
}
window.handleAppleLogin = handleAppleLogin;

function _onAppleAuthSuccess(user, result, fullName) {
  if (typeof _forceCloseLoginModal === 'function') _forceCloseLoginModal();
  var name = (user && user.displayName) || fullName || (user && user.email) || 'Atleta';
  showNotification(_t('auth.loginDone'), _t('auth.welcomeName', { greeting: window._welcomeWord(user), name: name }), 'success');

  if (window.FirestoreDB && window.FirestoreDB.db && user && user.uid) {
    var payload = { authProvider: 'apple.com' };
    if (user.displayName) payload.displayName = user.displayName;
    else if (fullName) payload.displayName = fullName;
    window.FirestoreDB.saveUserProfile(user.uid, payload).catch(function(){});
  }

  try { _tryLinkPendingCredential(result); } catch (e) {
    window._warn && window._warn('[scoreplace-auth] apple _tryLinkPendingCredential (non-fatal):', e);
  }

  try {
    localStorage.setItem('scoreplace_authCache', JSON.stringify({
      uid: user.uid, email: user.email,
      displayName: user.displayName || fullName || '',
      photoURL: user.photoURL || '', authProvider: 'apple.com'
    }));
  } catch (e) {}

  simulateLoginSuccess({
    uid: user.uid, email: user.email,
    displayName: user.displayName || fullName || '', photoURL: user.photoURL || ''
  });
}

function _onAppleAuthError(error) {
  window._error && window._error('[scoreplace-auth] Apple auth error:', error);
  if (typeof window._captureException === 'function') {
    window._captureException(error, { area: 'appleLogin', code: error && (error.code || error.message) });
  }
  var code = String((error && (error.code || error.message)) || 'unknown');
  // Cancelamento do usuário (nativo retorna 1001/canceled; web popup-closed) — silencioso
  if (/1001|cancel|popup-closed-by-user|cancelled-popup-request/i.test(code)) return;
  if (typeof _handleAccountLinking === 'function' && _handleAccountLinking(error, 'Apple')) return;
  showNotification(_t('auth.error'), 'Não foi possível entrar com a Apple. Tente e-mail, celular ou Google.', 'error');
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
    return { uid: fbUser.uid, email: window._realEmailOrEmpty(fbUser.email) || null, displayName: fbUser.displayName || null, photoURL: fbUser.photoURL || null, phone: fbUser.phoneNumber || null };
  }
  // uid bate: complementar com dados do AppStore (tem campos extras do perfil)
  // mas sobrescrever email com o do Firebase Auth (ground truth).
  // E-mail sintético de conta de celular nunca é tratado como e-mail real.
  return Object.assign({}, cu, {
    email: window._realEmailOrEmpty(fbUser.email) || null,          // Firebase Auth é a fonte da verdade (sintético filtrado)
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
// Exposto como window._ para reuso em outros pontos (fallback de exibição de telefone).
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

// v3.0.x: domínios que NOTORIAMENTE filtram/descartam e-mail transacional no destino
// (Microsoft: Hotmail/Outlook/Live/MSN + UOL/BOL/Terra). Mesmo com Brevo (DKIM/SPF/DMARC
// corretos), a confirmação frequentemente NÃO chega — o provedor dropa, às vezes sem nem
// virar bounce. Usado pra AVISAR proativamente e empurrar Google/celular (sempre funcionam).
window._isUnreliableEmailDomain = function(email) {
  var at = String(email || '').toLowerCase().indexOf('@');
  if (at < 0) return false;
  var d = String(email).toLowerCase().slice(at + 1).trim();
  if (/^(hotmail|outlook|live|msn|windowslive|passport)\./.test(d)) return true; // Microsoft (qualquer TLD: .com, .com.br…)
  if (/^(uol|bol|terra)\.com(\.br)?$/.test(d)) return true;                       // UOL / BOL / Terra
  return false;
};

// v4.3.19: REMOVIDOS _detectLoginInputMode, _loginMutualExclude e handleUnifiedLogin
// (modal de login ANTIGO baseado no campo #login-unified / #btn-enviar-magic / blocos
// #login-unified-step + #login-block-email). Substituídos pelo modal atual com campo
// único #login-identifier + window._onIdentifierInput() (~linha 1506). Zero callers em
// grep recursivo (js/ + index.html) quando removidos. Não recriar: o único caminho de
// login/cadastro é o fluxo unificado _onIdentifierInput / _handleEntrar.

// v3.0.58: REMOVIDO o bloco "Cadastro/login só com celular (v2.4.98)"
// (_maskPhoneInput + _phoneSignupStart) — era um caminho de cadastro SÓ por código
// SMS, sem nome nem senha, que criava contas phone-only nameless. Estava morto (sem
// callers na UI) e contradizia a canonização: o ÚNICO cadastro é o fluxo unificado
// _handleEntrar (nome + senha + confirmação + verificação por código). Não recriar.

// ─── Login unificado (v2.5.x): _handleEntrar e helpers ───────────────────────
// Um único campo aceita e-mail OU celular (peso igual). Detecta o tipo, mostra o
// DDI quando celular, e o botão Entrar resolve tudo: login, cadastro inline e
// recuperação. Celular usa e-mail sintético + senha nativa (ver Cloud Functions
// checkAccount / registerPhonePassword / dispatchAccountRecovery).

// Status inline abaixo do botão Entrar.
window._entrarStatus = function(html, kind) {
  var el = document.getElementById('entrar-status');
  if (!el) return;
  if (!html) { el.innerHTML = ''; el.style.display = 'none'; return; }
  var color = kind === 'error' ? '#fca5a5' : (kind === 'success' ? '#6ee7b7' : (kind === 'info' ? 'var(--text-muted)' : '#fbbf24'));
  el.style.display = 'block';
  el.style.color = color;
  el.innerHTML = html;
};

// Reset do modal pro estado inicial (fecha cadastro, limpa status, botão "Entrar").
window._resetEntrarUI = function() {
  var reg = document.getElementById('register-expand');
  if (reg) reg.style.display = 'none';
  var btn = document.getElementById('btn-entrar');
  if (btn) btn.textContent = 'Entrar';
  window._entrarRegisterMode = false;
  if (typeof window._entrarSetInFlight === 'function') window._entrarSetInFlight(false);
  else window._entrarInFlight = false;
  window._entrarStatus('');
  var step = document.getElementById('phone-step-code');
  if (step) step.style.display = 'none';
  var main = document.getElementById('login-block-main');
  if (main) main.style.display = '';
};

// Detecção + máscara no campo único.
window._onIdentifierInput = function() {
  var el = document.getElementById('login-identifier');
  var countryEl = document.getElementById('login-identifier-country');
  var rowEl = document.getElementById('login-id-row');
  if (!el) return;
  var mode = (typeof _detectInputModeRaw === 'function') ? _detectInputModeRaw(el.value) : null;
  if (mode === 'phone') {
    var ddi = (countryEl && countryEl.value) || '55';
    if (ddi === '55') {
      var raw = el.value.replace(/\D/g, '');
      var masked = (typeof window._maskBRPhone === 'function') ? window._maskBRPhone(raw) : raw;
      if (el.value !== masked) el.value = masked;
    }
  }
  if (countryEl) countryEl.style.display = (mode === 'phone') ? '' : 'none';
  if (rowEl) rowEl.style.gridTemplateColumns = (mode === 'phone') ? 'auto 1fr' : '1fr';
};

// E.164 (com +) do campo, usando o DDI selecionado.
window._entrarPhoneE164 = function(raw, country) {
  var cc = country || '55';
  if (typeof window._normalizePhoneE164 === 'function') return window._normalizePhoneE164(raw, cc);
  var d = String(raw).replace(/\D/g, '');
  return (d.indexOf(cc) === 0) ? ('+' + d) : ('+' + cc + d);
};

// E-mail sintético da conta de celular (espelha _syntheticEmailForPhone do servidor).
window._entrarSyntheticEmail = function(e164withPlus) {
  var digits = String(e164withPlus || '').replace(/\D/g, '');
  if (!digits) return null;
  return 'phone_' + digits + '@phone.scoreplace.app';
};
// Detecta e-mail sintético de conta de celular (espelha _isSyntheticEmail do servidor).
// O sintético é um placeholder interno do login por celular — NUNCA deve aparecer
// pro usuário nem pra ninguém, nem ser persistido como identidade.
window._isSyntheticEmail = function(email) {
  return typeof email === 'string' && /@phone\.scoreplace\.app$/i.test(email.trim());
};
// E-mail "real" (não-sintético) ou '' — usar onde o e-mail é exibido ou persistido.
window._realEmailOrEmpty = function(email) {
  return (email && !window._isSyntheticEmail(email)) ? email : '';
};

window._entrarCheckAccount = function(identifier) {
  try {
    return firebase.functions().httpsCallable('checkAccount')({ identifier: identifier })
      .then(function(r) { return (r && r.data) || null; })
      .catch(function(e) { window._lastAuthFnError = { fn: 'checkAccount', code: (e && e.code) || '', msg: (e && e.message) || String(e), at: Date.now() }; if (window._warn) window._warn('[checkAccount] falhou:', e && e.code, e && e.message); return null; });
  } catch (e) { window._lastAuthFnError = { fn: 'checkAccount', code: 'throw', msg: String(e) }; return Promise.resolve(null); }
};

window._entrarDispatchRecovery = function(identifier) {
  try {
    return firebase.functions().httpsCallable('dispatchAccountRecovery')({ identifier: identifier })
      .then(function(r) { return (r && r.data) || null; })
      .catch(function(e) { window._lastAuthFnError = { fn: 'dispatchAccountRecovery', code: (e && e.code) || '', msg: (e && e.message) || String(e), at: Date.now() }; if (window._warn) window._warn('[dispatchAccountRecovery] falhou:', e && e.code, e && e.message); return null; });
  } catch (e) { window._lastAuthFnError = { fn: 'dispatchAccountRecovery', code: 'throw', msg: String(e) }; return Promise.resolve(null); }
};

// Abre a expansão de cadastro inline.
window._entrarExpandRegister = function(mode, raw) {
  var reg = document.getElementById('register-expand');
  var hint = document.getElementById('register-expand-hint');
  var btn = document.getElementById('btn-entrar');
  if (reg) reg.style.display = 'block';
  window._entrarRegisterMode = true;
  if (btn) btn.textContent = 'Criar conta e entrar';
  if (hint) {
    if (mode === 'phone') {
      hint.innerHTML = '✨ Número novo por aqui — vamos criar sua conta. Você vai receber um <b>código por SMS</b> e um <b>link no WhatsApp</b> pra confirmar o número.';
    } else if (typeof window._isUnreliableEmailDomain === 'function' && window._isUnreliableEmailDomain(raw)) {
      // v3.0.x: nota GENTIL (sem alarme, sem Google). Esses provedores às vezes seguram a
      // confirmação; o caminho pelo celular fica oferecido com calma na tela seguinte.
      hint.innerHTML = '✨ E-mail novo por aqui — vamos criar sua conta. <span style="opacity:0.85;">Se a confirmação não chegar, você confirma rapidinho pelo <b>celular</b> (SMS + WhatsApp) na próxima tela.</span>';
    } else {
      hint.innerHTML = '✨ E-mail novo por aqui — vamos criar sua conta. Confirme abaixo.';
    }
  }
  window._entrarStatus('');
  var nameEl = document.getElementById('reg-displayname');
  if (nameEl) setTimeout(function() { try { nameEl.focus(); } catch(_e){} }, 30);
};

// "Enviamos recuperação" com os canais mascarados.
window._entrarShowRecovery = function(res, noPassword) {
  var ch = (res && res.channels) || {};
  var esc = window._safeHtml || function(s){ return s; };
  var parts = [];
  if (ch.email) parts.push('e-mail <b>' + esc(ch.email) + '</b>');
  if (ch.phone) parts.push('WhatsApp <b>' + esc(ch.phone) + '</b>');
  var canais = parts.length ? parts.join(' e ') : 'seus contatos cadastrados';
  var head = noPassword
    ? '🔑 Essa conta ainda não tem senha. Enviamos um link pra você criar uma — por ' + canais + '.'
    : '🔑 Senha incorreta. Enviamos um link pra redefinir — por ' + canais + '.';
  window._entrarStatus(head + '<br><span style="color:var(--text-muted);">Abra o link e defina a nova senha.</span>', 'warning');
};

// Realça o botão "Entrar com Google" que JÁ existe na página (não recria outro):
// aplica o BRILHO PADRÃO do app — `.btn-shine` (mesma animação btnCtaShine do
// botão "Entrar" verde da landing: faixa de luz que varre o botão). Scroll até
// ele. Um clique nele marca o hint educativo pra o toast pós-login. Devolve true
// se achou o botão.
window._entrarHighlightGoogleBtn = function() {
  try {
    var btn = document.getElementById('login-google-btn');
    if (!btn) return false;
    var svg = btn.querySelector('svg');
    // guarda os estilos originais pra reverter (ao clicar, ou se a pessoa ignorar)
    if (!btn.hasAttribute('data-orig-style')) btn.setAttribute('data-orig-style', btn.getAttribute('style') || '');
    if (svg && !svg.hasAttribute('data-orig-style')) svg.setAttribute('data-orig-style', svg.getAttribute('style') || '');
    // Destaque só neste momento: verde CTA padrão. O VOLUME almofadado já vem da
    // classe .btn (box-shadow inset) — só pintamos de verde + texto branco. O 'G'
    // colorido ganha um chip branco pra contraste, e .btn-shine traz o brilho
    // padrão do app (faixa de luz que varre o botão).
    btn.style.background = '#047857';
    btn.style.color = '#fff';
    btn.style.borderColor = '#047857';
    if (svg) { svg.style.background = '#fff'; svg.style.borderRadius = '3px'; svg.style.padding = '2px'; svg.style.boxSizing = 'content-box'; }
    btn.classList.add('btn-shine');
    btn.addEventListener('click', function () {
      try { sessionStorage.setItem('sp_googleEduHint', '1'); } catch (e) {}
      btn.classList.remove('btn-shine');
      btn.setAttribute('style', btn.getAttribute('data-orig-style') || '');
      if (svg) svg.setAttribute('style', svg.getAttribute('data-orig-style') || '');
    }, { once: true });
    try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
    return true;
  } catch (e) { return false; }
};

// Conta criada via provedor social (Google/Apple): a senha do provedor NÃO vive
// no Firebase, então login por senha nunca funciona. Em vez de recriar um botão,
// aponta e dá brilho no "Entrar com Google" que já existe na própria página.
window._entrarShowGoogleSuggestion = function(provider) {
  var isGoogle = provider !== 'apple';
  var label = isGoogle ? 'Google' : 'Apple';
  if (isGoogle) {
    var found = window._entrarHighlightGoogleBtn();
    window._entrarStatus('👋 Essa conta entra com <b>Google</b> — aqui você <b>não tem senha própria</b>, usa a do Google. ' + (found ? 'Toque em <b>Entrar com Google</b> logo abaixo 👇' : 'Use o botão <b>Entrar com Google</b> abaixo.'), 'info');
  } else {
    window._entrarStatus('👋 Essa conta entra com <b>Apple</b> — aqui você <b>não tem senha própria</b>, usa a da Apple. Use o botão <b>Entrar com Apple</b> abaixo.', 'info');
  }
};

// v4.0.35: recuperação por CELULAR cai no acesso por WhatsApp. BUG reportado
// (Adriano, conta só-celular): "Esqueci minha senha" mostrava "Não deu pra confirmar
// agora. Verifique sua conexão…" mesmo com 5G — a mensagem era um fallback errado,
// porque o reset NATIVO do Firebase só sabe mandar e-mail e a conta não tem e-mail
// real. Em vez disso, pra celular disparamos o fluxo de acesso por WhatsApp (link
// mágico + SMS): a pessoa entra pelo link do WhatsApp e depois define uma senha nova
// no perfil. É o caminho mais confiável pra quem não usa e-mail.
window._entrarPhoneRecoveryFallback = function(raw) {
  var country = (document.getElementById('login-identifier-country') || {}).value || '55';
  var e164 = window._entrarPhoneE164(raw, country);
  var localDigits = (typeof window._phoneLocalDigits === 'function')
    ? window._phoneLocalDigits(e164, country)
    : String(e164 || '').replace(/\D/g, '');
  var hp = document.getElementById('login-phone');
  var hc = document.getElementById('login-phone-country');
  if (hp) hp.value = localDigits;
  if (hc) hc.value = country;
  window._entrarStatus('📱 Pra esse número, vamos te mandar um <b>acesso pelo WhatsApp</b> — toque no link pra entrar e depois defina uma senha nova no seu perfil.', 'info');
  if (typeof handlePhoneLogin === 'function') handlePhoneLogin();
};

// "Esqueci minha senha": dispara o reset SEM precisar errar a senha antes. Checa
// se a conta EXISTE primeiro (o app já assume enumeração — distingue entrar de
// criar conta), pra dar a mensagem certa: sem conta → criar; Google sem senha →
// entrar com Google; com senha/celular → manda o link por e-mail + WhatsApp.
window._entrarForgotPassword = function() {
  var idEl = document.getElementById('login-identifier');
  var raw = idEl ? idEl.value.trim() : '';
  if (!raw) {
    window._entrarStatus('Digite seu e-mail ou celular acima e toque de novo em "Esqueci minha senha".', 'warning');
    if (idEl) idEl.focus();
    return;
  }
  var mode = (typeof _detectInputModeRaw === 'function') ? _detectInputModeRaw(raw) : null;
  if (!mode) {
    window._entrarStatus('Digite um e-mail (com @) ou um celular com DDD.', 'warning');
    if (idEl) idEl.focus();
    return;
  }
  window._entrarStatus('Verificando…', 'info');
  var esc = window._safeHtml || function(s){ return s; };
  var _showSent = function(res) {
    var ch = (res && res.channels) || {};
    var parts = [];
    if (ch.email) parts.push('e-mail <b>' + esc(ch.email) + '</b>');
    if (ch.phone) parts.push('WhatsApp <b>' + esc(ch.phone) + '</b>');
    var canais = parts.length ? (' por ' + parts.join(' e ')) : '';
    window._entrarStatus('🔑 Enviamos um link pra redefinir a senha' + canais + '.<br><span style="color:var(--text-muted);">Abra o link e defina a nova senha (com confirmação). Não chegou? Veja o spam.</span>', 'success');
  };
  var _noAccount = function() {
    // Sem conta, mas e-mail do Google → quase sempre a pessoa entra com Google.
    if (mode !== 'phone' && /@(gmail|googlemail)\.com$/i.test(raw)) { window._entrarShowGoogleSuggestion('google'); return; }
    var what = (mode === 'phone') ? 'esse celular' : 'esse e-mail';
    window._entrarStatus('🤔 Não encontramos nenhuma conta com ' + what + '. Pra <b>criar uma conta nova</b>, digite uma senha acima e toque em <b>Entrar</b>.', 'warning');
  };
  window._entrarCheckAccount(raw).then(function(info) {
    // Conta social SEM senha (e a verificação funcionou) → manda pro provedor.
    if (info && info.exists) {
      var social = info.socialProviders || [];
      if (!info.hasPassword && social.indexOf('google.com') !== -1) { window._entrarShowGoogleSuggestion('google'); return; }
      if (!info.hasPassword && social.indexOf('apple.com') !== -1) { window._entrarShowGoogleSuggestion('apple'); return; }
    }
    // Caso geral: tenta a recuperação — o SERVIDOR resolve a conta e decide se
    // existe. NÃO concluímos "sem conta" a partir do checkAccount, porque ele
    // pode ter FALHADO (info === null) e mostraria "crie conta" pra quem TEM conta.
    window._entrarStatus('Enviando link de redefinição…', 'info');
    // Fallback NATIVO do Firebase pra e-mail — vai direto pro identitytoolkit
    // (mesmo servidor do login), sem depender da Cloud Function nem do CORS dela.
    // Se a pessoa consegue abrir o app, esse caminho funciona. Garante que o link
    // sai mesmo se o dispatch rico (PT + ?pr=) falhar.
    var _nativeEmailReset = function() {
      // Celular: o reset nativo do Firebase só manda e-mail, e conta só-celular não
      // tem e-mail real. Vai pro acesso por WhatsApp (entra e troca a senha depois).
      if (mode === 'phone') { window._entrarPhoneRecoveryFallback(raw); return; }
      if (!window.firebase || !firebase.auth) {
        window._entrarStatus('⚠️ Não deu pra confirmar agora. Verifique sua conexão e toque de novo em "Esqueci minha senha".', 'warning');
        return;
      }
      try { firebase.auth().languageCode = 'pt-BR'; } catch (_e) {}
      firebase.auth().sendPasswordResetEmail(raw).then(function () {
        window._entrarStatus('🔑 Enviamos um link pra redefinir a senha por e-mail <b>' + esc(raw) + '</b>.<br><span style="color:var(--text-muted);">Abra o link e defina a nova senha. Não chegou? Veja o spam/lixeira.</span>', 'success');
      }).catch(function (err) {
        var code = (err && err.code) || '';
        if (code === 'auth/user-not-found') { _noAccount(); return; }
        if (code === 'auth/invalid-email') { window._entrarStatus('Esse e-mail não parece válido. Confira e tente de novo.', 'warning'); return; }
        window._entrarStatus('⚠️ Não consegui enviar agora (' + (code || 'erro de conexão') + '). Tente de novo em instantes.', 'warning');
      });
    };
    window._entrarDispatchRecovery(raw).then(function(res) {
      var ch = (res && res.channels) || {};
      if (ch.email || ch.phone) { _showSent(res); return; }
      // Dispatch falhou (res null) OU não retornou canais → cai no reset nativo
      // pra e-mail (que também distingue conta-inexistente via user-not-found).
      _nativeEmailReset();
    });
  });
};

// Prova de posse do celular + define a senha (cadastro novo OU 1ª senha de OTP legado).
window._entrarSetupPhonePassword = function(e164withPlus, password, displayName) {
  var country = (document.getElementById('login-identifier-country') || {}).value || '55';
  var localDigits = (typeof window._phoneLocalDigits === 'function')
    ? window._phoneLocalDigits(e164withPlus, country)
    : String(e164withPlus).replace(/\D/g, '');
  var hp = document.getElementById('login-phone');
  var hc = document.getElementById('login-phone-country');
  if (hp) hp.value = localDigits;
  if (hc) hc.value = country;
  // Pendência lida pelo hook em handlePhoneVerifyCode (e best-effort no ?wt=).
  window._phonePwSetup = { phone: e164withPlus, password: password, displayName: displayName || '' };
  try { sessionStorage.setItem('sp_pwSetup', JSON.stringify(window._phonePwSetup)); } catch (_e) {}
  window._entrarStatus('📱 Enviamos um <b>código por SMS</b> e um <b>link pelo WhatsApp</b> pra confirmar seu número. Confirme abaixo pra concluir.', 'info');
  if (typeof handlePhoneLogin === 'function') handlePhoneLogin();
};

// Cadastro inline (após expandir): valida nome + confirmar senha, cria a conta.
window._entrarDoRegister = function(mode, raw, password) {
  var nameEl = document.getElementById('reg-displayname');
  var confEl = document.getElementById('reg-password-confirm');
  var name = nameEl ? nameEl.value.trim() : '';
  var conf = confEl ? confEl.value : '';
  if (!name) { window._entrarStatus('Digite um nome de exibição.', 'warning'); if (nameEl) nameEl.focus(); return; }
  if (password !== conf) { window._entrarStatus('As senhas não conferem.', 'warning'); if (confEl) confEl.focus(); return; }
  if (mode === 'email') {
    window._entrarStatus('Criando sua conta…', 'info');
    firebase.auth().createUserWithEmailAndPassword(raw.toLowerCase(), password)
      .then(function(result) {
        var user = result.user;
        window._pendingVerifyName = name;
        return user.updateProfile({ displayName: name }).catch(function(){}).then(function() {
          if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
            window.FirestoreDB.saveUserProfile(user.uid, { authProvider: 'password', email: user.email || raw.toLowerCase(), displayName: name, updatedAt: new Date().toISOString() }).catch(function(){});
          }
          if (typeof _sendRichVerificationEmail === 'function') _sendRichVerificationEmail(user, name);
          window._entrarStatus('✅ Conta criada! Enviamos um <b>link de confirmação</b> pro seu e-mail — abra pra ativar.<br><span style="color:var(--text-muted);">Não chegou (UOL/Hotmail)? Volte e cadastre com <b>celular</b> — recebe SMS + WhatsApp.</span>', 'success');
        });
      })
      .catch(function(error) {
        var code = (error && error.code) || '';
        if (code === 'auth/email-already-in-use') {
          window._entrarStatus('Esse e-mail já tem conta. Apague o nome e tente entrar com a senha.', 'warning');
          window._resetEntrarUI();
        } else if (code === 'auth/invalid-email') {
          window._entrarStatus('E-mail inválido.', 'warning');
        } else {
          window._entrarStatus((error && error.message) || 'Não foi possível criar a conta.', 'error');
        }
      });
  } else {
    var e164 = window._entrarPhoneE164(raw, (document.getElementById('login-identifier-country') || {}).value || '55');
    window._entrarSetupPhonePassword(e164, password, name);
  }
};

// v4.0.35: trava de "em andamento" com watchdog. BUG reportado (Adriano): clicar
// em Entrar e "nada acontece, completamente silencioso". Causa: `_entrarInFlight`
// ficava preso em true (promessa do Firebase que não resolveu, ou chamada dupla no
// iOS) e TODO clique seguinte caía no `if (_entrarInFlight) return;` do topo —
// silêncio permanente até recarregar. Agora toda vez que ligamos a trava, armamos
// um watchdog que a desliga sozinho em 25s com uma mensagem, então o botão nunca
// fica morto pra sempre.
window._entrarSetInFlight = function(on) {
  window._entrarInFlight = !!on;
  if (window._entrarWatchdog) { clearTimeout(window._entrarWatchdog); window._entrarWatchdog = null; }
  if (on) {
    window._entrarWatchdog = setTimeout(function() {
      if (!window._entrarInFlight) return;
      window._entrarInFlight = false;
      window._entrarWatchdog = null;
      try { window._entrarStatus('⚠️ A conexão demorou demais pra responder. Toque em <b>Entrar</b> de novo.', 'warning'); } catch (_e) {}
    }, 25000);
  }
};

// O botão Entrar — máquina de estados única.
window._handleEntrar = function() {
  if (window._entrarInFlight) return;
  var idEl = document.getElementById('login-identifier');
  var pwEl = document.getElementById('login-password');
  var raw = idEl ? idEl.value.trim() : '';
  var pw = pwEl ? pwEl.value : '';
  var mode = (typeof _detectInputModeRaw === 'function') ? _detectInputModeRaw(raw) : null;
  if (!mode) { window._entrarStatus('Digite um e-mail (com @) ou um celular com DDD.', 'warning'); if (idEl) idEl.focus(); return; }
  if (pw.length < 6) { window._entrarStatus('A senha precisa de pelo menos 6 caracteres.', 'warning'); if (pwEl) pwEl.focus(); return; }

  // Já em modo cadastro (expandido) → cria conta.
  if (window._entrarRegisterMode) { window._entrarDoRegister(mode, raw, pw); return; }

  // Tentativa de login.
  window._entrarSetInFlight(true);
  window._entrarStatus('Entrando…', 'info');
  var target = (mode === 'email')
    ? raw.toLowerCase()
    : window._entrarSyntheticEmail(window._entrarPhoneE164(raw, (document.getElementById('login-identifier-country') || {}).value || '55'));
  if (!target) { window._entrarSetInFlight(false); window._entrarStatus('Número de celular inválido.', 'warning'); return; }

  // v4.0.35: try/catch defensivo — se o SDK lançar de forma SÍNCRONA (Firebase não
  // pronto, estado corrompido), o .then/.catch nunca anexa e a trava vazaria. O
  // catch garante que destravamos e damos feedback em vez de silêncio.
  try {
  firebase.auth().signInWithEmailAndPassword(target, pw)
    .then(function(result) {
      window._entrarSetInFlight(false);
      var user = result.user;
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        var prof = { authProvider: (mode === 'phone') ? 'phone+password' : 'password', updatedAt: new Date().toISOString() };
        if (mode === 'email' && user.email) prof.email = user.email;
        window.FirestoreDB.saveUserProfile(user.uid, prof).catch(function(){});
      }
      try { sessionStorage.removeItem('sp_pwSetup'); } catch(_e){}
      window._entrarStatus('');
      showNotification(_t('auth.loginDone'), user.displayName ? _t('auth.welcomeName', {greeting: window._welcomeWord(user), name: user.displayName}) : _t('auth.welcome', {greeting: window._welcomeWord(user)}), 'success');
      var modal = document.getElementById('modal-login');
      if (modal) modal.classList.remove('active');
    })
    .catch(function(error) {
      window._entrarSetInFlight(false);
      var code = (error && error.code) || '';
      var loginFail = (code === 'auth/wrong-password' || code === 'auth/invalid-credential' ||
        code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials');
      if (code === 'auth/too-many-requests') { window._entrarStatus('Muitas tentativas. Aguarde um momento e tente de novo.', 'error'); return; }
      if (!loginFail) { window._entrarStatus((error && error.message) || 'Não foi possível entrar.', 'error'); return; }
      // Desambígua via checkAccount: existe? tem senha?
      function _entrarDisambiguate() {
        window._entrarStatus('Verificando…', 'info');
        window._entrarCheckAccount(raw).then(function(info) {
          // info === null = a verificação FALHOU (rede/função) — NÃO concluir "sem
          // conta" (empurraria "criar conta" pra quem só errou a senha). Pede retry.
          if (info === null) {
            window._entrarStatus('⚠️ Não deu pra verificar sua conta agora. Confira sua conexão e toque em <b>Entrar</b> de novo.', 'warning');
            return;
          }
          if (!info.exists) { window._entrarExpandRegister(mode, raw); return; }
          // Conta criada via Google/Apple: a senha do provedor não vive aqui —
          // ofertar "Entrar com Google/Apple" em vez de recuperar/criar senha.
          var _social = (info.socialProviders) || [];
          if (_social.indexOf('google.com') !== -1) { window._entrarShowGoogleSuggestion('google'); return; }
          if (_social.indexOf('apple.com') !== -1) { window._entrarShowGoogleSuggestion('apple'); return; }
          if (info.hasPassword) {
            window._entrarDispatchRecovery(raw).then(function(res) { window._entrarShowRecovery(res, false); });
            return;
          }
          // Existe, sem senha.
          if (mode === 'phone') {
            // v3.0.57: conta de celular sem senha = completar o cadastro. Expande o
            // form pra coletar NOME + CONFIRMAÇÃO de senha (antes setava a senha com
            // nome vazio e sem confirmar). _entrarDoRegister → _entrarSetupPhonePassword
            // com o nome real + senha confirmada; a sessão OTP atualiza o MESMO uid.
            window._entrarExpandRegister(mode, raw);
          } else {
            window._entrarDispatchRecovery(raw).then(function(res) { window._entrarShowRecovery(res, true); });
          }
        });
      }
      // uid-first: login por celular resolve a conta pelo NÚMERO no servidor e
      // autentica contra a credencial real da conta — conserta quem cadastrou por
      // celular e depois vinculou e-mail real (o e-mail primário trocou do
      // sintético→real, então o signIn local contra o sintético falhava). Só
      // celular; e-mail já entra direto pela própria credencial.
      if (mode === 'phone') {
        var _e164try = window._entrarPhoneE164(raw, (document.getElementById('login-identifier-country') || {}).value || '55');
        if (_e164try) {
          window._entrarSetInFlight(true);
          window._entrarStatus('Entrando…', 'info');
          window._entrarPhonePasswordLogin(_e164try, pw).then(function(done) {
            if (done) return; // logou via custom token; onAuthStateChanged cuida do resto
            window._entrarSetInFlight(false);
            _entrarDisambiguate();
          });
          return;
        }
      }
      _entrarDisambiguate();
    });
  } catch (e) {
    window._entrarSetInFlight(false);
    window._error && window._error('[handleEntrar] throw síncrono:', e && (e.message || e));
    window._entrarStatus('⚠️ Não foi possível iniciar o login agora. Recarregue a página e tente de novo.', 'error');
  }
};

// Login por celular uid-first: chama a Cloud Function que resolve a conta pelo
// número e autentica server-side; entra com o custom token. Resolve com `true`
// se logou, `false` se não autenticou (senha errada / sem conta) — aí o caller
// segue pro fluxo de desambiguação/recuperação.
window._entrarPhonePasswordLogin = function(e164, pw) {
  try { if (!firebase.functions) return Promise.resolve(false); }
  catch (e) { return Promise.resolve(false); }
  return firebase.functions().httpsCallable('phonePasswordLogin')({ phone: e164, password: pw })
    .then(function(res) {
      var d = (res && res.data) || {};
      if (d.ok && d.token) {
        return firebase.auth().signInWithCustomToken(d.token).then(function() {
          window._entrarSetInFlight(false);
          window._entrarStatus('');
          var modal = document.getElementById('modal-login');
          if (modal) modal.classList.remove('active');
          return true; // onAuthStateChanged → simulateLoginSuccess faz o resto
        }).catch(function(err) {
          window._warn && window._warn('[phoneLogin] signInWithCustomToken falhou:', err && (err.code || err.message));
          return false;
        });
      }
      return false; // wrong-password / no-account / no-password
    })
    .catch(function(err) {
      window._warn && window._warn('[phoneLogin] phonePasswordLogin falhou:', err && (err.code || err.message));
      return false;
    });
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
        if (window._realEmailOrEmpty(user.email)) profileData.email = user.email;
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
      showNotification(_t('auth.loginDone'), user.displayName ? _t('auth.welcomeName', {greeting: window._welcomeWord(user), name: user.displayName}) : _t('auth.welcome', {greeting: window._welcomeWord(user)}), 'success');
      // v1.8.65: verificar se este login é resultado de um pedido de vinculação de email
      if (user.email && typeof window._checkEmailLinkIntent === 'function') {
        setTimeout(function() { window._checkEmailLinkIntent(user.email); }, 1500);
      }
      // v1.8.74: sugerir criação de senha após login via magic link
      if (user.email) {
        setTimeout(function() {
          if (typeof window._suggestCreatePassword === 'function') window._suggestCreatePassword(user.email);
        }, 2500);
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

  // ── v4.0.35: WhatsApp PRIMEIRO, SMS como canal secundário (e sem travar) ────
  // O reCAPTCHA do SMS quebra com frequência (especialmente no iOS Safari) e
  // deixava o usuário preso: o passo de código só aparecia DEPOIS do SMS dar certo,
  // então quando o reCAPTCHA falhava, a pessoa via só um erro e ficava sem caminho.
  // Agora o link de acesso pelo WhatsApp é disparado ANTES do SMS e o passo de
  // confirmação aparece NA HORA — a pessoa entra pelo link do WhatsApp mesmo que o
  // SMS/reCAPTCHA falhe. O SMS roda depois, em segundo plano, e a sua falha vira só
  // uma nota discreta (sem toast assustador) porque o WhatsApp é o caminho primário.
  window._waMagicLinkResult = null;
  _showPhoneVerificationStep();
  var _smsNote0 = document.getElementById('phone-step-sms-note');
  if (_smsNote0) _smsNote0.innerHTML = '';
  var _waStatus0 = document.getElementById('phone-step-wa-status');
  if (_waStatus0) _waStatus0.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">⏳ Enviando link pelo WhatsApp…</span>';
  showNotification('📱 Acesso a caminho', 'Enviamos um link pelo WhatsApp pra ' + phone + '. Toque nele pra entrar — ou digite o código que chega por SMS.', 'info');

  // WhatsApp magic link — não depende de reCAPTCHA nem de SMS.
  (function() {
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
        ws.innerHTML = '<span style="color:#10b981;font-size:0.74rem;font-weight:700;">✅ Link enviado pelo WhatsApp — toque nele pra entrar.</span>';
      } else {
        var reason = (d && d.reason) || 'unknown';
        ws.innerHTML = (reason === 'user-not-found')
          ? '<span style="color:var(--text-muted);font-size:0.72rem;">Número novo por aqui — confirme pelo código do SMS abaixo.</span>'
          : '<span style="color:var(--text-muted);font-size:0.72rem;">WhatsApp indisponível agora (' + reason + ') — use o código do SMS abaixo.</span>';
      }
    })
    .catch(function(err) {
      window._warn('[WA magic link] fetch falhou:', err && err.message);
      var ws = document.getElementById('phone-step-wa-status');
      if (ws) ws.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem;">WhatsApp indisponível agora — use o código do SMS abaixo.</span>';
    });
  })();

  // ── SMS (canal secundário) ─────────────────────────────────────────────────
  // v1.3.76-beta: container pro body ANTES de qualquer operação de reCAPTCHA pra
  // o iframe não ficar clipado por overflow:hidden do modal.
  _ensureRecaptchaInBody();
  // v1.1.5-beta: SEMPRE reset+recreate o verifier (reuse causava 'reCAPTCHA has
  // already been rendered in this element' após logoff→login).
  _resetPhoneRecaptcha();
  try {
    window._phoneRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: function() {},
      'expired-callback': function() { _resetPhoneRecaptcha(); }
    });
  } catch (e) {
    // reCAPTCHA nem inicializa (navegador hostil) — sem problema: o WhatsApp já foi.
    window._phoneLoginInFlight = false;
    window._warn && window._warn('[phoneLogin] reCAPTCHA init falhou:', e && (e.message || e));
    var _n0 = document.getElementById('phone-step-sms-note');
    if (_n0) _n0.innerHTML = '<span style="color:#fbbf24;font-size:0.72rem;">⚠️ SMS indisponível neste navegador — entre pelo link do WhatsApp acima.</span>';
    return;
  }

  // v1.3.76-beta: render() explícito ANTES de signInWithPhoneNumber (iOS exige
  // que a interação com reCAPTCHA comece dentro da janela de gesto do usuário).
  window._phoneRecaptchaVerifier.render()
    .then(function() {
      return firebase.auth().signInWithPhoneNumber(phone, window._phoneRecaptchaVerifier);
    })
    .then(function(confirmationResult) {
      window._phoneLoginInFlight = false;
      window._phoneConfirmationResult = confirmationResult;
      var n = document.getElementById('phone-step-sms-note');
      if (n) n.innerHTML = '<span style="color:#10b981;font-size:0.72rem;">✅ Código enviado por SMS — digite acima.</span>';
    })
    .catch(function(error) {
      window._error('Phone sign-in (SMS) error:', error);
      window._phoneLoginInFlight = false;
      if (typeof window._captureException === 'function') {
        window._captureException(error, { area: 'phoneLogin', code: error && error.code, message: error && error.message });
      }
      _resetPhoneRecaptcha();
      // SMS é secundário: NÃO mostramos toast de erro (o WhatsApp já foi e é o
      // caminho principal). Só uma nota inline discreta — o passo + link do WhatsApp
      // continuam na tela, então o usuário nunca fica sem saída.
      var code = (error && error.code) || 'unknown';
      var smsMsg;
      if (code === 'auth/invalid-phone-number') smsMsg = '⚠️ Número inválido pro SMS. Confira o DDI + DDD + número.';
      else if (code === 'auth/too-many-requests') smsMsg = 'ℹ️ Muitas tentativas de SMS — use o link do WhatsApp acima.';
      else if (code === 'auth/operation-not-allowed') smsMsg = 'ℹ️ SMS desabilitado nesta conta — use o link do WhatsApp acima.';
      else smsMsg = 'ℹ️ SMS indisponível agora — use o link do WhatsApp acima.';
      var note = document.getElementById('phone-step-sms-note');
      if (note) note.innerHTML = '<span style="color:#fbbf24;font-size:0.72rem;">' + smsMsg + '</span>';
    });
}

function _showPhoneVerificationStep() {
  // Esconde o passo legado do número e mostra phone-step-code (input do código
  // de 6 dígitos). O campo unificado atual (#login-identifier) vive nos painéis
  // #login-panel-* — nada a esconder aqui além do legado.
  var phoneStepLegacy = document.getElementById('phone-step-number'); // pré-v1.0.22 (defensivo)
  var codeStep = document.getElementById('phone-step-code');
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
      // v2.5.x: fluxo "definir senha após verificar o celular" (cadastro novo OU
      // 1ª senha de usuário OTP legado). Posse provada pelo OTP → seta e-mail
      // sintético + senha via registerPhonePassword. Caminho separado do login
      // por OTP puro (cross-ref abaixo).
      if (window._phonePwSetup) {
        var _pw = window._phonePwSetup;
        window._phonePwSetup = null;
        try { sessionStorage.removeItem('sp_pwSetup'); } catch(_e){}
        try {
          await firebase.functions().httpsCallable('registerPhonePassword')({
            phone: _pw.phone, password: _pw.password, displayName: _pw.displayName || ''
          });
          try { await user.getIdToken(true); } catch(_e){}
          if (_pw.displayName) { try { await user.updateProfile({ displayName: _pw.displayName }); } catch(_e){} }
        } catch (e) {
          window._error('[phonePwSetup] registerPhonePassword falhou:', e);
          showNotification('Não foi possível salvar a senha', (e && e.message) || 'Você está logado; defina a senha depois no perfil.', 'warning');
        }
        window._phoneConfirmationResult = null;
        _resetPhoneRecaptcha();
        if (typeof window._resetEntrarUI === 'function') window._resetEntrarUI();
        showNotification(_t('auth.loginDone'), _t('auth.welcome', {greeting: window._welcomeWord(user)}), 'success');
        var _m = document.getElementById('modal-login');
        if (_m) _m.classList.remove('active');
        _resetPhoneLoginUI();
        return;
      }
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
      showNotification(_t('auth.loginDone'), _t('auth.welcome', {greeting: window._welcomeWord(user)}), 'success');
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
  // v2.5.0: SEMPRE recria o elemento do zero. O grecaptcha marca o elemento
  // como "rendered" e NÃO solta esse estado com innerHTML='' nem com .clear() —
  // no 2º envio dá "reCAPTCHA has already been rendered in this element"
  // (bug que travava o SMS e prendia o reCAPTCHA cobrindo a tela). Remover o nó
  // e criar um novo (mesmo id) garante um container pristine a cada tentativa.
  var old = document.getElementById('recaptcha-container');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  var el = document.createElement('div');
  el.id = 'recaptcha-container';
  el.style.cssText = 'position:fixed;bottom:0;right:0;z-index:0;width:1px;height:1px;overflow:hidden;';
  document.body.appendChild(el);
}

function _resetPhoneLoginUI() {
  // Esconde o passo de verificação de código e restaura o passo legado do número
  // (defensivo). O campo unificado atual (#login-identifier) fica nos painéis
  // #login-panel-* e não é tocado aqui.
  var phoneStepLegacy = document.getElementById('phone-step-number'); // pré-v1.0.22 (defensivo)
  var codeStep = document.getElementById('phone-step-code');
  if (phoneStepLegacy) phoneStepLegacy.style.display = 'block';
  if (codeStep) codeStep.style.display = 'none';
  window._phoneConfirmationResult = null;
}

// v1.9.75: quando o login por e-mail+senha falha, checa o provedor do e-mail.
// Se a conta é Google (ou só link mágico, sem senha), orienta o caminho certo
// em vez de só dizer "senha errada". fallbackFn() roda quando não há sugestão
// melhor (mostra a mensagem de erro normal).
function _showGoogleSuggestDialog() {
  if (typeof showConfirmDialog !== 'function') {
    showNotification('Conta Google', 'Esse e-mail está associado a uma conta Google. Use "Entrar com Google".', 'info');
    return;
  }
  showConfirmDialog(
    '👋 Use o Google para entrar',
    'Esse e-mail está associado a uma conta Google (criada sem senha de e-mail). Entre com o Google — é só um clique.',
    function() { if (typeof handleGoogleLogin === 'function') handleGoogleLogin(); },
    null,
    { confirmText: 'Entrar com Google', cancelText: 'Voltar', type: 'info' }
  );
}
function _maybeSuggestGoogleLogin(email, fallbackFn) {
  var emailLc = (email || '').toLowerCase();
  var isGmail = /@(gmail|googlemail)\.com$/.test(emailLc);
  var hasFetch = false;
  try { hasFetch = !!(firebase && firebase.auth && firebase.auth().fetchSignInMethodsForEmail); } catch (e) {}
  if (!emailLc || emailLc.indexOf('@') === -1 || !hasFetch) {
    // Sem como verificar: se for gmail, ainda assim sugere Google.
    if (isGmail) { _showGoogleSuggestDialog(); } else { fallbackFn(); }
    return;
  }
  firebase.auth().fetchSignInMethodsForEmail(email)
    .then(function(methods) {
      methods = methods || [];
      var hasPassword = methods.indexOf('password') !== -1;
      var isGoogle = methods.indexOf('google.com') !== -1;
      if (isGoogle && !hasPassword) {
        _showGoogleSuggestDialog();
      } else if (!hasPassword && methods.indexOf('emailLink') !== -1) {
        // Conta só com link mágico (sem senha) → orienta a criar uma senha.
        if (typeof showConfirmDialog === 'function') {
          showConfirmDialog(
            'Defina sua senha',
            'Essa conta ainda não tem senha — você entrava por link de e-mail. Clique abaixo para criar uma senha agora.',
            function() { if (typeof handlePasswordReset === 'function') handlePasswordReset(); },
            null,
            { confirmText: '🔑 Criar senha', cancelText: 'Fechar', type: 'info' }
          );
        } else { fallbackFn(); }
      } else if (methods.length === 0 && isGmail) {
        // Proteção contra enumeração de e-mail pode esconder os métodos.
        // Como é @gmail, sugere Google (atende o pedido do usuário).
        _showGoogleSuggestDialog();
      } else {
        fallbackFn();
      }
    })
    .catch(function() {
      if (isGmail) { _showGoogleSuggestDialog(); } else { fallbackFn(); }
    });
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
      // Track auth provider. v1.9.90: inclui email/displayName pra NUNCA criar
      // um doc "fantasma" (sem identidade) que apareceria como "Usuário". Antes
      // gravava só {authProvider, updatedAt} — se o doc não existia (conta
      // recriada, perfil ainda não escrito), virava um usuário sem nome/e-mail.
      if (window.FirestoreDB && window.FirestoreDB.db && user.uid) {
        var _loginProf = { authProvider: 'password', updatedAt: new Date().toISOString() };
        if (window._realEmailOrEmpty(user.email)) _loginProf.email = user.email;
        if (user.displayName) _loginProf.displayName = user.displayName;
        window.FirestoreDB.saveUserProfile(user.uid, _loginProf).catch(function() {});
      }
      _tryLinkPendingCredential(result);
      try {
        var _pwCache = JSON.parse(localStorage.getItem('scoreplace_authCache') || '{}');
        _pwCache.authProvider = 'password';
        localStorage.setItem('scoreplace_authCache', JSON.stringify(_pwCache));
      } catch(e) {}
      showNotification(_t('auth.loginDone'), user.displayName ? _t('auth.welcomeName', {greeting: window._welcomeWord(user), name: user.displayName}) : _t('auth.welcome', {greeting: window._welcomeWord(user)}), 'success');
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
      // v1.9.75: antes de dizer "senha errada", checa se a conta é Google
      // (sem senha de e-mail) e sugere "Entrar com Google". Cobre o caso de
      // quem criou conta com Google e tenta e-mail+senha.
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        _maybeSuggestGoogleLogin(email, function() {
          if (code === 'auth/wrong-password') {
            showNotification(_t('auth.wrongPassword'), _t('auth.wrongPasswordMsg'), 'error');
          } else {
            showNotification(_t('auth.invalidCreds'), _t('auth.invalidCredsMsg'), 'error');
          }
        });
      } else if (code === 'auth/too-many-requests') {
        showNotification(_t('auth.tooManyAttempts'), _t('auth.tooManyLogin'), 'warning');
      } else if (code === 'auth/operation-not-allowed') {
        showNotification(_t('auth.notAvailable'), _t('auth.emailPasswordUnavailable'), 'warning');
      } else if (code === 'auth/network-request-failed') {
        showNotification('Sem conexão com Firebase',
          'Network blip ou bloqueio. Tente:\n' +
          '1. Trocar Wi-Fi ↔ 4G/5G\n' +
          '2. Desabilitar VPN/ad-blocker\n' +
          '3. Entrar com Google', 'error');
      } else {
        showNotification('Erro no Login',
          (error.message || 'Não foi possível entrar') +
          '\n\n(código: ' + code + ')\n\nTente entrar com Google ou use "Esqueci a Senha".', 'error');
      }
    });
}

// ─── Email/Password Registration ─────────────────────────────────────────────
function handleEmailRegister() {
  var name = document.getElementById('register-name').value.trim();
  var email = document.getElementById('register-email').value.trim();
  var password = document.getElementById('register-password').value;
  // v1.9.74: confirmação de senha (senha 2x).
  var confirmEl = document.getElementById('register-password-confirm');
  var passwordConfirm = confirmEl ? confirmEl.value : password;
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
  // v1.9.74: senha e confirmação devem bater.
  if (password !== passwordConfirm) {
    showNotification('Senhas diferentes', 'A senha e a confirmação não são iguais. Digite a mesma senha nos dois campos.', 'warning');
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
        // v1.9.78: verificação de e-mail OBRIGATÓRIA na criação. Envia o link
        // de confirmação (com retorno pro app) e mostra o GATE de verificação.
        // NÃO grava o perfil no Firestore nem entra no app até confirmar — assim
        // o sistema não mescla nem sugere nada antes da verificação. O perfil é
        // gravado depois, em _checkEmailVerified.
        window._pendingVerifyName = name;
        try {
          _sendRichVerificationEmail(user, name);
        } catch(e) { window._warn('Email verification send error:', e); }
        var modal = document.getElementById('modal-login');
        if (modal) modal.classList.remove('active');
        window._pendingProfileUpdate = false;
        if (typeof window._showEmailVerificationGate === 'function') {
          window._showEmailVerificationGate(email, name);
        }
        return;
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
          '3. Entrar com Google', 'error');
      } else {
        showNotification('Erro no Registro',
          (error.message || 'Não foi possível criar conta') +
          '\n\n(código: ' + code + ')\n\nTente entrar com Google.', 'error');
      }
    });
}

// ─── Criar senha após magic link ─────────────────────────────────────────────
// Aparece uma vez após login via link mágico para contas sem senha.
// Permite que o browser salve email+senha para logins futuros com Face ID / Touch ID.
window._suggestCreatePassword = function(email) {
  if (!email) return;
  // Só mostrar uma vez por sessão
  try { if (sessionStorage.getItem('_passwordSuggested')) return; } catch(e) {}
  // Verificar se já tem provider 'password'
  var fbUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if (!fbUser) return;
  var hasPassword = (fbUser.providerData || []).some(function(p) { return p.providerId === 'password'; });
  if (hasPassword) return;
  try { sessionStorage.setItem('_passwordSuggested', '1'); } catch(e) {}

  // Mostrar overlay
  var old = document.getElementById('create-password-overlay');
  if (old) old.remove();
  var overlay = document.createElement('div');
  overlay.id = 'create-password-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML =
    '<div style="background:var(--bg-card,#1e293b);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-size:1.4rem;text-align:center;margin-bottom:6px;">🔑</div>' +
      '<h3 style="margin:0 0 6px;text-align:center;color:var(--text-bright,#f1f5f9);font-size:1rem;">Entre mais fácil na próxima vez</h3>' +
      '<p style="font-size:0.8rem;color:var(--text-muted,#94a3b8);text-align:center;margin:0 0 16px;">Crie uma senha para entrar com Face ID ou Touch ID — sem precisar de link no e-mail.</p>' +
      // Form real para o browser detectar e oferecer "Salvar senha"
      '<form id="create-password-form" autocomplete="on" onsubmit="event.preventDefault();window._doCreatePassword()">' +
        '<input type="email" name="email" autocomplete="username" value="' + email.replace(/"/g,'') + '" readonly style="display:none;">' +
        '<div style="margin-bottom:10px;">' +
          '<input type="password" id="cp-password" name="password" autocomplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" class="form-control" style="font-size:0.9rem;" minlength="6" required>' +
        '</div>' +
        '<div style="margin-bottom:16px;">' +
          '<input type="password" id="cp-confirm" name="password-confirm" autocomplete="new-password" placeholder="Confirmar senha" class="form-control" style="font-size:0.9rem;" minlength="6" required>' +
        '</div>' +
        '<div id="cp-error" style="font-size:0.78rem;color:#f87171;margin-bottom:10px;display:none;"></div>' +
        '<button type="submit" id="cp-submit" class="btn btn-primary" style="width:100%;font-size:0.9rem;padding:10px;">Criar senha</button>' +
      '</form>' +
      '<div style="text-align:center;margin-top:12px;">' +
        '<button onclick="document.getElementById(\'create-password-overlay\').remove()" style="background:none;border:none;color:var(--text-muted,#94a3b8);cursor:pointer;font-size:0.8rem;">Agora não</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  setTimeout(function() { var el = document.getElementById('cp-password'); if (el) el.focus(); }, 100);
};

window._doCreatePassword = function() {
  var pwd = (document.getElementById('cp-password') || {}).value || '';
  var confirm = (document.getElementById('cp-confirm') || {}).value || '';
  var errEl = document.getElementById('cp-error');
  var btn = document.getElementById('cp-submit');
  var showErr = function(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };

  if (pwd.length < 6) { showErr('A senha precisa ter pelo menos 6 caracteres.'); return; }
  if (pwd !== confirm) { showErr('As senhas não coincidem.'); return; }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  var fbUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  if (!fbUser) { showErr('Sessão expirada. Faça login novamente.'); if (btn) { btn.disabled = false; btn.textContent = 'Criar senha'; } return; }

  fbUser.updatePassword(pwd)
    .then(function() {
      // Submeter o form para o browser detectar e oferecer "Salvar senha"
      var form = document.getElementById('create-password-form');
      if (form) {
        // Preencher campos visíveis para o browser capturar
        var pwdInp = document.getElementById('cp-password');
        // Disparar evento de submit nativo para acionar o gerenciador de senhas do browser
        var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        // Não prevenir o default desta vez — browser precisa ver o submit
      }
      if (typeof showNotification !== 'undefined') {
        showNotification('✅ Senha criada!', 'Salve no seu browser para entrar com Face ID nas próximas vezes.', 'success');
      }
      document.getElementById('create-password-overlay').remove();
      // Atualizar authProvider no Firestore
      var cu = window.AppStore && window.AppStore.currentUser;
      if (cu && cu.uid && window.FirestoreDB && window.FirestoreDB.db) {
        window.FirestoreDB.db.collection('users').doc(cu.uid).update({
          authProvider: 'emailLink+password',
          updatedAt: new Date().toISOString()
        }).catch(function() {});
      }
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Criar senha'; }
      var msg = 'Erro ao criar senha.';
      if (err.code === 'auth/requires-recent-login') msg = 'Sessão muito antiga. Faça login de novo e tente novamente.';
      else if (err.code === 'auth/weak-password') msg = 'Senha muito fraca. Use pelo menos 6 caracteres.';
      showErr(msg);
    });
};

// ─── Password Reset ──────────────────────────────────────────────────────────
// v1.8.69: abre painel inline no modal de login com campo de email pré-preenchido.
function handlePasswordReset() {
  // Pré-preencher com o email que já está digitado no campo de login
  var loginEmail = (document.getElementById('login-email') || {}).value || '';

  // Remover painel anterior se existir
  var old = document.getElementById('reset-password-panel');
  if (old) old.remove();

  // Criar painel inline acima do formulário email/senha
  var emailLoginMode = document.getElementById('email-login-mode');
  if (!emailLoginMode) {
    // Fallback: prompt simples
    var fb = window.prompt('Digite seu e-mail para redefinir a senha:', loginEmail);
    if (fb) _sendPasswordResetEmail(fb.trim());
    return;
  }

  var panel = document.createElement('div');
  panel.id = 'reset-password-panel';
  panel.style.cssText = 'margin-bottom:12px;padding:14px 16px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.25);border-radius:12px;animation:fadeIn 0.2s ease;';
  panel.innerHTML =
    '<div style="font-weight:700;font-size:0.88rem;color:var(--text-bright);margin-bottom:4px;">🔑 Redefinir senha</div>' +
    '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">Enviaremos um link para você criar uma nova senha.</div>' +
    '<input type="email" id="reset-email-input" class="form-control" placeholder="seu@email.com" value="' + (loginEmail.replace(/"/g,'&quot;')) + '" style="font-size:0.88rem;margin-bottom:8px;" autocomplete="email">' +
    '<div style="display:flex;gap:8px;">' +
      '<button onclick="window._doPasswordReset()" class="btn btn-primary" style="flex:1;font-size:0.85rem;padding:8px 12px;">Enviar link</button>' +
      '<button onclick="document.getElementById(\'reset-password-panel\').remove()" class="btn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:var(--text-muted);font-size:0.85rem;padding:8px 12px;">Cancelar</button>' +
    '</div>' +
    '<div id="reset-status" style="margin-top:8px;font-size:0.78rem;"></div>';

  emailLoginMode.parentNode.insertBefore(panel, emailLoginMode);
  // Focar no campo e posicionar cursor no fim
  setTimeout(function() {
    var inp = document.getElementById('reset-email-input');
    // v2.1.30: inputs type=email/number NÃO suportam selection — setar joga
    // InvalidStateError no iOS Safari/Chrome. Guarda em try/catch (o focus já basta).
    if (inp) { inp.focus(); try { var _l = inp.value.length; inp.setSelectionRange(_l, _l); } catch (e) {} }
  }, 50);
}

window._doPasswordReset = function() {
  var inp = document.getElementById('reset-email-input');
  var email = inp ? inp.value.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    var statusEl = document.getElementById('reset-status');
    if (statusEl) statusEl.innerHTML = '<span style="color:#f87171;">Digite um e-mail válido.</span>';
    return;
  }

  var statusEl = document.getElementById('reset-status');
  var btn = document.querySelector('#reset-password-panel .btn-primary');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Verificando...</span>';
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  // v1.8.71: verificar o provider da conta antes de enviar reset de senha.
  // Contas Google/Apple não têm senha — enviar reset cria estado confuso.
  firebase.auth().fetchSignInMethodsForEmail(email)
    .then(function(methods) {
      var providerLabels = { 'google.com': 'Google', 'apple.com': 'Apple', 'facebook.com': 'Facebook' };
      var socialProvider = methods.find(function(m) { return providerLabels[m]; });
      if (socialProvider) {
        // Conta criada via provedor social — não tem senha, orientar corretamente
        var provLabel = providerLabels[socialProvider];
        if (statusEl) statusEl.innerHTML = '';
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar link'; }
        var panel = document.getElementById('reset-password-panel');
        if (panel) {
          var googleSvg = '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
          panel.innerHTML =
            '<div style="padding:4px 0;">' +
              '<div style="font-weight:700;color:var(--text-bright);font-size:0.9rem;margin-bottom:6px;">👋 Use o ' + provLabel + ' para entrar</div>' +
              '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">Sua conta foi criada com o ' + provLabel + ' — não tem senha. Clique abaixo para entrar:</div>' +
              '<button onclick="document.getElementById(\'reset-password-panel\').remove();' + (socialProvider === 'google.com' ? 'handleGoogleLogin&&handleGoogleLogin()' : '') + '" class="btn" style="width:100%;background:#fff;color:#1a1a2e;font-weight:700;font-size:0.88rem;padding:10px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;border:1px solid rgba(255,255,255,0.15);box-shadow:0 2px 8px rgba(0,0,0,0.3);">' +
                (socialProvider === 'google.com' ? googleSvg : '🔐') +
                'Entrar com ' + provLabel +
              '</button>' +
              '<div style="text-align:center;margin-top:10px;">' +
                '<button onclick="document.getElementById(\'reset-password-panel\').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.75rem;text-decoration:underline;">Cancelar</button>' +
              '</div>' +
            '</div>';
        }
        return;
      }
      // Conta com email/senha → enviar reset normalmente
      _sendPasswordResetEmail(email);
    })
    .catch(function() {
      // Não conseguiu verificar → tentar enviar mesmo assim
      _sendPasswordResetEmail(email);
    });
};

function _sendPasswordResetEmail(email) {
  var statusEl = document.getElementById('reset-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Enviando...</span>';
  var btn = document.querySelector('#reset-password-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  var _showSent = function() {
    var panel = document.getElementById('reset-password-panel');
    if (panel) {
      var _safeResetEmail = (email || '').replace(/'/g, "\\'");
      panel.innerHTML =
        '<div style="text-align:center;padding:8px 0;">' +
          '<div style="font-size:1.4rem;margin-bottom:6px;">✅</div>' +
          '<div style="font-weight:700;color:var(--text-bright);font-size:0.9rem;margin-bottom:4px;">Link enviado!</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);">Verifique <b>' + email + '</b> (e a caixa de <b>spam/lixo eletrônico</b>).<br>Clique no link do e-mail para criar sua nova senha.</div>' +
          '<button onclick="document.getElementById(\'reset-password-panel\').remove()" style="margin-top:10px;background:none;border:none;color:var(--primary-color);cursor:pointer;font-size:0.8rem;text-decoration:underline;">Fechar</button>' +
          // v2.4.97: caminho alternativo por celular (e-mail não chega no UOL/Hotmail).
          '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;"><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div><span style="font-size:0.72rem;color:var(--text-muted);">ou</span><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div></div>' +
          '<div style="font-size:0.74rem;color:var(--text-muted);line-height:1.45;margin-bottom:10px;">Não chegou o e-mail? Redefina pelo seu <b>celular cadastrado</b> — recebe um código por SMS e WhatsApp.</div>' +
          '<button onclick="window._resetPhoneStart(\'' + _safeResetEmail + '\')" class="btn btn-block" style="background:#25d366;color:#0a1f12;font-size:0.88rem;font-weight:800;padding:11px;">📱 Redefinir por celular</button>' +
        '</div>';
    }
  };
  var _showError = function(error) {
    window._error && window._error('Password reset error:', error);
    var statusEl2 = document.getElementById('reset-status');
    var btn2 = document.querySelector('#reset-password-panel .btn-primary');
    if (btn2) { btn2.disabled = false; btn2.textContent = 'Enviar link'; }
    var msg = 'Erro ao enviar. Tente novamente.';
    var code = error && error.code;
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      msg = 'E-mail não encontrado. Verifique e tente novamente.';
    } else if (code === 'auth/too-many-requests') {
      msg = 'Muitas tentativas. Aguarde alguns minutos.';
    }
    if (statusEl2) statusEl2.innerHTML = '<span style="color:#f87171;">' + msg + '</span>';
  };
  // Fallback: remetente padrão do Firebase (pode cair no spam de Hotmail/Outlook).
  var _nativeReset = function() {
    firebase.auth().sendPasswordResetEmail(email, {
      url: 'https://scoreplace.app/#dashboard', handleCodeInApp: false
    }).then(_showSent).catch(_showError);
  };

  // v2.1.78: envia o reset pelo NOSSO SMTP (Cloud Function sendPasswordReset),
  // que NÃO cai no spam como o remetente default do Firebase. Cobre também
  // ex-usuários do magic link (provider 'password' sem senha setada). Se a
  // function falhar/indisponível, cai no envio nativo do Firebase.
  var _name = '';
  try { var _cu = window.AppStore && window.AppStore.currentUser; _name = (_cu && _cu.displayName) || ''; } catch (e) {}
  var _fnCall = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.functions) {
      _fnCall = firebase.functions().httpsCallable('sendPasswordReset')({ email: email, name: _name });
    }
  } catch (e) {}
  if (_fnCall && typeof _fnCall.then === 'function') {
    _fnCall.then(function() { _showSent(); }).catch(function(err) {
      window._warn && window._warn('[reset] sendPasswordReset fn falhou, fallback nativo:', err && (err.message || err.code));
      _nativeReset();
    });
  } else {
    _nativeReset();
  }
}

// ─── Redefinir senha por celular (v2.4.97) ───────────────────────────────────
// Caminho alternativo dentro do painel "Link enviado!" pra quem não recebe o
// e-mail de reset. A pessoa digita o celular CADASTRADO na conta → recebe
// código por SMS (Firebase) + WhatsApp (código + botão) → confirma → define
// nova senha (e-mail pré-preenchido) e entra. Espelha o gate por celular.
window._resetPhoneEmail = '';
window._resetSmsConfirmation = null;

// Máscara BR ao digitar: aceita só dígitos e formata (11) 99999-8888 / (11) 9999-8888.
window._fmtPhoneBR = function(digits) {
  var d = String(digits || '').replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return '(' + d;
  var ddd = d.slice(0, 2);
  var rest = d.slice(2);
  if (rest.length <= 4) return '(' + ddd + ') ' + rest;
  if (rest.length <= 8) return '(' + ddd + ') ' + rest.slice(0, 4) + '-' + rest.slice(4); // fixo 8 díg.
  return '(' + ddd + ') ' + rest.slice(0, 5) + '-' + rest.slice(5); // celular 9 díg.
};

window._resetPhoneMask = function(el) {
  if (!el) return;
  var d = el.value.replace(/\D/g, '').slice(0, 11);
  el.value = window._fmtPhoneBR(d);
  var prev = document.getElementById('reset-phone-preview');
  if (prev) {
    prev.textContent = d.length >= 10
      ? ('📞 +55 ' + window._fmtPhoneBR(d))
      : 'Formato: (11) 99999-8888';
  }
};

window._resetPhoneStart = function(email) {
  if (email) window._resetPhoneEmail = email;
  var email2 = window._resetPhoneEmail || '';
  var panel = document.getElementById('reset-password-panel');
  if (!panel) {
    // Sem painel (caso raro) — cria um inline acima do form de login.
    var anchor = document.getElementById('email-login-mode');
    if (!anchor) return;
    panel = document.createElement('div');
    panel.id = 'reset-password-panel';
    panel.style.cssText = 'margin-bottom:12px;padding:14px 16px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.25);border-radius:12px;';
    anchor.parentNode.insertBefore(panel, anchor);
  }
  panel.innerHTML =
    '<div style="font-weight:700;font-size:0.9rem;color:var(--text-bright);margin-bottom:4px;">📱 Redefinir por celular</div>' +
    '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:10px;line-height:1.45;">Digite o celular <b>cadastrado nesta conta</b>. Você recebe um código por <b>SMS</b> e por <b>WhatsApp</b> (com botão de 1 toque).</div>' +
    '<div style="display:flex;gap:8px;align-items:stretch;margin-bottom:6px;">' +
      '<span style="display:flex;align-items:center;padding:0 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:0.9rem;font-weight:700;color:var(--text-bright);white-space:nowrap;">🇧🇷 +55</span>' +
      '<input id="reset-phone-input" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 99999-8888" oninput="window._resetPhoneMask(this)" style="flex:1;min-width:0;box-sizing:border-box;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright);font-size:1rem;" />' +
    '</div>' +
    '<div id="reset-phone-preview" style="font-size:0.74rem;color:var(--text-muted);min-height:16px;margin-bottom:10px;">Formato: (11) 99999-8888</div>' +
    '<button id="reset-phone-send-btn" onclick="window._resetPhoneSend()" class="btn btn-block" style="background:#25d366;color:#0a1f12;font-weight:800;font-size:0.88rem;padding:11px;margin-bottom:8px;">Enviar código</button>' +
    '<div id="reset-phone-status" style="min-height:18px;font-size:0.74rem;margin-bottom:6px;"></div>' +
    '<div style="text-align:center;">' +
      '<button onclick="document.getElementById(\'reset-password-panel\').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.78rem;text-decoration:underline;">Cancelar</button>' +
    '</div>';
  setTimeout(function() { var i = document.getElementById('reset-phone-input'); if (i) i.focus(); }, 50);
};

window._resetPhoneSend = function() {
  var inp = document.getElementById('reset-phone-input');
  var statusEl = document.getElementById('reset-phone-status');
  var btn = document.getElementById('reset-phone-send-btn');
  var email = window._resetPhoneEmail || '';
  var raw = inp ? inp.value.trim() : '';
  var digits = raw.replace(/\D/g, '');
  if (!email) { if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">E-mail não informado. Volte e digite seu e-mail.</span>'; return; }
  if (digits.length < 10) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Digite DDD + número (ex: 11 99999-8888).</span>';
    if (inp) inp.focus();
    return;
  }
  var phoneE164 = (typeof window._normalizePhoneE164 === 'function')
    ? window._normalizePhoneE164(raw, '55')
    : ('+55' + digits);
  if (!phoneE164) { if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Número inválido. Confira o DDD + número.</span>'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">⏳ Verificando o celular…</span>';

  if (!firebase.functions) { if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">Serviço indisponível. Tente o link no e-mail.</span>'; if (btn) { btn.disabled = false; btn.textContent = 'Enviar código'; } return; }

  firebase.functions().httpsCallable('sendPasswordResetPhone')({ email: email, phone: phoneE164 })
    .then(function(res) {
      var d = (res && res.data) || {};
      if (!d.ok) {
        var msg = 'Não foi possível enviar. Tente o link no e-mail.';
        if (d.reason === 'no-phone') msg = 'Esta conta não tem celular cadastrado. Use o link enviado no e-mail.';
        else if (d.reason === 'phone-mismatch') msg = 'Esse celular não confere com o cadastrado nesta conta.';
        else if (d.reason === 'no-account') msg = 'Não encontramos uma conta com esse e-mail.';
        else if (d.reason === 'bad-phone') msg = 'Número inválido. Confira o DDD + número.';
        if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">' + msg + '</span>';
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar código'; }
        return;
      }
      // Celular confere → dispara SMS (Firebase) em paralelo, best-effort.
      window._resetFireSms(phoneE164);
      window._resetShowCodeStep(phoneE164);
    })
    .catch(function(err) {
      window._warn && window._warn('[resetPhone] send falhou:', err && (err.code || err.message));
      if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">Erro ao enviar. Tente novamente.</span>';
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar código'; }
    });
};

// SMS via Firebase (best-effort). Em caso de falha (reCAPTCHA iOS, quota), o
// WhatsApp já cobre o fluxo — não bloqueia.
window._resetFireSms = function(phoneE164) {
  window._resetSmsConfirmation = null;
  try {
    if (typeof _ensureRecaptchaInBody === 'function') _ensureRecaptchaInBody();
    if (typeof _resetPhoneRecaptcha === 'function') _resetPhoneRecaptcha();
    window._phoneRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible', callback: function() {}, 'expired-callback': function() {}
    });
    window._phoneRecaptchaVerifier.render().then(function() {
      return firebase.auth().signInWithPhoneNumber(phoneE164, window._phoneRecaptchaVerifier);
    }).then(function(confirmation) {
      window._resetSmsConfirmation = confirmation;
    }).catch(function(e) {
      window._warn && window._warn('[resetPhone] SMS falhou:', e && (e.code || e.message));
      window._resetSmsConfirmation = null;
    });
  } catch (e) {
    window._warn && window._warn('[resetPhone] recaptcha crash:', e && e.message);
    window._resetSmsConfirmation = null;
  }
};

window._resetShowCodeStep = function(phoneE164) {
  var panel = document.getElementById('reset-password-panel');
  if (!panel) return;
  panel.innerHTML =
    '<div style="font-weight:700;font-size:0.9rem;color:var(--text-bright);margin-bottom:4px;">🔑 Digite o código</div>' +
    '<div style="font-size:0.8rem;color:#25d366;font-weight:700;margin-bottom:8px;">' + (window._safeHtml ? window._safeHtml(phoneE164 || '') : (phoneE164 || '')) + '</div>' +
    '<div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:10px;line-height:1.45;">Enviamos um código por <b>SMS</b> e por <b>WhatsApp</b>. Digite qualquer um — ou toque no botão da mensagem do WhatsApp pra redefinir direto.</div>' +
    '<input id="reset-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="width:100%;box-sizing:border-box;text-align:center;letter-spacing:8px;padding:11px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright);font-size:1.3rem;font-weight:800;margin-bottom:10px;" />' +
    '<button id="reset-code-verify-btn" onclick="window._resetPhoneVerify()" class="btn btn-success btn-block" style="font-size:0.9rem;font-weight:800;padding:11px;margin-bottom:8px;">✅ Confirmar</button>' +
    '<div id="reset-code-status" style="min-height:18px;font-size:0.74rem;margin-bottom:6px;"></div>' +
    '<div style="text-align:center;">' +
      '<button onclick="window._resetPhoneStart()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.78rem;text-decoration:underline;">← Trocar número</button>' +
    '</div>';
  setTimeout(function() { var c = document.getElementById('reset-code-input'); if (c) c.focus(); }, 50);
};

window._resetPhoneVerify = function() {
  var ci = document.getElementById('reset-code-input');
  var statusEl = document.getElementById('reset-code-status');
  var btn = document.getElementById('reset-code-verify-btn');
  var email = window._resetPhoneEmail || '';
  var code = ci ? ci.value.replace(/\D/g, '') : '';
  if (code.length !== 6) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">O código tem 6 dígitos.</span>';
    if (ci) ci.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando…'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">⏳ Verificando…</span>';

  var _fail = function(msg) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar'; }
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + (msg || 'Código incorreto. Confira no SMS/WhatsApp.') + '</span>';
    if (ci) { ci.focus(); ci.select && ci.select(); }
  };

  if (!firebase.functions) { _fail('Serviço indisponível.'); return; }

  // 1) Tenta o código NOSSO (WhatsApp).
  firebase.functions().httpsCallable('verifyPasswordResetPhone')({ email: email, code: code })
    .then(function(res) {
      var d = (res && res.data) || {};
      if (d.ok && d.customToken) { return window._resetSignInAndSetPwd(d.customToken, d.email || email); }
      // 2) Tenta o código do Firebase (SMS) — confirma e prova via idToken.
      if (window._resetSmsConfirmation) {
        return window._resetSmsConfirmation.confirm(code).then(function() {
          var u = firebase.auth().currentUser;
          if (!u) throw new Error('no-sms-user');
          return u.getIdToken().then(function(idToken) {
            return firebase.functions().httpsCallable('verifyPasswordResetPhone')({ email: email, idToken: idToken })
              .then(function(r2) {
                var d2 = (r2 && r2.data) || {};
                if (d2.ok && d2.customToken) { return window._resetSignInAndSetPwd(d2.customToken, d2.email || email); }
                throw new Error('sms-verify-failed');
              });
          });
        });
      }
      throw new Error('wrong-code');
    })
    .catch(function(err) {
      window._warn && window._warn('[resetPhone] verify falhou:', err && (err.code || err.message));
      _fail();
    });
};

// Loga com o custom token da conta do e-mail e mostra a tela de nova senha.
window._resetSignInAndSetPwd = function(customToken, email) {
  return firebase.auth().signInWithCustomToken(customToken)
    .then(function() {
      var u = firebase.auth().currentUser;
      return (u && u.reload) ? u.reload().catch(function() {}) : null;
    })
    .then(function() {
      window._resetShowNewPassword(email);
    });
};

// Tela de nova senha (e-mail pré-preenchido). Funciona em app E na página
// standalone do botão do WhatsApp (?pr=). Overlay full-screen.
window._resetShowNewPassword = function(email) {
  var old = document.getElementById('reset-newpwd-overlay');
  if (old) old.remove();
  var safeEmail = (email || '').replace(/"/g, '&quot;');
  var ov = document.createElement('div');
  ov.id = 'reset-newpwd-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100060;background:var(--bg-darker,#0a0e1a);display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto;box-sizing:border-box;';
  ov.innerHTML =
    '<div style="max-width:380px;width:100%;background:var(--bg-card,#0f172a);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:26px 22px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-size:2.2rem;text-align:center;margin-bottom:6px;">🔒</div>' +
      '<div style="font-size:1.15rem;font-weight:800;color:var(--text-bright,#fff);text-align:center;margin-bottom:6px;">Defina sua nova senha</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted);text-align:center;margin-bottom:16px;word-break:break-all;">' + (window._safeHtml ? window._safeHtml(email || '') : (email || '')) + '</div>' +
      '<form id="reset-newpwd-form" autocomplete="on" onsubmit="event.preventDefault();window._resetSaveNewPassword()">' +
        '<input type="email" name="email" autocomplete="username" value="' + safeEmail + '" readonly style="display:none;">' +
        '<input type="password" id="reset-newpwd" name="password" autocomplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" minlength="6" required style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright,#fff);font-size:0.95rem;">' +
        '<input type="password" id="reset-newpwd-confirm" name="password-confirm" autocomplete="new-password" placeholder="Confirmar nova senha" minlength="6" required style="width:100%;box-sizing:border-box;padding:12px;margin-bottom:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright,#fff);font-size:0.95rem;">' +
        '<div id="reset-newpwd-error" style="font-size:0.78rem;color:#f87171;margin-bottom:10px;display:none;"></div>' +
        '<button type="submit" id="reset-newpwd-btn" class="btn btn-success btn-block" style="font-size:0.95rem;font-weight:800;padding:13px;">Salvar e entrar</button>' +
      '</form>' +
    '</div>';
  document.body.appendChild(ov);
  setTimeout(function() { var el = document.getElementById('reset-newpwd'); if (el) el.focus(); }, 80);
};

window._resetSaveNewPassword = function() {
  var pwd = (document.getElementById('reset-newpwd') || {}).value || '';
  var confirm = (document.getElementById('reset-newpwd-confirm') || {}).value || '';
  var errEl = document.getElementById('reset-newpwd-error');
  var btn = document.getElementById('reset-newpwd-btn');
  var showErr = function(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
  if (pwd.length < 6) { showErr('A senha precisa ter pelo menos 6 caracteres.'); return; }
  if (pwd !== confirm) { showErr('As senhas não coincidem.'); return; }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  var u = firebase.auth().currentUser;
  if (!u) { showErr('Sessão expirada. Tente de novo pelo app.'); if (btn) { btn.disabled = false; btn.textContent = 'Salvar e entrar'; } return; }

  // standalone = página do botão do WhatsApp (?pr=), onde o DOM do app foi
  // substituído pela tela de status. Lá, recarrega pra entrar limpo.
  var standalone = !document.getElementById('view-container');

  u.updatePassword(pwd)
    .then(function() {
      if (window.FirestoreDB && window.FirestoreDB.db && u.uid) {
        window.FirestoreDB.db.collection('users').doc(u.uid).set({
          authProvider: 'password', emailVerified: true, updatedAt: new Date().toISOString()
        }, { merge: true }).catch(function() {});
      }
      if (typeof _resetPhoneRecaptcha === 'function') { try { _resetPhoneRecaptcha(); } catch (e) {} }
      var ov = document.getElementById('reset-newpwd-overlay'); if (ov) ov.remove();
      var rp = document.getElementById('reset-password-panel'); if (rp) rp.remove();
      var ml = document.getElementById('modal-login'); if (ml) ml.classList.remove('active');
      if (window.showNotification) window.showNotification('✅ Senha redefinida!', 'Você já está conectado.', 'success');

      if (standalone) {
        try { window.location.hash = '#dashboard'; } catch (e) {}
        window.location.reload();
        return;
      }
      Promise.resolve(simulateLoginSuccess({ uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL }))
        .then(function() {
          window.location.hash = '#dashboard';
          if (typeof initRouter === 'function') initRouter();
        });
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar e entrar'; }
      var msg = 'Erro ao salvar a senha.';
      if (err && err.code === 'auth/requires-recent-login') msg = 'Sessão expirou. Peça um novo código e tente de novo.';
      else if (err && err.code === 'auth/weak-password') msg = 'Senha muito fraca. Use pelo menos 6 caracteres.';
      showErr(msg);
    });
};

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

// ── Moderação: bloquear usuário (Apple App Store Guideline 1.2 — UGC) ───────
// Adiciona o uid à lista blockedUids do PRÓPRIO perfil (arrayUnion no doc do
// dono — regra Firestore já permite o dono editar o próprio doc). Conteúdo de
// usuários bloqueados (avaliações de locais, etc.) fica oculto para quem
// bloqueou. Desbloqueio via _unblockUser. name é opcional (rótulo amigável).
window._blockUser = function(uid, name) {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid) { if (window.showNotification) window.showNotification('Faça login', 'Entre para bloquear usuários.', 'error'); return; }
  if (!uid || uid === cu.uid) return;
  var nm = name || 'este usuário';
  var doBlock = function() {
    try {
      window.FirestoreDB.db.collection('users').doc(cu.uid).set({
        blockedUids: firebase.firestore.FieldValue.arrayUnion(uid)
      }, { merge: true });
    } catch (e) { window._error('block user:', e); }
    if (!Array.isArray(cu.blockedUids)) cu.blockedUids = [];
    if (cu.blockedUids.indexOf(uid) === -1) cu.blockedUids.push(uid);
    if (window.showNotification) window.showNotification('Usuário bloqueado', 'Você não verá mais o conteúdo dessa pessoa. Desbloqueie no seu perfil quando quiser.', 'success');
    if (typeof window._venuesRehydrateReviews === 'function') window._venuesRehydrateReviews();
  };
  if (typeof window.showConfirmDialog === 'function') {
    window.showConfirmDialog('Bloquear ' + nm + '?', 'Você não verá mais avaliações e conteúdo dessa pessoa. É possível desbloquear depois no seu perfil.', doBlock, null, { confirmText: 'Bloquear', cancelText: 'Cancelar', type: 'danger' });
  } else {
    doBlock();
  }
};

window._unblockUser = function(uid) {
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid || !uid) return;
  try {
    window.FirestoreDB.db.collection('users').doc(cu.uid).set({
      blockedUids: firebase.firestore.FieldValue.arrayRemove(uid)
    }, { merge: true });
  } catch (e) { window._error('unblock user:', e); }
  if (Array.isArray(cu.blockedUids)) { var i = cu.blockedUids.indexOf(uid); if (i !== -1) cu.blockedUids.splice(i, 1); }
  if (typeof window._venuesRehydrateReviews === 'function') window._venuesRehydrateReviews();
};

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

// v1.9.83: envia o e-mail de verificação RICO (botão CTA, remetente
// scoreplace.app@gmail.com) via Cloud Function sendVerificationEmail, em vez
// do e-mail padrão do Firebase (noreply@...firebaseapp.com, que cai no spam e
// é só um link cru). Fallback pro padrão se a função não responder.
function _sendRichVerificationEmail(firebaseUser, name) {
  if (!firebaseUser) return Promise.resolve(false);
  var email = firebaseUser.email || '';
  var nm = name || firebaseUser.displayName || '';
  // v3.0.x: provedores que descartam HTML+link (Microsoft/UOL/BOL/Terra) recebem um CÓDIGO
  // de 6 dígitos por e-mail TEXTO PURO (melhor entrega) via sendVerificationCode. Se a função
  // falhar, degrada pro e-mail rico com link (_callRich). O gate desses domínios mostra o
  // campo de digitar o código.
  if (typeof window._isUnreliableEmailDomain === 'function' && window._isUnreliableEmailDomain(email)
      && firebase && firebase.functions) {
    return firebase.functions().httpsCallable('sendVerificationCode')({})
      .then(function() { return 'code'; })
      .catch(function(e) { window._warn('[verify] código falhou, degradando p/ link:', e && (e.code || e.message)); return _callRich(1); });
  }
  var _fallback = function(reasonErr) {
    // v2.1.9: o caminho rico (Cloud Function → mail/ via SMTP scoreplace.app)
    // é o ÚNICO confiável. O fallback do Firebase (sendEmailVerification) sai
    // de noreply@…firebaseapp.com e na prática NÃO chega (caso Elide). Só é
    // usado em último caso, e registramos no Sentry pra termos visibilidade
    // quando isso acontecer.
    if (typeof window._captureException === 'function') {
      try {
        window._captureException(reasonErr || new Error('verification rich path failed'),
          { area: 'sendRichVerificationEmail.fallback', email: email });
      } catch (e) {}
    }
    try { return firebaseUser.sendEmailVerification({ url: (window.SCOREPLACE_URL || 'https://scoreplace.app') + '/' }); }
    catch (e) { return Promise.resolve(false); }
  };
  // v2.1.9: retry no cliente também (até 3x) — cobre soluço de rede / cold start
  // da função antes de degradar pro fallback. A função em si já faz retry no
  // generateEmailVerificationLink; aqui cobrimos a CHAMADA.
  function _callRich(attempt) {
    var fn = firebase.functions().httpsCallable('sendVerificationEmail');
    return fn({ email: email, name: nm })
      .then(function() { return true; })
      .catch(function(e) {
        window._warn('[verify] e-mail rico tentativa ' + attempt + ' falhou:', e && (e.code || e.message));
        if (attempt < 3) {
          return new Promise(function(res) { setTimeout(res, attempt * 800); })
            .then(function() { return _callRich(attempt + 1); });
        }
        return _fallback(e);
      });
  }
  try {
    if (firebase && firebase.functions) {
      return _callRich(1);
    }
  } catch (e) {}
  return _fallback();
}

// ─── Gate de verificação de e-mail (v1.9.78) ────────────────────────────────
// Contas e-mail/senha precisam confirmar o e-mail antes de usar o app. Enquanto
// não confirmam, veem este gate (bloqueia tudo) e o sistema não mescla/sugere
// nada. Google/telefone já entram verificados.
window._showEmailVerificationGate = function(email, name) {
  if (name) window._pendingVerifyName = name;
  window._gateEmail = email || '';
  var existing = document.getElementById('email-verify-gate');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'email-verify-gate';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100050;background:var(--bg-darker,#0a0e1a);display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto;box-sizing:border-box;';
  // v3.0.x: provedor que costuma DROPAR a confirmação (Microsoft/UOL) → o e-mail
  // provavelmente não vai chegar. Lidera com aviso forte + celular como ação PRIMÁRIA.
  var _bad = (typeof window._isUnreliableEmailDomain === 'function') && window._isUnreliableEmailDomain(email);
  var _safeEm = window._safeHtml(email || '');
  var _phoneBtn =
    '<button onclick="window._gatePhoneStart()" class="btn btn-block" style="background:#25d366;color:#0a1f12;font-size:' + (_bad ? '1rem' : '0.92rem') + ';font-weight:800;padding:' + (_bad ? '14px' : '12px') + ';margin-bottom:12px;">📱 Autenticar por celular' + (_bad ? ' (recomendado)' : '') + '</button>';
  var _logoutBtn =
    '<button onclick="window.handleLogout && window.handleLogout()" style="background:none;border:none;color:var(--text-muted);font-size:0.8rem;cursor:pointer;text-decoration:underline;">Sair</button>';
  var _middle;
  if (_bad) {
    // v3.0.x: domínios que dropam link → enviamos um CÓDIGO por e-mail texto-puro.
    // A tela pede o código; o celular fica como rede de segurança (sempre funciona).
    _middle =
      '<div style="font-size:0.84rem;color:var(--text-muted);line-height:1.5;margin-bottom:12px;">Digite o <b>código de 6 dígitos</b> que enviamos por e-mail (texto simples — chega melhor no Hotmail/Outlook/UOL).</div>' +
      '<input id="gate-email-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" oninput="this.value=this.value.replace(/\\D/g,\'\').slice(0,6)" onkeydown="if(event.key===\'Enter\')window._gateVerifyCode()" style="width:100%;box-sizing:border-box;text-align:center;letter-spacing:0.35em;font-size:1.5rem;font-weight:800;padding:12px;margin-bottom:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright);">' +
      '<div id="gate-email-code-status" style="font-size:0.78rem;min-height:1.1em;margin-bottom:8px;"></div>' +
      '<button onclick="window._gateVerifyCode()" class="btn btn-success btn-block" style="font-size:0.98rem;font-weight:800;padding:13px;margin-bottom:8px;">✅ Confirmar</button>' +
      '<button onclick="window._gateResendCode(this)" class="btn btn-block" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);color:var(--text-bright);font-size:0.82rem;font-weight:700;padding:9px;margin-bottom:14px;">📨 Reenviar código</button>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:6px 0 12px;"><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div><span style="font-size:0.72rem;color:var(--text-muted);">não recebeu o código?</span><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div></div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted);line-height:1.45;margin-bottom:10px;">Confirme pelo <b>celular</b> — código por SMS + botão de autenticar no WhatsApp.</div>' +
      _phoneBtn;
  } else {
    _middle =
      '<div style="font-size:0.85rem;color:var(--text-muted);line-height:1.5;margin-bottom:18px;">Abra seu e-mail e clique em <b>Confirmar minha conta</b>. Enquanto não confirmar, você não pode usar o scoreplace.app. <span style="opacity:0.8;">(confira também a caixa de spam)</span></div>' +
      '<button onclick="window._checkEmailVerified()" class="btn btn-success btn-block" style="font-size:0.98rem;font-weight:800;padding:13px;margin-bottom:10px;">✅ Já confirmei</button>' +
      '<button onclick="window._resendVerifyEmail()" class="btn btn-block" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);color:var(--text-bright);font-size:0.88rem;font-weight:700;padding:11px;margin-bottom:10px;">📨 Reenviar e-mail</button>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 12px;"><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div><span style="font-size:0.72rem;color:var(--text-muted);">ou</span><div style="flex:1;height:1px;background:rgba(255,255,255,0.12);"></div></div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted);line-height:1.45;margin-bottom:10px;">Não chegou o e-mail? Confirme pelo seu celular — recebe um código por SMS e WhatsApp.</div>' +
      _phoneBtn;
  }
  ov.innerHTML =
    '<div style="max-width:420px;width:100%;text-align:center;background:var(--bg-card,#0f172a);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:28px 22px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-size:2.6rem;margin-bottom:8px;">📬</div>' +
      '<div style="font-size:1.2rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:8px;">Confirme seu e-mail</div>' +
      '<div style="font-size:0.9rem;color:var(--text-muted);line-height:1.5;margin-bottom:6px;">' + (_bad ? 'Enviamos um código de confirmação para' : 'Enviamos um link de confirmação para') + '</div>' +
      '<div style="font-size:0.95rem;font-weight:700;color:#fbbf24;margin-bottom:14px;word-break:break-all;">' + _safeEm + '</div>' +
      _middle +
      _logoutBtn +
    '</div>';
  document.body.appendChild(ov);
};

// ── Autenticação por celular no gate (v2.4.24) ──────────────────────────────
// Alternativa pra quando o e-mail de confirmação não chega. A pessoa prova que
// controla um telefone (SMS do Firebase + código/botão nosso pelo WhatsApp) e
// a conta é confirmada (emailVerified=true) com o telefone salvo no perfil.
window._gatePhoneConfirmation = null;
window._gatePhonePending = null;

window._gatePhoneStart = function() {
  var card = document.querySelector('#email-verify-gate > div');
  if (!card) return;
  card.innerHTML =
    '<div style="font-size:2.2rem;margin-bottom:8px;">📱</div>' +
    '<div style="font-size:1.15rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:8px;">Confirmar por celular</div>' +
    '<div style="font-size:0.85rem;color:var(--text-muted);line-height:1.5;margin-bottom:16px;">Digite seu número com DDD. Você recebe um código por <b>SMS</b> e por <b>WhatsApp</b> (com botão de 1 toque).</div>' +
    '<div style="display:flex;gap:8px;align-items:stretch;margin-bottom:12px;">' +
      '<span style="display:flex;align-items:center;padding:0 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);border-radius:10px;font-size:0.95rem;font-weight:700;color:var(--text-bright);">🇧🇷 +55</span>' +
      '<input id="gate-phone-input" type="tel" inputmode="numeric" autocomplete="tel" placeholder="(11) 99999-8888" style="flex:1;min-width:0;box-sizing:border-box;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright,#fff);font-size:1rem;" />' +
    '</div>' +
    '<button id="gate-phone-send-btn" onclick="window._gatePhoneSend()" class="btn btn-block" style="background:#25d366;color:#0a1f12;font-size:0.95rem;font-weight:800;padding:12px;margin-bottom:10px;">Enviar código</button>' +
    '<div id="gate-phone-status" style="min-height:18px;font-size:0.74rem;margin-bottom:8px;"></div>' +
    '<button onclick="window._showEmailVerificationGate(window._gateEmail)" style="background:none;border:none;color:var(--text-muted);font-size:0.8rem;cursor:pointer;text-decoration:underline;">← Voltar</button>';
  var inp = document.getElementById('gate-phone-input');
  if (inp) inp.focus();
};

window._gatePhoneSend = function() {
  var inp = document.getElementById('gate-phone-input');
  var statusEl = document.getElementById('gate-phone-status');
  var btn = document.getElementById('gate-phone-send-btn');
  var raw = inp ? inp.value.trim() : '';
  var digits = raw.replace(/\D/g, '');
  if (digits.length < 10) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Digite DDD + número (ex: 11 99999-8888).</span>';
    if (inp) inp.focus();
    return;
  }
  // _normalizePhoneE164(raw, '55') já devolve no formato '+5511999998888'.
  var phoneE164 = (typeof window._normalizePhoneE164 === 'function')
    ? window._normalizePhoneE164(raw, '55')
    : ('+55' + digits);
  if (!phoneE164 || phoneE164.replace(/\D/g, '').length < 12) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Número inválido. Confira o DDD + número.</span>';
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar código'; }
    if (inp) inp.focus();
    return;
  }

  var u = firebase.auth().currentUser;
  if (!u) { if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">Sessão expirada. Entre de novo.</span>'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">⏳ Enviando código por SMS e WhatsApp...</span>';
  window._gatePhonePending = phoneE164;

  // (1) WhatsApp em paralelo (código nosso + botão de 1 toque).
  try {
    if (firebase.functions) {
      firebase.functions().httpsCallable('sendPhoneVerifyWhatsApp')({ phone: phoneE164 })
        .then(function(r) { window._log && window._log('[gatePhone] WA:', JSON.stringify(r && r.data)); })
        .catch(function(e) { window._warn && window._warn('[gatePhone] WA falhou:', e && (e.code || e.message)); });
    }
  } catch (e) {}

  // (2) SMS via Firebase — vincula o telefone à conta atual (mantém o e-mail).
  try {
    if (typeof _ensureRecaptchaInBody === 'function') _ensureRecaptchaInBody();
    if (typeof _resetPhoneRecaptcha === 'function') _resetPhoneRecaptcha();
    window._gateRecaptcha = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: function() {},
      'expired-callback': function() {}
    });
    window._gateRecaptcha.render().then(function() {
      return u.linkWithPhoneNumber(phoneE164, window._gateRecaptcha);
    }).then(function(confirmationResult) {
      window._gatePhoneConfirmation = confirmationResult;
      window._gateShowCodeStep(phoneE164);
    }).catch(function(error) {
      window._warn && window._warn('[gatePhone] SMS/link falhou:', error && (error.code || error.message));
      // SMS pode falhar (reCAPTCHA iOS, número já vinculado, quota). O WhatsApp
      // já foi enviado — então seguimos pro passo do código mesmo assim.
      window._gatePhoneConfirmation = null;
      window._gateShowCodeStep(phoneE164, error && error.code);
    });
  } catch (e) {
    window._warn && window._warn('[gatePhone] recaptcha/link crash:', e && e.message);
    window._gatePhoneConfirmation = null;
    window._gateShowCodeStep(phoneE164, 'recaptcha-error');
  }
};

window._gateShowCodeStep = function(phoneE164, smsErrCode) {
  var card = document.querySelector('#email-verify-gate > div');
  if (!card) return;
  var smsNote = smsErrCode
    ? '<div style="font-size:0.72rem;color:#fbbf24;margin-bottom:10px;">Não foi possível enviar SMS agora — use o código ou o botão do WhatsApp.</div>'
    : '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;">Enviamos um código por <b>SMS</b> e por <b>WhatsApp</b>. Digite qualquer um deles — ou toque no botão da mensagem do WhatsApp pra entrar direto.</div>';
  card.innerHTML =
    '<div style="font-size:2.2rem;margin-bottom:8px;">🔑</div>' +
    '<div style="font-size:1.15rem;font-weight:800;color:var(--text-bright,#fff);margin-bottom:6px;">Digite o código</div>' +
    '<div style="font-size:0.85rem;color:#25d366;font-weight:700;margin-bottom:12px;">' + window._safeHtml(phoneE164 || '') + '</div>' +
    smsNote +
    '<input id="gate-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="width:100%;box-sizing:border-box;text-align:center;letter-spacing:8px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.2);border-radius:10px;color:var(--text-bright,#fff);font-size:1.4rem;font-weight:800;margin-bottom:12px;" />' +
    '<button id="gate-code-verify-btn" onclick="window._gatePhoneVerify()" class="btn btn-success btn-block" style="font-size:0.95rem;font-weight:800;padding:12px;margin-bottom:10px;">✅ Confirmar</button>' +
    '<div id="gate-code-status" style="min-height:18px;font-size:0.74rem;margin-bottom:8px;"></div>' +
    '<button onclick="window._gatePhoneStart()" style="background:none;border:none;color:var(--text-muted);font-size:0.8rem;cursor:pointer;text-decoration:underline;">← Trocar número</button>';
  var ci = document.getElementById('gate-code-input');
  if (ci) ci.focus();
};

window._gatePhoneVerify = function() {
  var ci = document.getElementById('gate-code-input');
  var statusEl = document.getElementById('gate-code-status');
  var btn = document.getElementById('gate-code-verify-btn');
  var code = ci ? ci.value.replace(/\D/g, '') : '';
  if (code.length !== 6) {
    if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">O código tem 6 dígitos.</span>';
    if (ci) ci.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">⏳ Verificando...</span>';

  var _fail = function(msg) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar'; }
    if (statusEl) statusEl.innerHTML = '<span style="color:#ef4444;">' + (msg || 'Código incorreto. Confira no SMS/WhatsApp.') + '</span>';
    if (ci) { ci.focus(); ci.select && ci.select(); }
  };

  // 1) Tenta como código NOSSO (WhatsApp) via Cloud Function.
  var tryWhatsAppCode = function() {
    if (!firebase.functions) return _fail();
    return firebase.functions().httpsCallable('verifyPhoneGate')({ code: code })
      .then(function(r) {
        var d = (r && r.data) || {};
        if (d.ok) { window._gateEnterApp(); return true; }
        return false;
      })
      .catch(function() { return false; });
  };

  // 2) Tenta como código do Firebase (SMS) — confirma o link e finaliza no server.
  var tryFirebaseSms = function() {
    if (!window._gatePhoneConfirmation) return Promise.resolve(false);
    return window._gatePhoneConfirmation.confirm(code)
      .then(function() {
        // Telefone vinculado. Agora marca emailVerified no server.
        if (!firebase.functions) return false;
        return firebase.functions().httpsCallable('verifyPhoneGate')({ afterPhoneLink: true })
          .then(function(r) {
            var d = (r && r.data) || {};
            if (d.ok) { window._gateEnterApp(); return true; }
            return false;
          });
      })
      .catch(function() { return false; });
  };

  tryWhatsAppCode().then(function(done) {
    if (done) return;
    tryFirebaseSms().then(function(done2) {
      if (!done2) _fail();
    });
  });
};

// Entra no app depois que o server marcou emailVerified=true. Espelha o
// caminho de sucesso de _checkEmailVerified: recarrega o usuário (pra pegar o
// emailVerified novo) e segue pro perfil.
window._gateEnterApp = function() {
  var u = firebase.auth().currentUser;
  var finish = function(u2) {
    var g = document.getElementById('email-verify-gate'); if (g) g.remove();
    if (typeof _resetPhoneRecaptcha === 'function') { try { _resetPhoneRecaptcha(); } catch (e) {} }
    window._pendingVerifyName = null;
    window._postVerifyGoToProfile = true;
    if (window.showNotification) window.showNotification('✅ Conta confirmada!', 'Telefone autenticado. Vamos completar seu perfil.', 'success');
    // v3.0.x: avisa por WhatsApp que daqui pra frente entra com CELULAR + SENHA — é o
    // caminho confiável pra quem tem e-mail (Hotmail/Outlook/UOL) que não recebe a confirmação.
    try {
      var _gatePh = window._gatePhonePending || '';
      if (_gatePh && window.FirestoreDB && typeof window.FirestoreDB.queueWhatsApp === 'function') {
        window.FirestoreDB.queueWhatsApp([_gatePh],
          '✅ Sua conta no scoreplace.app está confirmada!\n\nDe agora em diante, entre com o seu *celular + senha* (a mesma senha que você cadastrou) — não precisa do e-mail.\n\n👉 ' + (window.SCOREPLACE_URL || 'https://scoreplace.app') + '\n\nscoreplace.app · Jogue em outro nível');
      }
    } catch (_we) {}
    Promise.resolve(simulateLoginSuccess({ uid: u2.uid, email: u2.email, displayName: u2.displayName, photoURL: u2.photoURL }))
      .then(function() {
        window.location.hash = '#profile';
        if (typeof initRouter === 'function') initRouter();
      });
  };
  if (!u) { window.location.reload(); return; }
  u.reload().then(function() {
    finish(firebase.auth().currentUser || u);
  }).catch(function() { finish(u); });
};

window._resendVerifyEmail = function() {
  var u = firebase.auth().currentUser;
  if (!u) { showNotification('Sessão expirada', 'Entre novamente para reenviar.', 'warning'); return; }
  _sendRichVerificationEmail(u, window._pendingVerifyName || u.displayName || '')
    .then(function() { showNotification('📨 E-mail reenviado', 'Confira sua caixa de entrada e o spam.', 'success'); })
    .catch(function(e) {
      var tooMany = e && e.code === 'auth/too-many-requests';
      showNotification('Não foi possível reenviar', tooMany ? 'Aguarde alguns minutos antes de reenviar.' : 'Tente novamente em instantes.', 'warning');
    });
};

// v3.0.x: confirmação por CÓDIGO (e-mail texto-puro) — pros provedores que dropam link.
window._gateVerifyCode = function() {
  var inp = document.getElementById('gate-email-code');
  var st = document.getElementById('gate-email-code-status');
  var code = inp ? inp.value.replace(/\D/g, '') : '';
  var setSt = function(msg, color) { if (st) st.innerHTML = '<span style="color:' + (color || '#fbbf24') + ';">' + msg + '</span>'; };
  if (code.length !== 6) { setSt('O código tem 6 dígitos.'); if (inp) inp.focus(); return; }
  if (!firebase.functions) { setSt('Funções indisponíveis. Recarregue a página.', '#ef4444'); return; }
  setSt('⏳ Confirmando…', 'var(--text-muted)');
  firebase.functions().httpsCallable('verifyEmailCode')({ code: code })
    .then(function(r) {
      var d = (r && r.data) || {};
      if (d.ok) { window._gateEnterApp(); return; }
      setSt(d.error || 'Código incorreto. Confira no e-mail.', '#ef4444');
      if (inp) { inp.focus(); if (inp.select) inp.select(); }
    })
    .catch(function(e) {
      setSt((e && e.message) || 'Não foi possível confirmar. Tente de novo.', '#ef4444');
      if (inp) inp.focus();
    });
};

window._gateResendCode = function(btn) {
  if (!firebase.functions) return;
  var u = firebase.auth().currentUser;
  if (!u) { showNotification('Sessão expirada', 'Entre novamente.', 'warning'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  var st = document.getElementById('gate-email-code-status');
  firebase.functions().httpsCallable('sendVerificationCode')({})
    .then(function() {
      if (btn) { btn.textContent = '📨 Reenviar código'; setTimeout(function(){ if (btn) btn.disabled = false; }, 30000); }
      if (st) st.innerHTML = '<span style="color:#34d399;">Novo código enviado pro seu e-mail.</span>';
    })
    .catch(function(e) {
      if (btn) { btn.disabled = false; btn.textContent = '📨 Reenviar código'; }
      if (st) st.innerHTML = '<span style="color:#ef4444;">' + ((e && e.message) || 'Não foi possível reenviar.') + '</span>';
    });
};

window._checkEmailVerified = function() {
  var u = firebase.auth().currentUser;
  if (!u) {
    var g0 = document.getElementById('email-verify-gate'); if (g0) g0.remove();
    showNotification('Sessão expirada', 'Entre novamente.', 'warning');
    return;
  }
  showNotification('Verificando…', 'Conferindo a confirmação do e-mail.', 'info');
  u.reload().then(function() {
    var u2 = firebase.auth().currentUser;
    if (u2 && u2.emailVerified) {
      var g = document.getElementById('email-verify-gate'); if (g) g.remove();
      // Agora verificado: grava o perfil básico (merge/sugestão podem rodar a partir daqui).
      if (window.FirestoreDB && window.FirestoreDB.db && u2.uid) {
        window.FirestoreDB.saveUserProfile(u2.uid, {
          authProvider: 'password',
          displayName: u2.displayName || window._pendingVerifyName || '',
          email: u2.email || '',
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).catch(function() {});
      }
      window._pendingVerifyName = null;
      // Entra no app e vai direto pro perfil sugerindo completar.
      window._postVerifyGoToProfile = true;
      showNotification('✅ E-mail confirmado!', 'Bem-vindo! Vamos completar seu perfil.', 'success');
      Promise.resolve(simulateLoginSuccess({ uid: u2.uid, email: u2.email, displayName: u2.displayName, photoURL: u2.photoURL }))
        .then(function() {
          window.location.hash = '#profile';
          if (typeof initRouter === 'function') initRouter();
        });
    } else {
      showNotification('Ainda não confirmado', 'Não encontramos a confirmação. Abra o link no seu e-mail (e veja o spam) e clique em "Já confirmei".', 'warning');
    }
  }).catch(function(e) {
    showNotification('Erro ao verificar', 'Tente novamente em instantes.', 'error');
    window._warn('[verify] reload error:', e);
  });
};

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

  // v2.5.x: LOGIN PÓS-MERGE. Se esta conta foi mesclada em outra (mergedInto),
  // a credencial (celular/e-mail) ficou nela — o Firebase não move credencial
  // entre uids. Re-loga no SOBREVIVENTE via custom token (resolveMergedLogin só
  // devolve o token pra quem provou ser dono desta conta, i.e. está logado nela).
  try {
    if (newUid && window.FirestoreDB && window.FirestoreDB.db && !window._mergedRedirectInProgress) {
      var _mdoc = await window.FirestoreDB.db.collection('users').doc(newUid).get();
      var _mergedInto = _mdoc.exists && _mdoc.data().mergedInto;
      if (_mergedInto && _mergedInto !== newUid) {
        window._mergedRedirectInProgress = true;
        window._simulateLoginInProgress = false;
        window._simulateLoginInProgressAt = 0;
        window._simulateLoginInProgressUid = '';
        window._log('[scoreplace-auth] conta mesclada — redirecionando login para o sobrevivente');
        try {
          var _resolveFn = firebase.functions().httpsCallable('resolveMergedLogin');
          var _rr = await _resolveFn({});
          if (_rr && _rr.data && _rr.data.merged && _rr.data.customToken) {
            await firebase.auth().signInWithCustomToken(_rr.data.customToken);
            window._mergedRedirectInProgress = false;
            return; // onAuthStateChanged re-dispara com o sobrevivente
          }
        } catch (_re) { window._warn('[merged-login] resolveMergedLogin falhou:', _re); }
        window._mergedRedirectInProgress = false;
      }
    }
  } catch (e) { window._warn('[merged-login] checagem mergedInto falhou:', e); window._mergedRedirectInProgress = false; }

  // v1.9.78: GATE de verificação de e-mail. Conta e-mail/senha NÃO verificada
  // não entra no app — mostra o gate de confirmação (bloqueia tudo; sem merge/
  // sugestão). Google e telefone já entram verificados. Roda em todo caminho de
  // entrada (login, registro, onAuthStateChanged no load).
  try {
    var _fbU = (firebase && firebase.auth && firebase.auth().currentUser) || null;
    if (_fbU && _fbU.uid === newUid && !_fbU.emailVerified) {
      var _pd = _fbU.providerData || [];
      var _passwordOnly = _pd.length > 0 && _pd.every(function(p) { return p && p.providerId === 'password'; });
      if (_passwordOnly) {
        window._simulateLoginInProgress = false;
        window._simulateLoginInProgressAt = 0;
        window._simulateLoginInProgressUid = '';
        if (typeof window._showEmailVerificationGate === 'function') {
          window._showEmailVerificationGate(_fbU.email || (user && user.email) || '');
        }
        return;
      }
    }
  } catch (e) { window._warn('[verify] gate check failed:', e); }

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
  // E-mail sintético de conta de celular NUNCA é identidade visível: trata como
  // "sem e-mail" no currentUser (perfil mostra o campo de adicionar e-mail).
  if (window.AppStore.currentUser && window._isSyntheticEmail(window.AppStore.currentUser.email)) {
    window.AppStore.currentUser.email = '';
  }
  window._log('[scoreplace-auth] currentUser set (' + (sameUser ? 'merged' : 'replaced') + '), running early router refresh');
  // v2.6.x: se a pessoa abriu o link de 1 toque do WhatsApp (?pv=) — ou guardou o
  // token antes de logar — confirma o celular agora que a sessão está pronta.
  try { setTimeout(function () { if (window._handlePhoneOwnershipLink) window._handlePhoneOwnershipLink(); }, 900); } catch (e) {}

  // v2.6.x: se a pessoa veio do erro clássico "tentei entrar com e-mail+senha,
  // mas a conta é Google" e clicou em "Entrar com Google" na sugestão, reforça
  // que ela usa o Google (sem senha aqui) pra lembrar na próxima vez.
  try {
    if (sessionStorage.getItem('sp_googleEduHint')) {
      sessionStorage.removeItem('sp_googleEduHint');
      setTimeout(function () {
        try { if (window.showNotification) window.showNotification('✅ Você entrou com o Google', 'Sua conta usa o Google pra entrar — você não tem senha própria aqui. Da próxima vez, é só tocar em "Entrar com Google".', 'info'); } catch (e) {}
      }, 2400);
    }
  } catch (e) {}

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
          if (window._realEmailOrEmpty(user.email)) mergeData.email = user.email;
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
      if (window._realEmailOrEmpty(user.email)) { basicData.email = user.email; needsSave = true; }
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
    // v3.0.82: NOME ÚNICO ENTRE UIDS no PRIMEIRO login. Se o nome derivado do
    // provedor (Google/Apple) colide com OUTRA conta, adota uma variante
    // automaticamente — dois uids de pessoas diferentes nunca podem ter o mesmo
    // nome. NÃO bloqueia a entrada (política "deixa entrar e edita depois"); a
    // pessoa refina no perfil, onde o gate também garante unicidade. Só vale pra
    // PRIMEIRA atribuição de nome (conta sem displayName ainda) — jamais renomeia
    // um usuário estabelecido em re-login (ex.: backfill de displayName_lower).
    // Email/telefone como nome passam direto (são únicos por natureza).
    var _firstNameAssign = !(existingProfile && existingProfile.displayName);
    if (needsSave && _firstNameAssign && basicData.displayName
        && typeof window.FirestoreDB.resolveUniqueDisplayName === 'function') {
      try {
        var _uniqueDN = await window.FirestoreDB.resolveUniqueDisplayName(basicData.displayName, uid);
        if (_uniqueDN && _uniqueDN !== basicData.displayName) {
          basicData.displayName = _uniqueDN;
          if (window.AppStore.currentUser) window.AppStore.currentUser.displayName = _uniqueDN;
        }
      } catch (e) { window._warn('[firstLogin] resolveUniqueDisplayName falhou (fail-open):', e); }
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
    // v4.5.72: _autoFixStaleNames removido (identidade-por-uid: o render resolve
    // o nome vivo do perfil por uid, não lê nome gravado no inscrito).

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
      // v2.3.38: logoff agora é botão separado (#btn-logoff). Este handler só
      // abre o perfil — sem risco de logoff acidental.
      // Clique na área do perfil (avatar/nome)
      // Se já está na página de perfil, não fazer nada — evita re-render desnecessário
      var currentHash = (window.location.hash || '').replace('#', '').split('/')[0];
      if (currentHash === 'profile') return;
      if (typeof window._closeHamburger === 'function') window._closeHamburger();
      window._openMyProfileModal();
    } catch (err) { window._warn('_onProfileBtnClick error', err); }
  };

  // Populate all form fields in the profile modal from window.AppStore.currentUser.
  // Botão de importar do letzplay + "Última atualização" (data/hora + procedência).
  // Renderizado num slot que _populateProfileModalFields refresca quando o
  // letzplayImport chega (o modal é montado 1x, antes do perfil carregar).
  window._renderProfileLzImportSlot = function () {
    var _cu = window.AppStore && window.AppStore.currentUser;
    var _imp = _cu && _cu.letzplayImport;
    var _hasGames = !!(_imp && Array.isArray(_imp.games) && _imp.games.length);
    var btn = (typeof window._spImportEntry === 'function')
      ? window._spImportEntry({ label: (_hasGames ? 'Atualizar do letzplay' : 'Importar do letzplay') }) : '';
    var updated = '';
    if (_imp && _imp.importedAt) {
      var _d = new Date(_imp.importedAt);
      if (!isNaN(_d.getTime())) {
        var _sh = (typeof window._safeHtml === 'function') ? window._safeHtml : function (x) { return x; };
        var _when = _d.toLocaleDateString('pt-BR') + ' ' + _d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var _via = '';
        if (_imp.importedVia === 'organizer') {
          var _org = _imp.importedByName ? (' por ' + _sh(_imp.importedByName)) : ' por um organizador';
          var _tn = _imp.importedTournamentName ? (' no torneio <b>' + _sh(_imp.importedTournamentName) + '</b>') : '';
          _via = '<br>importado' + _org + _tn;
        }
        updated = '<div style="text-align:center;font-size:0.68rem;color:var(--text-muted,#94a3b8);margin-top:6px;line-height:1.45;">Última atualização: ' + _when + _via + '</div>';
      }
    }
    return btn + updated;
  };

  // Extracted from _openMyProfileModal so we can re-populate after a fresh
  // Firestore fetch lands (guards against PWA-reinstall race where the modal
  // opens before loadUserProfile() merges the saved fields into currentUser).
  window._populateProfileModalFields = function() {
    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu) return;
    // Refresca o botão de import + "Última atualização" com o estado atual do letzplayImport.
    var _lzSlot = document.getElementById('profile-lz-import-slot');
    if (_lzSlot && typeof window._renderProfileLzImportSlot === 'function') _lzSlot.innerHTML = window._renderProfileLzImportSlot();

    // Fallback robusto pra dados que vieram do provedor (Google/Apple/FB).
    try {
      var fbUser = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
      if (fbUser) {
        if (!cu.displayName && fbUser.displayName) { cu.displayName = fbUser.displayName; }
        if (!cu.photoURL && fbUser.photoURL) { cu.photoURL = fbUser.photoURL; }
        if (!cu.email && window._realEmailOrEmpty(fbUser.email)) { cu.email = fbUser.email; }
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
    var _cuRealEmail = window._realEmailOrEmpty(cu.email); // sintético = sem e-mail
    var _fbUverif = (window.firebase && firebase.auth && firebase.auth().currentUser) || null;
    if (emailDisplay && emailText) {
      if (_cuRealEmail) {
        emailText.textContent = _cuRealEmail;
        emailDisplay.style.display = '';
        // ✓ quando o e-mail está verificado (já confirmado).
        var _emCheck = document.getElementById('profile-email-check');
        if (_emCheck) _emCheck.style.display = (_fbUverif && _fbUverif.emailVerified) ? '' : 'none';
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
    _setVal('profile-edit-letzplay', cu.letzplayHandle ? ('@' + cu.letzplayHandle) : '');
    var _lpConsentEl = document.getElementById('profile-letzplay-consent');
    if (_lpConsentEl) _lpConsentEl.checked = (cu.letzplayConsent === true);
    // v1.8: o card "Seu nível (letzplay)" saiu daqui — agora vive nas
    // Estatísticas do jogador (📊 _showPlayerStats). O perfil só guarda @ +
    // consentimento (config), sem renderizar o histórico (não pesa o perfil).
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
    // ✓ quando o celular está verificado = é o phoneNumber do Auth (já confirmado).
    (function() {
      var _fbU = (window.firebase && firebase.auth && firebase.auth().currentUser) || null;
      var _cuDig = ((cu.phone || '').replace(/\D/g, '')).slice(-10);
      var _fbDig = ((_fbU && _fbU.phoneNumber) || '').replace(/\D/g, '');
      var _verified = !!(_cuDig && _fbDig && _fbDig.indexOf(_cuDig) !== -1);
      var _chk = document.getElementById('profile-phone-check');
      var _btn = document.getElementById('profile-phone-verify-btn');
      var _hint = document.getElementById('profile-phone-verify-hint');
      if (_chk) _chk.style.display = _verified ? '' : 'none';
      if (_btn) _btn.style.display = _verified ? 'none' : '';
      if (_hint) _hint.style.display = _verified ? 'none' : 'block';
    })();
    var _hintsEnabled = !(window._hintSystem && window._hintSystem.isDisabled());
    [
      { id: 'profile-accept-friends', val: cu.acceptFriendRequests !== false },
      { id: 'profile-notify-platform', val: cu.notifyPlatform !== false },
      { id: 'profile-notify-email', val: cu.notifyEmail !== false },
      // v1.3.41-beta: default ON se já tem telefone cadastrado e não escolheu OFF explicitamente
      { id: 'profile-notify-whatsapp', val: cu.notifyWhatsApp === true || (cu.notifyWhatsApp !== false && !!(cu.phone && String(cu.phone).replace(/\D/g,'').length >= 8)) },
      { id: 'profile-hints-enabled', val: _hintsEnabled },
      // Vibração: default ON — só 'off' explícito desliga (device-local).
      { id: 'profile-haptics-enabled', val: (function () { try { return localStorage.getItem('scoreplace_haptics') !== 'off'; } catch (e) { return true; } })() },
      // Sons: default OFF — só 'on' explícito liga (device-local).
      { id: 'profile-sound-enabled', val: (function () { try { return localStorage.getItem('scoreplace_sound') === 'on'; } catch (e) { return false; } })() },
      { id: 'profile-presence-auto-checkin', val: !!cu.presenceAutoCheckin },
      // v2.4.3: privacidade — ocultar e-mail/telefone (default OFF).
      { id: 'profile-omit-email', val: cu.omitEmail === true },
      { id: 'profile-omit-phone', val: cu.omitPhone === true }
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
    // v2.1.91: inicializa o slider de tamanho da interface com o valor salvo
    var _uiSliderPct = Math.round((typeof window._getUiScale === 'function' ? window._getUiScale() : 1) * 100);
    var _uiSlider = document.getElementById('profile-ui-scale');
    if (_uiSlider) _uiSlider.value = _uiSliderPct;
    var _uiSliderLbl = document.getElementById('profile-ui-scale-val');
    if (_uiSliderLbl) _uiSliderLbl.textContent = _uiSliderPct + '%';
    var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    if (typeof window._applyProfileThemeUI === 'function') window._applyProfileThemeUI(curTheme);
    // Renderizar emails + celulares vinculados
    if (typeof window._profileRenderLinkedEmails === 'function') window._profileRenderLinkedEmails();
    if (typeof window._profileRenderLinkedPhones === 'function') window._profileRenderLinkedPhones();
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
      // v1.9.55: currentUser pode estar TRANSITORIAMENTE null logo após o
      // login (gap entre simulateLoginSuccess e o merge, ou onAuthStateChanged
      // re-disparando) ou em Safari/iOS (ITP). Antes rebatíamos direto pro
      // dashboard → clicar no nome "não abria o perfil". Se o Firebase confirma
      // sessão ativa, aguardamos o currentUser materializar antes de desistir.
      var _fbU = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      if (_fbU && container) {
        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:50vh;"><div style="text-align:center;color:var(--text-muted);"><div style="font-size:1.6rem;margin-bottom:0.6rem;">⏳</div><div style="font-size:0.88rem;">Carregando seu perfil…</div></div></div>';
        var _waited = 0;
        var _poll = setInterval(function() {
          var cu2 = window.AppStore && window.AppStore.currentUser;
          _waited += 200;
          if (cu2 && cu2.uid) {
            clearInterval(_poll);
            if (window.location.hash === '#profile') window.renderProfilePage(container);
          } else if (_waited >= 6000) {
            clearInterval(_poll);
            window.location.replace('#dashboard');
          }
        }, 200);
        return;
      }
      // Realmente sem sessão — manda pro dashboard (que abre modal-login se preciso).
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
    var saveBtnHtml = '<button type="button" class="btn btn-primary btn-sm hover-lift" id=\"profile-save-btn\" onclick="if(window._spinButton)window._spinButton(this, \'Salvando...\'); if(typeof saveUserProfile===\'function\')saveUserProfile()" style="flex:0 0 auto;width:auto;max-width:120px;background:#10b981;color:#fff;border:1px solid #059669;font-weight:700;padding:7px 14px;border-radius:10px;font-size:0.82rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(16,185,129,0.3);">💾 ' + _t('btn.save') + '</button>';
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
    // v2.4.21: reset do flag de edição ANTES da primeira população. O
    // re-populate disparado quando loadUserProfile (async, lento em mobile)
    // retorna só pode rodar se o usuário NÃO mexeu no form nesse intervalo —
    // senão limpa modalidade/categoria/campos que ele acabou de preencher.
    window._profileDirty = false;
    if (typeof window._attachProfileDirtyTracking === 'function') {
      window._attachProfileDirtyTracking(modalInner);
    }
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
        // Re-populate só se ainda na rota #profile E o usuário não começou a
        // editar (v2.4.21 — senão sobrescreve modalidade/categoria em curso).
        if (window.location.hash === '#profile' && !window._profileDirty) {
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

  // Extrair ?ref= (quem convidou) — do hash OU da query string. O convite do
  // app gera `…/?ref=UID` (query, sem hash); o de torneio `#…?ref=UID` (hash).
  var _inviteRefUid = null;
  try {
    var _hashFull = window.location.hash || '';
    var _refMatch = _hashFull.match(/[?&]ref=([^&]+)/);
    if (!_refMatch && window.location.search) _refMatch = window.location.search.match(/[?&]ref=([^&]+)/);
    if (_refMatch) _inviteRefUid = decodeURIComponent(_refMatch[1]);
    // Também checar sessionStorage (salvo pelo router)
    if (!_inviteRefUid) _inviteRefUid = sessionStorage.getItem('_inviteRefUid');
  } catch(e) {}

  // v3.0.84: a auto-amizade vale pra QUALQUER login com ref (convite do APP ou
  // de torneio), não só quando há pendingEnrollId. Antes ficava presa dentro do
  // bloco `if (pendingEnrollId)` (exclusivo de convite de torneio) → o convite
  // do app, que não tem pendingEnrollId, NUNCA criava amizade.
  if (_inviteRefUid && typeof _autoFriendOnInvite === 'function' && window.AppStore.currentUser) {
    try { _autoFriendOnInvite(_inviteRefUid, window.AppStore.currentUser); } catch(e) {}
    try { sessionStorage.removeItem('_inviteRefUid'); } catch(e) {}
  }

  if (pendingEnrollId) {
    window._pendingEnrollTournamentId = null;
    try { sessionStorage.removeItem('_pendingEnrollTournamentId'); } catch(e) {}

    // v2.3.88: O SISTEMA NUNCA INSCREVE SOZINHO. A inscrição SEMPRE exige que a
    // pessoa clique em "Inscrever-se" na página do torneio — inclusive vindo de
    // convite (atender ao convite = abrir a página e clicar). Qualquer um pode
    // se inscrever num torneio público de acesso livre; basta clicar.
    // BUG reportado: algo auto-inscrevia o usuário num torneio que ele NÃO
    // clicou (a conta de teste era re-inscrita todo dia). Aqui só LEVAMOS o
    // usuário à página do torneio — ele decide se entra.
    // A auto-amizade com quem convidou (ref no link) já foi tratada acima, antes
    // deste bloco — vale pra qualquer login com ref, não só convite de torneio.
    window.location.hash = '#tournaments/' + pendingEnrollId;
    if (typeof initRouter === 'function') initRouter();
    window._simulateLoginInProgress = false;
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

  // v2.7.94: retoma a ação de convite de dupla (deep-link Aceitar/Recusar do
  // email/WhatsApp) após o login. O handler espera o torneio carregar e navega.
  try {
    var _pp = sessionStorage.getItem('sp_pendingPairAction');
    if (_pp) {
      sessionStorage.removeItem('sp_pendingPairAction');
      var _ppo = JSON.parse(_pp);
      if (_ppo && _ppo.tId && _ppo.reqId && typeof window._pairActionFromLink === 'function') {
        setTimeout(function(){ window._pairActionFromLink(_ppo.act, _ppo.tId, _ppo.reqId); }, 1200);
      }
    }
  } catch(e) {}

  // v2.8.52: retoma a ação de convite de CO-ORGANIZAÇÃO (deep-link Aceitar/Recusar)
  // após o login, mesmo padrão do convite de dupla.
  try {
    var _pc = sessionStorage.getItem('sp_pendingCohostAction');
    if (_pc) {
      sessionStorage.removeItem('sp_pendingCohostAction');
      var _pco = JSON.parse(_pc);
      if (_pco && _pco.tId && typeof window._coHostActionFromLink === 'function') {
        setTimeout(function(){ window._coHostActionFromLink(_pco.act, _pco.tId, _pco.inviteType); }, 1200);
      }
    }
  } catch(e) {}

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

// v1.8.70: retorno rápido — quando sessão Firebase expirou mas temos cache do usuário,
// v2.1.94: banner "Bem-vindo de volta" mostra o botão de login correto
// para o provider usado da última vez (Google, senha ou telefone).
// Magic link removido — o app não usa mais esse fluxo para retorno.
window._showQuickReturnBanner = function() {
  try {
    var cached = JSON.parse(localStorage.getItem('scoreplace_authCache') || '{}');
    if (!cached || !cached.uid) return;
    var name = cached.displayName || cached.email || 'você';
    var email = cached.email || '';
    var photo = cached.photoURL || '';
    var provider = cached.authProvider || '';

    // Inserir banner no topo do modal de login
    var modalBody = document.querySelector('#modal-login .modal-body');
    if (!modalBody || document.getElementById('quick-return-banner')) return;

    var safeName = name.length > 30 ? name.slice(0, 28) + '…' : name;
    var initial = name ? name[0].toUpperCase() : '?';
    var avatarHtml = photo
      ? '<img src="' + photo + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#4f46e5);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:1rem;flex-shrink:0;">' + initial + '</div>';

    // Botão correto por provider
    var actionBtn = '';
    if (provider === 'google.com' || !provider) {
      // Google é o provider padrão — fallback também vai pra Google
      actionBtn = '<button id="quick-return-btn" onclick="window._quickReturnLogin()" style="width:100%;padding:10px;border-radius:10px;border:none;background:#fff;color:#1f2937;font-weight:700;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 1px 4px rgba(0,0,0,0.18);">' +
        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>' +
        'Entrar com Google' +
      '</button>';
    } else if (provider === 'password') {
      // Senha — destaca o bloco de e-mail+senha no modal
      actionBtn = '<button id="quick-return-btn" onclick="window._quickReturnLogin()" style="width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;font-weight:700;font-size:0.88rem;cursor:pointer;">🔑 Entrar com e-mail e senha</button>';
    } else if (provider === 'phone') {
      actionBtn = '<button id="quick-return-btn" onclick="window._quickReturnLogin()" style="width:100%;padding:10px;border-radius:10px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;font-size:0.88rem;cursor:pointer;">📱 Entrar com telefone</button>';
    } else {
      // Provider desconhecido → botão Google como fallback
      actionBtn = '<button id="quick-return-btn" onclick="window._quickReturnLogin()" style="width:100%;padding:10px;border-radius:10px;border:none;background:#fff;color:#1f2937;font-weight:700;font-size:0.88rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 1px 4px rgba(0,0,0,0.18);">' +
        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/><path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>' +
        'Entrar com Google' +
      '</button>';
    }

    var banner = document.createElement('div');
    banner.id = 'quick-return-banner';
    banner.style.cssText = 'background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:12px 14px;margin-bottom:16px;';
    banner.innerHTML =
      '<div style="font-size:0.72rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Bem-vindo de volta!</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:0.92rem;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeName + '</div>' +
          (email ? '<div style="font-size:0.72rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + email + '</div>' : '') +
        '</div>' +
      '</div>' +
      actionBtn +
      '<div style="text-align:center;margin-top:8px;">' +
        '<button onclick="document.getElementById(\'quick-return-banner\').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.75rem;text-decoration:underline;">Entrar com outra conta</button>' +
      '</div>';

    modalBody.insertBefore(banner, modalBody.firstChild);
  } catch(e) {}
};

window._quickReturnLogin = function() {
  try {
    var cached = JSON.parse(localStorage.getItem('scoreplace_authCache') || '{}');
    var provider = cached.authProvider || '';

    if (provider === 'password') {
      // Desce o banner e foca no campo de e-mail/senha
      var bannerEl = document.getElementById('quick-return-banner');
      if (bannerEl) bannerEl.remove();
      // Pre-preenche o e-mail se existir
      if (cached.email) {
        var emailInp = document.getElementById('login-email');
        if (emailInp) { emailInp.value = cached.email; emailInp.dispatchEvent(new Event('input')); }
      }
      var pwInp = document.getElementById('login-password');
      if (pwInp) setTimeout(function() { pwInp.focus(); }, 100);
      return;
    }

    if (provider === 'phone') {
      // Desce o banner e mostra o bloco de telefone
      var bannerPhone = document.getElementById('quick-return-banner');
      if (bannerPhone) bannerPhone.remove();
      var phoneBlock = document.getElementById('login-block-phone');
      if (phoneBlock) phoneBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Google (padrão) — aciona o popup de login
    if (typeof window.handleGoogleLogin === 'function') {
      window.handleGoogleLogin();
    }
  } catch(e) {}
};

// v1.9.74: toggle de visibilidade da senha (olhinho). Alterna o input entre
// type=password e type=text e troca o ícone. tabindex=-1 pra não capturar Tab.
window._togglePwd = function(btn, inputId) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
    btn.setAttribute('aria-label', 'Ocultar senha');
    btn.style.opacity = '1';
  } else {
    inp.type = 'password';
    btn.textContent = '👁️';
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.style.opacity = '0.7';
  }
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
          // v1.9.73: link mágico + SMS REMOVIDOS do login. Login agora é só
          // e-mail+senha ou Google. Bloco mantido oculto (display:none) por
          // segurança — sua lógica não é mais acionada por nenhuma UI visível.
          // v2.4.98-beta: cadastro/login SÓ COM CELULAR (sem e-mail) — pra quem
          // usa UOL/Hotmail e não recebe e-mail de forma confiável. Reusa o motor
          // handlePhoneLogin (SMS Firebase + link WhatsApp em paralelo). Este
          // bloco estava oculto desde v1.9.73; voltou visível e agora é phone-only
          // (sem o input de link mágico por e-mail, que tinha o mesmo problema).
          // --- Entrar OU cadastrar: e-mail OU celular + senha (v2.5.x) ---
          // Um único campo aceita e-mail OU celular (peso igual). Celular faz
          // aparecer o DDI 🇧🇷+55 à esquerda. Senha única. Botão Entrar resolve
          // tudo (login / cadastro inline / recuperação) via window._handleEntrar.
          '<div id="login-block-main" style="margin-bottom:4px;background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:16px 14px 14px;">' +
            '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;line-height:1.45;">Entre com seu <b>e-mail</b> ou <b>celular</b>. É o mesmo lugar pra entrar e pra criar conta.</div>' +
            '<form id="form-entrar" novalidate onsubmit="event.preventDefault(); window._handleEntrar && window._handleEntrar();">' +
              '<div style="font-size:0.8rem;color:var(--text-bright);margin-bottom:4px;font-weight:600;">E-mail ou celular</div>' +
              '<div id="login-id-row" style="display:grid;grid-template-columns:1fr;gap:6px;align-items:center;margin-bottom:12px;">' +
                '<select id="login-identifier-country" aria-label="DDI do telefone" class="form-control" style="display:none;width:auto;min-width:0;font-size:0.82rem;padding:11px 6px;" onchange="window._onIdentifierInput && window._onIdentifierInput()">' +
                  (typeof _phoneCountries !== 'undefined' ? _phoneCountries.map(function(c) {
                    return '<option value="' + c.code + '"' + (c.code === '55' ? ' selected' : '') + '>' + c.flag + ' +' + c.code + '</option>';
                  }).join('') : '<option value="55">🇧🇷 +55</option>') +
                '</select>' +
                '<input type="text" id="login-identifier" class="form-control" placeholder="seu@email.com.br ou (11) 9999-8888" autocomplete="username" style="width:100%;min-width:0;box-sizing:border-box;font-size:0.95rem;padding:11px 12px;" oninput="window._onIdentifierInput && window._onIdentifierInput()">' +
              '</div>' +
              '<div id="login-senha-label" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;">Senha <span style="font-style:italic;font-size:0.72rem;">(mín. 6 caracteres)</span></div>' +
              '<div style="position:relative;margin-bottom:6px;">' +
                '<input type="password" id="login-password" class="form-control" placeholder="sua senha" minlength="6" autocomplete="current-password" style="font-size:0.92rem;padding-right:44px;">' +
                '<button type="button" tabindex="-1" aria-label="Mostrar senha" onclick="window._togglePwd(this,\'login-password\')" style="position:absolute;top:50%;right:8px;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;font-size:1.15rem;line-height:1;opacity:0.7;">👁️</button>' +
              '</div>' +
              // Expansão de cadastro inline (aparece quando a conta não existe)
              '<div id="register-expand" style="display:none;">' +
                '<div id="register-expand-hint" style="font-size:0.8rem;color:#a5b4fc;margin:8px 0;line-height:1.45;">✨ Não encontramos essa conta — vamos criar a sua. Confirme abaixo:</div>' +
                // v2.5.x: confirmar senha LOGO ABAIXO da senha (campos seguidos);
                // nome de exibição depois.
                '<div style="font-size:0.8rem;color:var(--text-bright);margin-bottom:4px;font-weight:600;">Confirmar senha</div>' +
                '<div style="position:relative;margin-bottom:12px;">' +
                  '<input type="password" id="reg-password-confirm" class="form-control" placeholder="repita a senha" minlength="6" style="font-size:0.92rem;padding-right:44px;">' +
                  '<button type="button" tabindex="-1" aria-label="Mostrar senha" onclick="window._togglePwd(this,\'reg-password-confirm\')" style="position:absolute;top:50%;right:8px;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;font-size:1.15rem;line-height:1;opacity:0.7;">👁️</button>' +
                '</div>' +
                '<div style="font-size:0.8rem;color:var(--text-bright);margin-bottom:4px;font-weight:600;">Nome de exibição <span style="font-style:italic;font-size:0.72rem;font-weight:400;color:var(--text-muted);">(como vão te ver)</span></div>' +
                '<input type="text" id="reg-displayname" class="form-control" placeholder="Seu nome" style="font-size:0.92rem;margin-bottom:6px;">' +
              '</div>' +
              '<button type="submit" id="btn-entrar" class="btn btn-block" style="font-size:0.98rem;font-weight:800;padding:13px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;margin-top:4px;">Entrar</button>' +
            '</form>' +
            // Redefinir senha sem entrar: digita e-mail/celular acima e recebe o link.
            '<div style="margin-top:10px;">' +
              '<button type="button" class="btn btn-primary btn-block hover-lift" onclick="window._entrarForgotPassword && window._entrarForgotPassword()" style="font-size:0.86rem;font-weight:700;padding:11px;color:#fff;">Esqueci minha senha</button>' +
            '</div>' +
            '<div id="entrar-status" style="margin-top:10px;font-size:0.82rem;line-height:1.5;"></div>' +
          '</div>' +
          // Hidden inputs — o motor handlePhoneLogin lê destes IDs (prova de posse).
          '<input type="hidden" id="login-phone">' +
          '<input type="hidden" id="login-phone-country" value="55">' +

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
            '<div id="phone-step-sms-note" style="text-align:center;margin-top:2px;min-height:1em;"></div>' +
            '<div style="text-align:center;margin-top:4px;">' +
              '<a href="#" onclick="event.preventDefault();_resetPhoneLoginUI();handlePhoneLogin();" style="color:var(--text-muted);font-size:0.72rem;">Reenviar</a>' +
              '<span style="color:var(--text-muted);font-size:0.72rem;margin:0 6px;">|</span>' +
              '<a href="#" onclick="event.preventDefault();_resetPhoneLoginUI();" style="color:var(--text-muted);font-size:0.72rem;">Voltar</a>' +
            '</div>' +
          '</div>' +
          '<div id="recaptcha-container" style="display:none;"></div>' +
          '<div id="login-panel-emaillink" style="display:none;"></div>' +
          '<div id="login-panel-phone" style="display:none;"></div>' +

          // --- Bloco antigo "E-mail e Senha" removido (v2.5.x) ---
          // Unificado no #login-block-main acima (campo único e-mail/celular +
          // senha + cadastro inline). handleEmailLogin/toggleEmailMode/
          // handleEmailRegister continuam DEFINIDOS (compat ?wt=/reset) mas não
          // são mais acionados por nenhuma UI visível.
          '<div id="login-panel-email" style="display:none;"></div>' +

          // --- Divider ---
          '<div style="display:flex;align-items:center;gap:12px;margin:14px 0;">' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
            '<span style="color:var(--text-muted);font-size:1rem;font-weight:700;letter-spacing:1px;">ou</span>' +
            '<div style="flex:1;height:1px;background:var(--border-color);"></div>' +
          '</div>' +

          // --- 4a. Apple (iOS + web; escondido no Android native — Guideline 4.8) ---
          (window._shouldShowAppleBtn && window._shouldShowAppleBtn() ?
          '<div style="margin-bottom:8px;">' +
            '<button type="button" id="login-apple-btn" class="btn hover-lift btn-block" onclick="handleAppleLogin()" style="background:#000;color:#fff;border:1px solid #000;padding:12px 16px;font-size:0.88rem;font-weight:600;">' +
              '<svg width="18" height="18" viewBox="0 0 384 512" fill="#fff" style="vertical-align:middle;margin-right:8px;"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>' +
              ((typeof _t === 'function' && _t('auth.signInApple') !== 'auth.signInApple') ? _t('auth.signInApple') : 'Entrar com a Apple') +
            '</button>' +
          '</div>' : '') +

          // --- 4. Google ---
          '<div style="margin-bottom:4px;">' +
            '<button type="button" id="login-google-btn" class="btn hover-lift btn-block" onclick="handleGoogleLogin()" style="background:#fff;color:#333;border:1px solid #ddd;padding:12px 16px;font-size:0.88rem;font-weight:600;">' +
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
      // v1.8.70: mostrar banner de retorno rápido se há cache do usuário
      setTimeout(function() {
        if (typeof window._showQuickReturnBanner === 'function') window._showQuickReturnBanner();
      }, 80);
      // Restaura último DDI escolhido pra reabrir o modal já com o país certo.
      // Aplica no seletor visível (login-identifier-country) + no hidden
      // (login-phone-country, lido por handlePhoneLogin na prova de posse).
      try {
        var saved = localStorage.getItem('scoreplace_loginPhoneCountry');
        var selVisible = document.getElementById('login-identifier-country');
        var selHidden = document.getElementById('login-phone-country');
        if (saved) {
          if (selVisible) selVisible.value = saved;
          if (selHidden) selHidden.value = saved;
        }
      } catch(_e) {}
      // Reseta o modal pro estado inicial (caso tenha ficado em cadastro/status).
      try { if (typeof window._resetEntrarUI === 'function') window._resetEntrarUI(); } catch(_e) {}
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
  if (typeof window._removeTopbarLogoff === 'function') window._removeTopbarLogoff();

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

// v1.9.82: prompt de senha mascarado pra re-autenticar antes de excluir a conta.
function _promptPasswordForDelete() {
  return new Promise(function(resolve) {
    var ov = document.createElement('div');
    ov.id = 'del-reauth-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100060;background:rgba(0,0,0,0.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:1rem;';
    ov.innerHTML = '<div style="background:var(--surface-color,#1e293b);border:1px solid var(--border-color,rgba(255,255,255,0.12));border-radius:16px;max-width:380px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
      '<div style="font-weight:800;font-size:1rem;color:var(--text-bright,#fff);margin-bottom:6px;">🔒 Confirme sua senha</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;line-height:1.45;">Pra excluir totalmente sua conta de login (e liberar o e-mail pra uso futuro), confirme sua senha.</div>' +
      '<input type="password" id="del-reauth-pwd" placeholder="sua senha" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-dark,#0f172a);color:var(--text-bright,#fff);font-size:0.92rem;margin-bottom:14px;">' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="del-reauth-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;">Cancelar</button>' +
        '<button id="del-reauth-ok" style="flex:1;padding:10px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-weight:700;cursor:pointer;font-size:0.85rem;">Confirmar exclusão</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    var inp = ov.querySelector('#del-reauth-pwd');
    setTimeout(function() { if (inp) inp.focus(); }, 60);
    var done = function(v) { if (ov.parentNode) ov.remove(); resolve(v); };
    ov.querySelector('#del-reauth-cancel').onclick = function() { done(null); };
    ov.querySelector('#del-reauth-ok').onclick = function() { done(inp.value || null); };
    inp.addEventListener('keypress', function(e) { if (e.key === 'Enter') done(inp.value || null); });
  });
}

// v1.9.82: re-autentica o usuário antes de excluir a conta de Auth — sem isso,
// firebaseUser.delete() falha com auth/requires-recent-login quando a sessão é
// antiga, deixando a conta de login órfã (e-mail preso "já em uso"). Google →
// popup; e-mail/senha → prompt de senha. Retorna true se re-autenticou.
async function _reauthForDelete(firebaseUser, email) {
  var providers = (firebaseUser.providerData || []).map(function(p) { return p && p.providerId; });
  if (providers.indexOf('google.com') !== -1) {
    try {
      var gp = new firebase.auth.GoogleAuthProvider();
      try { gp.setCustomParameters({ prompt: 'select_account' }); } catch (e) {}
      await firebaseUser.reauthenticateWithPopup(gp);
      return true;
    } catch (e) { window._warn('[delete] reauth google falhou:', e && e.code); return false; }
  }
  if (providers.indexOf('password') !== -1 && email) {
    var pwd = await _promptPasswordForDelete();
    if (!pwd) return false;
    try {
      var cred = firebase.auth.EmailAuthProvider.credential(email, pwd);
      await firebaseUser.reauthenticateWithCredential(cred);
      return true;
    } catch (e) {
      showNotification('Senha incorreta', 'Não foi possível confirmar. Sua conta de login não foi excluída.', 'warning');
      return false;
    }
  }
  return false;
}

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

    // 2c. Delete tournaments organized by this user.
    // v3.0.69: dono canônico é creatorUid (uid), não organizerEmail. Antes a query
    // só achava por organizerEmail — torneio com creatorUid===uid mas organizerEmail
    // diferente/ausente (e-mail trocado, organizador só-celular com e-mail sintético)
    // ficava órfão de uma conta já excluída. Agora busca por uid (primário) E por
    // e-mail (fallback legado), deduplicando por id.
    try {
      var _delRefs = {};
      if (uid) {
        var byUidSnap = await db.collection('tournaments').where('creatorUid', '==', uid).get();
        byUidSnap.forEach(function(doc) { _delRefs[doc.id] = doc.ref; });
      }
      if (email) {
        var byEmailSnap = await db.collection('tournaments').where('organizerEmail', '==', email).get();
        byEmailSnap.forEach(function(doc) { _delRefs[doc.id] = doc.ref; });
      }
      var _delIds = Object.keys(_delRefs);
      if (_delIds.length > 0) {
        var dBatch = db.batch();
        var dCount = 0;
        _delIds.forEach(function(id) {
          dBatch.delete(_delRefs[id]);
          dCount++;
          if (dCount >= 450) { dBatch.commit(); dBatch = db.batch(); dCount = 0; }
        });
        if (dCount > 0) await dBatch.commit();
      }
    } catch (e) { window._warn('Erro ao excluir torneios:', e); }

    // 2c2. v1.9.90: remove este uid das listas de amizade de quem é amigo dele.
    // Sem isso, ao excluir a conta a referência some do perfil (que é deletado),
    // mas continua nos friends[]/requests dos AMIGOS — aparecendo como "Usuário"
    // fantasma na lista deles. Só toca os docs dos amigos diretos (eficiente).
    try {
      var _myFriends = Array.isArray(user.friends) ? user.friends.slice() : [];
      var _mySent = Array.isArray(user.friendRequestsSent) ? user.friendRequestsSent : [];
      var _myRecv = Array.isArray(user.friendRequestsReceived) ? user.friendRequestsReceived : [];
      var _touchUids = {};
      _myFriends.concat(_mySent, _myRecv).forEach(function(fu) {
        if (fu && typeof fu === 'string' && fu.indexOf('@') === -1) _touchUids[fu] = true;
      });
      var _arrRemove = firebase.firestore.FieldValue.arrayRemove(uid);
      await Promise.all(Object.keys(_touchUids).map(function(fu) {
        return db.collection('users').doc(fu).update({
          friends: _arrRemove,
          friendRequestsSent: _arrRemove,
          friendRequestsReceived: _arrRemove
        }).catch(function() {});
      }));
    } catch (e) { window._warn('Erro ao limpar amizades:', e); }

    // 2d. Delete user profile document
    try {
      await db.collection('users').doc(uid).delete();
    } catch (e) { window._warn('Erro ao excluir perfil:', e); }

    // 3. Delete Firebase Auth account.
    // v1.9.82: se falhar por requires-recent-login, re-autentica e tenta DE
    // NOVO — senão a conta de login fica órfã e o e-mail trava "já em uso",
    // impedindo o usuário de recriar a conta. Bug reportado: "exclui a conta e
    // não consigo recriar com o mesmo e-mail".
    try {
      await firebaseUser.delete();
    } catch (e) {
      if (e && e.code === 'auth/requires-recent-login') {
        var _reauthed = false;
        try { _reauthed = await _reauthForDelete(firebaseUser, email); } catch (re) {}
        if (_reauthed) {
          try {
            await firebaseUser.delete();
          } catch (e2) {
            window._warn('Auth delete após reauth:', e2 && (e2.code || e2.message));
            showNotification('Conta de login mantida', 'Seus dados foram excluídos, mas o e-mail pode continuar reservado. Contate o suporte se precisar reusá-lo.', 'warning');
          }
        } else {
          showNotification('Conta de login mantida', 'Seus dados foram excluídos, mas o e-mail não foi liberado (confirmação cancelada). Pra liberar, exclua de novo e confirme a senha.', 'warning');
        }
      } else {
        window._warn('Auth delete:', e.code || e.message);
      }
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
    // Apagar SÓ o IndexedDB do Firebase AUTH (firebaseLocalStorageDb) — evita
    // auto-restore da sessão Google antiga. NÃO tocar no IndexedDB do Firestore:
    // apagar o banco do Firestore com o cliente vivo faz o SDK TERMINAR o cliente
    // ("FirebaseError: The client has already been terminated"), e um re-login na
    // MESMA sessão de página passa a falhar em TODOS os reads (loadUserProfile
    // inclusive → perfil/gênero não carregam → saudação "(a)" + bolinha presa).
    // Bug reportado + confirmado no Sentry (SCOREPLACE-WEB-6E): excluir conta →
    // re-login pelo "quick return" → cliente terminado. Regex antiga /firebase|
    // firestore|firebaseauth/ casava também com "firestore/..." — o erro.
    try {
      if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
        indexedDB.databases().then(function (dbs) {
          (dbs || []).forEach(function (db) {
            if (db.name && /firebaseLocalStorageDb|firebaseauth/i.test(db.name) && !/firestore/i.test(db.name)) {
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
    if (typeof window._removeTopbarLogoff === 'function') window._removeTopbarLogoff();

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
    if (e.key !== 'Backspace') return;
    // v2.1.30: ler selectionStart pode jogar InvalidStateError em inputs que não
    // suportam selection (email/number) no iOS — guarda e sai sem quebrar.
    var _selS, _selE;
    try { _selS = this.selectionStart; _selE = this.selectionEnd; } catch (err) { return; }
    // Allow backspace to work naturally on formatted input
    if (_selS === _selE) {
      var pos = _selS;
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

// v2.4.21: marca o form de perfil como "editado" no primeiro input/change do
// usuário. Usado pra impedir que o re-populate disparado quando loadUserProfile
// (async) retorna sobrescreva campos que ele já preencheu — bug reportado:
// pessoas preenchendo categoria/modalidade e a informação não salvava porque
// era limpa ~1-2s depois (janela do load) e o Salvar pegava o estado zerado.
// Os botões de modalidade/categoria/árbitro setam o flag direto; este listener
// cobre os campos de form (nome, gênero, cidade, nascimento, CEPs, toggles).
window._attachProfileDirtyTracking = function(rootEl) {
  if (!rootEl || rootEl._dirtyTrackingAttached) return;
  rootEl._dirtyTrackingAttached = true;
  var mark = function() { window._profileDirty = true; };
  rootEl.addEventListener('input', mark, true);
  rootEl.addEventListener('change', mark, true);
};

window._toggleProfileSport = function(sport) {
  window._profileDirty = true; // v2.4.21
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
  window._profileDirty = true; // v2.4.21
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
  window._profileDirty = true; // v2.4.21
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

// ─── Propagate displayName change across all tournaments ─────────────────
window._propagateNameChange = function _propagateNameChange(oldName, newName, targetUid, targetEmail, silent) {
  if (!oldName || !newName || oldName === newName) return;
  if (!window.AppStore || !Array.isArray(window.AppStore.tournaments)) return;
  window._debug('[PropageName] "' + oldName + '" → "' + newName + '" (uid=' + (targetUid || 'none') + ', email=' + (targetEmail || 'none') + ')');

  var user = window.AppStore.currentUser;
  var matchUid = targetUid || (user ? user.uid : null);
  var matchEmail = targetEmail || (user ? user.email : null);
  var modifiedTournaments = [];

  window.AppStore.tournaments.forEach(function(t) {
    var changed = false;
    // v2.8.93: MESMA lógica de propagação aplicada a participantes, lista de espera
    // E standby — renomear tem que propagar pra TODAS as listas que guardam nome.
    function _updatePartArray(parts) {
      if (!Array.isArray(parts)) return;
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
        // v2.8.93: detecta a pessoa por UID em QUALQUER posição — inclusive como
        // p1Uid/p2Uid de uma dupla (antes só p.uid; numa dupla o p.uid é o do capitão,
        // então o p2 que renomeava não era detectado e o p2Name ficava defasado).
        var isUser = (matchUid && (p.uid === matchUid || p.p1Uid === matchUid || p.p2Uid === matchUid)) || (matchEmail && p.email === matchEmail) || p.displayName === oldName || p.name === oldName;
        if (isUser) {
          // v1.8.90: NUNCA sobrescrever nomes de dupla (contêm " / ").
          // O uid do "capitão" da dupla é o mesmo da pessoa, mas o displayName
          // da dupla é "A / B" — propagação de nome individual não deve tocar.
          var _curName = p.displayName || p.name || '';
          // v2.8.93: dupla é detectada pela ESTRUTURA (p1Name && p2Name), NÃO só por
          // " / " no displayName — dupla formada por aceite guarda displayName só do p1,
          // então renomear o p2 não atualizava o p2Name. Linkage por UID, não por nome.
          var _isTeamEntry = !!window._entryTeamMembers(p); // v3.0.x: dupla por estrutura (slots), não por '/'
          if (_isTeamEntry) {
            // Dupla: atualiza p1Name/p2Name pelo UID (fallback por nome no legado sem uids)
            var _teamChanged = false;
            if (p.p1Uid === matchUid && p.p1Name === oldName) { p.p1Name = newName; _teamChanged = true; }
            if (p.p2Uid === matchUid && p.p2Name === oldName) { p.p2Name = newName; _teamChanged = true; }
            if (!_teamChanged) {
              if (p.p1Name === oldName) { p.p1Name = newName; _teamChanged = true; }
              if (p.p2Name === oldName) { p.p2Name = newName; _teamChanged = true; }
            }
            if (_teamChanged) {
              // só reescreve o displayName no formato "A / B" se ele JÁ era assim —
              // não transforma a dupla-do-aceite (displayName = só o p1) em "A / B".
              if (_curName.indexOf(' / ') !== -1) {
                var _newTeamName = [p.p1Name, p.p2Name].filter(Boolean).join(' / ');
                if (_newTeamName) { p.displayName = _newTeamName; p.name = _newTeamName; }
              }
              changed = true;
            }
          } else if (matchUid && p.uid === matchUid) {
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
    }
    _updatePartArray(t.participants);
    _updatePartArray(t.standbyParticipants);
    _updatePartArray(t.waitlist);

    // v2.8.93: convites de dupla PENDENTES — atualiza inviterName/inviteeName por UID
    // (era exatamente isso que ficava defasado ao renomear quem aceitou/convidou).
    if (Array.isArray(t.pairRequests)) {
      t.pairRequests.forEach(function(r) {
        if (!r) return;
        if (((matchUid && r.inviterUid === matchUid) || r.inviterName === oldName) && r.inviterName !== newName) { r.inviterName = newName; changed = true; }
        if (((matchUid && r.inviteeUid === matchUid) || r.inviteeName === oldName) && r.inviteeName !== newName) { r.inviteeName = newName; changed = true; }
      });
    }
    // v2.8.93: teamOrigins — chaves no formato "A / B"; re-chaveia trocando o nome.
    if (t.teamOrigins && typeof t.teamOrigins === 'object') {
      Object.keys(t.teamOrigins).forEach(function(k) {
        if (k.indexOf(oldName) !== -1 && k.indexOf(' / ') !== -1) {
          var nk = k.split(' / ').map(function(n) { return n.trim() === oldName ? newName : n.trim(); }).join(' / ');
          if (nk !== k && t.teamOrigins[nk] === undefined) { t.teamOrigins[nk] = t.teamOrigins[k]; delete t.teamOrigins[k]; changed = true; }
        }
      });
    }

    function _updateMatch(m) {
      if (!m) return;
      // v1.8.93: nunca substituir nome de dupla (com " / ") por nome individual
      if (m.p1 === oldName && !m.p1.includes(' / ')) { m.p1 = newName; changed = true; }
      if (m.p2 === oldName && !m.p2.includes(' / ')) { m.p2 = newName; changed = true; }
      if (m.winner === oldName && !(m.winner||'').includes(' / ')) { m.winner = newName; changed = true; }
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
    // v2.4.40: o toast SÓ aparece quando um save REALMENTE persiste. Bug
    // reportado: torneio onde o usuário é só participante (não organizador) não
    // pode ser salvo pelas regras do Firestore → o save falhava em silêncio, o
    // nome nunca persistia e o fix re-disparava + re-toastava A CADA abertura do
    // app ("o nome da Cocozza foi atualizado", toda vez). Agora conta sucessos
    // reais; se nenhum save passou (sem permissão), nada de toast nem refresh.
    var savePromises = modifiedTournaments.map(function(t) {
      t.updatedAt = new Date().toISOString();
      return window.FirestoreDB.saveTournament(t).then(function() { return true; }).catch(function(err) { window._warn('[PropageName] Save error for ' + t.id + ':', err); return false; });
    });
    Promise.all(savePromises).then(function(results) {
      var _okCount = results.filter(Boolean).length;
      window._debug('[PropageName] saves complete — persistidos:', _okCount, 'de', results.length);
      if (_okCount > 0) {
        if (typeof window._softRefreshView === 'function') window._softRefreshView();
        // v2.4.42: toast SÓ quando a mudança partiu do PRÓPRIO usuário (renomeou
        // no perfil). A sincronização automática de nomes de OUTROS inscritos
        // (rodada em background a cada abertura do app) é silenciosa — senão o
        // aviso "o nome da Cocozza foi atualizado" reaparecia toda vez.
        if (!silent && typeof showNotification !== 'undefined') {
          showNotification(_t('auth.nameUpdated'), _t('auth.nameUpdatedMsg', {old: oldName, new: newName, n: _okCount}), 'info');
        }
      }
    });
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
                '<span id="profile-email-check" title="E-mail verificado" style="display:none;color:#34d399;font-weight:800;flex-shrink:0;">✓</span>' +
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
            // v2.5.x: e-mail exige verificação de posse (link de confirmação).
            '<div style="margin-top:6px;">' +
              '<button type="button" onclick="window._profileVerifyEmail && window._profileVerifyEmail()" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">✉️ Verificar e vincular</button>' +
              '<span style="font-size:0.66rem;color:var(--text-muted);opacity:0.8;display:block;margin-top:4px;">Enviamos um link de confirmação pro novo e-mail. Ele vira seu login quando você clicar.</span>' +
              '<div id="profile-email-otp" style="display:none;margin-top:8px;font-size:0.78rem;"></div>' +
            '</div>' +
          '</div>' +
          // ── Emails vinculados ──
          '<div style="margin:0 0 6px 0;">' +
            '<label class="form-label" style="font-size:0.75rem;">🔗 E-mails vinculados</label>' +
            '<div id="profile-linked-emails" style="margin-bottom:6px;display:flex;flex-direction:column;gap:4px;"></div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<input type="email" id="profile-link-email-input" class="form-control" placeholder="outro@email.com" autocomplete="off" style="flex:1;min-width:0;box-sizing:border-box;font-size:0.85rem;">' +
              '<button type="button" onclick="window._profileSendEmailLink()" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.4);color:#a5b4fc;padding:6px 10px;border-radius:8px;font-size:0.78rem;cursor:pointer;white-space:nowrap;line-height:1.4;">Verificar</button>' +
            '</div>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);opacity:0.7;margin-top:4px;display:block;">Você receberá um link de verificação nesse e-mail. Clicando, ele será vinculado à sua conta.</span>' +
          '</div>' +
          // v2.4.3: privacidade — ocultar e-mail(s) de outros usuários (default OFF).
          '<div class="omit-toggle" style="margin:0 0 6px 0;">' +
            (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-omit-email', label: 'Ocultar seu(s) e-mail(s) <button type="button" onclick="window._toggleFieldHint(event,\'hint-omit-email\')" title="Quando ligado, ninguém (nem amigos) vê seu e-mail dentro do app. Você e o sistema continuam usando normalmente." aria-label="Saiba mais" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;padding:0 2px;line-height:1;vertical-align:middle;">ⓘ</button>', icon: '🔒', checked: false, color: '#f59e0b' }) : '') +
            '<span id="hint-omit-email" style="font-size:0.66rem;color:var(--text-muted);opacity:0.85;display:none;margin-top:4px;">Quando ligado, ninguém (nem amigos) vê seu e-mail dentro do app. Você e o sistema continuam usando normalmente.</span>' +
          '</div>' +
          '<form id="form-edit-profile" onsubmit="event.preventDefault(); saveUserProfile()" style="overflow: hidden;">' +
            // Telefone: País + Número
            '<div class="form-group" style="margin-bottom: 6px;">' +
              '<label class="form-label" style="font-size: 0.75rem;">' + _t('profile.labelWhatsApp') + '</label>' +
              '<div style="display: flex; gap: 6px; align-items: center;">' +
                '<select id="profile-phone-country" aria-label="DDI do telefone" class="form-control" style="width: 124px; flex-shrink: 0; box-sizing: border-box; font-size: 0.85rem; padding: 0.75rem 0.45rem;" onchange="var inp=document.getElementById(\'profile-edit-phone\'); var d=inp.getAttribute(\'data-digits\')||\'\'; inp.value=_formatPhoneDisplay(d,this.value);">' +
                  countryOpts +
                '</select>' +
                '<input type="tel" id="profile-edit-phone" class="form-control" style="flex: 1; min-width: 0; box-sizing: border-box;" placeholder="(11) 9999-8888" data-digits="">' +
                '<span id="profile-phone-check" title="Celular verificado" style="display:none;color:#34d399;font-weight:800;flex-shrink:0;font-size:1.1rem;">✓</span>' +
              '</div>' +
              // v2.5.x: verificação de posse do celular. Adicionar/trocar exige
              // confirmar por SMS/WhatsApp; se o número já for de outra conta, une
              // as duas (com confirmação). Sem isso, o número não vira válido.
              '<div style="margin-top:6px;">' +
                '<button type="button" id="profile-phone-verify-btn" onclick="window._profileVerifyPhone && window._profileVerifyPhone()" style="background:#25d366;color:#0a1f12;border:none;padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">📱 Verificar e vincular</button>' +
                '<span id="profile-phone-verify-hint" style="font-size:0.66rem;color:var(--text-muted);opacity:0.8;display:block;margin-top:4px;">Confirme por SMS/WhatsApp. Se o número já for de outra conta, as duas serão unidas (com sua confirmação).</span>' +
                '<div id="profile-phone-otp" style="display:none;margin-top:8px;"></div>' +
                '<div id="profile-phone-recaptcha" style="display:none;"></div>' +
              '</div>' +
            '</div>' +
            // ── Celulares vinculados (linkedPhones[]) — espelha "E-mails vinculados".
            // Verifica posse por SMS/WhatsApp e grava em linkedPhones[]; o login por
            // qualquer um deles + senha cai nesta conta (server _uidByProfilePhone).
            '<div style="margin:0 0 6px 0;">' +
              '<label class="form-label" style="font-size:0.75rem;">📱 Celulares vinculados</label>' +
              '<div id="profile-linked-phones" style="margin-bottom:6px;display:flex;flex-direction:column;gap:4px;"></div>' +
              // v3.1.66: IDÊNTICO à linha do WhatsApp acima (mesma largura de DDI, mesma
              // fonte, mesma altura) — antes o DDI era 110px/0.82rem e cortava "+55" pra
              // "+5", e o input era menor que o de cima.
              '<div style="display:flex;gap:6px;align-items:center;">' +
                '<select id="profile-link-phone-country" aria-label="DDI do celular vinculado" class="form-control" style="width:124px;flex-shrink:0;box-sizing:border-box;font-size:0.85rem;padding:0.75rem 0.45rem;">' +
                  countryOpts +
                '</select>' +
                '<input type="tel" id="profile-link-phone-input" class="form-control" placeholder="(11) 99999-8888" data-digits="" style="flex:1;min-width:0;box-sizing:border-box;" oninput="this.setAttribute(\'data-digits\', this.value.replace(/\\D/g,\'\'));">' +
              '</div>' +
              '<div style="margin-top:6px;">' +
                '<button type="button" onclick="window._profileVerifyPhone && window._profileVerifyPhone({linked:true})" style="background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.4);color:#6ee7b7;padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;white-space:nowrap;">📲 Verificar e vincular</button>' +
                '<span style="font-size:0.65rem;color:var(--text-muted);opacity:0.7;display:block;margin-top:4px;">Confirme por SMS/WhatsApp. O número vira mais um login da sua conta (com a sua senha).</span>' +
                '<div id="profile-link-phone-otp" style="display:none;margin-top:8px;"></div>' +
                '<div id="profile-link-phone-recaptcha" style="display:none;"></div>' +
              '</div>' +
            '</div>' +
            // v2.4.3: privacidade — ocultar telefone de outros usuários (default OFF).
            // Liga: também tira a pessoa do GRUPO automático de WhatsApp (grupo
            // revela o número aos membros). Ela segue avisada por notificação 1:1
            // do app + plataforma/e-mail — número fica privado.
            '<div class="omit-toggle" style="margin:0 0 6px 0;">' +
              (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-omit-phone', label: 'Ocultar seu telefone <button type="button" onclick="window._toggleFieldHint(event,\'hint-omit-phone\')" title="Quando ligado, ninguém vê seu telefone no app e você fica fora dos grupos automáticos de WhatsApp. Você continua sendo avisado por notificação no app, e-mail e WhatsApp individual." aria-label="Saiba mais" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;padding:0 2px;line-height:1;vertical-align:middle;">ⓘ</button>', icon: '🔒', checked: false, color: '#f59e0b' }) : '') +
              '<span id="hint-omit-phone" style="font-size:0.66rem;color:var(--text-muted);opacity:0.85;display:none;margin-top:4px;">Quando ligado, ninguém vê seu telefone no app <b>e você fica fora dos grupos automáticos de WhatsApp</b> (assim seu número não aparece pra ninguém). Você continua sendo avisado por notificação no app, e-mail e WhatsApp individual.</span>' +
            '</div>' +
            // ── Senha (v2.6.x): link que expande os campos pra definir/trocar ──
            '<div style="margin:8px 0 12px;">' +
              '<button type="button" id="profile-change-pw-link" class="btn btn-ghost btn-micro" onclick="window._toggleChangePassword && window._toggleChangePassword()" style="text-decoration:underline;">🔒 Trocar senha</button>' +
              '<div id="profile-change-pw-box" style="display:none;margin-top:10px;padding:12px 14px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:12px;">' +
                '<label class="form-label" style="font-size:0.74rem;display:block;margin-bottom:4px;">Nova senha</label>' +
                '<input type="password" id="profile-new-password" autocomplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" minlength="6" class="form-control" style="width:100%;box-sizing:border-box;margin-bottom:10px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window._profileSetPassword&&window._profileSetPassword();}">' +
                '<label class="form-label" style="font-size:0.74rem;display:block;margin-bottom:4px;">Confirme a nova senha</label>' +
                '<input type="password" id="profile-new-password2" autocomplete="new-password" placeholder="Repita a nova senha" minlength="6" class="form-control" style="width:100%;box-sizing:border-box;margin-bottom:10px;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();window._profileSetPassword&&window._profileSetPassword();}">' +
                '<div style="display:flex;gap:8px;">' +
                  '<button type="button" onclick="window._toggleChangePassword && window._toggleChangePassword(false)" class="btn btn-outline btn-sm" style="flex:1;">Cancelar</button>' +
                  '<button type="button" onclick="window._profileSetPassword && window._profileSetPassword()" class="btn btn-primary btn-sm" style="flex:1;">Confirmar</button>' +
                '</div>' +
                '<div id="profile-password-status" style="margin-top:8px;font-size:0.74rem;min-height:14px;"></div>' +
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
            // Conta letzplay: handle + consentimento (pré-requisito do import do
            // histórico). Campo aditivo/opcional; a LEITURA dos dados (extensão do
            // organizador) é fase à parte — aqui só coletamos handle + autorização.
            '<div class="form-group" style="margin-bottom: 10px;">' +
              '<label class="form-label" style="font-size: 0.75rem;">🎾 Conta letzplay <span style="opacity:0.55;font-weight:400;">(opcional)</span></label>' +
              '<input type="text" id="profile-edit-letzplay" class="form-control" style="width: 100%; box-sizing: border-box;" placeholder="@seu_usuario no letzplay" autocomplete="off">' +
              '<div style="margin-top:8px;">' +
                (window._toggleSwitch ? window._toggleSwitch({
                  id: 'profile-letzplay-consent',
                  label: 'Autorizar importação do histórico',
                  desc: 'Autorizo os organizadores dos meus torneios a importar meu histórico público do letzplay.',
                  checked: false
                }) : '') +
              '</div>' +
              // v1.24: botão de importar do letzplay + "Última atualização" num SLOT dinâmico.
              // O modal é montado 1x; sem slot, o botão/data ficam congelados no estado de
              // quando o modal foi criado (antes do letzplayImport carregar). _populateProfileModalFields
              // refresca este slot via window._renderProfileLzImportSlot() quando o perfil chega.
              '<div id="profile-lz-import-slot" style="margin-top:10px;">' +
                (typeof window._renderProfileLzImportSlot === 'function' ? window._renderProfileLzImportSlot() : '') +
              '</div>' +
              '<div onclick="(window._showPlayerStats&&window.AppStore&&window.AppStore.currentUser)&&window._showPlayerStats(window.AppStore.currentUser.displayName)" style="margin-top:8px;font-size:0.72rem;color:var(--text-muted,#94a3b8);line-height:1.4;cursor:pointer;">' +
                '💡 Você também importa pelas suas <b style="color:var(--text-bright,#fff);">📊 Estatísticas</b> na tela inicial.' +
              '</div>' +
            '</div>' +
            // v1.8: o card "Seu nível (letzplay)" saiu do perfil e passou pras
            // Estatísticas do jogador (📊). Aqui só ficam @ + consentimento (config).
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
            // v2.1.91: Tamanho da interface (escala global, proporcional + ajustável)
            '<div style="height: 1px; background: var(--border-color); margin: 1rem 0;"></div>' +
            '<div class="form-group" style="margin-bottom: 1rem;">' +
              '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">🔎 Tamanho da interface</label>' +
              '<p style="font-size: 0.7rem; color: var(--text-muted); margin: 0 0 8px 0;">Ajusta textos e botões em todo o app. Ele já se adapta ao seu aparelho — aqui você afina do seu jeito. (O zoom do placar ao vivo continua separado.)</p>' +
              '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:0.7rem;color:var(--text-muted);line-height:1;">A</span>' +
                '<input type="range" id="profile-ui-scale" min="80" max="130" step="5" value="100" aria-label="Tamanho da interface" style="flex:1;min-width:0;accent-color:var(--primary-color);height:28px;" ' +
                  'oninput="window._applyUiScale&&window._applyUiScale(this.value/100); var l=document.getElementById(\'profile-ui-scale-val\'); if(l)l.textContent=this.value+\'%\';" ' +
                  'onchange="window._setUiScale&&window._setUiScale(this.value/100);">' +
                '<span style="font-size:1.1rem;color:var(--text-muted);line-height:1;">A</span>' +
                '<span id="profile-ui-scale-val" style="font-size:0.78rem;font-weight:800;color:var(--primary-color);min-width:44px;text-align:right;">100%</span>' +
              '</div>' +
              '<button type="button" onclick="var d=document.getElementById(\'profile-ui-scale\'); if(d)d.value=100; var l=document.getElementById(\'profile-ui-scale-val\'); if(l)l.textContent=\'100%\'; window._setUiScale&&window._setUiScale(1);" style="margin-top:8px;background:transparent;border:1px solid var(--border-color);color:var(--text-muted);font-size:0.72rem;padding:5px 12px;border-radius:8px;cursor:pointer;">↺ Restaurar padrão (100%)</button>' +
            '</div>' +
            // v2.3.24: Locais de preferência ANTES de Presença no local (jornada
            // de descoberta: cadastrar onde joga vem antes de configurar presença).
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
                '<div style="flex:1 1 100%;">' +
                  (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-presence-mute-toggle', label: 'Silenciar presença temporariamente', icon: '🔕', checked: false, color: '#f59e0b', onchange: 'window._onPresenceMuteToggle(this.checked)' }) : '') +
                '</div>' +
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
                // v2.6.27: só 2 temas — Noturno e Claro.
                '<button type="button" data-theme-val="dark" onclick="window._setProfileTheme(\'dark\')" class="btn btn-sm" style="flex:1;font-size:0.78rem;padding:9px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">🌙 ' + _t('profile.themeNight') + '</button>' +
                '<button type="button" data-theme-val="light" onclick="window._setProfileTheme(\'light\')" class="btn btn-sm" style="flex:1;font-size:0.78rem;padding:9px 4px;border-radius:10px;transition:all 0.2s;white-space:nowrap;background:transparent;color:var(--text-muted);border:1.5px solid var(--border-color);font-weight:500;">☀️ ' + _t('profile.themeLight') + '</button>' +
              '</div>' +
            '</div>' +
            // Vibração (haptic) — ligado por padrão. Fonte de verdade é o
            // localStorage 'scoreplace_haptics' (lido por window._hapticsMuted).
            // No app nativo (iOS/Android) usa o Taptic real; no web Android usa
            // a Vibration API. onchange dá efeito imediato + preview ao ligar.
            '<div style="margin-bottom: 1rem;">' +
              (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-haptics-enabled', label: _t('profile.haptics'), icon: '📳', checked: true, color: '#6366f1', desc: _t('profile.hapticsDesc'), onchange: 'if(window._setHapticsEnabled)window._setHapticsEnabled(this.checked)' }) : '') +
            '</div>' +
            // Sons de UI — DESLIGADO por padrão. Fonte de verdade é o localStorage
            // 'scoreplace_sound' (lido por window._soundMuted). onchange dá efeito
            // imediato + preview (toca o "Sino") ao ligar.
            '<div style="margin-bottom: 1rem;">' +
              (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-sound-enabled', label: _t('profile.sound'), icon: '🔊', checked: false, color: '#10b981', desc: _t('profile.soundDesc'), onchange: 'if(window._setSoundEnabled)window._setSoundEnabled(this.checked)' }) : '') +
            '</div>' +
            // Visual Hints toggle — v1.9.96: oculto enquanto as dicas estão
            // desativadas globalmente (window._HINTS_ENABLED !== true). Sem isso
            // o toggle ficaria inerte (ligar não mostraria dica nenhuma).
            (window._HINTS_ENABLED === true
              ? ('<div style="margin-bottom: 1rem;">' +
                  (window._toggleSwitch ? window._toggleSwitch({ id: 'profile-hints-enabled', label: _t('profile.visualHints'), icon: '💡', checked: true, color: '#fbbf24', desc: _t('profile.hintsDesc') }) : '') +
                '</div>')
              : '') +
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

    // ⓘ tooltip de campo: mostra/esconde o texto explicativo ao clicar/tocar.
    // Funciona em desktop (clique) e mobile (toque); o title= dá hover no desktop.
    window._toggleFieldHint = function(ev, id) {
      if (ev) { ev.stopPropagation(); ev.preventDefault(); }
      var el = document.getElementById(id);
      if (!el) return;
      var open = (el.style.display && el.style.display !== 'none');
      el.style.display = open ? 'none' : 'block';
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
          // v4.0.42: sem includedRegionCodes — busca de local não é restrita ao BR.
          input: query,
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

    // ── v2.5.x: Verificar e vincular E-MAIL no perfil ─────────────────────────
    // E-mail novo → verifyBeforeUpdateEmail (nativo, pt-BR): só vira login depois
    // que a pessoa clica no link enviado pro novo e-mail (fica pendente até lá; o
    // e-mail atual continua valendo). Se o e-mail já é de outra conta, orienta a
    // unir pelo celular (a união por e-mail entra num próximo incremento).
    window._profileVerifyEmail = function() {
      var cu = window.AppStore && window.AppStore.currentUser;
      var fu = (firebase && firebase.auth) ? firebase.auth().currentUser : null;
      if (!cu || !fu) { showNotification('Sessão', 'Entre novamente.', 'warning'); return; }
      var inp = document.getElementById('profile-edit-email');
      var email = inp ? String(inp.value || '').trim().toLowerCase() : '';
      var statusEl = document.getElementById('profile-email-otp');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showNotification('E-mail inválido', 'Digite um e-mail válido.', 'warning'); if (inp) inp.focus(); return; }
      if (cu.email && email === String(cu.email).toLowerCase()) { showNotification('E-mail', 'Esse já é o seu e-mail.', 'info'); return; }
      if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<span style="color:var(--text-muted);">Verificando…</span>'; }
      fetch('https://us-central1-scoreplace-app.cloudfunctions.net/checkAccount', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { identifier: email } })
      }).then(function(r) { return r.json(); }).then(function(j) {
        var info = j && j.result;
        if (info && info.exists) {
          // v3.0.59: e-mail é de OUTRA conta sua → une as duas SOZINHO. Manda um link
          // de confirmação pro e-mail (prova de posse); ao clicar, funde mantendo a
          // conta mais antiga. Sem "entre na outra conta" — o cara nem lembra dela.
          if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Enviando link de confirmação…</span>';
          return firebase.functions().httpsCallable('requestEmailMerge')({ email: email }).then(function(r) {
            var rd = (r && r.data) || {};
            if (rd.ok && rd.sent) {
              if (statusEl) statusEl.innerHTML = '<span style="color:#6ee7b7;">✅ Enviamos um link para <b>' + window._safeHtml(email) + '</b>. Abra e toque em <b>Unir minhas contas</b> — suas duas contas viram uma só (mantendo a mais antiga). Você <b>não</b> precisa entrar na outra conta; depois é só entrar com e-mail OU celular.</span>';
            } else if (rd.reason === 'same-account') {
              if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-muted);">Esse e-mail já é desta conta.</span>';
            } else if (rd.reason === 'no-account') {
              // Não existe conta com esse e-mail → só vincula como login novo.
              return fu.verifyBeforeUpdateEmail(email).then(function() {
                if (statusEl) statusEl.innerHTML = '<span style="color:#6ee7b7;">✅ Enviamos um link de confirmação para <b>' + window._safeHtml(email) + '</b>. Abra e confirme — ele vira seu login.</span>';
              });
            } else {
              if (statusEl) statusEl.innerHTML = '<span style="color:#fca5a5;">Não foi possível enviar o link agora. Tente de novo.</span>';
            }
          });
        }
        return fu.verifyBeforeUpdateEmail(email).then(function() {
          if (statusEl) statusEl.innerHTML = '<span style="color:#6ee7b7;">✅ Enviamos um link de confirmação para <b>' + window._safeHtml(email) + '</b>. Abra e confirme — ele vira seu login. Até lá, seu e-mail atual continua valendo.</span>';
        });
      }).catch(function(err) {
        var code = err && err.code;
        if (code === 'auth/requires-recent-login') {
          if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Por segurança, saia e entre de novo antes de trocar o e-mail.</span>';
        } else if (code === 'auth/email-already-in-use') {
          if (statusEl) statusEl.innerHTML = '<span style="color:#fbbf24;">Esse e-mail já pertence a outra conta. Pra unir, use o celular na conta que quer manter.</span>';
        } else {
          if (statusEl) statusEl.innerHTML = '<span style="color:#fca5a5;">Não foi possível: ' + window._safeHtml(String((err && (err.message || err.code)) || 'erro')) + '</span>';
        }
      });
    };

    // Abre/fecha o bloco de trocar senha (link → 2 campos + Confirmar/Cancelar).
    window._toggleChangePassword = function(show) {
      var box = document.getElementById('profile-change-pw-box');
      var link = document.getElementById('profile-change-pw-link');
      if (!box) return;
      var willShow = (show === undefined) ? (box.style.display === 'none') : !!show;
      box.style.display = willShow ? 'block' : 'none';
      if (link) link.style.display = willShow ? 'none' : '';
      var a = document.getElementById('profile-new-password');
      var b = document.getElementById('profile-new-password2');
      var st = document.getElementById('profile-password-status');
      if (!willShow) {
        if (a) a.value = ''; if (b) b.value = ''; if (st) st.textContent = '';
      } else if (a) {
        setTimeout(function() { try { a.focus(); } catch (e) {} }, 50);
      }
    };

    // ── v2.6.x: Definir/trocar a própria senha (usuário logado) ───────────────
    // updatePassword no usuário autenticado. Funciona pra quem tem e-mail real OU
    // e-mail sintético de celular (a senha fica atrelada ao e-mail de login do
    // Auth, seja qual for) — daí o login por celular (phonePasswordLogin) valida.
    window._profileSetPassword = function() {
      var p1 = (document.getElementById('profile-new-password') || {}).value || '';
      var p2 = (document.getElementById('profile-new-password2') || {}).value || '';
      var st = document.getElementById('profile-password-status');
      function show(msg, color) { if (st) { st.style.color = color; st.textContent = msg; } }
      if (p1.length < 6) { show('A senha precisa de pelo menos 6 caracteres.', '#fca5a5'); return; }
      if (p1 !== p2) { show('As senhas não são iguais.', '#fca5a5'); return; }
      var u = firebase.auth().currentUser;
      if (!u) { show('Sessão expirada. Entre de novo e tente outra vez.', '#fca5a5'); return; }
      show('Salvando…', 'var(--text-muted)');
      u.updatePassword(p1).then(function() {
        show('✅ Senha atualizada.', '#6ee7b7');
        var a = document.getElementById('profile-new-password'); if (a) a.value = '';
        var b = document.getElementById('profile-new-password2'); if (b) b.value = '';
        try { if (window.FirestoreDB && u.uid) window.FirestoreDB.saveUserProfile(u.uid, { hasPassword: true, updatedAt: new Date().toISOString() }).catch(function(){}); } catch (e) {}
      }).catch(function(err) {
        var code = err && err.code;
        var msg = 'Não foi possível salvar a senha.';
        if (code === 'auth/requires-recent-login') msg = 'Por segurança, saia e entre de novo, depois troque a senha.';
        else if (code === 'auth/weak-password') msg = 'Senha muito fraca — use 6+ caracteres.';
        else if (err && err.message) msg = err.message;
        show(msg, '#fca5a5');
        window._warn && window._warn('[profileSetPassword]', code || (err && err.message));
      });
    };

    // ── v2.5.x: Verificar e vincular CELULAR no perfil ────────────────────────
    // Prova posse por SMS/WhatsApp numa instância SECUNDÁRIA do Firebase (não
    // troca a sessão atual). Se o número já é de outra conta, o idToken dessa
    // conta vira a PROVA pra mesclar ela na conta atual (sobrevivente). Número
    // novo: o merge traz o telefone e o login por ele cai aqui (redirect).
    window._profileVerifyPhone = function(opts) {
      opts = opts || {};
      var linked = !!opts.linked;
      // Contexto do fluxo (primário OU celular vinculado secundário). _profileConfirmPhoneCode
      // e o merge leem isto pra usar os IDs certos e saber se grava em linkedPhones[].
      var ctx = window._profilePhoneCtx = {
        linked: linked,
        inputId: linked ? 'profile-link-phone-input' : 'profile-edit-phone',
        countryId: linked ? 'profile-link-phone-country' : 'profile-phone-country',
        otpId: linked ? 'profile-link-phone-otp' : 'profile-phone-otp',
        recaptchaId: linked ? 'profile-link-phone-recaptcha' : 'profile-phone-recaptcha',
        codeId: linked ? 'profile-link-phone-code' : 'profile-phone-code'
      };
      var cu = window.AppStore && window.AppStore.currentUser;
      if (!cu || !cu.uid) { showNotification('Sessão', 'Entre novamente.', 'warning'); return; }
      var inp = document.getElementById(ctx.inputId);
      var country = (document.getElementById(ctx.countryId) || {}).value || '55';
      var digits = inp ? String(inp.getAttribute('data-digits') || inp.value || '').replace(/\D/g, '') : '';
      if (digits.length < 10) { showNotification('Número incompleto', 'Digite DDD + número do celular.', 'warning'); if (inp) inp.focus(); return; }
      var e164 = (typeof window._normalizePhoneE164 === 'function') ? window._normalizePhoneE164(digits, country) : ('+' + country + digits);
      if (linked) {
        if (cu.phone && cu.phone === e164) { showNotification('Mesmo celular', 'Esse já é o seu celular principal.', 'warning'); return; }
        var _lp = Array.isArray(cu.linkedPhones) ? cu.linkedPhones : [];
        if (_lp.indexOf(e164) !== -1) { showNotification('Já vinculado', 'Esse celular já está na sua lista.', 'info'); return; }
      }
      window._profilePhoneCtx.e164 = e164;
      var otpEl = document.getElementById(ctx.otpId);
      var recEl = document.getElementById(ctx.recaptchaId);
      if (otpEl) { otpEl.style.display = 'block'; otpEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">Enviando código para ' + window._safeHtml(e164) + '…</div>'; }
      var cfg = firebase.app().options;
      var sapp = firebase.apps.find(function(a){ return a.name === 'profilephone'; }) || firebase.initializeApp(cfg, 'profilephone');
      try { sapp.auth().setPersistence(firebase.auth.Auth.Persistence.NONE); } catch(e){}
      window._profilePhoneSurvivor = cu.uid;
      try { if (window._profilePhoneRecaptcha) window._profilePhoneRecaptcha.clear(); } catch(e){}
      window._profilePhoneRecaptcha = new firebase.auth.RecaptchaVerifier(recEl, { size: 'invisible' }, sapp);
      window._profilePhoneE164 = e164;
      window._profilePhoneRecaptcha.render().then(function() {
        return sapp.auth().signInWithPhoneNumber(e164, window._profilePhoneRecaptcha);
      }).then(function(confirmation) {
        window._profilePhoneConfirmation = confirmation;
        // v2.5.x: dispara TAMBÉM o código por WhatsApp, em paralelo (regra: celular
        // sempre SMS + WhatsApp). Best-effort — não bloqueia o SMS.
        try {
          firebase.auth().currentUser.getIdToken().then(function(mainTok) {
            return fetch('https://us-central1-scoreplace-app.cloudfunctions.net/sendPhoneOwnershipWhatsApp', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mainTok },
              body: JSON.stringify({ data: { phone: e164 } })
            });
          }).catch(function(){});
        } catch (e) {}
        if (otpEl) otpEl.innerHTML =
          '<div style="font-size:0.78rem;color:var(--text-bright);margin-bottom:6px;">📲 Digite o código que chegou por <b>SMS</b> ou <b>WhatsApp</b>:</div>' +
          '<div style="display:flex;gap:8px;">' +
            '<input id="' + ctx.codeId + '" class="form-control" inputmode="numeric" maxlength="6" placeholder="123456" style="flex:1;min-width:0;letter-spacing:4px;text-align:center;">' +
            '<button type="button" onclick="window._profileConfirmPhoneCode()" class="btn btn-success" style="white-space:nowrap;">Confirmar</button>' +
          '</div>';
        var c = document.getElementById(ctx.codeId); if (c) { try { c.focus(); } catch(e){} }
      }).catch(function(err) {
        if (otpEl) otpEl.innerHTML = '<div style="color:#fca5a5;font-size:0.78rem;">Não foi possível enviar o código: ' + window._safeHtml(String((err && (err.code || err.message)) || 'erro')) + '</div>';
      });
    };

    // Conclui a partir da conta de telefone autenticada na instância secundária:
    // mescla ela na conta atual (sobrevivente) com prova (idToken da conta-tel).
    window._profilePhoneMergeFromSecondary = function(phoneUser, otpEl) {
      var sapp = firebase.app('profilephone');
      var survivor = window._profilePhoneSurvivor;
      var phoneUid = phoneUser.uid;
      if (phoneUid === survivor) {
        if (otpEl) otpEl.innerHTML = '<div style="color:#6ee7b7;font-size:0.8rem;">✅ Esse celular já é desta conta.</div>';
        try { sapp.auth().signOut(); } catch(e){}
        return Promise.resolve();
      }
      // Chama a mergePhoneAccount (dryRun=true só calcula/relata, false executa).
      function callMerge(dryRun) {
        return phoneUser.getIdToken().then(function(proofToken) {
          return firebase.auth().currentUser.getIdToken().then(function(mainTok) {
            return fetch('https://us-central1-scoreplace-app.cloudfunctions.net/mergePhoneAccount', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mainTok },
              body: JSON.stringify({ data: { oldUid: phoneUid, proofIdToken: proofToken, dryRun: !!dryRun } })
            });
          });
        }).then(function(r) { return r.json(); }).then(function(j) {
          if (j && j.result) return j.result;
          if (j && j.error) return { _error: j.error };
          return null;
        });
      }
      function finishOk(merged) {
        try { sapp.auth().signOut(); } catch(e){}
        // Celular VINCULADO secundário: grava o número em linkedPhones[] do sobrevivente
        // pra que "celular + senha" resolva pra esta conta (via _uidByProfilePhone no server).
        try {
          var _ctx = window._profilePhoneCtx;
          if (_ctx && _ctx.linked && _ctx.e164) {
            var _cu = window.AppStore && window.AppStore.currentUser;
            var _db = window.FirestoreDB && window.FirestoreDB.db;
            if (_cu && _db && _cu.uid) {
              var _lp = Array.isArray(_cu.linkedPhones) ? _cu.linkedPhones.slice() : [];
              if (_lp.indexOf(_ctx.e164) === -1) _lp.push(_ctx.e164);
              _cu.linkedPhones = _lp;
              _db.collection('users').doc(_cu.uid).update({ linkedPhones: _lp }).catch(function(){});
            }
          }
        } catch (e) {}
        if (otpEl) otpEl.innerHTML = '<div style="color:#6ee7b7;font-size:0.82rem;">' +
          (merged ? '✅ Contas unidas e celular vinculado! Atualizando…' : '✅ Celular verificado e vinculado! Atualizando…') + '</div>';
        setTimeout(function() { window.location.reload(); }, 1600);
      }
      function fail(msg) {
        try { sapp.auth().signOut(); } catch(e){}
        if (otpEl) otpEl.innerHTML = '<div style="color:#fca5a5;font-size:0.78rem;">Não foi possível vincular/unir: ' + window._safeHtml(String(msg || 'erro')) + '</div>';
      }
      function errMsg(r) { return (r && r._error && (r._error.message || r._error.status)) || 'erro'; }

      // 1) dry-run: descobre se é só reivindicar o número (fantasma, sem dados) ou
      //    UNIR duas contas (com dados). Só pede confirmação quando há merge real.
      return callMerge(true).then(function(res) {
        if (!res || res._error) { fail(errMsg(res)); return; }
        if (res.merged === false) {
          // Número novo / sem conta com dados → só marca verificado, sem perguntar.
          if (otpEl) otpEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">Vinculando…</div>';
          return callMerge(false).then(function(r2) { (r2 && r2.ok) ? finishOk(false) : fail(errMsg(r2)); });
        }
        // Conta real com dados → confirma antes de unir.
        var bits = [];
        if (res.tournaments) bits.push(res.tournaments + ' torneio(s)');
        if (res.casualMatches) bits.push(res.casualMatches + ' partida(s) casual(is)');
        if (res.presences) bits.push(res.presences + ' presença(s)');
        if (res.friendRefsRepointed) bits.push(res.friendRefsRepointed + ' amizade(s)');
        var resumo = bits.length ? (' Vamos trazer ' + bits.join(', ') + ' pra esta conta.') : '';
        var doMerge = function() {
          if (otpEl) otpEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">Unindo as contas…</div>';
          callMerge(false).then(function(r2) { (r2 && r2.ok) ? finishOk(true) : fail(errMsg(r2)); });
        };
        var onCancel = function() {
          try { sapp.auth().signOut(); } catch(e){}
          if (otpEl) otpEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">Tudo bem — nada foi unido.</div>';
        };
        if (typeof showConfirmDialog === 'function') {
          showConfirmDialog('🔀 Esse número já é de outra conta sua',
            'Esse celular pertence a outra conta sua.' + resumo + ' Quer unir as duas contas?',
            doMerge, onCancel, 'Unir contas', 'Cancelar');
        } else {
          doMerge();
        }
      }).catch(function(e) { fail(e && (e.code || e.message)); });
    };

    window._profileConfirmPhoneCode = function() {
      var ctx = window._profilePhoneCtx || { codeId: 'profile-phone-code', otpId: 'profile-phone-otp' };
      var codeEl = document.getElementById(ctx.codeId);
      var code = codeEl ? codeEl.value.trim() : '';
      var otpEl = document.getElementById(ctx.otpId);
      if (!/^\d{6}$/.test(code)) { showNotification('Código', 'Digite os 6 dígitos.', 'warning'); return; }
      if (otpEl) otpEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);">Confirmando…</div>';
      var sapp = firebase.app('profilephone');
      var e164 = window._profilePhoneE164;
      // 1) tenta o código do SMS (Firebase). 2) se falhar, tenta o código do WhatsApp.
      var smsTry = window._profilePhoneConfirmation
        ? window._profilePhoneConfirmation.confirm(code).then(function(result) { return result.user; })
        : Promise.reject(new Error('no-sms-confirmation'));
      smsTry.then(function(phoneUser) {
        return window._profilePhoneMergeFromSecondary(phoneUser, otpEl);
      }).catch(function() {
        // fallback: código do WhatsApp → custom token → signInWithCustomToken
        firebase.auth().currentUser.getIdToken().then(function(mainTok) {
          return fetch('https://us-central1-scoreplace-app.cloudfunctions.net/verifyPhoneOwnershipWhatsApp', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mainTok },
            body: JSON.stringify({ data: { phone: e164, code: code } })
          });
        }).then(function(r) { return r.json(); }).then(function(j) {
          var res = j && j.result;
          if (res && res.ok && res.customToken) {
            return sapp.auth().signInWithCustomToken(res.customToken).then(function(cred) {
              return window._profilePhoneMergeFromSecondary(cred.user, otpEl);
            });
          }
          if (otpEl) otpEl.innerHTML = '<div style="color:#fca5a5;font-size:0.78rem;">Código inválido ou expirado. Tente de novo.</div>';
        }).catch(function() {
          if (otpEl) otpEl.innerHTML = '<div style="color:#fca5a5;font-size:0.78rem;">Código inválido ou expirado. Tente de novo.</div>';
        });
      });
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

    // ── Celulares vinculados ──────────────────────────────────────────────
    window._profileRenderLinkedPhones = function() {
      var cu = window.AppStore && window.AppStore.currentUser;
      var container = document.getElementById('profile-linked-phones');
      if (!container || !cu) return;
      var linked = Array.isArray(cu.linkedPhones) ? cu.linkedPhones : [];
      var fmt = function(p) {
        var s = String(p || ''); var m = s.match(/^\+(\d{2})(\d+)$/);
        if (m && typeof window._formatPhoneDisplay === 'function') return '+' + m[1] + ' ' + window._formatPhoneDisplay(m[2], m[1]);
        return s;
      };
      container.innerHTML = linked.map(function(ph) {
        return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;background:rgba(37,211,102,0.08);border:1px solid rgba(37,211,102,0.25);">' +
          '<span style="flex:1;font-size:0.82rem;color:var(--text-bright);">✅ ' + window._safeHtml(fmt(ph)) + '</span>' +
          '<button type="button" onclick="window._profileUnlinkPhone(\'' + ph.replace(/'/g,"\\'") + '\')" style="background:none;border:none;color:#f87171;cursor:pointer;font-size:0.9rem;padding:0 2px;" title="Remover">×</button>' +
        '</div>';
      }).join('');
    };

    window._profileUnlinkPhone = function(phone) {
      var cu = window.AppStore && window.AppStore.currentUser;
      if (!cu || !cu.uid || !window.FirestoreDB || !window.FirestoreDB.db) return;
      if (!confirm('Remover ' + phone + ' dos seus celulares vinculados?')) return;
      var linked = Array.isArray(cu.linkedPhones) ? cu.linkedPhones.slice() : [];
      var idx = linked.indexOf(phone);
      if (idx !== -1) linked.splice(idx, 1);
      cu.linkedPhones = linked;
      window.FirestoreDB.db.collection('users').doc(cu.uid).update({
        linkedPhones: linked
      }).then(function() {
        window._profileRenderLinkedPhones();
        if (window.showNotification) window.showNotification('Celular removido', phone, 'info');
      }).catch(function(e) { window._warn('[LinkedPhone] unlink error:', e); });
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
      var linked = Array.isArray(cu.linkedEmails) ? cu.linkedEmails : [];
      if (linked.indexOf(email) !== -1) {
        if (window.showNotification) window.showNotification('Já vinculado', 'Este e-mail já está na sua lista.', 'info');
        return;
      }

      var db = window.FirestoreDB && window.FirestoreDB.db;
      if (!db) return;

      inp.disabled = true;
      if (window.showNotification) window.showNotification('📧 Enviando verificação...', email, 'info');

      // Gerar token de verificação simples
      var token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
      var verifyUrl = 'https://scoreplace.app/?verify_email=' + token;
      var expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24h

      // Salvar token no Firestore
      db.collection('emailVerifications').doc(token).set({
        ownerUid: cu.uid,
        ownerName: cu.displayName || cu.email || '',
        emailToVerify: email,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt,
        verified: false
      }).then(function() {
        // Criar email via coleção mail (Trigger Email extension)
        if (window.SCOREPLACE_ENV === 'staging') { return null; } // staging: kill-switch — sem e-mail
        return db.collection('mail').add({
          to: [email],
          message: {
            subject: 'Confirme seu e-mail no scoreplace.app',
            html:
              '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;">' +
              '<div style="text-align:center;margin-bottom:24px;">' +
                '<img src="https://scoreplace.app/icons/icon-192.svg" width="48" height="48" style="border-radius:10px;">' +
                '<h2 style="color:#fbbf24;margin:12px 0 4px;">scoreplace.app</h2>' +
              '</div>' +
              '<p style="font-size:1rem;margin-bottom:8px;">Olá!</p>' +
              '<p style="color:#94a3b8;margin-bottom:20px;">Clique no botão abaixo para confirmar que <b style="color:#e2e8f0;">' + email + '</b> é seu e-mail e vinculá-lo à sua conta.</p>' +
              '<div style="text-align:center;margin:24px 0;">' +
                '<a href="' + verifyUrl + '" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">Confirmar e-mail</a>' +
              '</div>' +
              '<p style="font-size:0.8rem;color:#64748b;text-align:center;">Este link expira em 24 horas. Se você não solicitou isso, ignore este e-mail.</p>' +
              '</div>'
          }
        });
      }).then(function() {
        inp.value = '';
        inp.disabled = false;
        if (window.showNotification) window.showNotification('✅ E-mail enviado!', 'Verifique ' + email + ' e clique no link de confirmação.', 'success');
        if (typeof window._profileRenderLinkedEmails === 'function') window._profileRenderLinkedEmails();
      }).catch(function(err) {
        inp.disabled = false;
        window._warn('[linkEmail] send error:', err);
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
      // letzplay: guarda o handle SEM '@' (canônico); consentimento é boolean.
      var letzplayHandleIn = (_v('profile-edit-letzplay') || '').trim().replace(/^@+/, '');
      var letzplayConsentIn = _chk('profile-letzplay-consent', false);
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
      // v2.4.3: privacidade de contato (default OFF).
      var omitEmail = _chk('profile-omit-email', false);
      var omitPhone = _chk('profile-omit-phone', false);

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

      // ── 2.5 GATE DE NOME ÚNICO (v2.6.104) ───────────────────────────────────
      // Se o nome MUDOU e já existe de OUTRA pessoa (uid diferente), bloqueia — a
      // regra que combinamos: não pode dois usuários distintos com o mesmo nome.
      // Só checa quando o nome muda (saves que não mexem no nome passam, mesmo com
      // duplicata legada). Nome-que-é-telefone é exceção. Fail-open (erro não trava).
      if (finalName && finalName.trim().toLowerCase() !== (_oldDisplayName || '').trim().toLowerCase()
          && !(typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(finalName))
          && window.FirestoreDB && typeof window.FirestoreDB.isDisplayNameTaken === 'function') {
        var _conflictUid = null;
        try { _conflictUid = await window.FirestoreDB.isDisplayNameTaken(finalName, cu.uid); } catch (e) {}
        if (_conflictUid) {
          if (typeof showAlertDialog === 'function') {
            showAlertDialog('Esse nome já está em uso', 'Já existe outra pessoa cadastrada como "' + finalName + '". Escolha um nome diferente — pode incluir o sobrenome ou uma inicial (ex.: "' + finalName + ' M.").', null, { type: 'warning' });
          } else if (typeof showNotification !== 'undefined') {
            showNotification('Nome em uso', 'Já existe "' + finalName + '". Escolha outro.', 'warning');
          }
          var _sbtn = document.getElementById('profile-save-btn');
          if (_sbtn && typeof window._unspinButton === 'function') window._unspinButton(_sbtn);
          return;
        }
      }

      // ── 2a. PRIVACIDADE × NOME (v2.4.4) ────────────────────────────────
      // Se o usuário ativou "ocultar e-mail/telefone" mas o nome de exibição
      // É justamente o contato (não tem nome real), bloqueia o save e exige
      // um nome — senão ele apareceria como "Usuário" pros outros. Escolha
      // dele: ou dá um nome de exibição, ou desliga a ocultação (e o contato
      // continua sendo mostrado). Ninguém fica sem identificação.
      var _fnTrim = String(finalName || '').trim();
      var _nameIsEmail = /@/.test(_fnTrim);
      var _nameIsPhone = !_nameIsEmail && /^\+?[\d\s().\-]{6,}$/.test(_fnTrim);
      if (omitEmail && _nameIsEmail) {
        if (typeof showAlertDialog === 'function') {
          showAlertDialog(
            'Escolha um nome de exibição',
            'Você ativou "ocultar meu e-mail", mas seu nome de exibição é o próprio e-mail. ' +
            'Digite um nome pra aparecer pros outros usuários — ou desligue a ocultação pra continuar mostrando o e-mail.',
            function () { var _el = document.getElementById('profile-edit-name'); if (_el) { try { _el.focus(); } catch (e) {} } },
            { type: 'warning' }
          );
        }
        return;
      }
      if (omitPhone && _nameIsPhone) {
        if (typeof showAlertDialog === 'function') {
          showAlertDialog(
            'Escolha um nome de exibição',
            'Você ativou "ocultar meu telefone", mas seu nome de exibição é o próprio telefone. ' +
            'Digite um nome pra aparecer pros outros usuários — ou desligue a ocultação pra continuar mostrando o telefone.',
            function () { var _el = document.getElementById('profile-edit-name'); if (_el) { try { _el.focus(); } catch (e) {} } },
            { type: 'warning' }
          );
        }
        return;
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
      if (letzplayHandleIn) payload.letzplayHandle = letzplayHandleIn;
      // v2.5.x: celular NÃO é gravado direto quando MUDA — precisa ser verificado
      // por SMS/WhatsApp (botão "Verificar e vincular", que prova posse e, se for
      // de outra conta, mescla). Só persiste aqui se o número for IGUAL ao já
      // verificado (re-save) — assim o save não regrava nem perde o número atual.
      var _phoneChangedUnverified = false;
      if (phoneDigits) {
        var _newE164 = (typeof window._normalizePhoneE164 === 'function') ? window._normalizePhoneE164(phoneDigits, phoneCountry || '55') : phoneDigits;
        var _curDigits = (cu.phone || '').replace(/\D/g, '');
        var _curE164 = _curDigits ? ((typeof window._normalizePhoneE164 === 'function') ? window._normalizePhoneE164(_curDigits, cu.phoneCountry || '55') : cu.phone) : '';
        if (_newE164 && _newE164 === _curE164) {
          payload.phone = _newE164; // inalterado — ok regravar
        } else {
          _phoneChangedUnverified = true; // mudou → exige verificação; não grava
        }
      }
      // v1.7.9-beta: include email when user adds/changes it in profile
      // v2.5.x: e-mail ALTERADO/novo não é gravado direto — precisa verificação
      // de posse ("✉️ Verificar e vincular" → verifyBeforeUpdateEmail). Assim o
      // e-mail só vira válido/login depois de confirmado.
      var _emailChangedUnverified = false;
      if (_emailChanged) { _emailChangedUnverified = true; }
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
      // v2.4.3: privacidade de contato (default OFF).
      payload.omitEmail = omitEmail;
      payload.omitPhone = omitPhone;
      payload.letzplayConsent = letzplayConsentIn;

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

      // ── 6b. MUDANÇA DE CATEGORIA POR PERFIL → APROVAÇÃO (v2.4.28) ─────────
      // Se a habilidade/gênero/idade que o usuário acabou de salvar implica uma
      // categoria diferente da que ele tem em algum torneio ativo, NÃO muda
      // direto: cria pedido pendente + notifica o organizador pra aprovar.
      // Fire-and-forget, nunca bloqueia o save do perfil.
      if (!saveError && typeof window._requestCategoryChangeFromProfile === 'function') {
        try {
          window._requestCategoryChangeFromProfile({
            gender: cu.gender,
            birthDate: cu.birthDate,
            skillBySport: cu.skillBySport,
            defaultCategory: cu.defaultCategory,
            displayName: cu.displayName
          }, uid);
        } catch (_e) { window._warn && window._warn('[Profile] req cat change falhou', _e); }
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
        } else if (_phoneChangedUnverified || _emailChangedUnverified) {
          var _pendMsg = (_phoneChangedUnverified && _emailChangedUnverified)
            ? 'O novo celular e o novo e-mail ainda não foram salvos. Toque em "Verificar e vincular" em cada um pra confirmar.'
            : (_phoneChangedUnverified
              ? 'O novo número ainda não foi salvo. Toque em "📱 Verificar e vincular" pra confirmar por SMS/WhatsApp.'
              : 'O novo e-mail ainda não foi salvo. Toque em "✉️ Verificar e vincular" pra confirmar pelo link.');
          showNotification('Perfil salvo — falta confirmar contato', _pendMsg, 'warning');
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
      // v1.9.96: com as dicas desativadas globalmente (window._HINTS_ENABLED
      // !== true) o toggle nem é renderizado — pula o bloco pra não chamar
      // enable() à toa (que dispararia "Dicas ativadas" a cada save).
      if (window._HINTS_ENABLED === true && window._hintSystem) {
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
      var firstName = name || _t('auth.defaultUser');
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
      // v2.5.x: merge-por-e-mail no save REMOVIDO. Antes, salvar o perfil com um
      // e-mail de outra conta disparava a mesclagem direto — mas isso (a) gravava
      // um e-mail não verificado e (b) agora é barrado pela prova de posse no
      // mergePhoneAccount (digitar um e-mail ≠ provar que é seu). A troca/adição
      // de e-mail passa pelo botão "✉️ Verificar e vincular" (_profileVerifyEmail),
      // que verifica a posse de verdade antes de qualquer mudança/mesclagem.

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
    var saveBtnHtml = '<button type="button" class="btn btn-primary btn-sm hover-lift" id=\"profile-save-btn\" onclick="if(window._spinButton)window._spinButton(this,\'Salvando...\'); if(typeof saveUserProfile===\'function\')saveUserProfile()" style="flex:0 0 auto;width:auto;max-width:120px;background:#10b981;color:#fff;border:1px solid #059669;font-weight:700;padding:7px 14px;border-radius:10px;font-size:0.82rem;line-height:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;box-shadow:0 1px 3px rgba(16,185,129,0.3);">💾 ' + _t('btn.save') + '</button>';
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

    // v2.4.21: ver renderProfilePage — flag de edição evita que o re-populate
    // pós-loadUserProfile limpe campos que o usuário preencheu nesse intervalo.
    window._profileDirty = false;
    if (typeof window._attachProfileDirtyTracking === 'function') {
      window._attachProfileDirtyTracking(modalInner);
    }
    if (typeof window._populateProfileModalFields === 'function') {
      window._populateProfileModalFields();
    }

    if (window.AppStore && typeof window.AppStore.loadUserProfile === 'function' && cu.uid) {
      try {
        await window.AppStore.loadUserProfile(cu.uid);
        if (window.location.hash === '#profile' && !window._profileDirty && typeof window._populateProfileModalFields === 'function') {
          window._populateProfileModalFields();
        }
      } catch (e) { window._warn('Profile refresh on open failed:', e); }
    }

    if (typeof window._reflowChrome === 'function') window._reflowChrome();

    // v2.3.24: tour de coachmarks dentro do perfil (campos incompletos primeiro,
    // depois configurações gerais). Self-guarda contra disabled/já-visto.
    if (window._coach && typeof window._coach.startProfileTour === 'function') {
      window._coach.startProfileTour();
    }
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

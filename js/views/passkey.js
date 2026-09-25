// ─────────────────────────────────────────────────────────────────────────────
// passkey.js — ENTRAR SEM SENHA, e sem a pergunta "qual conta eu usei"
//
// ⛔⛔ O DEFEITO QUE ISTO CONSERTA, MEDIDO EM 25/set/2026 na base inteira:
// 9 pares de conta duplicada em 273 contas vivas, e **4 deles são Apple + Google** — a assinatura
// de quem voltou, não achou a própria conta e criou outra. O caminho de hoje é três botões de
// entrada e um chute; chutando errado, a pessoa cai numa conta VAZIA e cadastra de novo.
//
// ⭐ A CHAVE É DESCOBRÍVEL: a pessoa não digita nome nem e-mail. Toca em entrar, o aparelho pede o
// rosto ou a digital, e ela está dentro — na conta certa, porque a chave sabe qual é. É camada A
// MENOS que hoje, não a mais.
//
// ⛔ E O ROSTO AQUI É O DO APARELHO, não um nosso: quem confere é o sistema operacional, com o
// sensor de profundidade que a Apple não entrega para aplicativo nenhum. Nós recebemos só uma
// assinatura que apenas aquele aparelho consegue produzir. Foto da foto não passa porque o Face ID
// exige profundidade, que foto 2D não tem.
//
// ⚠️ WEB. A WebView do app nativo roda em origem própria e passkey exige origem https com arquivo de
// associação de domínio — a mesma parede que derrubou o seletor do Google aqui. No nativo o botão
// não aparece, e isso é decisão, não esquecimento: ver `_passkeyDisponivel`.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  /* ── base64url ↔ bytes ───────────────────────────────────────────────────────
   * ⛔ ESCRITO À MÃO DE PROPÓSITO, e são 12 linhas: o navegador precisa de bytes e o servidor fala
   * base64url. A alternativa era mais uma biblioteca no `index.html`, e a página já carrega 109
   * scripts — o peso é o problema que a reforma está atacando. */
  function b64urlParaBytes(s) {
    var t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var bin = atob(t), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesParaB64url(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /* O navegador sabe fazer passkey? ⛔ Três perguntas, e a terceira é a que importa no nativo:
   * a WebView tem a API mas a origem não serve, e aí o gesto falharia DEPOIS de a pessoa tentar. */
  window._passkeyDisponivel = function () {
    if (!window.PublicKeyCredential || !navigator.credentials || !navigator.credentials.create) return false;
    if (!window.isSecureContext) return false;
    /* ⛔ NO APP NATIVO NÃO OFERECEMOS, e não é cautela vaga: a origem da WebView não é https do
     * domínio, e passkey é PRESO ao domínio por desenho. Oferecer ali seria prometer no botão o que
     * o app não pode cumprir. */
    try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return false; } catch (e) {}
    return true;
  };

  /* Há passkey utilizável NESTE aparelho? Usado para decidir se o botão aparece com destaque.
   * ⚠️ Responde uma PROMESSA e pode dizer "não sei": navegador sem o método devolve indefinido, e
   * tratar indefinido como "não tem" esconderia o botão de quem tem. */
  window._passkeyTemNesteAparelho = async function () {
    try {
      if (!window._passkeyDisponivel()) return false;
      if (!window.PublicKeyCredential.isConditionalMediationAvailable) return null;
      return await window.PublicKeyCredential.isConditionalMediationAvailable();
    } catch (e) { return null; }
  };

  function db() { return window.FirestoreDB; }

  /* Conclusão compartilhada pelas DUAS vias de entrada (botão e oferta no campo).
   * ⛔ Uma só: duas cópias divergiriam, e a divergência aqui é "entra por um caminho e não pelo
   * outro" — o tipo de defeito que só aparece no aparelho de quem reclama. */
  async function _concluirEntrada(desafioId, cred) {
    var r = cred.response;
    var fim = await db()._callFn('concluirEntradaPorPasskey', {
      desafioId: desafioId,
      resposta: {
        id: cred.id, rawId: bytesParaB64url(cred.rawId), type: cred.type,
        clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
        response: {
          clientDataJSON: bytesParaB64url(r.clientDataJSON),
          authenticatorData: bytesParaB64url(r.authenticatorData),
          signature: bytesParaB64url(r.signature),
          userHandle: r.userHandle ? bytesParaB64url(r.userHandle) : undefined,
        },
      },
    }, { semLogin: true });   /* ⛔ a entrada é de quem ainda NÃO entrou — ver `_callFn` */
    if (!fim || !fim.token) return { ok: false, motivo: 'sem-token' };
    await window.firebase.auth().signInWithCustomToken(fim.token);
    return { ok: true, uid: fim.uid };
  }

  /* ── ENTRAR ──────────────────────────────────────────────────────────────── */
  /* ⛔⛔ A TELA NÃO SABE SE A PESSOA TEM CHAVE OU DESISTIU — e não pode fingir que sabe.
   * O padrão devolve o MESMO erro nos dois casos, de propósito: se distinguisse, qualquer site
   * descobriria se você tem conta ali só pedindo a chave. Consequência no desenho:
   *  · o botão CONTINUA visível depois da tentativa, para quem cancelou por engano tentar de novo;
   *  · e o convite de criar conta aparece do lado, sem afirmar que a pessoa não tem conta.
   * Escrever "você não tem conta" aqui seria afirmar o que não medimos. */
  window._passkeyRevelarOutrasFormas = function () {
    var box = document.getElementById('login-outras-formas');
    if (!box) return;
    box.style.display = '';
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
  };

  window._entrarPorPasskey = async function () {
    if (!window._passkeyDisponivel()) {
      if (typeof showNotification === 'function') {
        showNotification('Não disponível aqui', 'Entrar pelo rosto ou digital funciona no navegador do celular ou do computador.', 'info');
      }
      return { ok: false, motivo: 'indisponivel' };
    }
    try {
      var ini = await db()._callFn('iniciarEntradaPorPasskey', {}, { semLogin: true });
      var o = (ini && ini.opcoes) || {};
      /* ⛔ `mediation: 'required'` — o gesto é explícito, a pessoa clicou. Sem isso o navegador pode
       * resolver em silêncio e a pessoa não entende o que aconteceu. */
      var cred = await navigator.credentials.get({
        mediation: 'required',
        publicKey: {
          challenge: b64urlParaBytes(o.challenge),
          rpId: o.rpId,
          timeout: o.timeout,
          userVerification: o.userVerification || 'required',
        },
      });
      if (!cred) { window._passkeyRevelarOutrasFormas(); return { ok: false, motivo: 'cancelado' }; }
      var r1 = await _concluirEntrada(ini.desafioId, cred);
      if (!r1.ok) window._passkeyRevelarOutrasFormas();
      return r1;
    } catch (e) {
      /* ⛔ CANCELAR NÃO É ERRO. Quem fecha o diálogo do rosto recebe `NotAllowedError`; mostrar
       * "falhou" aí ensina a pessoa a desconfiar do caminho que a gente quer que ela use. */
      var nome = (e && e.name) || '';
      /* ⛔ Cancelou OU não tem chave — indistinguíveis. Revela as outras formas e cala a boca:
       * mensagem de erro aqui ensinaria a pessoa a desconfiar do caminho que queremos que ela use. */
      if (nome === 'NotAllowedError' || nome === 'AbortError') {
        window._passkeyRevelarOutrasFormas();
        return { ok: false, motivo: 'cancelado' };
      }
      if (window._error) window._error('[passkey] entrada falhou', e);
      if (typeof showNotification === 'function') {
        showNotification('Não consegui entrar assim', 'Tente pelo Google, Apple ou e-mail. Seus dados continuam na mesma conta.', 'warning');
      }
      return { ok: false, motivo: 'erro' };
    }
  };

  /* ── A CHAVE APARECE SOZINHA NO CAMPO (mediação condicional) ─────────────────
   * ⛔ ISTO É O CAMINHO BOM, e não tem botão: o navegador oferece a chave dentro do campo, como já
   * faz com senha guardada. Quem TEM chave vê a conta dela ali e entra num toque; quem NÃO tem não
   * vê nada — nenhum erro, nenhuma tela a mais.
   *
   * ⛔ E É POR ISSO QUE O BOTÃO CONTINUA EXISTINDO: a mediação condicional não avisa se há chave ou
   * não. O padrão é assim de propósito — se avisasse, qualquer site descobriria se você tem conta
   * ali só carregando a página. A consequência prática é que a TELA NÃO SABE, e não pode fingir que
   * sabe. Ver `_entrarPorPasskey`.
   *
   * ⚠️ Precisa de um campo com `autocomplete` contendo `webauthn` — é o gancho onde o navegador
   * pendura a oferta. Sem o campo, isto não roda e não quebra nada. */
  var _abortarCondicional = null;
  window._passkeyOferecerNoCampo = async function () {
    try {
      if (!window._passkeyDisponivel()) return { ok: false, motivo: 'indisponivel' };
      if (!window.PublicKeyCredential.isConditionalMediationAvailable) return { ok: false, motivo: 'sem-suporte' };
      if (!(await window.PublicKeyCredential.isConditionalMediationAvailable())) return { ok: false, motivo: 'sem-suporte' };

      var ini = await db()._callFn('iniciarEntradaPorPasskey', {}, { semLogin: true });
      var o = (ini && ini.opcoes) || {};
      /* ⛔ ABORTÁVEL: se a pessoa resolver entrar por senha ou provedor, esta espera tem de morrer.
       * Sem o abortador, ela fica pendurada e o navegador recusa a PRÓXIMA chamada de passkey. */
      if (_abortarCondicional) { try { _abortarCondicional.abort(); } catch (e) {} }
      _abortarCondicional = new AbortController();

      var cred = await navigator.credentials.get({
        mediation: 'conditional',
        signal: _abortarCondicional.signal,
        publicKey: {
          challenge: b64urlParaBytes(o.challenge),
          rpId: o.rpId,
          userVerification: o.userVerification || 'required',
        },
      });
      if (!cred) return { ok: false, motivo: 'sem-chave' };
      return await _concluirEntrada(ini.desafioId, cred);
    } catch (e) {
      /* Abortado ou sem chave: silêncio. Esta é a via que NÃO pode incomodar quem não tem chave. */
      return { ok: false, motivo: 'silencio' };
    }
  };
  window._passkeyPararOferta = function () {
    if (_abortarCondicional) { try { _abortarCondicional.abort(); } catch (e) {} _abortarCondicional = null; }
  };

  /* ── CADASTRAR ESTE APARELHO ─────────────────────────────────────────────── */
  window._cadastrarPasskey = async function () {
    if (!window._passkeyDisponivel()) return { ok: false, motivo: 'indisponivel' };
    try {
      var ini = await db()._callFn('iniciarCadastroDePasskey', {});
      var o = (ini && ini.opcoes) || {};
      var cred = await navigator.credentials.create({
        publicKey: {
          challenge: b64urlParaBytes(o.challenge),
          rp: o.rp,
          user: {
            id: b64urlParaBytes(o.user.id),
            name: o.user.name,
            displayName: o.user.displayName || o.user.name,
          },
          pubKeyCredParams: o.pubKeyCredParams,
          timeout: o.timeout,
          attestation: o.attestation,
          authenticatorSelection: o.authenticatorSelection,
          excludeCredentials: (o.excludeCredentials || []).map(function (c) {
            return { id: b64urlParaBytes(c.id), type: 'public-key', transports: c.transports };
          }),
        },
      });
      if (!cred) return { ok: false, motivo: 'cancelado' };

      var r = cred.response;
      var fim = await db()._callFn('concluirCadastroDePasskey', {
        desafioId: ini.desafioId,
        resposta: {
          id: cred.id, rawId: bytesParaB64url(cred.rawId), type: cred.type,
          clientExtensionResults: (cred.getClientExtensionResults && cred.getClientExtensionResults()) || {},
          response: {
            clientDataJSON: bytesParaB64url(r.clientDataJSON),
            attestationObject: bytesParaB64url(r.attestationObject),
            transports: (r.getTransports && r.getTransports()) || undefined,
          },
        },
      });
      if (fim && fim.ok && typeof showNotification === 'function') {
        /* ⛔ NÃO PROMETER O QUE NÃO SE PODE CONFERIR: só dizemos que vale em outros aparelhos quando
         * o próprio aparelho informou que a chave SINCRONIZA. */
        showNotification('Aparelho cadastrado',
          fim.sincroniza
            ? 'Agora você entra pelo rosto ou digital, aqui e nos seus outros aparelhos.'
            : 'Agora você entra pelo rosto ou digital neste aparelho.', 'success');
      }
      return { ok: !!(fim && fim.ok), sincroniza: !!(fim && fim.sincroniza) };
    } catch (e) {
      var nome = (e && e.name) || '';
      if (nome === 'NotAllowedError' || nome === 'AbortError') return { ok: false, motivo: 'cancelado' };
      /* ⛔ `InvalidStateError` quer dizer "este aparelho JÁ está cadastrado" — é sucesso disfarçado
       * de erro, e mostrar falha aqui faria a pessoa tentar de novo para sempre. */
      if (nome === 'InvalidStateError') {
        if (typeof showNotification === 'function') {
          showNotification('Já estava cadastrado', 'Este aparelho já entra pelo rosto ou digital.', 'info');
        }
        return { ok: true, jaTinha: true };
      }
      if (window._error) window._error('[passkey] cadastro falhou', e);
      if (typeof showNotification === 'function') {
        showNotification('Não consegui cadastrar', 'Tente de novo. Você continua entrando pelo Google, Apple ou e-mail.', 'warning');
      }
      return { ok: false, motivo: 'erro' };
    }
  };
})();

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
  /* ⛔ NÃO EXISTE MAIS `desafioId`: o desafio não é guardado no servidor, ele vem DENTRO do que o
   * aparelho assinou (`clientDataJSON`) — ver o desenho em `functions/passkey-core.js`. Mandar o
   * desafio "ao lado" seria conferir uma coisa e validar outra. */
  /* ⛔⛔ `aindaVale` NÃO É ENFEITE: é a última trava antes de TROCAR A SESSÃO. Achado na revisão de
   * 25/set/2026. A oferta no campo fica pendurada esperando o gesto; se a pessoa desistir e entrar
   * pelo Google nesse meio-tempo, a chave que ela escolher DEPOIS trocaria a sessão que acabou de
   * autenticar — ela entraria como outra conta sem entender por quê.
   * ⚠️ Quem chama pelo gesto explícito passa um guarda que sempre vale: ali a pessoa está esperando
   * exatamente isto acontecer. */
  async function _concluirEntrada(cred, aindaVale) {
    var vale = (typeof aindaVale === 'function') ? aindaVale : function () { return true; };
    if (!vale()) return { ok: false, motivo: 'cancelado' };
    var r = cred.response;
    var fim = await db()._callFn('concluirEntradaPorPasskey', {
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
    /* ⛔⛔ CONFERE DE NOVO AQUI, depois da última espera: é o instante em que a sessão troca, e é o
     * único ponto onde a troca indevida seria irreversível para quem já havia entrado por outro
     * caminho. Token não usado simplesmente vence sozinho. */
    if (!vale()) return { ok: false, motivo: 'cancelado' };
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
      var r1 = await _concluirEntrada(cred);
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
   * ⛔ A MEDIAÇÃO CONDICIONAL NÃO AVISA se há chave ou não, e o padrão é assim de propósito: se
   * avisasse, qualquer site descobriria se você tem conta ali só carregando a página. A consequência
   * prática é que a TELA NÃO SABE, e não pode fingir que sabe.
   * ⚠️ (Aqui havia a frase "é por isso que o BOTÃO continua existindo". O botão foi arrancado — o
   * padrão é o campo. Quem lê comentário velho implementa defeito velho.)
   *
   * ⚠️ Precisa de um campo com `autocomplete` contendo `webauthn` — é o gancho onde o navegador
   * pendura a oferta. Sem o campo, isto não roda e não quebra nada. */
  var _abortarCondicional = null;
  /* ⛔⛔ A GERAÇÃO EXISTE PORQUE O ABORTADOR CHEGAVA TARDE — achado na revisão de 25/set/2026, e é
   * corrida de verdade, não teoria. Eu criava o `AbortController` DEPOIS de esperar a chamada ao
   * servidor. Naquele intervalo — que é o intervalo de rede, o mais longo de todos — `pararOferta`
   * não tinha o que abortar: a pessoa fechava a tela ou entrava pelo Google, a resposta chegava
   * depois, e a oferta seguia em frente e podia TROCAR A SESSÃO que acabara de autenticar.
   * ⇒ São duas trancas, e nenhuma cobre sozinha:
   *   · o CONTROLADOR é criado antes do primeiro `await` (tem o que abortar desde o primeiro instante);
   *   · a GERAÇÃO cobre o que o abortador não alcança — uma chamada de rede já disparada não se aborta,
   *     então o que se faz é DESCARTAR a resposta dela.
   * ⚠️ É a lição de [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]: rede montada depois
   * do começo não cobre o começo. */
  var _geracaoDaOferta = 0;
  window._passkeyOferecerNoCampo = async function () {
    var minha = ++_geracaoDaOferta;
    var valeAinda = function () { return minha === _geracaoDaOferta; };
    /* ⛔ O CONTROLADOR NASCE AQUI, antes de qualquer espera. */
    if (_abortarCondicional) { try { _abortarCondicional.abort(); } catch (e) {} }
    var meu = new AbortController();
    _abortarCondicional = meu;
    try {
      if (!window._passkeyDisponivel()) return { ok: false, motivo: 'indisponivel' };
      if (!window.PublicKeyCredential.isConditionalMediationAvailable) return { ok: false, motivo: 'sem-suporte' };
      if (!(await window.PublicKeyCredential.isConditionalMediationAvailable())) return { ok: false, motivo: 'sem-suporte' };
      if (!valeAinda()) return { ok: false, motivo: 'cancelado' };

      var ini = await db()._callFn('iniciarEntradaPorPasskey', {}, { semLogin: true });
      /* ⛔ E AQUI ESTAVA O BURACO: se a tela fechou durante a rede, a resposta é DESCARTADA. */
      if (!valeAinda() || meu.signal.aborted) return { ok: false, motivo: 'cancelado' };
      var o = (ini && ini.opcoes) || {};

      var cred = await navigator.credentials.get({
        mediation: 'conditional',
        signal: meu.signal,
        publicKey: {
          challenge: b64urlParaBytes(o.challenge),
          rpId: o.rpId,
          userVerification: o.userVerification || 'required',
        },
      });
      if (!cred) return { ok: false, motivo: 'sem-chave' };
      return await _concluirEntrada(cred, valeAinda);
    } catch (e) {
      /* Abortado ou sem chave: silêncio. Esta é a via que NÃO pode incomodar quem não tem chave. */
      return { ok: false, motivo: 'silencio' };
    }
  };
  /* ⛔⛔ E ONDE A OFERTA NO CAMPO NÃO EXISTE, PRECISA DE CAMINHO EXPLÍCITO.
   * O padrão manda usar o campo — e foi por isso que eu arranquei o botão. Mas navegador sem mediação
   * condicional não mostra nada no campo, e aí quem JÁ cadastrou a chave fica sem nenhuma forma de
   * usá-la: a função de entrada existia sem ninguém chamando.
   * ⇒ O atalho aparece SÓ nesse caso, e a pergunta é feita ao navegador, não chutada. */
  window._passkeyMostrarAtalhoSeNecessario = async function () {
    var alvo = document.getElementById('login-passkey-atalho');
    if (!alvo) return;
    if (!window._passkeyDisponivel()) return;                    // nem oferece onde não funciona
    var temOferta = await window._passkeyTemNesteAparelho();
    if (temOferta === true) return;                              // o campo já oferece: atalho seria ruído
    alvo.innerHTML =
      '<button type="button" class="btn btn-ghost btn-micro" ' +
        'onclick="window._entrarPorPasskey && window._entrarPorPasskey()" ' +
        'style="text-decoration:underline;font-size:0.8rem;">' +
        'Entrar com a minha chave de acesso' +
      '</button>';
  };

  window._passkeyPararOferta = function () {
    /* ⛔ A GERAÇÃO AVANÇA PRIMEIRO: é o que invalida a oferta que ainda está na rede e por isso não
     * tem o que abortar. Sem esta linha, fechar a tela durante a chamada não parava nada. */
    _geracaoDaOferta++;
    if (_abortarCondicional) { try { _abortarCondicional.abort(); } catch (e) {} _abortarCondicional = null; }
  };

  /* ── LISTAR E REVOGAR ────────────────────────────────────────────────────────
   * ⛔⛔ SEM ISTO A CHAVE É PORTA SEM TRANCA — e eu havia entregue as portas do servidor sem tela
   * nenhuma que as chamasse, o que é o mesmo que não ter. Aparelho perdido, vendido ou emprestado
   * continuaria entrando na conta para sempre, e a pessoa sem nada a fazer.
   * ⚠️ A lista não mostra chave nem contador: quem olha precisa RECONHECER o aparelho e decidir, não
   * auditar criptografia. Mostra quando cadastrou, quando usou pela última vez, e se sincroniza. */
  window._pintarMinhasPasskeys = async function () {
    var box = document.getElementById('profile-passkey-lista');
    if (!box) return;
    try {
      var r = await db()._callFn('listarMinhasPasskeys', {});
      var lista = (r && r.passkeys) || [];
      if (!lista.length) { box.innerHTML = ''; return; }
      var quando = function (iso) {
        if (!iso) return 'nunca usado';
        try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (e) { return ''; }
      };
      box.innerHTML =
        '<div style="font-size:0.72rem;color:var(--text-muted);margin:8px 0 4px;">' +
          'Aparelhos que entram sem senha (' + lista.length + ' de ' + (r.teto || '') + '):' +
        '</div>' +
        lista.map(function (k, i) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border-color);">' +
            '<div style="font-size:0.74rem;line-height:1.3;">' +
              '<b>Aparelho ' + (i + 1) + '</b>' + (k.sincroniza ? ' · sincroniza' : '') +
              '<div style="color:var(--text-muted);font-size:0.68rem;">último uso: ' + quando(k.ultimoUsoEm) + '</div>' +
            '</div>' +
            /* ⛔ O identificador vai no atributo, não no texto: ele não diz nada à pessoa e é dado
             * que não precisa aparecer na tela. */
            '<button type="button" class="btn btn-ghost btn-micro" data-revogar="' + window._safeHtml(k.id) + '" ' +
              'onclick="window._revogarPasskey && window._revogarPasskey(this.getAttribute(\'data-revogar\'))" ' +
              'style="color:var(--sp-c-f87171,#f87171);">Remover</button>' +
          '</div>';
        }).join('');
    } catch (e) { box.innerHTML = ''; }
  };

  window._revogarPasskey = async function (id) {
    if (!id) return;
    /* ⛔ PERGUNTA ANTES: remover é irreversível para aquele aparelho — a pessoa terá de cadastrar de
     * novo. E é o tipo de botão que se toca por engano numa lista. */
    if (typeof showConfirmDialog === 'function') {
      var vai = await showConfirmDialog('Remover este aparelho?',
        'Ele deixa de entrar sem senha. Você continua entrando pelo Google, Apple ou e-mail, e pode cadastrar de novo depois.');
      if (!vai) return;
    }
    try {
      await db()._callFn('revogarPasskey', { id: id });
      if (typeof showNotification === 'function') showNotification('Aparelho removido', '', 'success');
      await window._pintarMinhasPasskeys();
    } catch (e) {
      if (typeof showNotification === 'function') {
        showNotification('Não consegui remover', 'Tente de novo.', 'warning');
      }
    }
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
      if (fim && fim.ok) { try { await window._pintarMinhasPasskeys(); } catch (e2) {} }
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

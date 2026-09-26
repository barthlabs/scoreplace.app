'use strict';

/* ⛔⛔ O PASSKEY SÓ VALE PELO QUE ELE RECUSA.
 *
 * Por que existe: medido em 25/set/2026, 4 dos 9 pares de conta duplicada são Apple + Google —
 * gente que voltou, não achou a própria conta e criou outra. A chave descobrível tira a pergunta
 * "qual conta eu usei". Mas uma entrada sem senha só é melhor que senha se recusar o que tem que
 * recusar; se aceitar, ela é pior que senha nenhuma, porque parece segura.
 *
 * ⛔ CADA ASSERÇÃO AQUI É UMA FALHA REAL DE SISTEMAS DE VERDADE, não hipótese de manual:
 *   · origem não conferida → site alheio pede a assinatura e entra na conta da pessoa;
 *   · desafio reusável → assinatura interceptada vale para sempre;
 *   · contador ignorado → a MESMA assinatura entra duas vezes.
 *
 * ⚠️ A conferência da assinatura em si NÃO é testada aqui, e é de propósito: ela mora na biblioteca
 * (análise de estrutura binária e de assinatura). O que este arquivo trava são as decisões que
 * ficariam espalhadas e erram caladas.
 */
const path = require('path');
const P = require(path.join(__dirname, '..', 'functions', 'passkey-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o passkey vale pelo que recusa ────\n');

// ── ① ORIGEM ─────────────────────────────────────────────────────────────────
ok(P.origemAceita('https://scoreplace.app') === true, '① a nossa origem passa');
ok(P.origemAceita('https://www.scoreplace.app') === true, '① e a variante com www também');
ok(P.origemAceita('https://evil.com') === false, '① ⛔ site alheio NÃO passa — é o ataque que o campo origem existe para barrar');
ok(P.origemAceita('http://scoreplace.app') === false, '① ⛔ nem o mesmo domínio SEM https');
ok(P.origemAceita('https://scoreplace.app.evil.com') === false, '① ⛔ nem domínio que só COMEÇA igual');
ok(P.origemAceita('https://scoreplace.app ') === true, '① espaço à volta não muda a origem (o texto é aparado)');
ok(P.origemAceita('') === false && P.origemAceita(null) === false, '① ⛔ vazio e ausente não passam');

// ── ② DESAFIO: ELE NÃO É GUARDADO, ELE SE CARREGA ────────────────────────────
/* ⛔⛔ REESCRITO em 25/set/2026, na 3ª rodada de revisão da leva, e a razão é de desenho:
 * a porta que entrega o desafio é PÚBLICA (é a porta de quem ainda não entrou) e ela GRAVAVA um
 * documento por chamada. Sem login e sem App Check, um laço simples virava gravação sem fim.
 * Tentei tapar duas vezes e errei as duas: teto por ORIGEM é falso (a origem sai de
 * `x-forwarded-for`, escrito por quem chama) e teto GLOBAL num documento só é contenção, e ainda
 * deixava um abusador fechar a entrada de todos.
 * ⇒ A saída é NÃO GRAVAR: o desafio carrega tipo, conta e hora, e o único estado que sobra é a
 * QUEIMA — um documento por desafio, gravado DEPOIS de a assinatura ser conferida. */
const agora = 1_800_000_000_000;
const RND = 'x'.repeat(43);
const cru = P.cunharDesafio('entrada', null, agora, RND);
const comoVolta = (txt) => Buffer.from(String(txt), 'utf8').toString('base64url');

ok(P.desafioServeParaUso(comoVolta(cru), 'entrada', null, agora).ok === true,
  '② desafio recém-cunhado serve');
ok(P.desafioServeParaUso(comoVolta(cru), 'cadastro', null, agora).motivo === 'tipo-errado',
  '② ⛔⛔ desafio de ENTRADA não serve para CADASTRAR — senão a porta pública cadastraria aparelho');
ok(P.desafioServeParaUso(comoVolta(P.cunharDesafio('cadastro', 'u1', agora, RND)), 'entrada', null, agora).motivo === 'tipo-errado',
  '② ⛔ e o contrário também: desafio de cadastro não entra');
ok(P.desafioServeParaUso(comoVolta(P.cunharDesafio('cadastro', 'u1', agora, RND)), 'cadastro', 'u2', agora).motivo === 'de-outra-conta',
  '② ⛔⛔ no cadastro, a CONTA vai dentro do desafio e tem de ser a de quem chama');
ok(P.desafioServeParaUso(comoVolta(cru), 'entrada', null, agora + P.DESAFIO_VALE_MS + 1).motivo === 'vencido',
  '② ⛔ vencido é recusado — é o que limita a janela de quem capturou o gesto');
ok(P.desafioServeParaUso(comoVolta(cru), 'entrada', null, agora - 600000).motivo === 'futuro',
  '② ⛔ e hora no FUTURO também: relógio torto não é credencial');
ok(P.desafioServeParaUso('', 'entrada', null, agora).ok === false, '② vazio não passa');
ok(P.desafioServeParaUso(comoVolta('e~-~' + agora.toString(36) + '~curto'), 'entrada', null, agora).motivo === 'aleatorio-curto',
  '② ⛔ aleatório curto é RECUSA, não aviso: desafio adivinhável não é desafio');
ok(P.desafioServeParaUso(comoVolta('lixo'), 'entrada', null, agora).ok === false,
  '② e lixo não vira desafio por acidente');
ok(P.marcaDoDesafio(cru) !== P.marcaDoDesafio(cru + 'a'),
  '② a marca da queima muda com o desafio — senão dois desafios dividiriam a mesma queima');
ok(P.desafioDaResposta({}) === '' && P.desafioDaResposta(null) === '',
  '② resposta sem clientDataJSON devolve vazio, não explode');

// ── ③ CONTADOR: a defesa contra reuso ────────────────────────────────────────
ok(P.contadorAvancou(5, 6) === true, '③ contador que avança passa');
ok(P.contadorAvancou(5, 5) === false, '③ ⛔⛔ contador IGUAL é recusado — é a MESMA assinatura chegando de novo');
ok(P.contadorAvancou(5, 4) === false, '③ ⛔ e contador que retrocede também');
ok(P.contadorAvancou(0, 0) === true,
  '③ ⚠️ MAS zero nos dois lados PASSA — vários aparelhos (Apple entre eles) não implementam contador; recusar trancaria a maioria dos iPhones');
ok(P.contadorAvancou(0, 1) === true, '③ e de zero para um passa');

// ── ④ TETO POR CONTA ─────────────────────────────────────────────────────────
ok(P.podeCadastrarMais(0) === true && P.podeCadastrarMais(P.MAX_POR_CONTA - 1) === true,
  '④ dá para cadastrar aparelhos até o teto');
ok(P.podeCadastrarMais(P.MAX_POR_CONTA) === false,
  '④ ⛔ no teto, para — conta invadida não acumula dezenas de chaves que a pessoa não reconhece');

// ── ⑤ O QUE SE GUARDA — e o que NÃO ──────────────────────────────────────────
const reg = P.registroDaCredencial({ credentialId: 'abc', publicKey: 'PUB', counter: 3,
  transports: ['internal', ''], deviceType: 'multiDevice', backedUp: true }, '2026-09-25T00:00:00.000Z');
ok(reg.publicKey === 'PUB' && reg.counter === 3, '⑤ guarda a chave PÚBLICA e o contador');
ok(JSON.stringify(reg.transports) === '["internal"]', '⑤ e limpa entrada vazia da lista de transportes');
ok(reg.backedUp === true && reg.deviceType === 'multiDevice',
  '⑤ guarda se a chave SINCRONIZA — é o que diz se trocar de aparelho mantém a entrada');
ok(Object.keys(reg).indexOf('privateKey') === -1,
  '⑤ ⛔ e não existe campo de chave privada: ela nunca sai do aparelho da pessoa');

// ── ⑥ AS QUATRO CORREÇÕES DA REVISÃO, cada uma com o defeito nomeado ─────────
/* ⛔ Os quatro foram achados na revisão de 25/set/2026 e cada um tornava a entrada sem senha inútil
 * ou insegura. Ficam travados aqui para não voltarem. */
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const cli = fs.readFileSync(path.join(ROOT, 'js', 'views', 'passkey.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const auth = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');

/* ① O transporte RECUSAVA sem login — as duas etapas da entrada eram CÓDIGO MORTO, nunca chegariam
 * ao servidor. A entrada é, por natureza, de quem ainda não entrou. */
ok(/!user && !msgs\.semLogin/.test(dbjs),
  '⑥① ⛔⛔ o transporte aceita chamada DESLOGADA quando a porta pede — sem isso a entrada era código morto');
ok((cli.match(/semLogin: true/g) || []).length >= 2,
  '⑥① e as DUAS etapas da entrada pedem isso explicitamente');

/* ② O desafio era lido e só depois queimado: duas chamadas paralelas leem "não usado" AS DUAS. */
ok(/_passkeyQueimarDesafio/.test(idx) && /runTransaction/.test(idx),
  '⑥② ⛔⛔ o desafio é queimado em TRANSAÇÃO — ler-e-depois-gravar deixava duas chamadas passarem juntas');
ok(!/await dRef\.update\(\{ usadoEm/.test(idx),
  '⑥② e a queima fora de transação não existe mais');

/* ③ O contador tinha a MESMA corrida. */
ok(/const avancou = await db\.runTransaction/.test(idx),
  '⑥③ ⛔ o contador também avança em transação — é a mesma corrida do desafio');

/* ④ O abortador da oferta estava DEFINIDO e nunca chamado. Definir sem ligar é não ter. */
const chamadas = (auth.match(/_passkeyPararOferta/g) || []).length + (ui.match(/_passkeyPararOferta/g) || []).length;
ok(chamadas >= 4,
  '⑥④ ⛔⛔ a oferta é abortada nos caminhos alternativos e no fechar da tela — achei ' + chamadas + ' pontos');
ok(/modalId === 'modal-login'/.test(ui),
  '⑥④ ⭐ inclusive ao FECHAR a tela, que cobre o X, o toque fora e o Esc — os que não passam por botão');

/* ⑤ A porta pública não tinha teto nem prazo. */
/* ⛔ O TEXTO DESTA ASSERÇÃO ESTAVA ERRADO e o verde escondia a mentira: eu escrevia que
 * `maxInstances` "protegia" a porta pública. Ele limita CONCORRÊNCIA, não requisições — dez
 * instâncias atendem um laço infinito com folga. O teto de verdade são os dois baldes do ⑦②. */
ok(/maxInstances: 10/.test(idx),
  '⑥⑤ a porta pública limita CONCORRÊNCIA (não é teto de chamadas — ver ⑦②)');
ok((idx.match(/expiraEm: new Date/g) || []).length >= 1,
  '⑥⑤ e a queima morre sozinha, senão cada entrada deixaria lixo para sempre');

/* ══════════════════════════════════════════════════════════════════════════════
 * ⑦ OS TRÊS DEFEITOS DA REVISÃO DE 25/set/2026 — e os três eram caminho de ataque,
 *   não arrumação. Nenhum deles aparecia olhando o caminho felizão.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ① CREDENCIAL DE OUTRO DONO ERA SOBRESCRITA. O id do documento é o id da credencial, e ele vem DO
 * PEDIDO. Eu gravava com `set` sem olhar quem era o dono ⇒ apresentar um id existente reassociava
 * aquela credencial à conta de quem chamou. Como a ENTRADA descobre o uid por este mesmo documento,
 * a chave da outra pessoa passaria a abrir a conta do atacante — e a dela deixaria de abrir a própria.
 * ⚠️ A decisão foi TIRADA de dentro da transação justamente para poder ser conferida aqui de verdade,
 * e não por leitura de fonte. */
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: false, quantasJaTem: 0 }) === 'ok',
  '⑦① aparelho novo em conta vazia: entra');
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: true, donoAtual: 'u1', quantasJaTem: 9 }) === 'ok',
  '⑦① ⭐ recadastrar o MESMO aparelho é atualização — não consome vaga nem bate no teto');
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: true, donoAtual: 'u2', quantasJaTem: 0 }) === 'outro-dono',
  '⑦① ⛔⛔ credencial que JÁ TEM outro dono é RECUSADA — sobrescrever entregava a conta alheia');
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: true, donoAtual: 'u2', quantasJaTem: 0 }) !== 'ok',
  '⑦① e a recusa não depende de teto: mesmo com a conta vazia, não passa');
/* ⛔⛔ MAS DONO MORTO NÃO É DONO — o contrário criava um beco sem saída. Se a limpeza da exclusão de
 * conta falhar (ela é tolerante a falha, para não travar a saída da pessoa), a credencial fica órfã e
 * bloquearia PARA SEMPRE o cadastro do MESMO aparelho numa conta nova. */
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: true, donoAtual: 'u2', donoVivo: false, quantasJaTem: 0 }) === 'ok',
  '⑦① ⛔⛔ credencial de conta MORTA pode ser retomada — senão o aparelho da pessoa é recusado para sempre');
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: true, donoAtual: 'u2', donoVivo: true, quantasJaTem: 0 }) === 'outro-dono',
  '⑦① ⭐ e conta VIVA continua protegida: a retomada vale só para lápide e conta excluída');
ok(/donoVivo: donoVivo/.test(idx) && /dd\.deleted !== true && !dd\.mergedInto/.test(idx),
  '⑦① ⛔ e quem mede se o dono está vivo é o servidor, dentro da transação');
/* ⛔ E A QUEIMA VENCIDA É VARRIDA POR CÓDIGO VERSIONADO, não por política de console. */
ok(/passkeyChallenges"\)\.where\("expiraEm", "<", now\)/.test(idx),
  '⑦① ⛔⛔ a queima vencida é apagada pela varredura do repo — "morre sozinho" exigia TTL que não existia');
ok(P.decidirCadastro({ uid: 'u1', credencialExiste: false, quantasJaTem: P.MAX_POR_CONTA }) === 'teto',
  '⑦① no teto, aparelho NOVO não entra');
ok(P.decidirCadastro({ uid: '', credencialExiste: false, quantasJaTem: 0 }) === 'sem-uid',
  '⑦① e sem uid não se decide nada');
/* ⛔ A transação é onde a decisão VALE: sem ela, duas conclusões paralelas leem o mesmo estado. */
/* ⛔ RECORTE PELO PRÓPRIO IDENTIFICADOR, não por distância. A primeira versão desta asserção usava
 * uma janela de 900 caracteres entre a transação e a decisão — e ficou VERMELHA sozinha quando o
 * bloco cresceu, sem nada ter quebrado. Distância fixa não é âncora. */
const _blocoCadastra = (idx.match(/exports\.concluirCadastroDePasskey[\s\S]*?\n\);/) || [''])[0];
ok(_blocoCadastra.length > 500, '⑦① o bloco do cadastro foi achado pelo próprio identificador');
ok(_blocoCadastra.indexOf('runTransaction') > 0 &&
   _blocoCadastra.indexOf('_passkey.decidirCadastro(') > _blocoCadastra.indexOf('runTransaction'),
  '⑦① ⛔ e a porta consulta esta decisão DENTRO da transação');

/* ② O TETO POR ORIGEM NÃO ERA TETO, E O GLOBAL TROUXE PROBLEMA PRÓPRIO — as duas tentativas caíram
 * na 3ª rodada de revisão, e a terceira resposta foi TIRAR A GRAVAÇÃO da porta pública. O que se trava
 * aqui é a ausência: nenhum documento é escrito por quem só pede o desafio. */
const _blocoInicia = (idx.match(/exports\.iniciarEntradaPorPasskey[\s\S]*?\n\);/) || [''])[0];
ok(_blocoInicia.length > 300, '⑦② o bloco da porta pública foi achado pelo próprio identificador');
ok(!/\.set\(|\.update\(|\.add\(|runTransaction/.test(_blocoInicia),
  '⑦② ⛔⛔ a porta PÚBLICA não grava NADA — um laço de um milhão de chamadas não cria um documento');
ok(!/x-forwarded-for/.test(_blocoInicia) && !/passkeyRateLimit/.test(idx),
  '⑦② ⛔ e o teto falso baseado em cabeçalho do chamador não existe mais em lugar nenhum');
ok(/cunharDesafio\("entrada", null/.test(_blocoInicia),
  '⑦② ⭐ o desafio é cunhado com tipo e hora dentro — é o que dispensa guardá-lo');
ok(/randomBytes\(32\)/.test(_blocoInicia),
  '⑦② e com 32 bytes de aleatório: desafio adivinhável não é desafio');
/* ⛔ A QUEIMA é o que restou de estado, e a ORDEM dela é a parte que importa. */
const _blocoConclui = (idx.match(/exports\.concluirEntradaPorPasskey[\s\S]*?\n\);/) || [''])[0];
ok(/verifyAuthenticationResponse[\s\S]*_passkeyQueimarDesafio/.test(_blocoConclui),
  '⑦② ⛔⛔ a queima vem DEPOIS de conferir a assinatura — antes, qualquer um queimaria o desafio de outra pessoa com lixo');
ok(/runTransaction[\s\S]{0,400}snap\.exists\) return \{ ok: false, motivo: "ja-usado"/.test(idx),
  '⑦② ⛔ e a queima é TRANSACIONAL: duas apresentações iguais em paralelo disputam o mesmo documento');
ok(/expiraEm: new Date\(Date\.now\(\) \+ 10 \* _passkey\.DESAFIO_VALE_MS\)/.test(idx),
  '⑦② ⭐ e a queima vive MAIS que o desafio: se morresse antes, a repetição tardia não acharia a queima');

/* ③ AS CHAVES FICAVAM DEPOIS DE APAGAR A CONTA. A chave parava de entrar (o perfil virou lápide),
 * mas chave pública, marca do aparelho e contador ficavam guardados para sempre — dado de quem
 * pediu para sair, em coleção que ninguém revisita. E o id continuava ocupado. */
const _blocoExcluir = (idx.match(/exports\.deleteAccount[\s\S]*?\n\);/) || [''])[0];
ok(_blocoExcluir.length > 500, '⑦③ o bloco da exclusão de conta foi achado pelo próprio identificador');
ok(/_batchDeleteQuery\(db\.collection\(_PASSKEYS\)\.where\("uid", "==", uid\)\)/.test(_blocoExcluir),
  '⑦③ ⛔⛔ apagar a conta apaga as chaves de acesso dela — por uid, não uma a uma');
ok(/faceTemplates/.test(_blocoExcluir),
  '⑦③ ⭐ junto do vetor do rosto, que já saía: as duas são biometria/credencial da mesma pessoa');

/* ══════════════════════════════════════════════════════════════════════════════
 * ⑧ O CICLO REAL DO DESAFIO, CONFERIDO CONTRA A BIBLIOTECA — não contra mim mesmo.
 *
 * ⛔⛔ Eu escrevi o par cunhar/ler codificando dos DOIS lados. O desafio voltava codificado DUAS
 * vezes, `lerDesafio` recusava tudo por "formato" e a entrada por passkey não funcionava para
 * NINGUÉM — e um teste que só chamasse as minhas duas funções uma contra a outra passaria igual.
 * A pegadinha é da biblioteca: `generateAuthenticationOptions({challenge: 'abc'})` NÃO manda 'abc',
 * manda `base64url('abc')`. Só medindo a volta isso aparece.
 * ⚠️ Por isso a SAÍDA do processo mora aqui, no fim do bloco assíncrono: fechar antes encerraria o
 * teste sem rodar estas asserções, e o verde não valeria nada.
 * ════════════════════════════════════════════════════════════════════════════ */
const _lib = require(path.join(ROOT, 'functions', 'node_modules', '@simplewebauthn', 'server'));
(async () => {
  const opcoes = await _lib.generateAuthenticationOptions({
    rpID: P.DOMINIO, userVerification: 'required',
    challenge: P.cunharDesafio('entrada', null, Date.now(), RND),
  });
  /* O que o aparelho assina e devolve dentro do clientDataJSON é exatamente `opcoes.challenge`. */
  const resposta = { response: { clientDataJSON: Buffer.from(
    JSON.stringify({ challenge: opcoes.challenge, type: 'webauthn.get' }), 'utf8').toString('base64url') } };
  const lido = P.desafioDaResposta(resposta);
  ok(lido === opcoes.challenge,
    '⑧ ⭐⭐ o desafio lido da RESPOSTA é o mesmo que vai como `expectedChallenge` — é o ciclo real');
  ok(P.desafioServeParaUso(lido, 'entrada', null, Date.now()).ok === true,
    '⑧ ⛔⛔ e o que volta da biblioteca AINDA é legível por nós — foi aqui que a dupla codificação matava tudo');

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
  process.exit(fail ? 1 : 0);
})();

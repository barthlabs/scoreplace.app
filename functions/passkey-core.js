'use strict';

/* ⛔⛔ DECISÕES PURAS DO PASSKEY — sem rede, sem Firestore, sem Auth.
 *
 * Por que passkey existe aqui: medido em 25/set/2026, 4 dos 9 pares de conta duplicada são
 * Apple + Google — gente que voltou, não achou a própria conta e criou outra. O caminho de hoje é
 * "três botões de entrada, chuta". Passkey tira passos: a chave é DESCOBRÍVEL, então a pessoa não
 * digita nome nem e-mail, e a pergunta "qual conta eu usei" deixa de existir.
 *
 * ⛔ A CONFERÊNCIA DA ASSINATURA NÃO MORA AQUI, e é de propósito: ela é análise de estrutura binária
 * e de assinatura, e vive na biblioteca. O que mora aqui são as decisões que erram em silêncio se
 * ficarem espalhadas — origem aceita, uso único do desafio, e o contador.
 */

/* ⛔ ORIGENS ACEITAS: lista fechada. Aceitar qualquer origem é aceitar que um site alheio peça a
 * assinatura e entre na conta da pessoa — é o ataque que o campo `origin` existe para barrar. */
const ORIGENS = ['https://scoreplace.app', 'https://www.scoreplace.app'];
/* O domínio da chave. ⚠️ Mudar isto INVALIDA todo passkey já cadastrado: a chave é presa ao
 * domínio, por desenho do padrão. Não é constante decorativa. */
const DOMINIO = 'scoreplace.app';
/* Prazo do desafio. Curto porque desafio é de uso único e só precisa durar o gesto da pessoa. */
const DESAFIO_VALE_MS = 5 * 60 * 1000;

function texto(v) { return v == null ? '' : String(v).trim(); }

/** A origem que chegou é uma das nossas? */
function origemAceita(origem) {
  return ORIGENS.indexOf(texto(origem)) !== -1;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * O DESAFIO NÃO É GUARDADO — ELE SE CARREGA. Reescrito em 25/set/2026, na 3ª revisão da leva.
 *
 * ⛔⛔ O DESENHO ANTERIOR ERA UM CONVITE À CONTA DE LUZ, e não tinha conserto por cima. A porta que
 * entrega o desafio é PÚBLICA por natureza (é a porta de quem ainda não entrou) e ela GRAVAVA um
 * documento por chamada. Sem login, sem App Check, um laço simples virava gravação sem fim.
 * ⭐ Tentei tapar com teto por origem e ERREI FEIO: a "origem" saía de `x-forwarded-for`, que é
 * escrito por QUEM CHAMA — trocar o valor a cada chamada dava um balde novo por tentativa. Depois pus
 * um balde global e ele trouxe problema próprio: um só documento recebendo toda a escrita do mundo é
 * contenção, e ainda deixava um abusador fechar a entrada de todos ao encher o balde.
 *
 * ⇒ A saída não é um teto melhor, é NÃO GRAVAR. O desafio passa a carregar o que precisamos saber
 * (tipo, conta e HORA), e a porta pública fica com ZERO leitura e ZERO gravação: um laço de um milhão
 * de chamadas não cria um documento nem custa um centavo de banco.
 *
 * ⛔ E O QUE SUSTENTA A SEGURANÇA, DITO SEM INFLAR:
 *   · REPETIÇÃO (o ataque que importa: capturar uma assinatura e reapresentá-la) é barrada pela
 *     QUEIMA — um documento por desafio, gravado DEPOIS de a assinatura ser conferida. Assinatura
 *     inválida não grava nada, então lixo não custa escrita;
 *   · a HORA dentro do desafio limita a janela de quem capturou o gesto;
 *   · a ORIGEM e o DOMÍNIO continuam conferidos pela própria biblioteca (o navegador assina os dois
 *     junto do desafio), e é isso que impede assinatura obtida em outro site de valer aqui.
 *
 * ⚠️ O QUE ISTO NÃO DÁ, e não vou escrever que dá: sem segredo para assinar, o desafio não PROVA que
 * saiu daqui — quem chama pode inventar um, inclusive com hora mentida. Isso não entrega nada a
 * ninguém: para qualquer desafio, ainda é preciso a chave privada do aparelho da pessoa, que nunca sai
 * de lá. O que se perde é poder confiar na hora contra quem controla o próprio cliente — e contra esse
 * a defesa é a queima, que é do servidor.
 * ⚠️ O mecanismo padrão para fechar a porta pública de verdade é App Check. Ele NÃO existe neste
 * projeto, exige passo de infraestrutura que é do dono, e continua nomeado aqui como a saída certa.
 * ════════════════════════════════════════════════════════════════════════════════════════════ */

/* ⛔⛔ CUNHAR E LER NÃO SÃO INVERSAS, E ISSO É DA BIBLIOTECA, NÃO DESCUIDO — medido em 25/set/2026.
 * `generateAuthenticationOptions({ challenge: 'abc' })` NÃO manda 'abc': ela trata a string como
 * BYTES e devolve `base64url('abc')`. O navegador põe no `clientDataJSON` exatamente o que recebeu.
 * ⇒ Então o que sai daqui é o texto CRU, e o que volta do aparelho é esse texto em base64url.
 * ⚠️ Eu já escrevi este par codificando dos dois lados: o desafio voltava codificado DUAS vezes e
 * `lerDesafio` recusava tudo por "formato" — a entrada por passkey não funcionava para ninguém, e o
 * teste que só chamava as duas funções minhas passava. Por isso o teste do ciclo usa a biblioteca DE
 * VERDADE: par de funções conferido contra si mesmo não prova nada. */

/** Cunha o desafio CRU (é o que vai para a biblioteca). `aleatorio` vem de fora para ficar pura. */
function cunharDesafio(tipo, uid, agoraMs, aleatorio) {
  const t = tipo === 'cadastro' ? 'c' : 'e';
  return [t, texto(uid) || '-', Number(agoraMs || 0).toString(36), texto(aleatorio)].join('~');
}

/** Lê o desafio COMO ELE VOLTA do aparelho (base64url). Nunca lança: torto é recusa, não erro. */
function lerDesafio(b64) {
  try {
    const partes = Buffer.from(texto(b64), 'base64url').toString('utf8').split('~');
    if (partes.length !== 4) return { ok: false, motivo: 'formato' };
    const t = partes[0];
    if (t !== 'e' && t !== 'c') return { ok: false, motivo: 'tipo' };
    const emMs = parseInt(partes[2], 36);
    if (!isFinite(emMs) || emMs <= 0) return { ok: false, motivo: 'sem-hora' };
    /* ⛔ Aleatório curto seria desafio adivinhável — recusa, não aviso. */
    if (texto(partes[3]).length < 32) return { ok: false, motivo: 'aleatorio-curto' };
    return { ok: true, tipo: t === 'c' ? 'cadastro' : 'entrada',
      uid: partes[1] === '-' ? null : partes[1], emMs: emMs };
  } catch (e) { return { ok: false, motivo: 'ilegivel' }; }
}

/**
 * O desafio apresentado serve para ESTE uso?
 * ⛔ QUATRO RECUSAS, e cada uma já foi vulnerabilidade em sistema real:
 *   · ilegível/torto — não é desafio;
 *   · TIPO errado — desafio de cadastro não entra, e desafio de entrada não cadastra;
 *   · de OUTRA CONTA — no cadastro, a conta vai dentro do desafio e tem de ser a de quem chama;
 *   · VENCIDO — limita a janela de quem capturou o gesto.
 * ⚠️ A quinta recusa, "JÁ USADO", NÃO mora aqui: ela é do servidor, porque depende de estado. Ver a
 * queima, e ver acima por que ela é o que sustenta o desenho.
 */
function desafioServeParaUso(b64, tipoEsperado, uidEsperado, agoraMs) {
  const lido = lerDesafio(b64);
  if (!lido.ok) return { ok: false, motivo: lido.motivo };
  if (lido.tipo !== (tipoEsperado === 'cadastro' ? 'cadastro' : 'entrada')) {
    return { ok: false, motivo: 'tipo-errado' };
  }
  if (texto(uidEsperado) && lido.uid !== texto(uidEsperado)) {
    return { ok: false, motivo: 'de-outra-conta' };
  }
  const dt = Number(agoraMs || 0) - lido.emMs;
  if (dt > DESAFIO_VALE_MS) return { ok: false, motivo: 'vencido' };
  if (dt < -60000) return { ok: false, motivo: 'futuro' };          // relógio torto
  return { ok: true, motivo: null, lido: lido };
}

/**
 * O desafio que o APARELHO assinou, tirado de dentro da resposta.
 * ⛔ É DAQUI que o desafio tem de sair, e não do corpo do pedido: este valor está DENTRO do que foi
 * assinado, então mentir nele invalida a assinatura. Aceitar o que o cliente diz "ao lado" seria
 * conferir uma coisa e validar outra.
 */
function desafioDaResposta(resposta) {
  try {
    const cd = resposta && resposta.response && resposta.response.clientDataJSON;
    if (!cd) return '';
    const j = JSON.parse(Buffer.from(texto(cd), 'base64url').toString('utf8'));
    return texto(j.challenge);
  } catch (e) { return ''; }
}

/** Marca do desafio: é o id do documento de queima. Hash porque o desafio é grande e opaco. */
function marcaDoDesafio(b64) {
  return require('crypto').createHash('sha256').update(texto(b64)).digest('hex').slice(0, 40);
}

/**
 * O contador da credencial avançou?
 * ⛔ É A DEFESA CONTRA REUSO DE ASSINATURA. O aparelho incrementa um contador a cada uso; assinatura
 * repetida chega com contador igual ou menor. Quem não confere isto aceita a mesma assinatura duas
 * vezes.
 * ⚠️ Contador ZERO nos dois lados é legítimo e comum: vários aparelhos (incluindo Apple) não
 * implementam contador. Recusar isso trancaria a maioria dos iPhones — o teto é: se o guardado é 0
 * e o novo é 0, passa; se o guardado é maior que zero, o novo tem que ser MAIOR.
 */
function contadorAvancou(guardado, novo) {
  const g = Number(guardado || 0), n = Number(novo || 0);
  if (g === 0 && n === 0) return true;
  return n > g;
}

/** O que se guarda de uma credencial nova. ⛔ Chave PÚBLICA; nunca há chave privada do nosso lado. */
function registroDaCredencial(info, agoraIso) {
  const i = info || {};
  return {
    credentialId: texto(i.credentialId),
    publicKey: texto(i.publicKey),          // base64url
    counter: Number(i.counter || 0),
    transports: Array.isArray(i.transports) ? i.transports.map(texto).filter(Boolean) : [],
    deviceType: texto(i.deviceType) || null, // 'singleDevice' | 'multiDevice' (sincroniza?)
    backedUp: i.backedUp === true,
    criadoEm: texto(agoraIso),
    ultimoUsoEm: null,
  };
}

/**
 * Pode CADASTRAR mais um passkey nesta conta?
 * ⛔ Teto por conta: sem limite, uma conta invadida ganharia dezenas de chaves e a pessoa não teria
 * como saber quais são dela. Com teto, acrescentar exige remover — e remover é ato visível.
 */
const MAX_POR_CONTA = 10;
function podeCadastrarMais(quantasJaTem) {
  return Number(quantasJaTem || 0) < MAX_POR_CONTA;
}

/* ⛔⛔ OS TETOS DE USO SAÍRAM DAQUI, e a razão está escrita em cima, no desenho do desafio: a porta
 * pública não GRAVA mais nada, então não há o que limitar. Teto por origem era falso (a origem é
 * escrita por quem chama) e o teto global era contenção num documento só.
 * ⚠️ Se um dia voltar a existir gravação numa porta sem login, o teto tem de voltar COM ela — e o
 * mecanismo certo é App Check, nomeado acima. */

/* ⛔⛔ A DECISÃO DO CADASTRO MORA AQUI, E NÃO DENTRO DA TRANSAÇÃO — achado na revisão de 25/set/2026.
 * Ela tem três respostas e duas delas são recusa. Enquanto o `if` vivia solto no meio do `runTransaction`,
 * não havia como testar a recusa sem subir emulador, e foi assim que a recusa mais importante (credencial
 * que já tem outro dono) simplesmente NÃO EXISTIA: eu gravava com `set` sobre o documento alheio.
 * ⇒ Separada, ela é função pura e as três respostas são conferidas por teste de verdade.
 * ⚠️ A transação continua sendo indispensável: é ela que garante que o que foi LIDO para decidir ainda
 * vale na hora de gravar. Esta função decide; a transação é onde a decisão vale. */
function decidirCadastro(o) {
  o = o || {};
  const uid = String(o.uid || '');
  if (!uid) return 'sem-uid';
  if (o.credencialExiste === true) {
    /* Recadastrar o MESMO aparelho é atualização: não consome vaga e não bate no teto. */
    if (String(o.donoAtual || '') === uid) return 'ok';
    /* ⛔⛔ DONO MORTO NÃO É DONO. Sem esta linha, uma credencial órfã (conta apagada, limpeza que
     * falhou) bloquearia PARA SEMPRE o cadastro do mesmo aparelho numa conta nova — e quem chega
     * aqui já apresentou a assinatura daquele aparelho. */
    if (o.donoVivo === false) return 'ok';
    return 'outro-dono';
  }
  return podeCadastrarMais(o.quantasJaTem) ? 'ok' : 'teto';
}

module.exports = {
  decidirCadastro,
  ORIGENS, DOMINIO, DESAFIO_VALE_MS, MAX_POR_CONTA,
  origemAceita, contadorAvancou, registroDaCredencial, podeCadastrarMais,
  cunharDesafio, lerDesafio, desafioServeParaUso, desafioDaResposta, marcaDoDesafio,
};

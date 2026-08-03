/* OCULTAR CONTATO EXIGE NOME DE EXIBIÇÃO + VINCULAR PROVEDOR FEDERADO
 * node tests/omit-exige-display-name.test.js
 *
 * POR QUE ESTE TESTE EXISTE (ago/2026):
 *
 * (A) OCULTAR × NOME. O guard antigo (v2.4.4) só barrava o nome que ERA o
 *     contato: "ocultar e-mail" com displayName = e-mail, "ocultar telefone"
 *     com displayName = telefone. Nome GENÉRICO ("Usuário", "teste") ou VAZIO
 *     passava batido — e aí a pessoa que oculta e-mail E telefone fica exibida
 *     como "Usuário" pra todo mundo, inclusive pro organizador na chamada de
 *     presença. Regra do dono: "se a pessoa quiser ocultar nome e email ela tem
 *     que dar display name". O que NÃO muda: ocultar é perante os OUTROS
 *     USUÁRIOS — o sistema segue usando e-mail/telefone (notificação, login).
 *
 *     A 1ª seção roda as funções REAIS: _omitRequiresDisplayName (auth.js) em
 *     cima do _friendlyDisplayName e _isUnfriendlyName (store.js). Ou seja, a
 *     decisão do guard é medida contra o MESMO código que desenha o nome no
 *     app — se um mudar sem o outro, o teste acusa.
 *
 * (B) VINCULAR PROVEDOR. O caso Fernando Cerri (03/ago/2026): entrou com Google
 *     em maio, entrou com Apple usando "Ocultar meu e-mail" em agosto → a Apple
 *     devolveu sr2w8n4yhp@privaterelay.appleid.com, um endereço que não existe
 *     em lugar nenhum da nossa base, então NADA colidiu e nasceu uma 2ª conta.
 *     Ele acabou sorteado num grupo por uma conta e na lista de espera pela
 *     outra. Só a mescla manual resolveu.
 *
 *     A cura é preventiva e é MECANISMO DIFERENTE de linkedEmails/linkedPhones:
 *     aqueles são anotação nossa no Firestore e só resolvem login que termina em
 *     SENHA (quem é só-Google/só-Apple não tem senha → não vira login nenhum).
 *     linkWithPopup grava o vínculo DENTRO do Firebase Auth (providerData), e aí
 *     entrar pelo outro provedor devolve o MESMO uid. Prova de que funciona: 2
 *     contas em produção já têm google.com+apple.com no mesmo uid (Patrícia
 *     Pedreira e Gersom Hideo Otsu — as duas com "Compartilhar meu e-mail", que
 *     fez os endereços colidirem e o link automático disparar).
 *
 *     A 2ª seção é estrutural (o linking só existe dentro do Firebase Auth, não
 *     dá pra exercitar headless): trava a FIAÇÃO que faria a feature sumir sem
 *     ninguém notar — o botão existir, o render ser chamado ao abrir o perfil,
 *     os DOIS sentidos (Google→Apple e Apple→Google) e o tratamento do
 *     credential-already-in-use, que é justamente o estado do Fernando.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const ROOT = path.join(__dirname, '..');
const authSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// ── Carrega as funções REAIS, sem executar os arquivos inteiros ─────────────
function grab(src, name, file) {
  const re = new RegExp('window\\.' + name + ' = function[\\s\\S]*?\\n};');
  const m = src.match(re);
  if (!m) { console.error('✗ window.' + name + ' não encontrado em ' + file); process.exit(1); }
  return m[0];
}
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(
  grab(storeSrc, '_isUnfriendlyName', 'js/store.js') + '\n' +
  grab(storeSrc, '_isSyntheticEmail', 'js/store.js') + '\n' +
  grab(storeSrc, '_friendlyDisplayName', 'js/store.js') + '\n' +
  grab(authSrc, '_omitRequiresDisplayName', 'js/views/auth.js'),
  sandbox
);
const gate = sandbox.window._omitRequiresDisplayName;
const friendly = sandbox.window._friendlyDisplayName;

console.log('──── (A) ocultar contato exige nome de exibição ────');

// O BURACO QUE ESTE TESTE FECHA. Nome genérico + oculta os dois = "Usuário"
// pra todo mundo. O guard antigo deixava passar (o nome não é e-mail nem fone).
{
  const r = gate({ displayName: 'Usuário', email: 'x@y.com', phone: '+5511999998888',
                   phoneCountry: '55', omitEmail: true, omitPhone: true });
  ok(r.blocked === true, 'nome genérico "Usuário" + oculta e-mail e telefone → BLOQUEIA');
  ok(r.reason === 'no-name', 'motivo é no-name (não é o nome-é-contato)');
  // prova de que o bloqueio corresponde à realidade: sem barrar, viraria "Usuário"
  ok(friendly({ displayName: 'Usuário', email: 'x@y.com', phone: '+5511999998888',
                phoneCountry: '55', omitEmail: true, omitPhone: true }) === 'Usuário',
     'e o app REALMENTE exibiria "Usuário" nesse estado');
}
{
  const r = gate({ displayName: '', email: 'x@y.com', phone: '+5511999998888',
                   phoneCountry: '55', omitEmail: true, omitPhone: true });
  ok(r.blocked === true, 'nome VAZIO + oculta os dois → BLOQUEIA');
  ok(r.reason === 'no-name', 'motivo é no-name');
}

// COMPORTAMENTO ANTIGO PRESERVADO (não pode regredir).
{
  const r = gate({ displayName: 'fulano@gmail.com', email: 'fulano@gmail.com', omitEmail: true, omitPhone: false });
  ok(r.blocked === true && r.reason === 'name-is-email', 'nome É o e-mail + ocultar e-mail → BLOQUEIA (regra v2.4.4)');
}
{
  const r = gate({ displayName: '+55 (11) 99999-8888', phone: '+5511999998888',
                   phoneCountry: '55', omitEmail: false, omitPhone: true });
  ok(r.blocked === true && r.reason === 'name-is-phone', 'nome É o telefone + ocultar telefone → BLOQUEIA (regra v2.4.4)');
}

// NÃO PODE BLOQUEAR DEMAIS — ocultar com nome real é legítimo, é o caso normal.
{
  const r = gate({ displayName: 'Fernando Carlos Cerri', email: 'f@g.com', phone: '+5511989068641',
                   phoneCountry: '55', omitEmail: true, omitPhone: true });
  ok(r.blocked === false, 'nome REAL + oculta os dois → LIBERA (privacidade com identidade)');
}
{
  const r = gate({ displayName: 'Fernando Cerri', omitEmail: false, omitPhone: false });
  ok(r.blocked === false, 'sem ocultação nenhuma → nunca bloqueia');
}
{
  const r = gate({ displayName: 'Usuário', email: 'x@y.com', omitEmail: false, omitPhone: false });
  ok(r.blocked === false, 'nome genérico SEM ocultação → não é assunto deste guard');
}
// Só-celular escondendo o e-mail: ainda sobra o telefone como identidade.
{
  const r = gate({ displayName: '', email: '', phone: '+5511999998888',
                   phoneCountry: '55', omitEmail: true, omitPhone: false });
  ok(r.blocked === false, 'conta só-celular ocultando e-mail → LIBERA (o telefone ainda identifica)');
}
// ...mas se esconder o telefone também, acabou a identidade.
{
  const r = gate({ displayName: '', email: '', phone: '+5511999998888',
                   phoneCountry: '55', omitEmail: true, omitPhone: true });
  ok(r.blocked === true, 'a mesma conta ocultando TAMBÉM o telefone → BLOQUEIA');
}
// O sistema NÃO é afetado: ocultar é só exibição. O guard não toca no dado.
{
  const entrada = { displayName: 'Fernando', email: 'f@g.com', phone: '+5511989068641',
                    phoneCountry: '55', omitEmail: true, omitPhone: true };
  const copia = JSON.parse(JSON.stringify(entrada));
  gate(entrada);
  ok(JSON.stringify(entrada) === JSON.stringify(copia), 'o guard é PURO — não altera e-mail/telefone (o sistema segue usando)');
}

console.log('──── (B) vincular Google/Apple no mesmo uid (fiação) ────');

ok(/window\._profileLinkProvider = function/.test(authSrc),
   '_profileLinkProvider existe');
ok(/window\._profileRenderAuthProviders = function/.test(authSrc),
   '_profileRenderAuthProviders existe');
ok(/id="profile-auth-providers"/.test(authSrc),
   'o bloco "Formas de entrar" está no HTML do perfil');
// Sem esta chamada o bloco nasce vazio e a feature fica invisível — foi assim
// que outras seções condicionais viraram "feature não implementada" na v0.16.7.
ok(/_profileRenderAuthProviders === 'function'\) window\._profileRenderAuthProviders\(\)/.test(authSrc),
   'o render é chamado ao popular o perfil (senão o bloco fica vazio)');

// OS DOIS SENTIDOS. O pedido do dono foi explícito: "o inverso também
// funcionaria (de google numa conta apple)".
{
  const m = authSrc.match(/\['google\.com', 'apple\.com'\]\.forEach\(function \(pid\) \{[\s\S]*?\}\);/);
  ok(!!m, 'o render itera os DOIS provedores federados (Google→Apple e Apple→Google)');
  ok(!!m && /if \(have\[pid\]\) return;/.test(m[0]),
     'só oferece o provedor que AINDA NÃO é login desta conta');
}
// linkWithPopup/linkWithCredential = vínculo DENTRO do Auth. Se alguém trocar
// isto por signInWith*, a sessão TROCA de conta em vez de vincular — que é
// exatamente o bug que criou a 2ª conta do Fernando.
ok(/fbU\.linkWithPopup\(provider\)/.test(authSrc), 'usa linkWithPopup (vincula, NÃO troca de sessão)');
ok(/fbU\.linkWithCredential\(cred\)/.test(authSrc), 'no iOS nativo usa linkWithCredential (popup não roda no WebView)');
ok(/linkWithRedirect\(provider\)/.test(authSrc), 'tem fallback de redirect quando o popup é bloqueado');
ok(!/fbU\.signInWith/.test(authSrc), 'NUNCA chama signInWith* no fluxo de vinculação');

// O ESTADO DO FERNANDO: a identidade Apple já pertencia a outro uid. Sem este
// ramo, o botão só dava erro cru e a pessoa ficava presa.
ok(/auth\/credential-already-in-use/.test(authSrc),
   'trata credential-already-in-use (identidade já é de outra conta)');
ok(/window\._profileOfferMergeForCredential = function/.test(authSrc),
   'oferece unir as contas nesse caso, em vez de só falhar');
ok(/dryRun: !!dryRun/.test(authSrc),
   'mostra o que seria movido (dryRun) ANTES de unir — nada é feito às cegas');
ok(/'providerlink'/.test(authSrc),
   'a prova de posse roda em app secundário (não derruba a sessão atual)');
ok(/auth\/provider-already-linked/.test(authSrc),
   'já vinculado não vira erro pro usuário');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' asserções ok, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);

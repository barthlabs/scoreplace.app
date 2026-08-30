/* RESTAURA UM users/{uid} APAGADO, LENDO O PASSADO PELO PITR
 *
 * O CASO (30/ago/2026). O dono viu "…" no lugar de um nome no card do jogo. Medido: o uid
 * daquela pessoa não tinha documento em `users/` — e, conferido no Identity Toolkit contra
 * um uid que eu JÁ SABIA existir, também não tinha conta no Firebase Auth. Ela foi apagada
 * dos DOIS, entre 2026-08-28T07:15:28Z e 07:16:10Z (04:15 em Brasília).
 *
 * ⭐ O QUE SALVOU: o PITR está ligado (7 dias) — [[project_backup_antes_da_transferencia]].
 * Dá pra ler qualquer documento COMO ELE ERA num instante passado, com `?readTime=`. A busca
 * binária entre "existe" e "não existe" achou o minuto do sumiço, e o retrato anterior a ele
 * traz o documento inteiro, com os 49 campos.
 *
 * ⚠️ O QUE O PITR **NÃO** TRAZ: o Firebase Auth não é Firestore. A conta de login (e o hash
 * da senha) não está aqui e não se recupera por este caminho. Este script restaura o PERFIL;
 * a conta de login é assunto à parte.
 *
 * ⭐ SUBCOLEÇÃO NÃO MORRE COM O PAI: as 18 notificações dela seguem lá até hoje, intactas.
 * Apagar um documento no Firestore não desce nas subcoleções — por isso o script confere e
 * NÃO mexe nelas.
 *
 * ⛔ O DOCUMENTO RESTAURADO DECLARA QUE FOI RESTAURADO (`_restauradoEm`/`_restauradoDePITR`).
 * Dado ressuscitado que se passa por original é armadilha pro próximo leitor — inclusive eu.
 *
 * Uso:  node scripts/restaurar-conta-do-pitr.js <uid> <readTimeISO>            (ENSAIO)
 *       node scripts/restaurar-conta-do-pitr.js <uid> <readTimeISO> --aplicar  (grava)
 * Ex.:  node scripts/restaurar-conta-do-pitr.js aune9TtJk… 2026-08-27T22:00:00.000000Z
 */
const { execSync } = require('child_process');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const UID = args[0];
const READ_TIME = args[1];
const APLICAR = process.argv.includes('--aplicar');
if (!UID || !READ_TIME) {
  console.error('uso: node scripts/restaurar-conta-do-pitr.js <uid> <readTimeISO> [--aplicar]');
  process.exit(1);
}

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const tok = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
const DOC = BASE + '/users/' + UID;

(async () => {
  /* ① O PRESENTE: só restauro o que está REALMENTE ausente. Sobrescrever um perfil vivo com
   * um retrato de dias atrás é perda de dado disfarçada de conserto. */
  const agora = await fetch(DOC, { headers: H });
  if (agora.status === 200) {
    /* ⭐ UMA exceção, e só uma: reescrever por cima de uma restauração MINHA. Ela existe
     * porque eu errei — restaurei o retrato de 22:00 do dia anterior, que é ANTERIOR à
     * fusão da conta e portanto SEM a lápide `mergedInto`: aquilo ressuscitava a duplicata
     * que a fusão tinha acabado de resolver. O retrato certo é o do instante imediatamente
     * anterior à exclusão. Corrigir isso exige gravar por cima — mas NUNCA por cima de um
     * perfil que a pessoa usa. `_restauradoEm` é o que separa os dois casos.
     * [[project_lapide_mergedinto_e_carga_nao_lixo]] */
    const atual = await agora.json();
    const ehRestauracaoMinha = !!(atual.fields && atual.fields._restauradoEm);
    if (!ehRestauracaoMinha) {
      console.error('⛔ ABORTADO: users/' + UID + ' EXISTE hoje e NÃO é restauração minha. Não sobrescrevo perfil vivo.');
      process.exit(1);
    }
    console.log('presente : users/' + UID + ' é uma restauração minha de ' +
      atual.fields._restauradoEm.stringValue + ' — vou corrigi-la ✔');
  } else if (agora.status !== 404) {
    console.error('⛔ ABORTADO: leitura do presente devolveu HTTP ' + agora.status + ' — não decido sobre isso.');
    process.exit(1);
  } else {
    console.log('presente : users/' + UID + ' NÃO existe (404) ✔');
  }

  /* ② O PASSADO */
  const r = await fetch(DOC + '?readTime=' + encodeURIComponent(READ_TIME), { headers: H });
  const passado = await r.json();
  if (passado.error) {
    console.error('⛔ ABORTADO: o PITR não tem retrato em ' + READ_TIME + ' — ' + passado.error.message);
    process.exit(1);
  }
  const campos = passado.fields || {};
  const n = Object.keys(campos).length;
  console.log('passado  : retrato de ' + READ_TIME + ' tem ' + n + ' campos');
  console.log('           criado em ' + passado.createTime + ', última alteração ' + passado.updateTime);
  /* ⛔ Retrato vazio é a assinatura de leitura que falhou, não de perfil vazio: ninguém tem
   * conta com zero campo. Recusar aqui é o mesmo princípio do reparo de W.O. */
  if (n < 5) {
    console.error('⛔ ABORTADO: retrato com ' + n + ' campo(s) — isso é leitura falha, não perfil.');
    process.exit(1);
  }
  const pega = (k) => (campos[k] && campos[k].stringValue) || '(sem)';
  console.log('\n  displayName :', pega('displayName'));
  console.log('  email       :', pega('email'));
  console.log('  phone       :', pega('phone'));
  console.log('  authProvider:', pega('authProvider'));
  console.log('  createdAt   :', pega('createdAt'));

  /* ③ As subcoleções sobrevivem à exclusão do pai — confiro e NÃO toco. */
  const nt = await (await fetch(DOC + '/notifications?pageSize=300', { headers: H })).json();
  console.log('\n  notificações que sobreviveram (não serão tocadas):', (nt.documents || []).length);

  const fields = Object.assign({}, campos, {
    _restauradoEm: { stringValue: new Date().toISOString() },
    _restauradoDePITR: { stringValue: READ_TIME }
  });

  if (!APLICAR) {
    console.log('\n▸ ENSAIO — nada foi gravado. Rode com --aplicar pra valer.');
    return;
  }
  const w = await fetch(DOC, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  const j = await w.json();
  if (j.error) { console.error('⛔ ERRO ao gravar:', j.error.message); process.exit(1); }
  console.log('\n✅ users/' + UID + ' restaurado (' + Object.keys(fields).length + ' campos).');
  console.log('⚠️  A CONTA DE LOGIN (Firebase Auth) continua ausente — o PITR não a cobre.');
})().catch((e) => { console.error('⛔ ERRO:', e.message); process.exit(1); });

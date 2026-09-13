#!/usr/bin/env node
/* TIRA O TELEFONE DIGITADO PELO ORGANIZADOR QUANDO O NÚMERO JÁ TEM DONO.
 *
 * ⛔ O QUE ISTO CONSERTA. MEDIDO em 13/set/2026: **4 telefones aparecem em DUAS contas
 * VIVAS**. Em todos os quatro o padrão é o mesmo — numa conta o número foi digitado pelo
 * ORGANIZADOR (para o WhatsApp da pessoa ser alcançado), na outra ele é a IDENTIDADE de
 * alguém. A pessoa fica com dois cadastros: os resultados se dividem e o convite vai para a
 * metade errada.
 *
 * ⭐ Ordem do dono (13/set/2026): _"o telefone digitado pelo organizador só deve existir
 * enquanto a pessoa nao autenticou seu telefone. depois que ela autenticou seu telefone o
 * registro do organizador fica superado."_ Este script aplica isso ao que já está gravado.
 *
 * ⛔ E SÓ APAGA O REGISTRO DO ORGANIZADOR. O número de quem provou fica intacto; nenhuma
 * conta é apagada, nenhuma é unida — unir conta é outra decisão, e mexe em seis lugares.
 *
 * ⛔⛔ ESTE SCRIPT NÃO DEVE SER APLICADO COMO ESTÁ — e o ensaio é que mostrou isso.
 *
 * Rodado em seco em 13/set/2026, os 4 pares saíram assim:
 *     tirar de Carolina Lôbo          → o "dono" é uma conta chamada "+5511930038956"
 *     tirar de Cadú Bueno             → o "dono" é uma conta SEM NOME
 *     tirar de FABIANA VIEIRA         → o "dono" é "Val"
 *     tirar de DEBORAH MONTEIRO       → o "dono" é "Deborah Perestrello Monteiro"
 *
 * Ou seja: em três dos quatro, a conta que FICARIA com o número é a VAZIA. Apagar o registro
 * da conta NOMEADA tiraria o WhatsApp exatamente de onde o organizador o enxerga, e deixaria
 * o número numa conta fantasma. O oposto do que a regra quer.
 *
 * ⭐ A REGRA DO DONO É SOBRE A MESMA CONTA: quando a pessoa autentica o telefone DELA, o
 * registro do organizador NAQUELA conta fica superado — e isso já está feito, na porta única
 * (`apagarCarimboDeTerceiro`). Aqui o número está em contas DIFERENTES: isso é CADASTRO
 * DUPLICADO, e a saída é UNIR as duas, não apagar o contato de uma.
 *
 * ⚠️ O script fica como MEDIDOR (ensaio). O `--apply` recusa, de propósito: quem for unir
 * essas contas tem de decidir caso a caso qual sobrevive, e unir mexe em seis lugares.
 * [[project_fusao_indevida_cilone]]
 *
 * Uso:  node scripts/limpar-contato-duplicado.js     (ensaio — é o único modo)
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = false;   // ⛔ ver o cabeçalho: o ensaio provou que apagar é o lado errado
if (process.argv.includes('--apply')) {
  console.error('\n⛔ `--apply` está desligado de propósito. O ensaio mostrou que, em 3 dos 4');
  console.error('   pares, a conta que ficaria com o número é a VAZIA — apagar o registro da');
  console.error('   conta NOMEADA tiraria o WhatsApp de onde o organizador o enxerga.');
  console.error('   Isto é cadastro DUPLICADO: a saída é unir as contas, caso a caso.\n');
  process.exit(1);
}

(async () => {
  const u = await db.collection('users').get();
  const por = {};
  u.forEach((d) => {
    const v = d.data() || {};
    if (v.mergedInto) return;                       // lápide não disputa dono
    const t = String(v.phone || '').replace(/\D/g, '');
    if (t.length < 10) return;
    (por[t] = por[t] || []).push({ id: d.id, v });
  });

  let pares = 0, limpar = 0, ambiguos = 0;
  for (const tel of Object.keys(por)) {
    const contas = por[tel];
    if (contas.length < 2) continue;
    pares++;
    const doOrg = contas.filter((c) => String(c.v.phoneSource || '') === 'organizer');
    const proprios = contas.filter((c) => String(c.v.phoneSource || '') !== 'organizer');
    /* ⛔ SÓ AGE NO CASO CLARO: alguém DONO e alguém com registro do organizador. Se os dois
     * forem do organizador, ou os dois forem próprios, não há o que superar — e adivinhar
     * qual apagar seria escolher por conta da pessoa. */
    if (!doOrg.length || !proprios.length) {
      ambiguos++;
      console.log('  ⚠️ …' + tel.slice(-4) + ' AMBÍGUO — ' + contas.length + ' contas, ' +
        doOrg.length + ' do organizador. Não toco.');
      continue;
    }
    for (const c of doOrg) {
      limpar++;
      const nome = c.v.displayName || '(sem nome)';
      console.log('  · …' + tel.slice(-4) + '  tirar de ' + c.id.slice(0, 10) + '… (' + nome + ')' +
        '  — o dono é ' + proprios[0].id.slice(0, 10) + '… (' + (proprios[0].v.displayName || '(sem nome)') + ')');
      if (APLICAR) {
        const del = admin.firestore.FieldValue.delete();
        await db.collection('users').doc(c.id).update({
          phone: del, phoneCountry: del, phoneSource: del, phoneSetBy: del, phoneSetAt: del,
        });
      }
    }
  }
  console.log('\npares com o mesmo telefone: ' + pares + '  |  registros de organizador a tirar: ' +
    limpar + '  |  ambíguos (não tocados): ' + ambiguos);
  if (!APLICAR) console.log('\n(ENSAIO — nada gravado. Rode com --apply)');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });

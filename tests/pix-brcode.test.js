'use strict';
const assert = require('assert');
const Pix = require('../js/domain/pix-brcode.js');
const qrcode = require('../js/domain/vendor/qrcode-generator-2.0.4.js');
const fs = require('fs');
const path = require('path');

// Vetor oficial do Manual de Padrões para Iniciação do Pix, seção 2.6.3:
// https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
assert.strictEqual(Pix.build('123e4567-e12b-12d1-a456-426655440000', 0, 'Fulano de Tal', 'BRASILIA'),
  '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
const paid = Pix.build('123e4567-e12b-12d1-a456-426655440000', 18700, 'Fulano de Tal', 'BRASILIA');
assert(paid.includes('5406187.00'));
assert(/6304[0-9A-F]{4}$/.test(paid));
assert.throws(() => Pix.build('a'.repeat(78), 100), /Chave Pix/);
assert.throws(() => Pix.build('pix@example.com', 100), /Nome do recebedor/);
const localQr = qrcode(0, 'M');
localQr.addData(paid);
localQr.make();
assert(localQr.getModuleCount() > 0);
assert(/^data:image\/gif;base64,/.test(localQr.createDataURL(4, 12)));
const paymentUi = fs.readFileSync(path.join(__dirname, '../js/views/tournament-registration-payment.js'), 'utf8');
assert(paymentUi.includes("script.src = 'js/domain/vendor/qrcode-generator-2.0.4.js"));
assert(!paymentUi.includes('_qrCodeUrl') && !paymentUi.includes('api.qrserver.com'),
  'chave e valor Pix não devem ser enviados ao serviço externo de QR');
console.log('BR Code Pix: vetor oficial, valor e limites OK.');

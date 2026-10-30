(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ScoreplacePixBRCode = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function field(id, value) {
    var text = String(value);
    if (text.length > 99) throw new Error('Campo Pix acima do limite.');
    return id + String(text.length).padStart(2, '0') + text;
  }
  function receiverText(value, max, label) {
    var text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 .-]/g, '').trim();
    if (!text || text.length > max) throw new Error(label + ' Pix inválido.');
    return text;
  }
  function build(key, amountCents, name, city) {
    var pixKey = String(key || '').trim();
    if (!pixKey || pixKey.length > 77 || !/^[\x20-\x7e]+$/.test(pixKey)) throw new Error('Chave Pix inválida.');
    if (!Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > 100000000) throw new Error('Valor Pix inválido.');
    var receiver = receiverText(name, 25, 'Nome do recebedor');
    var town = receiverText(city, 15, 'Cidade do recebedor');
    var body = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', pixKey))
      + field('52', '0000') + field('53', '986');
    if (amountCents > 0) body += field('54', (amountCents / 100).toFixed(2));
    body += field('58', 'BR') + field('59', receiver) + field('60', town)
      + field('62', field('05', '***')) + '6304';
    var crc = 0xffff;
    for (var i = 0; i < body.length; i++) {
      crc ^= body.charCodeAt(i) << 8;
      for (var bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
    return body + crc.toString(16).toUpperCase().padStart(4, '0');
  }
  return { build:build };
});

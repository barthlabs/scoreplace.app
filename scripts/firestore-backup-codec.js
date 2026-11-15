'use strict';

// JSON tipado para backup administrativo. Valores que não sabemos restaurar
// interrompem a migração ANTES da transação, em vez de virar objeto comum.
function makeCodec(admin, db) {
  const Timestamp = admin.firestore.Timestamp;
  const GeoPoint = admin.firestore.GeoPoint;
  const DocumentReference = admin.firestore.DocumentReference;
  function encode(value) {
    if (value === null || typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean') return value;
    if (value instanceof Timestamp) return { type: 'Timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
    if (value instanceof GeoPoint) return { type: 'GeoPoint', latitude: value.latitude, longitude: value.longitude };
    if (DocumentReference && value instanceof DocumentReference) return { type: 'DocumentReference', path: value.path };
    if (Buffer.isBuffer(value)) return { type: 'Bytes', base64: value.toString('base64') };
    if (value instanceof Date) return { type: 'Date', iso: value.toISOString() };
    if (Array.isArray(value)) return { type: 'Array', items: value.map(encode) };
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      return { type: 'Map', entries: Object.entries(value).map(([key, item]) => [key, encode(item)]) };
    }
    throw new Error('Tipo Firestore não suportado no backup: ' + Object.prototype.toString.call(value));
  }
  function decode(value) {
    if (value === null || typeof value !== 'object') return value;
    switch (value.type) {
      case 'Timestamp': return new Timestamp(value.seconds, value.nanoseconds);
      case 'GeoPoint': return new GeoPoint(value.latitude, value.longitude);
      case 'DocumentReference': return db.doc(value.path);
      case 'Bytes': return Buffer.from(value.base64, 'base64');
      case 'Date': return new Date(value.iso);
      case 'Array': return value.items.map(decode);
      case 'Map': return Object.fromEntries(value.entries.map(([key, item]) => [key, decode(item)]));
      default: throw new Error('Tipo desconhecido no backup: ' + String(value.type));
    }
  }
  return { encode, decode };
}

module.exports = { makeCodec };

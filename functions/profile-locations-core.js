'use strict';

const MAX_LOCATIONS = 5;
const TEXT_FIELDS = ['label', 'placeId', 'name', 'address'];

function normalizePreferredLocations(input) {
  if (!Array.isArray(input) || input.length > MAX_LOCATIONS) throw new Error('locais preferidos inválidos');
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('local preferido inválido');
    const keys = Object.keys(raw);
    if (keys.some((key) => ['lat', 'lng', 'lon'].indexOf(key) === -1 && TEXT_FIELDS.indexOf(key) === -1)) throw new Error('campo de local não permitido');
    const lat = Number(raw.lat);
    const lng = Number(raw.lng != null ? raw.lng : raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('coordenadas inválidas');
    const out = { lat: lat, lng: lng };
    TEXT_FIELDS.forEach((key) => {
      if (raw[key] == null) return;
      if (typeof raw[key] !== 'string') throw new Error('texto de local inválido');
      const value = raw[key].trim();
      if (value.length > 240) throw new Error('texto de local longo demais');
      if (value) out[key] = value;
    });
    if (!out.label && !out.name && !out.placeId) throw new Error('local sem identificação');
    return out;
  });
}

module.exports = { MAX_LOCATIONS, normalizePreferredLocations };

'use strict';

const THEMES = new Set(['dark', 'light']);
const UI_SCALE_MIN = 1.04;
const UI_SCALE_MAX = 1.95;

function normalizeInterfacePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('preferências inválidas');
  }
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => key !== 'theme' && key !== 'uiScale')) {
    throw new Error('campo de preferência não permitido');
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(input, 'theme')) {
    if (!THEMES.has(input.theme)) throw new Error('tema inválido');
    patch.theme = input.theme;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'uiScale')) {
    const scale = input.uiScale;
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < UI_SCALE_MIN || scale > UI_SCALE_MAX) {
      throw new Error('escala da interface inválida');
    }
    patch.uiScale = scale;
  }
  return patch;
}

module.exports = { UI_SCALE_MIN, UI_SCALE_MAX, normalizeInterfacePreferences };

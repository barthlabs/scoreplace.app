'use strict';

const CURRENT_TERMS_VERSION = '1.0';

function normalizeTermsAcceptance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1) throw new Error('aceite de termos inválido');
  if (input.mode !== 'explicit' && input.mode !== 'grandfather') throw new Error('modo de aceite inválido');
  return input.mode;
}

function hasGrandfatherEvidence(profile) {
  profile = profile && typeof profile === 'object' ? profile : {};
  return (Array.isArray(profile.friends) && profile.friends.length > 0) ||
    (Array.isArray(profile.preferredSports) && profile.preferredSports.length > 0) ||
    (Array.isArray(profile.preferredLocations) && profile.preferredLocations.length > 0) ||
    (typeof profile.preferredCeps === 'string' ? profile.preferredCeps.trim().length > 0 : (Array.isArray(profile.preferredCeps) && profile.preferredCeps.length > 0)) ||
    (Array.isArray(profile.matchHistory) && profile.matchHistory.length > 0) ||
    !!profile.letzplayHandle || !!profile.plan;
}

module.exports = { CURRENT_TERMS_VERSION, normalizeTermsAcceptance, hasGrandfatherEvidence };

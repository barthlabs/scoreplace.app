'use strict';

/*
 * Dados de elegibilidade preenchidos durante uma inscrição.
 *
 * Não é um patch de perfil: aceita somente os três fatos que uma categoria
 * pode pedir e só completa campos ausentes. A tela nunca decide o UID nem
 * escreve em users/{uid}; a Function fixa ambos pelo token e por este núcleo.
 */

const _skillSource = require('./skill-source-core');

const GENDERS = new Set(['feminino', 'masculino', 'outro']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function normalize(input) {
  if (!plain(input)) throw new Error('eligibility deve ser um objeto');
  const keys = Object.keys(input);
  if (keys.some((key) => !['gender', 'birthDate', 'skillBySport'].includes(key))) {
    throw new Error('campo de elegibilidade não permitido');
  }
  const out = {};
  if (input.gender !== undefined) {
    if (typeof input.gender !== 'string' || !GENDERS.has(input.gender.trim())) throw new Error('gênero inválido');
    out.gender = input.gender.trim();
  }
  if (input.birthDate !== undefined) {
    const date = String(input.birthDate || '').trim();
    const parsed = DATE_RE.test(date) ? new Date(date + 'T00:00:00Z') : null;
    // Date.parse normaliza datas inexistentes (ex.: 2026-02-31). Comparar a
    // representação ISO evita persistir uma data diferente da que foi enviada.
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) {
      throw new Error('data de nascimento inválida');
    }
    out.birthDate = date;
  }
  if (input.skillBySport !== undefined) {
    if (!plain(input.skillBySport)) throw new Error('habilidade por modalidade inválida');
    const skills = {};
    Object.keys(input.skillBySport).forEach((sport) => {
      const name = String(sport || '').trim();
      const skill = typeof input.skillBySport[sport] === 'string' ? input.skillBySport[sport].trim() : '';
      if (!name || !skill || name.length > 80 || skill.length > 32) throw new Error('habilidade por modalidade inválida');
      skills[name] = skill;
    });
    if (Object.keys(skills).length === 0) throw new Error('habilidade por modalidade inválida');
    out.skillBySport = skills;
  }
  if (Object.keys(out).length === 0) throw new Error('nenhum dado de elegibilidade informado');
  return out;
}

function missingOnly(existing, intent) {
  const profile = plain(existing) ? existing : {};
  const patch = {};
  if (intent.gender && !profile.gender) patch.gender = intent.gender;
  if (intent.birthDate && !profile.birthDate) patch.birthDate = intent.birthDate;
  if (intent.skillBySport) {
    const current = plain(profile.skillBySport) ? profile.skillBySport : {};
    const add = {};
    Object.keys(intent.skillBySport).forEach((sport) => {
      if (!current[sport]) add[sport] = intent.skillBySport[sport];
    });
    if (Object.keys(add).length) {
      patch.skillBySport = Object.assign({}, current, add);
      /* ⛔ ESTA PORTA SÓ ACRESCENTA modalidade ausente — nunca altera nem remove. Então o
       * caso dela é a marca ÓRFÃ: existia `skillBySportSource['Beach Tennis']` sem categoria
       * de Beach Tennis, e completar a categoria limpa aquela marca (a nova categoria é
       * DECLARADA, não apurada), preservando a marca das outras modalidades. */
      patch.skillBySportSource = _skillSource.reconciliar(current, patch.skillBySport, profile.skillBySportSource);
    }
  }
  return patch;
}

module.exports = { normalize, missingOnly };

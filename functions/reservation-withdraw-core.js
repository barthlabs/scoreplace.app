'use strict';

function plan(reservations, registrations, manualParticipantId) {
  const id = String(manualParticipantId || '').trim();
  const current = Array.isArray(reservations) ? reservations : [];
  if (!id) return { outcome: 'notFound', reservationsAfter: current };
  const active = (Array.isArray(registrations) ? registrations : []).some((item) =>
    item && String(item.manualParticipantId || '') === id &&
    ['pending', 'confirmed', 'waitlisted'].includes(item.status));
  const matches = current.filter((item) => item &&
    [item.manualParticipantId, item.p1ManualId, item.p2ManualId].some((value) => String(value || '') === id));
  if (active && matches.length) throw new Error('identidade duplicada entre inscrição e reserva');
  if (active) return { outcome: 'registration', reservationsAfter: current };
  if (matches.length > 1) throw new Error('reserva manual ambígua');
  if (!matches.length) return { outcome: 'notFound', reservationsAfter: current };
  const target = matches[0];
  if (String(target.manualParticipantId || '') !== id) {
    throw new Error('Esta pessoa está em uma dupla reservada. Desfaça a dupla antes de removê-la.');
  }
  return { outcome: 'reservation', reservationsAfter: current.filter((item) => item !== target) };
}

module.exports = { plan };

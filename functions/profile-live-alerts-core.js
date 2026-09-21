'use strict'; const LEVELS=new Set(['all','friends','none']);
function normalizeLiveAlerts(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!LEVELS.has(input.who))throw new Error('preferência de alerta inválida');return input.who;}
module.exports={LEVELS,normalizeLiveAlerts};

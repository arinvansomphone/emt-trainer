const CATALOG = Object.freeze({
  trauma:  ['MVC','Fall','Assault','Sport Injury','Stabbing','GSW','Burn'],
  medical: ['Cardiac','Respiratory','Neurological','Metabolic','Obstetric','Pediatric','Overdose'],
});

function isValid(type, subtype) {
  return Array.isArray(CATALOG[type]) && CATALOG[type].includes(subtype);
}

// "Random" on the selection screen: every subtype in the category is equally likely.
const RANDOM = 'Random';

function pickRandomSubtype(type, rng = Math.random) {
  const list = Object.hasOwn(CATALOG, type) ? CATALOG[type] : null;
  if (!list) return null;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

module.exports = { CATALOG, RANDOM, isValid, pickRandomSubtype };

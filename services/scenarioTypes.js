const CATALOG = Object.freeze({
  trauma:  ['MVC','Fall','Assault','Sport Injury','Stabbing','GSW','Burn'],
  medical: ['Cardiac','Respiratory','Neurological','Metabolic','Obstetric','Pediatric','Overdose'],
});

function isValid(type, subtype) {
  return Array.isArray(CATALOG[type]) && CATALOG[type].includes(subtype);
}

module.exports = { CATALOG, isValid };

// Match each claim independently: a negated claim cannot hide a later affirmative one.
const prohibitedClaim = /\b(?:tramp(?:a|as|oso|osa)|plagio|plagiar\w*|infalib\w*|cheat(?:ing|er|ed)?|plagiari\w*|infallib\w*)\b|\b(?:garantiz\w*|guarantee\w*|prove[sn]?)\b(?=.{0,50}\bcorrect\w*)|\b(?:siempre|100%) correct\w*\b|\b(?:always|certainly) correct\b/gi;

// Only direct, ordinary negations are exempt. In particular, "not only" is not
// a negation of its following claim, and an earlier negation can reverse one.
const directNegation = /\b(?:(?:not|never)(?:\s+(?:necessarily|automatically))?(?:\s+(?:a|an))?|no(?:\s+evidence\s+of)?|cannot(?:\s+be)?|(?:can|could|does|did|do|is|are|was|were|has|have|had|will|would|should|must)n['’]t(?:\s+be)?(?:\s+(?:a|an))?|without|(?:no|nunca|jamás)(?:\s+se)?(?:\s+(?:es|son|era|eran|sea|sean|será|serán|sería|serían|fue|fueron|hay|hace|hacen|puede|pueden|podría|podrían|debe|deben))?(?:\s+(?:ser|hacer))?(?:\s+(?:necesariamente|automáticamente))?(?:\s+(?:un|una|unos|unas))?|sin)\s+$/i;
const scopeReversal = /\b(?:not|no|never|neither|nor|cannot|without|nobody|nothing|false|untrue|incorrect|wrong|impossible|deny|denies|denied|nunca|jamás|sin|nadie|nada|falso|falsa|imposible|niega|negar)\b|\b\w+n['’]t\b/i;
const clauseBoundary = /[.!?;\n]|\b(?:and|but|or|however|y|pero|o|sin embargo)\b/i;

/** Conservative prose guard; grounded evidence is validated separately. */
export function hasDisallowedEducationalProse(prose: string): boolean {
  for (const claim of prose.matchAll(prohibitedClaim)) {
    const prefix = prose.slice(0, claim.index).split(clauseBoundary).at(-1)!;
    const negation = directNegation.exec(prefix);
    if (!negation || scopeReversal.test(prefix.slice(0, negation.index))) return true;
  }
  return false;
}

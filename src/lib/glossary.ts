// Single glossary source of truth — reused by the tap-to-reveal tooltips in the
// cycle calendar AND the glossary section at the bottom. Plain-English, casual,
// for a non-medical audience.

export interface GlossaryEntry {
  term: string; // display name
  def: string; // one-liner
  aliases?: string[]; // extra strings that should also match in running text
}

export const GLOSSARY: GlossaryEntry[] = [
  { term: 'OPK', def: 'Ovulation Predictor Kit — pee stick that detects the hormone spike before ovulation.' },
  { term: 'CD', def: 'Cycle Day — counted from day 1 of the period.', aliases: ['Cycle Day', 'CD1', 'CD2', 'CD9'] },
  { term: 'LH surge', def: 'The hormone spike right before ovulation; what the OPK detects.', aliases: ['surge', 'LH'] },
  { term: 'Estrace', def: 'Estrogen pills ("priming") so eggs grow at an even size.', aliases: ['estrogen priming', 'priming'] },
  { term: 'U/S', def: 'Ultrasound scan of the ovaries.', aliases: ['ultrasound'] },
  { term: 'Baseline U/S', def: 'First scan of the stim cycle; must be clear (no cysts) to start shots. Done transvaginally.', aliases: ['baseline'] },
  { term: 'Cyst', def: 'Fluid-filled sac on the ovary; the baseline scan checks there are none.', aliases: ['cysts'] },
  { term: 'Follistim 300 / Menopur 150', def: 'Nightly injectable hormones that grow the eggs (the numbers are the dose).', aliases: ['Follistim', 'Menopur', 'stims', 'stim'] },
  { term: 'Subcutaneous', def: 'Injected just under the skin (belly), tiny needle.' },
  { term: 'Ganirelix', def: 'Morning shot that stops eggs releasing too early.' },
  { term: 'Trigger / HCG', def: 'Final shot that ripens the eggs; retrieval is ~36h later.', aliases: ['trigger', 'trigger shot', 'HCG', 'hCG'] },
  { term: 'Lupron', def: 'Second trigger med, sometimes with or instead of HCG.' },
  { term: 'Retrieval', def: 'Short procedure (sedation) to collect the eggs.' },
  { term: 'Transvaginal', def: 'The scan is done with a wand inside — quick, not painful, standard for this.', aliases: ['transvaginally'] },
  { term: 'PGT', def: 'Genetic screening of the embryos.' },
  { term: 'Prenatal / folic acid', def: 'Daily vitamin (400mcg+ folic acid) throughout.', aliases: ['prenatal', 'folic acid'] },
];

// Map every matchable string (term + aliases, lowercased) → its entry.
const LOOKUP = new Map<string, GlossaryEntry>();
for (const e of GLOSSARY) {
  LOOKUP.set(e.term.toLowerCase(), e);
  for (const a of e.aliases || []) LOOKUP.set(a.toLowerCase(), e);
}

export function lookupTerm(text: string): GlossaryEntry | undefined {
  return LOOKUP.get(text.toLowerCase());
}

// Regex matching any glossary term/alias in running text (longest first so
// "Baseline U/S" wins over "U/S", "LH surge" over "LH"). Every key starts and
// ends with a word character, so plain \b boundaries are safe — and we avoid
// lookbehind for older-Safari compatibility.
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const ALL_KEYS = [...LOOKUP.keys()].sort((a, b) => b.length - a.length).map(escape);
export const TERM_RE = new RegExp(`\\b(${ALL_KEYS.join('|')})\\b`, 'gi');

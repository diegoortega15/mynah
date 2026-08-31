// Who the content is for, and what must never appear in it.
//
// This rides along inside the object levelTarget() returns, on purpose. That
// object is already threaded into every single generator (13 call sites, all
// audited) — so a new prompt cannot silently miss the safety constraints the
// way it could if this were one more parameter someone has to remember to pass.

const MAX = 200;

// Free text goes into a prompt, so collapse it to a single clean line: newlines
// would let it break out of the sentence it is embedded in.
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX);

export const DEFAULT_FOCUS = 'trabalho, carreira e tecnologia';

/**
 * Age-based floor. A parent setting up a child's profile should not have to
 * enumerate everything that could go wrong — and whatever they forget is
 * exactly what would slip through. So age alone imposes constraints, on top of
 * whatever topics they listed.
 */
function ageGuard(age) {
  if (!Number.isInteger(age) || age <= 0) return null;
  if (age < 13) {
    return (
      `The learner is a ${age}-year-old CHILD. Everything you write must be suitable for that age: ` +
      'no violence, crime, death, injury, war, romance, sexuality, dating, alcohol, drugs, smoking, ' +
      'gambling, politics, religion, money troubles, workplace conflict or scary situations. ' +
      'Stay with school, family, friends, animals, sports, games, food, nature, hobbies and travel. ' +
      'Keep the tone light and kind.'
    );
  }
  if (age < 18) {
    return (
      `The learner is ${age} years old (a teenager). Keep everything age-appropriate: ` +
      'no sexual content, no graphic violence, no drugs, alcohol, smoking or gambling, ' +
      'nothing exploitative or frightening. Mild everyday conflict and school or family topics are fine.'
    );
  }
  return null;
}

/**
 * Build the audience phrase and the constraint block for a learner.
 * `audience` is spliced into prompt sentences ("Write a text for X"), so it is
 * a noun phrase; `constraints` is appended as its own paragraph.
 */
export function contentProfile(user = {}) {
  const age = Number.isFinite(Number(user.age)) ? Number(user.age) : null;
  const focus = clean(user.focus) || DEFAULT_FOCUS;
  const avoid = clean(user.avoid_topics);

  // "an 8-year-old", "an 11-year-old" — the article follows how the number is
  // SAID. Only these two are reachable here, since the phrase is for under-18s.
  const article = age === 8 || age === 11 ? 'an' : 'a';
  const audience =
    age && age < 18
      ? `${article} ${age}-year-old Brazilian English learner`
      : 'a Brazilian English learner';

  const parts = [`CONTEXT — the learner's interests and goals: ${focus}. Themes, examples and scenarios should come from there.`];

  const guard = ageGuard(age);
  if (guard) parts.push(`AGE — ${guard}`);
  if (avoid) {
    parts.push(
      `NEVER WRITE ABOUT — the learner asked to avoid these topics entirely: ${avoid}. ` +
        'Do not mention them even in passing, and do not use them as examples. If a requested theme ' +
        'touches one of them, write about something else instead.'
    );
  }

  return { audience, focus, age, avoid, constraints: parts.join('\n\n') };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameWordForm, cleanDerivatives, cleanSynonyms, cleanAntonyms, cleanEmojis, sanitizeVocabField } from '../desktop/renderer/vocab-quality.js';

test('same-word detection: headword and plain inflections are not derivatives', () => {
  const same = [
    ['compete', 'compete'], ['Compete', 'compete'], ['competing', 'compete'], ['competes', 'compete'], ['competed', 'compete'],
    ['ice-cream', 'ice cream'], ['icecream', 'ice cream'], ['children', 'child'], ['child', 'children'],
    ['ran', 'run'], ['running', 'run'], ['cities', 'city'], ['studies', 'study'], ['stopped', 'stop'], ['gave up', 'give up'],
    ['giving up', 'give up'], ['went', 'go'], ['water', 'water'],
  ];
  for (const [c, h] of same) assert.ok(isSameWordForm(c, h, ''), `${c} ≈ ${h}`);
  assert.ok(isSameWordForm('happier', 'happy', 'adj.'));
  assert.ok(isSameWordForm('biggest', 'big', 'adj.'));
  assert.ok(isSameWordForm('faster', 'fast', 'adv.'));
});

test('same-word detection: real derivatives are kept', () => {
  const diff = [
    ['competition', 'compete'], ['competitive', 'compete'], ['teacher', 'teach'], ['runner', 'run'], ['bravely', 'brave'],
    ['bravery', 'brave'], ['happiness', 'happy'], ['unhappy', 'happy'], ['careful', 'care'], ['cat', 'catalogue'], ['sale', 'sell'],
  ];
  for (const [c, h] of diff) assert.ok(!isSameWordForm(c, h, ''), `${c} ≠ ${h}`);
  // A teacher may want participle adjectives and -ing nouns; a changed part of speech keeps them.
  assert.ok(!isSameWordForm('excited', 'excite', 'v.', 'adj.'));
  assert.ok(!isSameWordForm('building', 'build', 'v.', 'n.'));
  assert.ok(isSameWordForm('running', 'run', 'v.', 'v.'));
  // Without -er/-est treated as inflection for verbs and nouns.
  assert.ok(!isSameWordForm('teacher', 'teach', 'v.'));
});

test('word family never repeats the headword', () => {
  const r = cleanDerivatives('compete (v.) - συναγωνίζομαι, competition (n.) - διαγωνισμός, Competing (v.) - συναγωνιζόμενος, competitive (adj.) - ανταγωνιστικός, competition (n.) - αγώνας', { english: 'compete', type: 'v.' });
  assert.equal(r.value, 'competition (n.) - διαγωνισμός, competitive (adj.) - ανταγωνιστικός');
  assert.deepEqual(r.rejected, ['compete', 'Competing']);
  assert.equal(cleanDerivatives('pencil (n.) - μολύβι', { english: 'pencil', type: 'n.' }).value, '');
  assert.equal(cleanDerivatives('water (v.) - ποτίζω', { english: 'water', type: 'n.' }).value, '');
  assert.equal(cleanDerivatives('excited (adj.) - ενθουσιασμένος, exciting (adj.) - συναρπαστικός, excitement (n.) - ενθουσιασμός, excite (v.) - ενθουσιάζω', { english: 'excite', type: 'v.' }).value,
    'excited (adj.) - ενθουσιασμένος, exciting (adj.) - συναρπαστικός, excitement (n.) - ενθουσιασμός');
});

test('word family entries survive Greek commas and missing types', () => {
  const r = cleanDerivatives('bravery (n.) - θάρρος, τόλμη, bravely - γενναία', { english: 'brave', type: 'adj.' });
  assert.equal(r.value, 'bravery (n.) - θάρρος, τόλμη, bravely - γενναία');
  assert.equal(cleanDerivatives([{ text: 'brave', type: 'adj.' }, { text: 'bravery', type: 'n.', greek: 'θάρρος' }], { english: 'brave' }).value, 'bravery (n.) - θάρρος');
  assert.equal(cleanDerivatives('compete (v.), competition (n.), competitor (n.)', { english: 'compete', max: 1 }).value, 'competition (n.)');
});

test('synonyms and opposites never repeat the headword or each other', () => {
  assert.equal(cleanSynonyms('big, large, Big, bigger', { english: 'big', type: 'adj.' }).value, 'large');
  assert.equal(cleanSynonyms('courageous, brave, fearless, bold, daring', { english: 'brave', type: 'adj.', max: 2 }).value, 'courageous, fearless');
  assert.equal(cleanAntonyms('afraid - φοβισμένος, brave - γενναίος, not brave - όχι γενναίος', { english: 'brave', type: 'adj.' }).value, 'afraid - φοβισμένος');
  assert.equal(cleanAntonyms('small - μικρός, tiny - πολύ μικρός', { english: 'big', type: 'adj.', synonyms: 'tiny' }).value, 'small - μικρός');
  assert.equal(cleanAntonyms('', { english: 'pencil' }).value, '');
});

test('emojis: only real pictures, max two, no placeholders or unsupported ones', () => {
  assert.equal(cleanEmojis('🦭').value, '🦭');
  assert.equal(cleanEmojis('🏃 run 💨').value, '🏃💨');
  assert.equal(cleanEmojis('🏃🏃🏃').value, '🏃');
  assert.equal(cleanEmojis('🍎🍌🍇').value, '🍎🍌');
  assert.equal(cleanEmojis('❓').value, '');
  assert.equal(cleanEmojis('👍🏽').value, '👍');
  assert.equal(cleanEmojis('👩‍💻').value, '👩‍💻');
  const only = (g) => g !== '🫎';
  const r = cleanEmojis('🫎🐴', { isDrawable: only });
  assert.equal(r.value, '🐴');
  assert.deepEqual(r.rejected, ['🫎']);
  assert.equal(sanitizeVocabField('collocation', ' a phrase ').value, 'a phrase');
});

test('AI fill pipeline: rejects same-word families, retries, and applies the reviewer', async () => {
  const { autofillVocabulary } = await import('../desktop/renderer/app.js');
  const calls = [];
  const original = globalThis.fetch;
  const reply = (obj) => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) });
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const sys = body.messages[0].content;
    const user = body.messages[1].content;
    const review = sys.includes('strict English teacher');
    calls.push(review ? 'review' : 'fill');
    if (review) {
      // The reviewer swaps the vague emoji for a better one and keeps everything else.
      return reply({ items: [{ english: 'compete', emojis: '🏁' }, { english: 'pencil' }] });
    }
    if (user.includes('"avoid": {')) {
      return reply({ items: [{ english: 'compete', emojis: '🏆', derivatives: 'competition (n.) - διαγωνισμός, competitor (n.) - αντίπαλος' }] });
    }
    return reply({ items: [
      { english: 'compete', sense: 'to take part in a contest', emojis: '❓', derivatives: 'compete (v.) - συναγωνίζομαι, competing (v.) - συναγωνίζομενος', synonyms: 'compete, contend', antonyms: 'compete - συναγωνίζομαι, cooperate - συνεργάζομαι', none: [] },
      { english: 'pencil', sense: 'writing tool', emojis: '✏️', derivatives: '', synonyms: '', antonyms: '', none: ['derivatives', 'synonyms', 'antonyms'] },
    ] });
  };
  try {
    const f = { emojis: true, derivatives: true, synonyms: true, antonyms: true };
    const out = await autofillVocabulary('key', 'B_SENIOR', [
      { english: 'compete', fields: f, provided: { type: 'v.' } },
      { english: 'pencil', fields: f, provided: { type: 'n.' } },
    ]);
    assert.equal(out[0].derivatives, 'competition (n.) - διαγωνισμός, competitor (n.) - αντίπαλος');
    assert.equal(out[0].synonyms, 'contend');
    assert.equal(out[0].antonyms, 'cooperate - συνεργάζομαι');
    assert.equal(out[0].emojis, '🏁');
    assert.equal(out[1].emojis, '✏️');
    assert.ok(!out[1].derivatives);
    assert.deepEqual(out.unavailable, { pencil: ['derivatives', 'synonyms', 'antonyms'] });
    assert.ok(calls.includes('review'));
  } finally {
    globalThis.fetch = original;
  }
});

test('worksheet vocabulary table is exactly the Step 2 table (deleted fields stay deleted)', async () => {
  const { generateWorksheets, enforceTeacherVocabulary, findVocabGaps, renderLingoLauncher, validateWorksheet } = await import('../desktop/renderer/app.js');
  const on = { type: true, greek: true, emojis: true, collocation: true, derivatives: true, synonyms: true, antonyms: true };
  const form = {
    bookTitle: 'Test', unit: '1', pageRange: '', classProfile: 'B_SENIOR', inputMode: 'structured', freeform: '', teacherHints: [],
    vocabRows: [
      { english: 'brave', type: 'adj.', greek: 'γενναίος', emojis: '🦁', collocation: 'a brave boy', derivatives: 'bravery (n.) - θάρρος', synonyms: '', antonyms: '', fieldToggles: on },
      { english: 'clever', type: 'adj.', greek: '', emojis: '', collocation: '', derivatives: '', synonyms: 'smart', antonyms: 'silly - ανόητος', fieldToggles: { ...on, synonyms: false, antonyms: false } },
    ],
  };
  // The AI invents synonyms, emojis, Greek and families the teacher deleted or switched off.
  const aiVocab = [
    { number: 1, english: 'brave', type: 'adj.', greek: 'τολμηρός', emojis: '🦸', collocation: 'brave soldier', derivatives: [{ text: 'bravely', type: 'adv.', greek: 'γενναία' }], synonyms: ['bold'], antonyms: [{ text: 'afraid', greek: 'φοβισμένος' }] },
    { number: 2, english: 'Clever', type: 'adj.', greek: 'έξυπνος', emojis: '🧠', collocation: 'a clever idea', derivatives: [], synonyms: ['smart'], antonyms: [{ text: 'silly', greek: 'ανόητος' }] },
  ];
  const data = enforceTeacherVocabulary({ meta: {}, lingoLauncher: { vocabulary: aiVocab, practice: [] } }, form);
  const [brave, clever] = data.lingoLauncher.vocabulary;
  assert.equal(brave.greek, 'γενναίος'); assert.equal(brave.emojis, '🦁'); assert.equal(brave.collocation, 'a brave boy');
  assert.deepEqual(brave.derivatives, [{ text: 'bravery', type: 'n.', greek: 'θάρρος' }]);
  assert.deepEqual(brave.synonyms, []); assert.deepEqual(brave.antonyms, []);
  assert.equal(clever.english, 'clever'); assert.equal(clever.greek, ''); assert.equal(clever.emojis, ''); assert.equal(clever.collocation, '');
  assert.deepEqual(clever.synonyms, []); assert.deepEqual(clever.antonyms, []);
  assert.ok(!renderLingoLauncher(data).includes('smart'));
  assert.equal(validateWorksheet({ ...data, meta: { ...data.meta, classProfile: 'B_SENIOR' } }).issues.some((i) => /missing Greek|needs at least one emoji/.test(i)), false);
  assert.deepEqual(findVocabGaps(form), { greek: ['clever'], emojis: ['clever'], collocation: ['clever'] });
  // Freeform mode has no teacher rows: untouched.
  const free = { meta: {}, lingoLauncher: { vocabulary: aiVocab, practice: [] } };
  assert.equal(enforceTeacherVocabulary(free, { inputMode: 'freeform', vocabRows: [] }).lingoLauncher.vocabulary, aiVocab);

  // Through the real generator, with an AI that ignores the instructions.
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ meta: {}, lingoLauncher: { vocabulary: aiVocab, practice: [] }, dictation: { exercises: [] } }) } }] }) });
  try {
    const out = await generateWorksheets(form, 'key', {});
    const v = out.data.lingoLauncher.vocabulary;
    assert.equal(v[1].greek, ''); assert.deepEqual(v[1].synonyms, []); assert.equal(v[0].greek, 'γενναίος');
  } finally { globalThis.fetch = original; }
});

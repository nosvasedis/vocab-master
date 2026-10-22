/* Vocab Master — task types for unit tests and dictations (pure).
 * Modelled on Cambridge Young Learners (Starters / Movers / Flyers) task types: short imperative rubrics,
 * a worked example, 5–8 items, pictures where they help. Every task says how it is answered (answer),
 * what students see (layout) and what the AI must write (ai). See docs/research/exercise-design.md. */

export const SKILLS = {
  listening: { label: "Listening", icon: "🎧", el: "Ακρόαση" },
  reading: { label: "Reading", icon: "📖", el: "Κατανόηση κειμένου" },
  vocabulary: { label: "Vocabulary", icon: "🔤", el: "Λεξιλόγιο" },
  grammar: { label: "Grammar", icon: "🧩", el: "Γραμματική" },
  writing: { label: "Writing", icon: "✍️", el: "Παραγωγή γραπτού λόγου" },
  speaking: { label: "Speaking", icon: "🗣️", el: "Προφορικός λόγος" },
  dictation: { label: "Read-aloud dictation", icon: "🗣️", el: "Υπαγόρευση" },
};

/**
 * answer: choice (options, one right) · tf (true/false or yes/no) · word (write a word/phrase) · match (letter) · open (marked by rubric)
 * needs: "pictures" (word-bank illustrations), "passage" (a reading text), "script" (a listening text)
 * kind: what the learner does — recognise (choose, match, decide), recall (write it themselves), create (speak or write freely).
 *   A fair test moves from recognise to recall to create within a skill (docs/research/exercise-design.md).
 * fit: [first, last] class it suits best (0 = A Senior … 4 = E Senior); other classes can still use it.
 * knobs: the part's own settings (KNOBS below). blurb: what it is and why, for teachers. sample: a tiny preview.
 * trains: what it practises. Pure data — the selector (js/views/tests.js) and the prompt (test-builder.js) read it.
 */
export const TASKS = {
  // Listening — new short dialogues / monologues read by the app's voices.
  "L-PIC": { skill: "listening", label: "Listen and tick the picture", answer: "choice", options: 3, needs: ["script", "pictures"], kind: "recognise", fit: [0, 2], knobs: ["plays"], trains: ["Key details", "Word recognition"],
    blurb: "A short conversation; for each question the children tick one of three pictures. Pictures carry the meaning, so even beginners can show what they understood.",
    sample: { audio: "Mia: I bought some grapes for the picnic.", q: "What did Mia buy?", pics: ["🍌", "🍇", "🍎"], a: 1 },
    rubric: "Listen and tick (✓) the right picture.", el: "Άκουσε και βάλε ✓ στη σωστή εικόνα.", ai: "A dialogue with about two turns per question. One question per item that needs the dialogue to answer (What did Mia buy? Where is Tom going? Which animal does Leo like?) — never “Which picture shows X?”, and the speakers never mention picture letters or numbers. options = EXACTLY 3 single words copied from the picture words list — they are printed as pictures, so never sentences or phrases. The answer is said in the dialogue; the other two are mentioned or plausible." },
  "L-MATCH": { skill: "listening", label: "Listen and match", answer: "match", needs: ["script"], kind: "recognise", fit: [0, 3], knobs: ["plays"], trains: ["Names and details", "Following a conversation"],
    blurb: "Two speakers talk about several people (or days, or places). Children match each one to what goes with them by writing a letter, like the Cambridge “draw lines” task.",
    sample: { audio: "Ben: Who plays the guitar? — Anna: My brother Tom does!", pairs: [["Tom", "plays the guitar"], ["Anna", "feeds the cat"], ["Leo", "rides a bike"]] },
    rubric: "Listen and match. Write the letter.", el: "Άκουσε και αντιστοίχισε. Γράψε το γράμμα.", ai: "A dialogue in which two speakers talk about one different person (or day, or place) for every item, and what each one does, has, likes or wears. Items: prompt = the person's name (or the day / place), answer = a short phrase (2–5 words) that goes with it, said clearly in the script. Every answer is different. The script also mentions one or two things that go with nobody. The app letters and shuffles the answers." },
  "L-MC": { skill: "listening", label: "Listen and choose the answer", answer: "choice", options: 3, needs: ["script"], kind: "recognise", fit: [1, 4], knobs: ["audio", "plays", "options"], trains: ["Detail", "Gist"],
    blurb: "A dialogue or short talk with a question for each detail. All the options are heard or plausible, so children must really follow what is said.",
    sample: { audio: "Tom: The museum opens at nine, but let's meet at half past.", q: "When will they meet?", o: ["at 9:00", "at 9:30", "at 10:30"], a: 1 },
    rubric: "Listen and choose the right answer: a, b or c.", el: "Άκουσε και διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "A short dialogue or monologue. One question per item in the order the answers are heard; 3 short options, all mentioned or plausible." },
  "L-YN": { skill: "listening", label: "Listen and write yes or no", answer: "tf", needs: ["script"], kind: "recognise", fit: [0, 4], knobs: ["audio", "plays"], trains: ["Detail", "Checking facts"],
    blurb: "Children hear a text and decide if each sentence is right. Quick to mark; the “no” sentences change one detail, so careful listening wins.",
    sample: { audio: "Kate: My grandma lives on a farm with two cows.", q: "Kate's grandma lives in the city.", a: "no" },
    rubric: "Listen and write yes or no.", el: "Άκουσε και γράψε yes ή no.", ai: "A short monologue or dialogue; statements in the order heard; about half are true." },
  "L-GAP": { skill: "listening", label: "Listen and write one word", answer: "word", needs: ["script"], kind: "recall", fit: [1, 4], knobs: ["audio", "plays"], trains: ["Spelling the unit words", "Detail"],
    blurb: "Short notes with one gap each; the answer is a unit word said clearly. Children hear the word and must spell it themselves.",
    sample: { audio: "Ms. Park: Don't forget to bring your flute on Tuesday.", q: "Bring your ________ on Tuesday.", a: "flute" },
    rubric: "Listen and write one word in each gap.", el: "Άκουσε και γράψε μία λέξη σε κάθε κενό.", ai: "A short monologue (a message, an announcement, a description). Items are short notes with one gap ________ each, in the order heard; each answer is ONE unit word said clearly in the script." },
  "L-NOTES": { skill: "listening", label: "Listen and complete the notes", answer: "word", needs: ["script"], kind: "recall", fit: [2, 4], knobs: ["audio", "plays"], trains: ["Numbers, times and names", "Note-taking"],
    blurb: "A phone message or announcement with practical details (day, time, price, what to bring). Children fill a form — real-life listening as in A2 Key.",
    sample: { audio: "The trip is on Friday and it costs twelve euros.", q: "Cost: € ________", a: "12" },
    rubric: "Listen and complete the notes. Write a word or a number.", el: "Άκουσε και συμπλήρωσε τις σημειώσεις. Γράψε μία λέξη ή έναν αριθμό.", ai: "A monologue or phone message with practical details (a trip, a club, an event, a lesson). Items are note lines with ONE gap each — e.g. \"Day: ________\", \"Bring: ________\", \"Cost: € ________\" — in the order heard. Each answer is one word, a number or a time; a name in the answers is spelled out letter by letter in the script. Use unit words where they fit; the script mentions one wrong detail before the right one at least once (\"Not Thursday — Friday\")." },
  "L-GIST": { skill: "listening", label: "Listen for the main idea", answer: "choice", options: 3, needs: ["script"], kind: "recognise", fit: [2, 4], knobs: ["plays", "options"], trains: ["Gist", "Purpose and feelings"],
    blurb: "Several very short recordings — a message, an announcement, a quick chat — with one question each about the main idea: why someone calls, where they are, how they feel. Listening for the point, not for one word (as in A2 Key).",
    sample: { audio: "Leo: Hi Gran, I'm sorry, the bus is late. Start dinner without me!", q: "Why does Leo call?", o: ["to ask for dinner", "to say he will be late", "to invite Gran"], a: 1 },
    rubric: "Listen and choose the right answer: a, b or c.", el: "Άκουσε και διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "One VERY short recording per item (and one for the example): 2–4 lines each — a phone message, an announcement, a short conversation. Each recording starts with a line by the speaker \"Narrator\": \"Example.\", \"Number 1.\", \"Number 2.\" … Each question asks about the main idea — why someone calls, where they are, what they decide, how someone feels, what they are talking about — never a single word or number heard. 3 short options; the wrong ones use words that are heard but miss the point." },
  // Reading
  "R-TF": { skill: "reading", label: "Read and write yes / no (true / false)", answer: "tf", needs: ["passage"], kind: "recognise", fit: [0, 4], knobs: ["text", "genre", "length"], trains: ["Detail", "Checking facts"],
    blurb: "A text and sentences about it; children decide if each one is right. Gentle for young readers — and the “no” sentences change one detail, so they have to read carefully.",
    sample: { text: "Ana lives in a city in Brazil.", q: "Ana lives on a farm.", a: "no" },
    rubric: "Read the text. Write yes or no.", rubricOlder: "Read the text. Write T (true) or F (false).", el: "Διάβασε το κείμενο. Γράψε yes ή no.", elOlder: "Διάβασε το κείμενο. Γράψε T (σωστό) ή F (λάθος).", ai: "A short text at class level about the unit topic. Statements about the text, in text order; follow the given answer order exactly." },
  "R-WHO": { skill: "reading", label: "Read and write the name", answer: "word", needs: ["passage"], kind: "recall", fit: [0, 2], knobs: ["text", "length"], trains: ["Scanning", "Who did what"],
    blurb: "A text about three or four people; each sentence describes one of them and children write the name. Young readers learn to scan back to the right place.",
    sample: { text: "Leo walks to school. Mia rides her bike.", q: "This child rides a bike.", a: "Mia" },
    rubric: "Read the text. Who is it? Write the name.", el: "Διάβασε το κείμενο. Ποιος είναι; Γράψε το όνομα.", ai: "A text about 3–4 named people or characters. Items: one short sentence each about one of them in your own words (\"She has got a red kite.\"); answer = the name. Every name in the text is an answer at least once, and the items do not follow the text order." },
  "R-MC": { skill: "reading", label: "Read and choose the answer", answer: "choice", options: 3, needs: ["passage"], kind: "recognise", fit: [1, 4], knobs: ["text", "genre", "length", "options"], trains: ["Detail", "Main idea", "Inference"],
    blurb: "Comprehension questions in text order with three (or four) options. Raise the difficulty and the questions ask why and what the writer means, not just what.",
    sample: { text: "Lena's hands were cold, but she started to play.", q: "How did Lena feel?", o: ["bored", "nervous", "angry"], a: 1 },
    rubric: "Read the text and choose the right answer: a, b or c.", el: "Διάβασε το κείμενο και διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "A short text at class level (story, email, article) about the unit topic, using unit words. Comprehension questions in text order, 3 options each." },
  "R-QA": { skill: "reading", label: "Read and answer the questions", answer: "word", needs: ["passage"], kind: "recall", fit: [1, 4], knobs: ["text", "genre", "length"], trains: ["Finding information", "Short answers"],
    blurb: "Wh- questions answered in one to four words from the text. Children find the answer themselves instead of choosing it — real reading, easy to mark.",
    sample: { text: "Kito was a young elephant on the savanna.", q: "Where did Kito live?", a: "on the savanna" },
    rubric: "Read the text and answer the questions. Write 1–4 words.", el: "Διάβασε το κείμενο και απάντησε στις ερωτήσεις. Γράψε 1–4 λέξεις.", ai: "Wh- questions in text order (Where…? What…? Who…? Why…? How many…?), each answered in 1–4 words taken from the text; answer = the short answer exactly as it can be written. At least one question needs two sentences of the text put together." },
  "R-ORDER": { skill: "reading", label: "Put the events in order", answer: "word", needs: ["passage"], kind: "recognise", fit: [0, 3], knobs: ["text", "length"], trains: ["Sequence", "Story structure"],
    blurb: "Children read a story or a how-to text and number the events in the right order. Great for stories and recipes; the app mixes the events up.",
    sample: { text: "First, cut the paper. Then fold it…", list: ["Fold the paper.", "Cut the paper.", "Paint it."], a: "2 · 1 · 3" },
    rubric: "Read the text. Put the sentences in order. Write the numbers.", el: "Διάβασε το κείμενο. Βάλε τις προτάσεις στη σωστή σειρά. Γράψε τους αριθμούς.", ai: "Use a story or a how-to text with a clear order. The example is the FIRST event. Items = the next events of the text, one short sentence each in your own words, given IN TEXT ORDER (the app numbers and mixes them up); answer = leave as \"\". Events must not overlap, and each one is clearly before or after the others." },
  "R-GAP": { skill: "reading", label: "Read and complete the text", answer: "word", needs: ["passage"], bank: true, kind: "recall", fit: [1, 4], knobs: ["genre", "length", "extras"], trains: ["Words in context", "Text cohesion"],
    blurb: "A connected text with numbered gaps and a word box — one word per gap, or with extra words that fit no gap (you choose). Children use the whole text to choose — vocabulary and reading together.",
    sample: { text: "The plates (1) ________ slowly and the ground (2) ________.", bank: ["shakes", "move", "melts"], q: "(1)", a: "move" },
    rubric: "Read the text. Choose the right words from the box and write them on the lines.", el: "Διάβασε το κείμενο. Διάλεξε τις σωστές λέξεις από το κουτί και γράψ' τες στις γραμμές.", ai: "A short connected text with numbered gaps written (1) ________, (2) ________ … one per item. bank = the word box (see WORD BOX below). Each item: prompt = \"(n)\" and answer = the word for that gap — every answer MUST be one of the tested words." },
  "R-WORDS": { skill: "reading", label: "Find the words in the text", answer: "word", needs: ["passage"], kind: "recall", fit: [2, 4], knobs: ["text", "genre", "length"], trains: ["Meaning from context", "Synonyms"],
    blurb: "Children find a word or phrase in the text for each meaning (“very big”, “the opposite of noisy”). Builds the habit of working out meaning from context.",
    sample: { text: "Some dinosaurs were enormous.", q: "very, very big", a: "enormous" },
    rubric: "Find words in the text that mean the same as these.", el: "Βρες λέξεις στο κείμενο που σημαίνουν το ίδιο με αυτές.", ai: "Items: prompt = a short meaning, synonym or opposite in simple English (\"very big\", \"the opposite of noisy\"); answer = the word or phrase of the text with that meaning, copied exactly as it is in the text (unit words first). Items in text order; every answer appears in the text only once." },
  "R-REPLY": { skill: "reading", label: "Choose the right reply", answer: "choice", options: 3, kind: "recognise", fit: [0, 4], knobs: ["options"], trains: ["Everyday English", "Questions and answers"],
    blurb: "One person says something, the children choose the natural reply. Short everyday exchanges (Would you like…? / Yes, please.) — the functional English of Cambridge Movers, Flyers and A2 Key.",
    sample: { q: "Anna: Would you like some cake?", o: ["Yes, I am.", "Yes, please.", "I like it."], a: 1 },
    rubric: "Read and choose the best answer: a, b or c.", el: "Διάβασε και διάλεξε την καλύτερη απάντηση: a, b ή c.", ai: "Short everyday exchanges about the unit topic (one conversation in steps, or separate ones). Each item: prompt = what the first person says, with the speaker's name (e.g. \"Anna: Would you like some cake?\"); options = possible replies; exactly ONE is the natural, correct reply. The wrong replies are real learner mistakes: they answer a different question, use the wrong short answer or tense (Yes, I am. for a Do-question), or don't fit the situation — never nonsense." },
  "R-SIGNS": { skill: "reading", label: "Signs and messages", answer: "choice", options: 3, kind: "recognise", fit: [2, 4], knobs: ["options"], trains: ["Real-life reading", "Reading for the point"],
    blurb: "Short real-life texts — a notice, a sign, a label, a text message, a note on the fridge — and what each one means. Children read for the message, like A2 Key Reading Part 1.",
    sample: { text: "SWIMMING POOL — closed on Monday for cleaning. Open again Tuesday 9 am.", q: "", o: ["You can't swim here on Monday.", "The pool opens at 9 every day.", "You must clean the pool."], a: 0 },
    rubric: "Read the texts. What do they say? Choose a, b or c.", el: "Διάβασε τα κείμενα. Τι λένε; Διάλεξε a, b ή c.", ai: "Each item: prompt = ONE short real-life text (6–20 words) linked to the unit topic: a notice, a sign, a label, a poster line, a text message or a note (a message says who wrote it, e.g. \"Mum: …\"). options = what the text means, said in other words; the wrong options use words from the text but change the meaning (who, when, must/can, always/sometimes)." },
  "R-MCCLOZE": { skill: "reading", label: "Read and choose the word", answer: "choice", options: 3, needs: ["passage"], kind: "recognise", fit: [1, 4], knobs: ["genre", "length", "options"], trains: ["Words in context", "Grammar in context"],
    blurb: "A short text with gaps; for each gap children choose one of three words. The words look alike, so they must read the whole sentence — the multiple-choice cloze of Movers and A2 Key.",
    sample: { text: "Mia (1) ________ her bike to school every day.", q: "(1)", o: ["goes", "rides", "drives"], a: 1 },
    rubric: "Read the text. Choose the right word for each gap: a, b or c.", el: "Διάβασε το κείμενο. Διάλεξε τη σωστή λέξη για κάθε κενό: a, b ή c.", ai: "A short connected text with numbered gaps written (1) ________, (2) ________ …, one per item (the example's gap is (0)). Each item: prompt = \"(n)\", options = words of the SAME word class that all look possible; only one fits the meaning and the grammar of its sentence. Most gaps test unit words; one or two may test a grammar word (a preposition, a verb form)." },
  // Vocabulary
  "V-PIC": { skill: "vocabulary", label: "Look and write (pictures)", answer: "word", needs: ["pictures"], kind: "recall", fit: [0, 2], knobs: ["hint"], trains: ["Spelling", "Naming things"],
    blurb: "The app's own illustrations with a short clue; children write the word. Recall with pictures — the strongest way for young learners to remember words.",
    sample: { pics: ["🌋"], q: "(it is hot and comes out of a mountain)", a: "lava" },
    rubric: "Look at the pictures. Write the words.", el: "Κοίτα τις εικόνες και γράψε τις λέξεις.", ai: "Answers = concrete NOUNS from the picture words list (things you can draw). prompt = a short clue in brackets that tells the picture apart, e.g. \"(it is hot and comes out of a volcano)\" — never a sentence with a gap, never the answer." },
  "V-MATCH": { skill: "vocabulary", label: "Match words and meanings", answer: "match", bank: true, kind: "recognise", fit: [0, 4], knobs: [], trains: ["Meaning"],
    blurb: "Words on the left, kid-friendly meanings on the right; children write the letter. A calm warm-up that checks they know what each word means.",
    sample: { pairs: [["herd", "a big group of animals"], ["melt", "turn into water"]] },
    rubric: "Match the words with their meanings. Write the letter.", el: "Αντιστοίχισε τις λέξεις με τη σημασία τους. Γράψε το γράμμα.", ai: "Items: prompt = a unit word; answer = its kid-friendly definition. The app letters and shuffles the definitions." },
  "V-ODD": { skill: "vocabulary", label: "Odd one out", answer: "choice", options: 4, kind: "recognise", fit: [0, 3], knobs: [], trains: ["Word groups", "Thinking about meaning"],
    blurb: "Four words, three belong together; children circle the odd one. Makes them think about categories — and it is fun.",
    sample: { o: ["guitar", "flute", "violin", "pizza"], a: 3 },
    rubric: "Circle the word that is different.", el: "Κύκλωσε τη λέξη που δεν ταιριάζει.", ai: "Each item: 4 options (unit words where possible), 3 share a clear category, answer = the odd one. prompt may be empty." },
  "V-MC": { skill: "vocabulary", label: "Choose the right word", answer: "choice", options: 3, kind: "recognise", fit: [1, 4], knobs: ["options"], trains: ["Words in context"],
    blurb: "A sentence with a gap and three unit words of the same kind; only one fits. Children must understand the whole sentence, not just spot a word.",
    sample: { q: "The firefighter ________ the kitten from the tree.", o: ["rescued", "collected", "donated"], a: 0 },
    rubric: "Read and choose the right word.", el: "Διάβασε και διάλεξε τη σωστή λέξη.", ai: "Sentences with one gap ________; 3 options that are unit words of the same part of speech; only one fits." },
  "V-SPELL": { skill: "vocabulary", label: "Unjumble the letters", answer: "word", kind: "recall", fit: [0, 2], knobs: [], trains: ["Spelling", "Word shape"],
    blurb: "A clue and the word's letters mixed up; children write the word. Playful spelling practice for young classes — the app mixes the letters.",
    sample: { q: "It lives in a pond and jumps.  g · o · r · f", a: "frog" },
    rubric: "Read the clue. Put the letters in order and write the word.", el: "Διάβασε το στοιχείο. Βάλε τα γράμματα στη σωστή σειρά και γράψε τη λέξη.", ai: "prompt = a very short clue that shows which word it is (\"It lives in a pond and jumps.\") — never the word itself; answer = a unit word that is ONE word of 3–10 letters (no phrases). The app adds the mixed-up letters." },
  "V-BANK": { skill: "vocabulary", label: "Complete with words from the box", answer: "word", bank: true, kind: "recall", fit: [0, 4], knobs: ["extras"], trains: ["Words in context", "Word forms"],
    blurb: "Sentences in new situations with a word box — one word per gap, or with extra words that fit no gap to make it harder (you choose). Children choose and write the right form — the classic, fair vocabulary task.",
    sample: { bank: ["erupt", "lava", "crack"], q: "Hot ________ flows down the mountain.", a: "lava" },
    rubric: "Read and complete. Use the words in the box.", el: "Διάβασε και συμπλήρωσε με τις λέξεις από το κουτί.", ai: "Sentences in NEW contexts with one gap ________ each; bank = the word box (see WORD BOX below)." },
  "V-DEF": { skill: "vocabulary", label: "Read and write the word", answer: "word", kind: "recall", fit: [1, 4], knobs: ["hint"], trains: ["Meaning", "Spelling"],
    blurb: "A child-friendly description; children write the word, with the first letter or the number of letters to help (you choose). No word box — true recall.",
    sample: { q: "You wear these on your hands when it is cold.", hint: "g _ _ _ _ _", a: "gloves" },
    rubric: "Read the description. Write the word.", el: "Διάβασε την περιγραφή. Γράψε τη λέξη.", ai: "prompt = a simple description of a unit word, the way you would explain it to a child (\"You wear these on your hands when it is cold.\"); never use the word or a word of its family; answer = the word. The app adds the letter help." },
  "V-COLLOC": { skill: "vocabulary", label: "Word partners", answer: "choice", options: 3, kind: "recognise", fit: [2, 4], knobs: ["options"], trains: ["Collocations", "Natural English"],
    blurb: "Which word goes with it: make, do, take or have? Fixed phrases with the unit words, where Greek learners often choose the wrong partner.",
    sample: { q: "Can you ________ the table for dinner?", o: ["make", "set", "do"], a: 1 },
    rubric: "Choose the word that goes with the others.", el: "Διάλεξε τη λέξη που πάει μαζί με τις άλλες.", ai: "Each item tests a fixed phrase (collocation) with a unit word: prompt = a short sentence with the partner word gapped (\"Can you ________ the table for dinner?\"); options = 3 partner words of the same class that learners mix up (make / do / take / have / go / get / play / set…); only one sounds natural." },
  "V-FORM": { skill: "vocabulary", label: "Word families", answer: "word", kind: "recall", fit: [0, 4], knobs: ["family"], trains: ["Word building", "Word class"],
    blurb: "A gap and a word in capitals; children change it to fit. Young classes add an easy ending to a word they know (SUN → sunny, TEACH → teacher), older ones build words with prefixes and suffixes (CARE → careless). The app can print the word inside the answer (s u n _ _) to help.",
    sample: { q: "It is a ________ day. (SUN)", hint: "s u n _ _", a: "sunny" },
    rubric: "Use the word in capitals to make a word that fits the gap.", el: "Χρησιμοποίησε τη λέξη με κεφαλαία για να φτιάξεις λέξη που ταιριάζει στο κενό.", ai: "Sentences with one gap ________ and the base word in CAPITALS in brackets at the end (\"It is a ________ day. (SUN)\"); answer = the right form (sunny). The word in CAPITALS is the ROOT the answer is built from — the shorter, simpler word (CREATE → creation, creature; DESCRIBE → description), never a longer word of the family (never CREATURE → create) — and the answer is always a DIFFERENT word from it. The base word is a unit word or a word the class knows; the answer is a word of its family. Follow the CLASS LADDER below for which changes to use." },
  // Word families, opposites and synonyms: recognise first, then recall (docs/research/exercise-design.md → "Word families, opposites, synonyms").
  "V-FAMMC": { skill: "vocabulary", label: "Choose the right word form", answer: "choice", options: 3, kind: "recognise", fit: [0, 3], knobs: ["options"], trains: ["Word building", "Word class"],
    blurb: "A sentence with a gap and three words of the same family (sing · singer · singing); only one fits the sentence. The first step with word families: children see the forms and pick by the job the word does, before they build words themselves in “Word families”.",
    sample: { q: "She is a very good ________.", o: ["sing", "singer", "singing"], a: 1 },
    rubric: "Read and choose the right word.", el: "Διάβασε και διάλεξε τη σωστή λέξη.", ai: "Sentences with one gap ________; options = words of ONE family (a unit word and its forms: produce / production / product, amaze / amazing / amazed), so the meaning is the same and only the word class or ending decides; exactly one fits the grammar of the sentence. Use the TAUGHT FAMILIES below first; the CLASS LADDER below says which other changes this class knows. Never a form the class hasn't met." },
  "V-OPP": { skill: "vocabulary", label: "Choose the opposite", answer: "choice", options: 3, kind: "recognise", fit: [0, 4], knobs: ["options"], trains: ["Opposites", "Meaning"],
    blurb: "A short sentence with a word in capitals; children choose its opposite. A wrong option that means the same is the classic trap, so they must really know the word — and the sentence shows which meaning is meant (a LIGHT bag → heavy, not dark).",
    sample: { q: "This bag is very HEAVY.", o: ["light", "big", "strong"], a: 0 },
    rubric: "Choose the opposite of the word in CAPITALS.", el: "Διάλεξε το αντίθετο της λέξης με κεφαλαία.", ai: "prompt = a short sentence with ONE unit word in CAPITALS that has a clear opposite (\"This bag is very HEAVY.\"); options = 3 words of the same word class as the CAPITALS word: its opposite (the answer) and two that fit the topic but are not opposites — where the class knows one, one wrong option means about the SAME as the capitals word. Choose the opposite that fits the meaning in THIS sentence. Use the TAUGHT OPPOSITES below first; never \"not + word\"." },
  "V-OPPW": { skill: "vocabulary", label: "Write the opposite", answer: "word", kind: "recall", fit: [1, 4], knobs: ["hint"], trains: ["Opposites", "Spelling"],
    blurb: "A sentence with a gap; children write the opposite of the word in brackets (with the first letter or the number of letters to help, you choose). The recall step after “Choose the opposite”.",
    sample: { q: "Don't push the door. ________ it! (PUSH)", hint: "p _ _ _", a: "pull" },
    rubric: "Write the opposite of the word in CAPITALS.", el: "Γράψε το αντίθετο της λέξης με κεφαλαία.", ai: "Sentences with one gap ________ and a unit word in CAPITALS in brackets at the end (\"Don't push the door. ________ it! (PUSH)\"); answer = the opposite of that word in the form the gap needs, one clear answer only. The sentence shows the meaning (often by contrast: \"It isn't heavy. It's ________.\"). Use the TAUGHT OPPOSITES below first; never \"not + word\". The app adds the letter help." },
  "V-SYN": { skill: "vocabulary", label: "Same meaning", answer: "choice", options: 3, kind: "recognise", fit: [1, 4], knobs: ["options"], trains: ["Synonyms", "Meaning"],
    blurb: "A sentence with a word in capitals; children choose the word that means the same in that sentence. The opposite is one of the wrong options, so guessing from the topic doesn't work.",
    sample: { q: "Bats eat BUGS at night.", o: ["insects", "seeds", "fruit"], a: 0 },
    rubric: "Choose the word that means the same as the word in CAPITALS.", el: "Διάλεξε τη λέξη που σημαίνει το ίδιο με τη λέξη με κεφαλαία.", ai: "prompt = a short sentence with ONE unit word in CAPITALS (\"Bats eat BUGS at night.\"); options = 3 words of the same word class and form: one means the same in THIS sentence and can replace it (the answer); where it has one, another is its OPPOSITE; the third fits the topic. Use the TAUGHT SYNONYMS below first; every word is one the class knows." },
  "V-TICK": { skill: "vocabulary", label: "Look and tick or cross", answer: "tf", needs: ["pictures"], kind: "recognise", fit: [0, 1], knobs: [], trains: ["Word recognition", "Reading single words"],
    blurb: "A picture with a word under it: right or wrong? The very first Cambridge Starters task — quick, picture-led and confidence-building for the youngest classes.",
    sample: { pics: ["🍌"], q: "an apple", a: "no" },
    rubric: "Look and read. Write yes or no.", el: "Κοίτα και διάβασε. Γράψε yes ή no.", ai: "Each item (and the example): \"picture\" = ONE word copied from the picture words list (it is printed as a picture); \"prompt\" = a word or short phrase printed under it (a/an + noun, or a plural). Follow the given answer order: for a yes item the prompt names the picture; for a no item the prompt names a DIFFERENT unit word of the same kind (a fruit under a fruit). Never a sentence." },
  // Grammar
  "G-MC": { skill: "grammar", label: "Choose the right form", answer: "choice", options: 3, kind: "recognise", fit: [0, 4], knobs: ["options"], trains: ["The grammar focus"],
    blurb: "A sentence with a gap and three forms; one is right. Every wrong option is a real mistake Greek learners make, so the item teaches as it tests.",
    sample: { q: "She ________ to school every day.", o: ["go", "goes", "going"], a: 1 },
    rubric: "Choose the right answer: a, b or c.", el: "Διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "Sentences with a gap ________ testing the grammar focus; 3 forms as options; context uses unit words." },
  "G-ORDER": { skill: "grammar", label: "Put the words in order", answer: "word", kind: "recall", fit: [0, 4], knobs: [], trains: ["Word order", "Questions and negatives"],
    blurb: "The words of a sentence, mixed up; children write the sentence. Builds word order — especially questions and negatives.",
    sample: { q: "you / do / like / pizza / ?", a: "Do you like pizza?" },
    rubric: "Put the words in order to make sentences.", el: "Βάλε τις λέξεις στη σωστή σειρά για να φτιάξεις προτάσεις.", ai: "prompt = the words of one sentence, jumbled, separated by \" / \"; answer = the full correct sentence." },
  "G-FORM": { skill: "grammar", label: "Write the right form", answer: "word", kind: "recall", fit: [1, 4], knobs: [], trains: ["Verb forms", "Spelling of endings"],
    blurb: "A sentence with the base form in brackets; children write the right form (play → is playing). Recall, not recognition.",
    sample: { q: "Look! The children ________ (play) in the snow.", a: "are playing" },
    rubric: "Write the correct form of the word in brackets.", el: "Γράψε τη σωστή μορφή της λέξης στην παρένθεση.", ai: "Sentences with a gap ________ followed by the base form in brackets, e.g. \"She ________ (play) tennis now.\"; answer = the correct form only." },
  "G-QUEST": { skill: "grammar", label: "Write the questions", answer: "word", kind: "recall", fit: [1, 4], knobs: [], trains: ["Question forms", "Question words"],
    blurb: "An answer with one part in brackets; children write the question that asks for it. Question forms are where most Greek learners slip.",
    sample: { q: "I go to school [by bus].", a: "How do you go to school?" },
    rubric: "Write questions for the answers. Ask about the words in brackets.", el: "Γράψε ερωτήσεις για τις απαντήσεις. Ρώτα για τις λέξεις στην παρένθεση.", ai: "prompt = a short answer sentence with the part being asked about in [square brackets], e.g. \"I go to school [by bus].\"; answer = the question (How do you go to school?). Use the grammar focus and different question words (What, Where, When, Who, How many, Why…)." },
  "G-FIX": { skill: "grammar", label: "Find and fix the mistake", answer: "word", kind: "recall", fit: [2, 4], knobs: [], trains: ["Accuracy", "Self-correction"],
    blurb: "Each sentence has one mistake in brackets; children write the correct word. Trains the eye they need for checking their own writing.",
    sample: { q: "He [don't] like carrots.", a: "doesn't" },
    rubric: "Each sentence has one mistake. Write the correct word.", el: "Κάθε πρόταση έχει ένα λάθος. Γράψε τη σωστή λέξη.", ai: "Sentences with ONE grammar mistake (the grammar focus) marked in [square brackets]; answer = the correct word(s)." },
  "G-CLOZE": { skill: "grammar", label: "Complete the text (one word)", answer: "word", needs: ["passage"], kind: "recall", fit: [2, 4], knobs: ["genre", "length"], trains: ["Grammar words", "Reading for structure"],
    blurb: "A short email or story with numbered gaps and no word box; children write one grammar word in each (a, was, on, who…). The A2 Key open cloze.",
    sample: { text: "Last summer we (1) ________ to the beach (2) ________ my cousins.", q: "(1)", a: "went" },
    rubric: "Read the text. Write ONE word in each gap.", el: "Διάβασε το κείμενο. Γράψε ΜΙΑ λέξη σε κάθε κενό.", ai: "A short connected text (an email, a blog post or a story) about the unit topic with numbered gaps written (1) ________, (2) ________ …, one per item. Each gap is ONE grammar word — an article, preposition, pronoun, auxiliary (is, do, have, was), modal, question word or conjunction — the grammar focus first. Each item: prompt = \"(n)\", answer = that one word. Only one word fits each gap." },
  "G-TRANS": { skill: "grammar", label: "Rewrite the sentences", answer: "word", kind: "create", fit: [2, 4], knobs: [], trains: ["Changing structures", "Meaning stays the same"],
    blurb: "Children change a sentence with the grammar focus (to a question, negative, passive, reported speech…) starting from the words given. Shows they can use it, not just spot it.",
    sample: { q: "She plays tennis. (negative) → She ________", a: "She doesn't play tennis." },
    rubric: "Rewrite the sentences. Begin with the words given.", el: "Ξαναγράψε τις προτάσεις. Ξεκίνα με τις λέξεις που σου δίνονται.", ai: "prompt = a sentence, then in brackets what to change with the grammar focus, then → and the start of the new sentence with ________ (\"She plays tennis. (negative) → She ________\" / \"They built the castle in 1400. → The castle ________\"); answer = the full new sentence. The meaning stays the same." },
  // Writing
  "W-SENT": { skill: "writing", label: "Finish the sentences about you", answer: "open", kind: "create", fit: [0, 2], knobs: ["support"], trains: ["Personal writing", "Sentence building"],
    blurb: "Five or six sentence starters about the child's own life, with a line for each. The gentlest first step into writing for young learners.",
    sample: { lines: ["My favorite room in my house is…", "After school, I usually…"] },
    rubric: "Finish the sentences about you.", el: "Τελείωσε τις προτάσεις για σένα.", ai: "prompt = one short line saying what the sentences are about; frame = 5–6 sentence starters about the student's own life linked to the unit topic, using unit words (\"My favorite room in my house is…\"). Each starter is the BEGINNING of one sentence and ends with … — never underscores, gaps or blanks (the paper prints the writing line after it); sample = a model set of finished sentences, one per starter, separated by new lines." },
  "W-PICTURES": { skill: "writing", label: "Write about the pictures", answer: "open", needs: ["pictures"], kind: "create", fit: [0, 2], knobs: ["support"], trains: ["Telling a story", "Using the unit words"],
    blurb: "Three of the app's pictures in story order and two or three sentence starters; children write a short story. Pictures give them something to say.",
    sample: { pics: ["🐘", "🌊", "🌳"], lines: ["One day, the elephants…"] },
    rubric: "Look at the pictures. Write a short story.", el: "Κοίτα τις εικόνες και γράψε μια μικρή ιστορία.", ai: "\"pictures\" = EXACTLY 3 words copied exactly from the picture words list, in story order (they are printed as the story pictures — never leave it empty, never put them only in the word box); prompt = the task; frame = 2–3 sentence starters ending with …, never gaps or underscores; sample = a model story about those 3 pictures." },
  "W-GUIDED": { skill: "writing", label: "Guided writing", answer: "open", kind: "create", fit: [1, 4], knobs: ["support"], trains: ["Organising ideas", "Using the unit words"],
    blurb: "A writing task on the unit topic with guiding questions. You choose how much support: sentence starters and a word box, or just the questions.",
    sample: { q: "Write about your favorite celebration.", lines: ["When is it?", "What do you eat?", "Why do you like it?"] },
    rubric: "Write about the topic. Use the questions to help you.", el: "Γράψε για το θέμα. Οι ερωτήσεις θα σε βοηθήσουν.", ai: "One writing task on the unit topic: prompt = the task in one sentence; frame = 3–4 guiding questions or sentence starters; sample = a model answer at class level using unit words." },
  "W-MESSAGE": { skill: "writing", label: "Reply to a message", answer: "open", needs: ["passage"], kind: "create", fit: [1, 4], knobs: ["support"], trains: ["Answering all the points", "Friendly letters"],
    blurb: "A short message from a friend that asks three questions; children write a reply that answers them all. Real communication with a clear reason to write.",
    sample: { text: "Hi! What do you do in your free time? Love, Anna", lines: ["Answer Anna's three questions."] },
    rubric: "Read the message and write a reply. Answer all the questions.", el: "Διάβασε το μήνυμα και γράψε απάντηση. Απάντησε σε όλες τις ερωτήσεις.", ai: "passage = a short friendly message from a friend that asks 3 questions about the unit topic; prompt = the task; frame = the 3 points to include; sample = a model reply." },
  "W-EMAIL": { skill: "writing", label: "Write an email", answer: "open", kind: "create", fit: [2, 4], knobs: ["support"], trains: ["Content points", "Openings and endings"],
    blurb: "A situation and three things to include (as in A2 Key Writing). Children plan, cover every point and open and close the email properly.",
    sample: { q: "Write to your friend about your school trip.", lines: ["say where you went", "describe one thing you saw", "invite your friend next time"] },
    rubric: "Write an email. Write about all three points.", el: "Γράψε ένα email. Γράψε και για τα τρία σημεία.", ai: "prompt = the situation in 1–2 sentences (who you write to and why), linked to the unit topic; frame = exactly 3 short content points to include (\"say where you went\", \"describe one thing you saw\", \"invite your friend\"); sample = a model email with a greeting and an ending." },
  "W-STORY": { skill: "writing", label: "Continue the story", answer: "open", kind: "create", fit: [2, 4], knobs: ["support"], trains: ["Narrative", "Past tenses"],
    blurb: "The first lines of a story linked to the unit; children write what happens next, guided by three questions. Imagination with a safe starting point.",
    sample: { q: "When Nikos opened the old box, he couldn't believe his eyes…", lines: ["What was in the box?", "What did he do?", "How did it end?"] },
    rubric: "Read the beginning of the story. Write what happens next.", el: "Διάβασε την αρχή της ιστορίας. Γράψε τι γίνεται μετά.", ai: "prompt = the first 1–2 sentences of the story ITSELF, linked to the unit (a character, a place, a small problem or surprise) — never an instruction like \"Continue the story\" (the instruction is printed already); frame = 3 questions to think about (What happened next? What did … do? How did it end?); sample = a model story that continues those sentences." },
  "W-OPINION": { skill: "writing", label: "Give your opinion", answer: "open", kind: "create", fit: [3, 4], knobs: ["support"], trains: ["Reasons and examples", "Linking words"],
    blurb: "An opinion question — often the unit's Big Question; children answer with reasons and an example, using a paragraph plan. Prepares for B1 writing.",
    sample: { q: "Is free time important? Why?", lines: ["In my opinion…", "First,… Also,…", "For example,…", "To sum up,…"] },
    rubric: "Answer the question. Give reasons and examples.", el: "Απάντησε στην ερώτηση. Δώσε λόγους και παραδείγματα.", ai: "prompt = a question that asks for an opinion — the unit's Big Question when there is one, or a question about the topic (\"Is free time important? Why?\"); frame = a paragraph plan of 4–5 starters (\"In my opinion,…\", \"First,…\", \"Also,…\", \"For example,…\", \"To sum up,…\"); sample = a model answer." },
  // Speaking (teacher-led, one student at a time or in pairs). Students hold speaking cards; the teacher's pack has the
  // questions, follow-ups, model answers and a marking grid (Cambridge YLE / A2 Key style).
  "S-PICTURE": { skill: "speaking", label: "Picture cards: describe and talk", answer: "open", needs: ["pictures"], kind: "create", fit: [0, 2], knobs: [], trains: ["Describing", "Talking about yourself"],
    blurb: "Students look at the app's pictures and answer questions that move from naming and describing to their own life. The YLE way into speaking.",
    sample: { pics: ["🦒", "🐘"], lines: ["What's this?", "What colour is it?", "Do you like…?"] },
    rubric: "Speaking. Look at the pictures. Answer your teacher’s questions.", el: "Προφορικά. Κοίτα τις εικόνες και απάντησε στις ερωτήσεις του δασκάλου.", ai: "pictures = 3–4 unit words FROM THE PICTURE LIST. One card per picture or pair of pictures: questions move from naming and describing (What's this? What colour…? Where…?) to personal links (Do you like…? Have you got…?) and comparing." },
  "S-STORY": { skill: "speaking", label: "Tell the story from pictures", answer: "open", needs: ["pictures"], kind: "create", fit: [0, 3], knobs: [], trains: ["Narrating", "Linking ideas"],
    blurb: "Four pictures in order; the student tells the story with the teacher's prompts (as in Movers and Flyers). Longer turns, with the pictures as a safety net.",
    sample: { pics: ["🐣", "🌧️", "🏠", "😀"], lines: ["Look at the pictures and tell the story."] },
    rubric: "Speaking. Look at the pictures and tell the story.", el: "Προφορικά. Κοίτα τις εικόνες και πες την ιστορία.", ai: "pictures = 4 unit words FROM THE PICTURE LIST that can make a little story, in story order. Card 1: title = the story's title, student = \"Look at the pictures and tell the story.\", keyWords = the 4 picture words, questions = 4 prompts for the teacher, one per picture (What can you see? What happens next? How does … feel?), model = the story told at class level. Card 2: questions about the student's own life linked to the story." },
  "S-QUESTIONS": { skill: "speaking", label: "Topic cards: talk about you", answer: "open", kind: "create", fit: [0, 4], knobs: [], trains: ["Personal answers", "Extending answers"],
    blurb: "Cards about the student's own life linked to the unit, with questions from simple to longer answers and follow-ups for stronger students.",
    sample: { lines: ["My free time", "What do you do after school?", "Tell me about your favourite game."] },
    rubric: "Speaking. Look at the cards and answer your teacher’s questions.", el: "Προφορικά. Κοίτα τις κάρτες και απάντησε στις ερωτήσεις του δασκάλου.", ai: "Topic cards about the student's own life linked to the unit topic (e.g. My free time, My family, A place I like). Each card's questions go from simple (What…? Do you…?) to longer answers (Tell me about… Why…?)." },
  "S-ROLE": { skill: "speaking", label: "Role-play: Student A & B", answer: "open", kind: "create", fit: [1, 4], knobs: [], trains: ["Asking for information", "Interaction"],
    blurb: "Pairs get Student A and Student B cards for the same situation (buying, inviting, planning) and talk to each other. Real interaction, as in A2 Key.",
    sample: { lines: ["Student A: You want to buy a present.", "Student B: You work in a toy store."] },
    rubric: "Speaking. Work with a partner. Read your card and talk.", el: "Προφορικά. Δούλεψε με έναν συμμαθητή. Διάβασε την κάρτα σου και μιλήστε.", ai: "Pair role-plays on the unit topic (asking for information, inviting, buying, planning). Odd cards are for Student A, even cards for Student B in the same situation: 'student' = the situation and what to ask or say; 'questions' = the 3–4 things to ask; 'model' = a short model dialogue." },
  "S-DISCUSS": { skill: "speaking", label: "Talk together: choose and explain", answer: "open", needs: ["pictures"], kind: "create", fit: [2, 4], knobs: [], trains: ["Giving opinions", "Agreeing and disagreeing"],
    blurb: "Five pictures of options for one situation (what to take on a trip, a class party); pairs discuss which are good and agree on the best, as in A2 Key Speaking.",
    sample: { pics: ["🔦", "🧥", "📱", "🍎", "🎸"], lines: ["Which things are good for a camping trip? Why?"] },
    rubric: "Speaking. Look at the pictures. Talk together and choose.", el: "Προφορικά. Κοίτα τις εικόνες. Συζητήστε και διαλέξτε.", ai: "pictures = 5 unit words FROM THE PICTURE LIST that are options for one situation (things to take on a trip, activities for a class party). Card 1: title = the situation, student = \"Talk together. Which ones are good? Which is the best? Why?\", keyWords = useful phrases (I think…, Me too, I don't agree because…), questions = the teacher's prompts (Do you like…? Which is better, … or …? Why?), model = a short model discussion. Card 2: personal follow-up questions on the topic." },
  "S-BQ": { skill: "speaking", label: "Big Question discussion", answer: "open", kind: "create", fit: [2, 4], knobs: [], trains: ["Opinions with reasons", "Using the unit's ideas"],
    blurb: "The unit's Big Question, with idea prompts and examples from its stories, then the student's own opinion. Rounds off the unit with real thinking.",
    sample: { lines: ["What is a hero?", "Give an example from the unit.", "Who is your hero? Why?"] },
    rubric: "Speaking. Talk about the Big Question with your teacher.", el: "Προφορικά. Μίλησε για τη Μεγάλη Ερώτηση με τον δάσκαλο.", ai: "Card 1 = the unit's Big Question with 3 idea prompts; later cards = examples from the unit's stories and readings, then the student's own opinion. Questions ask for reasons and examples (What do you think…? Why? Can you give an example?)." },
};

/** What the learner does, for the selector's colour and label. */
export const KINDS = {
  recognise: { label: "Recognise", hint: "Choose, match or decide — the answer is on the page." },
  recall: { label: "Recall", hint: "Write the word or the answer themselves." },
  create: { label: "Create", hint: "Write or speak freely with the unit's language." },
};

/** Settings a part can have (TASKS[id].knobs). Values are stored on the part as p.opts[key]. */
export const KNOBS = {
  text: { label: "Text" },
  genre: { label: "Text type", values: [["any", "Lingo picks"], ["story", "Story"], ["article", "Fact text"], ["email", "Email / letter"], ["diary", "Diary / blog"], ["dialogue", "Dialogue"], ["notice", "Poster / notice"]] },
  audio: { label: "Recording", values: [["any", "Lingo picks"], ["dialogue", "Dialogue"], ["talk", "Talk / message"], ["interview", "Interview"], ["announcement", "Announcement"]] },
  length: { label: "Text length", values: [["short", "Short"], ["medium", "Medium"], ["long", "Long"]] },
  plays: { label: "Plays", values: [[2, "Twice"], [1, "Once"]] },
  options: { label: "Choices", values: [[3, "a · b · c"], [4, "a · b · c · d"]] },
  hint: { label: "Letter help", values: [["first", "First letter"], ["first2", "First two"], ["firstlast", "First + last"], ["some", "Some letters"], ["count", "Letter count"], ["none", "None"]] },
  family: { label: "Word help", values: [["root", "Word inside"], ["first", "First letter"], ["some", "Some letters"], ["count", "Letter count"], ["none", "None"]] },
  support: { label: "Support", values: [["full", "Lots"], ["some", "Some"], ["none", "None"]] },
  // Word boxes: one word per gap unless the teacher asks for words that fit no gap (the instruction then says how many).
  extras: { label: "Extra words in the box", values: [[0, "None · one per gap"], [1, "+1"], [2, "+2"], [3, "+3"]] },
};

const LEVEL_INDEX = { A_SENIOR: 0, B_SENIOR: 1, C_SENIOR: 2, D_SENIOR: 3, E_SENIOR: 4 };
export const levelIndex = (levelId) => LEVEL_INDEX[levelId] ?? 1;
const LEVEL_LETTERS = "ABCDE";

/** The default of a knob for a class (younger classes get more help). */
export function knobDefault(key, levelId) {
  const i = levelIndex(levelId);
  return {
    text: "", genre: "any", audio: "any", length: "medium", plays: 2, options: 3, extras: 0,
    hint: i <= 1 ? "first" : i === 2 ? "count" : "none",
    support: i <= 1 ? "full" : "some",
    family: i <= 2 ? "root" : i === 3 ? "count" : "none",
  }[key];
}

/** A part's settings with the class defaults filled in: { genre, length, … } for its task's knobs. */
export function partOpts(part, levelId) {
  const t = TASKS[part?.task];
  const out = {};
  for (const k of t?.knobs || []) {
    const v = part?.opts?.[k];
    const ok = k === "text" ? typeof v === "string" : KNOBS[k].values.some(([x]) => x === v);
    out[k] = ok ? v : knobDefault(k, levelId);
  }
  return out;
}

/**
 * How well a task suits a class: "great" (it is made for this class), "stretch" (meant for older classes — a challenge)
 * or "easy" (meant for younger classes), plus a label for the selector.
 */
export function taskFit(taskId, levelId) {
  const t = TASKS[taskId];
  const i = levelIndex(levelId);
  if (!t?.fit) return { fit: "great", label: "" };
  const [a, b] = t.fit;
  const range = a === b ? `${LEVEL_LETTERS[a]} Senior` : `${LEVEL_LETTERS[a]}–${LEVEL_LETTERS[b]} Senior`;
  if (i < a) return { fit: "stretch", label: `A stretch · usually ${range}`, range };
  if (i > b) return { fit: "easy", label: `Easy · usually ${range}`, range };
  return { fit: "great", label: `Great for ${LEVEL_LETTERS[i]} Senior`, range };
}

/** Default task per skill, by level. */
const DEFAULTS = {
  A_SENIOR: { listening: "L-PIC", reading: "R-TF", vocabulary: "V-PIC", grammar: "G-MC", writing: "W-PICTURES", speaking: "S-PICTURE" },
  B_SENIOR: { listening: "L-PIC", reading: "R-TF", vocabulary: "V-PIC", grammar: "G-MC", writing: "W-PICTURES", speaking: "S-PICTURE" },
  C_SENIOR: { listening: "L-MC", reading: "R-MC", vocabulary: "V-BANK", grammar: "G-FORM", writing: "W-GUIDED", speaking: "S-QUESTIONS" },
  D_SENIOR: { listening: "L-MC", reading: "R-MC", vocabulary: "V-BANK", grammar: "G-FORM", writing: "W-EMAIL", speaking: "S-QUESTIONS" },
  E_SENIOR: { listening: "L-MC", reading: "R-MC", vocabulary: "V-BANK", grammar: "G-FORM", writing: "W-OPINION", speaking: "S-QUESTIONS" },
};
export function defaultTask(skill, levelId) {
  return (DEFAULTS[levelId] || DEFAULTS.B_SENIOR)[skill];
}

/** Second task for a skill that appears twice in a test, by level (recognise first, then recall). */
const SECONDS = {
  A_SENIOR: { listening: "L-MATCH", reading: "R-WHO", vocabulary: "V-MATCH", grammar: "G-ORDER", writing: "W-SENT", speaking: "S-STORY" },
  B_SENIOR: { listening: "L-YN", reading: "R-QA", vocabulary: "V-MATCH", grammar: "G-ORDER", writing: "W-MESSAGE", speaking: "S-ROLE" },
  C_SENIOR: { listening: "L-GAP", reading: "R-QA", vocabulary: "V-DEF", grammar: "G-QUEST", writing: "W-EMAIL", speaking: "S-BQ" },
  D_SENIOR: { listening: "L-NOTES", reading: "R-GAP", vocabulary: "V-COLLOC", grammar: "G-CLOZE", writing: "W-STORY", speaking: "S-DISCUSS" },
  E_SENIOR: { listening: "L-NOTES", reading: "R-WORDS", vocabulary: "V-FORM", grammar: "G-TRANS", writing: "W-STORY", speaking: "S-BQ" },
};
export function secondTask(skill, levelId) {
  return (SECONDS[levelId] || SECONDS.B_SENIOR)[skill];
}

/** The tasks of a skill: best for the class first, then the rest in catalogue order. */
export function tasksFor(skill, levelId = null) {
  const list = Object.entries(TASKS).filter(([, t]) => t.skill === skill).map(([id, t]) => ({ id, ...t }));
  if (!levelId) return list;
  const rank = { great: 0, stretch: 1, easy: 2 };
  return list.map((t, i) => ({ t, i, r: rank[taskFit(t.id, levelId).fit] })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.t);
}

/** Two-answer labels for a level: yes/no for A–B Senior (as in YLE), T/F for older classes. */
export function tfLabels(levelId) {
  return ["A_SENIOR", "B_SENIOR"].includes(levelId) ? ["yes", "no"] : ["T", "F"];
}

/** The student rubric (English and Greek) of a task for a level. */
export function rubricFor(taskId, levelId) {
  const t = TASKS[taskId];
  if (!t) return { en: "", el: "" };
  const older = t.rubricOlder && tfLabels(levelId)[0] === "T";
  return { en: older ? t.rubricOlder : t.rubric, el: older ? t.elOlder || t.el : t.el };
}

/* ── Dictation styles ─────────────────────────────────────────────── */
export const DICTATION_STYLES = {
  classic: { label: "Classic", hint: "You read, they write each sentence.", el: "Άκου και γράψε κάθε πρόταση.", rubric: "Listen and write the sentences." },
  gapped: { label: "Gapped", hint: "They fill the missing words while you read.", el: "Άκου και συμπλήρωσε τις λέξεις που λείπουν.", rubric: "Listen and write the missing words." },
  running: { label: "Running", hint: "Text on the wall; runners memorise, writers write.", el: "Ο «δρομέας» διαβάζει το κείμενο στον τοίχο και το λέει στον «γραφέα».", rubric: "Running dictation: the runner reads the text on the wall and tells the writer. Write the text." },
  dictogloss: { label: "Dictogloss", hint: "Read a short text twice; pairs rebuild it.", el: "Άκου το κείμενο δύο φορές, κράτα σημειώσεις και ξαναγράψ' το με τον διπλανό σου.", rubric: "Listen twice and take notes. Then write the text again with your partner." },
  picture: { label: "Picture", hint: "They find the picture and write the word.", el: "Άκου, βρες την εικόνα και γράψε τη λέξη και τον αριθμό της πρότασης.", rubric: "Listen. Find the picture and write the number of the sentence and the word." },
};

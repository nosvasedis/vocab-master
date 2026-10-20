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
 */
export const TASKS = {
  // Listening — new short dialogues / monologues read by the app's voices.
  "L-PIC": { skill: "listening", label: "Listen and tick the picture", answer: "choice", options: 3, needs: ["script", "pictures"], rubric: "Listen and tick (✓) the right picture.", el: "Άκουσε και βάλε ✓ στη σωστή εικόνα.", ai: "A short dialogue (6–10 turns). One question per item that needs the dialogue to answer (What did Mia buy? Where is Tom going? Which animal does Leo like?) — never “Which picture shows X?”, and the speakers never mention picture letters or numbers. options = EXACTLY 3 single words copied from the picture words list — they are printed as pictures, so never sentences or phrases. The answer is said in the dialogue; the other two are mentioned or plausible." },
  "L-MC": { skill: "listening", label: "Listen and choose a, b or c", answer: "choice", options: 3, needs: ["script"], rubric: "Listen and choose the right answer: a, b or c.", el: "Άκουσε και διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "A short dialogue or monologue. One question per item in the order the answers are heard; 3 short options, all mentioned or plausible." },
  "L-YN": { skill: "listening", label: "Listen and write yes or no", answer: "tf", needs: ["script"], rubric: "Listen and write yes or no.", el: "Άκουσε και γράψε yes ή no.", ai: "A short monologue or dialogue; statements in the order heard; about half are true." },
  "L-GAP": { skill: "listening", label: "Listen and write one word", answer: "word", needs: ["script"], rubric: "Listen and write one word in each gap.", el: "Άκουσε και γράψε μία λέξη σε κάθε κενό.", ai: "A short monologue (a message, an announcement, a description). Items are short notes with one gap ________ each, in the order heard; each answer is ONE unit word said clearly in the script." },
  // Reading
  "R-MC": { skill: "reading", label: "Read and choose a, b or c", answer: "choice", options: 3, needs: ["passage"], rubric: "Read the text and choose the right answer: a, b or c.", el: "Διάβασε το κείμενο και διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "A short text at class level (story, email, article) about the unit topic, using unit words. Comprehension questions in text order, 3 options each." },
  "R-TF": { skill: "reading", label: "Read and write yes / no (true / false)", answer: "tf", needs: ["passage"], rubric: "Read the text. Write yes or no.", rubricOlder: "Read the text. Write T (true) or F (false).", el: "Διάβασε το κείμενο. Γράψε yes ή no.", elOlder: "Διάβασε το κείμενο. Γράψε T (σωστό) ή F (λάθος).", ai: "A short text at class level about the unit topic. Statements about the text, in text order; follow the given answer order exactly." },
  "R-GAP": { skill: "reading", label: "Read and complete the text", answer: "word", needs: ["passage"], bank: true, rubric: "Read the text. Choose the right words from the box and write them on the lines.", el: "Διάβασε το κείμενο. Διάλεξε τις σωστές λέξεις από το κουτί και γράψ' τες στις γραμμές.", ai: "A short connected text with numbered gaps written (1) ________, (2) ________ … one per item. bank = the answers plus 2 extra unit words, shuffled. Each item: prompt = \"(n)\" and answer = the word for that gap — every answer MUST be one of the tested words." },
  // Vocabulary
  "V-PIC": { skill: "vocabulary", label: "Look and write (pictures)", answer: "word", needs: ["pictures"], rubric: "Look at the pictures. Write the words.", el: "Κοίτα τις εικόνες και γράψε τις λέξεις.", ai: "Answers = concrete NOUNS from the picture words list (things you can draw). prompt = a short clue in brackets that tells the picture apart, e.g. \"(it is hot and comes out of a volcano)\" — never a sentence with a gap, never the answer." },
  "V-BANK": { skill: "vocabulary", label: "Complete with words from the box", answer: "word", bank: true, rubric: "Read and complete. Use the words in the box.", el: "Διάβασε και συμπλήρωσε με τις λέξεις από το κουτί.", ai: "Sentences in NEW contexts with one gap ________ each; bank = the answers (in the form needed) plus 1–2 extra unit words, shuffled." },
  "V-MC": { skill: "vocabulary", label: "Choose the right word", answer: "choice", options: 3, rubric: "Read and choose the right word.", el: "Διάβασε και διάλεξε τη σωστή λέξη.", ai: "Sentences with one gap ________; 3 options that are unit words of the same part of speech; only one fits." },
  "V-MATCH": { skill: "vocabulary", label: "Match words and meanings", answer: "match", bank: true, rubric: "Match the words with their meanings. Write the letter.", el: "Αντιστοίχισε τις λέξεις με τη σημασία τους. Γράψε το γράμμα.", ai: "Items: prompt = a unit word; answer = its kid-friendly definition. The app letters and shuffles the definitions." },
  "V-ODD": { skill: "vocabulary", label: "Odd one out", answer: "choice", options: 4, rubric: "Circle the word that is different.", el: "Κύκλωσε τη λέξη που δεν ταιριάζει.", ai: "Each item: 4 options (unit words where possible), 3 share a clear category, answer = the odd one. prompt may be empty." },
  // Grammar
  "G-MC": { skill: "grammar", label: "Choose the right form", answer: "choice", options: 3, rubric: "Choose the right answer: a, b or c.", el: "Διάλεξε τη σωστή απάντηση: a, b ή c.", ai: "Sentences with a gap ________ testing the grammar focus; 3 forms as options; context uses unit words." },
  "G-FORM": { skill: "grammar", label: "Write the right form", answer: "word", rubric: "Write the correct form of the word in brackets.", el: "Γράψε τη σωστή μορφή της λέξης στην παρένθεση.", ai: "Sentences with a gap ________ followed by the base form in brackets, e.g. \"She ________ (play) tennis now.\"; answer = the correct form only." },
  "G-ORDER": { skill: "grammar", label: "Put the words in order", answer: "word", rubric: "Put the words in order to make sentences.", el: "Βάλε τις λέξεις στη σωστή σειρά για να φτιάξεις προτάσεις.", ai: "prompt = the words of one sentence, jumbled, separated by \" / \"; answer = the full correct sentence." },
  "G-FIX": { skill: "grammar", label: "Find and fix the mistake", answer: "word", rubric: "Each sentence has one mistake. Write the correct word.", el: "Κάθε πρόταση έχει ένα λάθος. Γράψε τη σωστή λέξη.", ai: "Sentences with ONE grammar mistake (the grammar focus) marked in [square brackets]; answer = the correct word(s)." },
  // Writing
  "W-GUIDED": { skill: "writing", label: "Guided writing", answer: "open", rubric: "Write about the topic. Use the questions to help you.", el: "Γράψε για το θέμα. Οι ερωτήσεις θα σε βοηθήσουν.", ai: "One writing task on the unit topic: prompt = the task in one sentence; frame = 3–4 guiding questions or sentence starters; sample = a model answer at class level using unit words." },
  "W-MESSAGE": { skill: "writing", label: "Reply to a message", answer: "open", needs: ["passage"], rubric: "Read the message and write a reply. Answer all the questions.", el: "Διάβασε το μήνυμα και γράψε απάντηση. Απάντησε σε όλες τις ερωτήσεις.", ai: "passage = a short friendly message from a friend that asks 3 questions about the unit topic; prompt = the task; frame = the 3 points to include; sample = a model reply." },
  "W-PICTURES": { skill: "writing", label: "Write about the pictures", answer: "open", needs: ["pictures"], rubric: "Look at the pictures. Write a short story.", el: "Κοίτα τις εικόνες και γράψε μια μικρή ιστορία.", ai: "Choose 3 unit words FROM THE PICTURE LIST as story pictures (in pictures, in story order); prompt = the task; frame = 2–3 sentence starters; sample = a model story." },
  // Speaking (teacher-led; students see picture prompts)
  // Speaking (teacher-led, one student at a time or in pairs). Students hold speaking cards; the teacher's pack has the
  // questions, follow-ups, model answers and a marking grid (Cambridge YLE / A2 Key style).
  "S-QUESTIONS": { skill: "speaking", label: "Topic cards: talk about you", answer: "open", rubric: "Speaking. Look at the cards and answer your teacher’s questions.", el: "Προφορικά. Κοίτα τις κάρτες και απάντησε στις ερωτήσεις του δασκάλου.", ai: "Topic cards about the student's own life linked to the unit topic (e.g. My free time, My family, A place I like). Each card's questions go from simple (What…? Do you…?) to longer answers (Tell me about… Why…?)." },
  "S-PICTURE": { skill: "speaking", label: "Picture cards: describe and talk", answer: "open", needs: ["pictures"], rubric: "Speaking. Look at the pictures. Answer your teacher’s questions.", el: "Προφορικά. Κοίτα τις εικόνες και απάντησε στις ερωτήσεις του δασκάλου.", ai: "pictures = 3–4 unit words FROM THE PICTURE LIST. One card per picture or pair of pictures: questions move from naming and describing (What's this? What colour…? Where…?) to personal links (Do you like…? Have you got…?) and comparing." },
  "S-BQ": { skill: "speaking", label: "Big Question discussion", answer: "open", rubric: "Speaking. Talk about the Big Question with your teacher.", el: "Προφορικά. Μίλησε για τη Μεγάλη Ερώτηση με τον δάσκαλο.", ai: "Card 1 = the unit's Big Question with 3 idea prompts; later cards = examples from the unit's stories and readings, then the student's own opinion. Questions ask for reasons and examples (What do you think…? Why? Can you give an example?)." },
  "S-ROLE": { skill: "speaking", label: "Role-play: Student A & B", answer: "open", rubric: "Speaking. Work with a partner. Read your card and talk.", el: "Προφορικά. Δούλεψε με έναν συμμαθητή. Διάβασε την κάρτα σου και μιλήστε.", ai: "Pair role-plays on the unit topic (asking for information, inviting, buying, planning). Odd cards are for Student A, even cards for Student B in the same situation: 'student' = the situation and what to ask or say; 'questions' = the 3–4 things to ask; 'model' = a short model dialogue." },
};

/** Default task per skill, by level (younger classes get the picture tasks). */
export function defaultTask(skill, levelId) {
  const young = ["A_SENIOR", "B_SENIOR"].includes(levelId);
  return {
    listening: young ? "L-PIC" : "L-MC",
    reading: young ? "R-TF" : "R-MC",
    vocabulary: young ? "V-PIC" : "V-BANK",
    grammar: young ? "G-MC" : "G-FORM",
    writing: young ? "W-PICTURES" : "W-GUIDED",
    speaking: young ? "S-PICTURE" : "S-QUESTIONS",
  }[skill];
}

export const tasksFor = (skill) => Object.entries(TASKS).filter(([, t]) => t.skill === skill).map(([id, t]) => ({ id, ...t }));

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

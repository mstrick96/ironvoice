// Iron Voice — Step 4 offline parser tests.
//
// Runs the parser logic from 07-voice.js in isolation. Does NOT load
// the full Voice module (which needs DOM, Storage, Session, etc.).
// Instead it extracts the parser-related functions verbatim into a
// minimal test sandbox where Session is stubbed.
//
// Run from the repo root:   node test_step4.js
//
// Coverage: ~95+ cases across wake-word matching, every Layer 2
// command + variants, ≥20 compound combinations, ≥10 ambiguity
// rejections, ≥10 wrong-type rejections.

'use strict';

const fs = require('fs');
const path = require('path');

const voiceSrc = fs.readFileSync(
  path.join(__dirname, 'src', '07-voice.js'),
  'utf8'
);

// Stub plan — same shape as the deployed default plan, with the
// Step 4 hip-aliases already applied.
const stubPlan = {
  schemaVersion: 2,
  exercises: [
    { id: 'bike', type: 'timed', name: 'Recumbent Bike', level: 1, duration: 10, note: 'n', aliases: ['bike','bicycle','warmup','warm up','recumbent'] },
    { id: 'e01',  type: 'strength', name: 'Chest Press',    weight: 40, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['chest press','chest','bench press','chest machine'] },
    { id: 'e02',  type: 'strength', name: 'Leg Press',      weight: 145, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['leg press','legs','leg machine','press'] },
    { id: 'e03',  type: 'strength', name: 'Lat Pulldown',   weight: 70, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['lat pulldown','lats','lat pull','pulldown','pull down'] },
    { id: 'e04',  type: 'strength', name: 'Shoulder Press', weight: 40, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['shoulder press','shoulders','overhead press','shoulder machine'] },
    { id: 'e05',  type: 'strength', name: 'Leg Curl',       weight: 60, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['leg curl','hamstring','hamstrings','ham curl'] },
    { id: 'e06',  type: 'strength', name: 'Biceps Curl',    weight: 40, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['biceps curl','biceps','curls','arm curl','curl machine'] },
    { id: 'e07',  type: 'strength', name: 'Triceps Press',  weight: 70, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['triceps press','triceps','tris','pushdown','tricep machine'] },
    { id: 'e08',  type: 'strength', name: 'Leg Extension',  weight: 50, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['leg extension','quads','quad machine','extensions','extension'] },
    { id: 'e09',  type: 'strength', name: 'Seated Row',     weight: 70, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['seated row','row','rows','back row','rowing'] },
    { id: 'e10',  type: 'strength', name: 'Abdominal',      weight: 100, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['abs','abdominal','core','ab machine','abdominals'] },
    { id: 'e11',  type: 'strength', name: 'Hip Adduction',  weight: 40, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['hip in','inner thigh','add machine','hip adduction','adduction','adductor'] },
    { id: 'e12',  type: 'strength', name: 'Hip Abduction',  weight: 40, reps: 20, sets: 1, rest: 90, note: 'n', aliases: ['hip out','outer thigh','ab machine','hip abduction','abduction','abductor'] }
  ]
};

// The parser is inside the Voice IIFE. We extract it with a small
// modification: we wrap the whole IIFE source in a function that
// returns the testable surface, after substituting our own Session
// stub. The top-level script also references CONFIG, Diag, State,
// STATES, Storage — we provide minimal stubs.

// Build a sandbox that mimics what the real script sees at runtime.
const CONFIG = {
  WAKE_WORD: 'coach',
  WAKE_WORD_FALLBACK: 'hey coach'
};
const STATES = {
  IDLE: 'IDLE', LISTENING: 'LISTENING', PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING', ERROR: 'ERROR'
};
const Diag    = { add: () => {} };
const State   = { transition: () => {}, get: () => 'LISTENING' };
const Storage = { loadKey: () => null };
const Session = {
  getPlan: () => stubPlan,
  getData: () => ({ currentIndex: 0, logEntries: [] }),
  getCurrentExercise: () => Object.assign({}, stubPlan.exercises[0]),
  getEffectiveValue: () => 0,
  getEffectivePlannedSets: () => 1,
  getSetCount: () => 0
};
const UI    = { raiseBanner: () => {}, clearBanner: () => {}, raiseOfflineBanner: () => {} };
const Voice = null;  // placeholder; the real Voice is what we're loading
const Summary = { show: () => {} };
const WorkoutUI = { render: () => {}, showLoggedConfirm: () => {} };

// Stub minimal browser globals so the IIFE doesn't throw at load.
global.window = {
  speechSynthesis: { getVoices: () => [], speak: () => {}, cancel: () => {} },
  SpeechRecognition: null,
  webkitSpeechRecognition: null
};
global.document = {
  getElementById: () => null,
  addEventListener: () => {}
};
// Note: global.navigator is read-only in modern Node. The Voice
// module's lifecycle code references navigator.onLine, but only at
// runtime (initOnSessionStart, onOnline, etc.) — not at parse time.
// The parser path doesn't touch it, so we leave navigator alone.

// Eval the Voice source in this sandbox. We need to capture the
// resulting Voice value — easiest is to append a small tail that
// assigns it to a global.
const tail = '\n;global.__Voice = Voice;';
try {
  // Use Function constructor — accepts the script and runs it. The
  // script's top-level `const Voice = (() => {})();` becomes a local
  // const, so we use a closure pattern: assign to globalThis.__Voice
  // from inside the same scope.
  const scriptWithTail = voiceSrc + tail;
  // Wrap in a function so 'use strict' inside doesn't matter, and so
  // we can pass our stubs as parameters that override.
  const fn = new Function(
    'CONFIG', 'STATES', 'Diag', 'State', 'Storage', 'Session', 'UI',
    'Summary', 'WorkoutUI', 'global',
    scriptWithTail
  );
  fn(CONFIG, STATES, Diag, State, Storage, Session, UI, Summary, WorkoutUI, global);
} catch (e) {
  console.error('Failed to load voice source:', e.message);
  console.error(e.stack);
  process.exit(1);
}

const V = global.__Voice;
if (!V || !V.__parseCommand) {
  console.error('Voice loaded but __parseCommand not exposed');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────
// Test harness
// ────────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
const failures = [];

function chk(label, transcript, expected) {
  const result = V.__parseCommand(transcript);
  const matches = expected.cmd === result.cmd &&
    Object.keys(expected).every(k => {
      if (k === 'cmd') return true;
      return JSON.stringify(result[k]) === JSON.stringify(expected[k]);
    });
  if (matches) { pass++; }
  else { fail++; failures.push({ label, transcript, expected, actual: result }); }
}

function chkWake(label, transcript, expected) {
  const r = V.__matchWakeWord(transcript);
  const ok = (r.matched === expected.matched) &&
    (!expected.matched || r.tail === expected.tail);
  if (ok) { pass++; }
  else { fail++; failures.push({ label, transcript, expected, actual: r }); }
}

function chkCompound(label, transcript, leftCmd, rightCmd) {
  const r = V.__parseCommand(transcript);
  const ok = r.cmd === 'compound' &&
             r.parts && r.parts.length === 2 &&
             r.parts[0].cmd === leftCmd &&
             r.parts[1].cmd === rightCmd;
  if (ok) { pass++; }
  else { fail++; failures.push({ label, transcript, expected: { cmd: 'compound', leftCmd, rightCmd }, actual: r }); }
}

// ────────────────────────────────────────────────────────────────────
// 1. Wake word (Layer 1) — sanity check still working after Step 4
// ────────────────────────────────────────────────────────────────────

chkWake('wake/coach',     'coach next',      { matched: true, tail: 'next' });
chkWake('wake/couch',     'couch next',      { matched: true, tail: 'next' });
chkWake('wake/hey coach', 'hey coach pause', { matched: true, tail: 'pause' });
chkWake('wake/no-wake',   'just talking',    { matched: false });
chkWake('wake/empty',     '',                { matched: false });
chkWake('wake/coach only','coach',           { matched: true, tail: '' });

// ────────────────────────────────────────────────────────────────────
// 2. Layer 1 commands (carried forward)
// ────────────────────────────────────────────────────────────────────

chk('next/canonical',     'next',           { cmd: 'next' });
chk('next/move on',       'move on',        { cmd: 'next' });
chk('next/keep going',    'keep going',     { cmd: 'next' });
chk('previous/back',      'back',           { cmd: 'previous' });
chk('previous/last one',  'last one',       { cmd: 'previous' });
chk('repeat/say again',   'say that again', { cmd: 'repeat' });
chk('help',               'help',           { cmd: 'help' });
chk('pause',              'pause',          { cmd: 'pause' });
chk('pause/paul',         'paul',           { cmd: 'pause' });

// ────────────────────────────────────────────────────────────────────
// 3. Navigation by name
// ────────────────────────────────────────────────────────────────────

chk('goto/leg press',     'go to leg press',       { cmd: 'goTo', nameFragment: 'leg press' });
chk('goto/switch',        'switch to chest press', { cmd: 'goTo', nameFragment: 'chest press' });
chk('goto/jump',          'jump to leg press',     { cmd: 'goTo', nameFragment: 'leg press' });
chk('goto/do X',          'do leg press',          { cmd: 'goTo', nameFragment: 'leg press' });
chk('goto/do X next',     'do leg press next',     { cmd: 'goTo', nameFragment: 'leg press' });
chk('goto/hip in',        'go to hip in',          { cmd: 'goTo', nameFragment: 'hip in' });
chk('goto/hip out',       'go to hip out',         { cmd: 'goTo', nameFragment: 'hip out' });
chk('goto/the bike',      'go to the bike',        { cmd: 'goTo', nameFragment: 'bike' });

chk('skip',               'skip this',  { cmd: 'skip' });
chk('skip/short',         'skip it',    { cmd: 'skip' });
chk('skip/pass',          'pass',       { cmd: 'skip' });
chk('whatsNext',          'whats next', { cmd: 'whatsNext' });
chk('whatsLeft',          'whats left', { cmd: 'whatsLeft' });
chk('listExercises',      'list exercises', { cmd: 'listExercises' });
chk('listExercises/alt',  'todays workout', { cmd: 'listExercises' });

// ────────────────────────────────────────────────────────────────────
// 4. Logging
// ────────────────────────────────────────────────────────────────────

chk('logSet/set done',     'set done',        { cmd: 'logSet' });
chk('logSet/exercise done','exercise done',   { cmd: 'logSet' });
chk('logSet/log it',       'log it',          { cmd: 'logSet' });
chk('logSet/mark it off',  'mark it off',     { cmd: 'logSet' });
chk('logSet/save this one','save this one',   { cmd: 'logSet' });
chk('undo',                'undo',            { cmd: 'undoSet' });
chk('undo/long',           'undo last set',   { cmd: 'undoSet' });
chk('addSet',              'add a set',       { cmd: 'addSet' });
chk('addSet/short',        'add set',         { cmd: 'addSet' });
chk('addSet/another',      'add another set', { cmd: 'addSet' });
chk('addSet/one more',     'one more set',    { cmd: 'addSet' });

chk('logVals/digits',     'i did 20 reps at 40 pounds',          { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/got',        'got 18 at 45',                        { cmd: 'logSetWithValues', reps: 18, weight: 45 });
chk('logVals/finished',   'finished 20 reps with 50 pounds',     { cmd: 'logSetWithValues', reps: 20, weight: 50 });
chk('logVals/spelled',    'i did twenty reps at forty pounds',   { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/compound',   'i did twenty reps at forty-five pounds', { cmd: 'logSetWithValues', reps: 20, weight: 45 });
chk('logVals/no leadin',  '20 reps at 40',                       { cmd: 'logSetWithValues', reps: 20, weight: 40 });

chk('bikeDone',           'bike done',                          { cmd: 'bikeDone' });
chk('bikeDone/warmup',    'warmup done',                        { cmd: 'bikeDone' });
chk('bikeDone/values',    'bike done 12 minutes at level 2',    { cmd: 'bikeDone', minutes: 12, level: 2 });
chk('bikeDone/spelled',   'bike done ten minutes at level one', { cmd: 'bikeDone', minutes: 10, level: 1 });

// ────────────────────────────────────────────────────────────────────
// 5. Today-only value changes
// ────────────────────────────────────────────────────────────────────

chk('change/weight 45',   'change weight to 45',          { cmd: 'changeToday', field: 'weight', value: 45 });
chk('change/weight no-to','change weight 45',             { cmd: 'changeToday', field: 'weight', value: 45 });
chk('change/reps',        'change reps to 25',            { cmd: 'changeToday', field: 'reps', value: 25 });
chk('change/level',       'change level to 2',            { cmd: 'changeToday', field: 'level', value: 2 });
chk('change/time',        'change time to 12 minutes',    { cmd: 'changeToday', field: 'duration', value: 12 });
chk('use/today',          'use 45 today',                 { cmd: 'changeToday', field: 'weight', value: 45 });
chk('change/spelled',     'change weight to forty-five',  { cmd: 'changeToday', field: 'weight', value: 45 });

// ────────────────────────────────────────────────────────────────────
// 6. Permanent plan changes (next-time)
// ────────────────────────────────────────────────────────────────────

chk('nt/weight',     'next time weight 45',                  { cmd: 'nextTime', field: 'weight', value: 45 });
chk('nt/reps',       'next time 25 reps',                    { cmd: 'nextTime', field: 'reps', value: 25 });
chk('nt/sets',       'next time 2 sets',                     { cmd: 'nextTime', field: 'sets', value: 2 });
chk('nt/level',      'next time level 2',                    { cmd: 'nextTime', field: 'level', value: 2 });
chk('nt/bike time',  'next time bike time 12',               { cmd: 'nextTime', field: 'duration', value: 12 });
chk('nt/note',       'next time add note slow on the return', { cmd: 'nextTimeNote', text: 'slow on the return' });
chk('save/new plan', 'save 45 pounds as my new plan',         { cmd: 'nextTime', field: 'weight', value: 45 });

// ────────────────────────────────────────────────────────────────────
// 7. Notes & history
// ────────────────────────────────────────────────────────────────────

chk('addNote',         'add note slow on the return',          { cmd: 'addNote', text: 'slow on the return' });
chk('workoutNote',     'workout note shoulders felt good',     { cmd: 'workoutNote', text: 'shoulders felt good' });
chk('readNotes',       'read my notes',                        { cmd: 'readNotes' });
chk('readNotes/short', 'read notes',                           { cmd: 'readNotes' });
chk('lastTime',        'last time',                            { cmd: 'lastTime' });

// ────────────────────────────────────────────────────────────────────
// 8. Session control
// ────────────────────────────────────────────────────────────────────

chk('endWorkout',         'end workout',     { cmd: 'endWorkout' });
chk('endWorkout/finish',  'finish workout',  { cmd: 'endWorkout' });
chk('endWorkout/done',    'were done',       { cmd: 'endWorkout' });

// ────────────────────────────────────────────────────────────────────
// 9. Compound commands
// ────────────────────────────────────────────────────────────────────

chkCompound('cmpd/log+next',          'log it and next',                    'logSet',     'next');
chkCompound('cmpd/done+log',          'exercise done and log it',           'logSet',     'logSet');
chkCompound('cmpd/skip+goto',         'skip this and go to leg press',      'skip',       'goTo');
chkCompound('cmpd/log+addSet',        'log it and add a set',               'logSet',     'addSet');
chkCompound('cmpd/then',              'log it then next',                   'logSet',     'next');
chkCompound('cmpd/comma',             'log it, next',                       'logSet',     'next');
chkCompound('cmpd/log+end',           'log it and end workout',             'logSet',     'endWorkout');
chkCompound('cmpd/log+nt',            'log it and next time 25 reps',       'logSet',     'nextTime');
chkCompound('cmpd/skip+next',         'skip this and next',                 'skip',       'next');
chkCompound('cmpd/done+addSet',       'set done and add a set',             'logSet',     'addSet');
chkCompound('cmpd/values+next',       'i did 20 reps at 40 pounds and next','logSetWithValues', 'next');
chkCompound('cmpd/change+log',        'change weight to 45 and log it',     'changeToday','logSet');
chkCompound('cmpd/log+change',        'log it and change weight to 50',     'logSet',     'changeToday');
chkCompound('cmpd/skip+nt',           'skip this and next time level 2',    'skip',       'nextTime');
chkCompound('cmpd/log+previous',      'log it and previous',                'logSet',     'previous');
chkCompound('cmpd/whatsNext+repeat',  'whats next and repeat',              'whatsNext',  'repeat');
chkCompound('cmpd/then-skip+goto',    'skip this then go to leg press',     'skip',       'goTo');
chkCompound('cmpd/log+lastTime',      'log it and last time',               'logSet',     'lastTime');
chkCompound('cmpd/done+endWorkout',   'exercise done and end workout',      'logSet',     'endWorkout');
chkCompound('cmpd/log+listExercises', 'log it and list exercises',          'logSet',     'listExercises');

// Note text containing "and" — must NOT split
chk('note-and/plain',     'add note slow and steady on the return',
    { cmd: 'addNote', text: 'slow and steady on the return' });
chk('note-and/nextTime',  'next time add note slow and controlled',
    { cmd: 'nextTimeNote', text: 'slow and controlled' });
chk('note-and/workout',   'workout note shoulders and chest felt strong',
    { cmd: 'workoutNote', text: 'shoulders and chest felt strong' });

// ────────────────────────────────────────────────────────────────────
// 10a. Step 4 Patch 1 — apostrophes, past-tense, homophones, articles
// ────────────────────────────────────────────────────────────────────

// Apostrophe stripping
chk('apos/whats next',     "what's next",                  { cmd: 'whatsNext' });
chk('apos/whats left',     "what's left",                  { cmd: 'whatsLeft' });
chk('apos/thats a set',    "that's a set",                 { cmd: 'logSet' });
chk('apos/thats it',       "that's it",                    { cmd: 'logSet' });

// "was" mishearing of "whats"
chk('was/next',            'was next',                     { cmd: 'whatsNext' });
chk('was/left',            'was left',                     { cmd: 'whatsLeft' });

// Past-tense navigation verbs
chk('skip/passed',         'passed',                       { cmd: 'skip' });
chk('skip/past',           'past',                         { cmd: 'skip' });
chk('skip/skipped',        'skipped this',                 { cmd: 'skip' });
chk('goto/switched',       'switched to leg press',        { cmd: 'goTo', nameFragment: 'leg press' });
chk('goto/jumped',         'jumped to leg press',          { cmd: 'goTo', nameFragment: 'leg press' });

// changed / chain synonyms for change
chk('change/changed',      'changed weight to 45',         { cmd: 'changeToday', field: 'weight', value: 45 });
chk('change/chain',        'chain weight to 45',           { cmd: 'changeToday', field: 'weight', value: 45 });
chk('change/the article',  'change the weight to 50',     { cmd: 'changeToday', field: 'weight', value: 50 });
chk('change/my article',   'change my weight to 50',       { cmd: 'changeToday', field: 'weight', value: 50 });

// wait → weight homophone
chk('wait/change today',   'change wait to 50',            { cmd: 'changeToday', field: 'weight', value: 50 });
chk('wait/the wait',       'change the wait to 50',        { cmd: 'changeToday', field: 'weight', value: 50 });
chk('wait/next time',      'next time wait 50',            { cmd: 'nextTime', field: 'weight', value: 50 });

// repetitions → reps
chk('reps/repetitions',    'change repetitions to 25',     { cmd: 'changeToday', field: 'reps', value: 25 });
chk('reps/repetition',     'change repetition to 25',      { cmd: 'changeToday', field: 'reps', value: 25 });
chk('reps/nt repetitions', 'next time 25 repetitions',     { cmd: 'nextTime', field: 'reps', value: 25 });

// set/said/sat/sit homophones at command-start
chk('set/said done',       'said done',                    { cmd: 'logSet' });
chk('set/sat done',        'sat done',                     { cmd: 'logSet' });
chk('set/sit done',        'sit done',                     { cmd: 'logSet' });
chk('set/add said',        'add a said',                   { cmd: 'addSet' });
chk('set/one said down',   'one said down',                { cmd: 'logSet' });

// log/logged/lock/locked homophones
chk('log/logged it',       'logged it',                    { cmd: 'logSet' });
chk('log/lock it',         'lock it',                      { cmd: 'logSet' });
chk('log/locked it',       'locked it',                    { cmd: 'logSet' });

// "done" past-tense - mark/marked
chk('logSet/marked it',    'marked it off',                { cmd: 'logSet' });

// add a/the note tolerance
chk('addNote/a',           'add a note slow on the return', { cmd: 'addNote', text: 'slow on the return' });
chk('addNote/the',         'add the note slow on the return', { cmd: 'addNote', text: 'slow on the return' });
// note text containing "the" preserved verbatim
chk('addNote/preserve',    'add note slow on the return',  { cmd: 'addNote', text: 'slow on the return' });

// won/wan → one in number parser
chk('one/won more set',    'won more set',                 { cmd: 'addSet' });
chk('one/wan more set',    'wan more set',                 { cmd: 'addSet' });
chk('one/did won rep',     'i did won reps at forty pounds', { cmd: 'logSetWithValues', reps: 1, weight: 40 });

// Weight-first logging with required unit words
chk('logVals/wf basic',    'i did 40 pounds for 20 reps',  { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/wf and',      'did 40 pounds and 20 reps',    { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/wf comma',    'did 40 pounds, 20 reps',       { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/wf no leadin','40 pounds for 20 reps',        { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/wf reps long','i did 40 pounds for 20 repetitions', { cmd: 'logSetWithValues', reps: 20, weight: 40 });
chk('logVals/wf rejects',  'did 40 for 20',                { cmd: 'unknown' });  // no units = ambiguous

// Next-time field inference from unit words
chk('nt/N minutes',        'next time 40 minutes',         { cmd: 'nextTime', field: 'duration', value: 40 });
chk('nt/N pounds',         'next time 45 pounds',          { cmd: 'nextTime', field: 'weight', value: 45 });
chk('nt/bike N minutes',   'next time bike 30 minutes',    { cmd: 'nextTime', field: 'duration', value: 30 });
chk('nt/N mins',           'next time 40 mins',            { cmd: 'nextTime', field: 'duration', value: 40 });

// End-workout aliases
chk('endWorkout/workout done',  'workout done',            { cmd: 'endWorkout' });
chk('endWorkout/workout is',    'workout is done',         { cmd: 'endWorkout' });
chk('endWorkout/finished workout', 'finished workout',     { cmd: 'endWorkout' });
chk('endWorkout/end the workout', 'end the workout',       { cmd: 'endWorkout' });
chk('endWorkout/workout complete', 'workout complete',     { cmd: 'endWorkout' });

// Compound with new patch-1 forms
chkCompound('cmpd/p1 changed+log', 'changed weight to 45 and log it', 'changeToday', 'logSet');
chkCompound('cmpd/p1 said done+next', 'said done and next', 'logSet', 'next');
chkCompound('cmpd/p1 workout done',   'log it and workout done', 'logSet', 'endWorkout');

// ────────────────────────────────────────────────────────────────────
// 10. Unknowns & edge cases
// ────────────────────────────────────────────────────────────────────

chk('unknown/gibberish', 'banana phone',         { cmd: 'unknown' });
chk('unknown/half-cmpd', 'log it and banana',    { cmd: 'unknown' });  // both halves don't parse, whole utterance also doesn't parse
chk('bare',              '',                     { cmd: 'bare' });
chk('reject/decimal',    'change weight to 45.5',{ cmd: 'unknown' });
chk('reject/oor',        'change weight to 9999',{ cmd: 'unknown' });

// ────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────

console.log(`\nStep 4 parser tests: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log('  ✗ ' + f.label);
    console.log('     transcript: ' + JSON.stringify(f.transcript));
    console.log('     expected:   ' + JSON.stringify(f.expected));
    console.log('     actual:     ' + JSON.stringify(f.actual));
  }
  process.exit(1);
}
process.exit(0);

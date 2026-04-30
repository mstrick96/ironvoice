'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION (user-editable constants)
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  WAKE_WORD: 'coach',
  WAKE_WORD_FALLBACK: 'hey coach',
  DEFAULT_REST_SECONDS: 90,
  STALE_SESSION_HOURS: 6,
  DIAG_BUFFER_SIZE: 100,

  // VOICE ALIASES: each exercise has an aliases array used by the
  // voice parser (Step 3+) to recognize the exercise by name in
  // natural speech, including informal names and likely
  // misrecognitions.
  //
  // HIP ADDUCTION vs HIP ABDUCTION are given maximally distinct
  // aliases because they are acoustically nearly identical ("add"
  // vs "ab") and adjacent in the circuit. The voice parser will
  // use these distinct terms to disambiguate when the user says
  // "Iron, go to adduction" or "Iron, go to outer thigh."
  DEFAULT_PLAN: [
    {
      id: 'bike', type: 'timed', name: 'Recumbent Bike',
      level: 1, duration: 10,
      note: 'Easy warm-up pace. Loosen hips and legs.',
      aliases: ['bike', 'bicycle', 'warmup', 'warm up', 'recumbent']
    },
    {
      id: 'e01', type: 'strength', name: 'Chest Press',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: 'Full range of motion. Controlled push and slow return. Do not lock elbows.',
      aliases: ['chest press', 'chest', 'bench press', 'chest machine']
    },
    {
      id: 'e02', type: 'strength', name: 'Leg Press',
      weight: 145, reps: 20, sets: 1, rest: 90,
      note: 'Feet shoulder-width. Push through heels. Stop short of locking knees.',
      aliases: ['leg press', 'legs', 'leg machine', 'press']
    },
    {
      id: 'e03', type: 'strength', name: 'Lat Pulldown',
      weight: 70, reps: 20, sets: 1, rest: 90,
      note: 'Pull to upper chest. Squeeze shoulder blades. Slow return.',
      aliases: ['lat pulldown', 'lats', 'lat pull', 'pulldown', 'pull down']
    },
    {
      id: 'e04', type: 'strength', name: 'Shoulder Press',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: 'Press straight up. Do not arch back. Stop short of locking elbows.',
      aliases: ['shoulder press', 'shoulders', 'overhead press', 'shoulder machine']
    },
    {
      id: 'e05', type: 'strength', name: 'Leg Curl',
      weight: 60, reps: 20, sets: 1, rest: 90,
      note: 'Smooth curl through full range. No jerking. Slow return.',
      aliases: ['leg curl', 'hamstring', 'hamstrings', 'ham curl']
    },
    {
      id: 'e06', type: 'strength', name: 'Biceps Curl',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: 'Elbows at sides. Full curl up, slow descent. No swinging.',
      aliases: ['biceps curl', 'biceps', 'curls', 'arm curl', 'curl machine']
    },
    {
      id: 'e07', type: 'strength', name: 'Triceps Press',
      weight: 70, reps: 20, sets: 1, rest: 90,
      note: 'Elbows tucked. Full extension. Slow return. Wrists neutral.',
      aliases: ['triceps press', 'triceps', 'tris', 'pushdown', 'tricep machine']
    },
    {
      id: 'e08', type: 'strength', name: 'Leg Extension',
      weight: 50, reps: 20, sets: 1, rest: 90,
      note: 'Extend fully, do not hyperextend. Slow return. No dropping.',
      aliases: ['leg extension', 'quads', 'quad machine', 'extensions', 'extension']
    },
    {
      id: 'e09', type: 'strength', name: 'Seated Row',
      weight: 70, reps: 20, sets: 1, rest: 90,
      note: 'Pull elbows back past sides. Squeeze at end. Slow return.',
      aliases: ['seated row', 'row', 'rows', 'back row', 'rowing']
    },
    {
      id: 'e10', type: 'strength', name: 'Abdominal',
      weight: 100, reps: 20, sets: 1, rest: 90,
      note: 'Controlled movement. Exhale on contraction. No momentum.',
      aliases: ['abs', 'abdominal', 'core', 'ab machine', 'abdominals']
    },
    {
      id: 'e11', type: 'strength', name: 'Hip Adduction',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: 'Slow squeeze inward. Brief hold. Controlled return. No bouncing.',
      // DISTINCT from abduction: uses "add", "adductor", "inner thigh"
      aliases: ['hip adduction', 'adduction', 'adductor', 'inner thigh', 'add machine']
    },
    {
      id: 'e12', type: 'strength', name: 'Hip Abduction',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: 'Slow push outward. Brief hold. Controlled return. No bouncing.',
      // DISTINCT from adduction: uses "ab", "abductor", "outer thigh"
      aliases: ['hip abduction', 'abduction', 'abductor', 'outer thigh', 'ab machine']
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS (internal)
// ═══════════════════════════════════════════════════════════════
const STORAGE_KEYS = {
  plan:     'iv.plan.v2',
  session:  'iv.session.v2',
  history:  'iv.history.v2',
  settings: 'iv.settings.v2',
  diag:     'iv.diag.v2'
};
const SCHEMA_VERSION = 2;
const STATES = Object.freeze({
  IDLE: 'IDLE', LISTENING: 'LISTENING', PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING', ERROR: 'ERROR'
});
// REGRESSION HAZARD: these transitions are enforced by transition().
// Changing them without updating the voice loop in Step 3+ will
// silently break command handling.
const ALLOWED_TRANSITIONS = Object.freeze({
  IDLE:       ['LISTENING', 'ERROR'],
  LISTENING:  ['PROCESSING', 'SPEAKING', 'IDLE', 'ERROR'],
  PROCESSING: ['SPEAKING', 'LISTENING', 'ERROR'],
  SPEAKING:   ['LISTENING', 'IDLE'],
  ERROR:      ['LISTENING', 'IDLE']
});


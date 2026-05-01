// ═══════════════════════════════════════════════════════════════
// VOICE (Step 3 — minimal Layer 1 vocabulary)
// ═══════════════════════════════════════════════════════════════
// Wraps SpeechRecognition and SpeechSynthesis, enforces the state
// machine, and implements wake-word detection + 5 basic commands.
//
// REGRESSION HAZARD: every state change in this module must go
// through State.transition() — never assign currentState directly.
// REGRESSION HAZARD: utterance chaining uses onend callbacks, never
// setTimeout. Spec §2.4: "no fixed-delay setTimeout."
//
// Step 3 vocabulary: next, previous (back), repeat (say that again),
// help, pause. Everything else is Steps 4-5.
const Voice = (() => {
  let _rec = null;              // SpeechRecognition instance
  let _recActive = false;       // whether recognizer is currently running
  let _wantListening = false;   // true while we should be in LISTENING (auto-restart)
  let _preferredVoice = null;   // chosen SpeechSynthesisVoice
  let _warmKeepTimer = null;    // setInterval for TTS warm-keep
  let _lastSpeechEnd = 0;       // wall-clock ms of last TTS end (warm-keep gate)
  let _currentUtter = null;     // active SpeechSynthesisUtterance (for tap-to-interrupt)
  let _initialized = false;     // true after first BEGIN WORKOUT tap
  let _pauseAfterSpeak = false; // set by 'pause' command; onend honors it

  // Known iOS misrecognitions of "coach" (wake word). Includes:
  // — common phonetic collisions ('couch', 'coats', 'coaches')
  // — the 'hey coach' fallback plus its mis-hearings
  // The list is conservative; add entries here as real transcripts
  // surface via the diagnostic panel in testing.
  const WAKE_ALLOW_LIST = new Set([
    // Single-word forms
    'coach', 'coaches', 'coached', 'coaching',
    'couch', 'couches',
    'coat', 'coats',
    'cooch', 'coach.',
    'koch', 'kotch',
    // Two-word 'hey coach' variants
    'hey coach', 'hey coaches', 'hey couch', 'hey coat',
    'a coach', 'okay coach',
    // Compound/prefix confusions iOS occasionally returns
    'coachbuilder'
  ]);

  // ───── Wake-word detection ─────────────────────────────────────

  // Returns 1 if strings differ by <= 1 edit, 0 otherwise. Tight
  // bounded version — no full DP table needed for distance <= 1.
  function _levDistAtMostOne(a, b) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return 2;
    // Find first diff
    let i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      // substitution: rest must match
      for (let j = i + 1; j < la; j++) if (a[j] !== b[j]) return 2;
      return i === la ? 0 : 1;
    }
    // insertion/deletion: the longer string has one extra char at i
    const [long, short] = la > lb ? [a, b] : [b, a];
    for (let j = i; j < short.length; j++) {
      if (short[j] !== long[j + 1]) return 2;
    }
    return 1;
  }

  // Given a raw alternative transcript, try to find the wake word at
  // the start. Returns { matched: true, tail: "command text" } or
  // { matched: false } if no wake word found.
  function _matchWakeWord(transcript) {
    const t = (transcript || '').trim().toLowerCase().replace(/[.,!?;]+$/g, '');
    if (!t) return { matched: false };
    const tokens = t.split(/\s+/);
    const firstTok = tokens[0];
    // First: try the 2-word prefix against the allow-list (handles
    // split-word iOS recognitions like "i ron", "eye ron").
    if (tokens.length >= 2) {
      const twoWord = tokens[0] + ' ' + tokens[1];
      if (WAKE_ALLOW_LIST.has(twoWord)) {
        return { matched: true, tail: tokens.slice(2).join(' ') };
      }
    }
    // Then: 1-word allow-list (most common path)
    if (WAKE_ALLOW_LIST.has(firstTok)) {
      return { matched: true, tail: tokens.slice(1).join(' ') };
    }
    // Levenshtein <= 1 to the canonical wake word
    if (_levDistAtMostOne(firstTok, CONFIG.WAKE_WORD) <= 1) {
      return { matched: true, tail: tokens.slice(1).join(' ') };
    }
    // Prefix form ("coach-next" in rare cases, or "coaches" etc.)
    if (firstTok.startsWith('coach') && firstTok.length <= 9) {
      return { matched: true, tail: tokens.slice(1).join(' ') };
    }
    return { matched: false };
  }

  // Try every recognizer alternative; first that yields a wake-word
  // match wins.
  function _findWakeWordInAlternatives(resultsList) {
    if (!resultsList || resultsList.length === 0) return { matched: false };
    const last = resultsList[resultsList.length - 1];
    for (let i = 0; i < last.length; i++) {
      const m = _matchWakeWord(last[i].transcript);
      if (m.matched) {
        Diag.add('voice', `Wake match (alt ${i})`, { text: last[i].transcript, tail: m.tail });
        return m;
      }
    }
    Diag.add('voice', 'No wake word in alternatives', {
      alts: Array.from(last).map(a => a.transcript).slice(0, 3)
    });
    return { matched: false };
  }

  // ───── Voice diagnostic overlay (user-visible) ─────────────────

  let _diagOverlayTimer = null;

  function _isDiagEnabled() {
    try {
      const settings = Storage.loadKey('settings') || {};
      return !!settings.voiceDiagEnabled;
    } catch(e) { return false; }
  }

  function _setDiagEnabled(on) {
    try {
      const settings = Storage.loadKey('settings') || {};
      settings.voiceDiagEnabled = !!on;
      Storage.saveKey('settings', settings);
    } catch(e) {}
    if (!on) _hideDiagOverlay();
  }

  function _showDiagResult(resultsList) {
    if (!_isDiagEnabled()) return;
    if (!resultsList || resultsList.length === 0) return;
    const last = resultsList[resultsList.length - 1];
    const overlay = document.getElementById('voice-diag-overlay');
    const content = document.getElementById('voice-diag-content');
    if (!overlay || !content) return;
    let text = '';
    for (let i = 0; i < last.length; i++) {
      const t = last[i].transcript || '';
      const conf = last[i].confidence;
      const confStr = (conf && isFinite(conf)) ? `  [${(conf * 100).toFixed(0)}%]` : '';
      text += `${i + 1}. "${t}"${confStr}\n`;
    }
    content.textContent = text.trimEnd();
    overlay.style.display = 'block';
    if (_diagOverlayTimer) clearTimeout(_diagOverlayTimer);
    _diagOverlayTimer = setTimeout(() => _hideDiagOverlay(), 6000);
  }

  function _hideDiagOverlay() {
    const overlay = document.getElementById('voice-diag-overlay');
    if (overlay) overlay.style.display = 'none';
    if (_diagOverlayTimer) { clearTimeout(_diagOverlayTimer); _diagOverlayTimer = null; }
  }

  // ───── Command parser (Layer 2 keyword grammar) ────────────────
  //
  // Step 4 architecture: _parseCommand returns one of:
  //   { cmd: 'bare' }                  bare wake word, no command
  //   { cmd: 'unknown', text: '...' }  no Layer 2 match
  //   { cmd: '<name>', ... }           single command with args
  //   { cmd: 'compound', parts: [...]} two commands joined by and/then/comma
  //
  // _executeCommand dispatches by cmd. Compound commands run via
  // _speakChain so each side effect fires on the prior utterance's
  // speech-end callback (spec §2.4 — never setTimeout).
  //
  // Parser is pure: zero side effects, zero state mutation. All side
  // effects live in the executor. Parser is exported as __parseCommand
  // for offline node testing.

  // Spelled-number table for "I did twenty reps at forty pounds" etc.
  // 0–99 plus "hundred". Compound forms ("twenty-five", "forty five")
  // handled by tokenizing and re-pairing in _parseNumber.
  const _NUM_WORDS = {
    'zero': 0, 'oh': 0,
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
    'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
    'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
    'hundred': 100
  };

  // Parse a number from a string fragment. Accepts:
  //   "20", "45"              digits, 0–999
  //   "twenty", "forty-five"  spelled, 0–99
  //   "forty five"            spelled with space
  // Rejects decimals, negatives, and >999. Returns null on failure.
  function _parseNumber(s) {
    if (s === null || s === undefined) return null;
    const t = String(s).trim().toLowerCase().replace(/[-]/g, ' ');
    if (!t) return null;
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (n >= 0 && n <= 999) return n;
      return null;
    }
    const tokens = t.split(/\s+/);
    if (tokens.length === 1) {
      const n = _NUM_WORDS[tokens[0]];
      return (typeof n === 'number') ? n : null;
    }
    if (tokens.length === 2) {
      const a = _NUM_WORDS[tokens[0]];
      const b = _NUM_WORDS[tokens[1]];
      if (typeof a === 'number' && typeof b === 'number') {
        if (a >= 20 && a <= 90 && a % 10 === 0 && b >= 1 && b <= 9) return a + b;
        if (a >= 1 && a <= 9 && b === 100) return a * 100;
      }
    }
    return null;
  }

  // Bounded Levenshtein up to maxDist. Returns the actual distance
  // (or maxDist+1 if exceeded). Used for fuzzy exercise-name lookup —
  // not the wake-word matcher (which has its own ≤1 helper above).
  function _levDist(a, b, maxDist) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > maxDist) return maxDist + 1;
    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      curr[0] = i;
      let rowMin = i;
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        if (curr[j] < rowMin) rowMin = curr[j];
      }
      if (rowMin > maxDist) return maxDist + 1;
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[lb];
  }

  // Resolve an exercise-name fragment to a single exercise from the
  // current plan. Lookup order (per build log):
  //   1. Exact alias match across all exercises
  //   2. Substring match (alias contains fragment OR fragment contains alias)
  //   3. Levenshtein ≤ 2 against canonical name (lowercased)
  // If multiple exercises tie at any level, returns { tie: true } —
  // caller rejects and asks the user to retry. No guessing across ties.
  // Returns { ex } on success, { tie: true } on ambiguity, or null on no match.
  function _resolveExerciseName(fragment) {
    const plan = Session.getPlan();
    if (!plan || !plan.exercises) return null;
    const t = String(fragment || '').trim().toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/[.,!?;]+$/, '');
    if (!t) return null;

    // Pass 1: exact alias match
    const exactMatches = [];
    for (const ex of plan.exercises) {
      const aliases = ex.aliases || [];
      if (aliases.some(a => a.toLowerCase() === t)) exactMatches.push(ex);
    }
    if (exactMatches.length === 1) return { ex: exactMatches[0] };
    if (exactMatches.length > 1) return { tie: true };

    // Pass 2: substring match
    const subMatches = new Set();
    for (const ex of plan.exercises) {
      const aliases = ex.aliases || [];
      for (const a of aliases) {
        const al = a.toLowerCase();
        if (al && (al.includes(t) || t.includes(al))) {
          subMatches.add(ex);
          break;
        }
      }
    }
    if (subMatches.size === 1) return { ex: Array.from(subMatches)[0] };
    if (subMatches.size > 1) return { tie: true };

    // Pass 3: Levenshtein ≤ 2 against canonical name
    let best = null, bestDist = 3, tied = false;
    for (const ex of plan.exercises) {
      const d = _levDist(t, ex.name.toLowerCase(), 2);
      if (d < bestDist) { best = ex; bestDist = d; tied = false; }
      else if (d === bestDist) { tied = true; }
    }
    if (best && !tied) return { ex: best };
    if (best && tied) return { tie: true };
    return null;
  }

  // ───── Compound splitter ───────────────────────────────────────
  // Compound rule: split on " and " / " then " / "," ONCE if both
  // halves parse as known commands. Note-text commands are
  // non-splittable (note text extends to end-of-utterance).

  function _isNotePrefix(s) {
    return /^(add note\b|workout note\b|next time add note\b)/.test(s);
  }

  function _trySplitCompound(tail) {
    if (_isNotePrefix(tail)) return null;
    const sepRe = /(\s+and\s+|\s+then\s+|\s*,\s*)/;
    const m = tail.match(sepRe);
    if (!m) return null;
    const left  = tail.slice(0, m.index).trim();
    const right = tail.slice(m.index + m[0].length).trim();
    if (!left || !right) return null;
    return { left, right };
  }

  // ───── Layer 2 parser ──────────────────────────────────────────

  function _parseSingle(tail) {
    const t = String(tail || '').trim().toLowerCase().replace(/[.,!?;]+$/g, '');
    if (!t) return { cmd: 'bare' };

    // ── Navigation ────────────────────────────────────────────────
    if (/^(next( exercise)?|move on|keep going|okay next|ok next)$/.test(t))
      return { cmd: 'next' };
    if (/^(previous( exercise)?|back|go back|back up|last one)$/.test(t))
      return { cmd: 'previous' };
    if (/^(repeat|say that again|what was that|come again|i missed that)$/.test(t))
      return { cmd: 'repeat' };
    if (/^(skip( this)?( one)?|skip it|pass|come back later|machines taken|machine is taken)$/.test(t))
      return { cmd: 'skip' };
    if (/^(whats next|what is next|what comes next|whats after this|coming up)$/.test(t))
      return { cmd: 'whatsNext' };
    if (/^(whats left|what is left|whats remaining|what is remaining|how much is left|what do i still have)$/.test(t))
      return { cmd: 'whatsLeft' };
    if (/^(list exercises|read me the list|todays workout|what am i doing today|read the list)$/.test(t))
      return { cmd: 'listExercises' };
    let mNav;
    if ((mNav = t.match(/^(?:go to|switch to|jump to|do)\s+(.+?)(?:\s+next)?$/))) {
      return { cmd: 'goTo', nameFragment: mNav[1].trim() };
    }

    // ── Session control ───────────────────────────────────────────
    if (/^help$/.test(t)) return { cmd: 'help' };
    if (/^(pause|pause's|paus|paul|paul's|pauls|paws|paw's|stop listening|mute)$/.test(t))
      return { cmd: 'pause' };
    if (/^(end workout|finish workout|were done|we are done|end session|finish up|that is it for today|thats it for today)$/.test(t))
      return { cmd: 'endWorkout' };

    // ── Notes (non-splittable; must be checked early) ─────────────
    let mNote;
    if ((mNote = t.match(/^add note\s+(.+)$/)))
      return { cmd: 'addNote', text: mNote[1].trim() };
    if ((mNote = t.match(/^workout note\s+(.+)$/)))
      return { cmd: 'workoutNote', text: mNote[1].trim() };
    if (/^read (my )?notes?$/.test(t) || /^read the notes?$/.test(t))
      return { cmd: 'readNotes' };

    // ── History ───────────────────────────────────────────────────
    if (/^(last time|previous session|last session|how did i do last time)$/.test(t))
      return { cmd: 'lastTime' };

    // ── Logging ───────────────────────────────────────────────────
    let mLog;
    if ((mLog = t.match(/^(?:i did|did|got|finished)\s+(.+?)\s+(?:reps?\s+)?(?:at|with)\s+(.+?)(?:\s+(?:pounds?|lbs?|lb))?$/))) {
      const nReps = _parseNumber(mLog[1].replace(/\s*reps?\s*$/, '').trim());
      const nWt   = _parseNumber(mLog[2].replace(/\s*(pounds?|lbs?|lb)\s*$/, '').trim());
      if (nReps !== null && nWt !== null) {
        return { cmd: 'logSetWithValues', reps: nReps, weight: nWt };
      }
    }
    if ((mLog = t.match(/^(.+?)\s+reps?\s+(?:at|with)\s+(.+?)(?:\s+(?:pounds?|lbs?|lb))?$/))) {
      const nReps = _parseNumber(mLog[1].trim());
      const nWt   = _parseNumber(mLog[2].replace(/\s*(pounds?|lbs?|lb)\s*$/, '').trim());
      if (nReps !== null && nWt !== null) {
        return { cmd: 'logSetWithValues', reps: nReps, weight: nWt };
      }
    }
    if (/^(set done|thats a set|that is a set|one set down|finished a set|set complete|set is done|set finished)$/.test(t))
      return { cmd: 'logSet' };
    if (/^(exercise done|done with this|thats it|that is it|all done here|finished this one|mark it off|mark it done)$/.test(t))
      return { cmd: 'logSet' };
    if (/^(log it|log this( exercise)?|mark it logged|save this one|log this set)$/.test(t))
      return { cmd: 'logSet' };
    if (/^(undo( last set)?|take back the last set|remove that log|undo that)$/.test(t))
      return { cmd: 'undoSet' };
    if (/^(add a set|add set|one more set|add another set|give me another set)$/.test(t))
      return { cmd: 'addSet' };

    let mBike;
    if ((mBike = t.match(/^(?:bike done|warmup done|warm up done|finished the bike|bike complete|warmup complete)(?:\s+(.+))?$/))) {
      const rest = (mBike[1] || '').trim();
      if (!rest) return { cmd: 'bikeDone' };
      const minMatch = rest.match(/(.+?)\s*(?:minutes?|mins?|min)\s+(?:at\s+)?level\s+(.+)$/);
      if (minMatch) {
        const minutes = _parseNumber(minMatch[1].trim());
        const level   = _parseNumber(minMatch[2].trim());
        if (minutes !== null && level !== null) {
          return { cmd: 'bikeDone', minutes, level };
        }
      }
      const lvlMatch = rest.match(/level\s+(.+?)\s*,?\s+(.+?)\s*(?:minutes?|mins?|min)$/);
      if (lvlMatch) {
        const level   = _parseNumber(lvlMatch[1].trim());
        const minutes = _parseNumber(lvlMatch[2].trim());
        if (minutes !== null && level !== null) {
          return { cmd: 'bikeDone', minutes, level };
        }
      }
      return { cmd: 'bikeDone' };
    }

    // ── Today-only value changes ──────────────────────────────────
    let mChg;
    if ((mChg = t.match(/^(?:change|set|use)\s+(weight|reps?|sets?|level|time|duration|minutes?)\s+(?:to\s+)?(.+?)(?:\s+(?:pounds?|lbs?|lb|minutes?|mins?|min))?(?:\s+today)?$/))) {
      const field = _normalizeField(mChg[1]);
      const value = _parseNumber(mChg[2].replace(/\s*(pounds?|lbs?|lb|minutes?|mins?|min)\s*$/, '').trim());
      if (field && value !== null) return { cmd: 'changeToday', field, value };
    }
    if ((mChg = t.match(/^use\s+(.+?)\s+today$/))) {
      const value = _parseNumber(mChg[1].replace(/\s*(pounds?|lbs?|lb)\s*$/, '').trim());
      if (value !== null) return { cmd: 'changeToday', field: 'weight', value, implicitField: true };
    }

    // ── Permanent plan changes (next-time) ────────────────────────
    let mNxt;
    if ((mNxt = t.match(/^next time add note\s+(.+)$/)))
      return { cmd: 'nextTimeNote', text: mNxt[1].trim() };
    if ((mNxt = t.match(/^next time\s+(.+)$/))) {
      const parsed = _parseNextTimeRest(mNxt[1].trim());
      if (parsed) return { cmd: 'nextTime', field: parsed.field, value: parsed.value };
    }
    if ((mNxt = t.match(/^save\s+(.+?)\s+(?:pounds?|lbs?)\s+as my new plan$/))) {
      const value = _parseNumber(mNxt[1].trim());
      if (value !== null) return { cmd: 'nextTime', field: 'weight', value, implicitField: true };
    }
    if (/^save (this|set count)( as my new plan)?$/.test(t))
      return { cmd: 'saveSetCountForNextTime' };

    return { cmd: 'unknown', text: t };
  }

  function _normalizeField(raw) {
    const f = String(raw || '').toLowerCase();
    if (f === 'weight') return 'weight';
    if (f === 'rep' || f === 'reps') return 'reps';
    if (f === 'set' || f === 'sets') return 'sets';
    if (f === 'level') return 'level';
    if (f === 'time' || f === 'duration' || f === 'minute' || f === 'minutes') return 'duration';
    return null;
  }

  // Parse the part after "next time" — flexible word order. Returns
  // { field, value } or null.
  function _parseNextTimeRest(s) {
    const t = String(s || '').trim().toLowerCase()
      .replace(/\s*(pounds?|lbs?|lb)\s*$/, '')
      .replace(/\s*(minutes?|mins?|min)\s*$/, '');
    const noBike = t.replace(/^bike\s+/, '');
    const noTo = noBike.replace(/\s+to\s+/, ' ').replace(/^to\s+/, '');
    const fieldFirst = noTo.match(/^(weight|reps?|sets?|level|time|duration|minutes?)\s+(.+)$/);
    if (fieldFirst) {
      const field = _normalizeField(fieldFirst[1]);
      const value = _parseNumber(fieldFirst[2].trim());
      if (field && value !== null) return { field, value };
    }
    const valFirst = noTo.match(/^(.+?)\s+(weight|reps?|sets?|level|time|duration|minutes?)$/);
    if (valFirst) {
      const value = _parseNumber(valFirst[1].trim());
      const field = _normalizeField(valFirst[2]);
      if (field && value !== null) return { field, value };
    }
    return null;
  }

  // Top-level parser: handles compound detection, then delegates.
  function _parseCommand(tail) {
    const t = String(tail || '').trim().toLowerCase().replace(/[.,!?;]+$/g, '');
    if (!t) return { cmd: 'bare' };

    const split = _trySplitCompound(t);
    if (split) {
      const left  = _parseSingle(split.left);
      const right = _parseSingle(split.right);
      if (left.cmd !== 'unknown' && left.cmd !== 'bare' &&
          right.cmd !== 'unknown' && right.cmd !== 'bare') {
        return { cmd: 'compound', parts: [left, right] };
      }
      // Fall through to single-parse on the whole utterance.
    }
    return _parseSingle(t);
  }

  // ───── Compound execution chain ────────────────────────────────
  // _speakChain([{ effect, text }, ...]) runs each step in order:
  //   1. Calls effect() (sync side effect)
  //   2. Speaks text
  //   3. On TTS onend, advances to next step (NOT setTimeout)
  //
  // While in a non-final chain step, _speak.onend skips its normal
  // LISTENING-restart path; the chain itself drives the next step.
  // The final step uses normal onend behavior. _chainCancelled is
  // set by interruptSpeech() and aborts the chain — second side
  // effect does not fire.

  let _chainQueue = null;
  let _chainCancelled = false;
  let _inChainStep = false;  // true while a non-final chain step is speaking

  function _speakChain(steps) {
    if (!steps || steps.length === 0) return;
    _chainQueue = steps.slice();
    _chainCancelled = false;
    _runNextChainStep();
  }

  function _runNextChainStep() {
    if (_chainCancelled || !_chainQueue || _chainQueue.length === 0) {
      _chainQueue = null;
      _chainCancelled = false;
      _inChainStep = false;
      return;
    }
    const step = _chainQueue.shift();
    const isLast = _chainQueue.length === 0;
    if (step.effect) {
      try { step.effect(); }
      catch (e) { Diag.add('voice', 'chain effect error', String(e)); }
    }
    if (_chainCancelled) {
      _chainQueue = null;
      _chainCancelled = false;
      _inChainStep = false;
      return;
    }
    if (isLast) {
      _inChainStep = false;
      _speak(step.text || '');
    } else {
      _inChainStep = true;
      _speak(step.text || '', () => {
        _inChainStep = false;
        _runNextChainStep();
      });
    }
  }

  function _cancelChain() {
    if (_chainQueue || _inChainStep) {
      _chainCancelled = true;
      _chainQueue = null;
      _inChainStep = false;
      Diag.add('voice', 'Chain cancelled');
    }
  }

  // ───── Command executor ────────────────────────────────────────

  function _executeCommand(parsed) {
    State.transition(STATES.PROCESSING, `parse: ${parsed.cmd}`);

    if (parsed.cmd === 'compound') {
      const stepA = _buildChainStep(parsed.parts[0]);
      const stepB = _buildChainStep(parsed.parts[1]);
      if (!stepA || !stepB) {
        _speak("I didn't catch that. Say Coach help for commands.");
        return;
      }
      // directHandler doesn't fit the simple chain pattern. Common
      // realistic case is "log it and end workout" — handle by running
      // stepA then invoking stepB's directHandler from stepA's onend.
      if (stepB.directHandler) {
        _executeChainWithDirectTail(stepA, stepB);
        return;
      }
      if (stepA.directHandler) {
        // pause/end as the FIRST half — unusual but run it.
        stepA.directHandler();
        return;
      }
      _speakChain([stepA, stepB]);
      return;
    }

    const step = _buildChainStep(parsed);
    if (!step) {
      _speak("I didn't catch that. Say Coach help for commands.");
      return;
    }
    if (step.directHandler) {
      step.directHandler();
      return;
    }
    if (step.effect) {
      try { step.effect(); }
      catch (e) { Diag.add('voice', 'effect error', String(e)); }
    }
    _speak(step.text || '');
  }

  // Execute "<normal step> and <directHandler step>" — e.g.
  // "log it and end workout". Runs stepA's effect, speaks stepA's
  // text, then on TTS onend invokes stepB's directHandler.
  function _executeChainWithDirectTail(stepA, stepB) {
    if (stepA.effect) {
      try { stepA.effect(); }
      catch (e) { Diag.add('voice', 'effect error', String(e)); }
    }
    _speak(stepA.text || '', () => stepB.directHandler());
  }

  // Build a chain step ({ effect, text } or { directHandler }) for
  // a parsed single command. Returns null if unknown.
  function _buildChainStep(parsed) {
    const data = Session.getData();
    const plan = Session.getPlan();
    const ex   = Session.getCurrentExercise();

    switch (parsed.cmd) {
      case 'bare':
        return { text: 'Yes? What would you like to do?' };

      case 'next': {
        if (!plan || !data) return { text: 'No session active.' };
        if (data.currentIndex >= plan.exercises.length - 1)
          return { text: 'That was the last exercise.' };
        return {
          effect: () => Session.navigate(1, true),
          text:   _navIntroText(1)
        };
      }
      case 'previous': {
        if (!data) return { text: 'No session active.' };
        if (data.currentIndex === 0)
          return { text: 'Already at the first exercise.' };
        return {
          effect: () => Session.navigate(-1, true),
          text:   _navIntroText(-1)
        };
      }
      case 'repeat': {
        if (!ex) return { text: 'No exercise loaded.' };
        return { text: _describeExercise(ex) };
      }
      case 'skip': {
        if (!plan || !data || !ex) return { text: 'No session active.' };
        if (data.currentIndex >= plan.exercises.length - 1)
          return { text: `${ex.name} is the last exercise. Nothing to skip to.` };
        const nextEx = plan.exercises[data.currentIndex + 1];
        const skippedName = ex.name;
        return {
          effect: () => Session.navigate(1, true),
          text:   `Skipping ${skippedName}. ${_describeExercise(nextEx)}`
        };
      }
      case 'whatsNext': {
        if (!plan || !data) return { text: 'No session active.' };
        if (data.currentIndex >= plan.exercises.length - 1)
          return { text: 'This is the last exercise.' };
        const nextEx = plan.exercises[data.currentIndex + 1];
        return { text: `Next: ${_describeExercise(nextEx)}` };
      }
      case 'whatsLeft': {
        if (!plan || !data) return { text: 'No session active.' };
        const remaining = plan.exercises.slice(data.currentIndex + 1);
        if (remaining.length === 0) return { text: 'Nothing remaining. This is the last exercise.' };
        const names = remaining.map(e => e.name).join(', ');
        return { text: `Remaining: ${names}.` };
      }
      case 'listExercises': {
        if (!plan) return { text: 'No plan loaded.' };
        const names = plan.exercises.map(e => e.name).join(', ');
        return { text: `Today has ${plan.exercises.length} items. ${names}.` };
      }
      case 'goTo': {
        if (!plan || !data) return { text: 'No session active.' };
        const res = _resolveExerciseName(parsed.nameFragment);
        if (!res) return { text: `I don't know an exercise called ${parsed.nameFragment}.` };
        if (res.tie) return { text: "I didn't catch the name — try again with a more specific term." };
        const idx = plan.exercises.findIndex(e => e.id === res.ex.id);
        if (idx === -1) return { text: `${res.ex.name} not in plan.` };
        if (idx === data.currentIndex) return { text: `Already on ${res.ex.name}.` };
        return {
          effect: () => Session.goTo(idx, true),
          text:   _describeExercise(res.ex)
        };
      }

      case 'help':
        return { text: 'Say next, previous, repeat, log it, add a set, change weight, next time weight, last time, end workout, or pause.' };

      case 'pause':
        return {
          directHandler: () => {
            _stopRecognizer();
            _wantListening = false;
            _speak('Paused. Tap the badge to resume.');
            _pauseAfterSpeak = true;
          }
        };

      case 'endWorkout':
        return { directHandler: () => _endWorkoutSpoken() };

      case 'logSet': {
        if (!ex) return { text: 'No exercise loaded.' };
        if (ex.type === 'timed') return _buildBikeDone({});
        const setNumAfter = Session.getSetCount(ex.id) + 1;
        const reps   = Session.getEffectiveValue(ex.id, 'reps');
        const weight = Session.getEffectiveValue(ex.id, 'weight');
        return {
          effect: () => Session.logSet(),
          text:   `Set ${setNumAfter} done. ${reps} reps at ${weight} pounds.`
        };
      }
      case 'logSetWithValues': {
        if (!ex) return { text: 'No exercise loaded.' };
        if (ex.type === 'timed')
          return { text: 'Bike uses level and time, not reps and weight.' };
        const r = parsed.reps, w = parsed.weight;
        return {
          effect: () => {
            Session.applyTodayOverride('reps', r);
            Session.applyTodayOverride('weight', w);
            Session.logSet();
          },
          text: `Logged. ${r} reps at ${w} pounds.`
        };
      }
      case 'undoSet': {
        if (!ex) return { text: 'No exercise loaded.' };
        const cnt = Session.getSetCount(ex.id);
        if (cnt === 0) return { text: 'Nothing to undo.' };
        return {
          effect: () => Session.undoLastSet(),
          text:   'Last set removed.'
        };
      }
      case 'addSet': {
        if (!ex) return { text: 'No exercise loaded.' };
        if (ex.type === 'timed')
          return { text: 'Add-set applies to strength exercises, not the bike.' };
        const newCount = Session.getEffectivePlannedSets(ex.id) + 1;
        return {
          effect: () => Session.addSetDotOnly(),
          text:   `Set added. ${ex.name} now has ${newCount} sets.`
        };
      }
      case 'bikeDone':
        return _buildBikeDone(parsed);

      case 'changeToday': {
        if (!ex) return { text: 'No exercise loaded.' };
        const wrong = _wrongFieldForType(ex, parsed.field);
        if (wrong) return { text: wrong };
        const fieldName = _spokenFieldName(parsed.field);
        return {
          effect: () => Session.applyTodayOverride(parsed.field, parsed.value),
          text:   `${_capitalize(fieldName)} updated to ${parsed.value}${_unitFor(parsed.field)} for today.`
        };
      }

      case 'nextTime': {
        if (!ex) return { text: 'No exercise loaded.' };
        const wrong = _wrongFieldForType(ex, parsed.field);
        if (wrong) return { text: wrong };
        const fieldName = _spokenFieldName(parsed.field);
        return {
          effect: () => Session.queuePlanChange(parsed.field, parsed.value),
          text:   `Got it. ${_capitalize(fieldName)} ${parsed.value}${_unitFor(parsed.field)} saved for next session.`
        };
      }
      case 'nextTimeNote': {
        if (!ex) return { text: 'No exercise loaded.' };
        return {
          effect: () => Session.queuePlanChange('note', parsed.text),
          text:   'Got it. Note saved for next session.'
        };
      }
      case 'saveSetCountForNextTime': {
        if (!ex) return { text: 'No exercise loaded.' };
        if (ex.type === 'timed') return { text: 'That command applies to strength exercises.' };
        const cnt = Session.getEffectivePlannedSets(ex.id);
        return {
          effect: () => Session.saveSetCountForNextTime(),
          text:   `Plan updated. ${ex.name} is now ${cnt} ${cnt === 1 ? 'set' : 'sets'} for next session.`
        };
      }

      case 'addNote': {
        if (!ex) return { text: 'No exercise loaded.' };
        return {
          effect: () => Session.queuePlanChange('note', parsed.text),
          text:   'Note saved.'
        };
      }
      case 'workoutNote': {
        return {
          effect: () => Session.setSessionNote(parsed.text),
          text:   'Workout note saved.'
        };
      }
      case 'readNotes': {
        if (!ex) return { text: 'No exercise loaded.' };
        const note = Session.getEffectiveValue(ex.id, 'note');
        return { text: note ? note : `No note for ${ex.name}.` };
      }

      case 'lastTime': {
        if (!ex) return { text: 'No exercise loaded.' };
        return { text: _lastTimeFor(ex.id) };
      }

      case 'unknown':
      default:
        return null;
    }
  }

  function _navIntroText(delta) {
    const data = Session.getData();
    const plan = Session.getPlan();
    if (!data || !plan) return '';
    const newIdx = data.currentIndex + delta;
    const target = plan.exercises[newIdx];
    if (!target) return '';
    const intro = delta > 0 ? 'Moving to ' : 'Going back to ';
    return intro + _describeExercise(target);
  }

  function _wrongFieldForType(ex, field) {
    if (ex.type === 'timed') {
      if (field === 'weight' || field === 'reps' || field === 'sets')
        return `Bike uses level and time, not ${field}.`;
    } else {
      if (field === 'level' || field === 'duration')
        return `${ex.name} uses weight, reps, and sets, not ${field === 'duration' ? 'time' : field}.`;
    }
    return null;
  }

  function _spokenFieldName(field) {
    if (field === 'duration') return 'time';
    return field;
  }
  function _unitFor(field) {
    if (field === 'weight') return ' pounds';
    if (field === 'duration') return ' minutes';
    return '';
  }
  function _capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function _buildBikeDone(parsed) {
    const ex = Session.getCurrentExercise();
    if (!ex) return { text: 'No exercise loaded.' };
    if (ex.type !== 'timed')
      return { text: `${ex.name} is not the bike. Try "log it" or "set done".` };
    const mins = parsed.minutes;
    const lvl  = parsed.level;
    const finalMins = (typeof mins === 'number') ? mins : Session.getEffectiveValue(ex.id, 'duration');
    const finalLvl  = (typeof lvl  === 'number') ? lvl  : Session.getEffectiveValue(ex.id, 'level');
    return {
      effect: () => {
        if (typeof mins === 'number') Session.applyTodayOverride('duration', mins);
        if (typeof lvl  === 'number') Session.applyTodayOverride('level',    lvl);
        Session.logSet();
      },
      text: `Bike logged. ${finalMins} minutes at level ${finalLvl}.`
    };
  }

  // Walk history newest-to-oldest, find the most recent session that
  // contains entries for this exercise, produce a one-sentence
  // spoken summary. "No prior data for X." if nothing found.
  function _lastTimeFor(exId) {
    const plan = Session.getPlan();
    const ex = plan ? plan.exercises.find(e => e.id === exId) : null;
    if (!ex) return 'Exercise not found.';
    let history;
    try { history = Storage.loadKey('history'); }
    catch (e) { return 'No prior data available.'; }
    if (!history || !history.sessions || history.sessions.length === 0)
      return `No prior data for ${ex.name}.`;
    for (let i = history.sessions.length - 1; i >= 0; i--) {
      const s = history.sessions[i];
      const entries = (s.logEntries || []).filter(e => e.exId === exId);
      if (entries.length === 0) continue;
      if (ex.type === 'timed') {
        const last = entries[entries.length - 1];
        return `Last time: ${last.duration} minutes at level ${last.level}.`;
      } else {
        const setCount = entries.length;
        const last = entries[entries.length - 1];
        const setsWord = setCount === 1 ? 'set' : 'sets';
        return `Last time: ${setCount} ${setsWord}, ${last.reps} reps at ${last.weight} pounds.`;
      }
    }
    return `No prior data for ${ex.name}.`;
  }

  // End-of-workout spoken summary (spec §6.3). Uses
  // Session.endWithSpokenSummary which commits history and applies
  // plan changes but defers Voice.shutdown / Summary.show until the
  // spoken summary's onend.
  function _endWorkoutSpoken() {
    const result = Session.endWithSpokenSummary();
    if (!result) {
      Diag.add('voice', 'endWithSpokenSummary returned null — using legacy path');
      Session.end();
      return;
    }
    _speak(result.summaryText, () => {
      Voice.shutdown();
      Summary.show(result.snapshot);
    });
  }

  function _describeExercise(ex) {
    if (ex.type === 'timed') {
      return `${ex.name}. Level ${Session.getEffectiveValue(ex.id, 'level')}. ${Session.getEffectiveValue(ex.id, 'duration')} minutes.`;
    }
    const sets = Session.getEffectivePlannedSets(ex.id);
    const reps = Session.getEffectiveValue(ex.id, 'reps');
    const weight = Session.getEffectiveValue(ex.id, 'weight');
    const setsWord = sets === 1 ? 'set' : 'sets';
    return `${ex.name}. ${sets} ${setsWord}, ${reps} reps at ${weight} pounds.`;
  }

  // ───── TTS ─────────────────────────────────────────────────────

  function _getSavedVoiceName() {
    try {
      const settings = Storage.loadKey('settings') || {};
      return settings.preferredVoiceName || null;
    } catch(e) { return null; }
  }

  function _saveVoiceName(name) {
    try {
      const settings = Storage.loadKey('settings') || {};
      settings.preferredVoiceName = name;
      Storage.saveKey('settings', settings);
    } catch(e) {}
  }

  function _pickVoice() {
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length === 0) return null;

    // 1. User's explicit choice from Voice Tester wins over everything.
    const savedName = _getSavedVoiceName();
    if (savedName) {
      const chosen = voices.find(v => v.name === savedName);
      if (chosen) return chosen;
      // Saved name not present (voice removed or different device) —
      // fall through to automatic selection but log it.
      Diag.add('voice', `Saved voice "${savedName}" not found; picking fallback`);
    }

    // 2. Automatic quality-scored selection. Prefer high-quality neural
    //    voices (tagged Enhanced / Premium / Siri in their name) over
    //    compact voices, and localService=false (server-rendered) over
    //    localService=true (compact). iOS Safari only exposes a subset
    //    of installed voices — this tier list works with what Safari
    //    actually returns on iOS 16+ devices.
    const knownFemale = new Set(['Samantha', 'Victoria', 'Susan', 'Allison', 'Ava', 'Karen', 'Zoe']);
    function score(v) {
      if (!v.lang || !/^en/i.test(v.lang)) return -1;
      let s = 0;
      const n = v.name || '';
      // Quality tier signals — Apple's naming conventions.
      if (/siri/i.test(n)) s += 100;
      if (/premium/i.test(n)) s += 80;
      if (/enhanced/i.test(n)) s += 60;
      if (v.localService === false) s += 30;
      // Locale preference — US English preferred.
      if (/^en-US$/i.test(v.lang)) s += 20;
      else if (/^en[-_]/i.test(v.lang)) s += 5;
      // Male voice preference per spec (soft; doesn't drop female voices).
      if (!knownFemale.has(n.split(' ')[0])) s += 3;
      return s;
    }
    const scored = voices
      .map(v => ({ v, s: score(v) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s);
    if (scored.length > 0) return scored[0].v;
    return voices[0] || null;
  }

  function _ensureVoice() {
    if (_preferredVoice) return;
    _preferredVoice = _pickVoice();
    if (_preferredVoice) {
      Diag.add('voice', `Voice selected: ${_preferredVoice.name} (${_preferredVoice.lang}, local=${_preferredVoice.localService})`);
    }
    if (!_preferredVoice && window.speechSynthesis && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        if (!_preferredVoice) {
          _preferredVoice = _pickVoice();
          if (_preferredVoice) {
            Diag.add('voice', `Voice selected (async): ${_preferredVoice.name}`);
          }
        }
      };
    }
  }

  // Public — called by VoiceTester when user picks a voice.
  function setPreferredVoiceByName(name) {
    const voices = window.speechSynthesis.getVoices() || [];
    const v = voices.find(x => x.name === name);
    if (v) {
      _preferredVoice = v;
      _saveVoiceName(name);
      Diag.add('voice', `Preferred voice set by user: ${name}`);
      return true;
    }
    return false;
  }

  function getPreferredVoiceName() {
    return _preferredVoice ? _preferredVoice.name : null;
  }

  function getAllVoices() {
    return (window.speechSynthesis.getVoices() || []).slice();
  }

  // Normalize abbreviations and numbers that iOS TTS mangles.
  // REGRESSION HAZARD: iOS Safari expands "reps" to "representatives"
  // and may mis-speak other short tokens. Fix must happen before the
  // utterance text is passed to speechSynthesis.speak().
  //
  // Rules are whole-word only — we don't want "representative" (if it
  // ever appears) to mutate. Applied in order; later rules can compose
  // with earlier ones.
  function _normalizeForSpeech(text) {
    if (!text) return text;
    let s = String(text);
    // Whole-word abbreviation expansions. \b handles spaces, commas,
    // periods, and end-of-string.
    s = s.replace(/\breps\b/gi, 'repetitions');
    s = s.replace(/\brep\b/gi, 'repetition');
    s = s.replace(/\blbs\b/gi, 'pounds');
    s = s.replace(/\blb\b/gi, 'pound');
    s = s.replace(/\bmin\b/gi, 'minutes');
    s = s.replace(/\bsec\b/gi, 'seconds');
    // Bike levels written as "L1" / "L2" etc.
    s = s.replace(/\bL(\d+)\b/g, 'level $1');
    // "Iron" → phonetic form. Default TTS voices (including Samantha)
    // say "I-RON" as two distinct syllables when given the spelling
    // "iron"; users hear it as wrong/old-fashioned. Phonetic form
    // "I-urn" coerces the engine into the natural single-syllable
    // pronunciation. Brand name on screen stays "Iron Voice".
    s = s.replace(/\bIron\b/g, 'I-urn');
    s = s.replace(/\biron\b/g, 'i-urn');
    return s;
  }

  function _speak(text, onDone) {
    if (!window.speechSynthesis) { if (onDone) onDone(); return; }
    const spoken = _normalizeForSpeech(text);
    _stopRecognizer();
    State.transition(STATES.SPEAKING, `speak: ${spoken.slice(0, 40)}`);
    const u = new SpeechSynthesisUtterance(spoken);
    if (_preferredVoice) u.voice = _preferredVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.onend = () => {
      _lastSpeechEnd = Date.now();
      _currentUtter = null;
      Diag.add('voice', 'TTS ended');
      if (_pauseAfterSpeak) {
        _pauseAfterSpeak = false;
        State.transition(STATES.IDLE, 'pause command');
        return;
      }
      if (onDone) {
        try { onDone(); } catch (e) { Diag.add('voice', 'onDone error', String(e)); }
      }
      // If the chain helper has more steps to run, do NOT transition
      // back to LISTENING or restart the recognizer — the chain itself
      // calls _speak again on the next step (and the onDone closure
      // above already advanced it).
      if (_inChainStep) {
        Diag.add('voice', 'TTS ended mid-chain — staying in SPEAKING');
        return;
      }
      // Return to LISTENING if session is still active
      if (_wantListening) {
        State.transition(STATES.LISTENING, 'TTS done → listen');
        _startRecognizer();
      } else {
        State.transition(STATES.IDLE, 'TTS done, not listening');
      }
    };
    u.onerror = (e) => {
      Diag.add('voice', 'TTS error', { error: e.error || String(e) });
      _currentUtter = null;
      if (_wantListening) {
        State.transition(STATES.LISTENING, 'TTS error → listen');
        _startRecognizer();
      } else {
        State.transition(STATES.IDLE, 'TTS error, not listening');
      }
    };
    _currentUtter = u;
    try { window.speechSynthesis.speak(u); } catch (e) {
      Diag.add('voice', 'speechSynthesis.speak threw', String(e));
      if (u.onerror) u.onerror({ error: 'threw' });
    }
  }

  // Called by global tap handler — cancels current utterance so user
  // doesn't have to wait for app to finish talking. Also cancels any
  // active compound-command chain so the second side effect is dropped.
  function interruptSpeech() {
    if (State.get() !== STATES.SPEAKING) return;
    _cancelChain();
    try { window.speechSynthesis.cancel(); } catch(e) {}
    Diag.add('voice', 'TTS interrupted by tap');
    _currentUtter = null;
    // onend fires; the onend handler will transition to LISTENING.
  }

  // Silent warm-keep to prevent iOS silence-after-idle bug (spec §3.4).
  // Fires every 15s while in LISTENING if TTS has been idle >= 15s.
  function _startWarmKeep() {
    if (_warmKeepTimer) return;
    _warmKeepTimer = setInterval(() => {
      if (State.get() !== STATES.LISTENING) return;
      if (Date.now() - _lastSpeechEnd < 15000) return;
      if (!window.speechSynthesis || window.speechSynthesis.speaking) return;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        u.rate = 1;
        if (_preferredVoice) u.voice = _preferredVoice;
        window.speechSynthesis.speak(u);
        _lastSpeechEnd = Date.now();
      } catch(e) {
        Diag.add('voice', 'Warm-keep error', String(e));
      }
    }, 15000);
  }

  function _stopWarmKeep() {
    if (_warmKeepTimer) { clearInterval(_warmKeepTimer); _warmKeepTimer = null; }
  }

  // ───── Recognizer ──────────────────────────────────────────────

  function _buildRecognizer() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      Diag.add('voice', 'SpeechRecognition not available');
      return null;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = 'en-US';
    r.maxAlternatives = 5;

    r.onstart = () => {
      _recActive = true;
      Diag.add('voice', 'Recognizer onstart');
    };
    r.onend = () => {
      _recActive = false;
      Diag.add('voice', 'Recognizer onend', { wantListening: _wantListening });
      // Auto-restart loop — the only reliable iOS pattern (spec §3.2).
      if (_wantListening && State.get() === STATES.LISTENING) {
        // iOS Safari needs ~250-300ms to fully release the mic between
        // single-shot recognitions. Calling start() too quickly causes
        // silent rejection — recognizer appears active but no audio
        // reaches the handler. 300ms gives the most reliable restart
        // at the cost of slightly slower perceived responsiveness.
        setTimeout(() => _startRecognizer(), 300);
      }
    };
    r.onerror = (e) => {
      const err = e.error || 'unknown';
      Diag.add('voice', 'Recognizer onerror', { error: err });
      if (err === 'no-speech' || err === 'aborted') {
        // Not a real error — just a silent gap; onend will restart.
        return;
      }
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        _wantListening = false;
        State.transition(STATES.ERROR, `mic permission: ${err}`);
        UI.raiseBanner('mic-perm', 'err',
          'Microphone access required. Enable in iOS Settings → Safari → Microphone, then tap the voice badge.',
          'Retry', () => restart());
        return;
      }
      if (err === 'audio-capture') {
        _wantListening = false;
        State.transition(STATES.ERROR, 'audio-capture failure');
        UI.raiseBanner('mic-cap', 'err',
          'Audio capture failed. Check your microphone and tap the voice badge to try again.',
          'Retry', () => restart());
        return;
      }
      if (err === 'network') {
        State.transition(STATES.ERROR, 'network');
        UI.raiseOfflineBanner();
        return;
      }
      // Fall through: generic error, try restart
      State.transition(STATES.ERROR, `rec error: ${err}`);
    };
    r.onresult = (e) => {
      Diag.add('voice', 'Recognizer onresult');
      // If voice diagnostic is on, show the raw transcripts on screen
      // so the user can see what iOS actually heard. Invaluable when
      // the wake word isn't being recognized — we can read exactly
      // which tokens iOS returned and extend the allow-list or change
      // the wake word based on real data.
      _showDiagResult(e.results);
      const match = _findWakeWordInAlternatives(e.results);
      if (!match.matched) {
        // Silent: no wake word, just keep listening (spec §3.2)
        return;
      }
      const parsed = _parseCommand(match.tail);
      Diag.add('voice', `Parsed command`, parsed);
      _executeCommand(parsed);
    };
    return r;
  }

  function _startRecognizer(retryCount) {
    if (!_rec) _rec = _buildRecognizer();
    if (!_rec) return;
    if (_recActive) return;
    try {
      _rec.start();
    } catch (e) {
      const msg = String(e);
      Diag.add('voice', 'recognizer.start() threw', msg);
      // InvalidStateError means the recognizer hasn't fully released
      // from the previous session yet. Retry once after a longer delay.
      const isInvalidState = /InvalidStateError|already started/i.test(msg);
      if (isInvalidState && (retryCount || 0) < 2) {
        setTimeout(() => _startRecognizer((retryCount || 0) + 1), 500);
      }
    }
  }

  function _stopRecognizer() {
    if (!_rec) return;
    try { _rec.stop(); } catch(e) {}
  }

  // ───── Public API ──────────────────────────────────────────────

  // Called from Session.start() on user's BEGIN WORKOUT tap. This
  // gesture is required by iOS for both mic permission and TTS warmup.
  function initOnSessionStart() {
    _initialized = true;
    _ensureVoice();
    // Warm TTS inside the user gesture so later utterances aren't
    // swallowed (spec §3.2). TTS works offline; recognition does not.
    try {
      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0;
      window.speechSynthesis.speak(warmup);
    } catch(e) {}
    if (!navigator.onLine) {
      // Offline: TTS still works (announcements, intros) but the
      // recognizer cannot stream audio to Apple's servers. We don't
      // start the recognizer; the workout proceeds tap-driven.
      Diag.add('voice', 'Offline at session start — recognition disabled, TTS active');
      UI.raiseBanner('voice-offline', 'warn',
        'No network — voice commands paused. Tap controls still work; voice will resume when online.',
        'Dismiss', null,
        { transient: true, autoDismissMs: 8000 });
      State.transition(STATES.IDLE, 'offline at start');
      return;
    }
    _wantListening = true;
    State.transition(STATES.LISTENING, 'voice init');
    _startRecognizer();
    _startWarmKeep();
  }

  // Called when a session ends (explicit end or home exit).
  function shutdown() {
    _wantListening = false;
    _stopRecognizer();
    _stopWarmKeep();
    try { window.speechSynthesis.cancel(); } catch(e) {}
    if (State.get() === STATES.LISTENING || State.get() === STATES.SPEAKING ||
        State.get() === STATES.PROCESSING || State.get() === STATES.ERROR) {
      State.transition(STATES.IDLE, 'voice shutdown');
    }
    Diag.add('voice', 'Shutdown');
  }

  // Called when the voice badge is tapped — toggles listening state.
  function handleBadgeTap() {
    if (!_initialized) return;  // session never started
    const s = State.get();
    if (s === STATES.IDLE) {
      // Resume from pause
      _wantListening = true;
      if (!navigator.onLine) {
        UI.raiseOfflineBanner();
        return;
      }
      State.transition(STATES.LISTENING, 'badge tap → resume');
      _startRecognizer();
    } else if (s === STATES.ERROR) {
      restart();
    } else if (s === STATES.LISTENING) {
      // Tap to pause
      _wantListening = false;
      _stopRecognizer();
      State.transition(STATES.IDLE, 'badge tap → pause');
    } else if (s === STATES.SPEAKING) {
      interruptSpeech();
    }
  }

  function restart() {
    UI.clearBanner('mic-perm');
    UI.clearBanner('mic-cap');
    _wantListening = true;
    State.transition(STATES.LISTENING, 'restart');
    _startRecognizer();
  }

  // Called on visibilitychange (handled in Lifecycle).
  // When the page is hidden, we tear down the recognizer entirely
  // rather than just stopping it — iOS suspension can leave a stopped
  // recognizer in a state where start() succeeds but onresult never
  // fires. A fresh instance on resume avoids this trap.
  function onVisibilityHidden() {
    if (_rec) {
      try { _rec.abort(); } catch(e) {}
      _rec = null;
      _recActive = false;
      Diag.add('voice', 'Visibility hidden — recognizer torn down');
    }
    _stopWarmKeep();
  }

  function onVisibilityVisible() {
    // Only auto-resume if the user was actively listening when hidden.
    // If they were paused (IDLE) or in ERROR, leave them where they are.
    if (!_initialized || !_wantListening) return;
    if (!Session.getData()) return;  // session ended while hidden
    if (!navigator.onLine) {
      Diag.add('voice', 'Visibility visible but offline — waiting for online event');
      return;
    }
    Diag.add('voice', 'Visibility visible — rebuilding recognizer');
    // Allow a moment for iOS to settle, then rebuild and chime.
    setTimeout(() => {
      _resumeListeningWithChime('resumed');
    }, 250);
  }

  // Internal: rebuild a fresh recognizer, transition to LISTENING,
  // and play the audible "Listening" cue so the user knows voice is back.
  // Used by visibility-resume, online-resume, and pause→resume paths.
  function _resumeListeningWithChime(reason) {
    if (!_initialized) return;
    if (!Session.getData()) return;
    _wantListening = true;
    if (State.get() !== STATES.LISTENING) {
      State.transition(STATES.LISTENING, `resume: ${reason}`);
    }
    _startWarmKeep();
    _startRecognizer();
    // Brief audible cue. _speak transitions to SPEAKING and back to
    // LISTENING via onend, which will start the recognizer again.
    // We just-started it above; that's a redundant call but the
    // _recActive guard makes it a no-op.
    _speak('Listening.');
  }

  // Public speak — used by Session for intro/announcements. Respects
  // the state machine: will suspend recognizer, transition to SPEAKING,
  // then resume LISTENING on end (unless paused).
  function say(text, onDone) {
    _speak(text, onDone);
  }

  // Network came back. If we're in a session and were waiting for it,
  // resume listening with the audible chime.
  function onOnline() {
    if (!_initialized) return;
    if (!Session.getData()) return;
    UI.clearBanner('voice-offline');
    if (State.get() === STATES.LISTENING && _recActive) return;  // already running
    Diag.add('voice', 'Network online — resuming voice loop');
    _resumeListeningWithChime('online');
  }

  // Network went away. Recognition can't function without it; suspend.
  // TTS continues to work because it's local.
  function onOffline() {
    if (!_initialized) return;
    if (!Session.getData()) return;
    Diag.add('voice', 'Network offline — suspending recognizer (TTS still active)');
    _wantListening = false;
    _stopRecognizer();
    _stopWarmKeep();
    if (State.get() === STATES.LISTENING || State.get() === STATES.SPEAKING) {
      State.transition(STATES.IDLE, 'offline');
    }
    UI.raiseBanner('voice-offline', 'warn',
      'Network lost — voice commands paused. Will resume when online.',
      'Dismiss', null,
      { transient: false });  // sticky until network returns
  }

  // Returns the last N voice events for the long-press history view.
  // Pulls from the Diag ring buffer, filters to voice category, and
  // formats one entry per line.
  function getRecentVoiceEvents(n) {
    const all = Diag.all();
    const voice = all.filter(e => e.cat === 'voice');
    const last = voice.slice(-Math.max(1, n || 5));
    return last.map(e => {
      const t = new Date(e.t);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      const ss = String(t.getSeconds()).padStart(2, '0');
      const extra = e.extra ? ` ${typeof e.extra === 'string' ? e.extra : JSON.stringify(e.extra)}` : '';
      return `${hh}:${mm}:${ss}  ${e.msg}${extra}`;
    });
  }

  function showHistoryOverlay() {
    const overlay = document.getElementById('voice-history-overlay');
    const content = document.getElementById('voice-history-content');
    if (!overlay || !content) return;
    const events = getRecentVoiceEvents(12);
    content.textContent = events.length === 0
      ? '(no voice events yet)'
      : events.join('\n');
    overlay.style.display = 'flex';
  }

  function hideHistoryOverlay() {
    const overlay = document.getElementById('voice-history-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // Expose a small testable surface. Helpers marked __ are for tests.
  return {
    initOnSessionStart, shutdown, handleBadgeTap, restart, say,
    interruptSpeech, onVisibilityHidden, onVisibilityVisible,
    onOnline, onOffline,
    setPreferredVoiceByName, getPreferredVoiceName, getAllVoices,
    isVoiceDiagEnabled: _isDiagEnabled, setVoiceDiagEnabled: _setDiagEnabled,
    getRecentVoiceEvents, showHistoryOverlay, hideHistoryOverlay,
    __matchWakeWord: _matchWakeWord,
    __parseCommand: _parseCommand
  };
})();


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

  // ───── Command parser (Layer 1 subset) ─────────────────────────

  function _parseCommand(tail) {
    const t = (tail || '').trim().toLowerCase().replace(/[.,!?;]+$/g, '');
    if (!t) return { cmd: 'bare' };  // bare wake word with nothing after
    // NEXT
    if (/^(next( exercise)?|move on|keep going)$/.test(t)) return { cmd: 'next' };
    // PREVIOUS
    if (/^(previous( exercise)?|back|go back|last one)$/.test(t)) return { cmd: 'previous' };
    // REPEAT
    if (/^(repeat|say that again|what was that|come again)$/.test(t)) return { cmd: 'repeat' };
    // HELP
    if (/^help$/.test(t)) return { cmd: 'help' };
    // PAUSE
    // PAUSE — iOS frequently mis-hears "pause" as "paul" or "paul's"
    // (the soft "z" sounds like a possessive 's, the "aw" vowel matches
    // the name). "paws" is another common mis-hearing. Extend tolerantly.
    if (/^(pause|pause's|paus|paul|paul's|pauls|paws|paw's|stop listening|mute)$/.test(t)) {
      return { cmd: 'pause' };
    }
    return { cmd: 'unknown', text: t };
  }

  function _executeCommand(parsed) {
    State.transition(STATES.PROCESSING, `parse: ${parsed.cmd}`);
    switch (parsed.cmd) {
      case 'bare':
        _speak('Yes? What would you like to do?');
        return;
      case 'next': {
        const plan = Session.getPlan();
        const data = Session.getData();
        if (!plan || !data) { _speak('No session active.'); return; }
        if (data.currentIndex >= plan.exercises.length - 1) {
          _speak('That was the last exercise.');
          return;
        }
        // Session.navigate announces the destination itself (spec §6.2).
        // The parser's job here is just to move. We still need to
        // return to LISTENING after — navigate() calls Voice.say()
        // which handles that via onend.
        Session.navigate(1);
        return;
      }
      case 'previous': {
        const data = Session.getData();
        if (!data) { _speak('No session active.'); return; }
        if (data.currentIndex === 0) {
          _speak('Already at the first exercise.');
          return;
        }
        Session.navigate(-1);
        return;
      }
      case 'repeat': {
        const ex = Session.getCurrentExercise();
        if (!ex) { _speak('No exercise loaded.'); return; }
        _speak(_describeExercise(ex));
        return;
      }
      case 'help':
        _speak('Say next, previous, or repeat. More commands coming soon.');
        return;
      case 'pause':
        _stopRecognizer();
        _wantListening = false;
        _speak('Paused. Tap the badge to resume.');
        // After speech ends, state goes to LISTENING by default via onend.
        // We want IDLE instead, so flag it:
        _pauseAfterSpeak = true;
        return;
      case 'unknown':
      default:
        _speak("I didn't catch that. Say Coach help for commands.");
        return;
    }
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
  // doesn't have to wait for app to finish talking.
  function interruptSpeech() {
    if (State.get() !== STATES.SPEAKING) return;
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


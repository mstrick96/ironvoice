// ═══════════════════════════════════════════════════════════════
// SESSION
// ═══════════════════════════════════════════════════════════════
// All session mutations go through Session methods.
// REGRESSION HAZARD: every mutation must call heartbeat() to keep
// lastActivityTimestamp fresh for the close-tab detection logic.
const Session = (() => {
  let _data = null;
  let _plan = null;

  function getEffectiveValue(exId, field) {
    if (!_data) return null;
    const overrides = (_data.todayOverrides || {})[exId] || {};
    if (field in overrides) return overrides[field];
    const ex = _plan ? _plan.exercises.find(e => e.id === exId) : null;
    return ex ? ex[field] : null;
  }

  function getCurrentExercise() {
    if (!_data || !_plan) return null;
    const ex = _plan.exercises[_data.currentIndex];
    if (!ex) return null;
    // Merge today's overrides into a copy so callers see effective values
    return Object.assign({}, ex, (_data.todayOverrides || {})[ex.id] || {});
  }

  function getSetCount(exId) {
    if (!_data) return 0;
    return _data.logEntries.filter(e => e.exId === exId).length;
  }

  function isExerciseDone(exId) { return getSetCount(exId) > 0; }

  function heartbeat() {
    if (_data) {
      _data.lastActivityTimestamp = Date.now();
      Storage.saveKey('session', _data);
    }
  }

  function _newSessionObject() {
    const now = new Date();
    return {
      schemaVersion: SCHEMA_VERSION,
      id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
      startTime: now.toISOString(),
      currentIndex: 0,
      logEntries: [],
      todayOverrides: {},
      noteSeenIds: [],
      pendingPlanChanges: [],
      extraSetsToday: {},  // { exId: count of extra dots added this session }
      capWarningShown: false,  // one-time 3+ sets warning per session
      sessionNote: '',
      lastActivityTimestamp: Date.now()
    };
  }

  function start() {
    _plan = Storage.loadKey('plan');
    _data = _newSessionObject();
    heartbeat();
    Diag.add('session', 'Session started', { id: _data.id });
    WorkoutUI.render();
    UI.showScreen('workout');
    // Voice comes up in LISTENING; Voice.initOnSessionStart handles
    // the state transition from IDLE. Must be called synchronously
    // from the user-gesture click handler for iOS mic permission.
    Voice.initOnSessionStart();
    // Optional intro: announce the first exercise. Spec §6.1.
    const ex = getCurrentExercise();
    if (ex) {
      // Small timeout so the state transition to LISTENING lands first,
      // then speak — which transitions to SPEAKING and back.
      setTimeout(() => {
        if (State.get() === STATES.LISTENING) {
          _speakIntro(ex, _plan.exercises.length);
        }
      }, 200);
    }
  }

  // Build a spoken-exercise description. Used by navigate() and the
  // intro. Note the Voice module's 'repeat' command uses its own
  // copy-of-this for decoupling — duplication is deliberate for now.
  function _describeForSpeech(ex) {
    if (ex.type === 'timed') {
      const lvl = getEffectiveValue(ex.id, 'level');
      const dur = getEffectiveValue(ex.id, 'duration');
      return `${ex.name}. Level ${lvl}. ${dur} minutes.`;
    }
    const sets   = getEffectivePlannedSets(ex.id);
    const reps   = getEffectiveValue(ex.id, 'reps');
    const weight = getEffectiveValue(ex.id, 'weight');
    const setsWord = sets === 1 ? 'set' : 'sets';
    // "reps" and "lbs" abbreviations are normalized in Voice.say().
    return `${ex.name}. ${sets} ${setsWord}, ${reps} reps at ${weight} pounds.`;
  }

  // Session-level helper that talks to Voice. Kept in Session module
  // because the intro content is session-domain, not voice-domain.
  function _speakIntro(ex, total) {
    const msg = `Iron Voice ready. ${total} exercises today. Starting with ${_describeForSpeech(ex)}`;
    Voice.say(msg);
  }

  function resume() {
    _plan = Storage.loadKey('plan');
    const saved = Storage.loadKey('session');
    if (!saved) { start(); return; }
    _data = saved;
    // Patch missing fields from older sessions (forward compat)
    if (!_data.todayOverrides) _data.todayOverrides = {};
    if (!_data.noteSeenIds) _data.noteSeenIds = [];
    if (!_data.extraSetsToday) _data.extraSetsToday = {};
    if (typeof _data.capWarningShown !== 'boolean') _data.capWarningShown = false;
    heartbeat();
    Diag.add('session', 'Session resumed', { id: _data.id, index: _data.currentIndex });
    WorkoutUI.render();
    UI.showScreen('workout');
    // Re-initialize voice on resume — must be inside the user-gesture
    // click that triggered resume() so iOS mic permission sticks.
    Voice.initOnSessionStart();
    const ex = getCurrentExercise();
    if (ex) {
      setTimeout(() => {
        if (State.get() === STATES.LISTENING) {
          Voice.say(`Resumed. ${ex.name}.`);
        }
      }, 200);
    }
  }

  function startFresh() {
    Storage.saveKey('session', null);
    Diag.add('session', 'Starting fresh — discarded prior session');
    start();
  }

  function navigate(delta) {
    if (!_data || !_plan) return;
    const newIdx = _data.currentIndex + delta;
    if (newIdx < 0 || newIdx >= _plan.exercises.length) return;
    _data.currentIndex = newIdx;
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Navigate to index ${newIdx}`);
    // Spec §6.2: announce each exercise on arrival. Applies whether
    // navigation came from voice ("Coach next") or tap (PREV/NEXT).
    const ex = getCurrentExercise();
    if (ex) {
      const intro = delta > 0 ? 'Moving to ' : 'Going back to ';
      Voice.say(intro + _describeForSpeech(ex));
    }
  }

  function goTo(index) {
    if (!_data || !_plan) return;
    if (index < 0 || index >= _plan.exercises.length) return;
    const sameIndex = _data.currentIndex === index;
    _data.currentIndex = index;
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Jump to index ${index}`);
    // Announce the destination — same behavior as navigate() per
    // spec §6.2. Skip if user tapped the exercise they were already on.
    if (!sameIndex) {
      const ex = getCurrentExercise();
      if (ex) Voice.say('Going to ' + _describeForSpeech(ex));
    }
  }

  function logSet() {
    if (!_data || !_plan) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    const setNum = getSetCount(ex.id) + 1;
    const entry = {
      id: Date.now().toString(36),
      exId: ex.id,
      name: ex.name,
      type: ex.type,
      setNum,
      timestamp: new Date().toISOString()
    };
    if (ex.type === 'strength') {
      entry.weight = getEffectiveValue(ex.id, 'weight');
      entry.reps   = getEffectiveValue(ex.id, 'reps');
    } else {
      entry.level    = getEffectiveValue(ex.id, 'level');
      entry.duration = getEffectiveValue(ex.id, 'duration');
    }
    _data.logEntries.push(entry);
    heartbeat();
    WorkoutUI.render();
    WorkoutUI.showLoggedConfirm(entry);
    Diag.add('session', `Logged set ${setNum} for ${ex.name}`);
  }

  function undoLastSet() {
    if (!_data) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    const lastIdx = _data.logEntries.map(e => e.exId).lastIndexOf(ex.id);
    if (lastIdx !== -1) {
      _data.logEntries.splice(lastIdx, 1);
      heartbeat();
      WorkoutUI.render();
      Diag.add('session', `Undo last set for ${ex.name}`);
    }
  }

  function applyTodayOverride(field, value) {
    if (!_data) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    if (!_data.todayOverrides[ex.id]) _data.todayOverrides[ex.id] = {};
    _data.todayOverrides[ex.id][field] = value;
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Today override: ${ex.id}.${field} = ${value}`);
  }

  function queuePlanChange(field, value) {
    if (!_data) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    // Apply as today override too so display reflects the change immediately
    if (!_data.todayOverrides[ex.id]) _data.todayOverrides[ex.id] = {};
    _data.todayOverrides[ex.id][field] = value;
    _data.pendingPlanChanges.push({
      exId: ex.id, field, value, timestamp: new Date().toISOString()
    });
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Queued plan change: ${ex.id}.${field} = ${value}`);
    // Clear any existing plan-change banner before raising new one
    UI.clearBanner('plan-change');
    UI.raiseBanner('plan-change', 'info',
      `${ex.name}: ${field} updated for next time.`, 'Dismiss', null,
      { transient: true, autoDismissMs: 4000 });
  }

  // Effective planned-set count = plan sets + extra dots added this session.
  // Used when rendering the workout card so extra dots persist across navigation.
  function getEffectivePlannedSets(exId) {
    if (!_data) return 1;
    const ex = _plan ? _plan.exercises.find(e => e.id === exId) : null;
    const planned = ex ? (ex.sets || 1) : 1;
    const extra = (_data.extraSetsToday || {})[exId] || 0;
    return planned + extra;
  }

  // Add an extra set dot today only (not saved to plan).
  // Called by the ADD SET button once all planned+extra dots are logged.
  function addSetDotOnly() {
    if (!_data) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    if (ex.type === 'timed') return; // add-set not applicable to timed exercises
    if (!_data.extraSetsToday) _data.extraSetsToday = {};
    _data.extraSetsToday[ex.id] = (_data.extraSetsToday[ex.id] || 0) + 1;
    // If we added a plan-change for sets previously and now have more dots than it covered,
    // update/replace so save-for-next-time tap below matches what's on screen.
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Extra set dot added (today only): ${ex.id} → ${_data.extraSetsToday[ex.id]}`);
    // Guardrail: one-time warning the first time session total hits >=4 sets anywhere.
    const totalDotsNow = getEffectivePlannedSets(ex.id);
    if (totalDotsNow >= 4 && !_data.capWarningShown) {
      _data.capWarningShown = true;
      heartbeat();
      UI.raiseBanner('set-cap', 'info',
        'Most guidelines cap strength training at 2–3 sets for your age group. Consider increasing weight on your next progression instead.',
        'Got it', null,
        { transient: true, autoDismissMs: 10000 });
    }
  }

  // Save current effective set count (planned + extras) as the new plan set count
  // for next time. Coalesces: repeated taps overwrite the prior pending change
  // with the current count.
  function saveSetCountForNextTime() {
    if (!_data) return;
    const ex = getCurrentExercise();
    if (!ex) return;
    if (ex.type === 'timed') return;
    const newCount = getEffectivePlannedSets(ex.id);
    // Remove any prior queued sets-change for this exercise — coalesce.
    _data.pendingPlanChanges = _data.pendingPlanChanges.filter(
      ch => !(ch.exId === ex.id && ch.field === 'sets')
    );
    _data.pendingPlanChanges.push({
      exId: ex.id, field: 'sets', value: newCount, timestamp: new Date().toISOString()
    });
    heartbeat();
    WorkoutUI.render();
    Diag.add('session', `Queued plan change: ${ex.id}.sets = ${newCount}`);
    UI.clearBanner('plan-change');
    UI.raiseBanner('plan-change', 'info',
      `${ex.name}: set count will be ${newCount} next time.`, 'Dismiss', null,
      { transient: true, autoDismissMs: 4000 });
  }

  // Returns true if this exercise already has a pending "sets" plan change
  // matching the current effective dot count (for button styling/labeling).
  function isSetCountSavedForNextTime(exId) {
    if (!_data) return false;
    const current = getEffectivePlannedSets(exId);
    return _data.pendingPlanChanges.some(
      ch => ch.exId === exId && ch.field === 'sets' && ch.value === current
    );
  }

  function markNoteSeen(exId) {
    if (!_data) return;
    if (!_data.noteSeenIds.includes(exId)) {
      _data.noteSeenIds.push(exId);
      // Lightweight save — just key update, no full heartbeat needed
      Storage.saveKey('session', _data);
    }
  }

  function end() {
    if (!_data || !_plan) return;
    const history = Storage.loadKey('history');

    // Apply pending plan changes to the saved plan
    if (_data.pendingPlanChanges.length > 0) {
      _data.pendingPlanChanges.forEach(ch => {
        const ex = _plan.exercises.find(e => e.id === ch.exId);
        if (ex) {
          ex[ch.field] = ch.value;
          Diag.add('session', `Applied plan change: ${ch.exId}.${ch.field} = ${ch.value}`);
        }
      });
      Storage.saveKey('plan', _plan);
    }

    const now = Date.now();
    const startMs = new Date(_data.startTime).getTime();
    const durationMin = Math.max(0, Math.round((now - startMs) / 60000));

    const record = {
      id: _data.id,
      date: _data.startTime.slice(0, 10),
      startTime: _data.startTime,
      endTime: new Date().toISOString(),
      duration: durationMin,
      logEntries: _data.logEntries,
      sessionNote: _data.sessionNote,
      planChanges: _data.pendingPlanChanges,
      autoFinalizedOnClose: false,
      schemaVersion: SCHEMA_VERSION
    };
    history.sessions.push(record);
    Storage.saveKey('history', history);
    Storage.saveKey('session', null);
    Diag.add('session', 'Session ended explicitly', { duration: durationMin });

    const snapshot = {
      logEntries: _data.logEntries.slice(),
      pendingPlanChanges: _data.pendingPlanChanges.slice(),
      startTime: _data.startTime,
      duration: durationMin
    };
    _data = null;
    _plan = null;
    // Shut down voice cleanly — stops recognizer, cancels any active
    // TTS, clears warm-keep timer, transitions state to IDLE if not
    // already there.
    Voice.shutdown();
    State.transition(STATES.IDLE, 'session ended');
    Summary.show(snapshot);
  }

  function getData() { return _data; }
  function getPlan() { return _plan; }

  return {
    start, resume, startFresh, navigate, goTo,
    logSet, undoLastSet, applyTodayOverride, queuePlanChange, markNoteSeen, end,
    addSetDotOnly, saveSetCountForNextTime,
    getEffectivePlannedSets, isSetCountSavedForNextTime,
    getCurrentExercise, getEffectiveValue, getSetCount, isExerciseDone,
    heartbeat, getData, getPlan
  };
})();


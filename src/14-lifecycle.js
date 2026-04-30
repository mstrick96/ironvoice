// ═══════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════
const Lifecycle = (() => {
  const STALE_MS = CONFIG.STALE_SESSION_HOURS * 3600000;

  function evaluateSessionOnLoad() {
    const session = Storage.loadKey('session');
    if (session === null) {
      Diag.add('lifecycle', 'No prior session');
      return 'fresh';
    }
    const age = Date.now() - session.lastActivityTimestamp;
    if (age > STALE_MS) {
      Diag.add('lifecycle', `Stale session (${Math.round(age/3600000)}h) → auto-finalize`);
      _autoFinalizeSession(session);
      return 'finalized';
    }
    Diag.add('lifecycle', `Resumable session (${Math.round(age/60000)}m old)`);
    return 'resumable';
  }

  function _autoFinalizeSession(session) {
    const history = Storage.loadKey('history');
    const plan    = Storage.loadKey('plan');
    if (Array.isArray(session.pendingPlanChanges)) {
      session.pendingPlanChanges.forEach(ch => {
        const ex = plan.exercises.find(e => e.id === ch.exId);
        if (ex && ch.field in ex) ex[ch.field] = ch.value;
      });
      Storage.saveKey('plan', plan);
    }
    const startMs = new Date(session.startTime).getTime();
    const endMs   = session.lastActivityTimestamp;
    const record = {
      id: session.id,
      date: session.startTime.slice(0, 10),
      startTime: session.startTime,
      duration: Math.max(0, Math.round((endMs - startMs) / 60000)),
      logEntries: session.logEntries || [],
      sessionNote: session.sessionNote || '',
      planChanges: session.pendingPlanChanges || [],
      autoFinalizedOnClose: true,
      schemaVersion: SCHEMA_VERSION
    };
    history.sessions.push(record);
    Storage.saveKey('history', history);
    Storage.saveKey('session', null);
    UI.raiseBanner('auto-finalized', 'info', 'Prior session auto-saved to history.', 'Dismiss', null);
  }

  function buildResumeScreen(session) {
    const plan = Storage.loadKey('plan');
    const ex = plan && plan.exercises[session.currentIndex];
    document.getElementById('resume-ex-name').textContent =
      ex ? ex.name.toUpperCase() : 'Unknown';
    const logCount = new Set(session.logEntries.map(e => e.exId)).size;
    const total = plan ? plan.exercises.length : 0;
    const ageMin = Math.round((Date.now() - session.lastActivityTimestamp) / 60000);
    document.getElementById('resume-stat').innerHTML =
      `${logCount} of ${total} exercises logged<br>Last active: ${ageMin < 2 ? 'just now' : ageMin + ' min ago'}`;
  }

  return { evaluateSessionOnLoad, buildResumeScreen };
})();


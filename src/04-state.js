// ═══════════════════════════════════════════════════════════════
// STATE MACHINE
// ═══════════════════════════════════════════════════════════════
// REGRESSION HAZARD: every state change must go through transition().
// Direct assignment of State.current is forbidden.
const State = (() => {
  let current = STATES.IDLE;
  const listeners = [];
  function transition(to, reason) {
    const from = current;
    if (from === to) { Diag.add('state', `No-op: already ${to}`); return true; }
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      Diag.add('state', `ILLEGAL ${from} → ${to} blocked`, { reason });
      return false;
    }
    current = to;
    Diag.add('state', `${from} → ${to}`, { reason });
    UI.reflectState(to);
    listeners.forEach(fn => { try { fn(to, from, reason); } catch(e) {} });
    return true;
  }
  function get() { return current; }
  function onChange(fn) { listeners.push(fn); }
  function forceReset(to, reason) {
    const from = current;
    current = to;
    Diag.add('state', `FORCE ${from} → ${to}`, { reason });
    UI.reflectState(to);
  }
  return { transition, get, onChange, forceReset };
})();


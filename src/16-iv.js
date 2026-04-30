// ═══════════════════════════════════════════════════════════════
// IV — public namespace (accessible as window.IV in dev console)
// ═══════════════════════════════════════════════════════════════
const IV = {
  showScreen: UI.showScreen,
  inspector: {
    showRawJson: Inspector.showRawJson,
    requestClearHistory: Inspector.requestClearHistory,
    cancelClear: Inspector.cancelClear,
    doClear: Inspector.doClear
  },
  // Debug helpers (console access, no on-screen panel in Step 2)
  debugStartSession:      () => Session.start(),
  debugMakeSessionStale(hoursAgo) {
    hoursAgo = hoursAgo || 7;
    const session = Storage.loadKey('session');
    if (!session) { console.warn('No session'); return; }
    session.lastActivityTimestamp = Date.now() - hoursAgo * 3600000;
    Storage.saveKey('session', session);
    console.log(`Session timestamped ${hoursAgo}h ago. Reload to trigger auto-finalize.`);
  },
  debugCorruptKey(keyName) {
    if (!STORAGE_KEYS[keyName]) { console.warn(`Unknown key: ${keyName}`); return; }
    localStorage.setItem(STORAGE_KEYS[keyName], '{not valid json');
    console.log(`${keyName} corrupted. Reload to see recovery.`);
  },
  debugWipeAll() {
    if (!confirm('Wipe ALL Iron Voice data? (testing only)')) return;
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('iv.corrupt.v2.')) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    location.reload();
  },
  diag:        { all: () => Diag.all(), clear: () => Diag.clear() },
  state:       { get: () => State.get(), debugTransition: (to, r) => State.transition(to, r || 'debug') },
  storage:     { loadKey: Storage.loadKey, totalSize: Storage.totalSizeBytes },
  session:     { getData: Session.getData, getPlan: Session.getPlan },
  STATES, STORAGE_KEYS, SCHEMA_VERSION, CONFIG
};
window.IV  = IV;
window.__iv = IV;


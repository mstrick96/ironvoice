// ═══════════════════════════════════════════════════════════════
// STORAGE LAYER
// ═══════════════════════════════════════════════════════════════
// REGRESSION HAZARD: every new storage field must be added to the
// factory default AND validateShape(). Missing validation = silent
// corruption retained.
const Storage = (() => {
  function defaultPlan() {
    return { schemaVersion: SCHEMA_VERSION, exercises: JSON.parse(JSON.stringify(CONFIG.DEFAULT_PLAN)) };
  }
  function defaultSession() { return null; }
  function defaultHistory() { return { schemaVersion: SCHEMA_VERSION, sessions: [] }; }
  function defaultSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      defaultRestSeconds: CONFIG.DEFAULT_REST_SECONDS,
      lastExportDate: null,
      lastBackupConfirmedDate: null,
      voiceDiagEnabled: false
    };
  }
  function validateShape(key, obj) {
    if (obj === null && key === 'session') return true;
    if (!obj || typeof obj !== 'object') return false;
    if (typeof obj.schemaVersion !== 'number') return false;
    switch (key) {
      case 'plan':    return Array.isArray(obj.exercises);
      case 'session': return typeof obj.id === 'string' &&
                             typeof obj.startTime === 'string' &&
                             typeof obj.currentIndex === 'number' &&
                             typeof obj.lastActivityTimestamp === 'number' &&
                             Array.isArray(obj.logEntries);
      case 'history': return Array.isArray(obj.sessions);
      case 'settings': return true;
      default: return false;
    }
  }
  function migrate(key, obj) {
    if (!obj || typeof obj.schemaVersion !== 'number') return obj;
    while (obj.schemaVersion < SCHEMA_VERSION) {
      switch (obj.schemaVersion) {
        // case 1: obj = upgradeV1toV2(key, obj); break;
        default:
          Diag.add('storage', `Unknown schema ${obj.schemaVersion} for ${key} — cannot migrate`);
          return null;
      }
    }
    return obj;
  }
  function stashCorrupt(key, rawValue) {
    const stashKey = `iv.corrupt.v2.${key}.${Date.now()}`;
    try { localStorage.setItem(stashKey, rawValue); Diag.add('storage', `Corrupt ${key} stashed to ${stashKey}`); }
    catch(e) { Diag.add('storage', `Failed to stash ${key}`, e.message); }
  }
  function factoryDefault(keyName) {
    switch (keyName) {
      case 'plan':    return defaultPlan();
      case 'session': return defaultSession();
      case 'history': return defaultHistory();
      case 'settings': return defaultSettings();
      default: throw new Error(`Unknown key: ${keyName}`);
    }
  }
  function loadKey(keyName) {
    const storageKey = STORAGE_KEYS[keyName];
    const raw = localStorage.getItem(storageKey);
    if (raw === null) {
      const def = factoryDefault(keyName);
      if (!(keyName === 'session' && def === null)) {
        saveKey(keyName, def);
        Diag.add('storage', `Initialized ${keyName} with defaults`);
      } else {
        Diag.add('storage', `No prior ${keyName} (first load)`);
      }
      return def;
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch(e) {
      Diag.add('storage', `JSON parse failed for ${keyName}`, e.message);
      stashCorrupt(keyName, raw);
      UI.raiseCorruptionBanner(keyName);
      const def = factoryDefault(keyName);
      saveKey(keyName, def);
      return def;
    }
    if (keyName === 'session' && parsed === null) return null;
    if (parsed && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion < SCHEMA_VERSION) {
      parsed = migrate(keyName, parsed);
      if (parsed === null) {
        stashCorrupt(keyName, raw);
        UI.raiseCorruptionBanner(keyName);
        const def = factoryDefault(keyName);
        saveKey(keyName, def);
        return def;
      }
    }
    if (!validateShape(keyName, parsed)) {
      Diag.add('storage', `Shape validation failed for ${keyName}`, parsed);
      stashCorrupt(keyName, raw);
      UI.raiseCorruptionBanner(keyName);
      const def = factoryDefault(keyName);
      saveKey(keyName, def);
      return def;
    }
    return parsed;
  }
  function saveKey(keyName, value) {
    const storageKey = STORAGE_KEYS[keyName];
    try {
      localStorage.setItem(storageKey, value === null ? 'null' : JSON.stringify(value));
      return true;
    } catch(e) {
      if (e.name === 'QuotaExceededError' || /quota/i.test(e.message)) {
        Diag.add('storage', `Quota exceeded saving ${keyName}`, e.message);
        UI.raiseQuotaBanner();
      } else {
        Diag.add('storage', `Save failed for ${keyName}`, e.message);
      }
      return false;
    }
  }
  function totalSizeBytes() {
    let total = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(key);
      if (v) total += v.length + key.length;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('iv.corrupt.v2.')) {
        const v = localStorage.getItem(k);
        if (v) total += v.length + k.length;
      }
    }
    return total;
  }
  return { loadKey, saveKey, factoryDefault, totalSizeBytes, defaultPlan, defaultHistory, defaultSettings };
})();


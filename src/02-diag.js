// ═══════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════
const Diag = (() => {
  let buffer = [];
  function add(category, message, extra) {
    const entry = { t: new Date().toISOString(), cat: category, msg: message };
    if (extra !== undefined) entry.extra = extra;
    buffer.push(entry);
    if (buffer.length > CONFIG.DIAG_BUFFER_SIZE) buffer = buffer.slice(-CONFIG.DIAG_BUFFER_SIZE);
    console.log(`[IV:${category}]`, message, extra !== undefined ? extra : '');
  }
  function all() { return buffer.slice(); }
  function clear() { buffer = []; }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.diag);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) buffer = p.slice(-CONFIG.DIAG_BUFFER_SIZE); }
    } catch(e) {}
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEYS.diag, JSON.stringify(buffer)); } catch(e) {}
  }
  return { add, all, clear, load, save };
})();


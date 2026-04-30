// ═══════════════════════════════════════════════════════════════
// PREFLIGHT
// ═══════════════════════════════════════════════════════════════
const Preflight = (() => {
  function isInsecure() {
    const proto = location.protocol;
    const host  = location.hostname;
    if (proto === 'https:') return false;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return proto === 'file:' || proto === 'http:';
  }
  function isPWAStandalone() {
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return false;
  }
  function isOffline() { return typeof navigator !== 'undefined' && navigator.onLine === false; }
  return { isInsecure, isPWAStandalone, isOffline };
})();


// ═══════════════════════════════════════════════════════════════
// STORAGE INSPECTOR
// ═══════════════════════════════════════════════════════════════
const Inspector = (() => {
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }
  function formatDate(v) {
    if (!v) return 'Never';
    const d = typeof v === 'number' ? new Date(v) : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  }
  function refresh() {
    const plan     = Storage.loadKey('plan');
    const session  = Storage.loadKey('session');
    const history  = Storage.loadKey('history');
    const settings = Storage.loadKey('settings');
    document.getElementById('insp-size').textContent   = formatBytes(Storage.totalSizeBytes());
    document.getElementById('insp-schema').textContent = 'v' + SCHEMA_VERSION;
    document.getElementById('insp-state').textContent  = State.get();
    if (session === null) {
      document.getElementById('insp-session').textContent = 'None';
      document.getElementById('insp-lastact').textContent = '—';
    } else {
      document.getElementById('insp-session').textContent = `Active (${session.logEntries.length} logged)`;
      document.getElementById('insp-lastact').textContent = formatDate(session.lastActivityTimestamp);
    }
    const count = history.sessions.length;
    document.getElementById('insp-histcount').textContent = count;
    if (count === 0) {
      document.getElementById('insp-oldest').textContent = '—';
      document.getElementById('insp-newest').textContent = '—';
    } else {
      // Use the full ISO startTime when present. Falling back to `date`
      // (which is only YYYY-MM-DD) parses as UTC midnight and shifts
      // west-of-UTC users back to 8 PM the previous day.
      const oldest = history.sessions[0];
      const newest = history.sessions[count - 1];
      document.getElementById('insp-oldest').textContent = formatDate(oldest.startTime || oldest.date);
      document.getElementById('insp-newest').textContent = formatDate(newest.startTime || newest.date);
    }
    document.getElementById('insp-lastexport').textContent = formatDate(settings.lastExportDate);
    document.getElementById('insp-lastbackup').textContent = formatDate(settings.lastBackupConfirmedDate);
  }
  function showRawJson() {
    const dump = {
      plan:     Storage.loadKey('plan'),
      session:  Storage.loadKey('session'),
      history:  Storage.loadKey('history'),
      settings: Storage.loadKey('settings')
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function requestClearHistory() {
    const input = document.getElementById('confirm-input');
    const okBtn = document.getElementById('confirm-ok-btn');
    input.value = '';
    okBtn.disabled = true;
    document.getElementById('confirm-clear').classList.add('active');
    setTimeout(() => input.focus(), 50);
  }
  function cancelClear() { document.getElementById('confirm-clear').classList.remove('active'); }
  function doClear() {
    Storage.saveKey('history', Storage.defaultHistory());
    Diag.add('storage', 'History cleared by user');
    cancelClear();
    refresh();
    UI.raiseBanner('cleared', 'info', 'History cleared.', 'Dismiss', null,
      { transient: true, autoDismissMs: 3000 });
  }
  return { refresh, showRawJson, requestClearHistory, cancelClear, doClear };
})();


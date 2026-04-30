// ═══════════════════════════════════════════════════════════════
// END WORKOUT CONFIRMATION
// ═══════════════════════════════════════════════════════════════
const EndConfirm = (() => {
  function show() {
    const sessionData = Session.getData();
    const plan = Session.getPlan();
    if (!sessionData || !plan) return;

    // Gather quick stats for the confirmation card
    const uniqueDone = new Set(sessionData.logEntries.map(e => e.exId)).size;
    const total = plan.exercises.length;
    const startMs = new Date(sessionData.startTime).getTime();
    const elapsedMin = Math.max(0, Math.round((Date.now() - startMs) / 60000));

    const statsEl = document.getElementById('end-card-stats');
    statsEl.innerHTML = `${uniqueDone} of ${total} exercises logged<br>${elapsedMin} min elapsed`;

    document.getElementById('end-overlay').classList.add('active');
  }
  function cancel() {
    document.getElementById('end-overlay').classList.remove('active');
  }
  function confirm() {
    document.getElementById('end-overlay').classList.remove('active');
    Session.end();
  }
  return { show, cancel, confirm };
})();


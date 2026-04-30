// ═══════════════════════════════════════════════════════════════
// SUMMARY SCREEN
// ═══════════════════════════════════════════════════════════════
const Summary = (() => {
  function show(snapshot) {
    // Date/time
    const dt = new Date(snapshot.startTime);
    document.getElementById('summary-date').textContent =
      dt.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

    // Stats
    document.getElementById('sum-duration').textContent = snapshot.duration;
    const uniqueExercises = new Set(snapshot.logEntries.map(e => e.exId)).size;
    document.getElementById('sum-logged').textContent = uniqueExercises;
    document.getElementById('sum-sets').textContent = snapshot.logEntries.length;

    // Logged exercise list (one row per unique exercise, most recent values)
    const byEx = {};
    snapshot.logEntries.forEach(e => {
      if (!byEx[e.exId]) byEx[e.exId] = { name: e.name, type: e.type, entries: [] };
      byEx[e.exId].entries.push(e);
    });
    const listHtml = Object.values(byEx).map(ex => {
      const last = ex.entries[ex.entries.length - 1];
      const setCount = ex.entries.length;
      let val;
      if (ex.type === 'strength') {
        val = `${setCount} set${setCount > 1 ? 's' : ''} · ${last.reps} reps @ ${last.weight} lbs`;
      } else {
        val = `${last.duration} min · Level ${last.level}`;
      }
      return `
        <div class="summary-log-item">
          <span class="summary-log-name">${_esc(ex.name)}</span>
          <span class="summary-log-val">${val}</span>
        </div>`;
    }).join('') || '<div style="padding:12px;text-align:center;color:var(--text-3)">Nothing logged</div>';
    document.getElementById('summary-log-list').innerHTML = listHtml;

    // Plan changes note
    const noteEl = document.getElementById('summary-plan-note');
    const changes = snapshot.pendingPlanChanges || [];
    if (changes.length > 0) {
      noteEl.textContent = `${changes.length} plan update${changes.length > 1 ? 's' : ''} saved for next session.`;
      noteEl.style.display = 'block';
    } else {
      noteEl.style.display = 'none';
    }

    UI.showScreen('summary');

    // Progression-prompt guardrail: if the user saved NEW set counts on 3+
    // distinct exercises in one session, nudge them toward the next
    // progression step (increase weight rather than keep stacking sets).
    // Raised AFTER showScreen() because showScreen clears transient banners.
    const setsChangesExIds = new Set(
      changes.filter(ch => ch.field === 'sets').map(ch => ch.exId)
    );
    if (setsChangesExIds.size >= 3) {
      UI.raiseBanner('progression-tip', 'info',
        `You increased sets on ${setsChangesExIds.size} exercises today. When you're ready for the next progression step, consider increasing weight and dropping back to 1 set.`,
        'Thanks', null,
        { transient: true, autoDismissMs: 12000 });
    }
  }

  function done() {
    UI.showScreen('welcome');
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { show, done };
})();


// ═══════════════════════════════════════════════════════════════
// WORKOUT UI
// ═══════════════════════════════════════════════════════════════
const WorkoutUI = (() => {
  let _badgeTimer = null;

  function render() {
    const ex = Session.getCurrentExercise();
    const sessionData = Session.getData();
    const plan = Session.getPlan();
    if (!ex || !sessionData || !plan) return;

    const idx = sessionData.currentIndex;

    // Header
    document.getElementById('workout-progress').textContent =
      `Exercise ${idx + 1} of ${plan.exercises.length}`;

    // Exercise name
    document.getElementById('ex-name').textContent = ex.name.toUpperCase();

    // Values
    if (ex.type === 'strength') {
      document.getElementById('strength-values').style.display = 'flex';
      document.getElementById('timed-values').style.display = 'none';
      document.getElementById('val-weight').textContent = Session.getEffectiveValue(ex.id, 'weight');
      document.getElementById('val-reps').textContent   = Session.getEffectiveValue(ex.id, 'reps');
    } else {
      document.getElementById('strength-values').style.display = 'none';
      document.getElementById('timed-values').style.display = 'flex';
      document.getElementById('val-level').textContent    = Session.getEffectiveValue(ex.id, 'level');
      document.getElementById('val-duration').textContent = Session.getEffectiveValue(ex.id, 'duration');
    }

    // Set area
    _renderSetArea(ex);

    // Coaching note
    const noteEl = document.getElementById('coaching-note');
    if (ex.note) {
      noteEl.textContent = ex.note;
      noteEl.style.display = 'block';
      Session.markNoteSeen(ex.id);
    } else {
      noteEl.style.display = 'none';
    }

    // Nav buttons
    document.getElementById('btn-prev').disabled = idx === 0;
    document.getElementById('btn-next').disabled = idx === plan.exercises.length - 1;

    // Refresh active tab
    const activeTabBtn = document.querySelector('.tab-btn.active');
    if (activeTabBtn) {
      const tab = activeTabBtn.dataset.tab;
      if (tab === 'exercises') _renderExerciseList();
      else _renderSessionLog();
    }
  }

  function _renderSetArea(ex) {
    const container = document.getElementById('set-area');
    const setCount = Session.getSetCount(ex.id);

    if (ex.type === 'timed') {
      const done = setCount > 0;
      container.innerHTML = `
        <button class="done-btn ${done ? 'done' : ''}" onclick="WorkoutUI.handleDoneBtn()">
          ${done ? '✓ LOGGED' : 'MARK DONE'}
        </button>`;
      return;
    }

    // Strength: set dots. Effective planned sets = plan sets + any extras
    // added via ADD SET this session.
    const plannedSets = Session.getEffectivePlannedSets(ex.id);
    const totalDots = Math.max(plannedSets, setCount);
    let html = `<div class="set-dots-label">TAP DOT TO LOG SET</div><div class="set-dots">`;
    for (let i = 0; i < totalDots; i++) {
      const done = i < setCount;
      html += `<button class="set-dot ${done ? 'done' : ''}" onclick="WorkoutUI.handleSetDot(${i})" aria-label="Set ${i+1}"></button>`;
    }
    html += `</div>`;
    if (setCount > 0) {
      html += `<button class="undo-btn" onclick="Session.undoLastSet()">↩ Undo Last Set</button>`;
    }
    // ADD SET button: visible only when all currently-shown dots are logged.
    // This prevents accidental extra sets when the plan isn't complete yet.
    if (setCount >= plannedSets) {
      html += `<button class="add-set-btn" onclick="Session.addSetDotOnly()">+ ADD SET</button>`;
    }
    // Save-for-Next-Time: visible only once an extra dot has been added this
    // session. Lets the user promote the current dot count to the saved plan.
    const planEx = Session.getPlan() ? Session.getPlan().exercises.find(e => e.id === ex.id) : null;
    const basePlanSets = planEx ? (planEx.sets || 1) : 1;
    if (plannedSets > basePlanSets) {
      const saved = Session.isSetCountSavedForNextTime(ex.id);
      const label = saved ? `✓ ${plannedSets} sets saved for next time` : `Save ${plannedSets} sets for next time`;
      html += `<button class="save-sets-btn${saved ? ' saved' : ''}" onclick="Session.saveSetCountForNextTime()">${label}</button>`;
    }
    container.innerHTML = html;
  }

  function handleSetDot(dotIndex) {
    const ex = Session.getCurrentExercise();
    if (!ex) return;
    // Only log on tap of an unfilled dot
    if (dotIndex < Session.getSetCount(ex.id)) return;
    Session.logSet();
  }

  function handleDoneBtn() {
    const ex = Session.getCurrentExercise();
    if (!ex) return;
    if (Session.getSetCount(ex.id) > 0) Session.undoLastSet();
    else Session.logSet();
  }

  function showLoggedConfirm(entry) {
    const badge = document.getElementById('logged-badge');
    if (!badge) return;
    let text;
    if (entry.type === 'strength') {
      text = `✓ Set ${entry.setNum}: ${entry.reps} reps @ ${entry.weight} lbs`;
    } else {
      text = `✓ Done: ${entry.duration} min at level ${entry.level}`;
    }
    badge.textContent = text;
    badge.style.opacity = '1';
    if (_badgeTimer) clearTimeout(_badgeTimer);
    _badgeTimer = setTimeout(() => { badge.style.opacity = '0'; }, 3500);
  }

  function openEditSheet() {
    const ex = Session.getCurrentExercise();
    if (!ex) return;
    const sheet = document.getElementById('edit-sheet');
    if (ex.type === 'strength') {
      document.getElementById('edit-strength-fields').style.display = 'block';
      document.getElementById('edit-timed-fields').style.display = 'none';
      document.getElementById('edit-weight-input').value = Session.getEffectiveValue(ex.id, 'weight');
      document.getElementById('edit-reps-input').value   = Session.getEffectiveValue(ex.id, 'reps');
    } else {
      document.getElementById('edit-strength-fields').style.display = 'none';
      document.getElementById('edit-timed-fields').style.display = 'block';
      document.getElementById('edit-level-input').value    = Session.getEffectiveValue(ex.id, 'level');
      document.getElementById('edit-duration-input').value = Session.getEffectiveValue(ex.id, 'duration');
    }
    sheet.classList.add('active');
    // Focus first input after sheet appears
    setTimeout(() => {
      const first = ex.type === 'strength'
        ? document.getElementById('edit-weight-input')
        : document.getElementById('edit-level-input');
      if (first) first.focus();
    }, 80);
  }

  function closeEditSheet() {
    document.getElementById('edit-sheet').classList.remove('active');
  }

  function applyEdit(scope) {
    const ex = Session.getCurrentExercise();
    if (!ex) { closeEditSheet(); return; }
    if (ex.type === 'strength') {
      const w = parseFloat(document.getElementById('edit-weight-input').value);
      const r = parseInt(document.getElementById('edit-reps-input').value);
      if (!isNaN(w) && w >= 0) {
        if (scope === 'today') Session.applyTodayOverride('weight', w);
        else Session.queuePlanChange('weight', w);
      }
      if (!isNaN(r) && r > 0) {
        if (scope === 'today') Session.applyTodayOverride('reps', r);
        else Session.queuePlanChange('reps', r);
      }
    } else {
      const lv  = parseInt(document.getElementById('edit-level-input').value);
      const dur = parseInt(document.getElementById('edit-duration-input').value);
      if (!isNaN(lv) && lv > 0) {
        if (scope === 'today') Session.applyTodayOverride('level', lv);
        else Session.queuePlanChange('level', lv);
      }
      if (!isNaN(dur) && dur > 0) {
        if (scope === 'today') Session.applyTodayOverride('duration', dur);
        else Session.queuePlanChange('duration', dur);
      }
    }
    closeEditSheet();
  }

  function _renderExerciseList() {
    const container = document.getElementById('tab-exercises');
    const plan = Session.getPlan();
    const sessionData = Session.getData();
    if (!plan || !sessionData) return;
    const html = plan.exercises.map((ex, i) => {
      const done    = Session.isExerciseDone(ex.id);
      const current = i === sessionData.currentIndex;
      let detail;
      if (ex.type === 'strength') {
        detail = `${Session.getEffectiveValue(ex.id, 'weight')} lbs · ${Session.getEffectiveValue(ex.id, 'reps')} reps`;
      } else {
        detail = `Level ${Session.getEffectiveValue(ex.id, 'level')} · ${Session.getEffectiveValue(ex.id, 'duration')} min`;
      }
      return `
        <div class="ex-list-item ${current ? 'current' : ''}" onclick="Session.goTo(${i})">
          <div class="ex-list-done-dot ${done ? 'done' : ''}"></div>
          <div style="flex:1;min-width:0">
            <div class="ex-list-name">${_esc(ex.name)}</div>
            <div class="ex-list-detail">${detail}</div>
          </div>
          ${current ? '<div class="ex-list-arrow">▶</div>' : ''}
        </div>`;
    }).join('');
    container.innerHTML = html || '<div style="padding:20px;text-align:center;color:var(--text-3)">No exercises</div>';
  }

  function _renderSessionLog() {
    const container = document.getElementById('tab-log');
    const sessionData = Session.getData();
    if (!sessionData) return;
    const entries = sessionData.logEntries;
    if (entries.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3)">Nothing logged yet</div>';
      return;
    }
    const html = entries.slice().reverse().map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let detail;
      if (e.type === 'strength') detail = `Set ${e.setNum}: ${e.reps} reps @ ${e.weight} lbs`;
      else detail = `${e.duration} min · Level ${e.level}`;
      return `
        <div class="log-entry">
          <div class="log-entry-name">${_esc(e.name)}</div>
          <div class="log-entry-detail">${detail}</div>
          <div class="log-entry-time">${time}</div>
        </div>`;
    }).join('');
    container.innerHTML = html;
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tabName));
    document.getElementById('tab-exercises').classList.toggle('active', tabName === 'exercises');
    document.getElementById('tab-log').classList.toggle('active', tabName === 'log');
    if (tabName === 'exercises') _renderExerciseList();
    else _renderSessionLog();
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function exitToHome() {
    const sessionData = Session.getData();
    const hasEntries = sessionData && sessionData.logEntries && sessionData.logEntries.length > 0;
    if (!hasEntries) {
      // Nothing logged — silently discard the session and go home
      Voice.shutdown();
      Storage.saveKey('session', null);
      UI.showScreen('welcome');
      UI.refreshWelcome();
      return;
    }
    // Sets have been logged — confirm before leaving
    const plan = Session.getPlan();
    const uniqueDone = new Set(sessionData.logEntries.map(e => e.exId)).size;
    const total = plan ? plan.exercises.length : '?';
    const startMs = new Date(sessionData.startTime).getTime();
    const elapsedMin = Math.max(0, Math.round((Date.now() - startMs) / 60000));
    document.getElementById('exit-home-stats').innerHTML =
      `${uniqueDone} of ${total} exercises logged · ${elapsedMin} min<br>Session is saved and can be resumed.`;
    document.getElementById('exit-home-overlay').classList.add('active');
  }

  function cancelExitToHome() {
    document.getElementById('exit-home-overlay').classList.remove('active');
  }

  function confirmExitToHome() {
    document.getElementById('exit-home-overlay').classList.remove('active');
    // Session stays in localStorage as-is — user can resume next time.
    // Shut down voice so the mic releases and we stop burning power.
    Voice.shutdown();
    UI.showScreen('welcome');
    UI.refreshWelcome();
  }

  return {
    render, openEditSheet, closeEditSheet, applyEdit,
    handleSetDot, handleDoneBtn, showLoggedConfirm, switchTab,
    exitToHome, cancelExitToHome, confirmExitToHome
  };
})();


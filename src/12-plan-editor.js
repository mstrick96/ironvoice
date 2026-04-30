// ═══════════════════════════════════════════════════════════════
// PLAN EDITOR
// ═══════════════════════════════════════════════════════════════
// Edits a working copy of the plan. Changes are saved on "Done"
// and discarded on "Cancel". Voice aliases are editable here.
const PlanEditor = (() => {
  let _workingPlan = null;
  let _openExId    = null;

  function open() {
    const saved = Storage.loadKey('plan');
    // Deep copy so edits don't touch live plan until Save
    _workingPlan = JSON.parse(JSON.stringify(saved));
    _openExId = null;
    _render();
    UI.showScreen('plan-editor');
  }

  function close() {
    // Collect form data for any open exercise, then save
    if (_openExId) _collectForm(_openExId);
    Storage.saveKey('plan', _workingPlan);
    Diag.add('plan', 'Plan saved via editor');
    UI.raiseBanner('plan-saved', 'info', 'Plan saved.', 'Dismiss', null,
      { transient: true, autoDismissMs: 3000 });
    UI.showScreen('welcome');
  }

  function cancel() {
    _workingPlan = null;
    _openExId = null;
    UI.showScreen('welcome');
  }

  function _render() {
    const list = document.getElementById('plan-editor-list');
    if (!list || !_workingPlan) return;
    const exercises = _workingPlan.exercises;
    const html = exercises.map((ex, i) => {
      const summary = ex.type === 'strength'
        ? `${ex.weight} lbs · ${ex.reps} reps · ${ex.sets} set${ex.sets > 1 ? 's' : ''}`
        : `Level ${ex.level} · ${ex.duration} min`;
      const isOpen = ex.id === _openExId;
      return `
        <div class="plan-ex-row" id="plan-row-${_eid(ex.id)}">
          <div class="plan-ex-header">
            <div class="plan-reorder-col">
              <button class="plan-reorder-btn" onclick="PlanEditor.moveUp('${_eid(ex.id)}')" title="Move up"
                ${i === 0 ? 'disabled style="opacity:0.2"' : ''}>▲</button>
              <button class="plan-reorder-btn" onclick="PlanEditor.moveDown('${_eid(ex.id)}')" title="Move down"
                ${i === exercises.length - 1 ? 'disabled style="opacity:0.2"' : ''}>▼</button>
            </div>
            <div class="plan-ex-info">
              <div class="plan-ex-name">${_esc(ex.name)}</div>
              <div class="plan-ex-summary">${summary}</div>
            </div>
            <button class="plan-ex-toggle-btn" onclick="PlanEditor.toggle('${_eid(ex.id)}')">${isOpen ? 'Close' : 'Edit'}</button>
          </div>
          <div class="plan-ex-form ${isOpen ? 'open' : ''}" id="plan-form-${_eid(ex.id)}">
            ${_buildForm(ex)}
          </div>
        </div>`;
    }).join('');
    list.innerHTML = html;
  }

  function _buildForm(ex) {
    const isStrength = ex.type === 'strength';
    const aliases = Array.isArray(ex.aliases) ? ex.aliases.join(', ') : '';
    return `
      <div class="plan-field">
        <label>Name</label>
        <input type="text" id="pf-name-${_eid(ex.id)}" value="${_esc(ex.name)}" autocapitalize="words">
      </div>
      <div class="plan-field">
        <label>Type</label>
        <select id="pf-type-${_eid(ex.id)}" onchange="PlanEditor.onTypeChange('${_eid(ex.id)}')">
          <option value="strength" ${isStrength ? 'selected' : ''}>Strength</option>
          <option value="timed" ${!isStrength ? 'selected' : ''}>Timed (bike)</option>
        </select>
      </div>
      <div id="pf-strength-fields-${_eid(ex.id)}" ${isStrength ? '' : 'style="display:none"'}>
        <div class="plan-fields-row">
          <div class="plan-field">
            <label>Weight (lbs)</label>
            <input type="number" id="pf-weight-${_eid(ex.id)}" value="${ex.weight || 0}" min="0" step="5" inputmode="decimal">
          </div>
          <div class="plan-field">
            <label>Reps</label>
            <input type="number" id="pf-reps-${_eid(ex.id)}" value="${ex.reps || 0}" min="1" step="1" inputmode="numeric">
          </div>
        </div>
        <div class="plan-fields-row">
          <div class="plan-field">
            <label>Sets</label>
            <input type="number" id="pf-sets-${_eid(ex.id)}" value="${ex.sets || 1}" min="1" step="1" inputmode="numeric">
          </div>
          <div class="plan-field">
            <label>Rest (sec)</label>
            <input type="number" id="pf-rest-${_eid(ex.id)}" value="${ex.rest || 90}" min="0" step="15" inputmode="numeric">
          </div>
        </div>
      </div>
      <div id="pf-timed-fields-${_eid(ex.id)}" ${!isStrength ? '' : 'style="display:none"'}>
        <div class="plan-fields-row">
          <div class="plan-field">
            <label>Level</label>
            <input type="number" id="pf-level-${_eid(ex.id)}" value="${ex.level || 1}" min="1" step="1" inputmode="numeric">
          </div>
          <div class="plan-field">
            <label>Duration (min)</label>
            <input type="number" id="pf-duration-${_eid(ex.id)}" value="${ex.duration || 10}" min="1" step="1" inputmode="numeric">
          </div>
        </div>
      </div>
      <div class="plan-field">
        <label>Coaching Note</label>
        <textarea id="pf-note-${_eid(ex.id)}">${_esc(ex.note || '')}</textarea>
      </div>
      <div class="plan-field">
        <label>Voice Aliases <span class="field-hint">Comma-separated names the voice parser will match (Step 3+).<br>Use distinct terms for similar-sounding exercises.</span></label>
        <input type="text" id="pf-aliases-${_eid(ex.id)}" value="${_esc(aliases)}" placeholder="e.g. chest, bench press, chest machine" autocapitalize="none">
      </div>
      <div class="plan-ex-form-actions">
        <button class="plan-save-btn" onclick="PlanEditor.saveExercise('${_eid(ex.id)}')">Save Exercise</button>
        <button class="plan-delete-btn" onclick="PlanEditor.deleteExercise('${_eid(ex.id)}')">Delete</button>
      </div>`;
  }

  function _collectForm(rawId) {
    const ex = _workingPlan.exercises.find(e => _eid(e.id) === rawId);
    if (!ex) return;
    const g = id => { const el = document.getElementById(id); return el ? el.value : null; };
    const gn = id => { const v = parseFloat(g(id)); return isNaN(v) ? null : v; };
    const name = (g(`pf-name-${rawId}`) || '').trim();
    if (name) ex.name = name;
    const type = g(`pf-type-${rawId}`);
    if (type) ex.type = type;
    if (ex.type === 'strength') {
      const w = gn(`pf-weight-${rawId}`); if (w !== null) ex.weight = w;
      const r = parseInt(g(`pf-reps-${rawId}`)); if (!isNaN(r) && r > 0) ex.reps = r;
      const s = parseInt(g(`pf-sets-${rawId}`)); if (!isNaN(s) && s > 0) ex.sets = s;
      const rest = parseInt(g(`pf-rest-${rawId}`)); if (!isNaN(rest) && rest >= 0) ex.rest = rest;
    } else {
      const lv = parseInt(g(`pf-level-${rawId}`)); if (!isNaN(lv) && lv > 0) ex.level = lv;
      const dur = parseInt(g(`pf-duration-${rawId}`)); if (!isNaN(dur) && dur > 0) ex.duration = dur;
    }
    ex.note = (g(`pf-note-${rawId}`) || '').trim();
    const aliasRaw = g(`pf-aliases-${rawId}`) || '';
    ex.aliases = aliasRaw.split(',').map(a => a.trim()).filter(Boolean);
  }

  function saveExercise(rawId) {
    _collectForm(rawId);
    _openExId = null;
    _render();
    Diag.add('plan', `Exercise ${rawId} updated in editor`);
  }

  function toggle(rawId) {
    if (_openExId === rawId) {
      // Close without saving — user tapped Close
      _openExId = null;
    } else {
      // Save any currently open form, then open this one
      if (_openExId) _collectForm(_openExId);
      _openExId = rawId;
    }
    _render();
    // Scroll the opened row into view
    if (_openExId) {
      setTimeout(() => {
        const row = document.getElementById(`plan-row-${_openExId}`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }

  function onTypeChange(rawId) {
    const sel = document.getElementById(`pf-type-${rawId}`);
    if (!sel) return;
    const isStrength = sel.value === 'strength';
    const strFields = document.getElementById(`pf-strength-fields-${rawId}`);
    const timedFields = document.getElementById(`pf-timed-fields-${rawId}`);
    if (strFields) strFields.style.display = isStrength ? '' : 'none';
    if (timedFields) timedFields.style.display = isStrength ? 'none' : '';
  }

  function deleteExercise(rawId) {
    if (_workingPlan.exercises.length <= 1) {
      alert('Cannot delete the last exercise.');
      return;
    }
    if (!confirm('Delete this exercise from the plan?')) return;
    _workingPlan.exercises = _workingPlan.exercises.filter(e => _eid(e.id) !== rawId);
    if (_openExId === rawId) _openExId = null;
    _render();
    Diag.add('plan', `Exercise ${rawId} deleted`);
  }

  function moveUp(rawId) {
    if (_openExId) _collectForm(_openExId);
    const idx = _workingPlan.exercises.findIndex(e => _eid(e.id) === rawId);
    if (idx <= 0) return;
    const arr = _workingPlan.exercises;
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    _render();
  }

  function moveDown(rawId) {
    if (_openExId) _collectForm(_openExId);
    const idx = _workingPlan.exercises.findIndex(e => _eid(e.id) === rawId);
    if (idx < 0 || idx >= _workingPlan.exercises.length - 1) return;
    const arr = _workingPlan.exercises;
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    _render();
  }

  function addExercise() {
    if (_openExId) _collectForm(_openExId);
    const newId = 'n' + Date.now().toString(36);
    const newEx = {
      id: newId, type: 'strength', name: 'New Exercise',
      weight: 40, reps: 20, sets: 1, rest: 90,
      note: '', aliases: []
    };
    _workingPlan.exercises.push(newEx);
    _openExId = _eid(newId);
    _render();
    // Scroll to bottom
    setTimeout(() => {
      const list = document.getElementById('plan-editor-list');
      if (list) list.scrollTop = list.scrollHeight;
    }, 80);
  }

  // Make exercise ID safe for use in HTML IDs
  function _eid(id) { return String(id).replace(/[^a-z0-9]/gi, '_'); }
  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { open, close, cancel, toggle, saveExercise, deleteExercise, moveUp, moveDown, addExercise, onTypeChange };
})();


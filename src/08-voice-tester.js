// ═══════════════════════════════════════════════════════════════
// VOICE TESTER (patch 1 diagnostic)
// ═══════════════════════════════════════════════════════════════
// Standalone screen that enumerates every voice iOS exposes to
// Safari on this device, lets the user sample each, and lets them
// lock in a preferred voice. Independent of the workout flow.
const VoiceTester = (() => {
  // Test phrase uses the actual app vocabulary — abbreviations are
  // normalized via Voice's internal layer, so "reps" is said correctly.
  const SAMPLE_TEXT = "Moving to Chest Press. One set, twenty reps at forty pounds.";

  function open() {
    _render();
    UI.showScreen('voice-tester');
    // iOS sometimes populates voices asynchronously on first load.
    // Re-render after a short delay if the list is still empty.
    setTimeout(() => {
      const current = Voice.getAllVoices();
      if (current.length === 0) _render();
    }, 500);
  }

  function close() {
    try { window.speechSynthesis.cancel(); } catch(e) {}
    UI.showScreen('welcome');
  }

  function _render() {
    const list = document.getElementById('voice-tester-list');
    const currentSpan = document.getElementById('voice-tester-current-name');
    const toggleBtn = document.getElementById('voice-diag-toggle-btn');
    if (!list || !currentSpan) return;

    // Diagnostic toggle button reflects current setting
    if (toggleBtn) {
      const on = Voice.isVoiceDiagEnabled();
      toggleBtn.textContent = on ? 'ON' : 'OFF';
      toggleBtn.style.background = on ? 'var(--ok)' : 'transparent';
      toggleBtn.style.color = on ? '#000' : 'var(--text-2)';
      toggleBtn.style.borderColor = on ? 'var(--ok)' : 'var(--border)';
    }

    const voices = Voice.getAllVoices();
    const selectedName = Voice.getPreferredVoiceName();
    currentSpan.textContent = selectedName || 'auto-selected';

    if (voices.length === 0) {
      list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-3)">
        No voices available yet. iOS sometimes loads voices asynchronously —
        try closing this screen and reopening it, or reload the page.
      </div>`;
      return;
    }

    // Group by language. English voices at the top.
    const byLang = {};
    for (const v of voices) {
      const lang = v.lang || 'unknown';
      if (!byLang[lang]) byLang[lang] = [];
      byLang[lang].push(v);
    }
    const langs = Object.keys(byLang).sort((a, b) => {
      const aEn = /^en/i.test(a) ? 0 : 1;
      const bEn = /^en/i.test(b) ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.localeCompare(b);
    });

    let html = '';
    for (const lang of langs) {
      html += `<div class="voice-tester-group-label">${_esc(lang)} · ${byLang[lang].length} voice${byLang[lang].length === 1 ? '' : 's'}</div>`;
      for (const v of byLang[lang]) {
        const isSelected = v.name === selectedName;
        const tags = [];
        if (v.localService === false) tags.push('remote');
        if (v.default) tags.push('default');
        const tagsHtml = tags.length ? ` <span style="color:var(--text-3);font-size:10px">(${tags.join(', ')})</span>` : '';
        html += `
          <div class="voice-tester-row${isSelected ? ' selected' : ''}">
            <div style="flex:1;min-width:0">
              <div class="voice-tester-name">${_esc(v.name)}${tagsHtml}</div>
              <div class="voice-tester-lang">${_esc(v.lang)}</div>
            </div>
            <button class="voice-tester-play-btn"
                    onclick="VoiceTester.play('${_escAttr(v.name)}')">▶ Play</button>
            <button class="voice-tester-use-btn${isSelected ? ' selected' : ''}"
                    onclick="VoiceTester.use('${_escAttr(v.name)}')">${isSelected ? '✓ Using' : 'Use'}</button>
          </div>`;
      }
    }
    list.innerHTML = html;
  }

  function play(name) {
    try { window.speechSynthesis.cancel(); } catch(e) {}
    const voices = Voice.getAllVoices();
    const v = voices.find(x => x.name === name);
    if (!v) return;
    try {
      const u = new SpeechSynthesisUtterance(SAMPLE_TEXT);
      u.voice = v;
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
      Diag.add('voice-tester', `Sampled ${name}`);
    } catch(e) {
      Diag.add('voice-tester', `Sample failed: ${String(e)}`);
    }
  }

  function use(name) {
    if (Voice.setPreferredVoiceByName(name)) {
      UI.raiseBanner('voice-chosen', 'info',
        `Voice set to ${name}. This will be used for all future workouts.`,
        'OK', null, { transient: true, autoDismissMs: 4000 });
      _render();
    } else {
      UI.raiseBanner('voice-chosen', 'err',
        `Could not set voice to ${name}.`, 'Dismiss', null,
        { transient: true, autoDismissMs: 4000 });
    }
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _escAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/'/g,"&#39;").replace(/"/g,'&quot;');
  }

  function toggleDiag() {
    const newState = !Voice.isVoiceDiagEnabled();
    Voice.setVoiceDiagEnabled(newState);
    _render();
  }

  return { open, close, play, use, toggleDiag };
})();


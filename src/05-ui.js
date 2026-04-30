// ═══════════════════════════════════════════════════════════════
// UI (screens and banners)
// ═══════════════════════════════════════════════════════════════
const UI = (() => {
  const SCREENS = ['welcome', 'resume', 'workout', 'summary', 'plan-editor', 'voice-tester', 'storage', 'pwa', 'https'];
  let activeScreen = null;
  function showScreen(name) {
    if (!SCREENS.includes(name)) { Diag.add('ui', `Unknown screen: ${name}`); return; }
    // Clear transient info banners (e.g. "Plan saved") when navigating away —
    // they belong to the context they were raised in and shouldn't follow the user.
    clearTransientBanners();
    SCREENS.forEach(s => {
      const el = document.getElementById('screen-' + s);
      if (el) el.classList.toggle('active', s === name);
    });
    activeScreen = name;
    Diag.add('ui', `Screen → ${name}`);
    if (name === 'storage') Inspector.refresh();
    if (name === 'welcome') refreshWelcome();
  }
  function refreshWelcome() {
    const plan = Storage.loadKey('plan');
    const count = plan ? plan.exercises.length : 0;
    const history = Storage.loadKey('history');
    const sessionCount = history ? history.sessions.length : 0;
    const info = document.getElementById('welcome-plan-info');
    if (info) {
      info.innerHTML = `<strong>${count}</strong> exercises planned<br>${sessionCount > 0 ? `<strong>${sessionCount}</strong> sessions logged` : 'No sessions logged yet'}`;
    }
  }
  function reflectState(stateName) {
    const badge = document.getElementById('state-badge');
    if (badge) badge.textContent = stateName;
    // Voice status badge in workout header — Step 3+.
    const voiceBadge = document.getElementById('voice-status-badge');
    const voiceText = document.getElementById('voice-status-text');
    if (voiceBadge && voiceText) {
      voiceBadge.classList.remove('voice-listening', 'voice-speaking',
        'voice-processing', 'voice-error', 'voice-idle');
      switch (stateName) {
        case 'LISTENING':
          voiceBadge.classList.add('voice-listening');
          voiceText.textContent = 'Listening';
          break;
        case 'SPEAKING':
          voiceBadge.classList.add('voice-speaking');
          voiceText.textContent = 'Speaking';
          break;
        case 'PROCESSING':
          voiceBadge.classList.add('voice-processing');
          voiceText.textContent = 'Processing';
          break;
        case 'ERROR':
          voiceBadge.classList.add('voice-error');
          voiceText.textContent = 'Audio Off';
          break;
        case 'IDLE':
        default:
          voiceBadge.classList.add('voice-idle');
          voiceText.textContent = 'Paused';
          break;
      }
    }
  }
  function syncBannerOffsetNow() {
    // iOS Safari sometimes finalizes text layout after the rAF tick,
    // which means the first offsetHeight read can be too short — long
    // banner messages haven't wrapped yet. Solution: measure on rAF
    // (immediate), again at 50ms (after text reflow), and again at
    // 200ms (after any image / font swaps). Each measurement updates
    // --banner-h to the largest known value within the window. Once
    // any banner removes/changes, the next measurement cycle resets it.
    function measure() {
      const area = document.getElementById('banner-area');
      if (!area) return 0;
      // getBoundingClientRect is more reliable than offsetHeight for
      // fixed-positioned elements on iOS Safari.
      const rect = area.getBoundingClientRect();
      const h = Math.ceil(rect.height);
      document.documentElement.style.setProperty('--banner-h', h > 0 ? h + 'px' : '0px');
      return h;
    }
    requestAnimationFrame(() => {
      measure();
      setTimeout(measure, 50);
      setTimeout(measure, 200);
    });
  }
  function raiseBanner(id, type, message, actionLabel, actionFn, options) {
    const opts = options || {};
    const area = document.getElementById('banner-area');
    if (document.getElementById('banner-' + id)) return;
    const banner = document.createElement('div');
    banner.className = 'banner ' + type;
    banner.id = 'banner-' + id;
    if (opts.transient) banner.dataset.transient = '1';
    const text = document.createElement('span');
    text.textContent = message;
    banner.appendChild(text);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.onclick = () => {
        if (actionFn) actionFn();
        banner.remove();
        syncBannerOffsetNow();
      };
      banner.appendChild(btn);
    } else {
      const dismiss = document.createElement('button');
      dismiss.textContent = 'Dismiss';
      dismiss.onclick = () => { banner.remove(); syncBannerOffsetNow(); };
      banner.appendChild(dismiss);
    }
    area.appendChild(banner);
    syncBannerOffsetNow();
    if (opts.autoDismissMs && opts.autoDismissMs > 0) {
      setTimeout(() => {
        if (banner.parentNode) {
          banner.remove();
          syncBannerOffsetNow();
        }
      }, opts.autoDismissMs);
    }
  }
  function clearTransientBanners() {
    document.querySelectorAll('#banner-area .banner[data-transient]').forEach(b => b.remove());
    syncBannerOffsetNow();
  }
  function raiseCorruptionBanner(keyName) {
    raiseBanner('corrupt-' + keyName, 'warn',
      `Stored ${keyName} data was corrupted and reset to defaults. Old data preserved in diagnostics.`,
      'Dismiss', null);
  }
  function raiseQuotaBanner() {
    raiseBanner('quota', 'err',
      'Device storage is full. Export your history and clear old sessions to free space.',
      'Open Storage', () => showScreen('storage'));
  }
  function raiseOfflineBanner() {
    raiseBanner('offline', 'warn', 'Offline — voice commands unavailable. Tap controls still work.', null, null);
  }
  function clearBanner(id) { const el = document.getElementById('banner-' + id); if (el) el.remove(); }
  function getActiveScreen() { return activeScreen; }
  return { showScreen, refreshWelcome, reflectState, raiseBanner, raiseCorruptionBanner, raiseQuotaBanner, raiseOfflineBanner, clearBanner, clearTransientBanners, getActiveScreen };
})();


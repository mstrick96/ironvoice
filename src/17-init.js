// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  Diag.load();
  Diag.add('init', 'App starting v2.0.1 Step 2', {
    ua: navigator.userAgent, proto: location.protocol, host: location.hostname
  });

  // Pre-flight in priority order
  if (Preflight.isPWAStandalone()) {
    Diag.add('init', 'PWA mode blocked');
    UI.showScreen('pwa');
    State.forceReset(STATES.ERROR, 'PWA blocked');
    return;
  }
  if (Preflight.isInsecure()) {
    Diag.add('init', 'Insecure origin blocked');
    UI.showScreen('https');
    State.forceReset(STATES.ERROR, 'HTTPS required');
    return;
  }

  // Load all keys (triggers defaults / corruption recovery as needed)
  Storage.loadKey('plan');
  Storage.loadKey('history');
  Storage.loadKey('settings');

  // Session evaluation
  const sessionStatus = Lifecycle.evaluateSessionOnLoad();
  Diag.add('init', `Session status: ${sessionStatus}`);

  if (Preflight.isOffline()) UI.raiseOfflineBanner();

  // Online/offline listeners
  window.addEventListener('online',  () => {
    Diag.add('lifecycle', 'Online');
    UI.clearBanner('offline');
    Voice.onOnline();
  });
  window.addEventListener('offline', () => {
    Diag.add('lifecycle', 'Offline');
    UI.raiseOfflineBanner();
    Voice.onOffline();
  });

  document.addEventListener('visibilitychange', () => {
    Diag.add('lifecycle', `visibility → ${document.visibilityState}`);
    if (document.visibilityState === 'hidden') {
      Voice.onVisibilityHidden();
    } else if (document.visibilityState === 'visible') {
      if (Session.getData()) Session.heartbeat();
      Voice.onVisibilityVisible();
    }
  });

  // Tap-to-interrupt: single tap anywhere on the workout screen
  // cancels an in-progress TTS utterance within ~200ms (spec §3.3).
  // We only act if state is SPEAKING and the tap target is not a
  // button or input — otherwise legitimate tap-to-log interactions
  // would cancel speech unintentionally.
  document.getElementById('screen-workout').addEventListener('click', (e) => {
    if (State.get() !== STATES.SPEAKING) return;
    const t = e.target;
    // Skip interrupt for taps on buttons and inputs — those are
    // intentional UI interactions, not "shut up and listen" taps.
    if (t.closest('button') || t.tagName === 'INPUT') return;
    Voice.interruptSpeech();
  }, true);

  window.addEventListener('beforeunload', () => {
    Diag.add('lifecycle', 'beforeunload');
    Diag.save();
  });

  // Long-press the voice badge (≥600ms) to show recent voice events.
  // Useful diagnostic when something doesn't recognize correctly.
  // Uses pointer events to handle both touch and mouse uniformly.
  (function attachVoiceBadgeLongPress() {
    const badge = document.getElementById('voice-status-badge');
    if (!badge) return;
    let timer = null;
    let triggered = false;
    const PRESS_MS = 600;
    function start(e) {
      triggered = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        triggered = true;
        Voice.showHistoryOverlay();
      }, PRESS_MS);
    }
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
    }
    badge.addEventListener('pointerdown', start);
    badge.addEventListener('pointerup', cancel);
    badge.addEventListener('pointerleave', cancel);
    badge.addEventListener('pointercancel', cancel);
    // Suppress the click-tap-to-pause if a long-press fired.
    badge.addEventListener('click', (e) => {
      if (triggered) { e.stopImmediatePropagation(); e.preventDefault(); triggered = false; }
    }, true);
  })();

  // Periodic diag save
  setInterval(() => Diag.save(), 30000);

  // Route to correct initial screen
  if (sessionStatus === 'resumable') {
    const session = Storage.loadKey('session');
    Lifecycle.buildResumeScreen(session);
    UI.showScreen('resume');
  } else {
    UI.showScreen('welcome');
  }

  State.transition(STATES.IDLE, 'init complete');
  Diag.add('init', 'Ready — Step 2');
  console.log('[IV] Iron Voice Step 2 loaded. Session:', sessionStatus, '| IV.session.getData() | IV.state.get()');
}

// ═══════════════════════════════════════════════════════════════
// BANNER OFFSET SYNC
// Keeps --banner-h in sync with the fixed banner-area height so
// all screens automatically push their content below any banners.
// Using MutationObserver means no call site needs to remember to
// trigger this — any DOM change in #banner-area fires it.
// ═══════════════════════════════════════════════════════════════
(function initBannerSync() {
  const area = document.getElementById('banner-area');
  if (!area) return;
  function sync() {
    const rect = area.getBoundingClientRect();
    const h = Math.ceil(rect.height);
    document.documentElement.style.setProperty('--banner-h', h > 0 ? h + 'px' : '0px');
  }
  const obs = new MutationObserver(() => {
    // Multi-pass measurement to catch iOS text-reflow race.
    sync();
    setTimeout(sync, 50);
    setTimeout(sync, 200);
  });
  obs.observe(area, { childList: true, subtree: true, attributes: true, characterData: true });
  // Also resync on viewport resize (orientation changes, keyboard show/hide).
  window.addEventListener('resize', sync);
  sync();
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

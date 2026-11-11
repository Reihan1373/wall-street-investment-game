/*
 * Instructor-only background music for BOTH investment rounds.
 * The instructor opts in once; audio loops while investments are open.
 * It stops when all three groups submit, at the 10-minute deadline,
 * when the round is revealed, or on sign-out. No student-page import.
 */

const TRACK_URL = new URL('./investment-background.mp3', import.meta.url);
const TRACK_VOLUME = 0.32;

let context = null;
let buffer = null;
let loadPromise = null;
let soundEnabled = false;
let requestNumber = 0;
let activeSource = null;
let activeGain = null;
let state = { phase: 'lobby', round: null, submitted: false, expired: false };
let toggle = null;
let message = null;
let priorText = '';

function report(text, isError = false) {
  if (!message || (text === priorText && !isError)) return;
  priorText = text;
  message.textContent = text;
  message.className = isError ? 'message error' : 'message';
}

function stopTrack() {
  const source = activeSource;
  activeSource = null;
  if (source) {
    try { source.stop(); } catch (_) { /* Already ended. */ }
    try { source.disconnect(); } catch (_) { /* Already disconnected. */ }
  }
  if (activeGain) {
    try { activeGain.disconnect(); } catch (_) { /* Already disconnected. */ }
    activeGain = null;
  }
}

function investmentIsActive() {
  return state.phase === 'open' && !state.submitted && !state.expired;
}

async function loadTrack() {
  if (buffer) return buffer;
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(TRACK_URL, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Cannot load investment-background.mp3 (HTTP ${response.status}). Upload it to the repository root.`);
      }
      return context.decodeAudioData(await response.arrayBuffer());
    })();
  }
  try {
    buffer = await loadPromise;
    return buffer;
  } catch (e) {
    loadPromise = null;
    throw e;
  }
}

function playIfNeeded() {
  if (!soundEnabled) {
    stopTrack();
    report('Background music is off. Enable it before opening either market.');
    return;
  }
  if (!investmentIsActive()) {
    stopTrack();
    if (state.phase === 'open' && state.submitted) {
      report('All three teams submitted. Investment music stopped.');
    } else if (state.phase === 'open' && state.expired) {
      report('The 10-minute investment window ended. Music stopped.');
    } else {
      report('Music is ready. It will play during Market A and Market B.');
    }
    return;
  }
  if (!context || !buffer || context.state !== 'running') {
    report('Sound is enabled, but the browser has paused audio. Uncheck and recheck the music option to resume.', true);
    return;
  }
  if (!activeSource) {
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true; // An 80-second song must repeat during a 10-minute round.
      gain.gain.value = TRACK_VOLUME;
      source.connect(gain);
      gain.connect(context.destination);
      activeSource = source;
      activeGain = gain;
      source.onended = () => {
        if (activeSource === source) {
          activeSource = null;
          activeGain = null;
          source.disconnect();
          gain.disconnect();
        }
      };
      source.start(0);
    } catch (e) {
      stopTrack();
      report(`Could not play investment music: ${e.message || e}`, true);
      return;
    }
  }
  report(`Playing investment background music — Market ${state.round === 2 ? 'B' : 'A'}. Loops until all three teams submit or time expires.`);
}

async function setEnabled(checked) {
  const request = ++requestNumber;
  if (!checked) {
    soundEnabled = false;
    stopTrack();
    report('Background music is off. Enable it before opening either market.');
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    toggle.checked = false;
    report('This browser does not support audio playback.', true);
    return;
  }
  try {
    context ||= new AudioContextClass();
    // Called directly from a user click: unlocks later playback across both rounds.
    const resume = context.resume();
    report('Loading investment background music…');
    await Promise.all([resume, loadTrack()]);
    if (request !== requestNumber) return;
    if (context.state !== 'running') throw new Error('Sound was blocked by the browser. Click the checkbox again.');
    soundEnabled = true;
    playIfNeeded();
  } catch (e) {
    if (request !== requestNumber) return;
    soundEnabled = false;
    toggle.checked = false;
    stopTrack();
    report(`Cannot enable investment music: ${e.message || e}`, true);
  }
}

export function attachInvestmentMusicControls() {
  const existing = document.getElementById('investmentMusicToggle');
  if (existing) return;
  const panel = document.createElement('div');
  panel.className = 'finale-settings';
  panel.id = 'investmentMusicSettings';
  panel.innerHTML = `
    <label class="sound-opt-in">
      <input type="checkbox" id="investmentMusicToggle">
      <span>Enable background music during BOTH investment rounds (instructor only)</span>
    </label>
    <p id="investmentMusicMessage" class="message" role="status">
      Background music is off. Enable it before opening either market.
    </p>
  `;
  const finaleSettings = document.getElementById('finaleSoundToggle')?.closest('.finale-settings');
  if (finaleSettings) finaleSettings.before(panel);
  else document.getElementById('controlMessage')?.after(panel);
  toggle = document.getElementById('investmentMusicToggle');
  message = document.getElementById('investmentMusicMessage');
  toggle?.addEventListener('change', () => { void setEnabled(toggle.checked); });
}

// Called by the instructor dashboard's existing Firestore listeners and timer.
// Does not fetch or expose any hidden market data.
export function syncInvestmentMusic(nextState) {
  state = {
    phase: nextState?.phase ?? 'lobby',
    round: nextState?.round ?? null,
    submitted: Boolean(nextState?.submitted),
    expired: Boolean(nextState?.expired),
  };
  playIfNeeded();
}

/*
 * Round 2 instructor-only finale. Plays the instructor-provided Podium Theme
 * from podium-theme.mp3, only when sound was explicitly enabled.
 * Market A (Round 1) remains silent. No audio is sent to student devices.
 */
import { GROUPS, LABELS, INITIAL_WEALTH, money, PCT } from './shared.js';

const $ = id => document.getElementById(id);
const MUSIC_FILE = './podium-theme.mp3';
let context = null;
let soundEnabled = false;
let audioBuffer = null;
let audioLoadPromise = null;
let activeSource = null;
let activeGain = null;
let sequence = 0;
let previousFocus = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function status(text, isError=false) {
  const p = $('finaleSoundMessage');
  p.textContent = text;
  p.className = isError ? 'message error' : 'message';
}

function stopPodiumTheme() {
  if (activeSource) {
    const source = activeSource;
    activeSource = null;
    try { source.stop(); } catch (_) { /* May have ended already. */ }
    source.disconnect();
  }
  if (activeGain) {
    activeGain.disconnect();
    activeGain = null;
  }
}

async function loadPodiumTheme() {
  if (audioBuffer) return audioBuffer;
  if (!audioLoadPromise) {
    audioLoadPromise = (async () => {
      const response = await fetch(MUSIC_FILE, {cache:'force-cache'});
      if (!response.ok) throw new Error(`Could not load podium-theme.mp3 (HTTP ${response.status}). Check that it is in the repository root.`);
      const data = await response.arrayBuffer();
      return context.decodeAudioData(data);
    })();
  }
  try {
    audioBuffer = await audioLoadPromise;
    return audioBuffer;
  } catch (e) {
    audioLoadPromise = null;
    throw e;
  }
}

export async function setFinaleSound(enabled) {
  if (!enabled) {
    soundEnabled = false;
    stopPodiumTheme();
    status('Podium theme is OFF. The Round 2 animation will still play.');
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    soundEnabled = false;
    $('finaleSoundToggle').checked = false;
    status('Audio playback is unsupported in this browser.', true);
    return;
  }
  try {
    context ||= new AudioContextClass();
    // Resume in response to the checkbox click so browsers allow later playback
    // after the 3-second reveal countdown.
    const resumePromise = context.resume();
    status('Loading podium theme music on this instructor device…');
    await Promise.all([resumePromise, loadPodiumTheme()]);
    if (context.state !== 'running') throw new Error('Audio is blocked. Click the sound checkbox again.');
    soundEnabled = true;
    status('Podium theme is ready. Music plays only when the Round 2 winner appears.');
  } catch (err) {
    soundEnabled = false;
    $('finaleSoundToggle').checked = false;
    status(err.message || 'Could not enable podium music.', true);
  }
}

async function playPodiumTheme(currentSequence) {
  if (!soundEnabled || !context) return;
  try {
    if (context.state !== 'running') await context.resume();
    const buffer = await loadPodiumTheme();
    if (!soundEnabled || currentSequence !== sequence ||
        $('finaleOverlay').classList.contains('hidden') ||
        $('finaleReveal').classList.contains('hidden')) return;
    stopPodiumTheme();
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.7; // Moderate starting volume for classroom speakers.
    source.buffer = buffer;
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
    status(`Could not play podium theme: ${e.message || e}`, true);
  }
}

function clearConfetti() {
  $('finaleConfetti').replaceChildren();
}
function releaseConfetti() {
  clearConfetti();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const container = $('finaleConfetti');
  const colors = ['#55ded5','#f5c877','#7be6ad','#b6abff','#ffb8a7','#ffffff'];
  for (let i=0; i<105; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random()*100}%`;
    piece.style.background = colors[i%colors.length];
    piece.style.animationDelay = `${Math.random()*1.65}s`;
    piece.style.animationDuration = `${3 + Math.random()*2.2}s`;
    piece.style.setProperty('--sway', `${Math.random()*180-90}px`);
    container.appendChild(piece);
  }
}

function drawStandings(data) {
  const secondRound = data?.rounds?.find(r => r.round === 2);
  if (!secondRound || !data?.wealth) return false;
  const rows = GROUPS.map(g => ({
    group:g, final:Number(data.wealth[g]),
    roundResult:secondRound.results.find(r => r.groupId===g)
  })).sort((a,b) => b.final-a.final);
  if (rows.some(r => !Number.isFinite(r.final) || !r.roundResult)) return false;
  const top = rows[0].final;
  const winners = rows.filter(r => Math.abs(r.final - top) < 0.005);
  $('finaleTitle').textContent = winners.length===1
    ? `${LABELS[winners[0].group]} Wins!`
    : `${winners.map(r => LABELS[r.group]).join(' & ')} Tie!`;
  $('finaleChampionValue').textContent = money(top);
  $('finaleChampionReturn').textContent = `Cumulative return: ${PCT((top/INITIAL_WEALTH-1)*100)} from $100,000`;
  const body = $('finaleRankRows');
  body.replaceChildren();
  rows.forEach((r,index)=>{
    const tr=document.createElement('tr');
    if(winners.includes(r))tr.className='champion-row';
    const roundPL=r.roundResult.endingWealth-r.roundResult.startWealth;
    const fields=[String(index+1),LABELS[r.group],`${roundPL>=0?'+':''}${money(roundPL)}`,money(r.final),PCT((r.final/INITIAL_WEALTH-1)*100)];
    fields.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===2)td.className=roundPL>=0?'positive':'negative';tr.appendChild(td);});
    body.appendChild(tr);
  });
  return true;
}

export function closeFinale() {
  sequence++;
  $('finaleOverlay').classList.add('hidden');
  stopPodiumTheme();
  clearConfetti();
  if (previousFocus?.isConnected) previousFocus.focus();
}

export async function showFinale(data) {
  if (!drawStandings(data)) return false;
  const current=++sequence;
  stopPodiumTheme();
  previousFocus=document.activeElement;
  $('finaleReveal').classList.add('hidden');
  $('finaleCountdown').classList.remove('hidden');
  $('finaleOverlay').classList.remove('hidden');
  clearConfetti();
  $('finaleClose').focus();
  for (const number of [3,2,1]) {
    if (sequence!==current) return false;
    $('finaleCountdown').textContent=String(number);
    await sleep(1000);
  }
  if (sequence!==current) return false;
  $('finaleCountdown').classList.add('hidden');
  $('finaleReveal').classList.remove('hidden');
  releaseConfetti();
  void playPodiumTheme(current);
  return true;
}

export function attachFinaleControls() {
  $('finaleSoundToggle').addEventListener('change', e => {void setFinaleSound(e.target.checked);});
  $('finaleClose').addEventListener('click', closeFinale);
  $('finaleOverlay').addEventListener('click', e => {if(e.target===$('finaleOverlay'))closeFinale();});
  document.addEventListener('keydown', e => {if(e.key==='Escape' && !$('finaleOverlay').classList.contains('hidden'))closeFinale();});
}

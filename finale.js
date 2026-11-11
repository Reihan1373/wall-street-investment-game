/*
 * Round 2 instructor-only finale.
 * All sounds are synthesized from an original short fanfare; no third-party music files.
 * The page never plays audio or shows this celebration for Round 1.
 */
import { GROUPS, LABELS, INITIAL_WEALTH, money, PCT } from './shared.js';

const $ = id => document.getElementById(id);
let context = null;
let soundEnabled = false;
let sequence = 0;
let previousFocus = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function status(text, isError=false) {
  const p = $('finaleSoundMessage');
  p.textContent = text;
  p.className = isError ? 'message error' : 'message';
}

export async function setFinaleSound(enabled) {
  if (!enabled) {
    soundEnabled = false;
    status('Victory sound is OFF. The Round 2 animation will still play.');
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    soundEnabled = false;
    $('finaleSoundToggle').checked = false;
    status('This browser does not support Web Audio. The visual celebration will still work.', true);
    return;
  }
  try {
    context ||= new AudioContextClass();
    await context.resume();
    soundEnabled = context.state === 'running';
    if (!soundEnabled) throw new Error('Sound is blocked in this browser. Click Replay after enabling sound.');
    status('Victory sound is ON for the instructor computer only.');
  } catch (err) {
    soundEnabled = false;
    $('finaleSoundToggle').checked = false;
    status(err.message || 'Could not enable audio.', true);
  }
}

// Purpose-composed, royalty-free fanfare. A brief rising theme followed by a cadence.
function playOriginalFanfare() {
  if (!soundEnabled || !context || context.state !== 'running') return;
  const t = context.currentTime + 0.05;
  const melody = [
    [0.00, 392.00, .18], [.23, 493.88, .18], [.46, 587.33, .22],
    [.73, 784.00, .32], [1.12, 587.33, .16], [1.34, 659.25, .16],
    [1.56, 783.99, .28], [1.93, 987.77, .23], [2.24, 880.00, .18],
    [2.50, 1046.50, .70]
  ];
  for (const [offset, frequency, duration] of melody) {
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, t + offset);
    envelope.gain.setValueAtTime(0.0001, t + offset);
    envelope.gain.exponentialRampToValueAtTime(.12, t + offset + .025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + offset + duration);
    osc.connect(envelope);
    envelope.connect(context.destination);
    osc.start(t + offset);
    osc.stop(t + offset + duration + .03);
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
  clearConfetti();
  if (previousFocus?.isConnected) previousFocus.focus();
}

export async function showFinale(data) {
  if (!drawStandings(data)) return false;
  const current=++sequence;
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
  playOriginalFanfare();
  return true;
}

export function attachFinaleControls() {
  $('finaleSoundToggle').addEventListener('change', e => {void setFinaleSound(e.target.checked);});
  $('finaleClose').addEventListener('click', closeFinale);
  $('finaleOverlay').addEventListener('click', e => {if(e.target===$('finaleOverlay'))closeFinale();});
  document.addEventListener('keydown', e => {if(e.key==='Escape' && !$('finaleOverlay').classList.contains('hidden'))closeFinale();});
}

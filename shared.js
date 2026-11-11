import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, firebaseConfigured } from './firebase-config.js';

export { firebaseConfigured };

export const SECTORS = [
  {key:'tech', name:'Information Technology', ticker:'XLK', note:'Software, hardware & semiconductors'},
  {key:'energy', name:'Energy', ticker:'XLE', note:'Oil, gas & energy producers'},
  {key:'financials', name:'Financials', ticker:'XLF', note:'Banks, insurers & financial services'},
  {key:'health', name:'Health Care', ticker:'XLV', note:'Pharmaceuticals, biotech & care'},
  {key:'discretionary', name:'Consumer Discretionary', ticker:'XLY', note:'Retail, autos & consumer services'},
  {key:'staples', name:'Consumer Staples', ticker:'XLP', note:'Food, beverages & household essentials'}
];
export const GROUPS = ['g1','g2','g3'];
export const LABELS = {g1:'Group 1',g2:'Group 2',g3:'Group 3'};
export const INITIAL_WEALTH = 100000;
export const ROUND_SECONDS = 600;
export const USD = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 });
export const PCT = n => `${n>=0?'+':''}${Number(n).toFixed(2)}%`;

export function validateWeights(w) {
  if (!w || typeof w !== 'object') return 'Choose sector weights first.';
  const vals = SECTORS.map(s => Number(w[s.key]));
  if (vals.some(v => !Number.isInteger(v) || v<0 || v>70 || v%5!==0))
    return 'Each allocation must be 0–70%, in 5% increments.';
  if (vals.reduce((a,b) => a+b,0)!==100) return 'Allocations must add to exactly 100%.';
  if (vals.filter(v=>v>0).length<2) return 'Invest in at least two sectors.';
  return '';
}
export function money(x){return USD.format(Number(x)||0);}
export function emptyWeights(){return Object.fromEntries(SECTORS.map(s=>[s.key,0]));}
export function formatCountdown(seconds) {
  const s=Math.max(0,Math.ceil(seconds));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
export function errorMessage(e) {
  return String(e?.message || e || 'Unknown error').replace(/^Firebase: /,'');
}
export function showMessage(node, text, error=false) {
  node.textContent=text;
  node.className = error ? 'message error' : 'message';
}

export const app = firebaseConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

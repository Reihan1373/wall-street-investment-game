import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc,getDoc,setDoc,writeBatch,serverTimestamp,onSnapshot,updateDoc,runTransaction } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth,db,firebaseConfigured,SECTORS,GROUPS,LABELS,INITIAL_WEALTH,ROUND_SECONDS,formatCountdown,errorMessage,showMessage,money,PCT } from './shared.js';
import { attachFinaleControls, showFinale, closeFinale } from './finale.js';

const $=id=>document.getElementById(id);
let game=null,board=null,unsubGame=()=>{},unsubBoard=()=>{};
const gameRef=()=>doc(db,'games','main');
const boardRef=()=>doc(db,'leaderboard','main');
const roundRef=n=>doc(db,'privateRounds',`r${n}`);
const codeRef=g=>doc(db,'privateGroups',g);
const submissionRef=(n,g)=>doc(db,'submissions',`r${n}_${g}`);

// Imported instructor-only historical data stays in browser memory until the admin
// explicitly saves it to the protected privateRounds collection in Firestore.
// NEVER publish instructor_markets.json to GitHub Pages.
let privateMarkets = null;

function validateImportedMarket(market, index) {
  if (!market || typeof market !== 'object' || Array.isArray(market)) {
    throw new Error(`Market ${index}: expected a JSON object.`);
  }
  const year = market.year;
  const briefing = typeof market.briefing === 'string' ? market.briefing.trim() : '';
  if (!Number.isInteger(year) || year < 1998 || year > 2025) {
    throw new Error(`Market ${index}: invalid historical calendar year.`);
  }
  if (briefing.length < 90) {
    throw new Error(`Market ${index}: the anonymized briefing must contain at least 90 characters.`);
  }
  if (!market.returns || typeof market.returns !== 'object' || Array.isArray(market.returns)) {
    throw new Error(`Market ${index}: sector returns are missing.`);
  }
  const returns = {};
  for (const s of SECTORS) {
    const r = market.returns[s.key];
    if (typeof r !== 'number' || !Number.isFinite(r) || r < -100 || r > 1000) {
      throw new Error(`Market ${index}: invalid total return for ${s.name}.`);
    }
    returns[s.key] = r;
  }
  // Only these validated fields are written to Firestore. Ignore metadata in JSON.
  return { year, briefing, returns };
}

async function loadPrivateFile(file) {
  privateMarkets = null;
  $('initBtn').disabled = true;
  if (!file) {
    showMessage($('privateJsonStatus'), 'Choose the private instructor JSON file saved on your computer.');
    return;
  }
  try {
    if (file.size > 200000) throw new Error('File is unexpectedly large; choose the instructor market data JSON (under 200 KB).');
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.rounds) || parsed.rounds.length !== 2) {
      throw new Error('The JSON must have a "rounds" array containing exactly two markets.');
    }
    const rounds = parsed.rounds.map((item, i) => validateImportedMarket(item, i + 1));
    if (rounds[0].year === rounds[1].year) throw new Error('Choose two different historical years.');
    privateMarkets = rounds;
    $('initBtn').disabled = false;
    showMessage($('privateJsonStatus'), 'Private file validated: Market A and Market B are ready. No years or returns have been revealed to students.');
  } catch (e) {
    showMessage($('privateJsonStatus'), errorMessage(e), true);
  }
}

function makeCode(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values=crypto.getRandomValues(new Uint32Array(10));
  return Array.from(values,v=>alphabet[v%alphabet.length]).join('');
}
async function loadCodes(){
  const zone=$('codes');zone.replaceChildren();
  try{
    for(const g of GROUPS){const s=await getDoc(codeRef(g));if(!s.exists())continue;
      const el=document.createElement('div');el.className='code-card';
      const small=document.createElement('div');small.className='overline';small.textContent=LABELS[g];
      const strong=document.createElement('strong');strong.textContent=s.data().joinCode;
      el.append(small,strong);zone.appendChild(el);
    }
    if(!zone.children.length)zone.textContent='Initialize the game to create codes.';
  }catch(e){zone.textContent=errorMessage(e);}
}
async function initialize(){
  try{
    if (!privateMarkets || privateMarkets.length !== 2) {
      throw new Error('Import the private historical market JSON file before initializing.');
    }
    const [a,b] = privateMarkets;
    if(!confirm('Initialize or RESET the championship? This deletes existing round submissions and scores and generates NEW group join codes.'))return;
    $('initBtn').disabled=true;
    const batch=writeBatch(db);
    batch.set(roundRef(1),a);batch.set(roundRef(2),b);
    for(const g of GROUPS)batch.set(codeRef(g),{joinCode:makeCode()});
    for(let n=1;n<=2;n++)for(const g of GROUPS)batch.delete(submissionRef(n,g));
    batch.set(gameRef(),{phase:'lobby',round:0,briefing:'',openedAt:null,updatedAt:serverTimestamp()});
    batch.set(boardRef(),{wealth:Object.fromEntries(GROUPS.map(g=>[g,INITIAL_WEALTH])),rounds:[],updatedAt:serverTimestamp()});
    await batch.commit();await loadCodes();closeFinale();
    showMessage($('initMessage'),'Game initialized. Share each group code privately, then open Market A.');
  }catch(e){showMessage($('initMessage'),errorMessage(e),true);}finally{$('initBtn').disabled=false;}
}
function deadlinePassed(){
  return game?.phase==='open' && game?.openedAt?.toMillis && Date.now()>=game.openedAt.toMillis()+ROUND_SECONDS*1000;
}
function updateButtons(){
  $('phaseText').textContent=({lobby:'Ready',open:'Investment open',revealed:'Round 1 revealed',finished:'Completed'})[game?.phase]||'Uninitialized';
  $('roundText').textContent=game?.round?`Market ${game.round===1?'A':'B'}`:'—';
  $('adminClock').textContent=game?.phase==='open' && game.openedAt?.toMillis ? formatCountdown((game.openedAt.toMillis()+ROUND_SECONDS*1000-Date.now())/1000) : '—';
  $('open1Btn').disabled=!(game?.phase==='lobby');
  $('reveal1Btn').disabled=!(game?.phase==='open'&&game.round===1&&deadlinePassed());
  $('open2Btn').disabled=!(game?.phase==='revealed'&&game.round===1);
  $('reveal2Btn').disabled=!(game?.phase==='open'&&game.round===2&&deadlinePassed());
  $('replayFinaleBtn').disabled=!(game?.phase==='finished' && board?.rounds?.some(r=>r.round===2));
}
async function openMarket(n){
  try{
    if((n===1&&game?.phase!=='lobby')||(n===2&&!(game?.phase==='revealed'&&game?.round===1)))throw new Error('Complete the previous stage first.');
    const privateDoc=await getDoc(roundRef(n));
    if(!privateDoc.exists())throw new Error(`No private market ${n} configuration exists.`);
    await updateDoc(gameRef(),{phase:'open',round:n,briefing:privateDoc.data().briefing,openedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    showMessage($('controlMessage'),`Market ${n===1?'A':'B'} is open. Submissions are accepted for 10 minutes (server-enforced).`);
  }catch(e){showMessage($('controlMessage'),errorMessage(e),true);}
}
async function revealMarket(n){
  if(!deadlinePassed()||game?.round!==n){showMessage($('controlMessage'),'Wait for the full ten-minute investment window to finish.',true);return;}
  if(!confirm(`Reveal the ACTUAL historical year, sector returns, and ${n===1?'Round 1':'final'} results to all students?`))return;
  const button=$(n===1?'reveal1Btn':'reveal2Btn');button.disabled=true;
  try{
    await runTransaction(db,async tx=>{
      // All reads must precede writes in Firestore transactions.
      const stateSnap=await tx.get(gameRef());
      const boardSnap=await tx.get(boardRef());
      const secretSnap=await tx.get(roundRef(n));
      const all=[];for(const g of GROUPS)all.push(await tx.get(submissionRef(n,g)));
      if(!stateSnap.exists()||!boardSnap.exists()||!secretSnap.exists())throw new Error('Game is not initialized.');
      const state=stateSnap.data(),prior=boardSnap.data();
      if(state.phase!=='open'||state.round!==n)throw new Error('This market is no longer open.');
      if(!state.openedAt?.toMillis||Date.now()<state.openedAt.toMillis()+ROUND_SECONDS*1000)throw new Error('Investment window is still open.');
      if((prior.rounds||[]).some(r=>r.round===n))throw new Error('This round has already been revealed.');
      const secret=secretSnap.data();const wealth={...prior.wealth};
      const results=GROUPS.map((g,i)=>{
        const submitted=all[i].exists()?all[i].data():null;
        const fallback=!submitted;
        const weights=fallback?Object.fromEntries(SECTORS.map(s=>[s.key,100/6])):submitted.weights;
        const annualReturn=SECTORS.reduce((sum,s)=>sum+(weights[s.key]/100)*secret.returns[s.key],0);
        const startWealth=Number(wealth[g]);
        const endingWealth=Math.round(startWealth*(1+annualReturn/100)*100)/100;
        wealth[g]=endingWealth;
        return {groupId:g,weights,annualReturn:Number(annualReturn.toFixed(6)),startWealth,endingWealth,fallback};
      });
      const revealed={round:n,year:secret.year,returns:secret.returns,results};
      tx.set(boardRef(),{wealth,rounds:[...(prior.rounds||[]),revealed],updatedAt:serverTimestamp()});
      tx.update(gameRef(),{phase:n===2?'finished':'revealed',briefing:'',updatedAt:serverTimestamp()});
    });
    showMessage($('controlMessage'),`Market ${n===1?'A':'B'} results published. ${n===2?'Championship complete.':'You may now open Market B.'}`);
    if (n===2) {
      // Only final Round 2 results activate the instructor's winner celebration.
      const freshBoard=await getDoc(boardRef());
      if(freshBoard.exists()) void showFinale(freshBoard.data());
    }
  }catch(e){showMessage($('controlMessage'),errorMessage(e),true);}finally{updateButtons();}
}
function renderScores(){
  const zone=$('adminScores');zone.replaceChildren();
  if(!board?.rounds?.length){zone.textContent='No results revealed yet.';return;}
  const h=document.createElement('h3');h.textContent='Published results';zone.appendChild(h);
  const t=document.createElement('table');t.className='leaderboard-table';t.innerHTML='<thead><tr><th>Group</th><th>Compounded wealth</th><th>Cumulative return</th></tr></thead>';
  const tbody=document.createElement('tbody');
  GROUPS.map(g=>({g,w:Number(board.wealth[g])})).sort((a,b)=>b.w-a.w).forEach(({g,w})=>{
    const tr=document.createElement('tr');[LABELS[g],money(w),PCT((w/INITIAL_WEALTH-1)*100)].forEach(v=>{const c=document.createElement('td');c.textContent=v;tr.appendChild(c);});tbody.appendChild(tr);
  });t.appendChild(tbody);zone.appendChild(t);
}
async function refreshSubmissions(){
  const zone=$('adminSubmissions');
  if(!game?.round){zone.textContent='No round opened yet.';return;}
  const parts=[];
  for(const g of GROUPS){
    try{const snap=await getDoc(submissionRef(game.round,g));parts.push(`${LABELS[g]}: ${snap.exists()?'Submitted / locked':'Not submitted (equal-weight fallback at deadline)'}`);}
    catch(e){parts.push(`${LABELS[g]}: ${errorMessage(e)}`);}
  }
  zone.textContent=parts.join(' | ');
}
function enterAdmin(){
  $('loginPanel').classList.add('hidden');$('controls').classList.remove('hidden');
  loadCodes();
  unsubGame=onSnapshot(gameRef(),s=>{game=s.exists()?s.data():null;updateButtons();refreshSubmissions();},e=>showMessage($('controlMessage'),errorMessage(e),true));
  unsubBoard=onSnapshot(boardRef(),s=>{board=s.exists()?s.data():null;renderScores();updateButtons();},e=>showMessage($('controlMessage'),errorMessage(e),true));
}
async function login(){
  $('loginBtn').disabled=true;
  try{await signInWithEmailAndPassword(auth,$('adminEmail').value.trim(),$('adminPassword').value);$('adminPassword').value='';}
  catch(e){showMessage($('loginMessage'),errorMessage(e),true);$('loginBtn').disabled=false;}
}
$('loginBtn').addEventListener('click',login);
$('initBtn').addEventListener('click',initialize);
$('open1Btn').addEventListener('click',()=>openMarket(1));$('open2Btn').addEventListener('click',()=>openMarket(2));
$('reveal1Btn').addEventListener('click',()=>revealMarket(1));$('reveal2Btn').addEventListener('click',()=>revealMarket(2));
$('logoutBtn').addEventListener('click',()=>{closeFinale();return signOut(auth);});
$('replayFinaleBtn').addEventListener('click',async()=>{
  try{const snap=await getDoc(boardRef());if(!snap.exists()||!snap.data().rounds?.some(r=>r.round===2))throw new Error('Final results have not been revealed.');
    void showFinale(snap.data());
  }catch(e){showMessage($('controlMessage'),errorMessage(e),true);}
});
attachFinaleControls();
$('privateJsonFile').addEventListener('change', event => loadPrivateFile(event.target.files?.[0]));
$('initBtn').disabled = true;
setInterval(updateButtons,1000);setInterval(()=>{if(game?.phase==='open')refreshSubmissions();},9000);
if(!firebaseConfigured){$('setupWarning').classList.remove('hidden');showMessage($('loginMessage'),'Firebase configuration is missing.',true);}
else onAuthStateChanged(auth,async user=>{
  unsubGame();unsubBoard();game=null;board=null;
  if(!user){privateMarkets=null;$('privateJsonFile').value='';$('initBtn').disabled=true;showMessage($('privateJsonStatus'),'Choose the instructor-only JSON file from your computer.');$('loginPanel').classList.remove('hidden');$('controls').classList.add('hidden');$('loginBtn').disabled=false;return;}
  try{const snap=await getDoc(doc(db,'admins',user.uid));
    if(!snap.exists()||snap.data().role!=='admin')throw new Error('This user is not registered as an instructor in admins/{uid}.');
    enterAdmin();
  }catch(e){$('loginPanel').classList.remove('hidden');$('controls').classList.add('hidden');showMessage($('loginMessage'),errorMessage(e),true);$('loginBtn').disabled=false;}
});

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

function renderEditors(){
  $('roundEditors').replaceChildren();
  for(let n=1;n<=2;n++){
    const box=document.createElement('div');box.className='editor';
    const h=document.createElement('h3');h.textContent=`Market ${n===1?'A':'B'} — private instructor data`;box.appendChild(h);
    const fields=document.createElement('div');fields.className='editor-fields';
    const yearLabel=document.createElement('label');yearLabel.textContent='Real historical year (hidden)';
    const year=document.createElement('input');year.type='number';year.min='1998';year.max='2025';year.step='1';year.placeholder='Year';year.id=`year${n}`;yearLabel.appendChild(year);
    const briefLabel=document.createElement('label');briefLabel.textContent='Student-facing economic briefing (no dates or future events)';
    const brief=document.createElement('textarea');brief.id=`brief${n}`;brief.placeholder='Paste anonymized, contemporaneous information available before the investment year…';briefLabel.appendChild(brief);
    fields.append(yearLabel,briefLabel);box.appendChild(fields);
    const caption=document.createElement('p');caption.className='muted';caption.textContent='Actual annual ETF total returns, percentages (negative values allowed). These are secret until the reveal.';box.appendChild(caption);
    const inputs=document.createElement('div');inputs.className='return-inputs';
    SECTORS.forEach(s=>{const label=document.createElement('label');label.textContent=`${s.name} (${s.ticker})`;
      const el=document.createElement('input');el.type='number';el.step='0.0001';el.min='-100';el.max='1000';el.id=`ret${n}_${s.key}`;el.placeholder='e.g. 12.34';label.appendChild(el);inputs.appendChild(label);});
    box.appendChild(inputs);$('roundEditors').appendChild(box);
  }
}
function readRound(n){
  const year=Number($(`year${n}`).value);const briefing=$(`brief${n}`).value.trim();const returns={};
  if(!Number.isInteger(year)||year<1998||year>2025)throw new Error(`Market ${n}: enter an actual historical calendar year.`);
  if(briefing.length<90)throw new Error(`Market ${n}: add an informative student-facing briefing (at least 90 characters).`);
  for(const s of SECTORS){
    const raw=$(`ret${n}_${s.key}`).value;
    const r=Number(raw);
    if(raw.trim()===''||!Number.isFinite(r)||r< -100||r>1000)throw new Error(`Market ${n}: enter a valid percent return for ${s.name}.`);
    returns[s.key]=r;
  }
  return {year,briefing,returns};
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
    const a=readRound(1),b=readRound(2);
    if(a.year===b.year)throw new Error('Use two different historical years.');
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
renderEditors();setInterval(updateButtons,1000);setInterval(()=>{if(game?.phase==='open')refreshSubmissions();},9000);
if(!firebaseConfigured){$('setupWarning').classList.remove('hidden');showMessage($('loginMessage'),'Firebase configuration is missing.',true);}
else onAuthStateChanged(auth,async user=>{
  unsubGame();unsubBoard();game=null;board=null;
  if(!user){$('loginPanel').classList.remove('hidden');$('controls').classList.add('hidden');$('loginBtn').disabled=false;return;}
  try{const snap=await getDoc(doc(db,'admins',user.uid));
    if(!snap.exists()||snap.data().role!=='admin')throw new Error('This user is not registered as an instructor in admins/{uid}.');
    enterAdmin();
  }catch(e){$('loginPanel').classList.remove('hidden');$('controls').classList.add('hidden');showMessage($('loginMessage'),errorMessage(e),true);$('loginBtn').disabled=false;}
});

import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth,db,firebaseConfigured,SECTORS,GROUPS,LABELS,INITIAL_WEALTH,ROUND_SECONDS,PCT,money,emptyWeights,validateWeights,formatCountdown,errorMessage,showMessage } from './shared.js';

const $ = id => document.getElementById(id);
let currentUser=null, member=null, game=null, board=null, submission=null;
let unsubscribeGame=()=>{},unsubscribeBoard=()=>{},unsubscribeSubmission=()=>{};
let weights=emptyWeights();

function renderSectors(){
  $('sectorRows').replaceChildren();
  SECTORS.forEach(s=>{
    const row=document.createElement('div');row.className='sector-row';
    const name=document.createElement('div');name.className='sector-name';
    const strong=document.createElement('strong');strong.textContent=s.name;
    const ticker=document.createElement('span');ticker.className='ticker';ticker.textContent=s.ticker;strong.appendChild(ticker);
    const small=document.createElement('small');small.textContent=s.note;
    name.append(strong,small);
    const slider=document.createElement('input');slider.type='range';slider.min='0';slider.max='70';slider.step='5';slider.value=String(weights[s.key]);slider.setAttribute('aria-label',`${s.name} allocation`);
    const value=document.createElement('output');value.id=`pct-${s.key}`;value.textContent='0%';
    slider.addEventListener('input',()=>{weights[s.key]=Number(slider.value);value.textContent=`${weights[s.key]}%`;renderAlloc();});
    row.append(name,slider,value);$('sectorRows').appendChild(row);
  });
}
function setSlidersDisabled(disabled){
  document.querySelectorAll('.sector-row input').forEach(i=>{i.disabled=disabled;});
}
function secondsLeft(){
  if(!game || game.phase!=='open' || !game.openedAt?.toMillis)return 0;
  return (game.openedAt.toMillis()+ROUND_SECONDS*1000-Date.now())/1000;
}
function renderAlloc(){
  const sum=Object.values(weights).reduce((a,b)=>a+b,0);
  $('allocatedValue').textContent=`${sum}%`;
  $('remainingValue').textContent=`${100-sum}%`;
  const closed=game?.phase!=='open' || secondsLeft()<=0 || !!submission;
  $('submitBtn').disabled=closed || !!validateWeights(weights);
  setSlidersDisabled(closed);
  if(submission){showMessage($('submissionInfo'),'Portfolio locked. You cannot change it after submission.');}
  else if(game?.phase==='open' && secondsLeft()>0){showMessage($('submissionInfo'),validateWeights(weights)||'Your portfolio is valid. Select “Lock portfolio” to submit.');}
  else if(game?.phase==='open'){showMessage($('submissionInfo'),'Deadline reached. If no valid team portfolio was submitted, equal weighting applies.');}
  else showMessage($('submissionInfo'),'The investment window is not open.');
}
function renderBoard(){
  const wealth=board?.wealth || Object.fromEntries(GROUPS.map(g=>[g,INITIAL_WEALTH]));
  const rows=GROUPS.map(g=>({group:g,wealth:Number(wealth[g]||INITIAL_WEALTH)})).sort((a,b)=>b.wealth-a.wealth);
  const table=document.createElement('table');table.className='leaderboard-table';
  table.innerHTML='<thead><tr><th>Rank / Team</th><th>Portfolio value</th><th>Total gain</th></tr></thead>';
  const tb=document.createElement('tbody');
  rows.forEach((r,i)=>{const tr=document.createElement('tr');const delta=(r.wealth/INITIAL_WEALTH-1)*100;
    for(const value of [`${i+1}. ${LABELS[r.group]}`,money(r.wealth),PCT(delta)]){const td=document.createElement('td');td.textContent=value;if(value===PCT(delta))td.className=delta>=0?'positive':'negative';tr.appendChild(td);}tb.appendChild(tr);});
  table.appendChild(tb);$('leaderboard').replaceChildren(table);
  const history=$('roundHistory');history.replaceChildren();
  for(const r of (board?.rounds||[])){
    const block=document.createElement('section');block.className='history-block';
    const h=document.createElement('h3');h.textContent=`Market ${r.round===1?'A':'B'} revealed — Actual year: ${r.year}`;block.appendChild(h);
    const desc=document.createElement('p');desc.className='muted';desc.textContent='Real annual sector ETF total returns (including reinvested dividends):';block.appendChild(desc);
    const t=document.createElement('table');t.className='returns-table';t.innerHTML='<thead><tr><th>Sector</th><th>Actual return</th></tr></thead>';
    const body=document.createElement('tbody');SECTORS.forEach(s=>{const tr=document.createElement('tr');const td1=document.createElement('td');td1.textContent=`${s.name} (${s.ticker})`;const td2=document.createElement('td');td2.textContent=PCT(r.returns[s.key]);td2.className=r.returns[s.key]>=0?'positive':'negative';tr.append(td1,td2);body.appendChild(tr);});t.appendChild(body);block.appendChild(t);
    const res=document.createElement('p');res.className='muted';res.textContent=r.results.map(x=>`${LABELS[x.groupId]}: ${PCT(x.annualReturn)} • ${money(x.endingWealth)}${x.fallback?' (equal-weight fallback)':''}`).join(' | ');block.appendChild(res);history.appendChild(block);
  }
  if(member)$('myWealth').textContent=money(wealth[member.groupId]);
}
function renderGame(){
  $('marketLabel').textContent=game?.round?`Market ${game.round===1?'A':'B'}`:'Awaiting start';
  $('briefText').textContent=game?.briefing || 'Your instructor will reveal the economic briefing when the market opens.';
  if(game?.phase==='lobby')$('briefText').textContent='The instructor is preparing the challenge. Years and future returns remain hidden.';
  if(game?.phase==='revealed')$('briefText').textContent='Market A results are now public. Await the Market B briefing and next investment window.';
  if(game?.phase==='finished')$('briefText').textContent='Both historical markets have been revealed. The final championship standings are below.';
  renderAlloc();
}
function tick(){
  $('clock').textContent=game?.phase==='open'?formatCountdown(secondsLeft()):'CLOSED';
  if(member && game?.phase==='open')renderAlloc();
}
function subscribeSubmission(){
  unsubscribeSubmission();submission=null;weights=emptyWeights();renderSectors();
  if(!game?.round || !member){renderAlloc();return;}
  const id=`r${game.round}_${member.groupId}`;
  unsubscribeSubmission=onSnapshot(doc(db,'submissions',id),snap=>{
    submission=snap.exists()?snap.data():null;
    if(submission?.weights){weights={...submission.weights};renderSectors();}
    renderAlloc();
  },err=>showMessage($('submissionInfo'),errorMessage(err),true));
}
async function join(){
  $('joinBtn').disabled=true;showMessage($('joinMessage'),'Checking your group code…');
  try{
    const groupId=$('joinGroup').value,joinCode=$('joinCode').value.trim().toUpperCase();
    if(!GROUPS.includes(groupId)||!joinCode)throw new Error('Select a group and enter its private code.');
    // Firestore Rules verify against a private group-code document that students cannot read.
    await setDoc(doc(db,'members',currentUser.uid),{groupId,joinCode,joinedAt:serverTimestamp()});
    const snap=await getDoc(doc(db,'members',currentUser.uid));
    if(!snap.exists())throw new Error('Group membership was not created.');
    enterGame(snap.data());
  }catch(e){showMessage($('joinMessage'),errorMessage(e),true);$('joinBtn').disabled=false;}
}
function enterGame(data){
  member=data;$('joinPanel').classList.add('hidden');$('gamePanel').classList.remove('hidden');
  $('myGroup').textContent=LABELS[member.groupId];
  unsubscribeGame=onSnapshot(doc(db,'games','main'),snap=>{
    const oldRound=game?.round;game=snap.exists()?snap.data():null;
    renderGame();if(game?.round!==oldRound)subscribeSubmission();tick();
  },err=>showMessage($('submissionInfo'),errorMessage(err),true));
  unsubscribeBoard=onSnapshot(doc(db,'leaderboard','main'),snap=>{board=snap.exists()?snap.data():null;renderBoard();},err=>showMessage($('submissionInfo'),errorMessage(err),true));
}
async function submit(){
  const error=validateWeights(weights);
  if(error){showMessage($('submissionInfo'),error,true);return;}
  if(!member||!game||game.phase!=='open'||secondsLeft()<=0||submission){renderAlloc();return;}
  $('submitBtn').disabled=true;
  try{
    await setDoc(doc(db,'submissions',`r${game.round}_${member.groupId}`),{groupId:member.groupId,round:game.round,weights:{...weights},createdAt:serverTimestamp()});
    showMessage($('submissionInfo'),'Successfully submitted and locked.');
  }catch(e){showMessage($('submissionInfo'),errorMessage(e),true);renderAlloc();}
}
$('joinBtn').addEventListener('click',join);$('submitBtn').addEventListener('click',submit);
renderSectors();setInterval(tick,1000);
if(!firebaseConfigured){$('setupWarning').classList.remove('hidden');showMessage($('joinMessage'),'Firebase configuration is missing.',true);}
else onAuthStateChanged(auth,async user=>{
  if(!user){try{await signInAnonymously(auth);}catch(e){showMessage($('joinMessage'),errorMessage(e),true);}return;}
  currentUser=user;
  try{
    const snap=await getDoc(doc(db,'members',user.uid));
    if(snap.exists())enterGame(snap.data());else{$('joinBtn').disabled=false;showMessage($('joinMessage'),'Select your group and enter its private code.');}
  }catch(e){showMessage($('joinMessage'),errorMessage(e),true);}
});

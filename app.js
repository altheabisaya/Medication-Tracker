/* ===========================
   MEDTRACK — APP.JS v3
   =========================== */

// ===== STATE =====
let state = {
  user: { name: '', avatar: '' },
  medications: [],
  doses: {},
  history: [],
};

// Use LOCAL date (not UTC) to avoid timezone issues (e.g. UTC+8 Philippines)
const TODAY = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const LOCAL_DATE_STR = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const NOW_MINS   = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); };
const PARSE_TIME = (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const FMT_12     = (t) => {
  const [h,m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  return `${h%12||12}:${m.toString().padStart(2,'0')} ${ap}`;
};
const DATE_LABEL = (dateStr) => {
  const today = TODAY();
  if (dateStr === today) return 'Today';
  const y = new Date(); y.setDate(y.getDate()-1);
  if (dateStr === LOCAL_DATE_STR(y)) return 'Yesterday';
  return new Date(dateStr+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
};

// ===== STORAGE =====
function save() {
  try { localStorage.setItem('medtrack_v3', JSON.stringify(state)); } catch(e){}
}
function load() {
  try {
    const raw = localStorage.getItem('medtrack_v3');
    // also migrate from v2
    const raw2 = !raw && localStorage.getItem('medtrack_v2');
    const src = raw || raw2;
    if (src) {
      const parsed = JSON.parse(src);
      state = { ...state, ...parsed };
    }
    if (!Array.isArray(state.history))   state.history = [];
    if (!state.doses || typeof state.doses !== 'object') state.doses = {};
    if (!state.medications) state.medications = [];
  } catch(e){ state.history=[]; state.doses={}; state.medications=[]; }
}

function loadSampleData() {
  state.user = { name: 'Margaret', avatar: '' };
  state.medications = [
    { id:'med1', name:'Metformin',    dose:'500 mg',  icon:'💊', times:['08:00','20:00'], days:[0,1,2,3,4,5,6], notes:'Take with food' },
    { id:'med2', name:'Lisinopril',   dose:'10 mg',   icon:'🩺', times:['09:00'],         days:[0,1,2,3,4,5,6], notes:'' },
    { id:'med3', name:'Atorvastatin', dose:'20 mg',   icon:'💊', times:['13:00'],         days:[0,1,2,3,4,5,6], notes:'' },
    { id:'med4', name:'Vitamin D3',   dose:'1000 IU', icon:'☀️', times:['13:00'],         days:[0,1,2,3,4,5,6], notes:'' },
    { id:'med5', name:'Aspirin',      dose:'81 mg',   icon:'🩸', times:['18:00'],         days:[0,1,2,3,4,5,6], notes:'' },
  ];
  const today = TODAY();
  ['med1:08:00','med2:09:00','med3:13:00'].forEach(k => {
    state.doses[`${today}:${k}`] = 'taken';
  });
  save();
}

// ===== SCREEN MANAGEMENT =====
let currentScreen = 'splash';

function showScreen(id) {
  const target = document.getElementById(id + '-screen');
  if (!target) return;
  const curr = document.querySelector('.screen.active');
  if (curr && curr !== target) {
    curr.classList.remove('active');
    curr.classList.add('exit-left');
    setTimeout(() => curr.classList.remove('exit-left'), 380);
  }
  target.classList.add('active');
  target.scrollTop = 0;
  currentScreen = id;
  if (id === 'home')     renderHome();
  if (id === 'history')  renderHistory();
  if (id === 'settings') renderSettings();
  if (id === 'add-med' && !editingId) initAddMedForm();
}

function showOnboarding() {
  document.getElementById('user-name-input').value = '';
  document.getElementById('avatar-preview').style.display = 'none';
  document.getElementById('avatar-placeholder').style.display = '';
  showScreen('onboarding');
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach((b,i)=>{
    b.classList.toggle('active', ['home','schedule','history','settings'][i]===tab);
  });
  showScreen(tab==='schedule'?'home':tab);
}

// ===== ONBOARDING =====
function handleAvatarUpload(e) {
  const file = e.target.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = ev => {
    state.user.avatar = ev.target.result;
    const p = document.getElementById('avatar-preview');
    p.src = ev.target.result; p.style.display='block';
    document.getElementById('avatar-placeholder').style.display='none';
  };
  r.readAsDataURL(file);
}
function finishOnboarding() {
  const name = document.getElementById('user-name-input').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  state.user.name = name;
  save(); showScreen('home');
}

// ===== HOME =====
function renderHome() {
  const now  = new Date();
  const hour = now.getHours();
  document.getElementById('greeting-text').textContent     = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  document.getElementById('user-name-display').textContent = state.user.name || 'there';

  // Avatar
  const img=document.getElementById('header-avatar-img'), emo=document.getElementById('header-avatar-emoji');
  if (state.user.avatar) { img.src=state.user.avatar; img.style.display='block'; emo.style.display='none'; }
  else { img.style.display='none'; emo.style.display=''; }

  document.getElementById('schedule-date').textContent = now.toLocaleDateString('en-US',{month:'long',day:'numeric'});

  const today     = TODAY();
  const dayOfWeek = now.getDay();
  // Get ALL medications scheduled for today
  const todayMeds = getScheduleForDay(today, dayOfWeek);

  let taken = 0;
  const total = todayMeds.length;
  todayMeds.forEach(d => { if(state.doses[`${today}:${d.medId}:${d.time}`]==='taken') taken++; });

  // Progress ring
  const pct=total>0?taken/total:0, circ=201;
  document.getElementById('ring-fill').style.strokeDashoffset = circ - circ*pct;
  document.getElementById('ring-taken').textContent = taken;
  document.getElementById('ring-total').textContent = '/'+total;

  const remaining = total-taken;
  document.getElementById('progress-headline').textContent =
    remaining===0 ? (total>0?'🎉 All done!':'No doses today') : `${remaining} more dose${remaining!==1?'s':''} to go`;
  document.getElementById('progress-bar').style.width = (pct*100)+'%';
  document.getElementById('progress-sub').textContent  = `${Math.round(pct*100)}% adherence today`;

  document.getElementById('streak-count').textContent = calcStreak();
  document.getElementById('monthly-pct').textContent  = calcMonthlyPct();

  renderNextDose(todayMeds, today);
  renderMedList(todayMeds, today);
}

// Returns ALL dose-slots for a given date/dayOfWeek (no time filtering)
function getScheduleForDay(dateStr, dayOfWeek) {
  const items = [];
  state.medications.forEach(med => {
    if (!med.days || !med.days.includes(dayOfWeek)) return;
    (med.times||[]).forEach(time => items.push({ medId: med.id, time, med }));
  });
  items.sort((a,b)=>PARSE_TIME(a.time)-PARSE_TIME(b.time));
  return items;
}

function renderNextDose(todayMeds, today) {
  const card=document.getElementById('next-dose-card'), nowMins=NOW_MINS();
  let next=null;
  for (const d of todayMeds) {
    const key=`${today}:${d.medId}:${d.time}`;
    const dueInMins=PARSE_TIME(d.time)-nowMins;
    // Show next dose card only if due within 30 mins or overdue by up to 2 hours and not taken
    if ((!state.doses[key]||state.doses[key]==='snoozed') && dueInMins>=-120 && dueInMins<=30) { next=d; break; }
  }
  if (!next) { card.style.display='none'; return; }
  const dueInMins=PARSE_TIME(next.time)-nowMins;
  card.style.display='block';
  document.getElementById('next-dose-icon').textContent = next.med.icon;
  document.getElementById('next-dose-name').textContent = next.med.name;
  document.getElementById('next-dose-meta').textContent = `${next.med.dose} · ${FMT_12(next.time)}`;
  const se=document.getElementById('next-dose-status');
  se.textContent=dueInMins<=0?'Overdue':'Due Now';
  se.className='next-dose-due'+(dueInMins<=0?' overdue':'');
  card.dataset.medId=next.medId; card.dataset.time=next.time;
}

function takeNextDose() {
  const c=document.getElementById('next-dose-card');
  markDose(c.dataset.medId, c.dataset.time, 'taken');
}
function snoozeNextDose() {
  const c=document.getElementById('next-dose-card');
  markDose(c.dataset.medId, c.dataset.time, 'snoozed');
  showToast('Snoozed ⏰');
}

function renderMedList(todayMeds, today) {
  const list=document.getElementById('med-list'), empty=document.getElementById('empty-state');
  list.innerHTML='';

  // If no meds at all (not just today), show empty state with message
  if (state.medications.length===0) {
    empty.style.display='block'; return;
  }
  empty.style.display='none';

  // If there are meds but none scheduled today, show all meds with "Not scheduled today"
  if (todayMeds.length===0) {
    state.medications.forEach(med => {
      const item=document.createElement('div');
      item.className='med-item';
      item.innerHTML=`
        <div class="med-dot" style="background:var(--text-light)"></div>
        <div class="med-item-icon">${med.icon}</div>
        <div class="med-item-info">
          <div class="med-item-name">${med.name}</div>
          <div class="med-item-dose">${med.dose}</div>
        </div>
        <div class="med-item-time">
          <span class="pill" style="background:var(--bg);color:var(--text-muted)">Not today</span>
        </div>`;
      list.appendChild(item);
    });
    return;
  }

  const nowMins=NOW_MINS();
  todayMeds.forEach(d => {
    const key=`${today}:${d.medId}:${d.time}`;
    const status=state.doses[key];
    const timeMins=PARSE_TIME(d.time);
    const isTaken  = status==='taken';
    const isMissed = !isTaken && timeMins < nowMins-5;   // >5 mins past and not taken = missed
    const isDue    = !isTaken && !isMissed && timeMins-nowMins<=30;
    const isUp     = !isTaken && !isMissed && !isDue;

    const item=document.createElement('div');
    item.className='med-item'+(isTaken?' taken':'')+(isDue?' active-med':'');

    let pill;
    if (isTaken)       pill='<span class="pill pill-taken">✓ Taken</span>';
    else if (isMissed) pill='<span class="pill pill-missed">Missed</span>';
    else if (isDue)    pill='<span class="pill pill-take">Take Now</span>';
    else               pill='<span class="pill pill-upcoming">Upcoming</span>';

    item.innerHTML=`
      <div class="med-dot ${isUp?'upcoming':isMissed?'missed-dot':'taken-dot'}"></div>
      <div class="med-item-icon">${d.med.icon}</div>
      <div class="med-item-info">
        <div class="med-item-name${isTaken?' taken-name':''}">${d.med.name}</div>
        <div class="med-item-dose">${d.med.dose}${d.med.notes?' · '+d.med.notes:''}</div>
      </div>
      <div class="med-item-time">
        <span class="med-item-clock">${FMT_12(d.time)}</span>
        ${pill}
      </div>`;

    if (!isTaken) {
      item.style.cursor='pointer';
      item.addEventListener('click', ()=>showMedAction(d.medId, d.time, isMissed));
    }
    list.appendChild(item);
  });
}

// ===== MARK DOSE =====
function markDose(medId, time, status) {
  const today=TODAY(), key=`${today}:${medId}:${time}`;
  state.doses[key]=status;
  const med=state.medications.find(m=>m.id===medId);
  if (med) {
    state.history=state.history.filter(h=>!(h.date===today&&h.medId===medId&&h.time===time));
    state.history.unshift({date:today,medId,time,status,name:med.name,icon:med.icon,dose:med.dose,ts:Date.now()});
    state.history=state.history.slice(0,500);
  }
  save();
  if (status==='taken') showToast('✓ Marked as taken!');
  renderHome();
}

function showMedAction(medId, time, isMissed) {
  const med=state.medications.find(m=>m.id===medId);
  if (!med) return;
  const msg = isMissed
    ? `${med.name} — ${FMT_12(time)}\n\nThis dose was missed. Mark as taken anyway?`
    : `${med.name} — ${FMT_12(time)}\n\nMark as taken?`;
  if (confirm(msg)) markDose(medId, time, 'taken');
}

// ===== STATS =====
function calcStreak() {
  let streak=0;
  const d=new Date();
  for (let i=0;i<365;i++) {
    const ds=LOCAL_DATE_STR(d);
    const items=getScheduleForDay(ds, d.getDay());
    if (items.length>0) {
      const allTaken=items.every(it=>state.doses[`${ds}:${it.medId}:${it.time}`]==='taken');
      if (allTaken) streak++;
      else if (i>0) break;
    }
    d.setDate(d.getDate()-1);
  }
  return streak;
}
function calcMonthlyPct() {
  const now=new Date(), yr=now.getFullYear(), mo=now.getMonth();
  let taken=0,total=0;
  for (let day=1;day<=now.getDate();day++) {
    const d=new Date(yr,mo,day), ds=LOCAL_DATE_STR(d);
    getScheduleForDay(ds,d.getDay()).forEach(it=>{
      total++;
      if(state.doses[`${ds}:${it.medId}:${it.time}`]==='taken') taken++;
    });
  }
  return total>0?Math.round(taken/total*100):0;
}

// ===== HISTORY =====
function renderHistory() {
  document.getElementById('stat-streak').textContent       = calcStreak();
  document.getElementById('stat-monthly').textContent      = calcMonthlyPct()+'%';
  document.getElementById('stat-total-taken').textContent  = state.history.filter(h=>h.status==='taken').length;
  document.getElementById('stat-total-missed').textContent = state.history.filter(h=>h.status==='missed').length;
  const list=document.getElementById('history-list');
  list.innerHTML='';
  if (!state.history.length) {
    list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem">No history yet</p>';
    return;
  }
  const groups={};
  state.history.forEach(h=>{ (groups[h.date]=groups[h.date]||[]).push(h); });
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const div=document.createElement('div'); div.className='history-day';
    div.innerHTML=`<div class="history-day-label">${DATE_LABEL(date)}</div>`;
    groups[date].forEach(h=>{
      const cls  =h.status==='taken'?'status-taken':h.status==='snoozed'?'status-snoozed':'status-missed';
      const label=h.status==='taken'?'✓ Taken':h.status==='snoozed'?'⏰ Snoozed':'✗ Missed';
      const item=document.createElement('div'); item.className='history-item';
      item.innerHTML=`
        <span class="history-icon">${h.icon}</span>
        <span class="history-name">${h.name} <span style="font-weight:400;color:var(--text-muted)">${h.dose}</span></span>
        <span class="history-time">${FMT_12(h.time)}</span>
        <span class="history-status ${cls}">${label}</span>`;
      div.appendChild(item);
    });
    list.appendChild(div);
  });
}

// ===== SETTINGS =====
function renderSettings() {
  document.getElementById('settings-name').value=state.user.name||'';
  const img=document.getElementById('settings-avatar-img'), emo=document.getElementById('settings-avatar-emoji');
  if (state.user.avatar){ img.src=state.user.avatar; img.style.display='block'; emo.style.display='none'; }
  else { img.style.display='none'; emo.style.display=''; }
  const list=document.getElementById('settings-med-list');
  list.innerHTML='';
  if (!state.medications.length) {
    list.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:1rem">No medications yet</p>';
    return;
  }
  state.medications.forEach(med=>{
    const div=document.createElement('div'); div.className='settings-med-item';
    div.innerHTML=`
      <div class="settings-med-info">
        <span>${med.icon}</span>
        <div>
          <div style="font-size:.9rem;font-weight:600">${med.name}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${med.dose} · ${(med.times||[]).map(FMT_12).join(', ')}</div>
        </div>
      </div>
      <div class="settings-med-actions">
        <button class="btn-edit" onclick="editMed('${med.id}')">Edit</button>
        <button class="btn-del"  onclick="deleteMed('${med.id}')">Del</button>
      </div>`;
    list.appendChild(div);
  });
}
function handleSettingsAvatar(e) {
  const file=e.target.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=ev=>{
    state.user.avatar=ev.target.result;
    document.getElementById('settings-avatar-img').src=ev.target.result;
    document.getElementById('settings-avatar-img').style.display='block';
    document.getElementById('settings-avatar-emoji').style.display='none';
    save();
  };
  r.readAsDataURL(file);
}
function saveSettings() {
  const name=document.getElementById('settings-name').value.trim();
  if (!name) { showToast('Name cannot be empty'); return; }
  state.user.name=name; save(); showToast('Saved ✓'); showScreen('home');
}
function confirmReset() {
  if (confirm('Reset ALL data? This cannot be undone.')) {
    localStorage.removeItem('medtrack_v3');
    localStorage.removeItem('medtrack_v2');
    location.reload();
  }
}

// ===== ADD / EDIT MEDICATION =====
let selectedIcon='💊', editingId=null;

function initAddMedForm() {
  editingId=null;
  document.getElementById('add-med-title').textContent='Add Medication';
  document.getElementById('save-med-btn').textContent='Save Medication';
  document.getElementById('med-name').value='';
  document.getElementById('med-dose').value='';
  document.getElementById('med-notes').value='';
  selectedIcon='💊'; updateIconPicker();
  document.getElementById('times-list').innerHTML='';
  addTimeSlot('08:00');
  // Select ALL days by default
  document.querySelectorAll('#days-picker .day-btn').forEach(b=>b.classList.add('selected'));
}

function editMed(id) {
  const med=state.medications.find(m=>m.id===id); if(!med) return;
  editingId=id;
  document.getElementById('add-med-title').textContent='Edit Medication';
  document.getElementById('save-med-btn').textContent='Update Medication';
  document.getElementById('med-name').value=med.name;
  document.getElementById('med-dose').value=med.dose;
  document.getElementById('med-notes').value=med.notes||'';
  selectedIcon=med.icon; updateIconPicker();
  document.getElementById('times-list').innerHTML='';
  (med.times||[]).forEach(t=>addTimeSlot(t));
  document.querySelectorAll('#days-picker .day-btn').forEach(b=>{
    b.classList.toggle('selected',(med.days||[]).includes(Number(b.dataset.day)));
  });
  showScreen('add-med');
}

function updateIconPicker() {
  document.querySelectorAll('#icon-picker .icon-option').forEach(el=>{
    el.classList.toggle('selected', el.dataset.icon===selectedIcon);
  });
}

document.getElementById('icon-picker').addEventListener('click', e=>{
  const opt=e.target.closest('.icon-option'); if(!opt) return;
  selectedIcon=opt.dataset.icon; updateIconPicker();
});

document.getElementById('days-picker').addEventListener('click', e=>{
  const btn=e.target.closest('.day-btn'); if(btn) btn.classList.toggle('selected');
});

function addTimeSlot(defaultTime='08:00') {
  const wrap=document.createElement('div'); wrap.className='time-slot';
  const inp=document.createElement('input'); inp.type='time'; inp.value=defaultTime;
  const rm=document.createElement('button');
  rm.className='btn-remove-time'; rm.textContent='×'; rm.type='button';
  rm.onclick=()=>wrap.remove();
  wrap.appendChild(inp); wrap.appendChild(rm);
  document.getElementById('times-list').appendChild(wrap);
}

function saveMedication() {
  const name=document.getElementById('med-name').value.trim();
  const dose=document.getElementById('med-dose').value.trim();
  const notes=document.getElementById('med-notes').value.trim();
  if (!name||!dose) { showToast('Name and dosage are required'); return; }

  const times=Array.from(document.querySelectorAll('#times-list input[type=time]'))
    .map(i=>i.value).filter(Boolean);
  if (!times.length) { showToast('Add at least one time'); return; }

  // Read days ONLY from inside #add-med-screen > #days-picker
  const days=Array.from(document.querySelectorAll('#add-med-screen #days-picker .day-btn.selected'))
    .map(b=>Number(b.dataset.day));
  if (!days.length) { showToast('Select at least one day'); return; }

  const isEdit = !!editingId;
  if (isEdit) {
    const med=state.medications.find(m=>m.id===editingId);
    if (med) Object.assign(med,{name,dose,icon:selectedIcon,times,days,notes});
  } else {
    state.medications.push({id:'med_'+Date.now(),name,dose,icon:selectedIcon,times,days,notes});
  }
  editingId=null;
  save();
  showToast(isEdit?'Updated ✓':'Medication added ✓');
  showScreen('home');
}

function deleteMed(id) {
  if (!confirm('Delete this medication?')) return;
  state.medications=state.medications.filter(m=>m.id!==id);
  save(); showToast('Removed'); renderSettings();
}

// ===== TOAST =====
let toastTimer;
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2500);
}

// ===== FAB =====
document.querySelector('.fab').addEventListener('click', ()=>{
  initAddMedForm(); showScreen('add-med');
});

// ===== PWA INSTALL PROMPT =====
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  hideInstallBanner();
  deferredInstallPrompt = null;
  showToast('MedTrack installed! 🎉');
});

function showInstallBanner() {
  // Don't show if already in standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'flex';
}

function hideInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.style.display = 'none';
}

async function triggerInstall() {
  if (!deferredInstallPrompt) {
    showToast('Use browser menu → "Add to Home Screen"');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') hideInstallBanner();
  deferredInstallPrompt = null;
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  });
}

// ===== AUTO REFRESH =====
setInterval(()=>{ if(currentScreen==='home') renderHome(); }, 60000);

// ===== INIT =====
load();
if (state.user && state.user.name) {
  showScreen('home');
}
// else stay on splash

/* Screens: mode select, time up, pause, level up and the start button. */
/* ================= MODE SELECT ================= */
document.querySelectorAll('.mode').forEach(el=>{
  const pick=()=>{
    document.querySelectorAll('.mode').forEach(m=>{
      m.classList.remove('sel'); m.setAttribute('aria-pressed','false');
    });
    el.classList.add('sel'); el.setAttribute('aria-pressed','true');
    MODE=el.dataset.mode;
  };
  el.addEventListener('click',pick);
  el.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); }
  });
});

/* ================= TIME MODE ROUND END ================= */
const timeUpEl=$('timeUp'), tuConfetti=$('tuConfetti'), tuCtx=tuConfetti.getContext('2d');
function endTimeRound(){
  timeOver=true;
  banner=null; combo=0; comboT=0;
  timeVal.classList.remove('urgent');
  mosquitoes=[]; sparks=[]; floaters=[];
  $('tuScore').textContent=score;
  $('tuKills').textContent=kills+(kills===1?' MOSQUITO ZAPPED':' MOSQUITOES ZAPPED')
    +(bestCombo>=3?'   ·   BEST CHAIN x'+bestCombo:'');

  const recs=[];
  if(score>bests.time){ bests.time=score; recs.push('SCORE'); }
  if(kills>bests.timeKills){ bests.timeKills=kills; recs.push('KILLS'); }
  if(bestCombo>bests.timeChain){ bests.timeChain=bestCombo; recs.push('CHAIN'); }
  if(recs.length) saveBests();

  $('tuBest').innerHTML = recs.length
    ? '<span style="color:#FFD028">NEW '+recs.join(' + ')+' RECORD!</span>'
    : '<span style="color:#7FE9F2">BEST '+bests.time+'  ·  '+bests.timeKills
      +' KILLS  ·  x'+bests.timeChain+'</span>';
  timeUpEl.classList.remove('show');
  void timeUpEl.offsetWidth;
  timeUpEl.classList.add('show');
  burstConfetti(tuConfetti,tuCtx,90);
  sfxLevelUp();
  $('tuAgain').focus();
}
function resetRound(){
  score=0; kills=0; level=1; combo=0; comboT=0; banner=null; bestCombo=0;
  timeLeft=TIME_LIMIT; timeOver=false; waveT=0;
  mosquitoes=[]; sparks=[]; floaters=[]; corpses=[];
  scoreVal.textContent='0'; scoreVal.style.fontSize='';
  levelVal.textContent='1';
  timeVal.textContent=TIME_LIMIT; timeVal.style.color='';
  timeVal.classList.remove('urgent');
  buildPips();
  lastT=performance.now();
}
$('tuAgain').addEventListener('click',()=>{
  timeUpEl.classList.remove('show');
  resetRound();
});
function goToMenu(){
  timeUpEl.classList.remove('show');
  $('pauseMenu').classList.remove('show');
  userPaused=false;
  hud.style.display='none';
  running=false;
  if(video.srcObject){ video.srcObject.getTracks().forEach(t=>t.stop()); video.srcObject=null; }
  const b=$('startBtn');
  b.disabled=false;
  b.innerHTML='<span>LET\'S ZAP</span><span class="arrow">\u25b6</span>';
  paintBests();
  overlay.style.display='flex';
}
$('tuMenu').addEventListener('click',goToMenu);

/* ================= PAUSE MENU ================= */
const pauseEl=$('pauseMenu');
function pauseGame(){
  if(!running||userPaused||levelPaused||timeOver) return;
  userPaused=true;
  $('pmScore').textContent=score;
  $('pmInfo').textContent = MODE==='time'
    ? Math.ceil(timeLeft)+' SECONDS LEFT'
    : 'LEVEL '+level+'  ·  '+kills+' / '+KILLS_PER_LEVEL+' ZAPPED';
  pauseEl.classList.remove('show');
  void pauseEl.offsetWidth;
  pauseEl.classList.add('show');
  if(AC&&buzzGain) buzzGain.gain.setTargetAtTime(0,AC.currentTime,0.05);
  $('pmResume').focus();
}
function resumeGame(){
  if(!userPaused) return;
  userPaused=false;
  pauseEl.classList.remove('show');
  lastT=performance.now();
}
function togglePause(){ userPaused ? resumeGame() : pauseGame(); }
$('pauseBtn').addEventListener('click',pauseGame);
$('pmResume').addEventListener('click',resumeGame);
$('pmRestart').addEventListener('click',()=>{ resetRound(); resumeGame(); });
$('pmMenu').addEventListener('click',goToMenu);
addEventListener('keydown',e=>{
  if(e.key==='Escape'||e.key==='p'||e.key==='P'){
    if(e.repeat) return;
    if(!running) return;
    e.preventDefault();
    togglePause();
  }
});
// leaving the tab freezes the round so a timer never runs out unseen
document.addEventListener('visibilitychange',()=>{ if(document.hidden) pauseGame(); });


/* ================= LEVEL UP CONFETTI ================= */

function burstConfetti(cv,cx2,n=140){
  const w=cv.width=innerWidth*devicePixelRatio;
  const h=cv.height=innerHeight*devicePixelRatio;
  cv.style.width=innerWidth+'px';
  cv.style.height=innerHeight+'px';
  const cols=['#FFC01F','#FF9500','#3DF5FF','#FF3D5A','#6E9BFF','#FFFFFF'];
  const parts=[];
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const sp=(200+Math.random()*900)*devicePixelRatio;
    parts.push({
      x:w/2, y:h/2,
      vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
      s:(4+Math.random()*7)*devicePixelRatio,
      rot:Math.random()*6, vr:(Math.random()*2-1)*10,
      col:cols[(Math.random()*cols.length)|0],
      life:1.6+Math.random()*1.2
    });
  }
  let raf=0, last=performance.now();
  const step=()=>{
    const nw=performance.now(), cdt=Math.min(0.05,(nw-last)/1000); last=nw;
    cx2.clearRect(0,0,w,h);
    let alive=false;
    for(const c of parts){
      if(c.life<=0) continue;
      alive=true;
      c.life-=cdt;
      c.vy+=1400*devicePixelRatio*cdt;
      c.vx*=0.98; c.vy*=0.99;
      c.x+=c.vx*cdt; c.y+=c.vy*cdt; c.rot+=c.vr*cdt;
      cx2.save();
      cx2.globalAlpha=Math.max(0,Math.min(1,c.life));
      cx2.translate(c.x,c.y); cx2.rotate(c.rot);
      cx2.fillStyle=c.col;
      cx2.fillRect(-c.s/2,-c.s/2,c.s,c.s*0.6);
      cx2.restore();
    }
    if(alive) raf=requestAnimationFrame(step);
    else cx2.clearRect(0,0,w,h);
  };
  raf=requestAnimationFrame(step);
  return ()=>{cancelAnimationFrame(raf); cx2.clearRect(0,0,w,h);};
}
let stopConfetti=null;
function startConfetti(){
  if(stopConfetti) stopConfetti();
  stopConfetti=burstConfetti(lvConfetti,lvCtx,140);
}

/* ================= LEVEL UP BUTTONS ================= */
function dismissLevelUp(){
  levelUpEl.classList.remove('show');
  levelPaused=false;
  waveT=2.0;                 // breathing room before the harder wave arrives
  if(stopConfetti){ stopConfetti(); stopConfetti=null; }
  lastT=performance.now();   // avoid a huge dt after the pause
}
$('lvNext').addEventListener('click',dismissLevelUp);
$('lvBack').addEventListener('click',()=>{
  // replay the level just cleared, at its original difficulty
  if(level>1){ level--; levelVal.textContent=level; }
  kills=0; buildPips();
  dismissLevelUp();
});
addEventListener('keydown',e=>{
  if(!levelPaused) return;
  if(e.key==='Enter'||e.key===' ') { e.preventDefault(); dismissLevelUp(); }
});
addEventListener('keydown',e=>{ if(e.key==='d'||e.key==='D') DEBUG=!DEBUG; });

/* ================= BOOT ================= */
$('startBtn').addEventListener('click', async ()=>{
  const btn=$('startBtn');
  btn.disabled=true; btn.innerHTML='<span>WARMING UP...</span>';
  errBox.style.display='none';
  try{
    initAudio();
    if(AC.state==='suspended') await AC.resume();
    // load the tracker only when needed, so the page works as a plain script and starts faster
    const { HandLandmarker, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");

    const files=await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    landmarker=await HandLandmarker.createFromOptions(files,{
      baseOptions:{
        modelAssetPath:"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate:"GPU"
      },
      runningMode:"VIDEO",
      numHands:2,
      minHandDetectionConfidence:0.5,
      minTrackingConfidence:0.5
    });

    const stream=await navigator.mediaDevices.getUserMedia({
      video:{facingMode:'user',width:{ideal:1280},height:{ideal:720}},audio:false
    });
    video.srcObject=stream;
    await video.play();

    overlay.style.display='none';
    hud.style.display='block';
    const timeM = MODE==='time';
    $('statLevel').style.display = timeM?'none':'flex';
    $('statPips').style.display  = timeM?'none':'flex';
    $('statTime').style.display  = timeM?'flex':'none';
    $('divB').style.display      = timeM?'none':'block';
    resetRound();
    running=true;
    lastT=performance.now();
    loop();
  }catch(e){
    console.error(e);
    btn.disabled=false; btn.innerHTML='<span>LET\'S ZAP</span><span class="arrow">▶</span>';
    errBox.style.display='block';
    errBox.textContent=e.name==='NotAllowedError'
      ?'Camera permission denied. Allow camera access and press start again.'
      :'Could not start: '+(e.message||e);
  }
});

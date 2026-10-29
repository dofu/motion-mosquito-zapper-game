/* Game: page references, difficulty, scoring, drawing, hand tracking and the main loop. */
/* ================= DOM ================= */
const $ = id=>document.getElementById(id);
const overlay=$('overlay'), errBox=$('err'), hud=$('hud'), hint=$('handHint');
const scoreVal=$('scoreVal'), levelVal=$('levelVal'), killPips=$('killPips');
const levelUpEl=$('levelUp'), lvNum=$('lvNum'), lvBonus=$('lvBonus');
const lvConfetti=$('lvConfetti'), lvCtx=lvConfetti.getContext('2d');
const timeVal=$('timeVal');
const video=$('cam'), canvas=$('stage'), ctx=canvas.getContext('2d');

let landmarker=null, running=false, lastVideoTime=-1;

function fitCanvas(){
  canvas.width=innerWidth*devicePixelRatio;
  canvas.height=innerHeight*devicePixelRatio;
  canvas.style.width=innerWidth+'px';
  canvas.style.height=innerHeight+'px';
}
addEventListener('resize',fitCanvas); fitCanvas();

/* ================= GAME STATE ================= */
const KILLS_PER_LEVEL=10;
let level=1, score=0, kills=0;
/* ================= PERSISTENT BESTS ================= */
// localStorage is unavailable in some sandboxed embeds, so every access is
// guarded and silently falls back to in-memory values for the session.
const STORE_KEY='mzap.bests.v1';
let bests={time:0, timeKills:0, timeChain:0, level:1, levelScore:0};
function loadBests(){
  try{
    const raw=localStorage.getItem(STORE_KEY);
    if(raw) bests=Object.assign(bests,JSON.parse(raw));
  }catch(e){ /* storage blocked: session-only bests */ }
}
function saveBests(){
  try{ localStorage.setItem(STORE_KEY,JSON.stringify(bests)); }
  catch(e){ /* storage blocked: keep in memory */ }
}
loadBests();
function paintBests(){
  const bl=document.getElementById('bestLevels');
  const bt=document.getElementById('bestTime');
  if(bl) bl.textContent = bests.level>1||bests.levelScore>0
    ? 'BEST  LV'+bests.level+'  ·  '+bests.levelScore : '';
  if(bt) bt.textContent = bests.time>0 ? 'BEST  '+bests.time : '';
}

let mosquitoes=[], sparks=[], floaters=[], corpses=[];
let userPaused=false;   // true while the pause menu is open
let levelPaused=false;  // true while the level-up screen is waiting on the player
let waveT=0;            // >0 while the next wave holds off after a level-up
let MODE='levels';      // 'levels' or 'time'
const TIME_LIMIT=30;
let timeLeft=TIME_LIMIT, timeOver=false;
let comboT=0, combo=0;
let bestCombo=0;
// on-screen combo banner (drawn on canvas so it never blocks play)
let banner=null;   // {txt, sub, t, life, seed}
const COMBO_WINDOW=1.0;   // a full second without a kill breaks the chain

function diff(){
  if(MODE==='time'){
    // Credit-card racquet is already the challenge, so the bugs stay slow and
    // never dodge. This makes it a speed run, not a precision-under-pressure run.
    return {count:6, speed:150, evade:0, size:1};
  }
  return {
    count: Math.min(2+Math.floor(level*0.8), 8),
    speed: 90 + level*38,                 // px/s at 1080p-ish, scaled later
    evade: level>=3 ? Math.min(0.25+(level-3)*0.12, 1) : 0,  // dodge skill
    size: Math.max(0.82, 1 - level*0.022) // racquet shrink is the main size challenge
  };
}

function buildPips(){
  killPips.innerHTML='';
  for(let i=0;i<KILLS_PER_LEVEL;i++){
    const p=document.createElement('div');
    p.className='pip'+(i<kills?' on':'');
    killPips.appendChild(p);
  }
}

function spawnMosquito(W,H,avoid){
  const d=diff();
  // Occasional golden mosquito: faster and worth 5x. Gives the player a reason
  // to break position and chase, instead of camping one corner of the frame.
  const golden = Math.random() < 0.07;
  // Size variety: most are normal, some spawn noticeably smaller. Purely a
  // visual/tracking challenge, since the racquet hitbox doesn't change, so
  // small ones are rewarded with a modest point bump for being harder to spot.
  const sizeRoll=Math.random();
  const sizeMul = sizeRoll<0.12 ? 0.5      // tiny: 50% smaller
                : sizeRoll<0.35 ? 0.7      // small: 30% smaller
                : 1;                       // normal
  const sizeBonus = sizeMul<=0.5 ? 1.5 : sizeMul<1 ? 1.2 : 1;
  // spawn at a random edge
  const edge=Math.floor(Math.random()*4);
  let x,y;
  if(edge===0){x=Math.random()*W;y=-40}
  else if(edge===1){x=Math.random()*W;y=H+40}
  else if(edge===2){x=-40;y=Math.random()*H}
  else {x=W+40;y=Math.random()*H}
  // don't spawn on top of a racquet
  for(const r of avoid){
    if(r && Math.hypot(x-r.hx,y-r.hy)<r.headR*2.5){x=W/2;y=-40;break}
  }
  const a=Math.random()*Math.PI*2;
  mosquitoes.push({
    x,y,
    vx:Math.cos(a), vy:Math.sin(a),
    phase:Math.random()*100,
    turn:(Math.random()*2-1),
    tx:Math.random()*W, ty:Math.random()*H,
    retarget: 1+Math.random()*2,
    size:d.size * sizeMul * (golden?1.15:1),
    golden,
    sizeBonus,
    spdMul: golden?1.45:1,
    alive:true
  });
}

/* ================= HANDS / RACQUETS ================= */
// per hand: smoothed palm + direction, racquet head position, prev head pos for swing speed
const racquets=[null,null];

/* ================= DRAWING ================= */
function drawRacquet(g,r,t){
  g.save();
  g.translate(r.px,r.py);
  g.rotate(r.ang);
  const L=r.len;
  const headR=r.headR;
  const RED='#D8332B', RED_D='#9E211B', BLK='#1A1A1E', BLK_L='#3A3A42';

  g.lineCap='round'; g.lineJoin='round';

  /* ---------- handle: black, ribbed grip, ends inside the fist ---------- */
  const butt=headR*1.30;
  g.strokeStyle=BLK;
  g.lineWidth=headR*0.30;
  g.beginPath(); g.moveTo(0,butt); g.lineTo(0,-headR*0.35); g.stroke();
  // highlight down one side of the barrel
  g.strokeStyle=BLK_L;
  g.lineWidth=headR*0.09;
  g.beginPath(); g.moveTo(-headR*0.06,butt*0.93); g.lineTo(-headR*0.06,-headR*0.3); g.stroke();
  // grip ribs
  g.strokeStyle='#000'; g.lineWidth=Math.max(1.5,headR*0.035);
  for(let i=0;i<6;i++){
    const yy=butt*0.92 - i*(headR*0.16);
    g.beginPath(); g.moveTo(-headR*0.15,yy); g.lineTo(headR*0.15,yy); g.stroke();
  }

  /* ---------- neck: two struts splaying into the frame ---------- */
  g.strokeStyle=RED; g.lineWidth=headR*0.13;
  for(const side of [-1,1]){
    g.beginPath();
    g.moveTo(side*headR*0.07, -headR*0.30);
    g.quadraticCurveTo(side*headR*0.42, -headR*0.62, side*headR*0.55, -headR*0.95);
    g.stroke();
  }

  /* ---------- head ---------- */
  g.translate(0,-L);
  const RX=headR*0.86, RY=headR;

  // mesh field
  g.save();
  g.beginPath(); g.ellipse(0,0,RX*0.93,RY*0.93,0,0,Math.PI*2); g.clip();
  g.fillStyle='rgba(232,240,255,0.16)';
  g.fillRect(-RX,-RY,RX*2,RY*2);
  g.strokeStyle='rgba(245,250,255,0.60)';
  g.lineWidth=Math.max(0.8,headR*0.018);
  const step=headR*0.135;
  for(let d=-RX*2.4; d<=RX*2.4; d+=step){
    g.beginPath(); g.moveTo(d,-RY*1.2); g.lineTo(d+RY*1.2,RY*1.2); g.stroke();
    g.beginPath(); g.moveTo(d,-RY*1.2); g.lineTo(d-RY*1.2,RY*1.2); g.stroke();
  }
  g.restore();

  // inner rim
  g.strokeStyle=RED_D; g.lineWidth=headR*0.05;
  g.beginPath(); g.ellipse(0,0,RX*0.93,RY*0.93,0,0,Math.PI*2); g.stroke();

  // outer frame with electric glow
  g.strokeStyle=RED;
  g.lineWidth=headR*0.15;
  g.shadowColor='rgba(61,245,255,0.85)';
  g.shadowBlur=headR*0.30;
  g.beginPath(); g.ellipse(0,0,RX,RY,0,0,Math.PI*2); g.stroke();
  g.shadowBlur=0;
  // frame highlight
  g.strokeStyle='rgba(255,140,130,0.75)';
  g.lineWidth=headR*0.045;
  g.beginPath(); g.ellipse(-RX*0.06,-RY*0.05,RX*0.97,RY*0.97,0,Math.PI*0.75,Math.PI*1.7); g.stroke();

  /* ---------- live arcs across the mesh ---------- */
  if(Math.random()<0.4){
    g.strokeStyle='rgba(255,255,255,0.95)';
    g.lineWidth=Math.max(1.5,headR*0.03);
    g.shadowColor='#3DF5FF'; g.shadowBlur=headR*0.22;
    const a1=Math.random()*Math.PI*2, a2=a1+1+Math.random()*2;
    const p1={x:Math.cos(a1)*RX*0.8,y:Math.sin(a1)*RY*0.8};
    const p2={x:Math.cos(a2)*RX*0.8,y:Math.sin(a2)*RY*0.8};
    g.beginPath(); g.moveTo(p1.x,p1.y);
    for(let i=1;i<=4;i++){
      const f=i/4;
      g.lineTo(p1.x+(p2.x-p1.x)*f+(Math.random()*2-1)*headR*0.1,
               p1.y+(p2.y-p1.y)*f+(Math.random()*2-1)*headR*0.1);
    }
    g.stroke(); g.shadowBlur=0;
  }
  g.restore();
}

function drawMosquito(g,m,t,scaleUnit){
  const s=scaleUnit*m.size;
  const wob=Math.sin((t*0.02)+m.phase)*3;
  g.save();
  g.translate(m.x,m.y+wob);
  const ang=Math.atan2(m.vy,m.vx);
  g.rotate(ang);
  g.scale(s,s);

  const DK = m.golden ? '#C8940B' : '#14161F';   // body ink
  g.lineCap='round'; g.lineJoin='round';

  if(m.golden){
    // warm halo so the bonus target reads instantly against any background
    g.save();
    g.globalAlpha=0.5+0.25*Math.sin(t*0.012+m.phase);
    g.fillStyle='rgba(255,208,40,0.55)';
    g.beginPath(); g.arc(-2,0,15,0,Math.PI*2); g.fill();
    g.restore();
  }

  /* ---- legs: 6, hair-fine, kinked, hind pair trailing ---- */
  g.strokeStyle = m.golden ? 'rgba(200,148,11,0.80)' : 'rgba(20,22,31,0.72)';
  g.lineWidth=0.42;
  // front pair, reaching forward
  for(const dir of [-1,1]){
    g.beginPath();
    g.moveTo(2,dir*1.4);
    g.lineTo(-0.5,dir*4.6);
    g.lineTo(5.5,dir*8);
    g.stroke();
  }
  // middle pair, splayed down
  for(const dir of [-1,1]){
    g.beginPath();
    g.moveTo(-1,dir*1.6);
    g.lineTo(-5,dir*6);
    g.lineTo(-2,dir*11);
    g.stroke();
  }
  // hind pair, long and trailing behind the abdomen
  g.lineWidth=0.34;
  for(const dir of [-1,1]){
    g.beginPath();
    g.moveTo(-4,dir*1.3);
    g.quadraticCurveTo(-15,dir*5,-24,dir*3.5);
    g.stroke();
  }

  /* ---- wings: two narrow swept teardrops, held back over abdomen ---- */
  const beat=Math.sin(t*0.075+m.phase);
  const lift=1+beat*0.22;
  g.fillStyle   = m.golden ? 'rgba(255,208,40,0.50)' : 'rgba(22,24,34,0.55)';
  g.strokeStyle = m.golden ? 'rgba(200,148,11,0.75)' : 'rgba(22,24,34,0.75)';
  g.lineWidth=0.5;
  for(const [dir,off] of [[-1,0],[1,0.3]]){
    g.save();
    g.translate(-0.5,0);
    g.rotate(dir*(0.30+off)*lift);
    g.beginPath();
    // teardrop: narrow at the hinge, widest at two-thirds, pointed tip
    g.moveTo(0,0);
    g.quadraticCurveTo(-7,dir*-4.8,-15,dir*-2.8);
    g.quadraticCurveTo(-9,dir*-0.5,0,0);
    g.fill(); g.stroke();
    g.restore();
  }

  /* ---- abdomen: slender, elongated, tapering to a fine point ---- */
  g.fillStyle=DK; g.strokeStyle=DK; g.lineWidth=0.5;
  g.beginPath();
  g.moveTo(-1.5,-1.7);
  g.quadraticCurveTo(-9,-2.1,-15,-1.1);
  g.quadraticCurveTo(-20,-0.35,-23,0);
  g.quadraticCurveTo(-20,0.35,-15,1.1);
  g.quadraticCurveTo(-9,2.1,-1.5,1.7);
  g.closePath();
  g.fill();
  // faint segment lines, mosquitoes read as ringed not smooth
  g.strokeStyle = m.golden ? 'rgba(120,80,0,0.5)' : 'rgba(0,0,0,0.35)';
  g.lineWidth=0.25;
  for(const sx of [-5,-8.5,-12,-15.5]){
    const r=1.9*(1-Math.abs(sx+9)/16);
    g.beginPath(); g.moveTo(sx,-r); g.lineTo(sx,r); g.stroke();
  }

  /* ---- thorax: small hump, narrower than the head width ---- */
  g.fillStyle=DK;
  g.beginPath();
  g.ellipse(0.3,-0.3,3.4,2.4,-0.1,0,Math.PI*2);
  g.fill();

  /* ---- head: small, set low and forward of the thorax ---- */
  g.beginPath();
  g.arc(5.4,0.9,2.4,0,Math.PI*2);
  g.fill();

  /* ---- eye ---- */
  g.fillStyle='#FF3D5A';
  g.beginPath(); g.arc(6.1,0.3,0.95,0,Math.PI*2); g.fill();
  g.fillStyle='rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(6.45,0.05,0.34,0,Math.PI*2); g.fill();

  /* ---- proboscis: long, straight, needle ---- */
  g.strokeStyle=DK; g.lineWidth=0.65;
  g.beginPath(); g.moveTo(7.5,1.4); g.lineTo(17,2.0); g.stroke();
  /* ---- palps: shorter pair flanking the proboscis ---- */
  g.lineWidth=0.4;
  g.beginPath(); g.moveTo(7.5,1.05); g.lineTo(12,0.4); g.stroke();

  /* ---- antennae: fine, clean, swept up and forward ---- */
  g.strokeStyle = m.golden ? 'rgba(200,148,11,0.78)' : 'rgba(20,22,31,0.7)';
  g.lineWidth=0.35;
  for(const dir of [-1,1]){
    g.beginPath();
    g.moveTo(5.8,-1.0);
    g.quadraticCurveTo(9.2,dir*-3.6,12,dir*-5.0);
    g.stroke();
  }

  g.restore();
}

function spawnSparks(x,y,n,power,golden){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const sp=(120+Math.random()*380)*power;
    sparks.push({
      x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
      life:0.25+Math.random()*0.35,
      max:0.6,
      col: golden ? (Math.random()<0.6?'#FFD028':'#FFFFFF')
                  : (Math.random()<0.5?'#3DF5FF':(Math.random()<0.5?'#FFFFFF':'#FFD028'))
    });
  }
}

/* ================= LOOP ================= */
let lastT=performance.now();

function loop(){
  if(!running) return;
  requestAnimationFrame(loop);
  if(userPaused){ lastT=performance.now(); return; }   // frozen while the pause menu is open
  const now=performance.now();
  const dt=Math.min(0.05,(now-lastT)/1000);
  lastT=now;

  const W=canvas.width,H=canvas.height;
  const unit=H/1080; // resolution-independent scale
  const d=diff();

  const vw=video.videoWidth,vh=video.videoHeight;
  if(!vw){return}
  const cs=Math.max(W/vw,H/vh);
  const dw=vw*cs,dh=vh*cs,ox=(W-dw)/2,oy=(H-dh)/2;

  ctx.save();
  ctx.translate(W,0);ctx.scale(-1,1);
  ctx.drawImage(video,ox,oy,dw,dh);
  ctx.restore();

  // slight arcade vignette
  ctx.fillStyle='rgba(11,14,26,0.18)';
  ctx.fillRect(0,0,W,H);

  /* ---- hand detection ---- */
  let result=null;
  if(video.currentTime!==lastVideoTime){
    lastVideoTime=video.currentTime;
    try{ result=landmarker.detectForVideo(video,now); }catch(e){ result=null; }
  }
  const activeR=[];
  const nHands=(result&&result.landmarks)?Math.min(2,result.landmarks.length):0;

  // MediaPipe does not guarantee a stable order for detected hands: slot 0 can
  // become the other hand between frames, which teleports and spins a racquet.
  // Bind each detection to the nearest existing racquet by pinch position.
  const slotOf=new Array(nHands).fill(-1);
  const taken=[false,false];
  const pinchAt=[];
  for(let i=0;i<nHands;i++){
    const lm=result.landmarks[i];
    pinchAt.push({
      x: W-(ox+((lm[4].x+lm[8].x)/2)*dw),
      y: oy+((lm[4].y+lm[8].y)/2)*dh
    });
  }
  for(let i=0;i<nHands;i++){
    let best=-1, bestD=Infinity;
    for(let s=0;s<2;s++){
      const r=racquets[s];
      if(!r||!r.seen||taken[s]) continue;
      const d=Math.hypot(pinchAt[i].x-r.px, pinchAt[i].y-r.py);
      if(d<bestD){bestD=d; best=s;}
    }
    // only reuse a slot if the hand is plausibly the same one
    if(best>=0 && bestD < Math.max(W,H)*0.35){ slotOf[i]=best; taken[best]=true; }
  }
  for(let i=0;i<nHands;i++){
    if(slotOf[i]<0){
      for(let s=0;s<2;s++){ if(!taken[s]){ slotOf[i]=s; taken[s]=true; break; } }
      if(slotOf[i]<0) slotOf[i]=i;
      if(racquets[slotOf[i]]) racquets[slotOf[i]].seen=false; // force re-init
    }
  }

  for(let i=0;i<nHands;i++){
    const slot=slotOf[i];
    const lm=result.landmarks[i];
    const X=n=>W-(ox+lm[n].x*dw);
    const Y=n=>oy+lm[n].y*dh;

    // hand size reference: wrist to middle knuckle
    const handLen=Math.hypot(X(0)-X(9), Y(0)-Y(9));

    // PEN GRIP MODEL.
    // Anchor at the pinch between thumb tip (4) and index tip (8).
    const pinchX=(X(4)+X(8))/2;
    const pinchY=(Y(4)+Y(8))/2;

    // PEN AXIS.
    // A pinched pen runs ACROSS the fingertips: the barrel is perpendicular to
    // the thumb-tip -> index-tip pinch line. That perpendicular alone is noisy
    // when the fingertips sit close together, so it is blended with the index
    // finger's own direction, which is long and stable and points broadly the
    // same way along the barrel.
    let gx=X(8)-X(4), gy=Y(8)-Y(4);          // pinch line, thumb -> index
    const gl=Math.hypot(gx,gy)||1; gx/=gl; gy/=gl;

    let perpX=-gy, perpY=gx;                  // perpendicular to the pinch line

    // Point it away from the palm centre, so the head is always on the far
    // side of the hand rather than stabbing back through the wrist.
    const palmX=(X(0)+X(5)+X(17))/3;
    const palmY=(Y(0)+Y(5)+Y(17))/3;
    if(perpX*(pinchX-palmX)+perpY*(pinchY-palmY) < 0){ perpX=-perpX; perpY=-perpY; }

    // index finger direction (knuckle -> tip), long and low-noise
    let ivx=X(8)-X(5), ivy=Y(8)-Y(5);
    const ivl=Math.hypot(ivx,ivy)||1; ivx/=ivl; ivy/=ivl;
    // keep it on the same side as the perpendicular before blending
    if(ivx*perpX+ivy*perpY < 0){ ivx=-ivx; ivy=-ivy; }

    let axX=perpX*0.65+ivx*0.35;
    let axY=perpY*0.65+ivy*0.35;
    const axL=Math.hypot(axX,axY)||1;
    axX/=axL; axY/=axL;

    const px=pinchX;
    const py=pinchY;

    let r=racquets[slot];
    if(!r||!r.seen){
      r=racquets[slot]={px,py,ang:0,dx:axX,dy:axY,
        hx:px,hy:py,phx:px,phy:py,seen:true,speed:0,lost:0};
    }
    const k=1-Math.pow(0.0001,dt); // smooth, framerate independent
    r.px+= (px-r.px)*Math.min(1,k*1.4);
    r.py+= (py-r.py)*Math.min(1,k*1.4);

    // Smooth the direction as a VECTOR, not an angle. Angle smoothing has a
    // wraparound seam at +/-180deg that makes the racquet spin the long way
    // round; vectors have no seam, so the barrel stays locked to the hand.
    const ks=Math.min(1,dt*10);
    r.dx+=(axX-r.dx)*ks;
    r.dy+=(axY-r.dy)*ks;
    const dl=Math.hypot(r.dx,r.dy)||1;
    r.dx/=dl; r.dy/=dl;
    r.ang=Math.atan2(r.dy,r.dx)+Math.PI/2;

    // racquet shrinks 15% per level, floored at credit-card scale.
    // A credit card is ~86mm wide, about 0.95x an adult palm width, so the
    // floor is derived from the tracked hand size rather than a fixed pixel.
    const fullR=Math.max(70*unit, handLen*1.05);
    const cardR=Math.max(34*unit, handLen*0.46);   // credit-card sized head
    const shrink=Math.pow(0.85, level-1);
    r.headR = MODE==='time' ? cardR : Math.max(cardR, fullR*shrink);
    r.len=r.headR*1.45;
    // head center in world coords
    r.phx=r.hx; r.phy=r.hy;
    r.hx=r.px+Math.sin(r.ang)*r.len;
    r.hy=r.py-Math.cos(r.ang)*r.len;
    r.speed=Math.hypot(r.hx-r.phx,r.hy-r.phy)/Math.max(dt,0.001);
    r.seen=true; r.lost=0;
    activeR.push(r);
  }
  // grace period: keep racquet 0.25s after tracking blips so it doesn't flicker
  for(let s=0;s<2;s++){
    if(taken[s]) continue;              // this slot is live this frame
    const r=racquets[s];
    if(r&&r.seen){
      r.lost+=dt;
      if(r.lost<0.25) activeR.push(r); else r.seen=false;
    }
  }

  hint.style.display=activeR.length?'none':'block';

  const paused=levelPaused||timeOver;

  /* ---- mosquitoes ---- */
  if(!paused){
    if(waveT>0){ waveT-=dt; }
    else { while(mosquitoes.length<d.count) spawnMosquito(W,H,activeR); }

    for(const m of mosquitoes){
      m.retarget-=dt;
      if(m.retarget<=0){
        m.tx=60+Math.random()*(W-120);
        m.ty=60+Math.random()*(H-120);
        m.retarget=0.8+Math.random()*1.8;
      }
      // steer toward waypoint
      let ax=m.tx-m.x, ay=m.ty-m.y;
      const al=Math.hypot(ax,ay)||1; ax/=al; ay/=al;
      // evade racquet at higher levels
      for(const r of activeR){
        const ex=m.x-r.hx, ey=m.y-r.hy;
        const el=Math.hypot(ex,ey);
        if(el<r.headR*3.2 && d.evade>0){
          const f=d.evade*(1-el/(r.headR*3.2))*3;
          ax+=ex/el*f; ay+=ey/el*f;
        }
      }
      // jitter
      m.phase+=dt*10;
      ax+=Math.sin(m.phase*2.3)*0.5;
      ay+=Math.cos(m.phase*1.7)*0.5;

      const spd=d.speed*unit*1.6*(m.spdMul||1);
      m.vx+= (ax*spd-m.vx)*Math.min(1,dt*3.2);
      m.vy+= (ay*spd-m.vy)*Math.min(1,dt*3.2);
      m.x+=m.vx*dt; m.y+=m.vy*dt;
      m.x=Math.max(-60,Math.min(W+60,m.x));
      m.y=Math.max(-60,Math.min(H+60,m.y));

      // collision with racquet head
      for(const r of activeR){
        const dist=Math.hypot(m.x-r.hx,m.y-r.hy);
        // Near miss: the mesh crackles when a mosquito passes just outside the
        // kill radius. Teaches the true hitbox edge without widening it.
        if(dist>=r.headR*0.95 && dist<r.headR*1.45 && Math.random()<0.30){
          spawnSparks(m.x,m.y,2,0.35);
        }
        if(dist<r.headR*0.95){
          m.alive=false;
          const power=Math.min(1.6, 0.6+r.speed/(1400*unit));
          spawnSparks(m.x,m.y,m.golden?46:26,power,m.golden);
          corpses.push({x:m.x,y:m.y,vy:60,rot:Math.random()*6,vr:(Math.random()*2-1)*6,life:1.4,size:m.size});
          sfxZap();
          if(m.golden) sfxCombo(9);   // bright chime for the bonus target
          // scoring + combo
          if(comboT>0) combo++; else combo=1;
          comboT=COMBO_WINDOW;
          if(combo>bestCombo) bestCombo=combo;
          // Fruit-Ninja style callout: fires from 3 up, gets louder as it climbs
          if(combo>=3){
            banner={
              txt: combo+' COMBO!',
              sub: '+'+(100*(MODE==='time'?1:level)*combo),
              t: 0, life: 1.15, seed: Math.random()*10, big: combo>=8
            };
            sfxCombo(combo);
            if(combo>=8) flashT=Math.max(flashT,0.16);
          }
          const base=(MODE==='time'?100:100*level)*combo;
          const pts=Math.round(base*(m.golden?5:1)*(m.sizeBonus||1));
          score+=pts; kills++;
          floaters.push({x:m.x,y:m.y,t:1,
            txt:(m.golden?'★ +':'+')+pts+(combo>1?'  x'+combo:''),
            col:m.golden?'#FFD028':(combo>1?'#FFD028':'#3DF5FF')});
          scoreVal.textContent=score;
          // shrink the number as digits accumulate so it never overflows
          const dg=String(score).length;
          scoreVal.style.fontSize = dg>7 ? 'clamp(12px,2.2vw,20px)'
                                  : dg>5 ? 'clamp(15px,2.9vw,26px)'
                                         : '';
          buildPips();
          // screen zap flash
          flashT=0.12;
          break;
        }
      }
    }
    mosquitoes=mosquitoes.filter(m=>m.alive);
    comboT-=dt; if(comboT<=0) combo=0;

    /* level complete (levels mode only) */
    if(MODE==='levels' && kills>=KILLS_PER_LEVEL){
      level++; kills=0;
      mosquitoes=[]; sparks=[]; floaters=[]; banner=null;
      combo=0; comboT=0;
      levelPaused=true;
      lvNum.textContent='LEVEL '+level+' UNLOCKED';
      const nd=diff();
      lvBonus.textContent = level>=7
        ? 'MINIMUM RACQUET · PURE SKILL'
        : (nd.evade>0 ? 'RACQUET -15% · THEY DODGE NOW'
                      : 'RACQUET -15% · FASTER BUGS');
      levelUpEl.classList.remove('show');
      void levelUpEl.offsetWidth; // restart animation
      levelUpEl.classList.add('show');
      startConfetti();
      sfxLevelUp();
      if(level>bests.level || score>bests.levelScore){
        bests.level=Math.max(bests.level,level);
        bests.levelScore=Math.max(bests.levelScore,score);
        saveBests();
      }
      levelVal.textContent=level;
      buildPips();
      $('lvNext').focus();
    }

    /* countdown (time mode only) */
    if(MODE==='time' && !timeOver){
      timeLeft-=dt;
      if(timeLeft<=0){ timeLeft=0; endTimeRound(); }
      const shown=Math.ceil(timeLeft);
      if(timeVal.textContent!==String(shown)){
        timeVal.textContent=shown;
        if(shown<=5&&shown>0) sfxTick();
        // restart the strobe on each new second so blink and beep stay locked
        if(shown<=5){
          timeVal.classList.remove('urgent');
          void timeVal.offsetWidth;
          timeVal.classList.add('urgent');
        }
      }
    }
  }

  /* ---- draw mosquitoes ---- */
  for(const m of mosquitoes) drawMosquito(ctx,m,now,unit*2.6);

  /* ---- corpses fall ---- */
  for(const c of corpses){
    c.life-=dt; c.vy+=900*dt; c.y+=c.vy*dt; c.rot+=c.vr*dt;
    ctx.save();
    ctx.globalAlpha=Math.max(0,Math.min(1,c.life));
    ctx.translate(c.x,c.y); ctx.rotate(c.rot);
    ctx.scale(unit*2.2*c.size,unit*2.2*c.size);
    ctx.fillStyle='#111';
    ctx.beginPath(); ctx.ellipse(-8,0,11,1.7,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.5,0,2.6,2.1,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#111'; ctx.lineWidth=1; ctx.lineCap='round';
    // curled-up dead legs
    for(const dir of [-1,1]){
      for(let k=0;k<3;k++){
        ctx.beginPath();
        ctx.moveTo(-2-k*3,dir*1.5);
        ctx.quadraticCurveTo(-5-k*3,dir*5,-2-k*3,dir*7);
        ctx.stroke();
      }
    }
    // smoke
    ctx.globalAlpha*=0.5;
    ctx.fillStyle='#888';
    ctx.beginPath(); ctx.arc(0,-8-(1.4-c.life)*14,4+(1.4-c.life)*6,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  corpses=corpses.filter(c=>c.life>0 && c.y<H+80);

  /* ---- racquets ---- */
  for(const r of activeR) drawRacquet(ctx,r,now);

  /* ---- calibration overlay: press D to verify axis against a real pen ---- */
  if(DEBUG && result && result.landmarks){
    for(let i=0;i<Math.min(2,result.landmarks.length);i++){
      const lm=result.landmarks[i];
      const X=n=>W-(ox+lm[n].x*dw), Y=n=>oy+lm[n].y*dh;
      // thumb tip and index tip
      ctx.fillStyle='#FFD028';
      for(const n of [4,8]){ctx.beginPath();ctx.arc(X(n),Y(n),9,0,Math.PI*2);ctx.fill();}
      // pinch line
      ctx.strokeStyle='#FFD028'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(X(4),Y(4)); ctx.lineTo(X(8),Y(8)); ctx.stroke();
      // resolved barrel axis
      const r=activeR[i];
      if(r){
        ctx.strokeStyle='#FF3D5A'; ctx.lineWidth=5;
        ctx.beginPath();
        ctx.moveTo(r.px-r.dx*260, r.py-r.dy*260);
        ctx.lineTo(r.px+r.dx*260, r.py+r.dy*260);
        ctx.stroke();
      }
    }
    ctx.fillStyle='#FFD028';
    ctx.font=`${Math.round(16*unit+8)}px 'Press Start 2P'`;
    ctx.textAlign='left';
    ctx.fillText('CALIBRATION  RED = BARREL AXIS', 24, H-30);
  }

  /* ---- sparks ---- */
  for(const s of sparks){
    s.life-=dt;
    s.x+=s.vx*dt; s.y+=s.vy*dt;
    s.vx*=0.92; s.vy*=0.92;
    ctx.globalAlpha=Math.max(0,s.life/s.max);
    ctx.strokeStyle=s.col;
    ctx.lineWidth=2.5*unit+1;
    ctx.shadowColor=s.col; ctx.shadowBlur=8;
    ctx.beginPath();
    ctx.moveTo(s.x,s.y);
    ctx.lineTo(s.x-s.vx*0.03,s.y-s.vy*0.03);
    ctx.stroke();
  }
  ctx.shadowBlur=0; ctx.globalAlpha=1;
  sparks=sparks.filter(s=>s.life>0);

  /* ---- floating score text ---- */
  for(const f of floaters){
    f.t-=dt; f.y-=60*dt;
    ctx.globalAlpha=Math.max(0,f.t);
    ctx.font=`${Math.round(20*unit+8)}px 'Press Start 2P'`;
    ctx.fillStyle=f.col;
    ctx.strokeStyle='#0B0E1A'; ctx.lineWidth=4;
    ctx.textAlign='center';
    ctx.strokeText(f.txt,f.x,f.y);
    ctx.fillText(f.txt,f.x,f.y);
  }
  ctx.globalAlpha=1;
  floaters=floaters.filter(f=>f.t>0);

  /* ---- combo banner: punches in, wobbles, fades. Never blocks play. ---- */
  if(banner){
    banner.t+=dt;
    const p=banner.t/banner.life;
    if(p>=1){ banner = null; }
    else{
      // scale: overshoot in, hold, drift out
      let sc, alpha;
      if(p<0.18){ const q=p/0.18; sc=0.3+1.05*(1-Math.pow(1-q,3)); alpha=q; }
      else if(p<0.72){ sc=1.35-0.35*Math.min(1,(p-0.18)/0.2); alpha=1; }
      else { const q=(p-0.72)/0.28; sc=1.0+q*0.35; alpha=1-q; }

      const wob=Math.sin(banner.t*13+banner.seed)*(banner.big?0.055:0.03)*(1-p);
      const bx=W/2, by=H*0.30;

      ctx.save();
      ctx.globalAlpha=alpha;
      ctx.translate(bx,by);
      ctx.rotate(wob);
      ctx.scale(sc,sc);
      ctx.textAlign='center'; ctx.textBaseline='middle';

      const fs=Math.round((banner.big?34:27)*unit+10);
      ctx.font=`${fs}px 'Press Start 2P'`;

      // glow behind the words
      ctx.shadowColor = banner.big ? 'rgba(255,61,90,0.95)' : 'rgba(255,208,40,0.9)';
      ctx.shadowBlur = (banner.big?46:32)*unit;

      // chunky arcade lettering: dark outline, gold fill, warm drop shadow
      ctx.lineJoin='round';
      ctx.strokeStyle='#3A1B00'; ctx.lineWidth=Math.max(6,10*unit);
      ctx.strokeText(banner.txt,0,0);
      ctx.shadowBlur=0;
      ctx.fillStyle='#8A3B00';
      ctx.fillText(banner.txt,0,4*unit+2);
      const grad=ctx.createLinearGradient(0,-fs*0.6,0,fs*0.6);
      grad.addColorStop(0,'#FFF3B0');
      grad.addColorStop(0.45,banner.big?'#FFC01F':'#FFD65C');
      grad.addColorStop(1,banner.big?'#FF7A00':'#F2A50E');
      ctx.fillStyle=grad;
      ctx.fillText(banner.txt,0,0);

      // points line underneath
      const fs2=Math.round(16*unit+7);
      ctx.font=`${fs2}px 'Press Start 2P'`;
      ctx.strokeStyle='#3A1B00'; ctx.lineWidth=Math.max(4,7*unit);
      ctx.strokeText(banner.sub,0,fs*0.95);
      ctx.fillStyle='#FFF3B0';
      ctx.fillText(banner.sub,0,fs*0.95);

      ctx.restore();
      ctx.globalAlpha=1;
      ctx.textBaseline='alphabetic';
    }
  }

  /* ---- wave incoming banner ---- */
  if(waveT>0 && !paused){
    const pulse=0.7+0.3*Math.sin(now*0.012);
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.globalAlpha=Math.min(1,waveT*1.6)*pulse;
    ctx.font=`${Math.round(22*unit+9)}px 'Press Start 2P'`;
    ctx.strokeStyle='#0B0E1A'; ctx.lineWidth=Math.max(5,8*unit);
    ctx.strokeText('WAVE '+level+' INCOMING',W/2,H*0.42);
    ctx.fillStyle='#3DF5FF';
    ctx.shadowColor='rgba(61,245,255,0.9)'; ctx.shadowBlur=26*unit;
    ctx.fillText('WAVE '+level+' INCOMING',W/2,H*0.42);
    ctx.shadowBlur=0;
    ctx.font=`${Math.round(34*unit+12)}px 'Press Start 2P'`;
    ctx.fillStyle='#FFD028';
    ctx.strokeText(Math.ceil(waveT),W/2,H*0.42+52*unit+22);
    ctx.fillText(Math.ceil(waveT),W/2,H*0.42+52*unit+22);
    ctx.restore();
    ctx.textBaseline='alphabetic';
  }

  /* ---- zap flash ---- */
  if(flashT>0){
    flashT-=dt;
    ctx.fillStyle=`rgba(255,255,255,${flashT*2.2})`;
    ctx.fillRect(0,0,W,H);
  }

  /* ---- ambient buzz volume ~ nearest mosquito to any racquet or center ---- */
  if(AC&&buzzGain){
    let near=1e9;
    const cx=activeR.length?activeR[0].hx:W/2, cy=activeR.length?activeR[0].hy:H/2;
    for(const m of mosquitoes){
      near=Math.min(near,Math.hypot(m.x-cx,m.y-cy));
    }
    const vol=mosquitoes.length&&!paused ? Math.min(0.12, 0.02+ (1-Math.min(1,near/(W*0.6)))*0.12) : 0;
    buzzGain.gain.setTargetAtTime(vol,AC.currentTime,0.15);
    buzzOsc.frequency.setTargetAtTime(480+level*18,AC.currentTime,0.3);
  }
}
paintBests();   // show stored records on first paint

let flashT=0;
let DEBUG=false;

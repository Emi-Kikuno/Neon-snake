/* ==========================================================================
   Neon Snake — COMPLETE game.js (local, no modules)
   Includes:
   - Difficulty presets via window.DIFFICULTIES (easy/normal/hard)
   - Time bonus per correct, time penalty on wrong
   - Auto-promotion (25 -> normal, 50 -> hard)
   ======================================================================= */

/* -------------------------------
   0) CONFIG & DIFFICULTY PLUMBING
----------------------------------*/

// Read mode from URL (?mode=easy|normal|hard)
const qs = new URLSearchParams(location.search);
const initialMode = qs.get('mode') || 'normal';

// Fallback difficulty table if file missing
if (!window.DIFFICULTIES) {
  window.DIFFICULTIES = {
    easy:   { TIMER_START:35, WRONG_PENALTY:0.08, CHALLENGE_REWARD:0.35, TIME_BONUS_PER_CORRECT:2, TIME_PENALTY_WRONG:0, S0:240, SPEED_PER_CHALLENGE:10, DRIFT_AMP_MIN:8,  DRIFT_AMP_MAX:16, DRIFT_SPEED_MIN:0.35, DRIFT_SPEED_MAX:0.75, DRIFT_RAMP_CHALLENGES:14 },
    normal: { TIMER_START:30, WRONG_PENALTY:0.10, CHALLENGE_REWARD:0.30, TIME_BONUS_PER_CORRECT:1, TIME_PENALTY_WRONG:0, S0:270, SPEED_PER_CHALLENGE:12, DRIFT_AMP_MIN:15, DRIFT_AMP_MAX:25, DRIFT_SPEED_MIN:0.75, DRIFT_SPEED_MAX:1.50, DRIFT_RAMP_CHALLENGES:10 },
    hard:   { TIMER_START:25, WRONG_PENALTY:0.12, CHALLENGE_REWARD:0.28, TIME_BONUS_PER_CORRECT:0, TIME_PENALTY_WRONG:3, S0:290, SPEED_PER_CHALLENGE:14, DRIFT_AMP_MIN:18, DRIFT_AMP_MAX:28, DRIFT_SPEED_MIN:0.85, DRIFT_SPEED_MAX:1.70, DRIFT_RAMP_CHALLENGES:10 }
  };
}
let CURRENT = window.DIFFICULTIES[initialMode] || window.DIFFICULTIES.normal;

let DIFF = {};
let PARAMS = {};
function applyConfig(cfg, modeName){
  // ===== existing config build (same as before) =====
  DIFF = {
    AUTO_MIN: 0.30,
    AUTO_MAX: 0.90,
    AUTO_RAMP_CHALLENGES: 16,
    DRIFT_AMP_MIN: cfg.DRIFT_AMP_MIN,
    DRIFT_AMP_MAX: cfg.DRIFT_AMP_MAX,
    DRIFT_SPEED_MIN: cfg.DRIFT_SPEED_MIN,
    DRIFT_SPEED_MAX: cfg.DRIFT_SPEED_MAX,
    DRIFT_RAMP_CHALLENGES: cfg.DRIFT_RAMP_CHALLENGES
  };

  PARAMS = {
    PAD: 6,
    DRIFT_AMP_MAX_FOR_BOUNDS: DIFF.DRIFT_AMP_MAX,
    ATTEMPTS_PER_SPAWN: 120,

    TIMER_START: cfg.TIMER_START,
    WRONG_PENALTY: cfg.WRONG_PENALTY,
    CHALLENGE_REWARD: cfg.CHALLENGE_REWARD,
    TIME_BONUS_PER_CORRECT: cfg.TIME_BONUS_PER_CORRECT,
    TIME_PENALTY_WRONG: cfg.TIME_PENALTY_WRONG,

    PER_CORRECT_GAIN: 0.00,
    MAX_LENGTH_MULT: 1.00,

    S0: cfg.S0,
    SPEED_PER_CHALLENGE: cfg.SPEED_PER_CHALLENGE,

    SEGMENT_SPACING: 6,
    WRONG_GRACE_MS: 300,
    SCORE_PER_CORRECT: 10,
    TAIL_CLEAR_SPAWN: 8,

    TURN_RATE_PASSIVE: Math.PI * 1.0,
    TURN_RATE_ACTIVE:  Math.PI * 2.2,
    TOUCH_DAMP_EASY: 0.80,
    TOUCH_DAMP_HARD: 0.45,
    NEAR_FADE_R_EASY: 18,
    NEAR_FADE_R_HARD: 28,
    FOLLOW_DIST_BOOST: 1/160
  };

  // ===== NEW: set progress bar color by mode =====
  let colorVar = '--progress-easy';
  if (modeName === 'normal') colorVar = '--progress-normal';
  if (modeName === 'hard')   colorVar = '--progress-hard';
  document.documentElement.style.setProperty('--progress-color', `var(${colorVar})`);
}
applyConfig(CURRENT, initialMode);


/* Auto-promotion thresholds */
const PROGRESSION = [
  { mode: 'easy',   until: 15 },
  { mode: 'normal', until: 30 },
  { mode: 'hard',   until: Infinity }
];
function currentModeName(){
  for(const k in window.DIFFICULTIES){ if(window.DIFFICULTIES[k]===CURRENT) return k; }
  return 'normal';
}
function findNextMode(cur){
  const i = PROGRESSION.findIndex(p=>p.mode===cur);
  return PROGRESSION[Math.min(i+1, PROGRESSION.length-1)].mode;
}
function maybePromote(){
  const cur = currentModeName();
  const step = PROGRESSION.find(p=>p.mode===cur) || PROGRESSION[0];
  if (state.totalCompleted >= step.until){
    const next = findNextMode(cur);
    if (next !== cur){
      CURRENT = window.DIFFICULTIES[next];
applyConfig(CURRENT, next);
      state.timeLeft = Math.min(PARAMS.TIMER_START, state.timeLeft);
      showToast(`Difficulty up: ${next[0].toUpperCase()}${next.slice(1)}`);
      // Optional: tint label to new color
      document.getElementById('criteriaLabel')?.style.setProperty('color', '#fff');
    }
  }
}

/* -------------------------------
   1) DOM & CANVAS
----------------------------------*/
const gameEl   = document.getElementById('game');
const exitBtn  = document.getElementById('exitBtn');
const canvas   = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha:false, desynchronized:true });
const homeBtn = document.getElementById('homeBtn');
homeBtn?.addEventListener('click', () => {
  window.location.href = 'index.html';
});
const scoreVal = document.getElementById('scoreVal');
const timeVal  = document.getElementById('timeVal');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const criteriaLabel = document.getElementById('criteriaLabel');

const toastEl   = document.getElementById('toast');
const toastCard = document.getElementById('toastCard');

const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const quitBtn   = document.getElementById('quitBtn');
const closeFileBtn = document.getElementById('closeFileBtn');

const closed = document.getElementById('closed');
const closedRestartBtn   = document.getElementById('closedRestartBtn');
const closedCloseFileBtn = document.getElementById('closedCloseFileBtn');

const gameOver = document.getElementById('gameOver');
const finalScore = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const goCloseBtn = document.getElementById('goCloseBtn');

/* -------------------------------
   2) LAYOUT SAFETY (UI exclusion)
----------------------------------*/
let uiRects = [];
function updateUIRects(){
  uiRects = [];
  if (!gameEl) return;
  const g = gameEl.getBoundingClientRect();
  const pad = 6;
  if (exitBtn && exitBtn.offsetParent !== null){
    const r = exitBtn.getBoundingClientRect();
    uiRects.push({ left:r.left-g.left-pad, top:r.top-g.top-pad, right:r.right-g.left+pad, bottom:r.bottom-g.top+pad });
  }
}
function circleRectEnvelopeOverlaps(cx,cy, R, rect){
  const L=cx-R, Rr=cx+R, T=cy-R, B=cy+R;
  return !(Rr<rect.left || L>rect.right || B<rect.top || T>rect.bottom);
}

/* -------------------------------
   3) CANVAS RESIZE
----------------------------------*/
let DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resizeCanvas(){
  // Measure the visible CSS size of the canvas, not the parent
  const rect = canvas.getBoundingClientRect(); // <— change here
  const w = Math.max(1, Math.round(rect.width  * DPR));
  const h = Math.max(1, Math.round(rect.height * DPR));
  if (canvas.width !== w || canvas.height !== h){
    canvas.width  = w;
    canvas.height = h;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);   // keep drawing coords in CSS px
  }
  updateUIRects();
}
window.addEventListener('resize', ()=>{ resizeCanvas(); computeTargetBubbles(); });
resizeCanvas();

/* -------------------------------
   4) UTILS & CONSTANTS
----------------------------------*/
const RNG = { range:(a,b)=>a+Math.random()*(b-a), pick:a=>a[Math.floor(Math.random()*a.length)] };
const Size   = { SMALL:'small', MEDIUM:'medium', LARGE:'large' };
const Color  = { BLUE:'blue', PINK:'pink', YELLOW:'yellow', GREEN:'green', RED:'red' };
const Symbol = { CIRCLE:'circle', TRIANGLE:'triangle', SQUARE:'square' };
const NEON = {
  [Color.BLUE]:  getComputedStyle(document.documentElement).getPropertyValue('--neon-blue').trim()||'#2dd4ff',
  [Color.PINK]:  getComputedStyle(document.documentElement).getPropertyValue('--neon-pink').trim()||'#ff5bd6',
  [Color.YELLOW]:getComputedStyle(document.documentElement).getPropertyValue('--neon-yellow').trim()||'#ffe55b',
  [Color.GREEN]: getComputedStyle(document.documentElement).getPropertyValue('--neon-green').trim()||'#5bffa3',
  [Color.RED]:   getComputedStyle(document.documentElement).getPropertyValue('--neon-red').trim()||'#ff5b6e',
};
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }
function dist(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return Math.hypot(dx,dy); }
function normalize(vx,vy){ const L=Math.hypot(vx,vy)||1; return {x:vx/L, y:vy/L}; }
function angleOf(vx,vy){ return Math.atan2(vy, vx); }
function rot(vx,vy,ang){ const c=Math.cos(ang), s=Math.sin(ang); return {x:vx*c - vy*s, y:vy*c + vx*s}; }
function shortestAngle(a,b){ let d=b-a; while(d> Math.PI) d-=2*Math.PI; while(d<-Math.PI) d+=2*Math.PI; return d; }
function lerp(a,b,t){ return a + (b-a)*t; }
function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
function ramp01(index, rampCount){ const t = clamp(index / rampCount, 0, 1); return easeOutCubic(t); }
function radiusFor(size){
  const base = Math.min(canvas.width/DPR, canvas.height/DPR);
  const scale = base <= 500 ? 0.8 : base <= 900 ? 1 : 1.2;
  return size===Size.SMALL ? 10*scale : size===Size.MEDIUM ? 16*scale : 23*scale;
}

/* -------------------------------
   5) GAME STATE
----------------------------------*/
const state = {
  running:false, paused:false,
  now:0, dt:0, last:performance.now(),
  timeLeft: PARAMS.TIMER_START,
  score:0, challengeIndex:0,
  totalCompleted:0,
  challenge:{ size:Size.SMALL, color:Color.BLUE, symbol:Symbol.CIRCLE, needed:3, got:0 },
  toast:{ show:false, text:'', hideAt:0 },
  targetBubbles:18,
  snake:{
    segments:[], baseLength:260, length:260, speed:PARAMS.S0,
    heading:{x:0, y:-1},
    dragTarget:null, pointerDown:false,
    wrongGraceUntil:0, flashWrongUntil:0, pulseGoodUntil:0
  },
  bubbles:[],
};
function updateProgress(){
  const pct = Math.round((state.challenge.got / state.challenge.needed) * 100);
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `${pct}%`;
}

/* -------------------------------
   6) BUBBLES (spawn, drift, etc.)
----------------------------------*/
function computeTargetBubbles(){
  const w = canvas.width / DPR, h = canvas.height / DPR;
  const area = w*h, bubbleAreaFactor = 19000;
  state.targetBubbles = clamp(Math.floor(area / bubbleAreaFactor), 14, 28);
}
const randSize  = ()=>RNG.pick([Size.SMALL, Size.MEDIUM, Size.LARGE]);
const randColor = ()=>RNG.pick([Color.BLUE, Color.PINK, Color.YELLOW, Color.GREEN, Color.RED]);
const randSymbol= ()=>RNG.pick([Symbol.CIRCLE, Symbol.TRIANGLE, Symbol.SQUARE]);

function currentDriftParams(){
  const p = ramp01(state.challengeIndex, DIFF.DRIFT_RAMP_CHALLENGES);
  const ampMin = DIFF.DRIFT_AMP_MIN;
  const ampMax = DIFF.DRIFT_AMP_MIN + (DIFF.DRIFT_AMP_MAX - DIFF.DRIFT_AMP_MIN) * p;
  const spdMin = DIFF.DRIFT_SPEED_MIN;
  const spdMax = DIFF.DRIFT_SPEED_MIN + (DIFF.DRIFT_SPEED_MAX - DIFF.DRIFT_SPEED_MIN) * p;
  return { ampMin, ampMax, spdMin, spdMax };
}
function makeDrift(){
  const d = currentDriftParams();
  return { amp:RNG.range(d.ampMin, d.ampMax), speed:RNG.range(d.spdMin, d.spdMax),
           ratio:RNG.pick([1,2/3,3/2]), phaseX:RNG.range(0,2*Math.PI), phaseY:RNG.range(0,2*Math.PI) };
}
function bubbleRuntimePos(b,t){
  const x = b.pos0.x + b.drift.amp * Math.sin(b.drift.speed * t + b.drift.phaseX);
  const y = b.pos0.y + b.drift.amp * Math.sin(b.drift.speed * b.drift.ratio * t + b.drift.phaseY);
  return {x,y};
}
function matchesChallenge(b){
  const c = state.challenge; return (b.size===c.size && b.color===c.color && b.symbol===c.symbol);
}
function aliveBubbles(){ return state.bubbles.filter(b=>b.alive); }

/* placement / overlap safety */
function minDistPointToSegment(px,py, ax,ay, bx,by){
  const ABx=bx-ax, ABy=by-ay, APx=px-ax, APy=py-ay;
  const den = ABx*ABx + ABy*ABy;
  const t = den ? Math.max(0, Math.min(1, (APx*ABx + APy*ABy)/den)) : 0;
  const cx = ax + t*ABx, cy = ay + t*ABy;
  return Math.hypot(px-cx, py-cy);
}
function minDistCircleToPolyline(cx,cy, r, pts){
  let best = Infinity;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1], b=pts[i];
    const d = minDistPointToSegment(cx,cy, a.x,a.y, b.x,b.y);
    if(d<best) best = d;
  }
  return best - r;
}
function marginMaxAmp(){ return DIFF.DRIFT_AMP_MAX; }
function canPlaceAt(x,y,r){
  const margin = marginMaxAmp() + PARAMS.PAD;
  const W = canvas.width/DPR, H = canvas.height/DPR;
  if (x-(r+margin)<0 || x+(r+margin)>W || y-(r+margin)<0 || y+(r+margin)>H) return false;
  for(const b of state.bubbles){
    if(!b.alive) continue;
    const minD = r + b.bboxRadius;
    if (dist(x,y,b.pos0.x,b.pos0.y) < minD) return false;
  }
  if (state.snake.segments.length > 2){
    const tailPts = state.snake.segments.slice(1);
    const clearance = minDistCircleToPolyline(x, y, r + marginMaxAmp(), tailPts);
    if (clearance < PARAMS.TAIL_CLEAR_SPAWN) return false;
  }
  const envelope = r + marginMaxAmp();
  for (const rect of uiRects){
    if (circleRectEnvelopeOverlaps(x, y, envelope, rect)) return false;
  }
  return true;
}
function spawnBubbleWith(size,color,symbol){
  const r = radiusFor(size);
  for(let attempt=0; attempt<PARAMS.ATTEMPTS_PER_SPAWN; attempt++){
    const W = canvas.width/DPR, H = canvas.height/DPR;
    const margin = marginMaxAmp() + PARAMS.PAD;
    const x = RNG.range(r+margin, W - r - margin);
    const y = RNG.range(r+margin, H - r - margin);
    if (canPlaceAt(x,y,r)){
      const drift = makeDrift();
      const b = { size,color,symbol, radius:r, pos0:{x,y}, drift,
                  bboxRadius: r + PARAMS.PAD + marginMaxAmp(), alive:true };
      state.bubbles.push(b);
      return b;
    }
  }
  return null;
}
const spawnRandomBubble = ()=>spawnBubbleWith(randSize(), randColor(), randSymbol());
function countMatches(){ let n=0; for(const b of state.bubbles){ if(b.alive && matchesChallenge(b)) n++; } return n; }

/* -------------------------------
   7) CHALLENGES & TOAST
----------------------------------*/
function setCriteriaLabel(){
  if (!criteriaLabel) return;
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const n = state.challenge.needed || 3;
  const size   = cap(state.challenge.size);
  const color  = cap(state.challenge.color);
  const symbol = cap(state.challenge.symbol);
  const symPlural = symbol.endsWith('s') ? symbol : symbol + 's';
  criteriaLabel.textContent = `Collect ${n} ${size} ${color} ${symPlural}`;
}
function rollChallenge(){
  state.challenge.size   = RNG.pick([Size.SMALL, Size.MEDIUM, Size.LARGE]);
  state.challenge.color  = RNG.pick([Color.BLUE, Color.PINK, Color.YELLOW, Color.GREEN, Color.RED]);
  state.challenge.symbol = RNG.pick([Symbol.CIRCLE, Symbol.TRIANGLE, Symbol.SQUARE]);
  state.challenge.needed = 3;
  state.challenge.got    = 0;
  updateProgress();
  setCriteriaLabel();
}
function showToast(text){
  state.paused = true; state.toast.show = true; state.toast.text = text;
  state.toast.hideAt = performance.now() + 3000;
  toastCard.textContent = text; toastEl.style.display = 'grid';
}
function maybeHideToast(tNow){
  if(state.toast.show && tNow >= state.toast.hideAt){
    state.toast.show = false; state.paused = false; state.timeLeft = PARAMS.TIMER_START;
    toastEl.style.display = 'none';
  }
}
function startChallengeToast(){
  const t = `Collect 3 ${state.challenge.size} ${state.challenge.color} ${state.challenge.symbol}`;
  showToast(t);
}

/* -------------------------------
   8) SNAKE & CONTROLS
----------------------------------*/
function initSnake(){
  const minSide = Math.min(canvas.width/DPR, canvas.height/DPR);
  state.snake.baseLength = clamp(minSide*0.45, 220, 360);
  state.snake.length = state.snake.baseLength;
  state.snake.segments = [];
  const N = Math.ceil(state.snake.length / PARAMS.SEGMENT_SPACING);
  const cx = (canvas.width/DPR)*0.5, cy = (canvas.height/DPR)*0.6;
  for(let i=0;i<N;i++){ state.snake.segments.push({x:cx - i*PARAMS.SEGMENT_SPACING, y:cy}); }
  state.snake.dragTarget = null;
  state.snake.pointerDown = false;
  state.snake.heading = {x:0, y:-1};
}
function currentAutoIntensity(){
  const p = ramp01(state.challengeIndex, DIFF.AUTO_RAMP_CHALLENGES);
  return DIFF.AUTO_MIN + (DIFF.AUTO_MAX - DIFF.AUTO_MIN) * p;
}
function currentTouchDamp(){
  const p = ramp01(state.challengeIndex, DIFF.AUTO_RAMP_CHALLENGES);
  return lerp(PARAMS.TOUCH_DAMP_EASY, PARAMS.TOUCH_DAMP_HARD, p);
}
function currentNearFadeR(){
  const p = ramp01(state.challengeIndex, DIFF.AUTO_RAMP_CHALLENGES);
  return lerp(PARAMS.NEAR_FADE_R_EASY, PARAMS.NEAR_FADE_R_HARD, p);
}
function updateSnake(dt){
  const s = state.snake;
  s.speed = PARAMS.S0 + state.challengeIndex * PARAMS.SPEED_PER_CHALLENGE;

  const head = s.segments[0];
 const { width: W, height: H } = canvas.getBoundingClientRect();

const HEAD_R = 18; // keep the whole head visible on bounce

  let desired = s.heading;
  let distToFinger = Infinity;
  if (s.dragTarget){
    distToFinger = dist(head.x, head.y, s.dragTarget.x, s.dragTarget.y);
    desired = normalize(s.dragTarget.x - head.x, s.dragTarget.y - head.y);
  }

  const baseTurn = s.pointerDown ? PARAMS.TURN_RATE_ACTIVE : PARAMS.TURN_RATE_PASSIVE;
  const boost = 1 + clamp(distToFinger * PARAMS.FOLLOW_DIST_BOOST, 0, 2.5);
  const maxTurn = baseTurn * boost * dt;

  const angCur = angleOf(s.heading.x, s.heading.y);
  const angDes = angleOf(desired.x, desired.y);
  const dAng = shortestAngle(angCur, angDes);
  const turn = clamp(dAng, -maxTurn, maxTurn);
  const r = rot(s.heading.x, s.heading.y, turn);
  s.heading = normalize(r.x, r.y);

  const autoBase = currentAutoIntensity();
  const nearR = currentNearFadeR();
  const nearFade = s.pointerDown ? clamp((distToFinger - nearR) / (nearR*2), 0, 1) : 1;
  const touchDamp = s.pointerDown ? currentTouchDamp() : 1;
  const autoK = (s.pointerDown ? (autoBase * touchDamp * nearFade) : autoBase);

  head.x += s.heading.x * (s.speed * autoK) * dt;
  head.y += s.heading.y * (s.speed * autoK) * dt;

if (head.x < HEAD_R) {
  head.x = HEAD_R;
  s.heading.x = Math.abs(s.heading.x);
} else if (head.x > W - HEAD_R) {
  head.x = W - HEAD_R;
  s.heading.x = -Math.abs(s.heading.x);
}

if (head.y < HEAD_R) {
  head.y = HEAD_R;
  s.heading.y = Math.abs(s.heading.y);
} else if (head.y > H - HEAD_R) {
  head.y = H - HEAD_R;
  s.heading.y = -Math.abs(s.heading.y);
}


  for(let i=1;i<s.segments.length;i++){
    const prev = s.segments[i-1], seg = s.segments[i];
    const vx = prev.x - seg.x, vy = prev.y - seg.y;
    const dd = Math.hypot(vx,vy);
    if(dd>0){
      const want = PARAMS.SEGMENT_SPACING;
      const move = dd - want;
      seg.x += (vx/dd) * move;
      seg.y += (vy/dd) * move;
    }
  }

  const targetCount = Math.max(2, Math.round(s.length / PARAMS.SEGMENT_SPACING));
  if (s.segments.length > targetCount) s.segments.length = targetCount;
  else {
    const last = s.segments[s.segments.length-1];
    while(s.segments.length < targetCount) state.snake.segments.push({x:last.x, y:last.y});
  }
}

/* Input */
function setDrag(x,y){ state.snake.dragTarget = {x,y}; }
function clearDrag(){ state.snake.dragTarget = null; }
gameEl.addEventListener('pointerdown', (e)=>{
  if(e.button===0){
    state.snake.pointerDown = true;
    setDrag(e.offsetX, e.offsetY); // ❌ offsetX/Y can be wrong on mobile
  }
});

gameEl.addEventListener('pointermove', (e)=>{
  if (state.snake.pointerDown || e.buttons===1 || e.pressure>0) {
    setDrag(e.offsetX, e.offsetY); // ❌
  }
});

window.addEventListener('pointerup',   ()=>{ state.snake.pointerDown = false; clearDrag(); });

/* -------------------------------
   9) SEEDING & DENSITY
----------------------------------*/
function seedBoard(){
  computeTargetBubbles();
  function step(){
    let added = 0;
    while (aliveBubbles().length < state.targetBubbles && added < 8){
      spawnRandomBubble(); added++;
    }
    if (aliveBubbles().length < state.targetBubbles) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function maintainDensity(){
  const need = state.targetBubbles - aliveBubbles().length;
  const toAdd = Math.min(need, 2);
  for (let i=0; i<toAdd; i++) spawnRandomBubble();
}

/* -------------------------------
   10) COLLISIONS & RULES
----------------------------------*/
function onCorrectFeedback(x,y){ state.snake.pulseGoodUntil = performance.now() + 180; spawnFloatText(`+${PARAMS.SCORE_PER_CORRECT}`, x, y); }
function onWrongFeedback(){ state.snake.flashWrongUntil = performance.now() + 150; }
function applyWrongPenalty(){
  state.snake.length -= PARAMS.WRONG_PENALTY * state.snake.baseLength;
  if(state.snake.length <= 0){ triggerGameOver('Snake vanished'); }
}
function applyCompletionReward(){
  state.snake.length = Math.min(state.snake.length + PARAMS.CHALLENGE_REWARD * state.snake.baseLength, PARAMS.MAX_LENGTH_MULT * state.snake.baseLength);
}
function collectRadius(b){
  if (b.size === Size.SMALL)   return 1.12 * b.radius;
  if (b.size === Size.MEDIUM)  return 0.92 * b.radius;
  return 0.85 * b.radius;
}

function checkCollisions(){
  const head = state.snake.segments[0];
  const tNow = performance.now();
  for(const b of state.bubbles){
    if(!b.alive) continue;
    const p = bubbleRuntimePos(b, state.now/1000);
    if (dist(head.x,head.y, p.x,p.y) <= collectRadius(b)){
      b.alive = false;
      if (matchesChallenge(b)){
        state.challenge.got++;
        state.score += PARAMS.SCORE_PER_CORRECT;
        scoreVal.textContent = String(state.score);
        updateProgress();
        onCorrectFeedback(p.x,p.y);

        if (PARAMS.TIME_BONUS_PER_CORRECT) {
          state.timeLeft = Math.min(PARAMS.TIMER_START, state.timeLeft + PARAMS.TIME_BONUS_PER_CORRECT);
        }
      }else{
        if (tNow >= state.snake.wrongGraceUntil){
          onWrongFeedback();
          state.snake.wrongGraceUntil = tNow + PARAMS.WRONG_GRACE_MS;
          applyWrongPenalty();
          if (PARAMS.TIME_PENALTY_WRONG) {
            state.timeLeft = Math.max(0, state.timeLeft - PARAMS.TIME_PENALTY_WRONG);
          }
        }
      }
      break;
    }
  }

  if (state.challenge.got >= state.challenge.needed){
    state.totalCompleted++;
    maybePromote();

    for(let i=0;i<3;i++) spawnRandomBubble();
    applyCompletionReward();
    state.challengeIndex++;
    rollChallenge();
    guaranteeThreeMatches();
    startChallengeToast();
  }
}

/* -------------------------------
   11) GAME OVER / EXIT / CLOSE
----------------------------------*/
function openPause(){ state.paused = true; pauseOverlay.style.display = 'grid'; }
function closePause(){ pauseOverlay.style.display = 'none'; state.paused = false; }
resumeBtn?.addEventListener('click', closePause);
quitBtn?.addEventListener('click', ()=>{ closePause(); closeGame(); });
exitBtn?.addEventListener('click', openPause);

function showGameOver(reason){
  state.paused = true; finalScore.textContent = String(state.score);
  document.getElementById('gameOverTitle').textContent = 'Game Over — ' + reason;
  gameOver.style.display = 'grid';
}
function hideGameOver(){ gameOver.style.display = 'none'; }
restartBtn?.addEventListener('click', ()=>{ hideGameOver(); resetGame(); start(); });
goCloseBtn?.addEventListener('click', ()=>{ hideGameOver(); closeGame(); });

function closeGame(){ state.running = false; state.paused = true; closed.style.display = 'grid'; }
closedRestartBtn?.addEventListener('click', ()=>{ closed.style.display = 'none'; resetGame(); start(); });

function attemptCloseFile(){
  window.close();
  setTimeout(()=>{
    if (!document.hidden) {
      document.body.innerHTML = `
        <div style="display:grid;place-items:center;min-height:100vh;background:#000;color:#cfe8ff;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:24px">
          <div style="max-width:600px">
            <div style="font-weight:800;font-size:22px;margin-bottom:10px">Please close this tab</div>
            <div style="opacity:.85;margin-bottom:18px">Your browser blocked automatic tab closing. You can safely close this tab now.</div>
            <button id="fallbackClose" style="padding:10px 14px;border-radius:10px;border:1px solid #272741;background:#121226;color:#cfe8ff;font-weight:700;cursor:pointer">Try Close Again</button>
          </div>
        </div>`;
      document.getElementById('fallbackClose').addEventListener('click', ()=>window.close());
    }
  }, 100);
}
closeFileBtn?.addEventListener('click', attemptCloseFile);
closedCloseFileBtn?.addEventListener('click', attemptCloseFile);

function triggerGameOver(reason){ state.running = false; showGameOver(reason); }

/* -------------------------------
   12) RENDERING
----------------------------------*/
function neonStroke(color, innerWidth, outerWidth){
  ctx.save();
  ctx.globalAlpha = 0.35; ctx.lineWidth = outerWidth; ctx.strokeStyle = color; ctx.stroke();
  ctx.globalAlpha = 1.0;  ctx.lineWidth = innerWidth; ctx.strokeStyle = color; ctx.stroke();
  ctx.restore();
}
function drawBubble(b,t){
  const {x,y} = bubbleRuntimePos(b,t);
  const color = NEON[b.color];
  ctx.beginPath(); ctx.arc(x,y,b.radius,0,Math.PI*2); neonStroke(color, 2, 8);
  ctx.beginPath();
  if (b.symbol === Symbol.CIRCLE){ ctx.arc(x,y,b.radius*0.55,0,Math.PI*2); }
  else if (b.symbol === Symbol.TRIANGLE){
    const r=b.radius*0.70;
    for(let i=0;i<3;i++){
      const ang=-Math.PI/2 + i*(2*Math.PI/3);
      const px=x + r*Math.cos(ang), py=y + r*Math.sin(ang);
      if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
  } else { const r=b.radius*0.75; ctx.rect(x-r, y-r, r*2, r*2); }
  ctx.lineWidth=2; ctx.globalAlpha=1; ctx.strokeStyle=color; ctx.stroke();
}
function drawSnake(renderHead=true){
  const s = state.snake, pts = s.segments; if(pts.length<2) return;
  let snakeColor = NEON[state.challenge.color] || '#cfe8ff';
  const now = performance.now();
  if(now < s.flashWrongUntil) snakeColor = NEON[Color.RED];
  else if(now < s.pulseGoodUntil) snakeColor = NEON[Color.GREEN];
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  neonStroke(snakeColor, 3, 10);
  if(renderHead){
    const head=pts[0];
    ctx.beginPath(); ctx.arc(head.x, head.y, 6, 0, Math.PI*2); neonStroke(snakeColor, 2, 8);
    const sym=state.challenge.symbol, r=8;
    ctx.beginPath();
    if(sym===Symbol.CIRCLE){ ctx.arc(head.x, head.y, r*0.75, 0, Math.PI*2); }
    else if(sym===Symbol.TRIANGLE){
      for(let i=0;i<3;i++){
        const ang=-Math.PI/2 + i*(2*Math.PI/3);
        const px=head.x + r*Math.cos(ang), py=head.y + r*Math.sin(ang);
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
    } else { ctx.rect(head.x - r*0.9, head.y - r*0.9, r*1.8, r*1.8); }
    neonStroke(snakeColor, 2, 6);
  }
}

/* Floating score text */
const floats = [];
function spawnFloatText(text,x,y){ floats.push({text,x,y,vy:-30,life:700, born:performance.now()}); }
function drawFloats(){
  const now = performance.now();
  for(let i=floats.length-1;i>=0;i--){
    const f = floats[i]; const t = now - f.born;
    if(t>f.life){ floats.splice(i,1); continue; }
    const k = t/f.life;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, Segoe UI, Roboto, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y + (f.vy * k)); ctx.restore();
  }
}

/* -------------------------------
   13) PERF GOVERNOR
----------------------------------*/
let perfSamples=[]; let perfMode="high";
function setPerfModeLow(){ if (perfMode==="low") return; perfMode="low"; DPR=1; resizeCanvas(); state.targetBubbles=Math.floor(state.targetBubbles*0.8); }
function monitorPerfAndAdjust(dt){
  perfSamples.push(dt); if (perfSamples.length>60) perfSamples.shift();
  const avg = perfSamples.reduce((a,b)=>a+b,0)/perfSamples.length;
  if (avg > 0.022) setPerfModeLow();
}

/* -------------------------------
   14) MAIN LOOP
----------------------------------*/
function update(dt){
  if(state.paused) return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0){ state.timeLeft = 0; timeVal.textContent = '0'; triggerGameOver('Time up'); return; }
  timeVal.textContent = Math.ceil(state.timeLeft).toString();
  maintainDensity(); updateSnake(dt); checkCollisions();
}
function render(){
 const { width: W, height: H } = canvas.getBoundingClientRect();
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, W, H);
   
ctx.save();
ctx.strokeStyle = '#ff00ff';
ctx.lineWidth = 1;
ctx.strokeRect(0.5, 0.5, W-1, H-1);
ctx.restore();
  drawSnake(false);
  for(const b of state.bubbles){ if(b.alive) drawBubble(b, state.now/1000); }
  drawSnake(true); drawFloats();
}
function tick(now){
  if(!state.running) return;
  state.now = now; state.dt = Math.min(0.033, (now - state.last)/1000); state.last = now;
  monitorPerfAndAdjust(state.dt); maybeHideToast(now);
  if(!state.paused) update(state.dt); render();
  requestAnimationFrame(tick);
}

/* -------------------------------
   15) LIFECYCLE
----------------------------------*/
function guaranteeThreeMatches(){
  let needed = 3 - countMatches(), guard = 0;
  while(needed>0 && guard<20){
    const made = spawnBubbleWith(state.challenge.size, state.challenge.color, state.challenge.symbol);
    if(made) needed--; else guard++;
    if(guard>=20 && needed>0){ rollChallenge(); needed = 3 - countMatches(); guard = 0; }
  }
}
function resetGame(){
  state.running=false; state.paused=false; state.score=0; state.challengeIndex=0; state.totalCompleted=0;
  state.timeLeft=PARAMS.TIMER_START;
  scoreVal.textContent='0'; timeVal.textContent=String(PARAMS.TIMER_START);
  state.bubbles=[]; initSnake(); seedBoard(); rollChallenge(); guaranteeThreeMatches(); startChallengeToast();
  updateProgress();

  // Sanity tests (console)
  console.assert(countMatches() >= 3, 'TEST FAIL: need >=3 matching bubbles at start');
  if (exitBtn && exitBtn.offsetParent!==null){
    console.assert(uiRects.length>=0, 'UI exclusion rect missing');
  }
}
function start(){ state.running=true; state.last=performance.now(); requestAnimationFrame(tick); }

/* -------------------------------
   16) QUICK BINDINGS
----------------------------------*/
function closeGame(){ state.running = false; state.paused = true; closed.style.display = 'grid'; }
function hideGameOver(){ gameOver.style.display = 'none'; }

/* Close this file (best effort) */
function attemptCloseFile(){
  window.close();
  setTimeout(()=>{
    if (!document.hidden) {
      document.body.innerHTML = `
        <div style="display:grid;place-items:center;min-height:100vh;background:#000;color:#cfe8ff;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:24px">
          <div style="max-width:600px">
            <div style="font-weight:800;font-size:22px;margin-bottom:10px">Please close this tab</div>
            <div style="opacity:.85;margin-bottom:18px">Your browser blocked automatic tab closing. You can safely close this tab now.</div>
            <button id="fallbackClose" style="padding:10px 14px;border-radius:10px;border:1px solid #272741;background:#121226;color:#cfe8ff;font-weight:700;cursor:pointer">Try Close Again</button>
          </div>
        </div>`;
      document.getElementById('fallbackClose').addEventListener('click', ()=>window.close());
    }
  }, 100);
}
resumeBtn?.addEventListener('click', ()=>{ pauseOverlay.style.display='none'; state.paused=false; });
quitBtn?.addEventListener('click', ()=>{ pauseOverlay.style.display='none'; closeGame(); });
exitBtn?.addEventListener('click', ()=>{ state.paused=true; pauseOverlay.style.display='grid'; });
restartBtn?.addEventListener('click', ()=>{ hideGameOver(); resetGame(); start(); });
goCloseBtn?.addEventListener('click', ()=>{ hideGameOver(); closeGame(); });
closeFileBtn?.addEventListener('click', attemptCloseFile);
closedRestartBtn?.addEventListener('click', ()=>{ closed.style.display='none'; resetGame(); start(); });
closedCloseFileBtn?.addEventListener('click', attemptCloseFile);

/* -------------------------------
   17) FLOATING TEXT
----------------------------------*/
// (already declared above — functions used in rendering)

/* -------------------------------
   BOOT
----------------------------------*/
resetGame();
start();






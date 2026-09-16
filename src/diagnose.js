// Epoch[] -> Finding[]. 파싱하지 않는다. 임계값은 전부 thresholds.js에서 온다.
import { T, SEVERITY, ACTIONS, FINDING_ORDER } from './thresholds.js';
import { lastRun } from './parse.js';

function finding(code, epoch, detail) {
  return { code, severity: SEVERITY[code], evidence: { epoch, detail }, action: ACTIONS[code] };
}

// 해당 metric이 있는 epoch만 { epoch, v }로 뽑는다. 없는 키는 건너뛴다 — 없는 근거로 말하지 않는다.
function series(epochs, name) {
  return epochs.filter((e) => name in e.metrics).map((e) => ({ epoch: e.epoch, v: e.metrics[name] }));
}

const finite = (s) => s.filter((p) => Number.isFinite(p.v));

function argmin(s) {
  let best = 0;
  s.forEach((p, i) => { if (p.v < s[best].v) best = i; });
  return best;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function absDeltas(s) {
  return s.slice(1).map((p, i) => Math.abs(p.v - s[i].v));
}

// --- 규칙 ---

function divergence(epochs) {
  const s = series(epochs, 'loss');
  for (let i = 0; i < s.length; i++) {
    if (!Number.isFinite(s[i].v)) {
      return finding('DIVERGENCE', s[i].epoch, `loss가 epoch ${s[i].epoch}에서 ${s[i].v}`);
    }
    const prev = s[i - 1];
    if (prev !== undefined && Number.isFinite(prev.v) && prev.v > 0 && s[i].v >= prev.v * T.DIVERGE_FACTOR) {
      return finding(
        'DIVERGENCE',
        s[i].epoch,
        `loss가 epoch ${prev.epoch}(${prev.v}) → epoch ${s[i].epoch}(${s[i].v})로 ${T.DIVERGE_FACTOR}배 이상 증가`,
      );
    }
  }
  return null;
}

function overfitting(epochs) {
  // gap(val_loss - loss) 판정이 필요하므로 둘 다 유한수인 epoch만 본다
  const both = epochs
    .filter((e) => Number.isFinite(e.metrics.val_loss) && Number.isFinite(e.metrics.loss))
    .map((e) => ({ epoch: e.epoch, v: e.metrics.val_loss, gap: e.metrics.val_loss - e.metrics.loss }));
  if (both.length === 0) return null;

  const lo = argmin(both);
  const end = lo + T.OVERFIT_RISE;
  if (end >= both.length) return null;
  for (let i = lo; i < end; i++) {
    if (!(both[i + 1].v > both[i].v)) return null;
    if (!(both[i + 1].gap > both[i].gap)) return null;
  }
  return finding(
    'OVERFITTING',
    both[lo].epoch,
    `val_loss가 epoch ${both[lo].epoch}(${both[lo].v}) 이후 ${T.OVERFIT_RISE}회 연속 상승, 마지막 ${both[end].v}`,
  );
}

function underfitting(epochs) {
  const s = finite(series(epochs, 'loss'));
  if (s.length < T.TAIL) return null;
  const tail = s.slice(-T.TAIL);
  const head = tail[0].v;
  const last = tail[tail.length - 1].v;
  const improved = head === 0 ? 0 : (head - last) / Math.abs(head);
  if (!(improved < T.FLAT_PCT)) return null;
  if (!(last >= s[0].v * T.HIGH_PCT)) return null;
  return finding(
    'UNDERFITTING',
    tail[tail.length - 1].epoch,
    `마지막 ${T.TAIL} epoch에서 loss가 ${head} → ${last}로 거의 줄지 않았고, run 첫 loss ${s[0].v}보다 여전히 높다`,
  );
}

function plateau(epochs) {
  const s = finite(series(epochs, 'val_loss'));
  if (s.length === 0) return null;
  const lo = argmin(s);
  const stuck = s.length - 1 - lo;
  if (stuck < T.PLATEAU_N) return null;
  return finding(
    'PLATEAU',
    s[lo].epoch,
    `val_loss 최저 ${s[lo].v}(epoch ${s[lo].epoch}) 이후 ${stuck} epoch 동안 갱신 실패, 마지막 ${s[s.length - 1].v}`,
  );
}

function noisyVal(epochs) {
  const v = finite(series(epochs, 'val_loss'));
  const l = finite(series(epochs, 'loss'));
  const dv = absDeltas(v);
  const dl = absDeltas(l);
  if (dv.length === 0 || dl.length === 0) return null;
  const mv = median(dv);
  const ml = median(dl);
  if (!(mv > 0)) return null; // 둘 다 멈춰 있으면 시끄러운 게 아니다
  if (!(mv >= ml * T.NOISE_FACTOR)) return null;
  return finding(
    'NOISY_VAL',
    v[v.length - 1].epoch,
    `|Δval_loss| 중앙값 ${mv}가 |Δloss| 중앙값 ${ml}의 ${T.NOISE_FACTOR}배 이상`,
  );
}

const RULES = { OVERFITTING: overfitting, UNDERFITTING: underfitting, PLATEAU: plateau, NOISY_VAL: noisyVal };

export function diagnose(epochs) {
  const run = lastRun(epochs);
  if (run.length < T.MIN_EPOCHS) {
    return [finding('TOO_FEW_EPOCHS', run.length === 0 ? 0 : run[run.length - 1].epoch,
      `마지막 run의 epoch이 ${run.length}개로 ${T.MIN_EPOCHS}개에 못 미친다`)];
  }

  const diverged = divergence(run);
  if (diverged) return [diverged];

  const found = FINDING_ORDER.map((code) => RULES[code](run)).filter((f) => f !== null);
  // 최저점 갱신 실패는 과적합의 부분집합이다 — 둘 다 나오면 PLATEAU를 접는다
  const overfit = found.some((f) => f.code === 'OVERFITTING');
  return found.filter((f) => !(overfit && f.code === 'PLATEAU'));
}

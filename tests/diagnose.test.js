import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/diagnose.js';
import { SEVERITY, ACTIONS } from '../src/thresholds.js';

// loss/val 배열 -> Epoch[]. val이 undefined면 키 자체를 넣지 않는다(PRD: null 금지).
function mk(loss, val, run = 0) {
  return loss.map((l, i) => {
    const metrics = { loss: l };
    if (val && val[i] !== undefined) metrics.val_loss = val[i];
    return { epoch: i + 1, run, metrics };
  });
}

const codes = (findings) => findings.map((f) => f.code);

// --- 6종 각각의 최소 로그 ---

test('epoch이 모자라면 TOO_FEW_EPOCHS', () => {
  const f = diagnose(mk([0.9, 0.7, 0.5], [0.95, 0.8, 0.6]));
  assert.deepEqual(codes(f), ['TOO_FEW_EPOCHS']);
  assert.equal(f[0].severity, SEVERITY.TOO_FEW_EPOCHS);
  assert.equal(f[0].action, ACTIONS.TOO_FEW_EPOCHS);
});

test('epoch 0개도 TOO_FEW_EPOCHS', () => {
  assert.deepEqual(codes(diagnose([])), ['TOO_FEW_EPOCHS']);
});

test('loss가 10배 이상 뛰면 DIVERGENCE', () => {
  const f = diagnose(mk([0.9, 0.8, 0.7, 0.6, 0.5, 50]));
  assert.deepEqual(codes(f), ['DIVERGENCE']);
  assert.equal(f[0].evidence.epoch, 6);
  assert.equal(f[0].severity, SEVERITY.DIVERGENCE);
  assert.equal(f[0].action, ACTIONS.DIVERGENCE);
});

test('loss가 NaN이면 DIVERGENCE', () => {
  const f = diagnose(mk([0.9, 0.8, 0.7, 0.6, 0.5, NaN]));
  assert.deepEqual(codes(f), ['DIVERGENCE']);
  assert.equal(f[0].evidence.epoch, 6);
});

test('loss가 Infinity여도 DIVERGENCE', () => {
  assert.deepEqual(codes(diagnose(mk([0.9, 0.8, 0.7, 0.6, Infinity]))), ['DIVERGENCE']);
});

test('val_loss 최저점 이후 3회 연속 상승 + gap 단조증가면 OVERFITTING', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15],
    [0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.75],
  ));
  assert.deepEqual(codes(f), ['OVERFITTING']);
  assert.equal(f[0].evidence.epoch, 4); // val_loss 최저 epoch
  assert.equal(f[0].severity, SEVERITY.OVERFITTING);
  assert.equal(f[0].action, ACTIONS.OVERFITTING);
});

test('loss가 평평하고 여전히 높으면 UNDERFITTING', () => {
  const f = diagnose(mk([0.7, 0.699, 0.6985, 0.698, 0.6975, 0.697]));
  assert.deepEqual(codes(f), ['UNDERFITTING']);
  assert.equal(f[0].severity, SEVERITY.UNDERFITTING);
  assert.equal(f[0].action, ACTIONS.UNDERFITTING);
});

test('val_loss가 5 epoch 연속 최저점을 못 넘기면 PLATEAU', () => {
  const f = diagnose(mk(
    [0.5, 0.4, 0.35, 0.3, 0.26, 0.22, 0.19, 0.16],
    [0.5, 0.4, 0.42, 0.41, 0.43, 0.42, 0.44, 0.43],
  ));
  assert.deepEqual(codes(f), ['PLATEAU']);
  assert.equal(f[0].evidence.epoch, 2); // 최저점 epoch
  assert.equal(f[0].severity, SEVERITY.PLATEAU);
  assert.equal(f[0].action, ACTIONS.PLATEAU);
});

test('val 변동이 train의 3배 이상이면 NOISY_VAL', () => {
  const f = diagnose(mk(
    [0.5, 0.49, 0.48, 0.47, 0.46, 0.45],
    [0.9, 0.6, 0.9, 0.6, 0.9, 0.6],
  ));
  assert.deepEqual(codes(f), ['NOISY_VAL']);
  assert.equal(f[0].severity, SEVERITY.NOISY_VAL);
  assert.equal(f[0].action, ACTIONS.NOISY_VAL);
});

// --- 상호배제 3종 ---

test('epoch 부족 + 발산 → TOO_FEW_EPOCHS만', () => {
  assert.deepEqual(codes(diagnose(mk([0.9, 0.8, NaN]))), ['TOO_FEW_EPOCHS']);
});

test('발산 + 과적합 → DIVERGENCE만', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15, 100],
    [0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.75, 0.9],
  ));
  assert.deepEqual(codes(f), ['DIVERGENCE']);
});

test('과적합 + 정체 → PLATEAU는 빠진다', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1],
    [0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  ));
  assert.ok(codes(f).includes('OVERFITTING'));
  assert.ok(!codes(f).includes('PLATEAU'));
});

// --- 근거 없으면 생략 ---

test('val_loss가 없으면 val 기반 3종은 나오지 않는다', () => {
  const f = diagnose(mk([0.7, 0.699, 0.6985, 0.698, 0.6975, 0.697]));
  for (const c of ['OVERFITTING', 'PLATEAU', 'NOISY_VAL']) {
    assert.ok(!codes(f).includes(c), `${c}가 나오면 안 된다`);
  }
});

test('정상적으로 감소하는 곡선은 빈 배열', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.55, 0.45, 0.38, 0.32, 0.27],
    [0.95, 0.75, 0.6, 0.5, 0.42, 0.36, 0.31],
  ));
  assert.deepEqual(f, []);
});

// --- 임계 경계: OVERFIT_RISE 양옆 ---

test('연속 상승이 정확히 3이면 OVERFITTING 성립', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15],
    [0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.75],
  ));
  assert.ok(codes(f).includes('OVERFITTING'));
});

test('연속 상승이 2면 OVERFITTING 불성립', () => {
  const f = diagnose(mk(
    [0.9, 0.7, 0.5, 0.4, 0.3, 0.2],
    [0.9, 0.7, 0.5, 0.45, 0.5, 0.6],
  ));
  assert.deepEqual(f, []);
});

// --- 계약 ---

test('마지막 run만 본다', () => {
  const old = mk([0.9, 0.8, 0.7, 0.6, NaN], null, 0);
  const recent = mk([0.9, 0.7, 0.55, 0.45, 0.38, 0.32, 0.27], null, 1);
  assert.deepEqual(diagnose([...old, ...recent]), []);
});

test('입력 배열을 변형하지 않는다', () => {
  const epochs = mk([0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15], [0.9, 0.7, 0.5, 0.45, 0.5, 0.6, 0.75]);
  const before = JSON.stringify(epochs);
  diagnose(epochs);
  assert.equal(JSON.stringify(epochs), before);
});

test('evidence.detail에 숫자가 들어간다', () => {
  const f = diagnose(mk([0.9, 0.8, 0.7, 0.6, 0.5, 50]));
  assert.match(f[0].evidence.detail, /\d/);
});

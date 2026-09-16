import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, lastRun } from '../src/parse.js';

// --- 포맷 3종 정상 ---

test('keras 포맷을 읽는다', () => {
  const r = parseLog([
    'Epoch 1/3 - loss: 0.9 - val_loss: 0.95',
    'Epoch 2/3 - loss: 0.7 - val_loss: 0.80',
    'Epoch 3/3 - loss: 0.5 - val_loss: 0.70',
  ].join('\n'));
  assert.equal(r.format, 'keras');
  assert.equal(r.epochs.length, 3);
  assert.equal(r.epochs[0].epoch, 1);
  assert.equal(r.epochs[2].metrics.val_loss, 0.7);
});

test('keras 포맷에서 metric이 다음 줄에 와도 읽는다', () => {
  const r = parseLog('Epoch 1/2\n  loss: 0.9 - val_loss: 0.95\nEpoch 2/2\n  loss: 0.4 - val_loss: 0.5');
  assert.equal(r.epochs.length, 2);
  assert.equal(r.epochs[1].metrics.loss, 0.4);
});

test('csv 포맷을 읽는다', () => {
  const r = parseLog('epoch,loss,val_loss\n1,0.9,0.95\n2,0.6,0.70');
  assert.equal(r.format, 'csv');
  assert.equal(r.epochs.length, 2);
  assert.equal(r.epochs[1].epoch, 2);
  assert.equal(r.epochs[1].metrics.loss, 0.6);
});

test('csv에 epoch 컬럼이 없으면 행 순서를 쓴다', () => {
  const r = parseLog('loss,val_loss\n0.9,0.95\n0.6,0.70');
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.epochs.map((e) => e.epoch), [0, 1]);
});

test('kv 포맷을 읽는다', () => {
  const r = parseLog('epoch=1 loss=0.9 val_loss=0.95\nepoch=2 loss=0.6 val_loss=0.70');
  assert.equal(r.format, 'kv');
  assert.equal(r.epochs.length, 2);
  assert.equal(r.epochs[0].metrics.val_loss, 0.95);
});

// --- Edge (PRD Edge 절 각 항목) ---

test('지수표기와 nan/inf를 읽고 NaN/Infinity를 그대로 담는다', () => {
  const r = parseLog([
    'epoch=1 loss=1e-05 val_loss=1.2E+3',
    'epoch=2 loss=nan val_loss=inf',
    'epoch=3 loss=-inf val_loss=NaN',
  ].join('\n'));
  assert.equal(r.epochs[0].metrics.loss, 1e-5);
  assert.equal(r.epochs[0].metrics.val_loss, 1200);
  assert.ok(Number.isNaN(r.epochs[1].metrics.loss));
  assert.equal(r.epochs[1].metrics.val_loss, Infinity);
  assert.equal(r.epochs[2].metrics.loss, -Infinity);
  assert.ok(Number.isNaN(r.epochs[2].metrics.val_loss));
});

test('숫자로 못 읽는 값은 키 자체를 넣지 않는다', () => {
  const r = parseLog('epoch=1 loss=0.5 mode=train\nepoch=2 loss=0.4 mode=train');
  assert.equal(r.epochs[0].metrics.loss, 0.5);
  assert.ok(!('mode' in r.epochs[0].metrics));
});

test('epoch 번호가 작아지면 새 run으로 나눈다', () => {
  const r = parseLog('epoch=1 loss=0.9\nepoch=2 loss=0.8\nepoch=1 loss=0.7\nepoch=2 loss=0.6');
  assert.deepEqual(r.epochs.map((e) => e.run), [0, 0, 1, 1]);
});

test('같은 run에서 epoch이 중복되면 나중 값이 이긴다', () => {
  const r = parseLog('epoch=1 loss=0.9\nepoch=1 loss=0.5\nepoch=2 loss=0.4');
  assert.equal(r.epochs.length, 2);
  assert.equal(r.epochs[0].metrics.loss, 0.5);
});

test('건너뛴 epoch을 보간하지 않는다', () => {
  const r = parseLog('epoch=3 loss=0.9\nepoch=7 loss=0.5');
  assert.deepEqual(r.epochs.map((e) => e.epoch), [3, 7]);
});

test('metric 이름 변형을 val_loss 하나로 정규화한다', () => {
  for (const name of ['val_loss', 'valid_loss', 'val loss', 'vl', 'val-loss']) {
    const r = parseLog(`epoch=1 loss=0.9 ${name}=0.95\nepoch=2 loss=0.8 ${name}=0.9`);
    assert.equal(r.epochs[0].metrics.val_loss, 0.95, `${name} 정규화 실패`);
  }
});

test('해석 불가 줄은 건너뛰고 개수만 센다', () => {
  const r = parseLog([
    'epoch=1 loss=0.9',
    '████████ 100% [00:03<00:00]',
    'WARNING: something happened',
    'epoch=2 loss=0.8',
  ].join('\n'));
  assert.equal(r.epochs.length, 2);
  assert.equal(r.skipped, 2);
});

test('아무것도 못 읽으면 unknown에 빈 배열이다', () => {
  const r = parseLog('hello\nworld');
  assert.equal(r.format, 'unknown');
  assert.deepEqual(r.epochs, []);
  assert.equal(r.skipped, 2);
});

test('빈 입력과 쓰레기 입력에 예외를 던지지 않는다', () => {
  for (const input of ['', '   ', '\n\n', '@#$%^&*']) {
    const r = parseLog(input);
    assert.equal(r.format, 'unknown');
    assert.deepEqual(r.epochs, []);
  }
});

test('epoch 상한을 넘으면 앞에서 자르고 truncated를 세운다', () => {
  const lines = [];
  for (let i = 1; i <= 10050; i++) lines.push(`epoch=${i} loss=0.5`);
  const r = parseLog(lines.join('\n'));
  assert.equal(r.epochs.length, 10000);
  assert.equal(r.truncated, true);
});

test('정상 입력에서는 truncated가 false다', () => {
  const r = parseLog('epoch=1 loss=0.9\nepoch=2 loss=0.8');
  assert.equal(r.truncated, false);
});

test('입력 문자열을 변형하지 않는다', () => {
  const text = 'epoch=1 loss=0.9';
  parseLog(text);
  assert.equal(text, 'epoch=1 loss=0.9');
});

// --- lastRun ---

test('run이 하나면 전체를 반환한다', () => {
  const r = parseLog('epoch=1 loss=0.9\nepoch=2 loss=0.8');
  assert.equal(lastRun(r.epochs).length, 2);
});

test('run이 여럿이면 마지막 run만 순서대로 반환한다', () => {
  const r = parseLog('epoch=1 loss=0.9\nepoch=1 loss=0.8\nepoch=2 loss=0.7\nepoch=1 loss=0.6');
  const last = lastRun(r.epochs);
  assert.equal(last.length, 1);
  assert.equal(last[0].metrics.loss, 0.6);
  assert.equal(last[0].run, 1); // epoch 1,1,2,1 -> 중복 1,1은 같은 run이라 run은 0과 1 둘뿐
});

test('빈 배열에 lastRun을 불러도 빈 배열이다', () => {
  assert.deepEqual(lastRun([]), []);
});

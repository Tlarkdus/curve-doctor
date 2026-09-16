import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDING_CODES, T, SEVERITY, ACTIONS, FINDING_ORDER } from '../src/thresholds.js';

test('SEVERITY와 ACTIONS가 6개 code를 빠짐없이 덮는다', () => {
  const codes = [...FINDING_CODES].sort();
  assert.deepEqual(Object.keys(SEVERITY).sort(), codes);
  assert.deepEqual(Object.keys(ACTIONS).sort(), codes);
});

test('ACTIONS에 빈 문자열이 없다', () => {
  for (const [code, action] of Object.entries(ACTIONS)) {
    assert.ok(action.trim().length > 0, `${code}의 action이 비어 있다`);
  }
});

test('FINDING_ORDER는 FINDING_CODES의 부분집합이고 단독 반환 2종을 뺀다', () => {
  for (const code of FINDING_ORDER) {
    assert.ok(FINDING_CODES.includes(code), `${code}가 FINDING_CODES에 없다`);
  }
  assert.ok(!FINDING_ORDER.includes('TOO_FEW_EPOCHS'));
  assert.ok(!FINDING_ORDER.includes('DIVERGENCE'));
});

test('임계값이 전부 유한수다', () => {
  for (const [name, value] of Object.entries(T)) {
    assert.ok(Number.isFinite(value), `T.${name}이 유한수가 아니다`);
  }
});

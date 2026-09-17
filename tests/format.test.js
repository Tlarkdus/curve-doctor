// toRows는 표 두 장의 셀 문자열만 만든다. 판정도 계산도 하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toRows } from '../src/format.js';
import { parseLog } from '../src/parse.js';
import { diagnose } from '../src/diagnose.js';

const LOG = [
  'epoch=1 loss=1.0 val_loss=1.0',
  'epoch=2 loss=0.9 val_loss=0.9',
  'epoch=3 loss=0.8 val_loss=1.0',
  'epoch=4 loss=0.7 val_loss=1.2',
  'epoch=5 loss=0.6 val_loss=1.5',
  'epoch=6 loss=0.5 val_loss=1.9',
].join('\n');

test('정상: summary는 label/value 쌍, findings는 5열 문자열', () => {
  const parsed = parseLog(LOG);
  const findings = diagnose(parsed.epochs);
  const rows = toRows(parsed, findings);

  assert.ok(rows.summary.length > 0);
  for (const row of rows.summary) {
    assert.equal(row.length, 2);
    row.forEach((cell) => assert.equal(typeof cell, 'string'));
  }
  assert.ok(rows.summary.some(([, v]) => v === 'kv'), '포맷 행이 있어야 한다');

  assert.equal(rows.findings.length, findings.length);
  rows.findings.forEach((row, i) => {
    assert.equal(row.length, 5);
    row.forEach((cell) => assert.equal(typeof cell, 'string'));
    assert.equal(row[1], findings[i].code); // 순서를 유지한다 — 정렬하지 않는다
    assert.equal(row[0], findings[i].severity);
    assert.equal(row[4], findings[i].action);
  });
});

test('빈 findings: 빈 배열을 내고 문구를 지어내지 않는다', () => {
  const parsed = parseLog(LOG);
  const rows = toRows(parsed, []);
  assert.deepEqual(rows.findings, []);
  assert.ok(rows.summary.length > 0);
});

test('truncated: false면 잘림 행이 없다', () => {
  const rows = toRows({ epochs: [], skipped: 0, truncated: false, format: 'unknown' }, []);
  assert.equal(rows.summary.length, 4);
});

test('truncated: true면 잘림 행이 하나 늘어난다', () => {
  const off = toRows({ epochs: [], skipped: 0, truncated: false, format: 'unknown' }, []);
  const on = toRows({ epochs: [], skipped: 0, truncated: true, format: 'unknown' }, []);
  assert.equal(on.summary.length, off.summary.length + 1);
});

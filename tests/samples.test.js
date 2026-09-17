// PRD의 합격선: 샘플 6종에서 의도한 code를 6/6 집어낸다. 파일명이 곧 기대 결과다.
// 파일 읽기는 여기서만 한다 — tests/는 node 전용이어도 된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLog } from '../src/parse.js';
import { diagnose } from '../src/diagnose.js';

const SAMPLES = [
  { file: 'diverge.log', code: 'DIVERGENCE', format: 'keras', alone: true },
  { file: 'overfit.log', code: 'OVERFITTING', format: 'keras', alone: false },
  { file: 'underfit.log', code: 'UNDERFITTING', format: 'csv', alone: false },
  { file: 'plateau.log', code: 'PLATEAU', format: 'csv', alone: false },
  { file: 'noisy.log', code: 'NOISY_VAL', format: 'kv', alone: false },
  { file: 'too-few.log', code: 'TOO_FEW_EPOCHS', format: 'kv', alone: true },
];

function run(file) {
  const text = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
  const parsed = parseLog(text);
  return { parsed, findings: diagnose(parsed.epochs) };
}

for (const sample of SAMPLES) {
  test(`${sample.file} → ${sample.code}`, () => {
    const { parsed, findings } = run(sample.file);
    assert.equal(parsed.format, sample.format);
    assert.ok(parsed.epochs.length > 0, 'epoch을 하나도 읽지 못했다');
    assert.ok(
      findings.some((f) => f.code === sample.code),
      `기대 ${sample.code}, 실제 [${findings.map((f) => f.code).join(', ')}]`,
    );
    if (sample.alone) assert.equal(findings.length, 1, '단독 반환이어야 한다');
  });
}

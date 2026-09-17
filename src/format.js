// ParseResult + Finding[] -> 표 두 장의 셀 문자열. 판정하지 않고 숫자를 다시 만들지 않는다.
import { lastRun } from './parse.js';

const num = (n) => String(n); // toLocaleString 금지 — 로케일에 따라 달라진다

export function toRows(parseResult, findings) {
  const { epochs, skipped, truncated, format } = parseResult;
  const summary = [
    ['포맷', format],
    ['읽은 epoch 수', num(epochs.length)],
    ['마지막 run의 epoch 수', num(lastRun(epochs).length)],
    ['건너뛴 줄 수', num(skipped)],
  ];
  if (truncated) summary.push(['잘림', '입력 상한을 넘어 뒷부분을 잘랐습니다']);

  return {
    summary,
    findings: findings.map((f) => [
      f.severity,
      f.code,
      num(f.evidence.epoch),
      f.evidence.detail,
      f.action,
    ]),
  };
}

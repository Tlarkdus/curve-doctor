// 로그 텍스트 -> Epoch[]. 판정하지 않는다. 어떤 입력에도 예외를 던지지 않는다.
import { T } from './thresholds.js';

const EPOCH_KEYS = ['epoch', 'step', 'iter', 'iteration'];

// 이름 정규화: 소문자 -> 공백·하이픈을 _ -> val_ 계열 통일
function normalizeName(raw) {
  let n = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (n === 'vl') return 'val_loss';
  n = n.replace(/^(valid|vl|v)_/, 'val_');
  return n;
}

// 숫자 파싱. 못 읽으면 undefined (키를 넣지 않기 위해)
function toNumber(raw) {
  const s = String(raw).trim().replace(/[,;]$/, '');
  if (/^[+-]?(nan)$/i.test(s)) return NaN;
  if (/^[+-]?(inf|infinity)$/i.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return undefined;
  const v = Number(s);
  return Number.isNaN(v) ? undefined : v;
}

// "이름: 값" / "이름=값" 쌍을 뽑는다
function extractPairs(line) {
  const pairs = [];
  const re = /([A-Za-z][\w .-]*?)\s*[:=]\s*([+-]?[\w.+-]+)/g;
  let m;
  while ((m = re.exec(line)) !== null) pairs.push([normalizeName(m[1]), m[2]]);
  return pairs;
}

function metricsFromPairs(pairs) {
  const metrics = {};
  for (const [name, raw] of pairs) {
    if (EPOCH_KEYS.includes(name)) continue;
    const v = toNumber(raw);
    if (v !== undefined) metrics[name] = v;
  }
  return metrics;
}

function epochFromPairs(pairs) {
  for (const [name, raw] of pairs) {
    if (EPOCH_KEYS.includes(name)) {
      const v = toNumber(raw);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

// --- 포맷별 리더. 각자 { rows, skipped }를 낸다. rows = { epoch?, metrics } ---

function readKeras(lines) {
  const rows = [];
  let skipped = 0;
  let pending = null; // metric이 다음 줄에 오는 경우
  for (const line of lines) {
    const head = line.match(/^\s*Epoch\s+(\d+)\s*\/\s*\d+/i);
    if (head) {
      const pairs = extractPairs(line.slice(head[0].length));
      const metrics = metricsFromPairs(pairs);
      pending = { epoch: Number(head[1]), metrics };
      rows.push(pending);
      continue;
    }
    const pairs = extractPairs(line);
    const metrics = metricsFromPairs(pairs);
    if (pending && Object.keys(metrics).length > 0) {
      Object.assign(pending.metrics, metrics);
      continue;
    }
    skipped++;
  }
  return { rows: rows.filter((r) => Object.keys(r.metrics).length > 0), skipped };
}

function readCsv(lines) {
  const header = lines[0].split(',').map((c) => normalizeName(c));
  const epochIdx = header.findIndex((h) => EPOCH_KEYS.includes(h));
  const rows = [];
  let skipped = 0;
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(',');
    if (cells.length !== header.length) { skipped++; return; }
    const metrics = {};
    let epoch = epochIdx === -1 ? i : undefined;
    cells.forEach((cell, j) => {
      const v = toNumber(cell);
      if (v === undefined) return;
      if (j === epochIdx) epoch = v;
      else metrics[header[j]] = v;
    });
    if (epoch === undefined || Object.keys(metrics).length === 0) { skipped++; return; }
    rows.push({ epoch, metrics });
  });
  return { rows, skipped };
}

function readKv(lines) {
  const rows = [];
  let skipped = 0;
  for (const line of lines) {
    const pairs = extractPairs(line);
    const metrics = metricsFromPairs(pairs);
    if (pairs.length < 2 || Object.keys(metrics).length === 0) { skipped++; continue; }
    rows.push({ epoch: epochFromPairs(pairs), metrics });
  }
  return { rows, skipped };
}

// --- 포맷 판정: 가장 많이 읽어낸 쪽이 이긴다 ---

function looksCsv(lines) {
  if (lines.length < 2) return false;
  const header = lines[0].split(',');
  if (header.length < 2) return false;
  if (header.some((c) => toNumber(c) !== undefined)) return false; // 헤더가 숫자면 CSV 헤더가 아니다
  return lines.slice(1).some((l) => l.split(',').length === header.length);
}

export function parseLog(text) {
  const source = String(text).slice(0, T.MAX_BYTES);
  const lines = source.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const empty = { epochs: [], skipped: lines.length, truncated: source.length < String(text).length, format: 'unknown' };
  if (lines.length === 0) return { ...empty, skipped: 0 };

  const candidates = [];
  if (looksCsv(lines)) candidates.push(['csv', readCsv(lines)]);
  candidates.push(['keras', readKeras(lines)]);
  candidates.push(['kv', readKv(lines)]);

  let best = null;
  for (const [format, result] of candidates) {
    if (result.rows.length === 0) continue;
    if (best === null || result.rows.length > best[1].rows.length) best = [format, result];
  }
  if (best === null) return empty;

  const [format, { rows, skipped }] = best;

  // run 분리 + 같은 run 안 중복은 나중 값이 이긴다
  const epochs = [];
  let run = 0;
  let prevEpoch = null;
  for (const row of rows) {
    const epoch = row.epoch === undefined ? (prevEpoch === null ? 0 : prevEpoch + 1) : row.epoch;
    if (prevEpoch !== null && epoch < prevEpoch) run++;
    const dup = epochs.findIndex((e) => e.run === run && e.epoch === epoch);
    if (dup !== -1) epochs[dup] = { epoch, run, metrics: row.metrics };
    else epochs.push({ epoch, run, metrics: row.metrics });
    prevEpoch = epoch;
  }

  const truncated = source.length < String(text).length || epochs.length > T.MAX_EPOCHS;
  return { epochs: epochs.slice(0, T.MAX_EPOCHS), skipped, truncated, format };
}

export function lastRun(epochs) {
  if (epochs.length === 0) return [];
  const max = epochs.reduce((m, e) => (e.run > m ? e.run : m), 0);
  return epochs.filter((e) => e.run === max);
}

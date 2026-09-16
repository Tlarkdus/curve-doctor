# design.md — curve-doctor 구조

명세는 `docs/PRD.md`. 이 문서는 **어디에 무엇을 두는가**만 정한다.

## 데이터 흐름

```
붙여넣은 텍스트
   │
   ▼  parseLog()            src/parse.js
{ epochs, skipped, truncated, format }
   │
   ▼  lastRun()             src/parse.js  (epochs → 마지막 run만)
Epoch[]
   │
   ▼  diagnose()            src/diagnose.js  (임계값은 src/thresholds.js에서만)
Finding[]
   │
   ▼  render                index.html (표 2장: 파싱 요약 · 진단 목록)
```

한 방향이다. 되돌아오는 화살표가 없다 — `diagnose`는 원문 텍스트를 보지 않고, `parseLog`는 진단을 모른다.

## 파일과 책임

| 파일 | 책임 | 하지 않는 것 |
|---|---|---|
| `src/thresholds.js` | 임계값 상수 + `ACTIONS` + `FINDING_ORDER` | 로직 없음. 순수 데이터 |
| `src/parse.js` | 텍스트 → `ParseResult`, `lastRun(epochs)` | 판정하지 않는다. 예외를 던지지 않는다 |
| `src/diagnose.js` | `Epoch[]` → `Finding[]` | 파싱하지 않는다. 숫자 상수를 직접 쓰지 않는다 |
| `index.html` | 입력 받기, 두 함수 호출, 표 그리기 | 계산하지 않는다. 판정 문구를 만들지 않는다 |
| `tests/*.test.js` | `node --test` | — |

**왜 셋으로 나누나**: 임계값을 바꾸는 일(`thresholds.js`)과 포맷을 하나 더 지원하는 일(`parse.js`)과
규칙을 하나 더 넣는 일(`diagnose.js`)이 서로 다른 시점에 오기 때문이다. 그보다 더 쪼개지 않는다.

## 모듈 계약

- `src/`의 모든 파일은 **순수 ESM**이다. `import`는 같은 `src/` 안의 상대경로만 허용한다.
  node 내장 모듈(`node:fs`, `node:path` 등)을 `src/`에서 import하면 UI가 깨진다 — `index.html`이
  번들 없이 같은 파일을 그대로 `<script type="module">`로 읽기 때문이다.
- 함수는 입력을 변형하지 않는다(`epochs`를 정렬·수정하지 않고 새 배열을 만든다).
- 실패는 값으로 표현한다. `parseLog`는 어떤 입력에도 `ParseResult`를 반환한다 — 깨진 줄은
  `skipped`에 세고, 아무것도 못 읽으면 `format: "unknown"`에 빈 배열.
  **예외는 프로그래머 실수(인자 타입 위반)에만 던진다.**

## 테스트 전략

- `tests/parse.test.js` — 포맷 3종 × 정상 1케이스, 엣지 전수(PRD의 Edge 절 각 항목 1케이스 이상)
- `tests/diagnose.test.js` — 진단 6종 각각을 유발하는 **최소 로그**, 상호배제 3케이스, 빈 배열 1케이스
- `tests/samples.test.js` — `tests/fixtures/` 아래 로그 샘플 6종 → 의도한 code가 나오는지.
  PRD의 합격선(6/6)이 이 파일이다

고정 소수점 비교를 하지 않는다 — 임계 경계 테스트는 경계 **양옆 값**으로 쓴다.

## 배포

정적 파일 3종(`index.html` + `src/*.js`)만 올린다. 빌드·서버·환경변수가 없다.
phase 0에서는 배포하지 않는다(범위 밖). 배포한다면 정적 호스팅에 루트를 그대로 올리면 된다.

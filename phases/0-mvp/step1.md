# Step 1: parser

## 읽어야 할 파일

프롬프트 상단에 `CLAUDE.md`와 `docs/` 전문이 주입되어 있다. 추가로 이전 step 산출물을 읽어라:

- `src/thresholds.js` — `T.MAX_EPOCHS`, `T.MAX_BYTES`
- `docs/PRD.md` — **Edge 절 전체**(이 step의 명세다), `ParseResult`·`Epoch` 시그니처
- `docs/design.md` — "실패는 값으로 표현한다" 절

## 작업

로그 텍스트를 epoch 배열로 바꾸는 순수 함수를 만든다. **TDD: 테스트를 먼저 작성하라.**

### 시그니처 — `src/parse.js`

```js
export function parseLog(text) // -> { epochs, skipped, truncated, format }
export function lastRun(epochs) // -> Epoch[]  (가장 큰 run 번호의 epoch만, 입력 순서 유지)
```

### 포맷 3종 판정

줄 단위로 훑어 **가장 많이 매칭된 포맷**을 `format`으로 삼는다. 하나도 못 읽으면
`{ epochs: [], skipped: <비어있지 않은 줄 수>, truncated: false, format: "unknown" }`.

- `keras` — `Epoch 3/50` 로 시작하고 같은 줄 또는 **다음 줄**에 `이름: 값` 쌍이 오는 형태
- `csv` — 첫 유효 줄이 쉼표 구분 헤더이고 숫자 행이 뒤따르는 형태.
  epoch 컬럼 후보는 `epoch`·`step`·`iter`·`iteration`(대소문자 무시), 없으면 행 순서(0부터)
- `kv` — 한 줄에 `이름=값` 또는 `이름: 값` 쌍이 2개 이상

### 반드시 지킬 규칙 (PRD Edge 절)

- metric 이름 정규화: 소문자화 → 공백·하이픈을 `_`로 → `valid_`·`vl_`·`v_` 접두를 `val_`로 통일.
  `val loss`·`valid_loss`·`vl` 은 전부 `val_loss`가 된다
- 값 파싱: `1e-05`, `1.2E+3`, `nan`, `NaN`, `inf`, `-inf`, `Infinity` 를 받는다.
  `NaN`/`±Infinity`는 **그대로 담는다**(발산 판정에 쓰인다). 숫자로 못 읽으면 **키를 넣지 않는다**
- run 분리: epoch 번호가 **직전보다 작아지면** `run`을 1 증가. 같으면 같은 run이고 **나중 값이 이긴다**
- 건너뛴 줄(진행바·경고·스택트레이스·빈 줄 아닌 해석 불가 줄)은 `skipped`에 센다
- `text` 길이가 `T.MAX_BYTES`를 넘거나 epoch이 `T.MAX_EPOCHS`를 넘으면 앞에서부터 자르고 `truncated: true`

### `tests/parse.test.js` (먼저 작성)

PRD Edge 절의 **각 항목마다 최소 1케이스**. 포맷 3종 정상 케이스 3개. `lastRun` 케이스 2개
(run 1개일 때 전체 반환 / run 3개일 때 마지막 것만).

## Acceptance Criteria

```bash
npm test
```

## 검증 절차

1. 위 AC를 실행한다.
2. 체크리스트: `src/parse.js`가 `src/thresholds.js` 외에 아무것도 import하지 않는가 /
   어떤 입력에도 예외를 던지지 않는가(`parseLog("")`, `parseLog("쓰레기")` 확인) /
   입력 문자열을 변형하지 않는가.
3. `phases/0-mvp/index.json`의 step 1을 갱신한다.

## 금지사항

- 진단·판정 로직을 넣지 마라. 이유: `diagnose`가 step 2 담당이다.
- `node:fs` 등 node 내장 모듈을 import하지 마라. 이유: 이 파일은 브라우저에서도 그대로 돈다.
- 깨진 줄에 예외를 던지지 마라. 이유: 로그 한 줄 때문에 전체가 죽으면 도구가 아니다.
- 건너뛴 epoch을 보간하지 마라. 이유: 없는 데이터를 만들어내지 않는다.

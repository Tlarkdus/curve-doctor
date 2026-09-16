# Step 4: format-ui

## 읽어야 할 파일

프롬프트 상단에 `CLAUDE.md`와 `docs/` 전문이 주입되어 있다. 추가로 이전 step 산출물을 읽어라:

- `src/parse.js`, `src/diagnose.js`, `src/thresholds.js` — 반환 형태와 상수
- `docs/design.md` — 데이터 흐름 그림, "index.html은 계산하지 않는다"
- `tests/samples.test.js` — 실제 결과가 어떻게 생겼는지

## 작업

결과를 표로 만드는 **순수 함수**와, 그 함수를 부르는 **정적 화면 한 장**을 만든다.

### 1. `src/format.js` (+ 테스트 먼저)

```js
export function toRows(parseResult, findings)
// -> { summary: [[label, value], ...], findings: [[severity, code, epoch, detail, action], ...] }
```

- `summary`에 담을 것: 포맷, 읽은 epoch 수, 마지막 run의 epoch 수, 건너뛴 줄 수,
  잘림 여부(`truncated`가 false면 이 행을 **넣지 않는다**)
- `findings` 행은 `Finding` 순서를 그대로 유지한다. 정렬하지 마라 — 순서는 `diagnose`가 정했다
- 값은 전부 문자열로 만든다. 숫자 포맷은 여기서만 한다(`toLocaleString` 금지 — 로케일에 따라 달라진다)

`tests/format.test.js`: 정상 1케이스, 빈 findings 1케이스, `truncated` 행 유무 2케이스.

### 2. `index.html`

- `<textarea>` 하나 + 버튼 하나 + 결과 표 두 개. 그게 전부다
- `<script type="module">`에서 `./src/parse.js`·`./src/diagnose.js`·`./src/format.js`를 직접 import
- 버튼을 누르면 `parseLog` → `diagnose` → `toRows` → 표 그리기
- findings가 빈 배열이면 "감지된 문제 없음"을 **화면에서** 표시한다(데이터에는 넣지 않는다)
- 스타일은 `<style>` 블록 안에 최소한으로. CSS 파일·폰트·CDN을 추가하지 마라
- 붙여넣은 로그를 어디에도 저장하거나 전송하지 않는다 — `fetch`·`localStorage` 사용 금지

## Acceptance Criteria

```bash
npm test
```

## 검증 절차

1. 위 AC를 실행한다.
2. `index.html`을 브라우저로 열어 `tests/fixtures/overfit.log` 내용을 붙여넣고
   `OVERFITTING` 행이 나오는지 확인한다.
3. 체크리스트: `index.html`에 계산식이나 판정 문구가 하드코딩돼 있지 않은가 /
   `src/format.js`가 `node:` 모듈을 import하지 않는가.
4. `phases/0-mvp/index.json`의 step 4를 갱신하고, 모든 step이 completed면
   `phases/index.json`의 `0-mvp`를 `completed`로 바꾼다.

## 금지사항

- 프레임워크·번들러·CSS 라이브러리를 추가하지 마라. 이유: `CLAUDE.md` CRITICAL 1.
- `index.html`에서 진단 문구를 만들지 마라. 이유: `ACTIONS`가 단일 출처다.
- `fetch`·`localStorage`·`sessionStorage`를 쓰지 마라. 이유: 입력을 내보내지도 남기지도 않는다.
- 차트를 그리지 마라. 이유: PRD Boundaries에서 명시적으로 제외했다.

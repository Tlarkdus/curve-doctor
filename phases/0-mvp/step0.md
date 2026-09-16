# Step 0: setup-thresholds

## 읽어야 할 파일

프롬프트 상단에 `CLAUDE.md`와 `docs/` 전문이 주입되어 있다. 추가로:

- `docs/PRD.md` — 진단 6종 표, `ACTIONS` 표, 상호배제·순서 규칙
- `docs/design.md` — 파일별 책임 표
- `package.json` — `type: module`, `test` 스크립트 확인

## 작업

임계값과 고정 문자열의 **단일 출처**를 만든다. 로직은 넣지 않는다.

### 1. `src/thresholds.js`

아래를 named export 한다. 값은 PRD의 진단 표와 `ACTIONS` 표에서 그대로 가져온다.

```js
export const FINDING_CODES = ["DIVERGENCE", "OVERFITTING", "UNDERFITTING",
                              "PLATEAU", "NOISY_VAL", "TOO_FEW_EPOCHS"];
export const T = {
  DIVERGE_FACTOR: 10, OVERFIT_RISE: 3, TAIL: 5, FLAT_PCT: 0.01,
  HIGH_PCT: 0.8, PLATEAU_N: 5, NOISE_FACTOR: 3, MIN_EPOCHS: 5,
  MAX_EPOCHS: 10000, MAX_BYTES: 1024 * 1024,
};
export const SEVERITY = { /* code -> "high" | "medium" | "info" */ };
export const ACTIONS  = { /* code -> PRD의 고정 문자열 */ };
export const FINDING_ORDER = ["OVERFITTING", "UNDERFITTING", "PLATEAU", "NOISY_VAL"];
```

`FINDING_ORDER`에 `TOO_FEW_EPOCHS`와 `DIVERGENCE`가 없는 것은 의도다 — 둘은 단독 반환이라
순서에 참여하지 않는다. 그 이유를 파일 주석 한 줄로 남겨라.

### 2. `tests/thresholds.test.js` (먼저 작성)

- `SEVERITY`와 `ACTIONS`가 `FINDING_CODES` 6개를 **빠짐없이** 덮는다 (키 집합 동일)
- `ACTIONS`의 모든 값이 빈 문자열이 아니다
- `FINDING_ORDER`의 모든 항목이 `FINDING_CODES`에 들어 있다

## Acceptance Criteria

```bash
npm test
```

## 검증 절차

1. 위 AC를 실행한다.
2. 체크리스트: `src/thresholds.js`에 `import`가 하나도 없는가 / 함수 정의가 없는가(순수 데이터).
3. `phases/0-mvp/index.json`의 step 0을 갱신한다(성공 시 `summary`에 export 목록).

## 금지사항

- `src/thresholds.js`에서 무엇이든 `import` 하지 마라. 이유: 이 파일은 의존성의 바닥이다.
- 임계값을 계산식으로 쓰지 마라(`5 * 2` 같은). 이유: 값 자체가 문서다.
- 다른 `src/` 파일을 만들지 마라. 이유: 이후 step 담당.

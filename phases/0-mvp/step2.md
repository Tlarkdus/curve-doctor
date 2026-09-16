# Step 2: diagnose

## 읽어야 할 파일

프롬프트 상단에 `CLAUDE.md`와 `docs/` 전문이 주입되어 있다. 추가로 이전 step 산출물을 읽어라:

- `src/thresholds.js` — `T`, `SEVERITY`, `ACTIONS`, `FINDING_ORDER`
- `src/parse.js` — `Epoch` 실제 형태, `lastRun`
- `docs/PRD.md` — **진단 6종 표와 상호배제·순서 규칙**(이 step의 명세다)

## 작업

epoch 배열을 진단 목록으로 바꾸는 순수 함수를 만든다. **TDD: 테스트를 먼저 작성하라.**

### 시그니처 — `src/diagnose.js`

```js
export function diagnose(epochs) // -> Finding[]
// Finding = { code, severity, evidence: { epoch, detail }, action }
```

입력은 `parseLog`가 낸 전체 `epochs`다. 함수 안에서 `lastRun()`을 호출해 마지막 run만 본다.

### 판정 순서 (PRD 그대로)

1. 마지막 run의 epoch 수 < `T.MIN_EPOCHS` → `TOO_FEW_EPOCHS` **하나만** 반환
2. `DIVERGENCE` 성립 → **하나만** 반환
3. 나머지를 `FINDING_ORDER` 순서로 담되, `OVERFITTING`이 성립하면 `PLATEAU`는 생략
4. `val_loss`가 **어느 epoch에도 없으면** `OVERFITTING`·`PLATEAU`·`NOISY_VAL`을 조용히 생략

`severity`와 `action`은 `SEVERITY[code]`·`ACTIONS[code]`에서 가져온다. 새로 쓰지 마라.
`evidence.epoch`은 그 판정의 **근거가 된 epoch 번호**, `evidence.detail`은 숫자가 든 한 줄
(예: `"val_loss가 epoch 12(0.31) 이후 3회 연속 상승, 마지막 0.44"`).

### `tests/diagnose.test.js` (먼저 작성)

- 6종 각각을 유발하는 **최소 로그**(손으로 만든 `Epoch[]` 리터럴) 1케이스씩
- 상호배제 3케이스: epoch 부족 + 발산 동시 → `TOO_FEW_EPOCHS`만 /
  발산 + 과적합 동시 → `DIVERGENCE`만 / 과적합 + 정체 동시 → `PLATEAU` 없음
- `val_loss` 없는 로그 → val 기반 3종이 안 나온다
- 정상 곡선(꾸준히 감소) → **빈 배열**
- 임계 경계: `OVERFIT_RISE`가 정확히 3일 때 성립, 2일 때 불성립

## Acceptance Criteria

```bash
npm test
```

## 검증 절차

1. 위 AC를 실행한다.
2. 체크리스트: `src/diagnose.js`에 **숫자 리터럴이 없는가**(0, 1 같은 인덱스 연산 제외) /
   `ACTIONS` 문자열을 복사해 쓰지 않았는가 / 입력 `epochs` 배열을 변형하지 않는가.
3. `phases/0-mvp/index.json`의 step 2를 갱신한다.

## 금지사항

- 텍스트를 파싱하지 마라. 이유: 입력은 이미 `Epoch[]`다.
- 임계값 숫자를 직접 쓰지 마라. 이유: `CLAUDE.md` CRITICAL 3.
- 진단이 없을 때 "문제 없음" Finding을 만들지 마라. 이유: 빈 배열이 곧 그 뜻이다.
- `val_loss`가 없을 때 `loss`로 대신 판정하지 마라. 이유: 없는 근거로 말하지 않는다.

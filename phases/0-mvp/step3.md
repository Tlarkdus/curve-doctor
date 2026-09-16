# Step 3: samples

## 읽어야 할 파일

프롬프트 상단에 `CLAUDE.md`와 `docs/` 전문이 주입되어 있다. 추가로 이전 step 산출물을 읽어라:

- `src/parse.js`, `src/diagnose.js` — 실제 반환 형태
- `docs/PRD.md` — **Why 절의 합격선**("샘플 6종에서 6/6")
- `docs/design.md` — 테스트 전략 절

## 작업

PRD의 합격선을 **실행 가능한 테스트**로 만든다. 이 step이 phase 0의 합격 판정이다.

### 1. `tests/fixtures/` — 로그 샘플 6종

파일 이름이 곧 기대 결과다. 각 파일은 **진짜 학습 로그처럼** 보여야 한다(15줄 이상,
포맷을 섞어 쓰지 말 것 — 한 파일은 한 포맷).

| 파일 | 담을 것 | 포맷 |
|---|---|---|
| `diverge.log` | loss가 중간부터 급증하다 `nan` | keras |
| `overfit.log` | val_loss가 최저점 뒤 계속 상승, train은 계속 하강 | keras |
| `underfit.log` | 둘 다 거의 평평하고 초기값과 비슷 | csv |
| `plateau.log` | val_loss가 최저점 갱신 없이 정체(상승은 아님) | csv |
| `noisy.log` | train은 매끈, val_loss만 크게 튐 | kv |
| `too-few.log` | epoch 3개 | kv |

### 2. `tests/samples.test.js`

각 샘플을 읽어 `parseLog` → `diagnose`를 돌리고, **파일명이 가리키는 code가 결과에 있는지**
확인한다. 6개 전부 통과해야 한다.

추가로 각 샘플에서 확인할 것:
- `format`이 위 표와 일치
- `epochs.length > 0` (`too-few.log` 포함)
- `diverge`·`too-few`는 Finding이 **정확히 1개**(단독 반환 규칙)

파일 읽기는 이 테스트 파일에서만 `node:fs`를 쓴다 — `src/`가 아니므로 허용된다.

## Acceptance Criteria

```bash
npm test
```

## 검증 절차

1. 위 AC를 실행한다. **6/6이 아니면 이 step은 실패다.**
2. 체크리스트: fixture가 `src/`를 import하지 않는가 / 샘플이 손으로 읽어도 그럴듯한가 /
   기대 code를 맞추려고 `src/`의 임계값을 고치지 않았는가.
   **임계값을 고쳐야 통과한다면 그건 샘플이 틀린 것이다.**
3. `phases/0-mvp/index.json`의 step 3을 갱신한다.

## 금지사항

- `src/thresholds.js`의 값을 바꾸지 마라. 이유: 테스트를 통과시키려 기준을 옮기는 것이다.
- 샘플을 진단 로직에서 역산해 만들지 마라. 이유: 그러면 테스트가 코드의 거울일 뿐 명세의 거울이 아니다.
- `src/`의 파일을 수정하지 마라. 단 **버그를 발견하면 멈추고 보고하라** — 고치는 것은 사람의 판단이다.

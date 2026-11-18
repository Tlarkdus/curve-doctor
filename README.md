# curve-doctor

모델 돌려놓고 잔 사람이, **학습 로그를 붙여넣으면 이 학습이 뭐가 잘못됐는지와 다음 조치 한 개**를 받는다.

```
Epoch 12/50 - loss: 0.31 - val_loss: 0.88
```
같은 줄이 섞인 로그 한 덩어리를 그대로 붙여넣으면 된다. 서버도 계정도 없다.

> 동덕여대 바이브 코딩 수업 7주차 과제로 만들었다 (2026-09-16~17). 과제 주제는 명세를 먼저 쓰고 AI 에이전트가 단계 문서를 실행하게 해서 작은 제품을 끝까지 만드는 것이었다.

## 쓰는 법

`index.html`을 브라우저로 연다. 빌드 없다. 붙여넣기 → 진단 표 두 장(요약 / 진단).

```
npm test        # node --test, 53개
```

## 진단 6종

| code | 언제 | severity |
|---|---|---|
| `DIVERGENCE` | `loss`가 NaN/Inf, 또는 직전 epoch 대비 10배 이상 증가 | high |
| `OVERFITTING` | `val_loss` 최저점 이후 3 epoch 연속 상승 **그리고** `val_loss - loss` 단조 증가 | high |
| `UNDERFITTING` | 마지막 5 epoch의 `loss` 개선폭 < 1% **그리고** 첫 `loss`의 80% 이상에 머묾 | medium |
| `PLATEAU` | `val_loss`가 5 epoch 연속 최저점 갱신 실패 | medium |
| `NOISY_VAL` | `\|Δval_loss\|` 중앙값이 `\|Δloss\|` 중앙값의 3배 이상 | medium |
| `TOO_FEW_EPOCHS` | 마지막 run이 5 epoch 미만 — **판정하지 않고 판정 불가라고 말한다** | info |

설계 원칙 둘: **없는 근거로 말하지 않는다**(`val_loss`가 없으면 val 기반 진단을 생략한다. "문제 없음"을 지어내지 않는다), **판정 불가를 말할 수 있어야 한다**.

## 만든 방법 — SDD 하네스

명세를 먼저 쓰고(`docs/PRD.md`), 구현은 **phase/step 문서를 서브에이전트에게 실행시켜** 만들었다.

- `docs/PRD.md` — 입출력 타입·임계값·상호배제 규칙까지 확정한 명세. 구멍 9건을 되물어 채운 뒤에 코딩을 시작했다.
- `CLAUDE.md` — CRITICAL 5조(런타임 의존성 0 / `src/`는 브라우저·node 공용 / 임계값은 한 파일 / 테스트 먼저 / `npm test` 통과).
- `phases/0-mvp/step*.md` — step 하나가 슬라이스 하나. step0·1은 사람이 직접 TDD로, **step2·3·4는 `scripts/execute.py`가 자동 실행**했다.

```
py scripts/execute.py phases/0-mvp     # phase 실행 (python은 이 PC에서 스토어 스텁)
```

phase 0 결과: step2·3·4 자동, **재시도 0회**, `npm test` 53/53, 합격선 샘플 6/6.

## 구조

- `src/` — 순수 모듈. `parse.js`(로그 → epochs) · `diagnose.js`(epochs → findings) · `thresholds.js`(상수) · `format.js`(표 셀)
- `tests/` — `node --test`, `tests/fixtures/*.log`가 진단 6종의 합격선 샘플
- `index.html` — 정적 UI 한 장. 빌드 없이 `src/`를 직접 `import`
- `docs/` · `phases/` · `scripts/execute.py` — 명세와 하네스

런타임 의존성 0, 네트워크 호출 0. 붙여넣은 로그는 밖으로 나가지 않는다.

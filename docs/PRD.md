# PRD — curve-doctor (학습곡선 진단기)

> phase 0 (MVP). 작성 2026-09-16.

## 한 줄

모델 돌려놓고 잔 사람이, 학습 로그를 붙여넣으면 **이 학습이 뭐가 잘못됐는지**와 다음 조치 한 개를 받는다.

## What — 입출력

입력은 **학습 로그 텍스트 한 덩어리**(붙여넣기), 출력은 **파싱 결과 + 진단 목록**이다.

```js
parseLog(text: string): ParseResult
// ParseResult = { epochs: Epoch[], skipped: number, truncated: boolean,
//                 format: "keras" | "csv" | "kv" | "unknown" }
// Epoch      = { epoch: number, run: number, metrics: { [name: string]: number } }
//   metrics의 값은 유한수 또는 NaN/Infinity(발산 판정용).
//   측정되지 않은 metric은 키 자체를 넣지 않는다 — null을 넣지 않는다.

diagnose(epochs: Epoch[]): Finding[]
// Finding = { code: FindingCode, severity: "high" | "medium" | "info",
//             evidence: { epoch: number, detail: string }, action: string }
//   action은 code마다 고정 문자열이다(ACTIONS 표에서 온다). 매번 새로 쓰지 않는다.
//   반환 순서는 severity(high→medium→info), 같으면 FINDING_ORDER 고정 순서를 따른다.
```

`FindingCode`는 다음 6개로 **고정**한다.

| code | 언제 (전부 `loss`/`val_loss` 기준, 마지막 run만) | severity |
|---|---|---|
| `DIVERGENCE` | `loss`가 `NaN`/`±Infinity`이거나, 직전 epoch 대비 `DIVERGE_FACTOR`(10)배 이상 증가 | high |
| `OVERFITTING` | `val_loss` 최저점 이후 `OVERFIT_RISE`(3) epoch 연속 상승 **그리고** 그 구간에서 `val_loss - loss`가 단조 증가 | high |
| `UNDERFITTING` | 마지막 `TAIL`(5) epoch의 `loss` 개선폭 < `FLAT_PCT`(1%) **그리고** 마지막 `loss` ≥ run 첫 `loss` × `HIGH_PCT`(0.8) | medium |
| `PLATEAU` | `val_loss`가 `PLATEAU_N`(5) epoch 연속 최저점 갱신 실패 | medium |
| `NOISY_VAL` | `\|Δval_loss\|` 중앙값 ≥ `\|Δloss\|` 중앙값 × `NOISE_FACTOR`(3) | medium |
| `TOO_FEW_EPOCHS` | 마지막 run의 epoch이 `MIN_EPOCHS`(5) 미만 — **판정하지 않고 판정 불가라고 말한다** | info |

**상호배제와 순서** (`FINDING_ORDER`):

1. `TOO_FEW_EPOCHS`가 성립하면 **이것만** 반환하고 끝낸다.
2. `DIVERGENCE`가 성립하면 **이것만** 반환한다 — 발산한 곡선에서 과적합·정체를 논하는 건 의미가 없다.
3. 나머지는 공존할 수 있고 `OVERFITTING` → `UNDERFITTING` → `PLATEAU` → `NOISY_VAL` 순으로 담는다.
   단 `OVERFITTING`이 성립하면 `PLATEAU`는 생략한다(최저점 갱신 실패는 과적합의 부분집합).
4. `val_loss`가 로그에 아예 없으면 `OVERFITTING`·`PLATEAU`·`NOISY_VAL`을 **조용히 생략**한다.

진단이 하나도 없으면 빈 배열을 반환한다. "문제 없음"을 지어내지 않는다.

**`ACTIONS` — code별 고정 조치 문자열**

| code | action |
|---|---|
| `DIVERGENCE` | 학습률을 1/10로 낮추고 gradient clipping을 켜서 다시 시작하세요. |
| `OVERFITTING` | val_loss 최저 epoch의 체크포인트를 쓰고, early stopping 또는 정규화를 추가하세요. |
| `UNDERFITTING` | 모델 용량을 키우거나 학습률을 올리고, epoch을 더 돌려보세요. |
| `PLATEAU` | 학습률 스케줄러(plateau 감지 시 감쇠)를 붙이거나 여기서 중단하세요. |
| `NOISY_VAL` | 검증셋을 키우거나 검증 배치 크기를 늘려 변동을 줄이세요. |
| `TOO_FEW_EPOCHS` | 판정에 최소 5 epoch이 필요합니다. 더 돌린 뒤 다시 확인하세요. |

## Why — 숫자로

- 지금은 로그를 눈으로 훑어 과적합 시점을 찾는다. 50 epoch 로그 기준 수십 초 + 놓침.
- 목표: **붙여넣고 3초 안에** 패턴명·근거 epoch·조치 1개. 준비한 로그 샘플 6종(각 findings 의도)에서
  의도한 code를 **6/6 정확히** 집어내는 것이 phase 0의 합격선이다.

## Constraints — 제약

- **런타임 의존성 0.** node 표준 모듈만 쓴다. 테스트는 `node --test`.
- `src/`의 모듈은 **브라우저와 node에서 같은 파일로 동작**한다(순수 ESM, `process`·`fs` 접근 금지).
  UI는 정적 `index.html` 하나가 같은 모듈을 `import`한다. 빌드 단계를 만들지 않는다.
- 진단은 **규칙 기반**이다. 학습하지 않고, 네트워크를 쓰지 않고, 입력을 저장하지 않는다.
- 입력 상한: 1MB 또는 10,000 epoch. 초과분은 잘라내고 잘랐다고 보고한다.
- 임계값(3 epoch, 5 epoch, 10배, 3배 등)은 **한 곳의 상수 객체**로만 정의한다. 코드에 흩어놓지 않는다.

## Boundaries — 범위 밖 (phase 0에서 하지 않는다)

- 그래프·차트 시각화 — 숫자 표까지만
- 파일 업로드 / 드래그앤드롭 — 붙여넣기만
- TensorBoard·W&B·MLflow 연동
- 여러 run 비교, 하이퍼파라미터 추천
- 로그인, 저장, 공유 링크
- 학습률·배치크기 같은 **설정값 추론** — 로그에 있는 metric만 본다

## Edge — 엣지

파서가 반드시 견뎌야 하는 것들:

- `nan`, `NaN`, `inf`, `-inf`, `1e-05`, `1.2E+3`
- epoch 번호가 **직전 epoch보다 작아지면** 새 run으로 분리한다(`run`은 0부터 증가).
  같으면 같은 run으로 보고 **마지막 값이 이긴다**. 진단은 마지막 run만 본다
- epoch 건너뜀(3 → 7) — 그대로 둔다. 보간하지 않는다
- metric 이름 변형: `val_loss` / `valid_loss` / `val loss` / `vl` → 정규화해 `val_loss` 하나로
- 로그 중간에 섞인 진행바·경고·스택트레이스 → 조용히 건너뛰고 **개수만 보고**(`skipped`)
- 지원 포맷 3종: Keras 스타일(`Epoch 3/50 - loss: 0.69 - val_loss: 0.68`), CSV(헤더 포함),
  key=value(`epoch=3 loss=0.69`). 어느 것도 아니면 `format: "unknown"`에 `epochs: []`
- CSV의 epoch 컬럼 이름 후보는 `epoch`·`step`·`iter`·`iteration`(대소문자 무시).
  없으면 **행 순서를 epoch 번호로 쓴다**(0부터)
- 1MB 또는 10,000 epoch 초과 시 앞에서부터 잘라 담고 `truncated: true`를 세운다
- `val_loss`가 아예 없는 로그 → val 기반 진단 4종을 건너뛰고 그 사실을 `TOO_FEW_EPOCHS`가 아닌
  별도 설명 없이 **조용히 생략**한다(없는 근거로 진단하지 않는다)
- epoch 0개 / 1개 → `TOO_FEW_EPOCHS`

## 감리(grill) 기록

1차 감리에서 구멍 9개가 나왔고 전부 이 문서에 반영했다 — 전부 **임계값과 반환 형태의 빈칸**이었지
설계 변경은 없었다. 주요 보강: 진단 조건의 수치 기준 명시(`DIVERGE_FACTOR` 등 명명), 상호배제·순서 규칙,
`ACTIONS` 고정 문자열표, run 분리 기준(직전보다 작아지면 새 run), CSV epoch 컬럼 후보,
`truncated` 필드 신설, `metrics`에 `null`을 넣지 않기로 확정.

2차 재구술: *"로그 텍스트를 epoch 배열로 바꾸는 파서 하나와, 그 배열을 6종 코드로 판정하는 규칙 엔진 하나.
둘 다 순수 함수라 브라우저에서도 돈다. 임계값은 한 파일에 모으고, 근거가 없으면 진단을 생략한다."*

## Readiness 5체크

- [x] **AC가 실행 커맨드다** — `npm test` (샘플 6종 고정 케이스 포함)
- [x] **엣지 나열** — 위 Edge 절 9항목
- [x] **제약 명시** — 의존성 0, 브라우저·node 동형, 규칙 기반, 임계값 단일 출처
- [x] **경계 명시** — Boundaries 6항목
- [x] **시그니처 수준** — `parseLog(text): ParseResult`, `diagnose(epochs): Finding[]`, code 6종 고정

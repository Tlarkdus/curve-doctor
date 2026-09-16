# curve-doctor

학습 로그를 붙여넣으면 학습곡선의 문제 패턴과 다음 조치 한 개를 내는 도구.
상세 명세: @docs/PRD.md · 구조: @docs/design.md

## CRITICAL — 절대 위반 금지

1. **런타임 의존성 0.** `package.json`의 `dependencies`는 비어 있다. node 표준 모듈만 쓴다.
2. **`src/`는 브라우저와 node에서 같은 파일로 돈다.** `process`·`fs`·`path` 등 node 전용 API를
   `src/` 안에서 import하지 마라. 이유: UI가 빌드 없이 같은 모듈을 직접 `import` 한다.
3. **임계값은 `src/thresholds.js` 한 곳에만.** 숫자를 판정 코드에 직접 쓰지 마라.
4. **테스트를 먼저 쓴다.** `src/*.js` 구현 전에 대응 `tests/*.test.js`가 있어야 한다.
5. **코드를 고쳤으면 `npm test` 통과를 확인한다.**

## 행동 원칙

- **Simplicity First** — 요구를 만족하는 최소 코드만. "나중에 쓸지도"를 위한 추상화를 만들지 않는다.
- **Surgical Changes** — 요청 범위 밖의 코드·주석·포맷은 건드리지 않는다.
- **없는 근거로 말하지 않는다** — 진단은 로그에 있는 metric만 근거로 삼는다.
  `val_loss`가 없으면 val 기반 진단을 **생략**한다. "문제 없음"을 지어내지 않는다.
- **판정 불가를 말할 수 있어야 한다** — epoch이 모자라면 `TOO_FEW_EPOCHS`로 정직하게 끝낸다.

## 구조

- `src/` — 순수 모듈. `parse.js`(로그 → epochs), `diagnose.js`(epochs → findings), `thresholds.js`(상수)
- `tests/` — `node --test` / `docs/` — PRD·ARCHITECTURE·ADR / `phases/` — SDD 하네스의 step 문서와 상태
- `index.html` — 정적 UI 한 장. 빌드 없이 `src/`를 직접 import
- `scripts/execute.py` — phase 실행 하네스

## 금지사항

- 번들러·프레임워크·런타임 패키지 추가. 개발 의존성도 먼저 묻는다.
- 네트워크 호출, 입력 로그의 저장·전송. 이 도구는 붙여넣은 것을 밖으로 내보내지 않는다.
- 파싱 실패를 예외로 던지기. **깨진 줄은 건너뛰고 `skipped`로 센다** — 로그 한 줄 때문에 전체가 죽지 않는다.

## 명령어

- `npm test` — 전체 테스트
- `py scripts/execute.py phases/0-mvp` — phase 실행 (`python`은 이 PC에서 스토어 스텁이다)

// 임계값과 고정 문자열의 단일 출처. 로직도 import도 없다 — 의존성의 바닥이다.

export const FINDING_CODES = [
  'DIVERGENCE',
  'OVERFITTING',
  'UNDERFITTING',
  'PLATEAU',
  'NOISY_VAL',
  'TOO_FEW_EPOCHS',
];

export const T = {
  DIVERGE_FACTOR: 10,   // 직전 epoch 대비 loss 증가 배율
  OVERFIT_RISE: 3,      // val_loss 연속 상승 횟수
  TAIL: 5,              // 정체 판정에 보는 마지막 epoch 수
  FLAT_PCT: 0.01,       // 개선폭이 이 비율 미만이면 평평하다고 본다
  HIGH_PCT: 0.8,        // 마지막 loss가 첫 loss의 이 비율 이상이면 아직 높다
  PLATEAU_N: 5,         // 최저점 갱신 실패 연속 횟수
  NOISE_FACTOR: 3,      // val 변동폭이 train의 이 배 이상이면 시끄럽다
  MIN_EPOCHS: 5,        // 이보다 적으면 판정하지 않는다
  MAX_EPOCHS: 10000,
  MAX_BYTES: 1024 * 1024,
};

export const SEVERITY = {
  DIVERGENCE: 'high',
  OVERFITTING: 'high',
  UNDERFITTING: 'medium',
  PLATEAU: 'medium',
  NOISY_VAL: 'medium',
  TOO_FEW_EPOCHS: 'info',
};

export const ACTIONS = {
  DIVERGENCE: '학습률을 1/10로 낮추고 gradient clipping을 켜서 다시 시작하세요.',
  OVERFITTING: 'val_loss 최저 epoch의 체크포인트를 쓰고, early stopping 또는 정규화를 추가하세요.',
  UNDERFITTING: '모델 용량을 키우거나 학습률을 올리고, epoch을 더 돌려보세요.',
  PLATEAU: '학습률 스케줄러(plateau 감지 시 감쇠)를 붙이거나 여기서 중단하세요.',
  NOISY_VAL: '검증셋을 키우거나 검증 배치 크기를 늘려 변동을 줄이세요.',
  TOO_FEW_EPOCHS: '판정에 최소 5 epoch이 필요합니다. 더 돌린 뒤 다시 확인하세요.',
};

// TOO_FEW_EPOCHS와 DIVERGENCE가 여기 없는 것은 의도다 — 둘은 단독 반환이라 순서에 참여하지 않는다.
export const FINDING_ORDER = ['OVERFITTING', 'UNDERFITTING', 'PLATEAU', 'NOISY_VAL'];

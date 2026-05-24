# ARCHITECTURE.md

## 1. 목표 아키텍처
확장 프로그램은 다음 계층으로 나눈다.

1. Page Detection Layer
2. Extraction Layer
3. Domain Policy Layer
4. Repository Layer
5. Presentation Layer
6. Harness/Test Layer

---

## 2. 계층 설명

### 2.1 Page Detection Layer
역할:
- 현재 페이지가 LIST인지 DETAIL인지 판별
- SPA 전환 감지
- DOM 파싱 트리거 시점 결정

권장 파일:
- `content.js`
- `utils/pageDetector.js`

### 2.2 Extraction Layer
역할:
- DOM에서 carId/title/price/url/mileage/year 추출
- 가능하면 selector fallback 전략 보유
- 순수 함수 형태 유지

권장 파일:
- `utils/extractor.js`

### 2.3 Domain Policy Layer
역할:
- history append 여부 판단
- 상태 전이 계산
- 가격 차이 계산
- 대표값 병합 규칙 결정

권장 파일:
- `utils/price.js`
- `utils/status.js`
- `utils/merge.js`

### 2.4 Repository Layer
역할:
- `chrome.storage.local` CRUD
- vehicle upsert
- recent vehicle query
- 향후 Supabase 교체 지점

권장 파일:
- `utils/storage.js`

### 2.5 Presentation Layer
역할:
- 상세 overlay 렌더링/업데이트
- popup 목록 렌더링

권장 파일:
- `utils/overlay.js`
- `popup.js`
- `styles.css`

### 2.6 Harness/Test Layer
역할:
- extractor fixture test
- history/status regression test
- UI idempotency test
- selector regression test

권장 디렉터리:
- `harness/`
- `fixtures/`
- `expected/`

---

## 3. 추천 디렉터리 구조
```text
car-price-tracker/
├── manifest.json
├── package.json
├── package-lock.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── styles.css
├── utils/
│   ├── extractor.js
│   ├── storage.js
│   ├── status.js
│   ├── price.js
│   ├── merge.js
│   ├── overlay.js
│   └── pageDetector.js
├── harness/
│   ├── extractor.harness.js
│   ├── status.harness.js
│   ├── history.harness.js
│   ├── ui.harness.js
│   ├── runner.html
│   └── run-node.js
├── fixtures/
│   ├── list/
│   └── detail/
└── docs/
```

참고:
- `replay.harness.js`는 아직 없다. SPA/retry 안정화 단계에서 추가한다.
- `icons/` 디렉터리는 manifest가 참조하지만 아직 없다. 확장 로드 전 추가하거나 manifest 참조를 제거한다.

---

## 4. 데이터 흐름

### LIST
1. 페이지 감지
2. 목록 DOM 추출
3. 차량별 normalize
4. 기존 데이터 조회
5. history append 여부 판정
6. status ACTIVE 반영
7. 저장

### DETAIL
1. 상세 페이지 감지
2. 상세 DOM 추출
3. 기존 데이터 조회
4. DETAIL 우선 병합
5. history append 여부 판정
6. status ACTIVE 반영
7. 저장
8. overlay 갱신

---

## 5. 핵심 설계 포인트
- extractor는 순수 함수에 가깝게 유지
- 상태 전이는 조회 시 재평가 가능 구조로 설계
- 저장소 인터페이스를 DB 교체 친화적으로 유지
- overlay는 create보다 update-first 방식 권장
- harness를 통해 DOM 구조 변경 리스크를 조기 탐지

---

## 6. 현재 구현상 주의할 경계
- content orchestrator는 중복 실행 방지와 DOM 지연 retry가 충돌하지 않아야 한다.
- DETAIL 데이터는 LIST 데이터보다 우선해야 하며, LIST 재방문이 상세 필드를 덮으면 안 된다.
- popup은 content script의 repository를 그대로 로드하지 않고 popup 환경에서 storage를 직접 조회한다.
- Node 하네스는 `jsdom` 기반이라 Chrome extension API까지 검증하지 않는다.

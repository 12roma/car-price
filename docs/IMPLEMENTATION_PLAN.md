# IMPLEMENTATION_PLAN.md

## 목표
한 번에 전부 구현하지 않고, 단계별로 안전하게 구현한다.

현재 구현은 Phase 1 기능 골격과 최소 하네스까지 만들어진 상태다.
이 문서는 남은 안정화 작업을 구분하기 위해 완료/진행/대기 상태를 함께 기록한다.

---

## Phase 0. 문서/골격 준비
상태: 완료
### 목표
- 프로젝트 구조 확정
- 요구사항 및 정책 문서 정리
- 하네스 전략 정의

### 산출물
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/HARNESS.md`
- `docs/TEST_PLAN.md`

### 완료 기준
- 구현자가 무엇을 만들어야 하는지 문서만 읽고 이해 가능

---

## Phase 1. Extension 골격
상태: 부분 완료
### 목표
- Manifest V3 기본 구조
- popup/content/background 최소 연결

### 산출물
- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.js`
- `styles.css`

### 완료 기준
- 확장 프로그램이 chrome://extensions 에서 로드됨
- Encar 페이지에서 content script 주입 확인 가능

### 남은 확인
- `manifest.json`의 `icons/*` 참조 파일이 실제로 존재해야 한다.
- Chrome에서 압축해제 확장 프로그램 로드 테스트가 필요하다.

---

## Phase 2. 공통 유틸/도메인 모델
상태: 완료
### 목표
- 상수, enum, time/price normalize 준비
- vehicle/history 기본 모델 규약 확정

### 산출물
- `utils/constants.js`
- `utils/price.js`
- `utils/merge.js`

### 완료 기준
- 가격 normalize, diff 계산, append policy 테스트 가능

---

## Phase 3. Extractor 구현
상태: 초안 완료
### 목표
- LIST/DETAIL 추출기 작성
- fixture 기반 회귀 가능하게 작성

### 산출물
- `utils/extractor.js`
- `fixtures/list/*.html`
- `fixtures/detail/*.html`
- `expected/*.json`
- `harness/extractor.harness.js`

### 완료 기준
- fixture 기준 기대값과 실제 추출값이 일치

### 남은 확인
- 현재 selector는 fixture 기준으로 검증된 초안이다.
- 실제 Encar DOM snapshot을 추가해 selector fallback을 보강해야 한다.

---

## Phase 4. Storage/Status 구현
상태: 초안 완료
### 목표
- local repository
- upsert/merge
- status transition

### 산출물
- `utils/storage.js`
- `utils/status.js`
- `harness/status.harness.js`
- `harness/history.harness.js`

### 완료 기준
- 중복 저장 방지
- ACTIVE/MISSING/SUSPECT_SOLD/ARCHIVED 검증 통과

### 남은 확인
- `carId`가 없는 fallback key 저장/조회 시나리오를 하네스에 추가해야 한다.
- DETAIL 데이터가 기존 DETAIL 데이터와 병합될 때 우선순위가 유지되는지 추가 테스트가 필요하다.

---

## Phase 5. Content Orchestrator
상태: 진행 중
### 목표
- 현재 페이지 판별
- SPA navigation 감지
- debounce/retry
- LIST/DETAIL 처리 흐름 연결

### 산출물
- `content.js`
- `utils/pageDetector.js`
- `harness/replay.harness.js`

### 완료 기준
- 동일 페이지 중복 저장 방지
- URL 변경 시 정상 재동작

### 남은 수정
- DOM 지연 재시도가 `_lastProcessedUrl` 중복 방지에 막히지 않도록 처리 순서를 조정해야 한다.
- MutationObserver가 같은 URL의 재렌더를 무시할 때, 최초 실패 후 재렌더가 발생하는 경우를 별도 검증해야 한다.
- SPA/retry 하네스가 아직 없다.

---

## Phase 6. Overlay UI
상태: 완료
### 목표
- 상세 페이지 가격 비교 UI 주입
- 중복 렌더 방지

### 산출물
- `utils/overlay.js`
- `styles.css`
- `harness/ui.harness.js`

### 완료 기준
- 오버레이 1개만 존재
- 이전가/현재가/변동폭 표시

### 남은 확인
- 실제 Encar 상세 페이지에서 overlay 위치와 z-index 충돌 여부를 수동 확인해야 한다.

---

## Phase 7. Popup UI
상태: 초안 완료
### 목표
- 최근 차량 목록
- 최신 가격/변동/상태 표시

### 산출물
- `popup.html`
- `popup.js`

### 완료 기준
- 최근 확인순 정렬
- 클릭 시 차량 페이지 이동 가능

### 남은 확인
- popup 전용 하네스 또는 수동 테스트 체크리스트가 필요하다.

---

## Phase 8. 안정화
상태: 대기
### 목표
- selector fallback 보강
- fixture 추가
- 예외 처리 보강
- README 정리

### 완료 기준
- 대표 시나리오 기준 회귀 테스트 세트 확보

---

## 현재 실행 가능한 검증
```bash
npm test
```

현재 포함된 검증:
- extractor LIST/DETAIL
- price/history policy
- merge policy
- status transition
- overlay idempotency

---

## 다음 작업 우선순위
1. `icons/` 누락 해결 또는 manifest icon 참조 제거
2. content orchestrator retry 흐름 수정
3. DETAIL 우선 병합의 edge case 테스트 추가
4. SPA/replay harness 추가
5. 실제 Encar DOM snapshot fixture 추가

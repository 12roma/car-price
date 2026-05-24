# PHASE1_TASKS.md

## 현재 상태
기본 구현은 대부분 작성됐다.
아래 목록은 최초 작업 순서와 현재 보완 필요 사항을 함께 기록한다.

---

## 작업 순서 및 상태

### Task 1. 프로젝트 초기 골격 생성
상태: 완료
- manifest.json
- background.js
- content.js
- popup.html
- popup.js
- styles.css
- utils/ 디렉터리 생성

### Task 2. 공통 상수/모델 정의
상태: 완료
- 상태값 enum
- source 타입
- history record 형태
- overlay DOM id 상수

### Task 3. extractor 초안 작성
상태: 완료
- extractListVehicles()
- extractDetailVehicle()
- getCarIdFromUrl()

참고: `isListPage()`와 `isDetailPage()`는 `utils/pageDetector.js`에 있다.

### Task 4. price/history 정책 구현
상태: 완료
- normalizePrice()
- shouldAppendHistory()
- getLatestPrice()
- getPreviousPrice()
- getPriceDiff()

### Task 5. storage 구현
상태: 완료
- getVehicle()
- getAllVehicles()
- upsertVehicle()
- getRecentVehicles()

### Task 6. status 구현
상태: 완료
- markActive()
- markMissing()
- deriveStatusByTime()

### Task 7. content orchestrator 연결
상태: 수정 필요
- page detect
- debounce
- retry
- list/detail 분기
- save/update call

보완:
- retry가 `_lastProcessedUrl` 중복 방지에 막히지 않도록 수정
- SPA/retry 하네스 추가

### Task 8. overlay UI
상태: 완료
- render/update
- diff 표시
- first tracked 표시

### Task 9. popup UI
상태: 초안 완료
- 최근 차량 목록
- 최신 가격/변동/상태
- 클릭 시 이동

보완:
- popup 렌더링 하네스 또는 수동 검증 추가

### Task 10. harness 최소 세트 작성
상태: 완료
- extractor fixture harness
- history harness
- status harness
- overlay harness

---

## 다음 수정 우선순위
1. `icons/` 디렉터리와 manifest icon 참조 정리
2. content retry 흐름 수정
3. SPA/replay harness 추가
4. popup 렌더링 검증 추가
5. 실제 Encar DOM fixture 추가

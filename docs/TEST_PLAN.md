# TEST_PLAN.md

## 0. 실행 방법
현재 자동 하네스는 Node.js + jsdom 기반으로 실행한다.

```bash
npm test
```

브라우저에서 수동으로 확인할 때는 `harness/runner.html`을 연다.

현재 자동 검증 범위는 extractor, price/history, merge, status, overlay다.
content orchestrator, `chrome.storage.local`, popup, manifest 로드 여부는 아직 수동 확인 또는 추가 하네스가 필요하다.

---

## 1. 우선 테스트 범위
### A. Extractor
- LIST 기본 추출
- LIST 복수 카드 추출
- DETAIL 기본 추출
- carId fallback
- price 누락 처리

### B. Domain Policy
- price normalize
- history dedup
- price diff 계산
- merge 우선순위
- status transition

### C. UI
- overlay 생성
- overlay 재실행 시 중복 방지
- popup 최근 정렬

### D. Flow
- LIST 처리
- DETAIL 처리
- SPA URL 변경 처리
- debounce/retry 처리

현재 D 영역은 자동 하네스가 부족하다. 다음 안정화에서 가장 먼저 추가한다.

---

## 2. 대표 시나리오
### 시나리오 1
LIST 페이지 처음 방문
- 여러 차량 저장
- 모두 ACTIVE
- history 1건 생성

### 시나리오 2
같은 LIST 다시 열기
- 같은 날 같은 가격이면 history 추가 없음

### 시나리오 3
DETAIL 진입
- fromDetail=true
- lastSeenAt 갱신
- overlay 렌더

### 시나리오 4
가격 하락
- 새 history 추가
- popup diff 음수 반영

### 시나리오 5
추출 실패 반복
- MISSING 증가
- 3회 이상이면 SUSPECT_SOLD

### 시나리오 6
장기 미확인
- 30일 이상이면 ARCHIVED

---

## 3. 수동 점검 체크리스트
- 확장 로드 성공
- `manifest.json`에서 참조하는 icon 파일 존재
- Encar 외 페이지에서 동작 안 함
- overlay가 상세 페이지에서만 뜸
- popup 클릭 시 원본 차량 페이지로 이동
- storage local 데이터 구조가 명세와 일치
- 중복 observer로 과도 저장 안 됨
- DOM 지연 렌더링 후 retry가 실제로 다시 추출을 시도함

---

## 4. 회귀 방지 우선순위
가장 먼저 깨지기 쉬운 순서대로 관리한다.

1. extractor selector
2. history dedup
3. SPA 중복 실행
4. overlay 중복 렌더
5. popup 정렬

---

## 5. 추가해야 할 회귀 테스트
### Content Orchestrator
- LIST에서 `NO_CARD_ROOT` 발생 후 DOM이 채워지면 재시도 저장 성공
- DETAIL에서 `NO_PRICE` 발생 후 가격 DOM이 생기면 재시도 저장 성공
- `_lastProcessedUrl` 때문에 실패한 URL이 영구 skip되지 않음
- pushState/replaceState 후 한 번만 처리됨
- 같은 URL의 MutationObserver 폭주가 저장 중복을 만들지 않음

### Storage
- `carId`가 있는 차량 저장/조회
- `carId`가 없는 fallback key 저장/조회
- LIST 저장 후 DETAIL 저장 시 `source.fromList`와 `source.fromDetail` 모두 유지
- 기존 DETAIL 데이터가 LIST 재방문으로 낮은 신뢰도 값에 덮이지 않음

### Popup
- 빈 storage일 때 empty state 표시
- 최근순 정렬
- 가격 상승/하락 diff 표시
- 상태 label/class 표시

### Extension Load
- icon 파일 누락 없음
- `host_permissions`가 `https://www.encar.com/*`로 제한됨
- `<all_urls>` 권한 없음

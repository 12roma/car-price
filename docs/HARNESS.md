# HARNESS.md

## 1. 왜 하네스가 필요한가
이 프로젝트는 Encar의 DOM 구조에 직접 의존한다.
따라서 사이트 구조가 조금만 바뀌어도 extractor가 깨질 수 있다.
이를 막기 위해 실제 브라우저 수동 테스트에만 의존하지 않고, fixture/replay 기반 하네스를 함께 운영한다.

---

## 2. 하네스 목표
1. DOM 구조 변경에 대한 회귀 감지
2. 가격 저장 정책 회귀 감지
3. 상태 전이 오류 감지
4. SPA/observer 중복 실행 문제 감지
5. overlay 중복 렌더 감지

---

## 3. 하네스 종류

### 3.1 Extractor Fixture Harness
**목적**
- HTML fixture만으로 LIST/DETAIL 추출기 검증

**입력**
- 저장된 HTML snapshot

**출력**
- 추출 결과 JSON

**검증 항목**
- carId
- title
- price
- url
- mileage
- year

**권장 구조**
```text
fixtures/
  list/
    list-basic.html
    list-multiple-cards.html
  detail/
    detail-basic.html
    detail-missing-price.html
expected/
  list-basic.json
  detail-basic.json
```

---

### 3.2 Golden Result Harness
**목적**
- selector 변경 시 기대 결과와 달라졌는지 빠르게 검출

**방식**
- fixture → extractor 실행 → expected JSON 비교

**권장 규칙**
- expected 결과는 사람이 한번 검증한 데이터만 커밋
- DOM 변경 이슈 시 fixture와 expected를 함께 업데이트

---

### 3.3 Replay Harness
**목적**
- 실제 페이지에서 저장해둔 최소 HTML snapshot으로 전체 파이프라인 일부 재실행

**검증 항목**
- list/detail 판별
- extractor 결과
- orchestrator 흐름
- retry/debounce 이후 결과 일관성

---

### 3.4 Dedup / History Harness
**목적**
- 같은 가격/같은 날 중복 저장 방지
- 가격 변경 시 append 동작 확인

**주요 시나리오**
1. 첫 발견 → history 1건
2. 같은 날 같은 가격 재방문 → 추가 안 됨
3. 다음 날 같은 가격 → 옵션 정책에 따라 추가 또는 미추가
4. 다른 가격 방문 → 추가
5. LIST 후 DETAIL 같은 가격 → 중복 추가 안 됨

---

### 3.5 Status Transition Harness
**목적**
- 상태 전이 회귀 감지

**주요 시나리오**
1. 추출 성공 → ACTIVE
2. 추출 실패 1회 → MISSING / missingCount=1
3. 추출 실패 3회 → SUSPECT_SOLD
4. lastSeenAt 7일 경과 → SUSPECT_SOLD
5. lastSeenAt 30일 경과 → ARCHIVED

---

### 3.6 SPA Navigation Harness
**목적**
- pushState/replaceState/DOM rerender로 인한 중복 실행 문제 검출

**검증 항목**
- URL 변경 시 1회만 처리되는지
- 같은 URL 재렌더 시 중복 저장이 없는지
- observer 폭주에도 debounce가 동작하는지

---

### 3.7 Overlay Idempotency Harness
**목적**
- 상세 페이지에서 overlay가 중복 생성되지 않는지 확인

**검증 항목**
- 최초 렌더 시 1개 생성
- 동일 차량 재실행 시 update만 발생
- 다른 차량 이동 시 이전 UI가 갱신/교체되는지

---

## 4. 캡처 전략
실제 Encar 페이지를 fixture로 저장할 때는 아래 원칙을 지킨다.

1. 개인정보가 섞이지 않도록 최소 HTML만 저장
2. 가능한 스크립트 제거
3. 핵심 DOM만 남긴 축약 snapshot 허용
4. fixture 파일명에 페이지 유형과 목적을 명확히 반영

예:
- `list-basic.html`
- `list-price-missing.html`
- `detail-basic.html`
- `detail-without-carid.html`

---

## 5. selector 전략까지 하네스에 반영
extractor는 selector 한 개만 믿지 말고, fallback selector 세트를 가질 수 있다.
하네스는 각 selector 후보가 실패해도 최종적으로 필요한 데이터를 얻는지 검증해야 한다.

예:
- `price`: selector A → selector B → text scan fallback
- `carId`: url param → dataset → anchor href parse

---

## 6. 하네스 작성 우선순위
구현 초기에 최소 아래 4개는 반드시 준비한다.

1. extractor fixture harness
2. history dedup harness
3. status transition harness
4. overlay idempotency harness

---

## 7. 추천 실행 방식
- 브라우저 밖에서 실행 가능한 순수 함수 하네스를 우선한다
- Node.js에서는 `jsdom` 기반 runner를 사용한다
- 브라우저에서는 `harness/runner.html`을 열어 동일 suite를 실행한다
- content script 전체 E2E보다 extractor/domain harness를 먼저 안정화한다

현재 실행 방식:
```bash
npm test
```

현재 runner:
- `harness/run-node.js`
- `harness/runner.html`

현재 suite:
- `harness/extractor.harness.js`
- `harness/history.harness.js`
- `harness/status.harness.js`
- `harness/ui.harness.js`

아직 없는 suite:
- `harness/replay.harness.js`
- SPA navigation/debounce/retry 전용 suite
- popup rendering suite

---

## 8. 현재 하네스 커버리지
현재 `npm test`는 아래 범위를 검증한다.

- LIST/DETAIL 기본 추출
- URL 기반 `carId` 추출
- 가격 정규화
- history 중복 방지
- 가격 차이 계산
- vehicle 생성/병합 기본 동작
- status transition
- overlay idempotency

현재 하네스가 잡지 못하는 주요 리스크:

- 실제 Encar DOM selector 변경
- content orchestrator의 retry/debounce 타이밍
- `chrome.storage.local` 실제 연동
- popup DOM 렌더링
- manifest icon 파일 누락
- 확장 프로그램 로드 가능 여부

---

## 9. 최종 목표
하네스의 목적은 테스트 숫자를 늘리는 것이 아니라,
**엔카 DOM 변경과 SPA 재렌더링 같은 실제 리스크를 빠르게 잡아내는 것**이다.

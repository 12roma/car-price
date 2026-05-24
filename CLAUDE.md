# CLAUDE.md

## 프로젝트 개요
이 프로젝트는 Encar(`https://www.encar.com/*`)에서 사용자가 직접 방문한 차량 LIST/DETAIL 페이지를 기준으로
차량 가격 이력을 로컬에 저장하고, 가격 변동을 시각적으로 보여주는 Chrome Extension(Manifest V3)이다.

이 프로젝트의 기준 명세는 `기준 명세: ENCAR_CHROME_EXTENSION_SPEC.md` 이다.
구현 시 반드시 해당 명세를 최우선 기준으로 따른다.

---

## 절대 원칙
1. 전체 사이트 자동 크롤링 금지
2. 사용자가 직접 방문한 페이지에서만 데이터 수집
3. Encar 도메인 외 동작 금지
4. 외부 서버 전송 금지 (Phase 1)
5. 개인 정보 수집 금지
6. `<all_urls>` 권한 금지
7. `chrome.storage.local` 기반으로 우선 구현
8. 소스 구조는 `extractor / storage / status / ui / orchestrator` 로 분리
9. 엔카 SPA/동적 렌더링을 고려한 중복 실행 방지 필수
10. 코드보다 먼저 테스트 가능 구조와 하네스를 설계한다

---

## 작업 방식
구현 시 아래 순서를 따른다.

### 1. 먼저 문서를 읽는다
반드시 아래 문서를 먼저 확인한다.

- `ENCAR_CHROME_EXTENSION_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/HARNESS.md`
- `docs/TEST_PLAN.md`

### 2. 구현 단위는 작게 쪼갠다
한 번에 전체를 만들지 말고 아래 순서로 작은 단위로 구현한다.

1. Manifest/기본 골격
2. 공통 타입/상수/유틸
3. extractor
4. price/history 정책
5. storage repository
6. status policy
7. content orchestrator
8. overlay UI
9. popup UI
10. harness/test 보강

### 3. 각 단계마다 산출물 원칙
각 단계 완료 시 아래를 만족해야 한다.

- 동작 범위가 명확해야 한다
- 테스트 가능한 단위여야 한다
- 다음 단계가 붙기 쉬워야 한다
- 임시 selector 하드코딩은 남겨도 되지만 TODO를 명확히 남긴다

---

## 구현 규칙
### 모듈 분리
- extractor는 DOM에서 데이터만 꺼낸다
- storage는 저장/조회만 담당한다
- status는 상태 전이 규칙만 담당한다
- ui는 overlay/popup 렌더링만 담당한다
- orchestrator는 현재 페이지에서 어떤 흐름을 실행할지 결정한다

### 금지
- extractor 안에서 storage 직접 호출 금지
- storage 안에서 DOM 접근 금지
- popup 코드에서 content script 로직 재구현 금지
- background에 비즈니스 로직 과적재 금지

### 데이터 처리 원칙
- carId 우선 식별
- carId 없으면 정규화 URL fallback
- 같은 날 같은 가격 중복 저장 금지
- 상세 데이터가 리스트 데이터보다 우선
- 자동 삭제 금지, 상태값으로만 관리

### 안정성 원칙
- 동일 URL에서 짧은 시간 내 중복 실행 방지
- SPA navigation 감지
- MutationObserver 사용 시 debounce 필수
- DOM 지연 렌더링 대비 재시도 1~2회 허용
- overlay 중복 생성 금지

---

## 하네스 우선 개발 원칙
이 프로젝트는 엔카 DOM 변경에 취약할 수 있으므로 하네스 기반 접근을 필수로 한다.

구현 전 또는 구현과 동시에 아래 하네스를 준비한다.

1. **DOM fixture harness**
   - LIST/DETAIL HTML fixture 저장
   - extractor를 실제 브라우저 없이 fixture로 검증 가능하게 구성

2. **Golden result harness**
   - fixture별 기대 추출 결과 JSON 유지
   - selector 변경 시 회귀 감지

3. **Replay harness**
   - 실제 방문 페이지에서 캡처한 최소 HTML snapshot으로 extractor 재실행
   - 엔카 DOM 변경 대응용

4. **SPA navigation harness**
   - URL 변경, DOM 재렌더, 중복 observer 상황을 가짜 시나리오로 재현

5. **Dedup/history harness**
   - 같은 날/같은 가격 중복 저장 방지 검증
   - 가격 변경 시 history append 검증

6. **Status transition harness**
   - ACTIVE → MISSING → SUSPECT_SOLD → ARCHIVED 상태 전이 검증

7. **Overlay idempotency harness**
   - 상세 페이지에서 UI가 1개만 유지되는지 검증

---

## 구현 시 응답 스타일
개발 에이전트는 작업 보고 시 아래 형식을 권장한다.

- 이번 단계 목표
- 변경 파일
- 핵심 결정사항
- 테스트/하네스 결과
- 남은 리스크
- 다음 단계

---

## 완료 기준
Phase 1 완료는 아래를 만족해야 한다.

- Encar LIST/DETAIL 페이지에서 정상 수집
- chrome.storage.local 저장
- 상세 overlay 동작
- popup 최근 목록 동작
- 가격 중복 저장 방지
- 상태값 계산 동작
- 최소 하네스/fixture 기반 회귀 검증 가능

---

## 현재 구현 상태 메모
현재 기본 골격, extractor, price/history, storage/status, content orchestrator, overlay, popup,
Node/jsdom 하네스가 작성되어 있다.

현재 자동 검증:
```bash
npm test
```

현재 우선 보완 항목:
1. `manifest.json`이 참조하는 `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` 누락 해결
2. content retry가 `_lastProcessedUrl` 중복 방지에 막히지 않도록 수정
3. SPA navigation/retry 전용 하네스 추가
4. 실제 Encar DOM snapshot fixture 추가
5. popup 렌더링 검증 추가

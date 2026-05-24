# ENCAR_CHROME_EXTENSION_SPEC.md

## 1. 제품 목표
이 확장 프로그램은 사용자가 직접 방문한 Encar 페이지에서 차량 가격 정보를 추출해 로컬에 저장하고,
가격 이력과 변동 여부를 상세 페이지 overlay 및 popup에서 보여준다.

Phase 1의 저장소는 `chrome.storage.local`만 사용한다. 외부 서버 전송, 전체 사이트 자동 크롤링,
개인정보 수집은 금지한다.

---

## 2. 동작 범위
### 허용
- `https://www.encar.com/*`에서만 content script 실행
- 사용자가 방문한 LIST/DETAIL 페이지의 화면 DOM 기반 수집
- 차량 단위 로컬 저장
- 상세 페이지 overlay 표시
- popup 최근 차량 목록 표시

### 금지
- `<all_urls>` 권한 사용
- Encar 외 도메인에서 데이터 수집
- 백그라운드 전체 크롤링
- 외부 API/서버로 차량 데이터 전송
- 로그인 정보, 사용자 식별 정보, 결제/연락처 등 개인정보 수집

---

## 3. 수집 대상
### LIST
- 차량 카드 목록에서 `carId`, `title`, `price`, `url`을 추출한다.
- 가격이 없는 카드는 저장하지 않되, extractor 결과에는 `extractError`로 실패 이유를 남길 수 있다.

### DETAIL
- 상세 페이지에서 `carId`, `title`, `price`, `url`, `mileage`, `year`를 추출한다.
- 상세 페이지 데이터는 목록 데이터보다 우선한다.
- 상세 가격 추출 실패 시 저장하지 않고 DOM 지연 가능성을 고려해 재시도한다.

---

## 4. 식별 규칙
1. `carId`를 최우선 키로 사용한다.
2. `carId`가 없으면 정규화 URL을 fallback key로 사용한다.
3. URL 정규화 시 tracking query는 제거하고 차량 식별에 필요한 값만 유지한다.

---

## 5. 저장 모델
차량은 `chrome.storage.local`에 `vehicle_${id}` 형태로 저장한다.

필수 필드:
- `carId`
- `fallbackKey`
- `title`
- `url`
- `history`
- `status`
- `missingCount`
- `source.fromList`
- `source.fromDetail`
- `firstSeenAt`
- `lastSeenAt`

선택 필드:
- `mileage`
- `year`

---

## 6. 가격 이력 정책
- 가격은 만원 단위 정수로 정규화한다.
- 최초 발견 시 history 1건을 추가한다.
- 가격이 변경되면 history를 추가한다.
- 같은 가격은 날짜가 달라도 중복 저장하지 않는다.
- 같은 날 같은 가격은 반드시 중복 저장하지 않는다.

---

## 7. 상태 정책
상태값:
- `ACTIVE`
- `MISSING`
- `SUSPECT_SOLD`
- `ARCHIVED`

전이 규칙:
- 추출 성공 시 `ACTIVE`, `missingCount=0`
- 추출 실패 1~2회는 `MISSING`
- 추출 실패 3회 이상은 `SUSPECT_SOLD`
- `lastSeenAt` 기준 7일 이상 미확인은 `SUSPECT_SOLD`
- `lastSeenAt` 기준 30일 이상 미확인은 `ARCHIVED`

---

## 8. UI 요구사항
### Overlay
- DETAIL 페이지에서만 표시한다.
- 현재가, 이전가, 가격 차이, 첫 확인일, 기록 수, 상태를 표시한다.
- 같은 페이지에서 여러 번 실행돼도 overlay는 1개만 유지한다.

### Popup
- 최근 확인 차량을 `lastSeenAt` 내림차순으로 표시한다.
- 최신 가격, 가격 변동, 상태를 표시한다.
- 차량 클릭 시 저장된 원본 URL을 새 탭으로 연다.

---

## 9. 안정성 요구사항
- SPA URL 변경을 감지한다.
- DOM 변경 감지는 debounce를 적용한다.
- DOM 지연 렌더링을 고려해 제한된 재시도를 허용한다.
- extractor는 storage를 직접 호출하지 않는다.
- storage는 DOM에 접근하지 않는다.
- background에는 비즈니스 로직을 넣지 않는다.

---

## 10. 검증 기준
최소 통과 기준:
- `npm test`에서 extractor/history/status/overlay 하네스가 통과한다.
- Chrome 확장 프로그램으로 로드할 수 있다.
- Encar LIST 방문 시 차량 데이터가 저장된다.
- Encar DETAIL 방문 시 상세 데이터가 저장되고 overlay가 표시된다.
- popup에서 최근 차량 목록을 볼 수 있다.

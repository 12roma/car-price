# GA4 DebugView 수동 검증 체크리스트

작성일: 2026-05-24

목적: 현재 연결된 GA4 이벤트(`car_price_observed`, `car_price_changed`, `car_status_changed`)를 Google Analytics 4 DebugView에서 수동 검증하기 위한 절차

## 1. 사전 준비

### 1-1. 실제 Measurement Protocol 설정 위치

실제 GA4 설정값 입력 위치:

- [utils/ga-config.js](/Users/shogo/car-price-tracker/utils/ga-config.js:16)

바꿔야 하는 값:

- `measurementId`
- `apiSecret`

예시:

```js
const config = {
  measurementId: 'G-1234567890',
  apiSecret: 'your-real-api-secret',
  endpoint: 'https://www.google-analytics.com/mp/collect',
  clientIdStorageKey: 'ga_client_id',
  debugEnabled: isDebugEnabled()
};
```

### 1-2. Debug 모드 활성화

둘 중 하나를 사용:

1. URL query

```text
?gaDebug=1
```

2. DevTools Console

```js
localStorage.setItem('gaDebug', 'true');
location.reload();
```

비활성화:

```js
localStorage.removeItem('gaDebug');
location.reload();
```

### 1-3. Debug 모드에서 기대되는 동작

- GA 이벤트 전송 시 `console.debug('[GA DEBUG] outbound event', ...)` 로그 출력
- 로그에는 `vehicleNo`, `url`, `title`이 포함되면 안 됨
- Debug 모드에서는 이벤트 params에 `debug_mode: true`가 추가되어 DebugView 확인이 쉬워짐
- 저장/렌더/UI/Firebase 흐름은 기존과 동일하게 동작해야 함

## 2. 콘솔 로그 확인 규칙

개발자도구 Console에서 아래 형식을 확인:

```js
[GA DEBUG] outbound event {
  eventName: 'car_price_observed',
  params: {
    car_id: '174397123',
    price_manwon: 1890,
    event_source: 'DETAIL',
    price_range: '1000_to_2000',
    year: 2022,
    mileage_bucket: 'under_3',
    is_first_observation: false,
    days_since_first_seen: 3,
    debug_mode: true
  }
}
```

필수 확인:

- `vehicleNo` 없음
- `url` 없음
- `title` 없음
- `apiSecret` 없음
- `client_id` 없음

## 3. DebugView 검증 체크리스트

GA4 Admin 또는 Configure 메뉴에서 DebugView를 연 뒤 아래를 순서대로 확인한다.

### 3-1. DETAIL 차량 방문

절차:

1. `?gaDebug=1` 상태로 상세 페이지 진입
2. 유효한 가격이 있는 차량 상세를 연다
3. 페이지 내 tracker UI가 정상 렌더되는지 확인한다

기대 결과:

- Console에 `car_price_observed` 로그 1회 출력
- `event_source: 'DETAIL'`
- `price_manwon`, `price_range`, `year`, `mileage_bucket` 포함
- DebugView에 `car_price_observed` 이벤트 노출

확인 포인트:

- 같은 상세를 짧은 시간 안에 다시 처리해도 observed 이벤트가 과다 발생하지 않는지 확인
- 민감 필드가 콘솔 로그에 없는지 확인

### 3-2. LIST 페이지 방문

현재 상태:

- `trackSeenFromList`는 아직 연결하지 않음
- LIST에서도 가격 저장이 일어나면 `car_price_observed`는 발생할 수 있음

절차:

1. `?gaDebug=1` 상태로 LIST 페이지 진입
2. 가격이 있는 카드가 포함된 결과 목록을 연다

기대 결과:

- Console에 차량별 `car_price_observed` 로그가 보일 수 있음
- `event_source: 'LIST'`
- DebugView에도 `car_price_observed`가 보일 수 있음
- `car_seen_from_list`는 아직 보이지 않는 것이 정상

확인 포인트:

- `trackSeenFromList` 미연결 상태를 오작동으로 오해하지 말 것
- MutationObserver 재처리만으로 page-session reset이 일어나지 않는지 함께 확인

### 3-3. 가격 변경 mock 또는 테스트 데이터

목적:

- `car_price_changed`가 "실제 가격 변경"에서만 발생하는지 확인

권장 방법:

1. 같은 `carId`에 대해 첫 방문 가격과 다른 가격이 들어오도록 fixture 또는 테스트용 DOM 사용
2. 또는 저장된 local 데이터의 마지막 가격을 바꾼 뒤 다른 가격이 추출되는 페이지를 연다

기대 결과:

- `car_price_observed` 발생
- 추가로 `car_price_changed` 발생
- `price_before_manwon`
- `price_after_manwon`
- `price_diff_manwon`
- `price_diff_pct`
- `direction`

중요 확인:

- 날짜만 바뀌고 가격이 같은 경우에는 `car_price_changed`가 발생하면 안 됨
- 이는 현재 구현이 `shouldAppendHistory()`와 `price_changed` 판단을 분리했기 때문에 가능한 동작이다

### 3-4. MISSING 상태 전이

목적:

- `car_status_changed`가 실제 상태 전이에서만 발생하는지 확인

권장 방법:

1. 하네스 또는 수동 호출로 `StorageRepo.markVehicleMissing(carId)`를 실행
2. 같은 차량에 대해 한 번 이상 반복 실행

기대 결과:

- `ACTIVE -> MISSING` 전이 시 `car_status_changed` 발생
- 이후 `MISSING -> MISSING` 같은 동일 상태 반복은 추가 전송되지 않음
- `missing_count`, `status_before`, `status_after`, `last_price_manwon`, `price_range` 확인 가능

예상 전이:

- 1회: `ACTIVE -> MISSING`
- 2회: `MISSING -> MISSING` 이므로 이벤트 없음
- 3회 누적 정책에 따라 `MISSING -> SUSPECT_SOLD` 전이 시 다시 이벤트 발생 가능

## 4. 최종 확인 항목

- DebugView에 `car_price_observed`가 들어온다
- 가격이 실제로 바뀐 경우에만 `car_price_changed`가 들어온다
- 상태가 실제로 바뀐 경우에만 `car_status_changed`가 들어온다
- Console debug 로그에 민감 필드가 없다
- 저장, UI 렌더, Firebase sync가 기존처럼 동작한다
- LIST/DETAIL seen 이벤트가 아직 없는 것은 정상이다

## 5. 현재 연결 상태 요약

현재 연결됨:

- `car_price_observed`
- `car_price_changed`
- `car_status_changed`

아직 미연결:

- `car_seen_from_list`
- `car_seen_from_detail`

관련 코드:

- [utils/ga-config.js](/Users/shogo/car-price-tracker/utils/ga-config.js:1)
- [utils/gaRepository.js](/Users/shogo/car-price-tracker/utils/gaRepository.js:1)
- [utils/storage.js](/Users/shogo/car-price-tracker/utils/storage.js:191)
- [content.js](/Users/shogo/car-price-tracker/content.js:95)

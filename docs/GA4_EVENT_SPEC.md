# GA4 이벤트 스펙 설계

> 대상: 신규 PM (ChatGPT)  
> 전제: chrome.storage.local = 운영 저장소(변경 없음), GA4 = 분석 이벤트 계층만  
> 방향: 개인화 아님. 전체 차량 가격 이벤트 집계 분석

---

## 공통 원칙

### 절대 전송 금지 항목 (전 이벤트 공통)

| 항목 | 이유 |
|------|------|
| `vehicleNo` (차량번호) | 실제 차량 소유자 식별 가능 |
| `url` (방문 URL) | 사용자 방문 패턴 역추적 가능 |
| `title` (차량 제목 전체) | 딜러명·특수 문구 포함 가능. carId로 대체 |
| 사용자 ID / 쿠키 / 이메일 | 확장 특성상 수집 자체가 없음 |

### client_id 처리

GA4 Measurement Protocol은 `client_id`를 필수로 요구한다.  
확장 설치 시 UUID를 생성해 `chrome.storage.local`에 저장하고, 이후 모든 이벤트에 동일 값을 사용한다.  
이 ID는 특정 개인을 식별하지 않으며, 집계 세션 기준으로만 사용된다.

```js
// 예시 (utils/gaClientId.js)
async function getClientId() {
  const stored = await readLocal('ga_client_id');
  if (stored) return stored;
  const id = crypto.randomUUID();
  await writeLocal({ ga_client_id: id });
  return id;
}
```

### GA4 파라미터 제한

- 이벤트 이름: 최대 40자
- 파라미터 이름: 최대 40자
- 파라미터 값(string): 최대 100자
- 커스텀 디멘션: 최대 50개 (무료 기준)
- 커스텀 메트릭: 최대 50개 (무료 기준)

---

## 공용 보조값 정의

### mileage_bucket
```
주행거리(km) → bucket 문자열
< 30,000       → "under_3"
30,000~50,000  → "3_to_5"
50,000~100,000 → "5_to_10"
> 100,000      → "over_10"
null / 파싱불가 → "unknown"
```

### price_range
```
가격(만원) → bucket 문자열
< 500       → "under_500"
500~1,000   → "500_to_1000"
1,000~2,000 → "1000_to_2000"
2,000~3,000 → "2000_to_3000"
> 3,000     → "over_3000"
null        → "unknown"
```

---

## 이벤트 1: `car_price_observed`

### 발생 조건

LIST 또는 DETAIL 페이지에서 유효한 가격이 확인되어 `upsertVehicle`이 완료될 때.  
가격 변동 여부와 무관하게 "오늘 이 차량의 가격이 확인되었다"는 관찰 이벤트.

```
upsertVehicle 완료
  └─ vehicle.price가 isValidVehiclePrice === true
      → car_price_observed 전송
```

### 전송 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|----------|------|------|------|
| `car_id` | string | `"174397123"` | 차량 고유 ID |
| `price_manwon` | integer | `1890` | 확인된 가격 (만원 단위) |
| `source` | string | `"DETAIL"` | `"LIST"` \| `"DETAIL"` |
| `price_range` | string | `"1000_to_2000"` | 가격 구간 |
| `year` | integer\|null | `2022` | 차량 연식 |
| `mileage_bucket` | string | `"under_3"` | 주행거리 구간 |
| `is_first_observation` | boolean | `false` | history가 처음 생성된 시점 여부 |
| `days_since_first_seen` | integer | `14` | firstSeenAt 기준 경과 일수 |

### 보내면 안 되는 것

`vehicleNo`, `url`, `title`, 방문 순서/카드 위치

### GA4 Custom Dimension / Metric 후보

| 종류 | 이름 | 스코프 |
|------|------|--------|
| Dimension | `source` | 이벤트 |
| Dimension | `price_range` | 이벤트 |
| Dimension | `mileage_bucket` | 이벤트 |
| Dimension | `is_first_observation` | 이벤트 |
| Metric | `price_manwon` | 이벤트 |
| Metric | `days_since_first_seen` | 이벤트 |

### BigQuery 분석 가능 질문

```sql
-- 가격대별 추적 분포 (어느 가격대 차량이 가장 많이 관찰되는가)
SELECT price_range, COUNT(*) AS observations
FROM events WHERE event_name = 'car_price_observed'
GROUP BY price_range ORDER BY observations DESC;

-- 연식별 평균 관찰 가격 (만원)
SELECT year, AVG(price_manwon) AS avg_price
FROM events WHERE event_name = 'car_price_observed' AND year IS NOT NULL
GROUP BY year ORDER BY year DESC;

-- 요일·시간대별 추적 활동량 (서비스 이용 패턴)
SELECT EXTRACT(DAYOFWEEK FROM event_date) AS dow,
       EXTRACT(HOUR FROM TIMESTAMP_MICROS(event_timestamp)) AS hour,
       COUNT(*) AS cnt
FROM events WHERE event_name = 'car_price_observed'
GROUP BY dow, hour;

-- 첫 관찰 차량 비율 (신규 유입 차량 속도)
SELECT
  COUNTIF(is_first_observation) / COUNT(*) AS new_car_ratio
FROM events WHERE event_name = 'car_price_observed';
```

---

## 이벤트 2: `car_price_changed`

### 발생 조건

`upsertVehicle` 내에서 `shouldAppendHistory`가 true이며,  
새 가격이 이전 가격과 **실제로 다를 때**만 전송.  
같은 가격의 연속 추적 기록(날짜만 다른 경우)은 전송하지 않는다.

```
shouldAppendHistory === true
  AND incoming.price !== PricePolicy.getLatestPrice(existing.history)
    → car_price_changed 전송
```

### 전송 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|----------|------|------|------|
| `car_id` | string | `"174397123"` | 차량 고유 ID |
| `price_before_manwon` | integer | `2000` | 이전 가격 (만원) |
| `price_after_manwon` | integer | `1890` | 변경된 가격 (만원) |
| `price_diff_manwon` | integer | `-110` | 변동액 (음수=하락) |
| `price_diff_pct` | float | `-5.5` | 변동률 % (소수점 1자리) |
| `direction` | string | `"down"` | `"down"` \| `"up"` |
| `source` | string | `"DETAIL"` | `"LIST"` \| `"DETAIL"` |
| `year` | integer\|null | `2022` | 연식 |
| `price_range_after` | string | `"1000_to_2000"` | 변경 후 가격 구간 |
| `days_since_first_seen` | integer | `30` | 첫 추적 후 경과 일수 |

`price_diff_pct` 계산:
```js
Math.round((price_after - price_before) / price_before * 1000) / 10
// 20,000,000 → 18,900,000 = -5.5
```

### 보내면 안 되는 것

`vehicleNo`, `url`, `title`, 절대 가격 외 개인 식별 가능 값

### GA4 Custom Dimension / Metric 후보

| 종류 | 이름 | 스코프 |
|------|------|--------|
| Dimension | `direction` | 이벤트 |
| Dimension | `source` | 이벤트 |
| Dimension | `price_range_after` | 이벤트 |
| Metric | `price_diff_manwon` | 이벤트 |
| Metric | `price_diff_pct` | 이벤트 |
| Metric | `days_since_first_seen` | 이벤트 |

### BigQuery 분석 가능 질문

```sql
-- 가격 하락 vs 상승 비율
SELECT direction, COUNT(*) AS cnt,
       ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
FROM events WHERE event_name = 'car_price_changed'
GROUP BY direction;

-- 가격대별 평균 변동폭 (비싼 차일수록 더 많이 깎이는가)
SELECT price_range_after, AVG(price_diff_manwon) AS avg_diff,
       AVG(price_diff_pct) AS avg_pct
FROM events WHERE event_name = 'car_price_changed' AND direction = 'down'
GROUP BY price_range_after;

-- 첫 추적 후 며칠 만에 가격이 변동하는가 (분포)
SELECT
  CASE
    WHEN days_since_first_seen <= 7   THEN "1주 이내"
    WHEN days_since_first_seen <= 30  THEN "1개월 이내"
    WHEN days_since_first_seen <= 90  THEN "3개월 이내"
    ELSE "3개월 초과"
  END AS bucket,
  COUNT(*) AS cnt
FROM events WHERE event_name = 'car_price_changed'
GROUP BY bucket;

-- 요일별 가격 변동 빈도 (월요일에 가격 조정이 많은가)
SELECT EXTRACT(DAYOFWEEK FROM event_date) AS dow, COUNT(*) AS cnt
FROM events WHERE event_name = 'car_price_changed'
GROUP BY dow ORDER BY dow;
```

---

## 이벤트 3: `car_status_changed`

### 발생 조건

`StatusPolicy.markMissing` 또는 `StatusPolicy.markActive` 호출 결과로  
vehicle.status 값이 **실제로 바뀔 때**만 전송.  
`evaluateStatus`(팝업 표시용 재계산)는 포함하지 않음.

```
markMissing 호출 → status 전이 발생 (ACTIVE→MISSING, MISSING→SUSPECT_SOLD)
  → car_status_changed 전송

markActive 호출 → 이전 status가 ACTIVE가 아닌 경우
  → car_status_changed 전송 (MISSING→ACTIVE 복귀 추적용)
```

### 전송 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|----------|------|------|------|
| `car_id` | string | `"174397123"` | 차량 고유 ID |
| `status_before` | string | `"ACTIVE"` | 전이 전 상태 |
| `status_after` | string | `"MISSING"` | 전이 후 상태 |
| `missing_count` | integer | `1` | 연속 미노출 횟수 |
| `days_since_first_seen` | integer | `21` | 첫 추적 후 경과 일수 |
| `last_price_manwon` | integer\|null | `1890` | 마지막 확인 가격 (만원) |
| `price_range` | string | `"1000_to_2000"` | 마지막 가격 구간 |

### 보내면 안 되는 것

`vehicleNo`, `url`, `title`, `year` (status 분석과 무관)

### GA4 Custom Dimension / Metric 후보

| 종류 | 이름 | 스코프 |
|------|------|--------|
| Dimension | `status_before` | 이벤트 |
| Dimension | `status_after` | 이벤트 |
| Dimension | `price_range` | 이벤트 |
| Metric | `missing_count` | 이벤트 |
| Metric | `days_since_first_seen` | 이벤트 |
| Metric | `last_price_manwon` | 이벤트 |

### BigQuery 분석 가능 질문

```sql
-- 전이 경로별 빈도
SELECT CONCAT(status_before, ' → ', status_after) AS transition, COUNT(*) AS cnt
FROM events WHERE event_name = 'car_status_changed'
GROUP BY transition ORDER BY cnt DESC;

-- ACTIVE → SUSPECT_SOLD까지 평균 소요 일수 (가격대별)
SELECT price_range, AVG(days_since_first_seen) AS avg_days_to_sold
FROM events
WHERE event_name = 'car_status_changed'
  AND status_before = 'ACTIVE' AND status_after = 'SUSPECT_SOLD'
GROUP BY price_range;

-- MISSING → ACTIVE 복귀율 (등록 취소 후 재등록 비율)
WITH missing_cars AS (
  SELECT car_id FROM events
  WHERE event_name = 'car_status_changed' AND status_after = 'MISSING'
),
revived AS (
  SELECT car_id FROM events
  WHERE event_name = 'car_status_changed'
    AND status_before = 'MISSING' AND status_after = 'ACTIVE'
)
SELECT
  COUNT(DISTINCT revived.car_id) / COUNT(DISTINCT missing_cars.car_id) AS revival_rate
FROM missing_cars LEFT JOIN revived USING(car_id);

-- 월별 SUSPECT_SOLD 전환 건수 (계절성 확인)
SELECT FORMAT_DATE('%Y-%m', event_date) AS month, COUNT(*) AS sold_cnt
FROM events
WHERE event_name = 'car_status_changed' AND status_after = 'SUSPECT_SOLD'
GROUP BY month ORDER BY month;
```

---

## 이벤트 4: `car_seen_from_list`

### 발생 조건

`processListPage` 실행 중 `extractListVehicles`가 성공하여  
차량 카드가 추출될 때 **카드 1건당 1회** 전송.  
가격 유무와 무관하게 발생. (추출 성공 = carId 또는 URL이 확인된 카드)

```
extractListVehicles 완료 → vehicles 배열의 각 항목
  → car_seen_from_list 전송 (가격 없어도 전송)
```

### 전송 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|----------|------|------|------|
| `car_id` | string\|null | `"174397123"` | 차량 ID (없으면 null) |
| `has_price` | boolean | `true` | 유효한 가격 추출 성공 여부 |
| `price_manwon` | integer\|null | `1890` | 가격 (만원, 없으면 null) |
| `price_range` | string | `"1000_to_2000"` | 가격 구간 (`"unknown"` 가능) |
| `is_known_car` | boolean | `false` | chrome.storage.local에 이미 존재하는 차량 |
| `year` | integer\|null | `2022` | 연식 |

`is_known_car`: `upsertVehicle` 내 `getVehicle` 조회 결과로 판단.  
existing이 null이면 false, 존재하면 true.

### 보내면 안 되는 것

`vehicleNo`, `url`, `title`, 카드의 리스트 내 위치·순서 (사용자 검색 필터 역추적 가능)

### GA4 Custom Dimension / Metric 후보

| 종류 | 이름 | 스코프 |
|------|------|--------|
| Dimension | `has_price` | 이벤트 |
| Dimension | `is_known_car` | 이벤트 |
| Dimension | `price_range` | 이벤트 |
| Metric | `price_manwon` | 이벤트 |

### BigQuery 분석 가능 질문

```sql
-- LIST에서 새로 발견되는 차량 비율 (신규 매물 유입 속도 지표)
SELECT
  COUNTIF(NOT is_known_car) AS new_cars,
  COUNTIF(is_known_car) AS known_cars,
  ROUND(COUNTIF(NOT is_known_car) * 100.0 / COUNT(*), 1) AS new_ratio_pct
FROM events WHERE event_name = 'car_seen_from_list';

-- 가격 없는 카드 비율 (리스/렌트/계약중 등 비정상 비율)
SELECT
  ROUND(COUNTIF(NOT has_price) * 100.0 / COUNT(*), 1) AS no_price_ratio_pct
FROM events WHERE event_name = 'car_seen_from_list';

-- 가격대별 LIST 노출 분포
SELECT price_range, COUNT(*) AS cnt
FROM events WHERE event_name = 'car_seen_from_list' AND has_price
GROUP BY price_range ORDER BY cnt DESC;

-- 시간대별 LIST 탐색 빈도 (서비스 이용 피크 시간)
SELECT EXTRACT(HOUR FROM TIMESTAMP_MICROS(event_timestamp)) AS hour,
       COUNT(DISTINCT event_bundle_sequence_id) AS sessions
FROM events WHERE event_name = 'car_seen_from_list'
GROUP BY hour ORDER BY hour;
```

---

## 이벤트 5: `car_seen_from_detail`

### 발생 조건

`processDetailPage` 실행 중 `extractDetailVehicle`이 차량 데이터를 성공적으로 추출하고  
`upsertVehicle`이 완료된 후 전송. 가격 추출 실패(NO_PRICE) 시 전송하지 않음.

```
extractDetailVehicle 성공 (vehicle !== null, error === null)
  + upsertVehicle 완료
    → car_seen_from_detail 전송
```

### 전송 파라미터

| 파라미터 | 타입 | 예시 | 설명 |
|----------|------|------|------|
| `car_id` | string | `"174397123"` | 차량 고유 ID |
| `price_manwon` | integer | `1890` | 추출된 가격 (만원) |
| `price_range` | string | `"1000_to_2000"` | 가격 구간 |
| `year` | integer\|null | `2022` | 연식 |
| `mileage_bucket` | string | `"under_3"` | 주행거리 구간 |
| `is_first_detail_visit` | boolean | `true` | source.fromDetail이 false였던 차량(첫 DETAIL 방문) |
| `days_since_first_seen` | integer | `5` | firstSeenAt 기준 경과 일수 |

`is_first_detail_visit`: upsert 전 `existing.source.fromDetail === false` 이면 true.

### 보내면 안 되는 것

`vehicleNo`, `url`, `title`, `missingCount` (상태 정보는 status_changed로 분리)

### GA4 Custom Dimension / Metric 후보

| 종류 | 이름 | 스코프 |
|------|------|--------|
| Dimension | `price_range` | 이벤트 |
| Dimension | `mileage_bucket` | 이벤트 |
| Dimension | `is_first_detail_visit` | 이벤트 |
| Metric | `price_manwon` | 이벤트 |
| Metric | `days_since_first_seen` | 이벤트 |

### BigQuery 분석 가능 질문

```sql
-- LIST에서만 보다가 DETAIL까지 들어간 차량 비율 (클릭 전환율 유사 지표)
SELECT
  ROUND(COUNTIF(is_first_detail_visit) * 100.0 / COUNT(*), 1) AS first_detail_pct
FROM events WHERE event_name = 'car_seen_from_detail';

-- DETAIL에서 주로 보는 가격대 × 주행거리 교차 분석
SELECT price_range, mileage_bucket, COUNT(*) AS cnt
FROM events WHERE event_name = 'car_seen_from_detail'
GROUP BY price_range, mileage_bucket
ORDER BY cnt DESC;

-- 연식 × 가격 분포 (DETAIL 방문 차량 기준)
SELECT year, price_range, COUNT(*) AS cnt, AVG(price_manwon) AS avg_price
FROM events WHERE event_name = 'car_seen_from_detail' AND year IS NOT NULL
GROUP BY year, price_range ORDER BY year DESC;

-- 첫 발견(LIST) 후 며칠 만에 DETAIL 방문하는가
SELECT
  CASE
    WHEN days_since_first_seen = 0 THEN "당일"
    WHEN days_since_first_seen <= 3 THEN "3일 이내"
    WHEN days_since_first_seen <= 7 THEN "1주 이내"
    ELSE "1주 초과"
  END AS bucket,
  COUNT(*) AS cnt
FROM events WHERE event_name = 'car_seen_from_detail' AND is_first_detail_visit
GROUP BY bucket;
```

---

## 커스텀 디멘션·메트릭 등록 요약 (GA4 Property 설정)

GA4 콘솔 → Admin → Custom Definitions에 아래 항목 등록 필요.

### Custom Dimensions (이벤트 스코프)

| 등록명 | 대응 파라미터 | 해당 이벤트 |
|--------|--------------|------------|
| Source | `source` | observed, changed, seen_from_list, seen_from_detail |
| Price Range | `price_range` | observed, changed, status_changed, seen_from_list, seen_from_detail |
| Mileage Bucket | `mileage_bucket` | observed, seen_from_detail |
| Direction | `direction` | car_price_changed |
| Status Before | `status_before` | car_status_changed |
| Status After | `status_after` | car_status_changed |
| Is First Observation | `is_first_observation` | car_price_observed |
| Is First Detail Visit | `is_first_detail_visit` | car_seen_from_detail |
| Is Known Car | `is_known_car` | car_seen_from_list |
| Has Price | `has_price` | car_seen_from_list |

### Custom Metrics (이벤트 스코프)

| 등록명 | 대응 파라미터 | 단위 |
|--------|--------------|------|
| Price (manwon) | `price_manwon` | 정수 |
| Price Diff (manwon) | `price_diff_manwon` | 정수 |
| Price Diff (%) | `price_diff_pct` | 소수 |
| Days Since First Seen | `days_since_first_seen` | 정수 |
| Missing Count | `missing_count` | 정수 |

---

## 이벤트 발생 위치 매핑 (코드 기준)

| 이벤트 | 발생 파일 | 발생 함수 | 조건 |
|--------|----------|----------|------|
| `car_price_observed` | `utils/storage.js` | `upsertVehicle` | 가격 유효 시 항상 |
| `car_price_changed` | `utils/storage.js` | `upsertVehicle` | shouldAppendHistory && 가격 상이 |
| `car_status_changed` | `utils/storage.js` | `upsertVehicle` / `markVehicleMissing` | status 전이 시 |
| `car_seen_from_list` | `content.js` | `processListPage` | 카드 추출 완료 시 |
| `car_seen_from_detail` | `content.js` | `processDetailPage` | 데이터 추출 + upsert 완료 시 |

---

## 미구현 항목 (다음 단계)

- [ ] `utils/gaRepository.js` 신규 작성 (Measurement Protocol HTTP 래퍼)
- [ ] `utils/gaClientId.js` 신규 작성 (익명 UUID 관리)
- [ ] `storage.js`에 GA 이벤트 호출 삽입
- [ ] `content.js`에 seen_from_list / seen_from_detail 호출 삽입
- [ ] GA4 Property 생성 + BigQuery 연동 활성화
- [ ] `manifest.json` host_permissions에 `https://www.google-analytics.com/*` 추가
- [ ] 개발용 `?gaDebug=1` 플래그로 GA4 DebugView 전송 모드 분기

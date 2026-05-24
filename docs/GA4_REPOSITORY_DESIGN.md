# GaRepository 인터페이스 설계

> 목적: GA4 이벤트 계층 인터페이스 최종 정의 (Codex 구현 기준)  
> 전제: 저장 흐름 차단 금지 / vehicleNo·url·title 전송 금지 / user_id 금지

---

## 1. 공개 함수 목록

| 함수 | 호출 위치 | 역할 |
|------|----------|------|
| `init(config)` | `content.js` 최초 로드 시 | measurement_id·api_secret 설정 |
| `isReady()` | 각 호출 전 guard | 초기화 여부 확인 |
| `resetPageSession()` | `content.js` URL 변경 시 | LIST dedupe 상태 초기화 |
| `trackPriceObserved(vehicle, sourceType)` | `storage.js` — `upsertVehicle` | 가격 확인될 때마다 |
| `trackPriceChanged(vehicle, priceBeforeWon, sourceType)` | `storage.js` — `upsertVehicle` | 가격 실제 변경 시 |
| `trackStatusChanged(vehicle, statusBefore)` | `storage.js` — `upsertVehicle` / `markVehicleMissing` | status 전이 시 |
| `trackSeenFromList(vehicle, isKnownCar)` | `content.js` — `processListPage` | LIST 카드 추출 시 |
| `trackSeenFromDetail(vehicle, isFirstDetailVisit)` | `content.js` — `processDetailPage` | DETAIL 방문 성공 시 |

---

## 2. 각 함수 Input / Output

모든 함수는 `Promise<void>`를 반환하며, 절대 throw하지 않는다.

### `init(config)`
```
Input:
  config.measurementId: string  — GA4 Measurement ID (G-XXXXXXXX)
  config.apiSecret: string      — Measurement Protocol API Secret

Output: void (동기)
```

### `isReady()`
```
Input: 없음
Output: boolean — init 완료 AND measurementId/apiSecret 존재
```

### `resetPageSession()`
```
Input: 없음
Output: void (동기) — _seenListCarIds Set 초기화
```

### `trackPriceObserved(vehicle, sourceType)`
```
Input:
  vehicle: StoredVehicle — upsert 완료된 차량 객체
  sourceType: 'LIST' | 'DETAIL'

전송 파라미터:
  car_id, price_manwon, source, price_range,
  year, mileage_bucket, is_first_observation, days_since_first_seen

Dedupe: 같은 car_id는 60초 이내 재전송 차단 (LIST 폭탄 방지)

Output: Promise<void>
```

### `trackPriceChanged(vehicle, priceBeforeWon, sourceType)`
```
Input:
  vehicle: StoredVehicle        — 변경 후 차량 (새 가격이 history에 반영된 상태)
  priceBeforeWon: number        — 변경 전 가격 (원 단위, 호출자가 캡처)
  sourceType: 'LIST' | 'DETAIL'

전송 파라미터:
  car_id, price_before_manwon, price_after_manwon,
  price_diff_manwon, price_diff_pct, direction,
  source, price_range_after, year, days_since_first_seen

Guard: priceBeforeWon === latestPrice이면 전송 안 함

Output: Promise<void>
```

### `trackStatusChanged(vehicle, statusBefore)`
```
Input:
  vehicle: StoredVehicle  — 전이 후 차량 (vehicle.status = 새 상태)
  statusBefore: string    — 전이 전 상태 (호출자가 캡처)

전송 파라미터:
  car_id, status_before, status_after,
  missing_count, days_since_first_seen, last_price_manwon, price_range

Guard: statusBefore === vehicle.status이면 전송 안 함

Output: Promise<void>
```

### `trackSeenFromList(vehicle, isKnownCar)`
```
Input:
  vehicle: ExtractedVehicle — extractor가 반환한 원본 (저장 전일 수 있음)
  isKnownCar: boolean       — chrome.storage.local에 이미 존재하는 차량 여부

전송 파라미터:
  car_id, has_price, price_manwon, price_range, is_known_car, year

Dedupe: 같은 car_id는 현재 페이지 세션 내 1회만 전송
         (resetPageSession 호출까지 유지)

Output: Promise<void>
```

### `trackSeenFromDetail(vehicle, isFirstDetailVisit)`
```
Input:
  vehicle: StoredVehicle         — upsert 완료된 차량
  isFirstDetailVisit: boolean    — 이번 upsert 전 source.fromDetail이 false였는지 여부

전송 파라미터:
  car_id, price_manwon, price_range,
  year, mileage_bucket, is_first_detail_visit, days_since_first_seen

Output: Promise<void>
```

---

## 3. Sanitize 규칙

### 금지 필드 (차량 객체에서 참조 자체를 차단)

| 필드 | 이유 |
|------|------|
| `vehicleNo` | 차량 소유자 식별 가능 |
| `url` | 방문 패턴 역추적 가능 |
| `title` | 딜러명 등 포함 가능 |
| `fallbackKey` | URL 포함 |
| `priceElement` | DOM 레퍼런스 |
| `cardElement` | DOM 레퍼런스 |
| `sourceType` | raw 필드 — source 파라미터로 정규화해서 사용 |

구현: 함수 진입 시 `_stripForbidden(vehicle)` 호출로 방어적 제거.  
실제 전송 파라미터는 화이트리스트 기반 개별 추출만 허용.

### 값 변환 규칙

| 원본 | 변환 |
|------|------|
| 가격 (원 단위 정수) | `Math.round(priceWon / 10000)` → 만원 정수 |
| 주행거리 string `"12234km"` | km 파싱 → mileage_bucket |
| 가격 만원 | → price_range bucket |
| timestamp ms | `Math.floor((now - ts) / 86400000)` → 일수 정수 |
| float | `Math.round(n * 10) / 10` → 소수점 1자리 |
| string | `String(v).slice(0, 100)` → 100자 절삭 |

---

## 4. Validation 규칙

### 이벤트명
```
/^[a-z][a-z0-9_]{0,39}$/
위반 시: console.warn 후 전송 중단
```

### 파라미터명
```
각 key: /^[a-z][a-z0-9_]{0,39}$/
위반 시: console.warn 후 전송 중단
```

### 파라미터값
```
string: 최대 100자 (초과 시 truncate, warn 없음)
integer: Math.round 후 Number.isFinite 체크
float: 위와 동일
null/undefined: 전송 payload에서 자동 제외 (GA4에서 null param은 reject)
```

### 필수값 부재 시 처리
```
car_id가 없거나 falsy → 이벤트 전송 자체 skip (warn 없음)
가격이 isValidVehiclePrice === false → price_manwon 없이 전송하거나 skip
```

---

## 5. storage.js / content.js 호출 예시

### storage.js — `upsertVehicle` 수정 포인트

```js
async function upsertVehicle(incoming) {
  const lookupId = incoming.carId || incoming.fallbackKey;
  if (!lookupId) throw new Error('carId 또는 fallbackKey 필요');

  const existing = await getVehicle(lookupId);

  // ── GA 컨텍스트 캡처 (저장 전) ──
  const statusBefore = existing ? existing.status : null;
  const priceBeforeWon = existing ? PricePolicy.getLatestPrice(existing.history) : null;

  let vehicle = existing
    ? MergePolicy.mergeVehicle(existing, incoming)
    : MergePolicy.createVehicle(incoming);

  vehicle = (await sanitizeAndPersistVehicle(lookupId, vehicle)) || vehicle;

  // history append
  let priceActuallyChanged = false;
  if (incoming.price !== null && incoming.price !== undefined) {
    const norm = PricePolicy.normalizeStoredPrice(incoming.price);
    if (PricePolicy.isValidVehiclePrice(norm)) {
      const today = PricePolicy.todayStr();
      if (PricePolicy.shouldAppendHistory(vehicle.history, norm, today)) {
        if (priceBeforeWon !== norm) priceActuallyChanged = true;
        vehicle = { ...vehicle, history: [...vehicle.history, PricePolicy.makeHistoryRecord(norm, incoming.sourceType)] };
      }
    }
  }

  vehicle = { ...vehicle, price: PricePolicy.getLatestPrice(vehicle.history) || null };
  vehicle = StatusPolicy.markActive(vehicle);

  await _save(lookupId, vehicle);   // ← 저장은 항상 먼저, GA는 이후

  // Firebase sync (기존 로직)
  const firebaseRepo = getFirebaseRepository();
  if (firebaseRepo) _enqueueFirebaseSync({ lookupId, vehicle, sourceType: incoming.sourceType, firebaseRepo });

  // GA 이벤트 (fire-and-forget, throw 없음, 저장 흐름 차단 없음)
  const ga = typeof GaRepository !== 'undefined' ? GaRepository : null;
  if (ga && ga.isReady()) {
    void ga.trackPriceObserved(vehicle, incoming.sourceType);

    if (priceActuallyChanged && priceBeforeWon) {
      void ga.trackPriceChanged(vehicle, priceBeforeWon, incoming.sourceType);
    }

    if (statusBefore && statusBefore !== vehicle.status) {
      void ga.trackStatusChanged(vehicle, statusBefore);
    }
  }

  return vehicle;
}
```

### storage.js — `markVehicleMissing` 수정 포인트

```js
async function markVehicleMissing(carId) {
  const existing = await getVehicle(carId);
  if (!existing) return null;

  const statusBefore = existing.status;
  const updated = StatusPolicy.markMissing(existing);
  await _save(carId, updated);

  const ga = typeof GaRepository !== 'undefined' ? GaRepository : null;
  if (ga && ga.isReady() && statusBefore !== updated.status) {
    void ga.trackStatusChanged(updated, statusBefore);
  }

  return updated;
}
```

### content.js — `processListPage` 수정 포인트

```js
async function processListPage(url) {
  _lastProcessedUrl = url;
  GaRepository && GaRepository.resetPageSession();   // ← URL 변경 시 dedupe 초기화

  const { vehicles, error } = Extractor.extractListVehicles(document);
  if (error === ENCAR.EXTRACT_ERRORS.NO_CARD_ROOT) {
    await retryOnce(processListPage, url);
    return;
  }

  for (const v of vehicles) {
    try { Overlay.ensureListPlaceholder(v); } catch (_) {}
  }

  for (const v of vehicles) {
    if (!v.price) {
      // 가격 없는 카드도 GA 이벤트는 전송 (has_price=false)
      const ga = typeof GaRepository !== 'undefined' ? GaRepository : null;
      if (ga && ga.isReady()) void ga.trackSeenFromList(v, false);
      continue;
    }
    try {
      const isKnownCar = Boolean(await StorageRepo.getVehicle(v.carId || v.fallbackKey));
      // ↑ upsert 전에 존재 여부 확인. 비용이 걱정되면 upsertVehicle이 { vehicle, isNew } 반환하도록 변경 가능
      const saved = await StorageRepo.upsertVehicle(v);
      Overlay.renderOrUpdateListItem({ ...saved, cardElement: v.cardElement, priceElement: v.priceElement });

      const ga = typeof GaRepository !== 'undefined' ? GaRepository : null;
      if (ga && ga.isReady()) void ga.trackSeenFromList(v, isKnownCar);
    } catch (e) {}
  }
}
```

> **대안**: `getVehicle` 추가 호출이 부담스러우면 `upsertVehicle`이 `{ vehicle, isNew: boolean }`을 반환하도록 변경.

### content.js — `processDetailPage` 수정 포인트

```js
// upsertVehicle 직전에 source.fromDetail 캡처
const existing = await StorageRepo.getVehicle(vehicle.carId || vehicle.fallbackKey);
const isFirstDetailVisit = !existing || !existing.source || !existing.source.fromDetail;

const saved = await StorageRepo.upsertVehicle(vehicle);
Overlay.renderOrUpdate({ ...saved, priceElement: vehicle.priceElement });

const ga = typeof GaRepository !== 'undefined' ? GaRepository : null;
if (ga && ga.isReady()) {
  void ga.trackSeenFromDetail(saved, isFirstDetailVisit);
}
```

---

## 6. 구현 전 리스크

### R1 — API Secret 노출 (심각도: 중간)
**내용**: Manifest V3 확장 코드는 Chrome DevTools로 누구나 볼 수 있다.  
`api_secret`이 코드/config에 포함되면 노출된다.  
**대응**: 
- 이벤트를 직접 위조해 GA를 오염시킬 수 있지만, 이 서비스는 **내부 분석 전용**이므로 허용 수준.
- 공개 배포 시에는 서버 프록시(Cloud Functions) 경유 필수.
- `ga-config.js`에 별도 분리하고 `.gitignore` 처리.

### R2 — GA4 Measurement Protocol 전송 속도 제한
**내용**: Measurement Protocol은 `client_id`당 공식 rate limit이 명시되지 않지만,  
LIST 30개 × 빠른 페이지 전환 = 수십 건/분 발생 가능.  
**대응**: 
- `trackPriceObserved` 60초 cooldown이 1차 방어.
- `trackSeenFromList` 페이지 세션 dedupe이 2차 방어.
- 추가 필요 시 이벤트 queue + 1초 debatch.

### R3 — LIST `isKnownCar` 확인을 위한 추가 storage.get 비용
**내용**: 현재 설계에서는 `processListPage`가 `StorageRepo.getVehicle`을 카드별 1회 추가 호출한다.  
30개 카드 = chrome.storage.local 30회 추가 read.  
**대응**:
- Option A: `upsertVehicle`이 `{ vehicle, isNew }` 반환 (API 변경 필요)
- Option B: `isKnownCar=null` 허용하고 GA에서 미상으로 처리
- Option C: 페이지 진입 시 `getAllVehicles()`로 ID Set 캐싱 후 비교

### R4 — BigQuery 반영 지연 (24–48시간)
**내용**: GA4 → BigQuery Export는 실시간이 아님.  
**대응**: BigQuery는 분석용으로만 사용, 운영 판단은 항상 chrome.storage.local 기준 유지.

### R5 — Content Security Policy (CSP) 충돌
**내용**: 일부 Encar 페이지가 strict CSP를 설정할 경우 `fetch`가 차단될 수 있음.  
**대응**: `manifest.json` `host_permissions`에 `https://www.google-analytics.com/*` 추가 필수.  
CSP 차단 시 `console.warn`으로 처리되므로 저장 흐름 영향 없음.

### R6 — GA4 이벤트 파라미터 이름 충돌
**내용**: GA4에는 자동 수집 예약어가 있다.  
`source`, `session_id`, `page_location` 등은 GA4 내부 예약어.  
`source`를 커스텀 파라미터로 등록하면 충돌 위험.  
**대응**: `source` → `event_source`로 이름 변경 검토.  
GA4 예약 파라미터 전체 목록 확인 후 최종 결정.

### R7 — `car_id`의 장기 추적 가능성
**내용**: `car_id`가 GA4 이벤트에 포함되면 특정 차량의 전체 관찰 이력이 BigQuery에 누적된다.  
이는 개인 정보가 아니지만 차량 단위 행동 분석이 가능해진다.  
**대응**: 이 서비스의 목적이 **차량 단위 가격 추세 분석**이므로 의도된 설계.  
사용자 ID와 연결되지 않으므로 GDPR 적용 범위 밖.

---

## 구현 파일 위치

| 파일 | 역할 |
|------|------|
| `utils/gaRepository.js` | 본 인터페이스 구현체 |
| `utils/ga-config.js` | measurement_id, api_secret (gitignore 필수) |
| `manifest.json` | host_permissions에 google-analytics.com 추가 |
| `content.js` | init 호출 + resetPageSession + seen 이벤트 |
| `utils/storage.js` | observed / changed / status_changed 이벤트 |

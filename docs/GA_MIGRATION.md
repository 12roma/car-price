# GA 마이그레이션 방향 문서

> 작성자: Claude (현 개발 에이전트)  
> 수신: 신규 PM (ChatGPT)  
> 목적: 현 시스템 구조 전달 + Google Analytics(GA4) 전환 방향 제안

---

## 1. 현재 시스템 구조 요약

### 1-1. 서비스 성격

**Encar 가격 추적기** — Chrome Extension (Manifest V3)

사용자가 한국 중고차 플랫폼 Encar(www.encar.com)에서 직접 방문한 차량 페이지의 가격을
자동으로 기록하고, 가격 변동을 시각적으로 보여주는 확장 프로그램.

- 전체 크롤링 없음. **사용자가 직접 방문한 페이지에서만** 데이터 수집
- 외부 서버 요청 없음 (Firebase sync 제외)
- 개인 정보 수집 없음

---

### 1-2. 데이터 흐름

```
[Encar 페이지 방문]
      │
      ▼
[content.js — 오케스트레이터]
      │
      ├─ extractor.js ──── DOM에서 차량 데이터 추출 (carId, price, title...)
      │
      ├─ StorageRepo ────── chrome.storage.local에 저장 (1차 DB, 항상 즉시)
      │         │
      │         └─ Firebase Firestore ── 조건부 원격 동기화 (2차 DB, 쿨다운 적용)
      │
      └─ Overlay ────────── 상세/리스트 페이지에 UI 삽입
```

---

### 1-3. 현재 DB 계층 (2-tier)

| 계층 | 기술 | 역할 | 특성 |
|------|------|------|------|
| 1차 | `chrome.storage.local` | 모든 읽기/쓰기 | 즉시, 오프라인 가능 |
| 2차 | Firebase Firestore | 클라우드 백업/복원 | 조건부 비동기, 쿨다운 있음 |

**Firebase 동기화 조건 (`firebaseSyncPolicy.js`)**:
- 첫 방문 / 가격 변경 / 차량번호 변경 → 즉시 동기화
- 변경 없을 때: DETAIL 1시간, LIST 6시간 쿨다운
- 분산락: 멀티탭 환경에서 중복 동기화 방지

---

### 1-4. 차량 데이터 모델

```json
{
  "carId": "174397123",
  "title": "현대 아반떼 CN7 1.6 가솔린",
  "url": "https://www.encar.com/dc/dc_cardetailview.do?carid=174397123",
  "status": "ACTIVE",
  "history": [
    { "price": 20000000, "date": "2026-01-01", "timestamp": 1704067200000, "source": "LIST" },
    { "price": 18900000, "date": "2026-04-01", "timestamp": 1743436800000, "source": "DETAIL" },
    { "price": 18900000, "date": "2026-04-02", "timestamp": 1743523200000, "source": "LIST" }
  ],
  "source": { "fromList": true, "fromDetail": true },
  "vehicleNo": "123가4567",
  "mileage": "12234km",
  "year": 2022,
  "firstSeenAt": 1704067200000,
  "lastSeenAt": 1743523200000,
  "missingCount": 0
}
```

**history 저장 정책**:
- 같은 날 + 같은 가격 → 저장 안 함 (중복 방지)
- 날짜가 다르면 같은 가격도 저장 → 연속 추적 점 표시용

---

### 1-5. UI 계층

| 페이지 | UI | 내용 |
|--------|-----|------|
| 상세 (DETAIL) | 인라인 패널 | 가격 스파크라인 + 변동(▼▲) + N일째 가격 동결 + 차량번호 |
| 리스트 (LIST) | 카드 뱃지 | 가격 상황 + 호버 툴팁(스파크라인 + 날짜별 이력 8건) |

---

## 2. Google Analytics(GA4)의 본질과 DB 역할 가능 범위

### 2-1. GA4가 할 수 있는 것

| 기능 | 설명 |
|------|------|
| **이벤트 수집** | Measurement Protocol으로 차량 방문/가격 변동 이벤트 전송 |
| **BigQuery Export** | GA4 프로젝트 연동 시 원시 이벤트를 BigQuery에 자동 적재 |
| **집계 분석** | 전체 사용자의 특정 차종 가격 추세, 인기 차량 분포 등 분석 |
| **대시보드** | Looker Studio 연동으로 가격 변동 트렌드 시각화 |

### 2-2. GA4가 할 수 없는 것 (DB 역할의 한계)

| 제약 | 이유 |
|------|------|
| **개별 차량 히스토리 읽기** | GA4 Data API는 집계 쿼리만 지원. `WHERE car_id = '174397123'` 형태 불가 |
| **실시간 로컬 복원** | 현재 Firebase가 담당하는 "로컬 삭제 후 원격에서 복원" 기능 불가 |
| **쓴 데이터 즉시 읽기** | GA4는 수집 후 수 시간~1일 지연 발생 |
| **팝업 최근 목록 제공** | `getRecentVehicles()` 같은 쿼리를 GA4에서 실행 불가 |

> **핵심 결론**: GA4는 "분석 도구"이지 "읽고 쓰는 DB"가 아닙니다.  
> `chrome.storage.local`의 역할을 GA4가 대체할 수 없습니다.

---

## 3. 현실적인 GA4 전환 방향 (3가지 옵션)

### Option A — Firebase → GA4 이벤트 (권장)

**Firebase Firestore를 제거하고 GA4 이벤트 트래킹으로 교체.**  
`chrome.storage.local`은 그대로 유지.

```
[현재]  chrome.storage.local  +  Firebase Firestore
[변경]  chrome.storage.local  +  GA4 Measurement Protocol
```

**GA4로 전송할 이벤트 설계:**

```js
// 가격 추적 이벤트
gtag('event', 'car_price_tracked', {
  car_id: '174397123',
  price: 18900000,
  price_change: -1100000,   // 변동액 (없으면 0)
  source: 'DETAIL',          // LIST | DETAIL
  status: 'ACTIVE',
  days_tracked: 14
});

// 가격 변동 이벤트 (변동 있을 때만)
gtag('event', 'car_price_changed', {
  car_id: '174397123',
  price_before: 20000000,
  price_after: 18900000,
  change_rate: -5.5          // 변동률 %
});
```

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 낮음 — `firebaseRepository.js` → `gaRepository.js` 교체 |
| 읽기 기능 손실 | Firebase 원격 복원 기능 사라짐 (로컬 데이터만 의존) |
| 분석 이점 | GA4 대시보드에서 인기 차종, 가격 하락 패턴 등 집계 분석 가능 |
| 비용 | GA4 무료 플랜 기준 월 1,000만 이벤트 무료 |

---

### Option B — GA4 + BigQuery + 경량 API (풀스택)

GA4로 이벤트 수집 → BigQuery 자동 Export → Cloud Functions로 조회 API 제공.

```
Extension → GA4 → BigQuery ← Cloud Functions ← Extension (읽기)
```

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 높음 — 별도 백엔드 필요 |
| 읽기 기능 | 유지 가능 (지연 1일 이상) |
| 실시간성 | BigQuery는 실시간 아님. 팝업 목록은 여전히 local 의존 |
| 비용 | BigQuery 쿼리 비용 발생 |

> 가격 추적이 핵심 기능인 서비스에서 읽기에 1일 지연은 UX 파괴. **추천하지 않음.**

---

### Option C — GA4 이벤트 + Firestore 동시 유지 (하이브리드)

GA4로 분석용 이벤트를 추가하면서, Firebase Firestore는 그대로 유지.

```
chrome.storage.local  +  Firebase Firestore  +  GA4 이벤트 (추가)
```

| 항목 | 평가 |
|------|------|
| 구현 난이도 | 가장 낮음 — GA 이벤트 전송만 추가 |
| 기능 손실 | 없음 |
| 운영 복잡도 | Firebase + GA4 두 서비스 동시 관리 |
| 분석 이점 | GA4 대시보드 + Firestore 모두 사용 가능 |

---

## 4. 권장 마이그레이션 계획 (Option A 기준)

### Phase 1 — GA4 이벤트 레이어 추가 (Firebase 유지)

1. `utils/gaRepository.js` 신규 생성
   - Measurement Protocol HTTP 요청 래퍼
   - `trackCarPriceEvent(vehicle, options)` 인터페이스
2. `storage.js` — Firebase sync 후 GA 이벤트 병행 전송
3. GA4 Property 설정, Measurement ID / API Secret 세팅
4. BigQuery 연동 활성화

### Phase 2 — Firebase 제거

1. `firebaseRepository.js`, `firebaseSyncPolicy.js` 제거
2. 원격 복원 기능 삭제 (로컬만 의존)
3. `manifest.json` host_permissions에서 googleapis.com 제거
4. `dist/firebase.bundle.js` 제거 → 번들 크기 대폭 감소

### Phase 3 — GA4 기반 분석 대시보드 구축

1. Looker Studio 연동
2. 가격 하락 차량 Top N, 차종별 평균 추적 기간 등 리포트

---

## 5. 변경 지점 목록 (Option A 기준)

| 파일 | 변경 내용 |
|------|-----------|
| `utils/gaRepository.js` | 신규 — Measurement Protocol 이벤트 전송 |
| `utils/storage.js` | Firebase sync → GA 이벤트 전송으로 교체 |
| `utils/firebaseRepository.js` | 삭제 |
| `utils/firebaseSyncPolicy.js` | 삭제 |
| `utils/firebase-config.js` | 삭제 |
| `utils/firebase.js` | 삭제 |
| `manifest.json` | host_permissions에서 googleapis.com 제거 |
| `content.js` | Firebase test runner 코드 제거 |
| `dist/firebase.bundle.js` | 삭제 |

---

## 6. 주의 사항

1. **GA4 Measurement Protocol은 Content Security Policy(CSP) 영향을 받습니다.**  
   `manifest.json`에 GA 수집 서버(`www.google-analytics.com`)를 `host_permissions`에 추가 필요.

2. **GA4는 GDPR 대상**입니다.  
   수집 데이터에 개인 식별 정보가 포함되지 않도록 차량 데이터만 전송 (userId 없이 익명 처리).

3. **Measurement Protocol에는 클라이언트 유효성 검증이 없습니다.**  
   잘못된 이벤트를 보내도 에러가 없으므로 초기 테스트에서 GA4 디버그뷰로 검증 필수.

4. **로컬 복원 기능은 포기**해야 합니다.  
   Firebase가 담당하던 "다른 기기에서 로컬 복원" 기능은 GA4로 대체 불가.  
   이 기능이 필요하다면 Option C(하이브리드)를 선택해야 합니다.

---

## 7. 결론

| 질문 | 답 |
|------|-----|
| GA4가 `chrome.storage.local`을 대체할 수 있나? | **아니오** — local은 그대로 유지 |
| GA4가 Firebase Firestore를 대체할 수 있나? | **부분적** — 분석/집계는 가능, 개별 읽기는 불가 |
| 어떤 옵션이 가장 현실적인가? | **Option A** — Firebase 제거, GA4 이벤트 레이어 추가 |
| 마이그레이션 후 잃는 것은? | Firebase 원격 복원 기능 1가지 |
| 마이그레이션 후 얻는 것은? | 번들 크기 감소, 가격 트렌드 분석 대시보드, Firebase 비용 제거 |

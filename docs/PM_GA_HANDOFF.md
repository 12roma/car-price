# PM Handoff: 현재 구조와 GA4 전환 방향

작성일: 2026-05-24

대상: 신규 PM (GPT)

목적: 현 시스템 구조를 빠르게 이해하고, "DB를 Google GA로 바꾼다"는 요구를 제품/기술 관점에서 현실적으로 재정의하기 위한 문서

## 1. 한 줄 결론

이 프로젝트는 현재 `chrome.storage.local`을 운영 DB로 쓰고, Firebase Firestore를 조건부 원격 동기화 계층으로 추가한 구조다.

Google Analytics 4(GA4)는 이 운영 DB를 대체할 수 없다. 다만 Firebase가 담당하던 "원격 저장/복원"을 포기하거나 별도 백엔드를 두는 조건에서, GA4를 "분석 이벤트 수집 계층"으로 붙이는 방향은 가능하다.

## 2. 현재 제품이 하는 일

이 확장 프로그램은 Encar 페이지에서 사용자가 실제로 방문한 차량의 가격을 읽고, 가격 이력을 로컬에 저장하고, 페이지 안에 가격 변화 UI를 보여준다.

핵심 특성:

- 전체 사이트 크롤링이 아니라 방문 기반 추적이다.
- 실시간 사용자 경험은 로컬 저장소 의존이다.
- 팝업 최근 목록, 상세 패널, 리스트 배지는 모두 로컬 데이터 기반이다.
- Firebase는 주 저장소가 아니라 보조 동기화/복원 계층이다.

## 3. 현재 아키텍처

주요 파일 기준 구조:

- `content.js`: 페이지 진입점. 페이지 판별, 추출, 저장, UI 렌더 호출
- `utils/extractor.js`: DOM에서 차량 정보 추출
- `utils/storage.js`: 로컬 저장과 Firebase 동기화 오케스트레이션
- `utils/firebaseSyncPolicy.js`: 원격 동기화 조건과 쿨다운 정책
- `utils/firebaseRepository.js`: Firestore 읽기/쓰기
- `popup.js`: 최근 방문 차량 목록 조회
- `manifest.json`: extension 권한과 content script 로딩 정의

데이터 흐름:

```text
Encar 방문
  -> content.js
  -> extractor.js 로 차량 정보 추출
  -> utils/storage.js 로 upsert
  -> chrome.storage.local 에 즉시 저장
  -> 조건 충족 시 Firebase Firestore 비동기 동기화
  -> overlay / popup UI 갱신
```

## 4. 현재 DB 구조를 정확히 보면

### 4.1 로컬 1차 저장소

운영상 진짜 DB는 `chrome.storage.local`이다.

여기서 담당하는 것:

- 차량 단건 조회
- 차량 목록 조회
- 최근 방문 정렬
- 가격 history 유지
- 팝업 렌더용 데이터 제공
- 상세/리스트 UI 즉시 반영
- 오프라인 동작

관련 코드:

- [utils/storage.js](/Users/shogo/car-price-tracker/utils/storage.js:1)
- [popup.js](/Users/shogo/car-price-tracker/popup.js:82)

### 4.2 Firebase 2차 저장소

Firebase는 항상 쓰는 DB가 아니라, 조건부 원격 동기화와 복원 용도다.

실제 동작:

- 로컬에 차량이 없으면 Firestore에서 복원 시도
- 로컬 저장 후 정책에 맞으면 Firestore로 비동기 upsert
- 멀티탭 중복 동기화 방지를 위해 로컬 락 사용

관련 코드:

- [utils/storage.js](/Users/shogo/car-price-tracker/utils/storage.js:106)
- [utils/firebaseRepository.js](/Users/shogo/car-price-tracker/utils/firebaseRepository.js:1)
- [utils/firebaseSyncPolicy.js](/Users/shogo/car-price-tracker/utils/firebaseSyncPolicy.js:1)

### 4.3 현재 동기화 정책

Firebase 동기화는 아무 때나 하지 않는다.

- 첫 동기화면 전송
- 가격이 바뀌면 전송
- 차량번호가 바뀌면 전송
- 그 외에는 쿨다운 이후에만 전송
- DETAIL 쿨다운: 1시간
- LIST 쿨다운: 6시간

즉, 현재 시스템은 이미 "운영 저장"과 "분석/백업성 전송"을 어느 정도 분리한 구조로 가고 있다.

## 5. 데이터 모델

차량 1건은 대략 아래 구조로 저장된다.

```json
{
  "carId": "174397123",
  "title": "현대 아반떼 CN7 1.6 가솔린",
  "url": "https://www.encar.com/dc/dc_cardetailview.do?carid=174397123",
  "price": 18900000,
  "status": "ACTIVE",
  "vehicleNo": "123가4567",
  "mileage": "12234km",
  "year": 2022,
  "firstSeenAt": 1704067200000,
  "lastSeenAt": 1743523200000,
  "source": {
    "fromList": true,
    "fromDetail": true
  },
  "history": [
    {
      "price": 20000000,
      "date": "2026-01-01",
      "timestamp": 1704067200000,
      "source": "LIST"
    },
    {
      "price": 18900000,
      "date": "2026-04-01",
      "timestamp": 1743436800000,
      "source": "DETAIL"
    }
  ]
}
```

중요한 점:

- 이력은 append 기반이다.
- 같은 날 같은 가격은 중복 저장하지 않는다.
- 최근 목록과 가격 변화 UI는 이 history를 즉시 읽어야 한다.

이 요구사항 때문에 읽기 지연이 큰 분석 도구는 운영 DB를 대체하기 어렵다.

## 6. GA4로 바꾼다는 말의 기술적 의미

여기서 "Google GA"는 현실적으로 `Google Analytics 4`로 해석하는 것이 맞다.

하지만 GA4는 아래 성격이다:

- 이벤트 수집 도구
- 집계 분석 도구
- 대시보드/리포트 도구
- BigQuery export 기반 데이터 레이크 진입점

반대로 GA4가 아닌 것:

- 차량 단건을 즉시 읽는 운영 DB
- 가격 history를 빠르게 복원하는 key-value 저장소
- 팝업 최근 목록을 직접 조회하는 read 모델
- 로컬 데이터 유실 시 즉시 복원하는 백업 저장소

## 7. 왜 GA4가 현재 DB를 대체할 수 없는가

핵심 이유는 세 가지다.

1. 현재 제품은 "쓰기"보다 "즉시 읽기" 요구가 더 강하다.
2. GA4는 이벤트 적재 후 집계 분석에는 강하지만, 개별 차량 record 조회에는 맞지 않는다.
3. 팝업/상세패널/리스트뱃지 모두 로컬 수준의 빠른 조회를 전제로 설계되어 있다.

구체적으로 깨지는 기능:

- `getRecentVehicles()` 같은 최근 목록 조회
- 특정 `carId`의 history 즉시 복원
- 로컬 삭제 후 원격 복구
- 사용자가 페이지를 열었을 때 즉시 가격 추세 표시

즉, "DB를 GA로 변경"은 그대로 실행하면 기능 회귀가 발생한다.

## 8. 내가 보는 현실적인 방향

### 방향 A. Firebase를 제거하고 GA4를 분석 계층으로 교체

구조:

```text
chrome.storage.local + GA4 이벤트
```

의미:

- 운영 DB는 계속 로컬
- Firebase의 원격 복원 기능은 제거
- 대신 차량 방문, 가격 변경, 상태 변화 이벤트를 GA4로 전송

장점:

- 구조 단순화
- Firebase 코드와 번들 제거 가능
- 제품 분석이 쉬워짐

단점:

- 다른 기기 복원 기능 상실
- 로컬 데이터 손실 시 복원 불가

적합한 경우:

- 이 확장 프로그램이 개인 로컬 추적 도구에 더 가깝고, 계정 기반 데이터 복원이 필수가 아닐 때

### 방향 B. Firestore 유지 + GA4 추가

구조:

```text
chrome.storage.local + Firestore + GA4 이벤트
```

의미:

- 현재 사용자 기능은 유지
- GA4는 순수 분석용으로만 추가

장점:

- 기능 손실 없음
- PM/마케팅 관점 분석 가능
- 가장 리스크가 낮음

단점:

- 서비스가 하나 더 늘어 운영 복잡도 증가

적합한 경우:

- 지금 제품 기능을 보존하면서 분석도 필요할 때

### 방향 C. GA4 + BigQuery + 별도 API

구조:

```text
Extension -> GA4 -> BigQuery -> API -> Extension
```

의미:

- 분석 이벤트를 서버성 저장소로 흘리고, API를 통해 다시 읽게 만드는 방식

판단:

- 이건 사실상 "GA로 DB를 대체"가 아니라 "백엔드를 새로 만드는 것"이다.
- 현재 제품 규모 대비 과설계일 가능성이 높다.

## 9. 권장안

내 권장안은 두 단계 중 하나다.

### 권장 1순위

기능 보존이 중요하면 `방향 B`가 맞다.

- 먼저 GA4 이벤트를 추가한다.
- Firebase는 당장 제거하지 않는다.
- 실제로 복원 기능이 얼마나 쓰이는지 확인한 뒤 제거 여부를 판단한다.

### 권장 2순위

원격 복원이 중요하지 않다면 `방향 A`로 간다.

- 로컬 DB는 유지
- Firebase 제거
- GA4는 분석용 이벤트 계층으로 사용

즉, 내가 보기에 절대 피해야 할 해석은 이것이다:

`chrome.storage.local`까지 없애고 GA4를 메인 DB처럼 쓰는 것

이 방향은 현재 제품 요구사항과 맞지 않는다.

## 10. PM이 의사결정 전에 확인해야 할 질문

- 원격 복원 기능이 실제로 필요한가
- 여러 기기 간 데이터 연속성이 제품 요구사항인가
- 지금 필요한 것이 운영 저장소 교체인지, 아니면 분석 체계 추가인지
- 차량번호 같은 필드를 외부 분석 시스템에 보내도 되는지
- 사용자 동의/개인정보/약관 관점에서 이벤트 수집 범위를 어디까지 허용할지

이 질문에 대한 답이 없으면 "GA로 바꾼다"는 결정은 너무 뭉뚱그린 표현이다.

## 11. 내가 제안하는 실행 순서

1. 먼저 용어를 정리한다.
   "DB 전환"인지, "분석 추가"인지 구분해야 한다.

2. 기능 요구를 분리한다.
   운영 저장, 복원, 분석을 각각 따로 본다.

3. 가장 안전한 1차 단계는 GA4 이벤트 추가다.
   현재 UI/저장 흐름은 유지하고 분석만 먼저 붙인다.

4. 실제 사용 데이터를 보고 Firebase 제거 여부를 결정한다.
   복원 기능 사용 가치가 낮으면 그때 제거해도 늦지 않다.

## 12. 구현 관점에서 예상 변경 파일

GA4 분석 계층을 추가할 때 주요 변경 후보:

- `utils/gaRepository.js` 추가
- `utils/storage.js`에서 저장 후 이벤트 전송 호출
- `manifest.json`에 GA 수집 도메인 검토
- Firebase 유지 여부에 따라 `dist/firebase.bundle.js` 및 관련 파일 제거 가능

현재 기준 참고 파일:

- [manifest.json](/Users/shogo/car-price-tracker/manifest.json:1)
- [content.js](/Users/shogo/car-price-tracker/content.js:1)
- [utils/storage.js](/Users/shogo/car-price-tracker/utils/storage.js:1)
- [utils/firebaseRepository.js](/Users/shogo/car-price-tracker/utils/firebaseRepository.js:1)
- [utils/firebaseSyncPolicy.js](/Users/shogo/car-price-tracker/utils/firebaseSyncPolicy.js:1)

## 13. 최종 판단

현재 시스템 구조를 기준으로 보면, GA4는 DB 대체재가 아니라 분석 이벤트 계층이다.

그래서 제품 방향 문장도 아래처럼 바꾸는 것이 정확하다.

"우리 시스템의 운영 저장소는 계속 로컬에 두고, Firebase 원격 계층은 유지 또는 제거를 선택하며, Google Analytics 4는 분석 수집 계층으로 붙인다."

이 문장이 실제 구조와 가장 잘 맞는다.

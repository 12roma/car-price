# car-price

엔카(Encar) 차량 가격 추적용 Chrome Extension 프로젝트입니다.  
방문한 차량의 가격 이력을 `chrome.storage.local`에 저장하고, LIST/DETAIL 화면에서 가격 변동과 추적 상태를 바로 볼 수 있게 구성되어 있습니다.

## 핵심 기능

- LIST 페이지에서 차량 카드 가격 추출
- DETAIL 페이지에서 대표 가격 추출
- 차량별 가격 히스토리 저장
- 가격 변경 여부 판단 및 상태 업데이트
- LIST/DETAIL overlay UI 렌더링
- GA4 이벤트 전송
  - `car_price_observed`
  - `car_seen_from_detail`
  - `car_seen_from_list`

## 현재 구조

- 운영 저장소: `chrome.storage.local`
- 분석 계층: `GA4 Measurement Protocol`
- Firebase: 제거됨

## 주요 파일

- [content.js](./content.js): 페이지 진입점, LIST/DETAIL 처리
- [utils/storage.js](./utils/storage.js): local 저장/조회, history append, status update
- [utils/extractor.js](./utils/extractor.js): LIST/DETAIL 가격/차량 정보 추출
- [utils/overlay.js](./utils/overlay.js): LIST/DETAIL tracker UI 렌더링
- [utils/gaRepository.js](./utils/gaRepository.js): GA4 이벤트 전송
- [manifest.json](./manifest.json): Chrome Extension 설정

## 이벤트

현재 연결된 GA4 이벤트:

- `car_price_observed`
- `car_seen_from_detail`
- `car_seen_from_list`
- `car_price_changed`
- `car_status_changed`

이벤트 스펙 참고:

- [docs/GA4_EVENT_SPEC.md](./docs/GA4_EVENT_SPEC.md)
- [docs/GA4_DEBUG_CHECKLIST.md](./docs/GA4_DEBUG_CHECKLIST.md)

## 개발

의존성 설치:

```bash
npm install
```

테스트 실행:

```bash
npm test
```

Chrome 확장 로드:

1. `chrome://extensions`
2. 개발자 모드 활성화
3. `압축해제된 확장 프로그램 로드`
4. 이 프로젝트 폴더 선택

## 디버깅

GA 디버그 로그가 필요하면 아래 중 하나를 사용합니다.

```js
localStorage.setItem('gaDebug', 'true')
```

또는 URL query:

```text
&gaDebug=1
```

## 문서

- [docs/PM_GA_HANDOFF.md](./docs/PM_GA_HANDOFF.md)
- [docs/GA_MIGRATION.md](./docs/GA_MIGRATION.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/TEST_PLAN.md](./docs/TEST_PLAN.md)

## 소개 페이지

저장소 소개용 페이지:

- [index.html](./index.html)

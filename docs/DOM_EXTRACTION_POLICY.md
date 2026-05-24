# DOM_EXTRACTION_POLICY.md

## 목표
엔카 DOM 구조 변경에 비교적 강한 extractor를 설계한다.

---

## 원칙
1. selector는 한 개만 두지 않는다
2. carId는 가능한 URL/링크 기반으로 우선 확보한다
3. price는 숫자 정규화 함수로 별도 처리한다
4. title은 화면 표시용과 저장용을 분리 고려한다
5. extractor는 실패 이유를 최소한 분류 가능해야 한다

---

## LIST 추출 원칙
- 차량 카드 단위 root selector를 먼저 찾는다
- 카드 내 링크를 기준으로 detail URL과 carId를 우선 파생한다
- 카드 텍스트 전체를 통째로 파싱하기보다 필드별 selector를 우선 사용한다
- price selector 실패 시 카드 내부 텍스트 fallback은 최후 수단으로 사용한다

---

## DETAIL 추출 원칙
- 대표 컨테이너 존재 여부를 먼저 확인한다
- URL 기반 carId와 DOM 기반 carId 둘 다 시도한다
- 상세 price는 최우선 필수 필드다
- mileage/year는 없을 수 있으므로 optional로 다룬다

현재 구현은 가격이 없으면 `NO_PRICE`를 반환하고 저장을 중단한다.
대표 컨테이너 존재 여부 검사는 아직 별도 error로 분리되어 있지 않으므로,
실제 Encar DOM fixture를 추가하면서 `NO_DETAIL_ROOT` 처리 여부를 결정한다.

---

## normalize 원칙
- price는 숫자 이외 문자 제거 후 정수화
- title은 trim/공백 normalize
- url은 tracking query 제거를 고려한 normalize 가능
- fallback key는 정규화 URL 사용

현재 가격 단위는 만원 정수다.
예를 들어 `1,890만원`은 `1890`, `18,900,000`은 `1890`으로 저장한다.

---

## 실패 분류 예시
- `NO_CARD_ROOT`
- `NO_DETAIL_ROOT`
- `NO_PRICE`
- `NO_CAR_ID`
- `NO_LINK`
- `PARTIAL_DATA`

이 분류는 하네스와 디버깅에 유용하다.

---

## 추가해야 할 fixture
- LIST 카드 root selector가 다른 케이스
- LIST 카드에 price selector가 없고 텍스트 fallback이 필요한 케이스
- DETAIL URL에 `carid`가 없고 DOM dataset에만 있는 케이스
- DETAIL price 지연 렌더링 케이스
- 실제 Encar에서 캡처한 최소 DOM snapshot

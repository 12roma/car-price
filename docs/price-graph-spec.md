# Price Graph Spec

## 1. 원칙

- 그래프는 실제 history 데이터만 사용한다
- 없는 데이터 생성 금지
- local / Firebase 데이터 변경 금지
- 그래프는 표시용 데이터만 가공

---

## 2. 표시 규칙

- history 1건 → 1개 표시
- history 2~7건 → 전체 표시
- history 8건 이상 → 최대 7개만 표시

---

## 3. 샘플링

- 항상 첫 번째 포함
- 항상 마지막 포함
- 중간은 균등 간격
- 최대 7개

---

## 4. 금지

- 날짜 보정
- 가격 채우기
- filled 데이터 생성
- 그래프 데이터를 history에 저장

---

## 5. 구현

function: buildChartDisplayData(history, maxPoints = 7)

- invalid 제거
- 정렬
- 같은 날짜 → 마지막만
- 초과 시 샘플링

---

## 6. 규칙

- 그래프 = displayData
- 리스트 = history

---

## 7. 기준

이 문서가 그래프 로직의 기준이다.

# STORAGE_POLICY.md

## 저장소 목표
Phase 1에서는 `chrome.storage.local` 만 사용한다.
그러나 향후 Supabase로 이관이 쉽도록 repository 추상화 관점을 유지한다.

---

## 저장 단위
차량 단위 문서를 저장한다.

기본 키:
- `carId`
- 없으면 fallback key

현재 구현에서는 저장 key를 `vehicle_${id}` 형태로 만든다.
`id`는 `carId`가 있으면 `carId`, 없으면 `fallbackKey`를 사용한다.

---

## upsert 원칙
1. 기존 차량 조회
2. 대표 필드 병합
3. history append 여부 계산
4. status/lastSeenAt 반영
5. 다시 저장

---

## 병합 규칙
- DETAIL 정보가 LIST 정보보다 우선
- title/url은 더 신뢰도 높은 값을 유지
- source.fromList / source.fromDetail 은 한번 true 되면 유지
- firstSeenAt 은 최초값 유지
- lastSeenAt 은 최신값 반영

주의:
- 기존 데이터가 DETAIL까지 포함한 상태라면, 이후 LIST 재방문으로 `title`, `mileage`, `year` 같은 상세 신뢰 필드가 퇴화하면 안 된다.
- 새 DETAIL 방문은 기존 LIST 기반 필드를 보강해야 한다.
- 이 동작은 `mergeVehicle()` 하네스에서 edge case로 계속 검증한다.

---

## history 원칙
- 최초 발견 시 1건 추가
- 가격 변경 시 추가
- 같은 날 같은 가격은 추가 금지
- 현재 정책은 날짜가 달라도 같은 가격이면 추가하지 않는다.
- 옵션으로 하루 1건 허용 정책은 feature flag화 가능

---

## 조회 원칙
popup/recent 조회 시점에 status를 재평가할 수 있게 설계한다.

즉,
- 저장 시점 상태 반영
- 조회 시점 장기 미확인 재평가
둘 다 가능해야 한다.

---

## 추가 검증 필요 항목
- fallback key 기반 저장 후 같은 URL 재방문 시 같은 레코드가 갱신되는지
- `carId`가 나중에 확보된 경우 fallback key 레코드와 병합할지, 별도 레코드로 둘지
- `chrome.storage.local` quota 초과 시 처리 방식
- popup 조회 시 status 재평가 결과를 저장값에 반영할지 표시용으로만 둘지

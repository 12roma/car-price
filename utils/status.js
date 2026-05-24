// Domain policy: status transitions
const StatusPolicy = (() => {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  /**
   * 추출 성공 시 ACTIVE로 마킹
   */
  function markActive(vehicle) {
    return {
      ...vehicle,
      status: ENCAR.STATUS.ACTIVE,
      missingCount: 0,
      lastSeenAt: Date.now()
    };
  }

  /**
   * 추출 실패 시 MISSING 카운트 증가 및 상태 전이
   * missingCount >= SUSPECT_SOLD_MISSING_COUNT → SUSPECT_SOLD
   */
  function markMissing(vehicle) {
    const nextCount = (vehicle.missingCount || 0) + 1;
    const nextStatus = nextCount >= ENCAR.SUSPECT_SOLD_MISSING_COUNT
      ? ENCAR.STATUS.SUSPECT_SOLD
      : ENCAR.STATUS.MISSING;

    return {
      ...vehicle,
      status: nextStatus,
      missingCount: nextCount
    };
  }

  /**
   * lastSeenAt 기준으로 시간 경과 상태 재평가
   * - 30일 초과 → ARCHIVED
   * - 7일 초과  → SUSPECT_SOLD
   * - 이미 ARCHIVED/SUSPECT_SOLD이면 유지
   */
  function deriveStatusByTime(vehicle, now) {
    const ts = now || Date.now();
    const daysSince = (ts - vehicle.lastSeenAt) / MS_PER_DAY;

    if (daysSince >= ENCAR.ARCHIVED_DAYS) {
      return { ...vehicle, status: ENCAR.STATUS.ARCHIVED };
    }
    if (daysSince >= ENCAR.SUSPECT_SOLD_DAYS) {
      if (vehicle.status === ENCAR.STATUS.ACTIVE || vehicle.status === ENCAR.STATUS.MISSING) {
        return { ...vehicle, status: ENCAR.STATUS.SUSPECT_SOLD };
      }
    }
    return vehicle;
  }

  /**
   * popup 조회 시점에 status를 재평가해서 반환
   * 저장된 값을 변경하지 않고 표시용 status만 재계산
   */
  function evaluateStatus(vehicle, now) {
    const derived = deriveStatusByTime(vehicle, now);
    return derived.status;
  }

  return { markActive, markMissing, deriveStatusByTime, evaluateStatus };
})();

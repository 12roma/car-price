// Domain policy: vehicle record merging
const MergePolicy = (() => {
  /**
   * 기존 vehicle 레코드에 새 데이터를 병합한다.
   * - DETAIL 정보가 LIST 정보보다 우선
   * - firstSeenAt은 최초값 유지
   * - lastSeenAt은 최신값 반영
   * - source 플래그는 한번 true가 되면 유지
   */
  function mergeVehicle(existing, incoming) {
    const isDetail = incoming.sourceType === ENCAR.SOURCE.DETAIL;
    const existingIsDetail = existing.source && existing.source.fromDetail;

    // DETAIL이 기존보다 우선: title/mileage/year 갱신
    const shouldOverride = isDetail || !existingIsDetail;

    return {
      ...existing,
      title: shouldOverride && incoming.title ? incoming.title : (existing.title || incoming.title),
      url: incoming.url || existing.url,
      mileage: isDetail && incoming.mileage ? incoming.mileage : (existing.mileage || incoming.mileage),
      year: isDetail && incoming.year ? incoming.year : (existing.year || incoming.year),
      vehicleNo: isDetail && incoming.vehicleNo ? incoming.vehicleNo : (existing.vehicleNo || incoming.vehicleNo || null),
      source: {
        fromList: existing.source.fromList || (incoming.sourceType === ENCAR.SOURCE.LIST),
        fromDetail: existing.source.fromDetail || (incoming.sourceType === ENCAR.SOURCE.DETAIL)
      },
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: Date.now()
    };
  }

  /**
   * 신규 vehicle 레코드 생성
   */
  function createVehicle(data) {
    const now = Date.now();
    return {
      carId: data.carId,
      fallbackKey: data.fallbackKey || null,
      title: data.title || '',
      url: data.url || '',
      mileage: data.mileage || null,
      year: data.year || null,
      vehicleNo: data.vehicleNo || null,
      source: {
        fromList: data.sourceType === ENCAR.SOURCE.LIST,
        fromDetail: data.sourceType === ENCAR.SOURCE.DETAIL
      },
      history: [],
      status: ENCAR.STATUS.ACTIVE,
      missingCount: 0,
      firstSeenAt: now,
      lastSeenAt: now
    };
  }

  return { mergeVehicle, createVehicle };
})();

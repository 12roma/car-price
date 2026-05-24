// History Dedup / Price Policy Harness

suite('PricePolicy - normalizePrice', () => {
  test('만원 단위 문자열 파싱', () => {
    assertEqual(PricePolicy.normalizePrice('1,890만원'), 18900000);
  });

  test('숫자만 있는 경우는 null', () => {
    assertEqual(PricePolicy.normalizePrice('2350'), null);
  });

  test('원 단위 문자열은 원 단위 유지', () => {
    assertEqual(PricePolicy.normalizePrice('18,900,000원'), 18900000);
  });

  test('null 입력은 null 반환', () => {
    assertEqual(PricePolicy.normalizePrice(null), null);
  });

  test('숫자 없으면 null 반환', () => {
    assertEqual(PricePolicy.normalizePrice('가격미정'), null);
  });

  test('리스/렌트 월납입 텍스트는 제외', () => {
    assertEqual(PricePolicy.normalizePrice('리스 월 19만원/48개월'), null);
  });

  test('isValidVehiclePrice 범위 체크', () => {
    assertEqual(PricePolicy.isValidVehiclePrice(21990000), true);
    assertEqual(PricePolicy.isValidVehiclePrice(999999), false);
    assertEqual(PricePolicy.isValidVehiclePrice(3000000001), false);
  });
});

suite('PricePolicy - shouldAppendHistory', () => {
  test('history 없으면 항상 true', () => {
    assert(PricePolicy.shouldAppendHistory([], 18900000, '2026-04-19'));
  });

  test('같은 날 같은 가격이면 false', () => {
    const history = [{ price: 18900000, date: '2026-04-19', timestamp: 1, source: 'LIST' }];
    assert(!PricePolicy.shouldAppendHistory(history, 18900000, '2026-04-19'));
  });

  test('가격이 다르면 true', () => {
    const history = [{ price: 18900000, date: '2026-04-19', timestamp: 1, source: 'LIST' }];
    assert(PricePolicy.shouldAppendHistory(history, 18000000, '2026-04-19'));
  });

  test('날짜 다르면 같은 가격도 true (연속 추적)', () => {
    const history = [{ price: 18900000, date: '2026-04-18', timestamp: 1, source: 'LIST' }];
    assert(PricePolicy.shouldAppendHistory(history, 18900000, '2026-04-19'));
  });
});

suite('PricePolicy - price diff', () => {
  test('getLatestPrice', () => {
    const history = [
      { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
      { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
    ];
    assertEqual(PricePolicy.getLatestPrice(history), 18900000);
  });

  test('getPreviousPrice - 직전 다른 가격', () => {
    const history = [
      { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
      { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
    ];
    assertEqual(PricePolicy.getPreviousPrice(history), 20000000);
  });

  test('getPriceDiff - 가격 하락', () => {
    const history = [
      { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
      { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
    ];
    assertEqual(PricePolicy.getPriceDiff(history), -1100000);
  });

  test('getPriceDiff - history 1건이면 null', () => {
    const history = [{ price: 18900000, date: '2026-04-01', timestamp: 1, source: 'LIST' }];
    assertEqual(PricePolicy.getPriceDiff(history), null);
  });

  test('getPriceDiff - 빈 history면 null', () => {
    assertEqual(PricePolicy.getPriceDiff([]), null);
  });

  test('getPriceFreezeDays - 첫 가격 그대로 3일 유지', () => {
    const history = [
      { price: 18900000, date: '2026-05-01', timestamp: 1, source: 'LIST' }
    ];
    assertEqual(PricePolicy.getPriceFreezeDays(history, '2026-05-03T12:00:00.000Z'), 3);
  });

  test('getPriceFreezeDays - 첫날이면 null', () => {
    const history = [
      { price: 18900000, date: '2026-05-03', timestamp: 1, source: 'LIST' }
    ];
    assertEqual(PricePolicy.getPriceFreezeDays(history, '2026-05-03T12:00:00.000Z'), null);
  });

  test('getPriceFreezeDays - 중간에 가격 바뀌었으면 null', () => {
    const history = [
      { price: 20000000, date: '2026-05-01', timestamp: 1, source: 'LIST' },
      { price: 18900000, date: '2026-05-02', timestamp: 2, source: 'DETAIL' }
    ];
    assertEqual(PricePolicy.getPriceFreezeDays(history, '2026-05-03T12:00:00.000Z'), null);
  });

  test('buildChartDisplayData - history 1건이면 1개 표시', () => {
    const history = [
      { price: 30400000, date: '2026-05-03', timestamp: 1, source: 'DETAIL' }
    ];
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 1);
    assertEqual(chart[0].price, 30400000);
  });

  test('buildChartDisplayData - history 2건이면 2개 표시', () => {
    const history = [
      { price: 30000000, date: '2026-05-01', timestamp: 1, source: 'LIST' },
      { price: 30400000, date: '2026-05-03', timestamp: 2, source: 'DETAIL' }
    ];
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 2);
  });

  test('buildChartDisplayData - history 7건이면 7개 표시', () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      price: 30000000 + (index * 100000),
      date: `2026-05-0${index + 1}`,
      timestamp: index + 1,
      source: 'LIST'
    }));
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 7);
  });

  test('buildChartDisplayData - history 8건이면 7개 표시', () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      price: 30000000 + (index * 100000),
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      timestamp: index + 1,
      source: 'LIST'
    }));
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 7);
    assertEqual(chart[0].date, '2026-05-01');
    assertEqual(chart[6].date, '2026-05-08');
  });

  test('buildChartDisplayData - history 20건이면 시작/중간/끝 포함 7개 샘플링', () => {
    const history = Array.from({ length: 20 }, (_, index) => ({
      price: 30000000 + (index * 100000),
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      timestamp: index + 1,
      source: 'LIST'
    }));
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 7);
    assertEqual(chart[0].date, '2026-05-01');
    assertEqual(chart[6].date, '2026-05-20');
    assert(chart.some(item => item.date === '2026-05-10') || chart.some(item => item.date === '2026-05-11'), 'middle sample should exist');
  });

  test('buildChartDisplayData - 같은 날짜 여러 건이면 마지막 가격 사용', () => {
    const history = [
      { price: 31000000, date: '2026-05-01', timestamp: 1, source: 'LIST' },
      { price: 30500000, date: '2026-05-01', timestamp: 2, source: 'DETAIL' },
      { price: 30400000, date: '2026-05-03', timestamp: 3, source: 'DETAIL' }
    ];
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    const mayFirst = chart.find(item => item.date === '2026-05-01');
    assertEqual(mayFirst.price, 30500000);
  });

  test('buildChartDisplayData - invalid price는 제외', () => {
    const history = [
      { price: 2025839916006373600000000, date: '2026-05-01', timestamp: 1, source: 'LIST' },
      { price: 30400000, date: '2026-05-03', timestamp: 2, source: 'DETAIL' }
    ];
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    assertEqual(chart.length, 1);
    assertEqual(chart[0].price, 30400000);
  });
});

suite('MergePolicy - createVehicle', () => {
  test('신규 차량 생성 구조 검증', () => {
    const v = MergePolicy.createVehicle({
      carId: '174397123',
      title: '아반떼',
      url: 'https://www.encar.com/dc/dc_cardetailview.do?carid=174397123',
      price: 18900000,
      sourceType: 'LIST'
    });
    assertEqual(v.carId, '174397123');
    assertEqual(v.status, 'ACTIVE');
    assertEqual(v.history.length, 0);
    assertEqual(v.source.fromList, true);
    assertEqual(v.source.fromDetail, false);
    assertEqual(v.missingCount, 0);
  });
});

suite('MergePolicy - mergeVehicle', () => {
  test('DETAIL이 LIST보다 우선 (title 갱신)', () => {
    const existing = MergePolicy.createVehicle({
      carId: '174397123', title: '아반떼 (LIST)', url: 'u', sourceType: 'LIST'
    });
    const incoming = {
      carId: '174397123', title: '아반떼 CN7 상세 (DETAIL)', url: 'u',
      sourceType: 'DETAIL', mileage: '12234km', year: 2022
    };
    const merged = MergePolicy.mergeVehicle(existing, incoming);
    assertEqual(merged.title, '아반떼 CN7 상세 (DETAIL)');
    assertEqual(merged.source.fromList, true);
    assertEqual(merged.source.fromDetail, true);
  });

  test('firstSeenAt 최초값 유지', () => {
    const existing = MergePolicy.createVehicle({
      carId: '1', title: 't', url: 'u', sourceType: 'LIST'
    });
    const first = existing.firstSeenAt;
    const incoming = { carId: '1', title: 't2', url: 'u', sourceType: 'LIST' };
    const merged = MergePolicy.mergeVehicle(existing, incoming);
    assertEqual(merged.firstSeenAt, first);
  });

  test('DETAIL vehicleNo는 갱신되고 LIST null은 덮어쓰지 않음', () => {
    const existing = MergePolicy.createVehicle({
      carId: '1', title: 't', url: 'u', sourceType: 'DETAIL', vehicleNo: '123가4567'
    });
    const merged = MergePolicy.mergeVehicle(existing, {
      carId: '1', title: 't', url: 'u', sourceType: 'LIST', vehicleNo: null
    });
    assertEqual(merged.vehicleNo, '123가4567');
  });

  test('비정상 history는 diff 계산에서 제외', () => {
    const history = [
      { price: 2025839916006373600000000, date: '2026-04-01', timestamp: 1, source: 'LIST' },
      { price: 21990000, date: '2026-04-19', timestamp: 2, source: 'LIST' }
    ];
    assertEqual(PricePolicy.getLatestPrice(history), 21990000);
    assertEqual(PricePolicy.getPriceDiff(history), null);
  });

  test('sanitizeVehicleHistory는 invalid만 제거', () => {
    const vehicle = {
      carId: '41150772',
      history: [
        { price: 21990000, date: '2026-04-19', timestamp: 1, source: 'LIST' },
        { price: 2025839916006373600000000, date: '2026-04-20', timestamp: 2, source: 'LIST' }
      ]
    };
    const result = PricePolicy.sanitizeVehicleHistory(vehicle);
    assertEqual(result.changed, true);
    assertEqual(result.removedCount, 1);
    assertEqual(result.vehicle.history.length, 1);
    assertEqual(result.vehicle.history[0].price, 21990000);
  });

  test('sanitizeVehicleHistory는 반복 실행해도 동일', () => {
    const vehicle = {
      carId: '41150772',
      history: [
        { price: 21990000, date: '2026-04-19', timestamp: 1, source: 'LIST' }
      ]
    };
    const first = PricePolicy.sanitizeVehicleHistory(vehicle);
    const second = PricePolicy.sanitizeVehicleHistory(first.vehicle);
    assertEqual(first.changed, false);
    assertEqual(second.changed, false);
    assertDeepEqual(first.vehicle.history, second.vehicle.history);
  });
});

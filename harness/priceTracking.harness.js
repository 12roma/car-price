// Price tracking harness module tests for LIST/DETAIL/storage.
if (typeof chrome === 'undefined') {
  var chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        _items: {},
        get(key, callback) {
          if (key === null) {
            callback({ ...this._items });
            return;
          }
          callback({ [key]: this._items[key] });
        },
        set(items, callback) {
          Object.assign(this._items, items);
          if (callback) callback();
        }
      }
    }
  };
}

suite('PriceTracking - price parser', () => {
  test('만원 가격을 원 단위로 변환', () => {
    assertEqual(PriceParser.parsePrice('2,450만원'), 24500000);
  });

  test('원 가격은 원 단위 유지', () => {
    assertEqual(PriceParser.parsePrice('24,500,000원'), 24500000);
  });

  test('원 단위 저장값을 만원 표시 문자열로 변환', () => {
    assertEqual(PriceParser.formatPriceToManwon(28500000), '2,850만원');
    assertEqual(PriceParser.formatPriceToManwon(42000000), '4,200만원');
    assertEqual(PriceParser.formatPriceToManwon(2000000), '200만원');
  });

  test('diff 상태를 만원 단위로 표시', () => {
    assertEqual(PriceParser.getPriceStatus(25000000, 24500000), '▼ 50만원');
    assertEqual(PriceParser.getPriceStatus(24500000, 25000000), '▲ 50만원');
    assertEqual(PriceParser.getPriceStatus(24500000, 24500000), '변동 없음');
    assertEqual(PriceParser.getPriceStatus(null, 24500000), '첫 추적');
  });
});

suite('PriceTracking - LIST extractor', () => {
  function makeDoc() {
    return new DOMParser().parseFromString(`
      <ul id="car_list_area">
        <li>
          <a href="https://fem.encar.com/cars/detail/41150772">
            <strong class="title">현대 그랜저 테스트</strong>
          </a>
          <span class="price">2,450만원</span>
        </li>
      </ul>
    `, 'text/html');
  }

  test('LIST 차량 1개 이상 추출', () => {
    const vehicles = ListExtractor.extractListVehicles(makeDoc());
    assert(vehicles.length >= 1, 'LIST extraction count should be >= 1');
  });

  test('LIST 첫 차량 필드 추출', () => {
    const first = ListExtractor.extractListVehicles(makeDoc())[0];
    assertEqual(first.carId, '41150772');
    assertEqual(first.price, 24500000);
    assert(first.url.includes('/cars/detail/41150772'), 'detail URL should include car id');
  });
});

suite('PriceTracking - DETAIL extractor', () => {
  function makeDoc() {
    return new DOMParser().parseFromString(`
      <main>
        <h1>현대 그랜저 테스트</h1>
        <div class="price">2,450만원</div>
        <ul>
          <li>2021년식</li>
          <li>34,000km</li>
        </ul>
      </main>
    `, 'text/html');
  }

  test('DETAIL carId와 price 추출', () => {
    const result = DetailExtractor.extractDetailVehicle(makeDoc(), 'https://fem.encar.com/cars/detail/41150772');
    assertEqual(result.error, null);
    assertEqual(result.vehicle.carId, '41150772');
    assertEqual(result.vehicle.price, 24500000);
  });
});

suite('PriceTracking - storage manager', () => {
  test('upsert 후 history 생성 및 동일 source 중복 방지', async () => {
    const incoming = {
      carId: '41150772',
      title: '현대 그랜저 테스트',
      price: 24500000,
      url: 'https://fem.encar.com/cars/detail/41150772',
      source: 'LIST'
    };

    await StorageManager.upsertVehicle(incoming, '2026-04-19T00:00:00.000Z');
    await StorageManager.upsertVehicle(incoming, '2026-04-19T01:00:00.000Z');
    const saved = await StorageManager.getVehicle('41150772');

    assertEqual(saved.history.length, 1);
    assertEqual(saved.source.fromList, true);
  });

  test('LIST 이후 DETAIL은 source.fromDetail 반영', async () => {
    const incoming = {
      carId: '41150772',
      title: '현대 그랜저 상세',
      price: 24500000,
      url: 'https://fem.encar.com/cars/detail/41150772',
      source: 'DETAIL',
      mileage: '34,000km',
      year: 2021
    };

    await StorageManager.upsertVehicle(incoming, '2026-04-19T02:00:00.000Z');
    const saved = await StorageManager.getVehicle('41150772');

    assertEqual(saved.source.fromDetail, true);
    assertEqual(saved.mileage, '34,000km');
    assertEqual(saved.year, 2021);
  });

});

suite('PriceTracking - today price panel', () => {
  function resetDom() {
    document.body.innerHTML = `
      <main>
        <h1>현대 그랜저 테스트</h1>
        <section class="price-wrap">
          <strong class="price">2,450만원</strong>
        </section>
      </main>
    `;
  }

  function makeVehicle(price) {
    return {
      carId: '41150772',
      title: '현대 그랜저 테스트',
      price,
      url: 'https://fem.encar.com/cars/detail/41150772',
      status: 'ACTIVE',
      firstSeenAt: '2026-04-18T00:00:00.000Z',
      lastSeenAt: '2026-04-19T00:00:00.000Z',
      source: { fromList: true, fromDetail: true, searchKey: null },
      history: [
        { price: 25000000, checkedAt: '2026-04-18T00:00:00.000Z', source: 'LIST' },
        { price, checkedAt: '2026-04-19T00:00:00.000Z', source: 'DETAIL' }
      ]
    };
  }

  test('DETAIL 가격 anchor 아래에 보조정보 삽입', () => {
    resetDom();
    const logs = [];
    const logger = (scope, message) => logs.push(`[HARNESS][${scope}] ${message}`);
    TodayPricePanel.renderOrUpdateDetail(makeVehicle(24500000), { logger, now: '2026-04-19T03:00:00.000Z' });

    const panel = document.getElementById('encar-today-price-panel');
    assert(panel !== null, 'panel should exist');
    assert(panel.textContent.includes('현재 가격 저장일: 2026-04-19'), 'panel should show saved date');
    assert(panel.textContent.includes('지금 가격 상황: ▼ 50만원'), 'panel should show diff');
    assert(logs.includes('[HARNESS][DETAIL_UI] inserted under price'), 'detail inserted log should exist');
    assert(logs.includes('[HARNESS][DETAIL_UI] anchor found: true'), 'detail anchor found log should exist');
    assert(logs.some(line => line.startsWith('[HARNESS][DETAIL_UI] anchor html:')), 'detail anchor html log should exist');
    assert(logs.includes('[HARNESS][DETAIL_UI] panel exists in dom: true'), 'detail panel exists log should exist');
    assert(logs.some(line => line.includes('panel text: 현재 가격 저장일: 2026-04-19')), 'detail panel text log should exist');
    assert(logs.includes('[HARNESS][PRICE] raw stored price: 24500000'), 'raw price log should exist');
    assert(logs.includes('[HARNESS][PRICE] formatted price: 2,450만원'), 'formatted price log should exist');
    assert(logs.includes('[HARNESS][DIFF] status: ▼ 50만원'), 'diff log should exist');
  });

  test('DETAIL 같은 차량 재실행 시 패널 업데이트', () => {
    resetDom();
    const logs = [];
    const logger = (scope, message) => logs.push(`[HARNESS][${scope}] ${message}`);
    TodayPricePanel.renderOrUpdateDetail(makeVehicle(24500000), { logger, now: '2026-04-19T03:00:00.000Z' });
    TodayPricePanel.renderOrUpdateDetail(makeVehicle(24400000), { logger, now: '2026-04-19T04:00:00.000Z' });

    const panels = document.querySelectorAll('#encar-today-price-panel');
    assertEqual(panels.length, 1);
    assert(panels[0].textContent.includes('▼ 60만원'), 'panel should update status');
    assert(logs.includes('[HARNESS][DETAIL_UI] inserted under price'), 'detail update should remain under price');
  });

  test('LIST 카드 가격 아래에 보조정보 삽입 및 업데이트', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <a href="https://fem.encar.com/cars/detail/41150772">
            <strong class="title">현대 그랜저 테스트</strong>
          </a>
          <span class="price">2,450만원</span>
        </li>
      </ul>
    `;
    const vehicle = makeVehicle(24500000);
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price');
    const logs = [];
    const logger = (scope, message) => logs.push(`[HARNESS][${scope}] ${message}`);

    TodayPricePanel.renderOrUpdateListItem(vehicle, { logger, cardElement: card, priceElement, now: '2026-04-19T04:00:00.000Z' });
    TodayPricePanel.renderOrUpdateListItem(vehicle, { logger, cardElement: card, priceElement, now: '2026-04-19T04:00:00.000Z' });

    const panels = card.querySelectorAll('.encar-price-tracker-list-ui');
    assertEqual(panels.length, 1);
    assert(panels[0].textContent.includes('현재 가격 저장일: 2026-04-19'), 'list helper should show saved date');
    assert(panels[0].textContent.includes('지금 가격 상황: ▼ 50만원'), 'list helper should show price status');
    assert(logs.includes('[HARNESS][LIST_UI] carId: 41150772'), 'list carId log should exist');
    assert(logs.includes('[HARNESS][LIST_UI] inserted under price'), 'list inserted log should exist');
    assert(logs.includes('[HARNESS][LIST_UI] anchor found: true'), 'list anchor found log should exist');
    assert(logs.some(line => line.startsWith('[HARNESS][LIST_UI] anchor html:')), 'list anchor html log should exist');
    assert(logs.includes('[HARNESS][LIST_UI] panel exists in dom: true'), 'list panel exists log should exist');
    assert(logs.some(line => line.includes('panel text: 현재 가격 저장일: 2026-04-19')), 'list panel text log should exist');
  });
});

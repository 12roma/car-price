// Overlay Idempotency Harness

suite('Overlay - 생성 및 idempotency', () => {
  function makeVehicle(overrides) {
    return {
      carId: '174397123',
      title: '현대 아반떼',
      url: 'https://www.encar.com/dc/dc_cardetailview.do?carid=174397123',
      status: 'ACTIVE',
      history: [
        { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
        { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
      ],
      firstSeenAt: Date.now() - 86400000,
      lastSeenAt: Date.now(),
      ...overrides
    };
  }

  function cleanup() {
    const el = document.getElementById(ENCAR.OVERLAY_ID);
    if (el) el.remove();
    const tooltip = document.getElementById('ept-list-tooltip');
    if (tooltip) tooltip.remove();
  }

  function mountDetailPriceDom(priceText) {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">${priceText || '1,890만원'}</strong>
        </section>
      </main>
    `;
    return document.querySelector('.price');
  }

  test('최초 렌더 시 상세 tracker 1개 생성', () => {
    cleanup();
    const priceElement = mountDetailPriceDom();
    Overlay.renderOrUpdate(makeVehicle({ priceElement }));
    const overlays = document.querySelectorAll('#' + ENCAR.OVERLAY_ID);
    assertEqual(overlays.length, 1);
    assert(document.querySelector('.encar-price-tracker-detail-ui') !== null, 'detail tracker class should exist');
    cleanup();
  });

  test('같은 차량 재렌더 시 상세 tracker 여전히 1개', () => {
    cleanup();
    const priceElement = mountDetailPriceDom();
    const v = makeVehicle({ priceElement });
    Overlay.renderOrUpdate(v);
    Overlay.renderOrUpdate(v);
    Overlay.renderOrUpdate(v);
    const overlays = document.querySelectorAll('#' + ENCAR.OVERLAY_ID);
    assertEqual(overlays.length, 1);
    cleanup();
  });

  test('overlay 존재 확인 API', () => {
    cleanup();
    assert(!Overlay.exists(), '초기에는 없어야 함');
    const priceElement = mountDetailPriceDom();
    Overlay.renderOrUpdate(makeVehicle({ priceElement }));
    assert(Overlay.exists(), '렌더 후에는 있어야 함');
    cleanup();
  });

  test('remove() 후 overlay 없음', () => {
    cleanup();
    Overlay.renderOrUpdate(makeVehicle());
    Overlay.remove();
    assert(!Overlay.exists(), 'remove 후에는 없어야 함');
  });

  test('가격 하락 시 diff 음수 텍스트 포함', () => {
    cleanup();
    const priceElement = mountDetailPriceDom();
    Overlay.renderOrUpdate(makeVehicle({ priceElement }));
    const el = document.getElementById(ENCAR.OVERLAY_ID);
    assert(el.textContent.includes('-') || el.textContent.includes('▼') || el.innerHTML.includes('ept-diff--down'),
      '가격 하락 표시 확인');
    cleanup();
  });

  test('remove() 후 상세 tracker 제거', () => {
    cleanup();
    Overlay.renderOrUpdate(makeVehicle());
    Overlay.remove();
    assert(!Overlay.exists(), 'remove 후 tracker 없어야 함');
  });

  test('상세 가격 아래 tracker 삽입 및 차량번호 표시', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">1,890만원</strong>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    Overlay.renderOrUpdate(makeVehicle({
      vehicleNo: '123가4567',
      history: [{ price: 18900000, date: '2026-04-26', timestamp: 1, source: 'DETAIL' }],
      priceElement
    }));

    const tracker = document.getElementById(ENCAR.OVERLAY_ID);
    assert(tracker !== null, 'detail tracker should exist');
    assert(priceElement.nextElementSibling === tracker || priceElement.parentElement.nextElementSibling === tracker,
      'tracker should be inserted under price');
    assert(tracker.textContent.includes('차량번호: 123가4567'), 'vehicleNo should be shown');
    assert(tracker.getAttribute('data-tracker-page') === 'detail', 'detail tracker page attribute should exist');
    assert(tracker.getAttribute('data-car-id') === '174397123', 'detail tracker car id should exist');
  });

  test('상세 tracker 재실행 시 중복 삽입 안 됨', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">1,890만원</strong>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    const vehicle = makeVehicle({ vehicleNo: null, priceElement });
    Overlay.renderOrUpdate(vehicle);
    Overlay.renderOrUpdate(vehicle);
    Overlay.renderOrUpdate(vehicle);

    assertEqual(document.querySelectorAll('#' + ENCAR.OVERLAY_ID).length, 1);
  });

  test('상세 placeholder를 먼저 만들고 내용만 업데이트한다', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">1,890만원</strong>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    const vehicle = makeVehicle({ vehicleNo: '123가4567', priceElement });
    const placeholder = Overlay.ensureDetailPlaceholder(vehicle);

    assert(placeholder !== null, 'detail placeholder should exist');
    assert(placeholder.classList.contains('is-loading'), 'placeholder should be loading');
    assert(placeholder.textContent.includes('확인 중'), 'placeholder should show loading text');

    const updated = Overlay.renderOrUpdate(vehicle);
    assertEqual(updated, placeholder);
    assert(updated.classList.contains('is-ready'), 'updated detail tracker should be ready');
    assert(updated.textContent.includes('차량번호: 123가4567'), 'updated content should be rendered');
  });

  test('상세 가격 블록에 상태 문구가 있어도 가격 아래에 tracker 삽입', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <div class="price_wrap">
            <div class="price"><strong>5,161</strong><span>만원</span><em>계약중</em></div>
          </div>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    const vehicle = makeVehicle({
      carId: '41920829',
      vehicleNo: null,
      history: [{ price: 51610000, date: '2026-04-27', timestamp: 1, source: 'DETAIL' }],
      priceElement
    });

    const placeholder = Overlay.ensureDetailPlaceholder(vehicle);
    const updated = Overlay.renderOrUpdate(vehicle);

    assert(placeholder !== null, 'detail placeholder should exist');
    assertEqual(updated, placeholder);
    assert(document.querySelector('#' + ENCAR.OVERLAY_ID) !== null, 'detail tracker should exist');
  });

  test('fem 상세 data-intl-currency 가격 영역 아래에 tracker 삽입', () => {
    document.body.innerHTML = `
      <main>
        <div class="pekn_vXocM">
          <p class="is4Ms_K_3M" data-intl-currency="true">
            <span class="z7tWTEs7N0" data-intl-currency-amount="29200000">2,920</span>
            <span data-intl-currency-unit="true">만원</span>
          </p>
          <button type="button">총비용계산기</button>
        </div>
      </main>
    `;
    const priceElement = document.querySelector('[data-intl-currency]');
    const vehicle = makeVehicle({
      carId: '41920829',
      history: [{ price: 29200000, date: '2026-05-03', timestamp: 1, source: 'DETAIL' }],
      priceElement
    });

    const placeholder = Overlay.ensureDetailPlaceholder(vehicle);
    const updated = Overlay.renderOrUpdate(vehicle);

    assert(placeholder !== null, 'detail placeholder should exist');
    assertEqual(updated, placeholder);
    assert(document.querySelector('#' + ENCAR.OVERLAY_ID) !== null, 'detail tracker should exist');
  });

  test('상세 tracker에는 그래프가 표시된다', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">3,080만원</strong>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    Overlay.renderOrUpdate(makeVehicle({
      history: [
        { price: 32000000, date: '2026-04-01', timestamp: 1, source: 'DETAIL' },
        { price: 30800000, date: '2026-05-01', timestamp: 2, source: 'DETAIL' }
      ],
      priceElement
    }));

    const tracker = document.getElementById(ENCAR.OVERLAY_ID);
    assert(tracker.querySelector('.ept-detail-chart svg') !== null, 'detail chart svg should exist');
    assert(tracker.textContent.includes('현재 가격 저장일'), 'detail tracker should show checked date');
    assert(tracker.textContent.includes('지금 가격 상황'), 'detail tracker should show diff label');
  });

  test('상세에서 첫 가격 그대로면 가격 동결 일수 표시', () => {
    document.body.innerHTML = `
      <main>
        <section class="price-wrap">
          <strong class="price">1,890만원</strong>
        </section>
      </main>
    `;
    const priceElement = document.querySelector('.price');
    Overlay.renderOrUpdate(makeVehicle({
      history: [
        { price: 18900000, date: '2026-05-01', timestamp: 1, source: 'DETAIL' }
      ],
      lastSeenAt: '2026-05-03T12:00:00.000Z',
      priceElement
    }));

    const tracker = document.getElementById(ENCAR.OVERLAY_ID);
    assert(tracker.textContent.includes('3일째 가격 동결'), 'detail tracker should show freeze days');
  });

  test('LIST row 구조에서는 정보 영역 내부에 tracker 삽입', () => {
    document.body.innerHTML = `
      <table>
        <tbody id="prefer_list">
          <tr data-impression="41082563|2199|12345|t01|n1">
            <td class="img"><a href="/dc/dc_cardetailview.do?carid=41082563" class="newLink _link"></a></td>
            <td class="inf"><span class="cls"><strong>차량명</strong></span></td>
            <td class="prc_hs"><strong class="prc">2,199</strong>만원</td>
          </tr>
        </tbody>
      </table>
    `;
    const card = document.querySelector('tr[data-impression]');
    const priceElement = document.querySelector('td.prc_hs');
    Overlay.renderOrUpdateListItem({
      ...makeVehicle({
        carId: '41082563',
        history: [
          { price: 21990000, date: '2026-04-01', timestamp: 1, source: 'LIST' }
        ]
      }),
      cardElement: card,
      priceElement
    });

    const tracker = card.querySelector('.encar-price-tracker-list-ui');
    assert(tracker !== null, 'tracker should exist inside row');
    assert(card.querySelector('td.inf .encar-price-tracker-list-ui') !== null, 'tracker should be appended to info cell');
  });

  test('LIST hover 시 history graph tooltip 1개 생성 후 제거', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>1,890</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const badge = Overlay.renderOrUpdateListItem({
      ...makeVehicle({
        history: [
          { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
          { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
        ]
      }),
      cardElement: card,
      priceElement
    });

    badge.dispatchEvent(new window.Event('mouseenter'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 1);
    assert(document.querySelector('.ept-tip-chart svg') !== null, 'sparkline svg should exist');
    assertEqual(document.querySelectorAll('.ept-tip-chart circle').length, 2);
    assertEqual(document.querySelectorAll('.ept-tip-history .ept-tip-row').length, 2);

    badge.dispatchEvent(new window.Event('mouseleave'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 0);
  });

  test('LIST hover graph는 history 1건이면 점 1개만 표시한다', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>3,040</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const badge = Overlay.renderOrUpdateListItem({
      ...makeVehicle({
        history: [
          { price: 30400000, date: '2026-05-03', timestamp: 1, source: 'DETAIL' }
        ],
        lastSeenAt: '2026-05-03T12:00:00.000Z'
      }),
      cardElement: card,
      priceElement
    });

    badge.dispatchEvent(new window.Event('mouseenter'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 1);
    assert(document.querySelector('.ept-tip-chart line') !== null, 'single-point sparkline should render a short line');
    assertEqual(document.querySelectorAll('.ept-tip-chart circle').length, 1);
    assert(document.querySelector('.ept-tip-chart svg').outerHTML.includes('NaN') === false, 'sparkline svg should not contain NaN');
    assertEqual(document.querySelectorAll('.ept-tip-history .ept-tip-row').length, 1);
  });

  test('malformed history가 들어와도 sparkline 렌더가 죽지 않는다', () => {
    document.body.innerHTML = `
      <div class="price_wrap">
        <strong class="price">1,890만원</strong>
      </div>
    `;

    const root = Overlay.renderOrUpdate(makeVehicle({
      history: [
        { price: 18900000, date: '2026-05-03', timestamp: 1, source: 'DETAIL' },
        { price: NaN, date: '2026-05-04', timestamp: 2, source: 'DETAIL' }
      ],
      lastSeenAt: '2026-05-04T12:00:00.000Z'
    }));

    assert(root !== null, 'detail overlay should still render');
    assert(document.querySelector('.ept-detail-chart svg') !== null, 'valid points should still render chart');
    assert(document.querySelector('.ept-detail-chart').innerHTML.includes('NaN') === false, 'chart markup should not contain NaN');
  });

  test('LIST hover graph는 history가 많아도 최대 7개 점만 표시한다', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>3,040</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const history = Array.from({ length: 20 }, (_, index) => ({
      price: 30000000 + (index * 100000),
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      timestamp: index + 1,
      source: 'DETAIL'
    }));
    const badge = Overlay.renderOrUpdateListItem({
      ...makeVehicle({
        history,
        lastSeenAt: '2026-05-20T12:00:00.000Z'
      }),
      cardElement: card,
      priceElement
    });

    badge.dispatchEvent(new window.Event('mouseenter'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 1);
    assertEqual(document.querySelectorAll('.ept-tip-chart circle').length, 7);
    assertEqual(document.querySelectorAll('.ept-tip-history .ept-tip-row').length, 8);
  });

  test('LIST rerender 시 hover 중 tooltip 유지', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>1,890</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const vehicle = {
      ...makeVehicle({
        history: [
          { price: 20000000, date: '2026-01-01', timestamp: 1, source: 'LIST' },
          { price: 18900000, date: '2026-04-01', timestamp: 2, source: 'DETAIL' }
        ]
      }),
      cardElement: card,
      priceElement
    };

    const badge = Overlay.renderOrUpdateListItem(vehicle);
    badge.dispatchEvent(new window.Event('mouseenter'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 1);

    Overlay.renderOrUpdateListItem(vehicle);
    assertEqual(card.querySelectorAll('.encar-price-tracker-list-ui').length, 1);
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 1);

    badge.dispatchEvent(new window.Event('mouseleave'));
    assertEqual(document.querySelectorAll('#ept-list-tooltip').length, 0);
  });

  test('LIST placeholder를 먼저 만들고 같은 노드 내용만 업데이트한다', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>1,890</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const vehicle = {
      ...makeVehicle(),
      cardElement: card,
      priceElement
    };

    const placeholder = Overlay.ensureListPlaceholder(vehicle);
    assert(placeholder !== null, 'list placeholder should exist');
    assert(placeholder.classList.contains('is-loading'), 'list placeholder should be loading');
    assert(placeholder.textContent.includes('확인 중'), 'list placeholder should show loading text');
    assertEqual(card.querySelectorAll('.encar-price-tracker-list-ui').length, 1);

    const updated = Overlay.renderOrUpdateListItem(vehicle);
    assertEqual(updated, placeholder);
    assert(updated.classList.contains('is-ready'), 'updated list tracker should be ready');
    assertEqual(card.querySelectorAll('.encar-price-tracker-list-ui').length, 1);
  });

  test('LIST에서 첫 가격 그대로면 가격 동결 일수 표시', () => {
    document.body.innerHTML = `
      <ul id="car_list_area">
        <li id="card-1">
          <div class="info">
            <strong class="subject">현대 아반떼</strong>
            <div class="price_area"><strong>1,890</strong><span>만원</span></div>
          </div>
        </li>
      </ul>
    `;
    const card = document.getElementById('card-1');
    const priceElement = card.querySelector('.price_area');
    const vehicle = {
      ...makeVehicle({
        history: [
          { price: 18900000, date: '2026-05-01', timestamp: 1, source: 'LIST' }
        ],
        lastSeenAt: '2026-05-03T12:00:00.000Z'
      }),
      cardElement: card,
      priceElement
    };

    const updated = Overlay.renderOrUpdateListItem(vehicle);
    assert(updated.textContent.includes('3일째 가격 동결'), 'list tracker should show freeze days');
  });
});

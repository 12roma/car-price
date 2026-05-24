// Extractor Fixture Harness
// fixture HTML을 파싱해서 extractor 결과와 expected JSON을 비교한다

suite('Extractor - LIST', () => {
  function makeDoc(html) {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  const listHtml = `
    <div id="car_list_area">
      <ul class="car_list">
        <li>
          <a class="lst_imgbx" href="/dc/dc_cardetailview.do?carid=174397123"></a>
          <strong class="subject">2022년식 현대 아반떼 CN7</strong>
          <div class="price_area"><strong>1,890</strong><span>만원</span></div>
        </li>
        <li>
          <a class="lst_imgbx" href="/dc/dc_cardetailview.do?carid=183201456"></a>
          <strong class="subject">2021년식 현대 소나타</strong>
          <div class="price_area"><strong>2,350</strong></div>
        </li>
        <li>
          <!-- 가격 없는 카드 -->
          <a class="lst_imgbx" href="/dc/dc_cardetailview.do?carid=190000001"></a>
          <strong class="subject">기아 K5</strong>
        </li>
      </ul>
    </div>`;

  test('카드 3개 추출', () => {
    const doc = makeDoc(listHtml);
    const { vehicles, error } = Extractor.extractListVehicles(doc);
    assertEqual(error, null);
    assertEqual(vehicles.length, 3);
  });

  test('첫 번째 차량 carId 추출', () => {
    const doc = makeDoc(listHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    assertEqual(vehicles[0].carId, '174397123');
  });

  test('첫 번째 차량 가격 정규화 (1890만원)', () => {
    const doc = makeDoc(listHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    assertEqual(vehicles[0].price, 18900000);
  });

  test('사진우대 계약중 카드도 가격 블록에서 정상 추출', () => {
    const doc = makeDoc(`
      <div id="car_list_area">
        <ul class="car_list">
          <li>
            <a class="lst_imgbx" href="/dc/dc_cardetailview.do?carid=41920829"></a>
            <strong class="subject">기아 더 뉴 카니발 4세대</strong>
            <div class="price_area">
              <strong>5,161</strong><span>만원</span><em class="status">계약중</em>
            </div>
          </li>
        </ul>
      </div>
    `);
    const { vehicles } = Extractor.extractListVehicles(doc);
    assertEqual(vehicles[0].carId, '41920829');
    assertEqual(vehicles[0].price, 51610000);
  });

  test('가격 없는 카드 extractError=NO_PRICE', () => {
    const doc = makeDoc(listHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    assertEqual(vehicles[2].extractError, 'NO_PRICE');
  });

  test('URL 정규화 (tracking query 제거)', () => {
    const doc = makeDoc(listHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    assertEqual(vehicles[0].url, 'https://www.encar.com/dc/dc_cardetailview.do?carid=174397123');
  });

  test('카드 root 없으면 NO_CARD_ROOT', () => {
    const doc = makeDoc('<html><body><div id="other"></div></body></html>');
    const { vehicles, error } = Extractor.extractListVehicles(doc);
    assertEqual(error, 'NO_CARD_ROOT');
    assertEqual(vehicles.length, 0);
  });
});

suite('Extractor - DETAIL', () => {
  function makeDoc(html) {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  const detailHtml = `
    <div class="detail_wrap">
      <h3 class="subject">현대 아반떼 CN7 1.6 가솔린 스마트</h3>
      <div class="price_wrap">
        <div class="price"><strong>1,890</strong><span>만원</span></div>
      </div>
      <ul class="spec_detail">
        <li>2022년 01월</li>
        <li>12,234km</li>
        <li>차량번호 123가4567</li>
      </ul>
    </div>`;

  const detailUrl = 'https://www.encar.com/dc/dc_cardetailview.do?carid=174397123';

  test('carId를 URL에서 추출', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.carId, '174397123');
  });

  test('가격 1890 추출', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.price, 18900000);
  });

  test('가격 3080 추출', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <div class="price_wrap">
          <div class="price"><strong>3,080</strong><span>만원</span></div>
        </div>
      </div>
    `);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.price, 30800000);
  });

  test('title 추출', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.title, '현대 아반떼 CN7 1.6 가솔린 스마트');
  });

  test('year 2022 추출', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.year, 2022);
  });

  test('sourceType DETAIL', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.sourceType, 'DETAIL');
  });

  test('vehicleNo 추출', () => {
    const doc = makeDoc(detailHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.vehicleNo, '123가4567');
  });

  test('fem 상세 URL query carid 추출', () => {
    const doc = makeDoc(detailHtml);
    const femUrl = 'https://fem.encar.com/cars/detail/41545845?foo=1&carid=41545845';
    const { vehicle } = Extractor.extractDetailVehicle(doc, femUrl);
    assertEqual(vehicle.carId, '41545845');
  });

  test('/cars/detail/{carId} 경로에서 carId 추출', () => {
    const doc = makeDoc(detailHtml);
    const femPathUrl = 'https://fem.encar.com/cars/detail/41545845';
    const { vehicle } = Extractor.extractDetailVehicle(doc, femPathUrl);
    assertEqual(vehicle.carId, '41545845');
  });

  test('차량번호 없으면 null', () => {
    const noVehicleNoHtml = `
      <div class="detail_wrap">
        <h3 class="subject">현대 아반떼</h3>
        <div class="price_wrap"><div class="price">1,890만원</div></div>
      </div>`;
    const doc = makeDoc(noVehicleNoHtml);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.vehicleNo, null);
  });

  test('tracker UI 텍스트는 상세 price 추출에 재사용되지 않음', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <div class="price_wrap"><div class="price">1,890만원</div></div>
        <div data-encar-price-tracker="true">
          <div>오늘의 금액: 9,999만원</div>
          <div>차량번호: 999가9999</div>
        </div>
      </div>
    `);
    const { vehicle } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(vehicle.price, 18900000);
    assertEqual(vehicle.vehicleNo, null);
  });

  test('상세 가격 블록에 상태 문구가 섞여도 가격 추출', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <h3 class="subject">기아 더 뉴 카니발 4세대</h3>
        <div class="price_wrap">
          <div class="price"><strong>5,161</strong><span>만원</span><em>계약중</em></div>
        </div>
      </div>
    `);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, 'https://fem.encar.com/cars/detail/41920829?carid=41920829');
    assertEqual(error, null);
    assertEqual(vehicle.price, 51610000);
  });

  test('상세 가격 블록의 6,000만원(계약중)도 대표 가격으로 유지', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <div class="price_wrap">
          <div class="price"><strong>6,000</strong><span>만원</span><em>(계약중)</em></div>
        </div>
        <div class="finance_box">
          <span>월 30만원</span>
        </div>
      </div>
    `);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(error, null);
    assertEqual(vehicle.price, 60000000);
  });

  test('fem 상세 data-intl-currency 구조에서 가격 추출', () => {
    const doc = makeDoc(`
      <div class="pekn_vXocM">
        <p class="is4Ms_K_3M" data-intl-currency="true">
          <span class="z7tWTEs7N0" data-intl-currency-amount="29200000">2,920</span>
          <span data-intl-currency-unit="true">만원</span>
        </p>
        <button type="button">총비용계산기</button>
      </div>
    `);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, 'https://fem.encar.com/cars/detail/41920829?carid=41920829');
    assertEqual(error, null);
    assertEqual(vehicle.price, 29200000);
  });

  test('월 30만원 부대비용은 상세 대표 가격 후보에서 제외', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <div class="finance_summary">월 30만원</div>
        <div class="price_wrap">
          <div class="price"><strong>6,000</strong><span>만원</span><em>계약중</em></div>
        </div>
        <div data-encar-price-tracker="true">
          <span>오늘의 금액 7,000만원</span>
        </div>
      </div>
    `);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(error, null);
    assertEqual(vehicle.price, 60000000);
  });

  test('상세 대표 가격이 범위를 벗어나면 무효 처리', () => {
    const doc = makeDoc(`
      <div class="detail_wrap">
        <div class="price_wrap">
          <div class="price">600,000만원</div>
        </div>
      </div>
    `);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(error, 'NO_PRICE');
    assertEqual(vehicle, null);
  });

  test('가격 없으면 error=NO_PRICE, vehicle=null', () => {
    const noPrice = `<div class="detail_wrap"><h3 class="subject">test</h3></div>`;
    const doc = makeDoc(noPrice);
    const { vehicle, error } = Extractor.extractDetailVehicle(doc, detailUrl);
    assertEqual(error, 'NO_PRICE');
    assertEqual(vehicle, null);
  });
});

suite('PageDetector - DETAIL', () => {
  test('fem 상세 URL을 DETAIL로 인식', () => {
    assertEqual(PageDetector.getCurrentPageType('https://fem.encar.com/cars/detail/41920829?carid=41920829'), 'DETAIL');
  });

  test('www 상세 URL을 DETAIL로 인식', () => {
    assertEqual(PageDetector.getCurrentPageType('https://www.encar.com/dc/dc_cardetailview.do?carid=41920829'), 'DETAIL');
  });
});

suite('Extractor - LIST (실제 엔카 DOM, tr[data-impression])', () => {
  function makeDoc(html) {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  const realHtml = `
    <table class="tbl_car">
      <tbody id="prefer_list">
        <tr data-index="0" data-impression="41082563|750|162505|t17|n1">
          <td class="img">
            <a href="/dc/dc_cardetailview.do?listAdvType=prefer&carid=41082563" class="newLink _link"></a>
          </td>
          <td class="inf">
            <span class="cls"><strong>현대</strong> <em>뉴 투싼 ix</em></span>
          </td>
          <td class="prc_hs"><strong class="prc">750</strong>만원</td>
        </tr>
      </tbody>
      <tbody id="normal_list">
        <tr data-index="1" data-impression="38201456|1250|45200|t05|n1">
          <td class="img">
            <a href="/dc/dc_cardetailview.do?listAdvType=normal&carid=38201456" class="newLink _link"></a>
          </td>
          <td class="inf">
            <span class="cls"><strong>기아</strong> <em>K5</em></span>
          </td>
          <td class="prc_hs"><strong class="prc">1,250</strong>만원</td>
        </tr>
        <tr data-index="2" data-impression="39000001|0|10000|t01|n1">
          <td class="img">
            <a href="/dc/dc_cardetailview.do?carid=39000001" class="newLink _link"></a>
          </td>
          <td class="inf">
            <span class="cls"><strong>현대</strong> <em>아반떼</em></span>
          </td>
          <td class="prc_hs"></td>
        </tr>
      </tbody>
    </table>`;

  test('우대/일반등록 tr 2개 추출 (가격있는 것)', () => {
    const doc = makeDoc(realHtml);
    const { vehicles, error } = Extractor.extractListVehicles(doc);
    assertEqual(error, null);
    const withPrice = vehicles.filter(v => v.price);
    assertEqual(withPrice.length, 2);
  });

  test('data-impression에서 carId 추출 (우대등록)', () => {
    const doc = makeDoc(realHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    const v = vehicles.find(v => v.carId === '41082563');
    assert(Boolean(v), 'carId=41082563 차량 없음');
  });

  test('td.prc_hs strong.prc에서 가격 추출', () => {
    const doc = makeDoc(realHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    const v = vehicles.find(v => v.carId === '41082563');
    assertEqual(v && v.price, 7500000);
  });

  test('일반등록 carId 추출', () => {
    const doc = makeDoc(realHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    const v = vehicles.find(v => v.carId === '38201456');
    assertEqual(v && v.price, 12500000);
  });

  test('tracking query 제거 후 URL 정규화', () => {
    const doc = makeDoc(realHtml);
    const { vehicles } = Extractor.extractListVehicles(doc);
    const v = vehicles.find(v => v.carId === '41082563');
    assertEqual(v && v.url, 'https://www.encar.com/dc/dc_cardetailview.do?carid=41082563');
  });
});

suite('Extractor - URL utils', () => {
  test('getCarIdFromUrl - 정상', () => {
    const id = Extractor.getCarIdFromUrl('https://www.encar.com/dc/dc_cardetailview.do?carid=174397123');
    assertEqual(id, '174397123');
  });

  test('getCarIdFromUrl - 없으면 null', () => {
    const id = Extractor.getCarIdFromUrl('https://www.encar.com/fc/fc_carsearchlist.do');
    assertEqual(id, null);
  });

  test('normalizeUrl - tracking query 제거', () => {
    const url = Extractor.normalizeUrl('https://www.encar.com/dc/dc_cardetailview.do?carid=174397123&trackid=abc&from=search');
    assertEqual(url, 'https://www.encar.com/dc/dc_cardetailview.do?carid=174397123');
  });

  test('getCarIdFromPath - fem detail path', () => {
    const id = Extractor.getCarIdFromPath('https://fem.encar.com/cars/detail/41545845');
    assertEqual(id, '41545845');
  });
});

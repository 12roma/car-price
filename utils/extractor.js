// DOM Extraction Layer - pure functions, no storage calls
// TODO: selector 변경 시 이 파일만 수정 후 harness로 회귀 검증
const Extractor = (() => {

  // ─────────────────────────────────────────────
  // Selector 설정 (fallback 순서대로)
  // ─────────────────────────────────────────────

  // LIST 페이지 차량 카드 root
  const LIST_CARD_SELECTORS = [
    'tr[data-impression]',       // 실제 엔카 DOM (우대/일반등록 공통)
    '[data-impression]',
    '#car_list_area li',
    '.car_list li',
    '.lst_car li',
    'ul.result > li',
    '[class*="photo" i] li',
    '[class*="Photo" i] li',
    '[class*="grid" i] li',
    '[class*="card" i]',
    '[class*="Card" i]',
    '[class*="list" i] li',
    '[class*="item" i]'
  ];

  // 카드 내 링크 (carId 포함)
  const CARD_LINK_SELECTORS = [
    'a.newLink[href*="carid"]',  // 실제 엔카 DOM
    'a._link[href*="carid"]',
    'a.lst_imgbx',
    'a[href*="carid"]',
    'a[href*="carId"]',
    'a[href*="/cars/detail/"]',
    'a[href*="cardetail"]',
    'a.thumb'
  ];

  // 카드 내 가격
  const LIST_PRICE_SELECTORS = [
    'td.prc_hs strong',          // 실제 엔카 DOM
    'td.prc_hs',
    'strong.prc',
    '.price_area strong',
    '.price_area',
    '.price strong',
    '.price',
    '.price_wrap strong',
    '.price_wrap',
    '.lst_price strong',
    '.lst_price',
    '[class*="price" i] strong',
    '[class*="price" i]',
    '[class*="amount" i]'
  ];

  const EXCLUDED_PRICE_TEXT_PATTERN = /리스|렌트|월|개월/;
  const DETAIL_ANCILLARY_COST_PATTERN = /할부|리스|렌트|보험|월\s*납입|월\s*할부|월\s*리스|총비용|예상비용|부대비용|30\s*만원/;
  const DETAIL_MIN_PRICE_WON = 1000000;
  const DETAIL_MAX_PRICE_WON = 500000000;

  // 카드 내 제목
  const LIST_TITLE_SELECTORS = [
    '.subject',
    '.name',
    '.car_name',
    'strong.subject',
    '[class*="title" i]',
    '[class*="name" i] strong',
    '.cls',
    'strong'
  ];

  // DETAIL 페이지 가격
  // TODO: 실제 Encar DOM 확인 후 selector 보강 필요
  const DETAIL_PRICE_SELECTORS = [
    '.pekn_vXocM [data-intl-currency="true"]',
    '.pekn_vXocM [data-intl-currency-amount]',
    '.pekn_vXocM .is4Ms_K_3M',
    '.pekn_vXocM',
    '[data-intl-currency]',
    '[data-intl-currency-amount]',
    '.price_wrap .price',
    '.price_wrap .price strong',
    '.detail_price',
    '.detail_price strong',
    '.car_price',
    '.car_price strong',
    '#wrap_price',
    '#wrap_price strong',
    '.price',
    '.price strong'
  ];

  // DETAIL 페이지 제목
  const DETAIL_TITLE_SELECTORS = [
    '.subject',
    'h3.subject',
    '.car_subject',
    '#wrap_title h3',
    'h1',
    'h2'
  ];

  const DETAIL_INFO_SCOPE_SELECTORS = [
    '.spec_detail',
    '.detail_spec',
    '.car_info',
    '[class*="basic" i]',
    '[class*="info" i]',
    '[class*="spec" i]',
    'main',
    'section',
    'article'
  ];

  // DETAIL 페이지 주행거리
  const DETAIL_MILEAGE_SELECTORS = [
    '.spec_detail li:nth-child(2)',
    '.detail_spec li:nth-child(2)',
    '.car_info li:nth-child(2)'
  ];

  // DETAIL 페이지 연식
  const DETAIL_YEAR_SELECTORS = [
    '.spec_detail li:nth-child(1)',
    '.detail_spec li:nth-child(1)',
    '.car_info li:nth-child(1)'
  ];

  // ─────────────────────────────────────────────
  // 유틸
  // ─────────────────────────────────────────────

  function queryFirst(root, selectors) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (_) { /* invalid selector skip */ }
    }
    return null;
  }

  function queryAll(root, selectors) {
    const seen = new Set();
    const found = [];
    for (const sel of selectors) {
      try {
        const els = root.querySelectorAll(sel);
        Array.from(els).forEach(el => {
          if (!seen.has(el)) {
            seen.add(el);
            found.push(el);
          }
        });
      } catch (_) { /* invalid selector skip */ }
    }
    return found;
  }

  /**
   * URL에서 carId 추출
   * https://www.encar.com/dc/dc_cardetailview.do?carid=174397123
   */
  function getCarIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/[?&]carid=(\d+)/i);
    return match ? match[1] : null;
  }

  function getCarIdFromPath(url) {
    if (!url) return null;
    const match = String(url).match(/\/cars\/detail\/(\d+)/i);
    return match ? match[1] : null;
  }

  /**
   * carId를 여러 방식으로 추출
   * 1. card의 data-impression (실제 엔카 DOM: "carId|price|..." 형식)
   * 2. element dataset
   * 3. anchor href 파싱
   */
  function extractCarId(cardEl, linkEl) {
    // data-impression 우선 (실제 엔카 TR 구조)
    if (cardEl && cardEl.dataset && cardEl.dataset.impression) {
      const firstPart = cardEl.dataset.impression.split('|')[0];
      if (firstPart && /^\d+$/.test(firstPart)) return firstPart;
    }

    if (!linkEl) return null;

    // dataset
    if (cardEl.dataset && cardEl.dataset.carid) return cardEl.dataset.carid;
    if (cardEl.dataset && cardEl.dataset.carId) return cardEl.dataset.carId;
    if (linkEl.dataset && linkEl.dataset.carid) return linkEl.dataset.carid;
    if (linkEl.dataset && linkEl.dataset.carId) return linkEl.dataset.carId;

    // href URL param
    const href = linkEl.getAttribute('href') || '';
    const fromUrl = getCarIdFromUrl(href);
    if (fromUrl) return fromUrl;

    // href path segment (e.g. /detail/174397123)
    const pathMatch = href.match(/\/(\d{8,10})/);
    if (pathMatch) return pathMatch[1];

    const htmlMatch = (cardEl.outerHTML || '').match(/(?:carid|carId|data-carid|data-car-id)=["']?(\d{8,10})/);
    if (htmlMatch) return htmlMatch[1];

    return null;
  }

  /**
   * 정규화된 URL 생성 (tracking query 제거)
   */
  function normalizeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url, 'https://www.encar.com');
      // carid만 유지, tracking params 제거
      const carid = u.searchParams.get('carid');
      if (carid) {
        return `https://www.encar.com/dc/dc_cardetailview.do?carid=${carid}`;
      }
      return u.origin + u.pathname;
    } catch (_) {
      return url;
    }
  }

  /**
   * 가격 텍스트를 만원 단위 정수로 파싱
   */
  function parsePriceText(text) {
    if (!text) return null;
    return PricePolicy.normalizePrice(text.trim());
  }

  function findPriceTextFallback(card) {
    const text = normalizeTitle(card && card.textContent);
    if (!text) return null;
    if (EXCLUDED_PRICE_TEXT_PATTERN.test(text)) return null;
    const match = text.match(/[0-9,]+\s*만\s*원|[0-9,]+\s*만원|[0-9,]{6,}\s*원/);
    return match ? match[0] : null;
  }

  function getElementText(el) {
    return normalizeTitle(el ? el.textContent : '');
  }

  function isTrackerElement(el) {
    return Boolean(
      el && (
        el.matches('[data-encar-price-tracker="true"]') ||
        el.closest('[data-encar-price-tracker="true"]') ||
        el.id === 'encar-price-tracker-overlay' ||
        el.closest('#encar-price-tracker-overlay') ||
        el.id === 'ept-list-tooltip' ||
        el.closest('#ept-list-tooltip') ||
        el.classList.contains('encar-price-tracker') ||
        el.closest('.encar-price-tracker') ||
        el.classList.contains('encar-price-tracker-list-ui') ||
        el.closest('.encar-price-tracker-list-ui')
      )
    );
  }

  function hasTrackerDescendant(el) {
    return Boolean(
      el && el.querySelector && (
        el.querySelector('[data-encar-price-tracker="true"]') ||
        el.querySelector('#encar-price-tracker-overlay') ||
        el.querySelector('#ept-list-tooltip') ||
        el.querySelector('.encar-price-tracker') ||
        el.querySelector('.encar-price-tracker-list-ui')
      )
    );
  }

  function hasTrackerSibling(el) {
    if (!el || !el.parentElement) return false;
    return Array.from(el.parentElement.children).some(sibling => sibling !== el && isTrackerElement(sibling));
  }

  function isValidPriceText(text) {
    const normalized = String(text || '').replace(/\s+/g, '');
    if (!normalized || EXCLUDED_PRICE_TEXT_PATTERN.test(normalized)) return false;
    return /^[0-9,]+만원$/.test(normalized) || /^[0-9,]+원$/.test(normalized);
  }

  function hasValidScopedPriceText(text) {
    const normalized = String(text || '').replace(/\s+/g, '');
    if (!normalized || EXCLUDED_PRICE_TEXT_PATTERN.test(normalized)) return false;
    const parsed = parsePriceText(normalized);
    return PricePolicy.isValidVehiclePrice(parsed);
  }

  function sanitizeDetailPrice(price, rawPrice) {
    if (!PricePolicy.isValidVehiclePrice(price)) return null;
    if (price < DETAIL_MIN_PRICE_WON) {
      console.warn('[DETAIL_PRICE] out of range', { rawPrice, reason: 'below_min' });
      return null;
    }
    if (price > DETAIL_MAX_PRICE_WON) {
      console.warn('[DETAIL_PRICE] out of range', { rawPrice, reason: 'above_max' });
      return null;
    }
    return price;
  }

  function isDetailAncillaryText(text) {
    const normalized = String(text || '').replace(/\s+/g, '');
    if (!normalized) return true;
    return DETAIL_ANCILLARY_COST_PATTERN.test(normalized);
  }

  function isPreferredDetailPriceElement(el) {
    if (!el || !el.matches) return false;
    return (
      el.matches('[data-intl-currency="true"]') ||
      el.matches('[data-intl-currency-amount]') ||
      el.matches('.price_wrap .price') ||
      el.matches('.price_wrap .price strong') ||
      el.matches('.detail_price') ||
      el.matches('.detail_price strong') ||
      el.matches('.car_price') ||
      el.matches('.car_price strong') ||
      el.matches('#wrap_price') ||
      el.matches('#wrap_price strong')
    );
  }

  function isDetailPriceElementUsable(el, options = {}) {
    if (!el || isTrackerElement(el) || hasTrackerDescendant(el)) return false;
    if (!options.allowTrackerSibling && hasTrackerSibling(el)) return false;
    const text = getElementText(el);
    if (!text || isDetailAncillaryText(text)) return false;
    const parsed = sanitizeDetailPrice(parsePriceText(text), text);
    return parsed !== null;
  }

  function findPriceElement(card) {
    const scopedCandidates = queryAll(card, LIST_PRICE_SELECTORS)
      .filter(el => !isTrackerElement(el));

    const directCandidate = scopedCandidates.find(el => isValidPriceText(getElementText(el)));
    if (directCandidate) return directCandidate;

    // 사진우대/계약중 카드처럼 가격 블록 안에 상태 문구가 섞여도
    // price selector 내부라면 유효 가격으로 인정한다.
    const scopedPriceCandidate = scopedCandidates.find(el => hasValidScopedPriceText(getElementText(el)));
    if (scopedPriceCandidate) return scopedPriceCandidate;

    const allCandidates = Array.from(card.querySelectorAll('*'))
      .filter(el => !isTrackerElement(el));

    return allCandidates.find(el => isValidPriceText(getElementText(el))) || null;
  }

  function findDetailPriceElement(doc) {
    const preferredCandidates = queryAll(doc, DETAIL_PRICE_SELECTORS)
      .filter(el => isPreferredDetailPriceElement(el))
      .filter(el => isDetailPriceElementUsable(el, { allowTrackerSibling: true }));
    if (preferredCandidates.length > 0) return preferredCandidates[0];

    const scopedCandidates = queryAll(doc, DETAIL_PRICE_SELECTORS)
      .filter(el => isDetailPriceElementUsable(el, { allowTrackerSibling: true }));
    if (scopedCandidates.length > 0) return scopedCandidates[0];

    return Array.from(doc.querySelectorAll('*'))
      .filter(el => isDetailPriceElementUsable(el, { allowTrackerSibling: false }))
      .find(el => isValidPriceText(getElementText(el)) || hasValidScopedPriceText(getElementText(el))) || null;
  }

  function findDetailInfoScopes(doc) {
    const scopes = queryAll(doc, DETAIL_INFO_SCOPE_SELECTORS)
      .filter(el => !isTrackerElement(el));
    return scopes.length > 0 ? scopes : [doc.body].filter(Boolean);
  }

  function extractVehicleNo(doc) {
    const scopes = findDetailInfoScopes(doc);
    const pattern = /(?:[가-힣]{2,3})?\d{2,3}[가-힣]\d{4}/;

    for (const scope of scopes) {
      const candidates = Array.from(scope.querySelectorAll('li, dd, dt, span, div, p, td, th, strong, em'))
        .filter(el => !isTrackerElement(el) && !el.querySelector('[data-encar-price-tracker="true"]'));

      for (const el of candidates) {
        const text = getElementText(el);
        if (!text) continue;
        const match = text.match(pattern);
        if (match) return match[0];
      }
    }

    return null;
  }

  function normalizeTitle(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isVehicleLink(linkEl) {
    if (!linkEl) return false;
    const href = linkEl.getAttribute('href') || '';
    return Boolean(
      /carid=/i.test(href) ||
      /carId=/i.test(href) ||
      /cardetail/i.test(href) ||
      /\/cars\/detail\//i.test(href)
    );
  }

  function isVehicleCard(card) {
    if (!card || !card.querySelector) return false;
    const linkEl = queryFirst(card, CARD_LINK_SELECTORS);
    if (!isVehicleLink(linkEl)) return false;

    const carId = extractCarId(card, linkEl);
    const hasPriceCandidate = Boolean(queryFirst(card, LIST_PRICE_SELECTORS));
    return Boolean(carId || hasPriceCandidate);
  }

  function findVehicleCards(root) {
    const all = queryAll(root, LIST_CARD_SELECTORS);
    const seen = new Set();
    const cards = [];

    for (const candidate of all) {
      const card = isVehicleCard(candidate)
        ? candidate
        : candidate.closest && candidate.closest('tr[data-impression], li, article, [class*="card" i], [class*="item" i]');

      if (!card || seen.has(card) || !isVehicleCard(card)) continue;
      seen.add(card);
      cards.push(card);
    }

    return cards;
  }

  function extractListVehicle(card) {
    const linkEl = queryFirst(card, CARD_LINK_SELECTORS);
    if (!linkEl) return null;

    const href = linkEl.getAttribute('href') || '';
    const absoluteUrl = href.startsWith('http')
      ? href
      : `https://www.encar.com${href}`;

    const carId = extractCarId(card, linkEl);
    const url = normalizeUrl(absoluteUrl);
    const fallbackKey = url;

    const priceEl = findPriceElement(card);
    const rawPrice = priceEl ? getElementText(priceEl) : findPriceTextFallback(card);
    const price = parsePriceText(rawPrice);
    console.log('[PRICE] raw price text:', rawPrice);
    console.log('[PRICE] normalized:', price);
    if (rawPrice && !PricePolicy.isValidVehiclePrice(price)) {
      console.warn('[PRICE] invalid skipped:', price, rawPrice);
    }

    const titleEl = queryFirst(card, LIST_TITLE_SELECTORS);
    const title = normalizeTitle(titleEl ? titleEl.textContent : linkEl.textContent);

    if (!carId && !url) return null;

    return {
      carId,
      fallbackKey,
      title,
      price,
      url,
      sourceType: ENCAR.SOURCE.LIST,
      extractError: !price ? ENCAR.EXTRACT_ERRORS.NO_PRICE : null,
      cardElement: card,
      priceElement: priceEl
    };
  }

  // ─────────────────────────────────────────────
  // LIST 추출
  // ─────────────────────────────────────────────

  /**
   * LIST 페이지에서 차량 목록 추출
   * @param {Document|Element} doc
   * @returns {{ vehicles: Array, error: string|null }}
   */
  function extractListVehicles(doc) {
    const cards = findVehicleCards(doc);
    if (cards.length === 0) {
      return { vehicles: [], error: ENCAR.EXTRACT_ERRORS.NO_CARD_ROOT };
    }

    const vehicles = [];
    for (const card of cards) {
      const vehicle = extractListVehicle(card);
      if (!vehicle) continue;
      vehicles.push(vehicle);
    }

    return { vehicles, error: null };
  }

  // ─────────────────────────────────────────────
  // DETAIL 추출
  // ─────────────────────────────────────────────

  /**
   * DETAIL 페이지에서 차량 데이터 추출
   * @param {Document|Element} doc
   * @param {string} pageUrl
   * @returns {{ vehicle: Object|null, error: string|null }}
   */
  function extractDetailVehicle(doc, pageUrl) {
    // carId: URL 우선, DOM fallback
    let carId = getCarIdFromUrl(pageUrl) || getCarIdFromPath(pageUrl);

    if (!carId) {
      // DOM에서 carId 탐색
      const carIdEl = doc.querySelector('[data-carid],[data-car-id],[id*="carid"]');
      if (carIdEl) {
        carId = carIdEl.dataset.carid || carIdEl.dataset.carId || null;
      }
    }

    const url = normalizeUrl(pageUrl);
    const fallbackKey = url;

    const priceEl = findDetailPriceElement(doc);
    const rawPrice = priceEl ? getElementText(priceEl) : null;
    const price = sanitizeDetailPrice(parsePriceText(rawPrice), rawPrice);
    console.log('[DETAIL_EXTRACT] price', { rawPrice, price });

    if (!priceEl || !price) {
      return {
        vehicle: null,
        error: ENCAR.EXTRACT_ERRORS.NO_PRICE
      };
    }

    const titleEl = queryFirst(doc, DETAIL_TITLE_SELECTORS);
    const title = titleEl ? titleEl.textContent.trim() : '';

    const mileageEl = queryFirst(doc, DETAIL_MILEAGE_SELECTORS);
    const mileageRaw = mileageEl ? mileageEl.textContent.trim() : null;
    const mileage = mileageRaw && mileageRaw.match(/[\d,]+\s*km/i)
      ? mileageRaw.replace(/[^0-9km]/gi, '').replace(/km/i, '') + 'km'
      : mileageRaw;

    const yearEl = queryFirst(doc, DETAIL_YEAR_SELECTORS);
    const yearRaw = yearEl ? yearEl.textContent.trim() : null;
    const yearMatch = yearRaw && yearRaw.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const vehicleNo = extractVehicleNo(doc);
    console.log('[DETAIL_EXTRACT] vehicleNo', vehicleNo);

    return {
      vehicle: {
        carId,
        fallbackKey,
        title,
        price,
        url,
        mileage,
        year,
        vehicleNo,
        priceElement: priceEl,
        sourceType: ENCAR.SOURCE.DETAIL,
        extractError: !carId
          ? ENCAR.EXTRACT_ERRORS.NO_CAR_ID
          : (!price ? ENCAR.EXTRACT_ERRORS.NO_PRICE : null)
      },
      error: null
    };
  }

  return {
    getCarIdFromUrl,
    getCarIdFromPath,
    normalizeUrl,
    findVehicleCards,
    extractListVehicle,
    extractListVehicles,
    extractDetailVehicle
  };
})();

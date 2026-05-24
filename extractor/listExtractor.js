// DOM-only Encar LIST extractor for harness execution.
const ListExtractor = (() => {
  const CARD_SELECTORS = [
    'tr[data-impression]',       // 실제 엔카 DOM (우대/일반등록 공통)
    '[data-carid]',
    '[data-car-id]',
    '[data-car-no]',
    '[data-carno]',
    'li:has(a[href*="carid"])',
    'li:has(a[href*="/cars/detail/"])',
    'li:has(a[href*="cardetail"])',
    'div:has(a[href*="carid"])',
    'div:has(a[href*="/cars/detail/"])',
    '.car_list li',
    '#car_list_area li',
    '.list_area li',
    '.search_list li',
    '[class*="list" i] li',
    '[class*="item" i]:has(a[href])',
    '[class*="card" i]:has(a[href])',
    'article:has(a[href])'
  ];

  const LINK_SELECTORS = [
    'a.newLink[href*="carid"]',  // 실제 엔카 DOM
    'a._link[href*="carid"]',
    'a[href*="/cars/detail/"]',
    'a[href*="carid="]',
    'a[href*="cardetail"]',
    'a[href]'
  ];

  const TITLE_SELECTORS = [
    '[class*="title"]',
    '[class*="name"]',
    '.subject',
    'strong',
    'h2',
    'h3',
    'a'
  ];

  const PRICE_SELECTORS = [
    'td.prc_hs strong',          // 실제 엔카 DOM
    'strong.prc',
    '[class*="price"]',
    '[class*="Price"]',
    '.prc',
    'strong'
  ];

  function queryFirst(root, selectors) {
    for (const selector of selectors) {
      try {
        const el = root.querySelector(selector);
        if (el) return el;
      } catch (_) {
        // Some older browsers may not support :has().
      }
    }
    return null;
  }

  function queryAll(root, selectors) {
    for (const selector of selectors) {
      try {
        const els = Array.from(root.querySelectorAll(selector));
        if (els.length > 0) return els;
      } catch (_) {
        // Continue with fallback selectors.
      }
    }
    return [];
  }

  function countRootCandidates(doc) {
    const seen = new Set();
    for (const selector of CARD_SELECTORS) {
      try {
        Array.from(doc.querySelectorAll(selector)).forEach(el => seen.add(el));
      } catch (_) {
        // Continue with fallback selectors.
      }
    }
    return seen.size;
  }

  function normalizeUrl(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin || 'https://www.encar.com');
      return url.href;
    } catch (_) {
      return href;
    }
  }

  function extractCarIdFromText(text) {
    if (!text) return null;
    const patterns = [
      /[?&]carid=(\d+)/i,
      /\/cars\/detail\/(\d+)/i,
      /cardetail[^0-9]+(\d+)/i,
      /(?:data-carid|data-car-id)=["']?(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = String(text).match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function extractCarId(card, link) {
    const dataset = card.dataset || {};
    // data-impression 우선 (실제 엔카 TR 구조: "carId|price|..." 형식)
    if (dataset.impression) {
      const firstPart = dataset.impression.split('|')[0];
      if (firstPart && /^\d+$/.test(firstPart)) return firstPart;
    }
    if (dataset.carid) return dataset.carid;
    if (dataset.carId) return dataset.carId;
    if (dataset.carNo) return dataset.carNo;
    if (dataset.carno) return dataset.carno;
    if (link) {
      const linkDataset = link.dataset || {};
      if (linkDataset.carid) return linkDataset.carid;
      if (linkDataset.carId) return linkDataset.carId;
      const hrefId = extractCarIdFromText(link.getAttribute('href'));
      if (hrefId) return hrefId;
    }
    return extractCarIdFromText(card.outerHTML);
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function extractTitle(card, link) {
    const titleEl = queryFirst(card, TITLE_SELECTORS);
    const title = textOf(titleEl) || textOf(link);
    return title.replace(/\s*[0-9,]+\s*만?\s*원.*$/, '').trim();
  }

  function extractPriceInfo(card) {
    const priceEl = queryFirst(card, PRICE_SELECTORS);
    const priceFromSelector = PriceParser.parsePrice(textOf(priceEl));
    if (priceFromSelector) return { price: priceFromSelector, priceElement: priceEl };

    const priceMatch = card.textContent.match(/[0-9,]+\s*만원|[0-9,]+\s*만\s*원|[0-9,]{4,}\s*원/);
    return { price: priceMatch ? PriceParser.parsePrice(priceMatch[0]) : null, priceElement: priceEl };
  }

  function extractListVehicles(doc) {
    const cards = queryAll(doc, CARD_SELECTORS);
    const seen = new Set();
    const vehicles = [];

    for (const card of cards) {
      const link = queryFirst(card, LINK_SELECTORS);
      const carId = extractCarId(card, link);
      if (!carId || seen.has(carId)) continue;

      const href = link ? link.getAttribute('href') : null;
      const url = normalizeUrl(href);
      const { price, priceElement } = extractPriceInfo(card);
      const title = extractTitle(card, link);

      if (!price || !url) continue;
      seen.add(carId);
      vehicles.push({
        carId,
        title,
        price,
        url,
        priceElement,
        cardElement: card,
        source: 'LIST',
        sourceType: 'LIST'
      });
    }

    return vehicles;
  }

  return { extractListVehicles, extractCarIdFromText, countRootCandidates };
})();

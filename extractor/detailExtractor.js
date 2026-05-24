// DOM-only Encar DETAIL extractor for harness execution.
const DetailExtractor = (() => {
  const TITLE_SELECTORS = [
    '[class*="title"]',
    '[class*="Title"]',
    '[class*="name"]',
    '.subject',
    'h1',
    'h2',
    'h3'
  ];

  const PRICE_SELECTORS = [
    '[class*="price"]',
    '[class*="Price"]',
    '.prc',
    'strong'
  ];

  const MILEAGE_SELECTORS = [
    '[class*="mileage"]',
    '[class*="Mileage"]',
    '[class*="km"]',
    '.spec_detail li',
    '.detail_spec li',
    'li'
  ];

  const YEAR_SELECTORS = [
    '[class*="year"]',
    '[class*="Year"]',
    '.spec_detail li',
    '.detail_spec li',
    'li'
  ];

  function queryFirst(root, selectors, predicate) {
    for (const selector of selectors) {
      try {
        const candidates = Array.from(root.querySelectorAll(selector));
        const found = predicate ? candidates.find(predicate) : candidates[0];
        if (found) return found;
      } catch (_) {
        // Continue with fallback selectors.
      }
    }
    return null;
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function getCarIdFromUrl(url) {
    if (!url) return null;
    const text = String(url);
    const patterns = [
      /[?&]carid=(\d+)/i,
      /\/cars\/detail\/(\d+)/i,
      /\/detail\/(\d+)/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  function getCarIdFromDom(doc) {
    const el = queryFirst(doc, ['[data-carid]', '[data-car-id]', '[id*="carid" i]']);
    if (!el) return null;
    const dataset = el.dataset || {};
    return dataset.carid || dataset.carId || getCarIdFromUrl(el.outerHTML);
  }

  function extractTitle(doc) {
    const titleEl = queryFirst(doc, TITLE_SELECTORS, el => {
      const text = textOf(el);
      return text.length >= 2 && !/[0-9,]+\s*만?\s*원/.test(text);
    });
    return textOf(titleEl);
  }

  function extractPrice(doc) {
    const priceEl = queryFirst(doc, PRICE_SELECTORS, el => PriceParser.parsePrice(textOf(el)));
    const selectorPrice = PriceParser.parsePrice(textOf(priceEl));
    if (selectorPrice) return selectorPrice;

    const match = doc.body.textContent.match(/[0-9,]+\s*만원|[0-9,]+\s*만\s*원|[0-9,]{4,}\s*원/);
    return match ? PriceParser.parsePrice(match[0]) : null;
  }

  function extractMileage(doc) {
    const mileageEl = queryFirst(doc, MILEAGE_SELECTORS, el => /[0-9,]+\s*km/i.test(textOf(el)));
    const text = textOf(mileageEl);
    const match = text.match(/[0-9,]+\s*km/i);
    return match ? match[0].replace(/\s+/g, '') : null;
  }

  function extractYear(doc) {
    const yearEl = queryFirst(doc, YEAR_SELECTORS, el => /(19|20)\d{2}/.test(textOf(el)));
    const match = textOf(yearEl).match(/(19|20)\d{2}/);
    return match ? parseInt(match[0], 10) : null;
  }

  function extractDetailVehicle(doc, pageUrl) {
    const carId = getCarIdFromUrl(pageUrl) || getCarIdFromDom(doc);
    const price = extractPrice(doc);

    if (!carId || !price) {
      return {
        vehicle: null,
        error: !carId ? 'NO_CAR_ID' : 'NO_PRICE'
      };
    }

    return {
      vehicle: {
        carId,
        title: extractTitle(doc),
        price,
        url: pageUrl,
        mileage: extractMileage(doc),
        year: extractYear(doc),
        source: 'DETAIL',
        sourceType: 'DETAIL'
      },
      error: null
    };
  }

  return { getCarIdFromUrl, extractDetailVehicle };
})();

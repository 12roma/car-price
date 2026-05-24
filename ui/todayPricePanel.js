// Small inline price tracking helper rendered under Encar price text.
const TodayPricePanel = (() => {
  const DETAIL_PANEL_ID = 'encar-today-price-panel';
  const LIST_PANEL_CLASS = 'encar-price-tracker-list-ui';
  const LEGACY_LIST_PANEL_CLASS = 'encar-list-price-helper';
  const LIST_CARD_SELECTORS = [
    'tr[data-impression]',
    '#car_list_area li',
    '.car_list li',
    '.lst_car li',
    'ul.result > li'
  ];

  const PRICE_ANCHOR_SELECTORS = [
    '[class*="price" i]',
    '[class*="Price"]',
    '[class*="amount" i]',
    '[class*="pay" i]',
    '.prc',
    'strong',
    'em'
  ];

  function ensureStyles() {
    if (document.getElementById('encar-price-helper-style')) return;
    const style = document.createElement('style');
    style.id = 'encar-price-helper-style';
    style.textContent = `
      .encar-price-helper,
      .${LIST_PANEL_CLASS},
      .${LEGACY_LIST_PANEL_CLASS} {
        box-sizing: border-box;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        max-width: 100%;
        margin-top: 6px;
        padding: 3px 4px;
        color: #222;
        background: rgba(255, 255, 0, 0.08);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 1.45;
        letter-spacing: 0;
        white-space: normal;
        overflow: visible;
      }
      .encar-price-helper {
        margin-bottom: 8px;
      }
      .encar-price-helper__line {
        display: block;
        white-space: normal;
      }
      .encar-price-helper__status {
        font-weight: 650;
        color: #374151;
      }
      .encar-price-helper__status--down { color: #059669; }
      .encar-price-helper__status--up { color: #dc2626; }
      .encar-price-helper__detail {
        margin-top: 3px;
        color: #7c8490;
      }
      #${DETAIL_PANEL_ID}.encar-price-helper--fallback {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        padding: 8px 10px;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(17, 24, 39, 0.1);
      }
    `;
    document.head.appendChild(style);
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function findPriceAnchor(root, expectedPrice) {
    const doc = root || document;
    for (const selector of PRICE_ANCHOR_SELECTORS) {
      try {
        const candidates = Array.from(doc.querySelectorAll(selector));
        const found = candidates.find(el => {
          const parsed = PriceParser.parsePrice(textOf(el));
          if (!parsed) return false;
          return expectedPrice ? parsed === expectedPrice : true;
        });
        if (found) return found;
      } catch (_) {
        // Continue with fallback selectors.
      }
    }

    const scope = doc.body || doc;
    const all = Array.from(scope.querySelectorAll('*'));
    return all.find(el => {
      const text = textOf(el);
      if (!/[0-9,]+\s*만\s*원|[0-9,]+\s*만원|[0-9,]{4,}\s*원/.test(text)) return false;
      const parsed = PriceParser.parsePrice(text);
      return parsed && (!expectedPrice || parsed === expectedPrice);
    }) || null;
  }

  function shortHtml(el) {
    if (!el) return '';
    return (el.outerHTML || textOf(el)).replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDisplayInfo(vehicle, now) {
    const history = Array.isArray(vehicle.history) ? vehicle.history : [];
    const currentRecord = PriceParser.getTodayOrLatestRecord(history, now);
    const previousRecord = PriceParser.getPreviousRecord(history, currentRecord);
    const currentPrice = currentRecord ? currentRecord.price : vehicle.price;
    const previousPrice = previousRecord ? previousRecord.price : null;
    const savedDate = currentRecord
      ? PriceParser.formatDateKey(PriceParser.getRecordDate(currentRecord))
      : '저장 정보 없음';
    const priceStatus = PriceParser.getPriceStatus(previousPrice, currentPrice);

    return {
      currentRecord,
      previousRecord,
      currentPrice,
      previousPrice,
      savedDate,
      priceStatus
    };
  }

  function statusClass(priceStatus) {
    if (priceStatus.startsWith('▼')) return 'encar-price-helper__status--down';
    if (priceStatus.startsWith('▲')) return 'encar-price-helper__status--up';
    return '';
  }

  function buildHelper(vehicle, options) {
    const opts = options || {};
    const info = getDisplayInfo(vehicle, opts.now);
    const el = document.createElement('div');
    el.className = opts.list
      ? LIST_PANEL_CLASS
      : 'encar-price-helper';
    if (!opts.list) el.id = DETAIL_PANEL_ID;
    el.setAttribute('data-encar-price-tracker', 'true');
    el.dataset.carId = vehicle.carId || '';
    el.innerHTML = `
      <span class="encar-price-helper__line">현재 가격 저장일: ${escapeHtml(info.savedDate)}</span>
      <span class="encar-price-helper__line">지금 가격 상황: <b class="encar-price-helper__status ${statusClass(info.priceStatus)}">${escapeHtml(info.priceStatus)}</b></span>
      ${opts.detail ? `<span class="encar-price-helper__line encar-price-helper__detail">차량명: ${escapeHtml(vehicle.title || '(차량명 없음)')}</span>` : ''}
      ${opts.detail ? `<span class="encar-price-helper__line encar-price-helper__detail">차량 ID: ${escapeHtml(vehicle.carId || '-')}</span>` : ''}
    `;
    return { el, info };
  }

  function findStableContainer(anchor, card, mode) {
    if (!anchor) return null;
    if (mode === 'list') {
      return anchor.closest('[class*="price" i], [class*="Price"], [class*="amount" i], [class*="right" i], [class*="info" i], div, li') || card || anchor.parentElement;
    }
    return anchor.closest('[class*="price" i], [class*="Price"], [class*="amount" i], [class*="summary" i], [class*="top" i], section, article, div') || anchor.parentElement;
  }

  function insertPanel(anchor, panel, options) {
    const opts = options || {};
    if (!anchor) {
      if (opts.mode === 'list' && opts.cardElement) {
        opts.cardElement.appendChild(panel);
        return true;
      }
      panel.classList.add('encar-price-helper--fallback');
      document.body.insertAdjacentElement('afterbegin', panel);
      return false;
    }

    const container = findStableContainer(anchor, opts.cardElement, opts.mode);
    if (container && container !== anchor && container.contains(anchor)) {
      container.appendChild(panel);
    } else {
      anchor.insertAdjacentElement('afterend', panel);
    }
    return true;
  }

  function cleanupOrphanListPanels(card, carId) {
    document.querySelectorAll(`.${LIST_PANEL_CLASS}, .${LEGACY_LIST_PANEL_CLASS}`).forEach(el => {
      if (card.contains(el)) return;
      if (carId && el.dataset.carId === carId) {
        el.remove();
        return;
      }

      const ownerCard = LIST_CARD_SELECTORS
        .map(selector => {
          try {
            return el.closest(selector);
          } catch (_) {
            return null;
          }
        })
        .find(Boolean);

      if (!ownerCard) el.remove();
    });
  }

  function logDiff(logger, info) {
    if (!logger) return;
    logger('DIFF', `prev: ${info.previousPrice === null || info.previousPrice === undefined ? '' : info.previousPrice}`);
    logger('DIFF', `current: ${info.currentPrice === null || info.currentPrice === undefined ? '' : info.currentPrice}`);
    logger('DIFF', `status: ${info.priceStatus}`);
  }

  function logPriceFormat(logger, price) {
    if (!logger || price === null || price === undefined) return;
    logger('PRICE', `raw stored price: ${price}`);
    logger('PRICE', `formatted price: ${PriceParser.formatPriceToManwon(price)}`);
  }

  function logInsertionVerification(logger, scope, anchor, panel) {
    if (!logger) return;
    logger(scope, `anchor found: ${Boolean(anchor)}`);
    logger(scope, `anchor html: ${shortHtml(anchor)}`);
    logger(scope, `anchor next sibling is panel: ${Boolean(anchor && anchor.nextElementSibling === panel)}`);
    logger(scope, `panel exists in dom: ${document.contains(panel)}`);
    logger(scope, `panel text: ${textOf(panel)}`);
    setTimeout(() => {
      logger(scope, `panel still exists after delay: ${document.contains(panel)}`);
    }, 500);
  }

  function renderOrUpdateDetail(vehicle, options) {
    ensureStyles();
    const opts = options || {};
    const existing = document.getElementById(DETAIL_PANEL_ID);
    const { el, info } = buildHelper(vehicle, { ...opts, detail: true });
    const anchor = findPriceAnchor(document, info.currentPrice);
    const wasExisting = Boolean(existing);
    if (existing) existing.remove();
    const insertedUnderPrice = insertPanel(anchor, el, { mode: 'detail' });

    if (opts.logger) {
      opts.logger('DETAIL_UI', `carId: ${vehicle.carId || ''}`);
      if (insertedUnderPrice) opts.logger('DETAIL_UI', 'inserted under price');
      else opts.logger('DETAIL_UI', wasExisting ? 'panel updated' : 'fallback inserted');
      opts.logger('DETAIL_UI', `saved date: ${info.savedDate}`);
      opts.logger('DETAIL_UI', `price status: ${info.priceStatus}`);
    }
    logInsertionVerification(opts.logger, 'DETAIL_UI', anchor, el);
    logPriceFormat(opts.logger, info.currentPrice);
    logDiff(opts.logger, info);
    return el;
  }

  function renderOrUpdateListItem(vehicle, options) {
    ensureStyles();
    const opts = options || {};
    const card = opts.cardElement || vehicle.cardElement || null;
    const anchor = opts.priceElement || vehicle.priceElement || (card ? findPriceAnchor(card, vehicle.price) : null);
    const { el, info } = buildHelper(vehicle, { ...opts, list: true });
    const carId = String(vehicle.carId || '');
    if (!card) return null;

    cleanupOrphanListPanels(card, carId);

    const existingNodes = Array.from(card.querySelectorAll(`.${LIST_PANEL_CLASS}, .${LEGACY_LIST_PANEL_CLASS}`));
    const existing = existingNodes.find(node => node.dataset.carId === carId) || existingNodes[0] || null;
    existingNodes
      .filter(node => node !== existing)
      .forEach(node => node.remove());

    el.dataset.carId = carId;
    if (existing) {
      if (existing.innerHTML !== el.innerHTML) existing.innerHTML = el.innerHTML;
      if (existing.className !== LIST_PANEL_CLASS) existing.className = LIST_PANEL_CLASS;
      existing.dataset.carId = carId;
      return existing;
    }

    const insertedUnderPrice = insertPanel(anchor, el, { mode: 'list', cardElement: card });

    if (opts.logger) {
      opts.logger('LIST_UI', `carId: ${carId}`);
      if (insertedUnderPrice) opts.logger('LIST_UI', 'inserted under price');
      else opts.logger('LIST_UI', existing ? 'panel updated' : 'fallback inserted');
      opts.logger('LIST_UI', `saved date: ${info.savedDate}`);
      opts.logger('LIST_UI', `price status: ${info.priceStatus}`);
    }
    logInsertionVerification(opts.logger, 'LIST_UI', anchor, el);
    logPriceFormat(opts.logger, info.currentPrice);
    logDiff(opts.logger, info);
    return el;
  }

  function renderOrUpdate(vehicle, options) {
    return renderOrUpdateDetail(vehicle, options);
  }

  function exists() {
    return Boolean(document.getElementById(DETAIL_PANEL_ID));
  }

  return {
    renderOrUpdate,
    renderOrUpdateDetail,
    renderOrUpdateListItem,
    exists,
    findPriceAnchor,
    getDisplayInfo,
    formatPriceToManwon: PriceParser.formatPriceToManwon
  };
})();

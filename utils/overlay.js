// Presentation Layer: 상세 페이지 본문 가격 패널
const Overlay = (() => {
  const OVERLAY_ID = ENCAR.OVERLAY_ID;
  const TRACKER_BASE_CLASS = 'encar-price-tracker';
  const DETAIL_UI_CLASS = 'encar-price-tracker-detail-ui';
  const PRICE_ANCHOR_SELECTORS = [
    '.pekn_vXocM',
    '[data-intl-currency]',
    '[data-intl-currency-amount]',
    '.vehicle_price',
    '.sale_price',
    '.price_wrap .price',
    '.price_wrap',
    '.detail_price',
    '.car_price',
    '#wrap_price',
    '[class*="vehicle" i][class*="price" i]',
    '[class*="sale" i][class*="price" i]',
    '[class*="price" i]',
    '[class*="Price"]',
    '[class*="amount" i]',
    '.prc',
    'strong',
    'em'
  ];

  function _formatPrice(price) {
    if (price === null || price === undefined) return '-';
    return PricePolicy.formatPriceToManwon(price);
  }

  function _formatDiff(diff) {
    if (diff === null || diff === undefined) return null;
    const abs = Math.round(Math.abs(diff) / 10000);
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    return sign + abs.toLocaleString() + '만원';
  }

  function _diffClass(diff) {
    if (diff === null) return '';
    if (diff < 0) return 'ept-diff--down';
    if (diff > 0) return 'ept-diff--up';
    return '';
  }

  function _todayKey(value) {
    const d = value ? new Date(value) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function _getTodayRecord(history) {
    const validHistory = PricePolicy.getDisplayHistory(history);
    if (validHistory.length === 0) return null;
    const today = _todayKey();
    const records = validHistory.filter(item => {
      if (item.date) return item.date === today;
      return _todayKey(item.timestamp || item.checkedAt) === today;
    });
    return records[records.length - 1] || validHistory[validHistory.length - 1];
  }

  function _findPreviousPrice(history, todayRecord) {
    const validHistory = PricePolicy.getDisplayHistory(history);
    if (validHistory.length === 0 || !todayRecord) return null;
    for (let i = validHistory.length - 1; i >= 0; i--) {
      const item = validHistory[i];
      if (item === todayRecord) continue;
      if (item.price !== todayRecord.price) return item.price;
    }
    return null;
  }

  function _findPriceAnchor(expectedPrice) {
    for (const selector of PRICE_ANCHOR_SELECTORS) {
      try {
        const found = Array.from(document.querySelectorAll(selector)).find(el => {
          if (el.closest('[data-encar-price-tracker="true"]')) return false;
          const text = el.textContent || '';
          if (!/[0-9,]+\s*만\s*원|[0-9,]+\s*만원|[0-9,]+\s*원/.test(text)) return false;
          const parsed = PricePolicy.normalizePrice(text);
          return expectedPrice ? parsed === expectedPrice : Boolean(parsed);
        });
        if (found) return found;
      } catch (_) {
        // Continue with fallback selectors.
      }
    }
    return null;
  }

  function _insertionTarget(anchor) {
    if (!anchor) return null;
    return anchor.closest('.pekn_vXocM, .price_wrap, .detail_price, .car_price, #wrap_price, [data-intl-currency], [class*="vehicle" i][class*="price" i], [class*="sale" i][class*="price" i], [class*="price" i], [class*="Price"], [class*="amount" i], section, article, div')
      || anchor.parentElement
      || anchor;
  }

  /**
   * 상세 inline UI HTML 빌드
   */
  function _buildHtml(vehicle) {
    const todayRecord = _getTodayRecord(vehicle.history);
    const latest = todayRecord ? todayRecord.price : PricePolicy.getLatestPrice(vehicle.history);
    const prev = _findPreviousPrice(vehicle.history, todayRecord);
    const diff = prev !== null && latest !== null ? latest - prev : null;
    const freezeDays = PricePolicy.getPriceFreezeDays(vehicle.history, vehicle.lastSeenAt);
    const graphSvg = _buildSparklineSvg(vehicle.history, vehicle.lastSeenAt);
    const checkedAt = todayRecord
      ? (todayRecord.date || _todayKey(todayRecord.timestamp || todayRecord.checkedAt))
      : _todayKey(vehicle.lastSeenAt);
    const diffText = diff === null
      ? (PricePolicy.isValidVehiclePrice(latest)
        ? (freezeDays ? `${freezeDays}일째 가격 동결` : '첫 추적')
        : '가격 확인 필요')
      : (diff === 0
        ? '변동 없음'
        : `${diff < 0 ? '▼' : '▲'} ${Math.round(Math.abs(diff) / 10000).toLocaleString()}만원`);

    return `
      ${graphSvg ? `<div class="ept-detail-chart">${graphSvg}</div>` : '<div class="ept-list-line">가격 확인 중</div>'}
      <div class="ept-list-line">현재 가격 저장일: ${_escapeHtml(checkedAt || '-')}</div>
      <div class="ept-list-line">지금 가격 상황: <span class="ept-list-diff ${_diffClass(diff)}">${_escapeHtml(diffText)}</span></div>
      ${vehicle.vehicleNo ? `<div class="ept-list-line">차량번호: ${_escapeHtml(vehicle.vehicleNo)}</div>` : ''}
    `;
  }

  function _buildDetailFailureHtml(vehicle) {
    const checkedAt = _todayKey(vehicle.lastSeenAt);
    return `
      <div class="ept-list-line">가격 추출 실패</div>
      <div class="ept-list-line">현재 가격 저장일: ${_escapeHtml(checkedAt || '-')}</div>
      <div class="ept-list-line">지금 가격 상황: 가격 확인 중</div>
      ${vehicle.vehicleNo ? `<div class="ept-list-line">차량번호: ${_escapeHtml(vehicle.vehicleNo)}</div>` : ''}
    `;
  }

  function _escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 상세 inline tracker 생성 또는 업데이트 (idempotent)
   */
  function _buildLoadingHtml() {
    return `
      <div class="ept-list-line">가격 추적 확인 중...</div>
      <div class="ept-list-line">추적 정보 확인 중...</div>
    `;
  }

  function _setTrackerReadyState(root, state) {
    if (!root) return;
    root.classList.toggle('is-loading', state === 'loading');
    root.classList.toggle('is-ready', state === 'ready');
  }

  function _updateTrackerContent(root, html, state) {
    if (!root) return null;
    if (root.innerHTML !== html) root.innerHTML = html;
    _setTrackerReadyState(root, state);
    return root;
  }

  function _resolveTrackerKey(vehicle) {
    return String(vehicle.carId || vehicle.fallbackKey || '');
  }

  function ensureDetailPlaceholder(vehicle) {
    const existing = document.getElementById(OVERLAY_ID);
    const anchor = vehicle.priceElement && document.contains(vehicle.priceElement)
      ? vehicle.priceElement
      : _findPriceAnchor(PricePolicy.getLatestPrice(vehicle.history));
    const target = _insertionTarget(anchor);
    const trackerKey = _resolveTrackerKey(vehicle);

    if (!target) {
      console.warn('[DETAIL_UI] price target not found', {
        carId: trackerKey || null,
        expectedPrice: PricePolicy.getLatestPrice(vehicle.history) || vehicle.price || null
      });
      return existing || null;
    }
    console.log('[DETAIL_UI] price target found', target);

    if (existing) {
      existing.setAttribute('data-tracker-page', 'detail');
      existing.setAttribute('data-car-id', trackerKey);
      existing.setAttribute('data-tracker-key', trackerKey);
      if (target && existing.previousElementSibling !== target && !target.contains(existing)) {
        target.insertAdjacentElement('afterend', existing);
      }
      return existing;
    }

    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.className = `${TRACKER_BASE_CLASS} ${DETAIL_UI_CLASS} is-loading`;
    root.setAttribute('data-encar-price-tracker', 'true');
    root.setAttribute('data-tracker-page', 'detail');
    root.setAttribute('data-car-id', trackerKey);
    root.setAttribute('data-tracker-key', trackerKey);
    root.innerHTML = _buildLoadingHtml();
    target.insertAdjacentElement('afterend', root);
    console.log('[DETAIL_UI] placeholder inserted', {
      carId: trackerKey || null,
      target
    });
    return root;
  }

  /**
   * 상세 inline tracker 생성 또는 업데이트 (idempotent)
   */
  function renderOrUpdate(vehicle) {
    const root = ensureDetailPlaceholder(vehicle);
    if (!root) return null;
    const latest = PricePolicy.getLatestPrice(vehicle.history);
    const html = PricePolicy.isValidVehiclePrice(latest)
      ? _buildHtml(vehicle)
      : _buildDetailFailureHtml(vehicle);
    const updated = _updateTrackerContent(root, html, 'ready');
    console.log('[DETAIL_UI] tracker updated', {
      carId: vehicle.carId || vehicle.fallbackKey || null,
      latestPrice: latest || null
    });
    return updated;
  }

  const LIST_UI_CLASS = 'encar-price-tracker-list-ui';
  const TOOLTIP_ID = 'ept-list-tooltip';
  const LIST_CARD_SELECTORS = [
    'tr[data-impression]',
    '#car_list_area li',
    '.car_list li',
    '.lst_car li',
    'ul.result > li',
    '[class*="photo" i] li',
    '[class*="grid" i] li',
    '[class*="card" i]',
    '[class*="list" i] li',
    '[class*="item" i]'
  ];

  function _buildListBadgeInner(vehicle) {
    const todayRecord = _getTodayRecord(vehicle.history);
    const latest = todayRecord ? todayRecord.price : PricePolicy.getLatestPrice(vehicle.history);
    const prev = _findPreviousPrice(vehicle.history, todayRecord);
    const diff = prev !== null && latest !== null ? latest - prev : null;
    const freezeDays = PricePolicy.getPriceFreezeDays(vehicle.history, vehicle.lastSeenAt);
    const hasValidPrice = PricePolicy.isValidVehiclePrice(latest);
    const diffText = diff === null
      ? (hasValidPrice
        ? (freezeDays ? `${freezeDays}일째 가격 동결` : '첫 추적')
        : '가격 확인 필요')
      : `${diff < 0 ? '▼' : '▲'} ${Math.round(Math.abs(diff) / 10000).toLocaleString()}만원${diff < 0 ? ' 하락' : ' 상승'}`;
    const diffCls = diff === null ? '' : diff < 0 ? 'ept-diff--down' : 'ept-diff--up';
    const todayRecordDate = todayRecord
      ? (todayRecord.date || _todayKey(todayRecord.timestamp || todayRecord.checkedAt))
      : _todayKey(vehicle.lastSeenAt);
    return `
      <div class="ept-list-line">현재 가격 저장일: ${_escapeHtml(todayRecordDate || '-')}</div>
      <div class="ept-list-line">지금 가격 상황: <span class="ept-list-diff ${diffCls}">${_escapeHtml(diffText)}</span></div>
    `;
  }

  function _findListInsertionPoint(card, priceElement) {
    if (!card) return null;
    if (card.matches('tr') || card.querySelector('td.inf, td.info, td[class*="inf" i], td[class*="info" i]')) {
      return card.querySelector('td.inf')
        || card.querySelector('td.info')
        || card.querySelector('td[class*="inf" i]')
        || card.querySelector('td[class*="info" i]')
        || card.cells[1]
        || card;
    }
    if (priceElement && card.contains(priceElement)) return priceElement;

    return card.querySelector('td.prc_hs strong')
      || card.querySelector('td.prc_hs')
      || card.querySelector('.price_area strong')
      || card.querySelector('.price_area')
      || card.querySelector('[class*="price" i] strong')
      || card.querySelector('[class*="price" i]')
      || card.querySelector('[class*="amount" i]')
      || card.querySelector('.inf')
      || card.querySelector('.info')
      || card.querySelector('.subject')
      || card.querySelector('[class*="info" i]');
  }

  function _findOwnerCard(el) {
    return LIST_CARD_SELECTORS
      .map(selector => {
        try {
          return el.closest(selector);
        } catch (_) {
          return null;
        }
      })
      .find(Boolean) || null;
  }

  function _cleanupOrphanListUIs(card) {
    let removed = false;
    document.querySelectorAll(`.${LIST_UI_CLASS}`).forEach(el => {
      if (card.contains(el)) return;
      const ownerCard = _findOwnerCard(el);
      if (!ownerCard) { el.remove(); removed = true; }
    });
    if (removed) _hideTooltip();
  }

  function _buildSparklineSvg(history, today) {
    const chart = PricePolicy.buildChartDisplayData(history, 7);
    if (chart.length === 0) return '';
    const W = 200, H = 54, PAD = 6;
    const prices = chart.map(h => h.price);
    if (prices.length === 0) return '';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (![min, max].every(Number.isFinite)) {
      console.warn('[SPARKLINE] invalid coordinate');
      return '';
    }
    const rawRange = max - min;
    const range = rawRange || 1;
    const stepX = prices.length === 1 ? 0 : (W - PAD * 2) / (prices.length - 1);
    const toX = i => prices.length === 1 ? W / 2 : PAD + stepX * i;
    const toY = p => rawRange === 0
      ? H / 2
      : PAD + (H - PAD * 2) * (1 - (p - min) / range);

    const coordinates = prices.map((p, i) => ({
      x: toX(i),
      y: toY(p)
    }));
    if (!coordinates.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
      console.warn('[SPARKLINE] invalid coordinate');
      return '';
    }

    const points = coordinates
      .map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ');
    const line = prices.length === 1
      ? (() => {
          const point = coordinates[0];
          const x1 = point.x - 12;
          const x2 = point.x + 12;
          if (![x1, x2].every(Number.isFinite)) {
            console.warn('[SPARKLINE] invalid coordinate');
            return '';
          }
          return `<line x1="${x1.toFixed(1)}" y1="${point.y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${point.y.toFixed(1)}" stroke="#1a73e8" stroke-width="1.5" stroke-linecap="round"/>`;
        })()
      : `<polyline points="${points}" fill="none" stroke="#1a73e8" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (!line) return '';

    const dots = chart.map((h, i) => {
      const coordinate = coordinates[i];
      if (!coordinate || !Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y)) {
        console.warn('[SPARKLINE] invalid coordinate');
        return '';
      }
      const x = coordinate.x.toFixed(1);
      const y = coordinate.y.toFixed(1);
      const fill = i === prices.length - 1 ? '#1a73e8' : '#8ba2cf';
      const stroke = '#ffffff';
      const radius = i === prices.length - 1 ? '3.6' : '3';
      return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    }).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${line}${dots}</svg>`;
  }

  function _buildTooltipHtml(vehicle) {
    const valid = PricePolicy.getDisplayHistory(vehicle.history);
    const svgStr = _buildSparklineSvg(vehicle.history, vehicle.lastSeenAt);
    const rows = valid.slice().reverse().slice(0, 8).map(h => {
      const price = PricePolicy.formatPriceToManwon(h.price);
      const date = h.date || _todayKey(h.timestamp || h.checkedAt);
      return `<div class="ept-tip-row"><span class="ept-tip-date">${_escapeHtml(date)}</span><span class="ept-tip-price">${_escapeHtml(price)}</span></div>`;
    }).join('');
    return `<div id="${TOOLTIP_ID}" class="ept-list-tooltip" data-encar-price-tracker="true">${svgStr ? `<div class="ept-tip-chart">${svgStr}</div>` : ''}<div class="ept-tip-history">${rows || '<span class="ept-tip-empty">이력 없음</span>'}</div></div>`;
  }

  function _showTooltip(badge, vehicle) {
    if (PricePolicy.buildChartDisplayData(vehicle.history, 7).length === 0) return;
    const prev = document.getElementById(TOOLTIP_ID);
    if (prev) prev.remove();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = _buildTooltipHtml(vehicle).trim();
    const tooltip = wrapper.firstChild;
    document.body.appendChild(tooltip);
    const rect = badge.getBoundingClientRect();
    const tipH = tooltip.offsetHeight;
    const top = rect.top > tipH + 12
      ? rect.top + window.scrollY - tipH - 8
      : rect.bottom + window.scrollY + 8;
    tooltip.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 228))}px`;
    tooltip.style.top = `${top}px`;
  }

  function _hideTooltip() {
    const el = document.getElementById(TOOLTIP_ID);
    if (el) el.remove();
  }

  function _attachTooltipListeners(badge) {
    badge.addEventListener('mouseenter', () => {
      badge._eptHovered = true;
      if (badge._eptVehicle) _showTooltip(badge, badge._eptVehicle);
    });
    badge.addEventListener('mouseleave', () => {
      badge._eptHovered = false;
      _hideTooltip();
    });
  }

  /**
   * 리스트 카드에 인라인 상태 배지 렌더링 (idempotent)
   * - 카드 내에 .encar-price-tracker-list-ui 가 있으면 innerHTML만 갱신 (DOM 변경 최소화)
   * - 없으면 가격 영역 바로 아래에 삽입
   * - card 외부에 잘못 붙은 orphan badge는 사전 제거
   */
  function renderOrUpdateListItem(vehicle) {
    const card = vehicle.cardElement;
    if (!card) return;

    const carId = String(vehicle.carId || '');
    const sectionType = _detectSectionType(card);
    const badge = ensureListPlaceholder(vehicle);
    const inner = _buildListBadgeInner(vehicle);

    badge.setAttribute('data-car-id', carId);
    badge.setAttribute('data-tracker-key', carId);
    badge._eptVehicle = vehicle;
    _updateTrackerContent(badge, inner, 'ready');
    if (badge._eptHovered) {
      if (PricePolicy.buildChartDisplayData(vehicle.history, 7).length > 0) {
        _showTooltip(badge, vehicle);
      } else {
        _hideTooltip();
      }
    }
    console.log('[LIST_UI] section type:', sectionType);
    console.log('[LIST_UI] render target:', card);
    console.log('[LIST_UI] rendered:', vehicle.carId || vehicle.fallbackKey || '(unknown)', latestPriceForLog(vehicle));
    return badge;
  }

  function ensureListPlaceholder(vehicle) {
    const card = vehicle.cardElement;
    if (!card) return null;

    const carId = String(vehicle.carId || vehicle.fallbackKey || '');
    const anchor = _findListInsertionPoint(card, vehicle.priceElement);
    const sectionType = _detectSectionType(card);

    _cleanupOrphanListUIs(card);

    const existingNodes = Array.from(card.querySelectorAll(`.${LIST_UI_CLASS}`));
    const existing = existingNodes[0] || null;
    existingNodes.slice(1).forEach(el => el.remove());
    if (existing) {
      existing.setAttribute('data-car-id', carId);
      existing.setAttribute('data-tracker-key', carId);
      existing._eptVehicle = vehicle;
      _setTrackerReadyState(existing, existing.classList.contains('is-ready') ? 'ready' : 'loading');
      return existing;
    }

    const badge = document.createElement('div');
    badge.className = `${TRACKER_BASE_CLASS} ${LIST_UI_CLASS} is-loading`;
    badge.setAttribute('data-car-id', carId);
    badge.setAttribute('data-tracker-key', carId);
    badge.setAttribute('data-encar-price-tracker', 'true');
    badge.innerHTML = _buildLoadingHtml();
    badge._eptVehicle = vehicle;
    if (!badge._eptTooltipBound) {
      _attachTooltipListeners(badge);
      badge._eptTooltipBound = true;
    }

    if (anchor && anchor !== card) {
      if (anchor.matches('td, .inf, .info, [class*="info" i]')) {
        anchor.appendChild(badge);
      } else {
        anchor.insertAdjacentElement('afterend', badge);
      }
    } else {
      card.appendChild(badge);
      console.warn('[LIST_UI] insert fallback used', {
        carId: vehicle.carId || null,
        title: vehicle.title || '',
        card
      });
    }
    console.log('[LIST_UI] section type:', sectionType);
    console.log('[LIST_UI] render target:', card);
    console.log('[LIST_UI] inserted:', vehicle.carId || vehicle.fallbackKey || '(unknown)');
    return badge;
  }

  function latestPriceForLog(vehicle) {
    return PricePolicy.getLatestPrice(vehicle.history);
  }

  function _detectSectionType(card) {
    if (!card) return 'UNKNOWN';
    if (card.closest('#prefer_list, [id*="prefer" i], [class*="prefer" i]')) return 'PREFER';
    if (card.closest('#normal_list, [id*="normal" i], [class*="normal" i]')) return 'NORMAL';
    if (card.closest('[class*="photo" i], [class*="grid" i]')) return 'PHOTO';
    return card.matches('tr') ? 'ROW' : 'CARD';
  }

  /**
   * overlay 제거
   */
  function remove() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    _hideTooltip();
  }

  /**
   * overlay 존재 여부
   */
  function exists() {
    return !!document.getElementById(OVERLAY_ID);
  }

  return {
    renderOrUpdate,
    renderOrUpdateListItem,
    ensureDetailPlaceholder,
    ensureListPlaceholder,
    remove,
    exists,
    LIST_UI_CLASS
  };
})();

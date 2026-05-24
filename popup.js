// Popup UI: 최근 방문 차량 목록
(function () {
  'use strict';

  const LIMIT = 20;

  function formatPrice(price) {
    if (price === null || price === undefined) return '-';
    return PricePolicy.formatPriceToManwon(price);
  }

  function formatDiff(diff) {
    if (diff === null || diff === undefined) return '';
    if (diff === 0) return '';
    const sign = diff < 0 ? '▼' : '▲';
    const cls = diff < 0 ? 'diff-down' : 'diff-up';
    return `<span class="diff ${cls}">${sign}${Math.round(Math.abs(diff) / 10000).toLocaleString()}만원</span>`;
  }

  function statusLabel(status) {
    const map = {
      ACTIVE: '추적중',
      MISSING: '미확인',
      SUSPECT_SOLD: '판매추정',
      ARCHIVED: '보관됨'
    };
    return map[status] || status;
  }

  function statusClass(status) {
    return 'status-' + status.toLowerCase();
  }

  function renderVehicle(v) {
    const latest = PricePolicy.getLatestPrice(v.history);
    const diff = PricePolicy.getPriceDiff(v.history);

    const li = document.createElement('li');
    li.className = 'vehicle-item';
    li.innerHTML = `
      <div class="vehicle-info">
        <span class="vehicle-title">${v.title || '(제목 없음)'}</span>
        <span class="vehicle-status ${statusClass(v.status)}">${statusLabel(v.status)}</span>
      </div>
      <div class="vehicle-price">
        <span class="price-value">${formatPrice(latest)}</span>
        ${formatDiff(diff)}
      </div>
    `;

    li.addEventListener('click', () => {
      if (v.url) {
        chrome.tabs.create({ url: v.url });
      }
    });

    return li;
  }

  async function loadVehicles() {
    const loadingEl = document.getElementById('loading');
    const emptyEl = document.getElementById('empty');
    const listEl = document.getElementById('vehicle-list');

    try {
      const vehicles = await getRecentVehicles(LIMIT);

      loadingEl.style.display = 'none';

      if (vehicles.length === 0) {
        emptyEl.style.display = 'block';
        return;
      }

      listEl.style.display = 'block';
      vehicles.forEach(v => listEl.appendChild(renderVehicle(v)));
    } catch (e) {
      loadingEl.textContent = '데이터를 불러올 수 없습니다.';
    }
  }

  // storage.js는 content script 전용이므로 popup에서는 직접 구현
  function getRecentVehicles(limit) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(null, (items) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        const now = Date.now();
        const vehicles = Object.entries(items)
          .filter(([k]) => k.startsWith('vehicle_'))
          .map(([, v]) => ({
            ...v,
            status: StatusPolicy.evaluateStatus(v, now)
          }))
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
          .slice(0, limit);
        resolve(vehicles);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', loadVehicles);
})();

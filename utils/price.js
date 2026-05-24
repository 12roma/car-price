// Domain policy: price normalization, history dedup, diff calculation
const PricePolicy = (() => {
  const MANWON = 10000;
  const MIN_VEHICLE_PRICE = 1000000;
  const MAX_VEHICLE_PRICE = 3000000000;
  const EXCLUDED_PRICE_KEYWORDS = ['리스', '렌트', '월', '개월'];

  function isLeaseOrRentText(raw) {
    const text = String(raw || '');
    return EXCLUDED_PRICE_KEYWORDS.some(keyword => text.includes(keyword));
  }

  function normalizeStoredPrice(raw) {
    if (!Number.isFinite(raw)) return null;
    if (raw >= MIN_VEHICLE_PRICE && raw <= MAX_VEHICLE_PRICE) return Math.round(raw);
    if (raw >= 100 && raw <= MAX_VEHICLE_PRICE / MANWON) return Math.round(raw * MANWON);
    return null;
  }

  function isValidVehiclePrice(price) {
    return Number.isFinite(price)
      && price >= MIN_VEHICLE_PRICE
      && price <= MAX_VEHICLE_PRICE;
  }

  function formatPriceToManwon(price) {
    const normalized = normalizeStoredPrice(price);
    if (!normalized) return '-';
    return `${Math.round(normalized / MANWON).toLocaleString()}만원`;
  }

  /**
   * 가격 문자열을 원 단위 정수로 변환
   * "1,890만원" → 18900000, "18,900,000원" → 18900000
   */
  function normalizePrice(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return normalizeStoredPrice(raw);
    }

    const str = String(raw).replace(/\s/g, '');
    if (!str || isLeaseOrRentText(str)) return null;

    const manwonMatch = str.match(/([0-9,]+)만원/);
    if (manwonMatch) {
      const value = Number(manwonMatch[1].replace(/,/g, ''));
      return Number.isFinite(value) ? normalizeStoredPrice(value * MANWON) : null;
    }

    const wonMatch = str.match(/^([0-9,]+)원$/);
    if (wonMatch) {
      const value = Number(wonMatch[1].replace(/,/g, ''));
      return Number.isFinite(value) ? normalizeStoredPrice(value) : null;
    }

    return null;
  }

  /**
   * 오늘 날짜 문자열 반환 YYYY-MM-DD
   */
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * history에 새 가격을 추가해야 하는지 판단
   * - 첫 번째 기록이면 true
   * - 가격이 다르면 true
   * - 같은 날 같은 가격이면 false
   */
  function shouldAppendHistory(history, newPrice, date) {
    const normalizedNewPrice = normalizeStoredPrice(newPrice);
    if (!normalizedNewPrice) return false;

    const validHistory = getDisplayHistory(history);
    if (validHistory.length === 0) return true;
    const last = validHistory[validHistory.length - 1];
    // 같은 날 같은 가격이면 중복 방지
    if (last.date === date && last.price === normalizedNewPrice) return false;
    return true;
  }

  function getDisplayHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
      .map(item => {
        const price = normalizeStoredPrice(item && item.price);
        if (!price) return null;
        return { ...item, price };
      })
      .filter(Boolean);
  }

  function sanitizeVehicleHistory(vehicle) {
    if (!vehicle || !Array.isArray(vehicle.history)) {
      return {
        vehicle,
        changed: false,
        removedCount: 0
      };
    }

    const sanitizedHistory = getDisplayHistory(vehicle.history);
    const removedCount = vehicle.history.length - sanitizedHistory.length;
    const changed = removedCount > 0 || sanitizedHistory.some((item, index) => {
      const original = vehicle.history[index];
      return !original || original.price !== item.price;
    });

    return {
      vehicle: changed ? { ...vehicle, history: sanitizedHistory } : vehicle,
      changed,
      removedCount
    };
  }

  /**
   * history에서 최신 가격 반환
   */
  function getLatestPrice(history) {
    const validHistory = getDisplayHistory(history);
    if (validHistory.length === 0) return null;
    return validHistory[validHistory.length - 1].price;
  }

  /**
   * history에서 최신 이전 가격 반환 (직전 다른 가격)
   */
  function getPreviousPrice(history) {
    const validHistory = getDisplayHistory(history);
    if (validHistory.length < 2) return null;
    const latest = validHistory[validHistory.length - 1].price;
    for (let i = validHistory.length - 2; i >= 0; i--) {
      if (validHistory[i].price !== latest) return validHistory[i].price;
    }
    return null;
  }

  /**
   * 가격 차이 계산 (만원 단위, 음수 = 하락)
   */
  function getPriceDiff(history) {
    const latest = getLatestPrice(history);
    const previous = getPreviousPrice(history);
    if (latest === null || previous === null) return null;
    return latest - previous;
  }

  function toDayStart(value) {
    const date = value ? new Date(value) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function getPriceFreezeDays(history, referenceAt) {
    const validHistory = getDisplayHistory(history);
    if (validHistory.length === 0) return null;

    const firstPrice = validHistory[0].price;
    if (!isValidVehiclePrice(firstPrice)) return null;

    const hasPriceChange = validHistory.some(item => item.price !== firstPrice);
    if (hasPriceChange) return null;

    const firstRecord = validHistory[0];
    const startedAt = firstRecord.date || firstRecord.timestamp || firstRecord.checkedAt;
    if (!startedAt) return null;

    const startDay = toDayStart(startedAt);
    const endDay = toDayStart(referenceAt);
    const diffDays = Math.floor((endDay.getTime() - startDay.getTime()) / 86400000) + 1;
    if (diffDays <= 1) return null;
    return diffDays;
  }

  function toDateKey(value) {
    if (!value && value !== 0) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getSortTime(item, index) {
    const raw = item && (item.timestamp || item.checkedAt);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
    if (typeof raw === 'string') {
      const time = new Date(raw).getTime();
      if (Number.isFinite(time)) return time;
    }
    return index;
  }

  function buildChartDisplayData(history, maxPoints = 7) {
    const validHistory = getDisplayHistory(history)
      .map((item, index) => ({
        ...item,
        _dateKey: item.date || toDateKey(item.timestamp || item.checkedAt),
        _sortTime: getSortTime(item, index),
        _index: index
      }))
      .sort((a, b) => {
        if (a._sortTime !== b._sortTime) return a._sortTime - b._sortTime;
        return a._index - b._index;
      });

    if (validHistory.length === 0) return [];

    const dailyMap = new Map();
    validHistory.forEach(item => {
      const key = item._dateKey || `idx:${item._index}`;
      dailyMap.set(key, item);
    });

    const deduped = Array.from(dailyMap.values()).map(item => ({
      price: item.price,
      date: item.date || toDateKey(item.timestamp || item.checkedAt),
      timestamp: item.timestamp,
      checkedAt: item.checkedAt,
      source: item.source
    }));

    const limit = Math.max(1, Math.floor(maxPoints) || 7);
    if (deduped.length <= limit) return deduped;

    const picked = [];
    const lastIndex = deduped.length - 1;
    const lastSlot = limit - 1;
    for (let slot = 0; slot < limit; slot++) {
      const index = slot === lastSlot
        ? lastIndex
        : Math.round((slot * lastIndex) / lastSlot);
      const point = deduped[index];
      if (!picked.some(item =>
        item.date === point.date
        && item.price === point.price
        && item.timestamp === point.timestamp
        && item.checkedAt === point.checkedAt
      )) {
        picked.push(point);
      }
    }

    return picked;
  }

  /**
   * history record 생성
   */
  function makeHistoryRecord(price, source) {
    const normalized = normalizeStoredPrice(price);
    return {
      price: normalized,
      date: todayStr(),
      timestamp: Date.now(),
      source
    };
  }

  return {
    normalizePrice,
    normalizeStoredPrice,
    isValidVehiclePrice,
    isLeaseOrRentText,
    formatPriceToManwon,
    todayStr,
    getDisplayHistory,
    sanitizeVehicleHistory,
    shouldAppendHistory,
    getLatestPrice,
    getPreviousPrice,
    getPriceDiff,
    getPriceFreezeDays,
    buildChartDisplayData,
    makeHistoryRecord
  };
})();

// Harness price parser: normalize Encar price text to KRW integer.
const PriceParser = (() => {
  const MANWON = 10000;
  const EOK = 100000000;

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function parseNumber(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  function parsePrice(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw >= MANWON ? Math.round(raw) : Math.round(raw * MANWON);
    }

    const text = normalizeWhitespace(raw);
    if (!text || /상담|가격\s*미정|문의/.test(text)) return null;

    let total = 0;
    const eokMatch = text.match(/([0-9,]+)\s*억/);
    if (eokMatch) total += parseNumber(eokMatch[1]) * EOK;

    const manwonMatch = text.match(/([0-9,]+)\s*만\s*원|([0-9,]+)\s*만원/);
    if (manwonMatch) {
      total += parseNumber(manwonMatch[1] || manwonMatch[2]) * MANWON;
      return total || null;
    }

    if (/원/.test(text)) {
      const won = parseNumber(text);
      return won && won >= MANWON ? won : null;
    }

    const number = parseNumber(text);
    if (!number) return null;
    return number >= MANWON ? number : number * MANWON;
  }

  function getTodayKey(now) {
    const d = now ? new Date(now) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getPriceDiff(history) {
    if (!Array.isArray(history) || history.length < 2) return null;
    const current = history[history.length - 1].price;
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i].price !== current) return current - history[i].price;
    }
    return 0;
  }

  function formatPriceToManwon(priceInWon) {
    if (priceInWon === null || priceInWon === undefined || !Number.isFinite(Number(priceInWon))) {
      return '-';
    }
    const manwon = Math.round(Number(priceInWon) / MANWON);
    return `${manwon.toLocaleString()}만원`;
  }

  function getRecordDate(record) {
    if (!record) return null;
    return record.checkedAt || record.timestamp || record.date || null;
  }

  function formatDateKey(value) {
    if (!value) return '저장 정보 없음';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '저장 정보 없음';
    return getTodayKey(date);
  }

  function getLatestRecord(history) {
    return Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;
  }

  function getTodayOrLatestRecord(history, now) {
    if (!Array.isArray(history) || history.length === 0) return null;
    const today = getTodayKey(now);
    const todays = history.filter(item => getTodayKey(getRecordDate(item)) === today);
    return todays[todays.length - 1] || getLatestRecord(history);
  }

  function getPreviousRecord(history, currentRecord) {
    if (!Array.isArray(history) || !currentRecord) return null;
    const currentIndex = history.lastIndexOf(currentRecord);
    const start = currentIndex >= 0 ? currentIndex - 1 : history.length - 1;
    for (let i = start; i >= 0; i--) {
      return history[i];
    }
    return null;
  }

  function getPriceStatus(previousPrice, currentPrice) {
    if (previousPrice === null || previousPrice === undefined) return '첫 추적';
    if (currentPrice === null || currentPrice === undefined) return '저장 정보 없음';
    const diff = Number(currentPrice) - Number(previousPrice);
    if (diff === 0) return '변동 없음';
    const arrow = diff > 0 ? '▲' : '▼';
    return `${arrow} ${formatPriceToManwon(Math.abs(diff))}`;
  }

  function formatDiff(diff) {
    if (diff === null || diff === undefined) return '0';
    const sign = diff > 0 ? '+' : '';
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '-';
    return `${sign}${formatPriceToManwon(Math.abs(diff))} (${arrow})`;
  }

  return {
    parsePrice,
    getTodayKey,
    getPriceDiff,
    formatDiff,
    formatPriceToManwon,
    formatDateKey,
    getRecordDate,
    getLatestRecord,
    getTodayOrLatestRecord,
    getPreviousRecord,
    getPriceStatus
  };
})();

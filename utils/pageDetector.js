// Page Detection Layer: LIST/DETAIL 판별, SPA navigation 감지
const PageDetector = (() => {
  const LIST_URL_PATTERNS = [
    /\/dc\/dc_carsearchlist/i,
    /\/dc\/dc_searchlist/i,
    /\/dc\/dc_search/i,
    /\/fc\/fc_carsearchlist/i,
    /\/fc\/fc_searchlist/i,
    /\/fc\/fc_search/i,
    /\/list/i,
    /encar\.com\/#/i
  ];

  const DETAIL_URL_PATTERNS = [
    /\/dc\/dc_cardetailview/i,
    /[?&]carid=\d+/i,
    /\/cars\/detail\/\d+/i,
    /\/detail\/\d+/i
  ];

  function isListPage(url) {
    const u = url || location.href;
    return LIST_URL_PATTERNS.some(re => re.test(u));
  }

  function isDetailPage(url) {
    const u = url || location.href;
    return DETAIL_URL_PATTERNS.some(re => re.test(u));
  }

  function getCurrentPageType(url) {
    if (isDetailPage(url)) return 'DETAIL';
    if (isListPage(url)) return 'LIST';
    return 'OTHER';
  }

  // ─────────────────────────────────────────────
  // SPA navigation 감지: pushState/replaceState 가로채기
  // ─────────────────────────────────────────────

  let _onNavigate = null;

  function watchNavigation(callback) {
    _onNavigate = callback;

    const wrap = (original) => function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('encar_urlchange'));
      return result;
    };

    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);

    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('encar_urlchange'));
    });

    window.addEventListener('encar_urlchange', () => {
      if (_onNavigate) _onNavigate(location.href);
    });
  }

  return { isListPage, isDetailPage, getCurrentPageType, watchNavigation };
})();

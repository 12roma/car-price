// Global constants for Encar Price Tracker
const ENCAR = {
  DOMAIN: 'encar.com',

  STATUS: Object.freeze({
    ACTIVE: 'ACTIVE',
    MISSING: 'MISSING',
    SUSPECT_SOLD: 'SUSPECT_SOLD',
    ARCHIVED: 'ARCHIVED'
  }),

  SOURCE: Object.freeze({
    LIST: 'LIST',
    DETAIL: 'DETAIL'
  }),

  OVERLAY_ID: 'encar-price-tracker-overlay',

  STORAGE_KEY_PREFIX: 'vehicle_',

  // Days thresholds for status transitions
  SUSPECT_SOLD_DAYS: 7,
  ARCHIVED_DAYS: 30,
  SUSPECT_SOLD_MISSING_COUNT: 3,

  DEBOUNCE_MS: 800,
  RETRY_DELAY_MS: 1500,
  MAX_RETRIES: 2,

  EXTRACT_ERRORS: Object.freeze({
    NO_CARD_ROOT: 'NO_CARD_ROOT',
    NO_DETAIL_ROOT: 'NO_DETAIL_ROOT',
    NO_PRICE: 'NO_PRICE',
    NO_CAR_ID: 'NO_CAR_ID',
    NO_LINK: 'NO_LINK',
    PARTIAL_DATA: 'PARTIAL_DATA'
  })
};

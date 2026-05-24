// Node.js harness runner (jsdom 기반, 단일 vm 스크립트)
const { JSDOM } = require('jsdom');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://www.encar.com/'
});
const { window } = dom;

const ctx = vm.createContext({
  window: window,
  document: window.document,
  DOMParser: window.DOMParser,
  location: window.location,
  history: window.history,
  console: console,
  process: process,
  Date: Date,
  JSON: JSON,
  Math: Math,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isFinite: isFinite,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  URL: URL,
  chrome: {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        callback({ ok: true, status: 204, echoedEventName: message && message.eventName ? message.eventName : null });
      }
    },
    storage: {
      local: {
        _items: {},
        get(key, callback) {
          if (key === null) {
            callback({ ...this._items });
            return;
          }
          callback({ [key]: this._items[key] });
        },
        set(items, callback) {
          Object.assign(this._items, items);
          if (callback) callback();
        }
      }
    }
  }
});

const ROOT = path.resolve(__dirname, '..');
const files = [
  'utils/constants.js',
  'utils/pageDetector.js',
  'utils/price.js',
  'utils/ga-config.js',
  'utils/gaRepository.js',
  'utils/priceParser.js',
  'utils/merge.js',
  'utils/extractor.js',
  'utils/storage.js',
  'extractor/listExtractor.js',
  'extractor/detailExtractor.js',
  'utils/status.js',
  'utils/overlay.js',
  'storage/storageManager.js',
  'ui/todayPricePanel.js',
  'harness/harness-framework.js',
  'harness/extractor.harness.js',
  'harness/ga.harness.js',
  'harness/history.harness.js',
  'harness/status.harness.js',
  'harness/ui.harness.js',
  'harness/priceTracking.harness.js'
];

// 모든 파일을 하나의 스크립트로 합쳐서 const가 동일 스코프에 존재하도록 함
const combined = files.map(f => {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  return `// ── ${f} ──\n${code}`;
}).join('\n\n');

// 마지막에 결과 수집 코드 추가
const runner = combined + `\n\nHarnessRunner.run(null).then(result => {
  if (result.fail > 0) process.exitCode = 1;
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});`;

vm.runInContext(runner, ctx, { filename: 'harness-bundle' });

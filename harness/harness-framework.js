// 경량 테스트 프레임워크 (브라우저/Node.js 양용)
const HarnessRunner = (() => {
  const suites = [];
  let currentSuite = null;

  function suite(name, fn) {
    const s = { name, tests: [] };
    suites.push(s);
    const prev = currentSuite;
    currentSuite = s;
    fn();
    currentSuite = prev;
  }

  function test(name, fn) {
    if (!currentSuite) throw new Error('test() must be inside suite()');
    currentSuite.tests.push({ name, fn });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  function assertEqual(actual, expected, message) {
    const msg = message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    if (actual !== expected) throw new Error(msg);
  }

  function assertDeepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(message || `DeepEqual failed:\n  actual:   ${a}\n  expected: ${e}`);
  }

  async function run(outputEl) {
    let totalPass = 0;
    let totalFail = 0;
    const lines = [];
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

    for (const s of suites) {
      if (isNode) console.log(`\n▶ ${s.name}`);
      lines.push(`<div class="suite"><div class="suite-name">▶ ${s.name}</div>`);

      for (const t of s.tests) {
        try {
          await t.fn();
          totalPass++;
          if (isNode) console.log(`  ✓ ${t.name}`);
          lines.push(`  <div class="pass">  ✓ ${t.name}</div>`);
        } catch (e) {
          totalFail++;
          if (isNode) console.error(`  ✗ ${t.name}: ${e.message}`);
          lines.push(`  <div class="fail">  ✗ ${t.name}<br><pre>${e.message}</pre></div>`);
        }
      }
      lines.push('</div>');
    }

    const total = totalPass + totalFail;
    const summary = `${total}개 중 ${totalPass}개 통과, ${totalFail}개 실패`;
    if (isNode) console.log(`\n${summary}`);

    const cls = totalFail === 0 ? 'pass' : 'fail';
    lines.push(`<div class="summary ${cls}">${summary}</div>`);
    if (outputEl) outputEl.innerHTML = lines.join('\n');

    return { pass: totalPass, fail: totalFail };
  }

  return { suite, test, assert, assertEqual, assertDeepEqual, run };
})();

const { suite, test, assert, assertEqual, assertDeepEqual } = HarnessRunner;

// Status Transition Harness

suite('StatusPolicy - markActive', () => {
  test('ACTIVE로 전환, missingCount 초기화', () => {
    const v = { status: 'MISSING', missingCount: 2, lastSeenAt: 0, history: [] };
    const result = StatusPolicy.markActive(v);
    assertEqual(result.status, 'ACTIVE');
    assertEqual(result.missingCount, 0);
    assert(result.lastSeenAt > 0, 'lastSeenAt 갱신');
  });
});

suite('StatusPolicy - markMissing', () => {
  test('첫 번째 실패 → MISSING, count=1', () => {
    const v = { status: 'ACTIVE', missingCount: 0, history: [] };
    const result = StatusPolicy.markMissing(v);
    assertEqual(result.status, 'MISSING');
    assertEqual(result.missingCount, 1);
  });

  test('두 번째 실패 → MISSING, count=2', () => {
    const v = { status: 'MISSING', missingCount: 1, history: [] };
    const result = StatusPolicy.markMissing(v);
    assertEqual(result.status, 'MISSING');
    assertEqual(result.missingCount, 2);
  });

  test('세 번째 실패 → SUSPECT_SOLD, count=3', () => {
    const v = { status: 'MISSING', missingCount: 2, history: [] };
    const result = StatusPolicy.markMissing(v);
    assertEqual(result.status, 'SUSPECT_SOLD');
    assertEqual(result.missingCount, 3);
  });

  test('불변성: 원본 변경 없음', () => {
    const v = { status: 'ACTIVE', missingCount: 0, history: [] };
    StatusPolicy.markMissing(v);
    assertEqual(v.status, 'ACTIVE');
  });
});

suite('StatusPolicy - deriveStatusByTime', () => {
  const MS = 24 * 60 * 60 * 1000;

  test('7일 이상 경과 → SUSPECT_SOLD', () => {
    const v = { status: 'ACTIVE', missingCount: 0, lastSeenAt: Date.now() - 8 * MS, history: [] };
    const result = StatusPolicy.deriveStatusByTime(v);
    assertEqual(result.status, 'SUSPECT_SOLD');
  });

  test('30일 이상 경과 → ARCHIVED', () => {
    const v = { status: 'ACTIVE', missingCount: 0, lastSeenAt: Date.now() - 31 * MS, history: [] };
    const result = StatusPolicy.deriveStatusByTime(v);
    assertEqual(result.status, 'ARCHIVED');
  });

  test('6일 경과는 ACTIVE 유지', () => {
    const v = { status: 'ACTIVE', missingCount: 0, lastSeenAt: Date.now() - 6 * MS, history: [] };
    const result = StatusPolicy.deriveStatusByTime(v);
    assertEqual(result.status, 'ACTIVE');
  });

  test('이미 ARCHIVED면 유지', () => {
    const v = { status: 'ARCHIVED', missingCount: 0, lastSeenAt: Date.now() - 40 * MS, history: [] };
    const result = StatusPolicy.deriveStatusByTime(v);
    assertEqual(result.status, 'ARCHIVED');
  });

  test('불변성: 원본 변경 없음', () => {
    const v = { status: 'ACTIVE', missingCount: 0, lastSeenAt: Date.now() - 10 * MS, history: [] };
    StatusPolicy.deriveStatusByTime(v);
    assertEqual(v.status, 'ACTIVE');
  });
});

suite('StatusPolicy - evaluateStatus', () => {
  const MS = 24 * 60 * 60 * 1000;

  test('최근 방문은 ACTIVE 반환', () => {
    const v = { status: 'ACTIVE', lastSeenAt: Date.now() - MS };
    assertEqual(StatusPolicy.evaluateStatus(v), 'ACTIVE');
  });

  test('30일 초과이면 ARCHIVED 반환 (저장값 변경 없이)', () => {
    const v = { status: 'ACTIVE', lastSeenAt: Date.now() - 35 * MS };
    assertEqual(StatusPolicy.evaluateStatus(v), 'ARCHIVED');
    assertEqual(v.status, 'ACTIVE', '원본은 ACTIVE 유지');
  });
});

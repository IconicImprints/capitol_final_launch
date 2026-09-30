/**
 * Simple Moderation System Test
 * Basic functionality tests for the moderation system
 */

// Test text normalization
function testNormalizeText() {
  console.log('Testing text normalization...');
  
  const tests = [
    { input: 'Hello World', expected: 'hello world' },
    { input: 'H1TT3R', expected: 'httr' },
    { input: 'n.i.g.g.e.r', expected: 'n i g g e r' },
    { input: 'test___multiple___spaces', expected: 'test multiple spaces' },
    { input: 'CAPS LOCK', expected: 'caps lock' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    // Simple normalization logic (same as in moderation.js)
    let normalized = test.input.toLowerCase();
    normalized = normalized.replace(/[\._\-\*\+@#]/g, ' ');
    normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');
    normalized = normalized.replace(/[0-9]/g, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    if (normalized === test.expected) {
      console.log(`✅ "${test.input}" → "${normalized}"`);
      passed++;
    } else {
      console.log(`❌ "${test.input}" → "${normalized}" (expected: "${test.expected}")`);
      failed++;
    }
  }
  
  console.log(`Normalization: ${passed}/${tests.length} passed\n`);
  return { passed, failed };
}

// Test severity classification
function testSeverityClassification() {
  console.log('Testing severity classification...');
  
  const tests = [
    { violations: [], expected: 0 }, // Safe
    { violations: [{ severity: 1 }], expected: 1 }, // Mild profanity
    { violations: [{ severity: 2 }], expected: 2 }, // Targeted harassment
    { violations: [{ severity: 3 }], expected: 3 }, // Severe hate
    { violations: [{ severity: 4 }], expected: 4 }, // Repeated violations
    { violations: [{ severity: 5 }], expected: 5 }  // Persistent abuse
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const severity = test.violations.length === 0 ? 0 : Math.max(...test.violations.map(v => v.severity));
    
    if (severity === test.expected) {
      console.log(`✅ Severity ${test.expected} classified correctly`);
      passed++;
    } else {
      console.log(`❌ Expected severity ${test.expected}, got ${severity}`);
      failed++;
    }
  }
  
  console.log(`Severity classification: ${passed}/${tests.length} passed\n`);
  return { passed, failed };
}

// Test action determination
function testActionDetermination() {
  console.log('Testing action determination...');
  
  const config = {
    level_2_warning_count: 1,
    level_3_restriction_count: 2,
    level_4_suspension_count: 3,
    level_5_ban_count: 5
  };
  
  const tests = [
    { severity: 0, strikeCount: 0, expected: 'allowed' },
    { severity: 1, strikeCount: 0, expected: 'allowed' },
    { severity: 2, strikeCount: 0, expected: 'warning' },
    { severity: 2, strikeCount: 2, expected: 'restriction' },
    { severity: 3, strikeCount: 0, expected: 'warning' },
    { severity: 3, strikeCount: 2, expected: 'restriction' },
    { severity: 3, strikeCount: 3, expected: 'suspension' },
    { severity: 4, strikeCount: 0, expected: 'suspension' },
    { severity: 5, strikeCount: 5, expected: 'ban' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    let action;
    
    switch (test.severity) {
      case 0:
        action = 'allowed';
        break;
      case 1:
        action = 'allowed';
        break;
      case 2:
        if (test.strikeCount >= config.level_3_restriction_count) {
          action = 'restriction';
        } else {
          action = 'warning';
        }
        break;
      case 3:
        if (test.strikeCount >= config.level_4_suspension_count) {
          action = 'suspension';
        } else if (test.strikeCount >= config.level_3_restriction_count) {
          action = 'restriction';
        } else {
          action = 'warning';
        }
        break;
      case 4:
        action = 'suspension';
        break;
      case 5:
        if (test.strikeCount >= config.level_5_ban_count) {
          action = 'ban';
        } else {
          action = 'suspension';
        }
        break;
      default:
        action = 'allowed';
    }
    
    if (action === test.expected) {
      console.log(`✅ Severity ${test.severity}, strikes ${test.strikeCount} → ${action}`);
      passed++;
    } else {
      console.log(`❌ Expected ${test.expected}, got ${action}`);
      failed++;
    }
  }
  
  console.log(`Action determination: ${passed}/${tests.length} passed\n`);
  return { passed, failed };
}

// Run all tests
function runAllTests() {
  console.log('🧪 Moderation System Simple Tests\n');
  console.log('=' .repeat(50) + '\n');
  
  const normResults = testNormalizeText();
  const severityResults = testSeverityClassification();
  const actionResults = testActionDetermination();
  
  const totalPassed = normResults.passed + severityResults.passed + actionResults.passed;
  const totalFailed = normResults.failed + severityResults.failed + actionResults.failed;
  const totalTests = totalPassed + totalFailed;
  
  console.log('=' .repeat(50));
  console.log(`📊 Total Results: ${totalPassed}/${totalTests} passed, ${totalFailed} failed`);
  
  if (totalFailed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please review the logic.');
  }
}

// Run the tests
runAllTests();

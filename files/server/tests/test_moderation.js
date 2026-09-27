/**
 * Moderation System Tests
 * Tests for the automated content moderation system
 */

import { moderateContent, CONTENT_TYPES, SEVERITY, ACTIONS } from '../moderation.js';

// Mock database functions for testing
const mockQuery = async (text, params) => {
  // Mock responses for testing
  if (text.includes('prohibited_terms')) {
    return {
      rows: [
        { term: 'nigger', category: 'racial_slur', severity: 3, requires_context: false },
        { term: 'test_bad', category: 'harassment', severity: 2, requires_context: false }
      ]
    };
  }
  
  if (text.includes('moderation_config')) {
    return {
      rows: [{
        value: {
          level_2_warning_count: 1,
          level_3_restriction_count: 2,
          level_4_suspension_count: 3,
          level_5_ban_count: 5,
          suspension_duration_hours: 24,
          strike_expiry_days: 30
        }
      }]
    };
  }
  
  if (text.includes('user_strikes')) {
    return { rows: [] };
  }
  
  return { rows: [] };
};

// Test cases
async function runTests() {
  console.log('🧪 Running Moderation System Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Safe content
  try {
    const result = await moderateContent({
      userId: 'test_user_1',
      content: 'Hello everyone, how are you today?',
      contentType: CONTENT_TYPES.ROOM_MESSAGE,
      contentId: 'msg_1'
    });
    
    if (result.allowed && result.severity === SEVERITY.SAFE) {
      console.log('✅ Test 1 PASSED: Safe content is allowed');
      passed++;
    } else {
      console.log('❌ Test 1 FAILED: Safe content should be allowed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1 FAILED:', error.message);
    failed++;
  }
  
  // Test 2: Racial slur detection
  try {
    const result = await moderateContent({
      userId: 'test_user_2',
      content: 'This is a test with a bad word nigger here',
      contentType: CONTENT_TYPES.ROOM_MESSAGE,
      contentId: 'msg_2'
    });
    
    if (!result.allowed && result.severity >= SEVERITY.SEVERE_HATE) {
      console.log('✅ Test 2 PASSED: Racial slur is detected and blocked');
      passed++;
    } else {
      console.log('❌ Test 2 FAILED: Racial slur should be blocked');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2 FAILED:', error.message);
    failed++;
  }
  
  // Test 3: Obfuscation detection
  try {
    const result = await moderateContent({
      userId: 'test_user_3',
      content: 'This is a test with n1gg3r obfuscation',
      contentType: CONTENT_TYPES.ROOM_MESSAGE,
      contentId: 'msg_3'
    });
    
    if (!result.allowed && result.reason.includes('obfuscation')) {
      console.log('✅ Test 3 PASSED: Obfuscation is detected');
      passed++;
    } else {
      console.log('❌ Test 3 FAILED: Obfuscation should be detected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3 FAILED:', error.message);
    failed++;
  }
  
  // Test 4: Username moderation (more conservative)
  try {
    const result = await moderateContent({
      userId: null,
      content: 'nigger',
      contentType: CONTENT_TYPES.USERNAME,
      contentId: null
    });
    
    // Usernames should be handled more conservatively
    if (!result.allowed) {
      console.log('✅ Test 4 PASSED: Username with slur is blocked');
      passed++;
    } else {
      console.log('❌ Test 4 FAILED: Username with slur should be blocked');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4 FAILED:', error.message);
    failed++;
  }
  
  // Test 5: Bio moderation
  try {
    const result = await moderateContent({
      userId: 'test_user_5',
      content: 'I hate everyone test_bad',
      contentType: CONTENT_TYPES.BIO,
      contentId: 'user_5'
    });
    
    if (!result.allowed) {
      console.log('✅ Test 5 PASSED: Bio with harassment is blocked');
      passed++;
    } else {
      console.log('❌ Test 5 FAILED: Bio with harassment should be blocked');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5 FAILED:', error.message);
    failed++;
  }
  
  // Test 6: Display name moderation
  try {
    const result = await moderateContent({
      userId: 'test_user_6',
      content: 'Nice Person',
      contentType: CONTENT_TYPES.DISPLAY_NAME,
      contentId: 'user_6'
    });
    
    if (result.allowed) {
      console.log('✅ Test 6 PASSED: Safe display name is allowed');
      passed++;
    } else {
      console.log('❌ Test 6 FAILED: Safe display name should be allowed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6 FAILED:', error.message);
    failed++;
  }
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please review the moderation logic.');
  }
}

// Run the tests
runTests().catch(console.error);

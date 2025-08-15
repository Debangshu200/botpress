/**
 * Test script to verify strict document-based knowledge responses
 */

import { searchKnowledge } from './knowledge-handler'

async function testStrictKnowledge() {
  console.log('Testing strict document-based knowledge system...\n')
  
  // Test cases that should find answers in the uploaded documents
  const validQueries = [
    'How far in advance should I start planning my event?',
    'What should I look for when choosing a venue?',
    'How do I handle dietary restrictions?',
    'What are the different catering styles?',
    'What is plated dinner service?',
    'Tell me about venue capacity planning'
  ]
  
  // Test cases that should NOT find answers (should return null)
  const invalidQueries = [
    'What is the weather like today?',
    'How do I cook pasta?',
    'What is machine learning?',
    'Tell me about space exploration',
    'How do I fix my car?'
  ]
  
  console.log('=== Testing Valid Queries (should find answers) ===')
  for (const query of validQueries) {
    console.log(`\nQuery: "${query}"`)
    const result = searchKnowledge(query)
    if (result) {
      console.log(`✅ Found answer (${result.length} characters)`)
      console.log(`Preview: ${result.substring(0, 100)}...`)
    } else {
      console.log('❌ No answer found (this might be an issue)')
    }
  }
  
  console.log('\n=== Testing Invalid Queries (should return null) ===')
  for (const query of invalidQueries) {
    console.log(`\nQuery: "${query}"`)
    const result = searchKnowledge(query)
    if (result) {
      console.log(`❌ Found answer when none should exist: ${result.substring(0, 100)}...`)
    } else {
      console.log('✅ Correctly returned null (will trigger fallback message)')
    }
  }
  
  console.log('\n=== Test Complete ===')
  console.log('The system should now only respond with content from uploaded documents.')
  console.log('When no relevant content is found, it will say: "Sorry I don\'t have any answer, let me connect you to our customer care associate"')
}

// Run the test
testStrictKnowledge().catch(console.error)
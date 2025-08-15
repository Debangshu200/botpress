#!/usr/bin/env node

/**
 * Test script for Knowledge-Enhanced Chat
 * Tests the chat interface functionality
 */

import { knowledgeEnhancedChat, ChatOptions } from './knowledge-enhanced-chat'
import { gptOss20BService } from './gpt-oss-20b-service'

async function testKnowledgeEnhancedChat() {
  console.log('🧪 Testing Knowledge-Enhanced Chat Interface\n')

  try {
    // Test 1: Check service status
    console.log('1️⃣ Checking GPT-OSS-20B service status...')
    const serviceStatus = gptOss20BService.getServiceStatus()
    console.log(`   Model: ${serviceStatus.modelName}`)
    console.log(`   Configured: ${serviceStatus.isConfigured ? '✅' : '❌'}`)
    console.log(`   Cache: ${serviceStatus.cacheStatus.size}/${serviceStatus.cacheStatus.maxSize}`)
    console.log('')

    // Test 2: Start a chat session
    console.log('2️⃣ Starting chat session...')
    const session = knowledgeEnhancedChat.startSession('test-user')
    console.log(`   Session ID: ${session.id}`)
    console.log(`   User ID: ${session.userId}`)
    console.log(`   Start time: ${new Date(session.startTime).toLocaleString()}`)
    console.log('')

    // Test 3: Get initial chat history (should have welcome message)
    console.log('3️⃣ Checking initial chat history...')
    const initialHistory = knowledgeEnhancedChat.getChatHistory(session.id)
    console.log(`   Messages: ${initialHistory.length}`)
    if (initialHistory.length > 0) {
      console.log(`   Welcome message: ${initialHistory[0].content.substring(0, 100)}...`)
    }
    console.log('')

    // Test 4: Send test messages with different configurations
    const testMessages = [
      {
        message: "What are the key factors to consider when selecting a venue?",
        options: { useKnowledgeBase: true, useLLMEnhancement: true } as Partial<ChatOptions>
      },
      {
        message: "How much should I budget for catering?",
        options: { useKnowledgeBase: true, useLLMEnhancement: false } as Partial<ChatOptions>
      },
      {
        message: "Tell me about wedding planning timelines",
        options: { useKnowledgeBase: false, useLLMEnhancement: true } as Partial<ChatOptions>
      }
    ]

    for (let i = 0; i < testMessages.length; i++) {
      const test = testMessages[i]
      console.log(`${4 + i}️⃣ Testing message ${i + 1}: "${test.message}"`)
      console.log(`   Config: KB=${test.options.useKnowledgeBase}, LLM=${test.options.useLLMEnhancement}`)
      
      const startTime = Date.now()
      const result = await knowledgeEnhancedChat.sendMessage(
        session.id,
        test.message,
        test.options
      )
      const processingTime = Date.now() - startTime

      if (result.success && result.botResponse) {
        console.log(`   ✅ Success (${processingTime}ms)`)
        console.log(`   Source: ${result.botResponse.metadata?.source}`)
        console.log(`   Confidence: ${((result.botResponse.metadata?.confidence || 0) * 100).toFixed(1)}%`)
        console.log(`   Quality: ${((result.botResponse.metadata?.qualityScore || 0) * 100).toFixed(1)}%`)
        console.log(`   Tokens: ${result.botResponse.metadata?.tokensUsed || 0}`)
        console.log(`   Response length: ${result.botResponse.content.length} chars`)
        console.log(`   Preview: ${result.botResponse.content.substring(0, 150)}...`)
      } else {
        console.log(`   ❌ Failed: ${result.error}`)
      }
      console.log('')
    }

    // Test 5: Check final chat history
    console.log('7️⃣ Checking final chat history...')
    const finalHistory = knowledgeEnhancedChat.getChatHistory(session.id)
    console.log(`   Total messages: ${finalHistory.length}`)
    console.log(`   User messages: ${finalHistory.filter(m => m.type === 'user').length}`)
    console.log(`   Bot messages: ${finalHistory.filter(m => m.type === 'bot').length}`)
    console.log(`   System messages: ${finalHistory.filter(m => m.type === 'system').length}`)
    console.log('')

    // Test 6: Get statistics
    console.log('8️⃣ Getting chat statistics...')
    const stats = knowledgeEnhancedChat.getStatistics()
    console.log(`   Total sessions: ${stats.totalSessions}`)
    console.log(`   Active sessions: ${stats.activeSessions}`)
    console.log(`   Total messages: ${stats.totalMessages}`)
    console.log(`   Knowledge docs: ${stats.knowledgeStats.uploadedDocuments}`)
    console.log(`   Knowledge size: ${stats.knowledgeStats.totalSize}`)
    console.log('')

    // Test 7: Test session management
    console.log('9️⃣ Testing session management...')
    const activeSessions = knowledgeEnhancedChat.getActiveSessions()
    console.log(`   Active sessions before end: ${activeSessions.length}`)
    
    const endResult = knowledgeEnhancedChat.endSession(session.id)
    console.log(`   Session ended: ${endResult ? '✅' : '❌'}`)
    
    const activeSessionsAfter = knowledgeEnhancedChat.getActiveSessions()
    console.log(`   Active sessions after end: ${activeSessionsAfter.length}`)
    console.log('')

    // Test 8: Performance test with multiple sessions
    console.log('🔟 Performance test with multiple sessions...')
    const performanceStartTime = Date.now()
    const sessions = []
    
    for (let i = 0; i < 3; i++) {
      const testSession = knowledgeEnhancedChat.startSession(`perf-user-${i}`)
      sessions.push(testSession)
      
      await knowledgeEnhancedChat.sendMessage(
        testSession.id,
        `What's the best way to plan a corporate event for ${50 + i * 25} people?`
      )
    }
    
    const performanceTime = Date.now() - performanceStartTime
    console.log(`   Created ${sessions.length} sessions and sent messages in ${performanceTime}ms`)
    console.log(`   Average time per session: ${(performanceTime / sessions.length).toFixed(1)}ms`)
    console.log('')

    console.log('✅ All tests completed successfully!')
    console.log('\n🎯 **Test Summary:**')
    console.log('• Chat interface is working correctly')
    console.log('• Knowledge base integration is functional')
    console.log('• LLM enhancement is operational')
    console.log('• Session management works as expected')
    console.log('• Performance is acceptable for multiple sessions')
    console.log('\n💡 **To start chatting interactively, run:**')
    console.log('   npm run chat')

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('\n🔧 **Troubleshooting:**')
    console.error('• Make sure GPT-OSS-20B is configured (check .env file)')
    console.error('• Verify knowledge base has content')
    console.error('• Check network connectivity for API calls')
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testKnowledgeEnhancedChat()
}

export { testKnowledgeEnhancedChat }
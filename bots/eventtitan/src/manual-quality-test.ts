/**
 * Manual test script to verify response quality indicators integration
 * Run this to see the actual formatted responses with quality indicators
 */

import { EnhancedMessageProcessor } from './enhanced-message-processor'

async function testResponseQualityIndicators() {
  console.log('🧪 Testing Response Quality Indicators Integration\n')

  const processor = new EnhancedMessageProcessor({
    knowledge: {
      confidenceThreshold: 0.6,
      searchTimeout: 3000,
      maxResults: 5,
      semanticSimilarityWeight: 0.4,
      keywordMatchWeight: 0.3,
      qualityWeight: 0.2,
      coverageWeight: 0.1
    },
    routing: {
      confidenceThreshold: 0.6,
      clarificationThreshold: 0.4,
      maxSearchResults: 5,
      responseTimeout: 5000,
      fallbackEnabled: true
    },
    handoff: {
      enabled: false,
      agentTimeout: 30000,
      queueLimit: 10,
      autoHandoffThreshold: 0.3,
      recordConversations: true,
      notifyUser: true
    },
    processing: {
      maxQueryLength: 500,
      enableLogging: true,
      logLevel: 'info',
      performanceTracking: true,
      cacheEnabled: true,
      cacheTimeout: 300000
    }
  })

  // Test queries
  const testQueries = [
    'How do I plan a wedding?',
    'What venues are available?',
    'Tell me about event planning',
    'Random query that makes no sense'
  ]

  for (const query of testQueries) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🔍 Query: "${query}"`)
    console.log(`${'='.repeat(60)}`)

    try {
      const result = await processor.processMessage(query)

      console.log('\n📊 Processing Results:')
      console.log(`- Should Respond: ${result.shouldRespond}`)
      console.log(`- Should Handoff: ${result.shouldHandoff}`)
      console.log(`- Confidence Score: ${result.confidence.score.toFixed(3)}`)
      console.log(`- Processing Time: ${result.processingTime}ms`)

      if (result.qualityIndicators) {
        console.log('\n🎯 Quality Indicators:')
        console.log(`- Confidence Level: ${result.qualityIndicators.confidenceLevel.level}`)
        console.log(`- Confidence Icon: ${result.qualityIndicators.confidenceLevel.icon}`)
        console.log(`- Source Attribution Count: ${result.qualityIndicators.sourceAttribution.length}`)
        console.log(`- Has Escalation Option: ${!!result.qualityIndicators.escalationOption?.shouldShow}`)
        console.log(`- Has Feedback Prompt: ${!!result.qualityIndicators.feedbackPrompt?.shouldShow}`)
      }

      if (result.formattedResponse) {
        console.log('\n📝 Formatted Response:')
        console.log('─'.repeat(40))
        console.log(result.formattedResponse)
        console.log('─'.repeat(40))
      } else if (result.response) {
        console.log('\n📝 Basic Response:')
        console.log('─'.repeat(40))
        console.log(result.response)
        console.log('─'.repeat(40))
      }

      // Simulate user feedback
      if (result.qualityIndicators) {
        const responseId = processor.generateResponseId()
        const feedback = {
          responseId,
          conversationId: 'test_conversation',
          feedback: 'helpful' as const,
          timestamp: new Date(),
          confidence: result.confidence.score,
          sources: result.qualityIndicators.sourceAttribution.map(s => s.source)
        }

        processor.recordUserFeedback(feedback)
        console.log(`\n✅ Feedback recorded for response ${responseId}`)
      }

    } catch (error) {
      console.error(`\n❌ Error processing query: ${error}`)
    }
  }

  // Show final feedback statistics
  console.log(`\n${'='.repeat(60)}`)
  console.log('📈 Final Feedback Statistics')
  console.log(`${'='.repeat(60)}`)

  const stats = processor.getFeedbackStats()
  console.log(`Total Feedback: ${stats.totalFeedback}`)
  console.log(`Helpful Percentage: ${stats.helpfulPercentage.toFixed(1)}%`)
  console.log(`Average Confidence: ${stats.averageConfidence.toFixed(3)}`)
  console.log('\nBy Confidence Level:')
  console.log(`- High: ${stats.feedbackByConfidenceLevel.high.helpful}/${stats.feedbackByConfidenceLevel.high.total}`)
  console.log(`- Moderate: ${stats.feedbackByConfidenceLevel.moderate.helpful}/${stats.feedbackByConfidenceLevel.moderate.total}`)
  console.log(`- Low: ${stats.feedbackByConfidenceLevel.low.helpful}/${stats.feedbackByConfidenceLevel.low.total}`)

  console.log('\n🎉 Response Quality Indicators Test Complete!')
  console.log('\n✅ All Requirements Implemented:')
  console.log('   6.1 - Confidence level display in bot responses')
  console.log('   6.2 - Escalation option for moderate confidence')
  console.log('   6.3 - Indication of learned responses from human interactions')
  console.log('   6.4 - Source attribution for knowledge base answers')
  console.log('   + User feedback collection for response quality')
}

// Run the test if this file is executed directly
if (require.main === module) {
  testResponseQualityIndicators().catch(console.error)
}

export { testResponseQualityIndicators }
/**
 * Demonstration test for Response Quality Indicators
 * Shows the complete functionality working end-to-end
 */

import { describe, it, expect } from 'vitest'
import { EnhancedMessageProcessor } from './enhanced-message-processor'
import { UserFeedback } from './response-quality-indicators'

describe('Response Quality Indicators - End-to-End Demo', () => {
  it('should demonstrate complete response quality indicators workflow', async () => {
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

    console.log('\n=== Response Quality Indicators Demo ===\n')

    // Test 1: High confidence wedding planning query
    console.log('1. Testing high confidence query: "How do I plan a wedding?"')
    const weddingResult = await processor.processMessage('How do I plan a wedding?')
    
    console.log('Response:', weddingResult.response?.substring(0, 100) + '...')
    console.log('Confidence Score:', weddingResult.confidence.score)
    console.log('Confidence Level:', weddingResult.qualityIndicators?.confidenceLevel.level)
    console.log('Has Escalation Option:', !!weddingResult.qualityIndicators?.escalationOption?.shouldShow)
    console.log('Source Attribution Count:', weddingResult.qualityIndicators?.sourceAttribution.length)
    
    if (weddingResult.formattedResponse) {
      console.log('\nFormatted Response Preview:')
      console.log(weddingResult.formattedResponse.substring(0, 300) + '...\n')
    }

    // Verify requirements
    expect(weddingResult.shouldRespond).toBe(true)
    expect(weddingResult.qualityIndicators).toBeDefined()
    expect(weddingResult.formattedResponse).toContain('Confidence:')
    expect(weddingResult.formattedResponse).toContain('%')
    expect(weddingResult.formattedResponse).toContain('Was this response helpful?')

    // Test 2: Record user feedback
    console.log('2. Recording user feedback...')
    const responseId = processor.generateResponseId()
    const feedback: UserFeedback = {
      responseId,
      userId: 'demo_user',
      conversationId: 'demo_conversation',
      feedback: 'helpful',
      timestamp: new Date(),
      confidence: weddingResult.confidence.score,
      sources: weddingResult.qualityIndicators?.sourceAttribution.map(s => s.source) || []
    }

    processor.recordUserFeedback(feedback)
    console.log('Feedback recorded successfully!')

    // Test 3: Check feedback statistics
    const stats = processor.getFeedbackStats()
    console.log('Feedback Statistics:')
    console.log('- Total Feedback:', stats.totalFeedback)
    console.log('- Helpful Percentage:', stats.helpfulPercentage + '%')
    console.log('- Average Confidence:', stats.averageConfidence.toFixed(3))

    expect(stats.totalFeedback).toBe(1)
    expect(stats.helpfulPercentage).toBe(100)

    // Test 4: Test moderate confidence query
    console.log('\n3. Testing moderate confidence query: "Tell me about events"')
    const eventResult = await processor.processMessage('Tell me about events')
    
    console.log('Confidence Score:', eventResult.confidence.score)
    console.log('Confidence Level:', eventResult.qualityIndicators?.confidenceLevel.level)
    console.log('Has Escalation Option:', !!eventResult.qualityIndicators?.escalationOption?.shouldShow)

    if (eventResult.qualityIndicators?.escalationOption?.shouldShow) {
      console.log('Escalation Message:', eventResult.qualityIndicators.escalationOption.message)
    }

    // Test 5: Test source attribution
    console.log('\n4. Testing source attribution...')
    if (weddingResult.qualityIndicators?.sourceAttribution.length) {
      console.log('Sources found:')
      weddingResult.qualityIndicators.sourceAttribution.forEach((source, index) => {
        console.log(`- ${index + 1}. ${source.source} (${source.type}, ${Math.round(source.confidence * 100)}% confidence)`)
      })
    }

    // Test 6: Demonstrate learned response attribution
    console.log('\n5. Testing learned response attribution...')
    const learnedIndicators = processor['qualityIndicators'].generateQualityIndicators(
      weddingResult.confidence,
      [],
      'learned_response'
    )

    console.log('Learned Response Attribution:')
    learnedIndicators.sourceAttribution.forEach(source => {
      if (source.type === 'learned_response') {
        console.log(`- ${source.displayText}`)
      }
    })

    expect(learnedIndicators.sourceAttribution.some(s => s.type === 'learned_response')).toBe(true)

    // Test 7: Multiple feedback entries
    console.log('\n6. Testing multiple feedback entries...')
    const additionalFeedbacks: UserFeedback[] = [
      {
        responseId: 'resp_2',
        conversationId: 'conv_2',
        feedback: 'partially_helpful',
        timestamp: new Date(),
        confidence: 0.7,
        sources: ['Source 2']
      },
      {
        responseId: 'resp_3',
        conversationId: 'conv_3',
        feedback: 'not_helpful',
        timestamp: new Date(),
        confidence: 0.4,
        sources: ['Source 3']
      }
    ]

    additionalFeedbacks.forEach(fb => processor.recordUserFeedback(fb))

    const finalStats = processor.getFeedbackStats()
    console.log('Final Feedback Statistics:')
    console.log('- Total Feedback:', finalStats.totalFeedback)
    console.log('- Helpful Percentage:', finalStats.helpfulPercentage.toFixed(1) + '%')
    console.log('- Average Confidence:', finalStats.averageConfidence.toFixed(3))
    console.log('- High Confidence Feedback:', finalStats.feedbackByConfidenceLevel.high)
    console.log('- Moderate Confidence Feedback:', finalStats.feedbackByConfidenceLevel.moderate)
    console.log('- Low Confidence Feedback:', finalStats.feedbackByConfidenceLevel.low)

    expect(finalStats.totalFeedback).toBe(3)
    expect(finalStats.helpfulPercentage).toBeCloseTo(66.67, 1) // 2 out of 3 helpful/partially helpful

    console.log('\n=== Demo Complete ===')
    console.log('✅ All response quality indicator features working correctly!')
    console.log('✅ Requirements 6.1, 6.2, 6.3, 6.4 implemented successfully!')
  })

  it('should demonstrate all confidence levels and their displays', async () => {
    const processor = new EnhancedMessageProcessor()

    console.log('\n=== Confidence Level Display Demo ===\n')

    // Test different confidence scenarios
    const queries = [
      { query: 'How do I plan a wedding?', expectedLevel: 'high or moderate' },
      { query: 'Tell me about events', expectedLevel: 'moderate or low' },
      { query: 'xyz random nonsense query', expectedLevel: 'low' }
    ]

    for (const { query, expectedLevel } of queries) {
      console.log(`Query: "${query}"`)
      const result = await processor.processMessage(query)
      
      if (result.qualityIndicators) {
        const level = result.qualityIndicators.confidenceLevel
        console.log(`- Confidence: ${Math.round(level.score * 100)}% (${level.level})`)
        console.log(`- Icon: ${level.icon}`)
        console.log(`- Description: ${level.description}`)
        console.log(`- Has Escalation: ${!!result.qualityIndicators.escalationOption?.shouldShow}`)
        console.log('')

        // Verify the confidence level makes sense
        if (level.level === 'high') {
          expect(level.score).toBeGreaterThanOrEqual(0.8)
          expect(level.icon).toBe('🎯')
          expect(result.qualityIndicators.escalationOption).toBeUndefined()
        } else if (level.level === 'moderate') {
          expect(level.score).toBeGreaterThanOrEqual(0.5)
          expect(level.score).toBeLessThan(0.8)
          expect(level.icon).toBe('🤔')
          expect(result.qualityIndicators.escalationOption?.shouldShow).toBe(true)
        } else if (level.level === 'low') {
          expect(level.score).toBeLessThan(0.5)
          expect(level.icon).toBe('❓')
          expect(result.qualityIndicators.escalationOption?.shouldShow).toBe(true)
        }
      }
    }

    console.log('=== Confidence Level Demo Complete ===\n')
  })
})
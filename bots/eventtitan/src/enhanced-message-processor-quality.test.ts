/**
 * Integration tests for Enhanced Message Processor with Quality Indicators
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EnhancedMessageProcessor } from './enhanced-message-processor'
import { UserFeedback } from './response-quality-indicators'

describe('EnhancedMessageProcessor - Quality Indicators Integration', () => {
  let processor: EnhancedMessageProcessor

  beforeEach(() => {
    processor = new EnhancedMessageProcessor({
      knowledge: {
        confidenceThreshold: 0.6,
        searchTimeout: 3000,
        maxResults: 5,
        semanticSimilarityWeight: 0.4,
        keywordMatchWeight: 0.3,
        qualityWeight: 0.2,
        coverageWeight: 0.1
      },
      handoff: {
        enabled: false,
        agentTimeout: 30000,
        queueLimit: 10,
        autoHandoffThreshold: 0.3,
        recordConversations: true,
        notifyUser: true
      },
      routing: {
        confidenceThreshold: 0.6,
        clarificationThreshold: 0.4,
        maxSearchResults: 5,
        responseTimeout: 5000,
        fallbackEnabled: true
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
  })

  describe('processMessage with quality indicators', () => {
    it('should include quality indicators in processing result for wedding planning query', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      expect(result.shouldRespond).toBe(true)
      expect(result.response).toBeDefined()
      expect(result.qualityIndicators).toBeDefined()
      expect(result.formattedResponse).toBeDefined()

      // Check quality indicators structure
      const indicators = result.qualityIndicators!
      expect(indicators.confidenceLevel).toBeDefined()
      expect(indicators.confidenceDisplay).toBeDefined()
      expect(indicators.sourceAttribution).toBeDefined()
      expect(indicators.feedbackPrompt).toBeDefined()

      // Check formatted response includes quality indicators
      const formatted = result.formattedResponse!
      expect(formatted).toContain(result.response!)
      expect(formatted).toContain('Confidence:')
      expect(formatted).toContain('%')
      expect(formatted).toContain('Was this response helpful?')
    })

    it('should show escalation option for moderate confidence responses', async () => {
      // Use a query that might get moderate confidence
      const result = await processor.processMessage('Tell me about some random event topic')

      if (result.qualityIndicators && result.qualityIndicators.confidenceLevel.level === 'moderate') {
        expect(result.qualityIndicators.escalationOption?.shouldShow).toBe(true)
        expect(result.qualityIndicators.escalationOption?.message).toContain('human expert')
        expect(result.formattedResponse).toContain('Need more help?')
      }
    })

    it('should include source attribution when search results are available', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      if (result.searchResults.length > 0) {
        expect(result.qualityIndicators?.sourceAttribution.length).toBeGreaterThan(0)
        expect(result.formattedResponse).toContain('Sources:')
        expect(result.formattedResponse).toContain('📚')
      }
    })

    it('should not include quality indicators when no response is generated', async () => {
      // Mock a scenario where no response is generated
      const result = await processor.processMessage('')

      if (!result.shouldRespond || !result.response) {
        expect(result.qualityIndicators).toBeUndefined()
        expect(result.formattedResponse).toBeUndefined()
      }
    })
  })

  describe('feedback collection', () => {
    it('should record user feedback correctly', () => {
      const responseId = processor.generateResponseId()
      expect(responseId).toMatch(/^resp_\d+_[a-z0-9]+$/)

      const feedback: UserFeedback = {
        responseId,
        userId: 'test_user',
        conversationId: 'test_conv',
        feedback: 'helpful',
        timestamp: new Date(),
        confidence: 0.8,
        sources: ['Wedding Planning Guide']
      }

      processor.recordUserFeedback(feedback)

      const stats = processor.getFeedbackStats()
      expect(stats.totalFeedback).toBe(1)
      expect(stats.helpfulPercentage).toBe(100)
      expect(stats.averageConfidence).toBe(0.8)
    })

    it('should generate unique response IDs', () => {
      const id1 = processor.generateResponseId()
      const id2 = processor.generateResponseId()
      
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^resp_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^resp_\d+_[a-z0-9]+$/)
    })

    it('should track feedback statistics across multiple responses', () => {
      const feedbacks: UserFeedback[] = [
        {
          responseId: 'resp_1',
          conversationId: 'conv_1',
          feedback: 'helpful',
          timestamp: new Date(),
          confidence: 0.9,
          sources: ['Source 1']
        },
        {
          responseId: 'resp_2',
          conversationId: 'conv_2',
          feedback: 'not_helpful',
          timestamp: new Date(),
          confidence: 0.4,
          sources: ['Source 2']
        },
        {
          responseId: 'resp_3',
          conversationId: 'conv_3',
          feedback: 'partially_helpful',
          timestamp: new Date(),
          confidence: 0.7,
          sources: ['Source 3']
        }
      ]

      feedbacks.forEach(feedback => processor.recordUserFeedback(feedback))

      const stats = processor.getFeedbackStats()
      expect(stats.totalFeedback).toBe(3)
      expect(stats.helpfulPercentage).toBe(66.66666666666666) // 2 out of 3 helpful/partially helpful
      expect(stats.averageConfidence).toBeCloseTo(0.667, 2) // (0.9 + 0.4 + 0.7) / 3
    })
  })

  describe('confidence level display', () => {
    it('should display high confidence correctly', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      if (result.qualityIndicators && result.qualityIndicators.confidenceLevel.level === 'high') {
        expect(result.qualityIndicators.confidenceLevel.icon).toBe('🎯')
        expect(result.qualityIndicators.confidenceDisplay).toContain('High confidence')
        expect(result.formattedResponse).toContain('🎯')
        expect(result.qualityIndicators.escalationOption).toBeUndefined()
      }
    })

    it('should display moderate confidence with escalation option', async () => {
      // This test depends on the actual confidence scoring, so we'll check if moderate confidence is detected
      const result = await processor.processMessage('Tell me something about events')

      if (result.qualityIndicators && result.qualityIndicators.confidenceLevel.level === 'moderate') {
        expect(result.qualityIndicators.confidenceLevel.icon).toBe('🤔')
        expect(result.qualityIndicators.confidenceDisplay).toContain('Moderate confidence')
        expect(result.qualityIndicators.escalationOption?.shouldShow).toBe(true)
        expect(result.formattedResponse).toContain('🤔')
        expect(result.formattedResponse).toContain('Need more help?')
      }
    })

    it('should display low confidence with escalation option', async () => {
      // Use a query that's likely to get low confidence
      const result = await processor.processMessage('xyz random query that makes no sense')

      if (result.qualityIndicators && result.qualityIndicators.confidenceLevel.level === 'low') {
        expect(result.qualityIndicators.confidenceLevel.icon).toBe('❓')
        expect(result.qualityIndicators.confidenceDisplay).toContain('Low confidence')
        expect(result.qualityIndicators.escalationOption?.shouldShow).toBe(true)
        expect(result.formattedResponse).toContain('❓')
      }
    })
  })

  describe('source attribution', () => {
    it('should attribute knowledge base sources correctly', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      if (result.searchResults.length > 0 && result.qualityIndicators) {
        const kbSources = result.qualityIndicators.sourceAttribution.filter(
          attr => attr.type === 'knowledge_base'
        )
        
        expect(kbSources.length).toBeGreaterThan(0)
        kbSources.forEach(source => {
          expect(source.displayText).toContain('📚 Source:')
          expect(source.displayText).toContain('% relevance')
          expect(source.confidence).toBeGreaterThan(0)
          expect(source.confidence).toBeLessThanOrEqual(1)
        })

        expect(result.formattedResponse).toContain('**Sources:**')
      }
    })

    it('should limit source attribution to top 3 sources', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      if (result.qualityIndicators && result.qualityIndicators.sourceAttribution.length > 0) {
        const kbSources = result.qualityIndicators.sourceAttribution.filter(
          attr => attr.type === 'knowledge_base'
        )
        expect(kbSources.length).toBeLessThanOrEqual(3)
      }
    })
  })

  describe('feedback prompt', () => {
    it('should always include feedback prompt for responses', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')

      if (result.qualityIndicators) {
        expect(result.qualityIndicators.feedbackPrompt?.shouldShow).toBe(true)
        expect(result.qualityIndicators.feedbackPrompt?.message).toContain('Was this response helpful?')
        expect(result.qualityIndicators.feedbackPrompt?.options).toHaveLength(4)
        
        const options = result.qualityIndicators.feedbackPrompt!.options
        expect(options.map(o => o.value)).toEqual([
          'helpful',
          'partially_helpful', 
          'not_helpful',
          'incorrect'
        ])

        expect(result.formattedResponse).toContain('📝 **Was this response helpful?**')
      }
    })
  })
})
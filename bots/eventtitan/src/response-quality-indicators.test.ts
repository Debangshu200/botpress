/**
 * Tests for Response Quality Indicators
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ResponseQualityIndicators, UserFeedback } from './response-quality-indicators'
import { ConfidenceScore, SearchResult } from './confidence-engine'

describe('ResponseQualityIndicators', () => {
  let qualityIndicators: ResponseQualityIndicators

  beforeEach(() => {
    qualityIndicators = new ResponseQualityIndicators()
  })

  describe('generateQualityIndicators', () => {
    it('should generate high confidence indicators', () => {
      const confidence: ConfidenceScore = {
        score: 0.9,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: [
          { name: 'keyword_match', score: 0.8, weight: 0.3, description: 'Good keyword match' }
        ]
      }

      const searchResults: SearchResult[] = [
        {
          content: 'Wedding planning involves careful coordination...',
          score: 0.9,
          source: 'Wedding Planning Guide',
          metadata: {
            topic: 'wedding planning',
            relevanceScore: 0.9,
            matchType: 'exact',
            keywords: ['wedding', 'planning']
          }
        }
      ]

      const indicators = qualityIndicators.generateQualityIndicators(confidence, searchResults)

      expect(indicators.confidenceLevel.level).toBe('high')
      expect(indicators.confidenceLevel.score).toBe(0.9)
      expect(indicators.confidenceLevel.icon).toBe('🎯')
      expect(indicators.confidenceDisplay).toContain('90%')
      expect(indicators.confidenceDisplay).toContain('High confidence')
      expect(indicators.escalationOption).toBeUndefined()
      expect(indicators.feedbackPrompt?.shouldShow).toBe(true)
    })

    it('should generate moderate confidence indicators with escalation option', () => {
      const confidence: ConfidenceScore = {
        score: 0.6,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const searchResults: SearchResult[] = [
        {
          content: 'Some event planning information...',
          score: 0.6,
          source: 'Event Guide',
          metadata: {
            topic: 'events',
            relevanceScore: 0.6,
            matchType: 'partial',
            keywords: ['event']
          }
        }
      ]

      const indicators = qualityIndicators.generateQualityIndicators(confidence, searchResults)

      expect(indicators.confidenceLevel.level).toBe('moderate')
      expect(indicators.confidenceLevel.icon).toBe('🤔')
      expect(indicators.escalationOption?.shouldShow).toBe(true)
      expect(indicators.escalationOption?.message).toContain('human expert')
    })

    it('should generate low confidence indicators with escalation option', () => {
      const confidence: ConfidenceScore = {
        score: 0.3,
        threshold: 0.6,
        isAboveThreshold: false,
        factors: []
      }

      const indicators = qualityIndicators.generateQualityIndicators(confidence, [])

      expect(indicators.confidenceLevel.level).toBe('low')
      expect(indicators.confidenceLevel.icon).toBe('❓')
      expect(indicators.escalationOption?.shouldShow).toBe(true)
    })

    it('should generate source attribution for knowledge base results', () => {
      const confidence: ConfidenceScore = {
        score: 0.8,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const searchResults: SearchResult[] = [
        {
          content: 'Wedding planning content',
          score: 0.9,
          source: 'Wedding Planning Guide',
          metadata: {
            topic: 'wedding',
            relevanceScore: 0.9,
            matchType: 'exact',
            keywords: ['wedding']
          }
        },
        {
          content: 'Venue selection content',
          score: 0.8,
          source: 'Venue Selection Manual',
          metadata: {
            topic: 'venue',
            relevanceScore: 0.8,
            matchType: 'partial',
            keywords: ['venue']
          }
        }
      ]

      const indicators = qualityIndicators.generateQualityIndicators(confidence, searchResults)

      expect(indicators.sourceAttribution).toHaveLength(2)
      expect(indicators.sourceAttribution[0].source).toBe('Wedding Planning Guide')
      expect(indicators.sourceAttribution[0].type).toBe('knowledge_base')
      expect(indicators.sourceAttribution[0].displayText).toContain('90% relevance')
      expect(indicators.sourceAttribution[1].source).toBe('Venue Selection Manual')
      expect(indicators.sourceAttribution[1].displayText).toContain('80% relevance')
    })

    it('should generate learned response attribution', () => {
      const confidence: ConfidenceScore = {
        score: 0.8,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const indicators = qualityIndicators.generateQualityIndicators(
        confidence, 
        [], 
        'learned_response'
      )

      expect(indicators.sourceAttribution).toHaveLength(1)
      expect(indicators.sourceAttribution[0].source).toBe('Previous Human Interactions')
      expect(indicators.sourceAttribution[0].type).toBe('learned_response')
      expect(indicators.sourceAttribution[0].displayText).toContain('previous conversations with human experts')
    })

    it('should limit source attribution to top 3 results', () => {
      const confidence: ConfidenceScore = {
        score: 0.8,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const searchResults: SearchResult[] = Array.from({ length: 5 }, (_, i) => ({
        content: `Content ${i}`,
        score: 0.8 - (i * 0.1),
        source: `Source ${i}`,
        metadata: {
          topic: 'test',
          relevanceScore: 0.8,
          matchType: 'partial' as const,
          keywords: ['test']
        }
      }))

      const indicators = qualityIndicators.generateQualityIndicators(confidence, searchResults)

      expect(indicators.sourceAttribution).toHaveLength(3)
    })
  })

  describe('formatResponseWithIndicators', () => {
    it('should format response with all indicators', () => {
      const response = 'Here is your answer about wedding planning.'
      const indicators = {
        confidenceLevel: {
          level: 'high' as const,
          score: 0.9,
          description: 'High confidence',
          icon: '🎯'
        },
        confidenceDisplay: '🎯 **Confidence: 90%** - High confidence',
        sourceAttribution: [
          {
            source: 'Wedding Guide',
            type: 'knowledge_base' as const,
            confidence: 0.9,
            displayText: '📚 Source: Wedding Guide (90% relevance)'
          }
        ],
        escalationOption: undefined,
        feedbackPrompt: {
          shouldShow: true,
          message: '📝 **Was this response helpful?** Your feedback helps me improve!',
          options: []
        }
      }

      const formatted = qualityIndicators.formatResponseWithIndicators(response, indicators)

      expect(formatted).toContain('Here is your answer about wedding planning.')
      expect(formatted).toContain('🎯 **Confidence: 90%**')
      expect(formatted).toContain('**Sources:**')
      expect(formatted).toContain('📚 Source: Wedding Guide')
      expect(formatted).toContain('📝 **Was this response helpful?**')
    })

    it('should format response with escalation option', () => {
      const response = 'I have some information but not complete.'
      const indicators = {
        confidenceLevel: {
          level: 'moderate' as const,
          score: 0.6,
          description: 'Moderate confidence',
          icon: '🤔'
        },
        confidenceDisplay: '🤔 **Confidence: 60%** - Moderate confidence',
        sourceAttribution: [],
        escalationOption: {
          shouldShow: true,
          message: '🤝 **Need more help?** I can connect you with a human expert.',
          actionText: 'Connect with Human Expert'
        },
        feedbackPrompt: {
          shouldShow: true,
          message: '📝 **Was this response helpful?**',
          options: []
        }
      }

      const formatted = qualityIndicators.formatResponseWithIndicators(response, indicators)

      expect(formatted).toContain('🤝 **Need more help?**')
      expect(formatted).toContain('human expert')
    })
  })

  describe('recordFeedback', () => {
    it('should record user feedback', () => {
      const feedback: UserFeedback = {
        responseId: 'resp_123',
        userId: 'user_456',
        conversationId: 'conv_789',
        feedback: 'helpful',
        timestamp: new Date(),
        confidence: 0.8,
        sources: ['Wedding Guide']
      }

      qualityIndicators.recordFeedback(feedback)

      const stats = qualityIndicators.getFeedbackStats()
      expect(stats.totalFeedback).toBe(1)
      expect(stats.helpfulPercentage).toBe(100)
    })

    it('should calculate feedback statistics correctly', () => {
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
        },
        {
          responseId: 'resp_4',
          conversationId: 'conv_4',
          feedback: 'incorrect',
          timestamp: new Date(),
          confidence: 0.3,
          sources: ['Source 4']
        }
      ]

      feedbacks.forEach(feedback => qualityIndicators.recordFeedback(feedback))

      const stats = qualityIndicators.getFeedbackStats()
      expect(stats.totalFeedback).toBe(4)
      expect(stats.helpfulPercentage).toBe(50) // 2 out of 4 are helpful or partially helpful
      expect(stats.averageConfidence).toBe(0.575) // (0.9 + 0.7 + 0.4 + 0.3) / 4
    })

    it('should group feedback by confidence levels', () => {
      const feedbacks: UserFeedback[] = [
        {
          responseId: 'resp_1',
          conversationId: 'conv_1',
          feedback: 'helpful',
          timestamp: new Date(),
          confidence: 0.9, // high
          sources: []
        },
        {
          responseId: 'resp_2',
          conversationId: 'conv_2',
          feedback: 'helpful',
          timestamp: new Date(),
          confidence: 0.6, // moderate
          sources: []
        },
        {
          responseId: 'resp_3',
          conversationId: 'conv_3',
          feedback: 'not_helpful',
          timestamp: new Date(),
          confidence: 0.3, // low
          sources: []
        }
      ]

      feedbacks.forEach(feedback => qualityIndicators.recordFeedback(feedback))

      const stats = qualityIndicators.getFeedbackStats()
      expect(stats.feedbackByConfidenceLevel.high.total).toBe(1)
      expect(stats.feedbackByConfidenceLevel.high.helpful).toBe(1)
      expect(stats.feedbackByConfidenceLevel.moderate.total).toBe(1)
      expect(stats.feedbackByConfidenceLevel.moderate.helpful).toBe(1)
      expect(stats.feedbackByConfidenceLevel.low.total).toBe(1)
      expect(stats.feedbackByConfidenceLevel.low.helpful).toBe(0)
    })
  })

  describe('getFeedbackStats', () => {
    it('should return empty stats when no feedback recorded', () => {
      const stats = qualityIndicators.getFeedbackStats()

      expect(stats.totalFeedback).toBe(0)
      expect(stats.helpfulPercentage).toBe(0)
      expect(stats.averageConfidence).toBe(0)
      expect(stats.feedbackByConfidenceLevel.high.total).toBe(0)
      expect(stats.feedbackByConfidenceLevel.moderate.total).toBe(0)
      expect(stats.feedbackByConfidenceLevel.low.total).toBe(0)
    })
  })
})
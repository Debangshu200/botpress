import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LearningEngine, LearningEngineConfig, ValidationRule } from './learning-engine'
import { ConversationRecord, RecordedMessage } from './conversation-recorder'

describe('LearningEngine', () => {
  let engine: LearningEngine
  let config: LearningEngineConfig

  beforeEach(() => {
    const validationRules: ValidationRule[] = [
      {
        name: 'content_validation',
        type: 'content',
        enabled: true,
        weight: 0.3,
        parameters: {}
      },
      {
        name: 'quality_validation',
        type: 'quality',
        enabled: true,
        weight: 0.4,
        parameters: {}
      },
      {
        name: 'relevance_validation',
        type: 'relevance',
        enabled: true,
        weight: 0.2,
        parameters: {}
      },
      {
        name: 'safety_validation',
        type: 'safety',
        enabled: true,
        weight: 0.1,
        parameters: {}
      }
    ]

    config = {
      enabled: true,
      qualityThreshold: 0.6,
      minResponseLength: 20,
      maxResponseLength: 1000,
      duplicateDetectionEnabled: true,
      autoApprovalThreshold: 0.8,
      batchSize: 10,
      processingTimeout: 30000,
      validationRules
    }
    
    engine = new LearningEngine(config)
  })

  describe('Conversation Processing', () => {
    it('should process a conversation record successfully', async () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I book a venue for my event?',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'To book a venue, you should first check availability on our booking system, then submit a request with your event details including date, guest count, and specific requirements.',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const record: ConversationRecord = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        startTime: new Date(),
        endTime: new Date(),
        messages,
        learningData: [],
        processed: false,
        metadata: {
          userId: 'user-1',
          recordingEnabled: true,
          privacyCompliant: true,
          piiFilteringEnabled: true,
          totalMessages: 2,
          filteredMessages: 0,
          recordingQuality: 'complete'
        }
      }

      const result = await engine.processConversation(record)

      expect(result.success).toBe(true)
      expect(result.processedPairs).toBe(1)
      expect(result.validatedPairs).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(result.metadata.extractedPairs).toBe(1)
      expect(result.metadata.processingSteps).toHaveLength(4)
    })

    it('should handle disabled learning engine', async () => {
      const disabledConfig = { ...config, enabled: false }
      const disabledEngine = new LearningEngine(disabledConfig)

      const record: ConversationRecord = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        startTime: new Date(),
        messages: [],
        learningData: [],
        processed: false,
        metadata: {
          userId: 'user-1',
          recordingEnabled: true,
          privacyCompliant: true,
          piiFilteringEnabled: true,
          totalMessages: 0,
          filteredMessages: 0,
          recordingQuality: 'failed'
        }
      }

      const result = await disabledEngine.processConversation(record)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('Learning engine is disabled')
    })

    it('should handle empty conversation records', async () => {
      const record: ConversationRecord = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        startTime: new Date(),
        messages: [],
        learningData: [],
        processed: false,
        metadata: {
          userId: 'user-1',
          recordingEnabled: true,
          privacyCompliant: true,
          piiFilteringEnabled: true,
          totalMessages: 0,
          filteredMessages: 0,
          recordingQuality: 'failed'
        }
      }

      const result = await engine.processConversation(record)

      expect(result.success).toBe(true)
      expect(result.processedPairs).toBe(0)
      expect(result.validatedPairs).toBe(0)
    })
  })

  describe('Knowledge Pair Extraction', () => {
    it('should extract knowledge pairs from question-answer sequences', async () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'What venues are available?',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'We have several venues available including the Grand Ballroom, Conference Center, and Garden Pavilion.',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const pairs = await engine.extractKnowledgePairs(messages)

      expect(pairs).toHaveLength(1)
      expect(pairs[0].query).toBe('What venues are available?')
      expect(pairs[0].response).toBe('We have several venues available including the Grand Ballroom, Conference Center, and Garden Pavilion.')
      expect(pairs[0].source).toBe('human-agent')
      expect(pairs[0].quality).toBe('pending')
    })

    it('should not extract pairs from non-question messages', async () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'Thank you for your assistance.',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'You\'re welcome!',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const pairs = await engine.extractKnowledgePairs(messages)

      expect(pairs).toHaveLength(0)
    })

    it('should extract multiple pairs from longer conversations', async () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I book a venue?',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'You can book a venue through our online system.',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg3',
          timestamp: new Date(),
          sender: 'user',
          content: 'What information do I need to provide?',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg4',
          timestamp: new Date(),
          sender: 'agent',
          content: 'You need to provide the event date, guest count, and any special requirements.',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const pairs = await engine.extractKnowledgePairs(messages)

      expect(pairs).toHaveLength(2)
      expect(pairs[0].query).toBe('How do I book a venue?')
      expect(pairs[1].query).toBe('What information do I need to provide?')
    })

    it('should assess query complexity correctly', async () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'What is a venue?', // Simple
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'A venue is a place where events are held.',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg3',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I implement a comprehensive event management system that integrates with multiple booking platforms?', // Complex
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg4',
          timestamp: new Date(),
          sender: 'agent',
          content: 'That requires a multi-step approach involving API integrations.',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const pairs = await engine.extractKnowledgePairs(messages)

      expect(pairs).toHaveLength(2)
      expect(pairs[0].metadata.queryComplexity).toBe('simple')
      expect(pairs[1].metadata.queryComplexity).toBe('complex')
    })
  })

  describe('Validation System', () => {
    it('should validate high-quality pairs', async () => {
      const pair = {
        queryId: 'query-1',
        query: 'How do I book a venue?',
        response: 'To book a venue, first check availability on our booking system, then submit a request with your event details including date, guest count, and specific requirements. You can access the booking system through the main menu.',
        confidence: 0.8,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate' as const,
          responseQuality: 0.8,
          tags: ['booking', 'venue'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      const results = await engine.validateLearning([pair])

      expect(results).toHaveLength(1)
      expect(results[0].isValid).toBe(true)
      expect(results[0].quality).toBe('high')
      expect(results[0].issues).toHaveLength(0)
    })

    it('should reject pairs with critical issues', async () => {
      const pair = {
        queryId: 'query-1',
        query: 'How do I book a venue?',
        response: 'Contact john.doe@example.com for booking information.', // Contains PII
        confidence: 0.6,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.5,
          tags: ['booking'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      const results = await engine.validateLearning([pair])

      expect(results).toHaveLength(1)
      expect(results[0].isValid).toBe(false)
      expect(results[0].quality).toBe('rejected')
      expect(results[0].issues.some(issue => issue.type === 'privacy_concern')).toBe(true)
    })

    it('should identify incomplete responses', async () => {
      const pair = {
        queryId: 'query-1',
        query: 'How do I book a venue?',
        response: 'Yes.', // Too short
        confidence: 0.3,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate' as const,
          responseQuality: 0.2,
          tags: ['booking'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'partial' as const
          },
          validationHistory: []
        }
      }

      const results = await engine.validateLearning([pair])

      expect(results).toHaveLength(1)
      expect(results[0].issues.some(issue => issue.type === 'incomplete_response')).toBe(true)
    })

    it('should detect generic responses', async () => {
      const pair = {
        queryId: 'query-1',
        query: 'How do I book a venue?',
        response: 'I don\'t know, maybe you should try asking someone else.',
        confidence: 0.2,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.3,
          tags: ['booking'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'unresolved' as const
          },
          validationHistory: []
        }
      }

      const results = await engine.validateLearning([pair])

      expect(results).toHaveLength(1)
      expect(results[0].issues.some(issue => issue.type === 'poor_quality')).toBe(true)
    })
  })

  describe('Quality Assessment', () => {
    it('should calculate quality scores for knowledge pairs', async () => {
      const pairs = [{
        queryId: 'query-1',
        query: 'How do I book a venue?',
        response: 'To book a venue, first check availability, then submit your request with event details.',
        confidence: 0.8,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate' as const,
          responseQuality: 0.8,
          tags: ['booking', 'venue'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }]

      const validationResults = [{
        queryId: 'query-1',
        isValid: true,
        quality: 'high' as const,
        confidence: 0.8,
        issues: [],
        recommendations: []
      }]

      const scores = await engine['calculateQualityScores'](pairs, validationResults)

      expect(scores).toHaveLength(1)
      expect(scores[0].queryId).toBe('query-1')
      expect(scores[0].overallScore).toBeGreaterThan(0)
      expect(scores[0].factors).toHaveLength(4)
      expect(scores[0].factors.map(f => f.type)).toContain('length')
      expect(scores[0].factors.map(f => f.type)).toContain('specificity')
      expect(scores[0].factors.map(f => f.type)).toContain('actionability')
      expect(scores[0].factors.map(f => f.type)).toContain('context')
    })

    it('should score length factor appropriately', () => {
      expect(engine['scoreLengthFactor']('Short')).toBe(0.3) // Too short
      expect(engine['scoreLengthFactor']('This is a medium length response that provides good information.')).toBe(0.6)
      expect(engine['scoreLengthFactor']('This is a comprehensive response that provides detailed information about the topic, including step-by-step instructions and examples to help users understand the process completely.')).toBe(1.0)
    })

    it('should score specificity factor based on specific words', () => {
      expect(engine['scoreSpecificityFactor']('Generic response')).toBe(0)
      expect(engine['scoreSpecificityFactor']('First, you need to specifically follow these steps exactly.')).toBeGreaterThan(0.4)
    })

    it('should score actionability based on action words', () => {
      expect(engine['scoreActionabilityFactor']('This is just information')).toBe(0)
      expect(engine['scoreActionabilityFactor']('Click here, then go to the menu and select the option.')).toBeGreaterThan(0.5)
    })
  })

  describe('Pair Management', () => {
    it('should approve pending pairs', () => {
      const pair = {
        queryId: 'query-1',
        query: 'Test query',
        response: 'Test response',
        confidence: 0.8,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.8,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      engine['validatedPairs'].set('query-1', pair)

      const result = engine.approvePair('query-1', 'admin')

      expect(result).toBe(true)
      expect(pair.quality).toBe('approved')
      expect(pair.metadata.validationHistory).toHaveLength(1)
      expect(pair.metadata.validationHistory[0].action).toBe('approved')
    })

    it('should reject pairs with reason', () => {
      const pair = {
        queryId: 'query-1',
        query: 'Test query',
        response: 'Test response',
        confidence: 0.8,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.8,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      engine['validatedPairs'].set('query-1', pair)

      const result = engine.rejectPair('query-1', 'Poor quality response', 'admin')

      expect(result).toBe(true)
      expect(pair.quality).toBe('rejected')
      expect(pair.metadata.validationHistory).toHaveLength(1)
      expect(pair.metadata.validationHistory[0].action).toBe('rejected')
    })

    it('should get pairs by quality level', () => {
      const approvedPair = {
        queryId: 'query-1',
        query: 'Test query 1',
        response: 'Test response 1',
        confidence: 0.9,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'approved' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.9,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      const pendingPair = {
        queryId: 'query-2',
        query: 'Test query 2',
        response: 'Test response 2',
        confidence: 0.7,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.7,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      engine['validatedPairs'].set('query-1', approvedPair)
      engine['validatedPairs'].set('query-2', pendingPair)

      const approvedPairs = engine.getPairsByQuality('approved')
      const pendingPairs = engine.getPairsByQuality('pending')

      expect(approvedPairs).toHaveLength(1)
      expect(approvedPairs[0].queryId).toBe('query-1')
      expect(pendingPairs).toHaveLength(1)
      expect(pendingPairs[0].queryId).toBe('query-2')
    })
  })

  describe('Context Extraction', () => {
    it('should extract conversation context correctly', () => {
      const messages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'What venues do you have?',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg2',
          timestamp: new Date(),
          sender: 'agent',
          content: 'We have several venues available.',
          messageType: 'text',
          piiFiltered: false
        },
        {
          id: 'msg3',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I book a venue?',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const context = engine['extractConversationContext'](messages, 2)

      expect(context.previousQueries).toHaveLength(1)
      expect(context.previousQueries[0]).toBe('What venues do you have?')
      expect(context.userIntent).toBe('booking')
      expect(context.conversationFlow).toHaveLength(2)
    })

    it('should detect user intent correctly', () => {
      const bookingMessages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I book a venue?',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const planningMessages: RecordedMessage[] = [
        {
          id: 'msg1',
          timestamp: new Date(),
          sender: 'user',
          content: 'How do I plan my event?',
          messageType: 'text',
          piiFiltered: false
        }
      ]

      const bookingContext = engine['extractConversationContext'](bookingMessages, 0)
      const planningContext = engine['extractConversationContext'](planningMessages, 0)

      expect(bookingContext.userIntent).toBe('booking')
      expect(planningContext.userIntent).toBe('planning')
    })
  })

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      // Mock the extractKnowledgePairs method to throw an error
      const originalMethod = engine.extractKnowledgePairs
      engine.extractKnowledgePairs = vi.fn().mockRejectedValue(new Error('Extraction failed'))

      const record: ConversationRecord = {
        sessionId: 'session-1',
        conversationId: 'conv-1',
        startTime: new Date(),
        messages: [],
        learningData: [],
        processed: false,
        metadata: {
          userId: 'user-1',
          recordingEnabled: true,
          privacyCompliant: true,
          piiFilteringEnabled: true,
          totalMessages: 0,
          filteredMessages: 0,
          recordingQuality: 'complete'
        }
      }

      const result = await engine.processConversation(record)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].type).toBe('extraction')

      // Restore original method
      engine.extractKnowledgePairs = originalMethod
    })

    it('should handle validation rule errors', async () => {
      const pair = {
        queryId: 'query-1',
        query: 'Test query',
        response: 'Test response',
        confidence: 0.8,
        source: 'human-agent' as const,
        timestamp: new Date(),
        quality: 'pending' as const,
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple' as const,
          responseQuality: 0.8,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved' as const
          },
          validationHistory: []
        }
      }

      // Mock applyValidationRule to throw an error
      const originalMethod = engine['applyValidationRule']
      engine['applyValidationRule'] = vi.fn().mockRejectedValue(new Error('Validation rule failed'))

      const results = await engine.validateLearning([pair])

      expect(results).toHaveLength(1)
      expect(results[0].isValid).toBe(true) // Should continue despite rule errors

      // Restore original method
      engine['applyValidationRule'] = originalMethod
    })
  })
})
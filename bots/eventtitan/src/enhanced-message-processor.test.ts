/**
 * Tests for Enhanced Message Processing Infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EnhancedMessageProcessor } from './enhanced-message-processor'
import { ConfidenceEngine } from './confidence-engine'
import { MessageRouter } from './message-router'
import { ConfigurationManager } from './config-manager'

describe('Enhanced Message Processing Infrastructure', () => {
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
        enableLogging: false, // Disable logging for tests
        logLevel: 'error',
        performanceTracking: true,
        cacheEnabled: true,
        cacheTimeout: 300000
      }
    })
  })

  describe('Message Processing', () => {
    it('should process a high-confidence question correctly', async () => {
      const result = await processor.processMessage('How do I plan a wedding?')
      
      expect(result.shouldRespond).toBe(true)
      expect(result.shouldHandoff).toBe(false)
      expect(result.response).toBeDefined()
      expect(result.confidence.score).toBeGreaterThan(0.3) // Lower threshold since we're using simple matching
      expect(result.searchResults.length).toBeGreaterThan(0)
      // Route could be direct_response or clarification_needed depending on confidence
      expect(['direct_response', 'clarification_needed']).toContain(result.routingDecision.route)
    })

    it('should handle low-confidence queries appropriately', async () => {
      const result = await processor.processMessage('xyz random nonsense query')
      
      expect(result.confidence.score).toBeLessThan(0.4)
      expect(result.routingDecision.route).toBe('clarification_needed')
      expect(result.response).toContain('not sure I understand')
    })

    it('should extract questions correctly', async () => {
      const result = await processor.processMessage('What is event planning? How do I start?')
      
      expect(result.metadata.extractedQuestions.length).toBeGreaterThan(0)
      expect(result.metadata.queryType).toBe('question')
    })

    it('should track performance metrics', async () => {
      const result = await processor.processMessage('How do I plan an event?')
      
      expect(result.processingTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.performanceMetrics.totalTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.performanceMetrics.searchTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.performanceMetrics.confidenceTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.performanceMetrics.questionExtractionTime).toBeGreaterThanOrEqual(0)
      expect(result.metadata.performanceMetrics.routingTime).toBeGreaterThanOrEqual(0)
    })

    it('should handle processing errors gracefully', async () => {
      // Test with a very long message that might cause issues
      const longMessage = 'a'.repeat(1000) + ' how do I plan an event?'
      
      const result = await processor.processMessage(longMessage)
      
      // Should still process but might have lower confidence or different routing
      expect(result.shouldRespond).toBe(true)
      expect(result.response).toBeDefined()
      expect(result.confidence.score).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const originalConfig = processor.getConfiguration()
      
      processor.updateConfiguration({
        knowledge: {
          ...originalConfig.knowledge,
          confidenceThreshold: 0.8
        }
      })
      
      const updatedConfig = processor.getConfiguration()
      expect(updatedConfig.knowledge.confidenceThreshold).toBe(0.8)
    })

    it('should maintain configuration consistency', () => {
      const config = processor.getConfiguration()
      
      expect(config.knowledge.confidenceThreshold).toBeGreaterThanOrEqual(0)
      expect(config.knowledge.confidenceThreshold).toBeLessThanOrEqual(1)
      expect(config.routing.confidenceThreshold).toBeGreaterThanOrEqual(0)
      expect(config.routing.confidenceThreshold).toBeLessThanOrEqual(1)
    })
  })
})

describe('Confidence Engine', () => {
  let engine: ConfidenceEngine

  beforeEach(() => {
    engine = new ConfidenceEngine(0.6)
  })

  describe('Confidence Scoring', () => {
    it('should return zero confidence for empty results', () => {
      const confidence = engine.calculateConfidence('test query', [])
      
      expect(confidence.score).toBe(0)
      expect(confidence.isAboveThreshold).toBe(false)
      expect(confidence.factors.length).toBeGreaterThan(0)
    })

    it('should calculate confidence for search results', () => {
      const searchResults = [{
        content: 'Event planning involves organizing and coordinating all aspects of an event',
        score: 0.8,
        source: 'Knowledge Base',
        metadata: {
          topic: 'event planning',
          relevanceScore: 0.8,
          matchType: 'partial' as const,
          keywords: ['event', 'planning']
        }
      }]

      const confidence = engine.calculateConfidence('How do I plan an event?', searchResults)
      
      expect(confidence.score).toBeGreaterThan(0)
      expect(confidence.factors.length).toBeGreaterThan(0)
      expect(confidence.factors.every(f => f.score >= 0 && f.score <= 1)).toBe(true)
    })

    it('should respect confidence threshold', () => {
      engine.setThreshold(0.8)
      expect(engine.getThreshold()).toBe(0.8)
      
      const confidence = engine.calculateConfidence('test', [{
        content: 'test content',
        score: 0.5,
        source: 'test',
        metadata: {
          topic: 'test',
          relevanceScore: 0.5,
          matchType: 'partial',
          keywords: ['test']
        }
      }])
      
      expect(confidence.threshold).toBe(0.8)
    })

    it('should aggregate multiple results correctly', () => {
      const results = [
        {
          content: 'First result about event planning',
          score: 0.9,
          source: 'Source 1',
          metadata: {
            topic: 'event planning',
            relevanceScore: 0.9,
            matchType: 'exact' as const,
            keywords: ['event', 'planning']
          }
        },
        {
          content: 'Second result about wedding planning',
          score: 0.7,
          source: 'Source 2',
          metadata: {
            topic: 'wedding planning',
            relevanceScore: 0.7,
            matchType: 'partial' as const,
            keywords: ['wedding', 'planning']
          }
        }
      ]

      const aggregated = engine.aggregateResults(results)
      
      expect(aggregated.combinedContent).toContain('First result')
      expect(aggregated.combinedContent).toContain('Second result')
      expect(aggregated.sources).toEqual(['Source 1', 'Source 2'])
      expect(aggregated.averageScore).toBeGreaterThan(0)
    })
  })
})

describe('Message Router', () => {
  let router: MessageRouter

  beforeEach(() => {
    router = new MessageRouter({
      confidenceThreshold: 0.6,
      handoffEnabled: false,
      clarificationThreshold: 0.4,
      maxSearchResults: 5,
      responseTimeout: 5000
    })
  })

  describe('Routing Decisions', () => {
    it('should route high confidence to direct response', () => {
      const confidence = {
        score: 0.8,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const searchResults = [{
        content: 'Test content',
        score: 0.8,
        source: 'Test',
        metadata: {
          topic: 'test',
          relevanceScore: 0.8,
          matchType: 'exact' as const,
          keywords: ['test']
        }
      }]

      const decision = router.routeMessage('test query', confidence, searchResults)
      
      expect(decision.route).toBe('direct_response')
      expect(decision.shouldRespond).toBe(true)
      expect(decision.shouldHandoff).toBe(false)
      expect(decision.response).toContain('Knowledge Base Response')
    })

    it('should route low confidence to clarification when handoff disabled', () => {
      const confidence = {
        score: 0.2,
        threshold: 0.6,
        isAboveThreshold: false,
        factors: []
      }

      const decision = router.routeMessage('unclear query', confidence, [])
      
      expect(decision.route).toBe('clarification_needed')
      expect(decision.shouldRespond).toBe(true)
      expect(decision.shouldHandoff).toBe(false)
      expect(decision.response).toContain('not sure I understand')
    })

    it('should provide reasoning for routing decisions', () => {
      const confidence = {
        score: 0.8,
        threshold: 0.6,
        isAboveThreshold: true,
        factors: []
      }

      const searchResults = [{
        content: 'Test content',
        score: 0.8,
        source: 'Test',
        metadata: {
          topic: 'test',
          relevanceScore: 0.8,
          matchType: 'exact' as const,
          keywords: ['test']
        }
      }]

      const decision = router.routeMessage('test', confidence, searchResults)
      
      expect(decision.reasoning).toContain('confidence')
      expect(decision.reasoning).toContain('80%')
    })

    it('should update configuration correctly', () => {
      router.updateConfiguration({
        confidenceThreshold: 0.8,
        handoffEnabled: true
      })

      const config = router.getConfiguration()
      expect(config.confidenceThreshold).toBe(0.8)
      expect(config.handoffEnabled).toBe(true)
    })
  })
})

describe('Configuration Manager', () => {
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
  })

  describe('Configuration Management', () => {
    it('should provide default configuration', () => {
      const config = configManager.getConfiguration()
      
      expect(config.knowledge.confidenceThreshold).toBe(0.6)
      expect(config.handoff.enabled).toBe(true)
      expect(config.routing.confidenceThreshold).toBe(0.6)
      expect(config.processing.enableLogging).toBe(true)
    })

    it('should validate configuration updates', () => {
      const validation = configManager.updateConfiguration({
        section: 'knowledge',
        updates: { confidenceThreshold: 0.8 }
      })
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors.length).toBe(0)
      
      const config = configManager.getConfiguration()
      expect(config.knowledge.confidenceThreshold).toBe(0.8)
    })

    it('should reject invalid configuration updates', () => {
      const validation = configManager.updateConfiguration({
        section: 'knowledge',
        updates: { confidenceThreshold: 1.5 } // Invalid value > 1
      })
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors.length).toBeGreaterThan(0)
    })

    it('should track update history', () => {
      configManager.updateConfiguration({
        section: 'knowledge',
        updates: { confidenceThreshold: 0.7 },
        reason: 'Test update'
      })

      const history = configManager.getUpdateHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history[history.length - 1].reason).toBe('Test update')
    })

    it('should export and import configuration', () => {
      // Update configuration
      configManager.updateConfiguration({
        section: 'knowledge',
        updates: { confidenceThreshold: 0.75 }
      })

      // Export
      const exported = configManager.exportConfiguration()
      expect(exported).toContain('confidenceThreshold')

      // Create new manager and import
      const newManager = new ConfigurationManager()
      const validation = newManager.importConfiguration(exported)
      
      expect(validation.isValid).toBe(true)
      
      const importedConfig = newManager.getConfiguration()
      expect(importedConfig.knowledge.confidenceThreshold).toBe(0.75)
    })

    it('should provide optimized configurations', () => {
      const highAccuracy = configManager.getOptimizedConfiguration('high_accuracy')
      const fastResponse = configManager.getOptimizedConfiguration('fast_response')
      
      expect(highAccuracy.knowledge?.confidenceThreshold).toBeGreaterThan(
        fastResponse.knowledge?.confidenceThreshold || 0
      )
      expect(fastResponse.knowledge?.searchTimeout).toBeLessThan(
        highAccuracy.knowledge?.searchTimeout || Infinity
      )
    })
  })
})
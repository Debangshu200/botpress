import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeIntegrator, IntegrationOptions } from './knowledge-integration'
import { MockKnowledgeAdapter } from './mock-knowledge-adapter'
import { KnowledgePair } from './learning-engine'

describe('KnowledgeIntegrator', () => {
  let integrator: KnowledgeIntegrator
  let adapter: MockKnowledgeAdapter
  let options: IntegrationOptions

  beforeEach(() => {
    adapter = new MockKnowledgeAdapter()
    options = {
      enableDuplicateDetection: true,
      duplicateThreshold: 0.7,
      autoApprovalThreshold: 0.8,
      requireManualReview: false,
      preserveSourceAttribution: true,
      enableVersioning: true,
      tagGeneration: true,
      qualityFiltering: true,
      minQualityScore: 0.6
    }
    integrator = new KnowledgeIntegrator(adapter, options)
  })

  describe('Knowledge Integration', () => {
    it('should integrate approved knowledge pairs successfully', async () => {
      const pairs: KnowledgePair[] = [
        {
          queryId: 'query-1',
          query: 'How do I book a venue?',
          response: 'To book a venue, first check availability on our booking system, then submit a request with your event details.',
          confidence: 0.9,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            agentId: 'agent-123',
            messageCount: 2,
            queryComplexity: 'moderate',
            responseQuality: 0.8,
            tags: ['booking', 'venue'],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'booking',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        }
      ]

      const result = await integrator.integrateKnowledge(pairs)

      expect(result.success).toBe(true)
      expect(result.integratedCount).toBe(1)
      expect(result.skippedCount).toBe(0)
      expect(result.failedCount).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(result.metadata.sourceAttributions).toHaveLength(1)

      // Verify document was created
      const documents = adapter.getAllDocuments()
      expect(documents).toHaveLength(1)
      expect(documents[0].source).toBe('learned')
      expect(documents[0].title).toBe('How do I book a venue')
      expect(documents[0].content).toContain('To book a venue')
    })

    it('should filter out low-quality pairs when quality filtering is enabled', async () => {
      const pairs: KnowledgePair[] = [
        {
          queryId: 'query-1',
          query: 'Test query',
          response: 'Test response',
          confidence: 0.9,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            messageCount: 2,
            queryComplexity: 'simple',
            responseQuality: 0.9,
            tags: [],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'general_inquiry',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        },
        {
          queryId: 'query-2',
          query: 'Low quality query',
          response: 'Low quality response',
          confidence: 0.3, // Below threshold
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'pending',
          metadata: {
            messageCount: 2,
            queryComplexity: 'simple',
            responseQuality: 0.3,
            tags: [],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'general_inquiry',
              resolutionStatus: 'partial'
            },
            validationHistory: []
          }
        }
      ]

      const result = await integrator.integrateKnowledge(pairs)

      expect(result.success).toBe(true)
      expect(result.integratedCount).toBe(1)
      expect(result.metadata.qualityFiltered).toBe(1)

      const documents = adapter.getAllDocuments()
      expect(documents).toHaveLength(1)
      expect(documents[0].title).toBe('Test query')
    })

    it('should handle empty pairs array', async () => {
      const result = await integrator.integrateKnowledge([])

      expect(result.success).toBe(true)
      expect(result.integratedCount).toBe(0)
      expect(result.skippedCount).toBe(0)
      expect(result.failedCount).toBe(0)
      expect(result.metadata.totalPairs).toBe(0)
    })

    it('should handle integration errors gracefully', async () => {
      const pairs: KnowledgePair[] = [
        {
          queryId: 'query-1',
          query: 'Test query',
          response: 'Test response',
          confidence: 0.9,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            messageCount: 2,
            queryComplexity: 'simple',
            responseQuality: 0.9,
            tags: [],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'general_inquiry',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        }
      ]

      // Simulate storage error
      adapter.simulateError('create')

      const result = await integrator.integrateKnowledge(pairs)

      expect(result.success).toBe(false)
      expect(result.integratedCount).toBe(0)
      expect(result.failedCount).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].type).toBe('storage')
    })
  })

  describe('Duplicate Detection', () => {
    it('should detect and skip duplicate content', async () => {
      // First, add a document to the knowledge base
      const existingPair: KnowledgePair = {
        queryId: 'existing-query',
        query: 'How do I book a venue?',
        response: 'Existing response about venue booking',
        confidence: 0.8,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate',
          responseQuality: 0.8,
          tags: ['booking', 'venue'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }

      await integrator.integrateKnowledge([existingPair])

      // Now try to add a similar pair
      const duplicatePair: KnowledgePair = {
        queryId: 'duplicate-query',
        query: 'How do I book a venue for events?', // Similar query
        response: 'Similar response about venue booking',
        confidence: 0.7, // Lower confidence
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate',
          responseQuality: 0.7,
          tags: ['booking', 'venue'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }

      const result = await integrator.integrateKnowledge([duplicatePair])

      expect(result.integratedCount).toBe(0)
      expect(result.skippedCount).toBe(1)
      expect(result.metadata.duplicatesDetected).toBe(1)

      // Should still have only one document
      const documents = adapter.getAllDocuments()
      expect(documents).toHaveLength(1)
    })

    it('should merge content when duplicate has similar confidence', async () => {
      // Mock the duplicate detection to return merge resolution
      const originalDetectDuplicates = integrator['detectDuplicates']
      integrator['detectDuplicates'] = vi.fn().mockResolvedValue({
        isDuplicate: true,
        existingDocumentId: 'existing-doc',
        similarityScore: 0.8,
        conflictResolution: 'merge',
        reason: 'Similar confidence levels'
      })

      // Add existing document
      await adapter.createDocument({
        id: 'existing-doc',
        title: 'How do I book a venue',
        content: 'Q: How do I book a venue?\n\nA: Existing response',
        source: 'learned',
        sourceAttribution: {
          queryId: 'existing-query',
          source: 'human-agent',
          sessionId: 'batch-1',
          confidence: 0.8,
          validationStatus: 'approved'
        },
        tags: ['booking'],
        metadata: {
          queryComplexity: 'moderate',
          responseQuality: 0.8,
          userIntent: 'booking',
          domain: ['booking_system'],
          language: 'en',
          searchKeywords: ['book', 'venue'],
          relatedQueries: [],
          usageCount: 0,
          effectiveness: 0.8
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1
      })

      const pair: KnowledgePair = {
        queryId: 'new-query',
        query: 'How do I book a venue?',
        response: 'Additional information about booking',
        confidence: 0.8,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'moderate',
          responseQuality: 0.8,
          tags: ['booking', 'venue'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }

      const result = await integrator.integrateKnowledge([pair])

      expect(result.integratedCount).toBe(1)
      expect(result.skippedCount).toBe(0)

      // Check that content was merged
      const updatedDoc = await adapter.getDocumentById('existing-doc')
      expect(updatedDoc?.content).toContain('Additional Information')
      expect(updatedDoc?.version).toBe(2)

      // Restore original method
      integrator['detectDuplicates'] = originalDetectDuplicates
    })

    it('should disable duplicate detection when configured', async () => {
      const noDuplicateOptions = { ...options, enableDuplicateDetection: false }
      const noDuplicateIntegrator = new KnowledgeIntegrator(adapter, noDuplicateOptions)

      // Add two identical pairs
      const pairs: KnowledgePair[] = [
        {
          queryId: 'query-1',
          query: 'How do I book a venue?',
          response: 'Response 1',
          confidence: 0.9,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            messageCount: 2,
            queryComplexity: 'moderate',
            responseQuality: 0.9,
            tags: ['booking'],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'booking',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        },
        {
          queryId: 'query-2',
          query: 'How do I book a venue?',
          response: 'Response 2',
          confidence: 0.8,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            messageCount: 2,
            queryComplexity: 'moderate',
            responseQuality: 0.8,
            tags: ['booking'],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'booking',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        }
      ]

      const result = await noDuplicateIntegrator.integrateKnowledge(pairs)

      expect(result.integratedCount).toBe(2)
      expect(result.skippedCount).toBe(0)
      expect(result.metadata.duplicatesDetected).toBe(0)

      // Should have both documents
      const documents = adapter.getAllDocuments()
      expect(documents).toHaveLength(2)
    })
  })

  describe('Document Creation', () => {
    it('should create well-formatted knowledge documents', async () => {
      const pair: KnowledgePair = {
        queryId: 'query-1',
        query: 'How do I configure the event management system?',
        response: 'To configure the system, go to Settings > Configuration and update the required fields.',
        confidence: 0.9,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          agentId: 'agent-123',
          messageCount: 4,
          queryComplexity: 'complex',
          responseQuality: 0.9,
          tags: ['configuration', 'system', 'technical'],
          context: {
            previousQueries: ['What is the system?'],
            conversationFlow: ['user: help', 'agent: sure'],
            userIntent: 'configuration',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }

      const document = await integrator['createKnowledgeDocument'](pair, 'batch-123')

      expect(document.title).toBe('How do I configure the event management system')
      expect(document.content).toContain('Q: How do I configure')
      expect(document.content).toContain('A: To configure the system')
      expect(document.source).toBe('learned')
      expect(document.sourceAttribution.queryId).toBe('query-1')
      expect(document.sourceAttribution.agentId).toBe('agent-123')
      expect(document.tags).toContain('configuration')
      expect(document.tags).toContain('complexity:complex')
      expect(document.tags).toContain('high-quality')
      expect(document.tags).toContain('intent:configuration')
      expect(document.metadata.queryComplexity).toBe('complex')
      expect(document.metadata.userIntent).toBe('configuration')
      expect(document.metadata.searchKeywords).toContain('configure')
      expect(document.metadata.domain).toContain('technical')
    })

    it('should generate appropriate search keywords', () => {
      const keywords = integrator['extractSearchKeywords'](
        'How do I book a venue for my wedding event?',
        'To book a venue, you need to check availability and submit a booking request with your event details.'
      )

      // Should contain some key words
      expect(keywords).toContain('book')
      expect(keywords).toContain('venue')
      expect(keywords).toContain('wedding')
      expect(keywords).toContain('booking')
      
      // Should not contain stop words
      expect(keywords).not.toContain('the')
      expect(keywords).not.toContain('and')
      expect(keywords).not.toContain('you')
      expect(keywords).not.toContain('for')
      expect(keywords).not.toContain('with')
      
      // Check that we have reasonable number of keywords
      expect(keywords.length).toBeGreaterThan(4)
      expect(keywords.length).toBeLessThanOrEqual(10)
    })

    it('should extract domain from tags correctly', () => {
      const eventDomain = integrator['extractDomain'](['event', 'planning', 'venue'])
      expect(eventDomain).toContain('event_management')
      expect(eventDomain).toContain('event_planning')
      expect(eventDomain).toContain('venue_management')

      const technicalDomain = integrator['extractDomain'](['api', 'integration', 'configuration'])
      expect(technicalDomain).toContain('technical')

      const generalDomain = integrator['extractDomain'](['unknown', 'random'])
      expect(generalDomain).toContain('general')
    })

    it('should generate tags when tag generation is enabled', () => {
      const pair: KnowledgePair = {
        queryId: 'query-1',
        query: 'Test query',
        response: 'High quality response with detailed information',
        confidence: 0.9,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'complex',
          responseQuality: 0.9,
          tags: ['existing-tag'],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'booking',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }

      const tags = integrator['generateTags'](pair)

      expect(tags).toContain('existing-tag')
      expect(tags).toContain('complexity:complex')
      expect(tags).toContain('high-quality')
      expect(tags).toContain('intent:booking')
      expect(tags).toContain('learned-content')
      expect(tags).toContain('human-validated')
    })
  })

  describe('Content Merging', () => {
    it('should merge content without duplication', () => {
      const existingContent = 'Q: How do I book?\n\nA: Use the booking system.'
      const newContent = 'You can also call our support line.'

      const merged = integrator['mergeContent'](existingContent, newContent)

      expect(merged).toContain('Use the booking system')
      expect(merged).toContain('Additional Information')
      expect(merged).toContain('You can also call our support line')
    })

    it('should not duplicate identical content', () => {
      const existingContent = 'Q: How do I book?\n\nA: Use the booking system.'
      const duplicateContent = 'Use the booking system.'

      const merged = integrator['mergeContent'](existingContent, duplicateContent)

      expect(merged).toBe(existingContent) // Should remain unchanged
    })
  })

  describe('Similarity Calculation', () => {
    it('should calculate similarity correctly', () => {
      const text1 = 'How do I book a venue?'
      const text2 = 'How to book a venue for events?'

      const similarity = integrator['calculateSimilarity'](text1, text2)

      expect(similarity).toBeGreaterThan(0.2) // Should be similar
      expect(similarity).toBeLessThan(1.0) // But not identical
    })

    it('should return zero similarity for completely different texts', () => {
      const text1 = 'How do I book a venue?'
      const text2 = 'What is the weather today?'

      const similarity = integrator['calculateSimilarity'](text1, text2)

      expect(similarity).toBe(0)
    })

    it('should return high similarity for nearly identical texts', () => {
      const text1 = 'How do I book a venue?'
      const text2 = 'How do I book a venue'

      const similarity = integrator['calculateSimilarity'](text1, text2)

      expect(similarity).toBeGreaterThan(0.7) // Adjusted threshold
    })
  })

  describe('Integration History', () => {
    it('should track integration history', async () => {
      const pairs: KnowledgePair[] = [
        {
          queryId: 'query-1',
          query: 'Test query',
          response: 'Test response',
          confidence: 0.9,
          source: 'human-agent',
          timestamp: new Date(),
          quality: 'approved',
          metadata: {
            messageCount: 2,
            queryComplexity: 'simple',
            responseQuality: 0.9,
            tags: [],
            context: {
              previousQueries: [],
              conversationFlow: [],
              userIntent: 'general_inquiry',
              resolutionStatus: 'resolved'
            },
            validationHistory: []
          }
        }
      ]

      const result = await integrator.integrateKnowledge(pairs)
      const batchId = result.metadata.integrationBatch

      const history = integrator.getIntegrationHistory(batchId)

      expect(history).toBeTruthy()
      expect(history?.integratedCount).toBe(1)
      expect(history?.metadata.integrationBatch).toBe(batchId)
    })

    it('should return all integration history', async () => {
      const pairs1: KnowledgePair[] = [{
        queryId: 'query-1',
        query: 'Test query 1',
        response: 'Test response 1',
        confidence: 0.9,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple',
          responseQuality: 0.9,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }]

      const pairs2: KnowledgePair[] = [{
        queryId: 'query-2',
        query: 'Test query 2',
        response: 'Test response 2',
        confidence: 0.8,
        source: 'human-agent',
        timestamp: new Date(),
        quality: 'approved',
        metadata: {
          messageCount: 2,
          queryComplexity: 'simple',
          responseQuality: 0.8,
          tags: [],
          context: {
            previousQueries: [],
            conversationFlow: [],
            userIntent: 'general_inquiry',
            resolutionStatus: 'resolved'
          },
          validationHistory: []
        }
      }]

      await integrator.integrateKnowledge(pairs1)
      await integrator.integrateKnowledge(pairs2)

      const allHistory = integrator.getAllIntegrationHistory()

      expect(allHistory).toHaveLength(2)
      expect(allHistory[0].integratedCount).toBe(1)
      expect(allHistory[1].integratedCount).toBe(1)
    })
  })
})
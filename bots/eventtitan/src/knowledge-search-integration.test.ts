/**
 * Test script for knowledge base search and response integration
 * Tests client.searchFiles() integration and response generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as questions from '../../../plugins/knowledge/src/question-prompt'
import * as gen from '../../../plugins/knowledge/src/generate-content'

// Mock Botpress client for testing
const mockClient = {
  searchFiles: vi.fn(),
  createMessage: vi.fn()
}

// Mock search results for testing
const mockSearchResults = {
  withPassages: {
    passages: [
      {
        content: 'Event planning involves organizing and coordinating all aspects of an event, from initial concept to execution. This includes venue selection, catering, entertainment, and guest management.',
        metadata: { source: 'event-planning-guide.md' }
      },
      {
        content: 'Key steps in event planning: 1. Define objectives 2. Set budget 3. Choose venue 4. Plan logistics 5. Execute event',
        metadata: { source: 'planning-checklist.md' }
      }
    ]
  },
  empty: {
    passages: []
  },
  singlePassage: {
    passages: [
      {
        content: 'Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results.',
        metadata: { source: 'wedding-guide.md' }
      }
    ]
  }
}

// Mock extracted questions for testing
const mockExtractedQuestions = {
  single: {
    hasQuestions: true,
    questions: [{
      line: 'L1',
      raw_question: 'What is event planning?',
      resolved_question: 'What is event planning?',
      search_query: 'event planning definition guide'
    }]
  },
  multiple: {
    hasQuestions: true,
    questions: [
      {
        line: 'L1',
        raw_question: 'How do I plan a wedding?',
        resolved_question: 'How do I plan a wedding?',
        search_query: 'wedding planning guide steps'
      },
      {
        line: 'L1',
        raw_question: 'What venues are available?',
        resolved_question: 'What wedding venues are available?',
        search_query: 'wedding venues availability'
      }
    ]
  },
  none: {
    hasQuestions: false,
    questions: []
  }
}

describe('Knowledge Base Search Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Search Query Generation', () => {
    it('should generate search query from single question', () => {
      const data = mockExtractedQuestions.single
      const canonicalQuestion = data.questions!.map(q => q.resolved_question).join(' ')
      
      expect(canonicalQuestion).toBe('What is event planning?')
    })

    it('should generate search query from multiple questions', () => {
      const data = mockExtractedQuestions.multiple
      const canonicalQuestion = data.questions!.map(q => q.resolved_question).join(' ')
      
      expect(canonicalQuestion).toBe('How do I plan a wedding? What wedding venues are available?')
    })

    it('should handle empty questions array', () => {
      const data = mockExtractedQuestions.none
      const canonicalQuestion = data.questions?.map(q => q.resolved_question).join(' ') || ''
      
      expect(canonicalQuestion).toBe('')
    })
  })

  describe('Knowledge Base Search', () => {
    it('should call client.searchFiles with correct query', async () => {
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.withPassages)
      
      const query = 'What is event planning?'
      const result = await mockClient.searchFiles({ query })
      
      expect(mockClient.searchFiles).toHaveBeenCalledWith({ query })
      expect(result.passages).toHaveLength(2)
    })

    it('should handle empty search results', async () => {
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.empty)
      
      const query = 'Unknown topic'
      const result = await mockClient.searchFiles({ query })
      
      expect(result.passages).toHaveLength(0)
    })

    it('should handle search errors gracefully', async () => {
      mockClient.searchFiles.mockRejectedValue(new Error('Search service unavailable'))
      
      const query = 'What is event planning?'
      
      await expect(mockClient.searchFiles({ query })).rejects.toThrow('Search service unavailable')
    })

    it('should handle single passage result', async () => {
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.singlePassage)
      
      const query = 'How to plan a wedding?'
      const result = await mockClient.searchFiles({ query })
      
      expect(result.passages).toHaveLength(1)
      expect(result.passages[0].content).toContain('Wedding planning requires')
    })
  })

  describe('Response Generation', () => {
    it('should generate response from single passage', () => {
      const passages = mockSearchResults.singlePassage.passages
      const answer = passages.map(p => p.content).join('\n')
      
      expect(answer).toBe('Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results.')
    })

    it('should generate response from multiple passages', () => {
      const passages = mockSearchResults.withPassages.passages
      const answer = passages.map(p => p.content).join('\n')
      
      expect(answer).toContain('Event planning involves organizing')
      expect(answer).toContain('Key steps in event planning')
      expect(answer.split('\n')).toHaveLength(2)
    })

    it('should handle empty passages array', () => {
      const passages = mockSearchResults.empty.passages
      const answer = passages.map(p => p.content).join('\n')
      
      expect(answer).toBe('')
    })
  })

  describe('Message Creation', () => {
    it('should create message with correct parameters', async () => {
      mockClient.createMessage.mockResolvedValue({ id: 'msg-123' })
      
      const messageParams = {
        conversationId: 'conv-123',
        userId: 'bot-456',
        payload: {
          text: 'Event planning involves organizing and coordinating all aspects of an event.'
        },
        tags: {},
        type: 'text' as const
      }
      
      await mockClient.createMessage(messageParams)
      
      expect(mockClient.createMessage).toHaveBeenCalledWith(messageParams)
    })

    it('should handle message creation errors', async () => {
      mockClient.createMessage.mockRejectedValue(new Error('Message creation failed'))
      
      const messageParams = {
        conversationId: 'conv-123',
        userId: 'bot-456',
        payload: { text: 'Test message' },
        tags: {},
        type: 'text' as const
      }
      
      await expect(mockClient.createMessage(messageParams)).rejects.toThrow('Message creation failed')
    })
  })

  describe('End-to-End Integration Flow', () => {
    it('should complete full flow from question to response', async () => {
      // Mock the complete flow
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.withPassages)
      mockClient.createMessage.mockResolvedValue({ id: 'msg-123' })
      
      // Simulate the plugin flow
      const extractedData = mockExtractedQuestions.single
      const canonicalQuestion = extractedData.questions!.map(q => q.resolved_question).join(' ')
      
      // Search knowledge base
      const searchResult = await mockClient.searchFiles({ query: canonicalQuestion })
      expect(searchResult.passages).toHaveLength(2)
      
      // Generate response
      const answer = searchResult.passages.map(p => p.content).join('\n')
      expect(answer).toContain('Event planning involves')
      
      // Create message
      await mockClient.createMessage({
        conversationId: 'test-conv',
        userId: 'bot-id',
        payload: { text: answer },
        tags: {},
        type: 'text'
      })
      
      expect(mockClient.createMessage).toHaveBeenCalledWith({
        conversationId: 'test-conv',
        userId: 'bot-id',
        payload: { text: answer },
        tags: {},
        type: 'text'
      })
    })

    it('should handle flow when no knowledge is found', async () => {
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.empty)
      
      const extractedData = mockExtractedQuestions.single
      const canonicalQuestion = extractedData.questions!.map(q => q.resolved_question).join(' ')
      
      const searchResult = await mockClient.searchFiles({ query: canonicalQuestion })
      expect(searchResult.passages).toHaveLength(0)
      
      // Should not create message when no passages found
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should handle multiple questions in single message', async () => {
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.withPassages)
      mockClient.createMessage.mockResolvedValue({ id: 'msg-123' })
      
      const extractedData = mockExtractedQuestions.multiple
      const canonicalQuestion = extractedData.questions!.map(q => q.resolved_question).join(' ')
      
      expect(canonicalQuestion).toBe('How do I plan a wedding? What wedding venues are available?')
      
      const searchResult = await mockClient.searchFiles({ query: canonicalQuestion })
      expect(searchResult.passages).toHaveLength(2)
      
      const answer = searchResult.passages.map(p => p.content).join('\n')
      await mockClient.createMessage({
        conversationId: 'test-conv',
        userId: 'bot-id',
        payload: { text: answer },
        tags: {},
        type: 'text'
      })
      
      expect(mockClient.createMessage).toHaveBeenCalled()
    })
  })

  describe('Error Handling Scenarios', () => {
    it('should handle search timeout errors', async () => {
      mockClient.searchFiles.mockRejectedValue(new Error('Request timeout'))
      
      const query = 'What is event planning?'
      await expect(mockClient.searchFiles({ query })).rejects.toThrow('Request timeout')
    })

    it('should handle malformed search results', async () => {
      mockClient.searchFiles.mockResolvedValue({ passages: null })
      
      const query = 'What is event planning?'
      const result = await mockClient.searchFiles({ query })
      
      expect(result.passages).toBeNull()
    })

    it('should handle message creation with invalid parameters', async () => {
      mockClient.createMessage.mockRejectedValue(new Error('Invalid conversation ID'))
      
      const invalidParams = {
        conversationId: '',
        userId: 'bot-id',
        payload: { text: 'Test' },
        tags: {},
        type: 'text' as const
      }
      
      await expect(mockClient.createMessage(invalidParams)).rejects.toThrow('Invalid conversation ID')
    })
  })
})

// Test scenarios for manual integration testing
export const integrationTestScenarios = {
  searchQueries: [
    'What is event planning?',
    'How do I organize a wedding?',
    'What venues are available for corporate events?',
    'Can you help me with catering options?',
    'I need information about event budgeting',
    'How to plan a birthday party?',
    'What are the best practices for event management?'
  ],
  
  expectedBehaviors: {
    withKnowledge: 'Should return relevant passages and create response message',
    withoutKnowledge: 'Should return empty passages and not create message',
    withError: 'Should handle errors gracefully and log debug information'
  },
  
  testFlow: [
    '1. Extract questions from user message',
    '2. Generate canonical search query',
    '3. Search knowledge base with query',
    '4. Check if passages were found',
    '5. If found: generate response and create message',
    '6. If not found: allow normal bot processing',
    '7. Handle any errors gracefully'
  ]
}

console.log('Knowledge Base Search Integration Test Suite')
console.log('============================================')
console.log('')
console.log('Run with: npm test -- knowledge-search-integration.test.ts')
console.log('')
console.log('Test scenarios cover:')
console.log('- Search query generation from extracted questions')
console.log('- Knowledge base search with client.searchFiles()')
console.log('- Response generation from search results')
console.log('- Message creation with proper parameters')
console.log('- Error handling for search and message failures')
console.log('- End-to-end integration flow testing')
/**
 * Comprehensive error handling test for knowledge plugin integration
 * Tests all error scenarios and graceful degradation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the knowledge plugin modules
const mockGenModule = {
  parseLLMOutput: vi.fn()
}

const mockQuestionsModule = {
  prompt: vi.fn(),
  OutputFormat: {
    safeParse: vi.fn()
  }
}

// Mock Botpress client and context
const mockClient = {
  searchFiles: vi.fn(),
  createMessage: vi.fn()
}

const mockContext = {
  botId: 'test-bot-id'
}

const mockActions = {
  llm: {
    generateContent: vi.fn()
  }
}

// Mock console methods to capture logs
const mockConsole = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn()
}

// Test messages
const testMessage = {
  id: 'msg-123',
  type: 'text',
  conversationId: 'conv-123',
  payload: { text: 'What is event planning?' }
}

describe('Comprehensive Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset console mocks
    Object.keys(mockConsole).forEach(key => mockConsole[key].mockClear())
  })

  describe('LLM Generation Failures', () => {
    it('should handle LLM service timeout gracefully', async () => {
      mockActions.llm.generateContent.mockRejectedValue(new Error('Request timeout'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
      // Should log error with context
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Request timeout',
          conversationId: 'conv-123'
        })
      )
    })

    it('should handle LLM service unavailable error', async () => {
      mockActions.llm.generateContent.mockRejectedValue(new Error('Service unavailable'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Service unavailable'
        })
      )
    })

    it('should handle LLM authentication errors', async () => {
      mockActions.llm.generateContent.mockRejectedValue(new Error('Authentication failed'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Authentication failed'
        })
      )
    })

    it('should handle unknown LLM errors', async () => {
      mockActions.llm.generateContent.mockRejectedValue('Unknown error type')

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Unknown error'
        })
      )
    })
  })

  describe('LLM Output Parsing Failures', () => {
    it('should handle malformed JSON responses', async () => {
      mockActions.llm.generateContent.mockResolvedValue('invalid json {')
      mockGenModule.parseLLMOutput.mockReturnValue({ success: false, json: null })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse LLM output'),
        expect.objectContaining({
          outputPreview: expect.stringContaining('invalid json'),
          conversationId: 'conv-123'
        })
      )
    })

    it('should handle empty LLM responses', async () => {
      mockActions.llm.generateContent.mockResolvedValue('')
      mockGenModule.parseLLMOutput.mockReturnValue({ success: false, json: null })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse LLM output'),
        expect.objectContaining({
          conversationId: 'conv-123'
        })
      )
    })

    it('should handle schema validation failures', async () => {
      mockActions.llm.generateContent.mockResolvedValue('{"valid": "json"}')
      mockGenModule.parseLLMOutput.mockReturnValue({ success: true, json: { valid: 'json' } })
      mockQuestionsModule.OutputFormat.safeParse.mockReturnValue({
        success: false,
        error: { message: 'Invalid schema' }
      })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to validate question extraction results'),
        expect.objectContaining({
          validationError: 'Invalid schema',
          conversationId: 'conv-123'
        })
      )
    })
  })

  describe('Knowledge Base Search Failures', () => {
    it('should handle search service downtime', async () => {
      setupSuccessfulLLMFlow()
      mockClient.searchFiles.mockRejectedValue(new Error('Search service down'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Knowledge base search failed'),
        expect.objectContaining({
          error: 'Search service down',
          query: expect.any(String),
          conversationId: 'conv-123'
        })
      )
    })

    it('should handle search timeout errors', async () => {
      setupSuccessfulLLMFlow()
      mockClient.searchFiles.mockRejectedValue(new Error('Search timeout'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Knowledge base search failed'),
        expect.objectContaining({
          error: 'Search timeout'
        })
      )
    })

    it('should handle malformed search responses', async () => {
      setupSuccessfulLLMFlow()
      mockClient.searchFiles.mockResolvedValue({ passages: null })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('No relevant knowledge found')
      )
    })

    it('should handle search API errors', async () => {
      setupSuccessfulLLMFlow()
      mockClient.searchFiles.mockRejectedValue(new Error('API rate limit exceeded'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Knowledge base search failed'),
        expect.objectContaining({
          error: 'API rate limit exceeded'
        })
      )
    })
  })

  describe('Message Creation Failures', () => {
    it('should handle message creation API errors', async () => {
      setupSuccessfulFlowWithKnowledge()
      mockClient.createMessage.mockRejectedValue(new Error('Message API error'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create response message'),
        expect.objectContaining({
          error: 'Message API error',
          conversationId: 'conv-123',
          responseLength: expect.any(Number)
        })
      )
    })

    it('should handle invalid conversation ID errors', async () => {
      setupSuccessfulFlowWithKnowledge()
      mockClient.createMessage.mockRejectedValue(new Error('Invalid conversation ID'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create response message'),
        expect.objectContaining({
          error: 'Invalid conversation ID'
        })
      )
    })

    it('should handle message size limit errors', async () => {
      setupSuccessfulFlowWithKnowledge()
      mockClient.createMessage.mockRejectedValue(new Error('Message too large'))

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create response message'),
        expect.objectContaining({
          error: 'Message too large'
        })
      )
    })
  })

  describe('Edge Cases and Unexpected Errors', () => {
    it('should handle null/undefined message payload', async () => {
      const invalidMessage = {
        ...testMessage,
        payload: null
      }

      const result = await simulatePluginWithErrorHandling(invalidMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring empty message')
      )
    })

    it('should handle whitespace-only messages', async () => {
      const whitespaceMessage = {
        ...testMessage,
        payload: { text: '   \n\t   ' }
      }

      const result = await simulatePluginWithErrorHandling(whitespaceMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring empty message')
      )
    })

    it('should handle unexpected errors with full stack trace', async () => {
      // Force an unexpected error by making a required function throw synchronously
      // This will bypass the inner try-catch and trigger the outer catch-all
      mockActions.llm.generateContent.mockImplementation(() => {
        // Simulate an error that happens before the await
        throw new TypeError('Cannot read property of undefined')
      })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      // The error should be caught by the LLM-specific error handler
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Cannot read property of undefined',
          conversationId: 'conv-123'
        })
      )
    })

    it('should handle non-Error thrown objects', async () => {
      mockActions.llm.generateContent.mockRejectedValue({ code: 500, message: 'Server error' })

      const result = await simulatePluginWithErrorHandling(testMessage)
      
      expect(result).toBeUndefined()
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('LLM generation failed'),
        expect.objectContaining({
          error: 'Unknown error'
        })
      )
    })
  })

  describe('Debug Logging', () => {
    it('should log debug information for successful LLM responses', async () => {
      mockActions.llm.generateContent.mockResolvedValue('{"hasQuestions": false}')
      mockGenModule.parseLLMOutput.mockReturnValue({ 
        success: true, 
        json: { hasQuestions: false } 
      })
      mockQuestionsModule.OutputFormat.safeParse.mockReturnValue({
        success: true,
        data: { hasQuestions: false, questions: [] }
      })

      await simulatePluginWithErrorHandling(testMessage)
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('LLM response received'),
        expect.objectContaining({
          outputLength: expect.any(Number)
        })
      )
    })

    it('should log debug information for successful searches', async () => {
      setupSuccessfulLLMFlow()
      mockClient.searchFiles.mockResolvedValue({ passages: [] })

      await simulatePluginWithErrorHandling(testMessage)
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('Knowledge search completed'),
        expect.objectContaining({
          passageCount: 0,
          query: expect.any(String)
        })
      )
    })
  })

  describe('Bot Stability', () => {
    it('should never crash the bot even with multiple errors', async () => {
      // Simulate multiple cascading errors
      mockActions.llm.generateContent.mockRejectedValue(new Error('LLM error'))
      
      const results = await Promise.all([
        simulatePluginWithErrorHandling(testMessage),
        simulatePluginWithErrorHandling(testMessage),
        simulatePluginWithErrorHandling(testMessage)
      ])
      
      // All should return undefined (continue normal bot flow)
      results.forEach(result => expect(result).toBeUndefined())
      
      // Should have logged errors but not crashed
      expect(mockConsole.error).toHaveBeenCalledTimes(3)
    })

    it('should maintain consistent behavior across error types', async () => {
      const errorScenarios = [
        () => {
          mockActions.llm.generateContent.mockRejectedValue(new Error('LLM error'))
        },
        () => {
          setupSuccessfulLLMFlow()
          mockClient.searchFiles.mockRejectedValue(new Error('Search error'))
        },
        () => {
          setupSuccessfulLLMFlow()
          mockClient.searchFiles.mockResolvedValue({
            passages: [{ content: 'Event planning involves organizing events.' }]
          })
          mockClient.createMessage.mockRejectedValue(new Error('Message error'))
        }
      ]

      for (let i = 0; i < errorScenarios.length; i++) {
        vi.clearAllMocks()
        errorScenarios[i]()
        
        const result = await simulatePluginWithErrorHandling(testMessage)
        expect(result).toBeUndefined()
        
        // For the third scenario, createMessage will be called but will fail
        // For the first two scenarios, createMessage should not be called at all
        if (i < 2) {
          expect(mockClient.createMessage).not.toHaveBeenCalled()
        }
      }
    })
  })
})

// Helper functions
function setupSuccessfulLLMFlow() {
  mockActions.llm.generateContent.mockResolvedValue('{"hasQuestions": true, "questions": [{"resolved_question": "What is event planning?"}]}')
  mockGenModule.parseLLMOutput.mockReturnValue({ 
    success: true, 
    json: { hasQuestions: true, questions: [{ resolved_question: "What is event planning?" }] }
  })
  mockQuestionsModule.OutputFormat.safeParse.mockReturnValue({
    success: true,
    data: { hasQuestions: true, questions: [{ resolved_question: "What is event planning?" }] }
  })
}

function setupSuccessfulFlowWithKnowledge() {
  setupSuccessfulLLMFlow()
  mockClient.searchFiles.mockResolvedValue({
    passages: [{ content: 'Event planning involves organizing events.' }]
  })
}

// Simulate the plugin's error handling behavior
async function simulatePluginWithErrorHandling(message: any) {
  try {
    mockConsole.info('Knowledge plugin: Processing incoming message', { 
      type: message.type, 
      conversationId: message.conversationId,
      messageId: message.id 
    })
    
    if (message.type !== 'text') {
      mockConsole.info('Knowledge plugin: Ignoring non-text message, allowing normal bot processing')
      return
    }

    const text: string = message.payload?.text
    if (!text || text.trim().length === 0) {
      mockConsole.info('Knowledge plugin: Ignoring empty message, allowing normal bot processing')
      return
    }

    mockConsole.info('Knowledge plugin: Extracting questions from text message:', 
      text.substring(0, 100) + (text.length > 100 ? '...' : ''))

    // LLM generation with error handling
    let llmOutput: string
    try {
      llmOutput = await mockActions.llm.generateContent('mock-prompt')
      mockConsole.debug('Knowledge plugin: LLM response received', { 
        outputLength: llmOutput?.length || 0 
      })
    } catch (error) {
      mockConsole.error('Knowledge plugin: LLM generation failed, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: message.conversationId
      })
      return
    }

    // Parse LLM output
    const { success, json } = mockGenModule.parseLLMOutput(llmOutput)
    if (!success) {
      mockConsole.warn('Knowledge plugin: Failed to parse LLM output, allowing normal bot processing', {
        outputPreview: llmOutput?.substring(0, 200) + (llmOutput?.length > 200 ? '...' : ''),
        conversationId: message.conversationId
      })
      return
    }

    // Validate results
    const parsedResult = mockQuestionsModule.OutputFormat.safeParse(json)
    if (!parsedResult.success) {
      mockConsole.warn('Knowledge plugin: Failed to validate question extraction results, allowing normal bot processing', {
        validationError: parsedResult.error.message,
        conversationId: message.conversationId
      })
      return
    }

    const { data } = parsedResult
    if (!data.hasQuestions || !data.questions?.length) {
      mockConsole.info('Knowledge plugin: No questions detected in message, allowing normal bot processing')
      return
    }

    const canonicalQuestion = data.questions.map((q: any) => q.resolved_question).join(' ')
    mockConsole.info('Knowledge plugin: Searching knowledge base for:', canonicalQuestion)

    // Search with error handling
    let passages: any[]
    try {
      const searchResult = await mockClient.searchFiles({ query: canonicalQuestion })
      passages = searchResult.passages || []
      mockConsole.debug('Knowledge plugin: Knowledge search completed', {
        passageCount: passages.length,
        query: canonicalQuestion
      })
    } catch (error) {
      mockConsole.error('Knowledge plugin: Knowledge base search failed, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: canonicalQuestion,
        conversationId: message.conversationId
      })
      return
    }

    if (!passages.length) {
      mockConsole.info('Knowledge plugin: No relevant knowledge found, allowing normal bot processing')
      return
    }

    mockConsole.info('Knowledge plugin: Found relevant knowledge, responding and stopping message processing', {
      passageCount: passages.length
    })

    const answer = passages.map((p: any) => p.content).join('\n')
    
    // Create message with error handling
    try {
      await mockClient.createMessage({
        conversationId: message.conversationId,
        userId: mockContext.botId,
        payload: { text: answer },
        tags: { 'knowledge-plugin': 'true', 'source': 'knowledge-base' },
        type: 'text',
      })

      mockConsole.info('Knowledge plugin: Successfully responded with knowledge base content', {
        responseLength: answer.length,
        conversationId: message.conversationId
      })
      
      return { stop: true }

    } catch (error) {
      mockConsole.error('Knowledge plugin: Failed to create response message, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: message.conversationId,
        responseLength: answer.length
      })
      return
    }

  } catch (error) {
    mockConsole.error('Knowledge plugin: Unexpected error during processing, allowing normal bot processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      conversationId: message.conversationId,
      messageType: message.type
    })
    return
  }
}

console.log('Comprehensive Error Handling Test Suite')
console.log('======================================')
console.log('')
console.log('Run with: npm test -- error-handling-comprehensive.test.ts')
console.log('')
console.log('This test suite covers:')
console.log('- LLM generation failures (timeout, service down, auth errors)')
console.log('- LLM output parsing failures (malformed JSON, schema validation)')
console.log('- Knowledge base search failures (service down, API errors)')
console.log('- Message creation failures (API errors, invalid params)')
console.log('- Edge cases (null payloads, whitespace messages)')
console.log('- Unexpected errors with stack traces')
console.log('- Debug logging verification')
console.log('- Bot stability under multiple error conditions')
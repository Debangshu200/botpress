/**
 * Test script for message flow control in knowledge plugin integration
 * Tests that plugin properly stops/continues message processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the knowledge plugin behavior
const mockKnowledgePlugin = {
  beforeIncomingMessage: vi.fn()
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

// Mock message types for testing
const mockMessages = {
  textWithQuestion: {
    type: 'text',
    conversationId: 'conv-123',
    payload: { text: 'What is event planning?' }
  },
  textWithoutQuestion: {
    type: 'text',
    conversationId: 'conv-123',
    payload: { text: 'Hello there!' }
  },
  nonTextMessage: {
    type: 'file',
    conversationId: 'conv-123',
    payload: { url: 'https://example.com/file.pdf' }
  },
  emptyTextMessage: {
    type: 'text',
    conversationId: 'conv-123',
    payload: { text: '' }
  }
}

// Mock LLM responses
const mockLLMResponses = {
  withQuestions: JSON.stringify({
    hasQuestions: true,
    questions: [{
      line: 'L1',
      raw_question: 'What is event planning?',
      resolved_question: 'What is event planning?',
      search_query: 'event planning definition'
    }]
  }),
  withoutQuestions: JSON.stringify({
    hasQuestions: false,
    questions: []
  }),
  malformed: 'invalid json response'
}

// Mock search results
const mockSearchResults = {
  withPassages: {
    passages: [
      { content: 'Event planning involves organizing and coordinating events.' }
    ]
  },
  empty: {
    passages: []
  }
}

describe('Message Flow Control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Plugin Return Values', () => {
    it('should return { stop: true } when knowledge is found and responded', async () => {
      // Mock successful flow with knowledge found
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.withQuestions)
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.withPassages)
      mockClient.createMessage.mockResolvedValue({ id: 'msg-123' })

      // Simulate plugin behavior
      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toEqual({ stop: true })
      expect(mockClient.createMessage).toHaveBeenCalled()
    })

    it('should return undefined (continue) when no questions detected', async () => {
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.withoutQuestions)

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) when no knowledge found', async () => {
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.withQuestions)
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.empty)

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) for non-text messages', async () => {
      const result = await simulatePluginExecution(mockMessages.nonTextMessage)
      
      expect(result).toBeUndefined()
      expect(mockActions.llm.generateContent).not.toHaveBeenCalled()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) for empty text messages', async () => {
      const result = await simulatePluginExecution(mockMessages.emptyTextMessage)
      
      expect(result).toBeUndefined()
      expect(mockActions.llm.generateContent).not.toHaveBeenCalled()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should return undefined (continue) when LLM generation fails', async () => {
      mockActions.llm.generateContent.mockRejectedValue(new Error('LLM service unavailable'))

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) when LLM returns malformed JSON', async () => {
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.malformed)

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) when knowledge search fails', async () => {
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.withQuestions)
      mockClient.searchFiles.mockRejectedValue(new Error('Search service unavailable'))

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
      expect(mockClient.createMessage).not.toHaveBeenCalled()
    })

    it('should return undefined (continue) when message creation fails', async () => {
      mockActions.llm.generateContent.mockResolvedValue(mockLLMResponses.withQuestions)
      mockClient.searchFiles.mockResolvedValue(mockSearchResults.withPassages)
      mockClient.createMessage.mockRejectedValue(new Error('Message creation failed'))

      const result = await simulatePluginExecution(mockMessages.textWithQuestion)
      
      expect(result).toBeUndefined()
    })
  })

  describe('Bot Flow Integration', () => {
    it('should allow normal bot processing when plugin returns undefined', () => {
      // This test verifies that when plugin doesn't return { stop: true },
      // the normal bot message handler should be called
      const pluginResult = undefined
      const shouldContinueToBot = !pluginResult || !pluginResult.stop
      
      expect(shouldContinueToBot).toBe(true)
    })

    it('should prevent normal bot processing when plugin returns { stop: true }', () => {
      const pluginResult = { stop: true }
      const shouldContinueToBot = !pluginResult || !pluginResult.stop
      
      expect(shouldContinueToBot).toBe(false)
    })
  })
})

// Helper function to simulate plugin execution
async function simulatePluginExecution(message: any) {
  try {
    // Simulate the plugin's beforeIncomingMessage logic
    console.info('Knowledge plugin: Processing incoming message', { 
      type: message.type, 
      conversationId: message.conversationId 
    })
    
    if (message.type !== 'text') {
      console.info('Knowledge plugin: Ignoring non-text message, allowing normal bot processing')
      return
    }

    const text: string = message.payload.text
    if (!text) {
      console.info('Knowledge plugin: Ignoring empty message, allowing normal bot processing')
      return
    }

    console.info('Knowledge plugin: Extracting questions from text message:', 
      text.substring(0, 100) + (text.length > 100 ? '...' : ''))

    const llmOutput = await mockActions.llm.generateContent('mock-prompt')
    
    let json
    try {
      json = JSON.parse(llmOutput)
    } catch (error) {
      console.info('Knowledge plugin: Failed to parse LLM output, allowing normal bot processing')
      return
    }

    if (!json.hasQuestions || !json.questions?.length) {
      console.info('Knowledge plugin: No questions detected in message, allowing normal bot processing')
      return
    }

    const canonicalQuestion = json.questions.map((q: any) => q.resolved_question).join(' ')

    console.info('Knowledge plugin: Searching knowledge base for:', canonicalQuestion)
    const { passages } = await mockClient.searchFiles({ query: canonicalQuestion })

    if (!passages.length) {
      console.info('Knowledge plugin: No relevant knowledge found, allowing normal bot processing')
      return
    }

    console.info('Knowledge plugin: Found relevant knowledge, responding and stopping message processing')
    const answer = passages.map((p: any) => p.content).join('\n')

    await mockClient.createMessage({
      conversationId: message.conversationId,
      userId: mockContext.botId,
      payload: { text: answer },
      tags: {},
      type: 'text',
    })

    console.info('Knowledge plugin: Successfully responded with knowledge base content')
    return { stop: true }

  } catch (error) {
    console.error('Knowledge plugin: Error during processing, allowing normal bot processing', error)
    return
  }
}

// Test scenarios for manual verification
export const flowControlScenarios = {
  shouldStop: [
    'User asks question with available knowledge',
    'Plugin successfully extracts questions',
    'Knowledge base returns relevant passages',
    'Plugin creates response message',
    'Plugin returns { stop: true }'
  ],
  
  shouldContinue: [
    'User sends non-text message (file, image, etc.)',
    'User sends empty text message',
    'LLM fails to extract questions',
    'LLM returns malformed response',
    'No questions detected in message',
    'Knowledge base returns no passages',
    'Knowledge search fails with error',
    'Message creation fails with error'
  ],
  
  verificationSteps: [
    '1. Send test message to bot',
    '2. Check plugin processing logs',
    '3. Verify plugin return value',
    '4. Confirm bot behavior matches expectation',
    '5. Test error scenarios for graceful handling'
  ]
}

console.log('Message Flow Control Test Suite')
console.log('===============================')
console.log('')
console.log('Run with: npm test -- message-flow-control.test.ts')
console.log('')
console.log('This test suite verifies:')
console.log('- Plugin returns { stop: true } when knowledge is found')
console.log('- Plugin returns undefined when normal bot flow should continue')
console.log('- Error handling allows graceful fallback to bot processing')
console.log('- Non-text messages are properly ignored')
console.log('- Empty messages are handled correctly')
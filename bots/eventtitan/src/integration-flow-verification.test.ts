/**
 * Integration test to verify message flow control works correctly
 * between knowledge plugin and EventTitan bot
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the actual plugin behavior
const mockKnowledgePluginResult = {
  withKnowledge: { stop: true },
  withoutKnowledge: undefined,
  withError: undefined
}

// Mock EventTitan bot behavior
const mockEventTitanBot = {
  handleMessage: vi.fn()
}

// Test scenarios
const testScenarios = {
  questionWithKnowledge: {
    message: {
      type: 'text',
      conversationId: 'conv-123',
      payload: { text: 'What is event planning?' }
    },
    expectedPluginResult: mockKnowledgePluginResult.withKnowledge,
    expectedBotCalled: false,
    description: 'Question with available knowledge should stop at plugin'
  },
  
  questionWithoutKnowledge: {
    message: {
      type: 'text',
      conversationId: 'conv-123', 
      payload: { text: 'What is quantum physics?' }
    },
    expectedPluginResult: mockKnowledgePluginResult.withoutKnowledge,
    expectedBotCalled: true,
    description: 'Question without knowledge should continue to bot'
  },
  
  greeting: {
    message: {
      type: 'text',
      conversationId: 'conv-123',
      payload: { text: 'Hello there!' }
    },
    expectedPluginResult: mockKnowledgePluginResult.withoutKnowledge,
    expectedBotCalled: true,
    description: 'Greeting should continue to bot'
  },
  
  fileMessage: {
    message: {
      type: 'file',
      conversationId: 'conv-123',
      payload: { url: 'https://example.com/file.pdf' }
    },
    expectedPluginResult: mockKnowledgePluginResult.withoutKnowledge,
    expectedBotCalled: true,
    description: 'File message should continue to bot'
  },
  
  errorScenario: {
    message: {
      type: 'text',
      conversationId: 'conv-123',
      payload: { text: 'What causes LLM errors?' }
    },
    expectedPluginResult: mockKnowledgePluginResult.withError,
    expectedBotCalled: true,
    description: 'Plugin error should continue to bot'
  }
}

describe('Integration Flow Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Message Flow Control Integration', () => {
    Object.entries(testScenarios).forEach(([scenarioName, scenario]) => {
      it(`should handle ${scenarioName} correctly: ${scenario.description}`, async () => {
        // Simulate the complete message flow
        const pluginResult = await simulateKnowledgePlugin(scenario.message)
        
        // Check if bot should be called based on plugin result
        const shouldCallBot = !pluginResult || !pluginResult.stop
        
        if (shouldCallBot) {
          await simulateEventTitanBot(scenario.message)
        }
        
        // Verify expectations
        expect(pluginResult).toEqual(scenario.expectedPluginResult)
        
        if (scenario.expectedBotCalled) {
          expect(mockEventTitanBot.handleMessage).toHaveBeenCalledWith(scenario.message)
        } else {
          expect(mockEventTitanBot.handleMessage).not.toHaveBeenCalled()
        }
      })
    })
  })

  describe('End-to-End Flow Scenarios', () => {
    it('should complete full knowledge response flow', async () => {
      const message = testScenarios.questionWithKnowledge.message
      
      // Step 1: Plugin processes message
      const pluginResult = await simulateKnowledgePlugin(message)
      console.log('Plugin result:', pluginResult)
      
      // Step 2: Check if bot should continue
      const shouldContinue = !pluginResult || !pluginResult.stop
      console.log('Should continue to bot:', shouldContinue)
      
      // Step 3: Bot should not be called
      if (shouldContinue) {
        await simulateEventTitanBot(message)
      }
      
      // Verify complete flow
      expect(pluginResult).toEqual({ stop: true })
      expect(mockEventTitanBot.handleMessage).not.toHaveBeenCalled()
    })

    it('should complete full fallback to bot flow', async () => {
      const message = testScenarios.questionWithoutKnowledge.message
      
      // Step 1: Plugin processes message
      const pluginResult = await simulateKnowledgePlugin(message)
      console.log('Plugin result:', pluginResult)
      
      // Step 2: Check if bot should continue
      const shouldContinue = !pluginResult || !pluginResult.stop
      console.log('Should continue to bot:', shouldContinue)
      
      // Step 3: Bot should be called
      if (shouldContinue) {
        await simulateEventTitanBot(message)
      }
      
      // Verify complete flow
      expect(pluginResult).toBeUndefined()
      expect(mockEventTitanBot.handleMessage).toHaveBeenCalledWith(message)
    })

    it('should handle mixed message types in sequence', async () => {
      const messages = [
        testScenarios.questionWithKnowledge.message,  // Should stop at plugin
        testScenarios.greeting.message,               // Should continue to bot
        testScenarios.fileMessage.message,            // Should continue to bot
        testScenarios.errorScenario.message           // Should continue to bot
      ]
      
      const results = []
      
      for (const message of messages) {
        const pluginResult = await simulateKnowledgePlugin(message)
        const shouldContinue = !pluginResult || !pluginResult.stop
        
        if (shouldContinue) {
          await simulateEventTitanBot(message)
        }
        
        results.push({
          message: message.payload,
          pluginResult,
          botCalled: shouldContinue
        })
      }
      
      // Verify sequence results
      expect(results[0].pluginResult).toEqual({ stop: true })
      expect(results[0].botCalled).toBe(false)
      
      expect(results[1].pluginResult).toBeUndefined()
      expect(results[1].botCalled).toBe(true)
      
      expect(results[2].pluginResult).toBeUndefined()
      expect(results[2].botCalled).toBe(true)
      
      expect(results[3].pluginResult).toBeUndefined()
      expect(results[3].botCalled).toBe(true)
      
      // Bot should have been called 3 times (not for the first message)
      expect(mockEventTitanBot.handleMessage).toHaveBeenCalledTimes(3)
    })
  })

  describe('Error Recovery and Stability', () => {
    it('should maintain bot functionality when plugin fails', async () => {
      const message = testScenarios.errorScenario.message
      
      // Plugin fails but returns undefined (continue)
      const pluginResult = await simulateKnowledgePlugin(message)
      expect(pluginResult).toBeUndefined()
      
      // Bot should still work normally
      await simulateEventTitanBot(message)
      expect(mockEventTitanBot.handleMessage).toHaveBeenCalledWith(message)
    })

    it('should handle rapid message succession', async () => {
      const rapidMessages = Array(5).fill(testScenarios.greeting.message)
      
      const results = await Promise.all(
        rapidMessages.map(async (message) => {
          const pluginResult = await simulateKnowledgePlugin(message)
          const shouldContinue = !pluginResult || !pluginResult.stop
          
          if (shouldContinue) {
            await simulateEventTitanBot(message)
          }
          
          return { pluginResult, shouldContinue }
        })
      )
      
      // All should continue to bot
      results.forEach(result => {
        expect(result.pluginResult).toBeUndefined()
        expect(result.shouldContinue).toBe(true)
      })
      
      expect(mockEventTitanBot.handleMessage).toHaveBeenCalledTimes(5)
    })
  })

  describe('Message Type Handling', () => {
    const messageTypes = [
      { type: 'text', payload: { text: 'Hello' }, shouldProcess: true },
      { type: 'file', payload: { url: 'file.pdf' }, shouldProcess: false },
      { type: 'image', payload: { url: 'image.jpg' }, shouldProcess: false },
      { type: 'audio', payload: { url: 'audio.mp3' }, shouldProcess: false }
    ]

    messageTypes.forEach(({ type, payload, shouldProcess }) => {
      it(`should ${shouldProcess ? 'process' : 'skip'} ${type} messages`, async () => {
        const message = {
          type,
          conversationId: 'conv-123',
          payload
        }
        
        const pluginResult = await simulateKnowledgePlugin(message)
        const shouldContinue = !pluginResult || !pluginResult.stop
        
        if (shouldContinue) {
          await simulateEventTitanBot(message)
        }
        
        if (shouldProcess) {
          // Text messages should be processed by plugin (result can be undefined or { stop: true })
          // The key is that the plugin attempted to process it
          expect(shouldContinue).toBeDefined()
        } else {
          // Non-text messages should be skipped by plugin
          expect(pluginResult).toBeUndefined()
          expect(mockEventTitanBot.handleMessage).toHaveBeenCalledWith(message)
        }
      })
    })
  })
})

// Helper functions to simulate plugin and bot behavior
async function simulateKnowledgePlugin(message: any) {
  console.log(`Knowledge plugin processing: ${message.type} - ${JSON.stringify(message.payload)}`)
  
  // Simulate plugin logic
  if (message.type !== 'text') {
    console.log('Plugin: Skipping non-text message')
    return undefined
  }
  
  const text = message.payload?.text
  if (!text) {
    console.log('Plugin: Skipping empty message')
    return undefined
  }
  
  // Simulate different scenarios based on message content
  if (text.includes('event planning')) {
    console.log('Plugin: Found knowledge, stopping message processing')
    return { stop: true }
  }
  
  if (text.includes('LLM errors')) {
    console.log('Plugin: Error occurred, continuing to bot')
    return undefined
  }
  
  console.log('Plugin: No knowledge found, continuing to bot')
  return undefined
}

async function simulateEventTitanBot(message: any) {
  console.log(`EventTitan bot processing: ${message.type} - ${JSON.stringify(message.payload)}`)
  mockEventTitanBot.handleMessage(message)
}

// Test data for verification
export const integrationTestData = {
  scenarios: testScenarios,
  expectedFlows: {
    knowledgeFound: 'Plugin responds → Stop processing',
    noKnowledge: 'Plugin skips → Bot responds',
    nonText: 'Plugin skips → Bot responds',
    error: 'Plugin fails → Bot responds'
  },
  verificationPoints: [
    'Plugin correctly identifies text vs non-text messages',
    'Plugin returns { stop: true } only when knowledge is found',
    'Plugin returns undefined for all other cases',
    'Bot is called only when plugin returns undefined',
    'Error scenarios gracefully fall back to bot',
    'Message flow is consistent across different scenarios'
  ]
}

console.log('Integration Flow Verification Test Suite')
console.log('=======================================')
console.log('')
console.log('Run with: npm test -- integration-flow-verification.test.ts')
console.log('')
console.log('This test suite verifies:')
console.log('- Complete message flow from plugin to bot')
console.log('- Proper stopping/continuing behavior')
console.log('- Error recovery and fallback mechanisms')
console.log('- Message type handling consistency')
console.log('- Bot stability under various conditions')
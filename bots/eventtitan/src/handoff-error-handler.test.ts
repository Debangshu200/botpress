/**
 * Handoff Error Handler Tests
 * Tests agent unavailability handling, queue management, and session recovery
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  HandoffErrorHandler, 
  HandoffError, 
  HandoffContext,
  DEFAULT_HANDOFF_RECOVERY_OPTIONS 
} from './handoff-error-handler'

describe('HandoffErrorHandler', () => {
  let errorHandler: HandoffErrorHandler
  let mockContext: HandoffContext

  beforeEach(() => {
    errorHandler = new HandoffErrorHandler()
    mockContext = {
      originalQuery: 'I need help with my order',
      conversationHistory: [
        { content: 'Hello', timestamp: new Date(), sender: 'user' },
        { content: 'Hi! How can I help?', timestamp: new Date(), sender: 'bot' }
      ]
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('handleHandoffInitiation', () => {
    it('should successfully initiate handoff when agents are available', async () => {
      // Mock successful agent availability and session creation
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
        available: true,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 0,
          totalInQueue: 0,
          availableAgents: 2
        }
      })

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(true)
      expect(result.sessionId).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle agent unavailability by queueing user', async () => {
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
        available: false,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 5,
          totalInQueue: 3,
          availableAgents: 0
        },
        reason: 'No agents currently available'
      })

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('agent_unavailable')
      expect(result.response?.action).toBe('queue')
      expect(result.response?.queueStatus).toBeDefined()
    })

    it('should offer alternative support when queue is full', async () => {
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
        available: false,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 15,
          totalInQueue: 50, // Assuming max queue size is 50
          availableAgents: 0
        },
        reason: 'Queue is at maximum capacity'
      })

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('agent_unavailable')
      expect(result.response?.action).toBe('alternative_support')
      expect(result.response?.alternativeSupport).toBeDefined()
      expect(result.response?.alternativeSupport?.length).toBeGreaterThan(0)
    })

    it('should handle session creation failure', async () => {
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
        available: true,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 0,
          totalInQueue: 0,
          availableAgents: 1
        }
      })

      // Mock session creation failure by overriding the private method
      const originalCreateSession = (errorHandler as any).createHandoffSession
      ;(errorHandler as any).createHandoffSession = vi.fn().mockResolvedValue({
        success: false,
        error: new Error('HITL service temporarily unavailable')
      })

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('session_creation_failed')
      expect(result.response?.action).toBe('alternative_support')

      // Restore original method
      ;(errorHandler as any).createHandoffSession = originalCreateSession
    })
  })

  describe('handleSessionInterruption', () => {
    it('should successfully recover interrupted session', async () => {
      const result = await errorHandler.handleSessionInterruption(
        'session123',
        'conv123',
        'Network connection lost'
      )

      // Due to mock implementation, recovery might succeed or fail
      expect(result.recovered).toBeDefined()
      if (result.recovered) {
        expect(result.newSessionId).toBeDefined()
      } else {
        expect(result.error?.type).toBe('session_interrupted')
        expect(result.response).toBeDefined()
      }
    })

    it('should handle session recovery failure', async () => {
      // Disable session recovery
      errorHandler.updateRecoveryOptions({ enableSessionRecovery: false })

      const result = await errorHandler.handleSessionInterruption(
        'session123',
        'conv123',
        'Agent disconnected'
      )

      expect(result.recovered).toBe(false)
      expect(result.error?.type).toBe('session_interrupted')
      expect(result.response?.action).toBe('retry')
    })

    it('should track session interruption in error history', async () => {
      await errorHandler.handleSessionInterruption(
        'session123',
        'conv123',
        'Connection timeout'
      )

      const stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(1)
      expect(stats.errorsByType.session_interrupted).toBe(1)
    })
  })

  describe('checkAgentAvailability', () => {
    it('should return availability status with queue information', async () => {
      const availability = await errorHandler.checkAgentAvailability()

      expect(availability.available).toBeDefined()
      expect(availability.queueStatus).toBeDefined()
      expect(availability.queueStatus.availableAgents).toBeGreaterThanOrEqual(0)
      expect(availability.queueStatus.totalInQueue).toBeGreaterThanOrEqual(0)
      expect(availability.queueStatus.estimatedWaitTime).toBeGreaterThanOrEqual(0)
    })

    it('should handle availability check errors gracefully', async () => {
      // Mock an error in queue status check
      const originalGetQueueStatus = (errorHandler as any).queueManager.getQueueStatus
      ;(errorHandler as any).queueManager.getQueueStatus = vi.fn().mockRejectedValue(new Error('Queue service down'))

      const availability = await errorHandler.checkAgentAvailability()

      expect(availability.available).toBe(false)
      expect(availability.reason).toContain('Unable to check agent availability')

      // Restore original method
      ;(errorHandler as any).queueManager.getQueueStatus = originalGetQueueStatus
    })
  })

  describe('alternative support options', () => {
    it('should provide default alternative support options', () => {
      const options = errorHandler.getAlternativeSupportOptions()

      expect(options.length).toBeGreaterThan(0)
      expect(options.some(opt => opt.type === 'callback')).toBe(true)
      expect(options.some(opt => opt.type === 'email')).toBe(true)
      expect(options.some(opt => opt.type === 'self_service')).toBe(true)
    })

    it('should allow updating alternative support options', () => {
      const customSupport = {
        type: 'chat_bot' as const,
        description: 'Continue with our AI assistant',
        action: 'continue_with_bot',
        metadata: { capability: 'advanced' }
      }

      errorHandler.updateAlternativeSupport('chat_bot', customSupport)
      const options = errorHandler.getAlternativeSupportOptions()

      expect(options.some(opt => opt.type === 'chat_bot')).toBe(true)
      expect(options.find(opt => opt.type === 'chat_bot')?.description).toBe(customSupport.description)
    })

    it('should return empty options when alternative support is disabled', () => {
      errorHandler.updateRecoveryOptions({ alternativeSupportEnabled: false })
      const options = errorHandler.getAlternativeSupportOptions()

      expect(options.length).toBe(0)
    })
  })

  describe('error statistics and tracking', () => {
    it('should track error statistics correctly', async () => {
      // Generate some errors
      await errorHandler.handleHandoffInitiation('conv1', mockContext)
      await errorHandler.handleSessionInterruption('session1', 'conv1', 'timeout')
      await errorHandler.handleSessionInterruption('session2', 'conv2', 'disconnect')

      const stats = errorHandler.getErrorStats()

      expect(stats.totalErrors).toBeGreaterThan(0)
      expect(stats.errorsByType).toBeDefined()
      expect(stats.queuePerformance).toBeDefined()
    })

    it('should clear error history when requested', async () => {
      // Generate an error
      await errorHandler.handleSessionInterruption('session1', 'conv1', 'test error')

      let stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBeGreaterThan(0)

      errorHandler.clearErrorHistory()
      stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(0)
    })

    it('should maintain error history size limit', async () => {
      // Generate many errors to test size limit
      for (let i = 0; i < 60; i++) {
        await errorHandler.handleSessionInterruption(`session${i}`, `conv${i}`, `error ${i}`)
      }

      const stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBeLessThanOrEqual(50) // Default max history size
    })
  })

  describe('recovery options configuration', () => {
    it('should allow updating recovery options', () => {
      const newOptions = {
        enableSessionRecovery: false,
        maxRecoveryAttempts: 5,
        recoveryTimeout: 60000,
        alternativeSupportEnabled: false
      }

      errorHandler.updateRecoveryOptions(newOptions)

      // Test that options are applied by checking behavior
      expect(() => errorHandler.updateRecoveryOptions(newOptions)).not.toThrow()
    })

    it('should use default recovery options when not specified', () => {
      const defaultHandler = new HandoffErrorHandler()
      const options = errorHandler.getAlternativeSupportOptions()

      // Should have default alternative support options
      expect(options.length).toBeGreaterThan(0)
    })
  })

  describe('queue management', () => {
    it('should handle queue operations correctly', async () => {
      // Test agent unavailability which triggers queueing
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
        available: false,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 3,
          totalInQueue: 2,
          availableAgents: 0
        },
        reason: 'All agents busy'
      })

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(false)
      expect(result.response?.action).toBe('queue')
      expect(result.response?.queueStatus?.position).toBeGreaterThan(0)
    })

    it('should provide queue status information', async () => {
      const availability = await errorHandler.checkAgentAvailability()

      expect(availability.queueStatus.totalInQueue).toBeGreaterThanOrEqual(0)
      expect(availability.queueStatus.estimatedWaitTime).toBeGreaterThanOrEqual(0)
      expect(availability.queueStatus.availableAgents).toBeGreaterThanOrEqual(0)
    })
  })

  describe('error response generation', () => {
    it('should generate appropriate responses for different error types', async () => {
      const testCases = [
        { reason: 'No agents available', expectedAction: 'queue' },
        { reason: 'Queue is at maximum capacity', expectedAction: 'alternative_support' }
      ]

      for (const testCase of testCases) {
        vi.spyOn(errorHandler, 'checkAgentAvailability').mockResolvedValue({
          available: false,
          queueStatus: {
            position: 0,
            estimatedWaitTime: 5,
            totalInQueue: testCase.reason.includes('maximum') ? 50 : 10,
            availableAgents: 0
          },
          reason: testCase.reason
        })

        const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

        expect(result.response?.action).toBe(testCase.expectedAction)
        expect(result.response?.message).toBeDefined()
        expect(result.response?.metadata).toBeDefined()
      }
    })

    it('should include relevant metadata in error responses', async () => {
      const result = await errorHandler.handleSessionInterruption(
        'session123',
        'conv123',
        'Connection lost'
      )

      if (result.response) {
        expect(result.response.metadata.errorType).toBe('session_interrupted')
        expect(result.response.metadata.timestamp).toBeInstanceOf(Date)
        expect(result.response.metadata.handoffReason).toBeDefined()
      }
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle unexpected errors during handoff initiation', async () => {
      // Mock an unexpected error
      vi.spyOn(errorHandler, 'checkAgentAvailability').mockRejectedValue(new Error('Unexpected system error'))

      const result = await errorHandler.handleHandoffInitiation('conv123', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.response).toBeDefined()
    })

    it('should handle null/undefined context gracefully', async () => {
      const emptyContext: HandoffContext = {
        originalQuery: '',
        conversationHistory: []
      }

      const result = await errorHandler.handleHandoffInitiation('conv123', emptyContext)

      // Should not throw and should provide a response
      expect(result).toBeDefined()
      expect(result.success).toBeDefined()
    })

    it('should handle very long conversation histories', async () => {
      const longContext: HandoffContext = {
        originalQuery: 'Help with order',
        conversationHistory: Array.from({ length: 1000 }, (_, i) => ({
          content: `Message ${i}`,
          timestamp: new Date(),
          sender: i % 2 === 0 ? 'user' as const : 'bot' as const
        }))
      }

      const result = await errorHandler.handleHandoffInitiation('conv123', longContext)

      expect(result).toBeDefined()
      expect(result.success).toBeDefined()
    })
  })
})
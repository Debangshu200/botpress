import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HandoffManager, HandoffContext, Message } from './handoff-manager'

describe('HandoffManager', () => {
  let handoffManager: HandoffManager
  let mockClient: any

  const mockConfig = {
    enabled: true,
    agentTimeout: 30000,
    queueLimit: 10
  }

  const mockContext: HandoffContext = {
    originalQuery: 'How do I reset my password?',
    searchResults: [
      {
        content: 'Password reset instructions...',
        score: 0.8,
        source: 'knowledge-base',
        metadata: { docId: '123' }
      }
    ],
    conversationHistory: [
      {
        id: 'msg1',
        type: 'text',
        content: 'How do I reset my password?',
        timestamp: new Date(),
        source: 'user',
        userId: 'user123'
      }
    ],
    confidence: 0.3,
    timestamp: new Date()
  }

  beforeEach(() => {
    handoffManager = new HandoffManager(mockConfig)
    mockClient = {
      callAction: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initiateHandoff', () => {
    it('should successfully initiate handoff when enabled and agents available', async () => {
      // Mock successful HITL response
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(true)
      expect(result.sessionId).toBeDefined()
      expect(result.conversationId).toBe('hitl-conv-123')
      expect(mockClient.callAction).toHaveBeenCalledWith({
        type: 'hitl:startHitl',
        input: {
          userId: 'user123',
          title: 'Support Request: How do I reset my password?...',
          description: expect.stringContaining('User Query: How do I reset my password?'),
          messageHistory: expect.arrayContaining([
            expect.objectContaining({
              source: { type: 'user', userId: 'user123' },
              type: 'text',
              payload: { text: 'How do I reset my password?' }
            })
          ])
        }
      })
    })

    it('should fail when handoff is disabled', async () => {
      const disabledManager = new HandoffManager({ ...mockConfig, enabled: false })

      const result = await disabledManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Human handoff is currently disabled')
      expect(mockClient.callAction).not.toHaveBeenCalled()
    })

    it('should fail when there is already an active session', async () => {
      // First handoff
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      await handoffManager.initiateHandoff('conv123', 'user123', mockContext, mockClient)

      // Second handoff attempt
      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user456',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Handoff session already active for this conversation')
    })

    it('should fail when agents are not available', async () => {
      // Fill up the queue to capacity
      const promises = []
      for (let i = 0; i < mockConfig.queueLimit; i++) {
        mockClient.callAction.mockResolvedValue({
          output: { conversationId: `hitl-conv-${i}` }
        })
        promises.push(
          handoffManager.initiateHandoff(`conv${i}`, `user${i}`, mockContext, mockClient)
        )
      }
      await Promise.all(promises)

      // Try to add one more
      const result = await handoffManager.initiateHandoff(
        'conv999',
        'user999',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('No agents currently available')
      expect(result.estimatedWaitTime).toBeGreaterThan(0)
    })

    it('should handle HITL service errors gracefully', async () => {
      mockClient.callAction.mockRejectedValue(new Error('HITL service unavailable'))

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('HITL service unavailable')
    })

    it('should handle HITL response without conversationId', async () => {
      mockClient.callAction.mockResolvedValue({
        output: {} // No conversationId
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to create HITL session')
    })
  })

  describe('checkAgentAvailability', () => {
    it('should return available when queue is not full', async () => {
      const availability = await handoffManager.checkAgentAvailability()

      expect(availability.available).toBe(true)
      expect(availability.queueLength).toBe(0)
    })

    it('should return unavailable when queue is full', async () => {
      // Fill up the queue
      const promises = []
      for (let i = 0; i < mockConfig.queueLimit; i++) {
        mockClient.callAction.mockResolvedValue({
          output: { conversationId: `hitl-conv-${i}` }
        })
        promises.push(
          handoffManager.initiateHandoff(`conv${i}`, `user${i}`, mockContext, mockClient)
        )
      }
      await Promise.all(promises)

      const availability = await handoffManager.checkAgentAvailability()

      expect(availability.available).toBe(false)
      expect(availability.queueLength).toBe(mockConfig.queueLimit)
      expect(availability.estimatedWaitTime).toBeGreaterThan(0)
    })
  })

  describe('transferContext', () => {
    it('should successfully transfer additional context to existing session', async () => {
      // Create a session first
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      const sessionId = result.sessionId!
      const additionalContext = {
        userProfile: {
          id: 'user123',
          name: 'John Doe',
          email: 'john@example.com'
        }
      }

      await handoffManager.transferContext(sessionId, additionalContext)

      const session = handoffManager.getSessionStatus(sessionId)
      expect(session?.context.userProfile).toEqual(additionalContext.userProfile)
      expect(session?.metadata.lastContextUpdate).toBeDefined()
    })

    it('should throw error for non-existent session', async () => {
      await expect(
        handoffManager.transferContext('non-existent', {})
      ).rejects.toThrow('Session non-existent not found')
    })
  })

  describe('endHandoff', () => {
    it('should successfully end handoff session', async () => {
      // Create a session first
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      const sessionId = result.sessionId!

      // Mock stopHitl success
      mockClient.callAction.mockResolvedValue({})

      await handoffManager.endHandoff(sessionId, mockClient, 'completed')

      expect(mockClient.callAction).toHaveBeenCalledWith({
        type: 'hitl:stopHitl',
        input: {
          conversationId: 'hitl-conv-123'
        }
      })

      const session = handoffManager.getSessionStatus(sessionId)
      expect(session?.status).toBe('completed')
      expect(session?.endTime).toBeDefined()
    })

    it('should handle stopHitl errors gracefully', async () => {
      // Create a session first
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      const sessionId = result.sessionId!

      // Mock stopHitl failure
      mockClient.callAction.mockRejectedValue(new Error('Stop HITL failed'))

      await expect(
        handoffManager.endHandoff(sessionId, mockClient, 'completed')
      ).rejects.toThrow('Stop HITL failed')

      const session = handoffManager.getSessionStatus(sessionId)
      expect(session?.status).toBe('failed')
      expect(session?.endTime).toBeDefined()
    })

    it('should throw error for non-existent session', async () => {
      await expect(
        handoffManager.endHandoff('non-existent', mockClient)
      ).rejects.toThrow('Session non-existent not found')
    })
  })

  describe('getSessionStatus', () => {
    it('should return session status for existing session', async () => {
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      const session = handoffManager.getSessionStatus(result.sessionId!)
      expect(session).toBeDefined()
      expect(session?.id).toBe(result.sessionId)
      expect(session?.status).toBe('active')
    })

    it('should return null for non-existent session', () => {
      const session = handoffManager.getSessionStatus('non-existent')
      expect(session).toBeNull()
    })
  })

  describe('getActiveSessions', () => {
    it('should return only active and pending sessions', async () => {
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      // Create active session
      const result1 = await handoffManager.initiateHandoff(
        'conv1',
        'user1',
        mockContext,
        mockClient
      )

      // Create another active session
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-456' }
      })
      const result2 = await handoffManager.initiateHandoff(
        'conv2',
        'user2',
        mockContext,
        mockClient
      )

      // End one session
      mockClient.callAction.mockResolvedValue({})
      await handoffManager.endHandoff(result1.sessionId!, mockClient, 'completed')

      const activeSessions = handoffManager.getActiveSessions()
      expect(activeSessions).toHaveLength(1)
      expect(activeSessions[0].id).toBe(result2.sessionId)
    })
  })

  describe('cleanupExpiredSessions', () => {
    it('should mark expired sessions as cancelled', async () => {
      // Create manager with very short timeout
      const shortTimeoutManager = new HandoffManager({
        ...mockConfig,
        agentTimeout: 100 // 100ms
      })

      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      const result = await shortTimeoutManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      shortTimeoutManager.cleanupExpiredSessions()

      const session = shortTimeoutManager.getSessionStatus(result.sessionId!)
      expect(session?.status).toBe('cancelled')
      expect(session?.endTime).toBeDefined()
    })
  })

  describe('message history formatting', () => {
    it('should format message history correctly for HITL', async () => {
      const contextWithMultipleMessages: HandoffContext = {
        ...mockContext,
        conversationHistory: [
          {
            id: 'msg1',
            type: 'text',
            content: 'Hello',
            timestamp: new Date(),
            source: 'user',
            userId: 'user123'
          },
          {
            id: 'msg2',
            type: 'text',
            content: 'Hi there! How can I help?',
            timestamp: new Date(),
            source: 'bot'
          },
          {
            id: 'msg3',
            type: 'text',
            content: 'How do I reset my password?',
            timestamp: new Date(),
            source: 'user',
            userId: 'user123'
          }
        ]
      }

      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        contextWithMultipleMessages,
        mockClient
      )

      expect(mockClient.callAction).toHaveBeenCalledWith({
        type: 'hitl:startHitl',
        input: expect.objectContaining({
          messageHistory: [
            {
              source: { type: 'user', userId: 'user123' },
              type: 'text',
              payload: { text: 'Hello' }
            },
            {
              source: { type: 'bot' },
              type: 'text',
              payload: { text: 'Hi there! How can I help?' }
            },
            {
              source: { type: 'user', userId: 'user123' },
              type: 'text',
              payload: { text: 'How do I reset my password?' }
            }
          ]
        })
      })
    })
  })

  describe('handoff description creation', () => {
    it('should create comprehensive handoff description', async () => {
      mockClient.callAction.mockResolvedValue({
        output: { conversationId: 'hitl-conv-123' }
      })

      await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      const callArgs = mockClient.callAction.mock.calls[0][0]
      const description = callArgs.input.description

      expect(description).toContain('User Query: How do I reset my password?')
      expect(description).toContain('Bot Confidence: 30.0%')
      expect(description).toContain('Knowledge Base Search Results:')
      expect(description).toContain('Password reset instructions...')
      expect(description).toContain('Conversation started at:')
    })
  })
})
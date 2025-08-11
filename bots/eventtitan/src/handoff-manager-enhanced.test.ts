import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HandoffManager, HandoffContext, Message } from './handoff-manager'

describe('HandoffManager Enhanced Features', () => {
  let handoffManager: HandoffManager
  let mockClient: any

  const mockConfig = {
    enabled: true,
    agentTimeout: 30 * 60 * 1000, // 30 minutes
    queueLimit: 10,
    recordingEnabled: true,
    autoAssignment: true,
    notificationSettings: {
      userNotifications: true,
      agentNotifications: true,
      statusUpdates: true
    }
  }

  const mockContext: HandoffContext = {
    originalQuery: 'How do I reset my password?',
    searchResults: [
      {
        content: 'To reset your password, go to the login page and click "Forgot Password"',
        score: 0.85,
        source: 'help-docs',
        metadata: { section: 'authentication' }
      }
    ],
    conversationHistory: [
      {
        id: 'msg1',
        type: 'text',
        content: 'Hello',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        source: 'user',
        userId: 'user123'
      },
      {
        id: 'msg2',
        type: 'text',
        content: 'Hi there! How can I help?',
        timestamp: new Date('2024-01-01T10:00:01Z'),
        source: 'bot'
      },
      {
        id: 'msg3',
        type: 'text',
        content: 'How do I reset my password?',
        timestamp: new Date('2024-01-01T10:00:02Z'),
        source: 'user',
        userId: 'user123'
      }
    ],
    confidence: 0.3,
    timestamp: new Date('2024-01-01T10:00:00Z'),
    failureReason: 'Low confidence in bot response',
    botCapabilities: ['Knowledge Base Search', 'Password Reset Help']
  }

  beforeEach(() => {
    handoffManager = new HandoffManager(mockConfig)
    
    // Create a mock client that simulates HITL plugin availability
    mockClient = {
      callAction: vi.fn()
    }
  })

  describe('HITL Plugin Availability Detection', () => {
    it('should detect when HITL plugin is not available', async () => {
      // Mock client that doesn't have HITL actions
      const unavailableClient = {
        callAction: vi.fn().mockRejectedValue(new Error('Action not found'))
      }

      const availability = await handoffManager.checkHITLPluginAvailability(unavailableClient)

      expect(availability.available).toBe(false)
      expect(availability.configured).toBe(false)
      expect(availability.actions.startHitl).toBe(false)
      expect(availability.actions.stopHitl).toBe(false)
      expect(availability.error).toContain('HITL plugin actions not available')
    })

    it('should detect when HITL plugin is available', async () => {
      // Mock client that has HITL actions (validation errors indicate action exists)
      mockClient.callAction
        .mockRejectedValueOnce(new Error('validation failed: userId is required'))
        .mockRejectedValueOnce(new Error('validation failed: conversationId is required'))
        .mockRejectedValueOnce(new Error('validation failed: name is required'))

      const availability = await handoffManager.checkHITLPluginAvailability(mockClient)

      expect(availability.available).toBe(true)
      expect(availability.configured).toBe(true)
      expect(availability.actions.startHitl).toBe(true)
      expect(availability.actions.stopHitl).toBe(true)
      expect(availability.actions.createUser).toBe(true)
      expect(availability.error).toBeUndefined()
    })
  })

  describe('Enhanced Context Transfer', () => {
    it('should enrich context with conversation analysis', async () => {
      // Mock successful HITL plugin availability
      mockClient.callAction
        .mockRejectedValueOnce(new Error('validation failed: userId is required'))
        .mockRejectedValueOnce(new Error('validation failed: conversationId is required'))
        .mockRejectedValueOnce(new Error('validation failed: name is required'))
        .mockResolvedValueOnce({ output: { conversationId: 'hitl-conv-123' } })

      const result = await handoffManager.initiateHandoff(
        'conv123',
        'user123',
        mockContext,
        mockClient
      )

      expect(result.success).toBe(true)
      expect(result.sessionId).toBeDefined()

      // Verify that the session was created with enriched context
      const session = handoffManager.getSessionStatus(result.sessionId!)
      expect(session).toBeDefined()
      expect(session?.context.botCapabilities).toContain('Knowledge Base Search')
      expect(session?.metadata.conversationAnalysis).toBeDefined()
      expect(session?.metadata.userSentiment).toBeDefined()
      expect(session?.metadata.keyTopics).toBeDefined()
    })
  })

  describe('Agent Availability with Caching', () => {
    it('should cache availability results', async () => {
      // First call
      const availability1 = await handoffManager.checkAgentAvailability(mockClient)
      
      // Second call should use cached result
      const availability2 = await handoffManager.checkAgentAvailability(mockClient)

      expect(availability1.lastChecked).toEqual(availability2.lastChecked)
      expect(mockClient.callAction).toHaveBeenCalledTimes(3) // Only for HITL availability check
    })

    it('should estimate active agents based on time of day', async () => {
      const availability = await handoffManager.checkAgentAvailability(mockClient)

      expect(availability.activeAgents).toBeGreaterThan(0)
      expect(availability.queueLength).toBeDefined()
      expect(availability.lastChecked).toBeDefined()
    })
  })

  describe('Queue Management', () => {
    it('should calculate queue position correctly', async () => {
      // Mock successful HITL plugin availability
      mockClient.callAction
        .mockRejectedValue(new Error('validation failed: userId is required'))
        .mockResolvedValue({ output: { conversationId: 'hitl-conv-123' } })

      // Create first session
      const result1 = await handoffManager.initiateHandoff(
        'conv1',
        'user1',
        mockContext,
        mockClient
      )

      // Create second session
      const result2 = await handoffManager.initiateHandoff(
        'conv2',
        'user2',
        mockContext,
        mockClient
      )

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)

      // Check queue positions
      const position1 = handoffManager.getQueuePosition(result1.sessionId!)
      const position2 = handoffManager.getQueuePosition(result2.sessionId!)

      expect(position1).toBe(1)
      expect(position2).toBe(2)
    })

    it('should update queue status for all pending sessions', async () => {
      // Mock successful HITL plugin availability
      mockClient.callAction
        .mockRejectedValue(new Error('validation failed: userId is required'))
        .mockResolvedValue({ output: { conversationId: 'hitl-conv-123' } })

      // Create multiple sessions
      const result1 = await handoffManager.initiateHandoff('conv1', 'user1', mockContext, mockClient)
      const result2 = await handoffManager.initiateHandoff('conv2', 'user2', mockContext, mockClient)

      // Update queue status
      await handoffManager.updateQueueStatus(mockClient)

      // Check that sessions have updated queue information
      const session1 = handoffManager.getSessionStatus(result1.sessionId!)
      const session2 = handoffManager.getSessionStatus(result2.sessionId!)

      expect(session1?.metadata.queuePosition).toBeDefined()
      expect(session2?.metadata.queuePosition).toBeDefined()
      expect(session1?.metadata.lastQueueUpdate).toBeDefined()
      expect(session2?.metadata.lastQueueUpdate).toBeDefined()
    })
  })

  describe('Configuration Validation', () => {
    it('should validate required configuration parameters', () => {
      expect(() => {
        new HandoffManager({
          enabled: 'true' as any, // Invalid type
          agentTimeout: 30000,
          queueLimit: 10
        })
      }).toThrow('enabled must be a boolean')

      expect(() => {
        new HandoffManager({
          enabled: true,
          agentTimeout: -1, // Invalid value
          queueLimit: 10
        })
      }).toThrow('agentTimeout must be a positive number')

      expect(() => {
        new HandoffManager({
          enabled: true,
          agentTimeout: 30000,
          queueLimit: 0 // Invalid value
        })
      }).toThrow('queueLimit must be a positive number')
    })

    it('should use default values for optional configuration', () => {
      const manager = new HandoffManager({
        enabled: true,
        agentTimeout: 30000,
        queueLimit: 10
      })

      // Should not throw and should have default values
      expect(manager).toBeDefined()
    })
  })
})
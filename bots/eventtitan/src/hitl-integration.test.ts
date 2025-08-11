import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HandoffManager } from './handoff-manager'

describe('HITL Integration Test', () => {
  let handoffManager: HandoffManager
  let mockClient: any

  beforeEach(() => {
    handoffManager = new HandoffManager({
      enabled: true,
      agentTimeout: 30000,
      queueLimit: 10,
      recordingEnabled: true
    })

    mockClient = {
      callAction: vi.fn()
    }
  })

  it('should detect HITL plugin availability', async () => {
    // Test when HITL plugin is available
    mockClient.callAction.mockResolvedValue({
      output: { conversationId: 'test-hitl-conversation-id' }
    })

    const handoffContext = {
      originalQuery: 'I need help with my event',
      searchResults: [],
      conversationHistory: [],
      confidence: 0.2,
      timestamp: new Date()
    }

    const result = await handoffManager.initiateHandoff(
      'test-conversation-id',
      'test-user-id',
      handoffContext,
      mockClient
    )

    expect(result.success).toBe(true)
    expect(result.sessionId).toBeDefined()
    expect(result.conversationId).toBe('test-hitl-conversation-id')
    expect(mockClient.callAction).toHaveBeenCalledWith({
      type: 'hitl:startHitl',
      input: expect.objectContaining({
        userId: 'test-user-id',
        title: expect.stringContaining('Support Request'),
        description: expect.stringContaining('User Query: I need help with my event'),
        messageHistory: []
      })
    })
  })

  it('should handle HITL plugin unavailability gracefully', async () => {
    // Test when HITL plugin is not available (no client)
    const handoffContext = {
      originalQuery: 'I need help with my event',
      searchResults: [],
      conversationHistory: [],
      confidence: 0.2,
      timestamp: new Date()
    }

    const result = await handoffManager.initiateHandoff(
      'test-conversation-id',
      'test-user-id',
      handoffContext,
      null // No client available
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('HITL integration is not available - human handoff is currently disabled')
  })

  it('should handle HITL action failures', async () => {
    // Test when HITL action fails
    mockClient.callAction.mockRejectedValue(new Error('HITL plugin not configured'))

    const handoffContext = {
      originalQuery: 'I need help with my event',
      searchResults: [],
      conversationHistory: [],
      confidence: 0.2,
      timestamp: new Date()
    }

    const result = await handoffManager.initiateHandoff(
      'test-conversation-id',
      'test-user-id',
      handoffContext,
      mockClient
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('HITL integration is not properly configured - human handoff is currently unavailable')
  })

  it('should check agent availability', async () => {
    const availability = await handoffManager.checkAgentAvailability()
    
    expect(availability).toHaveProperty('available')
    expect(availability).toHaveProperty('queueLength')
    expect(typeof availability.available).toBe('boolean')
    expect(typeof availability.queueLength).toBe('number')
  })

  it('should manage handoff sessions', async () => {
    // Mock successful HITL start
    mockClient.callAction.mockResolvedValue({
      output: { conversationId: 'test-hitl-conversation-id' }
    })

    const handoffContext = {
      originalQuery: 'I need help with my event',
      searchResults: [],
      conversationHistory: [],
      confidence: 0.2,
      timestamp: new Date()
    }

    const result = await handoffManager.initiateHandoff(
      'test-conversation-id',
      'test-user-id',
      handoffContext,
      mockClient
    )

    expect(result.success).toBe(true)
    
    // Check that session was created
    const activeSessions = handoffManager.getActiveSessions()
    expect(activeSessions).toHaveLength(1)
    expect(activeSessions[0].conversationId).toBe('test-conversation-id')
    expect(activeSessions[0].userId).toBe('test-user-id')
    expect(activeSessions[0].status).toBe('active')
  })
})
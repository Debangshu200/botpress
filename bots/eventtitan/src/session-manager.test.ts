import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SessionManager, SessionState, AgentInfo, QueueConfiguration } from './session-manager'
import { HandoffSession, HandoffContext } from './handoff-manager'

describe('SessionManager', () => {
  let sessionManager: SessionManager
  let mockConfig: QueueConfiguration
  let mockSession: HandoffSession
  let mockAgent: AgentInfo

  beforeEach(() => {
    mockConfig = {
      maxQueueSize: 10,
      priorityEnabled: true,
      timeoutDuration: 30000, // 30 seconds for testing
      maxRetries: 3,
      autoAssignmentEnabled: true,
      skillBasedRouting: false,
      loadBalancing: 'least_busy'
    }

    sessionManager = new SessionManager(mockConfig)

    mockSession = {
      id: 'session-123',
      conversationId: 'conv-123',
      userId: 'user-123',
      status: 'pending',
      startTime: new Date(),
      context: {
        originalQuery: 'Test query',
        searchResults: [],
        conversationHistory: [],
        timestamp: new Date()
      },
      recordingEnabled: true,
      metadata: {}
    }

    mockAgent = {
      id: 'agent-123',
      name: 'Test Agent',
      email: 'agent@test.com',
      status: 'online',
      currentSessions: 0,
      maxSessions: 5,
      skills: ['general', 'technical'],
      lastActivity: new Date(),
      averageResponseTime: 300000, // 5 minutes
      metadata: {}
    }
  })

  afterEach(() => {
    sessionManager.destroy()
    vi.clearAllMocks()
  })

  describe('Session Creation and Management', () => {
    it('should create a new session with default priority', async () => {
      await sessionManager.createSession('session-123', mockSession)

      const session = sessionManager.getSession('session-123')
      const sessionState = sessionManager.getSessionState('session-123')

      expect(session).toEqual(mockSession)
      expect(sessionState).toBeDefined()
      expect(sessionState?.status).toBe('pending')
      expect(sessionState?.priority).toBe('normal')
    })

    it('should create a session with high priority', async () => {
      await sessionManager.createSession('session-123', mockSession, 'high')

      const sessionState = sessionManager.getSessionState('session-123')
      expect(sessionState?.priority).toBe('high')
    })

    it('should update session state', async () => {
      await sessionManager.createSession('session-123', mockSession)

      await sessionManager.updateSessionState('session-123', {
        status: 'active',
        metadata: {
          sessionTags: ['urgent'],
          customFields: { department: 'technical' },
          previousAttempts: 0
        }
      })

      const sessionState = sessionManager.getSessionState('session-123')
      expect(sessionState?.status).toBe('active')
      expect(sessionState?.metadata.sessionTags).toContain('urgent')
      expect(sessionState?.metadata.customFields.department).toBe('technical')
    })

    it('should throw error when updating non-existent session', async () => {
      await expect(
        sessionManager.updateSessionState('non-existent', { status: 'active' })
      ).rejects.toThrow('Session state non-existent not found')
    })
  })

  describe('Agent Management', () => {
    it('should register an agent', () => {
      sessionManager.registerAgent(mockAgent)

      const availability = sessionManager.getAgentAvailability()
      expect(availability.available).toBe(true)
    })

    it('should update agent status', () => {
      sessionManager.registerAgent(mockAgent)
      sessionManager.updateAgentStatus('agent-123', 'busy')

      const availability = sessionManager.getAgentAvailability()
      // Agent with 'busy' status is not considered available for new assignments
      expect(availability.available).toBe(false)
    })

    it('should handle agent going offline', async () => {
      sessionManager.registerAgent(mockAgent)
      await sessionManager.createSession('session-123', mockSession)
      await sessionManager.assignAgent('session-123', 'agent-123')

      // Agent goes offline
      sessionManager.updateAgentStatus('agent-123', 'offline')

      const session = sessionManager.getSession('session-123')
      const sessionState = sessionManager.getSessionState('session-123')
      
      expect(session?.status).toBe('pending')
      expect(sessionState?.status).toBe('pending')
      expect(sessionState?.metadata.previousAttempts).toBe(1)
    })

    it('should throw error when updating non-existent agent', () => {
      expect(() => {
        sessionManager.updateAgentStatus('non-existent', 'online')
      }).toThrow('Agent non-existent not found')
    })
  })

  describe('Agent Assignment', () => {
    beforeEach(() => {
      sessionManager.registerAgent(mockAgent)
    })

    it('should assign agent to session', async () => {
      await sessionManager.createSession('session-123', mockSession)
      await sessionManager.assignAgent('session-123', 'agent-123')

      const session = sessionManager.getSession('session-123')
      const sessionState = sessionManager.getSessionState('session-123')

      expect(session?.agentId).toBe('agent-123')
      expect(session?.status).toBe('active')
      expect(sessionState?.status).toBe('active')
    })

    it('should automatically assign agent when creating session', async () => {
      await sessionManager.createSession('session-123', mockSession)

      const session = sessionManager.getSession('session-123')
      expect(session?.agentId).toBe('agent-123')
      expect(session?.status).toBe('active')
    })

    it('should throw error when assigning non-existent agent', async () => {
      await sessionManager.createSession('session-123', mockSession)

      await expect(
        sessionManager.assignAgent('session-123', 'non-existent')
      ).rejects.toThrow('Agent non-existent not found')
    })

    it('should throw error when assigning unavailable agent', async () => {
      // Make agent unavailable
      mockAgent.status = 'offline'
      sessionManager.registerAgent(mockAgent)
      await sessionManager.createSession('session-123', mockSession)

      await expect(
        sessionManager.assignAgent('session-123', 'agent-123')
      ).rejects.toThrow('Agent agent-123 is not available')
    })

    it('should throw error when agent is at max capacity', async () => {
      // Set agent to max capacity
      mockAgent.currentSessions = mockAgent.maxSessions
      sessionManager.registerAgent(mockAgent)
      await sessionManager.createSession('session-123', mockSession)

      await expect(
        sessionManager.assignAgent('session-123', 'agent-123')
      ).rejects.toThrow('Agent agent-123 is not available')
    })
  })

  describe('Queue Management', () => {
    it('should add session to queue when no agents available', async () => {
      // No agents registered
      await sessionManager.createSession('session-123', mockSession)

      const queueStatus = sessionManager.getQueueStatus()
      expect(queueStatus.length).toBe(1)
      expect(queueStatus.positions[0].sessionId).toBe('session-123')
      expect(queueStatus.positions[0].position).toBe(1)
    })

    it('should prioritize high priority sessions', async () => {
      // No agents available to force queueing
      await sessionManager.createSession('session-1', mockSession, 'normal')
      await sessionManager.createSession('session-2', { ...mockSession, id: 'session-2' }, 'high')
      await sessionManager.createSession('session-3', { ...mockSession, id: 'session-3' }, 'urgent')

      const queueStatus = sessionManager.getQueueStatus()
      expect(queueStatus.length).toBe(3)
      expect(queueStatus.positions[0].sessionId).toBe('session-3') // Urgent first
      expect(queueStatus.positions[1].sessionId).toBe('session-2') // High second
      expect(queueStatus.positions[2].sessionId).toBe('session-1') // Normal last
    })

    it('should process queue when agent becomes available', async () => {
      // Create sessions without agents
      await sessionManager.createSession('session-1', mockSession)
      await sessionManager.createSession('session-2', { ...mockSession, id: 'session-2' })

      expect(sessionManager.getQueueStatus().length).toBe(2)

      // Register agent - should process queue
      sessionManager.registerAgent(mockAgent)

      // Wait for queue processing (multiple cycles)
      await new Promise(resolve => setTimeout(resolve, 300))

      const queueStatus = sessionManager.getQueueStatus()
      expect(queueStatus.length).toBe(0) // Both sessions should be assigned since agent has capacity for 5
    })

    it('should calculate estimated wait times', async () => {
      sessionManager.registerAgent(mockAgent)
      
      // Fill agent capacity
      for (let i = 0; i < mockAgent.maxSessions; i++) {
        await sessionManager.createSession(`session-${i}`, { ...mockSession, id: `session-${i}` })
      }

      // Add one more to queue
      await sessionManager.createSession('queued-session', { ...mockSession, id: 'queued-session' })

      const queueStatus = sessionManager.getQueueStatus()
      expect(queueStatus.length).toBe(1)
      expect(queueStatus.estimatedWaitTime).toBeGreaterThan(0)
    })

    it('should reject sessions when queue is full', async () => {
      // Fill queue to capacity
      for (let i = 0; i < mockConfig.maxQueueSize; i++) {
        await sessionManager.createSession(`session-${i}`, { ...mockSession, id: `session-${i}` })
      }

      // Try to add one more
      await expect(
        sessionManager.createSession('overflow-session', { ...mockSession, id: 'overflow-session' })
      ).rejects.toThrow('Queue is full')
    })
  })

  describe('Session Ending', () => {
    beforeEach(() => {
      sessionManager.registerAgent(mockAgent)
    })

    it('should end session and free up agent', async () => {
      await sessionManager.createSession('session-123', mockSession)
      await sessionManager.assignAgent('session-123', 'agent-123')

      await sessionManager.endSession('session-123', 'completed')

      const session = sessionManager.getSession('session-123')
      const sessionState = sessionManager.getSessionState('session-123')

      expect(session?.status).toBe('completed')
      expect(session?.endTime).toBeDefined()
      expect(sessionState?.status).toBe('completed')

      // Agent should be freed up
      const availability = sessionManager.getAgentAvailability()
      expect(availability.available).toBe(true)
    })

    it('should process next session in queue after ending session', async () => {
      // Fill agent capacity
      for (let i = 0; i < mockAgent.maxSessions; i++) {
        await sessionManager.createSession(`session-${i}`, { ...mockSession, id: `session-${i}` })
      }

      // Add one to queue
      await sessionManager.createSession('queued-session', { ...mockSession, id: 'queued-session' })

      expect(sessionManager.getQueueStatus().length).toBe(1)

      // End one session
      await sessionManager.endSession('session-0', 'completed')

      // Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 150))

      const queueStatus = sessionManager.getQueueStatus()
      expect(queueStatus.length).toBe(0) // Queue should be empty
    })

    it('should throw error when ending non-existent session', async () => {
      await expect(
        sessionManager.endSession('non-existent', 'completed')
      ).rejects.toThrow('Session non-existent not found')
    })
  })

  describe('Load Balancing', () => {
    it('should use least busy agent for assignment', async () => {
      // Register two agents with different loads
      const agent1 = { ...mockAgent, id: 'agent-1', currentSessions: 2 }
      const agent2 = { ...mockAgent, id: 'agent-2', currentSessions: 1 }

      sessionManager.registerAgent(agent1)
      sessionManager.registerAgent(agent2)

      await sessionManager.createSession('session-123', mockSession)

      const session = sessionManager.getSession('session-123')
      expect(session?.agentId).toBe('agent-2') // Less busy agent
    })
  })

  describe('Cleanup and Timeouts', () => {
    it('should cleanup expired sessions', async () => {
      // Create session with short timeout config
      const shortTimeoutManager = new SessionManager({
        ...mockConfig,
        timeoutDuration: 100 // 100ms
      })

      await shortTimeoutManager.createSession('session-123', mockSession)

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      const cleanedUp = await shortTimeoutManager.cleanup()
      expect(cleanedUp).toBe(1)

      const session = shortTimeoutManager.getSession('session-123')
      expect(session).toBeNull()

      shortTimeoutManager.destroy()
    })

    it('should get active sessions', async () => {
      sessionManager.registerAgent(mockAgent)
      
      await sessionManager.createSession('session-1', mockSession)
      await sessionManager.createSession('session-2', { ...mockSession, id: 'session-2' })
      await sessionManager.endSession('session-1', 'completed')

      const activeSessions = sessionManager.getActiveSessions()
      expect(activeSessions).toHaveLength(1)
      expect(activeSessions[0].id).toBe('session-2')
    })
  })

  describe('Agent Availability', () => {
    it('should report no availability when no agents', () => {
      const availability = sessionManager.getAgentAvailability()
      expect(availability.available).toBe(false)
      expect(availability.queueLength).toBe(0)
    })

    it('should report availability when agents are online', () => {
      sessionManager.registerAgent(mockAgent)

      const availability = sessionManager.getAgentAvailability()
      expect(availability.available).toBe(true)
      expect(availability.queueLength).toBe(0)
    })

    it('should report no availability when all agents are busy', async () => {
      sessionManager.registerAgent(mockAgent)

      // Fill agent capacity
      for (let i = 0; i < mockAgent.maxSessions; i++) {
        await sessionManager.createSession(`session-${i}`, { ...mockSession, id: `session-${i}` })
      }

      // Add one more to queue
      await sessionManager.createSession('queued-session', { ...mockSession, id: 'queued-session' })

      const availability = sessionManager.getAgentAvailability()
      expect(availability.available).toBe(false)
      expect(availability.queueLength).toBe(1)
      expect(availability.estimatedWaitTime).toBeGreaterThan(0)
    })
  })

  describe('Session State Queries', () => {
    it('should return null for non-existent session', () => {
      const session = sessionManager.getSession('non-existent')
      const sessionState = sessionManager.getSessionState('non-existent')

      expect(session).toBeNull()
      expect(sessionState).toBeNull()
    })

    it('should return session and state for existing session', async () => {
      await sessionManager.createSession('session-123', mockSession)

      const session = sessionManager.getSession('session-123')
      const sessionState = sessionManager.getSessionState('session-123')

      expect(session).toBeDefined()
      expect(sessionState).toBeDefined()
      expect(session?.id).toBe('session-123')
      expect(sessionState?.id).toBe('session-123')
    })
  })

  describe('Configuration Handling', () => {
    it('should respect auto assignment setting', async () => {
      const noAutoAssignManager = new SessionManager({
        ...mockConfig,
        autoAssignmentEnabled: false
      })

      noAutoAssignManager.registerAgent(mockAgent)
      await noAutoAssignManager.createSession('session-123', mockSession)

      const session = noAutoAssignManager.getSession('session-123')
      expect(session?.agentId).toBeUndefined()
      expect(session?.status).toBe('pending')

      noAutoAssignManager.destroy()
    })

    it('should respect priority setting', async () => {
      const noPriorityManager = new SessionManager({
        ...mockConfig,
        priorityEnabled: false
      })

      // Create sessions with different priorities
      await noPriorityManager.createSession('session-1', mockSession, 'normal')
      await noPriorityManager.createSession('session-2', { ...mockSession, id: 'session-2' }, 'urgent')

      const queueStatus = noPriorityManager.getQueueStatus()
      // Without priority, should be in order of creation
      expect(queueStatus.positions[0].sessionId).toBe('session-1')
      expect(queueStatus.positions[1].sessionId).toBe('session-2')

      noPriorityManager.destroy()
    })
  })
})
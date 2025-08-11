import { HandoffSession, HandoffContext, AgentAvailability } from './handoff-manager'

// Extended interfaces for session management
export interface SessionState {
  id: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'failed' | 'timeout'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  queuePosition?: number
  estimatedWaitTime?: number
  lastActivity: Date
  metadata: SessionMetadata
}

export interface SessionMetadata {
  userAgent?: string
  ipAddress?: string
  referrer?: string
  sessionTags: string[]
  customFields: Record<string, any>
  escalationReason?: string
  previousAttempts: number
  lastError?: string
}

export interface AgentInfo {
  id: string
  name?: string
  email?: string
  status: 'online' | 'busy' | 'away' | 'offline'
  currentSessions: number
  maxSessions: number
  skills: string[]
  lastActivity: Date
  averageResponseTime: number
  metadata: Record<string, any>
}

export interface QueueConfiguration {
  maxQueueSize: number
  priorityEnabled: boolean
  timeoutDuration: number
  maxRetries: number
  autoAssignmentEnabled: boolean
  skillBasedRouting: boolean
  loadBalancing: 'round_robin' | 'least_busy' | 'skill_based'
}

export interface SessionPersistence {
  save(session: HandoffSession): Promise<void>
  load(sessionId: string): Promise<HandoffSession | null>
  loadAll(): Promise<HandoffSession[]>
  delete(sessionId: string): Promise<void>
  cleanup(olderThan: Date): Promise<number>
}

export class SessionManager {
  private sessions: Map<string, HandoffSession> = new Map()
  private sessionStates: Map<string, SessionState> = new Map()
  private agents: Map<string, AgentInfo> = new Map()
  private queue: string[] = [] // Session IDs in queue order
  private config: QueueConfiguration
  private persistence?: SessionPersistence
  private cleanupInterval?: NodeJS.Timeout

  constructor(
    config: QueueConfiguration,
    persistence?: SessionPersistence
  ) {
    this.config = config
    this.persistence = persistence
    
    // Start cleanup interval
    this.startCleanupInterval()
  }

  /**
   * Creates a new session with state tracking
   */
  async createSession(
    sessionId: string,
    session: HandoffSession,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
  ): Promise<void> {
    // Create session state
    const sessionState: SessionState = {
      id: sessionId,
      status: 'pending',
      priority,
      lastActivity: new Date(),
      metadata: {
        sessionTags: [],
        customFields: {},
        previousAttempts: 0
      }
    }

    // Store session and state
    this.sessions.set(sessionId, session)
    this.sessionStates.set(sessionId, sessionState)

    // Add to queue if not immediately assignable
    if (!await this.tryImmediateAssignment(sessionId)) {
      this.addToQueue(sessionId, priority)
    }

    // Persist if enabled
    if (this.persistence) {
      await this.persistence.save(session)
    }

    console.info('SessionManager: Session created', {
      sessionId,
      priority,
      queuePosition: sessionState.queuePosition
    })
  }

  /**
   * Updates session state
   */
  async updateSessionState(
    sessionId: string,
    updates: Partial<SessionState>
  ): Promise<void> {
    const sessionState = this.sessionStates.get(sessionId)
    if (!sessionState) {
      throw new Error(`Session state ${sessionId} not found`)
    }

    // Update state
    Object.assign(sessionState, updates, {
      lastActivity: new Date()
    })

    this.sessionStates.set(sessionId, sessionState)

    // Persist if enabled
    const session = this.sessions.get(sessionId)
    if (this.persistence && session) {
      await this.persistence.save(session)
    }

    console.info('SessionManager: Session state updated', {
      sessionId,
      status: sessionState.status,
      updates
    })
  }

  /**
   * Assigns an agent to a session
   */
  async assignAgent(sessionId: string, agentId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    const sessionState = this.sessionStates.get(sessionId)
    
    if (!session || !sessionState) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    if (agent.status !== 'online' || agent.currentSessions >= agent.maxSessions) {
      throw new Error(`Agent ${agentId} is not available`)
    }

    // Update session
    session.agentId = agentId
    session.status = 'active'

    // Update session state
    await this.updateSessionState(sessionId, {
      status: 'active'
    })

    // Update agent
    agent.currentSessions++
    agent.lastActivity = new Date()
    this.agents.set(agentId, agent)

    // Remove from queue
    this.removeFromQueue(sessionId)

    console.info('SessionManager: Agent assigned', {
      sessionId,
      agentId,
      agentSessions: agent.currentSessions
    })
  }

  /**
   * Ends a session and cleans up resources
   */
  async endSession(
    sessionId: string,
    reason: 'completed' | 'cancelled' | 'timeout' | 'failed' = 'completed'
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    const sessionState = this.sessionStates.get(sessionId)
    
    if (!session || !sessionState) {
      throw new Error(`Session ${sessionId} not found`)
    }

    // Update session
    session.status = reason === 'completed' ? 'completed' : 'cancelled'
    session.endTime = new Date()

    // Update session state
    await this.updateSessionState(sessionId, {
      status: reason === 'completed' ? 'completed' : reason
    })

    // Free up agent if assigned
    if (session.agentId) {
      const agent = this.agents.get(session.agentId)
      if (agent) {
        agent.currentSessions = Math.max(0, agent.currentSessions - 1)
        this.agents.set(session.agentId, agent)
      }
    }

    // Remove from queue if still there
    this.removeFromQueue(sessionId)

    // Try to assign next session in queue
    await this.processQueue()

    console.info('SessionManager: Session ended', {
      sessionId,
      reason,
      duration: session.endTime.getTime() - session.startTime.getTime()
    })
  }

  /**
   * Registers an agent
   */
  registerAgent(agent: AgentInfo): void {
    this.agents.set(agent.id, agent)
    
    // If agent is online, try to process queue
    if (agent.status === 'online') {
      setTimeout(() => this.processQueue(), 10)
    }
    
    console.info('SessionManager: Agent registered', {
      agentId: agent.id,
      status: agent.status,
      maxSessions: agent.maxSessions
    })
  }

  /**
   * Updates agent status
   */
  updateAgentStatus(
    agentId: string,
    status: 'online' | 'busy' | 'away' | 'offline'
  ): void {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    agent.status = status
    agent.lastActivity = new Date()
    this.agents.set(agentId, agent)

    // If agent went offline, handle their sessions
    if (status === 'offline') {
      this.handleAgentOffline(agentId)
    }

    // If agent came online, try to process queue
    if (status === 'online') {
      setTimeout(() => this.processQueue(), 10)
    }

    console.info('SessionManager: Agent status updated', {
      agentId,
      status,
      currentSessions: agent.currentSessions
    })
  }

  /**
   * Gets current queue status
   */
  getQueueStatus(): {
    length: number
    estimatedWaitTime: number
    positions: Array<{ sessionId: string; position: number; priority: string }>
  } {
    const positions = this.queue.map((sessionId, index) => {
      const sessionState = this.sessionStates.get(sessionId)
      return {
        sessionId,
        position: index + 1,
        priority: sessionState?.priority || 'normal'
      }
    })

    const estimatedWaitTime = this.calculateEstimatedWaitTime()

    return {
      length: this.queue.length,
      estimatedWaitTime,
      positions
    }
  }

  /**
   * Gets agent availability
   */
  getAgentAvailability(): AgentAvailability {
    const onlineAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'online')

    const availableCapacity = onlineAgents
      .reduce((total, agent) => total + (agent.maxSessions - agent.currentSessions), 0)

    const queueLength = this.queue.length

    return {
      available: availableCapacity > 0,
      queueLength,
      estimatedWaitTime: availableCapacity > 0 ? 0 : this.calculateEstimatedWaitTime()
    }
  }

  /**
   * Gets session information
   */
  getSession(sessionId: string): HandoffSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Gets session state
   */
  getSessionState(sessionId: string): SessionState | null {
    return this.sessionStates.get(sessionId) || null
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions(): HandoffSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'active' || session.status === 'pending')
  }

  /**
   * Performs cleanup of expired sessions
   */
  async cleanup(): Promise<number> {
    const now = new Date()
    const expiredSessions: string[] = []

    // Find expired sessions
    for (const [sessionId, sessionState] of this.sessionStates.entries()) {
      const sessionAge = now.getTime() - sessionState.lastActivity.getTime()
      
      if (sessionAge > this.config.timeoutDuration) {
        expiredSessions.push(sessionId)
      }
    }

    // Clean up expired sessions
    for (const sessionId of expiredSessions) {
      try {
        await this.endSession(sessionId, 'timeout')
        this.sessions.delete(sessionId)
        this.sessionStates.delete(sessionId)
      } catch (error) {
        console.error('SessionManager: Error cleaning up session', { sessionId, error })
      }
    }

    // Cleanup persistence if enabled
    if (this.persistence && expiredSessions.length > 0) {
      const cutoffDate = new Date(now.getTime() - this.config.timeoutDuration * 2)
      await this.persistence.cleanup(cutoffDate)
    }

    if (expiredSessions.length > 0) {
      console.info('SessionManager: Cleaned up expired sessions', {
        count: expiredSessions.length,
        sessionIds: expiredSessions
      })
    }

    return expiredSessions.length
  }

  /**
   * Destroys the session manager and cleans up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }

    this.sessions.clear()
    this.sessionStates.clear()
    this.agents.clear()
    this.queue.length = 0
  }

  // Private helper methods

  private async tryImmediateAssignment(sessionId: string): Promise<boolean> {
    if (!this.config.autoAssignmentEnabled) {
      return false
    }

    const availableAgent = this.findAvailableAgent(sessionId)
    if (availableAgent) {
      try {
        await this.assignAgent(sessionId, availableAgent.id)
        return true
      } catch (error) {
        console.warn('SessionManager: Failed immediate assignment', { sessionId, error })
      }
    }

    return false
  }

  private addToQueue(sessionId: string, priority: 'low' | 'normal' | 'high' | 'urgent'): void {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Queue is full')
    }

    // Insert based on priority if enabled
    if (this.config.priorityEnabled) {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
      const sessionPriority = priorityOrder[priority]

      let insertIndex = this.queue.length
      for (let i = 0; i < this.queue.length; i++) {
        const queuedSessionState = this.sessionStates.get(this.queue[i])
        if (queuedSessionState) {
          const queuedPriority = priorityOrder[queuedSessionState.priority]
          if (sessionPriority < queuedPriority) {
            insertIndex = i
            break
          }
        }
      }

      this.queue.splice(insertIndex, 0, sessionId)
    } else {
      this.queue.push(sessionId)
    }

    // Update queue positions
    this.updateQueuePositions()
  }

  private removeFromQueue(sessionId: string): void {
    const index = this.queue.indexOf(sessionId)
    if (index !== -1) {
      this.queue.splice(index, 1)
      this.updateQueuePositions()
    }
  }

  private updateQueuePositions(): void {
    this.queue.forEach((sessionId, index) => {
      const sessionState = this.sessionStates.get(sessionId)
      if (sessionState) {
        sessionState.queuePosition = index + 1
        sessionState.estimatedWaitTime = this.calculateEstimatedWaitTime(index + 1)
      }
    })
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return
    }

    const nextSessionId = this.queue[0]
    const availableAgent = this.findAvailableAgent(nextSessionId)

    if (availableAgent) {
      try {
        await this.assignAgent(nextSessionId, availableAgent.id)
        // Process next in queue
        setTimeout(() => this.processQueue(), 100)
      } catch (error) {
        console.error('SessionManager: Error processing queue', { nextSessionId, error })
      }
    }
  }

  private findAvailableAgent(sessionId: string): AgentInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    const availableAgents = Array.from(this.agents.values())
      .filter(agent => 
        agent.status === 'online' && 
        agent.currentSessions < agent.maxSessions
      )

    if (availableAgents.length === 0) {
      return null
    }

    // Apply load balancing strategy
    switch (this.config.loadBalancing) {
      case 'least_busy':
        return availableAgents.reduce((least, current) => 
          current.currentSessions < least.currentSessions ? current : least
        )
      
      case 'skill_based':
        // For now, just return the first available agent
        // In a real implementation, this would match agent skills to session requirements
        return availableAgents[0]
      
      case 'round_robin':
      default:
        // Simple round-robin: return first available
        return availableAgents[0]
    }
  }

  private calculateEstimatedWaitTime(position: number = this.queue.length): number {
    const onlineAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'online')

    if (onlineAgents.length === 0) {
      return position * 10 * 60 * 1000 // 10 minutes per position if no agents
    }

    const averageResponseTime = onlineAgents.reduce(
      (sum, agent) => sum + agent.averageResponseTime, 0
    ) / onlineAgents.length

    const averageSessionTime = Math.max(averageResponseTime, 5 * 60 * 1000) // Minimum 5 minutes
    
    return Math.ceil(position / onlineAgents.length) * averageSessionTime
  }

  private handleAgentOffline(agentId: string): void {
    // Find sessions assigned to this agent
    const affectedSessions = Array.from(this.sessions.entries())
      .filter(([_, session]) => session.agentId === agentId && session.status === 'active')

    // Re-queue these sessions
    affectedSessions.forEach(([sessionId, session]) => {
      session.agentId = undefined
      session.status = 'pending'
      
      const sessionState = this.sessionStates.get(sessionId)
      if (sessionState) {
        sessionState.status = 'pending'
        sessionState.metadata.previousAttempts++
        this.addToQueue(sessionId, sessionState.priority)
      }
    })

    if (affectedSessions.length > 0) {
      console.warn('SessionManager: Re-queued sessions due to agent offline', {
        agentId,
        affectedSessions: affectedSessions.length
      })
    }
  }

  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        console.error('SessionManager: Cleanup error', error)
      })
    }, 5 * 60 * 1000)
  }
}
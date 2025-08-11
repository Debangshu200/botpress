// Types for handoff management
export interface HandoffContext {
  originalQuery: string
  searchResults: SearchResult[]
  userProfile?: UserProfile
  conversationHistory: Message[]
  confidence?: number
  timestamp: Date
  botCapabilities?: string[]
  failureReason?: string
}

export interface SearchResult {
  content: string
  score: number
  source: string
  metadata: Record<string, any>
}

export interface UserProfile {
  id: string
  name?: string
  email?: string
  metadata?: Record<string, any>
}

export interface Message {
  id: string
  type: string
  content: string
  timestamp: Date
  source: 'user' | 'bot'
  userId?: string
}

export interface HandoffResult {
  success: boolean
  sessionId?: string
  conversationId?: string
  error?: string
  estimatedWaitTime?: number
}

export interface AgentAvailability {
  available: boolean
  queueLength: number
  estimatedWaitTime?: number
  activeAgents: number
  error?: string
  lastChecked: Date
}

export interface HandoffSession {
  id: string
  conversationId: string
  hitlConversationId?: string
  userId: string
  agentId?: string
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'failed'
  startTime: Date
  endTime?: Date
  context: HandoffContext
  recordingEnabled: boolean
  metadata: {
    handoffReason: string
    botConfidence: number
    queuePosition?: number
    estimatedWaitTime?: number
    lastContextUpdate?: Date
    [key: string]: any
  }
}

export interface HITLConfig {
  enabled: boolean
  agentTimeout: number
  queueLimit: number
  recordingEnabled: boolean
  autoAssignment: boolean
  notificationSettings: {
    userNotifications: boolean
    agentNotifications: boolean
    statusUpdates: boolean
  }
}

export interface HITLPluginAvailability {
  available: boolean
  configured: boolean
  actions: {
    startHitl: boolean
    stopHitl: boolean
    createUser: boolean
  }
  error?: string
}

export class HandoffManager {
  private sessions: Map<string, HandoffSession> = new Map()
  private config: HITLConfig
  private availabilityCache: { data: AgentAvailability | null; timestamp: number } = { data: null, timestamp: 0 }
  private readonly AVAILABILITY_CACHE_TTL = 30000 // 30 seconds

  constructor(config: Partial<HITLConfig> & { enabled: boolean; agentTimeout: number; queueLimit: number }) {
    // Validate required configuration
    this.validateConfiguration(config)
    
    this.config = {
      enabled: config.enabled,
      agentTimeout: config.agentTimeout,
      queueLimit: config.queueLimit,
      recordingEnabled: config.recordingEnabled ?? true,
      autoAssignment: config.autoAssignment ?? true,
      notificationSettings: {
        userNotifications: config.notificationSettings?.userNotifications ?? true,
        agentNotifications: config.notificationSettings?.agentNotifications ?? true,
        statusUpdates: config.notificationSettings?.statusUpdates ?? true,
        ...config.notificationSettings
      }
    }
  }

  /**
   * Validates the HandoffManager configuration
   */
  private validateConfiguration(config: Partial<HITLConfig> & { enabled: boolean; agentTimeout: number; queueLimit: number }): void {
    if (typeof config.enabled !== 'boolean') {
      throw new Error('HandoffManager: enabled must be a boolean')
    }
    
    if (typeof config.agentTimeout !== 'number' || config.agentTimeout <= 0) {
      throw new Error('HandoffManager: agentTimeout must be a positive number')
    }
    
    if (typeof config.queueLimit !== 'number' || config.queueLimit <= 0) {
      throw new Error('HandoffManager: queueLimit must be a positive number')
    }
    
    if (config.recordingEnabled !== undefined && typeof config.recordingEnabled !== 'boolean') {
      throw new Error('HandoffManager: recordingEnabled must be a boolean')
    }
    
    if (config.autoAssignment !== undefined && typeof config.autoAssignment !== 'boolean') {
      throw new Error('HandoffManager: autoAssignment must be a boolean')
    }
  }

  /**
   * Checks if the HITL plugin is available and properly configured
   */
  async checkHITLPluginAvailability(client: any): Promise<HITLPluginAvailability> {
    try {
      if (!client || typeof client.callAction !== 'function') {
        return {
          available: false,
          configured: false,
          actions: {
            startHitl: false,
            stopHitl: false,
            createUser: false
          },
          error: 'Botpress client not available or invalid'
        }
      }

      // Test if HITL actions are available by checking action availability
      const actions = {
        startHitl: false,
        stopHitl: false,
        createUser: false
      }

      try {
        // Try to call a HITL action with invalid parameters to test availability
        // This will fail but tell us if the action exists
        await client.callAction({
          type: 'hitl:startHitl',
          input: {}
        })
      } catch (error: any) {
        // If we get a validation error, the action exists
        if (error?.message?.includes('validation') || error?.message?.includes('required')) {
          actions.startHitl = true
        }
      }

      try {
        await client.callAction({
          type: 'hitl:stopHitl',
          input: {}
        })
      } catch (error: any) {
        if (error?.message?.includes('validation') || error?.message?.includes('required')) {
          actions.stopHitl = true
        }
      }

      try {
        await client.callAction({
          type: 'hitl:createUser',
          input: {}
        })
      } catch (error: any) {
        if (error?.message?.includes('validation') || error?.message?.includes('required')) {
          actions.createUser = true
        }
      }

      const available = actions.startHitl && actions.stopHitl
      const configured = available // For now, assume configured if actions are available

      return {
        available,
        configured,
        actions,
        error: available ? undefined : 'HITL plugin actions not available'
      }
    } catch (error) {
      return {
        available: false,
        configured: false,
        actions: {
          startHitl: false,
          stopHitl: false,
          createUser: false
        },
        error: error instanceof Error ? error.message : 'Unknown error checking HITL availability'
      }
    }
  }

  /**
   * Initiates a handoff to a human agent using the HITL plugin
   */
  async initiateHandoff(
    conversationId: string,
    userId: string,
    context: HandoffContext,
    client: any // Botpress client
  ): Promise<HandoffResult> {
    try {
      // Check if handoff is enabled
      if (!this.config.enabled) {
        return {
          success: false,
          error: 'Human handoff is currently disabled'
        }
      }

      // Check HITL plugin availability first
      const hitlAvailability = await this.checkHITLPluginAvailability(client)
      if (!hitlAvailability.available) {
        const errorMessage = hitlAvailability.error || 'HITL plugin is not available'
        console.warn('HandoffManager: HITL plugin not available:', errorMessage)
        return {
          success: false,
          error: `Human handoff is currently unavailable: ${errorMessage}`
        }
      }

      if (!hitlAvailability.configured) {
        console.warn('HandoffManager: HITL plugin not properly configured')
        return {
          success: false,
          error: 'Human handoff is not properly configured - please contact support'
        }
      }

      // Check if there's already an active session for this conversation
      const existingSession = this.findActiveSession(conversationId)
      if (existingSession) {
        return {
          success: false,
          error: 'A handoff session is already active for this conversation',
          sessionId: existingSession.id
        }
      }

      // Check agent availability with caching
      const availability = await this.checkAgentAvailability(client)
      if (!availability.available) {
        const errorMessage = availability.error || 'No agents currently available'
        return {
          success: false,
          error: errorMessage,
          estimatedWaitTime: availability.estimatedWaitTime
        }
      }

      // Enrich context with additional metadata for better agent understanding
      const enrichedContext = this.enrichContextForTransfer(context)
      
      // Process conversation history for insights
      const conversationAnalysis = this.processConversationHistory(enrichedContext.conversationHistory)

      // Create handoff session with enhanced metadata
      const sessionId = this.generateSessionId()
      const session: HandoffSession = {
        id: sessionId,
        conversationId,
        userId,
        status: 'pending',
        startTime: new Date(),
        context: enrichedContext,
        recordingEnabled: this.config.recordingEnabled,
        metadata: {
          handoffReason: enrichedContext.failureReason || 'User requested human assistance',
          botConfidence: enrichedContext.confidence || 0,
          queuePosition: availability.queueLength + 1,
          estimatedWaitTime: availability.estimatedWaitTime,
          conversationAnalysis,
          userSentiment: conversationAnalysis.userSentiment,
          keyTopics: conversationAnalysis.keyTopics,
          escalationPoints: conversationAnalysis.escalationPoints
        }
      }

      // Prepare enhanced message history for HITL
      const messageHistory = this.formatMessageHistoryForHITL(enrichedContext.conversationHistory)

      try {
        // Start HITL session with comprehensive error handling
        const hitlResult = await client.callAction({
          type: 'hitl:startHitl',
          input: {
            userId,
            title: `Support Request: ${context.originalQuery.substring(0, 50)}...`,
            description: this.createHandoffDescription(context),
            messageHistory,
            hitlSession: {} // Additional HITL configuration if needed
          }
        })

        if (hitlResult?.output?.conversationId) {
          session.hitlConversationId = hitlResult.output.conversationId
          session.status = 'active'
          session.metadata.hitlSessionCreated = new Date()
          this.sessions.set(sessionId, session)

          console.info(`HandoffManager: Successfully created HITL session ${hitlResult.output.conversationId} for conversation ${conversationId}`)

          return {
            success: true,
            sessionId,
            conversationId: hitlResult.output.conversationId,
            estimatedWaitTime: availability.estimatedWaitTime
          }
        } else {
          console.error('HandoffManager: HITL action succeeded but no conversation ID returned:', hitlResult)
          return {
            success: false,
            error: 'Failed to create HITL session - invalid response from HITL service'
          }
        }
      } catch (hitlError: any) {
        // Enhanced error handling for HITL action failures
        console.error('HandoffManager: HITL action failed:', hitlError)
        
        let errorMessage = 'Failed to start human handoff session'
        
        if (hitlError?.message?.includes('validation')) {
          errorMessage = 'Invalid handoff request - please try again'
        } else if (hitlError?.message?.includes('timeout')) {
          errorMessage = 'Handoff request timed out - please try again later'
        } else if (hitlError?.message?.includes('not found') || hitlError?.message?.includes('unavailable')) {
          errorMessage = 'Human handoff service is temporarily unavailable'
        } else if (hitlError?.message) {
          errorMessage = `Handoff failed: ${hitlError.message}`
        }

        return {
          success: false,
          error: errorMessage
        }
      }
    } catch (error) {
      console.error('HandoffManager: Unexpected error initiating handoff:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred during handoff'
      }
    }
  }

  /**
   * Checks if human agents are available with caching and real-time detection
   */
  async checkAgentAvailability(client?: any): Promise<AgentAvailability> {
    try {
      const now = Date.now()
      
      // Return cached result if still valid
      if (this.availabilityCache.data && (now - this.availabilityCache.timestamp) < this.AVAILABILITY_CACHE_TTL) {
        return this.availabilityCache.data
      }

      // Get real-time availability data
      const availabilityData = await this.getRealTimeAgentAvailability(client)
      
      // Cache the result
      this.availabilityCache = {
        data: availabilityData,
        timestamp: now
      }

      return availabilityData
    } catch (error) {
      console.error('HandoffManager: Error checking agent availability:', error)
      const errorResult: AgentAvailability = {
        available: false,
        queueLength: 0,
        activeAgents: 0,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }

      // Cache error result for a shorter time
      this.availabilityCache = {
        data: errorResult,
        timestamp: Date.now() - (this.AVAILABILITY_CACHE_TTL - 5000) // Cache for only 5 seconds on error
      }

      return errorResult
    }
  }

  /**
   * Gets real-time agent availability with queue management
   */
  private async getRealTimeAgentAvailability(client?: any): Promise<AgentAvailability> {
    // Count active sessions in our local queue
    const activeSessions = Array.from(this.sessions.values())
      .filter(session => session.status === 'active' || session.status === 'pending')
    
    const activeSessionsCount = activeSessions.length
    const pendingSessionsCount = activeSessions.filter(session => session.status === 'pending').length

    // Default values
    let activeAgents = 1
    let realTimeQueueLength = activeSessionsCount
    let externalSystemAvailable = false

    // Try to get real agent status from HITL system if client is available
    if (client) {
      try {
        const hitlAvailability = await this.checkHITLPluginAvailability(client)
        if (hitlAvailability.available) {
          externalSystemAvailable = true
          // In a real implementation, we would query the external HITL system
          // for actual agent counts and queue status
          // For now, we simulate this based on configuration and time of day
          activeAgents = this.estimateActiveAgents()
        }
      } catch (error) {
        console.debug('HandoffManager: Could not query HITL system for agent status:', error)
      }
    }

    // Calculate availability based on queue limits and active agents
    const queueCapacityReached = activeSessionsCount >= this.config.queueLimit
    const agentsAvailable = activeAgents > 0 && externalSystemAvailable
    const available = !queueCapacityReached && agentsAvailable

    // Calculate estimated wait time based on queue position and agent capacity
    const estimatedWaitTime = this.calculateEstimatedWaitTime(
      activeSessionsCount,
      pendingSessionsCount,
      activeAgents,
      available
    )

    const result: AgentAvailability = {
      available,
      queueLength: realTimeQueueLength,
      estimatedWaitTime,
      activeAgents,
      lastChecked: new Date(),
      error: this.getAvailabilityErrorMessage(available, queueCapacityReached, agentsAvailable, externalSystemAvailable)
    }

    console.debug(`HandoffManager: Agent availability check - Available: ${available}, Queue: ${realTimeQueueLength}, Active Agents: ${activeAgents}`)

    return result
  }

  /**
   * Estimates the number of active agents based on time and configuration
   */
  private estimateActiveAgents(): number {
    const now = new Date()
    const hour = now.getHours()
    const dayOfWeek = now.getDay() // 0 = Sunday, 6 = Saturday

    // Business hours estimation (9 AM - 5 PM, Monday-Friday)
    const isBusinessHours = (dayOfWeek >= 1 && dayOfWeek <= 5) && (hour >= 9 && hour <= 17)
    
    if (isBusinessHours) {
      // During business hours, assume more agents are available
      return Math.max(1, Math.floor(this.config.queueLimit / 3))
    } else {
      // Outside business hours, assume minimal staffing
      return Math.max(1, Math.floor(this.config.queueLimit / 6))
    }
  }

  /**
   * Calculates estimated wait time based on queue status and agent capacity
   */
  private calculateEstimatedWaitTime(
    totalQueue: number,
    pendingQueue: number,
    activeAgents: number,
    available: boolean
  ): number | undefined {
    if (available && pendingQueue === 0) {
      return undefined // No wait time if available and no pending queue
    }

    // Base wait time calculation
    const averageSessionDuration = 10 * 60 * 1000 // 10 minutes in milliseconds
    const agentCapacity = Math.max(activeAgents, 1)
    
    // Calculate position in queue (pending sessions get priority)
    const queuePosition = pendingQueue + 1
    
    // Estimate wait time based on queue position and agent capacity
    const baseWaitTime = (queuePosition / agentCapacity) * averageSessionDuration
    
    // Add buffer for queue processing overhead
    const bufferTime = Math.min(2 * 60 * 1000, baseWaitTime * 0.2) // Max 2 minutes buffer
    
    const totalWaitTime = Math.max(60 * 1000, baseWaitTime + bufferTime) // Minimum 1 minute wait
    
    return Math.round(totalWaitTime)
  }

  /**
   * Gets appropriate error message based on availability status
   */
  private getAvailabilityErrorMessage(
    available: boolean,
    queueCapacityReached: boolean,
    agentsAvailable: boolean,
    externalSystemAvailable: boolean
  ): string | undefined {
    if (available) {
      return undefined
    }

    if (!externalSystemAvailable) {
      return 'Human handoff service is currently unavailable'
    }

    if (!agentsAvailable) {
      return 'No agents are currently online'
    }

    if (queueCapacityReached) {
      return 'All agents are currently busy - queue is full'
    }

    return 'All agents are currently busy'
  }

  /**
   * Gets queue position for a specific session
   */
  getQueuePosition(sessionId: string): number | null {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== 'pending') {
      return null
    }

    // Count pending sessions that started before this one
    const pendingSessions = Array.from(this.sessions.values())
      .filter(s => s.status === 'pending' && s.startTime <= session.startTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

    return pendingSessions.findIndex(s => s.id === sessionId) + 1
  }

  /**
   * Updates queue positions and estimated wait times for all pending sessions
   */
  async updateQueueStatus(client?: any): Promise<void> {
    try {
      const availability = await this.checkAgentAvailability(client)
      const pendingSessions = Array.from(this.sessions.values())
        .filter(session => session.status === 'pending')
        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())

      pendingSessions.forEach((session, index) => {
        const queuePosition = index + 1
        const estimatedWaitTime = this.calculateEstimatedWaitTime(
          availability.queueLength,
          queuePosition,
          availability.activeAgents,
          availability.available
        )

        session.metadata.queuePosition = queuePosition
        session.metadata.estimatedWaitTime = estimatedWaitTime
        session.metadata.lastQueueUpdate = new Date()

        this.sessions.set(session.id, session)
      })

      if (pendingSessions.length > 0) {
        console.debug(`HandoffManager: Updated queue status for ${pendingSessions.length} pending sessions`)
      }
    } catch (error) {
      console.error('HandoffManager: Error updating queue status:', error)
    }
  }

  /**
   * Transfers enhanced conversation context to the human agent
   */
  async transferContext(
    sessionId: string,
    additionalContext: Partial<HandoffContext>,
    client?: any
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`HandoffManager: Session ${sessionId} not found`)
    }

    try {
      // Merge additional context with existing context
      const updatedContext = {
        ...session.context,
        ...additionalContext
      }

      // Enrich the context with additional metadata
      const enrichedContext = this.enrichContextForTransfer(updatedContext)

      // Update session context
      session.context = enrichedContext
      session.metadata.lastContextUpdate = new Date()

      // If we have a client and an active HITL session, send updated context
      if (client && session.hitlConversationId && session.status === 'active') {
        try {
          // Create an updated description with the new context
          const updatedDescription = this.createHandoffDescription(enrichedContext)
          
          // Send context update message to the HITL conversation
          await client.createMessage({
            conversationId: session.hitlConversationId,
            userId: session.userId,
            type: 'text',
            payload: {
              text: `📋 **Context Update:**\n\n${updatedDescription}`
            }
          })

          console.info(`HandoffManager: Successfully transferred updated context for session ${sessionId}`)
        } catch (contextTransferError) {
          console.warn('HandoffManager: Failed to send context update to HITL session:', contextTransferError)
          // Don't throw here - the context is still updated locally
        }
      }

      // Save the updated session
      this.sessions.set(sessionId, session)

      console.debug(`HandoffManager: Context updated for session ${sessionId}`)
    } catch (error) {
      console.error(`HandoffManager: Error transferring context for session ${sessionId}:`, error)
      throw new Error(`Failed to transfer context: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Processes and formats conversation history for better agent understanding
   */
  private processConversationHistory(messages: Message[]): {
    summary: string
    keyTopics: string[]
    userSentiment: 'positive' | 'neutral' | 'negative'
    escalationPoints: string[]
  } {
    const userMessages = messages.filter(msg => msg.source === 'user')
    const botMessages = messages.filter(msg => msg.source === 'bot')

    // Create conversation summary
    const recentMessages = messages.slice(-6) // Last 6 messages
    const summary = recentMessages.map(msg => 
      `${msg.source === 'user' ? 'User' : 'Bot'}: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`
    ).join('\n')

    // Extract key topics (simple keyword extraction)
    const allText = userMessages.map(msg => msg.content).join(' ').toLowerCase()
    const commonWords = ['help', 'problem', 'issue', 'error', 'support', 'question', 'need', 'want', 'can', 'how']
    const keyTopics = commonWords.filter(word => allText.includes(word))

    // Simple sentiment analysis based on keywords
    const negativeWords = ['problem', 'issue', 'error', 'wrong', 'bad', 'terrible', 'awful', 'frustrated', 'angry']
    const positiveWords = ['good', 'great', 'excellent', 'perfect', 'thanks', 'thank you', 'appreciate']
    
    const negativeCount = negativeWords.filter(word => allText.includes(word)).length
    const positiveCount = positiveWords.filter(word => allText.includes(word)).length
    
    let userSentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
    if (positiveCount > negativeCount) {
      userSentiment = 'positive'
    } else if (negativeCount > positiveCount) {
      userSentiment = 'negative'
    }

    // Identify potential escalation points
    const escalationKeywords = ['frustrated', 'angry', 'terrible', 'awful', 'manager', 'supervisor', 'complaint']
    const escalationPoints = userMessages
      .filter(msg => escalationKeywords.some(keyword => msg.content.toLowerCase().includes(keyword)))
      .map(msg => `"${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}"`)

    return {
      summary,
      keyTopics,
      userSentiment,
      escalationPoints
    }
  }

  /**
   * Ends a handoff session
   */
  async endHandoff(
    sessionId: string,
    client: any,
    reason: 'completed' | 'cancelled' | 'timeout' = 'completed'
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    try {
      // Stop HITL session if it exists
      if (session.hitlConversationId) {
        await client.callAction({
          type: 'hitl:stopHitl',
          input: {
            conversationId: session.hitlConversationId
          }
        })
      }

      // Update session status
      session.status = reason === 'completed' ? 'completed' : 'cancelled'
      session.endTime = new Date()
      
      this.sessions.set(sessionId, session)
    } catch (error) {
      console.error('HandoffManager: Error ending handoff:', error)
      session.status = 'failed'
      session.endTime = new Date()
      this.sessions.set(sessionId, session)
      throw error
    }
  }

  /**
   * Gets the current status of a handoff session
   */
  getSessionStatus(sessionId: string): HandoffSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Gets all active sessions
   */
  getActiveSessions(): HandoffSession[] {
    return Array.from(this.sessions.values())
      .filter(session => session.status === 'active' || session.status === 'pending')
  }

  /**
   * Cleans up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      const sessionAge = now.getTime() - session.startTime.getTime()
      const isExpired = sessionAge > this.config.agentTimeout

      if (isExpired && (session.status === 'pending' || session.status === 'active')) {
        session.status = 'cancelled'
        session.endTime = now
        expiredSessions.push(sessionId)
      }
    }

    if (expiredSessions.length > 0) {
      console.info(`HandoffManager: Cleaned up ${expiredSessions.length} expired sessions`)
    }
  }

  // Private helper methods

  private findActiveSession(conversationId: string): HandoffSession | null {
    for (const session of Array.from(this.sessions.values())) {
      if (session.conversationId === conversationId && 
          (session.status === 'active' || session.status === 'pending')) {
        return session
      }
    }
    return null
  }

  private generateSessionId(): string {
    return `handoff_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Formats message history for HITL with enhanced context
   */
  private formatMessageHistoryForHITL(messages: Message[]): any[] {
    return messages.map((message, index) => {
      const baseMessage = {
        source: {
          type: message.source,
          ...(message.source === 'user' && message.userId ? { userId: message.userId } : {})
        },
        type: 'text',
        payload: {
          text: message.content
        },
        timestamp: message.timestamp.toISOString(),
        messageIndex: index + 1
      }

      // Add additional context for bot messages
      if (message.source === 'bot') {
        return {
          ...baseMessage,
          metadata: {
            messageId: message.id,
            generatedAt: message.timestamp.toISOString()
          }
        }
      }

      return baseMessage
    })
  }

  /**
   * Creates a comprehensive handoff description for human agents
   */
  private createHandoffDescription(context: HandoffContext): string {
    const sections: string[] = []

    // Primary user query
    sections.push(`🔍 **User Query:**\n${context.originalQuery}`)

    // Bot confidence and failure reason
    if (context.confidence !== undefined) {
      const confidencePercent = (context.confidence * 100).toFixed(1)
      sections.push(`🤖 **Bot Confidence:** ${confidencePercent}%`)
    }

    if (context.failureReason) {
      sections.push(`❌ **Handoff Reason:** ${context.failureReason}`)
    }

    // Knowledge base search results
    if (context.searchResults && context.searchResults.length > 0) {
      let searchSection = `📚 **Knowledge Base Search Results:**\n`
      context.searchResults.slice(0, 3).forEach((result, index) => {
        const truncatedContent = result.content.length > 150 
          ? `${result.content.substring(0, 150)}...` 
          : result.content
        searchSection += `${index + 1}. **Score: ${result.score.toFixed(2)}** - ${truncatedContent}\n`
        if (result.source) {
          searchSection += `   *Source: ${result.source}*\n`
        }
      })
      sections.push(searchSection.trim())
    }

    // User profile information
    if (context.userProfile) {
      let profileSection = `👤 **User Profile:**\n`
      if (context.userProfile.name) {
        profileSection += `Name: ${context.userProfile.name}\n`
      }
      if (context.userProfile.email) {
        profileSection += `Email: ${context.userProfile.email}\n`
      }
      if (context.userProfile.metadata && Object.keys(context.userProfile.metadata).length > 0) {
        profileSection += `Additional Info: ${JSON.stringify(context.userProfile.metadata, null, 2)}\n`
      }
      sections.push(profileSection.trim())
    }

    // Bot capabilities
    if (context.botCapabilities && context.botCapabilities.length > 0) {
      sections.push(`⚙️ **Bot Capabilities:** ${context.botCapabilities.join(', ')}`)
    }

    // Conversation metadata
    const conversationInfo = [
      `📅 **Conversation Started:** ${context.timestamp.toISOString()}`,
      `💬 **Message Count:** ${context.conversationHistory.length}`,
      `🕒 **Handoff Initiated:** ${new Date().toISOString()}`
    ]
    sections.push(conversationInfo.join('\n'))

    return sections.join('\n\n')
  }

  /**
   * Enhances context with additional metadata for better agent understanding
   */
  private enrichContextForTransfer(context: HandoffContext): HandoffContext {
    const enrichedContext = { ...context }

    // Add conversation analysis
    const userMessages = context.conversationHistory.filter(msg => msg.source === 'user')
    const botMessages = context.conversationHistory.filter(msg => msg.source === 'bot')

    // Calculate conversation duration
    if (context.conversationHistory.length > 0) {
      const firstMessage = context.conversationHistory[0]
      const lastMessage = context.conversationHistory[context.conversationHistory.length - 1]
      const duration = lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime()
      
      if (!enrichedContext.userProfile) {
        enrichedContext.userProfile = { id: context.conversationHistory[0].userId || 'unknown' }
      }
      
      if (!enrichedContext.userProfile.metadata) {
        enrichedContext.userProfile.metadata = {}
      }
      
      enrichedContext.userProfile.metadata.conversationDuration = duration
      enrichedContext.userProfile.metadata.userMessageCount = userMessages.length
      enrichedContext.userProfile.metadata.botMessageCount = botMessages.length
    }

    // Add bot capabilities if not provided
    if (!enrichedContext.botCapabilities) {
      enrichedContext.botCapabilities = [
        'Knowledge Base Search',
        'Natural Language Processing',
        'Conversation Management',
        'Context Awareness'
      ]
    }

    return enrichedContext
  }
}
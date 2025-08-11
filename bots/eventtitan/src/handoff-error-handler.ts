/**
 * Handoff System Error Handler
 * Implements agent unavailability handling, queue management, and session recovery
 */

export interface HandoffError {
  type: 'agent_unavailable' | 'hitl_service_unavailable' | 'session_creation_failed' | 'session_interrupted' | 'queue_full' | 'timeout'
  message: string
  sessionId?: string
  conversationId: string
  timestamp: Date
  retryCount: number
  metadata?: Record<string, any>
}

export interface QueueStatus {
  position: number
  estimatedWaitTime: number // in minutes
  totalInQueue: number
  availableAgents: number
}

export interface AlternativeSupport {
  type: 'callback' | 'email' | 'self_service' | 'escalation'
  description: string
  action: string
  metadata?: Record<string, any>
}

export interface HandoffRecoveryOptions {
  enableSessionRecovery: boolean
  maxRecoveryAttempts: number
  recoveryTimeout: number // milliseconds
  queueTimeout: number // milliseconds
  alternativeSupportEnabled: boolean
}

export interface HandoffErrorResponse {
  action: 'retry' | 'queue' | 'alternative_support' | 'escalate' | 'inform_user'
  message: string
  queueStatus?: QueueStatus
  alternativeSupport?: AlternativeSupport[]
  retryDelay?: number
  sessionRecovered?: boolean
  metadata: {
    errorType: string
    handoffReason: string
    timestamp: Date
  }
}

export class HandoffErrorHandler {
  private recoveryOptions: HandoffRecoveryOptions
  private errorHistory: HandoffError[]
  private maxHistorySize: number
  private queueManager: QueueManager
  private sessionRecovery: SessionRecovery
  private alternativeSupportOptions: Map<string, AlternativeSupport>

  constructor(recoveryOptions?: Partial<HandoffRecoveryOptions>) {
    this.recoveryOptions = {
      enableSessionRecovery: true,
      maxRecoveryAttempts: 3,
      recoveryTimeout: 30000, // 30 seconds
      queueTimeout: 300000, // 5 minutes
      alternativeSupportEnabled: true,
      ...recoveryOptions
    }

    this.errorHistory = []
    this.maxHistorySize = 50
    this.queueManager = new QueueManager()
    this.sessionRecovery = new SessionRecovery(this.recoveryOptions)

    // Initialize alternative support options
    this.alternativeSupportOptions = new Map([
      ['callback', {
        type: 'callback',
        description: 'Request a callback when an agent becomes available',
        action: 'schedule_callback',
        metadata: { priority: 'normal' }
      }],
      ['email', {
        type: 'email',
        description: 'Send your question via email for a detailed response',
        action: 'send_email',
        metadata: { responseTime: '24 hours' }
      }],
      ['self_service', {
        type: 'self_service',
        description: 'Browse our help center for immediate answers',
        action: 'open_help_center',
        metadata: { url: '/help' }
      }],
      ['escalation', {
        type: 'escalation',
        description: 'Escalate to a supervisor for urgent matters',
        action: 'escalate_to_supervisor',
        metadata: { priority: 'high' }
      }]
    ])
  }

  /**
   * Handle handoff initiation with comprehensive error handling
   */
  async handleHandoffInitiation(
    conversationId: string,
    context: HandoffContext
  ): Promise<{ success: boolean; sessionId?: string; error?: HandoffError; response?: HandoffErrorResponse }> {
    try {
      // Check agent availability first
      const availability = await this.checkAgentAvailability()
      
      if (!availability.available) {
        return this.handleAgentUnavailability(conversationId, availability, context)
      }

      // Attempt to create handoff session
      const sessionResult = await this.createHandoffSession(conversationId, context)
      
      if (sessionResult.success) {
        return { success: true, sessionId: sessionResult.sessionId }
      } else {
        return this.handleSessionCreationFailure(conversationId, sessionResult.error!, context)
      }

    } catch (error) {
      const handoffError = this.createHandoffError(error, conversationId, 'session_creation_failed', 0)
      this.addToErrorHistory(handoffError)
      
      const response = await this.createErrorResponse(handoffError, context)
      return { success: false, error: handoffError, response }
    }
  }

  /**
   * Handle session interruption and recovery
   */
  async handleSessionInterruption(
    sessionId: string,
    conversationId: string,
    reason: string
  ): Promise<{ recovered: boolean; newSessionId?: string; error?: HandoffError; response?: HandoffErrorResponse }> {
    const handoffError = this.createHandoffError(
      new Error(`Session interrupted: ${reason}`),
      conversationId,
      'session_interrupted',
      0,
      sessionId
    )
    
    this.addToErrorHistory(handoffError)

    if (!this.recoveryOptions.enableSessionRecovery) {
      const response = await this.createErrorResponse(handoffError, { originalQuery: '', conversationHistory: [] })
      return { recovered: false, error: handoffError, response }
    }

    try {
      const recoveryResult = await this.sessionRecovery.recoverSession(sessionId, conversationId)
      
      if (recoveryResult.success) {
        console.log(`Session ${sessionId} recovered successfully as ${recoveryResult.newSessionId}`)
        return { recovered: true, newSessionId: recoveryResult.newSessionId }
      } else {
        const response = await this.createErrorResponse(handoffError, { originalQuery: '', conversationHistory: [] })
        return { recovered: false, error: handoffError, response }
      }

    } catch (error) {
      console.error('Session recovery failed:', error)
      const response = await this.createErrorResponse(handoffError, { originalQuery: '', conversationHistory: [] })
      return { recovered: false, error: handoffError, response }
    }
  }

  /**
   * Check agent availability with queue status
   */
  async checkAgentAvailability(): Promise<{
    available: boolean
    queueStatus: QueueStatus
    reason?: string
  }> {
    try {
      const queueStatus = await this.queueManager.getQueueStatus()
      
      // Check if agents are available
      if (queueStatus.availableAgents > 0) {
        return { available: true, queueStatus }
      }

      // Check if queue is full
      if (queueStatus.totalInQueue >= this.queueManager.getMaxQueueSize()) {
        return {
          available: false,
          queueStatus,
          reason: 'Queue is at maximum capacity'
        }
      }

      // Agents unavailable but queue has space
      return {
        available: false,
        queueStatus,
        reason: 'No agents currently available'
      }

    } catch (error) {
      console.error('Error checking agent availability:', error)
      
      // Return default unavailable status
      return {
        available: false,
        queueStatus: {
          position: 0,
          estimatedWaitTime: 0,
          totalInQueue: 0,
          availableAgents: 0
        },
        reason: 'Unable to check agent availability'
      }
    }
  }

  /**
   * Get alternative support options
   */
  getAlternativeSupportOptions(): AlternativeSupport[] {
    if (!this.recoveryOptions.alternativeSupportEnabled) {
      return []
    }

    return Array.from(this.alternativeSupportOptions.values())
  }

  /**
   * Update alternative support options
   */
  updateAlternativeSupport(type: string, support: AlternativeSupport): void {
    this.alternativeSupportOptions.set(type, support)
  }

  /**
   * Get handoff error statistics
   */
  getErrorStats(): {
    totalErrors: number
    errorsByType: Record<string, number>
    recentErrorRate: number
    averageRecoveryTime: number
    queuePerformance: QueuePerformanceStats
  } {
    const recentErrors = this.getRecentErrors(60 * 60 * 1000) // Last hour
    const errorsByType: Record<string, number> = {}
    
    this.errorHistory.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
    })

    const recoveryTimes = this.errorHistory
      .filter(error => error.metadata?.recoveryTime)
      .map(error => error.metadata!.recoveryTime as number)
    
    const averageRecoveryTime = recoveryTimes.length > 0 
      ? recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length 
      : 0

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      recentErrorRate: recentErrors.length,
      averageRecoveryTime,
      queuePerformance: this.queueManager.getPerformanceStats()
    }
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = []
  }

  /**
   * Update recovery options
   */
  updateRecoveryOptions(options: Partial<HandoffRecoveryOptions>): void {
    this.recoveryOptions = { ...this.recoveryOptions, ...options }
    this.sessionRecovery.updateOptions(this.recoveryOptions)
  }

  /**
   * Handle agent unavailability
   */
  private async handleAgentUnavailability(
    conversationId: string,
    availability: { available: boolean; queueStatus: QueueStatus; reason?: string },
    context: HandoffContext
  ): Promise<{ success: boolean; error: HandoffError; response: HandoffErrorResponse }> {
    const handoffError = this.createHandoffError(
      new Error(availability.reason || 'No agents available'),
      conversationId,
      'agent_unavailable',
      0
    )
    
    this.addToErrorHistory(handoffError)

    // Check if we should queue the user
    if (availability.queueStatus.totalInQueue < this.queueManager.getMaxQueueSize()) {
      const queueResult = await this.queueManager.addToQueue(conversationId, context)
      
      if (queueResult.success) {
        const response: HandoffErrorResponse = {
          action: 'queue',
          message: `All agents are currently busy. You've been added to the queue at position ${queueResult.position}.`,
          queueStatus: {
            ...availability.queueStatus,
            position: queueResult.position
          },
          metadata: {
            errorType: handoffError.type,
            handoffReason: 'Agent unavailable - queued',
            timestamp: new Date()
          }
        }
        
        return { success: false, error: handoffError, response }
      }
    }

    // Queue is full or queueing failed, offer alternatives
    const response: HandoffErrorResponse = {
      action: 'alternative_support',
      message: 'All agents are currently unavailable and our queue is full. Please choose an alternative support option:',
      alternativeSupport: this.getAlternativeSupportOptions(),
      metadata: {
        errorType: handoffError.type,
        handoffReason: 'Agent unavailable - queue full',
        timestamp: new Date()
      }
    }

    return { success: false, error: handoffError, response }
  }

  /**
   * Handle session creation failure
   */
  private async handleSessionCreationFailure(
    conversationId: string,
    error: Error,
    context: HandoffContext
  ): Promise<{ success: boolean; error: HandoffError; response: HandoffErrorResponse }> {
    const handoffError = this.createHandoffError(error, conversationId, 'session_creation_failed', 0)
    this.addToErrorHistory(handoffError)

    // Try alternative support if session creation fails
    const response: HandoffErrorResponse = {
      action: 'alternative_support',
      message: 'We encountered an issue connecting you to an agent. Please choose an alternative support option:',
      alternativeSupport: this.getAlternativeSupportOptions(),
      metadata: {
        errorType: handoffError.type,
        handoffReason: 'Session creation failed',
        timestamp: new Date()
      }
    }

    return { success: false, error: handoffError, response }
  }

  /**
   * Create handoff session (mock implementation)
   */
  private async createHandoffSession(
    conversationId: string,
    context: HandoffContext
  ): Promise<{ success: boolean; sessionId?: string; error?: Error }> {
    try {
      // Mock session creation - in real implementation this would call HITL plugin
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      // Simulate potential failure
      if (Math.random() < 0.1) { // 10% failure rate for testing
        throw new Error('HITL service temporarily unavailable')
      }
      
      return { success: true, sessionId }
      
    } catch (error) {
      return { success: false, error: error as Error }
    }
  }

  /**
   * Create error response based on error type and context
   */
  private async createErrorResponse(
    error: HandoffError,
    context: HandoffContext
  ): Promise<HandoffErrorResponse> {
    switch (error.type) {
      case 'agent_unavailable':
        return {
          action: 'alternative_support',
          message: 'All agents are currently busy. Please choose an alternative support option:',
          alternativeSupport: this.getAlternativeSupportOptions(),
          metadata: {
            errorType: error.type,
            handoffReason: 'No agents available',
            timestamp: new Date()
          }
        }

      case 'hitl_service_unavailable':
        return {
          action: 'alternative_support',
          message: 'Our live chat system is temporarily unavailable. Please choose an alternative support option:',
          alternativeSupport: this.getAlternativeSupportOptions(),
          metadata: {
            errorType: error.type,
            handoffReason: 'HITL service down',
            timestamp: new Date()
          }
        }

      case 'session_interrupted':
        return {
          action: 'retry',
          message: 'Your chat session was interrupted. We\'re attempting to reconnect you...',
          retryDelay: 5000,
          metadata: {
            errorType: error.type,
            handoffReason: 'Session interrupted',
            timestamp: new Date()
          }
        }

      case 'queue_full':
        return {
          action: 'alternative_support',
          message: 'Our support queue is currently full. Please choose an alternative support option:',
          alternativeSupport: this.getAlternativeSupportOptions(),
          metadata: {
            errorType: error.type,
            handoffReason: 'Queue at capacity',
            timestamp: new Date()
          }
        }

      default:
        return {
          action: 'alternative_support',
          message: 'We encountered an issue with live chat. Please choose an alternative support option:',
          alternativeSupport: this.getAlternativeSupportOptions(),
          metadata: {
            errorType: error.type,
            handoffReason: 'General handoff error',
            timestamp: new Date()
          }
        }
    }
  }

  /**
   * Create HandoffError from caught error
   */
  private createHandoffError(
    error: any,
    conversationId: string,
    type: HandoffError['type'],
    retryCount: number,
    sessionId?: string
  ): HandoffError {
    let message = 'Unknown handoff error occurred'

    if (error instanceof Error) {
      message = error.message
    } else if (typeof error === 'string') {
      message = error
    }

    return {
      type,
      message,
      sessionId,
      conversationId,
      timestamp: new Date(),
      retryCount,
      metadata: {
        errorName: error?.name,
        stack: error?.stack?.substring(0, 500)
      }
    }
  }

  /**
   * Add error to history with size management
   */
  private addToErrorHistory(error: HandoffError): void {
    this.errorHistory.push(error)
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Get recent errors within time window
   */
  private getRecentErrors(timeWindowMs: number): HandoffError[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs)
    return this.errorHistory.filter(error => error.timestamp >= cutoffTime)
  }
}

/**
 * Queue Manager for handling user queues
 */
class QueueManager {
  private queue: QueueEntry[]
  private maxQueueSize: number
  private performanceStats: QueuePerformanceStats

  constructor(maxQueueSize: number = 50) {
    this.queue = []
    this.maxQueueSize = maxQueueSize
    this.performanceStats = {
      totalQueued: 0,
      averageWaitTime: 0,
      maxWaitTime: 0,
      queueDropouts: 0
    }
  }

  async getQueueStatus(): Promise<QueueStatus> {
    // Mock implementation - in real system this would check actual agent status
    const availableAgents = Math.floor(Math.random() * 5) // 0-4 agents
    const estimatedWaitTime = this.queue.length > 0 ? Math.ceil(this.queue.length / Math.max(1, availableAgents) * 3) : 0

    return {
      position: 0, // Will be set when user is added to queue
      estimatedWaitTime,
      totalInQueue: this.queue.length,
      availableAgents
    }
  }

  async addToQueue(conversationId: string, context: HandoffContext): Promise<{ success: boolean; position?: number }> {
    if (this.queue.length >= this.maxQueueSize) {
      return { success: false }
    }

    const entry: QueueEntry = {
      conversationId,
      context,
      timestamp: new Date(),
      position: this.queue.length + 1
    }

    this.queue.push(entry)
    this.performanceStats.totalQueued++

    return { success: true, position: entry.position }
  }

  getMaxQueueSize(): number {
    return this.maxQueueSize
  }

  getPerformanceStats(): QueuePerformanceStats {
    return { ...this.performanceStats }
  }
}

/**
 * Session Recovery Manager
 */
class SessionRecovery {
  private recoveryOptions: HandoffRecoveryOptions
  private recoveryAttempts: Map<string, number>

  constructor(options: HandoffRecoveryOptions) {
    this.recoveryOptions = options
    this.recoveryAttempts = new Map()
  }

  async recoverSession(sessionId: string, conversationId: string): Promise<{ success: boolean; newSessionId?: string }> {
    const attempts = this.recoveryAttempts.get(sessionId) || 0
    
    if (attempts >= this.recoveryOptions.maxRecoveryAttempts) {
      return { success: false }
    }

    this.recoveryAttempts.set(sessionId, attempts + 1)

    try {
      // Mock recovery logic - in real implementation this would attempt to restore the session
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate recovery time
      
      // Simulate recovery success/failure
      if (Math.random() < 0.7) { // 70% success rate
        const newSessionId = `recovered_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        this.recoveryAttempts.delete(sessionId) // Clear attempts on success
        return { success: true, newSessionId }
      } else {
        return { success: false }
      }

    } catch (error) {
      console.error('Session recovery error:', error)
      return { success: false }
    }
  }

  updateOptions(options: HandoffRecoveryOptions): void {
    this.recoveryOptions = options
  }
}

// Supporting interfaces and types
export interface HandoffContext {
  originalQuery: string
  conversationHistory: Message[]
  userProfile?: UserProfile
  searchResults?: SearchResult[]
}

export interface Message {
  content: string
  timestamp: Date
  sender: 'user' | 'bot' | 'agent'
}

export interface UserProfile {
  id: string
  name?: string
  email?: string
  priority?: 'low' | 'normal' | 'high'
}

export interface SearchResult {
  content: string
  score: number
  source: string
}

interface QueueEntry {
  conversationId: string
  context: HandoffContext
  timestamp: Date
  position: number
}

interface QueuePerformanceStats {
  totalQueued: number
  averageWaitTime: number
  maxWaitTime: number
  queueDropouts: number
}

/**
 * Default handoff recovery options
 */
export const DEFAULT_HANDOFF_RECOVERY_OPTIONS: HandoffRecoveryOptions = {
  enableSessionRecovery: true,
  maxRecoveryAttempts: 3,
  recoveryTimeout: 30000,
  queueTimeout: 300000,
  alternativeSupportEnabled: true
}
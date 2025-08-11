/**
 * Knowledge Base Error Handler
 * Implements fallback mechanisms, automatic handoff triggers, and retry logic for knowledge search failures
 */

export interface KnowledgeError {
  type: 'search_failure' | 'timeout' | 'service_unavailable' | 'malformed_results' | 'network_error'
  message: string
  originalQuery: string
  timestamp: Date
  retryCount: number
  metadata?: Record<string, any>
}

export interface RetryConfig {
  maxRetries: number
  baseDelay: number // milliseconds
  maxDelay: number // milliseconds
  backoffMultiplier: number
  jitterEnabled: boolean
}

export interface FallbackResponse {
  action: 'retry' | 'handoff' | 'fallback_response' | 'inform_user'
  response?: string
  shouldHandoff: boolean
  retryDelay?: number
  metadata: {
    errorType: string
    fallbackReason: string
    timestamp: Date
  }
}

export interface KnowledgeSearchOptions {
  timeout: number
  retryConfig: RetryConfig
  fallbackEnabled: boolean
  handoffOnFailure: boolean
}

export class KnowledgeErrorHandler {
  private retryConfig: RetryConfig
  private fallbackResponses: Map<string, string>
  private errorHistory: KnowledgeError[]
  private maxHistorySize: number

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      ...retryConfig
    }

    this.fallbackResponses = new Map([
      ['search_failure', "I'm having trouble searching our knowledge base right now. Let me connect you with a human agent who can help."],
      ['timeout', "The search is taking longer than expected. I'll connect you with someone who can assist you directly."],
      ['service_unavailable', "Our knowledge system is temporarily unavailable. I'm connecting you with a human agent for immediate assistance."],
      ['network_error', "I'm experiencing connectivity issues. Let me get you connected with a human agent right away."],
      ['malformed_results', "I received unexpected results from our knowledge base. A human agent will be able to help you better."]
    ])

    this.errorHistory = []
    this.maxHistorySize = 100
  }

  /**
   * Handle knowledge search with comprehensive error handling
   */
  async handleKnowledgeSearch<T>(
    searchFunction: () => Promise<T>,
    query: string,
    options: KnowledgeSearchOptions
  ): Promise<{ result?: T; error?: KnowledgeError; fallback?: FallbackResponse }> {
    let lastError: KnowledgeError | undefined
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Add timeout wrapper
        const result = await this.withTimeout(searchFunction(), options.timeout)
        
        // If we get here, the search succeeded
        if (attempt > 0) {
          console.log(`Knowledge search succeeded on attempt ${attempt + 1} for query: ${query.substring(0, 50)}...`)
        }
        
        return { result }
        
      } catch (error) {
        const knowledgeError = this.createKnowledgeError(error, query, attempt)
        lastError = knowledgeError
        
        // Log the error
        this.logError(knowledgeError)
        
        // Add to error history
        this.addToErrorHistory(knowledgeError)
        
        // Check if we should retry
        if (attempt < this.retryConfig.maxRetries && this.shouldRetry(knowledgeError)) {
          const delay = this.calculateRetryDelay(attempt)
          console.log(`Retrying knowledge search in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`)
          await this.sleep(delay)
          continue
        }
        
        // No more retries, handle the failure
        break
      }
    }

    // All retries exhausted or non-retryable error
    if (lastError) {
      const fallback = this.createFallbackResponse(lastError, options)
      return { error: lastError, fallback }
    }

    // This shouldn't happen, but handle it gracefully
    const unknownError = this.createKnowledgeError(
      new Error('Unknown error occurred during knowledge search'),
      query,
      0
    )
    const fallback = this.createFallbackResponse(unknownError, options)
    return { error: unknownError, fallback }
  }

  /**
   * Check system availability and trigger handoff if needed
   */
  async checkSystemAvailability(): Promise<{ available: boolean; shouldHandoff: boolean; reason?: string }> {
    try {
      // Check recent error patterns
      const recentErrors = this.getRecentErrors(5 * 60 * 1000) // Last 5 minutes
      const errorRate = recentErrors.length
      
      // If we have too many recent errors, consider system unavailable
      if (errorRate >= 5) {
        return {
          available: false,
          shouldHandoff: true,
          reason: `High error rate detected: ${errorRate} errors in the last 5 minutes`
        }
      }

      // Check for specific error patterns that indicate system issues
      const systemErrors = recentErrors.filter(error => 
        error.type === 'service_unavailable' || error.type === 'timeout'
      )
      
      if (systemErrors.length >= 3) {
        return {
          available: false,
          shouldHandoff: true,
          reason: 'Multiple system availability issues detected'
        }
      }

      return { available: true, shouldHandoff: false }
      
    } catch (error) {
      console.error('Error checking system availability:', error)
      return {
        available: false,
        shouldHandoff: true,
        reason: 'Unable to determine system status'
      }
    }
  }

  /**
   * Get fallback response for specific error types
   */
  getFallbackResponse(errorType: string): string {
    return this.fallbackResponses.get(errorType) || 
           "I'm experiencing technical difficulties. Let me connect you with a human agent who can help."
  }

  /**
   * Update fallback responses
   */
  updateFallbackResponse(errorType: string, response: string): void {
    this.fallbackResponses.set(errorType, response)
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number
    errorsByType: Record<string, number>
    recentErrorRate: number
    averageRetryCount: number
  } {
    const recentErrors = this.getRecentErrors(60 * 60 * 1000) // Last hour
    const errorsByType: Record<string, number> = {}
    
    this.errorHistory.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
    })
    
    const totalRetries = this.errorHistory.reduce((sum, error) => sum + error.retryCount, 0)
    const averageRetryCount = this.errorHistory.length > 0 ? totalRetries / this.errorHistory.length : 0
    
    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      recentErrorRate: recentErrors.length,
      averageRetryCount
    }
  }

  /**
   * Clear error history (useful for testing or maintenance)
   */
  clearErrorHistory(): void {
    this.errorHistory = []
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config }
  }

  /**
   * Create a KnowledgeError from a caught error
   */
  private createKnowledgeError(error: any, query: string, retryCount: number): KnowledgeError {
    let errorType: KnowledgeError['type'] = 'search_failure'
    let message = 'Unknown error occurred'

    if (error instanceof Error) {
      message = error.message
      
      // Classify error type based on message or error properties
      if (message.includes('timeout') || message.includes('TIMEOUT') || message.includes('timed out')) {
        errorType = 'timeout'
      } else if (message.includes('network') || message.includes('NETWORK') || message.includes('ECONNREFUSED')) {
        errorType = 'network_error'
      } else if (message.includes('unavailable') || message.includes('503') || message.includes('502')) {
        errorType = 'service_unavailable'
      } else if (message.includes('malformed') || message.includes('parse') || message.includes('invalid')) {
        errorType = 'malformed_results'
      }
    } else if (error === null || error === undefined) {
      message = 'Unknown error occurred'
      errorType = 'search_failure'
    } else if (typeof error === 'string') {
      message = error
      // Apply same classification logic to string errors
      if (message.includes('timeout') || message.includes('TIMEOUT') || message.includes('timed out')) {
        errorType = 'timeout'
      } else if (message.includes('network') || message.includes('NETWORK') || message.includes('ECONNREFUSED')) {
        errorType = 'network_error'
      } else if (message.includes('unavailable') || message.includes('503') || message.includes('502')) {
        errorType = 'service_unavailable'
      } else if (message.includes('malformed') || message.includes('parse') || message.includes('invalid')) {
        errorType = 'malformed_results'
      }
    }

    return {
      type: errorType,
      message,
      originalQuery: query,
      timestamp: new Date(),
      retryCount,
      metadata: {
        errorName: error?.name,
        stack: error?.stack?.substring(0, 500) // Truncate stack trace
      }
    }
  }

  /**
   * Create fallback response based on error and options
   */
  private createFallbackResponse(error: KnowledgeError, options: KnowledgeSearchOptions): FallbackResponse {
    const shouldHandoff = options.handoffOnFailure || this.shouldTriggerHandoff(error)
    
    return {
      action: shouldHandoff ? 'handoff' : 'fallback_response',
      response: this.getFallbackResponse(error.type),
      shouldHandoff,
      metadata: {
        errorType: error.type,
        fallbackReason: `Knowledge search failed after ${error.retryCount + 1} attempts`,
        timestamp: new Date()
      }
    }
  }

  /**
   * Determine if an error should trigger automatic handoff
   */
  private shouldTriggerHandoff(error: KnowledgeError): boolean {
    // Always handoff for service unavailability
    if (error.type === 'service_unavailable') {
      return true
    }

    // Handoff for repeated timeouts
    if (error.type === 'timeout' && error.retryCount >= 2) {
      return true
    }

    // Handoff for network errors that persist
    if (error.type === 'network_error' && error.retryCount >= 1) {
      return true
    }

    return false
  }

  /**
   * Determine if we should retry based on error type
   */
  private shouldRetry(error: KnowledgeError): boolean {
    // Don't retry malformed results - likely a code issue
    if (error.type === 'malformed_results') {
      return false
    }

    // Retry timeouts and network errors
    if (error.type === 'timeout' || error.type === 'network_error') {
      return true
    }

    // Retry service unavailable with caution
    if (error.type === 'service_unavailable') {
      return true
    }

    // Retry general search failures
    if (error.type === 'search_failure') {
      return true
    }

    return false
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    let delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt)
    delay = Math.min(delay, this.retryConfig.maxDelay)
    
    if (this.retryConfig.jitterEnabled) {
      // Add random jitter (±25% of delay)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1)
      delay += jitter
    }
    
    return Math.max(0, Math.round(delay))
  }

  /**
   * Add timeout wrapper to a promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      promise
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Add error to history with size management
   */
  private addToErrorHistory(error: KnowledgeError): void {
    this.errorHistory.push(error)
    
    // Maintain history size limit
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Get recent errors within specified time window
   */
  private getRecentErrors(timeWindowMs: number): KnowledgeError[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs)
    return this.errorHistory.filter(error => error.timestamp >= cutoffTime)
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: KnowledgeError): void {
    const logMessage = `Knowledge search error: ${error.type} - ${error.message} (attempt ${error.retryCount + 1})`
    
    if (error.type === 'service_unavailable' || error.retryCount >= 2) {
      console.error(logMessage, { error })
    } else {
      console.warn(logMessage)
    }
  }
}

/**
 * Default knowledge search options
 */
export const DEFAULT_KNOWLEDGE_SEARCH_OPTIONS: KnowledgeSearchOptions = {
  timeout: 5000, // 5 seconds
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitterEnabled: true
  },
  fallbackEnabled: true,
  handoffOnFailure: true
}
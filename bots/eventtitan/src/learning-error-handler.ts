/**
 * Learning System Error Handler
 * Implements error recovery for conversation recording failures, data quarantine, and manual review workflows
 */

export interface LearningError {
  type: 'recording_failed' | 'processing_failed' | 'extraction_failed' | 'validation_failed' | 'integration_failed' | 'data_corruption'
  message: string
  sessionId?: string
  conversationId: string
  timestamp: Date
  retryCount: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  metadata?: Record<string, any>
}

export interface QuarantineData {
  id: string
  originalData: any
  errorReason: string
  quarantineTime: Date
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'needs_revision'
  reviewNotes?: string
  reviewedBy?: string
  reviewedAt?: Date
}

export interface ManualReviewWorkflow {
  id: string
  type: 'data_validation' | 'quality_check' | 'content_review' | 'error_investigation'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  assignedTo?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  createdAt: Date
  dueDate?: Date
  data: any
  context: ReviewContext
}

export interface ReviewContext {
  sessionId?: string
  conversationId: string
  errorType: string
  originalError: LearningError
  relatedData?: any[]
}

export interface LearningRecoveryOptions {
  enableRecording: boolean
  enableQuarantine: boolean
  enableManualReview: boolean
  maxRetryAttempts: number
  quarantineThreshold: number // Number of failures before quarantine
  autoRecoveryEnabled: boolean
  reviewWorkflowEnabled: boolean
}

export interface LearningErrorResponse {
  action: 'retry' | 'quarantine' | 'manual_review' | 'skip' | 'escalate'
  message: string
  quarantineId?: string
  reviewWorkflowId?: string
  retryDelay?: number
  escalationLevel?: 'supervisor' | 'technical_team' | 'data_team'
  metadata: {
    errorType: string
    severity: string
    recoveryReason: string
    timestamp: Date
  }
}

export class LearningErrorHandler {
  private recoveryOptions: LearningRecoveryOptions
  private errorHistory: LearningError[]
  private quarantineStorage: Map<string, QuarantineData>
  private reviewWorkflows: Map<string, ManualReviewWorkflow>
  private maxHistorySize: number
  private dataValidator: DataValidator
  private reviewManager: ReviewManager

  constructor(options?: Partial<LearningRecoveryOptions>) {
    this.recoveryOptions = {
      enableRecording: true,
      enableQuarantine: true,
      enableManualReview: true,
      maxRetryAttempts: 3,
      quarantineThreshold: 2,
      autoRecoveryEnabled: true,
      reviewWorkflowEnabled: true,
      ...options
    }

    this.errorHistory = []
    this.quarantineStorage = new Map()
    this.reviewWorkflows = new Map()
    this.maxHistorySize = 200
    this.dataValidator = new DataValidator()
    this.reviewManager = new ReviewManager()
  }

  /**
   * Handle conversation recording failure
   */
  async handleRecordingFailure(
    sessionId: string,
    conversationId: string,
    error: any,
    conversationData?: any
  ): Promise<{ recovered: boolean; error?: LearningError; response?: LearningErrorResponse }> {
    
    const learningError = this.createLearningError(
      error,
      conversationId,
      'recording_failed',
      0,
      sessionId
    )
    
    this.addToErrorHistory(learningError)

    if (!this.recoveryOptions.enableRecording) {
      const response = await this.createErrorResponse(learningError, conversationData)
      return { recovered: false, error: learningError, response }
    }

    // Attempt recovery based on error severity
    if (learningError.severity === 'low' || learningError.severity === 'medium') {
      try {
        const recoveryResult = await this.attemptRecordingRecovery(sessionId, conversationId, conversationData)
        
        if (recoveryResult.success) {
          console.log(`Recording recovery successful for session ${sessionId}`)
          return { recovered: true }
        }
      } catch (recoveryError) {
        console.error('Recording recovery failed:', recoveryError)
      }
    }

    // If recovery fails or error is severe, handle appropriately
    const response = await this.createErrorResponse(learningError, conversationData)
    return { recovered: false, error: learningError, response }
  }

  /**
   * Handle learning data processing failure
   */
  async handleProcessingFailure(
    conversationId: string,
    processingData: any,
    error: any,
    retryCount: number = 0
  ): Promise<{ success: boolean; error?: LearningError; response?: LearningErrorResponse }> {
    
    const learningError = this.createLearningError(
      error,
      conversationId,
      'processing_failed',
      retryCount
    )
    
    this.addToErrorHistory(learningError)

    // Check if we should retry
    if (retryCount < this.recoveryOptions.maxRetryAttempts && this.shouldRetryProcessing(learningError)) {
      console.log(`Retrying learning data processing (attempt ${retryCount + 1}/${this.recoveryOptions.maxRetryAttempts})`)
      
      try {
        // Attempt to process again with cleaned data
        const cleanedData = await this.cleanProcessingData(processingData)
        const result = await this.processLearningData(cleanedData)
        
        if (result.success) {
          return { success: true }
        }
      } catch (retryError) {
        return this.handleProcessingFailure(conversationId, processingData, retryError, retryCount + 1)
      }
    }

    // Max retries reached or non-retryable error
    const response = await this.createErrorResponse(learningError, processingData)
    return { success: false, error: learningError, response }
  }

  /**
   * Quarantine problematic learning data
   */
  async quarantineData(
    data: any,
    reason: string,
    conversationId: string,
    errorType: LearningError['type']
  ): Promise<{ quarantined: boolean; quarantineId?: string; error?: LearningError }> {
    
    if (!this.recoveryOptions.enableQuarantine) {
      return { quarantined: false }
    }

    try {
      const quarantineId = this.generateQuarantineId()
      const quarantineData: QuarantineData = {
        id: quarantineId,
        originalData: data,
        errorReason: reason,
        quarantineTime: new Date(),
        reviewStatus: 'pending'
      }

      this.quarantineStorage.set(quarantineId, quarantineData)
      
      // Create manual review workflow if enabled
      if (this.recoveryOptions.reviewWorkflowEnabled) {
        await this.createReviewWorkflow(quarantineData, conversationId, errorType)
      }

      console.log(`Data quarantined with ID: ${quarantineId}`)
      return { quarantined: true, quarantineId }

    } catch (error) {
      const learningError = this.createLearningError(
        error,
        conversationId,
        'processing_failed',
        0,
        undefined,
        { operation: 'quarantine' }
      )
      
      this.addToErrorHistory(learningError)
      return { quarantined: false, error: learningError }
    }
  }

  /**
   * Create manual review workflow
   */
  async createReviewWorkflow(
    quarantineData: QuarantineData,
    conversationId: string,
    errorType: LearningError['type']
  ): Promise<{ created: boolean; workflowId?: string; error?: LearningError }> {
    
    if (!this.recoveryOptions.reviewWorkflowEnabled) {
      return { created: false }
    }

    try {
      const workflowId = this.generateWorkflowId()
      const priority = this.determinePriority(errorType, quarantineData.errorReason)
      
      const workflow: ManualReviewWorkflow = {
        id: workflowId,
        type: this.determineReviewType(errorType),
        priority,
        status: 'pending',
        createdAt: new Date(),
        dueDate: this.calculateDueDate(priority),
        data: quarantineData.originalData,
        context: {
          conversationId,
          errorType,
          originalError: this.findRelatedError(conversationId, errorType),
          relatedData: await this.findRelatedData(conversationId)
        }
      }

      this.reviewWorkflows.set(workflowId, workflow)
      
      // Assign to appropriate reviewer
      await this.assignReviewer(workflow)
      
      console.log(`Manual review workflow created: ${workflowId}`)
      return { created: true, workflowId }

    } catch (error) {
      const learningError = this.createLearningError(
        error,
        conversationId,
        'processing_failed',
        0,
        undefined,
        { operation: 'create_review_workflow' }
      )
      
      this.addToErrorHistory(learningError)
      return { created: false, error: learningError }
    }
  }

  /**
   * Process review workflow completion
   */
  async processReviewCompletion(
    workflowId: string,
    reviewResult: {
      approved: boolean
      notes?: string
      reviewedBy: string
      revisedData?: any
    }
  ): Promise<{ processed: boolean; error?: LearningError }> {
    
    const workflow = this.reviewWorkflows.get(workflowId)
    if (!workflow) {
      const error = new Error(`Review workflow not found: ${workflowId}`)
      const learningError = this.createLearningError(
        error,
        'unknown',
        'processing_failed',
        0,
        undefined,
        { operation: 'review_completion' }
      )
      
      return { processed: false, error: learningError }
    }

    try {
      // Update workflow status
      workflow.status = 'completed'
      workflow.reviewedBy = reviewResult.reviewedBy
      workflow.reviewedAt = new Date()

      // Update quarantine data if it exists
      const quarantineData = Array.from(this.quarantineStorage.values())
        .find(q => q.originalData === workflow.data)
      
      if (quarantineData) {
        quarantineData.reviewStatus = reviewResult.approved ? 'approved' : 'rejected'
        quarantineData.reviewNotes = reviewResult.notes
        quarantineData.reviewedBy = reviewResult.reviewedBy
        quarantineData.reviewedAt = new Date()

        // If approved, attempt to reintegrate the data
        if (reviewResult.approved) {
          const dataToIntegrate = reviewResult.revisedData || quarantineData.originalData
          await this.reintegrateData(dataToIntegrate, workflow.context.conversationId)
        }
      }

      console.log(`Review workflow completed: ${workflowId} (${reviewResult.approved ? 'approved' : 'rejected'})`)
      return { processed: true }

    } catch (error) {
      const learningError = this.createLearningError(
        error,
        workflow.context.conversationId,
        'processing_failed',
        0,
        undefined,
        { operation: 'review_completion', workflowId }
      )
      
      this.addToErrorHistory(learningError)
      return { processed: false, error: learningError }
    }
  }

  /**
   * Get quarantine statistics
   */
  getQuarantineStats(): {
    totalQuarantined: number
    pendingReview: number
    approved: number
    rejected: number
    oldestPending: Date | null
  } {
    const quarantineData = Array.from(this.quarantineStorage.values())
    
    const stats = {
      totalQuarantined: quarantineData.length,
      pendingReview: 0,
      approved: 0,
      rejected: 0,
      oldestPending: null as Date | null
    }

    quarantineData.forEach(data => {
      switch (data.reviewStatus) {
        case 'pending':
          stats.pendingReview++
          if (!stats.oldestPending || data.quarantineTime < stats.oldestPending) {
            stats.oldestPending = data.quarantineTime
          }
          break
        case 'approved':
          stats.approved++
          break
        case 'rejected':
          stats.rejected++
          break
      }
    })

    return stats
  }

  /**
   * Get review workflow statistics
   */
  getReviewWorkflowStats(): {
    totalWorkflows: number
    pending: number
    inProgress: number
    completed: number
    overdue: number
    averageCompletionTime: number
  } {
    const workflows = Array.from(this.reviewWorkflows.values())
    const now = new Date()
    
    const stats = {
      totalWorkflows: workflows.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      averageCompletionTime: 0
    }

    let totalCompletionTime = 0
    let completedCount = 0

    workflows.forEach(workflow => {
      switch (workflow.status) {
        case 'pending':
          stats.pending++
          if (workflow.dueDate && workflow.dueDate < now) {
            stats.overdue++
          }
          break
        case 'in_progress':
          stats.inProgress++
          if (workflow.dueDate && workflow.dueDate < now) {
            stats.overdue++
          }
          break
        case 'completed':
          stats.completed++
          if (workflow.reviewedAt) {
            const completionTime = workflow.reviewedAt.getTime() - workflow.createdAt.getTime()
            totalCompletionTime += completionTime
            completedCount++
          }
          break
      }
    })

    if (completedCount > 0) {
      stats.averageCompletionTime = totalCompletionTime / completedCount
    }

    return stats
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number
    errorsByType: Record<string, number>
    errorsBySeverity: Record<string, number>
    recentErrorRate: number
    recoveryRate: number
  } {
    const recentErrors = this.getRecentErrors(60 * 60 * 1000) // Last hour
    const errorsByType: Record<string, number> = {}
    const errorsBySeverity: Record<string, number> = {}
    
    let recoveredErrors = 0

    this.errorHistory.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1
      
      if (error.metadata?.recovered) {
        recoveredErrors++
      }
    })

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsBySeverity,
      recentErrorRate: recentErrors.length,
      recoveryRate: this.errorHistory.length > 0 ? recoveredErrors / this.errorHistory.length : 0
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
  updateRecoveryOptions(options: Partial<LearningRecoveryOptions>): void {
    this.recoveryOptions = { ...this.recoveryOptions, ...options }
  }

  /**
   * Create learning error
   */
  private createLearningError(
    error: any,
    conversationId: string,
    type: LearningError['type'],
    retryCount: number,
    sessionId?: string,
    additionalMetadata?: Record<string, any>
  ): LearningError {
    let message = 'Unknown learning system error occurred'
    let severity: LearningError['severity'] = 'medium'

    if (error instanceof Error) {
      message = error.message
      severity = this.determineSeverity(error, type)
    } else if (typeof error === 'string') {
      message = error
      severity = this.determineSeverity(new Error(error), type)
    }

    return {
      type,
      message,
      sessionId,
      conversationId,
      timestamp: new Date(),
      retryCount,
      severity,
      metadata: {
        errorName: error?.name,
        stack: error?.stack?.substring(0, 500),
        ...additionalMetadata
      }
    }
  }

  /**
   * Determine error severity
   */
  private determineSeverity(error: Error, type: LearningError['type']): LearningError['severity'] {
    const message = error.message.toLowerCase()
    
    // Critical errors
    if (message.includes('corruption') || message.includes('data loss') || type === 'data_corruption') {
      return 'critical'
    }
    
    // High severity errors
    if (message.includes('validation') || message.includes('security') || type === 'validation_failed') {
      return 'high'
    }
    
    // Medium severity errors
    if (type === 'processing_failed' || type === 'extraction_failed') {
      return 'medium'
    }
    
    // Low severity errors
    return 'low'
  }

  /**
   * Create error response
   */
  private async createErrorResponse(
    error: LearningError,
    data?: any
  ): Promise<LearningErrorResponse> {
    switch (error.type) {
      case 'recording_failed':
        if (error.severity === 'critical') {
          return {
            action: 'escalate',
            message: 'Critical recording failure detected. Escalating to technical team.',
            escalationLevel: 'technical_team',
            metadata: {
              errorType: error.type,
              severity: error.severity,
              recoveryReason: 'Critical system failure',
              timestamp: new Date()
            }
          }
        } else {
          return {
            action: 'skip',
            message: 'Recording failed but conversation can continue. Data will not be learned from this session.',
            metadata: {
              errorType: error.type,
              severity: error.severity,
              recoveryReason: 'Non-critical recording failure',
              timestamp: new Date()
            }
          }
        }

      case 'processing_failed':
        if (error.retryCount >= this.recoveryOptions.quarantineThreshold) {
          const quarantineResult = await this.quarantineData(data, error.message, error.conversationId, error.type)
          
          return {
            action: 'quarantine',
            message: 'Learning data processing failed multiple times. Data has been quarantined for manual review.',
            quarantineId: quarantineResult.quarantineId,
            metadata: {
              errorType: error.type,
              severity: error.severity,
              recoveryReason: 'Multiple processing failures',
              timestamp: new Date()
            }
          }
        } else {
          return {
            action: 'retry',
            message: 'Learning data processing failed. Will retry with cleaned data.',
            retryDelay: this.calculateRetryDelay(error.retryCount),
            metadata: {
              errorType: error.type,
              severity: error.severity,
              recoveryReason: 'Transient processing failure',
              timestamp: new Date()
            }
          }
        }

      case 'validation_failed':
        const quarantineResult = await this.quarantineData(data, error.message, error.conversationId, error.type)
        
        return {
          action: 'manual_review',
          message: 'Learning data failed validation. Requires manual review before integration.',
          quarantineId: quarantineResult.quarantineId,
          metadata: {
            errorType: error.type,
            severity: error.severity,
            recoveryReason: 'Data validation failure',
            timestamp: new Date()
          }
        }

      case 'data_corruption':
        return {
          action: 'escalate',
          message: 'Data corruption detected in learning system. Escalating to data team for investigation.',
          escalationLevel: 'data_team',
          metadata: {
            errorType: error.type,
            severity: error.severity,
            recoveryReason: 'Data integrity issue',
            timestamp: new Date()
          }
        }

      default:
        return {
          action: 'skip',
          message: 'Learning system encountered an error. Skipping this data to prevent system disruption.',
          metadata: {
            errorType: error.type,
            severity: error.severity,
            recoveryReason: 'Unknown error type',
            timestamp: new Date()
          }
        }
    }
  }

  /**
   * Attempt recording recovery
   */
  private async attemptRecordingRecovery(
    sessionId: string,
    conversationId: string,
    conversationData?: any
  ): Promise<{ success: boolean }> {
    try {
      // Mock recovery implementation
      // In real implementation, this would attempt to restore recording capability
      
      if (conversationData) {
        // Try to save the conversation data in a different format or location
        await this.saveConversationDataAlternative(sessionId, conversationId, conversationData)
      }
      
      // Simulate recovery success/failure
      return { success: Math.random() > 0.3 } // 70% success rate
      
    } catch (error) {
      console.error('Recording recovery attempt failed:', error)
      return { success: false }
    }
  }

  /**
   * Save conversation data using alternative method
   */
  private async saveConversationDataAlternative(
    sessionId: string,
    conversationId: string,
    data: any
  ): Promise<void> {
    // Mock alternative save implementation
    console.log(`Saving conversation data alternatively for session ${sessionId}`)
    // In real implementation, this might save to a backup location or different format
  }

  /**
   * Determine if processing should be retried
   */
  private shouldRetryProcessing(error: LearningError): boolean {
    // Don't retry validation failures or data corruption
    if (error.type === 'validation_failed' || error.type === 'data_corruption') {
      return false
    }

    // Don't retry critical errors
    if (error.severity === 'critical') {
      return false
    }

    return true
  }

  /**
   * Clean processing data for retry
   */
  private async cleanProcessingData(data: any): Promise<any> {
    // Mock data cleaning implementation
    // In real implementation, this would sanitize and validate the data
    return this.dataValidator.clean(data)
  }

  /**
   * Process learning data
   */
  private async processLearningData(data: any): Promise<{ success: boolean }> {
    // Mock processing implementation
    try {
      const isValid = await this.dataValidator.validate(data)
      return { success: isValid }
    } catch (error) {
      return { success: false }
    }
  }

  /**
   * Reintegrate approved data
   */
  private async reintegrateData(data: any, conversationId: string): Promise<void> {
    // Mock reintegration implementation
    console.log(`Reintegrating approved data for conversation ${conversationId}`)
    // In real implementation, this would add the data back to the learning system
  }

  /**
   * Generate unique quarantine ID
   */
  private generateQuarantineId(): string {
    return `quarantine_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Determine review priority
   */
  private determinePriority(
    errorType: LearningError['type'],
    errorReason: string
  ): ManualReviewWorkflow['priority'] {
    if (errorType === 'data_corruption' || errorReason.toLowerCase().includes('security')) {
      return 'urgent'
    } else if (errorType === 'validation_failed') {
      return 'high'
    } else if (errorType === 'processing_failed') {
      return 'normal'
    }
    return 'low'
  }

  /**
   * Determine review type
   */
  private determineReviewType(errorType: LearningError['type']): ManualReviewWorkflow['type'] {
    switch (errorType) {
      case 'validation_failed':
        return 'data_validation'
      case 'data_corruption':
        return 'error_investigation'
      case 'processing_failed':
        return 'quality_check'
      default:
        return 'content_review'
    }
  }

  /**
   * Calculate due date based on priority
   */
  private calculateDueDate(priority: ManualReviewWorkflow['priority']): Date {
    const now = new Date()
    const daysToAdd = {
      urgent: 1,
      high: 3,
      normal: 7,
      low: 14
    }
    
    return new Date(now.getTime() + daysToAdd[priority] * 24 * 60 * 60 * 1000)
  }

  /**
   * Assign reviewer to workflow
   */
  private async assignReviewer(workflow: ManualReviewWorkflow): Promise<void> {
    // Mock reviewer assignment
    const reviewers = ['reviewer1', 'reviewer2', 'reviewer3']
    workflow.assignedTo = reviewers[Math.floor(Math.random() * reviewers.length)]
  }

  /**
   * Find related error
   */
  private findRelatedError(conversationId: string, errorType: LearningError['type']): LearningError {
    return this.errorHistory
      .filter(error => error.conversationId === conversationId && error.type === errorType)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0] || 
      this.errorHistory[this.errorHistory.length - 1]
  }

  /**
   * Find related data
   */
  private async findRelatedData(conversationId: string): Promise<any[]> {
    // Mock related data finding
    return []
  }

  /**
   * Calculate retry delay
   */
  private calculateRetryDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 30000) // Max 30 seconds
  }

  /**
   * Add error to history with size management
   */
  private addToErrorHistory(error: LearningError): void {
    this.errorHistory.push(error)
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Get recent errors within time window
   */
  private getRecentErrors(timeWindowMs: number): LearningError[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs)
    return this.errorHistory.filter(error => error.timestamp >= cutoffTime)
  }
}

/**
 * Data Validator for learning data
 */
class DataValidator {
  async validate(data: any): Promise<boolean> {
    // Mock validation logic
    if (!data || typeof data !== 'object') {
      return false
    }
    
    // Simulate validation checks
    return Math.random() > 0.2 // 80% validation success rate
  }

  clean(data: any): any {
    // Mock data cleaning
    if (typeof data === 'object' && data !== null) {
      // Remove potentially problematic fields
      const cleaned = { ...data }
      delete cleaned.sensitive
      delete cleaned.corrupted
      return cleaned
    }
    return data
  }
}

/**
 * Review Manager for manual review workflows
 */
class ReviewManager {
  async createReview(workflow: ManualReviewWorkflow): Promise<void> {
    // Mock review creation
    console.log(`Creating review workflow: ${workflow.id}`)
  }

  async assignReviewer(workflowId: string, reviewerId: string): Promise<void> {
    // Mock reviewer assignment
    console.log(`Assigning reviewer ${reviewerId} to workflow ${workflowId}`)
  }
}

/**
 * Default learning recovery options
 */
export const DEFAULT_LEARNING_RECOVERY_OPTIONS: LearningRecoveryOptions = {
  enableRecording: true,
  enableQuarantine: true,
  enableManualReview: true,
  maxRetryAttempts: 3,
  quarantineThreshold: 2,
  autoRecoveryEnabled: true,
  reviewWorkflowEnabled: true
}
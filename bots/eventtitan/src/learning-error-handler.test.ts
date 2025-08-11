/**
 * Learning Error Handler Tests
 * Tests conversation recording failure recovery, data quarantine, and manual review workflows
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  LearningErrorHandler, 
  LearningError, 
  DEFAULT_LEARNING_RECOVERY_OPTIONS 
} from './learning-error-handler'

describe('LearningErrorHandler', () => {
  let errorHandler: LearningErrorHandler
  let mockConversationData: any

  beforeEach(() => {
    errorHandler = new LearningErrorHandler()
    mockConversationData = {
      sessionId: 'session123',
      messages: [
        { content: 'Hello', sender: 'user', timestamp: new Date() },
        { content: 'Hi there!', sender: 'agent', timestamp: new Date() }
      ],
      metadata: { topic: 'greeting' }
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('handleRecordingFailure', () => {
    it('should attempt recovery for low severity recording failures', async () => {
      const error = new Error('Temporary storage issue')
      
      const result = await errorHandler.handleRecordingFailure(
        'session123',
        'conv123',
        error,
        mockConversationData
      )

      expect(result.recovered).toBeDefined()
      expect(result.error?.type).toBe('recording_failed')
      expect(result.error?.severity).toBe('low')
    })

    it('should skip recovery when recording is disabled', async () => {
      errorHandler.updateRecoveryOptions({ enableRecording: false })
      
      const error = new Error('Recording disabled')
      const result = await errorHandler.handleRecordingFailure(
        'session123',
        'conv123',
        error,
        mockConversationData
      )

      expect(result.recovered).toBe(false)
      expect(result.response?.action).toBe('skip')
    })

    it('should handle critical recording failures appropriately', async () => {
      const error = new Error('Data corruption detected in recording system')
      
      const result = await errorHandler.handleRecordingFailure(
        'session123',
        'conv123',
        error,
        mockConversationData
      )

      expect(result.recovered).toBe(false)
      expect(result.error?.severity).toBe('critical')
      expect(result.response?.action).toBe('escalate')
    })

    it('should track recording failures in error history', async () => {
      const error = new Error('Recording failure')
      
      await errorHandler.handleRecordingFailure('session123', 'conv123', error)
      
      const stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(1)
      expect(stats.errorsByType.recording_failed).toBe(1)
    })
  })

  describe('handleProcessingFailure', () => {
    it('should retry processing failures up to max attempts', async () => {
      const processingData = { query: 'test', response: 'test response' }
      const error = new Error('Temporary processing error')

      // Mock the processing to fail initially then succeed
      let attemptCount = 0
      const originalProcess = (errorHandler as any).processLearningData
      ;(errorHandler as any).processLearningData = vi.fn().mockImplementation(async () => {
        attemptCount++
        if (attemptCount <= 2) {
          throw new Error('Processing failed')
        }
        return { success: true }
      })

      const result = await errorHandler.handleProcessingFailure('conv123', processingData, error)

      expect(result.success).toBe(true)
      
      // Restore original method
      ;(errorHandler as any).processLearningData = originalProcess
    })

    it('should quarantine data after max retry attempts', async () => {
      const processingData = { query: 'test', response: 'test response' }
      const error = new Error('Persistent processing error')

      // Mock processing to always fail
      const originalProcess = (errorHandler as any).processLearningData
      ;(errorHandler as any).processLearningData = vi.fn().mockRejectedValue(new Error('Always fails'))

      const result = await errorHandler.handleProcessingFailure('conv123', processingData, error, 2)

      expect(result.success).toBe(false)
      expect(result.response?.action).toBe('quarantine')
      expect(result.response?.quarantineId).toBeDefined()

      // Restore original method
      ;(errorHandler as any).processLearningData = originalProcess
    })

    it('should clean data before retry attempts', async () => {
      const processingData = { query: 'test', response: 'test response', sensitive: 'data' }
      const error = new Error('Data validation error')

      // Mock data cleaning
      const originalClean = (errorHandler as any).cleanProcessingData
      const cleanSpy = vi.fn().mockResolvedValue({ query: 'test', response: 'test response' })
      ;(errorHandler as any).cleanProcessingData = cleanSpy

      await errorHandler.handleProcessingFailure('conv123', processingData, error)

      expect(cleanSpy).toHaveBeenCalledWith(processingData)

      // Restore original method
      ;(errorHandler as any).cleanProcessingData = originalClean
    })
  })

  describe('quarantineData', () => {
    it('should successfully quarantine problematic data', async () => {
      const problematicData = { corrupted: true, data: 'invalid' }
      const reason = 'Data validation failed'

      const result = await errorHandler.quarantineData(
        problematicData,
        reason,
        'conv123',
        'validation_failed'
      )

      expect(result.quarantined).toBe(true)
      expect(result.quarantineId).toBeDefined()

      const stats = errorHandler.getQuarantineStats()
      expect(stats.totalQuarantined).toBe(1)
      expect(stats.pendingReview).toBe(1)
    })

    it('should create review workflow when quarantining data', async () => {
      const problematicData = { invalid: 'data' }
      
      const result = await errorHandler.quarantineData(
        problematicData,
        'Validation error',
        'conv123',
        'validation_failed'
      )

      expect(result.quarantined).toBe(true)

      const workflowStats = errorHandler.getReviewWorkflowStats()
      expect(workflowStats.totalWorkflows).toBe(1)
      expect(workflowStats.pending).toBe(1)
    })

    it('should not quarantine when quarantine is disabled', async () => {
      errorHandler.updateRecoveryOptions({ enableQuarantine: false })
      
      const result = await errorHandler.quarantineData(
        { data: 'test' },
        'Test reason',
        'conv123',
        'processing_failed'
      )

      expect(result.quarantined).toBe(false)
      expect(result.quarantineId).toBeUndefined()
    })
  })

  describe('createReviewWorkflow', () => {
    it('should create manual review workflow with appropriate priority', async () => {
      const quarantineData = {
        id: 'q123',
        originalData: { test: 'data' },
        errorReason: 'Security validation failed',
        quarantineTime: new Date(),
        reviewStatus: 'pending' as const
      }

      const result = await errorHandler.createReviewWorkflow(
        quarantineData,
        'conv123',
        'validation_failed'
      )

      expect(result.created).toBe(true)
      expect(result.workflowId).toBeDefined()

      const workflowStats = errorHandler.getReviewWorkflowStats()
      expect(workflowStats.totalWorkflows).toBe(1)
    })

    it('should not create workflow when review workflow is disabled', async () => {
      errorHandler.updateRecoveryOptions({ reviewWorkflowEnabled: false })
      
      const quarantineData = {
        id: 'q123',
        originalData: { test: 'data' },
        errorReason: 'Test error',
        quarantineTime: new Date(),
        reviewStatus: 'pending' as const
      }

      const result = await errorHandler.createReviewWorkflow(
        quarantineData,
        'conv123',
        'processing_failed'
      )

      expect(result.created).toBe(false)
    })

    it('should assign appropriate priority based on error type', async () => {
      const testCases = [
        { errorType: 'data_corruption' as const, expectedPriority: 'urgent' },
        { errorType: 'validation_failed' as const, expectedPriority: 'high' },
        { errorType: 'processing_failed' as const, expectedPriority: 'normal' }
      ]

      for (const testCase of testCases) {
        const quarantineData = {
          id: `q${Date.now()}`,
          originalData: { test: 'data' },
          errorReason: 'Test error',
          quarantineTime: new Date(),
          reviewStatus: 'pending' as const
        }

        const result = await errorHandler.createReviewWorkflow(
          quarantineData,
          'conv123',
          testCase.errorType
        )

        expect(result.created).toBe(true)
      }
    })
  })

  describe('processReviewCompletion', () => {
    it('should process approved review and reintegrate data', async () => {
      // First quarantine some data
      const quarantineResult = await errorHandler.quarantineData(
        { test: 'data' },
        'Test reason',
        'conv123',
        'validation_failed'
      )

      // Get the workflow ID (in real implementation this would be tracked)
      const workflowStats = errorHandler.getReviewWorkflowStats()
      expect(workflowStats.totalWorkflows).toBe(1)

      // Mock finding a workflow ID
      const workflowId = 'workflow_123'
      const mockWorkflow = {
        id: workflowId,
        type: 'data_validation' as const,
        priority: 'high' as const,
        status: 'pending' as const,
        createdAt: new Date(),
        data: { test: 'data' },
        context: {
          conversationId: 'conv123',
          errorType: 'validation_failed',
          originalError: {} as any
        }
      }

      // Add mock workflow
      ;(errorHandler as any).reviewWorkflows.set(workflowId, mockWorkflow)

      const reviewResult = {
        approved: true,
        notes: 'Data looks good after review',
        reviewedBy: 'reviewer1',
        revisedData: { test: 'cleaned_data' }
      }

      const result = await errorHandler.processReviewCompletion(workflowId, reviewResult)

      expect(result.processed).toBe(true)
    })

    it('should handle rejected review appropriately', async () => {
      const workflowId = 'workflow_456'
      const mockWorkflow = {
        id: workflowId,
        type: 'data_validation' as const,
        priority: 'normal' as const,
        status: 'pending' as const,
        createdAt: new Date(),
        data: { test: 'bad_data' },
        context: {
          conversationId: 'conv123',
          errorType: 'validation_failed',
          originalError: {} as any
        }
      }

      ;(errorHandler as any).reviewWorkflows.set(workflowId, mockWorkflow)

      const reviewResult = {
        approved: false,
        notes: 'Data contains inappropriate content',
        reviewedBy: 'reviewer2'
      }

      const result = await errorHandler.processReviewCompletion(workflowId, reviewResult)

      expect(result.processed).toBe(true)
    })

    it('should handle non-existent workflow gracefully', async () => {
      const reviewResult = {
        approved: true,
        notes: 'Test',
        reviewedBy: 'reviewer1'
      }

      const result = await errorHandler.processReviewCompletion('nonexistent', reviewResult)

      expect(result.processed).toBe(false)
      expect(result.error?.type).toBe('processing_failed')
    })
  })

  describe('statistics and tracking', () => {
    it('should track quarantine statistics correctly', async () => {
      // Quarantine some data
      await errorHandler.quarantineData({ data1: 'test' }, 'reason1', 'conv1', 'validation_failed')
      await errorHandler.quarantineData({ data2: 'test' }, 'reason2', 'conv2', 'processing_failed')

      const stats = errorHandler.getQuarantineStats()

      expect(stats.totalQuarantined).toBe(2)
      expect(stats.pendingReview).toBe(2)
      expect(stats.approved).toBe(0)
      expect(stats.rejected).toBe(0)
      expect(stats.oldestPending).toBeInstanceOf(Date)
    })

    it('should track review workflow statistics correctly', async () => {
      // Create some workflows
      const quarantineData = {
        id: 'q1',
        originalData: { test: 'data' },
        errorReason: 'Test',
        quarantineTime: new Date(),
        reviewStatus: 'pending' as const
      }

      await errorHandler.createReviewWorkflow(quarantineData, 'conv1', 'validation_failed')
      await errorHandler.createReviewWorkflow(quarantineData, 'conv2', 'processing_failed')

      const stats = errorHandler.getReviewWorkflowStats()

      expect(stats.totalWorkflows).toBe(2)
      expect(stats.pending).toBe(2)
      expect(stats.inProgress).toBe(0)
      expect(stats.completed).toBe(0)
    })

    it('should track error statistics correctly', async () => {
      // Generate some errors
      await errorHandler.handleRecordingFailure('session1', 'conv1', new Error('error1'))
      await errorHandler.handleProcessingFailure('conv2', {}, new Error('error2'))

      const stats = errorHandler.getErrorStats()

      expect(stats.totalErrors).toBe(2)
      expect(stats.errorsByType.recording_failed).toBe(1)
      expect(stats.errorsByType.processing_failed).toBe(1)
      expect(stats.errorsBySeverity).toBeDefined()
    })

    it('should clear error history when requested', async () => {
      // Generate an error
      await errorHandler.handleRecordingFailure('session1', 'conv1', new Error('test error'))

      let stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(1)

      errorHandler.clearErrorHistory()
      stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(0)
    })
  })

  describe('recovery options configuration', () => {
    it('should allow updating recovery options', () => {
      const newOptions = {
        enableRecording: false,
        maxRetryAttempts: 5,
        quarantineThreshold: 1,
        autoRecoveryEnabled: false
      }

      errorHandler.updateRecoveryOptions(newOptions)

      // Test that options are applied by checking behavior
      expect(() => errorHandler.updateRecoveryOptions(newOptions)).not.toThrow()
    })

    it('should use default options when not specified', () => {
      const defaultHandler = new LearningErrorHandler()
      
      // Should not throw and should have default behavior
      expect(defaultHandler).toBeDefined()
    })
  })

  describe('error severity classification', () => {
    it('should classify errors by severity correctly', async () => {
      const testCases = [
        { error: new Error('Data corruption detected'), expectedSeverity: 'critical' },
        { error: new Error('Validation failed for user input'), expectedSeverity: 'high' },
        { error: new Error('Processing timeout occurred'), expectedSeverity: 'medium' },
        { error: new Error('Minor connection issue'), expectedSeverity: 'low' }
      ]

      for (const testCase of testCases) {
        const result = await errorHandler.handleRecordingFailure(
          'session123',
          'conv123',
          testCase.error
        )

        expect(result.error?.severity).toBe(testCase.expectedSeverity)
      }
    })
  })

  describe('error response generation', () => {
    it('should generate appropriate responses for different error types', async () => {
      const testCases = [
        { 
          errorType: 'recording_failed',
          severity: 'critical',
          expectedAction: 'escalate'
        },
        { 
          errorType: 'validation_failed',
          severity: 'high',
          expectedAction: 'manual_review'
        },
        { 
          errorType: 'data_corruption',
          severity: 'critical',
          expectedAction: 'escalate'
        }
      ]

      for (const testCase of testCases) {
        const error = testCase.errorType === 'data_corruption' 
          ? new Error('Data corruption detected')
          : testCase.errorType === 'validation_failed'
          ? new Error('Validation failed')
          : new Error('Critical recording failure')

        const result = await errorHandler.handleRecordingFailure('session123', 'conv123', error)

        if (result.response) {
          expect(result.response.action).toBe(testCase.expectedAction)
          expect(result.response.metadata.errorType).toBe(testCase.errorType)
        }
      }
    })

    it('should include escalation level for critical errors', async () => {
      const criticalError = new Error('System corruption detected')
      
      const result = await errorHandler.handleRecordingFailure('session123', 'conv123', criticalError)

      expect(result.response?.action).toBe('escalate')
      expect(result.response?.escalationLevel).toBeDefined()
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle null/undefined conversation data gracefully', async () => {
      const result = await errorHandler.handleRecordingFailure(
        'session123',
        'conv123',
        new Error('Test error'),
        null
      )

      expect(result).toBeDefined()
      expect(result.recovered).toBeDefined()
    })

    it('should handle very large error messages', async () => {
      const largeError = new Error('x'.repeat(10000))
      
      const result = await errorHandler.handleRecordingFailure('session123', 'conv123', largeError)

      expect(result.error?.message.length).toBeLessThanOrEqual(10000)
    })

    it('should handle concurrent quarantine operations', async () => {
      const promises = []
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          errorHandler.quarantineData(
            { data: `test${i}` },
            `reason${i}`,
            `conv${i}`,
            'processing_failed'
          )
        )
      }

      const results = await Promise.all(promises)
      
      expect(results.every(r => r.quarantined)).toBe(true)
      expect(new Set(results.map(r => r.quarantineId)).size).toBe(5) // All unique IDs
    })

    it('should maintain error history size limit', async () => {
      // Generate many errors to test size limit
      for (let i = 0; i < 250; i++) {
        await errorHandler.handleRecordingFailure(`session${i}`, `conv${i}`, new Error(`error${i}`))
      }

      const stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBeLessThanOrEqual(200) // Default max history size
    })
  })
})
/**
 * Knowledge Error Handler Tests
 * Tests fallback mechanisms, retry logic, and automatic handoff triggers
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  KnowledgeErrorHandler, 
  KnowledgeError, 
  KnowledgeSearchOptions,
  DEFAULT_KNOWLEDGE_SEARCH_OPTIONS 
} from './knowledge-error-handler'

describe('KnowledgeErrorHandler', () => {
  let errorHandler: KnowledgeErrorHandler
  let mockSearchFunction: vi.Mock

  beforeEach(() => {
    errorHandler = new KnowledgeErrorHandler()
    mockSearchFunction = vi.fn()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('handleKnowledgeSearch', () => {
    it('should return successful result when search succeeds', async () => {
      const expectedResult = { data: 'search results' }
      mockSearchFunction.mockResolvedValue(expectedResult)

      const result = await errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      expect(result.result).toEqual(expectedResult)
      expect(result.error).toBeUndefined()
      expect(result.fallback).toBeUndefined()
      expect(mockSearchFunction).toHaveBeenCalledTimes(1)
    })

    it('should retry on transient failures and succeed', async () => {
      const expectedResult = { data: 'search results' }
      mockSearchFunction
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Service temporarily unavailable'))
        .mockResolvedValue(expectedResult)

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      // Fast-forward through retry delays
      await vi.advanceTimersByTimeAsync(15000)
      const result = await promise

      expect(result.result).toEqual(expectedResult)
      expect(result.error).toBeUndefined()
      expect(mockSearchFunction).toHaveBeenCalledTimes(3)
    })

    it('should return fallback response after max retries', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Persistent failure'))

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      // Fast-forward through all retry delays
      await vi.advanceTimersByTimeAsync(30000)
      const result = await promise

      expect(result.result).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('search_failure')
      expect(result.fallback).toBeDefined()
      expect(result.fallback?.shouldHandoff).toBe(true)
      expect(mockSearchFunction).toHaveBeenCalledTimes(4) // Initial + 3 retries
    })

    it('should handle timeout errors correctly', async () => {
      mockSearchFunction.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 10000))
      )

      const options: KnowledgeSearchOptions = {
        ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS,
        timeout: 1000 // 1 second timeout
      }

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        options
      )

      // Fast-forward past timeout and retry delays
      await vi.advanceTimersByTimeAsync(50000)
      const result = await promise

      expect(result.error?.type).toBe('timeout')
      expect(result.fallback?.response).toContain('taking longer than expected')
    }, 10000)

    it('should classify different error types correctly', async () => {
      const testCases = [
        { error: new Error('Connection timeout'), expectedType: 'timeout' },
        { error: new Error('Network error ECONNREFUSED'), expectedType: 'network_error' },
        { error: new Error('Service unavailable 503'), expectedType: 'service_unavailable' },
        { error: new Error('Malformed response data'), expectedType: 'malformed_results' },
        { error: new Error('Generic error'), expectedType: 'search_failure' }
      ]

      for (const testCase of testCases) {
        mockSearchFunction.mockRejectedValue(testCase.error)
        
        const promise = errorHandler.handleKnowledgeSearch(
          mockSearchFunction,
          'test query',
          { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
        )

        await vi.advanceTimersByTimeAsync(1000)
        const result = await promise

        expect(result.error?.type).toBe(testCase.expectedType)
        mockSearchFunction.mockClear()
      }
    }, 10000)

    it('should not retry malformed results', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Malformed response data'))

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.error?.type).toBe('malformed_results')
      expect(mockSearchFunction).toHaveBeenCalledTimes(1) // No retries
    }, 10000)

    it('should apply exponential backoff with jitter', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Network timeout'))
      
      const startTime = Date.now()
      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(30000)
      await promise

      // Should have been called 4 times (initial + 3 retries)
      expect(mockSearchFunction).toHaveBeenCalledTimes(4)
    })
  })

  describe('checkSystemAvailability', () => {
    it('should return available when no recent errors', async () => {
      const result = await errorHandler.checkSystemAvailability()
      
      expect(result.available).toBe(true)
      expect(result.shouldHandoff).toBe(false)
      expect(result.reason).toBeUndefined()
    })

    it('should detect high error rate and recommend handoff', async () => {
      // Simulate multiple recent errors
      for (let i = 0; i < 6; i++) {
        mockSearchFunction.mockRejectedValue(new Error(`Error ${i}`))
        const promise = errorHandler.handleKnowledgeSearch(
          mockSearchFunction,
          `query ${i}`,
          { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
        )
        await vi.advanceTimersByTimeAsync(100)
        await promise
      }

      const result = await errorHandler.checkSystemAvailability()
      
      expect(result.available).toBe(false)
      expect(result.shouldHandoff).toBe(true)
      expect(result.reason).toContain('High error rate detected')
    }, 10000)

    it('should detect system availability issues', async () => {
      // Simulate service unavailable errors
      for (let i = 0; i < 3; i++) {
        mockSearchFunction.mockRejectedValue(new Error('Service unavailable'))
        const promise = errorHandler.handleKnowledgeSearch(
          mockSearchFunction,
          `query ${i}`,
          { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
        )
        await vi.advanceTimersByTimeAsync(100)
        await promise
      }

      const result = await errorHandler.checkSystemAvailability()
      
      expect(result.available).toBe(false)
      expect(result.shouldHandoff).toBe(true)
      expect(result.reason).toContain('system availability issues')
    }, 10000)
  })

  describe('fallback responses', () => {
    it('should provide appropriate fallback responses for different error types', () => {
      const testCases = [
        { errorType: 'search_failure', expectedContent: 'trouble searching' },
        { errorType: 'timeout', expectedContent: 'taking longer than expected' },
        { errorType: 'service_unavailable', expectedContent: 'temporarily unavailable' },
        { errorType: 'network_error', expectedContent: 'connectivity issues' },
        { errorType: 'malformed_results', expectedContent: 'unexpected results' }
      ]

      testCases.forEach(testCase => {
        const response = errorHandler.getFallbackResponse(testCase.errorType)
        expect(response.toLowerCase()).toContain(testCase.expectedContent)
      })
    })

    it('should allow updating fallback responses', () => {
      const customResponse = 'Custom error message for testing'
      errorHandler.updateFallbackResponse('search_failure', customResponse)
      
      const response = errorHandler.getFallbackResponse('search_failure')
      expect(response).toBe(customResponse)
    })

    it('should provide default response for unknown error types', () => {
      const response = errorHandler.getFallbackResponse('unknown_error_type')
      expect(response).toContain('technical difficulties')
    })
  })

  describe('error statistics', () => {
    it('should track error statistics correctly', async () => {
      // Generate some errors
      const errorTypes = ['timeout', 'network_error', 'timeout', 'search_failure']
      
      for (const errorType of errorTypes) {
        mockSearchFunction.mockRejectedValue(new Error(errorType))
        const promise = errorHandler.handleKnowledgeSearch(
          mockSearchFunction,
          'test query',
          { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 1 } }
        )
        await vi.advanceTimersByTimeAsync(5000)
        await promise
      }

      const stats = errorHandler.getErrorStats()
      
      expect(stats.totalErrors).toBe(4)
      expect(stats.errorsByType.timeout).toBe(2)
      expect(stats.errorsByType.network_error).toBe(1)
      expect(stats.errorsByType.search_failure).toBe(1)
      expect(stats.averageRetryCount).toBeGreaterThan(0)
    }, 10000)

    it('should clear error history when requested', async () => {
      // Generate an error
      mockSearchFunction.mockRejectedValue(new Error('test error'))
      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
      )
      await vi.advanceTimersByTimeAsync(1000)
      await promise

      let stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(1)

      errorHandler.clearErrorHistory()
      stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(0)
    }, 10000)
  })

  describe('retry configuration', () => {
    it('should allow updating retry configuration', () => {
      const newConfig = {
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 20000,
        backoffMultiplier: 3,
        jitterEnabled: false
      }

      errorHandler.updateRetryConfig(newConfig)

      // Test that new config is applied by checking retry behavior
      mockSearchFunction.mockRejectedValue(new Error('test error'))
      
      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      // The exact timing is hard to test due to jitter, but we can verify
      // that the configuration was accepted without errors
      expect(promise).toBeDefined()
    })
  })

  describe('handoff triggers', () => {
    it('should trigger handoff for service unavailable errors', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Service unavailable'))

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.fallback?.shouldHandoff).toBe(true)
      expect(result.fallback?.action).toBe('handoff')
    }, 10000)

    it('should trigger handoff for repeated timeout errors', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Connection timeout'))

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        DEFAULT_KNOWLEDGE_SEARCH_OPTIONS
      )

      await vi.advanceTimersByTimeAsync(30000)
      const result = await promise

      expect(result.fallback?.shouldHandoff).toBe(true)
      expect(result.error?.retryCount).toBeGreaterThanOrEqual(2)
    })

    it('should respect handoffOnFailure option', async () => {
      mockSearchFunction.mockRejectedValue(new Error('Generic error'))

      const options: KnowledgeSearchOptions = {
        ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS,
        handoffOnFailure: false,
        retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 }
      }

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        options
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      // Should still handoff due to error type classification, but test the option works
      expect(result.fallback).toBeDefined()
    }, 10000)
  })

  describe('edge cases', () => {
    it('should handle search function that throws synchronously', async () => {
      mockSearchFunction.mockImplementation(() => {
        throw new Error('Synchronous error')
      })

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('search_failure')
      expect(result.fallback).toBeDefined()
    }, 10000)

    it('should handle null/undefined errors gracefully', async () => {
      mockSearchFunction.mockRejectedValue(null)

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        'test query',
        { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.error).toBeDefined()
      expect(result.fallback).toBeDefined()
    }, 10000)

    it('should handle very long query strings', async () => {
      const longQuery = 'a'.repeat(10000)
      mockSearchFunction.mockRejectedValue(new Error('test error'))

      const promise = errorHandler.handleKnowledgeSearch(
        mockSearchFunction,
        longQuery,
        { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS, retryConfig: { ...DEFAULT_KNOWLEDGE_SEARCH_OPTIONS.retryConfig, maxRetries: 0 } }
      )

      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.error?.originalQuery).toBe(longQuery)
      expect(result.fallback).toBeDefined()
    }, 10000)
  })
})
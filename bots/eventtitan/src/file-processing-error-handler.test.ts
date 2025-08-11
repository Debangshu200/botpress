/**
 * File Processing Error Handler Tests
 * Tests file validation, upload error handling, and progressive upload functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { 
  FileProcessingErrorHandler, 
  FileProcessingError, 
  UploadedFile,
  DEFAULT_FILE_PROCESSING_OPTIONS 
} from './file-processing-error-handler'

describe('FileProcessingErrorHandler', () => {
  let errorHandler: FileProcessingErrorHandler
  let mockUploadFunction: vi.Mock
  let mockFile: UploadedFile

  beforeEach(() => {
    errorHandler = new FileProcessingErrorHandler()
    mockUploadFunction = vi.fn()
    mockFile = {
      name: 'test-document.txt',
      size: 1024, // 1KB
      type: 'text/plain',
      content: 'This is test content for the file'
    }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('validateFile', () => {
    it('should validate a correct file successfully', () => {
      const result = errorHandler.validateFile(mockFile)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject unsupported file formats', () => {
      const unsupportedFile: UploadedFile = {
        ...mockFile,
        type: 'application/x-executable',
        name: 'program.exe'
      }

      const result = errorHandler.validateFile(unsupportedFile)

      expect(result.valid).toBe(false)
      expect(result.errors.some(error => error.includes('not supported'))).toBe(true)
      expect(result.supportedAlternatives).toBeDefined()
    })

    it('should reject files that are too large', () => {
      const largeFile: UploadedFile = {
        ...mockFile,
        size: 20 * 1024 * 1024 // 20MB, larger than default 10MB limit
      }

      const result = errorHandler.validateFile(largeFile)

      expect(result.valid).toBe(false)
      expect(result.errors.some(error => error.includes('exceeds maximum'))).toBe(true)
    })

    it('should reject empty files', () => {
      const emptyFile: UploadedFile = {
        ...mockFile,
        size: 0,
        content: ''
      }

      const result = errorHandler.validateFile(emptyFile)

      expect(result.valid).toBe(false)
      expect(result.errors.some(error => error.includes('empty'))).toBe(true)
    })

    it('should reject files without names', () => {
      const unnamedFile: UploadedFile = {
        ...mockFile,
        name: ''
      }

      const result = errorHandler.validateFile(unnamedFile)

      expect(result.valid).toBe(false)
      expect(result.errors.some(error => error.includes('name is required'))).toBe(true)
    })

    it('should warn about very long file names', () => {
      const longNameFile: UploadedFile = {
        ...mockFile,
        name: 'a'.repeat(300) + '.txt'
      }

      const result = errorHandler.validateFile(longNameFile)

      expect(result.warnings.some(warning => warning.includes('very long'))).toBe(true)
    })

    it('should warn about large files suitable for progressive upload', () => {
      const largeFile: UploadedFile = {
        ...mockFile,
        size: 6 * 1024 * 1024 // 6MB, over 50% of 10MB limit
      }

      const result = errorHandler.validateFile(largeFile)

      expect(result.warnings.some(warning => warning.includes('progressive upload'))).toBe(true)
    })
  })

  describe('handleFileUpload', () => {
    it('should successfully upload a valid file', async () => {
      const expectedResult = { uploadId: 'upload123', status: 'success' }
      mockUploadFunction.mockResolvedValue(expectedResult)

      const result = await errorHandler.handleFileUpload(mockFile, mockUploadFunction)

      expect(result.success).toBe(true)
      expect(result.result).toEqual(expectedResult)
      expect(result.error).toBeUndefined()
      expect(mockUploadFunction).toHaveBeenCalledTimes(1)
    })

    it('should retry failed uploads and succeed', async () => {
      const expectedResult = { uploadId: 'upload123', status: 'success' }
      mockUploadFunction
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Server busy'))
        .mockResolvedValue(expectedResult)

      const promise = errorHandler.handleFileUpload(mockFile, mockUploadFunction)

      // Fast-forward through retry delays
      await vi.advanceTimersByTimeAsync(15000)
      const result = await promise

      expect(result.success).toBe(true)
      expect(result.result).toEqual(expectedResult)
      expect(mockUploadFunction).toHaveBeenCalledTimes(3)
    })

    it('should return error response after max retries', async () => {
      mockUploadFunction.mockRejectedValue(new Error('Persistent upload failure'))

      const promise = errorHandler.handleFileUpload(mockFile, mockUploadFunction)

      // Fast-forward through all retry delays
      await vi.advanceTimersByTimeAsync(30000)
      const result = await promise

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.type).toBe('upload_failed')
      expect(result.response).toBeDefined()
      expect(mockUploadFunction).toHaveBeenCalledTimes(4) // Initial + 3 retries
    })

    it('should handle validation failures', async () => {
      const invalidFile: UploadedFile = {
        ...mockFile,
        type: 'application/x-virus',
        size: 0
      }

      const result = await errorHandler.handleFileUpload(invalidFile, mockUploadFunction)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('validation_failed')
      expect(result.response?.action).toBe('reject')
      expect(mockUploadFunction).not.toHaveBeenCalled()
    })

    it('should classify different error types correctly', async () => {
      const testCases = [
        { error: new Error('Network connection failed'), expectedType: 'network_error' },
        { error: new Error('File too large for processing'), expectedType: 'file_too_large' },
        { error: new Error('Unsupported file format detected'), expectedType: 'unsupported_format' },
        { error: new Error('Processing failed due to corruption'), expectedType: 'processing_failed' },
        { error: new Error('Generic upload error'), expectedType: 'upload_failed' }
      ]

      for (const testCase of testCases) {
        mockUploadFunction.mockRejectedValue(testCase.error)
        
        const promise = errorHandler.handleFileUpload(mockFile, mockUploadFunction)
        await vi.advanceTimersByTimeAsync(1000)
        const result = await promise

        expect(result.error?.type).toBe(testCase.expectedType)
        mockUploadFunction.mockClear()
      }
    })

    it('should not retry validation failures', async () => {
      mockUploadFunction.mockRejectedValue(new Error('Unsupported file format'))

      const promise = errorHandler.handleFileUpload(mockFile, mockUploadFunction)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise

      expect(result.error?.type).toBe('unsupported_format')
      expect(mockUploadFunction).toHaveBeenCalledTimes(1) // No retries
    })
  })

  describe('handleProgressiveUpload', () => {
    let mockChunkUploadFunction: vi.Mock

    beforeEach(() => {
      mockChunkUploadFunction = vi.fn()
    })

    it('should successfully upload file in chunks', async () => {
      const largeFile: UploadedFile = {
        ...mockFile,
        size: 3 * 1024 * 1024, // 3MB
        content: Buffer.alloc(3 * 1024 * 1024, 'a')
      }

      mockChunkUploadFunction.mockResolvedValue({ chunkId: 'chunk123', status: 'success' })

      const result = await errorHandler.handleProgressiveUpload(largeFile, mockChunkUploadFunction)

      expect(result.success).toBe(true)
      expect(result.result).toBeDefined()
      expect(mockChunkUploadFunction).toHaveBeenCalledTimes(3) // 3 chunks for 3MB file with 1MB chunks
    })

    it('should handle chunk upload failures with retry', async () => {
      const smallFile: UploadedFile = {
        ...mockFile,
        content: Buffer.alloc(2048, 'a') // 2KB file
      }

      mockChunkUploadFunction
        .mockRejectedValueOnce(new Error('Chunk upload failed'))
        .mockResolvedValue({ chunkId: 'chunk123', status: 'success' })

      const result = await errorHandler.handleProgressiveUpload(smallFile, mockChunkUploadFunction)

      expect(result.success).toBe(true)
      expect(mockChunkUploadFunction).toHaveBeenCalledTimes(3) // Initial failure + retry + second chunk
    })

    it('should fail when file requires too many chunks', async () => {
      const hugeFile: UploadedFile = {
        ...mockFile,
        size: 200 * 1024 * 1024, // 200MB file would require 200 chunks (over limit of 100)
        content: Buffer.alloc(200 * 1024 * 1024, 'a')
      }

      const result = await errorHandler.handleProgressiveUpload(hugeFile, mockChunkUploadFunction)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('file_too_large')
      expect(mockChunkUploadFunction).not.toHaveBeenCalled()
    })

    it('should handle chunk retry failures', async () => {
      const smallFile: UploadedFile = {
        ...mockFile,
        content: Buffer.alloc(1024, 'a')
      }

      // Mock chunk upload to fail consistently
      mockChunkUploadFunction.mockRejectedValue(new Error('Persistent chunk failure'))

      const result = await errorHandler.handleProgressiveUpload(smallFile, mockChunkUploadFunction)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('upload_failed')
      expect(result.response).toBeDefined()
    })
  })

  describe('compressFile', () => {
    it('should successfully compress a file', async () => {
      const compressionOptions = {
        targetSize: mockFile.size * 0.5,
        quality: 0.8
      }

      const result = await errorHandler.compressFile(mockFile, compressionOptions)

      expect(result.success).toBe(true)
      expect(result.compressedFile).toBeDefined()
      expect(result.compressedFile!.size).toBeLessThan(mockFile.size)
      expect(result.compressedFile!.name).toContain('compressed')
    })

    it('should handle compression failures', async () => {
      // Mock compression failure by using invalid options
      const invalidOptions = {
        targetSize: -1,
        quality: 2.0 // Invalid quality > 1
      }

      // Override the compression logic to throw an error
      const originalCompress = errorHandler.compressFile
      errorHandler.compressFile = vi.fn().mockRejectedValue(new Error('Compression failed'))

      const result = await errorHandler.compressFile(mockFile, invalidOptions)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('processing_failed')

      // Restore original method
      errorHandler.compressFile = originalCompress
    })
  })

  describe('supported formats management', () => {
    it('should return list of supported formats', () => {
      const formats = errorHandler.getSupportedFormats()

      expect(formats).toContain('text/plain')
      expect(formats).toContain('application/pdf')
      expect(formats.length).toBeGreaterThan(0)
    })

    it('should allow adding new supported formats', () => {
      const newFormat = 'application/custom-format'
      
      errorHandler.addSupportedFormat(newFormat)
      const formats = errorHandler.getSupportedFormats()

      expect(formats).toContain(newFormat)
    })

    it('should validate files with newly added formats', () => {
      const customFormat = 'application/test-format'
      const customFile: UploadedFile = {
        ...mockFile,
        type: customFormat,
        name: 'test.custom'
      }

      // Should fail validation initially
      let result = errorHandler.validateFile(customFile)
      expect(result.valid).toBe(false)

      // Add format and try again
      errorHandler.addSupportedFormat(customFormat)
      result = errorHandler.validateFile(customFile)
      expect(result.valid).toBe(true)
    })
  })

  describe('error statistics and tracking', () => {
    it('should track error statistics correctly', async () => {
      // Generate some errors
      const errorFiles = [
        { ...mockFile, type: 'application/unknown', name: 'test1.unknown' },
        { ...mockFile, size: 50 * 1024 * 1024, name: 'test2.txt' }, // Too large
        { ...mockFile, size: 0, name: 'test3.txt' } // Empty
      ]

      for (const file of errorFiles) {
        await errorHandler.handleFileUpload(file, mockUploadFunction)
      }

      const stats = errorHandler.getErrorStats()

      expect(stats.totalErrors).toBe(3)
      expect(stats.errorsByType.validation_failed).toBe(3)
      expect(stats.errorsByFormat['application/unknown']).toBe(1)
      expect(stats.averageFileSize).toBeGreaterThan(0)
    })

    it('should clear error history when requested', async () => {
      // Generate an error
      const invalidFile: UploadedFile = { ...mockFile, size: 0 }
      await errorHandler.handleFileUpload(invalidFile, mockUploadFunction)

      let stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(1)

      errorHandler.clearErrorHistory()
      stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBe(0)
    })

    it('should maintain error history size limit', async () => {
      // Generate many errors to test size limit
      for (let i = 0; i < 120; i++) {
        const errorFile: UploadedFile = { ...mockFile, size: 0, name: `test${i}.txt` }
        await errorHandler.handleFileUpload(errorFile, mockUploadFunction)
      }

      const stats = errorHandler.getErrorStats()
      expect(stats.totalErrors).toBeLessThanOrEqual(100) // Default max history size
    })
  })

  describe('processing options configuration', () => {
    it('should allow updating processing options', () => {
      const newOptions = {
        maxFileSize: 20 * 1024 * 1024, // 20MB
        supportedFormats: ['text/plain', 'application/json'],
        enableCompression: false
      }

      errorHandler.updateProcessingOptions(newOptions)

      // Test that new max file size is applied
      const largeFile: UploadedFile = {
        ...mockFile,
        size: 15 * 1024 * 1024 // 15MB, should now be valid
      }

      const result = errorHandler.validateFile(largeFile)
      expect(result.valid).toBe(true)

      // Test that new supported formats are applied
      const formats = errorHandler.getSupportedFormats()
      expect(formats).toEqual(expect.arrayContaining(['text/plain', 'application/json']))
    })

    it('should use default options when not specified', () => {
      const defaultHandler = new FileProcessingErrorHandler()
      const formats = defaultHandler.getSupportedFormats()

      expect(formats.length).toBeGreaterThan(0)
      expect(formats).toContain('text/plain')
    })
  })

  describe('error response generation', () => {
    it('should generate appropriate responses for different error types', async () => {
      const testCases = [
        { 
          file: { ...mockFile, type: 'application/unknown' }, 
          expectedAction: 'reject',
          expectedMessage: 'not supported'
        },
        { 
          file: { ...mockFile, size: 50 * 1024 * 1024 }, 
          expectedAction: 'progressive_upload',
          expectedMessage: 'exceeds the maximum'
        },
        { 
          file: { ...mockFile, size: 0 }, 
          expectedAction: 'reject',
          expectedMessage: 'empty'
        }
      ]

      for (const testCase of testCases) {
        const result = await errorHandler.handleFileUpload(testCase.file, mockUploadFunction)

        expect(result.response?.action).toBe(testCase.expectedAction)
        expect(result.response?.message.toLowerCase()).toContain(testCase.expectedMessage)
        expect(result.response?.metadata).toBeDefined()
      }
    })

    it('should include helpful suggestions in error responses', async () => {
      const unsupportedFile: UploadedFile = {
        ...mockFile,
        type: 'application/x-unknown',
        name: 'document.unknown'
      }

      const result = await errorHandler.handleFileUpload(unsupportedFile, mockUploadFunction)

      expect(result.response?.suggestedActions).toBeDefined()
      expect(result.response?.suggestedActions?.length).toBeGreaterThan(0)
      expect(result.response?.suggestedActions?.some(action => 
        action.toLowerCase().includes('convert') || action.toLowerCase().includes('format')
      )).toBe(true)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle files with unusual content types', async () => {
      const weirdFile: UploadedFile = {
        name: 'test.txt',
        size: 100,
        type: '', // Empty content type
        content: 'test content'
      }

      const result = await errorHandler.handleFileUpload(weirdFile, mockUploadFunction)

      expect(result).toBeDefined()
      expect(result.success).toBeDefined()
    })

    it('should handle very large file names gracefully', async () => {
      const longNameFile: UploadedFile = {
        ...mockFile,
        name: 'a'.repeat(1000) + '.txt'
      }

      const result = errorHandler.validateFile(longNameFile)

      expect(result.warnings.some(warning => warning.includes('very long'))).toBe(true)
    })

    it('should handle files with special characters in names', async () => {
      const specialFile: UploadedFile = {
        ...mockFile,
        name: 'test-file_with@special#chars$.txt'
      }

      const result = errorHandler.validateFile(specialFile)

      // Should not fail validation just because of special characters
      expect(result.valid).toBe(true)
    })

    it('should handle null/undefined file content gracefully', async () => {
      const nullContentFile: UploadedFile = {
        ...mockFile,
        content: null as any
      }

      // Should not throw an error
      expect(() => errorHandler.validateFile(nullContentFile)).not.toThrow()
    })
  })
})
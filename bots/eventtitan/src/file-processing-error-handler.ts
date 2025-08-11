/**
 * File Processing Error Handler
 * Implements error handling for file uploads, format validation, and progressive upload options
 */

export interface FileProcessingError {
  type: 'unsupported_format' | 'file_too_large' | 'upload_failed' | 'processing_failed' | 'validation_failed' | 'network_error'
  message: string
  fileName: string
  fileSize?: number
  fileType?: string
  timestamp: Date
  retryCount: number
  metadata?: Record<string, any>
}

export interface FileValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  supportedAlternatives?: string[]
}

export interface ProgressiveUploadOptions {
  chunkSize: number // bytes
  maxChunks: number
  compressionEnabled: boolean
  retryFailedChunks: boolean
}

export interface FileProcessingOptions {
  maxFileSize: number // bytes
  supportedFormats: string[]
  enableCompression: boolean
  enableProgressiveUpload: boolean
  progressiveUploadOptions: ProgressiveUploadOptions
  retryOptions: {
    maxRetries: number
    baseDelay: number
    maxDelay: number
  }
}

export interface FileProcessingResponse {
  action: 'retry' | 'progressive_upload' | 'compress' | 'reject' | 'inform_user'
  message: string
  suggestedActions?: string[]
  progressiveUploadOptions?: ProgressiveUploadOptions
  compressionOptions?: CompressionOptions
  retryDelay?: number
  metadata: {
    errorType: string
    processingReason: string
    timestamp: Date
  }
}

export interface CompressionOptions {
  targetSize: number
  quality: number
  format?: string
}

export interface UploadedFile {
  name: string
  size: number
  type: string
  content: Buffer | ArrayBuffer | string
  lastModified?: Date
}

export class FileProcessingErrorHandler {
  private processingOptions: FileProcessingOptions
  private errorHistory: FileProcessingError[]
  private maxHistorySize: number
  private supportedFormats: Set<string>
  private formatProcessors: Map<string, FormatProcessor>

  constructor(options?: Partial<FileProcessingOptions>) {
    this.processingOptions = {
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      supportedFormats: [
        'text/plain', 'text/html', 'text/markdown', 'text/csv',
        'application/pdf', 'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/json', 'application/xml'
      ],
      enableCompression: true,
      enableProgressiveUpload: true,
      progressiveUploadOptions: {
        chunkSize: 1024 * 1024, // 1MB chunks
        maxChunks: 100,
        compressionEnabled: true,
        retryFailedChunks: true
      },
      retryOptions: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000
      },
      ...options
    }

    this.errorHistory = []
    this.maxHistorySize = 100
    this.supportedFormats = new Set(this.processingOptions.supportedFormats)
    this.formatProcessors = new Map()
    
    this.initializeFormatProcessors()
  }

  /**
   * Handle file upload with comprehensive error handling
   */
  async handleFileUpload(
    file: UploadedFile,
    uploadFunction: (file: UploadedFile) => Promise<any>
  ): Promise<{ success: boolean; result?: any; error?: FileProcessingError; response?: FileProcessingResponse }> {
    
    // Step 1: Validate file
    const validation = this.validateFile(file)
    if (!validation.valid) {
      const error = this.createFileProcessingError(
        new Error(validation.errors.join('; ')),
        file,
        'validation_failed',
        0
      )
      this.addToErrorHistory(error)
      
      const response = await this.createErrorResponse(error, file)
      return { success: false, error, response }
    }

    // Step 2: Attempt upload with retry logic
    let lastError: FileProcessingError | undefined
    
    for (let attempt = 0; attempt <= this.processingOptions.retryOptions.maxRetries; attempt++) {
      try {
        const result = await uploadFunction(file)
        
        if (attempt > 0) {
          console.log(`File upload succeeded on attempt ${attempt + 1} for file: ${file.name}`)
        }
        
        return { success: true, result }
        
      } catch (error) {
        const fileError = this.createFileProcessingError(error, file, this.classifyError(error), attempt)
        lastError = fileError
        
        this.logError(fileError)
        this.addToErrorHistory(fileError)
        
        // Check if we should retry
        if (attempt < this.processingOptions.retryOptions.maxRetries && this.shouldRetry(fileError)) {
          const delay = this.calculateRetryDelay(attempt)
          console.log(`Retrying file upload in ${delay}ms (attempt ${attempt + 1}/${this.processingOptions.retryOptions.maxRetries})`)
          await this.sleep(delay)
          continue
        }
        
        break
      }
    }

    // All retries exhausted, handle the failure
    if (lastError) {
      const response = await this.createErrorResponse(lastError, file)
      return { success: false, error: lastError, response }
    }

    // This shouldn't happen, but handle gracefully
    const unknownError = this.createFileProcessingError(
      new Error('Unknown error occurred during file upload'),
      file,
      'upload_failed',
      0
    )
    const response = await this.createErrorResponse(unknownError, file)
    return { success: false, error: unknownError, response }
  }

  /**
   * Validate file format, size, and content
   */
  validateFile(file: UploadedFile): FileValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const supportedAlternatives: string[] = []

    // Check file size
    if (file.size > this.processingOptions.maxFileSize) {
      errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(this.processingOptions.maxFileSize)})`)
    }

    // Check file format
    if (!this.supportedFormats.has(file.type)) {
      errors.push(`File format '${file.type}' is not supported`)
      
      // Suggest alternatives based on file extension
      const alternatives = this.getSuggestedFormats(file.name)
      supportedAlternatives.push(...alternatives)
    }

    // Check file name
    if (!file.name || file.name.trim().length === 0) {
      errors.push('File name is required')
    }

    // Check for potentially problematic file names
    if (file.name.length > 255) {
      warnings.push('File name is very long and may cause issues')
    }

    // Check for empty files
    if (file.size === 0) {
      errors.push('File appears to be empty')
    }

    // Check for very large files that might benefit from progressive upload
    if (file.size > this.processingOptions.maxFileSize * 0.5 && this.processingOptions.enableProgressiveUpload) {
      warnings.push('Large file detected - progressive upload recommended')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      supportedAlternatives: supportedAlternatives.length > 0 ? supportedAlternatives : undefined
    }
  }

  /**
   * Handle progressive upload for large files
   */
  async handleProgressiveUpload(
    file: UploadedFile,
    uploadChunkFunction: (chunk: FileChunk, chunkIndex: number, totalChunks: number) => Promise<any>
  ): Promise<{ success: boolean; result?: any; error?: FileProcessingError; response?: FileProcessingResponse }> {
    
    const options = this.processingOptions.progressiveUploadOptions
    const chunks = this.createFileChunks(file, options.chunkSize)
    
    if (chunks.length > options.maxChunks) {
      const error = this.createFileProcessingError(
        new Error(`File requires ${chunks.length} chunks, but maximum allowed is ${options.maxChunks}`),
        file,
        'file_too_large',
        0
      )
      this.addToErrorHistory(error)
      
      const response = await this.createErrorResponse(error, file)
      return { success: false, error, response }
    }

    const results: any[] = []
    const failedChunks: number[] = []

    // Upload chunks
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await uploadChunkFunction(chunks[i], i, chunks.length)
        results.push(result)
        
      } catch (error) {
        console.error(`Failed to upload chunk ${i + 1}/${chunks.length}:`, error)
        failedChunks.push(i)
        
        if (!options.retryFailedChunks) {
          const fileError = this.createFileProcessingError(
            error,
            file,
            'upload_failed',
            0,
            { chunkIndex: i, totalChunks: chunks.length }
          )
          this.addToErrorHistory(fileError)
          
          const response = await this.createErrorResponse(fileError, file)
          return { success: false, error: fileError, response }
        }
      }
    }

    // Retry failed chunks if enabled
    if (failedChunks.length > 0 && options.retryFailedChunks) {
      console.log(`Retrying ${failedChunks.length} failed chunks...`)
      
      for (const chunkIndex of failedChunks) {
        try {
          const result = await uploadChunkFunction(chunks[chunkIndex], chunkIndex, chunks.length)
          results[chunkIndex] = result
          
        } catch (error) {
          const fileError = this.createFileProcessingError(
            error,
            file,
            'upload_failed',
            1,
            { chunkIndex, totalChunks: chunks.length, retryAttempt: true }
          )
          this.addToErrorHistory(fileError)
          
          const response = await this.createErrorResponse(fileError, file)
          return { success: false, error: fileError, response }
        }
      }
    }

    return { success: true, result: results }
  }

  /**
   * Compress file to reduce size
   */
  async compressFile(file: UploadedFile, options: CompressionOptions): Promise<{ success: boolean; compressedFile?: UploadedFile; error?: FileProcessingError }> {
    try {
      // Mock compression implementation
      // In real implementation, this would use appropriate compression libraries
      const compressionRatio = Math.min(0.8, options.targetSize / file.size)
      const compressedSize = Math.floor(file.size * compressionRatio)
      
      const compressedFile: UploadedFile = {
        ...file,
        name: this.addCompressionSuffix(file.name),
        size: compressedSize,
        content: file.content // In real implementation, this would be compressed content
      }

      console.log(`File compressed from ${this.formatFileSize(file.size)} to ${this.formatFileSize(compressedSize)}`)
      
      return { success: true, compressedFile }
      
    } catch (error) {
      const fileError = this.createFileProcessingError(
        error,
        file,
        'processing_failed',
        0,
        { operation: 'compression' }
      )
      this.addToErrorHistory(fileError)
      
      return { success: false, error: fileError }
    }
  }

  /**
   * Get supported file formats
   */
  getSupportedFormats(): string[] {
    return Array.from(this.supportedFormats)
  }

  /**
   * Add supported format
   */
  addSupportedFormat(format: string): void {
    this.supportedFormats.add(format)
    this.processingOptions.supportedFormats.push(format)
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number
    errorsByType: Record<string, number>
    errorsByFormat: Record<string, number>
    averageFileSize: number
    recentErrorRate: number
  } {
    const recentErrors = this.getRecentErrors(60 * 60 * 1000) // Last hour
    const errorsByType: Record<string, number> = {}
    const errorsByFormat: Record<string, number> = {}
    
    let totalFileSize = 0
    let fileCount = 0

    this.errorHistory.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1
      
      if (error.fileType) {
        errorsByFormat[error.fileType] = (errorsByFormat[error.fileType] || 0) + 1
      }
      
      if (error.fileSize) {
        totalFileSize += error.fileSize
        fileCount++
      }
    })

    return {
      totalErrors: this.errorHistory.length,
      errorsByType,
      errorsByFormat,
      averageFileSize: fileCount > 0 ? totalFileSize / fileCount : 0,
      recentErrorRate: recentErrors.length
    }
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = []
  }

  /**
   * Update processing options
   */
  updateProcessingOptions(options: Partial<FileProcessingOptions>): void {
    this.processingOptions = { ...this.processingOptions, ...options }
    
    if (options.supportedFormats) {
      this.supportedFormats = new Set(options.supportedFormats)
    }
  }

  /**
   * Create file processing error
   */
  private createFileProcessingError(
    error: any,
    file: UploadedFile,
    type: FileProcessingError['type'],
    retryCount: number,
    additionalMetadata?: Record<string, any>
  ): FileProcessingError {
    let message = 'Unknown file processing error occurred'

    if (error instanceof Error) {
      message = error.message
    } else if (typeof error === 'string') {
      message = error
    }

    return {
      type,
      message,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      timestamp: new Date(),
      retryCount,
      metadata: {
        errorName: error?.name,
        stack: error?.stack?.substring(0, 500),
        ...additionalMetadata
      }
    }
  }

  /**
   * Classify error type based on error details
   */
  private classifyError(error: any): FileProcessingError['type'] {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      
      if (message.includes('network') || message.includes('connection')) {
        return 'network_error'
      } else if (message.includes('size') || message.includes('large')) {
        return 'file_too_large'
      } else if (message.includes('format') || message.includes('type')) {
        return 'unsupported_format'
      } else if (message.includes('processing') || message.includes('parse')) {
        return 'processing_failed'
      }
    }
    
    return 'upload_failed'
  }

  /**
   * Create error response based on error type
   */
  private async createErrorResponse(
    error: FileProcessingError,
    file: UploadedFile
  ): Promise<FileProcessingResponse> {
    switch (error.type) {
      case 'unsupported_format':
        return {
          action: 'reject',
          message: `File format '${file.type}' is not supported. Please use one of the supported formats: ${this.getSupportedFormats().join(', ')}`,
          suggestedActions: [
            'Convert file to a supported format',
            'Save as plain text (.txt)',
            'Export as PDF if possible'
          ],
          metadata: {
            errorType: error.type,
            processingReason: 'Unsupported file format',
            timestamp: new Date()
          }
        }

      case 'file_too_large':
        const actions = ['compress']
        if (this.processingOptions.enableProgressiveUpload) {
          actions.push('progressive_upload')
        }
        
        return {
          action: file.size > this.processingOptions.maxFileSize * 2 ? 'compress' : 'progressive_upload',
          message: `File size (${this.formatFileSize(file.size)}) exceeds the maximum allowed size (${this.formatFileSize(this.processingOptions.maxFileSize)}). Try compressing the file or using progressive upload.`,
          suggestedActions: [
            'Compress the file to reduce size',
            'Split into smaller files',
            'Use progressive upload for large files'
          ],
          progressiveUploadOptions: this.processingOptions.progressiveUploadOptions,
          compressionOptions: {
            targetSize: this.processingOptions.maxFileSize * 0.8,
            quality: 0.8
          },
          metadata: {
            errorType: error.type,
            processingReason: 'File too large',
            timestamp: new Date()
          }
        }

      case 'upload_failed':
        return {
          action: 'retry',
          message: 'File upload failed due to a temporary issue. Please try again.',
          suggestedActions: [
            'Check your internet connection',
            'Try uploading again',
            'Reduce file size if possible'
          ],
          retryDelay: this.calculateRetryDelay(error.retryCount),
          metadata: {
            errorType: error.type,
            processingReason: 'Upload failure',
            timestamp: new Date()
          }
        }

      case 'processing_failed':
        return {
          action: 'inform_user',
          message: 'We encountered an issue processing your file. The file may be corrupted or contain unsupported content.',
          suggestedActions: [
            'Check if the file opens correctly on your device',
            'Try saving the file in a different format',
            'Contact support if the issue persists'
          ],
          metadata: {
            errorType: error.type,
            processingReason: 'Processing failure',
            timestamp: new Date()
          }
        }

      case 'network_error':
        return {
          action: 'retry',
          message: 'Network connection issue prevented file upload. Please check your connection and try again.',
          suggestedActions: [
            'Check your internet connection',
            'Try again in a few moments',
            'Use a more stable connection if available'
          ],
          retryDelay: this.calculateRetryDelay(error.retryCount),
          metadata: {
            errorType: error.type,
            processingReason: 'Network issue',
            timestamp: new Date()
          }
        }

      default:
        return {
          action: 'inform_user',
          message: 'An unexpected error occurred while processing your file. Please try again or contact support.',
          suggestedActions: [
            'Try uploading the file again',
            'Check if the file is valid',
            'Contact support for assistance'
          ],
          metadata: {
            errorType: error.type,
            processingReason: 'Unknown error',
            timestamp: new Date()
          }
        }
    }
  }

  /**
   * Determine if error should be retried
   */
  private shouldRetry(error: FileProcessingError): boolean {
    // Don't retry validation failures or unsupported formats
    if (error.type === 'validation_failed' || error.type === 'unsupported_format') {
      return false
    }

    // Don't retry files that are too large without compression
    if (error.type === 'file_too_large') {
      return false
    }

    // Retry network errors and upload failures
    return error.type === 'network_error' || error.type === 'upload_failed'
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const { baseDelay, maxDelay } = this.processingOptions.retryOptions
    let delay = baseDelay * Math.pow(2, attempt)
    delay = Math.min(delay, maxDelay)
    
    // Add jitter
    const jitter = delay * 0.1 * Math.random()
    return Math.round(delay + jitter)
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
  private addToErrorHistory(error: FileProcessingError): void {
    this.errorHistory.push(error)
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize)
    }
  }

  /**
   * Get recent errors within time window
   */
  private getRecentErrors(timeWindowMs: number): FileProcessingError[] {
    const cutoffTime = new Date(Date.now() - timeWindowMs)
    return this.errorHistory.filter(error => error.timestamp >= cutoffTime)
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: FileProcessingError): void {
    const logMessage = `File processing error: ${error.type} - ${error.message} (file: ${error.fileName})`
    
    if (error.type === 'processing_failed' || error.retryCount >= 2) {
      console.error(logMessage, { error })
    } else {
      console.warn(logMessage)
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Get suggested formats based on file extension
   */
  private getSuggestedFormats(fileName: string): string[] {
    const extension = fileName.split('.').pop()?.toLowerCase()
    const suggestions: string[] = []
    
    switch (extension) {
      case 'doc':
      case 'docx':
        suggestions.push('application/pdf', 'text/plain')
        break
      case 'xls':
      case 'xlsx':
        suggestions.push('text/csv', 'application/pdf')
        break
      case 'ppt':
      case 'pptx':
        suggestions.push('application/pdf', 'text/plain')
        break
      case 'rtf':
        suggestions.push('text/plain', 'application/pdf')
        break
      default:
        suggestions.push('text/plain', 'application/pdf')
    }
    
    return suggestions.filter(format => this.supportedFormats.has(format))
  }

  /**
   * Create file chunks for progressive upload
   */
  private createFileChunks(file: UploadedFile, chunkSize: number): FileChunk[] {
    const chunks: FileChunk[] = []
    const content = file.content
    
    if (typeof content === 'string') {
      const encoder = new TextEncoder()
      const bytes = encoder.encode(content)
      
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize)
        chunks.push({
          data: chunk,
          index: chunks.length,
          size: chunk.length
        })
      }
    } else if (content instanceof ArrayBuffer) {
      const bytes = new Uint8Array(content)
      
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize)
        chunks.push({
          data: chunk,
          index: chunks.length,
          size: chunk.length
        })
      }
    } else if (Buffer.isBuffer(content)) {
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize)
        chunks.push({
          data: chunk,
          index: chunks.length,
          size: chunk.length
        })
      }
    }
    
    return chunks
  }

  /**
   * Add compression suffix to filename
   */
  private addCompressionSuffix(fileName: string): string {
    const parts = fileName.split('.')
    if (parts.length > 1) {
      const extension = parts.pop()
      const name = parts.join('.')
      return `${name}_compressed.${extension}`
    }
    return `${fileName}_compressed`
  }

  /**
   * Initialize format processors
   */
  private initializeFormatProcessors(): void {
    // Mock format processors - in real implementation these would handle specific formats
    this.formatProcessors.set('text/plain', new TextProcessor())
    this.formatProcessors.set('application/pdf', new PDFProcessor())
    this.formatProcessors.set('text/html', new HTMLProcessor())
  }
}

// Supporting interfaces and classes
export interface FileChunk {
  data: Uint8Array | Buffer
  index: number
  size: number
}

// Mock format processors
class FormatProcessor {
  process(content: any): any {
    return content
  }
}

class TextProcessor extends FormatProcessor {
  process(content: string): string {
    return content.trim()
  }
}

class PDFProcessor extends FormatProcessor {
  process(content: Buffer): string {
    // Mock PDF processing
    return 'Extracted text from PDF'
  }
}

class HTMLProcessor extends FormatProcessor {
  process(content: string): string {
    // Mock HTML processing - remove tags
    return content.replace(/<[^>]*>/g, '').trim()
  }
}

/**
 * Default file processing options
 */
export const DEFAULT_FILE_PROCESSING_OPTIONS: FileProcessingOptions = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFormats: [
    'text/plain', 'text/html', 'text/markdown', 'text/csv',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json', 'application/xml'
  ],
  enableCompression: true,
  enableProgressiveUpload: true,
  progressiveUploadOptions: {
    chunkSize: 1024 * 1024, // 1MB
    maxChunks: 100,
    compressionEnabled: true,
    retryFailedChunks: true
  },
  retryOptions: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000
  }
}
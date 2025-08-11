import * as fs from 'fs/promises'
import * as path from 'path'
import { createReadStream } from 'fs'
import * as crypto from 'crypto'

// File processing interfaces
export interface FileUploadResult {
  success: boolean
  documentId?: string
  fileName: string
  fileSize: number
  contentLength: number
  processingTime: number
  error?: string
  warnings: string[]
}

export interface KnowledgeDocument {
  id: string
  name: string
  content: string
  uploadedAt: string
  fileType: string
  fileSize: number
  contentLength: number
  metadata: DocumentMetadata
  tags: string[]
  searchKeywords: string[]
}

export interface DocumentMetadata {
  originalFileName: string
  fileExtension: string
  mimeType: string
  encoding: string
  language: string
  processingMethod: string
  chunkCount: number
  lastModified: Date
  checksum: string
}

export interface UploadOptions {
  maxFileSize: number // in bytes
  supportedExtensions: string[]
  enableChunking: boolean
  chunkSize: number
  extractKeywords: boolean
  generateTags: boolean
  overwriteExisting: boolean
  validateContent: boolean
}

/**
 * Advanced Knowledge Base File Uploader
 * Handles local file processing and upload to bot's knowledge base
 */
export class KnowledgeFileUploader {
  private knowledgeBase: Map<string, KnowledgeDocument> = new Map()
  private options: UploadOptions
  private readonly KNOWLEDGE_BASE_PATH = './knowledge-base-data.json'

  constructor(options: Partial<UploadOptions> = {}) {
    this.options = {
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      supportedExtensions: ['.txt', '.md', '.json', '.csv', '.html', '.xml', '.rtf'],
      enableChunking: true,
      chunkSize: 2000, // characters
      extractKeywords: true,
      generateTags: true,
      overwriteExisting: false,
      validateContent: true,
      ...options
    }

    // Load existing knowledge base synchronously
    this.loadKnowledgeBaseSync()
  }

  /**
   * Upload a single file to the knowledge base
   */
  async uploadFile(filePath: string): Promise<FileUploadResult> {
    const startTime = Date.now()
    const fileName = path.basename(filePath)
    const warnings: string[] = []

    try {
      // Validate file exists
      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        return {
          success: false,
          fileName,
          fileSize: 0,
          contentLength: 0,
          processingTime: Date.now() - startTime,
          error: 'Path is not a file',
          warnings
        }
      }

      // Check file size
      if (stats.size > this.options.maxFileSize) {
        return {
          success: false,
          fileName,
          fileSize: stats.size,
          contentLength: 0,
          processingTime: Date.now() - startTime,
          error: `File size (${this.formatFileSize(stats.size)}) exceeds maximum allowed (${this.formatFileSize(this.options.maxFileSize)})`,
          warnings
        }
      }

      // Check file extension
      const extension = path.extname(filePath).toLowerCase()
      if (!this.options.supportedExtensions.includes(extension)) {
        return {
          success: false,
          fileName,
          fileSize: stats.size,
          contentLength: 0,
          processingTime: Date.now() - startTime,
          error: `Unsupported file extension: ${extension}. Supported: ${this.options.supportedExtensions.join(', ')}`,
          warnings
        }
      }

      // Read and process file content
      const content = await this.processFileContent(filePath, extension)
      if (!content || content.trim().length === 0) {
        return {
          success: false,
          fileName,
          fileSize: stats.size,
          contentLength: 0,
          processingTime: Date.now() - startTime,
          error: 'File contains no readable text content',
          warnings
        }
      }

      // Validate content quality
      if (this.options.validateContent) {
        const contentWarnings = this.validateContentQuality(content)
        warnings.push(...contentWarnings)
      }

      // Check for existing document
      const existingDoc = this.findExistingDocument(fileName)
      if (existingDoc && !this.options.overwriteExisting) {
        return {
          success: false,
          fileName,
          fileSize: stats.size,
          contentLength: content.length,
          processingTime: Date.now() - startTime,
          error: `Document with name '${fileName}' already exists. Use overwriteExisting option to replace.`,
          warnings
        }
      }

      // Generate document ID
      const documentId = existingDoc?.id || this.generateDocumentId(fileName)

      // Create knowledge document
      const document = await this.createKnowledgeDocument(
        documentId,
        fileName,
        filePath,
        content,
        stats
      )

      // Store in knowledge base
      this.knowledgeBase.set(documentId, document)
      await this.saveKnowledgeBase()

      console.info(`KnowledgeFileUploader: Successfully uploaded ${fileName}`, {
        documentId,
        fileSize: stats.size,
        contentLength: content.length,
        chunkCount: document.metadata.chunkCount
      })

      return {
        success: true,
        documentId,
        fileName,
        fileSize: stats.size,
        contentLength: content.length,
        processingTime: Date.now() - startTime,
        warnings
      }

    } catch (error) {
      console.error(`KnowledgeFileUploader: Error uploading ${fileName}:`, error)
      return {
        success: false,
        fileName,
        fileSize: 0,
        contentLength: 0,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        warnings
      }
    }
  }

  /**
   * Upload multiple files from a directory
   */
  async uploadDirectory(directoryPath: string, recursive: boolean = false): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = []

    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(directoryPath, entry.name)

        if (entry.isFile()) {
          const result = await this.uploadFile(fullPath)
          results.push(result)
        } else if (entry.isDirectory() && recursive) {
          const subResults = await this.uploadDirectory(fullPath, recursive)
          results.push(...subResults)
        }
      }

      console.info(`KnowledgeFileUploader: Processed directory ${directoryPath}`, {
        totalFiles: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      })

    } catch (error) {
      console.error(`KnowledgeFileUploader: Error processing directory ${directoryPath}:`, error)
    }

    return results
  }

  /**
   * Upload files from a list of file paths
   */
  async uploadFiles(filePaths: string[]): Promise<FileUploadResult[]> {
    const results: FileUploadResult[] = []

    for (const filePath of filePaths) {
      const result = await this.uploadFile(filePath)
      results.push(result)
    }

    return results
  }

  /**
   * Search the local knowledge base
   */
  searchKnowledgeBase(query: string, limit: number = 10): KnowledgeDocument[] {
    const queryLower = query.toLowerCase()
    const results: Array<{ document: KnowledgeDocument; score: number }> = []

    for (const document of this.knowledgeBase.values()) {
      let score = 0

      // Search in content
      if (document.content.toLowerCase().includes(queryLower)) {
        score += 3
      }

      // Search in keywords
      const keywordMatches = document.searchKeywords.filter(keyword => 
        keyword.toLowerCase().includes(queryLower) || queryLower.includes(keyword.toLowerCase())
      ).length
      score += keywordMatches * 2

      // Search in tags
      const tagMatches = document.tags.filter(tag => 
        tag.toLowerCase().includes(queryLower) || queryLower.includes(tag.toLowerCase())
      ).length
      score += tagMatches * 1.5

      // Search in filename
      if (document.name.toLowerCase().includes(queryLower)) {
        score += 1
      }

      if (score > 0) {
        results.push({ document, score })
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.document)
  }

  /**
   * Get all documents in the knowledge base
   */
  getAllDocuments(): KnowledgeDocument[] {
    return Array.from(this.knowledgeBase.values())
  }

  /**
   * Get document by ID
   */
  getDocument(documentId: string): KnowledgeDocument | null {
    return this.knowledgeBase.get(documentId) || null
  }

  /**
   * Delete document from knowledge base
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const deleted = this.knowledgeBase.delete(documentId)
    if (deleted) {
      await this.saveKnowledgeBase()
      console.info(`KnowledgeFileUploader: Deleted document ${documentId}`)
    }
    return deleted
  }

  /**
   * Get knowledge base statistics
   */
  getStatistics(): {
    totalDocuments: number
    totalSize: number
    totalContentLength: number
    fileTypes: Record<string, number>
    averageContentLength: number
  } {
    const documents = Array.from(this.knowledgeBase.values())
    const fileTypes: Record<string, number> = {}

    let totalSize = 0
    let totalContentLength = 0

    for (const doc of documents) {
      totalSize += doc.fileSize
      totalContentLength += doc.contentLength
      fileTypes[doc.fileType] = (fileTypes[doc.fileType] || 0) + 1
    }

    return {
      totalDocuments: documents.length,
      totalSize,
      totalContentLength,
      fileTypes,
      averageContentLength: documents.length > 0 ? totalContentLength / documents.length : 0
    }
  }

  // Private helper methods

  private async processFileContent(filePath: string, extension: string): Promise<string> {
    try {
      switch (extension) {
        case '.txt':
        case '.md':
        case '.csv':
        case '.json':
        case '.xml':
        case '.html':
        case '.rtf':
          return await fs.readFile(filePath, 'utf-8')
        
        default:
          throw new Error(`Unsupported file extension: ${extension}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        throw new Error('File not found')
      }
      throw error
    }
  }

  private async createKnowledgeDocument(
    documentId: string,
    fileName: string,
    filePath: string,
    content: string,
    stats: any
  ): Promise<KnowledgeDocument> {
    const extension = path.extname(fileName).toLowerCase()
    const checksum = crypto.createHash('md5').update(content).digest('hex')

    // Extract keywords if enabled
    const searchKeywords = this.options.extractKeywords 
      ? this.extractKeywords(content)
      : []

    // Generate tags if enabled
    const tags = this.options.generateTags
      ? this.generateTags(fileName, content, extension)
      : []

    // Chunk content if enabled
    const chunks = this.options.enableChunking
      ? this.chunkContent(content)
      : [content]

    return {
      id: documentId,
      name: fileName,
      content: chunks.join('\n\n--- CHUNK SEPARATOR ---\n\n'),
      uploadedAt: new Date().toISOString(),
      fileType: extension,
      fileSize: stats.size,
      contentLength: content.length,
      metadata: {
        originalFileName: fileName,
        fileExtension: extension,
        mimeType: this.getMimeType(extension),
        encoding: 'utf-8',
        language: 'en',
        processingMethod: 'local-file-system',
        chunkCount: chunks.length,
        lastModified: stats.mtime,
        checksum
      },
      tags,
      searchKeywords
    }
  }

  private extractKeywords(content: string): string[] {
    const text = content.toLowerCase()
    const words = text.match(/\b\w{3,}\b/g) || []
    
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ])

    // Count word frequency
    const wordCount: Record<string, number> = {}
    for (const word of words) {
      if (!stopWords.has(word) && word.length > 3) {
        wordCount[word] = (wordCount[word] || 0) + 1
      }
    }

    // Return top keywords
    return Object.entries(wordCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word)
  }

  private generateTags(fileName: string, content: string, extension: string): string[] {
    const tags: string[] = []

    // Add file type tag
    tags.push(`type:${extension.substring(1)}`)

    // Add content-based tags
    const contentLower = content.toLowerCase()
    
    // Event planning related tags
    if (contentLower.includes('event') || contentLower.includes('planning')) {
      tags.push('event-planning')
    }
    if (contentLower.includes('wedding')) {
      tags.push('wedding')
    }
    if (contentLower.includes('venue')) {
      tags.push('venue')
    }
    if (contentLower.includes('catering')) {
      tags.push('catering')
    }
    if (contentLower.includes('budget')) {
      tags.push('budget')
    }
    if (contentLower.includes('corporate')) {
      tags.push('corporate')
    }

    // Add size-based tags
    if (content.length > 5000) {
      tags.push('large-document')
    } else if (content.length > 1000) {
      tags.push('medium-document')
    } else {
      tags.push('small-document')
    }

    // Add filename-based tags
    const fileNameLower = fileName.toLowerCase()
    if (fileNameLower.includes('faq')) {
      tags.push('faq')
    }
    if (fileNameLower.includes('guide')) {
      tags.push('guide')
    }
    if (fileNameLower.includes('manual')) {
      tags.push('manual')
    }

    return tags
  }

  private chunkContent(content: string): string[] {
    if (content.length <= this.options.chunkSize) {
      return [content]
    }

    const chunks: string[] = []
    const sentences = content.split(/[.!?]+/)
    let currentChunk = ''

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim()
      if (!trimmedSentence) continue

      if (currentChunk.length + trimmedSentence.length + 1 > this.options.chunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim())
          currentChunk = trimmedSentence + '.'
        } else {
          // Single sentence is too long, split it
          chunks.push(trimmedSentence.substring(0, this.options.chunkSize))
          currentChunk = trimmedSentence.substring(this.options.chunkSize) + '.'
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence + '.'
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    return chunks
  }

  private validateContentQuality(content: string): string[] {
    const warnings: string[] = []

    if (content.length < 100) {
      warnings.push('Content is very short (less than 100 characters)')
    }

    if (content.length > 50000) {
      warnings.push('Content is very long (more than 50,000 characters) - consider splitting')
    }

    const wordCount = content.split(/\s+/).length
    if (wordCount < 20) {
      warnings.push('Content has very few words (less than 20)')
    }

    // Check for mostly non-alphabetic content
    const alphaChars = content.match(/[a-zA-Z]/g)?.length || 0
    const alphaRatio = alphaChars / content.length
    if (alphaRatio < 0.5) {
      warnings.push('Content contains mostly non-alphabetic characters')
    }

    return warnings
  }

  private findExistingDocument(fileName: string): KnowledgeDocument | null {
    for (const document of this.knowledgeBase.values()) {
      if (document.name === fileName) {
        return document
      }
    }
    return null
  }

  private generateDocumentId(fileName: string): string {
    const timestamp = Date.now()
    const hash = crypto.createHash('md5').update(fileName + timestamp).digest('hex').substring(0, 8)
    return `doc_${timestamp}_${hash}`
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.xml': 'application/xml',
      '.rtf': 'application/rtf'
    }
    return mimeTypes[extension] || 'text/plain'
  }

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

  private loadKnowledgeBaseSync(): void {
    try {
      const fsSync = require('fs')
      const data = fsSync.readFileSync(this.KNOWLEDGE_BASE_PATH, 'utf-8')
      const documents = JSON.parse(data) as KnowledgeDocument[]
      
      this.knowledgeBase.clear()
      for (const doc of documents) {
        this.knowledgeBase.set(doc.id, doc)
      }

      console.info(`KnowledgeFileUploader: Loaded ${documents.length} documents from storage`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.info('KnowledgeFileUploader: No existing knowledge base found, starting fresh')
      } else {
        console.error('KnowledgeFileUploader: Error loading knowledge base:', error)
      }
    }
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      const data = await fs.readFile(this.KNOWLEDGE_BASE_PATH, 'utf-8')
      const documents = JSON.parse(data) as KnowledgeDocument[]
      
      this.knowledgeBase.clear()
      for (const doc of documents) {
        this.knowledgeBase.set(doc.id, doc)
      }

      console.info(`KnowledgeFileUploader: Loaded ${documents.length} documents from storage`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('ENOENT')) {
        console.info('KnowledgeFileUploader: No existing knowledge base found, starting fresh')
      } else {
        console.error('KnowledgeFileUploader: Error loading knowledge base:', error)
      }
    }
  }

  private async saveKnowledgeBase(): Promise<void> {
    try {
      const documents = Array.from(this.knowledgeBase.values())
      await fs.writeFile(this.KNOWLEDGE_BASE_PATH, JSON.stringify(documents, null, 2))
      console.debug(`KnowledgeFileUploader: Saved ${documents.length} documents to storage`)
    } catch (error) {
      console.error('KnowledgeFileUploader: Error saving knowledge base:', error)
    }
  }
}
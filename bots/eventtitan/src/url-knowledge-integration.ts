/**
 * URL Knowledge Integration
 * 
 * Integrates URL content extraction with the knowledge base system.
 * Handles URL processing, content indexing, and error management.
 */

import { UrlContentExtractor, type ExtractedUrlContent, type UrlExtractionResult } from './url-content-extractor'

export interface UrlKnowledgeOptions {
  url: string
  title?: string
  tags?: string[]
  category?: string
  timeout?: number
  maxContentLength?: number
}

export interface UrlKnowledgeResult {
  success: boolean
  documentId?: string
  content?: ProcessedUrlContent
  error?: UrlKnowledgeError
}

export interface ProcessedUrlContent {
  id: string
  url: string
  title: string
  content: string
  metadata: UrlContentMetadata
  processedAt: Date
  indexedAt?: Date
}

export interface UrlContentMetadata {
  originalUrl: string
  finalUrl: string
  contentType: string
  description?: string
  keywords?: string[]
  author?: string
  language?: string
  headingCount: number
  paragraphCount: number
  linkCount: number
  imageCount: number
  tags?: string[]
  category?: string
}

export interface UrlKnowledgeError {
  type: 'extraction_failed' | 'indexing_failed' | 'validation_failed' | 'duplicate_content'
  message: string
  originalError?: Error
  extractionError?: any
}

export class UrlKnowledgeIntegrator {
  private extractor: UrlContentExtractor
  private processedUrls: Set<string> = new Set()

  constructor() {
    this.extractor = new UrlContentExtractor()
  }

  /**
   * Process URL and integrate into knowledge base
   */
  async processUrl(options: UrlKnowledgeOptions): Promise<UrlKnowledgeResult> {
    try {
      // Check for duplicate URLs
      if (this.processedUrls.has(options.url)) {
        return {
          success: false,
          error: {
            type: 'duplicate_content',
            message: `URL ${options.url} has already been processed`
          }
        }
      }

      // Extract content from URL
      const extractionResult = await this.extractor.extractContent({
        url: options.url,
        timeout: options.timeout,
        maxContentLength: options.maxContentLength
      })

      if (!extractionResult.success) {
        return {
          success: false,
          error: {
            type: 'extraction_failed',
            message: `Failed to extract content from URL: ${extractionResult.error?.message}`,
            extractionError: extractionResult.error
          }
        }
      }

      // Validate extracted content
      const validationResult = this.validateExtractedContent(extractionResult.content!)
      if (!validationResult.isValid) {
        return {
          success: false,
          error: {
            type: 'validation_failed',
            message: validationResult.error || 'Content validation failed'
          }
        }
      }

      // Process and prepare content for knowledge base
      const processedContent = this.processExtractedContent(
        extractionResult.content!,
        options
      )

      // Mark URL as processed
      this.processedUrls.add(options.url)

      return {
        success: true,
        documentId: processedContent.id,
        content: processedContent
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'indexing_failed',
          message: 'Unexpected error during URL processing',
          originalError: error instanceof Error ? error : new Error(String(error))
        }
      }
    }
  }

  /**
   * Process multiple URLs in batch
   */
  async processMultipleUrls(urlOptions: UrlKnowledgeOptions[]): Promise<UrlKnowledgeResult[]> {
    const results: UrlKnowledgeResult[] = []
    
    // Process in smaller batches to avoid overwhelming servers
    const batchSize = 3
    for (let i = 0; i < urlOptions.length; i += batchSize) {
      const batch = urlOptions.slice(i, i + batchSize)
      const batchPromises = batch.map(options => this.processUrl(options))
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      // Add delay between batches
      if (i + batchSize < urlOptions.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    return results
  }

  /**
   * Validate extracted content quality and completeness
   */
  private validateExtractedContent(content: ExtractedUrlContent): { isValid: boolean; error?: string } {
    // Check minimum content length
    if (!content.content || content.content.trim().length < 50) {
      return {
        isValid: false,
        error: 'Content is too short or empty (minimum 50 characters required)'
      }
    }

    // Check maximum content length (reasonable limit for knowledge base)
    if (content.content.length > 100000) { // 100KB
      return {
        isValid: false,
        error: 'Content is too large (maximum 100KB allowed)'
      }
    }

    // Check for meaningful content (not just whitespace or HTML artifacts)
    const meaningfulContent = content.content.replace(/\s+/g, ' ').trim()
    const wordCount = meaningfulContent.split(' ').length
    if (wordCount < 10) {
      return {
        isValid: false,
        error: 'Content does not contain enough meaningful text (minimum 10 words required)'
      }
    }

    // Check for common error pages or placeholder content
    const errorIndicators = [
      '404 not found',
      'page not found',
      'access denied',
      'forbidden',
      'under construction',
      'coming soon',
      'maintenance mode'
    ]

    const lowerContent = meaningfulContent.toLowerCase()
    for (const indicator of errorIndicators) {
      if (lowerContent.includes(indicator)) {
        return {
          isValid: false,
          error: `Content appears to be an error page or placeholder (contains: "${indicator}")`
        }
      }
    }

    return { isValid: true }
  }

  /**
   * Process extracted content into knowledge base format
   */
  private processExtractedContent(
    extracted: ExtractedUrlContent,
    options: UrlKnowledgeOptions
  ): ProcessedUrlContent {
    const documentId = this.generateDocumentId(extracted.url)
    
    // Determine title priority: options > extracted > URL
    const title = options.title || 
                  extracted.title || 
                  this.generateTitleFromUrl(extracted.url)

    // Create enhanced metadata
    const metadata: UrlContentMetadata = {
      originalUrl: extracted.metadata.originalUrl,
      finalUrl: extracted.metadata.finalUrl,
      contentType: extracted.metadata.contentType,
      description: extracted.metadata.description,
      keywords: extracted.metadata.keywords,
      author: extracted.metadata.author,
      language: extracted.metadata.language,
      headingCount: extracted.structure?.headings.length || 0,
      paragraphCount: extracted.structure?.paragraphs || 0,
      linkCount: extracted.structure?.links.length || 0,
      imageCount: extracted.structure?.images.length || 0,
      tags: options.tags,
      category: options.category
    }

    // Clean and optimize content for knowledge base
    const optimizedContent = this.optimizeContentForKnowledgeBase(extracted.content)

    return {
      id: documentId,
      url: extracted.url,
      title,
      content: optimizedContent,
      metadata,
      processedAt: new Date()
    }
  }

  /**
   * Generate unique document ID from URL
   */
  private generateDocumentId(url: string): string {
    const timestamp = Date.now()
    const urlHash = this.simpleHash(url)
    return `url-${urlHash}-${timestamp}`
  }

  /**
   * Generate title from URL if none available
   */
  private generateTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      
      // Extract meaningful part from path
      const pathParts = pathname.split('/').filter(part => part.length > 0)
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        // Remove file extensions and convert to readable format
        const cleanPart = lastPart
          .replace(/\.[^.]+$/, '') // Remove extension
          .replace(/[-_]/g, ' ') // Replace dashes and underscores with spaces
          .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize words
        
        if (cleanPart.length > 0) {
          return `${cleanPart} - ${urlObj.hostname}`
        }
      }
      
      // Fallback to hostname
      return urlObj.hostname.replace(/^www\./, '')
    } catch {
      return 'Web Page Content'
    }
  }

  /**
   * Optimize content for knowledge base storage and search
   */
  private optimizeContentForKnowledgeBase(content: string): string {
    // Remove excessive whitespace while preserving paragraph structure
    let optimized = content.replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
    optimized = optimized.replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double newline
    
    // Ensure content doesn't start or end with whitespace
    optimized = optimized.trim()
    
    // Add structure markers for better search (if content is very long)
    if (optimized.length > 5000) {
      // Split into logical sections if possible
      const sections = this.splitIntoSections(optimized)
      if (sections.length > 1) {
        optimized = sections.join('\n\n---\n\n')
      }
    }
    
    return optimized
  }

  /**
   * Split long content into logical sections
   */
  private splitIntoSections(content: string): string[] {
    const sections: string[] = []
    const paragraphs = content.split('\n\n')
    
    let currentSection = ''
    const maxSectionLength = 2000
    
    for (const paragraph of paragraphs) {
      if (currentSection.length + paragraph.length > maxSectionLength && currentSection.length > 0) {
        sections.push(currentSection.trim())
        currentSection = paragraph
      } else {
        currentSection += (currentSection ? '\n\n' : '') + paragraph
      }
    }
    
    if (currentSection.trim()) {
      sections.push(currentSection.trim())
    }
    
    return sections.length > 0 ? sections : [content]
  }

  /**
   * Simple hash function for generating IDs
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): {
    totalProcessed: number
    processedUrls: string[]
  } {
    return {
      totalProcessed: this.processedUrls.size,
      processedUrls: Array.from(this.processedUrls)
    }
  }

  /**
   * Clear processed URLs cache
   */
  clearProcessedCache(): void {
    this.processedUrls.clear()
  }

  /**
   * Check if URL has been processed
   */
  isUrlProcessed(url: string): boolean {
    return this.processedUrls.has(url)
  }
}

/**
 * Utility function to create URL knowledge integrator
 */
export function createUrlKnowledgeIntegrator(): UrlKnowledgeIntegrator {
  return new UrlKnowledgeIntegrator()
}

/**
 * Utility function for quick URL processing
 */
export async function processUrlForKnowledge(
  url: string,
  options?: Partial<UrlKnowledgeOptions>
): Promise<UrlKnowledgeResult> {
  const integrator = createUrlKnowledgeIntegrator()
  return integrator.processUrl({ url, ...options })
}
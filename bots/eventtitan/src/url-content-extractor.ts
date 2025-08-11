/**
 * URL Content Extractor
 * 
 * Handles web page content crawling and extraction for knowledge base ingestion.
 * Implements content cleaning, structure preservation, and error handling.
 */

export interface UrlExtractionOptions {
  url: string
  timeout?: number
  maxContentLength?: number
  followRedirects?: boolean
  userAgent?: string
}

export interface ExtractedUrlContent {
  url: string
  title?: string
  content: string
  metadata: UrlMetadata
  structure?: DocumentStructure
  extractedAt: Date
}

export interface UrlMetadata {
  originalUrl: string
  finalUrl: string
  statusCode: number
  contentType: string
  contentLength?: number
  lastModified?: Date
  description?: string
  keywords?: string[]
  author?: string
  language?: string
}

export interface DocumentStructure {
  headings: Heading[]
  paragraphs: number
  links: Link[]
  images: ImageInfo[]
}

export interface Heading {
  level: number
  text: string
  id?: string
}

export interface Link {
  text: string
  href: string
  isExternal: boolean
}

export interface ImageInfo {
  src: string
  alt?: string
  title?: string
}

export interface UrlExtractionResult {
  success: boolean
  content?: ExtractedUrlContent
  error?: UrlExtractionError
}

export interface UrlExtractionError {
  type: 'invalid_url' | 'network_error' | 'timeout' | 'access_denied' | 'content_too_large' | 'unsupported_content' | 'parsing_error'
  message: string
  statusCode?: number
  originalError?: Error
}

export class UrlContentExtractor {
  private readonly defaultTimeout = 30000 // 30 seconds
  private readonly maxContentLength = 5 * 1024 * 1024 // 5MB
  private readonly defaultUserAgent = 'EventTitan-Bot/1.0 (Content Indexer)'

  /**
   * Extract content from a URL
   */
  async extractContent(options: UrlExtractionOptions): Promise<UrlExtractionResult> {
    try {
      // Validate URL
      const validationResult = this.validateUrl(options.url)
      if (!validationResult.isValid) {
        return {
          success: false,
          error: {
            type: 'invalid_url',
            message: validationResult.error || 'Invalid URL format'
          }
        }
      }

      // Fetch content with timeout and error handling
      const fetchResult = await this.fetchUrlContent(options)
      if (!fetchResult.success) {
        return {
          success: false,
          error: fetchResult.error
        }
      }

      // Parse and extract content
      const parseResult = await this.parseHtmlContent(
        fetchResult.content!,
        fetchResult.metadata!
      )
      if (!parseResult.success) {
        return {
          success: false,
          error: parseResult.error
        }
      }

      return {
        success: true,
        content: parseResult.content
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'parsing_error',
          message: 'Unexpected error during URL content extraction',
          originalError: error instanceof Error ? error : new Error(String(error))
        }
      }
    }
  }

  /**
   * Validate URL format and accessibility
   */
  private validateUrl(url: string): { isValid: boolean; error?: string } {
    try {
      const urlObj = new URL(url)
      
      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          isValid: false,
          error: 'Only HTTP and HTTPS URLs are supported'
        }
      }

      // Check for localhost or private IPs (security measure)
      const hostname = urlObj.hostname.toLowerCase()
      if (hostname === 'localhost' || 
          hostname === '127.0.0.1' || 
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')) {
        return {
          isValid: false,
          error: 'Private and localhost URLs are not allowed'
        }
      }

      return { isValid: true }
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format'
      }
    }
  }

  /**
   * Fetch content from URL with proper error handling
   */
  private async fetchUrlContent(options: UrlExtractionOptions): Promise<{
    success: boolean
    content?: string
    metadata?: UrlMetadata
    error?: UrlExtractionError
  }> {
    const timeout = options.timeout || this.defaultTimeout
    const maxLength = options.maxContentLength || this.maxContentLength
    const userAgent = options.userAgent || this.defaultUserAgent

    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(options.url, {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal,
        redirect: options.followRedirects !== false ? 'follow' : 'manual'
      })

      clearTimeout(timeoutId)

      // Check response status
      if (!response.ok) {
        return {
          success: false,
          error: {
            type: response.status === 403 || response.status === 401 ? 'access_denied' : 'network_error',
            message: `HTTP ${response.status}: ${response.statusText}`,
            statusCode: response.status
          }
        }
      }

      // Check content type
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return {
          success: false,
          error: {
            type: 'unsupported_content',
            message: `Unsupported content type: ${contentType}`
          }
        }
      }

      // Check content length
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > maxLength) {
        return {
          success: false,
          error: {
            type: 'content_too_large',
            message: `Content too large: ${contentLength} bytes (max: ${maxLength})`
          }
        }
      }

      // Read content with size limit
      const content = await this.readResponseWithLimit(response, maxLength)
      
      // Extract metadata
      const metadata: UrlMetadata = {
        originalUrl: options.url,
        finalUrl: response.url,
        statusCode: response.status,
        contentType,
        contentLength: content.length,
        lastModified: response.headers.get('last-modified') ? 
          new Date(response.headers.get('last-modified')!) : undefined
      }

      return {
        success: true,
        content,
        metadata
      }

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            error: {
              type: 'timeout',
              message: `Request timed out after ${timeout}ms`
            }
          }
        }
        
        return {
          success: false,
          error: {
            type: 'network_error',
            message: error.message,
            originalError: error
          }
        }
      }

      return {
        success: false,
        error: {
          type: 'network_error',
          message: 'Unknown network error occurred'
        }
      }
    }
  }

  /**
   * Read response content with size limit
   */
  private async readResponseWithLimit(response: Response, maxLength: number): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Unable to read response body')
    }

    const decoder = new TextDecoder()
    let content = ''
    let totalLength = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        totalLength += value.length
        if (totalLength > maxLength) {
          throw new Error(`Content exceeds maximum length of ${maxLength} bytes`)
        }

        content += decoder.decode(value, { stream: true })
      }

      // Final decode
      content += decoder.decode()
      return content

    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Parse HTML content and extract structured information
   */
  private async parseHtmlContent(
    html: string, 
    metadata: UrlMetadata
  ): Promise<{
    success: boolean
    content?: ExtractedUrlContent
    error?: UrlExtractionError
  }> {
    try {
      // Basic HTML parsing without external dependencies
      const cleanedContent = this.extractTextContent(html)
      const structure = this.extractDocumentStructure(html)
      const enhancedMetadata = this.extractMetaTags(html, metadata)

      const extractedContent: ExtractedUrlContent = {
        url: metadata.originalUrl,
        title: this.extractTitle(html),
        content: cleanedContent,
        metadata: enhancedMetadata,
        structure,
        extractedAt: new Date()
      }

      return {
        success: true,
        content: extractedContent
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'parsing_error',
          message: 'Failed to parse HTML content',
          originalError: error instanceof Error ? error : new Error(String(error))
        }
      }
    }
  }

  /**
   * Extract clean text content from HTML
   */
  private extractTextContent(html: string): string {
    // Remove script and style tags
    let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    
    // Remove HTML comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')
    
    // Remove other unwanted tags but keep their content
    cleaned = cleaned.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    cleaned = cleaned.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
    cleaned = cleaned.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
    
    // Convert common HTML entities
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&mdash;': '—',
      '&ndash;': '–',
      '&hellip;': '…'
    }
    
    Object.entries(entities).forEach(([entity, char]) => {
      cleaned = cleaned.replace(new RegExp(entity, 'g'), char)
    })
    
    // Remove all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')
    
    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ')
    cleaned = cleaned.replace(/\n\s*\n/g, '\n\n')
    
    return cleaned.trim()
  }

  /**
   * Extract document structure (headings, links, etc.)
   */
  private extractDocumentStructure(html: string): DocumentStructure {
    const structure: DocumentStructure = {
      headings: [],
      paragraphs: 0,
      links: [],
      images: []
    }

    // Extract headings
    const headingRegex = /<h([1-6])([^>]*)>(.*?)<\/h[1-6]>/gi
    let headingMatch
    while ((headingMatch = headingRegex.exec(html)) !== null) {
      const attributes = headingMatch[2]
      const idMatch = attributes.match(/\sid=['"]([^'"]*)['"]/i)
      
      structure.headings.push({
        level: parseInt(headingMatch[1]),
        text: this.stripHtml(headingMatch[3]).trim(),
        id: idMatch ? idMatch[1] : undefined
      })
    }

    // Count paragraphs
    const paragraphMatches = html.match(/<p\b[^>]*>/gi)
    structure.paragraphs = paragraphMatches ? paragraphMatches.length : 0

    // Extract links
    const linkRegex = /<a\s+[^>]*href=['"]([^'"]*)['""][^>]*>(.*?)<\/a>/gi
    let linkMatch
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1]
      const text = this.stripHtml(linkMatch[2]).trim()
      
      if (text && href) {
        try {
          const baseUrl = new URL(this.extractBaseUrl(html) || 'https://example.com')
          structure.links.push({
            text,
            href,
            isExternal: href.startsWith('http') && !href.includes(baseUrl.hostname)
          })
        } catch {
          structure.links.push({
            text,
            href,
            isExternal: href.startsWith('http')
          })
        }
      }
    }

    // Extract images
    const imageRegex = /<img([^>]*)>/gi
    let imageMatch
    while ((imageMatch = imageRegex.exec(html)) !== null) {
      const attributes = imageMatch[1]
      const srcMatch = attributes.match(/\ssrc=['"]([^'"]*)['"]/i)
      const altMatch = attributes.match(/\salt=['"]([^'"]*)['"]/i)
      const titleMatch = attributes.match(/\stitle=['"]([^'"]*)['"]/i)
      
      if (srcMatch) {
        structure.images.push({
          src: srcMatch[1],
          alt: altMatch ? altMatch[1] : undefined,
          title: titleMatch ? titleMatch[1] : undefined
        })
      }
    }

    return structure
  }

  /**
   * Extract base URL from HTML for link processing
   */
  private extractBaseUrl(html: string): string | null {
    const baseMatch = html.match(/<base\s+href=['"]([^'"]*)['""][^>]*>/i)
    return baseMatch ? baseMatch[1] : null
  }

  /**
   * Extract meta tags and enhance metadata
   */
  private extractMetaTags(html: string, baseMetadata: UrlMetadata): UrlMetadata {
    const enhanced = { ...baseMetadata }

    // Extract description
    const descriptionMatch = html.match(/<meta\s+name=['"]description['"]\s+content=['"]([^'"]*)['"]/i)
    if (descriptionMatch) {
      enhanced.description = descriptionMatch[1]
    }

    // Extract keywords
    const keywordsMatch = html.match(/<meta\s+name=['"]keywords['"]\s+content=['"]([^'"]*)['"]/i)
    if (keywordsMatch) {
      enhanced.keywords = keywordsMatch[1].split(',').map(k => k.trim()).filter(k => k.length > 0)
    }

    // Extract author
    const authorMatch = html.match(/<meta\s+name=['"]author['"]\s+content=['"]([^'"]*)['"]/i)
    if (authorMatch) {
      enhanced.author = authorMatch[1]
    }

    // Extract language
    const langMatch = html.match(/<html[^>]*\slang=['"]([^'"]*)['"]/i) || 
                     html.match(/<meta\s+http-equiv=['"]content-language['"]\s+content=['"]([^'"]*)['"]/i)
    if (langMatch) {
      enhanced.language = langMatch[1]
    }

    return enhanced
  }

  /**
   * Extract page title
   */
  private extractTitle(html: string): string | undefined {
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    return titleMatch ? this.stripHtml(titleMatch[1]).trim() : undefined
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(text: string): string {
    return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
  }

  /**
   * Batch process multiple URLs
   */
  async extractMultipleUrls(
    urls: string[], 
    options?: Partial<UrlExtractionOptions>
  ): Promise<UrlExtractionResult[]> {
    const results: UrlExtractionResult[] = []
    
    // Process URLs in batches to avoid overwhelming the target servers
    const batchSize = 3
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize)
      const batchPromises = batch.map(url => 
        this.extractContent({ ...options, url })
      )
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
      
      // Add delay between batches to be respectful to servers
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    return results
  }
}

/**
 * Utility function to create URL content extractor instance
 */
export function createUrlContentExtractor(): UrlContentExtractor {
  return new UrlContentExtractor()
}

/**
 * Utility function for quick URL content extraction
 */
export async function extractUrlContent(
  url: string, 
  options?: Partial<UrlExtractionOptions>
): Promise<UrlExtractionResult> {
  const extractor = createUrlContentExtractor()
  return extractor.extractContent({ url, ...options })
}
/**
 * Tests for URL Content Extractor
 * 
 * Comprehensive test suite covering URL validation, content extraction,
 * error handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  UrlContentExtractor, 
  createUrlContentExtractor, 
  extractUrlContent,
  type UrlExtractionOptions,
  type UrlExtractionResult 
} from './url-content-extractor'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('UrlContentExtractor', () => {
  let extractor: UrlContentExtractor

  beforeEach(() => {
    extractor = new UrlContentExtractor()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('URL Validation', () => {
    it('should accept valid HTTP URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('<html><body>Test</body></html>'))
      
      const result = await extractor.extractContent({ url: 'http://example.com' })
      expect(result.success).toBe(true)
    })

    it('should accept valid HTTPS URLs', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('<html><body>Test</body></html>'))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      expect(result.success).toBe(true)
    })

    it('should reject non-HTTP protocols', async () => {
      const result = await extractor.extractContent({ url: 'ftp://example.com' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('invalid_url')
      expect(result.error?.message).toContain('HTTP and HTTPS')
    })

    it('should reject localhost URLs', async () => {
      const result = await extractor.extractContent({ url: 'http://localhost:3000' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('invalid_url')
      expect(result.error?.message).toContain('localhost')
    })

    it('should reject private IP addresses', async () => {
      const privateIps = [
        'http://127.0.0.1',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1'
      ]

      for (const url of privateIps) {
        const result = await extractor.extractContent({ url })
        expect(result.success).toBe(false)
        expect(result.error?.type).toBe('invalid_url')
      }
    })

    it('should reject malformed URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'http://',
        'https://.',
        ''
      ]

      for (const url of malformedUrls) {
        const result = await extractor.extractContent({ url })
        expect(result.success).toBe(false)
        // Some malformed URLs might be caught by fetch as network errors
        expect(['invalid_url', 'network_error']).toContain(result.error?.type)
      }
    })
  })

  describe('Content Fetching', () => {
    it('should successfully fetch and extract HTML content', async () => {
      const htmlContent = `
        <html>
          <head>
            <title>Test Page</title>
            <meta name="description" content="Test description">
          </head>
          <body>
            <h1>Main Heading</h1>
            <p>This is a test paragraph.</p>
          </body>
        </html>
      `
      
      mockFetch.mockResolvedValueOnce(createMockResponse(htmlContent))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('Test Page')
      expect(result.content?.content).toContain('Main Heading')
      expect(result.content?.content).toContain('test paragraph')
      expect(result.content?.metadata.description).toBe('Test description')
    })

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('', { status: 404, statusText: 'Not Found' }))
      
      const result = await extractor.extractContent({ url: 'https://example.com/notfound' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network_error')
      expect(result.error?.statusCode).toBe(404)
    })

    it('should handle access denied errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('', { status: 403, statusText: 'Forbidden' }))
      
      const result = await extractor.extractContent({ url: 'https://example.com/forbidden' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('access_denied')
      expect(result.error?.statusCode).toBe(403)
    })

    it('should handle network timeouts', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 100)
        })
      )
      
      const result = await extractor.extractContent({ 
        url: 'https://example.com',
        timeout: 50
      })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('timeout')
    })

    it('should handle unsupported content types', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('binary data', {
        headers: { 'content-type': 'application/pdf' }
      }))
      
      const result = await extractor.extractContent({ url: 'https://example.com/file.pdf' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('unsupported_content')
    })

    it('should handle content that is too large', async () => {
      const largeContent = 'x'.repeat(1000)
      mockFetch.mockResolvedValueOnce(createMockResponse(largeContent, {
        headers: { 'content-length': '10000000' } // 10MB
      }))
      
      const result = await extractor.extractContent({ 
        url: 'https://example.com',
        maxContentLength: 1000
      })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('content_too_large')
    })
  })

  describe('Content Parsing', () => {
    it('should extract title from HTML', async () => {
      const html = '<html><head><title>My Page Title</title></head><body>Content</body></html>'
      mockFetch.mockResolvedValueOnce(createMockResponse(html))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('My Page Title')
    })

    it('should extract and clean text content', async () => {
      const html = `
        <html>
          <body>
            <script>alert('test')</script>
            <style>body { color: red; }</style>
            <nav>Navigation</nav>
            <header>Header</header>
            <footer>Footer</footer>
            <main>
              <h1>Main Content</h1>
              <p>This is <strong>important</strong> text.</p>
              <p>Another paragraph with <a href="link">a link</a>.</p>
            </main>
          </body>
        </html>
      `
      
      mockFetch.mockResolvedValueOnce(createMockResponse(html))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      expect(result.content?.content).toContain('Main Content')
      expect(result.content?.content).toContain('important text')
      expect(result.content?.content).toContain('Another paragraph')
      expect(result.content?.content).not.toContain('alert')
      expect(result.content?.content).not.toContain('color: red')
      expect(result.content?.content).not.toContain('Navigation')
      expect(result.content?.content).not.toContain('Header')
      expect(result.content?.content).not.toContain('Footer')
    })

    it('should extract document structure', async () => {
      const html = `
        <html>
          <body>
            <h1 id="main">Main Heading</h1>
            <h2>Sub Heading</h2>
            <p>First paragraph</p>
            <p>Second paragraph</p>
            <a href="https://external.com">External Link</a>
            <a href="/internal">Internal Link</a>
            <img src="image.jpg" alt="Test Image" title="Image Title">
          </body>
        </html>
      `
      
      mockFetch.mockResolvedValueOnce(createMockResponse(html))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      expect(result.content?.structure?.headings).toHaveLength(2)
      expect(result.content?.structure?.headings[0]).toEqual({
        level: 1,
        text: 'Main Heading',
        id: 'main'
      })
      expect(result.content?.structure?.paragraphs).toBe(2)
      expect(result.content?.structure?.links).toHaveLength(2)
      expect(result.content?.structure?.images).toHaveLength(1)
      expect(result.content?.structure?.images[0]).toEqual({
        src: 'image.jpg',
        alt: 'Test Image',
        title: 'Image Title'
      })
    })

    it('should extract meta tags', async () => {
      const html = `
        <html lang="en">
          <head>
            <meta name="description" content="Page description">
            <meta name="keywords" content="test, example, content">
            <meta name="author" content="John Doe">
            <title>Test Page</title>
          </head>
          <body>Content</body>
        </html>
      `
      
      mockFetch.mockResolvedValueOnce(createMockResponse(html))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      expect(result.content?.metadata.description).toBe('Page description')
      expect(result.content?.metadata.keywords).toEqual(['test', 'example', 'content'])
      expect(result.content?.metadata.author).toBe('John Doe')
      expect(result.content?.metadata.language).toBe('en')
    })

    it('should handle HTML entities correctly', async () => {
      const html = `
        <html>
          <body>
            <p>Text with &amp; entities &lt;like&gt; &quot;quotes&quot; &amp; &nbsp;spaces.</p>
            <p>Special chars: &mdash; &ndash; &hellip;</p>
          </body>
        </html>
      `
      
      mockFetch.mockResolvedValueOnce(createMockResponse(html))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(true)
      // The HTML entities are converted correctly
      expect(result.content?.content).toContain('Text with & entities')
      expect(result.content?.content).toContain('"quotes"')
      expect(result.content?.content).toContain('— – …')
    })
  })

  describe('Batch Processing', () => {
    it('should process multiple URLs successfully', async () => {
      const urls = [
        'https://example1.com',
        'https://example2.com',
        'https://example3.com'
      ]
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse('<html><body>Content 1</body></html>'))
        .mockResolvedValueOnce(createMockResponse('<html><body>Content 2</body></html>'))
        .mockResolvedValueOnce(createMockResponse('<html><body>Content 3</body></html>'))
      
      const results = await extractor.extractMultipleUrls(urls)
      
      expect(results).toHaveLength(3)
      expect(results.every(r => r.success)).toBe(true)
      expect(results[0].content?.content).toContain('Content 1')
      expect(results[1].content?.content).toContain('Content 2')
      expect(results[2].content?.content).toContain('Content 3')
    })

    it('should handle mixed success and failure in batch processing', async () => {
      const urls = [
        'https://example1.com',
        'https://example2.com/notfound',
        'https://example3.com'
      ]
      
      mockFetch
        .mockResolvedValueOnce(createMockResponse('<html><body>Content 1</body></html>'))
        .mockResolvedValueOnce(createMockResponse('', { status: 404 }))
        .mockResolvedValueOnce(createMockResponse('<html><body>Content 3</body></html>'))
      
      const results = await extractor.extractMultipleUrls(urls)
      
      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network_error')
      expect(result.error?.message).toBe('Network error')
    })

    it('should handle unexpected errors during parsing', async () => {
      // Mock a response that will cause parsing issues by making the body reader fail
      const mockResponse = createMockResponse('<html><body>Test</body></html>')
      mockResponse.body = {
        getReader: () => ({
          read: vi.fn().mockRejectedValueOnce(new Error('Parse error')),
          releaseLock: vi.fn()
        })
      }
      mockFetch.mockResolvedValueOnce(mockResponse)
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network_error')
    })

    it('should provide detailed error information', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('', { status: 500, statusText: 'Internal Server Error' }))
      
      const result = await extractor.extractContent({ url: 'https://example.com' })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network_error')
      expect(result.error?.message).toContain('500')
      expect(result.error?.message).toContain('Internal Server Error')
      expect(result.error?.statusCode).toBe(500)
    })
  })

  describe('Configuration Options', () => {
    it('should respect custom timeout settings', async () => {
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 200)
        })
      )
      
      const result = await extractor.extractContent({ 
        url: 'https://example.com',
        timeout: 100
      })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('timeout')
    })

    it('should respect custom content length limits', async () => {
      const content = '<html><body>' + 'x'.repeat(1000) + '</body></html>'
      const mockResponse = createMockResponse(content)
      
      // Mock the body reader to simulate reading content that exceeds the limit
      mockResponse.body = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(content) })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          releaseLock: vi.fn()
        })
      }
      
      mockFetch.mockResolvedValueOnce(mockResponse)
      
      const result = await extractor.extractContent({ 
        url: 'https://example.com',
        maxContentLength: 500
      })
      
      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network_error')
      expect(result.error?.message).toContain('exceeds maximum length')
    })

    it('should use custom user agent', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('<html><body>Test</body></html>'))
      
      await extractor.extractContent({ 
        url: 'https://example.com',
        userAgent: 'Custom Bot/1.0'
      })
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'Custom Bot/1.0'
          })
        })
      )
    })
  })

  describe('Utility Functions', () => {
    it('should create extractor instance via factory function', () => {
      const extractor = createUrlContentExtractor()
      expect(extractor).toBeInstanceOf(UrlContentExtractor)
    })

    it('should provide quick extraction utility', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse('<html><body>Quick test</body></html>'))
      
      const result = await extractUrlContent('https://example.com')
      
      expect(result.success).toBe(true)
      expect(result.content?.content).toContain('Quick test')
    })
  })
})

// Helper function to create mock Response objects
function createMockResponse(
  body: string, 
  options: {
    status?: number
    statusText?: string
    headers?: Record<string, string>
  } = {}
): Response {
  const { status = 200, statusText = 'OK', headers = {} } = options
  
  const defaultHeaders = {
    'content-type': 'text/html; charset=utf-8',
    ...headers
  }

  const mockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    url: 'https://example.com',
    headers: {
      get: (name: string) => defaultHeaders[name.toLowerCase()] || null
    },
    text: () => Promise.resolve(body),
    body: {
      getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(body) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn()
      })
    }
  } as unknown as Response

  return mockResponse
}
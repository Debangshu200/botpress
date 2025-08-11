/**
 * Tests for URL Knowledge Integration
 * 
 * Tests the integration between URL content extraction and knowledge base processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
  UrlKnowledgeIntegrator, 
  createUrlKnowledgeIntegrator, 
  processUrlForKnowledge,
  type UrlKnowledgeOptions 
} from './url-knowledge-integration'
import { UrlContentExtractor } from './url-content-extractor'

// Mock the UrlContentExtractor
vi.mock('./url-content-extractor')

describe('UrlKnowledgeIntegrator', () => {
  let integrator: UrlKnowledgeIntegrator
  let mockExtractor: any

  beforeEach(() => {
    vi.clearAllMocks()
    integrator = new UrlKnowledgeIntegrator()
    
    // Get the mocked extractor instance
    mockExtractor = vi.mocked(UrlContentExtractor).prototype
  })

  describe('URL Processing', () => {
    it('should successfully process a valid URL', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful for the knowledge base.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html',
          description: 'Example page description',
          keywords: ['example', 'test'],
          author: 'Test Author',
          language: 'en'
        },
        structure: {
          headings: [{ level: 1, text: 'Main Heading' }],
          paragraphs: 3,
          links: [{ text: 'Link', href: 'https://other.com', isExternal: true }],
          images: [{ src: 'image.jpg', alt: 'Test image' }]
        },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(true)
      expect(result.documentId).toBeDefined()
      expect(result.content?.title).toBe('Example Page')
      expect(result.content?.content).toContain('example content')
      expect(result.content?.metadata.headingCount).toBe(1)
      expect(result.content?.metadata.paragraphCount).toBe(3)
      expect(result.content?.metadata.linkCount).toBe(1)
      expect(result.content?.metadata.imageCount).toBe(1)
    })

    it('should handle extraction failures', async () => {
      mockExtractor.extractContent.mockResolvedValueOnce({
        success: false,
        error: {
          type: 'network_error',
          message: 'Failed to fetch URL'
        }
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('extraction_failed')
      expect(result.error?.message).toContain('Failed to extract content')
    })

    it('should prevent duplicate URL processing', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: {
          headings: [],
          paragraphs: 1,
          links: [],
          images: []
        },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValue({
        success: true,
        content: mockExtractedContent
      })

      // First processing should succeed
      const firstResult = await integrator.processUrl({ url: 'https://example.com' })
      expect(firstResult.success).toBe(true)

      // Second processing should fail with duplicate error
      const secondResult = await integrator.processUrl({ url: 'https://example.com' })
      expect(secondResult.success).toBe(false)
      expect(secondResult.error?.type).toBe('duplicate_content')
    })

    it('should use custom title when provided', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Original Title',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ 
        url: 'https://example.com',
        title: 'Custom Title'
      })

      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('Custom Title')
    })

    it('should include tags and category in metadata', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ 
        url: 'https://example.com',
        tags: ['documentation', 'api'],
        category: 'technical'
      })

      expect(result.success).toBe(true)
      expect(result.content?.metadata.tags).toEqual(['documentation', 'api'])
      expect(result.content?.metadata.category).toBe('technical')
    })
  })

  describe('Content Validation', () => {
    it('should reject content that is too short', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Short Page',
        content: 'Too short', // Less than 50 characters
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('validation_failed')
      expect(result.error?.message).toContain('too short')
    })

    it('should reject content that is too large', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Large Page',
        content: 'x'.repeat(150000), // Larger than 100KB
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('validation_failed')
      expect(result.error?.message).toContain('too large')
    })

    it('should reject error pages', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Error Page',
        content: 'This page shows a 404 not found error message with some additional text to meet length requirements.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('validation_failed')
      expect(result.error?.message).toContain('error page')
    })

    it('should reject content with insufficient meaningful text', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Sparse Page',
        content: 'word1 word2 word3 word4 word5 word6 word7 word8 word9', // Exactly 9 words, more than 50 chars
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('validation_failed')
      expect(result.error?.message).toContain('meaningful text')
    })
  })

  describe('Title Generation', () => {
    it('should generate title from URL when none provided', async () => {
      const mockExtractedContent = {
        url: 'https://example.com/docs/api-reference',
        title: undefined, // No title extracted
        content: 'This is example content with enough text to be meaningful and useful for the knowledge base.',
        metadata: {
          originalUrl: 'https://example.com/docs/api-reference',
          finalUrl: 'https://example.com/docs/api-reference',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com/docs/api-reference' })

      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('Api Reference - example.com')
    })

    it('should fallback to hostname for root URLs', async () => {
      const mockExtractedContent = {
        url: 'https://example.com/',
        title: undefined,
        content: 'This is example content with enough text to be meaningful and useful for the knowledge base.',
        metadata: {
          originalUrl: 'https://example.com/',
          finalUrl: 'https://example.com/',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com/' })

      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('example.com')
    })
  })

  describe('Batch Processing', () => {
    it('should process multiple URLs successfully', async () => {
      const mockExtractedContent = (url: string) => ({
        url,
        title: `Page for ${url}`,
        content: `This is content for ${url} with enough text to be meaningful and useful.`,
        metadata: {
          originalUrl: url,
          finalUrl: url,
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      })

      mockExtractor.extractContent
        .mockResolvedValueOnce({ success: true, content: mockExtractedContent('https://example1.com') })
        .mockResolvedValueOnce({ success: true, content: mockExtractedContent('https://example2.com') })
        .mockResolvedValueOnce({ success: true, content: mockExtractedContent('https://example3.com') })

      const urlOptions = [
        { url: 'https://example1.com' },
        { url: 'https://example2.com' },
        { url: 'https://example3.com' }
      ]

      const results = await integrator.processMultipleUrls(urlOptions)

      expect(results).toHaveLength(3)
      expect(results.every(r => r.success)).toBe(true)
      expect(results[0].content?.title).toBe('Page for https://example1.com')
      expect(results[1].content?.title).toBe('Page for https://example2.com')
      expect(results[2].content?.title).toBe('Page for https://example3.com')
    })

    it('should handle mixed success and failure in batch processing', async () => {
      const mockExtractedContent = {
        url: 'https://example1.com',
        title: 'Success Page',
        content: 'This is content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example1.com',
          finalUrl: 'https://example1.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent
        .mockResolvedValueOnce({ success: true, content: mockExtractedContent })
        .mockResolvedValueOnce({ success: false, error: { type: 'network_error', message: 'Failed' } })
        .mockResolvedValueOnce({ success: true, content: { ...mockExtractedContent, url: 'https://example3.com' } })

      const urlOptions = [
        { url: 'https://example1.com' },
        { url: 'https://example2.com' },
        { url: 'https://example3.com' }
      ]

      const results = await integrator.processMultipleUrls(urlOptions)

      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)
    })
  })

  describe('Content Optimization', () => {
    it('should optimize long content by splitting into sections', async () => {
      const longContent = 'Section 1 content. '.repeat(200) + '\n\n' + 'Section 2 content. '.repeat(200)
      
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Long Page',
        content: longContent,
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 2, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(true)
      expect(result.content?.content).toContain('---') // Section separator
    })

    it('should clean up excessive whitespace', async () => {
      const messyContent = 'This   has    multiple     spaces\n\n\n\nand\n\n\n\nexcessive\n\n\nnewlines   with enough text to be meaningful.'
      
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Messy Page',
        content: messyContent,
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await integrator.processUrl({ url: 'https://example.com' })

      expect(result.success).toBe(true)
      expect(result.content?.content).not.toMatch(/   +/) // No triple spaces
      expect(result.content?.content).not.toMatch(/\n\n\n+/) // No triple newlines
    })
  })

  describe('Statistics and Management', () => {
    it('should track processing statistics', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValue({
        success: true,
        content: mockExtractedContent
      })

      await integrator.processUrl({ url: 'https://example1.com' })
      await integrator.processUrl({ url: 'https://example2.com' })

      const stats = integrator.getProcessingStats()
      expect(stats.totalProcessed).toBe(2)
      expect(stats.processedUrls).toContain('https://example1.com')
      expect(stats.processedUrls).toContain('https://example2.com')
    })

    it('should check if URL has been processed', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      expect(integrator.isUrlProcessed('https://example.com')).toBe(false)
      
      await integrator.processUrl({ url: 'https://example.com' })
      
      expect(integrator.isUrlProcessed('https://example.com')).toBe(true)
    })

    it('should clear processed cache', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Example Page',
        content: 'This is example content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      await integrator.processUrl({ url: 'https://example.com' })
      expect(integrator.getProcessingStats().totalProcessed).toBe(1)
      
      integrator.clearProcessedCache()
      expect(integrator.getProcessingStats().totalProcessed).toBe(0)
    })
  })

  describe('Utility Functions', () => {
    it('should create integrator instance via factory function', () => {
      const integrator = createUrlKnowledgeIntegrator()
      expect(integrator).toBeInstanceOf(UrlKnowledgeIntegrator)
    })

    it('should provide quick processing utility', async () => {
      const mockExtractedContent = {
        url: 'https://example.com',
        title: 'Quick Test',
        content: 'This is quick test content with enough text to be meaningful and useful.',
        metadata: {
          originalUrl: 'https://example.com',
          finalUrl: 'https://example.com',
          statusCode: 200,
          contentType: 'text/html'
        },
        structure: { headings: [], paragraphs: 1, links: [], images: [] },
        extractedAt: new Date()
      }

      mockExtractor.extractContent.mockResolvedValueOnce({
        success: true,
        content: mockExtractedContent
      })

      const result = await processUrlForKnowledge('https://example.com')

      expect(result.success).toBe(true)
      expect(result.content?.title).toBe('Quick Test')
    })
  })
})
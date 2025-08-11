import { KnowledgeFileUploader, KnowledgeDocument } from './knowledge-file-uploader'

/**
 * Enhanced Knowledge Handler that integrates with the file uploader
 * Replaces the simple knowledge-handler.ts with advanced capabilities
 */

export class EnhancedKnowledgeHandler {
  private uploader: KnowledgeFileUploader
  private fallbackKnowledge: Map<string, string>

  constructor() {
    this.uploader = new KnowledgeFileUploader({
      maxFileSize: 10 * 1024 * 1024,
      supportedExtensions: ['.txt', '.md', '.json', '.csv', '.html', '.xml', '.rtf'],
      enableChunking: true,
      chunkSize: 2000,
      extractKeywords: true,
      generateTags: true,
      overwriteExisting: false,
      validateContent: true
    })

    // Initialize fallback knowledge (from original knowledge-handler.ts)
    this.initializeFallbackKnowledge()
  }

  /**
   * Search knowledge base with enhanced capabilities
   */
  searchKnowledge(query: string): {
    content: string | null
    source: 'uploaded-files' | 'fallback' | 'none'
    confidence: number
    documents: KnowledgeDocument[]
  } {
    // First, search uploaded files
    const uploadedResults = this.uploader.searchKnowledgeBase(query, 5)
    
    if (uploadedResults.length > 0) {
      // Calculate confidence based on search results
      const confidence = this.calculateSearchConfidence(query, uploadedResults)
      
      // Combine content from top results
      const content = uploadedResults
        .slice(0, 3) // Top 3 results
        .map(doc => this.extractRelevantContent(doc, query))
        .join('\n\n---\n\n')

      return {
        content,
        source: 'uploaded-files',
        confidence,
        documents: uploadedResults
      }
    }

    // Fallback to hardcoded knowledge
    const fallbackContent = this.searchFallbackKnowledge(query)
    if (fallbackContent) {
      return {
        content: fallbackContent,
        source: 'fallback',
        confidence: 0.7, // Medium confidence for fallback
        documents: []
      }
    }

    return {
      content: null,
      source: 'none',
      confidence: 0,
      documents: []
    }
  }

  /**
   * Get knowledge base statistics
   */
  getKnowledgeStats(): {
    uploadedDocuments: number
    fallbackTopics: number
    totalSize: string
    fileTypes: Record<string, number>
  } {
    const stats = this.uploader.getStatistics()
    
    return {
      uploadedDocuments: stats.totalDocuments,
      fallbackTopics: this.fallbackKnowledge.size,
      totalSize: this.formatFileSize(stats.totalSize),
      fileTypes: stats.fileTypes
    }
  }

  /**
   * Add content programmatically
   */
  async addContent(title: string, content: string, tags: string[] = []): Promise<boolean> {
    try {
      // Create a temporary file and upload it
      const tempFileName = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`
      const fs = await import('fs/promises')
      const path = await import('path')
      const tempPath = path.join('./temp', tempFileName)
      
      // Ensure temp directory exists
      await fs.mkdir('./temp', { recursive: true })
      
      // Write content to temp file
      await fs.writeFile(tempPath, content)
      
      // Upload the file
      const result = await this.uploader.uploadFile(tempPath)
      
      // Clean up temp file
      await fs.unlink(tempPath)
      
      return result.success
    } catch (error) {
      console.error('EnhancedKnowledgeHandler: Error adding content:', error)
      return false
    }
  }

  /**
   * Update existing document
   */
  async updateDocument(documentId: string, newContent: string): Promise<boolean> {
    try {
      const document = this.uploader.getDocument(documentId)
      if (!document) {
        return false
      }

      // Delete old document
      await this.uploader.deleteDocument(documentId)
      
      // Add updated content
      return await this.addContent(document.name, newContent, document.tags)
    } catch (error) {
      console.error('EnhancedKnowledgeHandler: Error updating document:', error)
      return false
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    return await this.uploader.deleteDocument(documentId)
  }

  /**
   * List all documents
   */
  listDocuments(): Array<{
    id: string
    name: string
    size: string
    contentLength: number
    uploadedAt: string
    tags: string[]
  }> {
    return this.uploader.getAllDocuments().map(doc => ({
      id: doc.id,
      name: doc.name,
      size: this.formatFileSize(doc.fileSize),
      contentLength: doc.contentLength,
      uploadedAt: doc.uploadedAt,
      tags: doc.tags
    }))
  }

  /**
   * Get file uploader instance for advanced operations
   */
  getUploader(): KnowledgeFileUploader {
    return this.uploader
  }

  // Private helper methods

  private calculateSearchConfidence(query: string, documents: KnowledgeDocument[]): number {
    if (documents.length === 0) return 0

    let totalScore = 0
    const queryLower = query.toLowerCase()

    for (const doc of documents) {
      let docScore = 0

      // Keyword matching
      const keywordMatches = doc.searchKeywords.filter(keyword => 
        queryLower.includes(keyword.toLowerCase()) || keyword.toLowerCase().includes(queryLower)
      ).length
      docScore += keywordMatches * 0.3

      // Tag matching
      const tagMatches = doc.tags.filter(tag => 
        queryLower.includes(tag.toLowerCase()) || tag.toLowerCase().includes(queryLower)
      ).length
      docScore += tagMatches * 0.2

      // Content relevance (simple check)
      if (doc.content.toLowerCase().includes(queryLower)) {
        docScore += 0.4
      }

      // File name relevance
      if (doc.name.toLowerCase().includes(queryLower)) {
        docScore += 0.1
      }

      totalScore += Math.min(docScore, 1.0)
    }

    return Math.min(totalScore / documents.length, 1.0)
  }

  private extractRelevantContent(document: KnowledgeDocument, query: string): string {
    const queryLower = query.toLowerCase()
    const content = document.content

    // If content is chunked, find the most relevant chunk
    if (content.includes('--- CHUNK SEPARATOR ---')) {
      const chunks = content.split('\n\n--- CHUNK SEPARATOR ---\n\n')
      
      let bestChunk = chunks[0]
      let bestScore = 0

      for (const chunk of chunks) {
        const chunkLower = chunk.toLowerCase()
        let score = 0

        // Count query word matches
        const queryWords = queryLower.split(/\s+/)
        for (const word of queryWords) {
          if (chunkLower.includes(word)) {
            score += 1
          }
        }

        if (score > bestScore) {
          bestScore = score
          bestChunk = chunk
        }
      }

      return `**${document.name}**\n\n${bestChunk.trim()}`
    }

    // For non-chunked content, return first 1000 characters if too long
    const maxLength = 1000
    if (content.length > maxLength) {
      const truncated = content.substring(0, maxLength)
      const lastSentence = truncated.lastIndexOf('.')
      const finalContent = lastSentence > maxLength * 0.8 
        ? truncated.substring(0, lastSentence + 1)
        : truncated + '...'
      
      return `**${document.name}**\n\n${finalContent}`
    }

    return `**${document.name}**\n\n${content}`
  }

  private searchFallbackKnowledge(query: string): string | null {
    const queryLower = query.toLowerCase()
    
    for (const [topic, content] of this.fallbackKnowledge.entries()) {
      if (queryLower.includes(topic) || 
          queryLower.includes(topic.replace(' ', '')) ||
          (topic === 'event planning' && (queryLower.includes('plan') && queryLower.includes('event'))) ||
          (topic === 'wedding planning' && queryLower.includes('wedding')) ||
          (topic === 'venue selection' && queryLower.includes('venue')) ||
          (topic === 'corporate events' && queryLower.includes('corporate')) ||
          (topic === 'budgeting' && (queryLower.includes('budget') || queryLower.includes('cost'))) ||
          (topic === 'catering' && queryLower.includes('catering'))) {
        return content
      }
    }
    
    return null
  }

  private initializeFallbackKnowledge(): void {
    this.fallbackKnowledge = new Map([
      ['event planning', `Event planning is the process of organizing and coordinating all aspects of an event, from initial concept to execution. This comprehensive approach includes venue selection, catering arrangements, entertainment booking, guest management, timeline coordination, and budget oversight.

Key phases of event planning:
1. Initial consultation and goal setting
2. Budget development and approval
3. Venue research and booking
4. Vendor selection and coordination
5. Timeline creation and management
6. Day-of execution and oversight`],

      ['wedding planning', `Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results. Key steps include: setting a budget, choosing a venue, selecting vendors (photographer, caterer, florist), sending invitations, and coordinating the ceremony and reception.

Essential wedding planning timeline:
- 12-18 months before: Set budget, book venue
- 8-12 months before: Select major vendors
- 6-8 months before: Send save-the-dates
- 3-6 months before: Finalize details, send invitations
- 1-3 months before: Confirm all arrangements
- Week of: Final preparations and rehearsal`],

      ['venue selection', `Venue selection is crucial for event success. Consider these factors: capacity (ensure it fits your guest count with 10% buffer), location accessibility, parking availability, catering restrictions, audio/visual equipment, decoration policies, and pricing structure.

Venue evaluation checklist:
- Capacity and layout suitability
- Location and accessibility
- Parking and transportation
- Catering kitchen and restrictions
- Audio/visual capabilities
- Decoration and setup policies
- Pricing and payment terms
- Availability for preferred dates`],

      ['corporate events', `Corporate events serve various purposes: team building, product launches, conferences, and client entertainment. Key considerations include professional atmosphere, appropriate catering, AV equipment for presentations, networking opportunities, and brand representation. Budget typically ranges from $50-200 per person depending on event type and location.

Types of corporate events:
- Team building activities
- Product launch events
- Annual conferences
- Client appreciation events
- Holiday parties
- Training seminars
- Networking events`],

      ['budgeting', `Event budgeting requires careful planning and contingency funds. Typical budget breakdown: venue (40-50%), catering (25-35%), entertainment (10-15%), decorations (8-10%), photography (5-8%), miscellaneous (5-10%). Always include a 10-15% contingency fund for unexpected expenses.

Budget categories to consider:
- Venue rental and setup fees
- Catering and beverage service
- Entertainment and speakers
- Decorations and flowers
- Photography and videography
- Transportation and accommodations
- Marketing and invitations
- Insurance and permits
- Contingency fund`],

      ['catering', `Catering is often the largest expense after venue costs. Consider dietary restrictions, meal timing, service style (buffet vs. plated), and beverage options. Popular choices include cocktail receptions, plated dinners, and buffet-style meals. Always taste-test menu options and confirm final headcount 1-2 weeks before the event.

Catering considerations:
- Guest dietary restrictions and preferences
- Meal timing and service style
- Beverage packages and bar service
- Kitchen facilities and equipment needs
- Service staff requirements
- Setup and cleanup logistics`]
    ])
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
}

// Export functions for backward compatibility
const enhancedHandler = new EnhancedKnowledgeHandler()

export function searchKnowledge(query: string): string | null {
  const result = enhancedHandler.searchKnowledge(query)
  return result.content
}

export function isQuestion(text: string): boolean {
  const questionWords = ['what', 'how', 'where', 'when', 'why', 'who', 'which', 'can', 'should', 'do', 'does', 'is', 'are']
  const textLower = text.toLowerCase()
  
  const startsWithQuestion = questionWords.some(word => textLower.startsWith(word))
  const hasQuestionMark = text.includes('?')
  const helpPhrases = ['help me', 'i need', 'tell me', 'show me', 'explain', 'guide me']
  const hasHelpPhrase = helpPhrases.some(phrase => textLower.includes(phrase))
  
  return startsWithQuestion || hasQuestionMark || hasHelpPhrase
}

export function extractQuestions(text: string): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  return sentences.filter(sentence => isQuestion(sentence.trim()))
}

// EnhancedKnowledgeHandler is already exported as a class above
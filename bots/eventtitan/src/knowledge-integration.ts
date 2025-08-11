import { KnowledgePair } from './learning-engine'

// Types for knowledge base integration
export interface KnowledgeIntegrationResult {
  success: boolean
  integratedCount: number
  skippedCount: number
  failedCount: number
  errors: IntegrationError[]
  processingTime: number
  metadata: IntegrationMetadata
}

export interface IntegrationError {
  type: 'validation' | 'duplicate' | 'format' | 'storage' | 'permission'
  message: string
  queryId?: string
  severity: 'low' | 'medium' | 'high'
  timestamp: Date
  retryable: boolean
}

export interface IntegrationMetadata {
  totalPairs: number
  duplicatesDetected: number
  qualityFiltered: number
  sourceAttributions: SourceAttribution[]
  integrationBatch: string
  timestamp: Date
}

export interface SourceAttribution {
  queryId: string
  source: 'human-agent'
  agentId?: string
  sessionId: string
  confidence: number
  validationStatus: 'approved' | 'pending' | 'rejected'
}

export interface KnowledgeDocument {
  id: string
  title: string
  content: string
  source: 'learned' | 'manual' | 'imported'
  sourceAttribution: SourceAttribution
  tags: string[]
  metadata: KnowledgeDocumentMetadata
  createdAt: Date
  updatedAt: Date
  version: number
}

export interface KnowledgeDocumentMetadata {
  queryComplexity: 'simple' | 'moderate' | 'complex'
  responseQuality: number
  userIntent: string
  domain: string[]
  language: string
  searchKeywords: string[]
  relatedQueries: string[]
  usageCount: number
  lastUsed?: Date
  effectiveness: number
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean
  existingDocumentId?: string
  similarityScore: number
  conflictResolution: 'merge' | 'replace' | 'skip' | 'create_variant'
  reason: string
}

export interface KnowledgeUpdateRequest {
  pairs: KnowledgePair[]
  batchId: string
  options: IntegrationOptions
}

export interface IntegrationOptions {
  enableDuplicateDetection: boolean
  duplicateThreshold: number
  autoApproveThreshold: number
  requireManualReview: boolean
  preserveSourceAttribution: boolean
  enableVersioning: boolean
  tagGeneration: boolean
  qualityFiltering: boolean
  minQualityScore: number
}

export interface KnowledgeBaseAdapter {
  createDocument(document: KnowledgeDocument): Promise<string>
  updateDocument(id: string, document: Partial<KnowledgeDocument>): Promise<void>
  findSimilarDocuments(query: string, threshold: number): Promise<KnowledgeDocument[]>
  deleteDocument(id: string): Promise<void>
  searchDocuments(query: string, options?: SearchOptions): Promise<KnowledgeDocument[]>
  getDocumentById(id: string): Promise<KnowledgeDocument | null>
  bulkCreate(documents: KnowledgeDocument[]): Promise<string[]>
}

export interface SearchOptions {
  limit?: number
  offset?: number
  filters?: Record<string, any>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * KnowledgeIntegrator handles the integration of learned responses into the knowledge base
 * with quality controls, duplicate detection, and source attribution
 */
export class KnowledgeIntegrator {
  private adapter: KnowledgeBaseAdapter
  private options: IntegrationOptions
  private integrationHistory: Map<string, KnowledgeIntegrationResult> = new Map()

  constructor(adapter: KnowledgeBaseAdapter, options: IntegrationOptions) {
    this.adapter = adapter
    this.options = options
  }

  /**
   * Integrates validated knowledge pairs into the knowledge base
   */
  async integrateKnowledge(pairs: KnowledgePair[]): Promise<KnowledgeIntegrationResult> {
    const startTime = Date.now()
    const batchId = this.generateBatchId()
    
    const result: KnowledgeIntegrationResult = {
      success: false,
      integratedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      errors: [],
      processingTime: 0,
      metadata: {
        totalPairs: pairs.length,
        duplicatesDetected: 0,
        qualityFiltered: 0,
        sourceAttributions: [],
        integrationBatch: batchId,
        timestamp: new Date()
      }
    }

    if (pairs.length === 0) {
      result.success = true
      result.processingTime = Date.now() - startTime
      return result
    }

    try {
      // Step 1: Filter pairs by quality if enabled
      let filteredPairs = pairs
      if (this.options.qualityFiltering) {
        filteredPairs = this.filterByQuality(pairs)
        result.metadata.qualityFiltered = pairs.length - filteredPairs.length
      }

      // Step 2: Process each pair
      for (const pair of filteredPairs) {
        try {
          const integrationResult = await this.integrateSinglePair(pair, batchId)
          
          if (integrationResult.success) {
            result.integratedCount++
            result.metadata.sourceAttributions.push(integrationResult.sourceAttribution!)
          } else if (integrationResult.skipped) {
            result.skippedCount++
            if (integrationResult.isDuplicate) {
              result.metadata.duplicatesDetected++
            }
          } else {
            result.failedCount++
            result.errors.push(...integrationResult.errors)
          }
        } catch (error) {
          result.failedCount++
          result.errors.push({
            type: 'storage',
            message: error instanceof Error ? error.message : 'Unknown error',
            queryId: pair.queryId,
            severity: 'high',
            timestamp: new Date(),
            retryable: true
          })
        }
      }

      result.success = result.failedCount === 0 || (result.integratedCount > 0 && result.failedCount < filteredPairs.length * 0.5)
      
    } catch (error) {
      result.errors.push({
        type: 'storage',
        message: `Batch integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'high',
        timestamp: new Date(),
        retryable: true
      })
    }

    result.processingTime = Date.now() - startTime
    this.integrationHistory.set(batchId, result)
    
    console.info(`KnowledgeIntegrator: Batch ${batchId} completed`, {
      integratedCount: result.integratedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      processingTime: result.processingTime
    })

    return result
  }

  /**
   * Integrates a single knowledge pair with duplicate detection and quality controls
   */
  async integrateSinglePair(
    pair: KnowledgePair,
    batchId: string
  ): Promise<{
    success: boolean
    skipped: boolean
    isDuplicate: boolean
    documentId?: string
    sourceAttribution?: SourceAttribution
    errors: IntegrationError[]
  }> {
    const errors: IntegrationError[] = []

    try {
      // Check for duplicates if enabled
      if (this.options.enableDuplicateDetection) {
        const duplicateResult = await this.detectDuplicates(pair)
        
        if (duplicateResult.isDuplicate) {
          console.debug(`KnowledgeIntegrator: Duplicate detected for query ${pair.queryId}`, {
            existingDocumentId: duplicateResult.existingDocumentId,
            similarityScore: duplicateResult.similarityScore,
            resolution: duplicateResult.conflictResolution
          })

          if (duplicateResult.conflictResolution === 'skip') {
            return {
              success: false,
              skipped: true,
              isDuplicate: true,
              errors: []
            }
          } else if (duplicateResult.conflictResolution === 'merge') {
            return await this.mergeDuplicateContent(pair, duplicateResult.existingDocumentId!)
          }
        }
      }

      // Create knowledge document
      const document = await this.createKnowledgeDocument(pair, batchId)
      
      // Store in knowledge base
      const documentId = await this.adapter.createDocument(document)
      
      const sourceAttribution: SourceAttribution = {
        queryId: pair.queryId,
        source: 'human-agent',
        agentId: pair.metadata.agentId,
        sessionId: batchId, // Using batchId as session reference
        confidence: pair.confidence,
        validationStatus: pair.quality as 'approved' | 'pending' | 'rejected'
      }

      console.debug(`KnowledgeIntegrator: Successfully integrated pair ${pair.queryId}`, {
        documentId,
        confidence: pair.confidence,
        quality: pair.quality
      })

      return {
        success: true,
        skipped: false,
        isDuplicate: false,
        documentId,
        sourceAttribution,
        errors: []
      }

    } catch (error) {
      errors.push({
        type: 'storage',
        message: error instanceof Error ? error.message : 'Unknown error',
        queryId: pair.queryId,
        severity: 'high',
        timestamp: new Date(),
        retryable: true
      })

      return {
        success: false,
        skipped: false,
        isDuplicate: false,
        errors
      }
    }
  }

  /**
   * Creates a knowledge document from a knowledge pair
   */
  async createKnowledgeDocument(pair: KnowledgePair, batchId: string): Promise<KnowledgeDocument> {
    const documentId = this.generateDocumentId()
    const searchKeywords = this.extractSearchKeywords(pair.query, pair.response)
    const domain = this.extractDomain(pair.metadata.tags)

    const document: KnowledgeDocument = {
      id: documentId,
      title: this.generateTitle(pair.query),
      content: this.formatContent(pair.query, pair.response),
      source: 'learned',
      sourceAttribution: {
        queryId: pair.queryId,
        source: 'human-agent',
        agentId: pair.metadata.agentId,
        sessionId: batchId,
        confidence: pair.confidence,
        validationStatus: pair.quality as 'approved' | 'pending' | 'rejected'
      },
      tags: this.options.tagGeneration ? this.generateTags(pair) : pair.metadata.tags,
      metadata: {
        queryComplexity: pair.metadata.queryComplexity,
        responseQuality: pair.metadata.responseQuality,
        userIntent: pair.metadata.context.userIntent,
        domain,
        language: 'en', // Default to English
        searchKeywords,
        relatedQueries: pair.metadata.context.previousQueries,
        usageCount: 0,
        effectiveness: pair.confidence
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    }

    return document
  }

  /**
   * Detects duplicate content in the knowledge base
   */
  async detectDuplicates(pair: KnowledgePair): Promise<DuplicateDetectionResult> {
    try {
      const similarDocuments = await this.adapter.findSimilarDocuments(
        pair.query,
        this.options.duplicateThreshold
      )

      if (similarDocuments.length === 0) {
        return {
          isDuplicate: false,
          similarityScore: 0,
          conflictResolution: 'create_variant',
          reason: 'No similar documents found'
        }
      }

      // Find the most similar document
      const mostSimilar = similarDocuments[0]
      const similarityScore = this.calculateSimilarity(pair.query, mostSimilar.title)

      if (similarityScore >= this.options.duplicateThreshold) {
        // Determine conflict resolution strategy
        let resolution: 'merge' | 'replace' | 'skip' | 'create_variant' = 'skip'
        
        if (pair.confidence > mostSimilar.sourceAttribution.confidence) {
          resolution = 'replace'
        } else if (Math.abs(pair.confidence - mostSimilar.sourceAttribution.confidence) < 0.1) {
          resolution = 'merge'
        }

        return {
          isDuplicate: true,
          existingDocumentId: mostSimilar.id,
          similarityScore,
          conflictResolution: resolution,
          reason: `Similar document found with ${(similarityScore * 100).toFixed(1)}% similarity`
        }
      }

      return {
        isDuplicate: false,
        similarityScore,
        conflictResolution: 'create_variant',
        reason: 'Similarity below threshold'
      }

    } catch (error) {
      console.error('KnowledgeIntegrator: Error detecting duplicates:', error)
      return {
        isDuplicate: false,
        similarityScore: 0,
        conflictResolution: 'create_variant',
        reason: 'Error during duplicate detection'
      }
    }
  }

  /**
   * Merges duplicate content with existing document
   */
  async mergeDuplicateContent(
    pair: KnowledgePair,
    existingDocumentId: string
  ): Promise<{
    success: boolean
    skipped: boolean
    isDuplicate: boolean
    documentId?: string
    sourceAttribution?: SourceAttribution
    errors: IntegrationError[]
  }> {
    try {
      const existingDocument = await this.adapter.getDocumentById(existingDocumentId)
      if (!existingDocument) {
        throw new Error(`Document ${existingDocumentId} not found for merging`)
      }

      // Merge content
      const mergedContent = this.mergeContent(existingDocument.content, pair.response)
      const mergedTags = [...new Set([...existingDocument.tags, ...pair.metadata.tags])]
      
      // Update document
      await this.adapter.updateDocument(existingDocumentId, {
        content: mergedContent,
        tags: mergedTags,
        updatedAt: new Date(),
        version: existingDocument.version + 1,
        metadata: {
          ...existingDocument.metadata,
          usageCount: existingDocument.metadata.usageCount + 1,
          effectiveness: Math.max(existingDocument.metadata.effectiveness, pair.confidence)
        }
      })

      const sourceAttribution: SourceAttribution = {
        queryId: pair.queryId,
        source: 'human-agent',
        agentId: pair.metadata.agentId,
        sessionId: existingDocumentId,
        confidence: pair.confidence,
        validationStatus: pair.quality as 'approved' | 'pending' | 'rejected'
      }

      return {
        success: true,
        skipped: false,
        isDuplicate: true,
        documentId: existingDocumentId,
        sourceAttribution,
        errors: []
      }

    } catch (error) {
      return {
        success: false,
        skipped: false,
        isDuplicate: true,
        errors: [{
          type: 'storage',
          message: `Failed to merge duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`,
          queryId: pair.queryId,
          severity: 'medium',
          timestamp: new Date(),
          retryable: true
        }]
      }
    }
  }

  /**
   * Gets integration history for a batch
   */
  getIntegrationHistory(batchId: string): KnowledgeIntegrationResult | null {
    return this.integrationHistory.get(batchId) || null
  }

  /**
   * Gets all integration history
   */
  getAllIntegrationHistory(): KnowledgeIntegrationResult[] {
    return Array.from(this.integrationHistory.values())
  }

  /**
   * Retries failed integrations from a batch
   */
  async retryFailedIntegrations(batchId: string): Promise<KnowledgeIntegrationResult | null> {
    const originalResult = this.integrationHistory.get(batchId)
    if (!originalResult || originalResult.failedCount === 0) {
      return null
    }

    // This would require storing the original pairs, which we don't do in this implementation
    // In a real implementation, you'd store failed pairs and retry them
    console.info(`KnowledgeIntegrator: Retry not implemented for batch ${batchId}`)
    return null
  }

  // Private helper methods

  private filterByQuality(pairs: KnowledgePair[]): KnowledgePair[] {
    return pairs.filter(pair => {
      if (pair.quality === 'rejected') {
        return false
      }
      
      if (pair.quality === 'approved') {
        return true
      }

      // For pending pairs, check confidence threshold
      return pair.confidence >= this.options.minQualityScore
    })
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation using word overlap
    const words1 = text1.toLowerCase().split(/\s+/)
    const words2 = text2.toLowerCase().split(/\s+/)
    
    const intersection = words1.filter(word => words2.includes(word))
    const union = [...new Set([...words1, ...words2])]
    
    return union.length > 0 ? intersection.length / union.length : 0
  }

  private mergeContent(existingContent: string, newContent: string): string {
    // Simple content merging - in practice, this would be more sophisticated
    if (existingContent.includes(newContent)) {
      return existingContent
    }
    
    return `${existingContent}\n\nAdditional Information:\n${newContent}`
  }

  private generateTitle(query: string): string {
    // Generate a title from the query
    const title = query.length > 50 ? query.substring(0, 47) + '...' : query
    return title.replace(/[?!.]+$/, '') // Remove trailing punctuation
  }

  private formatContent(query: string, response: string): string {
    return `Q: ${query}\n\nA: ${response}`
  }

  private extractSearchKeywords(query: string, response: string): string[] {
    const text = `${query} ${response}`.toLowerCase()
    const words = text.split(/\s+/)
    
    // Filter out common words and short words
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'])
    
    const keywords = words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
      .slice(0, 10) // Limit to 10 keywords
    
    return keywords
  }

  private extractDomain(tags: string[]): string[] {
    const domainMap: Record<string, string> = {
      'event': 'event_management',
      'venue': 'venue_management',
      'guest': 'guest_management',
      'booking': 'booking_system',
      'planning': 'event_planning',
      'api': 'technical',
      'integration': 'technical',
      'configuration': 'technical'
    }

    const domains = tags
      .map(tag => domainMap[tag.toLowerCase()])
      .filter(Boolean)
      .filter((domain, index, arr) => arr.indexOf(domain) === index)

    return domains.length > 0 ? domains : ['general']
  }

  private generateTags(pair: KnowledgePair): string[] {
    const existingTags = pair.metadata.tags
    const generatedTags: string[] = []

    // Add complexity-based tags
    generatedTags.push(`complexity:${pair.metadata.queryComplexity}`)
    
    // Add quality-based tags
    if (pair.metadata.responseQuality >= 0.8) {
      generatedTags.push('high-quality')
    } else if (pair.metadata.responseQuality >= 0.6) {
      generatedTags.push('medium-quality')
    }

    // Add intent-based tags
    generatedTags.push(`intent:${pair.metadata.context.userIntent}`)

    // Add source tags
    generatedTags.push('learned-content', 'human-validated')

    return [...new Set([...existingTags, ...generatedTags])]
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
/**
 * Enhanced Vector Knowledge Handler
 * Leverages Botpress built-in embedding and vector search capabilities
 */

import { KnowledgeResponseRefiner } from './knowledge-response-refiner'
import { refinementConfigManager, detectTopicFromQuery } from './knowledge-refinement-config'

export interface VectorSearchOptions {
  maxResults?: number
  minScore?: number
  tags?: Record<string, string>
  timeout?: number
}

export interface VectorSearchResult {
  content: string
  score: number
  source: string
  metadata: {
    fileName?: string
    fileId?: string
    chunkIndex?: number
    relevanceScore: number
    topic: string
  }
}

export class EnhancedVectorKnowledgeHandler {
  private refiner: KnowledgeResponseRefiner

  constructor(client?: any) {
    this.refiner = new KnowledgeResponseRefiner(client)
  }

  /**
   * Search knowledge base using Botpress built-in vector search
   */
  async searchKnowledgeWithVector(
    query: string, 
    client: any, 
    options: VectorSearchOptions = {}
  ): Promise<string | null> {
    try {
      // Use Botpress built-in vector search
      const searchResult = await client.searchFiles({
        query,
        ...options
      })

      const passages = searchResult.passages || []
      
      if (passages.length === 0) {
        console.info('Vector search: No passages found for query:', query.substring(0, 100))
        return null
      }

      console.info('Vector search: Found passages', {
        count: passages.length,
        query: query.substring(0, 100),
        topScore: passages[0]?.score || 'unknown'
      })

      // Convert passages to our format
      const vectorResults: VectorSearchResult[] = passages.map((passage: any, index: number) => ({
        content: passage.content || '',
        score: passage.score || 0,
        source: passage.file?.name || `Document ${index + 1}`,
        metadata: {
          fileName: passage.file?.name,
          fileId: passage.file?.id,
          chunkIndex: index,
          relevanceScore: passage.score || 0,
          topic: detectTopicFromQuery(query)
        }
      }))

      // Combine and refine the results
      return await this.processVectorResults(vectorResults, query)

    } catch (error) {
      console.error('Vector search failed:', error)
      return null
    }
  }

  /**
   * Process vector search results and apply refinement
   */
  private async processVectorResults(
    results: VectorSearchResult[], 
    query: string
  ): Promise<string | null> {
    if (results.length === 0) return null

    // Combine top results (limit to avoid too much content)
    const topResults = results.slice(0, 3)
    const combinedContent = topResults
      .map(result => result.content)
      .join('\n\n')

    // Detect topic and get appropriate configuration
    const topic = detectTopicFromQuery(query)
    const config = refinementConfigManager.getConfigForTopic(topic)

    // Apply refinement to make response concise and engaging
    const refinedResponse = await this.refiner.refineResponse(combinedContent, query, {
      maxLines: config.maxLines,
      removeFileNames: config.removeFileNames,
      removeSources: config.removeSources,
      addEmojis: config.addEmojis,
      includeFollowUp: config.includeFollowUp,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    })

    console.info('Vector knowledge processed:', {
      originalLength: combinedContent.length,
      refinedLength: refinedResponse.refinedLength,
      confidence: refinedResponse.confidence,
      topScore: topResults[0]?.score,
      resultCount: topResults.length,
      topic
    })

    return refinedResponse.content
  }

  /**
   * Search with fallback to basic knowledge if vector search fails
   */
  async searchWithFallback(
    query: string, 
    client: any, 
    options: VectorSearchOptions = {}
  ): Promise<string | null> {
    // Try vector search first
    const vectorResult = await this.searchKnowledgeWithVector(query, client, options)
    
    if (vectorResult) {
      return vectorResult
    }

    // Fallback to basic knowledge search
    console.info('Vector search failed, falling back to basic knowledge search')
    const { searchKnowledge } = await import('./knowledge-handler')
    return searchKnowledge(query)
  }

  /**
   * Get search statistics and insights
   */
  async getSearchInsights(
    query: string, 
    client: any
  ): Promise<SearchInsights> {
    try {
      const searchResult = await client.searchFiles({
        query,
        // Get more results for analysis
        limit: 10
      })

      const passages = searchResult.passages || []
      
      return {
        totalResults: passages.length,
        averageScore: passages.length > 0 
          ? passages.reduce((sum: number, p: any) => sum + (p.score || 0), 0) / passages.length 
          : 0,
        topScore: passages[0]?.score || 0,
        sources: [...new Set(passages.map((p: any) => p.file?.name).filter(Boolean))],
        topics: this.analyzeTopics(passages),
        confidence: this.calculateSearchConfidence(passages, query)
      }
    } catch (error) {
      console.error('Failed to get search insights:', error)
      return {
        totalResults: 0,
        averageScore: 0,
        topScore: 0,
        sources: [],
        topics: [],
        confidence: 0
      }
    }
  }

  /**
   * Analyze topics from search results
   */
  private analyzeTopics(passages: any[]): string[] {
    const topics = new Set<string>()
    
    passages.forEach(passage => {
      const content = (passage.content || '').toLowerCase()
      
      // Simple topic detection based on keywords
      if (content.includes('wedding')) topics.add('wedding')
      if (content.includes('venue')) topics.add('venue')
      if (content.includes('budget') || content.includes('cost')) topics.add('budget')
      if (content.includes('corporate')) topics.add('corporate')
      if (content.includes('catering') || content.includes('food')) topics.add('catering')
      if (content.includes('planning')) topics.add('planning')
    })
    
    return Array.from(topics)
  }

  /**
   * Calculate search confidence based on results
   */
  private calculateSearchConfidence(passages: any[], query: string): number {
    if (passages.length === 0) return 0

    const avgScore = passages.reduce((sum: number, p: any) => sum + (p.score || 0), 0) / passages.length
    const resultCount = Math.min(passages.length / 5, 1) // More results = higher confidence, capped at 5
    const topScore = passages[0]?.score || 0

    // Weighted confidence calculation
    return Math.min(1, (avgScore * 0.4) + (resultCount * 0.3) + (topScore * 0.3))
  }

  /**
   * Update the refiner client
   */
  updateClient(client: any): void {
    this.refiner.updateClient(client)
  }
}

export interface SearchInsights {
  totalResults: number
  averageScore: number
  topScore: number
  sources: string[]
  topics: string[]
  confidence: number
}

// Export singleton instance
export const vectorKnowledgeHandler = new EnhancedVectorKnowledgeHandler()

// Utility function to check if vector search is available
export function isVectorSearchAvailable(client: any): boolean {
  return client && typeof client.searchFiles === 'function'
}

// Enhanced search function that uses vector search when available
export async function searchKnowledgeEnhanced(
  query: string, 
  client?: any
): Promise<string | null> {
  if (isVectorSearchAvailable(client)) {
    console.info('Using enhanced vector search for query:', query.substring(0, 100))
    return await vectorKnowledgeHandler.searchWithFallback(query, client)
  } else {
    console.info('Vector search not available, using basic search')
    const { searchKnowledge } = await import('./knowledge-handler')
    return searchKnowledge(query)
  }
}
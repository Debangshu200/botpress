/**
 * Confidence Scoring Engine
 * Evaluates the quality and relevance of knowledge base matches using semantic similarity
 */

export interface ConfidenceFactor {
  name: string
  score: number
  weight: number
  description: string
}

export interface ConfidenceScore {
  score: number // 0-1 scale
  threshold: number
  isAboveThreshold: boolean
  factors: ConfidenceFactor[]
}

export interface SearchResult {
  content: string
  score: number
  source: string
  metadata: SearchMetadata
  passages?: ContentPassage[]
}

export interface SearchMetadata {
  topic: string
  relevanceScore: number
  matchType: 'exact' | 'partial' | 'semantic'
  keywords: string[]
}

export interface ContentPassage {
  text: string
  startIndex: number
  endIndex: number
  relevanceScore: number
}

export interface AggregatedResult {
  combinedContent: string
  averageScore: number
  sources: string[]
  confidence: ConfidenceScore
}

export class ConfidenceEngine {
  private threshold: number = 0.6 // Default threshold

  constructor(threshold?: number) {
    if (threshold !== undefined) {
      this.threshold = threshold
    }
  }

  /**
   * Calculate confidence score for search results
   */
  calculateConfidence(query: string, results: SearchResult[]): ConfidenceScore {
    if (!results || results.length === 0) {
      return {
        score: 0,
        threshold: this.threshold,
        isAboveThreshold: false,
        factors: [{
          name: 'no_results',
          score: 0,
          weight: 1.0,
          description: 'No search results found'
        }]
      }
    }

    const factors: ConfidenceFactor[] = []

    // Factor 1: Keyword matching score
    const keywordScore = this.calculateKeywordMatchScore(query, results)
    factors.push({
      name: 'keyword_match',
      score: keywordScore,
      weight: 0.3,
      description: 'Direct keyword matching with search results'
    })

    // Factor 2: Semantic similarity score
    const semanticScore = this.calculateSemanticSimilarity(query, results)
    factors.push({
      name: 'semantic_similarity',
      score: semanticScore,
      weight: 0.4,
      description: 'Semantic similarity between query and results'
    })

    // Factor 3: Result quality score
    const qualityScore = this.calculateResultQuality(results)
    factors.push({
      name: 'result_quality',
      score: qualityScore,
      weight: 0.2,
      description: 'Quality and completeness of search results'
    })

    // Factor 4: Coverage score (how well results cover the query)
    const coverageScore = this.calculateCoverageScore(query, results)
    factors.push({
      name: 'coverage',
      score: coverageScore,
      weight: 0.1,
      description: 'How comprehensively results address the query'
    })

    // Calculate weighted average
    const totalScore = factors.reduce((sum, factor) => 
      sum + (factor.score * factor.weight), 0
    )

    return {
      score: Math.min(1.0, Math.max(0.0, totalScore)),
      threshold: this.threshold,
      isAboveThreshold: totalScore >= this.threshold,
      factors
    }
  }

  /**
   * Set confidence threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = Math.min(1.0, Math.max(0.0, threshold))
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.threshold
  }

  /**
   * Aggregate multiple search results into a single result
   */
  aggregateResults(results: SearchResult[]): AggregatedResult {
    if (!results || results.length === 0) {
      return {
        combinedContent: '',
        averageScore: 0,
        sources: [],
        confidence: this.calculateConfidence('', [])
      }
    }

    // Sort results by score (highest first)
    const sortedResults = [...results].sort((a, b) => b.score - a.score)
    
    // Take top results (max 3 for readability)
    const topResults = sortedResults.slice(0, 3)
    
    // Combine content from top results
    const combinedContent = topResults
      .map((result) => {
        const prefix = topResults.length > 1 ? `**${result.source}:**\n` : ''
        return `${prefix}${result.content}`
      })
      .join('\n\n---\n\n')

    // Calculate average score
    const averageScore = topResults.reduce((sum, result) => sum + result.score, 0) / topResults.length

    // Extract sources
    const sources = topResults.map(result => result.source)

    return {
      combinedContent,
      averageScore,
      sources,
      confidence: this.calculateConfidence('', topResults)
    }
  }

  /**
   * Calculate keyword matching score
   */
  private calculateKeywordMatchScore(query: string, results: SearchResult[]): number {
    const queryWords = this.extractKeywords(query.toLowerCase())
    if (queryWords.length === 0) return 0

    let totalMatches = 0
    let totalPossible = 0

    results.forEach(result => {
      const resultWords = this.extractKeywords(result.content.toLowerCase())
      const matches = queryWords.filter(word => 
        resultWords.some(resultWord => 
          resultWord.includes(word) || word.includes(resultWord)
        )
      ).length

      totalMatches += matches
      totalPossible += queryWords.length
    })

    return totalPossible > 0 ? totalMatches / totalPossible : 0
  }

  /**
   * Calculate semantic similarity using simple word overlap and context
   */
  private calculateSemanticSimilarity(query: string, results: SearchResult[]): number {
    const queryContext = this.extractContext(query)
    
    let totalSimilarity = 0
    results.forEach(result => {
      const resultContext = this.extractContext(result.content)
      const similarity = this.calculateContextSimilarity(queryContext, resultContext)
      totalSimilarity += similarity
    })

    return results.length > 0 ? totalSimilarity / results.length : 0
  }

  /**
   * Calculate result quality based on content length and structure
   */
  private calculateResultQuality(results: SearchResult[]): number {
    if (results.length === 0) return 0

    let totalQuality = 0
    results.forEach(result => {
      let quality = 0

      // Content length factor (optimal range: 100-1000 characters)
      const contentLength = result.content.length
      if (contentLength >= 100 && contentLength <= 1000) {
        quality += 0.4
      } else if (contentLength > 50) {
        quality += 0.2
      }

      // Structure factor (presence of lists, sections, etc.)
      if (result.content.includes('\n') || result.content.includes('•') || 
          result.content.includes('-') || result.content.includes(':')) {
        quality += 0.3
      }

      // Completeness factor (ends with proper punctuation)
      if (result.content.trim().match(/[.!?]$/)) {
        quality += 0.2
      }

      // Relevance score from metadata
      if (result.metadata && result.metadata.relevanceScore) {
        quality += result.metadata.relevanceScore * 0.1
      }

      totalQuality += Math.min(1.0, quality)
    })

    return totalQuality / results.length
  }

  /**
   * Calculate how well results cover the query
   */
  private calculateCoverageScore(query: string, results: SearchResult[]): number {
    const queryAspects = this.extractQueryAspects(query)
    if (queryAspects.length === 0) return 0.5 // Default for simple queries

    let coveredAspects = 0
    const allContent = results.map(r => r.content.toLowerCase()).join(' ')

    queryAspects.forEach(aspect => {
      if (allContent.includes(aspect.toLowerCase())) {
        coveredAspects++
      }
    })

    return coveredAspects / queryAspects.length
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common stop words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
    ])

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10) // Limit to top 10 keywords
  }

  /**
   * Extract context from text for semantic analysis
   */
  private extractContext(text: string): string[] {
    // Extract phrases and important terms that provide context
    const phrases: string[] = []
    
    // Extract noun phrases (simplified)
    const words = text.toLowerCase().split(/\s+/)
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`
      if (phrase.length > 5) {
        phrases.push(phrase)
      }
    }

    // Extract important single words
    const keywords = this.extractKeywords(text)
    phrases.push(...keywords)

    return phrases.slice(0, 20) // Limit context size
  }

  /**
   * Calculate similarity between two context arrays
   */
  private calculateContextSimilarity(context1: string[], context2: string[]): number {
    if (context1.length === 0 || context2.length === 0) return 0

    let matches = 0
    context1.forEach(item1 => {
      context2.forEach(item2 => {
        if (item1 === item2 || item1.includes(item2) || item2.includes(item1)) {
          matches++
        }
      })
    })

    const maxPossible = Math.max(context1.length, context2.length)
    return matches / maxPossible
  }

  /**
   * Extract query aspects for coverage analysis
   */
  private extractQueryAspects(query: string): string[] {
    const aspects: string[] = []
    
    // Extract question words and their context
    const questionWords = ['what', 'how', 'where', 'when', 'why', 'who', 'which']
    const words = query.toLowerCase().split(/\s+/)
    
    questionWords.forEach(qWord => {
      const index = words.indexOf(qWord)
      if (index !== -1 && index < words.length - 1) {
        // Add the question word and following words as aspects
        aspects.push(`${qWord} ${words[index + 1]}`)
        if (index < words.length - 2) {
          aspects.push(`${qWord} ${words[index + 1]} ${words[index + 2]}`)
        }
      }
    })

    // Add important keywords as aspects
    const keywords = this.extractKeywords(query)
    aspects.push(...keywords.slice(0, 5))

    return aspects
  }
}
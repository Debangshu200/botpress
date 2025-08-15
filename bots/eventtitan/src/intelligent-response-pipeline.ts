/**
 * Intelligent Response Generation Pipeline
 * Integrates knowledge base search with GPT-OSS-20B for enhanced responses
 */

import { gptOss20BService, GPTOss20BResponse } from './gpt-oss-20b-service'
import { EnhancedKnowledgeHandler } from './enhanced-knowledge-handler'
import { ConfidenceEngine, ConfidenceScore, SearchResult } from './confidence-engine'
import { MessageRouter, RoutingDecision, RoutingConfiguration } from './message-router'

export interface PipelineRequest {
  query: string
  userId?: string
  conversationId?: string
  options?: PipelineOptions
}

export interface PipelineOptions {
  useKnowledgeBase: boolean
  useLLMEnhancement: boolean
  confidenceThreshold: number
  maxKnowledgeResults: number
  llmMaxTokens: number
  llmTemperature: number
  forceDirectResponse: boolean
  enableFallback: boolean
}

export interface PipelineResponse {
  success: boolean
  response: string
  confidence: ConfidenceScore
  source: 'knowledge-only' | 'llm-enhanced' | 'llm-only' | 'fallback'
  shouldHandoff: boolean
  processingTime: number
  tokensUsed?: number
  knowledgeUsed: boolean
  qualityScore: number
  metadata: PipelineMetadata
}

export interface PipelineMetadata {
  knowledgeResults: SearchResult[]
  llmResponse?: GPTOss20BResponse
  routingDecision: RoutingDecision
  qualityFactors: QualityFactor[]
  fallbackReason?: string
}

export interface QualityFactor {
  name: string
  score: number
  weight: number
  description: string
}

export class IntelligentResponsePipeline {
  private knowledgeHandler: EnhancedKnowledgeHandler
  private confidenceEngine: ConfidenceEngine
  private messageRouter: MessageRouter
  private defaultOptions: PipelineOptions

  constructor(routingConfig?: Partial<RoutingConfiguration>) {
    this.knowledgeHandler = new EnhancedKnowledgeHandler()
    this.confidenceEngine = new ConfidenceEngine()
    
    const defaultRoutingConfig: RoutingConfiguration = {
      confidenceThreshold: 0.6,
      handoffEnabled: true,
      clarificationThreshold: 0.4,
      maxSearchResults: 5,
      responseTimeout: 30000,
      ...routingConfig
    }
    
    this.messageRouter = new MessageRouter(defaultRoutingConfig)
    
    this.defaultOptions = {
      useKnowledgeBase: true,
      useLLMEnhancement: true,
      confidenceThreshold: 0.6,
      maxKnowledgeResults: 3,
      llmMaxTokens: 600,
      llmTemperature: 0.7,
      forceDirectResponse: false,
      enableFallback: true
    }
  }

  /**
   * Process query through the intelligent response pipeline
   */
  async generateResponse(request: PipelineRequest): Promise<PipelineResponse> {
    const startTime = Date.now()
    const options = { ...this.defaultOptions, ...request.options }

    try {
      // Step 1: Search knowledge base
      const knowledgeResults = await this.searchKnowledgeBase(request.query, options)
      
      // Step 2: Calculate confidence score
      const confidence = this.confidenceEngine.calculateConfidence(request.query, knowledgeResults)
      
      // Step 3: Make routing decision
      const routingDecision = this.messageRouter.routeMessage(
        request.query,
        confidence,
        knowledgeResults
      )

      // Step 4: Generate response based on routing decision
      const response = await this.executeResponseStrategy(
        request.query,
        knowledgeResults,
        confidence,
        routingDecision,
        options
      )

      // Step 5: Assess response quality
      const qualityScore = this.assessResponseQuality(
        request.query,
        response,
        knowledgeResults,
        confidence
      )

      return {
        success: true,
        response: response.content,
        confidence,
        source: response.source,
        shouldHandoff: routingDecision.shouldHandoff,
        processingTime: Date.now() - startTime,
        tokensUsed: response.tokensUsed,
        knowledgeUsed: knowledgeResults.length > 0,
        qualityScore: qualityScore.score,
        metadata: {
          knowledgeResults,
          llmResponse: response.llmResponse,
          routingDecision,
          qualityFactors: qualityScore.factors,
          fallbackReason: response.fallbackReason
        }
      }

    } catch (error) {
      console.error('IntelligentResponsePipeline: Error generating response:', error)
      
      return {
        success: false,
        response: 'I apologize, but I encountered an error processing your request. Please try again or contact support.',
        confidence: { score: 0, threshold: options.confidenceThreshold, isAboveThreshold: false, factors: [] },
        source: 'fallback',
        shouldHandoff: true,
        processingTime: Date.now() - startTime,
        knowledgeUsed: false,
        qualityScore: 0,
        metadata: {
          knowledgeResults: [],
          routingDecision: {
            route: 'human_handoff',
            confidence: { score: 0, threshold: options.confidenceThreshold, isAboveThreshold: false, factors: [] },
            reasoning: 'Pipeline error occurred',
            shouldRespond: false,
            shouldHandoff: true,
            metadata: { searchResults: [], processingTime: 0 }
          },
          qualityFactors: [],
          fallbackReason: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Update pipeline configuration
   */
  updateConfiguration(
    routingConfig?: Partial<RoutingConfiguration>,
    pipelineOptions?: Partial<PipelineOptions>
  ): void {
    if (routingConfig) {
      this.messageRouter.updateConfiguration(routingConfig)
    }
    
    if (pipelineOptions) {
      this.defaultOptions = { ...this.defaultOptions, ...pipelineOptions }
    }
  }

  /**
   * Get pipeline statistics
   */
  getStatistics(): {
    knowledgeStats: any
    routingConfig: RoutingConfiguration
    pipelineOptions: PipelineOptions
  } {
    return {
      knowledgeStats: this.knowledgeHandler.getKnowledgeStats(),
      routingConfig: this.messageRouter.getConfiguration(),
      pipelineOptions: { ...this.defaultOptions }
    }
  }

  // Private methods

  /**
   * Search knowledge base and format results
   */
  private async searchKnowledgeBase(query: string, options: PipelineOptions): Promise<SearchResult[]> {
    if (!options.useKnowledgeBase) {
      return []
    }

    try {
      const knowledgeResult = this.knowledgeHandler.searchKnowledge(query)
      
      if (!knowledgeResult.content) {
        return []
      }

      // Convert knowledge handler result to SearchResult format
      const searchResults: SearchResult[] = knowledgeResult.documents.map(doc => ({
        content: doc.content,
        score: knowledgeResult.confidence,
        source: doc.name,
        metadata: {
          topic: doc.tags.join(', ') || 'General',
          relevanceScore: knowledgeResult.confidence,
          matchType: 'semantic' as const,
          keywords: doc.searchKeywords || []
        }
      }))

      // If no documents but we have content (fallback knowledge)
      if (searchResults.length === 0 && knowledgeResult.content) {
        searchResults.push({
          content: knowledgeResult.content,
          score: knowledgeResult.confidence,
          source: knowledgeResult.source,
          metadata: {
            topic: 'General Knowledge',
            relevanceScore: knowledgeResult.confidence,
            matchType: 'semantic' as const,
            keywords: []
          }
        })
      }

      return searchResults.slice(0, options.maxKnowledgeResults)

    } catch (error) {
      console.error('Error searching knowledge base:', error)
      return []
    }
  }

  /**
   * Execute response strategy based on routing decision
   */
  private async executeResponseStrategy(
    query: string,
    knowledgeResults: SearchResult[],
    confidence: ConfidenceScore,
    routingDecision: RoutingDecision,
    options: PipelineOptions
  ): Promise<{
    content: string
    source: 'knowledge-only' | 'llm-enhanced' | 'llm-only' | 'fallback'
    tokensUsed?: number
    llmResponse?: GPTOss20BResponse
    fallbackReason?: string
  }> {

    // Force direct response if requested
    if (options.forceDirectResponse && knowledgeResults.length > 0) {
      return this.generateKnowledgeOnlyResponse(knowledgeResults)
    }

    // Handle routing decision
    switch (routingDecision.route) {
      case 'direct_response':
        if (options.useLLMEnhancement && confidence.score >= options.confidenceThreshold) {
          return await this.generateLLMEnhancedResponse(query, knowledgeResults, options)
        } else {
          return this.generateKnowledgeOnlyResponse(knowledgeResults)
        }

      case 'human_handoff':
        if (options.enableFallback) {
          // Try LLM-only response as fallback
          return await this.generateLLMOnlyResponse(query, options, 'handoff_fallback')
        } else {
          return {
            content: routingDecision.response || "I don't have enough information to answer your question confidently. Let me connect you with a human agent.",
            source: 'fallback',
            fallbackReason: 'handoff_required'
          }
        }

      case 'clarification_needed':
        return {
          content: routingDecision.response || "Could you please provide more details about your question?",
          source: 'fallback',
          fallbackReason: 'clarification_needed'
        }

      default:
        return {
          content: "I'm not sure how to help with that. Let me connect you with a human agent.",
          source: 'fallback',
          fallbackReason: 'unknown_route'
        }
    }
  }

  /**
   * Generate knowledge-only response
   */
  private generateKnowledgeOnlyResponse(knowledgeResults: SearchResult[]): {
    content: string
    source: 'knowledge-only'
    tokensUsed?: number
  } {
    if (knowledgeResults.length === 0) {
      return {
        content: "I don't have specific information about that topic in my knowledge base.",
        source: 'knowledge-only'
      }
    }

    // Use the highest scoring result
    const bestResult = knowledgeResults.reduce((best, current) => 
      current.score > best.score ? current : best
    )

    const content = `📚 **Knowledge Base Response:**\n\n${bestResult.content}\n\n---\n💡 *Source: ${bestResult.source}*`

    return {
      content,
      source: 'knowledge-only'
    }
  }

  /**
   * Generate LLM-enhanced response using knowledge base context
   */
  private async generateLLMEnhancedResponse(
    query: string,
    knowledgeResults: SearchResult[],
    options: PipelineOptions
  ): Promise<{
    content: string
    source: 'llm-enhanced'
    tokensUsed?: number
    llmResponse?: GPTOss20BResponse
    fallbackReason?: string
  }> {
    try {
      // Prepare knowledge context for GPT-OSS-20B
      const knowledgeContext = this.formatKnowledgeForLLM(knowledgeResults)
      
      // Create enhanced prompt
      const enhancedPrompt = this.createLLMEnhancedPrompt(query, knowledgeContext)
      
      // Generate response using GPT-OSS-20B
      const llmResponse = await gptOss20BService.generateResponse({
        prompt: enhancedPrompt,
        context: knowledgeContext,
        maxTokens: options.llmMaxTokens,
        temperature: options.llmTemperature,
        useOptimization: true
      })

      if (llmResponse.success && llmResponse.content.trim()) {
        // Add source attribution
        const sources = knowledgeResults.slice(0, 3).map(r => r.source).join(', ')
        const enhancedContent = `🤖 **AI-Enhanced Response:**\n\n${llmResponse.content}\n\n---\n📚 *Based on knowledge from: ${sources}*`

        return {
          content: enhancedContent,
          source: 'llm-enhanced',
          tokensUsed: llmResponse.tokensUsed,
          llmResponse
        }
      } else {
        // Fallback to knowledge-only if LLM fails
        console.warn('LLM enhancement failed, falling back to knowledge-only response')
        const fallback = this.generateKnowledgeOnlyResponse(knowledgeResults)
        return {
          ...fallback,
          source: 'llm-enhanced', // Keep source as enhanced to indicate attempt was made
          fallbackReason: llmResponse.error || 'LLM response empty'
        }
      }

    } catch (error) {
      console.error('Error in LLM-enhanced response generation:', error)
      const fallback = this.generateKnowledgeOnlyResponse(knowledgeResults)
      return {
        ...fallback,
        source: 'llm-enhanced',
        fallbackReason: error instanceof Error ? error.message : 'LLM enhancement error'
      }
    }
  }

  /**
   * Generate LLM-only response without knowledge base
   */
  private async generateLLMOnlyResponse(
    query: string,
    options: PipelineOptions,
    fallbackReason?: string
  ): Promise<{
    content: string
    source: 'llm-only' | 'fallback'
    tokensUsed?: number
    llmResponse?: GPTOss20BResponse
    fallbackReason?: string
  }> {
    try {
      const llmResponse = await gptOss20BService.generateResponse({
        prompt: query,
        maxTokens: options.llmMaxTokens,
        temperature: options.llmTemperature + 0.1, // Slightly higher temperature for creative responses
        useOptimization: true
      })

      if (llmResponse.success && llmResponse.content.trim()) {
        const content = `🤖 **AI Response:**\n\n${llmResponse.content}\n\n---\n⚠️ *This response is generated without specific knowledge base context. Please verify important information.*`

        return {
          content,
          source: fallbackReason ? 'fallback' : 'llm-only',
          tokensUsed: llmResponse.tokensUsed,
          llmResponse,
          fallbackReason
        }
      } else {
        return {
          content: "I apologize, but I'm unable to provide a helpful response right now. Please try rephrasing your question or contact support.",
          source: 'fallback',
          fallbackReason: llmResponse.error || 'LLM response empty'
        }
      }

    } catch (error) {
      console.error('Error in LLM-only response generation:', error)
      return {
        content: "I apologize, but I'm experiencing technical difficulties. Please try again later or contact support.",
        source: 'fallback',
        fallbackReason: error instanceof Error ? error.message : 'LLM error'
      }
    }
  }

  /**
   * Format knowledge results for LLM context
   */
  private formatKnowledgeForLLM(knowledgeResults: SearchResult[]): string {
    if (knowledgeResults.length === 0) {
      return ''
    }

    let context = 'Relevant information from knowledge base:\n\n'
    
    knowledgeResults.slice(0, 3).forEach((result, index) => {
      context += `**Source ${index + 1}: ${result.source}**\n`
      context += `${result.content}\n\n`
    })

    context += 'Instructions: Use this information as your primary source when answering the user\'s question. Be accurate and cite the sources when appropriate.'

    return context
  }

  /**
   * Create enhanced prompt for LLM with knowledge context
   */
  private createLLMEnhancedPrompt(query: string, knowledgeContext: string): string {
    return `You are an intelligent assistant helping with event planning questions. Use the provided knowledge base information to give accurate, helpful responses.

${knowledgeContext}

User Question: ${query}

Please provide a comprehensive, well-structured answer that:
1. Directly addresses the user's question
2. Uses the knowledge base information as your primary source
3. Provides practical, actionable advice when appropriate
4. Maintains a friendly, professional tone
5. Acknowledges if the knowledge base doesn't fully cover the question

Your response:`
  }

  /**
   * Assess response quality using multiple factors
   */
  private assessResponseQuality(
    query: string,
    response: { content: string; source: string; tokensUsed?: number; llmResponse?: GPTOss20BResponse },
    knowledgeResults: SearchResult[],
    confidence: ConfidenceScore
  ): { score: number; factors: QualityFactor[] } {
    const factors: QualityFactor[] = []

    // Factor 1: Knowledge relevance (40% weight)
    const knowledgeRelevance = this.assessKnowledgeRelevance(query, knowledgeResults)
    factors.push({
      name: 'knowledge_relevance',
      score: knowledgeRelevance,
      weight: 0.4,
      description: 'How well the knowledge base results match the query'
    })

    // Factor 2: LLM confidence (30% weight)
    const llmConfidence = this.assessLLMConfidence(response.llmResponse, response.tokensUsed)
    factors.push({
      name: 'llm_confidence',
      score: llmConfidence,
      weight: 0.3,
      description: 'Confidence in the LLM-generated response'
    })

    // Factor 3: Response completeness (20% weight)
    const completeness = this.assessResponseCompleteness(response.content, query)
    factors.push({
      name: 'response_completeness',
      score: completeness,
      weight: 0.2,
      description: 'How complete and comprehensive the response is'
    })

    // Factor 4: Source reliability (10% weight)
    const sourceReliability = this.assessSourceReliability(response.source, knowledgeResults.length)
    factors.push({
      name: 'source_reliability',
      score: sourceReliability,
      weight: 0.1,
      description: 'Reliability of the information sources used'
    })

    // Calculate weighted average
    const totalScore = factors.reduce((sum, factor) => 
      sum + (factor.score * factor.weight), 0
    )

    return {
      score: Math.min(1.0, Math.max(0.0, totalScore)),
      factors
    }
  }

  private assessKnowledgeRelevance(query: string, knowledgeResults: SearchResult[]): number {
    if (knowledgeResults.length === 0) return 0

    // Use the confidence engine's assessment
    const confidence = this.confidenceEngine.calculateConfidence(query, knowledgeResults)
    return confidence.score
  }

  private assessLLMConfidence(llmResponse?: GPTOss20BResponse, tokensUsed?: number): number {
    if (!llmResponse || !llmResponse.success) return 0

    let confidence = 0.5 // Base confidence

    // Higher confidence for longer, more detailed responses
    if (tokensUsed && tokensUsed > 100) {
      confidence += 0.3
    } else if (tokensUsed && tokensUsed > 50) {
      confidence += 0.2
    }

    // Boost for reasonable processing time
    if (llmResponse.processingTime < 10000) {
      confidence += 0.2
    }

    return Math.min(1.0, confidence)
  }

  private assessResponseCompleteness(content: string, query: string): number {
    let completeness = 0

    // Length factor
    if (content.length > 200) {
      completeness += 0.4
    } else if (content.length > 100) {
      completeness += 0.2
    }

    // Structure factor
    if (content.includes('\n') || content.includes('•') || content.includes('-')) {
      completeness += 0.3
    }

    // Query coverage (simple keyword matching)
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3)
    const contentLower = content.toLowerCase()
    const coveredWords = queryWords.filter(word => contentLower.includes(word)).length
    
    if (queryWords.length > 0) {
      completeness += (coveredWords / queryWords.length) * 0.3
    }

    return Math.min(1.0, completeness)
  }

  private assessSourceReliability(source: string, knowledgeResultCount: number): number {
    switch (source) {
      case 'knowledge-only':
        return knowledgeResultCount > 0 ? 0.9 : 0.3
      case 'llm-enhanced':
        return knowledgeResultCount > 0 ? 0.8 : 0.5
      case 'llm-only':
        return 0.6
      case 'fallback':
        return 0.2
      default:
        return 0.5
    }
  }
}

// Export singleton instance
export const intelligentResponsePipeline = new IntelligentResponsePipeline()

// Export helper functions
export function createPipeline(routingConfig?: Partial<RoutingConfiguration>): IntelligentResponsePipeline {
  return new IntelligentResponsePipeline(routingConfig)
}

export async function generateIntelligentResponse(
  request: PipelineRequest
): Promise<PipelineResponse> {
  return await intelligentResponsePipeline.generateResponse(request)
}
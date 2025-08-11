/**
 * Message Router
 * Handles routing decisions based on confidence scores and system configuration
 */

import { ConfidenceScore, SearchResult } from './confidence-engine'

export type ResponseRoute = 'direct_response' | 'human_handoff' | 'clarification_needed'

export interface RoutingDecision {
  route: ResponseRoute
  confidence: ConfidenceScore
  reasoning: string
  shouldRespond: boolean
  shouldHandoff: boolean
  response?: string
  metadata: RoutingMetadata
}

export interface RoutingMetadata {
  searchResults: SearchResult[]
  processingTime: number
  fallbackReason?: string
  handoffContext?: HandoffContext
}

export interface HandoffContext {
  originalQuery: string
  searchResults: SearchResult[]
  confidenceScore: ConfidenceScore
  userProfile?: UserProfile
  conversationHistory?: Message[]
}

export interface UserProfile {
  id: string
  preferences?: Record<string, any>
  previousInteractions?: number
}

export interface Message {
  id: string
  content: string
  timestamp: Date
  sender: 'user' | 'bot' | 'agent'
  type: string
}

export interface RoutingConfiguration {
  confidenceThreshold: number
  handoffEnabled: boolean
  clarificationThreshold: number
  maxSearchResults: number
  responseTimeout: number
}

export class MessageRouter {
  private config: RoutingConfiguration

  constructor(config: RoutingConfiguration) {
    this.config = { ...config }
  }

  /**
   * Route message based on confidence score and configuration
   */
  routeMessage(
    query: string,
    confidence: ConfidenceScore,
    searchResults: SearchResult[],
    userProfile?: UserProfile
  ): RoutingDecision {
    const startTime = Date.now()

    // Determine routing based on confidence score
    const route = this.determineRoute(confidence, searchResults)
    
    // Create routing decision
    const decision: RoutingDecision = {
      route,
      confidence,
      reasoning: this.generateReasoning(route, confidence, searchResults),
      shouldRespond: route === 'direct_response',
      shouldHandoff: route === 'human_handoff',
      metadata: {
        searchResults,
        processingTime: Date.now() - startTime
      }
    }

    // Add route-specific data
    switch (route) {
      case 'direct_response':
        decision.response = this.generateDirectResponse(searchResults, confidence)
        break
        
      case 'human_handoff':
        if (this.config.handoffEnabled) {
          decision.metadata.handoffContext = {
            originalQuery: query,
            searchResults,
            confidenceScore: confidence,
            userProfile
          }
        } else {
          // Fallback to best available response if handoff is disabled
          decision.route = 'direct_response'
          decision.shouldRespond = true
          decision.shouldHandoff = false
          decision.response = this.generateFallbackResponse(searchResults, confidence)
          decision.metadata.fallbackReason = 'handoff_disabled'
        }
        break
        
      case 'clarification_needed':
        decision.response = this.generateClarificationResponse(query, searchResults)
        decision.shouldRespond = true
        break
    }

    return decision
  }

  /**
   * Update routing configuration
   */
  updateConfiguration(newConfig: Partial<RoutingConfiguration>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): RoutingConfiguration {
    return { ...this.config }
  }

  /**
   * Determine the appropriate route based on confidence and results
   */
  private determineRoute(confidence: ConfidenceScore, searchResults: SearchResult[]): ResponseRoute {
    // No results found - handoff if enabled, otherwise clarification
    if (!searchResults || searchResults.length === 0) {
      return this.config.handoffEnabled ? 'human_handoff' : 'clarification_needed'
    }

    // High confidence - direct response
    if (confidence.isAboveThreshold && confidence.score >= this.config.confidenceThreshold) {
      return 'direct_response'
    }

    // Medium confidence - check clarification threshold
    if (confidence.score >= this.config.clarificationThreshold) {
      return 'clarification_needed'
    }

    // Low confidence - handoff if enabled, otherwise clarification
    return this.config.handoffEnabled ? 'human_handoff' : 'clarification_needed'
  }

  /**
   * Generate reasoning for the routing decision
   */
  private generateReasoning(
    route: ResponseRoute, 
    confidence: ConfidenceScore, 
    searchResults: SearchResult[]
  ): string {
    const score = Math.round(confidence.score * 100)
    const threshold = Math.round(confidence.threshold * 100)

    switch (route) {
      case 'direct_response':
        return `High confidence response (${score}% >= ${threshold}% threshold) with ${searchResults.length} relevant result(s)`
        
      case 'human_handoff':
        if (searchResults.length === 0) {
          return `No relevant results found, escalating to human agent`
        }
        return `Low confidence (${score}% < ${threshold}% threshold), escalating to human agent`
        
      case 'clarification_needed':
        if (searchResults.length === 0) {
          return `No relevant results found, requesting clarification`
        }
        return `Medium confidence (${score}%), requesting clarification before responding`
        
      default:
        return `Unknown routing decision`
    }
  }

  /**
   * Generate direct response from search results
   */
  private generateDirectResponse(searchResults: SearchResult[], confidence: ConfidenceScore): string {
    if (!searchResults || searchResults.length === 0) {
      return "I don't have specific information about that topic."
    }

    // Use the highest scoring result
    const bestResult = searchResults.reduce((best, current) => 
      current.score > best.score ? current : best
    )

    // Add confidence indicator
    const confidenceLevel = this.getConfidenceLevel(confidence.score)
    const confidenceIndicator = this.getConfidenceIndicator(confidenceLevel)

    return `${confidenceIndicator} **Knowledge Base Response:**\n\n${bestResult.content}\n\n---\n💡 *This information comes from my knowledge base. ${this.getConfidenceMessage(confidenceLevel)}*`
  }

  /**
   * Generate fallback response when handoff is disabled
   */
  private generateFallbackResponse(searchResults: SearchResult[], _confidence: ConfidenceScore): string {
    if (!searchResults || searchResults.length === 0) {
      return "I don't have specific information about that topic. You might want to rephrase your question or ask about something more specific."
    }

    const bestResult = searchResults[0]
    if (!bestResult) {
      return "I don't have specific information about that topic. You might want to rephrase your question or ask about something more specific."
    }
    
    return `🤔 **Best Available Information:**\n\n${bestResult.content}\n\n---\n⚠️ *I'm not entirely confident about this answer. You may want to verify this information or ask for more specific details.*`
  }

  /**
   * Generate clarification response
   */
  private generateClarificationResponse(query: string, searchResults: SearchResult[]): string {
    if (!searchResults || searchResults.length === 0) {
      return `🤔 I'm not sure I understand what you're looking for. Could you please:\n\n• Be more specific about your question\n• Provide more context\n• Try rephrasing your question\n\nFor example, instead of "${query}", you might ask about specific aspects like planning, budgeting, or logistics.`
    }

    // Show partial results and ask for clarification
    const topics = searchResults.map(result => result.metadata?.topic || result.source).slice(0, 3)
    const topicList = topics.map(topic => `• ${topic}`).join('\n')

    return `🤔 I found some related information, but I'd like to give you the most relevant answer. Are you asking about:\n\n${topicList}\n\nOr something else? Please let me know which aspect interests you most!`
  }

  /**
   * Get confidence level category
   */
  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8) return 'high'
    if (score >= 0.6) return 'medium'
    return 'low'
  }

  /**
   * Get confidence indicator emoji
   */
  private getConfidenceIndicator(level: 'high' | 'medium' | 'low'): string {
    switch (level) {
      case 'high': return '📚'
      case 'medium': return '📖'
      case 'low': return '📄'
    }
  }

  /**
   * Get confidence message for user
   */
  private getConfidenceMessage(level: 'high' | 'medium' | 'low'): string {
    switch (level) {
      case 'high': return 'I\'m confident this information is relevant to your question.'
      case 'medium': return 'This should help with your question, but let me know if you need more specific information.'
      case 'low': return 'This might be helpful, but please let me know if you need something more specific.'
    }
  }
}
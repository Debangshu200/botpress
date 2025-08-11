/**
 * Response Quality Indicators
 * Handles confidence level display, source attribution, and user feedback collection
 */

import { ConfidenceScore, SearchResult } from './confidence-engine'

export interface QualityIndicators {
  confidenceLevel: ConfidenceLevel
  confidenceDisplay: string
  sourceAttribution: SourceAttribution[]
  escalationOption?: EscalationOption
  feedbackPrompt?: FeedbackPrompt
}

export interface ConfidenceLevel {
  level: 'high' | 'moderate' | 'low'
  score: number
  description: string
  icon: string
}

export interface SourceAttribution {
  source: string
  type: 'knowledge_base' | 'learned_response' | 'human_interaction'
  confidence: number
  displayText: string
}

export interface EscalationOption {
  shouldShow: boolean
  message: string
  actionText: string
}

export interface FeedbackPrompt {
  shouldShow: boolean
  message: string
  options: FeedbackOption[]
}

export interface FeedbackOption {
  id: string
  text: string
  value: 'helpful' | 'partially_helpful' | 'not_helpful' | 'incorrect'
}

export interface UserFeedback {
  responseId: string
  userId?: string
  conversationId: string
  feedback: 'helpful' | 'partially_helpful' | 'not_helpful' | 'incorrect'
  timestamp: Date
  confidence: number
  sources: string[]
  additionalComments?: string
}

export class ResponseQualityIndicators {
  private feedbackStorage: UserFeedback[] = []

  /**
   * Generate quality indicators for a response
   */
  generateQualityIndicators(
    confidence: ConfidenceScore,
    searchResults: SearchResult[],
    responseType: 'knowledge_base' | 'learned_response' | 'direct' = 'knowledge_base'
  ): QualityIndicators {
    const confidenceLevel = this.determineConfidenceLevel(confidence)
    const confidenceDisplay = this.formatConfidenceDisplay(confidenceLevel)
    const sourceAttribution = this.generateSourceAttribution(searchResults, responseType)
    const escalationOption = this.generateEscalationOption(confidenceLevel)
    const feedbackPrompt = this.generateFeedbackPrompt(confidenceLevel)

    return {
      confidenceLevel,
      confidenceDisplay,
      sourceAttribution,
      escalationOption,
      feedbackPrompt
    }
  }

  /**
   * Format a complete response with quality indicators
   */
  formatResponseWithIndicators(
    response: string,
    indicators: QualityIndicators
  ): string {
    let formattedResponse = response

    // Add confidence display
    formattedResponse += `\n\n${indicators.confidenceDisplay}`

    // Add source attribution
    if (indicators.sourceAttribution.length > 0) {
      const sourceText = this.formatSourceAttribution(indicators.sourceAttribution)
      formattedResponse += `\n\n${sourceText}`
    }

    // Add escalation option if needed
    if (indicators.escalationOption?.shouldShow) {
      formattedResponse += `\n\n${indicators.escalationOption.message}`
    }

    // Add feedback prompt if needed
    if (indicators.feedbackPrompt?.shouldShow) {
      formattedResponse += `\n\n${indicators.feedbackPrompt.message}`
    }

    return formattedResponse
  }

  /**
   * Record user feedback
   */
  recordFeedback(feedback: UserFeedback): void {
    this.feedbackStorage.push(feedback)
    
    // Log feedback for monitoring
    console.info('User feedback recorded:', {
      responseId: feedback.responseId,
      feedback: feedback.feedback,
      confidence: feedback.confidence,
      sources: feedback.sources.length,
      timestamp: feedback.timestamp
    })
  }

  /**
   * Get feedback statistics
   */
  getFeedbackStats(): FeedbackStats {
    if (this.feedbackStorage.length === 0) {
      return {
        totalFeedback: 0,
        helpfulPercentage: 0,
        averageConfidence: 0,
        feedbackByConfidenceLevel: {
          high: { total: 0, helpful: 0 },
          moderate: { total: 0, helpful: 0 },
          low: { total: 0, helpful: 0 }
        }
      }
    }

    const total = this.feedbackStorage.length
    const helpful = this.feedbackStorage.filter(f => 
      f.feedback === 'helpful' || f.feedback === 'partially_helpful'
    ).length

    const averageConfidence = this.feedbackStorage.reduce((sum, f) => sum + f.confidence, 0) / total

    // Group by confidence levels
    const byLevel = {
      high: { total: 0, helpful: 0 },
      moderate: { total: 0, helpful: 0 },
      low: { total: 0, helpful: 0 }
    }

    this.feedbackStorage.forEach(feedback => {
      const level = this.getConfidenceLevelFromScore(feedback.confidence)
      byLevel[level].total++
      if (feedback.feedback === 'helpful' || feedback.feedback === 'partially_helpful') {
        byLevel[level].helpful++
      }
    })

    return {
      totalFeedback: total,
      helpfulPercentage: (helpful / total) * 100,
      averageConfidence,
      feedbackByConfidenceLevel: byLevel
    }
  }

  /**
   * Determine confidence level from score
   */
  private determineConfidenceLevel(confidence: ConfidenceScore): ConfidenceLevel {
    const score = confidence.score

    if (score >= 0.8) {
      return {
        level: 'high',
        score,
        description: 'High confidence - I\'m very confident in this answer',
        icon: '🎯'
      }
    } else if (score >= 0.5) {
      return {
        level: 'moderate',
        score,
        description: 'Moderate confidence - This answer should be helpful, but you might want to verify',
        icon: '🤔'
      }
    } else {
      return {
        level: 'low',
        score,
        description: 'Low confidence - I\'m not very sure about this answer',
        icon: '❓'
      }
    }
  }

  /**
   * Format confidence display text
   */
  private formatConfidenceDisplay(confidenceLevel: ConfidenceLevel): string {
    const percentage = Math.round(confidenceLevel.score * 100)
    return `${confidenceLevel.icon} **Confidence: ${percentage}%** - ${confidenceLevel.description}`
  }

  /**
   * Generate source attribution
   */
  private generateSourceAttribution(
    searchResults: SearchResult[],
    responseType: 'knowledge_base' | 'learned_response' | 'direct'
  ): SourceAttribution[] {
    const attributions: SourceAttribution[] = []

    if (responseType === 'learned_response') {
      attributions.push({
        source: 'Previous Human Interactions',
        type: 'learned_response',
        confidence: 0.9,
        displayText: '💡 This answer comes from previous conversations with human experts'
      })
    }

    // Add knowledge base sources
    searchResults.forEach((result, index) => {
      if (index < 3) { // Limit to top 3 sources
        attributions.push({
          source: result.source,
          type: 'knowledge_base',
          confidence: result.score,
          displayText: `📚 Source: ${result.source} (${Math.round(result.score * 100)}% relevance)`
        })
      }
    })

    return attributions
  }

  /**
   * Generate escalation option for moderate confidence
   */
  private generateEscalationOption(confidenceLevel: ConfidenceLevel): EscalationOption | undefined {
    if (confidenceLevel.level === 'moderate' || confidenceLevel.level === 'low') {
      return {
        shouldShow: true,
        message: '🤝 **Need more help?** I can connect you with a human expert for more detailed assistance.',
        actionText: 'Connect with Human Expert'
      }
    }
    return undefined
  }

  /**
   * Generate feedback prompt
   */
  private generateFeedbackPrompt(confidenceLevel: ConfidenceLevel): FeedbackPrompt {
    return {
      shouldShow: true,
      message: '📝 **Was this response helpful?** Your feedback helps me improve!',
      options: [
        { id: 'helpful', text: '👍 Helpful', value: 'helpful' },
        { id: 'partially', text: '👌 Partially helpful', value: 'partially_helpful' },
        { id: 'not_helpful', text: '👎 Not helpful', value: 'not_helpful' },
        { id: 'incorrect', text: '❌ Incorrect', value: 'incorrect' }
      ]
    }
  }

  /**
   * Format source attribution for display
   */
  private formatSourceAttribution(attributions: SourceAttribution[]): string {
    if (attributions.length === 0) return ''

    const sourceLines = attributions.map(attr => attr.displayText)
    return `**Sources:**\n${sourceLines.join('\n')}`
  }

  /**
   * Get confidence level from numeric score
   */
  private getConfidenceLevelFromScore(score: number): 'high' | 'moderate' | 'low' {
    if (score >= 0.8) return 'high'
    if (score >= 0.5) return 'moderate'
    return 'low'
  }
}

export interface FeedbackStats {
  totalFeedback: number
  helpfulPercentage: number
  averageConfidence: number
  feedbackByConfidenceLevel: {
    high: { total: number; helpful: number }
    moderate: { total: number; helpful: number }
    low: { total: number; helpful: number }
  }
}
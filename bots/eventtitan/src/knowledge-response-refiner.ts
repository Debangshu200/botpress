/**
 * Knowledge Response Refiner
 * Ensures KB responses are concise, refined, and user-friendly
 */

export interface RefinementOptions {
  maxLines: number
  removeFileNames: boolean
  removeSources: boolean
  addEmojis: boolean
  includeFollowUp: boolean
  temperature: number
  maxTokens: number
}

export interface RefinedResponse {
  content: string
  confidence: number
  wasRefined: boolean
  originalLength: number
  refinedLength: number
  processingTime: number
}

export class KnowledgeResponseRefiner {
  private defaultOptions: RefinementOptions = {
    maxLines: 4,
    removeFileNames: true,
    removeSources: true,
    addEmojis: true,
    includeFollowUp: true,
    temperature: 0.3,
    maxTokens: 150
  }

  constructor(private client?: any) {}

  /**
   * Create refiner with configuration
   */
  static withConfig(config: any, client?: any): KnowledgeResponseRefiner {
    const refiner = new KnowledgeResponseRefiner(client)
    refiner.defaultOptions = {
      maxLines: config.maxLines || 4,
      removeFileNames: config.removeFileNames !== false,
      removeSources: config.removeSources !== false,
      addEmojis: config.addEmojis !== false,
      includeFollowUp: config.includeFollowUp !== false,
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 150
    }
    return refiner
  }

  /**
   * Refine a knowledge base response to be concise and user-friendly
   */
  async refineResponse(
    rawResponse: string,
    userQuery: string,
    options?: Partial<RefinementOptions>
  ): Promise<RefinedResponse> {
    const startTime = Date.now()
    const opts = { ...this.defaultOptions, ...options }
    const originalLength = rawResponse.length

    try {
      // Step 1: Clean up the raw response
      let cleanedResponse = this.cleanRawResponse(rawResponse, opts)

      // Step 2: Use AI to refine if client is available
      let refinedContent: string
      let wasRefined = false

      if (this.client && cleanedResponse.length > 200) {
        try {
          refinedContent = await this.aiRefineResponse(cleanedResponse, userQuery, opts)
          wasRefined = true
        } catch (error) {
          console.warn('AI refinement failed, using cleaned response:', error)
          refinedContent = this.manualRefineResponse(cleanedResponse, opts)
        }
      } else {
        refinedContent = this.manualRefineResponse(cleanedResponse, opts)
      }

      // Step 3: Final formatting
      const finalContent = this.formatFinalResponse(refinedContent, opts)

      return {
        content: finalContent,
        confidence: this.calculateRefinementConfidence(rawResponse, finalContent),
        wasRefined,
        originalLength,
        refinedLength: finalContent.length,
        processingTime: Date.now() - startTime
      }

    } catch (error) {
      console.error('Response refinement failed:', error)
      
      // Fallback to basic cleaning
      const fallbackContent = this.cleanRawResponse(rawResponse, opts)
      
      return {
        content: fallbackContent,
        confidence: 0.5,
        wasRefined: false,
        originalLength,
        refinedLength: fallbackContent.length,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Clean raw response by removing unwanted elements
   */
  private cleanRawResponse(response: string, options: RefinementOptions): string {
    let cleaned = response

    // Remove file names and references
    if (options.removeFileNames) {
      cleaned = cleaned.replace(/\b[\w-]+\.(txt|md|pdf|doc|docx)\b/gi, '')
      cleaned = cleaned.replace(/File:\s*[\w-]+\.(txt|md|pdf|doc|docx)/gi, '')
      cleaned = cleaned.replace(/Source:\s*[\w-]+\.(txt|md|pdf|doc|docx)/gi, '')
    }

    // Remove source references
    if (options.removeSources) {
      cleaned = cleaned.replace(/References?:\s*.*$/gim, '')
      cleaned = cleaned.replace(/Sources?:\s*.*$/gim, '')
      cleaned = cleaned.replace(/\[Source:.*?\]/gi, '')
      cleaned = cleaned.replace(/\(Source:.*?\)/gi, '')
    }

    // Clean up extra whitespace and line breaks
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
    cleaned = cleaned.replace(/\s{2,}/g, ' ')
    cleaned = cleaned.trim()

    return cleaned
  }

  /**
   * Use AI to refine the response
   */
  private async aiRefineResponse(
    content: string,
    userQuery: string,
    options: RefinementOptions
  ): Promise<string> {
    const systemPrompt = `You are an expert event planning assistant. Your task is to refine knowledge base responses to be concise, helpful, and user-friendly.

Guidelines:
- Provide exactly ${options.maxLines} lines or less
- Focus on the most relevant information for the user's question
- Use clear, conversational language
- ${options.addEmojis ? 'Add appropriate emojis to make it engaging' : 'Do not use emojis'}
- ${options.removeFileNames ? 'Never mention file names or sources' : ''}
- End with a helpful follow-up question if appropriate`

    const { output } = await this.client.callAction({
      type: 'openai:generateContent',
      input: {
        model: {
          id: 'gpt-3.5-turbo-0125'
        },
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: `User's Question: "${userQuery}"

Knowledge Base Content:
${content}

Please refine this into a concise, helpful response following the guidelines.`
          }
        ],
        temperature: options.temperature,
        maxTokens: options.maxTokens
      }
    })

    return output.choices[0]?.message?.content || content
  }

  /**
   * Manually refine response when AI is not available
   */
  private manualRefineResponse(content: string, options: RefinementOptions): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
    
    // Take the most important sentences (usually first few)
    const importantSentences = sentences.slice(0, options.maxLines)
    
    // Join and clean up
    let refined = importantSentences.join('. ').trim()
    if (refined && !refined.endsWith('.')) {
      refined += '.'
    }

    return refined
  }

  /**
   * Format the final response with emojis and follow-up
   */
  private formatFinalResponse(content: string, options: RefinementOptions): string {
    let formatted = content

    // Add emojis if requested
    if (options.addEmojis && !this.hasEmojis(content)) {
      formatted = this.addContextualEmojis(formatted)
    }

    // Add follow-up question if requested
    if (options.includeFollowUp && !this.hasFollowUp(formatted)) {
      formatted += '\n\n💡 Would you like more specific details about any aspect?'
    }

    return formatted
  }

  /**
   * Check if content already has emojis
   */
  private hasEmojis(content: string): boolean {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u
    return emojiRegex.test(content)
  }

  /**
   * Check if content already has a follow-up question
   */
  private hasFollowUp(content: string): boolean {
    const followUpPatterns = [
      'would you like',
      'need more',
      'want to know',
      'questions?',
      'help with',
      '?'
    ]
    
    const contentLower = content.toLowerCase()
    return followUpPatterns.some(pattern => contentLower.includes(pattern))
  }

  /**
   * Add contextual emojis based on content
   */
  private addContextualEmojis(content: string): string {
    const contentLower = content.toLowerCase()
    
    // Add relevant emoji at the beginning
    let emoji = '📋'
    
    if (contentLower.includes('wedding')) emoji = '💒'
    else if (contentLower.includes('venue')) emoji = '🏢'
    else if (contentLower.includes('budget') || contentLower.includes('cost')) emoji = '💰'
    else if (contentLower.includes('catering') || contentLower.includes('food')) emoji = '🍽️'
    else if (contentLower.includes('planning')) emoji = '📅'
    else if (contentLower.includes('corporate')) emoji = '🏢'
    
    return `${emoji} ${content}`
  }

  /**
   * Calculate confidence in the refinement quality
   */
  private calculateRefinementConfidence(original: string, refined: string): number {
    const originalLines = original.split('\n').length
    const refinedLines = refined.split('\n').length
    
    // Higher confidence for appropriate length reduction
    const lengthScore = originalLines > refinedLines ? 0.8 : 0.6
    
    // Higher confidence if we removed file references
    const cleanScore = original.includes('.txt') || original.includes('.md') ? 0.9 : 0.7
    
    // Higher confidence if response is concise but informative
    const conciseScore = refined.length > 50 && refined.length < 300 ? 0.9 : 0.6
    
    return Math.min(1.0, (lengthScore + cleanScore + conciseScore) / 3)
  }

  /**
   * Update client for AI refinement
   */
  updateClient(client: any): void {
    this.client = client
  }

  /**
   * Get refinement statistics
   */
  getStats(): RefinementStats {
    // This would typically track statistics across multiple refinements
    return {
      totalRefinements: 0,
      averageCompressionRatio: 0,
      averageProcessingTime: 0,
      aiRefinementSuccessRate: 0,
      averageConfidence: 0
    }
  }
}

export interface RefinementStats {
  totalRefinements: number
  averageCompressionRatio: number
  averageProcessingTime: number
  aiRefinementSuccessRate: number
  averageConfidence: number
}
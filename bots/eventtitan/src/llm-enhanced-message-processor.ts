/**
 * LLM-Enhanced Message Processor
 * Integrates GPT-OSS-20B with the existing knowledge base system
 */

import { gptOss20BService } from './gpt-oss-20b-service'
import { EnhancedKnowledgeHandler, isQuestion } from './enhanced-knowledge-handler'

export interface ProcessingResult {
  shouldRespond: boolean
  shouldHandoff: boolean
  response?: string
  confidence: number
  source: 'llm-enhanced' | 'knowledge-only' | 'llm-only' | 'none'
  knowledgeUsed: boolean
  processingTime: number
  tokensUsed?: number
}

export interface ProcessingOptions {
  useKnowledge: boolean
  useLLM: boolean
  confidenceThreshold: number
  maxKnowledgeChunks: number
  enhanceWithLLM: boolean
}

export class LLMEnhancedMessageProcessor {
  private knowledgeHandler: EnhancedKnowledgeHandler
  private defaultOptions: ProcessingOptions

  constructor(options?: Partial<ProcessingOptions>) {
    this.knowledgeHandler = new EnhancedKnowledgeHandler()
    this.defaultOptions = {
      useKnowledge: true,
      useLLM: true,
      confidenceThreshold: 0.6,
      maxKnowledgeChunks: 3,
      enhanceWithLLM: true,
      ...options
    }
  }

  /**
   * Process user message with knowledge base and LLM integration
   */
  async processMessage(
    message: string, 
    options?: Partial<ProcessingOptions>
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    const opts = { ...this.defaultOptions, ...options }

    try {
      // Step 1: Check if this is a question or request for information
      if (!isQuestion(message) && !this.isInformationRequest(message)) {
        return {
          shouldRespond: false,
          shouldHandoff: false,
          confidence: 0,
          source: 'none',
          knowledgeUsed: false,
          processingTime: Date.now() - startTime
        }
      }

      // Step 2: Search knowledge base
      let knowledgeResult = null
      let knowledgeConfidence = 0
      
      if (opts.useKnowledge) {
        knowledgeResult = this.knowledgeHandler.searchKnowledge(message)
        knowledgeConfidence = knowledgeResult.confidence
      }

      // Step 3: Determine processing strategy based on knowledge availability and confidence
      const strategy = this.determineProcessingStrategy(
        knowledgeResult, 
        knowledgeConfidence, 
        opts
      )

      // Step 4: Generate response based on strategy
      const result = await this.generateResponse(message, knowledgeResult, strategy, opts)
      
      return {
        ...result,
        processingTime: Date.now() - startTime
      }

    } catch (error) {
      console.error('LLMEnhancedMessageProcessor: Error processing message:', error)
      
      return {
        shouldRespond: false,
        shouldHandoff: true, // Escalate on error
        confidence: 0,
        source: 'none',
        knowledgeUsed: false,
        processingTime: Date.now() - startTime,
        response: 'I apologize, but I encountered an error processing your request. Let me connect you with a human agent.'
      }
    }
  }

  /**
   * Get knowledge base statistics
   */
  getKnowledgeStats() {
    return this.knowledgeHandler.getKnowledgeStats()
  }

  /**
   * Add content to knowledge base
   */
  async addKnowledgeContent(title: string, content: string, tags: string[] = []): Promise<boolean> {
    return await this.knowledgeHandler.addContent(title, content, tags)
  }

  // Private methods

  private isInformationRequest(message: string): boolean {
    const requestPatterns = [
      'tell me about', 'explain', 'describe', 'information about',
      'help with', 'guide me', 'show me', 'i need to know',
      'can you help', 'looking for', 'want to learn'
    ]
    
    const messageLower = message.toLowerCase()
    return requestPatterns.some(pattern => messageLower.includes(pattern))
  }

  private determineProcessingStrategy(
    knowledgeResult: any, 
    knowledgeConfidence: number, 
    options: ProcessingOptions
  ): 'knowledge-only' | 'llm-enhanced' | 'llm-only' | 'handoff' {
    
    // If no LLM usage requested, use knowledge only
    if (!options.useLLM) {
      return knowledgeResult?.content ? 'knowledge-only' : 'handoff'
    }

    // If no knowledge usage requested, use LLM only
    if (!options.useKnowledge) {
      return 'llm-only'
    }

    // If we have high-confidence knowledge and LLM enhancement is enabled
    if (knowledgeResult?.content && knowledgeConfidence >= options.confidenceThreshold) {
      return options.enhanceWithLLM ? 'llm-enhanced' : 'knowledge-only'
    }

    // If we have some knowledge but low confidence, enhance with LLM
    if (knowledgeResult?.content && knowledgeConfidence > 0.3) {
      return 'llm-enhanced'
    }

    // If no relevant knowledge found, use LLM only
    if (!knowledgeResult?.content) {
      return 'llm-only'
    }

    // Default to handoff for very low confidence
    return 'handoff'
  }

  private async generateResponse(
    message: string,
    knowledgeResult: any,
    strategy: string,
    options: ProcessingOptions
  ): Promise<Omit<ProcessingResult, 'processingTime'>> {

    switch (strategy) {
      case 'knowledge-only':
        return this.generateKnowledgeOnlyResponse(knowledgeResult)

      case 'llm-enhanced':
        return await this.generateLLMEnhancedResponse(message, knowledgeResult)

      case 'llm-only':
        return await this.generateLLMOnlyResponse(message)

      case 'handoff':
      default:
        return {
          shouldRespond: false,
          shouldHandoff: true,
          confidence: 0,
          source: 'none',
          knowledgeUsed: false,
          response: "I don't have specific information about that topic. Let me connect you with a human agent who can help you better."
        }
    }
  }

  private generateKnowledgeOnlyResponse(knowledgeResult: any): Omit<ProcessingResult, 'processingTime'> {
    return {
      shouldRespond: true,
      shouldHandoff: false,
      response: knowledgeResult.content,
      confidence: knowledgeResult.confidence,
      source: 'knowledge-only',
      knowledgeUsed: true
    }
  }

  private async generateLLMEnhancedResponse(
    message: string, 
    knowledgeResult: any
  ): Promise<Omit<ProcessingResult, 'processingTime'>> {
    
    try {
      // Prepare context from knowledge base
      const knowledgeContext = this.prepareKnowledgeContext(knowledgeResult)
      
      // Create enhanced prompt for GPT-OSS-20B
      const enhancedPrompt = this.createEnhancedPrompt(message, knowledgeContext)
      
      // Generate response using GPT-OSS-20B
      const llmResponse = await gptOss20BService.generateResponse({
        prompt: enhancedPrompt,
        context: knowledgeContext,
        useOptimization: true,
        maxTokens: 600,
        temperature: 0.7
      })

      if (llmResponse.success) {
        // Calculate combined confidence
        const combinedConfidence = this.calculateCombinedConfidence(
          knowledgeResult.confidence,
          llmResponse.tokensUsed,
          llmResponse.processingTime
        )

        return {
          shouldRespond: true,
          shouldHandoff: false,
          response: llmResponse.content,
          confidence: combinedConfidence,
          source: 'llm-enhanced',
          knowledgeUsed: true,
          tokensUsed: llmResponse.tokensUsed
        }
      } else {
        // Fallback to knowledge-only if LLM fails
        console.warn('LLM enhancement failed, falling back to knowledge-only response')
        return this.generateKnowledgeOnlyResponse(knowledgeResult)
      }

    } catch (error) {
      console.error('Error in LLM-enhanced response generation:', error)
      // Fallback to knowledge-only
      return this.generateKnowledgeOnlyResponse(knowledgeResult)
    }
  }

  private async generateLLMOnlyResponse(message: string): Promise<Omit<ProcessingResult, 'processingTime'>> {
    try {
      const llmResponse = await gptOss20BService.generateResponse({
        prompt: message,
        useOptimization: true,
        maxTokens: 500,
        temperature: 0.8
      })

      if (llmResponse.success) {
        // Lower confidence for LLM-only responses since no knowledge base validation
        const confidence = Math.min(0.7, this.estimateLLMConfidence(llmResponse))

        return {
          shouldRespond: true,
          shouldHandoff: false,
          response: llmResponse.content,
          confidence,
          source: 'llm-only',
          knowledgeUsed: false,
          tokensUsed: llmResponse.tokensUsed
        }
      } else {
        return {
          shouldRespond: false,
          shouldHandoff: true,
          confidence: 0,
          source: 'none',
          knowledgeUsed: false,
          response: 'I apologize, but I cannot process your request right now. Let me connect you with a human agent.'
        }
      }

    } catch (error) {
      console.error('Error in LLM-only response generation:', error)
      return {
        shouldRespond: false,
        shouldHandoff: true,
        confidence: 0,
        source: 'none',
        knowledgeUsed: false,
        response: 'I apologize, but I encountered an error. Let me connect you with a human agent.'
      }
    }
  }

  private prepareKnowledgeContext(knowledgeResult: any): string {
    if (!knowledgeResult?.content) return ''

    let context = 'Relevant information from knowledge base:\n\n'
    context += knowledgeResult.content

    // Add source information if available
    if (knowledgeResult.documents && knowledgeResult.documents.length > 0) {
      context += '\n\nSources: '
      const sources = knowledgeResult.documents
        .slice(0, 3) // Limit to 3 sources
        .map((doc: any) => doc.name)
        .join(', ')
      context += sources
    }

    return context
  }

  private createEnhancedPrompt(message: string, knowledgeContext: string): string {
    return `Based on the provided knowledge base information, please answer the user's question in a helpful, accurate, and conversational way.

User Question: ${message}

Instructions:
- Use the knowledge base information as your primary source
- Provide a clear, well-structured answer
- If the knowledge base doesn't fully answer the question, acknowledge what you can and cannot answer
- Keep the response focused and practical
- Add helpful suggestions or follow-up questions when appropriate
- Maintain a friendly, professional tone

Please provide your response:`
  }

  private calculateCombinedConfidence(
    knowledgeConfidence: number,
    tokensUsed: number,
    processingTime: number
  ): number {
    // Base confidence from knowledge
    let confidence = knowledgeConfidence * 0.7

    // Boost confidence if LLM generated substantial content
    if (tokensUsed > 100) {
      confidence += 0.1
    }

    // Slight boost for reasonable processing time (indicates successful processing)
    if (processingTime < 10000) {
      confidence += 0.05
    }

    return Math.min(confidence, 0.95) // Cap at 95%
  }

  private estimateLLMConfidence(llmResponse: any): number {
    let confidence = 0.5 // Base confidence for LLM-only

    // Higher confidence for longer, more detailed responses
    if (llmResponse.tokensUsed > 150) {
      confidence += 0.2
    } else if (llmResponse.tokensUsed > 50) {
      confidence += 0.1
    }

    // Boost for reasonable processing time
    if (llmResponse.processingTime < 8000) {
      confidence += 0.1
    }

    return confidence
  }
}

// Export singleton instance for easy use
export const llmEnhancedProcessor = new LLMEnhancedMessageProcessor()

// Export helper functions
export function createProcessor(options?: Partial<ProcessingOptions>): LLMEnhancedMessageProcessor {
  return new LLMEnhancedMessageProcessor(options)
}

export async function processUserMessage(
  message: string, 
  options?: Partial<ProcessingOptions>
): Promise<ProcessingResult> {
  return await llmEnhancedProcessor.processMessage(message, options)
}
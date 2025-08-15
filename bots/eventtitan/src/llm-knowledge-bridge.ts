/**
 * LLM-Knowledge Bridge
 * Simple interface for chatting with GPT-OSS-20B + Knowledge Base
 */

import { llmEnhancedProcessor, ProcessingResult, ProcessingOptions } from './llm-enhanced-message-processor'

export interface ChatResponse {
  message: string
  confidence: number
  source: string
  knowledgeUsed: boolean
  processingTime: number
  tokensUsed?: number
  shouldEscalate: boolean
}

export interface ChatOptions {
  // Knowledge settings
  useKnowledge?: boolean
  confidenceThreshold?: number
  
  // LLM settings
  useLLM?: boolean
  enhanceWithLLM?: boolean
  
  // Response settings
  includeDebugInfo?: boolean
  maxResponseLength?: number
}

export class LLMKnowledgeBridge {
  private conversationHistory: Array<{ user: string; bot: string; timestamp: Date }> = []
  private defaultOptions: ChatOptions

  constructor(options?: ChatOptions) {
    this.defaultOptions = {
      useKnowledge: true,
      useLLM: true,
      enhanceWithLLM: true,
      confidenceThreshold: 0.6,
      includeDebugInfo: false,
      maxResponseLength: 1000,
      ...options
    }
  }

  /**
   * Main chat interface - send a message and get a response
   */
  async chat(userMessage: string, options?: ChatOptions): Promise<ChatResponse> {
    const opts = { ...this.defaultOptions, ...options }

    try {
      // Process the message
      const processingOptions: Partial<ProcessingOptions> = {
        useKnowledge: opts.useKnowledge,
        useLLM: opts.useLLM,
        enhanceWithLLM: opts.enhanceWithLLM,
        confidenceThreshold: opts.confidenceThreshold || 0.6
      }

      const result = await llmEnhancedProcessor.processMessage(userMessage, processingOptions)

      // Format response
      const response = this.formatResponse(result, opts)

      // Store in conversation history
      this.addToHistory(userMessage, response.message)

      return response

    } catch (error) {
      console.error('LLMKnowledgeBridge: Error in chat:', error)
      
      return {
        message: "I apologize, but I'm having trouble processing your request right now. Please try again or contact support.",
        confidence: 0,
        source: 'error',
        knowledgeUsed: false,
        processingTime: 0,
        shouldEscalate: true
      }
    }
  }

  /**
   * Quick chat without options - simplest interface
   */
  async ask(question: string): Promise<string> {
    const response = await this.chat(question)
    return response.message
  }

  /**
   * Get conversation history
   */
  getHistory(): Array<{ user: string; bot: string; timestamp: Date }> {
    return [...this.conversationHistory]
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = []
  }

  /**
   * Get knowledge base statistics
   */
  getKnowledgeStats() {
    return llmEnhancedProcessor.getKnowledgeStats()
  }

  /**
   * Add content to knowledge base
   */
  async addKnowledge(title: string, content: string, tags: string[] = []): Promise<boolean> {
    return await llmEnhancedProcessor.addKnowledgeContent(title, content, tags)
  }

  /**
   * Test the system with sample questions
   */
  async runTests(): Promise<Array<{ question: string; response: ChatResponse }>> {
    const testQuestions = [
      "What is event planning?",
      "How do I plan a wedding?",
      "What should I consider when choosing a venue?",
      "How much does a corporate event typically cost?",
      "What are the key steps in catering planning?",
      "Tell me about budget planning for events"
    ]

    const results = []
    
    for (const question of testQuestions) {
      console.log(`Testing: ${question}`)
      const response = await this.chat(question, { includeDebugInfo: true })
      results.push({ question, response })
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return results
  }

  // Private methods

  private formatResponse(result: ProcessingResult, options: ChatOptions): ChatResponse {
    let message = result.response || "I don't have information about that topic."

    // Truncate if too long
    if (options.maxResponseLength && message.length > options.maxResponseLength) {
      message = message.substring(0, options.maxResponseLength - 3) + '...'
    }

    // Add debug info if requested
    if (options.includeDebugInfo) {
      message += `\n\n---\nDebug: Source: ${result.source}, Confidence: ${(result.confidence * 100).toFixed(1)}%, Knowledge: ${result.knowledgeUsed ? 'Yes' : 'No'}, Time: ${result.processingTime}ms`
      if (result.tokensUsed) {
        message += `, Tokens: ${result.tokensUsed}`
      }
    }

    return {
      message,
      confidence: result.confidence,
      source: result.source,
      knowledgeUsed: result.knowledgeUsed,
      processingTime: result.processingTime,
      tokensUsed: result.tokensUsed,
      shouldEscalate: result.shouldHandoff
    }
  }

  private addToHistory(userMessage: string, botResponse: string): void {
    this.conversationHistory.push({
      user: userMessage,
      bot: botResponse,
      timestamp: new Date()
    })

    // Keep only last 10 conversations
    if (this.conversationHistory.length > 10) {
      this.conversationHistory = this.conversationHistory.slice(-10)
    }
  }
}

// Export singleton instance for easy use
export const chatBridge = new LLMKnowledgeBridge()

// Export convenience functions
export async function askEventTitan(question: string): Promise<string> {
  return await chatBridge.ask(question)
}

export async function chatWithEventTitan(message: string, options?: ChatOptions): Promise<ChatResponse> {
  return await chatBridge.chat(message, options)
}

// Export factory function
export function createChatBridge(options?: ChatOptions): LLMKnowledgeBridge {
  return new LLMKnowledgeBridge(options)
}
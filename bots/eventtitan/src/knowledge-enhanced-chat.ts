/**
 * Knowledge-Enhanced Chat Interface
 * Interactive chat interface that uses the intelligent response pipeline
 */

import { intelligentResponsePipeline, PipelineRequest, PipelineResponse } from './intelligent-response-pipeline'
import { EnhancedKnowledgeHandler } from './enhanced-knowledge-handler'
import { gptOss20BService } from './gpt-oss-20b-service'

export interface ChatSession {
  id: string
  userId?: string
  startTime: number
  messageCount: number
  lastActivity: number
  context: string[]
}

export interface ChatMessage {
  id: string
  sessionId: string
  timestamp: number
  type: 'user' | 'bot' | 'system'
  content: string
  metadata?: {
    processingTime?: number
    source?: string
    confidence?: number
    tokensUsed?: number
    qualityScore?: number
  }
}

export interface ChatOptions {
  useKnowledgeBase: boolean
  useLLMEnhancement: boolean
  confidenceThreshold: number
  maxTokens: number
  temperature: number
  enableFallback: boolean
  contextWindow: number
}

export class KnowledgeEnhancedChat {
  private sessions: Map<string, ChatSession>
  private messages: Map<string, ChatMessage[]>
  private knowledgeHandler: EnhancedKnowledgeHandler
  private defaultOptions: ChatOptions

  constructor() {
    this.sessions = new Map()
    this.messages = new Map()
    this.knowledgeHandler = new EnhancedKnowledgeHandler()
    
    this.defaultOptions = {
      useKnowledgeBase: true,
      useLLMEnhancement: true,
      confidenceThreshold: 0.6,
      maxTokens: 600,
      temperature: 0.7,
      enableFallback: true,
      contextWindow: 5
    }
  }

  /**
   * Start a new chat session
   */
  startSession(userId?: string): ChatSession {
    const sessionId = this.generateSessionId()
    const session: ChatSession = {
      id: sessionId,
      userId,
      startTime: Date.now(),
      messageCount: 0,
      lastActivity: Date.now(),
      context: []
    }

    this.sessions.set(sessionId, session)
    this.messages.set(sessionId, [])

    // Add welcome message
    this.addSystemMessage(sessionId, this.getWelcomeMessage())

    return session
  }

  /**
   * Send a message and get response
   */
  async sendMessage(
    sessionId: string, 
    userMessage: string, 
    options?: Partial<ChatOptions>
  ): Promise<{
    success: boolean
    botResponse?: ChatMessage
    error?: string
    sessionInfo: {
      messageCount: number
      knowledgeStats: any
      serviceStatus: any
    }
  }> {
    try {
      const session = this.sessions.get(sessionId)
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
          sessionInfo: { messageCount: 0, knowledgeStats: {}, serviceStatus: {} }
        }
      }

      // Update session activity
      session.lastActivity = Date.now()
      session.messageCount++

      // Add user message
      const userMsg = this.addUserMessage(sessionId, userMessage)

      // Prepare pipeline request with context
      const chatOptions = { ...this.defaultOptions, ...options }
      const context = this.buildConversationContext(sessionId, chatOptions.contextWindow)
      
      const pipelineRequest: PipelineRequest = {
        query: userMessage,
        userId: session.userId,
        conversationId: sessionId,
        options: {
          useKnowledgeBase: chatOptions.useKnowledgeBase,
          useLLMEnhancement: chatOptions.useLLMEnhancement,
          confidenceThreshold: chatOptions.confidenceThreshold,
          maxKnowledgeResults: 3,
          llmMaxTokens: chatOptions.maxTokens,
          llmTemperature: chatOptions.temperature,
          forceDirectResponse: false,
          enableFallback: chatOptions.enableFallback
        }
      }

      // Generate response using intelligent pipeline
      const pipelineResponse = await intelligentResponsePipeline.generateResponse(pipelineRequest)

      // Add bot response message
      const botMsg = this.addBotMessage(sessionId, pipelineResponse)

      // Update session context
      this.updateSessionContext(session, userMessage, pipelineResponse.response)

      return {
        success: true,
        botResponse: botMsg,
        sessionInfo: {
          messageCount: session.messageCount,
          knowledgeStats: this.knowledgeHandler.getKnowledgeStats(),
          serviceStatus: gptOss20BService.getServiceStatus()
        }
      }

    } catch (error) {
      console.error('KnowledgeEnhancedChat: Error processing message:', error)
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionInfo: { messageCount: 0, knowledgeStats: {}, serviceStatus: {} }
      }
    }
  }

  /**
   * Get chat history for a session
   */
  getChatHistory(sessionId: string): ChatMessage[] {
    return this.messages.get(sessionId) || []
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): ChatSession | null {
    return this.sessions.get(sessionId) || null
  }

  /**
   * List all active sessions
   */
  getActiveSessions(): ChatSession[] {
    const now = Date.now()
    const activeThreshold = 30 * 60 * 1000 // 30 minutes
    
    return Array.from(this.sessions.values())
      .filter(session => now - session.lastActivity < activeThreshold)
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }

  /**
   * End a chat session
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    this.addSystemMessage(sessionId, 'Chat session ended. Thank you for using EventTitan!')
    
    // Keep session data but mark as inactive
    session.lastActivity = 0
    
    return true
  }

  /**
   * Clear old sessions and messages
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.startTime > maxAge) {
        this.sessions.delete(sessionId)
        this.messages.delete(sessionId)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * Get chat statistics
   */
  getStatistics(): {
    totalSessions: number
    activeSessions: number
    totalMessages: number
    knowledgeStats: any
    serviceStatus: any
  } {
    const activeSessions = this.getActiveSessions().length
    const totalMessages = Array.from(this.messages.values())
      .reduce((sum, msgs) => sum + msgs.length, 0)

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalMessages,
      knowledgeStats: this.knowledgeHandler.getKnowledgeStats(),
      serviceStatus: gptOss20BService.getServiceStatus()
    }
  }

  // Private helper methods

  private generateSessionId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private addUserMessage(sessionId: string, content: string): ChatMessage {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      sessionId,
      timestamp: Date.now(),
      type: 'user',
      content
    }

    const messages = this.messages.get(sessionId) || []
    messages.push(message)
    this.messages.set(sessionId, messages)

    return message
  }

  private addBotMessage(sessionId: string, pipelineResponse: PipelineResponse): ChatMessage {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      sessionId,
      timestamp: Date.now(),
      type: 'bot',
      content: pipelineResponse.response,
      metadata: {
        processingTime: pipelineResponse.processingTime,
        source: pipelineResponse.source,
        confidence: pipelineResponse.confidence.score,
        tokensUsed: pipelineResponse.tokensUsed,
        qualityScore: pipelineResponse.qualityScore
      }
    }

    const messages = this.messages.get(sessionId) || []
    messages.push(message)
    this.messages.set(sessionId, messages)

    return message
  }

  private addSystemMessage(sessionId: string, content: string): ChatMessage {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      sessionId,
      timestamp: Date.now(),
      type: 'system',
      content
    }

    const messages = this.messages.get(sessionId) || []
    messages.push(message)
    this.messages.set(sessionId, messages)

    return message
  }

  private buildConversationContext(sessionId: string, contextWindow: number): string {
    const messages = this.messages.get(sessionId) || []
    const recentMessages = messages
      .filter(msg => msg.type !== 'system')
      .slice(-contextWindow * 2) // Get last N user-bot pairs

    if (recentMessages.length === 0) return ''

    let context = 'Recent conversation:\n'
    for (const msg of recentMessages) {
      const prefix = msg.type === 'user' ? 'User:' : 'Bot:'
      context += `${prefix} ${msg.content}\n`
    }

    return context
  }

  private updateSessionContext(session: ChatSession, userMessage: string, botResponse: string): void {
    // Keep a rolling context of key topics
    const contextEntry = `User: ${userMessage.substring(0, 100)} | Bot: ${botResponse.substring(0, 100)}`
    session.context.push(contextEntry)

    // Keep only last 10 context entries
    if (session.context.length > 10) {
      session.context = session.context.slice(-10)
    }
  }

  private getWelcomeMessage(): string {
    const stats = this.knowledgeHandler.getKnowledgeStats()
    
    return `🎉 **Welcome to EventTitan Knowledge Chat!**

I'm your AI assistant for event planning questions. I have access to:
📚 **${stats.uploadedDocuments}** uploaded documents
💡 **${stats.fallbackTopics}** built-in topics
🤖 **GPT-OSS-20B** AI enhancement

**What I can help with:**
• Event planning advice and best practices
• Venue selection and booking guidance
• Catering and budget planning
• Wedding and corporate event coordination
• Vendor recommendations and timelines

**How to get the best results:**
• Ask specific questions about your event needs
• Mention event type, size, and budget when relevant
• Feel free to ask follow-up questions for clarification

What would you like to know about event planning?`
  }
}

// Export singleton instance
export const knowledgeEnhancedChat = new KnowledgeEnhancedChat()

// Export helper functions
export function startChatSession(userId?: string): ChatSession {
  return knowledgeEnhancedChat.startSession(userId)
}

export async function sendChatMessage(
  sessionId: string, 
  message: string, 
  options?: Partial<ChatOptions>
) {
  return await knowledgeEnhancedChat.sendMessage(sessionId, message, options)
}

export function getChatHistory(sessionId: string): ChatMessage[] {
  return knowledgeEnhancedChat.getChatHistory(sessionId)
}
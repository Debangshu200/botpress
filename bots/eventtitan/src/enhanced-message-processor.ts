/**
 * Enhanced Message Processor
 * Integrates confidence scoring, message routing, and configuration management
 */

import { ConfidenceEngine, ConfidenceScore, SearchResult, SearchMetadata } from './confidence-engine'
import { MessageRouter, RoutingDecision, UserProfile, Message } from './message-router'
import { ConfigurationManager, SystemConfiguration } from './config-manager'
import { searchKnowledge, searchKnowledgeWithAI, isQuestion, extractQuestions } from './knowledge-handler'
import { searchKnowledgeEnhanced, isVectorSearchAvailable } from './enhanced-vector-knowledge-handler'
import { ResponseQualityIndicators, QualityIndicators, UserFeedback } from './response-quality-indicators'
import { KnowledgeErrorHandler, KnowledgeSearchOptions, DEFAULT_KNOWLEDGE_SEARCH_OPTIONS } from './knowledge-error-handler'

export interface ProcessingResult {
  shouldRespond: boolean
  shouldHandoff: boolean
  response?: string
  confidence: ConfidenceScore
  searchResults: SearchResult[]
  routingDecision: RoutingDecision
  processingTime: number
  metadata: ProcessingMetadata
  qualityIndicators?: QualityIndicators
  formattedResponse?: string
}

export interface ProcessingMetadata {
  queryType: 'question' | 'statement' | 'command'
  extractedQuestions: string[]
  searchPerformed: boolean
  configurationUsed: SystemConfiguration
  performanceMetrics: PerformanceMetrics
}

export interface PerformanceMetrics {
  totalTime: number
  searchTime: number
  confidenceTime: number
  routingTime: number
  questionExtractionTime: number
}

export interface Question {
  text: string
  type: 'what' | 'how' | 'where' | 'when' | 'why' | 'who' | 'which' | 'general'
  keywords: string[]
  priority: number
}

export class EnhancedMessageProcessor {
  private confidenceEngine: ConfidenceEngine
  private messageRouter: MessageRouter
  private configManager: ConfigurationManager
  private performanceTracking: boolean
  private qualityIndicators: ResponseQualityIndicators
  private knowledgeErrorHandler: KnowledgeErrorHandler

  constructor(initialConfig?: Partial<SystemConfiguration>) {
    this.configManager = new ConfigurationManager(initialConfig)
    const config = this.configManager.getConfiguration()
    
    this.confidenceEngine = new ConfidenceEngine(config.knowledge.confidenceThreshold)
    this.messageRouter = new MessageRouter({
      confidenceThreshold: config.routing.confidenceThreshold,
      handoffEnabled: config.handoff.enabled,
      clarificationThreshold: config.routing.clarificationThreshold,
      maxSearchResults: config.routing.maxSearchResults,
      responseTimeout: config.routing.responseTimeout
    })
    
    this.performanceTracking = config.processing.performanceTracking
    this.qualityIndicators = new ResponseQualityIndicators()
    this.knowledgeErrorHandler = new KnowledgeErrorHandler({
      maxRetries: config.knowledge.maxRetries || 3,
      baseDelay: config.knowledge.retryDelay || 1000,
      maxDelay: config.knowledge.maxRetryDelay || 10000,
      backoffMultiplier: 2,
      jitterEnabled: true
    })
  }

  /**
   * Process incoming message with enhanced intelligence
   */
  async processMessage(
    message: string, 
    userProfile?: UserProfile,
    _conversationHistory?: Message[],
    client?: any // Add client parameter for AI synthesis
  ): Promise<ProcessingResult> {
    const startTime = Date.now()
    const config = this.configManager.getConfiguration()
    
    // Initialize performance metrics
    const metrics: PerformanceMetrics = {
      totalTime: 0,
      searchTime: 0,
      confidenceTime: 0,
      routingTime: 0,
      questionExtractionTime: 0
    }

    try {
      // Step 1: Extract and analyze questions
      const questionStart = Date.now()
      const extractedQuestions = this.extractQuestions(message)
      const queryType = this.determineQueryType(message)
      metrics.questionExtractionTime = Date.now() - questionStart

      // Step 2: Perform knowledge search if needed
      const searchStart = Date.now()
      let searchResults: SearchResult[] = []
      let searchPerformed = false

      if (this.shouldPerformSearch(message, queryType, extractedQuestions)) {
        searchResults = await this.performKnowledgeSearch(message, config, client)
        searchPerformed = true
      }
      metrics.searchTime = Date.now() - searchStart

      // Step 3: Calculate confidence score
      const confidenceStart = Date.now()
      const confidence = this.confidenceEngine.calculateConfidence(message, searchResults)
      metrics.confidenceTime = Date.now() - confidenceStart

      // Step 4: Route message based on confidence and configuration
      const routingStart = Date.now()
      const routingDecision = this.messageRouter.routeMessage(
        message,
        confidence,
        searchResults,
        userProfile
      )
      metrics.routingTime = Date.now() - routingStart

      // Step 5: Generate quality indicators if we have a response
      let qualityIndicators: QualityIndicators | undefined
      let formattedResponse: string | undefined

      if (routingDecision.response) {
        qualityIndicators = this.qualityIndicators.generateQualityIndicators(
          confidence,
          searchResults,
          'knowledge_base'
        )
        formattedResponse = this.qualityIndicators.formatResponseWithIndicators(
          routingDecision.response,
          qualityIndicators
        )
      }

      // Step 6: Compile final result
      metrics.totalTime = Date.now() - startTime

      const result: ProcessingResult = {
        shouldRespond: routingDecision.shouldRespond,
        shouldHandoff: routingDecision.shouldHandoff,
        response: routingDecision.response,
        confidence,
        searchResults,
        routingDecision,
        processingTime: metrics.totalTime,
        metadata: {
          queryType,
          extractedQuestions,
          searchPerformed,
          configurationUsed: config,
          performanceMetrics: metrics
        },
        qualityIndicators,
        formattedResponse
      }

      // Log performance if enabled
      if (this.performanceTracking && config.processing.enableLogging) {
        this.logPerformanceMetrics(message, result)
      }

      return result

    } catch (error) {
      // Handle processing errors gracefully
      return this.handleProcessingError(error, message, startTime)
    }
  }

  /**
   * Update system configuration
   */
  updateConfiguration(updates: Partial<SystemConfiguration>): void {
    // Update configuration manager
    Object.keys(updates).forEach(section => {
      const sectionKey = section as keyof SystemConfiguration
      if (updates[sectionKey]) {
        this.configManager.updateConfiguration({
          section: sectionKey,
          updates: updates[sectionKey]!,
          reason: 'Runtime configuration update'
        })
      }
    })

    // Update component configurations
    const newConfig = this.configManager.getConfiguration()
    
    this.confidenceEngine.setThreshold(newConfig.knowledge.confidenceThreshold)
    this.messageRouter.updateConfiguration({
      confidenceThreshold: newConfig.routing.confidenceThreshold,
      handoffEnabled: newConfig.handoff.enabled,
      clarificationThreshold: newConfig.routing.clarificationThreshold,
      maxSearchResults: newConfig.routing.maxSearchResults,
      responseTimeout: newConfig.routing.responseTimeout
    })
    
    this.performanceTracking = newConfig.processing.performanceTracking
  }

  /**
   * Get current system configuration
   */
  getConfiguration(): SystemConfiguration {
    return this.configManager.getConfiguration()
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(): ProcessingStats {
    // This would typically be maintained across multiple requests
    // For now, return current configuration as stats
    const config = this.configManager.getConfiguration()
    
    return {
      averageProcessingTime: 0, // Would be calculated from historical data
      totalProcessedMessages: 0, // Would be maintained in state
      successRate: 0, // Would be calculated from success/failure ratio
      averageConfidenceScore: 0, // Would be calculated from historical data
      handoffRate: 0, // Would be calculated from handoff frequency
      currentConfiguration: config
    }
  }

  /**
   * Record user feedback for a response
   */
  recordUserFeedback(feedback: UserFeedback): void {
    this.qualityIndicators.recordFeedback(feedback)
  }

  /**
   * Get feedback statistics
   */
  getFeedbackStats() {
    return this.qualityIndicators.getFeedbackStats()
  }

  /**
   * Generate a unique response ID for tracking feedback
   */
  generateResponseId(): string {
    return `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Extract questions from message text
   */
  private extractQuestions(text: string): string[] {
    // Use existing knowledge handler function but enhance it
    const basicQuestions = extractQuestions(text)
    
    // Add more sophisticated question extraction
    const enhancedQuestions: string[] = []
    
    // Split by sentence boundaries
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    
    sentences.forEach(sentence => {
      const trimmed = sentence.trim()
      if (isQuestion(trimmed)) {
        enhancedQuestions.push(trimmed)
      }
    })

    // Combine and deduplicate
    const combined = basicQuestions.concat(enhancedQuestions)
    const allQuestions = combined.filter((question, index) => combined.indexOf(question) === index)
    
    return allQuestions.slice(0, 5) // Limit to 5 questions max
  }

  /**
   * Determine the type of query
   */
  private determineQueryType(message: string): 'question' | 'statement' | 'command' {
    const messageLower = message.toLowerCase().trim()
    
    // Check for questions
    if (isQuestion(message)) {
      return 'question'
    }
    
    // Check for commands
    const commandWords = ['help', 'show', 'list', 'create', 'delete', 'update', 'find']
    if (commandWords.some(word => messageLower.startsWith(word))) {
      return 'command'
    }
    
    return 'statement'
  }

  /**
   * Determine if knowledge search should be performed
   */
  private shouldPerformSearch(
    message: string, 
    queryType: 'question' | 'statement' | 'command',
    extractedQuestions: string[]
  ): boolean {
    const config = this.configManager.getConfiguration()
    
    // Always search for questions
    if (queryType === 'question' || extractedQuestions.length > 0) {
      return true
    }
    
    // Search for statements that might be implicit questions
    const messageLower = message.toLowerCase()
    const implicitQuestionWords = ['tell me', 'show me', 'explain', 'describe', 'about']
    if (implicitQuestionWords.some(phrase => messageLower.includes(phrase))) {
      return true
    }
    
    // Search for commands that might need knowledge
    if (queryType === 'command') {
      const knowledgeCommands = ['help', 'info', 'about', 'explain']
      if (knowledgeCommands.some(cmd => messageLower.includes(cmd))) {
        return true
      }
    }
    
    return false
  }

  /**
   * Perform knowledge search with enhanced result processing and error handling
   */
  private async performKnowledgeSearch(message: string, config: SystemConfiguration, client?: any): Promise<SearchResult[]> {
    const searchOptions: KnowledgeSearchOptions = {
      timeout: config.knowledge.searchTimeout || 5000,
      retryConfig: {
        maxRetries: config.knowledge.maxRetries || 3,
        baseDelay: config.knowledge.retryDelay || 1000,
        maxDelay: config.knowledge.maxRetryDelay || 10000,
        backoffMultiplier: 2,
        jitterEnabled: true
      },
      fallbackEnabled: true,
      handoffOnFailure: config.handoff.enabled
    }

    // Wrap the existing knowledge search in error handling
    const searchFunction = async (): Promise<SearchResult[]> => {
      const searchResults: SearchResult[] = []
      
      // Use AI-powered knowledge search if client is available, otherwise fallback to basic search
      let knowledgeResponse: string | null = null
      
      if (client && isVectorSearchAvailable(client)) {
        try {
          // Use enhanced vector search with built-in Botpress embeddings + AI refinement
          console.info('Using enhanced vector search for knowledge query:', message.substring(0, 100))
          knowledgeResponse = await searchKnowledgeEnhanced(message, client)
        } catch (vectorError) {
          console.warn('Enhanced vector search failed, falling back to AI search:', vectorError)
          try {
            knowledgeResponse = await searchKnowledgeWithAI(message, client)
          } catch (aiError) {
            console.warn('AI search also failed, falling back to basic search:', aiError)
            knowledgeResponse = searchKnowledge(message)
          }
        }
      } else if (client) {
        try {
          // Fallback to AI-enhanced search if vector search not available
          knowledgeResponse = await searchKnowledgeWithAI(message, client)
        } catch (aiError) {
          console.warn('AI-powered search failed, falling back to basic search:', aiError)
          knowledgeResponse = searchKnowledge(message)
        }
      } else {
        // Final fallback to basic search if no client available
        knowledgeResponse = searchKnowledge(message)
      }
      
      if (knowledgeResponse) {
        // Convert response to SearchResult format
        const result: SearchResult = {
          content: knowledgeResponse,
          score: this.calculateSimpleRelevanceScore(message, knowledgeResponse),
          source: client ? 'AI-Enhanced Knowledge Base' : 'Knowledge Base',
          metadata: {
            topic: this.extractTopic(message),
            relevanceScore: client ? 0.9 : 0.8, // Higher relevance for AI-enhanced responses
            matchType: 'partial',
            keywords: this.extractKeywords(message),
            aiEnhanced: !!client
          }
        }
        
        searchResults.push(result)
      }
      
      return searchResults.slice(0, config.knowledge.maxResults)
    }

    try {
      const { result, error, fallback } = await this.knowledgeErrorHandler.handleKnowledgeSearch(
        searchFunction,
        message,
        searchOptions
      )

      if (result) {
        return result
      }

      // Handle error case
      if (error && fallback) {
        console.warn(`Knowledge search failed: ${error.message}`, { 
          errorType: error.type, 
          retryCount: error.retryCount,
          shouldHandoff: fallback.shouldHandoff 
        })

        // If fallback suggests handoff, we'll let the routing logic handle it
        // For now, return empty results which will trigger low confidence
        return []
      }

      return []

    } catch (unexpectedError) {
      console.error('Unexpected error in knowledge search:', unexpectedError)
      return []
    }
  }

  /**
   * Calculate simple relevance score for existing knowledge base
   */
  private calculateSimpleRelevanceScore(query: string, content: string): number {
    const queryWords = this.extractKeywords(query.toLowerCase())
    const contentWords = this.extractKeywords(content.toLowerCase())
    
    if (queryWords.length === 0) return 0.5
    
    let matches = 0
    queryWords.forEach(queryWord => {
      if (contentWords.some(contentWord => 
        contentWord.includes(queryWord) || queryWord.includes(contentWord)
      )) {
        matches++
      }
    })
    
    // Boost score for wedding planning queries since they have good content
    const queryLower = query.toLowerCase()
    if (queryLower.includes('wedding') && content.includes('wedding')) {
      return Math.min(1.0, (matches / queryWords.length) + 0.3)
    }
    
    return Math.min(1.0, matches / queryWords.length)
  }

  /**
   * Extract topic from query
   */
  private extractTopic(query: string): string {
    const queryLower = query.toLowerCase()
    
    // Simple topic extraction based on keywords
    const topics = [
      'event planning', 'wedding planning', 'venue selection', 
      'corporate events', 'budgeting', 'catering'
    ]
    
    for (const topic of topics) {
      if (queryLower.includes(topic) || queryLower.includes(topic.replace(' ', ''))) {
        return topic
      }
    }
    
    return 'general'
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ])

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10)
  }

  /**
   * Handle processing errors
   */
  private handleProcessingError(error: any, _message: string, startTime: number): ProcessingResult {
    const processingTime = Date.now() - startTime
    
    console.error('Enhanced message processing error:', error)
    
    return {
      shouldRespond: true,
      shouldHandoff: false,
      response: "I encountered an issue processing your message. Please try rephrasing your question or ask for help.",
      confidence: {
        score: 0,
        threshold: 0.6,
        isAboveThreshold: false,
        factors: [{
          name: 'processing_error',
          score: 0,
          weight: 1.0,
          description: 'Error occurred during message processing'
        }]
      },
      searchResults: [],
      routingDecision: {
        route: 'direct_response',
        confidence: {
          score: 0,
          threshold: 0.6,
          isAboveThreshold: false,
          factors: []
        },
        reasoning: 'Processing error occurred',
        shouldRespond: true,
        shouldHandoff: false,
        response: "I encountered an issue processing your message. Please try rephrasing your question or ask for help.",
        metadata: {
          searchResults: [],
          processingTime
        }
      },
      processingTime,
      metadata: {
        queryType: 'statement',
        extractedQuestions: [],
        searchPerformed: false,
        configurationUsed: this.configManager.getConfiguration(),
        performanceMetrics: {
          totalTime: processingTime,
          searchTime: 0,
          confidenceTime: 0,
          routingTime: 0,
          questionExtractionTime: 0
        }
      }
    }
  }

  /**
   * Log performance metrics
   */
  private logPerformanceMetrics(message: string, result: ProcessingResult): void {
    const config = this.configManager.getConfiguration()
    
    if (config.processing.logLevel === 'debug') {
      console.debug('Enhanced Message Processing Metrics:', {
        message: message.substring(0, 50) + '...',
        processingTime: result.processingTime,
        confidence: result.confidence.score,
        route: result.routingDecision.route,
        searchResults: result.searchResults.length,
        performanceBreakdown: result.metadata.performanceMetrics
      })
    }
  }
}

export interface ProcessingStats {
  averageProcessingTime: number
  totalProcessedMessages: number
  successRate: number
  averageConfidenceScore: number
  handoffRate: number
  currentConfiguration: SystemConfiguration
}
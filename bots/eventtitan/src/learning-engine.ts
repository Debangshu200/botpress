import { ConversationRecord, LearningData, RecordedMessage } from './conversation-recorder'

// Types for learning engine
export interface LearningResult {
  success: boolean
  processedPairs: number
  validatedPairs: number
  integratedPairs: number
  errors: LearningError[]
  processingTime: number
  metadata: LearningResultMetadata
}

export interface LearningError {
  type: 'extraction' | 'validation' | 'integration' | 'quality'
  message: string
  queryId?: string
  severity: 'low' | 'medium' | 'high'
  timestamp: Date
}

export interface LearningResultMetadata {
  sessionId: string
  conversationId: string
  totalMessages: number
  extractedPairs: number
  qualityScores: QualityScore[]
  processingSteps: ProcessingStep[]
}

export interface QualityScore {
  queryId: string
  relevanceScore: number
  completenessScore: number
  clarityScore: number
  overallScore: number
  factors: QualityFactor[]
}

export interface QualityFactor {
  type: 'length' | 'specificity' | 'actionability' | 'accuracy' | 'context'
  score: number
  weight: number
  description: string
}

export interface ProcessingStep {
  step: string
  timestamp: Date
  duration: number
  success: boolean
  details?: string
}

export interface ValidationResult {
  queryId: string
  isValid: boolean
  quality: 'high' | 'medium' | 'low' | 'rejected'
  confidence: number
  issues: ValidationIssue[]
  recommendations: string[]
}

export interface ValidationIssue {
  type: 'incomplete_response' | 'irrelevant_content' | 'poor_quality' | 'duplicate' | 'privacy_concern'
  severity: 'critical' | 'major' | 'minor'
  description: string
  suggestion?: string
}

export interface KnowledgePair {
  queryId: string
  query: string
  response: string
  confidence: number
  source: 'human-agent'
  timestamp: Date
  quality: 'pending' | 'approved' | 'rejected'
  metadata: KnowledgePairMetadata
}

export interface KnowledgePairMetadata {
  agentId?: string
  sessionDuration?: number
  messageCount: number
  queryComplexity: 'simple' | 'moderate' | 'complex'
  responseQuality: number
  userSatisfaction?: number
  tags: string[]
  context: ConversationContext
  validationHistory: ValidationHistoryEntry[]
}

export interface ConversationContext {
  previousQueries: string[]
  conversationFlow: string[]
  userIntent: string
  resolutionStatus: 'resolved' | 'partial' | 'unresolved'
}

export interface ValidationHistoryEntry {
  timestamp: Date
  validator: 'automatic' | 'human'
  action: 'approved' | 'rejected' | 'modified'
  reason: string
  changes?: string[]
}

export interface LearningEngineConfig {
  enabled: boolean
  qualityThreshold: number
  minResponseLength: number
  maxResponseLength: number
  duplicateDetectionEnabled: boolean
  autoApprovalThreshold: number
  batchSize: number
  processingTimeout: number
  validationRules: ValidationRule[]
}

export interface ValidationRule {
  name: string
  type: 'content' | 'quality' | 'relevance' | 'safety'
  enabled: boolean
  weight: number
  parameters: Record<string, any>
}

/**
 * LearningEngine processes recorded conversations to extract knowledge pairs
 * and validates them for integration into the knowledge base
 */
export class LearningEngine {
  private config: LearningEngineConfig
  private processingQueue: ConversationRecord[] = []
  private validatedPairs: Map<string, KnowledgePair> = new Map()

  constructor(config: LearningEngineConfig) {
    this.config = config
  }

  /**
   * Processes a conversation record to extract learning data
   */
  async processConversation(record: ConversationRecord): Promise<LearningResult> {
    const startTime = Date.now()
    const result: LearningResult = {
      success: false,
      processedPairs: 0,
      validatedPairs: 0,
      integratedPairs: 0,
      errors: [],
      processingTime: 0,
      metadata: {
        sessionId: record.sessionId,
        conversationId: record.conversationId,
        totalMessages: record.messages.length,
        extractedPairs: 0,
        qualityScores: [],
        processingSteps: []
      }
    }

    if (!this.config.enabled) {
      result.errors.push({
        type: 'extraction',
        message: 'Learning engine is disabled',
        severity: 'low',
        timestamp: new Date()
      })
      return result
    }

    try {
      // Step 1: Extract knowledge pairs
      const extractionStep = this.recordProcessingStep('Knowledge Pair Extraction')
      const knowledgePairs = await this.extractKnowledgePairs(record.messages)
      this.completeProcessingStep(extractionStep, true, `Extracted ${knowledgePairs.length} pairs`)
      
      result.processedPairs = knowledgePairs.length
      result.metadata.extractedPairs = knowledgePairs.length
      result.metadata.processingSteps.push(extractionStep)

      if (knowledgePairs.length === 0) {
        result.success = true
        result.processingTime = Date.now() - startTime
        return result
      }

      // Step 2: Validate learning pairs
      const validationStep = this.recordProcessingStep('Quality Validation')
      const validationResults = await this.validateLearning(knowledgePairs)
      const validPairs = validationResults.filter(v => v.isValid)
      this.completeProcessingStep(validationStep, true, `Validated ${validPairs.length}/${knowledgePairs.length} pairs`)
      
      result.validatedPairs = validPairs.length
      result.metadata.processingSteps.push(validationStep)

      // Step 3: Calculate quality scores
      const qualityStep = this.recordProcessingStep('Quality Assessment')
      const qualityScores = await this.calculateQualityScores(knowledgePairs, validationResults)
      this.completeProcessingStep(qualityStep, true, `Calculated quality scores for ${qualityScores.length} pairs`)
      
      result.metadata.qualityScores = qualityScores
      result.metadata.processingSteps.push(qualityStep)

      // Step 4: Store validated pairs for integration
      const storageStep = this.recordProcessingStep('Storage Preparation')
      const approvedPairs = validPairs.filter(v => v.quality === 'high' || 
        (v.quality === 'medium' && v.confidence >= this.config.autoApprovalThreshold))
      
      for (const validationResult of approvedPairs) {
        const pair = knowledgePairs.find(p => p.queryId === validationResult.queryId)
        if (pair) {
          pair.quality = validationResult.quality === 'high' ? 'approved' : 'pending'
          this.validatedPairs.set(pair.queryId, pair)
        }
      }
      
      this.completeProcessingStep(storageStep, true, `Stored ${approvedPairs.length} pairs for integration`)
      result.metadata.processingSteps.push(storageStep)

      result.success = true
      result.integratedPairs = approvedPairs.length

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      result.errors.push({
        type: 'extraction',
        message: `Processing failed: ${errorMessage}`,
        severity: 'high',
        timestamp: new Date()
      })
      
      console.error('LearningEngine: Error processing conversation:', error)
    }

    result.processingTime = Date.now() - startTime
    return result
  }

  /**
   * Extracts query-response pairs from recorded messages
   */
  async extractKnowledgePairs(messages: RecordedMessage[]): Promise<KnowledgePair[]> {
    const pairs: KnowledgePair[] = []
    
    for (let i = 0; i < messages.length - 1; i++) {
      const currentMessage = messages[i]
      const nextMessage = messages[i + 1]

      // Look for user questions followed by agent responses
      if (currentMessage.sender === 'user' && nextMessage.sender === 'agent') {
        if (this.isValidQuestion(currentMessage.content)) {
          const pair = await this.createKnowledgePair(
            currentMessage,
            nextMessage,
            messages,
            i
          )
          
          if (pair) {
            pairs.push(pair)
          }
        }
      }
    }

    return pairs
  }

  /**
   * Validates learning pairs for quality and relevance
   */
  async validateLearning(pairs: KnowledgePair[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = []

    for (const pair of pairs) {
      const validation = await this.validateSinglePair(pair)
      results.push(validation)
    }

    return results
  }

  /**
   * Integrates validated knowledge pairs (placeholder for actual integration)
   */
  async integrateKnowledge(validatedPairs: KnowledgePair[]): Promise<void> {
    // This would integrate with the actual knowledge base
    // For now, we'll just log the integration
    console.info(`LearningEngine: Would integrate ${validatedPairs.length} knowledge pairs`)
    
    for (const pair of validatedPairs) {
      console.debug('LearningEngine: Integrating pair:', {
        queryId: pair.queryId,
        query: pair.query.substring(0, 50) + '...',
        quality: pair.quality,
        confidence: pair.confidence
      })
    }
  }

  /**
   * Gets validated pairs ready for integration
   */
  getValidatedPairs(): KnowledgePair[] {
    return Array.from(this.validatedPairs.values())
  }

  /**
   * Gets pairs by quality level
   */
  getPairsByQuality(quality: 'approved' | 'pending' | 'rejected'): KnowledgePair[] {
    return Array.from(this.validatedPairs.values()).filter(pair => pair.quality === quality)
  }

  /**
   * Approves a pending knowledge pair
   */
  approvePair(queryId: string, approver: string): boolean {
    const pair = this.validatedPairs.get(queryId)
    if (pair && pair.quality === 'pending') {
      pair.quality = 'approved'
      pair.metadata.validationHistory.push({
        timestamp: new Date(),
        validator: 'human',
        action: 'approved',
        reason: `Approved by ${approver}`
      })
      return true
    }
    return false
  }

  /**
   * Rejects a knowledge pair
   */
  rejectPair(queryId: string, reason: string, rejector: string): boolean {
    const pair = this.validatedPairs.get(queryId)
    if (pair) {
      pair.quality = 'rejected'
      pair.metadata.validationHistory.push({
        timestamp: new Date(),
        validator: 'human',
        action: 'rejected',
        reason: `Rejected by ${rejector}: ${reason}`
      })
      return true
    }
    return false
  }

  // Private helper methods

  private async createKnowledgePair(
    userMessage: RecordedMessage,
    agentMessage: RecordedMessage,
    allMessages: RecordedMessage[],
    messageIndex: number
  ): Promise<KnowledgePair | null> {
    try {
      const queryId = this.generateQueryId()
      const context = this.extractConversationContext(allMessages, messageIndex)
      
      const pair: KnowledgePair = {
        queryId,
        query: userMessage.content,
        response: agentMessage.content,
        confidence: this.calculateInitialConfidence(userMessage.content, agentMessage.content),
        source: 'human-agent',
        timestamp: agentMessage.timestamp,
        quality: 'pending',
        metadata: {
          agentId: agentMessage.metadata?.agentId,
          messageCount: allMessages.length,
          queryComplexity: this.assessQueryComplexity(userMessage.content),
          responseQuality: this.assessResponseQuality(agentMessage.content),
          tags: this.extractTags(userMessage.content, agentMessage.content),
          context,
          validationHistory: []
        }
      }

      return pair
    } catch (error) {
      console.error('LearningEngine: Error creating knowledge pair:', error)
      return null
    }
  }

  private async validateSinglePair(pair: KnowledgePair): Promise<ValidationResult> {
    const validation: ValidationResult = {
      queryId: pair.queryId,
      isValid: true,
      quality: 'medium',
      confidence: pair.confidence,
      issues: [],
      recommendations: []
    }

    // Apply validation rules
    for (const rule of this.config.validationRules) {
      if (!rule.enabled) continue

      try {
        const ruleResult = await this.applyValidationRule(pair, rule)
        if (!ruleResult.passed) {
          validation.issues.push(...ruleResult.issues)
          validation.confidence *= (1 - rule.weight * 0.1)
        }
      } catch (error) {
        console.error(`LearningEngine: Error applying validation rule ${rule.name}:`, error)
      }
    }

    // Determine overall quality
    validation.quality = this.determineQuality(validation.confidence, validation.issues)
    validation.isValid = validation.quality !== 'rejected'

    // Add recommendations
    validation.recommendations = this.generateRecommendations(pair, validation.issues)

    return validation
  }

  private async applyValidationRule(
    pair: KnowledgePair,
    rule: ValidationRule
  ): Promise<{ passed: boolean; issues: ValidationIssue[] }> {
    const issues: ValidationIssue[] = []

    switch (rule.type) {
      case 'content':
        return this.validateContent(pair, rule.parameters)
      
      case 'quality':
        return this.validateQuality(pair, rule.parameters)
      
      case 'relevance':
        return this.validateRelevance(pair, rule.parameters)
      
      case 'safety':
        return this.validateSafety(pair, rule.parameters)
      
      default:
        return { passed: true, issues: [] }
    }
  }

  private validateContent(pair: KnowledgePair, params: Record<string, any>): { passed: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []

    // Check response length
    if (pair.response.length < this.config.minResponseLength) {
      issues.push({
        type: 'incomplete_response',
        severity: 'major',
        description: `Response too short (${pair.response.length} chars, minimum ${this.config.minResponseLength})`,
        suggestion: 'Consider if the response provides sufficient information'
      })
    }

    if (pair.response.length > this.config.maxResponseLength) {
      issues.push({
        type: 'poor_quality',
        severity: 'minor',
        description: `Response very long (${pair.response.length} chars, maximum ${this.config.maxResponseLength})`,
        suggestion: 'Consider if the response could be more concise'
      })
    }

    // Check for generic responses
    const genericPhrases = ['i don\'t know', 'not sure', 'maybe', 'possibly', 'i think']
    const responseText = pair.response.toLowerCase()
    const hasGenericPhrases = genericPhrases.some(phrase => responseText.includes(phrase))

    if (hasGenericPhrases) {
      issues.push({
        type: 'poor_quality',
        severity: 'major',
        description: 'Response contains generic or uncertain language',
        suggestion: 'Look for more definitive and specific responses'
      })
    }

    return { passed: issues.length === 0, issues }
  }

  private validateQuality(pair: KnowledgePair, params: Record<string, any>): { passed: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []

    // Check if response actually answers the question
    const queryWords = pair.query.toLowerCase().split(' ')
    const responseWords = pair.response.toLowerCase().split(' ')
    const overlap = queryWords.filter(word => responseWords.includes(word)).length
    const relevanceRatio = overlap / queryWords.length

    if (relevanceRatio < 0.2) {
      issues.push({
        type: 'irrelevant_content',
        severity: 'critical',
        description: 'Response appears unrelated to the question',
        suggestion: 'Verify that the response addresses the user\'s query'
      })
    }

    // Check for actionable content
    const actionWords = ['step', 'first', 'then', 'next', 'follow', 'click', 'go to', 'try']
    const hasActionableContent = actionWords.some(word => pair.response.toLowerCase().includes(word))

    if (pair.metadata.queryComplexity !== 'simple' && !hasActionableContent) {
      issues.push({
        type: 'incomplete_response',
        severity: 'minor',
        description: 'Complex query lacks actionable guidance',
        suggestion: 'Consider if step-by-step instructions would be helpful'
      })
    }

    return { passed: issues.filter(i => i.severity === 'critical').length === 0, issues }
  }

  private validateRelevance(pair: KnowledgePair, params: Record<string, any>): { passed: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []

    // Check for domain relevance (event management context)
    const eventTerms = ['event', 'venue', 'guest', 'planning', 'booking', 'schedule', 'invitation', 'catering']
    const queryText = pair.query.toLowerCase()
    const responseText = pair.response.toLowerCase()
    
    const hasEventContext = eventTerms.some(term => 
      queryText.includes(term) || responseText.includes(term)
    )

    if (!hasEventContext) {
      issues.push({
        type: 'irrelevant_content',
        severity: 'minor',
        description: 'Content may not be relevant to event management domain',
        suggestion: 'Verify relevance to the bot\'s primary domain'
      })
    }

    return { passed: true, issues } // Don't fail on relevance alone
  }

  private validateSafety(pair: KnowledgePair, params: Record<string, any>): { passed: boolean; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []

    // Check for potential privacy concerns
    const privacyPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}-?\d{2}-?\d{4}\b/g, // SSN
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g // Credit card
    ]

    const combinedText = `${pair.query} ${pair.response}`
    const hasPII = privacyPatterns.some(pattern => pattern.test(combinedText))

    if (hasPII) {
      issues.push({
        type: 'privacy_concern',
        severity: 'critical',
        description: 'Content may contain personally identifiable information',
        suggestion: 'Review and redact any PII before integration'
      })
    }

    return { passed: !hasPII, issues }
  }

  private determineQuality(confidence: number, issues: ValidationIssue[]): 'high' | 'medium' | 'low' | 'rejected' {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length
    const majorIssues = issues.filter(i => i.severity === 'major').length

    if (criticalIssues > 0) {
      return 'rejected'
    }

    if (confidence >= 0.8 && majorIssues === 0) {
      return 'high'
    }

    if (confidence >= 0.6 && majorIssues <= 1) {
      return 'medium'
    }

    if (confidence >= 0.4) {
      return 'low'
    }

    return 'rejected'
  }

  private generateRecommendations(pair: KnowledgePair, issues: ValidationIssue[]): string[] {
    const recommendations: string[] = []

    if (issues.length === 0) {
      recommendations.push('High quality pair ready for integration')
    } else {
      recommendations.push(...issues.map(issue => issue.suggestion).filter(Boolean) as string[])
    }

    // Add general recommendations based on pair characteristics
    if (pair.metadata.queryComplexity === 'complex' && pair.response.length < 200) {
      recommendations.push('Consider if more detailed explanation would be helpful for complex queries')
    }

    if (pair.metadata.responseQuality < 0.6) {
      recommendations.push('Response quality could be improved with more specific information')
    }

    return recommendations
  }

  private async calculateQualityScores(
    pairs: KnowledgePair[],
    validationResults: ValidationResult[]
  ): Promise<QualityScore[]> {
    const scores: QualityScore[] = []

    for (const pair of pairs) {
      const validation = validationResults.find(v => v.queryId === pair.queryId)
      if (!validation) continue

      const factors: QualityFactor[] = [
        {
          type: 'length',
          score: this.scoreLengthFactor(pair.response),
          weight: 0.2,
          description: 'Response length appropriateness'
        },
        {
          type: 'specificity',
          score: this.scoreSpecificityFactor(pair.response),
          weight: 0.3,
          description: 'Response specificity and detail'
        },
        {
          type: 'actionability',
          score: this.scoreActionabilityFactor(pair.response),
          weight: 0.2,
          description: 'Actionable guidance provided'
        },
        {
          type: 'context',
          score: this.scoreContextFactor(pair.query, pair.response),
          weight: 0.3,
          description: 'Relevance to query context'
        }
      ]

      const overallScore = factors.reduce((sum, factor) => 
        sum + (factor.score * factor.weight), 0)

      scores.push({
        queryId: pair.queryId,
        relevanceScore: this.scoreContextFactor(pair.query, pair.response),
        completenessScore: this.scoreLengthFactor(pair.response),
        clarityScore: this.scoreSpecificityFactor(pair.response),
        overallScore,
        factors
      })
    }

    return scores
  }

  private scoreLengthFactor(response: string): number {
    const length = response.length
    if (length < 50) return 0.3
    if (length < 100) return 0.6
    if (length < 300) return 1.0
    if (length < 500) return 0.8
    return 0.6 // Very long responses
  }

  private scoreSpecificityFactor(response: string): number {
    const specificWords = ['specific', 'exactly', 'precisely', 'step', 'first', 'then', 'example']
    const responseText = response.toLowerCase()
    const specificityCount = specificWords.filter(word => responseText.includes(word)).length
    return Math.min(specificityCount * 0.2, 1.0)
  }

  private scoreActionabilityFactor(response: string): number {
    const actionWords = ['click', 'go to', 'select', 'choose', 'follow', 'try', 'use', 'set']
    const responseText = response.toLowerCase()
    const actionCount = actionWords.filter(word => responseText.includes(word)).length
    return Math.min(actionCount * 0.25, 1.0)
  }

  private scoreContextFactor(query: string, response: string): number {
    const queryWords = query.toLowerCase().split(' ').filter(word => word.length > 3)
    const responseText = response.toLowerCase()
    const matchCount = queryWords.filter(word => responseText.includes(word)).length
    return queryWords.length > 0 ? matchCount / queryWords.length : 0
  }

  private isValidQuestion(content: string): boolean {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did']
    const lowerContent = content.toLowerCase().trim()
    
    // Check for question mark
    if (lowerContent.endsWith('?')) {
      return true
    }

    // Check for question words at the beginning
    const firstWord = lowerContent.split(' ')[0]
    if (questionWords.includes(firstWord)) {
      return true
    }

    // Check for help-seeking patterns
    const helpPatterns = ['help me', 'i need', 'how do i', 'can you']
    return helpPatterns.some(pattern => lowerContent.includes(pattern))
  }

  private calculateInitialConfidence(query: string, response: string): number {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.5 // Base confidence

    // Length factor
    if (response.length > 50) confidence += 0.1
    if (response.length > 100) confidence += 0.1

    // Specificity factor
    if (response.includes('step') || response.includes('first')) confidence += 0.1
    if (response.includes('example') || response.includes('for instance')) confidence += 0.1

    // Relevance factor
    const queryWords = query.toLowerCase().split(' ')
    const responseWords = response.toLowerCase().split(' ')
    const overlap = queryWords.filter(word => responseWords.includes(word)).length
    confidence += (overlap / queryWords.length) * 0.2

    return Math.min(confidence, 1.0)
  }

  private assessQueryComplexity(query: string): 'simple' | 'moderate' | 'complex' {
    const wordCount = query.split(' ').length
    const hasMultipleQuestions = (query.match(/\?/g) || []).length > 1
    const hasComplexWords = /\b(implement|configure|integrate|troubleshoot|optimize|comprehensive)\b/i.test(query)

    if (wordCount > 20 || hasMultipleQuestions || hasComplexWords) {
      return 'complex'
    } else if (wordCount > 10) {
      return 'moderate'
    } else {
      return 'simple'
    }
  }

  private assessResponseQuality(response: string): number {
    let quality = 0.5 // Base quality

    // Check for completeness indicators
    if (response.length > 50) quality += 0.2
    if (response.includes('step') || response.includes('first') || response.includes('then')) quality += 0.1
    if (response.includes('example') || response.includes('for instance')) quality += 0.1
    if (response.includes('documentation') || response.includes('guide')) quality += 0.1

    // Penalize very short responses
    if (response.length < 20) quality -= 0.2

    return Math.max(0, Math.min(1, quality))
  }

  private extractTags(query: string, response: string): string[] {
    const tags: string[] = []
    const combinedText = `${query} ${response}`.toLowerCase()

    // Technical tags
    const technicalTerms = ['api', 'database', 'integration', 'configuration', 'authentication', 'error', 'bug', 'feature']
    technicalTerms.forEach(term => {
      if (combinedText.includes(term)) {
        tags.push(term)
      }
    })

    // Event-related tags
    const eventTerms = ['event', 'venue', 'guest', 'planning', 'booking', 'schedule', 'invitation']
    eventTerms.forEach(term => {
      if (combinedText.includes(term)) {
        tags.push(term)
      }
    })

    return tags
  }

  private extractConversationContext(messages: RecordedMessage[], currentIndex: number): ConversationContext {
    const previousMessages = messages.slice(0, currentIndex)
    const previousQueries = previousMessages
      .filter(msg => msg.sender === 'user' && this.isValidQuestion(msg.content))
      .map(msg => msg.content)

    const conversationFlow = previousMessages
      .slice(-5) // Last 5 messages for context
      .map(msg => `${msg.sender}: ${msg.content.substring(0, 50)}...`)

    // Simple intent detection
    const currentQuery = messages[currentIndex].content.toLowerCase()
    let userIntent = 'general_inquiry'
    
    if (currentQuery.includes('book') || currentQuery.includes('reserve')) {
      userIntent = 'booking'
    } else if (currentQuery.includes('plan') || currentQuery.includes('organize')) {
      userIntent = 'planning'
    } else if (currentQuery.includes('venue') || currentQuery.includes('location')) {
      userIntent = 'venue_inquiry'
    } else if (currentQuery.includes('guest') || currentQuery.includes('invite')) {
      userIntent = 'guest_management'
    }

    return {
      previousQueries,
      conversationFlow,
      userIntent,
      resolutionStatus: 'partial' // Will be updated based on conversation outcome
    }
  }

  private recordProcessingStep(stepName: string): ProcessingStep {
    return {
      step: stepName,
      timestamp: new Date(),
      duration: 0,
      success: false
    }
  }

  private completeProcessingStep(step: ProcessingStep, success: boolean, details?: string): void {
    step.duration = Date.now() - step.timestamp.getTime()
    step.success = success
    if (details) {
      step.details = details
    }
  }

  private generateQueryId(): string {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
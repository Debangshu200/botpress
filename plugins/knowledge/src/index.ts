import * as gen from './generate-content'
import * as questions from './question-prompt'
import * as bp from '.botpress'

// Import confidence evaluation components
interface ConfidenceFactor {
  name: string
  score: number
  weight: number
  description: string
}

interface ConfidenceScore {
  score: number // 0-1 scale
  threshold: number
  isAboveThreshold: boolean
  factors: ConfidenceFactor[]
}

interface SearchResult {
  content: string
  score: number
  source: string
  metadata: SearchMetadata
  passages?: ContentPassage[]
}

interface SearchMetadata {
  topic: string
  relevanceScore: number
  matchType: 'exact' | 'partial' | 'semantic'
  keywords: string[]
}

interface ContentPassage {
  text: string
  startIndex: number
  endIndex: number
  relevanceScore: number
}

// Enhanced Knowledge Plugin with Confidence Evaluation
class ConfidenceEvaluator {
  private threshold: number = 0.6

  calculateConfidence(query: string, passages: any[]): ConfidenceScore {
    if (!passages || passages.length === 0) {
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

    // Factor 1: Number of relevant passages
    const passageCountScore = Math.min(1.0, passages.length / 3)
    factors.push({
      name: 'passage_count',
      score: passageCountScore,
      weight: 0.2,
      description: `Found ${passages.length} relevant passages`
    })

    // Factor 2: Content quality and length
    const avgContentLength = passages.reduce((sum, p) => sum + p.content.length, 0) / passages.length
    const contentQualityScore = this.calculateContentQuality(avgContentLength)
    factors.push({
      name: 'content_quality',
      score: contentQualityScore,
      weight: 0.3,
      description: 'Quality and completeness of content'
    })

    // Factor 3: Keyword matching
    const keywordScore = this.calculateKeywordMatch(query, passages)
    factors.push({
      name: 'keyword_match',
      score: keywordScore,
      weight: 0.3,
      description: 'Direct keyword matching with search results'
    })

    // Factor 4: Passage relevance scores (if available)
    const relevanceScore = this.calculateRelevanceScore(passages)
    factors.push({
      name: 'relevance',
      score: relevanceScore,
      weight: 0.2,
      description: 'Relevance scores from search engine'
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

  private calculateContentQuality(avgLength: number): number {
    // Optimal content length is between 100-1000 characters
    if (avgLength >= 100 && avgLength <= 1000) {
      return 1.0
    } else if (avgLength >= 50 && avgLength < 100) {
      return 0.7
    } else if (avgLength > 1000) {
      return 0.8 // Still good, just verbose
    } else {
      return 0.3 // Too short
    }
  }

  private calculateKeywordMatch(query: string, passages: any[]): number {
    const queryWords = this.extractKeywords(query.toLowerCase())
    if (queryWords.length === 0) return 0.5

    let totalMatches = 0
    let totalPossible = 0

    passages.forEach(passage => {
      const passageWords = this.extractKeywords(passage.content.toLowerCase())
      const matches = queryWords.filter(word => 
        passageWords.some(passageWord => 
          passageWord.includes(word) || word.includes(passageWord)
        )
      ).length

      totalMatches += matches
      totalPossible += queryWords.length
    })

    return totalPossible > 0 ? totalMatches / totalPossible : 0
  }

  private calculateRelevanceScore(passages: any[]): number {
    // If passages have score property, use it
    const scoresAvailable = passages.some(p => typeof p.score === 'number')
    if (scoresAvailable) {
      const avgScore = passages.reduce((sum, p) => sum + (p.score || 0), 0) / passages.length
      return Math.min(1.0, avgScore)
    }
    
    // Default relevance based on content presence
    return 0.7
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 
      'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
    ])

    return text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10)
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.min(1.0, Math.max(0.0, threshold))
  }
}

// Initialize confidence evaluator
const confidenceEvaluator = new ConfidenceEvaluator()

const plugin = new bp.Plugin({
  actions: {},
})

plugin.on.beforeIncomingMessage('*', async ({ data: message, client, ctx, actions }) => {
  try {
    console.info('Knowledge plugin: Processing incoming message with confidence evaluation', { 
      type: message.type, 
      conversationId: message.conversationId,
      messageId: message.id 
    })
    
    // Skip non-text messages
    if (message.type !== 'text') {
      console.info('Knowledge plugin: Ignoring non-text message, allowing normal bot processing')
      return
    }

    // Skip empty messages
    const text: string = message.payload.text
    if (!text || text.trim().length === 0) {
      console.info('Knowledge plugin: Ignoring empty message, allowing normal bot processing')
      return
    }

    console.info('Knowledge plugin: Extracting questions from text message:', 
      text.substring(0, 100) + (text.length > 100 ? '...' : ''))

    // Extract questions using LLM with error handling
    let llmOutput: string
    try {
      const llmInput = questions.prompt({ text, line: 'L1' })
      llmOutput = await actions.llm.generateContent(llmInput)
      console.debug('Knowledge plugin: LLM response received', { 
        outputLength: llmOutput?.length || 0 
      })
    } catch (error) {
      console.error('Knowledge plugin: LLM generation failed, allowing normal bot processing', {
        error: error instanceof Error ? error.message : 'Unknown error',
        conversationId: message.conversationId
      })
      return
    }

    // Parse LLM output with error handling
    const { success, json } = gen.parseLLMOutput(llmOutput)
    if (!success) {
      console.warn('Knowledge plugin: Failed to parse LLM output, allowing normal bot processing', {
        outputPreview: llmOutput?.substring(0, 200) + (llmOutput?.length > 200 ? '...' : ''),
        conversationId: message.conversationId
      })
      return
    }

    // Validate question extraction results
    const parsedResult = questions.OutputFormat.safeParse(json)
    if (!parsedResult.success) {
      console.warn('Knowledge plugin: Failed to validate question extraction results, allowing normal bot processing', {
        validationError: parsedResult.error.message,
        conversationId: message.conversationId
      })
      return
    }

    const { data } = parsedResult
    if (!data.hasQuestions || !data.questions?.length) {
      console.info('Knowledge plugin: No questions detected in message, allowing normal bot processing')
      return
    }

    // Generate search query from extracted questions
    const canonicalQuestion = data.questions.map((question) => question.resolved_question).join(' ')
    console.info('Knowledge plugin: Searching knowledge base for:', canonicalQuestion)

    // Search knowledge base with error handling
    let passages: any[]
    try {
      const searchResult = await client.searchFiles({
        query: canonicalQuestion,
      })
      passages = searchResult.passages || []
      console.debug('Knowledge plugin: Knowledge search completed', {
        passageCount: passages.length,
        query: canonicalQuestion
      })
    } catch (error) {
      console.error('Knowledge plugin: Knowledge base search failed, implementing fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: canonicalQuestion,
        conversationId: message.conversationId
      })
      
      // Fallback mechanism: Allow normal bot processing for system errors
      return await handleKnowledgeSearchFailure(client, message, ctx, canonicalQuestion)
    }

    // Calculate confidence score for search results
    const confidence = confidenceEvaluator.calculateConfidence(canonicalQuestion, passages)
    
    console.info('Knowledge plugin: Confidence evaluation completed', {
      score: confidence.score,
      threshold: confidence.threshold,
      isAboveThreshold: confidence.isAboveThreshold,
      factorCount: confidence.factors.length,
      passageCount: passages.length
    })

    // Route response based on confidence level
    return await routeResponseByConfidence(
      confidence, 
      passages, 
      canonicalQuestion, 
      client, 
      message, 
      ctx, 
      text
    )

  } catch (error) {
    // Catch-all error handler to ensure plugin never crashes the bot
    console.error('Knowledge plugin: Unexpected error during processing, allowing normal bot processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      conversationId: message.conversationId,
      messageType: message.type
    })
    return
  }
})

/**
 * Route response based on confidence level
 */
async function routeResponseByConfidence(
  confidence: ConfidenceScore,
  passages: any[],
  query: string,
  client: any,
  message: any,
  ctx: any,
  originalText: string
) {
  try {
    if (confidence.isAboveThreshold) {
      // High confidence: Provide direct response with confidence indicator
      return await handleHighConfidenceResponse(confidence, passages, client, message, ctx)
    } else if (confidence.score > 0.3) {
      // Medium confidence: Provide response with clarification option
      return await handleMediumConfidenceResponse(confidence, passages, client, message, ctx, originalText)
    } else {
      // Low confidence: Implement fallback mechanisms
      return await handleLowConfidenceResponse(confidence, query, client, message, ctx, originalText)
    }
  } catch (error) {
    console.error('Knowledge plugin: Error in response routing, allowing normal bot processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      confidence: confidence.score,
      conversationId: message.conversationId
    })
    return
  }
}

/**
 * Handle high confidence responses
 */
async function handleHighConfidenceResponse(
  confidence: ConfidenceScore,
  passages: any[],
  client: any,
  message: any,
  ctx: any
) {
  // Import refinement system dynamically
  let refinedAnswer: string
  
  try {
    // Try to use the enhanced refinement system
    const { KnowledgeResponseRefiner } = await import('../../bots/eventtitan/src/knowledge-response-refiner')
    const { refinementConfigManager, detectTopicFromQuery } = await import('../../bots/eventtitan/src/knowledge-refinement-config')
    
    const rawAnswer = passages.map((p) => p.content).join('\n\n')
    const topic = detectTopicFromQuery(message.payload.text)
    const config = refinementConfigManager.getConfigForTopic(topic)
    
    const refiner = KnowledgeResponseRefiner.withConfig(config, client)
    const refinedResponse = await refiner.refineResponse(rawAnswer, message.payload.text, {
      maxLines: config.maxLines,
      removeFileNames: config.removeFileNames,
      removeSources: config.removeSources,
      addEmojis: config.addEmojis,
      includeFollowUp: config.includeFollowUp,
      temperature: config.temperature,
      maxTokens: config.maxTokens
    })
    
    refinedAnswer = refinedResponse.content
    
    console.info('Knowledge plugin: Response refined successfully', {
      originalLength: rawAnswer.length,
      refinedLength: refinedResponse.refinedLength,
      confidence: refinedResponse.confidence,
      topic
    })
    
  } catch (error) {
    console.warn('Knowledge plugin: Refinement failed, using basic answer', error)
    // Fallback to basic answer if refinement fails
    refinedAnswer = passages.map((p) => p.content).join('\n\n')
  }
  
  // Use refined answer instead of raw content
  const responseText = refinedAnswer
  
  await client.createMessage({
    conversationId: message.conversationId,
    userId: ctx.botId,
    payload: {
      text: responseText,
    },
    tags: {
      'knowledge-plugin': 'true',
      'source': 'knowledge-base',
      'confidence-level': 'high',
      'confidence-score': confidence.score.toString()
    },
    type: 'text',
  })

  console.info('Knowledge plugin: High confidence response sent', {
    responseLength: responseText.length,
    confidenceScore: confidence.score,
    conversationId: message.conversationId
  })
  
  return { stop: true }
}

/**
 * Handle medium confidence responses
 */
async function handleMediumConfidenceResponse(
  confidence: ConfidenceScore,
  passages: any[],
  client: any,
  message: any,
  ctx: any,
  originalText: string
) {
  // Import refinement system dynamically for medium confidence responses too
  let refinedAnswer: string
  
  try {
    // Try to use the enhanced refinement system
    const { KnowledgeResponseRefiner } = await import('../../bots/eventtitan/src/knowledge-response-refiner')
    const { refinementConfigManager, detectTopicFromQuery } = await import('../../bots/eventtitan/src/knowledge-refinement-config')
    
    const rawAnswer = passages.map((p) => p.content).join('\n\n')
    const topic = detectTopicFromQuery(message.payload.text)
    const config = refinementConfigManager.getConfigForTopic(topic)
    
    const refiner = KnowledgeResponseRefiner.withConfig(config, client)
    const refinedResponse = await refiner.refineResponse(rawAnswer, message.payload.text, {
      maxLines: config.maxLines,
      removeFileNames: config.removeFileNames,
      removeSources: config.removeSources,
      addEmojis: config.addEmojis,
      includeFollowUp: false, // Don't include follow-up for medium confidence, we'll add clarification instead
      temperature: config.temperature,
      maxTokens: config.maxTokens
    })
    
    refinedAnswer = refinedResponse.content
    
    console.info('Knowledge plugin: Medium confidence response refined successfully', {
      originalLength: rawAnswer.length,
      refinedLength: refinedResponse.refinedLength,
      confidence: refinedResponse.confidence,
      topic
    })
    
  } catch (error) {
    console.warn('Knowledge plugin: Medium confidence refinement failed, using basic answer', error)
    // Fallback to basic answer if refinement fails
    refinedAnswer = passages.map((p) => p.content).join('\n\n')
  }
  
  // Add clarification option for medium confidence
  const clarificationOffer = "\n\n🤔 If this doesn't fully answer your question, please let me know and I can connect you with a human agent for more detailed assistance."
  
  const responseText = `${refinedAnswer}${clarificationOffer}`
  
  await client.createMessage({
    conversationId: message.conversationId,
    userId: ctx.botId,
    payload: {
      text: responseText,
    },
    tags: {
      'knowledge-plugin': 'true',
      'source': 'knowledge-base',
      'confidence-level': 'medium',
      'confidence-score': confidence.score.toString(),
      'clarification-offered': 'true'
    },
    type: 'text',
  })

  console.info('Knowledge plugin: Medium confidence response sent with clarification option', {
    responseLength: responseText.length,
    confidenceScore: confidence.score,
    conversationId: message.conversationId
  })
  
  return { stop: true }
}

/**
 * Handle low confidence responses - implement fallback mechanisms
 */
async function handleLowConfidenceResponse(
  confidence: ConfidenceScore,
  query: string,
  client: any,
  message: any,
  ctx: any,
  originalText: string
) {
  console.info('Knowledge plugin: Low confidence detected, implementing fallback mechanisms', {
    confidenceScore: confidence.score,
    query: query.substring(0, 100),
    conversationId: message.conversationId
  })

  // Fallback 1: Try to provide partial information if available
  if (confidence.score > 0.1 && confidence.factors.some(f => f.name === 'keyword_match' && f.score > 0.2)) {
    return await handlePartialInformationFallback(confidence, client, message, ctx, originalText)
  }

  // Fallback 2: Suggest alternative search terms or rephrase
  if (isComplexQuery(originalText)) {
    return await handleComplexQueryFallback(client, message, ctx, originalText)
  }

  // Fallback 3: Allow normal bot processing (potential handoff to human)
  console.info('Knowledge plugin: No suitable fallback found, allowing normal bot processing for potential handoff')
  return
}

/**
 * Handle partial information fallback
 */
async function handlePartialInformationFallback(
  confidence: ConfidenceScore,
  client: any,
  message: any,
  ctx: any,
  originalText: string
) {
  const responseText = `I found some information that might be related to your question, but I'm not entirely confident it fully addresses what you're asking about.

Would you like me to connect you with a human agent who can provide more specific assistance, or would you prefer to rephrase your question so I can search more effectively?`

  await client.createMessage({
    conversationId: message.conversationId,
    userId: ctx.botId,
    payload: {
      text: responseText,
    },
    tags: {
      'knowledge-plugin': 'true',
      'source': 'fallback-partial',
      'confidence-level': 'low',
      'confidence-score': confidence.score.toString(),
      'fallback-type': 'partial-information'
    },
    type: 'text',
  })

  console.info('Knowledge plugin: Partial information fallback response sent', {
    confidenceScore: confidence.score,
    conversationId: message.conversationId
  })
  
  return { stop: true }
}

/**
 * Handle complex query fallback
 */
async function handleComplexQueryFallback(
  client: any,
  message: any,
  ctx: any,
  originalText: string
) {
  const responseText = `Your question seems quite detailed and specific. To give you the most accurate information, I'd recommend either:

1. Breaking down your question into smaller, more specific parts
2. Connecting with one of our human agents who can provide personalized assistance

Would you like me to connect you with a human agent now?`

  await client.createMessage({
    conversationId: message.conversationId,
    userId: ctx.botId,
    payload: {
      text: responseText,
    },
    tags: {
      'knowledge-plugin': 'true',
      'source': 'fallback-complex',
      'confidence-level': 'low',
      'fallback-type': 'complex-query'
    },
    type: 'text',
  })

  console.info('Knowledge plugin: Complex query fallback response sent', {
    queryLength: originalText.length,
    conversationId: message.conversationId
  })
  
  return { stop: true }
}

/**
 * Handle knowledge search failure
 */
async function handleKnowledgeSearchFailure(
  client: any,
  message: any,
  ctx: any,
  query: string
) {
  const responseText = `I'm experiencing some technical difficulties accessing our knowledge base right now. Let me connect you with a human agent who can assist you directly.`

  try {
    await client.createMessage({
      conversationId: message.conversationId,
      userId: ctx.botId,
      payload: {
        text: responseText,
      },
      tags: {
        'knowledge-plugin': 'true',
        'source': 'fallback-system-error',
        'fallback-type': 'search-failure',
        'requires-handoff': 'true'
      },
      type: 'text',
    })

    console.info('Knowledge plugin: System error fallback response sent', {
      query: query.substring(0, 100),
      conversationId: message.conversationId
    })
    
    return { stop: true }
  } catch (error) {
    console.error('Knowledge plugin: Failed to send system error fallback, allowing normal bot processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      conversationId: message.conversationId
    })
    return
  }
}

/**
 * Get confidence indicator text
 */
function getConfidenceIndicator(score: number): string {
  if (score >= 0.8) {
    return "ℹ️ *High confidence response from knowledge base*"
  } else if (score >= 0.6) {
    return "ℹ️ *Response from knowledge base*"
  } else if (score >= 0.4) {
    return "ℹ️ *Partial match from knowledge base*"
  } else {
    return "ℹ️ *Limited confidence in this response*"
  }
}

/**
 * Check if query is complex and might need human assistance
 */
function isComplexQuery(text: string): boolean {
  const complexityIndicators = [
    text.length > 200,
    (text.match(/\?/g) || []).length > 2, // Multiple questions
    text.includes(' and ') && text.includes(' or '), // Complex logic
    text.includes('compare') || text.includes('versus') || text.includes('vs'),
    text.includes('recommend') || text.includes('suggest') || text.includes('advice'),
    text.includes('custom') || text.includes('specific') || text.includes('particular')
  ]
  
  return complexityIndicators.filter(Boolean).length >= 2
}

export default plugin

/**
 * LLM Configuration Management
 * Centralized configuration for LLM integration
 */

export interface LLMIntegrationConfig {
  openRouter: {
    apiKey: string
    baseUrl: string
    defaultModel: string
    fallbackModels: string[]
    maxTokens: number
    temperature: number
    timeout: number
    retryAttempts: number
    rateLimitPerMinute: number
  }
  knowledge: {
    confidenceThreshold: number
    maxKnowledgeChunks: number
    contextWindowSize: number
    searchTimeout: number
    enableSemanticSearch: boolean
    fallbackToBasicSearch: boolean
  }
  response: {
    maxLength: number
    includeFollowUps: boolean
    includeSources: boolean
    addEmojis: boolean
    personalityTone: 'professional' | 'friendly' | 'casual'
    responseFormat: 'conversational' | 'structured' | 'bullet-points'
  }
  handoff: {
    enabled: boolean
    lowConfidenceThreshold: number
    autoHandoffEnabled: boolean
    handoffKeywords: string[]
    complexityIndicators: string[]
  }
  performance: {
    enableCaching: boolean
    cacheExpirationMinutes: number
    maxCacheSize: number
    logProcessingTime: boolean
    enableMetrics: boolean
    fallbackTimeout: number
  }
  features: {
    conversationMemory: boolean
    contextAwareness: boolean
    multiTurnDialogue: boolean
    intentRecognition: boolean
    entityExtraction: boolean
  }
}

export class LLMConfigManager {
  private static instance: LLMConfigManager
  private config: LLMIntegrationConfig

  private constructor() {
    this.config = this.loadDefaultConfig()
    this.loadEnvironmentOverrides()
  }

  public static getInstance(): LLMConfigManager {
    if (!LLMConfigManager.instance) {
      LLMConfigManager.instance = new LLMConfigManager()
    }
    return LLMConfigManager.instance
  }

  public getConfig(): LLMIntegrationConfig {
    return { ...this.config }
  }

  public updateConfig(updates: Partial<LLMIntegrationConfig>): void {
    this.config = this.mergeConfigs(this.config, updates)
  }

  public validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate OpenRouter configuration
    if (!this.config.openRouter.apiKey) {
      errors.push('OpenRouter API key is required (set OPENROUTER_API_KEY environment variable)')
    }

    if (this.config.openRouter.maxTokens < 50 || this.config.openRouter.maxTokens > 2000) {
      errors.push('OpenRouter maxTokens should be between 50 and 2000')
    }

    if (this.config.openRouter.temperature < 0 || this.config.openRouter.temperature > 2) {
      errors.push('OpenRouter temperature should be between 0 and 2')
    }

    // Validate knowledge configuration
    if (this.config.knowledge.confidenceThreshold < 0 || this.config.knowledge.confidenceThreshold > 1) {
      errors.push('Knowledge confidence threshold should be between 0 and 1')
    }

    if (this.config.knowledge.maxKnowledgeChunks < 1 || this.config.knowledge.maxKnowledgeChunks > 10) {
      errors.push('Max knowledge chunks should be between 1 and 10')
    }

    // Validate response configuration
    if (this.config.response.maxLength < 100 || this.config.response.maxLength > 2000) {
      errors.push('Response max length should be between 100 and 2000')
    }

    // Validate handoff configuration
    if (this.config.handoff.lowConfidenceThreshold < 0 || this.config.handoff.lowConfidenceThreshold > 1) {
      errors.push('Handoff confidence threshold should be between 0 and 1')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  public getModelConfig(model?: string) {
    const selectedModel = model || this.config.openRouter.defaultModel
    
    // Model-specific configurations
    const modelConfigs = {
      'meta-llama/llama-3.2-3b-instruct:free': {
        maxTokens: 500,
        temperature: 0.7,
        contextWindow: 2048,
        strengths: ['general conversation', 'instruction following'],
        limitations: ['complex reasoning', 'very long contexts']
      },
      'meta-llama/llama-3.2-1b-instruct:free': {
        maxTokens: 400,
        temperature: 0.8,
        contextWindow: 1024,
        strengths: ['quick responses', 'simple tasks'],
        limitations: ['complex reasoning', 'detailed explanations']
      },
      'google/gemma-2-9b-it:free': {
        maxTokens: 600,
        temperature: 0.6,
        contextWindow: 4096,
        strengths: ['reasoning', 'detailed explanations'],
        limitations: ['creative writing', 'casual conversation']
      },
      'microsoft/phi-3-mini-128k-instruct:free': {
        maxTokens: 500,
        temperature: 0.7,
        contextWindow: 8192,
        strengths: ['long contexts', 'instruction following'],
        limitations: ['creative tasks', 'very casual tone']
      }
    }

    return modelConfigs[selectedModel] || modelConfigs[this.config.openRouter.defaultModel]
  }

  public getPromptTemplate(type: 'system' | 'user' | 'context'): string {
    const templates = {
      system: `You are EventTitan, an intelligent and helpful event management assistant. Your personality is ${this.config.response.personalityTone} and knowledgeable.

Your role:
- Help users with event planning questions using the provided knowledge base
- Provide accurate, helpful, and conversational responses
- Keep responses under ${this.config.response.maxLength} characters
- ${this.config.response.addEmojis ? 'Use emojis appropriately to make responses engaging' : 'Avoid using emojis'}
- ${this.config.response.includeFollowUps ? 'End with relevant follow-up questions when appropriate' : 'Focus on directly answering the question'}

Response format: ${this.config.response.responseFormat}`,

      user: `User question: {query}

Please provide a helpful response based on the knowledge provided.`,

      context: `Knowledge Base Information:
{knowledge}

${this.config.features.conversationMemory ? 'Previous conversation context:\n{history}' : ''}

Please use this information to answer the user's question accurately and helpfully.`
    }

    return templates[type]
  }

  private loadDefaultConfig(): LLMIntegrationConfig {
    return {
      openRouter: {
        apiKey: '',
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
        fallbackModels: [
          'meta-llama/llama-3.2-1b-instruct:free',
          'google/gemma-2-9b-it:free',
          'microsoft/phi-3-mini-128k-instruct:free'
        ],
        maxTokens: 500,
        temperature: 0.7,
        timeout: 30000,
        retryAttempts: 2,
        rateLimitPerMinute: 10
      },
      knowledge: {
        confidenceThreshold: 0.4,
        maxKnowledgeChunks: 3,
        contextWindowSize: 2000,
        searchTimeout: 5000,
        enableSemanticSearch: true,
        fallbackToBasicSearch: true
      },
      response: {
        maxLength: 500,
        includeFollowUps: true,
        includeSources: true,
        addEmojis: false,
        personalityTone: 'friendly',
        responseFormat: 'conversational'
      },
      handoff: {
        enabled: true,
        lowConfidenceThreshold: 0.3,
        autoHandoffEnabled: false,
        handoffKeywords: [
          'speak to human', 'talk to person', 'human agent', 'real person',
          'customer service', 'support agent', 'live chat', 'human help'
        ],
        complexityIndicators: [
          'custom', 'specific requirements', 'unique situation', 'complicated',
          'multiple events', 'large scale', 'corporate contract', 'legal'
        ]
      },
      performance: {
        enableCaching: true,
        cacheExpirationMinutes: 60,
        maxCacheSize: 100,
        logProcessingTime: true,
        enableMetrics: true,
        fallbackTimeout: 10000
      },
      features: {
        conversationMemory: false, // Start simple
        contextAwareness: true,
        multiTurnDialogue: false, // Start simple
        intentRecognition: true,
        entityExtraction: false // Start simple
      }
    }
  }

  private loadEnvironmentOverrides(): void {
    // OpenRouter configuration from environment
    if (process.env.OPENROUTER_API_KEY) {
      this.config.openRouter.apiKey = process.env.OPENROUTER_API_KEY
    }

    if (process.env.OPENROUTER_MODEL) {
      this.config.openRouter.defaultModel = process.env.OPENROUTER_MODEL
    }

    if (process.env.LLM_MAX_TOKENS) {
      this.config.openRouter.maxTokens = parseInt(process.env.LLM_MAX_TOKENS, 10)
    }

    if (process.env.LLM_TEMPERATURE) {
      this.config.openRouter.temperature = parseFloat(process.env.LLM_TEMPERATURE)
    }

    // Feature flags from environment
    if (process.env.LLM_ENABLE_CACHING === 'false') {
      this.config.performance.enableCaching = false
    }

    if (process.env.LLM_ENABLE_HANDOFF === 'false') {
      this.config.handoff.enabled = false
    }

    if (process.env.LLM_RESPONSE_TONE) {
      const tone = process.env.LLM_RESPONSE_TONE as 'professional' | 'friendly' | 'casual'
      if (['professional', 'friendly', 'casual'].includes(tone)) {
        this.config.response.personalityTone = tone
      }
    }

    // Performance settings
    if (process.env.LLM_CONFIDENCE_THRESHOLD) {
      this.config.knowledge.confidenceThreshold = parseFloat(process.env.LLM_CONFIDENCE_THRESHOLD)
    }

    if (process.env.LLM_HANDOFF_THRESHOLD) {
      this.config.handoff.lowConfidenceThreshold = parseFloat(process.env.LLM_HANDOFF_THRESHOLD)
    }
  }

  private mergeConfigs(base: LLMIntegrationConfig, updates: Partial<LLMIntegrationConfig>): LLMIntegrationConfig {
    const merged = { ...base }

    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key as keyof LLMIntegrationConfig] = {
          ...merged[key as keyof LLMIntegrationConfig],
          ...value
        } as any
      } else if (value !== undefined) {
        merged[key as keyof LLMIntegrationConfig] = value as any
      }
    }

    return merged
  }
}

// Export singleton instance
export const llmConfig = LLMConfigManager.getInstance()

// Export helper functions
export function validateLLMSetup(): { ready: boolean; issues: string[] } {
  const config = llmConfig.getConfig()
  const validation = llmConfig.validateConfig()
  
  const issues: string[] = [...validation.errors]
  
  // Check for API key
  if (!config.openRouter.apiKey) {
    issues.push('Set OPENROUTER_API_KEY environment variable with your OpenRouter API key')
  }
  
  // Check model availability
  const availableModels = [
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.2-1b-instruct:free',
    'google/gemma-2-9b-it:free',
    'microsoft/phi-3-mini-128k-instruct:free'
  ]
  
  if (!availableModels.includes(config.openRouter.defaultModel)) {
    issues.push(`Default model ${config.openRouter.defaultModel} may not be available for free tier`)
  }
  
  return {
    ready: issues.length === 0,
    issues
  }
}

export function getRecommendedSettings(): Partial<LLMIntegrationConfig> {
  return {
    openRouter: {
      defaultModel: 'meta-llama/llama-3.2-3b-instruct:free', // Good balance of capability and speed
      maxTokens: 400, // Conservative for free tier
      temperature: 0.7, // Good balance of creativity and consistency
      rateLimitPerMinute: 8 // Conservative rate limiting
    },
    knowledge: {
      confidenceThreshold: 0.5, // Higher threshold for better quality
      maxKnowledgeChunks: 2, // Reduce context size for free models
      contextWindowSize: 1500 // Smaller context for free models
    },
    response: {
      maxLength: 400, // Shorter responses for free models
      personalityTone: 'friendly',
      responseFormat: 'conversational'
    },
    performance: {
      enableCaching: true, // Important for free tier rate limits
      cacheExpirationMinutes: 120, // Longer cache for free tier
      fallbackTimeout: 8000 // Shorter timeout for free tier
    }
  }
}
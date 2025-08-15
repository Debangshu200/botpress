/**
 * GPT-OSS-20B Configuration
 * Specialized configuration for AtlasCloud's GPT-OSS-20B model via OpenRouter
 */

// Load environment variables
import { config } from 'dotenv'
import { resolve } from 'path'

// Try to load .env file from src directory
try {
  config({ path: resolve(__dirname, '.env') })
} catch (error) {
  // Fallback to default dotenv behavior
  config()
}

export interface GPTOss20BConfig {
  model: {
    name: string
    provider: string
    contextWindow: number
    maxTokens: number
    temperature: number
    topP: number
    frequencyPenalty: number
    presencePenalty: number
  }
  api: {
    baseUrl: string
    apiKey: string
    timeout: number
    retryAttempts: number
    retryDelay: number
  }
  rateLimiting: {
    requestsPerMinute: number
    tokensPerMinute: number
    burstLimit: number
  }
  optimization: {
    enableCaching: boolean
    cacheExpirationMinutes: number
    maxCacheSize: number
    enableBatching: boolean
    batchSize: number
  }
  prompting: {
    systemPromptTemplate: string
    userPromptTemplate: string
    maxPromptLength: number
    includeModelInstructions: boolean
  }
  fallback: {
    enabled: boolean
    fallbackModels: string[]
    fallbackThreshold: number
  }
}

export class GPTOss20BConfigManager {
  private static instance: GPTOss20BConfigManager
  private config: GPTOss20BConfig

  private constructor() {
    this.config = this.loadDefaultConfig()
    this.loadEnvironmentOverrides()
  }

  public static getInstance(): GPTOss20BConfigManager {
    if (!GPTOss20BConfigManager.instance) {
      GPTOss20BConfigManager.instance = new GPTOss20BConfigManager()
    }
    return GPTOss20BConfigManager.instance
  }

  public getConfig(): GPTOss20BConfig {
    return { ...this.config }
  }

  public updateConfig(updates: Partial<GPTOss20BConfig>): void {
    this.config = this.mergeConfigs(this.config, updates)
  }

  public validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate API configuration
    if (!this.config.api.apiKey) {
      errors.push('OpenRouter API key is required (set OPENROUTER_API_KEY environment variable)')
    }

    if (!this.config.api.baseUrl) {
      errors.push('Base URL is required')
    }

    // Validate model parameters
    if (this.config.model.maxTokens < 1 || this.config.model.maxTokens > 4096) {
      errors.push('Max tokens should be between 1 and 4096 for GPT-OSS-20B')
    }

    if (this.config.model.temperature < 0 || this.config.model.temperature > 2) {
      errors.push('Temperature should be between 0 and 2')
    }

    if (this.config.model.topP < 0 || this.config.model.topP > 1) {
      errors.push('Top P should be between 0 and 1')
    }

    // Validate rate limiting
    if (this.config.rateLimiting.requestsPerMinute < 1) {
      errors.push('Requests per minute should be at least 1')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  public getOptimizedRequestParams(prompt: string, context?: string): any {
    const config = this.config

    // Calculate optimal token allocation
    const promptTokens = this.estimateTokens(prompt)
    const contextTokens = context ? this.estimateTokens(context) : 0
    const totalInputTokens = promptTokens + contextTokens
    
    // Reserve tokens for response (leave buffer for model processing)
    const maxResponseTokens = Math.min(
      config.model.maxTokens,
      config.model.contextWindow - totalInputTokens - 100 // 100 token buffer
    )

    return {
      model: config.model.name,
      messages: this.buildMessages(prompt, context),
      max_tokens: Math.max(50, maxResponseTokens), // Minimum 50 tokens
      temperature: config.model.temperature,
      top_p: config.model.topP,
      frequency_penalty: config.model.frequencyPenalty,
      presence_penalty: config.model.presencePenalty,
      stream: false
    }
  }

  public getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.api.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/eventtitan-bot',
      'X-Title': 'EventTitan GPT-OSS-20B Integration'
    }
  }

  public isModelAvailable(): boolean {
    // Check if the model is in the free tier
    const freeModels = [
      'openai/gpt-oss-20b:free',
      'openai/gpt-oss-20b'
    ]
    
    return freeModels.some(model => 
      this.config.model.name.toLowerCase().includes(model.toLowerCase())
    )
  }

  public getModelCapabilities(): {
    strengths: string[]
    limitations: string[]
    bestUseCases: string[]
    tips: string[]
  } {
    return {
      strengths: [
        'Large parameter count (20B) for better understanding',
        'Good at following instructions',
        'Decent reasoning capabilities',
        'Free tier availability',
        'Reasonable context window'
      ],
      limitations: [
        'May have slower response times due to model size',
        'Free tier rate limits apply',
        'May not be as fast as smaller models',
        'Context window limitations compared to newer models'
      ],
      bestUseCases: [
        'Complex question answering',
        'Detailed explanations',
        'Event planning advice',
        'Multi-step reasoning tasks',
        'Content generation with context'
      ],
      tips: [
        'Use clear, specific prompts for best results',
        'Provide relevant context to improve responses',
        'Keep requests under rate limits',
        'Cache responses when possible',
        'Use fallback models for high-availability scenarios'
      ]
    }
  }

  private loadDefaultConfig(): GPTOss20BConfig {
    return {
      model: {
        name: 'openai/gpt-oss-20b:free', // OpenAI's GPT-OSS-20B free model
        provider: 'openai',
        contextWindow: 131072, // Large context window for GPT-OSS-20B
        maxTokens: 1024, // Conservative for free tier
        temperature: 0.7, // Balanced creativity/consistency
        topP: 0.9, // Good diversity
        frequencyPenalty: 0.0, // No penalty by default
        presencePenalty: 0.0 // No penalty by default
      },
      api: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '', // Will be loaded from environment
        timeout: 45000, // 45 seconds (larger model may be slower)
        retryAttempts: 3,
        retryDelay: 2000 // 2 seconds between retries
      },
      rateLimiting: {
        requestsPerMinute: 6, // Conservative for free tier
        tokensPerMinute: 6000, // Conservative token limit
        burstLimit: 3 // Allow small bursts
      },
      optimization: {
        enableCaching: true,
        cacheExpirationMinutes: 120, // 2 hours cache
        maxCacheSize: 50, // Smaller cache for free tier
        enableBatching: false, // Not typically supported in free tier
        batchSize: 1
      },
      prompting: {
        systemPromptTemplate: `You are EventTitan, an intelligent event management assistant powered by GPT-OSS-20B. 

Your capabilities:
- Provide detailed, helpful responses about event planning
- Use the knowledge base information when available
- Maintain a friendly, professional tone
- Give practical, actionable advice

Guidelines:
- Keep responses focused and relevant
- Use the provided context to give accurate information
- If unsure, acknowledge limitations
- Suggest follow-up questions when appropriate`,

        userPromptTemplate: `Context: {context}

User Question: {prompt}

Please provide a helpful, detailed response based on the context and your knowledge of event planning.`,

        maxPromptLength: 6000, // Leave room for response tokens
        includeModelInstructions: true
      },
      fallback: {
        enabled: true,
        fallbackModels: [
          'meta-llama/llama-3.2-3b-instruct:free',
          'google/gemma-2-9b-it:free',
          'microsoft/phi-3-mini-128k-instruct:free'
        ],
        fallbackThreshold: 3 // Fallback after 3 failures
      }
    }
  }

  private loadEnvironmentOverrides(): void {
    // Load API key from environment
    if (process.env.OPENROUTER_API_KEY) {
      this.config.api.apiKey = process.env.OPENROUTER_API_KEY
    }

    // Allow model override
    if (process.env.GPT_OSS_20B_MODEL) {
      this.config.model.name = process.env.GPT_OSS_20B_MODEL
    }

    // Allow parameter overrides
    if (process.env.GPT_OSS_20B_MAX_TOKENS) {
      this.config.model.maxTokens = parseInt(process.env.GPT_OSS_20B_MAX_TOKENS, 10)
    }

    if (process.env.GPT_OSS_20B_TEMPERATURE) {
      this.config.model.temperature = parseFloat(process.env.GPT_OSS_20B_TEMPERATURE)
    }

    if (process.env.GPT_OSS_20B_RATE_LIMIT) {
      this.config.rateLimiting.requestsPerMinute = parseInt(process.env.GPT_OSS_20B_RATE_LIMIT, 10)
    }

    // Timeout override
    if (process.env.GPT_OSS_20B_TIMEOUT) {
      this.config.api.timeout = parseInt(process.env.GPT_OSS_20B_TIMEOUT, 10)
    }
  }

  private mergeConfigs(base: GPTOss20BConfig, updates: Partial<GPTOss20BConfig>): GPTOss20BConfig {
    const merged = { ...base }

    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key as keyof GPTOss20BConfig] = {
          ...merged[key as keyof GPTOss20BConfig],
          ...value
        } as any
      } else if (value !== undefined) {
        merged[key as keyof GPTOss20BConfig] = value as any
      }
    }

    return merged
  }

  private buildMessages(prompt: string, context?: string): any[] {
    const messages = []

    // Add system message with context if available
    let systemContent = this.config.prompting.systemPromptTemplate

    if (context && this.config.prompting.includeModelInstructions) {
      systemContent += `\n\nKnowledge Base Context:\n${context}`
    }

    messages.push({
      role: 'system',
      content: systemContent
    })

    // Add user message
    messages.push({
      role: 'user',
      content: prompt
    })

    return messages
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4)
  }
}

// Export singleton instance
export const gptOss20BConfig = GPTOss20BConfigManager.getInstance()

// Export helper functions
export function validateGPTOss20BSetup(): { ready: boolean; issues: string[] } {
  const config = gptOss20BConfig.getConfig()
  const validation = gptOss20BConfig.validateConfig()
  
  const issues: string[] = [...validation.errors]
  
  // Check API key
  if (!config.api.apiKey) {
    issues.push('Set OPENROUTER_API_KEY environment variable with your OpenRouter API key')
  }
  
  // Check model availability
  if (!gptOss20BConfig.isModelAvailable()) {
    issues.push('GPT-OSS-20B model may not be available in free tier. Check OpenRouter documentation.')
  }
  
  return {
    ready: issues.length === 0,
    issues
  }
}

export function getGPTOss20BRecommendedSettings(): Partial<GPTOss20BConfig> {
  return {
    model: {
      name: 'gpt-oss-20b:free',
      maxTokens: 800, // Good balance for detailed responses
      temperature: 0.7, // Balanced creativity
      topP: 0.9,
      frequencyPenalty: 0.1, // Slight penalty to reduce repetition
      presencePenalty: 0.1 // Slight penalty to encourage variety
    },
    rateLimiting: {
      requestsPerMinute: 5, // Conservative for free tier
      tokensPerMinute: 4000,
      burstLimit: 2
    },
    optimization: {
      enableCaching: true,
      cacheExpirationMinutes: 180, // 3 hours for better cache utilization
      maxCacheSize: 30
    }
  }
}

// Model-specific prompt optimization
export function optimizePromptForGPTOss20B(prompt: string, context?: string): {
  optimizedPrompt: string
  estimatedTokens: number
  recommendations: string[]
} {
  const config = gptOss20BConfig.getConfig()
  const recommendations: string[] = []
  
  let optimizedPrompt = prompt

  // Ensure prompt is clear and specific
  if (prompt.length < 20) {
    recommendations.push('Consider providing more specific details in your question')
  }

  // Check prompt length
  const estimatedTokens = Math.ceil(prompt.length / 4) + (context ? Math.ceil(context.length / 4) : 0)
  
  if (estimatedTokens > config.prompting.maxPromptLength / 4) {
    recommendations.push('Prompt may be too long, consider shortening for better performance')
  }

  // Add context-aware instructions for event planning
  if (prompt.toLowerCase().includes('event') || prompt.toLowerCase().includes('planning')) {
    optimizedPrompt = `Event Planning Question: ${prompt}\n\nPlease provide a detailed, practical response with specific recommendations.`
  }

  return {
    optimizedPrompt,
    estimatedTokens,
    recommendations
  }
}
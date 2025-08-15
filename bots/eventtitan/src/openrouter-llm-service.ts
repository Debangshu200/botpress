/**
 * OpenRouter LLM Service
 * Handles communication with OpenRouter's free LLM API
 */

export interface LLMRequest {
  prompt: string
  context?: string
  maxTokens?: number
  temperature?: number
  model?: string
}

export interface LLMResponse {
  content: string
  model: string
  tokensUsed: number
  processingTime: number
  success: boolean
  error?: string
}

export interface LLMConfig {
  apiKey: string
  baseUrl: string
  defaultModel: string
  maxTokens: number
  temperature: number
  timeout: number
  retryAttempts: number
}

export class OpenRouterLLMService {
  private config: LLMConfig
  private requestCache: Map<string, { response: LLMResponse; timestamp: number }>
  private rateLimiter: { requests: number; resetTime: number }

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'meta-llama/llama-3.2-3b-instruct:free',
      maxTokens: 500,
      temperature: 0.7,
      timeout: 30000,
      retryAttempts: 2,
      ...config
    }

    this.requestCache = new Map()
    this.rateLimiter = { requests: 0, resetTime: Date.now() + 60000 }

    if (!this.config.apiKey) {
      console.warn('OpenRouterLLMService: No API key provided. Set OPENROUTER_API_KEY environment variable.')
    }
  }

  /**
   * Generate response using OpenRouter LLM
   */
  async generateResponse(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now()

    try {
      // Check rate limiting
      if (!this.checkRateLimit()) {
        return {
          content: '',
          model: request.model || this.config.defaultModel,
          tokensUsed: 0,
          processingTime: Date.now() - startTime,
          success: false,
          error: 'Rate limit exceeded. Please try again later.'
        }
      }

      // Check cache first
      const cacheKey = this.generateCacheKey(request)
      const cached = this.getCachedResponse(cacheKey)
      if (cached) {
        return {
          ...cached,
          processingTime: Date.now() - startTime
        }
      }

      // Prepare the request
      const llmRequest = this.prepareRequest(request)
      
      // Make API call with retry logic
      const response = await this.makeAPICall(llmRequest)
      
      // Process response
      const llmResponse = this.processResponse(response, request.model || this.config.defaultModel, startTime)
      
      // Cache successful responses
      if (llmResponse.success) {
        this.cacheResponse(cacheKey, llmResponse)
      }

      return llmResponse

    } catch (error) {
      console.error('OpenRouterLLMService: Error generating response:', error)
      return {
        content: '',
        model: request.model || this.config.defaultModel,
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }
  }

  /**
   * Get available free models
   */
  getAvailableFreeModels(): string[] {
    return [
      'meta-llama/llama-3.2-3b-instruct:free',
      'meta-llama/llama-3.2-1b-instruct:free',
      'google/gemma-2-9b-it:free',
      'microsoft/phi-3-mini-128k-instruct:free',
      'huggingface/zephyr-7b-beta:free'
    ]
  }

  /**
   * Test connection to OpenRouter
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const testResponse = await this.generateResponse({
        prompt: 'Hello, please respond with "Connection successful"',
        maxTokens: 50,
        temperature: 0.1
      })

      return {
        success: testResponse.success,
        error: testResponse.error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }

  // Private methods

  private checkRateLimit(): boolean {
    const now = Date.now()
    
    // Reset counter if time window has passed
    if (now > this.rateLimiter.resetTime) {
      this.rateLimiter.requests = 0
      this.rateLimiter.resetTime = now + 60000 // 1 minute window
    }

    // Check if we're under the limit (conservative limit for free tier)
    if (this.rateLimiter.requests >= 10) {
      return false
    }

    this.rateLimiter.requests++
    return true
  }

  private generateCacheKey(request: LLMRequest): string {
    const key = `${request.prompt}_${request.context || ''}_${request.maxTokens || this.config.maxTokens}_${request.temperature || this.config.temperature}`
    return Buffer.from(key).toString('base64').substring(0, 50)
  }

  private getCachedResponse(cacheKey: string): LLMResponse | null {
    const cached = this.requestCache.get(cacheKey)
    if (!cached) return null

    // Cache expires after 1 hour
    if (Date.now() - cached.timestamp > 3600000) {
      this.requestCache.delete(cacheKey)
      return null
    }

    return cached.response
  }

  private cacheResponse(cacheKey: string, response: LLMResponse): void {
    // Limit cache size
    if (this.requestCache.size >= 100) {
      const oldestKey = this.requestCache.keys().next().value
      this.requestCache.delete(oldestKey)
    }

    this.requestCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    })
  }

  private prepareRequest(request: LLMRequest): any {
    const messages = []

    // Add system message if context is provided
    if (request.context) {
      messages.push({
        role: 'system',
        content: request.context
      })
    }

    // Add user message
    messages.push({
      role: 'user',
      content: request.prompt
    })

    return {
      model: request.model || this.config.defaultModel,
      messages,
      max_tokens: request.maxTokens || this.config.maxTokens,
      temperature: request.temperature || this.config.temperature,
      stream: false
    }
  }

  private async makeAPICall(requestData: any): Promise<any> {
    const headers = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/your-repo', // Required by OpenRouter
      'X-Title': 'EventTitan Bot' // Optional but recommended
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        return await response.json()

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < this.config.retryAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    throw lastError
  }

  private processResponse(apiResponse: any, model: string, startTime: number): LLMResponse {
    try {
      const choice = apiResponse.choices?.[0]
      if (!choice) {
        throw new Error('No response choices received')
      }

      const content = choice.message?.content || ''
      const tokensUsed = apiResponse.usage?.total_tokens || 0

      return {
        content: content.trim(),
        model,
        tokensUsed,
        processingTime: Date.now() - startTime,
        success: true
      }

    } catch (error) {
      return {
        content: '',
        model,
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process response'
      }
    }
  }
}
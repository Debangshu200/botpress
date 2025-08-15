/**
 * GPT-OSS-20B Service
 * Specialized service for AtlasCloud's GPT-OSS-20B model via OpenRouter
 */

import { gptOss20BConfig, validateGPTOss20BSetup, optimizePromptForGPTOss20B } from './gpt-oss-20b-config'

export interface GPTOss20BRequest {
  prompt: string
  context?: string
  maxTokens?: number
  temperature?: number
  useOptimization?: boolean
}

export interface GPTOss20BResponse {
  content: string
  model: string
  tokensUsed: number
  processingTime: number
  success: boolean
  error?: string
  cached?: boolean
  optimizationApplied?: boolean
  recommendations?: string[]
}

export class GPTOss20BService {
  private requestCache: Map<string, { response: GPTOss20BResponse; timestamp: number }>
  private rateLimiter: { requests: number; resetTime: number; tokens: number }
  private failureCount: number
  private lastFailureTime: number

  constructor() {
    this.requestCache = new Map()
    this.rateLimiter = { 
      requests: 0, 
      resetTime: Date.now() + 60000,
      tokens: 0
    }
    this.failureCount = 0
    this.lastFailureTime = 0

    // Validate setup on initialization
    const validation = validateGPTOss20BSetup()
    if (!validation.ready) {
      console.warn('GPT-OSS-20B Service: Setup issues detected:', validation.issues)
    }
  }

  /**
   * Generate response using GPT-OSS-20B model
   */
  async generateResponse(request: GPTOss20BRequest): Promise<GPTOss20BResponse> {
    const startTime = Date.now()
    const config = gptOss20BConfig.getConfig()

    try {
      // Check if we should use fallback due to recent failures
      if (this.shouldUseFallback()) {
        return await this.generateFallbackResponse(request, startTime)
      }

      // Check rate limiting
      if (!this.checkRateLimit(request.maxTokens || config.model.maxTokens)) {
        return {
          content: '',
          model: config.model.name,
          tokensUsed: 0,
          processingTime: Date.now() - startTime,
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          cached: false
        }
      }

      // Optimize prompt if requested
      let optimizedPrompt = request.prompt
      let recommendations: string[] = []
      
      if (request.useOptimization !== false) {
        const optimization = optimizePromptForGPTOss20B(request.prompt, request.context)
        optimizedPrompt = optimization.optimizedPrompt
        recommendations = optimization.recommendations
      }

      // Check cache first
      const cacheKey = this.generateCacheKey({
        ...request,
        prompt: optimizedPrompt
      })
      
      const cached = this.getCachedResponse(cacheKey)
      if (cached) {
        return {
          ...cached,
          processingTime: Date.now() - startTime,
          cached: true,
          recommendations
        }
      }

      // Prepare the API request
      const apiRequest = gptOss20BConfig.getOptimizedRequestParams(optimizedPrompt, request.context)
      
      // Override with request-specific parameters
      if (request.maxTokens) {
        apiRequest.max_tokens = Math.min(request.maxTokens, config.model.maxTokens)
      }
      if (request.temperature !== undefined) {
        apiRequest.temperature = request.temperature
      }

      // Make API call with retry logic
      const response = await this.makeAPICall(apiRequest)
      
      // Process response
      const llmResponse = this.processResponse(
        response, 
        config.model.name, 
        startTime,
        request.useOptimization !== false,
        recommendations
      )
      
      // Cache successful responses
      if (llmResponse.success) {
        this.cacheResponse(cacheKey, llmResponse)
        this.resetFailureCount()
      } else {
        this.incrementFailureCount()
      }

      return llmResponse

    } catch (error) {
      console.error('GPT-OSS-20B Service: Error generating response:', error)
      this.incrementFailureCount()
      
      return {
        content: '',
        model: config.model.name,
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        cached: false
      }
    }
  }

  /**
   * Test connection to GPT-OSS-20B model
   */
  async testConnection(): Promise<{ success: boolean; error?: string; modelInfo?: any }> {
    try {
      const testResponse = await this.generateResponse({
        prompt: 'Hello! Please respond with "GPT-OSS-20B connection successful" to confirm you are working.',
        maxTokens: 50,
        temperature: 0.1,
        useOptimization: false
      })

      const modelInfo = gptOss20BConfig.getModelCapabilities()

      return {
        success: testResponse.success,
        error: testResponse.error,
        modelInfo: testResponse.success ? modelInfo : undefined
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed'
      }
    }
  }

  /**
   * Get service status and statistics
   */
  getServiceStatus(): {
    modelName: string
    isConfigured: boolean
    rateLimitStatus: { requests: number; tokens: number; resetTime: number }
    cacheStatus: { size: number; maxSize: number }
    failureStatus: { count: number; lastFailure: number }
    capabilities: any
  } {
    const config = gptOss20BConfig.getConfig()
    const validation = validateGPTOss20BSetup()

    return {
      modelName: config.model.name,
      isConfigured: validation.ready,
      rateLimitStatus: {
        requests: this.rateLimiter.requests,
        tokens: this.rateLimiter.tokens,
        resetTime: this.rateLimiter.resetTime
      },
      cacheStatus: {
        size: this.requestCache.size,
        maxSize: config.optimization.maxCacheSize
      },
      failureStatus: {
        count: this.failureCount,
        lastFailure: this.lastFailureTime
      },
      capabilities: gptOss20BConfig.getModelCapabilities()
    }
  }

  /**
   * Clear cache and reset rate limiter
   */
  reset(): void {
    this.requestCache.clear()
    this.rateLimiter = { 
      requests: 0, 
      resetTime: Date.now() + 60000,
      tokens: 0
    }
    this.failureCount = 0
    this.lastFailureTime = 0
  }

  // Private methods

  private checkRateLimit(estimatedTokens: number): boolean {
    const config = gptOss20BConfig.getConfig()
    const now = Date.now()
    
    // Reset counters if time window has passed
    if (now > this.rateLimiter.resetTime) {
      this.rateLimiter.requests = 0
      this.rateLimiter.tokens = 0
      this.rateLimiter.resetTime = now + 60000 // 1 minute window
    }

    // Check request limit
    if (this.rateLimiter.requests >= config.rateLimiting.requestsPerMinute) {
      return false
    }

    // Check token limit
    if (this.rateLimiter.tokens + estimatedTokens > config.rateLimiting.tokensPerMinute) {
      return false
    }

    // Check burst limit
    const recentRequests = this.rateLimiter.requests
    if (recentRequests >= config.rateLimiting.burstLimit && 
        now - (this.rateLimiter.resetTime - 60000) < 10000) { // Within last 10 seconds
      return false
    }

    this.rateLimiter.requests++
    this.rateLimiter.tokens += estimatedTokens
    return true
  }

  private generateCacheKey(request: GPTOss20BRequest): string {
    const keyData = {
      prompt: request.prompt,
      context: request.context || '',
      maxTokens: request.maxTokens || 0,
      temperature: request.temperature || 0
    }
    
    const key = JSON.stringify(keyData)
    return Buffer.from(key).toString('base64').substring(0, 64)
  }

  private getCachedResponse(cacheKey: string): GPTOss20BResponse | null {
    const config = gptOss20BConfig.getConfig()
    const cached = this.requestCache.get(cacheKey)
    
    if (!cached) return null

    // Check if cache has expired
    const expirationTime = config.optimization.cacheExpirationMinutes * 60 * 1000
    if (Date.now() - cached.timestamp > expirationTime) {
      this.requestCache.delete(cacheKey)
      return null
    }

    return cached.response
  }

  private cacheResponse(cacheKey: string, response: GPTOss20BResponse): void {
    const config = gptOss20BConfig.getConfig()
    
    if (!config.optimization.enableCaching) return

    // Limit cache size
    if (this.requestCache.size >= config.optimization.maxCacheSize) {
      const oldestKey = this.requestCache.keys().next().value
      this.requestCache.delete(oldestKey)
    }

    this.requestCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    })
  }

  private async makeAPICall(requestData: any): Promise<any> {
    const config = gptOss20BConfig.getConfig()
    const headers = gptOss20BConfig.getHeaders()

    // Diagnostic logging
    console.log('🔍 GPT-OSS-20B API Request Diagnostics:')
    console.log('URL:', `${config.api.baseUrl}/chat/completions`)
    console.log('Headers:', JSON.stringify(headers, null, 2))
    console.log('Request payload:', JSON.stringify(requestData, null, 2))

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.api.retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), config.api.timeout)

        const response = await fetch(`${config.api.baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestData),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          console.log('❌ API Error Response:', errorText)
          console.log('❌ Response Status:', response.status)
          console.log('❌ Response Headers:', Object.fromEntries(response.headers.entries()))
          
          let errorMessage = `HTTP ${response.status}: ${errorText}`
          
          // Handle specific OpenRouter errors
          if (response.status === 402) {
            errorMessage = 'Insufficient credits or model not available in free tier'
          } else if (response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait before making another request.'
          } else if (response.status === 400) {
            errorMessage = 'Invalid request parameters. Check model name and parameters.'
          } else if (response.status === 404) {
            errorMessage = `Model not found or not available. Tried model: ${requestData.model}. ${errorText}`
          }
          
          throw new Error(errorMessage)
        }

        return await response.json()

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        if (attempt < config.api.retryAttempts) {
          // Wait before retry with exponential backoff
          const delay = config.api.retryDelay * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError
  }

  private processResponse(
    apiResponse: any, 
    model: string, 
    startTime: number,
    optimizationApplied: boolean,
    recommendations: string[]
  ): GPTOss20BResponse {
    try {
      const choice = apiResponse.choices?.[0]
      if (!choice) {
        throw new Error('No response choices received from GPT-OSS-20B')
      }

      const content = choice.message?.content || ''
      const tokensUsed = apiResponse.usage?.total_tokens || 0

      return {
        content: content.trim(),
        model,
        tokensUsed,
        processingTime: Date.now() - startTime,
        success: true,
        cached: false,
        optimizationApplied,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      }

    } catch (error) {
      return {
        content: '',
        model,
        tokensUsed: 0,
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process GPT-OSS-20B response',
        cached: false,
        optimizationApplied,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      }
    }
  }

  private shouldUseFallback(): boolean {
    const config = gptOss20BConfig.getConfig()
    
    if (!config.fallback.enabled) return false
    
    // Use fallback if we've had too many recent failures
    if (this.failureCount >= config.fallback.fallbackThreshold) {
      // Reset after 5 minutes
      if (Date.now() - this.lastFailureTime > 300000) {
        this.resetFailureCount()
        return false
      }
      return true
    }
    
    return false
  }

  private async generateFallbackResponse(request: GPTOss20BRequest, startTime: number): Promise<GPTOss20BResponse> {
    const config = gptOss20BConfig.getConfig()
    
    // Try fallback models in order
    for (const fallbackModel of config.fallback.fallbackModels) {
      try {
        // Use the existing OpenRouter service with fallback model
        const { OpenRouterLLMService } = await import('./openrouter-llm-service')
        const fallbackService = new OpenRouterLLMService({
          defaultModel: fallbackModel
        })
        
        const fallbackResponse = await fallbackService.generateResponse({
          prompt: request.prompt,
          context: request.context,
          maxTokens: request.maxTokens,
          temperature: request.temperature
        })
        
        if (fallbackResponse.success) {
          return {
            ...fallbackResponse,
            model: `${fallbackModel} (fallback)`,
            processingTime: Date.now() - startTime,
            cached: false,
            optimizationApplied: false,
            recommendations: ['Using fallback model due to GPT-OSS-20B unavailability']
          }
        }
      } catch (error) {
        console.warn(`Fallback model ${fallbackModel} also failed:`, error)
        continue
      }
    }
    
    return {
      content: '',
      model: 'fallback-failed',
      tokensUsed: 0,
      processingTime: Date.now() - startTime,
      success: false,
      error: 'All fallback models failed',
      cached: false
    }
  }

  private incrementFailureCount(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
  }

  private resetFailureCount(): void {
    this.failureCount = 0
    this.lastFailureTime = 0
  }
}

// Export singleton instance
export const gptOss20BService = new GPTOss20BService()
/**
 * Knowledge Response Refinement Configuration
 * Centralized configuration for response refinement behavior
 */

export interface KnowledgeRefinementConfig {
  // Response length settings
  maxLines: number
  maxCharacters: number
  targetLines: number
  
  // Content cleaning settings
  removeFileNames: boolean
  removeSources: boolean
  removeReferences: boolean
  cleanExtraWhitespace: boolean
  
  // Enhancement settings
  addEmojis: boolean
  includeFollowUp: boolean
  useContextualEmojis: boolean
  
  // AI refinement settings
  aiRefinementEnabled: boolean
  temperature: number
  maxTokens: number
  model: string
  
  // Fallback settings
  fallbackToManual: boolean
  manualRefinementEnabled: boolean
  
  // Quality settings
  minimumContentLength: number
  maximumContentLength: number
  confidenceThreshold: number
}

export const DEFAULT_REFINEMENT_CONFIG: KnowledgeRefinementConfig = {
  // Response length settings - aim for 3-4 concise lines
  maxLines: 4,
  maxCharacters: 350,
  targetLines: 3,
  
  // Content cleaning settings - remove all file references
  removeFileNames: true,
  removeSources: true,
  removeReferences: true,
  cleanExtraWhitespace: true,
  
  // Enhancement settings - make responses engaging
  addEmojis: true,
  includeFollowUp: true,
  useContextualEmojis: true,
  
  // AI refinement settings - use GPT for intelligent summarization
  aiRefinementEnabled: true,
  temperature: 0.3, // Lower temperature for more focused responses
  maxTokens: 150, // Limit to ensure conciseness
  model: 'gpt-3.5-turbo-0125',
  
  // Fallback settings - ensure we always provide a response
  fallbackToManual: true,
  manualRefinementEnabled: true,
  
  // Quality settings - ensure responses are useful
  minimumContentLength: 50,
  maximumContentLength: 400,
  confidenceThreshold: 0.6
}

export const TOPIC_SPECIFIC_CONFIGS: Record<string, Partial<KnowledgeRefinementConfig>> = {
  'wedding': {
    addEmojis: true,
    useContextualEmojis: true,
    maxLines: 3,
    includeFollowUp: true
  },
  
  'venue': {
    maxLines: 4,
    includeFollowUp: true,
    targetLines: 3
  },
  
  'budget': {
    addEmojis: true,
    maxLines: 3,
    includeFollowUp: false // Budget info is usually straightforward
  },
  
  'corporate': {
    addEmojis: false, // More professional tone
    maxLines: 4,
    includeFollowUp: true
  },
  
  'catering': {
    maxLines: 3,
    addEmojis: true,
    includeFollowUp: true
  }
}

export class KnowledgeRefinementConfigManager {
  private config: KnowledgeRefinementConfig

  constructor(initialConfig?: Partial<KnowledgeRefinementConfig>) {
    this.config = { ...DEFAULT_REFINEMENT_CONFIG, ...initialConfig }
  }

  /**
   * Get configuration for a specific topic
   */
  getConfigForTopic(topic: string): KnowledgeRefinementConfig {
    const topicConfig = TOPIC_SPECIFIC_CONFIGS[topic.toLowerCase()]
    return { ...this.config, ...topicConfig }
  }

  /**
   * Get the current configuration
   */
  getConfig(): KnowledgeRefinementConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<KnowledgeRefinementConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.config = { ...DEFAULT_REFINEMENT_CONFIG }
  }

  /**
   * Get configuration for development/testing
   */
  getTestConfig(): KnowledgeRefinementConfig {
    return {
      ...this.config,
      aiRefinementEnabled: false, // Use manual refinement for consistent testing
      addEmojis: false,
      includeFollowUp: false,
      maxLines: 2,
      maxCharacters: 200
    }
  }

  /**
   * Get configuration for production
   */
  getProductionConfig(): KnowledgeRefinementConfig {
    return {
      ...this.config,
      aiRefinementEnabled: true,
      fallbackToManual: true,
      confidenceThreshold: 0.7, // Higher threshold for production
      maxTokens: 120 // Slightly more conservative for production
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: Partial<KnowledgeRefinementConfig>): string[] {
    const errors: string[] = []

    if (config.maxLines && config.maxLines < 1) {
      errors.push('maxLines must be at least 1')
    }

    if (config.maxCharacters && config.maxCharacters < 50) {
      errors.push('maxCharacters must be at least 50')
    }

    if (config.temperature && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('temperature must be between 0 and 2')
    }

    if (config.maxTokens && config.maxTokens < 50) {
      errors.push('maxTokens must be at least 50')
    }

    if (config.confidenceThreshold && (config.confidenceThreshold < 0 || config.confidenceThreshold > 1)) {
      errors.push('confidenceThreshold must be between 0 and 1')
    }

    return errors
  }
}

// Export a default instance
export const refinementConfigManager = new KnowledgeRefinementConfigManager()

// Utility function to detect topic from query
export function detectTopicFromQuery(query: string): string {
  const queryLower = query.toLowerCase()
  
  const topicKeywords = {
    'wedding': ['wedding', 'bride', 'groom', 'marriage', 'ceremony'],
    'venue': ['venue', 'location', 'place', 'hall', 'space'],
    'budget': ['budget', 'cost', 'price', 'money', 'expense'],
    'corporate': ['corporate', 'business', 'company', 'professional'],
    'catering': ['catering', 'food', 'menu', 'dining', 'meal']
  }
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      return topic
    }
  }
  
  return 'general'
}
/**
 * Configuration Manager
 * Manages system configuration for confidence thresholds and handoff settings
 */

export interface SystemConfiguration {
  knowledge: KnowledgeConfiguration
  handoff: HandoffConfiguration
  routing: RoutingConfiguration
  processing: ProcessingConfiguration
}

export interface KnowledgeConfiguration {
  confidenceThreshold: number
  searchTimeout: number
  maxResults: number
  semanticSimilarityWeight: number
  keywordMatchWeight: number
  qualityWeight: number
  coverageWeight: number
  maxRetries: number
  retryDelay: number
  maxRetryDelay: number
}

export interface HandoffConfiguration {
  enabled: boolean
  agentTimeout: number
  queueLimit: number
  autoHandoffThreshold: number
  recordConversations: boolean
  notifyUser: boolean
}

export interface RoutingConfiguration {
  confidenceThreshold: number
  clarificationThreshold: number
  maxSearchResults: number
  responseTimeout: number
  fallbackEnabled: boolean
}

export interface ProcessingConfiguration {
  maxQueryLength: number
  enableLogging: boolean
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  performanceTracking: boolean
  cacheEnabled: boolean
  cacheTimeout: number
}

export interface ConfigurationUpdate {
  section: keyof SystemConfiguration
  updates: Partial<SystemConfiguration[keyof SystemConfiguration]>
  reason?: string
  updatedBy?: string
  timestamp?: Date
}

export interface ConfigurationValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export class ConfigurationManager {
  private config: SystemConfiguration
  private readonly defaultConfig: SystemConfiguration
  private updateHistory: ConfigurationUpdate[] = []

  constructor(initialConfig?: Partial<SystemConfiguration>) {
    this.defaultConfig = this.getDefaultConfiguration()
    this.config = this.mergeConfigurations(this.defaultConfig, initialConfig || {})
    this.validateConfiguration()
  }

  /**
   * Get current configuration
   */
  getConfiguration(): SystemConfiguration {
    return JSON.parse(JSON.stringify(this.config)) // Deep copy
  }

  /**
   * Get specific configuration section
   */
  getSection<T extends keyof SystemConfiguration>(section: T): SystemConfiguration[T] {
    return JSON.parse(JSON.stringify(this.config[section])) // Deep copy
  }

  /**
   * Update configuration section
   */
  updateConfiguration(update: ConfigurationUpdate): ConfigurationValidation {
    const validation = this.validateUpdate(update)
    
    if (!validation.isValid) {
      return validation
    }

    // Apply the update
    const oldValue = { ...this.config[update.section] }
    this.config[update.section] = {
      ...this.config[update.section],
      ...update.updates
    } as any

    // Record the update
    const recordedUpdate: ConfigurationUpdate = {
      ...update,
      timestamp: new Date()
    }
    this.updateHistory.push(recordedUpdate)

    // Keep only last 50 updates
    if (this.updateHistory.length > 50) {
      this.updateHistory = this.updateHistory.slice(-50)
    }

    return validation
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.config = JSON.parse(JSON.stringify(this.defaultConfig))
    this.updateHistory.push({
      section: 'knowledge', // Placeholder
      updates: {},
      reason: 'Reset to defaults',
      timestamp: new Date()
    })
  }

  /**
   * Get configuration update history
   */
  getUpdateHistory(): ConfigurationUpdate[] {
    return [...this.updateHistory]
  }

  /**
   * Validate current configuration
   */
  validateConfiguration(): ConfigurationValidation {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate knowledge configuration
    const knowledge = this.config.knowledge
    if (knowledge.confidenceThreshold < 0 || knowledge.confidenceThreshold > 1) {
      errors.push('Knowledge confidence threshold must be between 0 and 1')
    }
    if (knowledge.searchTimeout < 100) {
      warnings.push('Search timeout below 100ms may cause performance issues')
    }
    if (knowledge.maxResults < 1 || knowledge.maxResults > 20) {
      errors.push('Max results must be between 1 and 20')
    }
    if (knowledge.maxRetries < 0 || knowledge.maxRetries > 10) {
      errors.push('Max retries must be between 0 and 10')
    }
    if (knowledge.retryDelay < 100) {
      warnings.push('Retry delay below 100ms may cause excessive retry attempts')
    }
    if (knowledge.maxRetryDelay < knowledge.retryDelay) {
      errors.push('Max retry delay must be greater than or equal to retry delay')
    }

    // Validate handoff configuration
    const handoff = this.config.handoff
    if (handoff.autoHandoffThreshold < 0 || handoff.autoHandoffThreshold > 1) {
      errors.push('Auto handoff threshold must be between 0 and 1')
    }
    if (handoff.agentTimeout < 1000) {
      warnings.push('Agent timeout below 1 second may cause connection issues')
    }
    if (handoff.queueLimit < 1) {
      errors.push('Queue limit must be at least 1')
    }

    // Validate routing configuration
    const routing = this.config.routing
    if (routing.confidenceThreshold < 0 || routing.confidenceThreshold > 1) {
      errors.push('Routing confidence threshold must be between 0 and 1')
    }
    if (routing.clarificationThreshold < 0 || routing.clarificationThreshold > 1) {
      errors.push('Clarification threshold must be between 0 and 1')
    }
    if (routing.clarificationThreshold >= routing.confidenceThreshold) {
      warnings.push('Clarification threshold should be lower than confidence threshold')
    }

    // Validate processing configuration
    const processing = this.config.processing
    if (processing.maxQueryLength < 10) {
      warnings.push('Max query length below 10 characters may be too restrictive')
    }
    if (processing.cacheTimeout < 60000) {
      warnings.push('Cache timeout below 1 minute may cause excessive cache invalidation')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Get optimized configuration for specific use cases
   */
  getOptimizedConfiguration(useCase: 'high_accuracy' | 'fast_response' | 'balanced'): Partial<SystemConfiguration> {
    switch (useCase) {
      case 'high_accuracy':
        return {
          knowledge: {
            ...this.config.knowledge,
            confidenceThreshold: 0.8,
            searchTimeout: 5000,
            maxResults: 10
          },
          routing: {
            ...this.config.routing,
            confidenceThreshold: 0.8,
            clarificationThreshold: 0.6
          }
        }

      case 'fast_response':
        return {
          knowledge: {
            ...this.config.knowledge,
            confidenceThreshold: 0.5,
            searchTimeout: 1000,
            maxResults: 3
          },
          routing: {
            ...this.config.routing,
            confidenceThreshold: 0.5,
            clarificationThreshold: 0.3,
            responseTimeout: 2000
          }
        }

      case 'balanced':
        return this.defaultConfig

      default:
        return this.config
    }
  }

  /**
   * Export configuration for backup
   */
  exportConfiguration(): string {
    return JSON.stringify({
      config: this.config,
      updateHistory: this.updateHistory,
      exportedAt: new Date().toISOString()
    }, null, 2)
  }

  /**
   * Import configuration from backup
   */
  importConfiguration(configJson: string): ConfigurationValidation {
    try {
      const imported = JSON.parse(configJson)
      
      if (!imported.config) {
        return {
          isValid: false,
          errors: ['Invalid configuration format: missing config section'],
          warnings: []
        }
      }

      const tempConfig = this.mergeConfigurations(this.defaultConfig, imported.config)
      const validation = this.validateImportedConfiguration(tempConfig)
      
      if (validation.isValid) {
        this.config = tempConfig
        if (imported.updateHistory && Array.isArray(imported.updateHistory)) {
          this.updateHistory = imported.updateHistory
        }
      }

      return validation
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      }
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): SystemConfiguration {
    return {
      knowledge: {
        confidenceThreshold: 0.6,
        searchTimeout: 3000,
        maxResults: 5,
        semanticSimilarityWeight: 0.4,
        keywordMatchWeight: 0.3,
        qualityWeight: 0.2,
        coverageWeight: 0.1,
        maxRetries: 3,
        retryDelay: 1000,
        maxRetryDelay: 10000
      },
      handoff: {
        enabled: true,
        agentTimeout: 30000,
        queueLimit: 10,
        autoHandoffThreshold: 0.3,
        recordConversations: true,
        notifyUser: true
      },
      routing: {
        confidenceThreshold: 0.6,
        clarificationThreshold: 0.4,
        maxSearchResults: 5,
        responseTimeout: 5000,
        fallbackEnabled: true
      },
      processing: {
        maxQueryLength: 500,
        enableLogging: true,
        logLevel: 'info',
        performanceTracking: true,
        cacheEnabled: true,
        cacheTimeout: 300000 // 5 minutes
      }
    }
  }

  /**
   * Merge configurations with deep merge
   */
  private mergeConfigurations(
    base: SystemConfiguration, 
    override: Partial<SystemConfiguration>
  ): SystemConfiguration {
    const result = JSON.parse(JSON.stringify(base))
    
    Object.keys(override).forEach(key => {
      const section = key as keyof SystemConfiguration
      if (override[section]) {
        result[section] = {
          ...result[section],
          ...override[section]
        }
      }
    })

    return result
  }

  /**
   * Validate configuration update
   */
  private validateUpdate(update: ConfigurationUpdate): ConfigurationValidation {
    const errors: string[] = []
    const warnings: string[] = []

    if (!update.section || !this.config[update.section]) {
      errors.push(`Invalid configuration section: ${update.section}`)
      return { isValid: false, errors, warnings }
    }

    if (!update.updates || Object.keys(update.updates).length === 0) {
      errors.push('No updates provided')
      return { isValid: false, errors, warnings }
    }

    // Create temporary config to validate
    const tempConfig = { ...this.config }
    tempConfig[update.section] = {
      ...tempConfig[update.section],
      ...update.updates
    } as any

    return this.validateImportedConfiguration(tempConfig)
  }

  /**
   * Validate imported configuration
   */
  private validateImportedConfiguration(config: SystemConfiguration): ConfigurationValidation {
    const tempManager = new ConfigurationManager()
    tempManager.config = config
    return tempManager.validateConfiguration()
  }
}
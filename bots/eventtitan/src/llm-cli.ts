#!/usr/bin/env node
/**
 * LLM Integration CLI Tool
 * Command-line interface for testing and configuring LLM integration
 */

import { LLMEnhancedMessageProcessor } from './llm-enhanced-message-processor'
import { llmConfig, validateLLMSetup, getRecommendedSettings } from './llm-config'
import { LLMIntegrationTester } from './test-llm-integration'

interface CLICommand {
  name: string
  description: string
  action: () => Promise<void>
}

class LLMIntegrationCLI {
  private processor: LLMEnhancedMessageProcessor

  constructor() {
    this.processor = new LLMEnhancedMessageProcessor()
  }

  async run(): Promise<void> {
    const args = process.argv.slice(2)
    const command = args[0]

    const commands: CLICommand[] = [
      {
        name: 'test',
        description: 'Run comprehensive LLM integration tests',
        action: () => this.runTests()
      },
      {
        name: 'setup',
        description: 'Check setup and configuration',
        action: () => this.checkSetup()
      },
      {
        name: 'chat',
        description: 'Interactive chat session for testing',
        action: () => this.startChat()
      },
      {
        name: 'config',
        description: 'Show current configuration',
        action: () => this.showConfig()
      },
      {
        name: 'models',
        description: 'List available free models',
        action: () => this.listModels()
      },
      {
        name: 'benchmark',
        description: 'Run performance benchmark',
        action: () => this.runBenchmark()
      }
    ]

    if (!command || command === 'help') {
      this.showHelp(commands)
      return
    }

    const selectedCommand = commands.find(cmd => cmd.name === command)
    if (!selectedCommand) {
      console.error(`❌ Unknown command: ${command}`)
      this.showHelp(commands)
      process.exit(1)
    }

    try {
      await selectedCommand.action()
    } catch (error) {
      console.error(`❌ Command failed:`, error)
      process.exit(1)
    }
  }

  private showHelp(commands: CLICommand[]): void {
    console.log('🤖 EventTitan LLM Integration CLI\n')
    console.log('Usage: npm run llm <command>\n')
    console.log('Available commands:')
    commands.forEach(cmd => {
      console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`)
    })
    console.log('\nExamples:')
    console.log('  npm run llm setup     # Check if LLM integration is ready')
    console.log('  npm run llm test      # Run all tests')
    console.log('  npm run llm chat      # Start interactive chat')
    console.log('  npm run llm config    # Show current configuration')
  }

  private async runTests(): Promise<void> {
    console.log('🧪 Running LLM Integration Tests...\n')
    
    const tester = new LLMIntegrationTester()
    const results = await tester.runAllTests()
    
    const passed = results.filter(r => r.success).length
    const total = results.length
    
    if (passed === total) {
      console.log('\n🎉 All tests passed! Your LLM integration is working perfectly.')
      process.exit(0)
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed. Please check the setup.`)
      process.exit(1)
    }
  }

  private async checkSetup(): Promise<void> {
    console.log('🔍 Checking LLM Integration Setup...\n')
    
    const setup = validateLLMSetup()
    const config = llmConfig.getConfig()
    
    console.log('Configuration Status:')
    console.log(`  API Key: ${config.openRouter.apiKey ? '✅ Set' : '❌ Missing'}`)
    console.log(`  Model: ${config.openRouter.defaultModel}`)
    console.log(`  Max Tokens: ${config.openRouter.maxTokens}`)
    console.log(`  Temperature: ${config.openRouter.temperature}`)
    console.log(`  Caching: ${config.performance.enableCaching ? '✅ Enabled' : '❌ Disabled'}`)
    console.log(`  Handoff: ${config.handoff.enabled ? '✅ Enabled' : '❌ Disabled'}`)
    
    console.log('\nSetup Status:')
    if (setup.ready) {
      console.log('✅ LLM integration is ready!')
    } else {
      console.log('❌ LLM integration is not ready:')
      setup.issues.forEach(issue => {
        console.log(`   • ${issue}`)
      })
      
      console.log('\n💡 To fix these issues:')
      console.log('   1. Set your OpenRouter API key: set OPENROUTER_API_KEY=your_key_here')
      console.log('   2. See LLM-INTEGRATION-SETUP.md for detailed instructions')
    }
    
    // Test connection if API key is available
    if (config.openRouter.apiKey) {
      console.log('\n🔗 Testing connection...')
      try {
        const testResult = await this.processor.testProcessor()
        if (testResult.success) {
          console.log('✅ Connection test successful!')
          console.log(`   Processing time: ${testResult.details.processor.processingTime}ms`)
          console.log(`   LLM used: ${testResult.details.processor.llmUsed ? 'Yes' : 'No'}`)
        } else {
          console.log('❌ Connection test failed')
          console.log(`   Error: ${JSON.stringify(testResult.details, null, 2)}`)
        }
      } catch (error) {
        console.log('❌ Connection test error:', error)
      }
    }
  }

  private async startChat(): Promise<void> {
    const setup = validateLLMSetup()
    if (!setup.ready) {
      console.log('❌ LLM integration is not ready. Run "npm run llm setup" to check configuration.')
      return
    }

    console.log('💬 Starting interactive chat session...')
    console.log('Type "exit" to quit, "help" for commands\n')

    const readline = require('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const askQuestion = (): Promise<string> => {
      return new Promise(resolve => {
        rl.question('You: ', resolve)
      })
    }

    while (true) {
      try {
        const userInput = await askQuestion()
        
        if (userInput.toLowerCase() === 'exit') {
          console.log('👋 Goodbye!')
          break
        }
        
        if (userInput.toLowerCase() === 'help') {
          console.log('Chat commands:')
          console.log('  exit    - Quit the chat')
          console.log('  help    - Show this help')
          console.log('  stats   - Show processing statistics')
          continue
        }
        
        if (userInput.toLowerCase() === 'stats') {
          const stats = this.processor.getStatistics()
          console.log('Processing Statistics:', stats)
          continue
        }
        
        if (!userInput.trim()) continue
        
        console.log('🤖 EventTitan: Processing...')
        const startTime = Date.now()
        
        const result = await this.processor.processMessage(userInput)
        const processingTime = Date.now() - startTime
        
        console.log(`\nBot: ${result.response}`)
        
        if (result.followUpQuestions.length > 0) {
          console.log('\n💡 You might also ask:')
          result.followUpQuestions.forEach(q => console.log(`   • ${q}`))
        }
        
        console.log(`\n📊 [Confidence: ${Math.round(result.confidence * 100)}%, LLM: ${result.llmUsed ? 'Yes' : 'No'}, Time: ${processingTime}ms]\n`)
        
      } catch (error) {
        console.error('❌ Error:', error)
      }
    }
    
    rl.close()
  }

  private async showConfig(): Promise<void> {
    console.log('⚙️  Current LLM Integration Configuration\n')
    
    const config = llmConfig.getConfig()
    
    console.log('OpenRouter Settings:')
    console.log(`  API Key: ${config.openRouter.apiKey ? `${config.openRouter.apiKey.substring(0, 10)}...` : 'Not set'}`)
    console.log(`  Base URL: ${config.openRouter.baseUrl}`)
    console.log(`  Default Model: ${config.openRouter.defaultModel}`)
    console.log(`  Max Tokens: ${config.openRouter.maxTokens}`)
    console.log(`  Temperature: ${config.openRouter.temperature}`)
    console.log(`  Timeout: ${config.openRouter.timeout}ms`)
    console.log(`  Retry Attempts: ${config.openRouter.retryAttempts}`)
    console.log(`  Rate Limit: ${config.openRouter.rateLimitPerMinute}/min`)
    
    console.log('\nKnowledge Settings:')
    console.log(`  Confidence Threshold: ${config.knowledge.confidenceThreshold}`)
    console.log(`  Max Knowledge Chunks: ${config.knowledge.maxKnowledgeChunks}`)
    console.log(`  Context Window Size: ${config.knowledge.contextWindowSize}`)
    console.log(`  Search Timeout: ${config.knowledge.searchTimeout}ms`)
    
    console.log('\nResponse Settings:')
    console.log(`  Max Length: ${config.response.maxLength}`)
    console.log(`  Include Follow-ups: ${config.response.includeFollowUps}`)
    console.log(`  Include Sources: ${config.response.includeSources}`)
    console.log(`  Add Emojis: ${config.response.addEmojis}`)
    console.log(`  Personality Tone: ${config.response.personalityTone}`)
    console.log(`  Response Format: ${config.response.responseFormat}`)
    
    console.log('\nHandoff Settings:')
    console.log(`  Enabled: ${config.handoff.enabled}`)
    console.log(`  Low Confidence Threshold: ${config.handoff.lowConfidenceThreshold}`)
    console.log(`  Auto Handoff: ${config.handoff.autoHandoffEnabled}`)
    
    console.log('\nPerformance Settings:')
    console.log(`  Caching: ${config.performance.enableCaching}`)
    console.log(`  Cache Expiration: ${config.performance.cacheExpirationMinutes} minutes`)
    console.log(`  Max Cache Size: ${config.performance.maxCacheSize}`)
    console.log(`  Logging: ${config.performance.logProcessingTime}`)
    console.log(`  Metrics: ${config.performance.enableMetrics}`)
    
    console.log('\n💡 To modify configuration, edit src/llm-config.ts or use environment variables.')
    console.log('   See LLM-INTEGRATION-SETUP.md for details.')
  }

  private async listModels(): Promise<void> {
    console.log('🤖 Available Free Models on OpenRouter\n')
    
    const models = [
      {
        name: 'meta-llama/llama-3.2-3b-instruct:free',
        description: 'Balanced performance and capability (Recommended)',
        strengths: ['General conversation', 'Instruction following', 'Good reasoning'],
        limitations: ['Complex reasoning', 'Very long contexts'],
        contextWindow: '2K tokens',
        speed: 'Medium'
      },
      {
        name: 'meta-llama/llama-3.2-1b-instruct:free',
        description: 'Fastest responses, good for simple queries',
        strengths: ['Quick responses', 'Simple tasks', 'Low latency'],
        limitations: ['Complex reasoning', 'Detailed explanations'],
        contextWindow: '1K tokens',
        speed: 'Fast'
      },
      {
        name: 'google/gemma-2-9b-it:free',
        description: 'Best reasoning capabilities',
        strengths: ['Complex reasoning', 'Detailed explanations', 'Analysis'],
        limitations: ['Creative writing', 'Casual conversation'],
        contextWindow: '4K tokens',
        speed: 'Slower'
      },
      {
        name: 'microsoft/phi-3-mini-128k-instruct:free',
        description: 'Excellent for long contexts',
        strengths: ['Long contexts', 'Instruction following', 'Document analysis'],
        limitations: ['Creative tasks', 'Very casual tone'],
        contextWindow: '8K tokens',
        speed: 'Medium'
      }
    ]
    
    models.forEach((model, index) => {
      console.log(`${index + 1}. ${model.name}`)
      console.log(`   ${model.description}`)
      console.log(`   Context: ${model.contextWindow} | Speed: ${model.speed}`)
      console.log(`   Strengths: ${model.strengths.join(', ')}`)
      console.log(`   Limitations: ${model.limitations.join(', ')}`)
      console.log()
    })
    
    const currentConfig = llmConfig.getConfig()
    console.log(`Current model: ${currentConfig.openRouter.defaultModel}`)
    console.log('\n💡 To change model, set environment variable:')
    console.log('   set OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free')
  }

  private async runBenchmark(): Promise<void> {
    console.log('🏃 Running Performance Benchmark...\n')
    
    const setup = validateLLMSetup()
    if (!setup.ready) {
      console.log('❌ LLM integration is not ready. Run "npm run llm setup" first.')
      return
    }
    
    const testQueries = [
      'How do I plan a wedding?',
      'What should I consider when choosing a venue?',
      'Help me create a budget for my event',
      'What are the best catering options?',
      'How do I manage a guest list?',
      'What entertainment options are available?',
      'How far in advance should I start planning?',
      'What are common event planning mistakes?'
    ]
    
    console.log(`Testing with ${testQueries.length} queries...`)
    
    const results = []
    let totalTime = 0
    let llmUsageCount = 0
    
    for (let i = 0; i < testQueries.length; i++) {
      const query = testQueries[i]
      console.log(`[${i + 1}/${testQueries.length}] Processing: "${query.substring(0, 30)}..."`)
      
      const startTime = Date.now()
      const result = await this.processor.processMessage(query)
      const processingTime = Date.now() - startTime
      
      totalTime += processingTime
      if (result.llmUsed) llmUsageCount++
      
      results.push({
        query,
        processingTime,
        confidence: result.confidence,
        llmUsed: result.llmUsed,
        responseLength: result.response.length
      })
      
      console.log(`   ✅ ${processingTime}ms (confidence: ${Math.round(result.confidence * 100)}%)`)
    }
    
    console.log('\n📊 Benchmark Results:')
    console.log(`   Total time: ${totalTime}ms`)
    console.log(`   Average time: ${Math.round(totalTime / testQueries.length)}ms`)
    console.log(`   LLM usage rate: ${Math.round((llmUsageCount / testQueries.length) * 100)}%`)
    console.log(`   Average confidence: ${Math.round((results.reduce((sum, r) => sum + r.confidence, 0) / results.length) * 100)}%`)
    console.log(`   Average response length: ${Math.round(results.reduce((sum, r) => sum + r.responseLength, 0) / results.length)} chars`)
    
    const fastQueries = results.filter(r => r.processingTime < 3000).length
    const slowQueries = results.filter(r => r.processingTime > 10000).length
    
    console.log(`   Fast responses (<3s): ${fastQueries}/${testQueries.length}`)
    console.log(`   Slow responses (>10s): ${slowQueries}/${testQueries.length}`)
    
    if (slowQueries > 0) {
      console.log('\n💡 Performance tips:')
      console.log('   • Enable caching to speed up repeated queries')
      console.log('   • Use a smaller model for faster responses')
      console.log('   • Reduce max tokens for shorter processing time')
    }
  }
}

// CLI execution
if (require.main === module) {
  const cli = new LLMIntegrationCLI()
  cli.run().catch(error => {
    console.error('CLI Error:', error)
    process.exit(1)
  })
}

export { LLMIntegrationCLI }
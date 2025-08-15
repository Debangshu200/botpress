/**
 * GPT-OSS-20B Test Script
 * Test the GPT-OSS-20B configuration and service
 */

// Load environment variables from .env file
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env file from the src directory
config({ path: resolve(__dirname, '.env') })

import { gptOss20BService } from './gpt-oss-20b-service'
import { validateGPTOss20BSetup, gptOss20BConfig } from './gpt-oss-20b-config'

async function testGPTOss20BSetup() {
  console.log('🧪 Testing GPT-OSS-20B Setup...\n')

  // 1. Validate configuration
  console.log('1. Validating Configuration...')
  const validation = validateGPTOss20BSetup()
  
  if (validation.ready) {
    console.log('✅ Configuration is valid')
  } else {
    console.log('❌ Configuration issues found:')
    validation.issues.forEach(issue => console.log(`   - ${issue}`))
    console.log('\n💡 To fix these issues:')
    console.log('   - Set OPENROUTER_API_KEY environment variable')
    console.log('   - Ensure you have access to GPT-OSS-20B model')
    return
  }

  // 2. Display configuration details
  console.log('\n2. Configuration Details:')
  const config = gptOss20BConfig.getConfig()
  console.log(`   Model: ${config.model.name}`)
  console.log(`   Provider: ${config.model.provider}`)
  console.log(`   Max Tokens: ${config.model.maxTokens}`)
  console.log(`   Temperature: ${config.model.temperature}`)
  console.log(`   Rate Limit: ${config.rateLimiting.requestsPerMinute} req/min`)
  console.log(`   Cache Enabled: ${config.optimization.enableCaching}`)

  // 3. Display model capabilities
  console.log('\n3. Model Capabilities:')
  const capabilities = gptOss20BConfig.getModelCapabilities()
  console.log('   Strengths:')
  capabilities.strengths.forEach(strength => console.log(`     - ${strength}`))
  console.log('   Best Use Cases:')
  capabilities.bestUseCases.forEach(useCase => console.log(`     - ${useCase}`))

  // 4. Test connection
  console.log('\n4. Testing Connection...')
  try {
    const connectionTest = await gptOss20BService.testConnection()
    
    if (connectionTest.success) {
      console.log('✅ Connection successful!')
    } else {
      console.log('❌ Connection failed:', connectionTest.error)
      return
    }
  } catch (error) {
    console.log('❌ Connection test error:', error)
    return
  }

  // 5. Test basic response generation
  console.log('\n5. Testing Response Generation...')
  try {
    const testResponse = await gptOss20BService.generateResponse({
      prompt: 'What are the key considerations when planning a corporate event?',
      useOptimization: true
    })

    if (testResponse.success) {
      console.log('✅ Response generation successful!')
      console.log(`   Model: ${testResponse.model}`)
      console.log(`   Tokens Used: ${testResponse.tokensUsed}`)
      console.log(`   Processing Time: ${testResponse.processingTime}ms`)
      console.log(`   Optimization Applied: ${testResponse.optimizationApplied}`)
      console.log(`   Response Preview: ${testResponse.content.substring(0, 100)}...`)
      
      if (testResponse.recommendations && testResponse.recommendations.length > 0) {
        console.log('   Recommendations:')
        testResponse.recommendations.forEach(rec => console.log(`     - ${rec}`))
      }
    } else {
      console.log('❌ Response generation failed:', testResponse.error)
    }
  } catch (error) {
    console.log('❌ Response generation error:', error)
  }

  // 6. Test with context
  console.log('\n6. Testing with Context...')
  try {
    const contextResponse = await gptOss20BService.generateResponse({
      prompt: 'How should I handle catering for this event?',
      context: 'Event Details: Corporate annual meeting, 150 attendees, budget $5000, dietary restrictions include vegetarian and gluten-free options.',
      maxTokens: 300,
      temperature: 0.8
    })

    if (contextResponse.success) {
      console.log('✅ Context-aware response successful!')
      console.log(`   Response: ${contextResponse.content.substring(0, 150)}...`)
    } else {
      console.log('❌ Context-aware response failed:', contextResponse.error)
    }
  } catch (error) {
    console.log('❌ Context test error:', error)
  }

  // 7. Display service status
  console.log('\n7. Service Status:')
  const status = gptOss20BService.getServiceStatus()
  console.log(`   Model: ${status.modelName}`)
  console.log(`   Configured: ${status.isConfigured}`)
  console.log(`   Cache Size: ${status.cacheStatus.size}/${status.cacheStatus.maxSize}`)
  console.log(`   Rate Limit: ${status.rateLimitStatus.requests} requests used`)
  console.log(`   Failures: ${status.failureStatus.count}`)

  console.log('\n🎉 GPT-OSS-20B test completed!')
}

async function testPromptOptimization() {
  console.log('\n🔧 Testing Prompt Optimization...\n')

  const { optimizePromptForGPTOss20B } = await import('./gpt-oss-20b-config')

  const testPrompts = [
    'Help with event',
    'I need to plan a wedding for 200 people with a budget of $15,000. What should I consider?',
    'Event planning question: How do I choose the right venue for a corporate conference with specific AV requirements and accessibility needs?'
  ]

  testPrompts.forEach((prompt, index) => {
    console.log(`Test ${index + 1}: "${prompt}"`)
    const optimization = optimizePromptForGPTOss20B(prompt)
    console.log(`   Optimized: "${optimization.optimizedPrompt}"`)
    console.log(`   Estimated Tokens: ${optimization.estimatedTokens}`)
    if (optimization.recommendations.length > 0) {
      console.log('   Recommendations:')
      optimization.recommendations.forEach(rec => console.log(`     - ${rec}`))
    }
    console.log()
  })
}

// Main execution
async function main() {
  try {
    await testGPTOss20BSetup()
    await testPromptOptimization()
  } catch (error) {
    console.error('Test execution failed:', error)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { testGPTOss20BSetup, testPromptOptimization }
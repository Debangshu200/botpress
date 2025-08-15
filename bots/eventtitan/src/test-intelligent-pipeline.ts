/**
 * Test script for Intelligent Response Pipeline
 * Demonstrates the pipeline's capabilities with various query types
 */

import { intelligentResponsePipeline, PipelineRequest } from './intelligent-response-pipeline'

async function testIntelligentPipeline() {
  console.log('🧪 Testing Intelligent Response Pipeline\n')

  // Test cases with different confidence levels and scenarios
  const testCases: Array<{ name: string; request: PipelineRequest }> = [
    {
      name: 'High Confidence Knowledge Query',
      request: {
        query: 'How do I plan a wedding?',
        options: {
          useKnowledgeBase: true,
          useLLMEnhancement: true,
          confidenceThreshold: 0.6,
          maxKnowledgeResults: 3,
          llmMaxTokens: 500,
          llmTemperature: 0.7,
          forceDirectResponse: false,
          enableFallback: true
        }
      }
    },
    {
      name: 'Medium Confidence Corporate Event Query',
      request: {
        query: 'What should I consider for a corporate team building event?',
        options: {
          useKnowledgeBase: true,
          useLLMEnhancement: true,
          confidenceThreshold: 0.6,
          maxKnowledgeResults: 3,
          llmMaxTokens: 500,
          llmTemperature: 0.7,
          forceDirectResponse: false,
          enableFallback: true
        }
      }
    },
    {
      name: 'Knowledge-Only Response (No LLM)',
      request: {
        query: 'Tell me about venue selection',
        options: {
          useKnowledgeBase: true,
          useLLMEnhancement: false,
          confidenceThreshold: 0.6,
          maxKnowledgeResults: 3,
          llmMaxTokens: 500,
          llmTemperature: 0.7,
          forceDirectResponse: true,
          enableFallback: true
        }
      }
    },
    {
      name: 'LLM-Only Response (No Knowledge Base)',
      request: {
        query: 'What are some creative ideas for a birthday party theme?',
        options: {
          useKnowledgeBase: false,
          useLLMEnhancement: true,
          confidenceThreshold: 0.6,
          maxKnowledgeResults: 3,
          llmMaxTokens: 500,
          llmTemperature: 0.8,
          forceDirectResponse: false,
          enableFallback: true
        }
      }
    },
    {
      name: 'Low Confidence Query (Should Trigger Handoff)',
      request: {
        query: 'How do I fix my car engine?',
        options: {
          useKnowledgeBase: true,
          useLLMEnhancement: true,
          confidenceThreshold: 0.8, // High threshold to trigger handoff
          maxKnowledgeResults: 3,
          llmMaxTokens: 500,
          llmTemperature: 0.7,
          forceDirectResponse: false,
          enableFallback: true
        }
      }
    }
  ]

  for (const testCase of testCases) {
    console.log(`\n📋 Test Case: ${testCase.name}`)
    console.log(`Query: "${testCase.request.query}"`)
    console.log('Options:', JSON.stringify(testCase.request.options, null, 2))
    
    try {
      const startTime = Date.now()
      const response = await intelligentResponsePipeline.generateResponse(testCase.request)
      const duration = Date.now() - startTime
      
      console.log('\n✅ Response Generated:')
      console.log(`Success: ${response.success}`)
      console.log(`Source: ${response.source}`)
      console.log(`Confidence: ${(response.confidence.score * 100).toFixed(1)}%`)
      console.log(`Quality Score: ${(response.qualityScore * 100).toFixed(1)}%`)
      console.log(`Should Handoff: ${response.shouldHandoff}`)
      console.log(`Knowledge Used: ${response.knowledgeUsed}`)
      console.log(`Processing Time: ${duration}ms`)
      
      if (response.tokensUsed) {
        console.log(`Tokens Used: ${response.tokensUsed}`)
      }
      
      console.log('\n📝 Response Content:')
      console.log(response.response)
      
      // Show confidence factors
      if (response.confidence.factors.length > 0) {
        console.log('\n🔍 Confidence Factors:')
        response.confidence.factors.forEach(factor => {
          console.log(`  - ${factor.name}: ${(factor.score * 100).toFixed(1)}% (${factor.description})`)
        })
      }
      
      // Show quality factors
      if (response.metadata.qualityFactors.length > 0) {
        console.log('\n⭐ Quality Factors:')
        response.metadata.qualityFactors.forEach(factor => {
          console.log(`  - ${factor.name}: ${(factor.score * 100).toFixed(1)}% (weight: ${factor.weight}) - ${factor.description}`)
        })
      }
      
      // Show routing decision
      console.log('\n🎯 Routing Decision:')
      console.log(`Route: ${response.metadata.routingDecision.route}`)
      console.log(`Reasoning: ${response.metadata.routingDecision.reasoning}`)
      
      if (response.metadata.fallbackReason) {
        console.log(`Fallback Reason: ${response.metadata.fallbackReason}`)
      }
      
    } catch (error) {
      console.error(`❌ Error in test case "${testCase.name}":`, error)
    }
    
    console.log('\n' + '='.repeat(80))
  }

  // Test pipeline statistics
  console.log('\n📊 Pipeline Statistics:')
  const stats = intelligentResponsePipeline.getStatistics()
  console.log('Knowledge Stats:', JSON.stringify(stats.knowledgeStats, null, 2))
  console.log('Routing Config:', JSON.stringify(stats.routingConfig, null, 2))
  console.log('Pipeline Options:', JSON.stringify(stats.pipelineOptions, null, 2))
}

async function testConfigurationUpdates() {
  console.log('\n🔧 Testing Configuration Updates\n')
  
  // Test updating routing configuration
  console.log('📝 Updating routing configuration...')
  intelligentResponsePipeline.updateConfiguration(
    {
      confidenceThreshold: 0.7,
      handoffEnabled: false,
      clarificationThreshold: 0.5
    },
    {
      llmMaxTokens: 800,
      llmTemperature: 0.6
    }
  )
  
  const updatedStats = intelligentResponsePipeline.getStatistics()
  console.log('Updated Routing Config:', JSON.stringify(updatedStats.routingConfig, null, 2))
  console.log('Updated Pipeline Options:', JSON.stringify(updatedStats.pipelineOptions, null, 2))
  
  // Test with updated configuration
  console.log('\n🧪 Testing with updated configuration...')
  const testResponse = await intelligentResponsePipeline.generateResponse({
    query: 'How much should I budget for catering?',
    options: {
      useKnowledgeBase: true,
      useLLMEnhancement: true,
      confidenceThreshold: 0.7, // Use updated threshold
      maxKnowledgeResults: 2,
      llmMaxTokens: 800, // Use updated token limit
      llmTemperature: 0.6, // Use updated temperature
      forceDirectResponse: false,
      enableFallback: true
    }
  })
  
  console.log('Response with updated config:')
  console.log(`Confidence: ${(testResponse.confidence.score * 100).toFixed(1)}%`)
  console.log(`Should Handoff: ${testResponse.shouldHandoff}`)
  console.log(`Tokens Used: ${testResponse.tokensUsed || 'N/A'}`)
  console.log('Response:', testResponse.response.substring(0, 200) + '...')
}

async function runAllTests() {
  try {
    await testIntelligentPipeline()
    await testConfigurationUpdates()
    
    console.log('\n✅ All tests completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
}

export { testIntelligentPipeline, testConfigurationUpdates, runAllTests }
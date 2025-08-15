/**
 * Demo script for Intelligent Response Pipeline
 * Shows practical usage examples for EventTitan bot
 */

import { intelligentResponsePipeline, PipelineRequest } from './intelligent-response-pipeline'

async function runPipelineDemo() {
  console.log('🎭 EventTitan Intelligent Response Pipeline Demo\n')
  console.log('This demo shows how the pipeline handles different types of queries with confidence-based routing.\n')

  const demoQueries = [
    {
      name: 'Wedding Planning Query',
      query: 'I need help planning my wedding. What are the most important things to consider?',
      description: 'Should find relevant knowledge and enhance with LLM'
    },
    {
      name: 'Venue Selection Query',
      query: 'What should I look for when choosing a venue for my corporate event?',
      description: 'Should match knowledge base content about venue selection'
    },
    {
      name: 'Budget Planning Query',
      query: 'How much should I budget for a 100-person wedding reception?',
      description: 'Should provide budgeting guidance from knowledge base'
    },
    {
      name: 'Creative Ideas Query',
      query: 'What are some unique decoration ideas for a summer outdoor wedding?',
      description: 'Should use LLM creativity since not in knowledge base'
    },
    {
      name: 'Off-Topic Query',
      query: 'How do I change the oil in my car?',
      description: 'Should trigger handoff since not event-related'
    }
  ]

  for (let i = 0; i < demoQueries.length; i++) {
    const demo = demoQueries[i]
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📋 Demo ${i + 1}: ${demo.name}`)
    console.log(`Query: "${demo.query}"`)
    console.log(`Expected: ${demo.description}`)
    console.log(`${'='.repeat(60)}`)

    try {
      const request: PipelineRequest = {
        query: demo.query,
        userId: `demo-user-${i + 1}`,
        conversationId: `demo-conv-${i + 1}`,
        options: {
          useKnowledgeBase: true,
          useLLMEnhancement: true,
          confidenceThreshold: 0.6,
          maxKnowledgeResults: 2,
          llmMaxTokens: 400,
          llmTemperature: 0.7,
          forceDirectResponse: false,
          enableFallback: true
        }
      }

      const startTime = Date.now()
      const response = await intelligentResponsePipeline.generateResponse(request)
      const duration = Date.now() - startTime

      // Display results
      console.log('\n📊 Pipeline Results:')
      console.log(`✅ Success: ${response.success}`)
      console.log(`🎯 Source: ${response.source}`)
      console.log(`📈 Confidence: ${(response.confidence.score * 100).toFixed(1)}%`)
      console.log(`⭐ Quality Score: ${(response.qualityScore * 100).toFixed(1)}%`)
      console.log(`🔄 Should Handoff: ${response.shouldHandoff}`)
      console.log(`📚 Knowledge Used: ${response.knowledgeUsed}`)
      console.log(`⏱️ Processing Time: ${duration}ms`)
      
      if (response.tokensUsed) {
        console.log(`🔤 Tokens Used: ${response.tokensUsed}`)
      }

      // Show routing decision
      console.log(`\n🎯 Routing Decision: ${response.metadata.routingDecision.route}`)
      console.log(`💭 Reasoning: ${response.metadata.routingDecision.reasoning}`)

      // Show confidence factors
      if (response.confidence.factors.length > 0) {
        console.log('\n🔍 Confidence Breakdown:')
        response.confidence.factors.forEach(factor => {
          const percentage = (factor.score * 100).toFixed(1)
          console.log(`  • ${factor.name}: ${percentage}% - ${factor.description}`)
        })
      }

      // Show quality factors
      if (response.metadata.qualityFactors.length > 0) {
        console.log('\n⭐ Quality Assessment:')
        response.metadata.qualityFactors.forEach(factor => {
          const percentage = (factor.score * 100).toFixed(1)
          const weight = (factor.weight * 100).toFixed(0)
          console.log(`  • ${factor.name}: ${percentage}% (weight: ${weight}%) - ${factor.description}`)
        })
      }

      // Show response preview
      console.log('\n📝 Response Preview:')
      const preview = response.response.length > 300 
        ? response.response.substring(0, 300) + '...'
        : response.response
      console.log(preview)

      // Show fallback reason if applicable
      if (response.metadata.fallbackReason) {
        console.log(`\n⚠️ Fallback Reason: ${response.metadata.fallbackReason}`)
      }

    } catch (error) {
      console.error(`❌ Demo ${i + 1} failed:`, error)
    }

    // Add a small delay between demos for readability
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  console.log('\n' + '='.repeat(60))
  console.log('🎉 Demo Complete!')
  console.log('\n📋 Summary of Pipeline Capabilities:')
  console.log('✅ Knowledge Base Integration - Searches uploaded documents and fallback knowledge')
  console.log('✅ LLM Enhancement - Uses GPT-OSS-20B to improve responses')
  console.log('✅ Confidence-Based Routing - Automatically decides response strategy')
  console.log('✅ Quality Assessment - Evaluates response quality using multiple factors')
  console.log('✅ Fallback Mechanisms - Handles errors gracefully')
  console.log('✅ Flexible Configuration - Customizable thresholds and options')
  
  console.log('\n🔧 Pipeline Configuration:')
  const stats = intelligentResponsePipeline.getStatistics()
  console.log(`📚 Knowledge Documents: ${stats.knowledgeStats.uploadedDocuments}`)
  console.log(`🎯 Confidence Threshold: ${(stats.routingConfig.confidenceThreshold * 100)}%`)
  console.log(`🔄 Handoff Enabled: ${stats.routingConfig.handoffEnabled}`)
  console.log(`🤖 LLM Enhancement: ${stats.pipelineOptions.useLLMEnhancement}`)
  console.log(`🔤 Max LLM Tokens: ${stats.pipelineOptions.llmMaxTokens}`)
}

// Run demo if this file is executed directly
if (require.main === module) {
  runPipelineDemo().catch(error => {
    console.error('❌ Demo failed:', error)
    process.exit(1)
  })
}

export { runPipelineDemo }
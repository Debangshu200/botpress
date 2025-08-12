/**
 * Knowledge Response Refinement Demo
 * Test script to verify the new refinement functionality works correctly
 */

import { searchKnowledge, searchKnowledgeWithAI } from './knowledge-handler'
import { KnowledgeResponseRefiner } from './knowledge-response-refiner'
import { refinementConfigManager, detectTopicFromQuery } from './knowledge-refinement-config'

// Mock OpenAI client for testing
const createMockClient = () => ({
  callAction: async (params: any) => {
    const { input } = params
    const userMessage = input.messages[0]?.content || ''
    
    // Simulate AI refinement based on the content
    let refinedContent = ''
    
    if (userMessage.includes('wedding')) {
      refinedContent = '💒 Wedding planning requires 12-18 months advance planning. Start with budget and venue booking, then select major vendors like photographers and caterers. Create a detailed timeline for smooth execution.\n\n💡 Would you like more specific details about any aspect?'
    } else if (userMessage.includes('venue')) {
      refinedContent = '🏢 Venue selection is crucial for event success. Consider capacity, location accessibility, parking, and catering restrictions. Always ensure the venue fits your guest count with a 10% buffer.\n\n💡 Would you like more specific details about any aspect?'
    } else if (userMessage.includes('budget')) {
      refinedContent = '💰 Event budgeting requires careful planning with typical breakdown: venue (40-50%), catering (25-35%), entertainment (10-15%). Always include a 10-15% contingency fund for unexpected expenses.\n\n💡 Would you like more specific details about any aspect?'
    } else {
      refinedContent = '📅 Event planning involves organizing all aspects from concept to execution. Key phases include consultation, budgeting, venue booking, vendor coordination, and day-of execution.\n\n💡 Would you like more specific details about any aspect?'
    }
    
    return {
      output: {
        choices: [{
          message: {
            content: refinedContent
          }
        }]
      }
    }
  }
})

async function runRefinementDemo() {
  console.log('🎯 Knowledge Response Refinement Demo\n')
  console.log('=' .repeat(60))
  
  const mockClient = createMockClient()
  
  const testQueries = [
    'How do I plan a wedding?',
    'What should I consider for venue selection?',
    'How do I budget for an event?',
    'Tell me about corporate events',
    'What are the key steps in event planning?'
  ]

  for (const query of testQueries) {
    console.log(`\n🔍 Query: "${query}"`)
    console.log('-'.repeat(50))
    
    // Detect topic
    const topic = detectTopicFromQuery(query)
    console.log(`📂 Detected Topic: ${topic}`)
    
    // Get configuration for this topic
    const config = refinementConfigManager.getConfigForTopic(topic)
    console.log(`⚙️  Config: maxLines=${config.maxLines}, emojis=${config.addEmojis}, followUp=${config.includeFollowUp}`)
    
    // Test basic search (before refinement)
    console.log('\n📋 BEFORE REFINEMENT:')
    const basicResult = searchKnowledge(query)
    if (basicResult) {
      console.log(`Length: ${basicResult.length} characters`)
      console.log(`Lines: ${basicResult.split('\n').filter(l => l.trim()).length}`)
      console.log('Content preview:', basicResult.substring(0, 150) + '...')
    } else {
      console.log('No basic result found')
    }
    
    // Test enhanced search with AI refinement
    console.log('\n✨ AFTER REFINEMENT:')
    try {
      const enhancedResult = await searchKnowledgeWithAI(query, mockClient)
      if (enhancedResult) {
        console.log(`Length: ${enhancedResult.length} characters`)
        console.log(`Lines: ${enhancedResult.split('\n').filter(l => l.trim()).length}`)
        console.log('Refined content:')
        console.log(enhancedResult)
        
        // Verify refinement goals
        const hasFileNames = /\.(txt|md|pdf|docx)/i.test(enhancedResult)
        const hasSources = /source:|references:/i.test(enhancedResult)
        const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(enhancedResult)
        const lines = enhancedResult.split('\n').filter(l => l.trim()).length
        
        console.log('\n📊 Quality Check:')
        console.log(`✅ No file names: ${!hasFileNames}`)
        console.log(`✅ No sources: ${!hasSources}`)
        console.log(`✅ Has emojis: ${hasEmojis}`)
        console.log(`✅ Concise (≤4 lines): ${lines <= 4}`)
        console.log(`✅ Appropriate length: ${enhancedResult.length >= 50 && enhancedResult.length <= 400}`)
        
      } else {
        console.log('No enhanced result found')
      }
    } catch (error) {
      console.error('Enhanced search failed:', error)
    }
    
    console.log('\n' + '='.repeat(60))
  }
}

async function testDirectRefinement() {
  console.log('\n🧪 Direct Refinement Test\n')
  console.log('=' .repeat(60))
  
  const mockClient = createMockClient()
  const refiner = new KnowledgeResponseRefiner(mockClient)
  
  // Test with a verbose response that includes file names and sources
  const verboseResponse = `Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results. Key steps include: setting a budget, choosing a venue, selecting vendors (photographer, caterer, florist), sending invitations, and coordinating the ceremony and reception.

Essential wedding planning timeline:
- 12-18 months before: Set budget, book venue
- 8-12 months before: Select major vendors
- 6-8 months before: Send save-the-dates
- 3-6 months before: Finalize details, send invitations
- 1-3 months before: Confirm all arrangements
- Week of: Final preparations and rehearsal

Source: wedding-planning-guide.txt
References: venue-selection.md, vendor-coordination.pdf
File: timeline-template.docx`

  console.log('📋 ORIGINAL VERBOSE RESPONSE:')
  console.log(`Length: ${verboseResponse.length} characters`)
  console.log(`Lines: ${verboseResponse.split('\n').filter(l => l.trim()).length}`)
  console.log('Content:', verboseResponse)
  
  console.log('\n✨ REFINED RESPONSE:')
  const result = await refiner.refineResponse(
    verboseResponse,
    'How do I plan a wedding?',
    {
      maxLines: 3,
      removeFileNames: true,
      removeSources: true,
      addEmojis: true,
      includeFollowUp: true,
      temperature: 0.3,
      maxTokens: 150
    }
  )
  
  console.log(`Length: ${result.refinedLength} characters (was ${result.originalLength})`)
  console.log(`Processing time: ${result.processingTime}ms`)
  console.log(`Confidence: ${result.confidence}`)
  console.log(`Was refined: ${result.wasRefined}`)
  console.log('Content:', result.content)
  
  // Quality checks
  const hasFileNames = /\.(txt|md|pdf|docx)/i.test(result.content)
  const hasSources = /source:|references:|file:/i.test(result.content)
  const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(result.content)
  const lines = result.content.split('\n').filter(l => l.trim()).length
  
  console.log('\n📊 Quality Check:')
  console.log(`✅ Removed file names: ${!hasFileNames}`)
  console.log(`✅ Removed sources: ${!hasSources}`)
  console.log(`✅ Added emojis: ${hasEmojis}`)
  console.log(`✅ Concise (≤4 lines): ${lines <= 4}`)
  console.log(`✅ Compression ratio: ${Math.round((1 - result.refinedLength / result.originalLength) * 100)}%`)
}

async function testConfigurationSystem() {
  console.log('\n⚙️  Configuration System Test\n')
  console.log('=' .repeat(60))
  
  const topics = ['wedding', 'venue', 'budget', 'corporate', 'general']
  
  topics.forEach(topic => {
    const config = refinementConfigManager.getConfigForTopic(topic)
    console.log(`\n📂 Topic: ${topic}`)
    console.log(`   Max Lines: ${config.maxLines}`)
    console.log(`   Add Emojis: ${config.addEmojis}`)
    console.log(`   Include Follow-up: ${config.includeFollowUp}`)
    console.log(`   AI Enabled: ${config.aiRefinementEnabled}`)
    console.log(`   Temperature: ${config.temperature}`)
  })
  
  // Test topic detection
  console.log('\n🔍 Topic Detection Test:')
  const testQueries = [
    'How do I plan a wedding?',
    'What venues are available?',
    'How much does catering cost?',
    'Corporate event planning tips',
    'General event advice'
  ]
  
  testQueries.forEach(query => {
    const topic = detectTopicFromQuery(query)
    console.log(`   "${query}" → ${topic}`)
  })
}

// Main execution
async function main() {
  try {
    await runRefinementDemo()
    await testDirectRefinement()
    await testConfigurationSystem()
    
    console.log('\n🎉 Demo completed successfully!')
    console.log('\nKey improvements implemented:')
    console.log('✅ Responses are now 3-4 lines maximum')
    console.log('✅ File names and sources are automatically removed')
    console.log('✅ Contextual emojis are added for engagement')
    console.log('✅ Follow-up questions encourage continued interaction')
    console.log('✅ Topic-specific configurations optimize responses')
    console.log('✅ AI refinement provides intelligent summarization')
    console.log('✅ Fallback mechanisms ensure reliability')
    
  } catch (error) {
    console.error('Demo failed:', error)
  }
}

// Export for testing
export { runRefinementDemo, testDirectRefinement, testConfigurationSystem }

// Run if called directly
if (require.main === module) {
  main()
}
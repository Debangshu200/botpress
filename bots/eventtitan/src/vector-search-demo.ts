/**
 * Vector Search Demo
 * Demonstrates the difference between basic keyword search and Botpress vector search
 */

import { searchKnowledge } from './knowledge-handler'
import { EnhancedVectorKnowledgeHandler, isVectorSearchAvailable } from './enhanced-vector-knowledge-handler'

// Mock client that simulates Botpress vector search
const createMockVectorClient = () => ({
  searchFiles: async (params: any) => {
    const { query } = params
    
    // Simulate vector search results with semantic similarity
    const mockPassages = [
      {
        content: `Wedding planning requires careful attention to detail and timeline management. Start planning 12-18 months in advance for best results. Key steps include: setting a budget, choosing a venue, selecting vendors (photographer, caterer, florist), sending invitations, and coordinating the ceremony and reception.

Essential wedding planning timeline:
- 12-18 months before: Set budget, book venue
- 8-12 months before: Select major vendors
- 6-8 months before: Send save-the-dates
- 3-6 months before: Finalize details, send invitations
- 1-3 months before: Confirm all arrangements
- Week of: Final preparations and rehearsal`,
        score: 0.92,
        file: { name: 'wedding-planning-guide.md', id: 'file_001' }
      },
      {
        content: `Venue selection is crucial for event success. Consider these factors: capacity (ensure it fits your guest count with 10% buffer), location accessibility, parking availability, catering restrictions, audio/visual equipment, decoration policies, and pricing structure.

Venue evaluation checklist:
- Capacity and layout suitability
- Location and accessibility
- Parking and transportation
- Catering kitchen and restrictions
- Audio/visual capabilities
- Decoration and setup policies
- Pricing and payment terms
- Availability for preferred dates`,
        score: 0.78,
        file: { name: 'venue-selection-guide.md', id: 'file_002' }
      },
      {
        content: `Event budgeting requires careful planning and contingency funds. Typical budget breakdown: venue (40-50%), catering (25-35%), entertainment (10-15%), decorations (8-10%), photography (5-8%), miscellaneous (5-10%). Always include a 10-15% contingency fund for unexpected expenses.

Budget categories to consider:
- Venue rental and setup fees
- Catering and beverage service
- Entertainment and speakers
- Decorations and flowers
- Photography and videography
- Transportation and accommodations
- Marketing and invitations
- Insurance and permits
- Contingency fund`,
        score: 0.65,
        file: { name: 'event-budgeting-guide.md', id: 'file_003' }
      }
    ]

    // Filter results based on query relevance (simulate semantic search)
    const queryLower = query.toLowerCase()
    let relevantPassages = mockPassages

    if (queryLower.includes('wedding')) {
      relevantPassages = mockPassages.filter(p => p.content.toLowerCase().includes('wedding'))
    } else if (queryLower.includes('venue')) {
      relevantPassages = mockPassages.filter(p => p.content.toLowerCase().includes('venue'))
    } else if (queryLower.includes('budget') || queryLower.includes('cost')) {
      relevantPassages = mockPassages.filter(p => p.content.toLowerCase().includes('budget'))
    }

    // Sort by score (highest first)
    relevantPassages.sort((a, b) => b.score - a.score)

    return {
      passages: relevantPassages.slice(0, 3) // Return top 3 results
    }
  }
})

async function runVectorSearchDemo() {
  console.log('🔍 Vector Search vs Basic Search Demo\n')
  console.log('=' .repeat(60))

  const mockClient = createMockVectorClient()
  const vectorHandler = new EnhancedVectorKnowledgeHandler(mockClient)

  const testQueries = [
    'How do I plan a wedding?',
    'What should I consider when choosing a venue?',
    'Help me create a budget for my event',
    'Wedding venue selection tips',
    'Corporate event planning costs'
  ]

  for (const query of testQueries) {
    console.log(`\n🔍 Query: "${query}"`)
    console.log('-'.repeat(50))

    // Test 1: Basic keyword search (current approach)
    console.log('\n📚 BASIC KEYWORD SEARCH (Current):')
    const basicResult = searchKnowledge(query)
    if (basicResult) {
      console.log(`✅ Found result (${basicResult.length} chars)`)
      console.log('Preview:', basicResult.substring(0, 150) + '...')
      
      // Check if it has file references
      const hasFileRefs = /\.(txt|md|pdf)/i.test(basicResult)
      console.log(`❌ Has file references: ${hasFileRefs}`)
    } else {
      console.log('❌ No result found')
    }

    // Test 2: Vector search with refinement
    console.log('\n🚀 VECTOR SEARCH + AI REFINEMENT (Enhanced):')
    try {
      const vectorResult = await vectorHandler.searchKnowledgeWithVector(query, mockClient)
      if (vectorResult) {
        console.log(`✅ Found result (${vectorResult.length} chars)`)
        console.log('Refined result:')
        console.log(vectorResult)
        
        // Check quality improvements
        const hasFileRefs = /\.(txt|md|pdf)/i.test(vectorResult)
        const hasEmojis = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(vectorResult)
        const lines = vectorResult.split('\n').filter(l => l.trim()).length
        
        console.log('\n📊 Quality Metrics:')
        console.log(`✅ No file references: ${!hasFileRefs}`)
        console.log(`✅ Has emojis: ${hasEmojis}`)
        console.log(`✅ Concise (≤4 lines): ${lines <= 4}`)
        console.log(`✅ Length appropriate: ${vectorResult.length >= 50 && vectorResult.length <= 400}`)
      } else {
        console.log('❌ No result found')
      }
    } catch (error) {
      console.error('❌ Vector search failed:', error)
    }

    // Test 3: Get search insights
    console.log('\n📈 SEARCH INSIGHTS:')
    try {
      const insights = await vectorHandler.getSearchInsights(query, mockClient)
      console.log(`📊 Total results: ${insights.totalResults}`)
      console.log(`🎯 Average score: ${insights.averageScore.toFixed(2)}`)
      console.log(`⭐ Top score: ${insights.topScore.toFixed(2)}`)
      console.log(`📁 Sources: ${insights.sources.join(', ')}`)
      console.log(`🏷️  Topics: ${insights.topics.join(', ')}`)
      console.log(`🔒 Confidence: ${(insights.confidence * 100).toFixed(1)}%`)
    } catch (error) {
      console.error('❌ Insights failed:', error)
    }

    console.log('\n' + '='.repeat(60))
  }
}

async function compareSearchMethods() {
  console.log('\n📊 Search Method Comparison\n')
  console.log('=' .repeat(60))

  const mockClient = createMockVectorClient()
  const vectorHandler = new EnhancedVectorKnowledgeHandler(mockClient)

  const testQuery = "How much does wedding planning cost?"

  console.log(`🔍 Test Query: "${testQuery}"\n`)

  // Method 1: Basic keyword search
  console.log('1️⃣  BASIC KEYWORD SEARCH:')
  console.log('   • Searches predefined knowledge base object')
  console.log('   • Uses simple string matching')
  console.log('   • Limited to exact keyword matches')
  console.log('   • No semantic understanding')
  
  const basicStart = Date.now()
  const basicResult = searchKnowledge(testQuery)
  const basicTime = Date.now() - basicStart
  
  console.log(`   ⏱️  Time: ${basicTime}ms`)
  console.log(`   📏 Result: ${basicResult ? `${basicResult.length} chars` : 'No result'}`)
  console.log(`   🎯 Relevance: ${basicResult ? 'Medium' : 'None'}`)

  // Method 2: Vector search
  console.log('\n2️⃣  VECTOR SEARCH (Botpress Built-in):')
  console.log('   • Searches uploaded files using embeddings')
  console.log('   • Uses semantic similarity matching')
  console.log('   • Understands context and meaning')
  console.log('   • Returns scored results')
  
  const vectorStart = Date.now()
  const vectorResult = await vectorHandler.searchKnowledgeWithVector(testQuery, mockClient)
  const vectorTime = Date.now() - vectorStart
  
  console.log(`   ⏱️  Time: ${vectorTime}ms`)
  console.log(`   📏 Result: ${vectorResult ? `${vectorResult.length} chars` : 'No result'}`)
  console.log(`   🎯 Relevance: ${vectorResult ? 'High' : 'None'}`)

  // Comparison summary
  console.log('\n📋 SUMMARY:')
  console.log('┌─────────────────────┬─────────────────┬─────────────────┐')
  console.log('│ Feature             │ Basic Search    │ Vector Search   │')
  console.log('├─────────────────────┼─────────────────┼─────────────────┤')
  console.log('│ Semantic matching   │ ❌ No           │ ✅ Yes          │')
  console.log('│ File upload support │ ❌ No           │ ✅ Yes          │')
  console.log('│ Relevance scoring   │ ❌ No           │ ✅ Yes          │')
  console.log('│ Context awareness   │ ❌ Limited      │ ✅ Advanced     │')
  console.log('│ Scalability         │ ❌ Limited      │ ✅ High         │')
  console.log('│ Response refinement │ ✅ Yes          │ ✅ Yes          │')
  console.log('│ Setup complexity    │ ✅ Simple       │ ✅ Simple       │')
  console.log('└─────────────────────┴─────────────────┴─────────────────┘')

  console.log('\n💡 RECOMMENDATION:')
  console.log('   Use Vector Search for production - it leverages Botpress\'s')
  console.log('   built-in embedding capabilities for much better results!')
}

async function demonstrateFileUploadIntegration() {
  console.log('\n📁 File Upload Integration Demo\n')
  console.log('=' .repeat(60))

  console.log('🔧 How to integrate with your existing file uploads:')
  console.log('')
  console.log('1️⃣  Your current file upload system:')
  console.log('   • Files in: bots/eventtitan/knowledge-upload-examples/')
  console.log('   • Upload CLI: src/upload-knowledge-cli.ts')
  console.log('   • File types: .md, .txt, .json')
  console.log('')
  console.log('2️⃣  Enhanced integration:')
  console.log('   • Upload files to Botpress knowledge base')
  console.log('   • Files automatically get vectorized')
  console.log('   • Use client.searchFiles() for semantic search')
  console.log('   • Apply refinement for clean responses')
  console.log('')
  console.log('3️⃣  Benefits:')
  console.log('   ✅ Semantic search instead of keyword matching')
  console.log('   ✅ Relevance scoring for better results')
  console.log('   ✅ Support for any file format')
  console.log('   ✅ Automatic embedding generation')
  console.log('   ✅ Scalable to large knowledge bases')
  console.log('')
  console.log('4️⃣  Implementation:')
  console.log('   • Replace searchKnowledge() with searchKnowledgeEnhanced()')
  console.log('   • Upload your existing files to Botpress knowledge base')
  console.log('   • Keep your refinement system for clean responses')
  console.log('')
  console.log('📝 Next steps:')
  console.log('   1. Upload your knowledge files to Botpress')
  console.log('   2. Update your knowledge handler to use vector search')
  console.log('   3. Test with your existing queries')
  console.log('   4. Enjoy much better search results! 🎉')
}

// Main execution
async function main() {
  try {
    await runVectorSearchDemo()
    await compareSearchMethods()
    await demonstrateFileUploadIntegration()
    
    console.log('\n🎉 Demo completed!')
    console.log('\n💡 Key Takeaway:')
    console.log('   Botpress has powerful built-in embedding and vector search.')
    console.log('   You can leverage this for much better knowledge base results!')
    
  } catch (error) {
    console.error('Demo failed:', error)
  }
}

// Export for testing
export { runVectorSearchDemo, compareSearchMethods, demonstrateFileUploadIntegration }

// Run if called directly
if (require.main === module) {
  main()
}
/**
 * Test LLM Integration with Knowledge Base
 * Interactive CLI for testing the GPT-OSS-20B + Knowledge integration
 */

// Load environment variables
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '.env') })

import { chatBridge, askEventTitan, chatWithEventTitan } from './llm-knowledge-bridge'

async function runInteractiveChat() {
  console.log('🤖 EventTitan Chat Interface')
  console.log('Powered by GPT-OSS-20B + Knowledge Base')
  console.log('Type "exit" to quit, "help" for commands, "test" to run sample questions\n')

  // Show system status
  await showSystemStatus()

  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const askQuestion = (prompt: string): Promise<string> => {
    return new Promise(resolve => {
      rl.question(prompt, resolve)
    })
  }

  while (true) {
    try {
      const userInput = await askQuestion('You: ')
      
      if (userInput.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!')
        break
      }

      if (userInput.toLowerCase() === 'help') {
        showHelp()
        continue
      }

      if (userInput.toLowerCase() === 'test') {
        await runSampleTests()
        continue
      }

      if (userInput.toLowerCase() === 'stats') {
        showKnowledgeStats()
        continue
      }

      if (userInput.toLowerCase() === 'history') {
        showHistory()
        continue
      }

      if (userInput.toLowerCase() === 'clear') {
        chatBridge.clearHistory()
        console.log('🗑️ Conversation history cleared\n')
        continue
      }

      if (userInput.trim() === '') {
        continue
      }

      // Process the message
      console.log('🤔 Thinking...')
      const startTime = Date.now()
      
      const response = await chatWithEventTitan(userInput, {
        includeDebugInfo: false
      })

      const totalTime = Date.now() - startTime

      // Display response
      console.log(`\n🤖 EventTitan: ${response.message}`)
      console.log(`\n📊 Confidence: ${(response.confidence * 100).toFixed(1)}% | Source: ${response.source} | Knowledge: ${response.knowledgeUsed ? '✅' : '❌'} | Time: ${totalTime}ms`)
      
      if (response.tokensUsed) {
        console.log(`🔤 Tokens used: ${response.tokensUsed}`)
      }

      if (response.shouldEscalate) {
        console.log('⚠️ System recommends human handoff')
      }

      console.log() // Empty line for readability

    } catch (error) {
      console.error('❌ Error:', error)
    }
  }

  rl.close()
}

async function showSystemStatus() {
  console.log('📊 System Status:')
  
  try {
    const stats = chatBridge.getKnowledgeStats()
    console.log(`   📚 Knowledge Base: ${stats.uploadedDocuments} uploaded docs + ${stats.fallbackTopics} fallback topics`)
    console.log(`   💾 Total Size: ${stats.totalSize}`)
    console.log(`   📁 File Types: ${Object.entries(stats.fileTypes).map(([type, count]) => `${type}(${count})`).join(', ') || 'None'}`)
    
    // Test GPT-OSS-20B connection
    console.log('   🧠 Testing GPT-OSS-20B connection...')
    const testResponse = await askEventTitan('Hello')
    console.log('   ✅ GPT-OSS-20B: Connected and working')
    
  } catch (error) {
    console.log('   ❌ GPT-OSS-20B: Connection failed')
    console.log('   💡 Make sure OPENROUTER_API_KEY is set in your .env file')
  }
  
  console.log()
}

function showHelp() {
  console.log('\n📖 Available Commands:')
  console.log('   help     - Show this help message')
  console.log('   test     - Run sample questions')
  console.log('   stats    - Show knowledge base statistics')
  console.log('   history  - Show conversation history')
  console.log('   clear    - Clear conversation history')
  console.log('   exit     - Quit the chat interface')
  console.log('\n💡 Tips:')
  console.log('   - Ask questions about event planning, weddings, venues, catering, etc.')
  console.log('   - The system combines knowledge base content with AI reasoning')
  console.log('   - Higher confidence scores indicate more reliable answers')
  console.log()
}

async function runSampleTests() {
  console.log('\n🧪 Running Sample Tests...\n')
  
  const testQuestions = [
    "What is event planning?",
    "How do I choose a wedding venue?",
    "What's the typical budget for a corporate event?",
    "Tell me about catering considerations",
    "How far in advance should I start planning a wedding?"
  ]

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i]
    console.log(`${i + 1}. Testing: "${question}"`)
    
    try {
      const response = await chatWithEventTitan(question)
      console.log(`   Response: ${response.message.substring(0, 100)}${response.message.length > 100 ? '...' : ''}`)
      console.log(`   Confidence: ${(response.confidence * 100).toFixed(1)}% | Source: ${response.source} | Knowledge: ${response.knowledgeUsed ? '✅' : '❌'}`)
      
      if (response.shouldEscalate) {
        console.log('   ⚠️ Would escalate to human')
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error}`)
    }
    
    console.log()
    
    // Small delay between tests
    if (i < testQuestions.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }
  
  console.log('✅ Sample tests completed!\n')
}

function showKnowledgeStats() {
  console.log('\n📊 Knowledge Base Statistics:')
  
  try {
    const stats = chatBridge.getKnowledgeStats()
    console.log(`   📚 Uploaded Documents: ${stats.uploadedDocuments}`)
    console.log(`   📖 Fallback Topics: ${stats.fallbackTopics}`)
    console.log(`   💾 Total Size: ${stats.totalSize}`)
    console.log(`   📁 File Types:`)
    
    if (Object.keys(stats.fileTypes).length > 0) {
      Object.entries(stats.fileTypes).forEach(([type, count]) => {
        console.log(`      ${type}: ${count} files`)
      })
    } else {
      console.log('      No uploaded files')
    }
    
  } catch (error) {
    console.log('   ❌ Error retrieving stats:', error)
  }
  
  console.log()
}

function showHistory() {
  console.log('\n📜 Conversation History:')
  
  const history = chatBridge.getHistory()
  
  if (history.length === 0) {
    console.log('   No conversation history yet')
  } else {
    history.forEach((entry, index) => {
      console.log(`\n   ${index + 1}. [${entry.timestamp.toLocaleTimeString()}]`)
      console.log(`      You: ${entry.user}`)
      console.log(`      Bot: ${entry.bot.substring(0, 100)}${entry.bot.length > 100 ? '...' : ''}`)
    })
  }
  
  console.log()
}

// Quick test function for non-interactive use
async function quickTest() {
  console.log('🚀 Quick Test of LLM + Knowledge Integration\n')
  
  const testQuestions = [
    "What is event planning?",
    "How much does a wedding typically cost?",
    "What should I look for in a venue?"
  ]

  for (const question of testQuestions) {
    console.log(`❓ Question: ${question}`)
    
    try {
      const response = await chatWithEventTitan(question, { includeDebugInfo: true })
      console.log(`🤖 Response: ${response.message}`)
      console.log()
    } catch (error) {
      console.log(`❌ Error: ${error}\n`)
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--quick') || args.includes('-q')) {
    await quickTest()
  } else {
    await runInteractiveChat()
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error)
}

export { runInteractiveChat, quickTest, showSystemStatus }
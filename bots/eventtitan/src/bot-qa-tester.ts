#!/usr/bin/env node

import { EnhancedKnowledgeHandler } from './enhanced-knowledge-handler'
import * as readline from 'readline'

/**
 * Interactive Q&A tester for the EventTitan bot
 * Tests the knowledge base with real questions
 */

class BotQATester {
  private knowledgeHandler: EnhancedKnowledgeHandler
  private rl: readline.Interface

  constructor() {
    this.knowledgeHandler = new EnhancedKnowledgeHandler()
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
  }

  async start(): Promise<void> {
    console.log('🤖 EventTitan Bot Q&A Tester')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    
    // Show knowledge base stats
    const stats = this.knowledgeHandler.getKnowledgeStats()
    console.log('📊 Knowledge Base Status:')
    console.log(`   📚 Uploaded Documents: ${stats.uploadedDocuments}`)
    console.log(`   💾 Total Size: ${stats.totalSize}`)
    console.log(`   📋 File Types: ${Object.entries(stats.fileTypes).map(([type, count]) => `${type}(${count})`).join(', ')}`)
    console.log('')
    
    console.log('💡 Try asking questions about:')
    console.log('   • Event planning basics')
    console.log('   • Venue selection')
    console.log('   • Catering options')
    console.log('   • Budget planning')
    console.log('   • Wedding planning')
    console.log('')
    console.log('Type "help" for sample questions, "stats" for knowledge stats, or "quit" to exit.')
    console.log('')

    await this.startInteractiveSession()
  }

  private async startInteractiveSession(): Promise<void> {
    while (true) {
      const question = await this.askQuestion('🙋 Ask me anything: ')
      
      if (question.toLowerCase() === 'quit' || question.toLowerCase() === 'exit') {
        console.log('👋 Thanks for testing the EventTitan bot!')
        break
      }
      
      if (question.toLowerCase() === 'help') {
        this.showSampleQuestions()
        continue
      }
      
      if (question.toLowerCase() === 'stats') {
        this.showDetailedStats()
        continue
      }
      
      if (question.toLowerCase() === 'list') {
        this.listDocuments()
        continue
      }
      
      if (question.trim() === '') {
        continue
      }

      await this.processQuestion(question)
    }
    
    this.rl.close()
  }

  private async processQuestion(question: string): Promise<void> {
    console.log('')
    console.log('🔍 Searching knowledge base...')
    
    const startTime = Date.now()
    const result = this.knowledgeHandler.searchKnowledge(question)
    const searchTime = Date.now() - startTime

    console.log('')
    console.log('📋 Search Results:')
    console.log(`   🎯 Source: ${result.source}`)
    console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(1)}%`)
    console.log(`   ⏱️  Search Time: ${searchTime}ms`)
    console.log(`   📄 Documents Found: ${result.documents.length}`)
    
    if (result.documents.length > 0) {
      console.log('   📚 Relevant Documents:')
      result.documents.slice(0, 3).forEach((doc, index) => {
        console.log(`      ${index + 1}. ${doc.name}`)
      })
    }
    
    console.log('')
    
    if (result.content) {
      console.log('🤖 EventTitan Bot Response:')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      // Format the response nicely
      const formattedResponse = this.formatBotResponse(result.content, result.confidence)
      console.log(formattedResponse)
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } else {
      console.log('❌ No relevant information found in the knowledge base.')
      console.log('💡 Try rephrasing your question or ask about event planning topics.')
    }
    
    console.log('')
  }

  private formatBotResponse(content: string, confidence: number): string {
    let response = content
    
    // Add confidence indicator
    const confidenceIndicator = this.getConfidenceIndicator(confidence)
    
    // Add helpful suggestions based on confidence
    if (confidence < 0.7) {
      response += '\n\n💡 If this doesn\'t fully answer your question, try asking more specifically or contact our support team.'
    }
    
    response += `\n\n${confidenceIndicator}`
    
    return response
  }

  private getConfidenceIndicator(confidence: number): string {
    if (confidence >= 0.9) {
      return '✅ High confidence response from knowledge base'
    } else if (confidence >= 0.7) {
      return '📋 Response from knowledge base'
    } else if (confidence >= 0.5) {
      return '📝 Partial match from knowledge base'
    } else {
      return '⚠️ Limited confidence - consider rephrasing your question'
    }
  }

  private showSampleQuestions(): void {
    console.log('')
    console.log('💡 Sample Questions to Try:')
    console.log('')
    console.log('📅 Event Planning:')
    console.log('   • "How far in advance should I start planning my event?"')
    console.log('   • "What are the key phases of event planning?"')
    console.log('   • "How do I create an event timeline?"')
    console.log('')
    console.log('🏢 Venue Selection:')
    console.log('   • "What should I look for when choosing a venue?"')
    console.log('   • "How do I determine the right venue capacity?"')
    console.log('   • "What questions should I ask venue coordinators?"')
    console.log('')
    console.log('🍽️ Catering:')
    console.log('   • "What are the different catering service styles?"')
    console.log('   • "How do I handle dietary restrictions?"')
    console.log('   • "What should I budget for catering?"')
    console.log('')
    console.log('💰 Budget Planning:')
    console.log('   • "How do I create an event budget?"')
    console.log('   • "What percentage should I allocate to different categories?"')
    console.log('   • "Should I include a contingency fund?"')
    console.log('')
    console.log('💒 Wedding Planning:')
    console.log('   • "When should I start planning my wedding?"')
    console.log('   • "What are the essential wedding planning steps?"')
    console.log('   • "How do I choose wedding vendors?"')
    console.log('')
  }

  private showDetailedStats(): void {
    const stats = this.knowledgeHandler.getKnowledgeStats()
    const documents = this.knowledgeHandler.listDocuments()
    
    console.log('')
    console.log('📊 Detailed Knowledge Base Statistics:')
    console.log('')
    console.log(`📚 Total Documents: ${stats.uploadedDocuments}`)
    console.log(`📄 Fallback Topics: ${stats.fallbackTopics}`)
    console.log(`💾 Total Size: ${stats.totalSize}`)
    console.log('')
    console.log('📋 File Types:')
    Object.entries(stats.fileTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} files`)
    })
    console.log('')
  }

  private listDocuments(): void {
    const documents = this.knowledgeHandler.listDocuments()
    
    console.log('')
    console.log('📄 Available Documents:')
    console.log('')
    
    if (documents.length === 0) {
      console.log('   No documents uploaded yet.')
      console.log('   Use: npm run upload-knowledge -- <file-path>')
    } else {
      documents.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.name} (${doc.size})`)
        console.log(`      📅 Uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}`)
        console.log(`      🏷️  Tags: ${doc.tags.slice(0, 5).join(', ')}${doc.tags.length > 5 ? '...' : ''}`)
        console.log('')
      })
    }
  }

  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim())
      })
    })
  }
}

// Run the tester if called directly
if (require.main === module) {
  const tester = new BotQATester()
  tester.start().catch(error => {
    console.error('❌ Error running Q&A tester:', error)
    process.exit(1)
  })
}

export { BotQATester }
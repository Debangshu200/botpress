#!/usr/bin/env node

import { KnowledgeFileUploader } from './knowledge-file-uploader'
import { EnhancedKnowledgeHandler } from './enhanced-knowledge-handler'
import * as path from 'path'

/**
 * Test script to verify knowledge upload functionality
 */

async function runTests(): Promise<void> {
  console.log('🧪 Testing Knowledge Upload System...\n')

  // Test 1: File Uploader
  console.log('📁 Test 1: File Uploader')
  const uploader = new KnowledgeFileUploader()
  
  try {
    // Test uploading example files
    const exampleFiles = [
      './knowledge-upload-examples/event-planning-faq.md',
      './knowledge-upload-examples/venue-selection-guide.txt',
      './knowledge-upload-examples/catering-options.json'
    ]

    for (const filePath of exampleFiles) {
      const result = await uploader.uploadFile(filePath)
      if (result.success) {
        console.log(`✅ Uploaded: ${result.fileName} (${result.contentLength} chars)`)
      } else {
        console.log(`❌ Failed: ${result.fileName} - ${result.error}`)
      }
    }

    // Show statistics
    const stats = uploader.getStatistics()
    console.log(`\n📊 Statistics:`)
    console.log(`   Documents: ${stats.totalDocuments}`)
    console.log(`   Total Size: ${formatFileSize(stats.totalSize)}`)
    console.log(`   File Types: ${Object.keys(stats.fileTypes).join(', ')}`)

  } catch (error) {
    console.error('❌ File uploader test failed:', error)
  }

  // Test 2: Enhanced Knowledge Handler
  console.log('\n🔍 Test 2: Enhanced Knowledge Handler')
  const handler = new EnhancedKnowledgeHandler()

  try {
    // Test search queries
    const testQueries = [
      'How do I select a venue?',
      'What should I budget for catering?',
      'When should I start planning my event?',
      'What are the different catering styles?'
    ]

    for (const query of testQueries) {
      const result = handler.searchKnowledge(query)
      console.log(`\n🔎 Query: "${query}"`)
      console.log(`   Source: ${result.source}`)
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`)
      console.log(`   Found Content: ${result.content ? 'Yes' : 'No'}`)
      
      if (result.content) {
        const preview = result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '')
        console.log(`   Preview: ${preview}`)
      }
    }

    // Test adding content programmatically
    console.log('\n➕ Test 3: Adding Content Programmatically')
    const addResult = await handler.addContent(
      'Test Document',
      'This is a test document created programmatically. It contains information about testing the knowledge upload system.',
      ['test', 'documentation', 'system']
    )
    
    if (addResult) {
      console.log('✅ Successfully added programmatic content')
      
      // Test searching for the new content
      const searchResult = handler.searchKnowledge('test document')
      console.log(`   Search for new content: ${searchResult.content ? 'Found' : 'Not found'}`)
    } else {
      console.log('❌ Failed to add programmatic content')
    }

  } catch (error) {
    console.error('❌ Enhanced handler test failed:', error)
  }

  // Test 3: Document Management
  console.log('\n📋 Test 4: Document Management')
  try {
    const documents = handler.listDocuments()
    console.log(`📚 Total documents in knowledge base: ${documents.length}`)
    
    if (documents.length > 0) {
      console.log('\n📄 Document List:')
      documents.slice(0, 5).forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.name} (${doc.size})`)
        console.log(`      Tags: ${doc.tags.join(', ')}`)
        console.log(`      Uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}`)
      })
      
      if (documents.length > 5) {
        console.log(`   ... and ${documents.length - 5} more documents`)
      }
    }

    // Show knowledge stats
    const knowledgeStats = handler.getKnowledgeStats()
    console.log('\n📈 Knowledge Base Statistics:')
    console.log(`   Uploaded Documents: ${knowledgeStats.uploadedDocuments}`)
    console.log(`   Fallback Topics: ${knowledgeStats.fallbackTopics}`)
    console.log(`   Total Size: ${knowledgeStats.totalSize}`)
    console.log(`   File Types: ${Object.entries(knowledgeStats.fileTypes).map(([type, count]) => `${type}(${count})`).join(', ')}`)

  } catch (error) {
    console.error('❌ Document management test failed:', error)
  }

  console.log('\n🎉 Knowledge Upload System Tests Completed!')
  console.log('\n💡 Next Steps:')
  console.log('   1. Upload your own files using: npm run upload-knowledge -- <file-path>')
  console.log('   2. Check statistics with: npm run knowledge-stats')
  console.log('   3. Test bot responses with your uploaded content')
  console.log('   4. See KNOWLEDGE-UPLOAD-GUIDE.md for detailed usage instructions')
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  })
}

export { runTests }
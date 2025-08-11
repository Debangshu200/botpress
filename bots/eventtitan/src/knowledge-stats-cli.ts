#!/usr/bin/env node

import { KnowledgeFileUploader } from './knowledge-file-uploader'

/**
 * Simple CLI to show knowledge base statistics
 */

async function showStats(): Promise<void> {
  try {
    const uploader = new KnowledgeFileUploader()
    const stats = uploader.getStatistics()
    
    console.log('📊 Knowledge Base Statistics:')
    console.log('')
    console.log(`📚 Total Documents: ${stats.totalDocuments}`)
    console.log(`💾 Total Size: ${formatFileSize(stats.totalSize)}`)
    console.log(`📝 Total Content: ${stats.totalContentLength.toLocaleString()} characters`)
    console.log(`📄 Average Content: ${Math.round(stats.averageContentLength).toLocaleString()} characters`)
    
    if (Object.keys(stats.fileTypes).length > 0) {
      console.log('📋 File Types:')
      for (const [type, count] of Object.entries(stats.fileTypes)) {
        console.log(`   ${type}: ${count}`)
      }
    }

    // List all documents
    const documents = uploader.getAllDocuments()
    if (documents.length > 0) {
      console.log('')
      console.log('📄 Documents:')
      documents.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.name} (${formatFileSize(doc.fileSize)})`)
        console.log(`      📅 Uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}`)
        console.log(`      🏷️  Tags: ${doc.tags.slice(0, 5).join(', ')}${doc.tags.length > 5 ? '...' : ''}`)
      })
    }

  } catch (error) {
    console.error('❌ Error getting statistics:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
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

// Run if called directly
if (require.main === module) {
  showStats()
}

export { showStats }
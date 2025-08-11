/**
 * URL Content Extraction Demo
 * 
 * Demonstrates how to use the URL content extraction and knowledge integration
 * functionality for processing web pages into the knowledge base.
 */

import { 
  extractUrlContent, 
  createUrlContentExtractor,
  type UrlExtractionOptions 
} from './url-content-extractor'
import { 
  processUrlForKnowledge, 
  createUrlKnowledgeIntegrator,
  type UrlKnowledgeOptions 
} from './url-knowledge-integration'

/**
 * Demo: Basic URL content extraction
 */
async function demoBasicExtraction() {
  console.log('=== Basic URL Content Extraction Demo ===')
  
  const url = 'https://example.com/docs/api-guide'
  
  try {
    const result = await extractUrlContent(url)
    
    if (result.success && result.content) {
      console.log('✅ Successfully extracted content from:', url)
      console.log('Title:', result.content.title)
      console.log('Content length:', result.content.content.length, 'characters')
      console.log('Headings found:', result.content.structure?.headings.length || 0)
      console.log('Links found:', result.content.structure?.links.length || 0)
      console.log('Images found:', result.content.structure?.images.length || 0)
      console.log('Description:', result.content.metadata.description || 'None')
      console.log('Language:', result.content.metadata.language || 'Unknown')
    } else {
      console.log('❌ Failed to extract content:', result.error?.message)
      console.log('Error type:', result.error?.type)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
  
  console.log('')
}

/**
 * Demo: Advanced URL extraction with custom options
 */
async function demoAdvancedExtraction() {
  console.log('=== Advanced URL Content Extraction Demo ===')
  
  const extractor = createUrlContentExtractor()
  
  const options: UrlExtractionOptions = {
    url: 'https://example.com/large-document',
    timeout: 15000, // 15 seconds
    maxContentLength: 2 * 1024 * 1024, // 2MB
    userAgent: 'EventTitan-Bot/1.0 (Knowledge Indexer)',
    followRedirects: true
  }
  
  try {
    const result = await extractor.extractContent(options)
    
    if (result.success && result.content) {
      console.log('✅ Successfully extracted content with custom options')
      console.log('Final URL:', result.content.metadata.finalUrl)
      console.log('Content type:', result.content.metadata.contentType)
      console.log('Status code:', result.content.metadata.statusCode)
      console.log('Content length:', result.content.metadata.contentLength, 'bytes')
      console.log('Last modified:', result.content.metadata.lastModified || 'Unknown')
      
      // Show document structure
      if (result.content.structure) {
        console.log('\nDocument Structure:')
        result.content.structure.headings.forEach((heading, index) => {
          console.log(`  H${heading.level}: ${heading.text}${heading.id ? ` (id: ${heading.id})` : ''}`)
        })
        
        console.log(`\nParagraphs: ${result.content.structure.paragraphs}`)
        console.log(`External links: ${result.content.structure.links.filter(l => l.isExternal).length}`)
        console.log(`Internal links: ${result.content.structure.links.filter(l => !l.isExternal).length}`)
      }
    } else {
      console.log('❌ Failed to extract content:', result.error?.message)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
  
  console.log('')
}

/**
 * Demo: Batch URL processing
 */
async function demoBatchExtraction() {
  console.log('=== Batch URL Processing Demo ===')
  
  const extractor = createUrlContentExtractor()
  
  const urls = [
    'https://example.com/page1',
    'https://example.com/page2',
    'https://example.com/page3',
    'https://invalid-url-that-will-fail.com/404'
  ]
  
  try {
    const results = await extractor.extractMultipleUrls(urls)
    
    console.log(`Processed ${results.length} URLs:`)
    
    results.forEach((result, index) => {
      const url = urls[index]
      if (result.success && result.content) {
        console.log(`✅ ${url}: ${result.content.title} (${result.content.content.length} chars)`)
      } else {
        console.log(`❌ ${url}: ${result.error?.type} - ${result.error?.message}`)
      }
    })
    
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length
    
    console.log(`\nSummary: ${successCount} successful, ${failureCount} failed`)
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
  
  console.log('')
}

/**
 * Demo: Knowledge base integration
 */
async function demoKnowledgeIntegration() {
  console.log('=== Knowledge Base Integration Demo ===')
  
  const integrator = createUrlKnowledgeIntegrator()
  
  const urlOptions: UrlKnowledgeOptions = {
    url: 'https://example.com/api-documentation',
    title: 'API Documentation Guide',
    tags: ['api', 'documentation', 'reference'],
    category: 'technical',
    timeout: 20000
  }
  
  try {
    const result = await integrator.processUrl(urlOptions)
    
    if (result.success && result.content) {
      console.log('✅ Successfully processed URL for knowledge base')
      console.log('Document ID:', result.documentId)
      console.log('Title:', result.content.title)
      console.log('Content length:', result.content.content.length, 'characters')
      console.log('Tags:', result.content.metadata.tags?.join(', ') || 'None')
      console.log('Category:', result.content.metadata.category || 'None')
      console.log('Processed at:', result.content.processedAt.toISOString())
      
      // Show metadata
      console.log('\nMetadata:')
      console.log('  Original URL:', result.content.metadata.originalUrl)
      console.log('  Final URL:', result.content.metadata.finalUrl)
      console.log('  Content type:', result.content.metadata.contentType)
      console.log('  Description:', result.content.metadata.description || 'None')
      console.log('  Keywords:', result.content.metadata.keywords?.join(', ') || 'None')
      console.log('  Author:', result.content.metadata.author || 'Unknown')
      console.log('  Language:', result.content.metadata.language || 'Unknown')
      
      // Show structure stats
      console.log('\nStructure Statistics:')
      console.log('  Headings:', result.content.metadata.headingCount)
      console.log('  Paragraphs:', result.content.metadata.paragraphCount)
      console.log('  Links:', result.content.metadata.linkCount)
      console.log('  Images:', result.content.metadata.imageCount)
      
    } else {
      console.log('❌ Failed to process URL for knowledge base:', result.error?.message)
      console.log('Error type:', result.error?.type)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
  
  console.log('')
}

/**
 * Demo: Batch knowledge processing
 */
async function demoBatchKnowledgeProcessing() {
  console.log('=== Batch Knowledge Processing Demo ===')
  
  const integrator = createUrlKnowledgeIntegrator()
  
  const urlOptions: UrlKnowledgeOptions[] = [
    {
      url: 'https://example.com/getting-started',
      title: 'Getting Started Guide',
      tags: ['tutorial', 'beginner'],
      category: 'documentation'
    },
    {
      url: 'https://example.com/advanced-features',
      title: 'Advanced Features',
      tags: ['advanced', 'features'],
      category: 'documentation'
    },
    {
      url: 'https://example.com/troubleshooting',
      title: 'Troubleshooting Guide',
      tags: ['help', 'troubleshooting'],
      category: 'support'
    }
  ]
  
  try {
    const results = await integrator.processMultipleUrls(urlOptions)
    
    console.log(`Processed ${results.length} URLs for knowledge base:`)
    
    results.forEach((result, index) => {
      const options = urlOptions[index]
      if (result.success && result.content) {
        console.log(`✅ ${options.url}`)
        console.log(`   Document ID: ${result.documentId}`)
        console.log(`   Title: ${result.content.title}`)
        console.log(`   Category: ${result.content.metadata.category}`)
        console.log(`   Content: ${result.content.content.length} characters`)
      } else {
        console.log(`❌ ${options.url}: ${result.error?.message}`)
      }
    })
    
    // Show processing statistics
    const stats = integrator.getProcessingStats()
    console.log(`\nProcessing Statistics:`)
    console.log(`Total processed: ${stats.totalProcessed}`)
    console.log(`Processed URLs: ${stats.processedUrls.join(', ')}`)
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }
  
  console.log('')
}

/**
 * Demo: Error handling scenarios
 */
async function demoErrorHandling() {
  console.log('=== Error Handling Demo ===')
  
  const testCases = [
    {
      name: 'Invalid URL',
      url: 'not-a-valid-url'
    },
    {
      name: 'Private IP',
      url: 'http://192.168.1.1/admin'
    },
    {
      name: 'Non-HTTP protocol',
      url: 'ftp://example.com/file.txt'
    },
    {
      name: 'Localhost',
      url: 'http://localhost:3000/api'
    }
  ]
  
  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`)
      const result = await extractUrlContent(testCase.url)
      
      if (result.success) {
        console.log('  ✅ Unexpectedly succeeded')
      } else {
        console.log(`  ❌ Expected failure: ${result.error?.type} - ${result.error?.message}`)
      }
    } catch (error) {
      console.log(`  ❌ Exception: ${error}`)
    }
  }
  
  console.log('')
}

/**
 * Run all demos
 */
async function runAllDemos() {
  console.log('🚀 URL Content Extraction and Knowledge Integration Demos\n')
  
  await demoBasicExtraction()
  await demoAdvancedExtraction()
  await demoBatchExtraction()
  await demoKnowledgeIntegration()
  await demoBatchKnowledgeProcessing()
  await demoErrorHandling()
  
  console.log('✨ All demos completed!')
}

// Export for use in other files
export {
  demoBasicExtraction,
  demoAdvancedExtraction,
  demoBatchExtraction,
  demoKnowledgeIntegration,
  demoBatchKnowledgeProcessing,
  demoErrorHandling,
  runAllDemos
}

// Run demos if this file is executed directly
if (require.main === module) {
  runAllDemos().catch(console.error)
}
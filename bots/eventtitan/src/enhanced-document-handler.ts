/**
 * Enhanced Document Handler with LangChain Integration
 * Combines Botpress knowledge base with LangChain workflows
 */

import { langchainOrchestrator, DocumentInput, WorkflowType } from './langchain-document-orchestrator'
import { KnowledgeResponseRefiner } from './knowledge-response-refiner'

export interface DocumentProcessingOptions {
  useLangChain?: boolean
  workflow?: WorkflowType
  uploadToBotpress?: boolean
  generateQA?: boolean
  createSummary?: boolean
}

export class EnhancedDocumentHandler {
  private refiner: KnowledgeResponseRefiner

  constructor(client?: any) {
    this.refiner = new KnowledgeResponseRefiner(client)
  }

  /**
   * Process documents with optional LangChain orchestration
   */
  async processDocuments(
    documents: DocumentInput[],
    client: any,
    options: DocumentProcessingOptions = {}
  ): Promise<{
    success: boolean
    processedDocuments: any[]
    summary?: string
    qaPairs?: Array<{ question: string; answer: string }>
    knowledgeGraphData?: any
    botpressFileIds?: string[]
  }> {
    const results = {
      success: false,
      processedDocuments: [],
      botpressFileIds: []
    }

    try {
      // Step 1: LangChain processing if enabled
      if (options.useLangChain && options.workflow) {
        console.info('Processing documents with LangChain workflow:', options.workflow)
        
        const orchestrationResult = await langchainOrchestrator.orchestrateDocuments({
          documents,
          workflow: options.workflow,
          parameters: {
            outputFormat: 'json',
            maxTokens: 2000
          }
        })

        if (orchestrationResult.success) {
          results.processedDocuments = orchestrationResult.result
          
          // Generate summary if requested
          if (options.createSummary) {
            results.summary = await langchainOrchestrator.summarizeMultipleDocuments(documents, {
              maxSummaryLength: 300,
              includeKeyPoints: true
            })
          }

          // Generate Q&A pairs if requested
          if (options.generateQA) {
            results.qaPairs = await langchainOrchestrator.generateQAPairs(documents, 5)
          }
        }
      }

      // Step 2: Upload to Botpress knowledge base if requested
      if (options.uploadToBotpress) {
        console.info('Uploading processed documents to Botpress knowledge base')
        
        for (const doc of documents) {
          try {
            // Create file in Botpress
            const file = await client.uploadFile({
              key: `processed_${Date.now()}_${doc.metadata.title || 'document'}`,
              content: doc.content,
              tags: {
                source: doc.metadata.source,
                type: doc.metadata.type,
                processed_by: 'langchain',
                ...(doc.metadata.tags && { tags: doc.metadata.tags.join(',') })
              }
            })

            results.botpressFileIds.push(file.id)
            console.info('Document uploaded to Botpress:', file.id)
          } catch (uploadError) {
            console.error('Failed to upload document to Botpress:', uploadError)
          }
        }
      }

      results.success = true
      return results

    } catch (error) {
      console.error('Document processing failed:', error)
      return {
        ...results,
        success: false
      }
    }
  }

  /**
   * Smart document routing based on content analysis
   */
  async smartDocumentRouting(
    documents: DocumentInput[],
    client: any
  ): Promise<{
    eventPlanning: DocumentInput[]
    venue: DocumentInput[]
    catering: DocumentInput[]
    budget: DocumentInput[]
    other: DocumentInput[]
  }> {
    const categories = ['event_planning', 'venue', 'catering', 'budget', 'other']
    
    const classification = await langchainOrchestrator.classifyAndRoute(documents, categories)
    
    if (!classification) {
      // Fallback to simple keyword-based classification
      return this.fallbackClassification(documents)
    }

    return {
      eventPlanning: classification.event_planning || [],
      venue: classification.venue || [],
      catering: classification.catering || [],
      budget: classification.budget || [],
      other: classification.other || []
    }
  }

  /**
   * Create enhanced knowledge entries from documents
   */
  async createEnhancedKnowledgeEntries(
    documents: DocumentInput[],
    client: any
  ): Promise<string[]> {
    const fileIds: string[] = []

    try {
      // Generate Q&A pairs for better searchability
      const qaPairs = await langchainOrchestrator.generateQAPairs(documents, 10)
      
      if (qaPairs) {
        // Create structured knowledge entries
        for (const qa of qaPairs) {
          const enhancedContent = `
# ${qa.question}

${qa.answer}

---
*Generated from document analysis*
`

          const file = await client.uploadFile({
            key: `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            content: enhancedContent,
            tags: {
              type: 'qa_pair',
              generated: 'true',
              source: 'langchain_orchestration'
            }
          })

          fileIds.push(file.id)
        }
      }

      // Create summary documents
      const summary = await langchainOrchestrator.summarizeMultipleDocuments(documents, {
        maxSummaryLength: 500,
        includeKeyPoints: true,
        crossReference: true
      })

      if (summary) {
        const summaryFile = await client.uploadFile({
          key: `summary_${Date.now()}`,
          content: `# Document Summary\n\n${summary}`,
          tags: {
            type: 'summary',
            generated: 'true',
            source: 'langchain_orchestration'
          }
        })

        fileIds.push(summaryFile.id)
      }

      return fileIds

    } catch (error) {
      console.error('Failed to create enhanced knowledge entries:', error)
      return fileIds
    }
  }

  /**
   * Fallback classification using simple keyword matching
   */
  private fallbackClassification(documents: DocumentInput[]) {
    const result = {
      eventPlanning: [] as DocumentInput[],
      venue: [] as DocumentInput[],
      catering: [] as DocumentInput[],
      budget: [] as DocumentInput[],
      other: [] as DocumentInput[]
    }

    documents.forEach(doc => {
      const content = doc.content.toLowerCase()
      
      if (content.includes('venue') || content.includes('location') || content.includes('space')) {
        result.venue.push(doc)
      } else if (content.includes('catering') || content.includes('food') || content.includes('menu')) {
        result.catering.push(doc)
      } else if (content.includes('budget') || content.includes('cost') || content.includes('price')) {
        result.budget.push(doc)
      } else if (content.includes('planning') || content.includes('event') || content.includes('organize')) {
        result.eventPlanning.push(doc)
      } else {
        result.other.push(doc)
      }
    })

    return result
  }

  /**
   * Update client for refinement
   */
  updateClient(client: any): void {
    this.refiner.updateClient(client)
  }
}

// Export singleton
export const enhancedDocumentHandler = new EnhancedDocumentHandler()
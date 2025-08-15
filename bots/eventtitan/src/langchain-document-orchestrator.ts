/**
 * LangChain Document Orchestration Integration
 * Handles complex document workflows and processing
 */

import axios from 'axios'

export interface DocumentOrchestrationRequest {
  documents: DocumentInput[]
  workflow: WorkflowType
  parameters: WorkflowParameters
}

export interface DocumentInput {
  content: string
  metadata: {
    source: string
    type: 'pdf' | 'txt' | 'md' | 'docx' | 'url'
    title?: string
    tags?: string[]
  }
}

export type WorkflowType = 
  | 'summarize_multi_docs'
  | 'extract_key_points'
  | 'compare_documents'
  | 'generate_qa_pairs'
  | 'create_knowledge_graph'
  | 'classify_and_route'

export interface WorkflowParameters {
  maxTokens?: number
  temperature?: number
  outputFormat?: 'json' | 'markdown' | 'text'
  customPrompt?: string
  [key: string]: any
}

export interface OrchestrationResult {
  success: boolean
  result: any
  metadata: {
    processingTime: number
    tokensUsed: number
    workflow: WorkflowType
    documentsProcessed: number
  }
  error?: string
}

export class LangChainDocumentOrchestrator {
  private serviceUrl: string
  private apiKey?: string

  constructor(serviceUrl: string = 'http://localhost:8000', apiKey?: string) {
    this.serviceUrl = serviceUrl
    this.apiKey = apiKey
  }

  /**
   * Process documents through LangChain workflow
   */
  async orchestrateDocuments(
    request: DocumentOrchestrationRequest
  ): Promise<OrchestrationResult> {
    try {
      const response = await axios.post(
        `${this.serviceUrl}/orchestrate`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
          },
          timeout: 60000 // 60 second timeout for complex workflows
        }
      )

      return response.data
    } catch (error) {
      console.error('LangChain orchestration failed:', error)
      return {
        success: false,
        result: null,
        metadata: {
          processingTime: 0,
          tokensUsed: 0,
          workflow: request.workflow,
          documentsProcessed: 0
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Summarize multiple documents with cross-referencing
   */
  async summarizeMultipleDocuments(
    documents: DocumentInput[],
    options: {
      maxSummaryLength?: number
      includeKeyPoints?: boolean
      crossReference?: boolean
    } = {}
  ): Promise<string | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'summarize_multi_docs',
      parameters: {
        maxTokens: options.maxSummaryLength || 500,
        includeKeyPoints: options.includeKeyPoints ?? true,
        crossReference: options.crossReference ?? true,
        outputFormat: 'markdown'
      }
    })

    return result.success ? result.result.summary : null
  }

  /**
   * Extract and organize key points from documents
   */
  async extractKeyPoints(
    documents: DocumentInput[],
    categories?: string[]
  ): Promise<{ [category: string]: string[] } | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'extract_key_points',
      parameters: {
        categories: categories || ['main_points', 'action_items', 'decisions'],
        outputFormat: 'json'
      }
    })

    return result.success ? result.result.keyPoints : null
  }

  /**
   * Compare documents and highlight differences/similarities
   */
  async compareDocuments(
    documents: DocumentInput[],
    comparisonType: 'differences' | 'similarities' | 'both' = 'both'
  ): Promise<string | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'compare_documents',
      parameters: {
        comparisonType,
        outputFormat: 'markdown'
      }
    })

    return result.success ? result.result.comparison : null
  }

  /**
   * Generate Q&A pairs from documents for knowledge base
   */
  async generateQAPairs(
    documents: DocumentInput[],
    numPairs: number = 10
  ): Promise<Array<{ question: string; answer: string }> | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'generate_qa_pairs',
      parameters: {
        numPairs,
        outputFormat: 'json'
      }
    })

    return result.success ? result.result.qaPairs : null
  }

  /**
   * Create knowledge graph from documents
   */
  async createKnowledgeGraph(
    documents: DocumentInput[]
  ): Promise<{ nodes: any[], edges: any[] } | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'create_knowledge_graph',
      parameters: {
        outputFormat: 'json'
      }
    })

    return result.success ? result.result.graph : null
  }

  /**
   * Classify documents and route to appropriate handlers
   */
  async classifyAndRoute(
    documents: DocumentInput[],
    categories: string[]
  ): Promise<{ [category: string]: DocumentInput[] } | null> {
    const result = await this.orchestrateDocuments({
      documents,
      workflow: 'classify_and_route',
      parameters: {
        categories,
        outputFormat: 'json'
      }
    })

    return result.success ? result.result.classification : null
  }
}

// Export singleton instance
export const langchainOrchestrator = new LangChainDocumentOrchestrator()
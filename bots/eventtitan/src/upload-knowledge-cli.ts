#!/usr/bin/env node

import { KnowledgeFileUploader } from './knowledge-file-uploader'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Command Line Interface for Knowledge Base File Upload
 * Usage: npm run upload-knowledge -- [options] <files...>
 */

interface CLIOptions {
  directory?: string
  recursive?: boolean
  maxSize?: string
  extensions?: string
  overwrite?: boolean
  verbose?: boolean
  help?: boolean
}

class KnowledgeUploadCLI {
  private uploader: KnowledgeFileUploader

  constructor() {
    this.uploader = new KnowledgeFileUploader({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedExtensions: ['.txt', '.md', '.json', '.csv', '.html', '.xml', '.rtf'],
      enableChunking: true,
      chunkSize: 2000,
      extractKeywords: true,
      generateTags: true,
      overwriteExisting: false,
      validateContent: true
    })
  }

  async run(): Promise<void> {
    const args = process.argv.slice(2)
    const options = this.parseArguments(args)

    if (options.help || args.length === 0) {
      this.showHelp()
      return
    }

    try {
      if (options.directory) {
        await this.uploadDirectory(options.directory, options)
      } else {
        const files = args.filter(arg => !arg.startsWith('--'))
        if (files.length === 0) {
          console.error('❌ No files specified')
          this.showHelp()
          return
        }
        await this.uploadFiles(files, options)
      }

      // Show statistics
      await this.showStatistics()

    } catch (error) {
      console.error('❌ Upload failed:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  }

  private parseArguments(args: string[]): CLIOptions {
    const options: CLIOptions = {}

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      switch (arg) {
        case '--directory':
        case '-d':
          options.directory = args[++i]
          break
        case '--recursive':
        case '-r':
          options.recursive = true
          break
        case '--max-size':
          options.maxSize = args[++i]
          break
        case '--extensions':
        case '-e':
          options.extensions = args[++i]
          break
        case '--overwrite':
        case '-o':
          options.overwrite = true
          break
        case '--verbose':
        case '-v':
          options.verbose = true
          break
        case '--help':
        case '-h':
          options.help = true
          break
      }
    }

    return options
  }

  private async uploadFiles(filePaths: string[], options: CLIOptions): Promise<void> {
    console.log(`📁 Uploading ${filePaths.length} file(s)...`)
    console.log('')

    // Update uploader options
    if (options.overwrite) {
      this.uploader = new KnowledgeFileUploader({
        ...this.uploader['options'],
        overwriteExisting: true
      })
    }

    const results = await this.uploader.uploadFiles(filePaths)
    
    let successCount = 0
    let failureCount = 0

    for (const result of results) {
      if (result.success) {
        successCount++
        console.log(`✅ ${result.fileName}`)
        if (options.verbose) {
          console.log(`   📊 Size: ${this.formatFileSize(result.fileSize)}`)
          console.log(`   📝 Content: ${result.contentLength} characters`)
          console.log(`   ⏱️  Time: ${result.processingTime}ms`)
          if (result.warnings.length > 0) {
            console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`)
          }
        }
      } else {
        failureCount++
        console.log(`❌ ${result.fileName}: ${result.error}`)
        if (result.warnings.length > 0) {
          console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`)
        }
      }
    }

    console.log('')
    console.log(`📈 Summary: ${successCount} successful, ${failureCount} failed`)
  }

  private async uploadDirectory(directoryPath: string, options: CLIOptions): Promise<void> {
    console.log(`📁 Uploading files from directory: ${directoryPath}`)
    if (options.recursive) {
      console.log('🔄 Recursive mode enabled')
    }
    console.log('')

    // Update uploader options
    if (options.overwrite) {
      this.uploader = new KnowledgeFileUploader({
        ...this.uploader['options'],
        overwriteExisting: true
      })
    }

    const results = await this.uploader.uploadDirectory(directoryPath, options.recursive)
    
    let successCount = 0
    let failureCount = 0

    for (const result of results) {
      if (result.success) {
        successCount++
        console.log(`✅ ${result.fileName}`)
        if (options.verbose) {
          console.log(`   📊 Size: ${this.formatFileSize(result.fileSize)}`)
          console.log(`   📝 Content: ${result.contentLength} characters`)
          console.log(`   ⏱️  Time: ${result.processingTime}ms`)
          if (result.warnings.length > 0) {
            console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`)
          }
        }
      } else {
        failureCount++
        console.log(`❌ ${result.fileName}: ${result.error}`)
        if (result.warnings.length > 0) {
          console.log(`   ⚠️  Warnings: ${result.warnings.join(', ')}`)
        }
      }
    }

    console.log('')
    console.log(`📈 Summary: ${successCount} successful, ${failureCount} failed`)
  }

  private async showStatistics(): Promise<void> {
    const stats = this.uploader.getStatistics()
    
    console.log('')
    console.log('📊 Knowledge Base Statistics:')
    console.log(`   📚 Total Documents: ${stats.totalDocuments}`)
    console.log(`   💾 Total Size: ${this.formatFileSize(stats.totalSize)}`)
    console.log(`   📝 Total Content: ${stats.totalContentLength.toLocaleString()} characters`)
    console.log(`   📄 Average Content: ${Math.round(stats.averageContentLength).toLocaleString()} characters`)
    
    if (Object.keys(stats.fileTypes).length > 0) {
      console.log('   📋 File Types:')
      for (const [type, count] of Object.entries(stats.fileTypes)) {
        console.log(`      ${type}: ${count}`)
      }
    }
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  private showHelp(): void {
    console.log(`
🚀 EventTitan Knowledge Base File Uploader

USAGE:
  npm run upload-knowledge -- [options] <files...>
  npm run upload-knowledge -- --directory <path> [options]

OPTIONS:
  -d, --directory <path>    Upload all files from directory
  -r, --recursive          Include subdirectories (with --directory)
  -o, --overwrite          Overwrite existing documents
  -v, --verbose            Show detailed upload information
  -h, --help               Show this help message

EXAMPLES:
  # Upload single file
  npm run upload-knowledge -- ./docs/event-guide.md

  # Upload multiple files
  npm run upload-knowledge -- ./docs/*.txt ./guides/*.md

  # Upload entire directory
  npm run upload-knowledge -- --directory ./knowledge-docs

  # Upload directory recursively with overwrite
  npm run upload-knowledge -- --directory ./docs --recursive --overwrite

  # Verbose upload with details
  npm run upload-knowledge -- --verbose ./important-doc.txt

SUPPORTED FILE TYPES:
  .txt, .md, .json, .csv, .html, .xml, .rtf

FEATURES:
  ✅ Automatic keyword extraction
  ✅ Content chunking for large files
  ✅ Duplicate detection
  ✅ Content quality validation
  ✅ File type validation
  ✅ Size limits (10MB default)
  ✅ Local storage (no cloud required)
`)
  }
}

// Run CLI if called directly
if (require.main === module) {
  const cli = new KnowledgeUploadCLI()
  cli.run().catch(error => {
    console.error('❌ CLI Error:', error)
    process.exit(1)
  })
}

export { KnowledgeUploadCLI }
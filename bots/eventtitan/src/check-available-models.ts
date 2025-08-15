/**
 * Check Available Models on OpenRouter
 * This script will help us see what models are actually available
 */

// Load environment variables
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '.env') })

async function checkAvailableModels() {
  const apiKey = process.env.OPENROUTER_API_KEY
  
  if (!apiKey) {
    console.log('❌ No API key found. Set OPENROUTER_API_KEY in your .env file')
    return
  }

  console.log('🔍 Checking available models on OpenRouter...\n')

  try {
    // Get list of available models
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.log('❌ Failed to fetch models:', response.status, response.statusText)
      const errorText = await response.text()
      console.log('Error details:', errorText)
      return
    }

    const data = await response.json()
    const models = data.data || []

    console.log(`✅ Found ${models.length} available models\n`)

    // Look for GPT-OSS-20B related models
    console.log('🔍 Searching for GPT-OSS-20B models:')
    const gptOssModels = models.filter((model: any) => 
      model.id.toLowerCase().includes('gpt-oss') || 
      model.id.toLowerCase().includes('atlascloud') ||
      model.name?.toLowerCase().includes('gpt-oss')
    )

    if (gptOssModels.length > 0) {
      console.log(`Found ${gptOssModels.length} GPT-OSS related models:`)
      gptOssModels.forEach((model: any) => {
        console.log(`  - ID: ${model.id}`)
        console.log(`    Name: ${model.name || 'N/A'}`)
        console.log(`    Context: ${model.context_length || 'N/A'} tokens`)
        console.log(`    Pricing: ${model.pricing?.prompt || 'N/A'} per token`)
        console.log(`    Free: ${model.pricing?.prompt === '0' ? 'Yes' : 'No'}`)
        console.log()
      })
    } else {
      console.log('❌ No GPT-OSS-20B models found')
    }

    // Look for free models
    console.log('🆓 Free models available:')
    const freeModels = models.filter((model: any) => 
      model.pricing?.prompt === '0' || 
      model.id.includes(':free')
    ).slice(0, 10) // Show first 10 free models

    if (freeModels.length > 0) {
      freeModels.forEach((model: any) => {
        console.log(`  - ${model.id}`)
        if (model.name) console.log(`    Name: ${model.name}`)
      })
    } else {
      console.log('❌ No free models found')
    }

    // Look for AtlasCloud models specifically
    console.log('\n🏢 AtlasCloud models:')
    const atlasModels = models.filter((model: any) => 
      model.id.toLowerCase().includes('atlascloud')
    )

    if (atlasModels.length > 0) {
      atlasModels.forEach((model: any) => {
        console.log(`  - ${model.id}`)
        console.log(`    Name: ${model.name || 'N/A'}`)
        console.log(`    Free: ${model.pricing?.prompt === '0' ? 'Yes' : 'No'}`)
        console.log()
      })
    } else {
      console.log('❌ No AtlasCloud models found')
    }

  } catch (error) {
    console.error('❌ Error checking models:', error)
  }
}

// Test with some common free models to see if API is working
async function testCommonFreeModels() {
  const apiKey = process.env.OPENROUTER_API_KEY
  
  if (!apiKey) return

  console.log('\n🧪 Testing common free models...\n')

  const testModels = [
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.2-1b-instruct:free',
    'google/gemma-2-9b-it:free',
    'microsoft/phi-3-mini-128k-instruct:free'
  ]

  for (const model of testModels) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/eventtitan-bot',
          'X-Title': 'EventTitan Model Test'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      })

      if (response.ok) {
        console.log(`✅ ${model} - Working`)
      } else {
        const errorText = await response.text()
        console.log(`❌ ${model} - Error: ${response.status}`)
        if (response.status !== 404) {
          console.log(`   Details: ${errorText.substring(0, 100)}...`)
        }
      }
    } catch (error) {
      console.log(`❌ ${model} - Network error`)
    }
  }
}

async function main() {
  await checkAvailableModels()
  await testCommonFreeModels()
}

if (require.main === module) {
  main()
}
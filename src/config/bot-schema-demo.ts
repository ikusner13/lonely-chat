#!/usr/bin/env bun

import { z } from 'zod';
import {
  BotPersonalitySchema,
  generateJsonSchema,
  generateJsonSchemaWithMetadata,
  getSchemaMetadata,
  validateBotConfig,
} from './bot.schema';

console.log('=== Bot Schema Metadata Demo ===\n');

// 1. Show schema metadata using .meta()
console.log('1. Bot Personality Schema Metadata:');
const metadata = getSchemaMetadata(BotPersonalitySchema);
console.log(JSON.stringify(metadata, null, 2));

// 2. Generate JSON Schema
console.log('\n2. Generated JSON Schema:');
const jsonSchema = generateJsonSchema();
console.log(JSON.stringify(jsonSchema, null, 2));

// 3. Generate JSON Schema with metadata from globalRegistry
console.log('\n3. JSON Schema with Metadata:');
const jsonSchemaWithMeta = generateJsonSchemaWithMetadata();
console.log(JSON.stringify(jsonSchemaWithMeta, null, 2));

// 4. Validate example config with error details
console.log('\n4. Validation Example:');
try {
  const invalidConfig = {
    stickyman1776: {
      name: 'Bot',
      model: 'invalid-model',
      systemPrompt: 'Hello!',
      temperature: 3, // Too high!
      maxTokens: -50, // Negative!
    },
  };

  validateBotConfig(invalidConfig);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('Validation errors:');
    error.issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. Path: ${issue.path.join('.')}`);
      console.log(`     Error: ${issue.message}`);
    });
  }
}

// 5. Show how metadata helps with documentation
console.log('\n5. Schema Documentation:');
console.log(`- Description: ${BotPersonalitySchema.description}`);
console.log(`- Title: ${metadata?.title}`);
console.log(`- ID: ${metadata?.id}`);

// 6. Valid config example
console.log('\n6. Valid Config Example:');
const validConfig = {
  stickyman1776: {
    name: 'Stickyman1776',
    model: 'moonshotai/kimi-k2:free',
    systemPrompt: 'You are the ultimate positive supporter in chat!',
    temperature: 0.8,
    maxTokens: 100,
    interests: ['gaming', 'positivity', 'community'],
    responseChance: {
      question: 0.8,
      greeting: 0.9,
      general: 0.3,
    },
  },
};

const parsed = validateBotConfig(validConfig);
console.log('✅ Valid config parsed successfully!');
console.log(`Bot name: ${parsed.stickyman1776.name}`);
console.log(`Model: ${parsed.stickyman1776.model}`);

console.log('\n✅ Demo complete!');

/**
 * Intent Classification Module
 *
 * Exporta todas as funcionalidades de classificação de intenções
 */

// Classificador principal
export { classifyIntent } from "./intent-classifier"

// Tipos
export {
  type IntentClassificationInput,
  type IntentClassificationOutput,
  type ExtractedClientData,
  type AlternativeIntent,
  type IntentCategory,
  type IntentMetadata,
  MIN_CONFIDENCE_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
  VALID_INTENTS,
  DATA_COLLECTION_INTENTS,
  BUSINESS_CAPABILITY_INTENTS,
  INTENT_CATEGORY_MAP,
  INTENT_METADATA,
  isDataCollectionIntent,
  isBusinessCapabilityIntent,
  getIntentCategory,
  isConfidenceAcceptable,
  isHighConfidence
} from "./intent-classification-types"

// Prompts e helpers
export {
  INTENT_CLASSIFICATION_SYSTEM_PROMPT,
  FEW_SHOT_EXAMPLES,
  buildClassificationPrompt,
  extractConversationContext,
  getExamplesByIntent,
  getIntentMetadata
} from "./prompts/intent-classification-prompt"

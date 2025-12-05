/**
 * RAG Prompts - Prompts para Agentic RAG
 *
 * Prompts otimizados para GPT-5-mini com:
 * - Temperatura conceitual baixa (consistência)
 * - Exemplos inline para guiar o modelo
 * - Formato JSON estruturado
 *
 * PRD: .taskmaster/docs/agentic-rag-implementation-prd.md
 * Seção: Fase 6B.4
 */

import type { ClientInfoForQueries } from "../nodes/rag/generate-queries"

// =============================================================================
// Constantes
// =============================================================================

/** Temperatura para grading (modelos não-GPT-5) */
export const GRADING_TEMPERATURE = 0.1

/** Temperatura para rewriting (modelos não-GPT-5) */
export const REWRITING_TEMPERATURE = 0.1

// =============================================================================
// Grade Document Prompt
// =============================================================================

/**
 * Prompt para avaliar relevância de documentos vs perfil do cliente
 *
 * Placeholders:
 * - {documentContent}: Conteúdo do documento
 * - {clientInfo}: Informações do cliente formatadas
 * - {documentMetadata}: Metadados do documento (tipo, operadora, etc)
 */
export const GRADE_DOCUMENT_PROMPT = `Você é um avaliador especializado em planos de saúde no Brasil.

Sua tarefa é avaliar se um documento é RELEVANTE para o perfil de um cliente específico.

## Critérios de Avaliação

1. **relevant**: O documento aborda diretamente o que o cliente precisa
   - Plano compatível com idade, localização, orçamento
   - Cobertura adequada para dependentes mencionados
   - Atende condições pré-existentes do cliente

2. **partially_relevant**: O documento tem alguma relação, mas não é ideal
   - Plano de operadora diferente da mencionada
   - Faixa de preço próxima mas não exata
   - Cobertura parcial das necessidades

3. **irrelevant**: O documento não serve para este cliente
   - Plano individual quando cliente quer familiar
   - Região de cobertura diferente
   - Fora do orçamento declarado
   - Não cobre condições pré-existentes críticas

## Perfil do Cliente
{clientInfo}

## Documento a Avaliar
**Metadados:** {documentMetadata}
**Conteúdo:**
{documentContent}

## Formato de Resposta (JSON)
{
  "documentId": "{documentId}",
  "score": "relevant" | "partially_relevant" | "irrelevant",
  "reason": "Explicação breve de 1-2 frases sobre a classificação",
  "missingInfo": ["info que falta", "outra info"] // opcional
}

## Exemplos

**Exemplo 1 - relevant:**
Cliente: 35 anos, São Paulo, família com 2 filhos
Documento: "Plano Amil Família SP - cobertura pediatria completa, R$800/mês"
Resposta: {"documentId": "doc1", "score": "relevant", "reason": "Plano familiar em SP com cobertura pediátrica adequada para família com crianças"}

**Exemplo 2 - irrelevant:**
Cliente: 25 anos, solteiro, Rio de Janeiro
Documento: "Plano Senior 60+ Bradesco - exclusivo para maiores de 60 anos"
Resposta: {"documentId": "doc2", "score": "irrelevant", "reason": "Plano exclusivo para idosos não é aplicável a cliente de 25 anos"}

Avalie o documento agora:`

/**
 * Prompt para avaliar batch de documentos (mais eficiente)
 */
export const GRADE_DOCUMENTS_BATCH_PROMPT = `Você é um avaliador especializado em planos de saúde no Brasil.

Avalie CADA documento listado abaixo quanto à relevância para o perfil do cliente.

## Critérios de Avaliação

- **relevant**: Documento aborda diretamente o que o cliente precisa
- **partially_relevant**: Documento tem alguma relação mas não é ideal
- **irrelevant**: Documento não serve para este cliente

## Perfil do Cliente
{clientInfo}

## Documentos a Avaliar
{documents}

## Formato de Resposta (JSON)
{
  "results": [
    {
      "documentId": "id do documento",
      "score": "relevant" | "partially_relevant" | "irrelevant",
      "reason": "Explicação breve"
    },
    ...
  ]
}

IMPORTANTE: Avalie TODOS os documentos listados. Seja consistente nos critérios.

Avalie agora:`

// =============================================================================
// Rewrite Query Prompt
// =============================================================================

/**
 * Prompt para reformular query quando há poucos resultados relevantes
 *
 * Placeholders:
 * - {problem}: Tipo de problema identificado
 * - {originalQuery}: Query original que não funcionou
 * - {clientInfo}: Informações do cliente
 */
export const REWRITE_QUERY_PROMPT = `Você é um especialista em busca de planos de saúde.

Uma busca anterior não retornou resultados suficientes. Sua tarefa é REFORMULAR a query para melhorar os resultados.

## Problema Identificado
{problem}

## Query Original
{originalQuery}

## Perfil do Cliente
{clientInfo}

## Estratégias por Problema

1. **no_results** (nenhum resultado):
   - Remover termos muito específicos
   - Usar sinônimos mais comuns
   - Focar no aspecto mais importante do cliente

2. **low_similarity** (baixa similaridade):
   - Adicionar contexto do perfil do cliente
   - Usar termos mais técnicos do setor
   - Incluir operadoras conhecidas

3. **too_specific** (muito específica):
   - Generalizar a busca
   - Remover filtros de preço exato
   - Focar em categoria ao invés de produto específico

4. **missing_context** (falta contexto):
   - Incluir cidade/estado do cliente
   - Mencionar tipo de plano (individual/familiar)
   - Adicionar faixa etária

## Exemplos

**Problema: too_specific**
Original: "plano Amil S750 código ANS 12345 cobertura oncológica avançada"
Reescrita: "plano Amil com cobertura para tratamento de câncer São Paulo"

**Problema: no_results**
Original: "plano saúde tratamento doença rara específica XYZ"
Reescrita: "plano saúde cobertura doenças complexas tratamento especializado"

**Problema: missing_context**
Original: "melhor plano de saúde"
Reescrita: "plano de saúde familiar São Paulo cobertura completa até R$1000"

## Formato de Resposta (JSON)
{
  "rewrittenQuery": "nova query reformulada",
  "changes": "breve descrição do que foi alterado"
}

Reformule a query agora:`

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formata informações do cliente para inserir no prompt
 */
export function formatClientInfoForPrompt(
  clientInfo: ClientInfoForQueries
): string {
  const parts: string[] = []

  if (clientInfo.age !== undefined) {
    parts.push(`- **Idade:** ${clientInfo.age} anos`)
  }

  if (clientInfo.city || clientInfo.state) {
    const location = [clientInfo.city, clientInfo.state]
      .filter(Boolean)
      .join(", ")
    parts.push(`- **Localização:** ${location}`)
  }

  if (clientInfo.budget !== undefined) {
    parts.push(
      `- **Orçamento:** até R$ ${clientInfo.budget.toLocaleString("pt-BR")}/mês`
    )
  }

  if (clientInfo.dependents && clientInfo.dependents.length > 0) {
    const depsDescriptions = clientInfo.dependents.map(dep => {
      const depParts = []
      if (dep.relationship) depParts.push(dep.relationship)
      if (dep.age !== undefined) depParts.push(`${dep.age} anos`)
      return depParts.join(" de ") || "dependente"
    })
    parts.push(`- **Dependentes:** ${depsDescriptions.join(", ")}`)
  }

  if (
    clientInfo.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  ) {
    parts.push(
      `- **Condições pré-existentes:** ${clientInfo.preExistingConditions.join(", ")}`
    )
  }

  if (clientInfo.preferences && clientInfo.preferences.length > 0) {
    parts.push(`- **Preferências:** ${clientInfo.preferences.join(", ")}`)
  }

  if (parts.length === 0) {
    return "Nenhuma informação específica do cliente disponível"
  }

  return parts.join("\n")
}

/**
 * Formata documento para inserir no prompt de grading
 */
export function formatDocumentForPrompt(doc: {
  id: string
  content: string
  metadata?: {
    documentType?: string
    operator?: string
    planCode?: string
    tags?: string[]
  }
}): { documentContent: string; documentMetadata: string; documentId: string } {
  const metaParts: string[] = []

  if (doc.metadata?.documentType) {
    metaParts.push(`Tipo: ${doc.metadata.documentType}`)
  }
  if (doc.metadata?.operator) {
    metaParts.push(`Operadora: ${doc.metadata.operator}`)
  }
  if (doc.metadata?.planCode) {
    metaParts.push(`Código: ${doc.metadata.planCode}`)
  }
  if (doc.metadata?.tags && doc.metadata.tags.length > 0) {
    metaParts.push(`Tags: ${doc.metadata.tags.join(", ")}`)
  }

  return {
    documentId: doc.id,
    documentContent:
      doc.content.length > 1500
        ? doc.content.substring(0, 1500) + "..."
        : doc.content,
    documentMetadata: metaParts.length > 0 ? metaParts.join(" | ") : "N/A"
  }
}

/**
 * Formata múltiplos documentos para batch grading
 */
export function formatDocumentsForBatchPrompt(
  docs: Array<{
    id: string
    content: string
    metadata?: {
      documentType?: string
      operator?: string
    }
  }>
): string {
  return docs
    .map((doc, index) => {
      const meta = []
      if (doc.metadata?.documentType) meta.push(doc.metadata.documentType)
      if (doc.metadata?.operator) meta.push(doc.metadata.operator)

      const content =
        doc.content.length > 500
          ? doc.content.substring(0, 500) + "..."
          : doc.content

      return `### Documento ${index + 1} (ID: ${doc.id})
${meta.length > 0 ? `**Metadados:** ${meta.join(" | ")}` : ""}
**Conteúdo:** ${content}`
    })
    .join("\n\n")
}

/**
 * Formata problema para prompt de rewrite
 */
export function formatProblemForPrompt(
  problem: "no_results" | "low_similarity" | "too_specific" | "missing_context"
): string {
  const descriptions: Record<string, string> = {
    no_results:
      "Nenhum resultado foi encontrado. A query pode ser muito restritiva ou usar termos incomuns.",
    low_similarity:
      "Os resultados encontrados têm baixa similaridade com a query. Os termos podem não corresponder ao vocabulário dos documentos.",
    too_specific:
      "A query é muito específica (nome de plano, código, etc). Precisa ser mais genérica para encontrar alternativas.",
    missing_context:
      "A query não inclui informações importantes do cliente como localização, idade ou tipo de plano desejado."
  }

  return descriptions[problem] || problem
}

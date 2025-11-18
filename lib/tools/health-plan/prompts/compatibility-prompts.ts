/**
 * Prompts para análise de compatibilidade de planos de saúde
 * Usados com GPT-4o para análise semântica profunda
 */

import type { ClientInfo } from "../schemas/client-info-schema"

/**
 * Prompt para análise de elegibilidade
 */
export function createEligibilityAnalysisPrompt(
  clientInfo: ClientInfo,
  planDocuments: string
): string {
  const age = clientInfo.age
  const dependents = clientInfo.dependents || []
  const conditions = clientInfo.preExistingConditions || []
  const city = clientInfo.city
  const state = clientInfo.state

  return `Você é um especialista em análise de planos de saúde. Analise a ELEGIBILIDADE do cliente para o plano de saúde descrito nos documentos fornecidos.

## PERFIL DO CLIENTE

**Titular:**
- Idade: ${age} anos
- Localização: ${city}, ${state}

${
  dependents.length > 0
    ? `**Dependentes:**
${dependents.map((d, i) => `- Dependente ${i + 1}: ${d.relationship} de ${d.age} anos`).join("\n")}`
    : "**Dependentes:** Nenhum"
}

${
  conditions.length > 0
    ? `**Condições Pré-Existentes:**
${conditions.map(c => `- ${c}`).join("\n")}`
    : "**Condições Pré-Existentes:** Nenhuma declarada"
}

## DOCUMENTOS DO PLANO

${planDocuments}

## TAREFA

Analise a elegibilidade do cliente para este plano considerando:

1. **Faixa etária**: Há limites de idade mínima ou máxima para contratação?
2. **Localização geográfica**: O plano está disponível na região do cliente (${city}, ${state})?
3. **Condições pré-existentes**: Há restrições ou exclusões para as condições declaradas?
4. **Dependentes**: Os dependentes atendem aos critérios de elegibilidade (idade, relação)?
5. **Requisitos especiais**: Há outros critérios de elegibilidade (renda mínima, carência, etc.)?

## FORMATO DE RESPOSTA

Retorne um JSON com a seguinte estrutura:

\`\`\`json
{
  "isEligible": boolean,
  "confidence": number (0-100),
  "reasons": ["razão 1 pela qual o cliente É elegível", "razão 2", ...],
  "blockers": ["razão 1 que IMPEDE a contratação", ...] ou null se elegível,
  "warnings": ["aviso 1 importante mas não impeditivo", ...] ou null se não há
}
\`\`\`

**IMPORTANTE:**
- Se isEligible = false, liste TODOS os motivos em "blockers"
- Se isEligible = true, mas há avisos importantes, liste em "warnings"
- A confidence deve refletir quão claro são os critérios nos documentos (100 = muito claro, 50 = ambíguo)
- Se os documentos não mencionam um critério, assuma que não há restrição (default elegível)
- Seja específico nas razões (ex: "Idade do titular (${age}) está dentro do limite de 0-65 anos")

Retorne APENAS o JSON, sem markdown ou explicações adicionais.`
}

/**
 * Prompt para avaliação de coberturas
 */
export function createCoverageEvaluationPrompt(
  clientInfo: ClientInfo,
  planDocuments: string
): string {
  const conditions = clientInfo.preExistingConditions || []
  const medications = clientInfo.medications || []

  return `Você é um especialista em análise de coberturas de planos de saúde. Avalie a ADEQUAÇÃO DAS COBERTURAS do plano para o perfil do cliente.

## PERFIL DO CLIENTE

**Condições Pré-Existentes:**
${conditions.length > 0 ? conditions.map(c => `- ${c}`).join("\n") : "Nenhuma declarada"}

**Medicamentos de Uso Contínuo:**
${medications.length > 0 ? medications.map(m => `- ${m}`).join("\n") : "Nenhum declarado"}

**Idade do Titular:** ${clientInfo.age} anos

**Dependentes:** ${clientInfo.dependents?.length || 0} (idades: ${clientInfo.dependents?.map(d => d.age).join(", ") || "N/A"})

## DOCUMENTOS DO PLANO

${planDocuments}

## TAREFA

Analise as coberturas do plano considerando o perfil do cliente:

1. **Cobertura para condições pré-existentes**: Cada condição declarada é coberta? Há limitações ou carências?
2. **Coberturas relevantes ao perfil**: Baseado na idade e condições, quais coberturas são especialmente importantes?
3. **Coberturas gerais**: O plano oferece coberturas abrangentes (consultas, exames, internações, cirurgias)?
4. **Lacunas críticas**: Há coberturas importantes que estão ausentes ou muito limitadas?

## FORMATO DE RESPOSTA

Retorne um JSON com a seguinte estrutura:

\`\`\`json
{
  "overallAdequacy": number (0-100),
  "conditionsCoverage": [
    {
      "condition": "nome da condição",
      "isCovered": boolean,
      "coverageLevel": "full" | "partial" | "excluded" | "unclear",
      "details": "detalhes da cobertura para esta condição",
      "relevantClauses": ["trecho relevante 1", "trecho 2"] ou null,
      "waitingPeriod": number (dias) ou null
    }
  ],
  "generalCoverageHighlights": [
    "destaque positivo 1 da cobertura geral",
    "destaque positivo 2",
    ...
  ],
  "missingCriticalCoverages": [
    "cobertura crítica faltante 1",
    ...
  ] ou null se não há
}
\`\`\`

**IMPORTANTE:**
- overallAdequacy deve considerar tanto as condições específicas quanto a cobertura geral
- Para cada condição declarada, DEVE haver um objeto em conditionsCoverage
- relevantClauses deve conter trechos EXATOS dos documentos (máx 200 chars cada)
- Se não há condições declaradas, conditionsCoverage deve ser array vazio
- Seja específico e cite evidências dos documentos

Retorne APENAS o JSON, sem markdown ou explicações adicionais.`
}

/**
 * Prompt para detecção de exclusões e limitações
 */
export function createExclusionsDetectionPrompt(
  clientInfo: ClientInfo,
  planDocuments: string
): string {
  const conditions = clientInfo.preExistingConditions || []

  return `Você é um especialista em análise de contratos de planos de saúde. Identifique EXCLUSÕES, CARÊNCIAS E LIMITAÇÕES críticas que afetam o perfil do cliente.

## PERFIL DO CLIENTE

- **Idade:** ${clientInfo.age} anos
- **Localização:** ${clientInfo.city}, ${clientInfo.state}
- **Condições Pré-Existentes:** ${conditions.length > 0 ? conditions.join(", ") : "Nenhuma"}
- **Dependentes:** ${clientInfo.dependents?.length || 0}

## DOCUMENTOS DO PLANO

${planDocuments}

## TAREFA

Identifique alertas críticos que o cliente PRECISA saber:

1. **Carências**: Períodos de carência para procedimentos importantes (especialmente relacionados às condições declaradas)
2. **Exclusões**: Procedimentos, tratamentos ou condições EXCLUÍDOS da cobertura
3. **Limitações**: Limites de consultas, exames, ou procedimentos (ex: máx 12 consultas/ano)
4. **Restrições Regionais**: Limitações da rede credenciada na região do cliente
5. **Restrições por Idade**: Limitações que afetam o cliente ou dependentes pela idade
6. **Cobertura Parcial para Pré-Existentes**: CPT (Cobertura Parcial Temporária) para as condições declaradas

## FORMATO DE RESPOSTA

Retorne um JSON com array de alertas:

\`\`\`json
[
  {
    "type": "carencia" | "exclusao" | "limitacao" | "restricao_regional" | "idade" | "pre_existente",
    "severity": "high" | "medium" | "low",
    "title": "Título curto do alerta",
    "description": "Descrição detalhada do alerta (1-2 frases)",
    "affectedConditions": ["condição 1", ...] ou null,
    "impactScore": number (0-10)
  }
]
\`\`\`

**CRITÉRIOS DE SEVERIDADE:**
- **high**: Impede ou dificulta seriamente o acesso a tratamentos críticos
- **medium**: Limitação importante mas contornável
- **low**: Limitação menor, informativa

**CRITÉRIOS DE IMPACT SCORE:**
- 9-10: Afeta diretamente condições pré-existentes críticas
- 7-8: Limitação importante para procedimentos comuns
- 4-6: Limitação moderada
- 1-3: Limitação menor, pouco provável de afetar

**IMPORTANTE:**
- Foque em alertas RELEVANTES ao perfil do cliente
- NÃO liste exclusões padrão e óbvias (ex: cirurgias estéticas, uso de drogas ilícitas)
- Priorize carências para condições pré-existentes declaradas
- Se não há alertas críticos, retorne array vazio []
- Seja específico e cite evidências

Retorne APENAS o JSON array, sem markdown ou explicações adicionais.`
}

/**
 * Prompt para geração de justificativa detalhada
 */
export function createDetailedReasoningPrompt(
  clientInfo: ClientInfo,
  planName: string,
  score: number,
  pros: string[],
  cons: string[],
  alerts: string[]
): string {
  return `Você é um especialista em planos de saúde. Gere uma justificativa HUMANIZADA e EMPÁTICA explicando por que este plano recebeu o score de ${score}/100 para o perfil do cliente.

## PERFIL DO CLIENTE

- Idade: ${clientInfo.age} anos
- Localização: ${clientInfo.city}, ${clientInfo.state}
- Orçamento: R$ ${clientInfo.budget}/mês
- Dependentes: ${clientInfo.dependents?.length || 0}
- Condições: ${clientInfo.preExistingConditions?.join(", ") || "Nenhuma"}

## PLANO ANALISADO

**Nome:** ${planName}
**Score de Compatibilidade:** ${score}/100

**Pontos Positivos:**
${pros.map(p => `- ${p}`).join("\n")}

**Pontos Negativos:**
${cons.map(c => `- ${c}`).join("\n")}

${
  alerts.length > 0
    ? `**Alertas Críticos:**
${alerts.map(a => `- ${a}`).join("\n")}`
    : ""
}

## TAREFA

Escreva um parágrafo de 3-5 frases explicando:

1. Por que o plano recebeu este score (relacione com o perfil do cliente)
2. Principal MOTIVO para recomendar ou não recomendar
3. Para qual tipo de pessoa/família este plano seria ideal

**TOM E ESTILO:**
- Empático e profissional
- Linguagem clara, evite jargões técnicos excessivos
- Seja direto mas gentil
- Foco no valor para o cliente, não apenas nos números

**EXEMPLO DE BOA JUSTIFICATIVA:**
"Este plano alcançou ${score}/100 de compatibilidade com seu perfil principalmente devido à excelente cobertura para diabetes, que se alinha perfeitamente com suas necessidades. O preço de R$ 850 está ligeiramente abaixo do seu orçamento, oferecendo boa relação custo-benefício. No entanto, a carência de 180 dias para internações relacionadas a condições pré-existentes é um ponto de atenção importante. Este plano seria ideal para quem busca cobertura abrangente para diabetes e pode aguardar o período de carência."

Retorne APENAS o texto da justificativa, sem títulos, formatação markdown ou explicações adicionais.`
}

/**
 * Prompt para identificar "melhor para" (bestFor)
 */
export function createBestForPrompt(
  planName: string,
  eligibility: string,
  coverage: string,
  score: number
): string {
  return `Baseado na análise do plano "${planName}", identifique em UMA FRASE curta (máx 60 caracteres) o perfil ideal de cliente.

**Análise:**
- Score: ${score}/100
- Elegibilidade: ${eligibility}
- Cobertura: ${coverage}

**Exemplos de respostas:**
- "Jovem saudável sem dependentes"
- "Família com crianças pequenas"
- "Casal com condições pré-existentes"
- "Profissional liberal com orçamento limitado"
- "Idosos buscando cobertura premium"

Retorne APENAS a frase, sem aspas ou formatação adicional.`
}

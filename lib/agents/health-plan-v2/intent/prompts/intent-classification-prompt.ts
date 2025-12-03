/**
 * Prompts para classificação de intenções via GPT-4o
 *
 * Estrutura:
 * - System prompt com instruções detalhadas
 * - Few-shot examples para cada tipo de intenção
 * - Instruções de extração de dados
 */

import { INTENT_METADATA } from "../intent-classification-types"

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `Você é um classificador de intenções especializado em diálogos sobre planos de saúde no Brasil.

## Sua Tarefa
Analisar a mensagem do usuário e:
1. Identificar a intenção principal (OBRIGATÓRIO)
2. Extrair dados relevantes quando aplicável (idade, cidade, dependentes, etc.)
3. Fornecer raciocínio sobre sua classificação
4. Se houver ambiguidade, indicar intenções alternativas

## Intenções Possíveis

1. **fornecer_dados**: Usuário está fornecendo informações pessoais pela primeira vez
   - Idade, localização, dependentes, orçamento, preferências
   - Exemplo: "Tenho 35 anos e moro em SP"

2. **alterar_dados**: Usuário está CORRIGINDO ou ALTERANDO dados já fornecidos
   - Usa palavras como "na verdade", "corrija", "não é", "errei"
   - Exemplo: "Na verdade tenho 40 anos, não 35"

3. **buscar_planos**: Usuário quer ver planos disponíveis
   - Pede para buscar, mostrar, listar planos
   - Exemplo: "Quero ver os planos disponíveis"

4. **analisar**: Usuário quer análise de compatibilidade dos planos
   - Pede para analisar, comparar, avaliar
   - Exemplo: "Qual desses planos é melhor para mim?"

5. **consultar_preco**: Usuário pergunta sobre preços específicos
   - Valores, custos, mensalidade
   - Exemplo: "Quanto custa o plano Bradesco?"

6. **pedir_recomendacao**: Usuário pede recomendação personalizada
   - Sugira, indique, recomende
   - Exemplo: "Qual plano você me recomenda?"

7. **conversar**: Dúvidas gerais, saudações, perguntas educativas
   - Explicações sobre termos, como funciona, saudações
   - Exemplo: "O que é coparticipação?"

8. **simular_cenario**: Usuário quer simular cenário hipotético
   - "E se...", "Simule...", "Caso eu..."
   - Exemplo: "E se eu adicionar minha mãe de 60 anos?"

9. **finalizar**: Usuário quer encerrar a conversa
   - Despedida, agradecimento final, encerramento
   - Exemplo: "Obrigado, pode finalizar"

## Regras de Classificação

1. Se a mensagem contém DADOS NOVOS (idade, cidade, dependentes) → **fornecer_dados**
2. Se a mensagem CORRIGE dados anteriores → **alterar_dados**
3. Se é saudação pura ("oi", "olá") SEM dados → **conversar**
4. Se pergunta educativa ("o que é X?") → **conversar**
5. Se contém "e se" ou cenário hipotético → **simular_cenario**
6. Se pede explicitamente preço → **consultar_preco**
7. Se pede recomendação/sugestão → **pedir_recomendacao**
8. Se agradece e se despede → **finalizar**

## Extração de Dados

Quando a intenção é fornecer_dados, alterar_dados ou simular_cenario, EXTRAIA:

- **age**: número inteiro (18-120)
- **city**: nome da cidade
- **state**: sigla do estado (SP, RJ, MG, etc.)
- **budget**: valor numérico do orçamento
- **dependents**: array com {age, relationship}
  - relationship: "spouse" (cônjuge), "child" (filho), "parent" (pai/mãe), "other"
- **preferences**: array de preferências ["sem coparticipação", "rede ampla", etc.]
- **healthConditions**: condições de saúde mencionadas

## Formato de Resposta (JSON)

{
  "intent": "fornecer_dados",
  "confidence": 0.95,
  "extractedData": {
    "age": 35,
    "city": "São Paulo",
    "state": "SP"
  },
  "reasoning": "Usuário forneceu idade e localização explicitamente",
  "alternativeIntents": []
}

## Regras de Confiança

- **0.9-1.0**: Intenção clara e inequívoca
- **0.7-0.9**: Intenção provável, poucos sinais contrários
- **0.5-0.7**: Ambiguidade, incluir alternativeIntents
- **<0.5**: Usar "conversar" como fallback

IMPORTANTE: Responda APENAS com o JSON, sem markdown ou texto adicional.`

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

export interface FewShotExample {
  userMessage: string
  expectedOutput: {
    intent: string
    confidence: number
    extractedData?: Record<string, unknown>
    reasoning: string
    alternativeIntents?: Array<{ intent: string; confidence: number }>
  }
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  // ===== fornecer_dados =====
  {
    userMessage: "Tenho 35 anos e moro em São Paulo",
    expectedOutput: {
      intent: "fornecer_dados",
      confidence: 0.95,
      extractedData: {
        age: 35,
        city: "São Paulo",
        state: "SP"
      },
      reasoning:
        "Usuário forneceu idade (35) e localização (São Paulo) de forma clara"
    }
  },
  {
    userMessage: "Sou eu, minha esposa de 32 anos e dois filhos de 5 e 8 anos",
    expectedOutput: {
      intent: "fornecer_dados",
      confidence: 0.92,
      extractedData: {
        dependents: [
          { age: 32, relationship: "spouse" },
          { age: 5, relationship: "child" },
          { age: 8, relationship: "child" }
        ]
      },
      reasoning: "Usuário informou composição familiar com cônjuge e 2 filhos"
    }
  },
  {
    userMessage: "Meu orçamento é de R$800 por mês",
    expectedOutput: {
      intent: "fornecer_dados",
      confidence: 0.93,
      extractedData: {
        budget: 800
      },
      reasoning: "Usuário informou orçamento mensal de R$800"
    }
  },
  {
    userMessage: "Preciso de um plano sem coparticipação com boa rede em BH",
    expectedOutput: {
      intent: "fornecer_dados",
      confidence: 0.88,
      extractedData: {
        city: "Belo Horizonte",
        state: "MG",
        preferences: ["sem coparticipação", "boa rede"]
      },
      reasoning:
        "Usuário forneceu localização (BH) e preferências (sem coparticipação, boa rede)"
    }
  },

  // ===== alterar_dados =====
  {
    userMessage: "Na verdade tenho 40 anos, não 35",
    expectedOutput: {
      intent: "alterar_dados",
      confidence: 0.96,
      extractedData: {
        age: 40
      },
      reasoning:
        "Usuário está corrigindo idade previamente informada (palavra-chave: 'na verdade')"
    }
  },
  {
    userMessage: "Corrija: são 3 dependentes, esqueci de mencionar minha mãe",
    expectedOutput: {
      intent: "alterar_dados",
      confidence: 0.94,
      extractedData: {
        dependents: [{ relationship: "parent" }]
      },
      reasoning:
        "Usuário está adicionando dependente que esqueceu (palavra-chave: 'corrija', 'esqueci')"
    }
  },

  // ===== buscar_planos =====
  {
    userMessage: "Quero ver os planos disponíveis para mim",
    expectedOutput: {
      intent: "buscar_planos",
      confidence: 0.94,
      reasoning: "Usuário pede explicitamente para ver planos"
    }
  },
  {
    userMessage: "Me mostre as opções de plano de saúde",
    expectedOutput: {
      intent: "buscar_planos",
      confidence: 0.92,
      reasoning: "Usuário quer visualizar opções disponíveis"
    }
  },

  // ===== analisar =====
  {
    userMessage: "Qual desses planos é melhor para mim?",
    expectedOutput: {
      intent: "analisar",
      confidence: 0.91,
      reasoning: "Usuário pede análise comparativa dos planos"
    }
  },
  {
    userMessage: "Compare o Bradesco com a Amil",
    expectedOutput: {
      intent: "analisar",
      confidence: 0.93,
      extractedData: {
        planName: "Bradesco, Amil"
      },
      reasoning: "Usuário pede comparação específica entre duas operadoras"
    }
  },

  // ===== consultar_preco =====
  {
    userMessage: "Quanto custa o plano Bradesco Saúde?",
    expectedOutput: {
      intent: "consultar_preco",
      confidence: 0.95,
      extractedData: {
        planName: "Bradesco Saúde"
      },
      reasoning: "Usuário pergunta preço específico de um plano"
    }
  },
  {
    userMessage: "Me dê os preços das opções",
    expectedOutput: {
      intent: "consultar_preco",
      confidence: 0.9,
      reasoning: "Usuário solicita informação de preços"
    }
  },

  // ===== pedir_recomendacao =====
  {
    userMessage: "Qual plano você me recomenda?",
    expectedOutput: {
      intent: "pedir_recomendacao",
      confidence: 0.94,
      reasoning: "Usuário pede recomendação personalizada"
    }
  },
  {
    userMessage: "Me sugira o melhor plano para minha família",
    expectedOutput: {
      intent: "pedir_recomendacao",
      confidence: 0.92,
      reasoning: "Usuário solicita sugestão para sua situação específica"
    }
  },

  // ===== conversar =====
  {
    userMessage: "Oi, tudo bem?",
    expectedOutput: {
      intent: "conversar",
      confidence: 0.98,
      reasoning: "Saudação simples sem dados ou solicitação específica"
    }
  },
  {
    userMessage: "O que é coparticipação?",
    expectedOutput: {
      intent: "conversar",
      confidence: 0.95,
      extractedData: {
        questionTopic: "coparticipação"
      },
      reasoning: "Pergunta educativa sobre termo técnico de planos de saúde"
    }
  },
  {
    userMessage: "Como funciona a carência?",
    expectedOutput: {
      intent: "conversar",
      confidence: 0.94,
      extractedData: {
        questionTopic: "carência"
      },
      reasoning: "Pergunta sobre funcionamento de carência"
    }
  },
  {
    userMessage: "Olá! Preciso de ajuda com plano de saúde",
    expectedOutput: {
      intent: "conversar",
      confidence: 0.85,
      reasoning:
        "Saudação com menção genérica a plano de saúde, sem dados específicos",
      alternativeIntents: [{ intent: "fornecer_dados", confidence: 0.4 }]
    }
  },

  // ===== simular_cenario =====
  {
    userMessage: "E se eu adicionar minha mãe de 60 anos?",
    expectedOutput: {
      intent: "simular_cenario",
      confidence: 0.96,
      extractedData: {
        scenarioChange: {
          type: "add_dependent",
          details: { age: 60, relationship: "parent" }
        }
      },
      reasoning:
        "Cenário hipotético de adição de dependente (palavra-chave: 'e se')"
    }
  },
  {
    userMessage: "Simule só para mim, sem minha esposa",
    expectedOutput: {
      intent: "simular_cenario",
      confidence: 0.94,
      extractedData: {
        scenarioChange: {
          type: "remove_dependent",
          details: { relationship: "spouse" }
        }
      },
      reasoning: "Simulação de cenário removendo cônjuge"
    }
  },
  {
    userMessage: "E se meu orçamento fosse R$1200?",
    expectedOutput: {
      intent: "simular_cenario",
      confidence: 0.95,
      extractedData: {
        scenarioChange: {
          type: "change_budget",
          details: { budget: 1200 }
        }
      },
      reasoning: "Simulação com orçamento diferente"
    }
  },

  // ===== finalizar =====
  {
    userMessage: "Obrigado, pode encerrar",
    expectedOutput: {
      intent: "finalizar",
      confidence: 0.97,
      reasoning: "Agradecimento com pedido explícito de encerramento"
    }
  },
  {
    userMessage: "Era isso, muito obrigado pela ajuda!",
    expectedOutput: {
      intent: "finalizar",
      confidence: 0.93,
      reasoning: "Agradecimento final indicando fim da conversa"
    }
  },
  {
    userMessage: "Até logo!",
    expectedOutput: {
      intent: "finalizar",
      confidence: 0.95,
      reasoning: "Despedida clara"
    }
  },

  // ===== Casos ambíguos =====
  {
    userMessage: "Quero um plano bom",
    expectedOutput: {
      intent: "fornecer_dados",
      confidence: 0.6,
      extractedData: {
        preferences: ["bom"]
      },
      reasoning:
        "Mensagem vaga, pode ser início de coleta ou pedido de recomendação",
      alternativeIntents: [
        { intent: "pedir_recomendacao", confidence: 0.55 },
        { intent: "buscar_planos", confidence: 0.45 }
      ]
    }
  },
  {
    userMessage: "Me ajuda aí",
    expectedOutput: {
      intent: "conversar",
      confidence: 0.7,
      reasoning: "Pedido genérico de ajuda sem contexto específico",
      alternativeIntents: [{ intent: "fornecer_dados", confidence: 0.4 }]
    }
  }
]

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gera o prompt completo com few-shot examples
 */
export function buildClassificationPrompt(
  userMessage: string,
  conversationContext?: string
): string {
  const examplesText = FEW_SHOT_EXAMPLES.slice(0, 10) // Limita para não exceder contexto
    .map(
      ex =>
        `Usuário: "${ex.userMessage}"\nResposta: ${JSON.stringify(ex.expectedOutput, null, 2)}`
    )
    .join("\n\n")

  let prompt = `${INTENT_CLASSIFICATION_SYSTEM_PROMPT}

## Exemplos de Classificação

${examplesText}

## Sua Tarefa Agora

`

  if (conversationContext) {
    prompt += `Contexto da conversa:
${conversationContext}

`
  }

  prompt += `Mensagem do usuário: "${userMessage}"

Classifique a intenção e responda APENAS com o JSON:`

  return prompt
}

/**
 * Extrai contexto relevante do histórico de mensagens
 */
export function extractConversationContext(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 5
): string {
  const recentMessages = messages.slice(-maxMessages)

  if (recentMessages.length === 0) {
    return ""
  }

  return recentMessages
    .map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`)
    .join("\n")
}

/**
 * Retorna exemplos por intenção específica
 */
export function getExamplesByIntent(intent: string): FewShotExample[] {
  return FEW_SHOT_EXAMPLES.filter(ex => ex.expectedOutput.intent === intent)
}

/**
 * Retorna metadata de uma intenção
 */
export function getIntentMetadata(intent: string) {
  return INTENT_METADATA.find(m => m.intent === intent)
}

# Análise Consolidada - Task #3: Assistente de Planos de Saúde

## Resumo Executivo

Sistema existente possui toda a infraestrutura necessária para criar assistentes especializados. Nossa tarefa consiste em **USAR** o sistema existente corretamente, não criar novo sistema.

## Arquitetura Existente - Tabelas Principais

### 1. `assistants`
**Localização:** `supabase/migrations/20240108234547_add_assistants.sql`

Campos necessários para nossa implementação:
- `name` (TEXT, max 100 chars) - Nome do assistente
- `model` (TEXT, max 1000 chars) - Modelo LLM (ex: "gpt-4o")
- `temperature` (REAL) - Temperatura do modelo (0.0-1.0)
- `prompt` (TEXT, max 100000 chars) - Prompt especializado
- `description` (TEXT, max 500 chars) - Descrição do assistente
- `context_length` (INT) - Tamanho do contexto
- `embeddings_provider` (TEXT) - Provider de embeddings
- `include_profile_context` (BOOLEAN) - Incluir contexto do perfil
- `include_workspace_instructions` (BOOLEAN) - Incluir instruções do workspace

### 2. `assistant_collections`
**Localização:** `supabase/migrations/20240115171510_add_assistant_files.sql`

Associa assistentes com collections (para RAG):
- PRIMARY KEY(`assistant_id`, `collection_id`)
- `user_id` - Dono do assistente
- Criada via `createAssistantCollections()`

### 3. `assistant_workspaces`
**Localização:** `supabase/migrations/20240108234547_add_assistants.sql`

Controla em quais workspaces o assistente aparece:
- PRIMARY KEY(`assistant_id`, `workspace_id`)
- `user_id` - Dono do assistente
- Criada automaticamente por `createAssistant()` para workspace inicial

### 4. `collections`
**Localização:** `supabase/migrations/20240108234551_add_collections.sql` + extensões da Task 2

Campos relevantes:
- `name`, `description` - Identificação
- **`collection_type`** (TEXT) - **NOVO na Task 2** ✨
  - Valores: `'health_plan'`, `'insurance'`, `'financial'`, `'general'`
  - Índice: `idx_collections_type`
- `chunk_size` (INT, default 4000) - Tamanho chunks embeddings
- `chunk_overlap` (INT, default 200) - Overlap entre chunks

### 5. `workspaces`
**Localização:** `supabase/migrations/20240108234542_add_workspaces.sql`

Campos importantes:
- `id`, `user_id`, `name`
- `is_home` (BOOLEAN) - Workspace principal (único por usuário)
- `default_model`, `default_temperature`, `default_context_length` - Defaults

## API Functions Disponíveis

### Assistants (`db/assistants.ts`)

```typescript
// Criar assistente (cria assistant_workspace automaticamente)
createAssistant(assistant: TablesInsert<"assistants">, workspace_id: string)

// Criar associações com workspaces adicionais
createAssistantWorkspace(item: {
  user_id: string
  assistant_id: string
  workspace_id: string
})

// Buscar assistentes de um workspace
getAssistantWorkspacesByWorkspaceId(workspaceId: string)

// Atualizar assistente
updateAssistant(assistantId: string, assistant: TablesUpdate<"assistants">)
```

### Assistant-Collections (`db/assistant-collections.ts`)

```typescript
// Criar associação com uma collection
createAssistantCollection(assistantCollection: TablesInsert<"assistant_collections">)

// Criar associações com múltiplas collections
createAssistantCollections(assistantCollections: TablesInsert<"assistant_collections">[])

// Buscar collections de um assistente
getAssistantCollectionsByAssistantId(assistantId: string)

// Remover associação
deleteAssistantCollection(assistantId: string, collectionId: string)
```

### Collections (`db/collections.ts`)

```typescript
// Buscar collection por ID
getCollectionById(collectionId: string)

// Buscar collections de um workspace
getCollectionWorkspacesByWorkspaceId(workspaceId: string)
```

## Fluxo de Criação Padrão

**Arquivo:** `components/sidebar/items/all/sidebar-create-item.tsx` (linhas 107-171)

```typescript
// 1. Criar assistente base
const createdAssistant = await createAssistant(rest, workspaceId)

// 2. Upload de imagem (se houver)
const filePath = await uploadAssistantImage(createdAssistant, image)
await updateAssistant(createdAssistant.id, { image_path: filePath })

// 3. Criar associações
await createAssistantFiles(assistantFiles)
await createAssistantCollections(assistantCollections)  // ← CRÍTICO
await createAssistantTools(assistantTools)
```

## Implementação Necessária - Task 3

### Fase 2: Definir Prompt Especializado

**Arquivo a criar:** Prompt inline ou em arquivo separado

Requisitos do prompt:
- Apresentação como "Agente de Planos de Saúde"
- Coleta de informações: idade, localização, tipo de cobertura
- Informações opcionais: renda, tamanho da família, histórico médico
- Instruções para análise de planos
- Tom profissional mas acessível

### Fase 3: Criar Assistente

**Usar:** `createAssistant()` via UI ou script

Parâmetros:
```typescript
{
  name: "Agente de Planos de Saúde",
  model: "gpt-4o",
  temperature: 0.3,
  prompt: PROMPT_ESPECIALIZADO,
  description: "Assistente especializado em recomendação de planos de saúde",
  context_length: 16000,  // Ajustar conforme necessário
  embeddings_provider: "openai",  // Ou provider do workspace
  include_profile_context: false,
  include_workspace_instructions: false,
  user_id: session.user.id,
  sharing: "private"
}
```

### Fase 4: Associar Collections

**Desafio:** Não há função para filtrar collections por `collection_type`

**Solução 1 - Query direta:**
```typescript
const { data: healthPlanCollections } = await supabase
  .from("collections")
  .select("*")
  .eq("collection_type", "health_plan")
  .eq("workspace_id", workspaceId)  // Se filtrar por workspace
```

**Solução 2 - Adicionar função em `db/collections.ts`:**
```typescript
export const getCollectionsByType = async (
  collectionType: string,
  workspaceId?: string
) => {
  let query = supabase
    .from("collections")
    .select("*")
    .eq("collection_type", collectionType)

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data
}
```

**Depois de obter collections:**
```typescript
const assistantCollections = healthPlanCollections.map(collection => ({
  user_id: createdAssistant.user_id,
  assistant_id: createdAssistant.id,
  collection_id: collection.id
}))

await createAssistantCollections(assistantCollections)
```

### Fase 5: Controle de Acesso

**Automático:** `createAssistant()` já cria `assistant_workspace` para workspace inicial

**Workspaces adicionais:**
```typescript
// Para cada workspace autorizado
await createAssistantWorkspace({
  user_id: createdAssistant.user_id,
  assistant_id: createdAssistant.id,
  workspace_id: additionalWorkspaceId
})
```

## Considerações de Teste

### Teste 1: Criação via UI
1. Navegar para interface de criação de assistentes
2. Preencher formulário com parâmetros especificados
3. Selecionar collections de tipo `health_plan`
4. Criar assistente

### Teste 2: Verificação de Workspace
1. Login com usuário do workspace autorizado
2. Verificar que assistente aparece na lista
3. Login com usuário de outro workspace
4. Verificar que assistente NÃO aparece

### Teste 3: Interação
1. Iniciar chat com assistente
2. Verificar prompt inicial
3. Testar fluxo de perguntas
4. Validar que assistente acessa collections

## Arquivos Relevantes

### Banco de Dados
- `supabase/migrations/20240108234547_add_assistants.sql` - Schema assistants
- `supabase/migrations/20240115171510_add_assistant_files.sql` - Schema collections
- `supabase/migrations/20251113142319_extend_collections_for_recommendations.sql` - collection_type

### API/Queries
- `db/assistants.ts` - CRUD assistants
- `db/assistant-collections.ts` - Associações collections
- `db/collections.ts` - CRUD collections

### Componentes UI
- `components/sidebar/items/assistants/create-assistant.tsx` - Formulário criação
- `components/sidebar/items/assistants/assistant-retrieval-select.tsx` - Seletor collections
- `components/sidebar/items/all/sidebar-create-item.tsx` - Orquestrador criação

## Próximos Passos

1. ✅ Análise concluída
2. ⏭️ Criar prompt especializado (Subtask 3.2)
3. ⏭️ Implementar criação do assistente (Subtask 3.3)
4. ⏭️ Implementar associação com collections (Subtask 3.4)
5. ⏭️ Configurar controle de acesso (Subtask 3.5)
6. ⏭️ Testes completos (Fase 6)

## Descobertas Importantes

🎯 **Sistema já está 90% pronto!** Apenas precisamos:
- Definir o prompt
- Usar funções existentes corretamente
- Filtrar collections por tipo (query simples)
- Aproveitar controle de acesso automático

⚠️ **Única "implementação" nova:**
- Query para filtrar collections por `collection_type = 'health_plan'`

✨ **Sistema existente já faz:**
- Criação de assistentes
- Associação com collections
- Controle de acesso por workspace
- Upload de imagens
- RLS e políticas de segurança

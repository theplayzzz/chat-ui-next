# Plano de Execução - Task #12: Componentes React para Health Plan Agent

## Decisões de Implementação

| Decisão | Escolha | Rationale |
|---------|---------|-----------|
| **Animações** | CSS Transitions (Tailwind) | Mais leve, sem dependências extras |
| **Estado** | Contexto separado (HealthPlanContext) | Melhor isolamento, mais fácil de testar |
| **Testes a11y** | Configurar jest-axe | Testes WCAG completos desde o início |

## Contexto

### Estrutura Existente
- **Design System**: Radix UI + Tailwind CSS com `cn()` utility
- **Tema**: next-themes com dark/light mode via CSS variables
- **Estado**: ChatbotUIContext centralizado (não usa Vercel AI SDK useChat diretamente)
- **Chat Handler**: Custom hook `useChatHandler()` em `/components/chat/chat-hooks/`
- **Testes**: Jest/Vitest + Testing Library + jest-axe (a instalar)

### Dados do Health Plan Agent
O agente implementa 5 steps com tipos bem definidos:
1. `extractClientInfo` → `PartialClientInfo`
2. `searchHealthPlans` → `SearchHealthPlansResponse`
3. `analyzeCompatibility` → `RankedAnalysis`
4. `fetchERPPrices` → `ERPPriceResult`
5. `generateRecommendation` → `GenerateRecommendationResult`

---

## Ordem de Implementação

### Subtask 12.1: health-plan-chat.tsx (Wrapper Principal)
**Arquivo**: `/components/health-plan/health-plan-chat.tsx`

**Estado centralizado via Context**:
```typescript
interface HealthPlanChatState {
  currentStep: 1 | 2 | 3 | 4 | 5
  clientInfo: PartialClientInfo | null
  searchResults: SearchHealthPlansResponse | null
  compatibilityAnalysis: RankedAnalysis | null
  erpPrices: ERPPriceResult | null
  recommendation: GenerateRecommendationResult | null
  isLoading: boolean
  error: string | null
}
```

**Responsabilidades**:
- Criar `HealthPlanContext` e provider
- Integrar com `useChatHandler` existente
- Renderizar sub-componentes condicionalmente baseado em `currentStep`
- Gerenciar histórico de mensagens scrollable
- Parsear tool results para atualizar estado

**Arquivos a criar**:
- `/components/health-plan/health-plan-chat.tsx`
- `/components/health-plan/health-plan-context.tsx`
- `/components/health-plan/types.ts` (re-exportar tipos do lib/tools)

---

### Subtask 12.2: progress-indicator.tsx (5 Etapas)
**Arquivo**: `/components/health-plan/progress-indicator.tsx`

**Design**:
```
[1]----[2]----[3]----[4]----[5]
 ✓      ●      ○      ○      ○
Coleta  Busca  Análise Preços Recom.
```

**Props**:
```typescript
interface ProgressIndicatorProps {
  currentStep: 1 | 2 | 3 | 4 | 5
  completedSteps: number[]
}
```

**Implementação**:
- 5 steps com ícones Lucide (User, Search, BarChart, DollarSign, FileText)
- Estados: pending (gray), in-progress (blue pulse), completed (green check)
- Linha conectora entre steps
- Responsive: horizontal desktop, vertical mobile
- Animação suave de transição (CSS transitions)

---

### Subtask 12.3: client-info-card.tsx (Resumo Dinâmico)
**Arquivo**: `/components/health-plan/client-info-card.tsx`

**Props**:
```typescript
interface ClientInfoCardProps {
  clientInfo: PartialClientInfo | null
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}
```

**Seções**:
- **Titular**: idade, cidade/estado
- **Dependentes**: lista com badges (cônjuge, filho, etc.)
- **Condições**: badges para pré-existentes
- **Medicamentos**: lista com ícone Pill
- **Orçamento**: formatado R$ X.XXX,XX
- **Preferências**: tags (rede ampla, coparticipação, etc.)

**Features**:
- Skeleton UI para campos não preenchidos
- Highlight de campos recém-atualizados (border pulse)
- Colapsável em mobile (Radix Collapsible)
- Ícones contextuais (User, Users, Heart, Pill, MapPin, DollarSign)

---

### Subtask 12.4: plan-comparison.tsx (Tabela Comparativa)
**Arquivo**: `/components/health-plan/plan-comparison.tsx`

**Props**:
```typescript
interface PlanComparisonProps {
  plans: PlanCompatibilityAnalysis[]
  erpPrices?: ERPPriceResult
  onSelectPlan?: (planId: string) => void
}
```

**Desktop (Tabela)**:
| Plano | Score | Cobertura | Preço/mês | Rede | Carência | Alertas |
|-------|-------|-----------|-----------|------|----------|---------|

**Mobile (Cards empilhados)**:
```
┌─────────────────────────┐
│ Plano ABC - Score: 85   │
│ R$ 890/mês              │
│ ⚠️ 2 alertas            │
│ [Ver detalhes]          │
└─────────────────────────┘
```

**Features**:
- Score visual (progress bar colorida 0-100)
- Badges para alertas críticos (vermelho), importantes (amarelo)
- Filtros: operadora, faixa preço, score mínimo
- Ordenação por coluna clicável
- Highlight do plano recomendado (#1)

---

### Subtask 12.5: recommendation-panel.tsx (Recomendação Final)
**Arquivo**: `/components/health-plan/recommendation-panel.tsx`

**Props**:
```typescript
interface RecommendationPanelProps {
  recommendation: GenerateRecommendationResult
  onAction?: (action: 'quote' | 'save' | 'share') => void
}
```

**Seções renderizadas**:
1. **Intro**: Saudação empática
2. **Recomendação Principal**: Card destacado com plano #1
3. **Alternativas**: Budget e Premium options
4. **Tabela Comparativa**: Markdown → HTML via react-markdown
5. **Alertas**: Categorizados por urgência
6. **Próximos Passos**: Checklist de ações

**Features**:
- react-markdown + remark-gfm para tabelas
- Tooltips de glossário para termos técnicos (Radix Tooltip)
- Alertas com ícones e cores por severidade
- Botões de ação: "Solicitar Cotação", "Salvar", "Compartilhar"
- Estilos prose do Tailwind Typography

---

### Subtask 12.6: Temas e Responsividade
**Arquivos a modificar**: Todos os componentes acima

**Checklist**:
- [ ] Todas as cores usam CSS variables (--primary, --muted, etc.)
- [ ] Classes dark: para cada cor customizada
- [ ] Breakpoints: sm (640px), md (768px), lg (1024px)
- [ ] Mobile-first: estilos base são mobile
- [ ] Testar em viewports: 320px, 768px, 1024px, 1440px
- [ ] Transição de tema suave (transition-colors)
- [ ] Contrast ratio WCAG AA (4.5:1 para texto)

---

### Subtask 12.7: Testes de Acessibilidade e Integração
**Diretório**: `/components/health-plan/__tests__/`

**Setup necessário**:
```bash
npm install --save-dev jest-axe @types/jest-axe
```

**Arquivos de teste**:
- `health-plan-chat.test.tsx` - Integração e fluxo completo
- `progress-indicator.test.tsx` - Estados e transições
- `client-info-card.test.tsx` - Renderização parcial
- `plan-comparison.test.tsx` - Filtros e ordenação
- `recommendation-panel.test.tsx` - Markdown rendering

**Categorias de teste**:
1. **Acessibilidade** (jest-axe): Sem violações WCAG
2. **Keyboard navigation**: Tab, Enter, Escape
3. **ARIA roles**: progressbar, table, alert, tooltip
4. **Integração**: Fluxo completo de 5 steps
5. **Responsividade**: Renderização em diferentes viewports

---

## Fluxo de Atualização do TaskMaster

Durante a implementação, atualizar status das subtasks:

```bash
# Ao iniciar cada subtask
task-master set-status --id=12.X --status=in-progress

# Ao concluir cada subtask (com notas)
task-master update-subtask --id=12.X --prompt="Implementado: [detalhes]. Arquivos: [lista]"
task-master set-status --id=12.X --status=done

# Se encontrar bloqueios
task-master update-subtask --id=12.X --prompt="Bloqueado por: [motivo]. Workaround: [solução]"
```

---

## Arquivos Críticos para Referência

### Design System
- `/components/ui/button.tsx` - Padrão de variantes CVA
- `/components/ui/card.tsx` - Estrutura de cards
- `/components/ui/progress.tsx` - Radix Progress
- `/components/ui/tooltip.tsx` - WithTooltip wrapper
- `/app/[locale]/globals.css` - CSS variables

### Chat Existente
- `/components/chat/chat-ui.tsx` - Layout principal
- `/components/chat/chat-hooks/use-chat-handler.tsx` - Lógica de mensagens
- `/context/context.tsx` - ChatbotUIContext pattern

### Health Plan Types
- `/lib/tools/health-plan/schemas/*.ts` - Zod schemas
- `/lib/tools/health-plan/types/*.ts` - TypeScript interfaces
- `/lib/tools/health-plan/orchestrator.ts` - Fluxo de 5 steps

### Testes
- `/lib/tools/health-plan/__tests__/*.test.ts` - Padrões existentes
- `/jest.config.ts` - Configuração Jest

---

## Dependências a Instalar

```bash
# Para recommendation-panel (Markdown)
npm install react-markdown remark-gfm

# Para testes de acessibilidade
npm install --save-dev jest-axe @types/jest-axe
```

**Nota**: Animações serão feitas com CSS Transitions do Tailwind (transition-*, animate-*), sem dependências extras.

---

## Estimativa de Complexidade por Subtask

| Subtask | Complexidade | Arquivos | Dependências |
|---------|--------------|----------|--------------|
| 12.1    | Alta         | 3        | -            |
| 12.2    | Média        | 1        | 12.1         |
| 12.3    | Média        | 1        | 12.1         |
| 12.4    | Alta         | 1        | 12.1         |
| 12.5    | Alta         | 1        | 12.1         |
| 12.6    | Média        | 5+       | 12.2-12.5    |
| 12.7    | Média        | 5        | 12.2-12.6    |

**Ordem recomendada**: 12.1 → (12.2, 12.3, 12.4, 12.5 em paralelo conceitual) → 12.6 → 12.7

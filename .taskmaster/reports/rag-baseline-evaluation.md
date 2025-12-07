# RAG Baseline Evaluation Report

**Data:** 2025-12-06T20:48:12.062Z
**Casos Testados:** 24
**PRD Reference:** .taskmaster/docs/agentic-rag-implementation-prd.md (Fase 6D.3)

---

## 📊 Resumo Executivo

| Métrica | Valor | Target | Status |
|---------|-------|--------|--------|
| Taxa de Sucesso | 25.0% | >= 80% | ⚠️ |
| Docs Relevantes (média) | 3.5 | >= 5 | ⚠️ |
| Taxa de Rewrite | 62.5% | < 30% | ⚠️ |
| Latência Média | 215ms | < 8000ms | ✅ |

---

## 📈 Métricas de Avaliação

### Scores dos Avaliadores

| Avaliador | Média | Min | Max |
|-----------|-------|-----|-----|
| Relevance | 0.49 | - | - |
| Groundedness | 0.50 | - | - |
| Retrieval Quality | 0.81 | - | - |
| **Overall** | **0.59** | 0.44 | 0.71 |

### Distribuição de Rewrites

- Casos com 0 rewrites: 9
- Casos com 1 rewrite: 14
- Casos com 2 rewrites: 1

---

## 📂 Resultados por Categoria

| Categoria | Total | Passou | Taxa | Score Médio |
|-----------|-------|--------|------|-------------|
| caso-edge | 1 | 0 | 0% ⚠️ | 0.67 |
| orcamento-variado | 3 | 0 | 0% ⚠️ | 0.62 |
| condicoes-pre-existentes | 5 | 3 | 60% ⚠️ | 0.60 |
| individual-jovem | 4 | 2 | 50% ⚠️ | 0.59 |
| idoso | 4 | 0 | 0% ⚠️ | 0.58 |
| familia-criancas | 4 | 1 | 25% ⚠️ | 0.57 |
| regiao-diversa | 3 | 0 | 0% ⚠️ | 0.53 |

---

## ⚠️ Casos Problemáticos (4)

| ID | Descrição | Docs Relevantes | Score | Problema |
|----|-----------|--------------------|-------|----------|
| case-003 | Individual jovem interior baixo orcament... | 1 | 0.44 | Poucos docs |
| case-012 | Idosa 65 anos baixo orcamento... | 2 | 0.56 | Poucos docs |
| case-021 | Interior Minas Gerais... | 2 | 0.48 | Poucos docs |
| case-023 | Sul Florianopolis familia... | 2 | 0.55 | Poucos docs |

---

## 📋 Detalhes por Caso

<details>
<summary>Clique para expandir todos os casos</summary>

| # | ID | Categoria | Docs | Rewrites | Score | Status |
|---|----|-----------|----- |----------|-------|--------|
| 1 | case-001 | individual-jovem | 5/5 | 0 | 0.62 | ✅ |
| 2 | case-002 | individual-jovem | 3/5 | 0 | 0.59 | ❌ |
| 3 | case-003 | individual-jovem | 1/3 | 2 | 0.44 | ❌ |
| 4 | case-004 | individual-jovem | 5/5 | 0 | 0.71 | ✅ |
| 5 | case-005 | familia-criancas | 3/5 | 1 | 0.54 | ❌ |
| 6 | case-006 | familia-criancas | 5/5 | 1 | 0.63 | ✅ |
| 7 | case-007 | familia-criancas | 4/4 | 1 | 0.57 | ❌ |
| 8 | case-008 | familia-criancas | 4/5 | 1 | 0.55 | ❌ |
| 9 | case-009 | idoso | 4/5 | 1 | 0.65 | ❌ |
| 10 | case-010 | idoso | 3/4 | 0 | 0.56 | ❌ |
| 11 | case-011 | idoso | 3/3 | 0 | 0.56 | ❌ |
| 12 | case-012 | idoso | 2/3 | 1 | 0.56 | ❌ |
| 13 | case-013 | condicoes-pre-existentes | 5/5 | 1 | 0.60 | ✅ |
| 14 | case-014 | condicoes-pre-existentes | 5/5 | 1 | 0.67 | ✅ |
| 15 | case-015 | condicoes-pre-existentes | 4/4 | 0 | 0.60 | ✅ |
| 16 | case-016 | condicoes-pre-existentes | 3/4 | 0 | 0.62 | ❌ |
| 17 | case-017 | condicoes-pre-existentes | 3/4 | 1 | 0.52 | ❌ |
| 18 | case-018 | orcamento-variado | 3/3 | 1 | 0.53 | ❌ |
| 19 | case-019 | orcamento-variado | 4/5 | 0 | 0.66 | ❌ |
| 20 | case-020 | orcamento-variado | 4/5 | 1 | 0.66 | ❌ |
| 21 | case-021 | regiao-diversa | 2/3 | 1 | 0.48 | ❌ |
| 22 | case-022 | regiao-diversa | 3/3 | 0 | 0.57 | ❌ |
| 23 | case-023 | regiao-diversa | 2/4 | 1 | 0.55 | ❌ |
| 24 | case-024 | caso-edge | 4/5 | 1 | 0.67 | ❌ |

</details>

---

## 🎯 Recomendações

- **Aumentar docs relevantes**: Revisar prompts de geração de queries e configuração de retrieval
- **Reduzir taxa de rewrite**: Melhorar qualidade inicial das queries geradas
- **Melhorar relevância**: Ajustar critérios de grading e filtros de busca

---

## 📊 Configuração LangSmith

```
Project: health-plan-agent
Dataset: rag-evaluation-baseline
Experiment Prefix: rag-baseline-2025-12-06
```

---

*Relatório gerado automaticamente por `scripts/run-rag-evaluation.ts`*

---
name: prd-maker
description: criar PRDs estruturados e conscientes de dependências usando a metodologia RPG da Microsoft Research
model: sonnet
color: red
---

<rpg-method>
# Método Repository Planning Graph (RPG) - Template de PRD

Este template ensina você (IA ou humano) como criar PRDs estruturados e conscientes de dependências usando a metodologia RPG da Microsoft Research. A ideia chave: separar O QUE (funcional) do COMO (estrutural) e então conectá-los com dependências explícitas.

## Princípios Fundamentais

1. **Dual-Semantics**: Pense funcional (capacidades) E estrutural (organização do código) separadamente, depois mapeie-os
2. **Dependências Explícitas**: Nunca assuma - sempre declare o que depende do quê
3. **Ordem Topológica**: Construa a fundação primeiro, depois as camadas em cima
4. **Refinamento Progressivo**: Comece amplo, refine iterativamente

## Como Usar Este Template

- Siga as instruções em cada bloco `<instruction>`
- Veja os blocos `<example>` para ver padrões bons vs ruins
- Preencha as seções de conteúdo com os detalhes do seu projeto
- A IA que ler isso aprenderá o método RPG seguindo o processo
- O Task Master irá analisar o PRD resultante em tarefas conscientes de dependências

## Ferramentas Recomendadas para Criar PRDs

Ao usar este template para **criar** um PRD (não analisá-lo), use **assistentes de IA conscientes do contexto do código** para melhores resultados:

**Por quê?** A IA precisa entender sua base de código existente para tomar boas decisões arquiteturais sobre módulos, dependências e pontos de integração.

**Ferramentas recomendadas:**
- **Claude Code** (claude-code CLI) - Melhor para raciocínio estruturado e grandes contextos
- **Cursor/Windsurf** - Integração IDE com contexto completo da base de código
- **Gemini CLI** (gemini-cli) - Janela de contexto massiva para grandes bases de código
- **Codex/Grok CLI** - Forte geração de código com consciência de contexto

**Nota:** Uma vez que seu PRD é criado, `task-master parse-prd` funciona com qualquer modelo de IA configurado - ele só precisa ler o texto do PRD em si, não sua base de código.
</rpg-method>

---

<overview>
<instruction>
Comece com o problema, não a solução. Seja específico sobre:
- Qual ponto de dor existe?
- Quem o experimenta?
- Por que as soluções existentes não funcionam?
- Como é o sucesso (resultados mensuráveis)?

Mantenha esta seção focada - não pule para detalhes de implementação ainda.
</instruction>

## Declaração do Problema
[Descreva o problema central. Seja concreto sobre os pontos de dor do usuário.]

## Usuários-Alvo
[Defina personas, seus fluxos de trabalho e o que estão tentando alcançar.]

## Métricas de Sucesso
[Resultados quantificáveis. Exemplos: "80% de conclusão de tarefas via piloto automático", "< 5% de taxa de intervenção manual"]

</overview>

---

<functional-decomposition>
<instruction>
Agora pense sobre CAPACIDADES (o que o sistema FAZ), ainda não sobre estrutura de código.

Passo 1: Identifique domínios de capacidade de alto nível
- Pense: "Quais coisas importantes este sistema faz?"
- Exemplos: Gerenciamento de Dados, Processamento Central, Camada de Apresentação

Passo 2: Para cada capacidade, enumere recursos específicos
- Use estratégia explorar-explorar:
  * Explorar: Quais recursos são NECESSÁRIOS para valor central?
  * Explorar: Quais recursos tornam este domínio COMPLETO?

Passo 3: Para cada recurso, defina:
- Descrição: O que ele faz em uma frase
- Entradas: Quais dados/contexto ele precisa
- Saídas: O que ele produz/retorna
- Comportamento: Lógica ou transformações chave

<example type="good">
Capacidade: Validação de Dados
  Recurso: Validação de esquema
    - Descrição: Validar payloads JSON contra esquemas definidos
    - Entradas: Objeto JSON, definição de esquema
    - Saídas: Resultado da validação (passou/falhou) + detalhes de erro
    - Comportamento: Iterar campos, verificar tipos, impor restrições

  Recurso: Validação de regras de negócio
    - Descrição: Aplicar regras de validação específicas do domínio
    - Entradas: Objeto de dados validado, conjunto de regras
    - Saídas: Booleano + lista de regras violadas
    - Comportamento: Executar regras sequencialmente, curto-circuito em falha
</example>

<example type="bad">
Capacidade: validation.js
  (Problema: Isto é um ARQUIVO, não uma CAPACIDADE. Misturando estrutura no pensamento funcional.)

Capacidade: Validação
  Recurso: Certificar-se de que os dados são bons
  (Problema: Muito vago. Sem entradas/saídas. Não acionável.)
</example>
</instruction>

## Árvore de Capacidades

### Capacidade: [Nome]
[Breve descrição do que este domínio de capacidade cobre]

#### Recurso: [Nome]
- **Descrição**: [Uma frase]
- **Entradas**: [O que ele precisa]
- **Saídas**: [O que ele produz]
- **Comportamento**: [Lógica chave]

#### Recurso: [Nome]
- **Descrição**:
- **Entradas**:
- **Saídas**:
- **Comportamento**:

### Capacidade: [Nome]
...

</functional-decomposition>

---

<structural-decomposition>
<instruction>
AGORA pense sobre organização de código. Mapeie capacidades para estrutura real de arquivos/pastas.

Regras:
1. Cada capacidade mapeia para um módulo (pasta ou arquivo)
2. Recursos dentro de uma capacidade mapeiam para funções/classes
3. Use limites de módulo claros - cada módulo tem UMA responsabilidade
4. Defina o que cada módulo exporta (interface pública)

O objetivo: Criar um mapeamento claro entre "o que ele faz" (funcional) e "onde ele mora" (estrutural).

<example type="good">
Capacidade: Validação de Dados
  → Mapeia para: src/validation/
    ├── schema-validator.js      (recurso de validação de esquema)
    ├── rule-validator.js         (recurso de validação de regras de negócio)
    └── index.js                  (exportações públicas)

Exportações:
  - validateSchema(data, schema)
  - validateRules(data, rules)
</example>

<example type="bad">
Capacidade: Validação de Dados
  → Mapeia para: src/utils.js
  (Problema: "utils" não é um limite de módulo claro. Onde encontro lógica de validação?)

Capacidade: Validação de Dados
  → Mapeia para: src/validation/everything.js
  (Problema: Um arquivo gigante. Recursos devem mapear para arquivos separados para manutenibilidade.)
</example>
</instruction>

## Estrutura do Repositório

```
project-root/
├── src/
│   ├── [nome-do-módulo]/       # Mapeia para: [Nome da Capacidade]
│   │   ├── [arquivo].js        # Mapeia para: [Nome do Recurso]
│   │   └── index.js         # Exportações públicas
│   └── [nome-do-módulo]/
├── tests/
└── docs/
```

## Definições de Módulos

### Módulo: [Nome]
- **Mapeia para capacidade**: [Capacidade da decomposição funcional]
- **Responsabilidade**: [Propósito único claro]
- **Estrutura de arquivos**:
  ```
  nome-do-módulo/
  ├── recurso1.js
  ├── recurso2.js
  └── index.js
  ```
- **Exportações**:
  - `nomeFunção()` - [o que ela faz]
  - `NomeClasse` - [o que ela faz]

</structural-decomposition>

---

<dependency-graph>
<instruction>
Esta é A SEÇÃO CRÍTICA para análise do Task Master.

Defina dependências explícitas entre módulos. Isso cria a ordem topológica para execução de tarefas.

Regras:
1. Liste módulos em ordem de dependência (fundação primeiro)
2. Para cada módulo, declare de que ele depende
3. Módulos de fundação devem ter ZERO dependências
4. Todo módulo não-fundação deve depender de pelo menos um outro módulo
5. Pense: "O que deve EXISTIR antes de eu poder construir este módulo?"

<example type="good">
Camada de Fundação (sem dependências):
  - tratamento-de-erros: Sem dependências
  - gerenciador-de-config: Sem dependências
  - tipos-base: Sem dependências

Camada de Dados:
  - validador-de-esquema: Depende de [tipos-base, tratamento-de-erros]
  - ingestão-de-dados: Depende de [validador-de-esquema, gerenciador-de-config]

Camada Central:
  - motor-de-algoritmo: Depende de [tipos-base, tratamento-de-erros]
  - orquestrador-de-pipeline: Depende de [motor-de-algoritmo, ingestão-de-dados]
</example>

<example type="bad">
- validação: Depende de API
- API: Depende de validação
(Problema: Dependência circular. Isso causará problemas de build/runtime.)

- autenticação-usuário: Depende de tudo
(Problema: Muitas dependências. Deveria ser mais focado.)
</example>
</instruction>

## Cadeia de Dependências

### Camada de Fundação (Fase 0)
Sem dependências - estes são construídos primeiro.

- **[Nome do Módulo]**: [O que ele fornece]
- **[Nome do Módulo]**: [O que ele fornece]

### [Nome da Camada] (Fase 1)
- **[Nome do Módulo]**: Depende de [[módulo-da-fase-0], [módulo-da-fase-0]]
- **[Nome do Módulo]**: Depende de [[módulo-da-fase-0]]

### [Nome da Camada] (Fase 2)
- **[Nome do Módulo]**: Depende de [[módulo-da-fase-1], [módulo-da-fundação]]

[Continue construindo camadas...]

</dependency-graph>

---

<implementation-roadmap>
<instruction>
Transforme o gráfico de dependências em fases concretas de desenvolvimento.

Cada fase deve:
1. Ter critérios de entrada claros (o que deve existir antes de começar)
2. Conter tarefas que podem ser paralelizadas (sem interdependências dentro da fase)
3. Ter critérios de saída claros (como sabemos que a fase está completa?)
4. Construir em direção a algo UTILIZÁVEL (não apenas infraestrutura)

A ordenação de fases segue a ordenação topológica do gráfico de dependências.

<example type="good">
Fase 0: Fundação
  Entrada: Repositório limpo
  Tarefas:
    - Implementar utilitários de tratamento de erros
    - Criar definições de tipos base
    - Configurar sistema de configuração
  Saída: Outros módulos podem importar fundação sem erros

Fase 1: Camada de Dados
  Entrada: Fase 0 completa
  Tarefas:
    - Implementar validador de esquema (usa: tipos base, tratamento de erros)
    - Construir pipeline de ingestão de dados (usa: validador, config)
  Saída: Fluxo de dados fim-a-fim da entrada à saída validada
</example>

<example type="bad">
Fase 1: Construir Tudo
  Tarefas:
    - API
    - Banco de dados
    - UI
    - Testes
  (Problema: Sem foco claro. Muito amplo. Dependências não consideradas.)
</example>
</instruction>

## Fases de Desenvolvimento

### Fase 0: [Nome da Fundação]
**Objetivo**: [Qual capacidade fundamental isso estabelece]

**Critérios de Entrada**: [O que deve ser verdadeiro antes de começar]

**Tarefas**:
- [ ] [Nome da tarefa] (depende de: [nenhum ou lista])
  - Critérios de aceitação: [Como sabemos que está pronto]
  - Estratégia de teste: [Quais testes provam que funciona]

- [ ] [Nome da tarefa] (depende de: [nenhum ou lista])

**Critérios de Saída**: [Resultado observável que prova que a fase está completa]

**Entrega**: [O que os usuários/desenvolvedores podem fazer após esta fase?]

---

### Fase 1: [Nome da Camada]
**Objetivo**:

**Critérios de Entrada**: Fase 0 completa

**Tarefas**:
- [ ] [Nome da tarefa] (depende de: [[tarefas-da-fase-0]])
- [ ] [Nome da tarefa] (depende de: [[tarefas-da-fase-0]])

**Critérios de Saída**:

**Entrega**:

---

[Continue com mais fases...]

</implementation-roadmap>

---

<test-strategy>
<instruction>
Defina como os testes serão integrados ao longo do desenvolvimento (abordagem TDD).

Especifique:
1. Proporções da pirâmide de testes (unitário vs integração vs e2e)
2. Requisitos de cobertura
3. Cenários de teste críticos
4. Diretrizes de geração de testes para o Surgical Test Generator

Esta seção orienta a IA ao gerar testes durante a fase RED do TDD.

<example type="good">
Cenários de Teste Críticos para módulo de Validação de Dados:
  - Caminho feliz: Dados válidos passam todas as verificações
  - Casos extremos: Strings vazias, valores nulos, números de limite
  - Casos de erro: Tipos inválidos, campos obrigatórios ausentes
  - Integração: Validador funciona com pipeline de ingestão
</example>
</instruction>

## Pirâmide de Testes

```
        /\
       /E2E\       ← [X]% (Fim-a-fim, lento, abrangente)
      /------\
     /Integração\ ← [Y]% (Interações de módulos)
    /------------\
   /Testes Unitár\ ← [Z]% (Rápido, isolado, determinístico)
  /----------------\
```

## Requisitos de Cobertura
- Cobertura de linha: [X]% mínimo
- Cobertura de ramificação: [X]% mínimo
- Cobertura de função: [X]% mínimo
- Cobertura de instrução: [X]% mínimo

## Cenários de Teste Críticos

### [Nome do Módulo/Recurso]
**Caminho feliz**:
- [Descrição do cenário]
- Esperado: [O que deveria acontecer]

**Casos extremos**:
- [Descrição do cenário]
- Esperado: [O que deveria acontecer]

**Casos de erro**:
- [Descrição do cenário]
- Esperado: [Como o sistema lida com falhas]

**Pontos de integração**:
- [Quais interações testar]
- Esperado: [Comportamento fim-a-fim]

## Diretrizes de Geração de Testes
[Instruções específicas para o Surgical Test Generator sobre no que focar, quais padrões seguir, convenções de teste específicas do projeto]

</test-strategy>

---

<architecture>
<instruction>
Descreva arquitetura técnica, modelos de dados e decisões chave de design.

Mantenha esta seção APÓS decomposição funcional/estrutural - detalhes de implementação vêm após entender a estrutura.
</instruction>

## Componentes do Sistema
[Partes arquiteturais principais e suas responsabilidades]

## Modelos de Dados
[Estruturas de dados principais, esquemas, design de banco de dados]

## Stack Tecnológica
[Linguagens, frameworks, bibliotecas chave]

**Decisão: [Tecnologia/Padrão]**
- **Justificativa**: [Por que escolhido]
- **Trade-offs**: [O que estamos abrindo mão]
- **Alternativas consideradas**: [O que mais analisamos]

</architecture>

---

<risks>
<instruction>
Identifique riscos que podem descarrilar o desenvolvimento e como mitigá-los.

Categorias:
- Riscos técnicos (complexidade, desconhecidos)
- Riscos de dependência (problemas bloqueadores)
- Riscos de escopo (aumento, subestimação)
</instruction>

## Riscos Técnicos
**Risco**: [Descrição]
- **Impacto**: [Alto/Médio/Baixo - efeito no projeto]
- **Probabilidade**: [Alto/Médio/Baixo]
- **Mitigação**: [Como abordar]
- **Plano B**: [Plano B se mitigação falhar]

## Riscos de Dependência
[Dependências externas, problemas bloqueadores]

## Riscos de Escopo
[Aumento de escopo, subestimação, requisitos não claros]

</risks>

---

<appendix>
## Referências
[Papers, documentação, sistemas similares]

## Glossário
[Termos específicos do domínio]

## Questões em Aberto
[Coisas a resolver durante o desenvolvimento]
</appendix>

---

<task-master-integration>
# Como o Task Master Usa Este PRD

Quando você executa `task-master parse-prd <arquivo>.txt`, o parser:

1. **Extrai capacidades** → Tarefas principais
   - Cada `### Capacidade:` se torna uma tarefa de alto nível

2. **Extrai recursos** → Subtarefas
   - Cada `#### Recurso:` se torna uma subtarefa sob sua capacidade

3. **Analisa dependências** → Dependências de tarefas
   - `Depende de: [X, Y]` define task.dependencies = ["X", "Y"]

4. **Ordena por fases** → Prioridades de tarefas
   - Tarefas da Fase 0 = maior prioridade
   - Tarefas da Fase N = menor prioridade, devidamente sequenciadas

5. **Usa estratégia de teste** → Contexto de geração de testes
   - Alimenta cenários de teste para Surgical Test Generator durante implementação

**Resultado**: Um gráfico de tarefas consciente de dependências que pode ser executado em ordem topológica.

## Por Que a Estrutura RPG Importa

PRDs planos tradicionais levam a:
- ❌ Dependências de tarefas não claras
- ❌ Ordenação arbitrária de tarefas
- ❌ Dependências circulares descobertas tarde
- ❌ Tarefas mal dimensionadas

PRDs estruturados em RPG fornecem:
- ✅ Cadeias de dependência explícitas
- ✅ Ordem de execução topológica
- ✅ Limites de módulo claros
- ✅ Gráfico de tarefas validado antes da implementação

## Dicas para Melhores Resultados

1. **Gaste tempo no gráfico de dependências** - Esta é a seção mais valiosa para o Task Master
2. **Mantenha recursos atômicos** - Cada recurso deve ser testável independentemente
3. **Refinamento progressivo** - Comece amplo, use `task-master expand` para quebrar tarefas complexas
4. **Use modo de pesquisa** - `task-master parse-prd --research` aproveita IA para melhor geração de tarefas
</task-master-integration>

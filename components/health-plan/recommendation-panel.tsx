"use client"

/**
 * Recommendation Panel
 *
 * Displays the final health plan recommendation with
 * rich markdown formatting, glossary tooltips, and action buttons.
 *
 * Task Master: Task #12.5
 */

import { useState } from "react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Star,
  Download,
  Share2,
  FileText,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  Sparkles
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/with-tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible"
import type { GenerateRecommendationResult, StructuredAlerts } from "./types"

// =============================================================================
// TYPES
// =============================================================================

export interface RecommendationPanelProps {
  recommendation: GenerateRecommendationResult
  onAction?: (action: "quote" | "save" | "share") => void
  className?: string
}

// =============================================================================
// GLOSSARY
// =============================================================================

const GLOSSARY: Record<string, string> = {
  carência:
    "Período que você precisa esperar após contratar o plano para poder usar determinados serviços.",
  coparticipação:
    "Modelo onde você paga uma parte do custo de cada procedimento, além da mensalidade.",
  cobertura:
    "Conjunto de procedimentos, exames e tratamentos incluídos no plano.",
  "rede credenciada":
    "Hospitais, clínicas e laboratórios conveniados ao plano que você pode utilizar.",
  "doença preexistente":
    "Condição de saúde que você já tinha antes de contratar o plano.",
  "CPT (Cobertura Parcial Temporária)":
    "Período de 24 meses em que procedimentos relacionados a doenças preexistentes têm cobertura limitada.",
  franquia:
    "Valor fixo que você paga por atendimento antes que o plano cubra o restante.",
  reembolso:
    "Devolução de valores pagos por atendimentos fora da rede credenciada.",
  "rol da ANS":
    "Lista oficial de procedimentos que todos os planos devem cobrir obrigatoriamente."
}

function GlossaryTerm({
  term,
  children
}: {
  term: string
  children: React.ReactNode
}) {
  const explanation = GLOSSARY[term.toLowerCase()]

  if (!explanation) {
    return <>{children}</>
  }

  return (
    <WithTooltip
      display={
        <div className="max-w-xs">
          <p className="text-sm font-medium">{term}</p>
          <p className="text-muted-foreground mt-1 text-xs">{explanation}</p>
        </div>
      }
      trigger={
        <span className="border-primary/30 cursor-help border-b border-dotted">
          {children}
        </span>
      }
      side="top"
      delayDuration={200}
    />
  )
}

/**
 * Process text to wrap glossary terms with tooltips
 */
function processTextForGlossary(text: string): React.ReactNode {
  const terms = Object.keys(GLOSSARY)
  // Sort by length (longest first) to match longer phrases before shorter ones
  const sortedTerms = terms.sort((a, b) => b.length - a.length)

  // Create regex pattern for all terms (case insensitive)
  const pattern = sortedTerms
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")

  if (!pattern) return text

  const regex = new RegExp(`(${pattern})`, "gi")
  const parts = text.split(regex)

  return parts.map((part, index) => {
    const matchedTerm = terms.find(
      term => term.toLowerCase() === part.toLowerCase()
    )
    if (matchedTerm) {
      return (
        <GlossaryTerm key={index} term={matchedTerm}>
          {part}
        </GlossaryTerm>
      )
    }
    return part
  })
}

// =============================================================================
// ALERT COMPONENT
// =============================================================================

interface AlertItemProps {
  urgency: "critico" | "importante" | "informativo"
  title: string
  description: string
}

function AlertItem({ urgency, title, description }: AlertItemProps) {
  const config = {
    critico: {
      icon: AlertTriangle,
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      iconColor: "text-red-500",
      titleColor: "text-red-700 dark:text-red-400"
    },
    importante: {
      icon: AlertCircle,
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/30",
      iconColor: "text-amber-500",
      titleColor: "text-amber-700 dark:text-amber-400"
    },
    informativo: {
      icon: Info,
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/30",
      iconColor: "text-blue-500",
      titleColor: "text-blue-700 dark:text-blue-400"
    }
  }

  const {
    icon: Icon,
    bgColor,
    borderColor,
    iconColor,
    titleColor
  } = config[urgency]

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        bgColor,
        borderColor
      )}
      role="alert"
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconColor)} />
      <div>
        <p className={cn("font-medium", titleColor)}>{title}</p>
        <p className="text-foreground/80 mt-0.5 text-sm">{description}</p>
      </div>
    </div>
  )
}

/**
 * Component to display structured alerts using AlertItem
 */
interface StructuredAlertsDisplayProps {
  alerts: StructuredAlerts
}

function StructuredAlertsDisplay({ alerts }: StructuredAlertsDisplayProps) {
  const hasAlerts =
    alerts.critical.length > 0 ||
    alerts.important.length > 0 ||
    alerts.informative.length > 0

  if (!hasAlerts) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
        <CheckCircle2 className="size-5 text-green-500" />
        <p className="text-green-700 dark:text-green-400">
          Nenhum alerta importante para este plano.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary if available */}
      {alerts.summary && (
        <p className="text-muted-foreground text-sm">{alerts.summary}</p>
      )}

      {/* Critical Alerts */}
      {alerts.critical.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400">
            Alertas Críticos
          </h4>
          <div className="space-y-2">
            {alerts.critical.map((alert, index) => (
              <AlertItem
                key={`critical-${index}`}
                urgency="critico"
                title={alert.title}
                description={`${alert.description}${alert.impact ? ` • Impacto: ${alert.impact}` : ""}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Important Alerts */}
      {alerts.important.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Alertas Importantes
          </h4>
          <div className="space-y-2">
            {alerts.important.map((alert, index) => (
              <AlertItem
                key={`important-${index}`}
                urgency="importante"
                title={alert.title}
                description={`${alert.description}${alert.impact ? ` • Impacto: ${alert.impact}` : ""}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Informative Alerts */}
      {alerts.informative.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">
            Informações Importantes
          </h4>
          <div className="space-y-2">
            {alerts.informative.map((alert, index) => (
              <AlertItem
                key={`informative-${index}`}
                urgency="informativo"
                title={alert.title}
                description={`${alert.description}${alert.impact ? ` • Impacto: ${alert.impact}` : ""}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SECTION COMPONENTS
// =============================================================================

interface SectionProps {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  defaultOpen?: boolean
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true
}: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-b pb-4">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between py-2">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              {Icon && <Icon className="text-primary size-5" />}
              {title}
            </h3>
            {isOpen ? (
              <ChevronUp className="text-muted-foreground size-5" />
            ) : (
              <ChevronDown className="text-muted-foreground size-5" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// =============================================================================
// MARKDOWN COMPONENTS
// =============================================================================

/**
 * Process children to apply glossary term detection to text nodes
 */
function processChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return processTextForGlossary(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === "string") {
        return <span key={index}>{processTextForGlossary(child)}</span>
      }
      return child
    })
  }
  return children
}

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-foreground mb-4 text-2xl font-bold">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-foreground mb-3 mt-6 text-xl font-semibold">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-foreground mb-2 mt-4 text-lg font-medium">
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p className="text-foreground/90 mb-3 leading-relaxed">
      {processChildren(children)}
    </p>
  ),
  ul: ({ children }: any) => (
    <ul className="mb-3 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mb-3 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="text-foreground/90">{processChildren(children)}</li>
  ),
  strong: ({ children }: any) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="text-foreground/80 italic">{children}</em>
  ),
  table: ({ children }: any) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-muted/50 border-b">{children}</thead>
  ),
  tbody: ({ children }: any) => <tbody>{children}</tbody>,
  tr: ({ children }: any) => (
    <tr className="border-b last:border-0">{children}</tr>
  ),
  th: ({ children }: any) => (
    <th className="text-foreground px-4 py-2 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="text-foreground/90 px-4 py-2">
      {processChildren(children)}
    </td>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-primary/30 bg-primary/5 my-3 border-l-4 py-2 pl-4 italic">
      {processChildren(children)}
    </blockquote>
  ),
  code: ({ children, inline }: any) =>
    inline ? (
      <code className="bg-muted rounded px-1 py-0.5 text-sm">{children}</code>
    ) : (
      <code className="bg-muted block overflow-x-auto rounded-lg p-3 text-sm">
        {children}
      </code>
    )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function RecommendationPanel({
  recommendation,
  onAction,
  className
}: RecommendationPanelProps) {
  if (!recommendation.success) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="text-destructive mx-auto mb-4 size-12" />
          <p className="text-destructive font-medium">
            Erro ao gerar recomendação
          </p>
          {recommendation.error && (
            <p className="text-muted-foreground mt-2 text-sm">
              {recommendation.error}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const { sections, metadata } = recommendation

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-primary/5 border-b">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-primary size-6" />
          Sua Recomendação Personalizada
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Análise gerada em{" "}
          {new Date(metadata.generatedAt).toLocaleString("pt-BR")}
        </p>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        {/* Intro Section */}
        {sections.intro && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {sections.intro}
            </ReactMarkdown>
          </div>
        )}

        {/* Main Recommendation */}
        {sections.mainRecommendation && (
          <Section
            title="Recomendação Principal"
            icon={Star}
            defaultOpen={true}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {sections.mainRecommendation}
              </ReactMarkdown>
            </div>
          </Section>
        )}

        {/* Alternatives */}
        {sections.alternatives && (
          <Section title="Alternativas" icon={ArrowRight} defaultOpen={true}>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {sections.alternatives}
              </ReactMarkdown>
            </div>
          </Section>
        )}

        {/* Comparison Table */}
        {sections.comparisonTable && (
          <Section
            title="Tabela Comparativa"
            icon={FileText}
            defaultOpen={true}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {sections.comparisonTable}
              </ReactMarkdown>
            </div>
          </Section>
        )}

        {/* Alerts - Use structured alerts if available, fallback to markdown */}
        {(recommendation.structuredAlerts || sections.alerts) && (
          <Section
            title="Alertas Importantes"
            icon={AlertTriangle}
            defaultOpen={true}
          >
            {recommendation.structuredAlerts ? (
              <StructuredAlertsDisplay
                alerts={recommendation.structuredAlerts}
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {sections.alerts}
                </ReactMarkdown>
              </div>
            )}
          </Section>
        )}

        {/* Next Steps */}
        {sections.nextSteps && (
          <Section
            title="Próximos Passos"
            icon={CheckCircle2}
            defaultOpen={true}
          >
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {sections.nextSteps}
              </ReactMarkdown>
            </div>
          </Section>
        )}

        {/* Full Markdown (fallback) */}
        {!sections.intro && recommendation.markdown && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {recommendation.markdown}
            </ReactMarkdown>
          </div>
        )}
      </CardContent>

      <CardFooter className="bg-muted/30 flex flex-wrap gap-3 border-t p-4">
        <Button
          onClick={() => onAction?.("quote")}
          className="flex-1 sm:flex-none"
        >
          <FileText className="mr-2 size-4" />
          Solicitar Cotação
        </Button>
        <Button
          variant="outline"
          onClick={() => onAction?.("save")}
          className="flex-1 sm:flex-none"
        >
          <Download className="mr-2 size-4" />
          Salvar PDF
        </Button>
        <Button
          variant="outline"
          onClick={() => onAction?.("share")}
          className="flex-1 sm:flex-none"
        >
          <Share2 className="mr-2 size-4" />
          Compartilhar
        </Button>
      </CardFooter>

      {/* Metadata */}
      <div className="bg-muted/20 border-t px-4 py-2">
        <p className="text-muted-foreground text-xs">
          Análise v{metadata.version} • Modelo: {metadata.modelUsed} • Tempo:{" "}
          {metadata.executionTimeMs}ms
          {metadata.tokensUsed && ` • Tokens: ${metadata.tokensUsed}`}
        </p>
      </div>
    </Card>
  )
}

"use client"

/**
 * Plan Comparison
 *
 * Displays a comparison table/cards of health plans with scores,
 * coverage info, prices, and alerts. Responsive design with
 * table on desktop and stacked cards on mobile.
 *
 * Task Master: Task #12.4
 */

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Star,
  Filter,
  ArrowUpDown,
  Check
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible"
import type {
  PlanCompatibilityAnalysis,
  ERPPriceResult,
  PlanBadge,
  ExclusionAlert
} from "./types"

// =============================================================================
// TYPES
// =============================================================================

export interface PlanComparisonProps {
  plans: PlanCompatibilityAnalysis[]
  erpPrices?: ERPPriceResult
  badges?: Record<string, PlanBadge[]>
  recommendedPlanId?: string
  selectedPlanId?: string
  onSelectPlan?: (planId: string) => void
  className?: string
}

type SortField = "score" | "price" | "alerts"
type SortDirection = "asc" | "desc"

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value)
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600 dark:text-green-400"
  if (score >= 60) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500"
  if (score >= 60) return "bg-amber-500"
  return "bg-red-500"
}

function getAlertIcon(severity: "high" | "medium" | "low") {
  switch (severity) {
    case "high":
      return <AlertTriangle className="size-4 text-red-500" />
    case "medium":
      return <AlertCircle className="size-4 text-amber-500" />
    case "low":
      return <Info className="size-4 text-blue-500" />
  }
}

function getBadgeLabel(badge: PlanBadge): string {
  const labels: Record<PlanBadge, string> = {
    "melhor-custo-beneficio": "Melhor Custo-Benefício",
    "mais-completo": "Mais Completo",
    "mais-acessivel": "Mais Acessível",
    recomendado: "Recomendado"
  }
  return labels[badge]
}

function getBadgeColor(badge: PlanBadge): string {
  const colors: Record<PlanBadge, string> = {
    "melhor-custo-beneficio":
      "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30",
    "mais-completo":
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    "mais-acessivel":
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    recomendado: "bg-primary/10 text-primary border-primary/30"
  }
  return colors[badge]
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface ScoreBarProps {
  score: number
  label?: string
  showValue?: boolean
}

function ScoreBar({ score, label, showValue = true }: ScoreBarProps) {
  const ariaLabel = label
    ? `${label}: ${score} de 100 pontos`
    : `Score: ${score} de 100 pontos`

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          {showValue && (
            <span className={cn("font-medium", getScoreColor(score))}>
              {score}
            </span>
          )}
        </div>
      )}
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full transition-all duration-500",
            getScoreBarColor(score)
          )}
          style={{ width: `${score}%` }}
          role="progressbar"
          aria-label={ariaLabel}
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}

interface AlertBadgesProps {
  alerts: ExclusionAlert[]
  maxDisplay?: number
}

function AlertBadges({ alerts, maxDisplay = 2 }: AlertBadgesProps) {
  const highAlerts = alerts.filter(a => a.severity === "high")
  const mediumAlerts = alerts.filter(a => a.severity === "medium")
  const displayAlerts = [...highAlerts, ...mediumAlerts].slice(0, maxDisplay)
  const remaining = alerts.length - displayAlerts.length

  if (alerts.length === 0) {
    return (
      <Badge
        variant="outline"
        className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
      >
        <Check className="mr-1 size-3" />
        Sem alertas
      </Badge>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {displayAlerts.map((alert, index) => (
        <Badge
          key={index}
          variant="outline"
          className={cn(
            "text-xs",
            alert.severity === "high" &&
              "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
            alert.severity === "medium" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          )}
        >
          {getAlertIcon(alert.severity)}
          <span className="ml-1 max-w-[100px] truncate">{alert.title}</span>
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="text-xs">
          +{remaining}
        </Badge>
      )}
    </div>
  )
}

interface PlanCardMobileProps {
  plan: PlanCompatibilityAnalysis
  price?: number
  planBadges?: PlanBadge[]
  isRecommended?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

function PlanCardMobile({
  plan,
  price,
  planBadges = [],
  isRecommended,
  isSelected,
  onSelect
}: PlanCardMobileProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isSelected && "ring-primary ring-2",
        isRecommended && "border-primary"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              {plan.planName}
              {isRecommended && (
                <Star className="size-4 fill-amber-400 text-amber-400" />
              )}
            </CardTitle>
            {plan.operadora && (
              <p className="text-muted-foreground text-sm">{plan.operadora}</p>
            )}
          </div>
          <div className="text-right">
            <p
              className={cn(
                "text-xl font-bold",
                getScoreColor(plan.score.overall)
              )}
            >
              {plan.score.overall}
            </p>
            <p className="text-muted-foreground text-xs">pontos</p>
          </div>
        </div>

        {/* Badges */}
        {planBadges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {planBadges.map(badge => (
              <Badge
                key={badge}
                variant="outline"
                className={cn("text-xs", getBadgeColor(badge))}
              >
                {getBadgeLabel(badge)}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Price */}
        {price !== undefined && (
          <div className="mb-3">
            <p className="text-foreground text-lg font-semibold">
              {formatCurrency(price)}
              <span className="text-muted-foreground text-sm font-normal">
                /mês
              </span>
            </p>
          </div>
        )}

        {/* Score Bar */}
        <ScoreBar score={plan.score.overall} />

        {/* Alerts Summary */}
        <div className="mt-3">
          <AlertBadges alerts={plan.alerts} maxDisplay={2} />
        </div>

        {/* Expandable Details */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={e => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="mr-1 size-4" />
                  Ver menos
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 size-4" />
                  Ver detalhes
                </>
              )}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2 space-y-3">
            {/* Score Breakdown */}
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Detalhamento do Score
              </p>
              <div className="grid gap-2">
                <ScoreBar
                  score={plan.score.breakdown.eligibility}
                  label="Elegibilidade"
                />
                <ScoreBar
                  score={plan.score.breakdown.coverage}
                  label="Cobertura"
                />
                <ScoreBar
                  score={plan.score.breakdown.budget}
                  label="Orçamento"
                />
                <ScoreBar score={plan.score.breakdown.network} label="Rede" />
                <ScoreBar
                  score={plan.score.breakdown.preferences}
                  label="Preferências"
                />
              </div>
            </div>

            {/* Pros */}
            {plan.pros.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Pontos Positivos
                </p>
                <ul className="text-foreground space-y-1 text-sm">
                  {plan.pros.slice(0, 3).map((pro, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-3 shrink-0 text-green-500" />
                      {pro}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cons */}
            {plan.cons.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                  Pontos de Atenção
                </p>
                <ul className="text-foreground space-y-1 text-sm">
                  {plan.cons.slice(0, 3).map((con, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                      {con}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PlanComparison({
  plans,
  erpPrices,
  badges = {},
  recommendedPlanId,
  selectedPlanId,
  onSelectPlan,
  className
}: PlanComparisonProps) {
  const [sortField, setSortField] = useState<SortField>("score")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [showFilters, setShowFilters] = useState(false)

  // Get price for a plan from ERP results
  const getPlanPrice = (planId: string): number | undefined => {
    if (!erpPrices?.success || !erpPrices.prices) return undefined
    const priceBreakdown = erpPrices.prices.find(
      (_, index) => plans[index]?.planId === planId
    )
    return priceBreakdown?.total
  }

  // Sort plans
  const sortedPlans = useMemo(() => {
    const sorted = [...plans].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case "score":
          comparison = a.score.overall - b.score.overall
          break
        case "price":
          const priceA = getPlanPrice(a.planId) ?? Infinity
          const priceB = getPlanPrice(b.planId) ?? Infinity
          comparison = priceA - priceB
          break
        case "alerts":
          const highA = a.alerts.filter(al => al.severity === "high").length
          const highB = b.alerts.filter(al => al.severity === "high").length
          comparison = highA - highB
          break
      }

      return sortDirection === "desc" ? -comparison : comparison
    })

    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, sortField, sortDirection, erpPrices])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  if (plans.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Nenhum plano disponível para comparação.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with filters */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Planos Compatíveis ({plans.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="md:hidden"
        >
          <Filter className="mr-1 size-4" />
          Filtrar
        </Button>
      </div>

      {/* Mobile Cards View */}
      <div className="space-y-3 md:hidden">
        {sortedPlans.map(plan => (
          <PlanCardMobile
            key={plan.planId}
            plan={plan}
            price={getPlanPrice(plan.planId)}
            planBadges={badges[plan.planId]}
            isRecommended={plan.planId === recommendedPlanId}
            isSelected={plan.planId === selectedPlanId}
            onSelect={() => onSelectPlan?.(plan.planId)}
          />
        ))}
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Plano</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("score")}
                  className="flex items-center gap-1 font-medium"
                >
                  Score
                  <ArrowUpDown className="size-4" />
                </button>
              </TableHead>
              <TableHead>Cobertura</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("price")}
                  className="flex items-center gap-1 font-medium"
                >
                  Preço/mês
                  <ArrowUpDown className="size-4" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("alerts")}
                  className="flex items-center gap-1 font-medium"
                >
                  Alertas
                  <ArrowUpDown className="size-4" />
                </button>
              </TableHead>
              <TableHead className="w-[100px]">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlans.map(plan => {
              const price = getPlanPrice(plan.planId)
              const planBadges = badges[plan.planId] || []
              const isRecommended = plan.planId === recommendedPlanId
              const isSelected = plan.planId === selectedPlanId

              return (
                <TableRow
                  key={plan.planId}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSelected && "bg-primary/5",
                    isRecommended && "bg-amber-500/5"
                  )}
                  onClick={() => onSelectPlan?.(plan.planId)}
                >
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{plan.planName}</span>
                        {isRecommended && (
                          <Star className="size-4 fill-amber-400 text-amber-400" />
                        )}
                      </div>
                      {plan.operadora && (
                        <p className="text-muted-foreground text-sm">
                          {plan.operadora}
                        </p>
                      )}
                      {planBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {planBadges.slice(0, 2).map(badge => (
                            <Badge
                              key={badge}
                              variant="outline"
                              className={cn("text-xs", getBadgeColor(badge))}
                            >
                              {getBadgeLabel(badge)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="w-24 space-y-1">
                      <span
                        className={cn(
                          "text-lg font-bold",
                          getScoreColor(plan.score.overall)
                        )}
                      >
                        {plan.score.overall}
                      </span>
                      <ScoreBar score={plan.score.overall} showValue={false} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {plan.score.breakdown.coverage}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {price !== undefined ? (
                      <span className="font-medium">
                        {formatCurrency(price)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Sob consulta
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AlertBadges alerts={plan.alerts} maxDisplay={1} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={e => {
                        e.stopPropagation()
                        onSelectPlan?.(plan.planId)
                      }}
                    >
                      {isSelected ? "Selecionado" : "Selecionar"}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

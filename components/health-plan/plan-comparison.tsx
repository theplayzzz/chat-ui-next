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
  Check,
  X
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
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

interface PlanFilters {
  operadora: string | null
  minScore: number | null
  maxPrice: number | null
}

const initialFilters: PlanFilters = {
  operadora: null,
  minScore: null,
  maxPrice: null
}

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

interface PriceBreakdown {
  titular: number
  dependentes?: Array<{ relacao: string; idade: number; preco: number }>
  subtotal: number
  descontos: number
  total: number
  model: string
}

interface PlanCardMobileProps {
  plan: PlanCompatibilityAnalysis
  price?: number
  priceBreakdown?: PriceBreakdown
  planBadges?: PlanBadge[]
  isRecommended?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

function PlanCardMobile({
  plan,
  price,
  priceBreakdown,
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
        {priceBreakdown ? (
          <div className="mb-3">
            <p className="text-foreground text-lg font-semibold">
              {formatCurrency(priceBreakdown.total)}
              <span className="text-muted-foreground text-sm font-normal">
                /mês
              </span>
            </p>
            <p className="text-muted-foreground text-xs">
              Titular: {formatCurrency(priceBreakdown.titular)}
              {priceBreakdown.dependentes &&
                priceBreakdown.dependentes.length > 0 && (
                  <span className="ml-1">
                    + {priceBreakdown.dependentes.length} dependente
                    {priceBreakdown.dependentes.length > 1 ? "s" : ""}
                  </span>
                )}
            </p>
          </div>
        ) : price !== undefined ? (
          <div className="mb-3">
            <p className="text-foreground text-lg font-semibold">
              {formatCurrency(price)}
              <span className="text-muted-foreground text-sm font-normal">
                /mês
              </span>
            </p>
          </div>
        ) : null}

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
  const [filters, setFilters] = useState<PlanFilters>(initialFilters)

  // Get unique operadoras for filter dropdown
  const uniqueOperadoras = useMemo(() => {
    const operadoras = plans
      .map(p => p.operadora)
      .filter((op): op is string => !!op)
    return [...new Set(operadoras)].sort()
  }, [plans])

  // Get price for a plan from ERP results
  const getPlanPrice = (planId: string): number | undefined => {
    if (!erpPrices?.success || !erpPrices.prices) return undefined
    // Use metadata.plan_ids to find the correct price index
    const planIds = erpPrices.metadata?.plan_ids ?? []
    const priceIndex = planIds.indexOf(planId)
    if (priceIndex === -1 || priceIndex >= erpPrices.prices.length) {
      return undefined
    }
    return erpPrices.prices[priceIndex]?.total
  }

  // Get full price breakdown for a plan
  const getPriceBreakdown = (planId: string) => {
    if (!erpPrices?.success || !erpPrices.prices) return undefined
    const planIds = erpPrices.metadata?.plan_ids ?? []
    const priceIndex = planIds.indexOf(planId)
    if (priceIndex === -1 || priceIndex >= erpPrices.prices.length) {
      return undefined
    }
    return erpPrices.prices[priceIndex]
  }

  // Check if any filter is active
  const hasActiveFilters =
    filters.operadora !== null ||
    filters.minScore !== null ||
    filters.maxPrice !== null

  // Clear all filters
  const clearFilters = () => setFilters(initialFilters)

  // Filter and sort plans
  const filteredAndSortedPlans = useMemo(() => {
    // First, filter
    let filtered = plans.filter(plan => {
      // Operadora filter
      if (filters.operadora && plan.operadora !== filters.operadora) {
        return false
      }

      // Min score filter
      if (filters.minScore !== null && plan.score.overall < filters.minScore) {
        return false
      }

      // Max price filter
      if (filters.maxPrice !== null) {
        const price = getPlanPrice(plan.planId)
        if (price !== undefined && price > filters.maxPrice) {
          return false
        }
      }

      return true
    })

    // Then, sort
    const sorted = [...filtered].sort((a, b) => {
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
  }, [plans, sortField, sortDirection, erpPrices, filters])

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
          Planos Compatíveis
          {hasActiveFilters ? (
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              ({filteredAndSortedPlans.length} de {plans.length})
            </span>
          ) : (
            <span className="text-muted-foreground ml-1 text-sm font-normal">
              ({plans.length})
            </span>
          )}
        </h3>
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-1 size-4" />
          Filtrar
          {hasActiveFilters && (
            <Badge variant="secondary" className="ml-1 size-5 p-0 text-xs">
              {(filters.operadora ? 1 : 0) +
                (filters.minScore !== null ? 1 : 0) +
                (filters.maxPrice !== null ? 1 : 0)}
            </Badge>
          )}
        </Button>
      </div>

      {/* Filter Panel (both mobile and desktop) */}
      {showFilters && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Filtros</p>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-auto py-1 text-xs"
                >
                  <X className="mr-1 size-3" />
                  Limpar
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Operadora Filter */}
              {uniqueOperadoras.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Operadora</Label>
                  <Select
                    value={filters.operadora ?? "all"}
                    onValueChange={v =>
                      setFilters(f => ({
                        ...f,
                        operadora: v === "all" ? null : v
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {uniqueOperadoras.map(op => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Min Score Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs">Score mínimo</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Ex: 70"
                  className="h-9"
                  value={filters.minScore ?? ""}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      minScore: e.target.value ? Number(e.target.value) : null
                    }))
                  }
                />
              </div>

              {/* Max Price Filter */}
              <div className="space-y-1.5">
                <Label className="text-xs">Preço máximo (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ex: 1000"
                  className="h-9"
                  value={filters.maxPrice ?? ""}
                  onChange={e =>
                    setFilters(f => ({
                      ...f,
                      maxPrice: e.target.value ? Number(e.target.value) : null
                    }))
                  }
                />
              </div>
            </div>

            {/* Sort Controls */}
            <div className="border-t pt-3">
              <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                Ordenar por
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={sortField === "score" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("score")}
                >
                  Score
                  {sortField === "score" && (
                    <ArrowUpDown className="ml-1 size-3" />
                  )}
                </Button>
                <Button
                  variant={sortField === "price" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("price")}
                >
                  Preço
                  {sortField === "price" && (
                    <ArrowUpDown className="ml-1 size-3" />
                  )}
                </Button>
                <Button
                  variant={sortField === "alerts" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort("alerts")}
                >
                  Alertas
                  {sortField === "alerts" && (
                    <ArrowUpDown className="ml-1 size-3" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {sortDirection === "desc" ? "Maior → Menor" : "Menor → Maior"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile Cards View */}
      <div className="space-y-3 md:hidden">
        {filteredAndSortedPlans.map(plan => (
          <PlanCardMobile
            key={plan.planId}
            plan={plan}
            price={getPlanPrice(plan.planId)}
            priceBreakdown={
              getPriceBreakdown(plan.planId) as PriceBreakdown | undefined
            }
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
              <TableHead className="w-[200px]">Plano</TableHead>
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
              <TableHead>Rede</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort("price")}
                  className="flex items-center gap-1 font-medium"
                >
                  Preço
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
            {filteredAndSortedPlans.map(plan => {
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
                    <span className="text-sm">
                      {plan.score.breakdown.network}%
                    </span>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const breakdown = getPriceBreakdown(plan.planId)
                      if (!breakdown) {
                        return (
                          <span className="text-muted-foreground text-sm">
                            Sob consulta
                          </span>
                        )
                      }
                      return (
                        <div className="space-y-0.5">
                          <span className="font-medium">
                            {formatCurrency(breakdown.total)}
                          </span>
                          <div className="text-muted-foreground text-xs">
                            <span>
                              Titular: {formatCurrency(breakdown.titular)}
                            </span>
                            {breakdown.dependentes &&
                              breakdown.dependentes.length > 0 && (
                                <span className="ml-1">
                                  +{breakdown.dependentes.length} dep.
                                </span>
                              )}
                          </div>
                        </div>
                      )
                    })()}
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

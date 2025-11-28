"use client"

/**
 * Client Info Card
 *
 * Displays a dynamic summary of client information collected
 * during the Health Plan workflow. Shows skeleton UI for
 * missing fields and highlights recently updated fields.
 *
 * Task Master: Task #12.3
 */

import { cn } from "@/lib/utils"
import {
  User,
  Users,
  Heart,
  Pill,
  MapPin,
  DollarSign,
  Settings2,
  ChevronDown,
  ChevronUp,
  Edit3
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible"
import type { PartialClientInfo, Dependent, FIELD_LABELS } from "./types"

// =============================================================================
// TYPES
// =============================================================================

export interface ClientInfoCardProps {
  clientInfo: PartialClientInfo | null
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onEdit?: () => void
  className?: string
  highlightFields?: string[]
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

function formatRelationship(relationship: string): string {
  const labels: Record<string, string> = {
    spouse: "Cônjuge",
    child: "Filho(a)",
    parent: "Pai/Mãe",
    other: "Outro"
  }
  return labels[relationship] || relationship
}

function formatNetworkType(type: string): string {
  const labels: Record<string, string> = {
    broad: "Rede Ampla",
    restricted: "Rede Reduzida"
  }
  return labels[type] || type
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface InfoSectionProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  isHighlighted?: boolean
  isEmpty?: boolean
}

function InfoSection({
  icon: Icon,
  label,
  children,
  isHighlighted,
  isEmpty
}: InfoSectionProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg p-2 transition-all duration-300",
        isHighlighted && "bg-primary/5 ring-primary/20 ring-2",
        isEmpty && "opacity-60"
      )}
    >
      <div
        className={cn(
          "bg-muted flex size-8 shrink-0 items-center justify-center rounded-md",
          isHighlighted && "bg-primary/10"
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground size-4",
            isHighlighted && "text-primary"
          )}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function SkeletonValue() {
  return <Skeleton className="mt-1 h-5 w-24" />
}

function DependentBadge({ dependent }: { dependent: Dependent }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {formatRelationship(dependent.relationship)}, {dependent.age} anos
    </Badge>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ClientInfoCard({
  clientInfo,
  isCollapsed = false,
  onToggleCollapse,
  onEdit,
  className,
  highlightFields = []
}: ClientInfoCardProps) {
  const isHighlighted = (field: string) => highlightFields.includes(field)

  const hasAge = clientInfo?.age !== undefined
  const hasLocation = clientInfo?.city && clientInfo?.state
  const hasBudget = clientInfo?.budget !== undefined
  const hasDependents =
    clientInfo?.dependents && clientInfo.dependents.length > 0
  const hasConditions =
    clientInfo?.preExistingConditions &&
    clientInfo.preExistingConditions.length > 0
  const hasMedications =
    clientInfo?.medications && clientInfo.medications.length > 0
  const hasPreferences =
    clientInfo?.preferences && Object.keys(clientInfo.preferences).length > 0

  // Calculate completeness
  const filledFields = [
    hasAge,
    hasLocation,
    hasBudget,
    hasDependents,
    hasConditions,
    hasMedications,
    hasPreferences
  ].filter(Boolean).length
  const totalFields = 7
  const completenessPercent = Math.round((filledFields / totalFields) * 100)

  return (
    <Card className={cn("transition-all duration-300", className)}>
      <Collapsible open={!isCollapsed} onOpenChange={onToggleCollapse}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="text-primary size-5" aria-hidden="true" />
              Seu Perfil
              <Badge variant="outline" className="ml-2 text-xs font-normal">
                {completenessPercent}% completo
              </Badge>
            </CardTitle>

            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md p-1 transition-colors"
                  aria-label="Editar informações"
                >
                  <Edit3 className="size-4" />
                </button>
              )}

              {onToggleCollapse && (
                <CollapsibleTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
                    aria-label={
                      isCollapsed ? "Expandir perfil" : "Recolher perfil"
                    }
                  >
                    {isCollapsed ? (
                      <ChevronDown className="size-5" />
                    ) : (
                      <ChevronUp className="size-5" />
                    )}
                  </button>
                </CollapsibleTrigger>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="grid gap-2 pt-0 sm:grid-cols-2">
            {/* Titular Info */}
            <InfoSection
              icon={User}
              label="Titular"
              isHighlighted={isHighlighted("age")}
              isEmpty={!hasAge}
            >
              {hasAge ? (
                <p className="text-foreground text-sm font-medium">
                  {clientInfo!.age} anos
                </p>
              ) : (
                <SkeletonValue />
              )}
            </InfoSection>

            {/* Location */}
            <InfoSection
              icon={MapPin}
              label="Localização"
              isHighlighted={isHighlighted("city") || isHighlighted("state")}
              isEmpty={!hasLocation}
            >
              {hasLocation ? (
                <p className="text-foreground text-sm font-medium">
                  {clientInfo!.city}/{clientInfo!.state}
                </p>
              ) : (
                <SkeletonValue />
              )}
            </InfoSection>

            {/* Budget */}
            <InfoSection
              icon={DollarSign}
              label="Orçamento Mensal"
              isHighlighted={isHighlighted("budget")}
              isEmpty={!hasBudget}
            >
              {hasBudget ? (
                <p className="text-foreground text-sm font-medium">
                  {formatCurrency(clientInfo!.budget!)}
                </p>
              ) : (
                <SkeletonValue />
              )}
            </InfoSection>

            {/* Dependents */}
            <InfoSection
              icon={Users}
              label="Dependentes"
              isHighlighted={isHighlighted("dependents")}
              isEmpty={!hasDependents}
            >
              {hasDependents ? (
                <div className="flex flex-wrap gap-1">
                  {clientInfo!.dependents!.map((dep, index) => (
                    <DependentBadge key={index} dependent={dep} />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum dependente
                </p>
              )}
            </InfoSection>

            {/* Pre-existing Conditions */}
            <InfoSection
              icon={Heart}
              label="Condições Pré-existentes"
              isHighlighted={isHighlighted("preExistingConditions")}
              isEmpty={!hasConditions}
            >
              {hasConditions ? (
                <div className="flex flex-wrap gap-1">
                  {clientInfo!.preExistingConditions!.map(
                    (condition, index) => (
                      <Badge
                        key={index}
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400"
                      >
                        {condition}
                      </Badge>
                    )
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhuma informada
                </p>
              )}
            </InfoSection>

            {/* Medications */}
            <InfoSection
              icon={Pill}
              label="Medicamentos de Uso Contínuo"
              isHighlighted={isHighlighted("medications")}
              isEmpty={!hasMedications}
            >
              {hasMedications ? (
                <div className="flex flex-wrap gap-1">
                  {clientInfo!.medications!.map((med, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {med}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhum informado
                </p>
              )}
            </InfoSection>

            {/* Preferences */}
            <InfoSection
              icon={Settings2}
              label="Preferências"
              isHighlighted={isHighlighted("preferences")}
              isEmpty={!hasPreferences}
            >
              {hasPreferences ? (
                <div className="flex flex-wrap gap-1">
                  {clientInfo!.preferences!.networkType && (
                    <Badge variant="secondary" className="text-xs">
                      {formatNetworkType(clientInfo!.preferences!.networkType)}
                    </Badge>
                  )}
                  {clientInfo!.preferences!.coParticipation !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      {clientInfo!.preferences!.coParticipation
                        ? "Com Coparticipação"
                        : "Sem Coparticipação"}
                    </Badge>
                  )}
                  {clientInfo!.preferences!.specificHospitals?.map(
                    (hospital, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {hospital}
                      </Badge>
                    )
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Nenhuma preferência
                </p>
              )}
            </InfoSection>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

import { FC } from "react"
import { IconLock, IconInfoCircle } from "@tabler/icons-react"

interface WorkspaceRestrictionNoticeProps {
  /**
   * Type of notice to display
   * - 'inline': Small inline message (for assistant picker)
   * - 'banner': Full-width banner (for chat page)
   */
  variant?: "inline" | "banner"

  /**
   * Custom message to display
   */
  message?: string

  /**
   * Whether to show contact admin link
   */
  showContactLink?: boolean
}

/**
 * Component to display when workspace doesn't have access to health plan features
 *
 * Usage:
 * ```tsx
 * <WorkspaceRestrictionNotice variant="inline" />
 * <WorkspaceRestrictionNotice variant="banner" showContactLink />
 * ```
 */
export const WorkspaceRestrictionNotice: FC<
  WorkspaceRestrictionNoticeProps
> = ({ variant = "inline", message, showContactLink = true }) => {
  const defaultMessage =
    "This workspace doesn't have access to Health Plan Assistant. Contact your administrator to request access."

  const displayMessage = message || defaultMessage

  if (variant === "inline") {
    return (
      <div className="bg-muted flex items-center gap-2 rounded-lg border p-3 text-sm">
        <IconLock size={18} className="text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-muted-foreground">{displayMessage}</p>
          {showContactLink && (
            <button className="text-primary mt-1 text-xs underline hover:opacity-80">
              Contact Administrator
            </button>
          )}
        </div>
      </div>
    )
  }

  // Banner variant
  return (
    <div className="bg-muted/50 border-l-primary mb-4 rounded-lg border-y border-l-4 border-r p-4">
      <div className="flex items-start gap-3">
        <IconInfoCircle size={24} className="text-primary shrink-0" />
        <div className="flex-1">
          <h3 className="mb-1 font-semibold">Access Restricted</h3>
          <p className="text-muted-foreground text-sm">{displayMessage}</p>
          {showContactLink && (
            <div className="mt-3">
              <button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors">
                Request Access
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

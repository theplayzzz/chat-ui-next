import React, { FC, useMemo, useState } from "react"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { MessageCodeBlock } from "./message-codeblock"
import { MessageMarkdownMemoized } from "./message-markdown-memoized"

interface MessageMarkdownProps {
  content: string
}

interface DebugData {
  intent?: string | null
  confidence?: number
  clientInfo?: Record<string, unknown>
  clientInfoVersion?: number
  routedCapability?: string
  routeReason?: string
  wasRedirected?: boolean
  executionTimeMs?: number
  searchResultsCount?: number
  hasAnalysis?: boolean
  hasRecommendation?: boolean
  loopIterations?: number
  errors?: unknown[]
  checkpointerEnabled?: boolean
  langsmithRunId?: string
  langsmithTraceUrl?: string
  nodeTrace?: Array<{
    node: string
    durationMs?: number
    inputSummary?: string
    outputSummary?: string
  }>
  timestamp?: string
}

/**
 * Debug panel collapsible - rendered above the AI response
 */
const DebugBlock: FC<{ json: string }> = ({ json }) => {
  const [isOpen, setIsOpen] = useState(false)

  let data: DebugData | null = null
  try {
    const parsed = JSON.parse(json)
    data = parsed?.__debug || parsed
  } catch {
    // Fallback to raw JSON display
  }

  if (!data) {
    return (
      <div className="mb-3 rounded border border-yellow-400/30 bg-yellow-50/80 px-3 py-2 font-mono text-xs text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400">
        <span className="font-semibold">DEBUG: </span>
        <span className="break-all">{json}</span>
      </div>
    )
  }

  const intentLabel = data.intent || "nenhum"
  const confidencePct = data.confidence
    ? `${(data.confidence * 100).toFixed(0)}%`
    : "–"
  const execTime = data.executionTimeMs ? `${data.executionTimeMs}ms` : "–"

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-yellow-400/40 bg-yellow-50/80 text-xs dark:bg-yellow-950/30">
      {/* Header - always visible, clickable */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30"
      >
        <span className="text-yellow-600 dark:text-yellow-400">
          {isOpen ? "▼" : "▶"}
        </span>
        <span className="font-semibold text-yellow-700 dark:text-yellow-300">
          Debug
        </span>
        <span className="text-yellow-600/70 dark:text-yellow-400/70">|</span>
        <span className="text-yellow-600 dark:text-yellow-400">
          Intent: <strong>{intentLabel}</strong> ({confidencePct})
        </span>
        <span className="text-yellow-600/70 dark:text-yellow-400/70">|</span>
        <span className="text-yellow-600 dark:text-yellow-400">{execTime}</span>
        {data.routedCapability && (
          <>
            <span className="text-yellow-600/70 dark:text-yellow-400/70">
              |
            </span>
            <span className="text-yellow-600 dark:text-yellow-400">
              {data.wasRedirected ? "→ " : ""}
              {data.routedCapability}
            </span>
          </>
        )}
        {data.errors && data.errors.length > 0 && (
          <span className="ml-auto rounded bg-red-200 px-1.5 py-0.5 text-red-700 dark:bg-red-900/50 dark:text-red-300">
            {data.errors.length} erro(s)
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-yellow-400/20 px-3 py-2 font-mono text-yellow-700 dark:text-yellow-400">
          {/* Routing */}
          <div className="mb-2">
            <div className="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
              Roteamento
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span>Intent:</span>
              <span className="font-medium">{intentLabel}</span>
              <span>Confianca:</span>
              <span>{confidencePct}</span>
              {data.routedCapability && (
                <>
                  <span>Capability:</span>
                  <span className="font-medium">{data.routedCapability}</span>
                </>
              )}
              {data.wasRedirected && (
                <>
                  <span>Redirecionado:</span>
                  <span>Sim</span>
                </>
              )}
              {data.routeReason && (
                <>
                  <span>Razao:</span>
                  <span className="col-span-1 italic">{data.routeReason}</span>
                </>
              )}
            </div>
          </div>

          {/* State */}
          <div className="mb-2">
            <div className="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
              Estado
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span>Client Info v:</span>
              <span>{data.clientInfoVersion ?? 0}</span>
              <span>Search Results:</span>
              <span>{data.searchResultsCount ?? 0} docs</span>
              <span>Analise:</span>
              <span>{data.hasAnalysis ? "Sim" : "Nao"}</span>
              <span>Recomendacao:</span>
              <span>{data.hasRecommendation ? "Sim" : "Nao"}</span>
              <span>Loop:</span>
              <span>{data.loopIterations ?? 0}</span>
              <span>Checkpointer:</span>
              <span>{data.checkpointerEnabled ? "Ativo" : "Inativo"}</span>
            </div>
          </div>

          {/* Execution */}
          <div className="mb-2">
            <div className="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
              Execucao
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span>Tempo total:</span>
              <span className="font-medium">{execTime}</span>
              <span>Timestamp:</span>
              <span>{data.timestamp || "–"}</span>
              {data.langsmithTraceUrl && (
                <>
                  <span>LangSmith:</span>
                  <a
                    href={data.langsmithTraceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    Ver trace
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Client Info */}
          {data.clientInfo && Object.keys(data.clientInfo).length > 0 && (
            <div className="mb-2">
              <div className="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
                Client Info
              </div>
              <pre className="max-h-32 overflow-auto rounded bg-yellow-100/50 p-1.5 dark:bg-yellow-950/50">
                {JSON.stringify(data.clientInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Node Trace */}
          {data.nodeTrace && data.nodeTrace.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 font-semibold text-yellow-800 dark:text-yellow-300">
                Node Trace
              </div>
              {data.nodeTrace.map((node, i) => (
                <div
                  key={i}
                  className="mb-1 rounded bg-yellow-100/50 p-1.5 dark:bg-yellow-950/50"
                >
                  <span className="font-medium">{node.node}</span>
                  {node.durationMs !== undefined && (
                    <span className="ml-2 text-yellow-600/70">
                      {node.durationMs}ms
                    </span>
                  )}
                  {node.outputSummary && (
                    <div className="mt-0.5 text-yellow-600/80 dark:text-yellow-500/80">
                      {node.outputSummary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Errors */}
          {data.errors && data.errors.length > 0 && (
            <div>
              <div className="mb-1 font-semibold text-red-700 dark:text-red-400">
                Erros
              </div>
              <pre className="max-h-24 overflow-auto rounded bg-red-100/50 p-1.5 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {JSON.stringify(data.errors, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Extrai blocos de debug do conteúdo e retorna as partes separadas
 */
function parseDebugContent(content: string): {
  debugBlocks: string[]
  mainContent: string
} {
  const debugRegex = /__DEBUG__(.*?)__DEBUG__/gs
  const debugBlocks: string[] = []
  let mainContent = content

  // Extrair todos os blocos de debug
  let match
  while ((match = debugRegex.exec(content)) !== null) {
    debugBlocks.push(match[1])
  }

  // Remover os blocos de debug do conteúdo principal
  mainContent = content.replace(debugRegex, "").trim()

  return { debugBlocks, mainContent }
}

export const MessageMarkdown: FC<MessageMarkdownProps> = ({ content }) => {
  // Parse debug content
  const { debugBlocks, mainContent } = useMemo(
    () => parseDebugContent(content),
    [content]
  )

  return (
    <div>
      {/* Renderizar blocos de debug em amarelo claro */}
      {debugBlocks.map((debugJson, index) => (
        <DebugBlock key={index} json={debugJson} />
      ))}

      {/* Renderizar conteúdo principal com Markdown */}
      {mainContent && (
        <MessageMarkdownMemoized
          className="prose dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 min-w-full space-y-6 break-words"
          remarkPlugins={[remarkGfm, remarkMath]}
          components={{
            p({ children }) {
              return <p className="mb-2 last:mb-0">{children}</p>
            },
            img({ node, ...props }) {
              return <img className="max-w-[67%]" {...props} />
            },
            code({ node, className, children, ...props }) {
              const childArray = React.Children.toArray(children)
              const firstChild = childArray[0] as React.ReactElement
              const firstChildAsString = React.isValidElement(firstChild)
                ? (firstChild as React.ReactElement).props.children
                : firstChild

              if (firstChildAsString === "▍") {
                return (
                  <span className="mt-1 animate-pulse cursor-default">▍</span>
                )
              }

              if (typeof firstChildAsString === "string") {
                childArray[0] = firstChildAsString.replace("`▍`", "▍")
              }

              const match = /language-(\w+)/.exec(className || "")

              if (
                typeof firstChildAsString === "string" &&
                !firstChildAsString.includes("\n")
              ) {
                return (
                  <code className={className} {...props}>
                    {childArray}
                  </code>
                )
              }

              return (
                <MessageCodeBlock
                  key={Math.random()}
                  language={(match && match[1]) || ""}
                  value={String(childArray).replace(/\n$/, "")}
                  {...props}
                />
              )
            }
          }}
        >
          {mainContent}
        </MessageMarkdownMemoized>
      )}
    </div>
  )
}

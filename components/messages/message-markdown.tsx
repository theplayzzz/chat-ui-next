import React, { FC, useMemo } from "react"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { MessageCodeBlock } from "./message-codeblock"
import { MessageMarkdownMemoized } from "./message-markdown-memoized"

interface MessageMarkdownProps {
  content: string
}

/**
 * Componente para renderizar blocos de debug com estilo especial
 */
const DebugBlock: FC<{ json: string }> = ({ json }) => {
  return (
    <div className="mb-2 rounded border border-yellow-400/30 bg-yellow-100/20 px-2 py-1 font-mono text-xs text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400">
      <span className="font-semibold">DEBUG</span>
      <span className="ml-1 break-all">{json}</span>
      <span className="font-semibold">DEBUG</span>
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

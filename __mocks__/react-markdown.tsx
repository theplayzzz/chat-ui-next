/**
 * Mock for react-markdown to avoid ESM issues in Jest
 *
 * Task Master: Task #12.7
 */

import React from "react"

interface ReactMarkdownProps {
  children?: string
  remarkPlugins?: unknown[]
  components?: Record<string, React.ComponentType<unknown>>
}

// Mock ReactMarkdown component that renders HTML from markdown-like text
function ReactMarkdown({ children }: ReactMarkdownProps): React.ReactElement {
  if (!children) {
    return <div data-testid="markdown-empty" />
  }

  // Simple transformation for testing purposes
  const content = children
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Tables (basic support)
    .replace(/\|([^|]+)\|([^|]+)\|([^|]*)\|/g, (_, c1, c2, c3) => {
      const cells = [c1, c2, c3].filter(Boolean).map(c => c.trim())
      if (cells.every(c => c.match(/^-+$/))) {
        return '' // Skip separator row
      }
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`
    })

  // Wrap lists in ul
  const hasListItems = content.includes('<li>')
  const processedContent = hasListItems
    ? content.replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`)
    : content

  // Wrap table rows
  const hasTableRows = processedContent.includes('<tr>')
  const finalContent = hasTableRows
    ? processedContent.replace(/(<tr>.*<\/tr>\n?)+/g, match => `<table><tbody>${match}</tbody></table>`)
    : processedContent

  return (
    <div
      data-testid="markdown-content"
      dangerouslySetInnerHTML={{ __html: finalContent }}
    />
  )
}

export default ReactMarkdown

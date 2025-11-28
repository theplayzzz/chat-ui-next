/**
 * Mock for remark-gfm to avoid ESM issues in Jest
 *
 * Task Master: Task #12.7
 */

// Return a no-op plugin
export default function remarkGfm() {
  return () => {}
}

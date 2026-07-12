// Parse `git diff --unified=0` into file -> Set of added line numbers (new-file numbering).
export function parseAddedLines(diff) {
  const files = new Map()
  let current = null
  let nextLine = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).replace(/^b\//, '')
      if (path === '/dev/null') {
        current = null
      } else {
        files.set(path, new Set())
        current = files.get(path)
      }
      continue
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      nextLine = Number(hunk[1])
      continue
    }
    if (current && line.startsWith('+') && !line.startsWith('+++')) {
      current.add(nextLine)
      nextLine++
    }
  }
  return files
}

// From eslint JSON results, keep error-severity (2) messages that land on an added line.
export function offendingMessages(eslintResults, addedLines) {
  const out = []
  for (const result of eslintResults) {
    for (const [file, lines] of addedLines) {
      if (!result.filePath.endsWith(file)) continue
      for (const m of result.messages) {
        if (m.severity === 2 && m.line != null && lines.has(m.line)) {
          out.push({ file, line: m.line, ruleId: m.ruleId, message: m.message })
        }
      }
    }
  }
  return out
}

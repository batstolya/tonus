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

// Each app in apps/* ships its own flat ESLint config and the root config
// ignores apps/**, so a changed file must be linted from the directory that
// owns its config — otherwise ESLint silently reports nothing for it.
// Returns Map<cwd, files relative to that cwd>, insertion-ordered.
export function groupFilesByEslintCwd(files) {
  const groups = new Map()
  for (const file of files) {
    const match = file.match(/^(apps\/[^/]+)\//)
    const cwd = match ? match[1] : '.'
    const rel = match ? file.slice(cwd.length + 1) : file
    if (!groups.has(cwd)) groups.set(cwd, [])
    groups.get(cwd).push(rel)
  }
  return groups
}

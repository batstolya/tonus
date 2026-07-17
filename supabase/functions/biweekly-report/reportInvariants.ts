// Pure invariant checks for generated report prose. Used by the on-demand
// model eval (report.eval.test.ts); each violated invariant is returned as a
// human-readable message, empty array = pass.

export interface ReportFacts {
  lateCurrent: number
  latePrev: number
}

export function checkReportInvariants(report: string, facts: ReportFacts): string[] {
  const violations: string[] = []

  if (/[*#`_]/.test(report)) {
    violations.push('markdown markup found (*, #, _ or backtick) — prompt demands plain text')
  }

  if (/вирус|отравлен|инфекц|грипп|ковид|covid/i.test(report)) {
    violations.push('diagnosis-guess vocabulary found (вирус/отравление/инфекция/…)')
  }

  if (!report.includes('Покрытие данных') && !/\d+\/14/.test(report)) {
    violations.push('no data-coverage statement')
  }

  if (/поздн/i.test(report)) {
    const hasCurrent = report.includes(String(facts.lateCurrent))
    const hasPrev = report.includes(String(facts.latePrev))
    if (!hasCurrent || !hasPrev) {
      violations.push(
        `late bedtimes discussed without the precomputed counts (${facts.lateCurrent}/${facts.latePrev})`,
      )
    }
  }

  return violations
}

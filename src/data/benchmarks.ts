export type BenchmarkLevel = "Easy" | "Medium" | "Hard";

export type BenchmarkCase = {
  id: string;
  level: BenchmarkLevel;
  title: string;
  prompt: string;
};

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "E01",
    level: "Easy",
    title: "README typo",
    prompt: "Fix the typo in the README heading and do not change anything else."
  },
  {
    id: "E02",
    level: "Easy",
    title: "Rename local variable",
    prompt: "Rename the local variable userData to profileData in this function and update its references without changing behavior."
  },
  {
    id: "E03",
    level: "Easy",
    title: "Format config object",
    prompt: "Format the configuration object consistently with the surrounding file. Do not change values or behavior."
  },
  {
    id: "E04",
    level: "Easy",
    title: "Find component usage",
    prompt: "Find where the Button component is used in this project and list the relevant file paths. Do not modify files."
  },
  {
    id: "E05",
    level: "Easy",
    title: "Add short comment",
    prompt: "Add one concise comment explaining why this retry delay exists. Do not refactor the surrounding code."
  },
  {
    id: "E06",
    level: "Easy",
    title: "Copy update",
    prompt: "Change the empty-state copy from 'No item found' to 'No items found'. Make no other changes."
  },
  {
    id: "E07",
    level: "Easy",
    title: "Simple type cleanup",
    prompt: "Replace the duplicated inline string union with the existing Status type already defined in this file."
  },
  {
    id: "E08",
    level: "Easy",
    title: "Remove unused import",
    prompt: "Remove the unused helper import reported by the linter and leave the rest of the file unchanged."
  },

  {
    id: "M01",
    level: "Medium",
    title: "Form validation bug",
    prompt: "Fix the form validation bug that allows an empty display name, add a regression test, and keep existing valid submissions unchanged."
  },
  {
    id: "M02",
    level: "Medium",
    title: "API error handling",
    prompt: "Improve the API request helper so 429 responses use the existing retry mechanism and add tests for the new behavior."
  },
  {
    id: "M03",
    level: "Medium",
    title: "Component refactor",
    prompt: "Refactor this React component to remove duplicated loading-state logic without changing its rendered output or public props."
  },
  {
    id: "M04",
    level: "Medium",
    title: "Pagination feature",
    prompt: "Implement next and previous pagination controls using the existing API response metadata and add tests for disabled states."
  },
  {
    id: "M05",
    level: "Medium",
    title: "Cache invalidation bug",
    prompt: "Fix the bug where updating a profile leaves stale cached data on the settings page. Add a regression test."
  },
  {
    id: "M06",
    level: "Medium",
    title: "Input normalization",
    prompt: "Normalize email input before validation and persistence, then update the existing test suite to cover mixed-case and whitespace inputs."
  },
  {
    id: "M07",
    level: "Medium",
    title: "Feature flag wiring",
    prompt: "Wire the existing dashboard_v2 feature flag into the dashboard route and preserve the current dashboard as the fallback."
  },
  {
    id: "M08",
    level: "Medium",
    title: "Database query cleanup",
    prompt: "Refactor this database query to avoid the N+1 access pattern while preserving the current result shape and add a focused test."
  },

  {
    id: "H01",
    level: "Hard",
    title: "Authentication race",
    prompt: "Investigate an intermittent authentication race condition that appears under concurrent requests. Find the root cause, implement a safe fix, and add a regression test."
  },
  {
    id: "H02",
    level: "Hard",
    title: "Security boundary review",
    prompt: "Audit the authorization path for privilege-escalation risks across the API and service layers, fix any confirmed issue, and add security-focused regression tests."
  },
  {
    id: "H03",
    level: "Hard",
    title: "Cross-module architecture",
    prompt: "Redesign the notification flow so delivery providers are isolated behind one interface across multiple modules without breaking current behavior or tests."
  },
  {
    id: "H04",
    level: "Hard",
    title: "Concurrent job duplication",
    prompt: "Find why distributed workers occasionally process the same job twice under load, identify the concurrency failure, and implement an idempotent fix with tests."
  },
  {
    id: "H05",
    level: "Hard",
    title: "Schema migration",
    prompt: "Design and implement a backwards-compatible database migration that splits the account status field into lifecycle and billing status with a safe rollout path."
  },
  {
    id: "H06",
    level: "Hard",
    title: "Production memory leak",
    prompt: "Investigate a production memory leak that grows during long-lived websocket sessions, identify the root cause across the connection lifecycle, and implement a verified fix."
  },
  {
    id: "H07",
    level: "Hard",
    title: "Distributed cache consistency",
    prompt: "Resolve a distributed cache consistency bug where users can briefly see stale permissions after role changes across multiple application instances."
  },
  {
    id: "H08",
    level: "Hard",
    title: "Large multi-file refactor",
    prompt: "Refactor the authentication subsystem across multiple files to separate token parsing, session validation, and authorization while preserving public behavior and test coverage."
  }
];

export type BenchmarkScope = "Easy" | "Medium" | "Hard" | "Full";

export function casesForScope(scope: BenchmarkScope) {
  if (scope === "Full") return BENCHMARK_CASES;
  return BENCHMARK_CASES.filter((item) => item.level === scope);
}

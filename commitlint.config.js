/**
 * Commitlint configuration — Conventional Commits for VantiOps 360
 *
 * Validates commit messages follow the format:
 *   <type>(<scope>): <description>
 *
 * Install (when ready to enforce):
 *   npm install --save-dev @commitlint/cli @commitlint/config-conventional
 *
 * Usage with Husky:
 *   npx husky add .husky/commit-msg 'npx commitlint --edit "$1"'
 *
 * REQ-27.3: Maintain changelog linked to work tickets with Conventional Commits format
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types allowed per VantiOps 360 change management process
    'type-enum': [
      2,
      'always',
      [
        'feat',      // New feature
        'fix',       // Bug fix
        'docs',      // Documentation only
        'style',     // Formatting (no logic change)
        'refactor',  // Code restructuring (no behavior change)
        'perf',      // Performance improvement
        'test',      // Adding or fixing tests
        'ci',        // CI/CD changes
        'chore',     // Maintenance
        'revert',    // Revert a previous commit
      ],
    ],
    // Scopes allowed per VantiOps 360 module structure
    'scope-enum': [
      1, // Warning (not error) to allow new scopes during development
      'always',
      [
        'frontend',
        'backend',
        'api',
        'rbac',
        'audit',
        'etl',
        'pareto',
        'risk',
        'annulations',
        'migration',
        'capacity',
        'ci',
        'db',
        'docs',
        'auth',
      ],
    ],
    // Description rules
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'subject-empty': [2, 'never'],
    'subject-max-length': [2, 'always', 72],
    // Body rules
    'body-max-line-length': [1, 'always', 100],
    // Header rules
    'header-max-length': [2, 'always', 100],
  },
};

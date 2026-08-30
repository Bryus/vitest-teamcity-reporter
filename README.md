# 📝 vitest-teamcity-reporter

## 💿 Installation

```bash
pnpm install -D vitest-teamcity-reporter
```

```bash
npm install -D vitest-teamcity-reporter
```


## 🔧 Configuration

Add new custom reporter `vite.config.ts`

```typescript
import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        // path to reporter
        reporters: 'vitest-teamcity-reporter',
    },
    // optionaly config
    coverage: {
        // enable "Reporting Build Statistics"
        reporter: ['teamcity'],
    }
});
```

### Root suite

TeamCity merges tests with identical full names. When several applications run
the same relative test files (e.g. two frontends sharing code) inside one build,
wrap each run into its own root suite so the tests are counted separately:

```typescript
reporters: [['vitest-teamcity-reporter', { rootSuite: 'Front' }]],
```

or, without touching the config, via the environment:

```bash
TEAMCITY_ROOT_SUITE=Front vitest run --reporter=vitest-teamcity-reporter
```

### Reporting Build Statistics
For enabling "[Reporting Build Statistics](https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Build+Statistics)" for TeamCity you may add a "[teamcity](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity)" coverage reporter that is the default provided by vitest ([vitest](https://vitest.dev/guide/coverage.html#coverage-setup) doc, [istanbul](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity) doc)

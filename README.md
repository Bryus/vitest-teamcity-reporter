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

### Errors outside tests

An unhandled rejection, a crashed worker or anything thrown after its module
finished belongs to no test. Vitest exits non-zero for those while every test
stays green, so the build used to fail with nothing in the log but the exit
code. They are now reported on their own:

```text
##teamcity[message text='Error: boom after the test' errorDetails='Error: boom after the test|n    at …' status='ERROR']
##teamcity[buildProblem description='Vitest: 1 unhandled error — Error: boom after the test']
```

The stack and the whole `cause` chain go into `errorDetails`, and the build
status text names the first error instead of the bare exit code. A run that was
interrupted is reported the same way.

### Reporting Build Statistics
For enabling "[Reporting Build Statistics](https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Build+Statistics)" for TeamCity you may add a "[teamcity](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity)" coverage reporter that is the default provided by vitest ([vitest](https://vitest.dev/guide/coverage.html#coverage-setup) doc, [istanbul](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity) doc)

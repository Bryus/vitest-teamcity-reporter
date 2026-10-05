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

### Module and suite errors

Errors of a module or a suite reach TeamCity through the tests they fail. When
there is no such test — the file threw while importing (a missing global, a
broken import), or `afterAll` threw after every test of its suite had passed —
the error is reported as a synthetic failed test inside that module or suite:

```text
##teamcity[testStarted name='(module error)' flowId='…']
##teamcity[testFailed name='(module error)' message='__APP_VERSION__ is not defined' details='ReferenceError: …' flowId='…']
##teamcity[testFinished name='(module error)' duration='0' flowId='…']
```

A suite gets a `(suite error)` test the same way. Errors already reported
through real tests (a failed `beforeAll` fails each of its tests) are not
repeated.

### Reporting Build Statistics
For enabling "[Reporting Build Statistics](https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Build+Statistics)" for TeamCity you may add a "[teamcity](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity)" coverage reporter that is the default provided by vitest ([vitest](https://vitest.dev/guide/coverage.html#coverage-setup) doc, [istanbul](https://istanbul.js.org/docs/advanced/alternative-reporters/#teamcity) doc)

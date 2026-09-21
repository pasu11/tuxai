# TuxAI — project notes

## Always package after finishing a task

After completing any change, run the full build + package step so `dist/` is up to date:

```bash
npm run build          # or: node scripts/build.mjs
node scripts/package.mjs   # or: npm run package:only
```

`package.mjs` produces `dist/tuxai.crx` and `dist/tuxai.xpi`. Do not consider a task
finished until both the build and the package step have run successfully.

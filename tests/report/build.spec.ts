import { test, expect } from '@playwright/test';
import { buildReport } from '../../src/report/build';

// npm run report:eval - rebuilds reports/index.html from the saved runs (no chatbot, no AI calls).
test('build the HTML evaluation report', async () => {
  const file = buildReport();
  console.log(`HTML report: ${file}`);
  expect(file).toMatch(/index\.html$/);
});

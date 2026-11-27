import { test, expect } from '@playwright/test';
import { publishReport } from '../../src/report/publish';

// npm run report:publish - copies reports/index.html to site/ (GitHub Pages), refusing if the report quotes any
// document that isn't a public fixture.
test('publish the HTML report to site/', async () => {
  const file = publishReport();
  console.log(`published: ${file}`);
  expect(file).toMatch(/site[\\/]index\.html$/);
});

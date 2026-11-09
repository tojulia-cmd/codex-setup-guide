import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const urls = [...new Set([...html.matchAll(/href="(https:\/\/[^\"]+)"/g)].map(match => match[1]))];
let failures = 0;
for (let i = 0; i < urls.length; i += 4) {
  await Promise.all(urls.slice(i, i + 4).map(async url => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      console.log(`${response.status} ${url}`);
      await response.body?.cancel();
      if (!response.ok) failures++;
    } catch (error) { failures++; console.log(`ERROR ${url} ${error.message}`); }
  }));
}
console.log(`${urls.length} unique external HTTPS links, ${failures} failures`);
process.exitCode = failures ? 1 : 0;

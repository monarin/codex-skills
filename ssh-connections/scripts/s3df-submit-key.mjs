#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class RefreshTargetNotFoundError extends Error {
  constructor(fingerprint) {
    super(`S3DF key fingerprint is not present in the key list: ${fingerprint}`);
    this.name = 'RefreshTargetNotFoundError';
  }
}

function parseArgs(argv) {
  const options = new Map();
  const flags = new Set();

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const name = arg.slice(2);
    if (['dry-run', 'keep-open', 'help'].includes(name)) {
      flags.add(name);
      continue;
    }

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    options.set(name, value);
    i += 1;
  }

  return { options, flags };
}

function usage() {
  console.log(`Usage: s3df-submit-key.mjs [options]

Options:
  --mode register|refresh
  --public-key-file PATH    Required in register mode.
  --fingerprint SHA256:...  Required in refresh mode.
  --user USER
  --url URL
  --profile-dir PATH
  --debug-dir PATH
  --timeout-ms MS
  --dry-run
  --keep-open        Pause for inspection, then close Chrome cleanly.
`);
}

function required(options, name) {
  const value = options.get(name);
  if (!value) {
    throw new Error(`Missing required option: --${name}`);
  }
  return value;
}

function validatePublicKey(publicKey) {
  if (!publicKey.includes('---- BEGIN SSH2 PUBLIC KEY ----')) {
    throw new Error('Public key is not in SSH2 export format.');
  }
  if (!publicKey.includes('---- END SSH2 PUBLIC KEY ----')) {
    throw new Error('Public key is missing the SSH2 footer.');
  }
}

export function normalizeFingerprint(fingerprint) {
  return fingerprint.trim().replace(/[/+]/g, '.');
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    console.error('Missing Node dependency: playwright');
    console.error('Install it with: cd ~/.codex/skills/ssh-connections && npm ci');
    throw error;
  }
}

async function pauseBeforeClose() {
  if (!process.stdin.isTTY) {
    console.error('Keeping browser open for 30 seconds because stdin is not interactive.');
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return;
  }

  console.error('Inspect the browser window, then press Enter here to close it cleanly.');
  process.stdin.setEncoding('utf8');
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });
}

async function launchContext(chromium, profileDir, channel) {
  try {
    return await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: false,
      viewport: null,
      args: ['--start-maximized'],
    });
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes('Opening in existing browser session')) {
      throw new Error(`The S3DF helper Chrome profile is already open:
  ${profileDir}

Close that Chrome window and rerun the command. This can happen after an old dry run
left the helper browser open. New dry runs now pause and close the profile cleanly.`);
    }
    throw error;
  }
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function textSnippet(text, maxLength = 1200) {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function writeDebugArtifacts(page, debugDir, reason) {
  fs.mkdirSync(debugDir, { recursive: true });

  const stamp = timestampForFile();
  const base = path.join(debugDir, `submit-${stamp}`);
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const html = await page.content().catch(() => '');

  fs.writeFileSync(`${base}.url.txt`, `${page.url()}\n`);
  fs.writeFileSync(`${base}.reason.txt`, `${reason}\n`);
  fs.writeFileSync(`${base}.text.txt`, bodyText);
  fs.writeFileSync(`${base}.html`, html);
  await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});

  return {
    bodyText,
    paths: {
      text: `${base}.text.txt`,
      html: `${base}.html`,
      screenshot: `${base}.png`,
      url: `${base}.url.txt`,
      reason: `${base}.reason.txt`,
    },
  };
}

async function checkSubmissionResult(page, debugDir) {
  const url = page.url();
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const normalizedText = bodyText.replace(/\s+/g, ' ').trim();

  const strongFailure = /\b(invalid public key|invalid ssh|bad public key|not a valid|submission failed|failed to register|registration failed|permission denied|access denied|not authorized|unauthorized|forbidden|exception|traceback)\b/i;
  if (strongFailure.test(normalizedText)) {
    const debug = await writeDebugArtifacts(page, debugDir, 'strong failure text after submit');
    throw new Error(`S3DF submission appears to have failed.
Current URL: ${url}
Page text: ${textSnippet(debug.bodyText)}
Debug text: ${debug.paths.text}
Debug screenshot: ${debug.paths.screenshot}`);
  }

  const successText = /\b(registered|success|successfully|uploaded|added|refreshed|valid until|expires|fingerprint)\b/i;
  const stillOnRegisterForm = await page.locator('textarea, input[type="text"]').count().catch(() => 0);

  if (successText.test(normalizedText) || /\/(list|refresh)\//.test(url)) {
    return { url, bodyText };
  }

  if (stillOnRegisterForm === 0) {
    return { url, bodyText };
  }

  const debug = await writeDebugArtifacts(page, debugDir, 'ambiguous page after submit');
  throw new Error(`S3DF submission result was ambiguous.
Current URL: ${url}
Page text: ${textSnippet(debug.bodyText)}
Debug text: ${debug.paths.text}
Debug screenshot: ${debug.paths.screenshot}`);
}

async function waitForKeyList(page, timeoutMs) {
  await page.waitForFunction(() => {
    const expectedHost = 's3df-sshkeys.slac.stanford.edu';
    const bodyText = document.body?.innerText || '';
    const hasRefreshButton = Array.from(document.querySelectorAll('button,input[type="submit"]'))
      .some((element) => ((element.innerText || element.value || '').trim().toLowerCase() === 'refresh'));

    return location.hostname === expectedHost
      && (hasRefreshButton || /\bfinger_print\b/i.test(bodyText));
  }, null, { timeout: timeoutMs });
}

export async function findRefreshTarget(page, fingerprint) {
  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  const rows = page.locator('tr');
  const matchingRows = [];

  for (let index = 0; index < await rows.count(); index += 1) {
    const candidate = rows.nth(index);
    const firstCellText = await candidate.locator('th,td').first().innerText().catch(() => '');
    if (firstCellText.trim() === normalizedFingerprint) {
      matchingRows.push(candidate);
    }
  }

  if (matchingRows.length === 0) {
    throw new RefreshTargetNotFoundError(normalizedFingerprint);
  }
  if (matchingRows.length !== 1) {
    throw new Error(
      `Expected one S3DF row for ${normalizedFingerprint}, found ${matchingRows.length}.`,
    );
  }

  const [row] = matchingRows;
  const refreshButtons = row.getByRole('button', { name: /^refresh$/i });
  const refreshButtonCount = await refreshButtons.count();
  if (refreshButtonCount !== 1) {
    throw new Error(
      `Expected one Refresh button for ${normalizedFingerprint}, found ${refreshButtonCount}.`,
    );
  }

  return {
    fingerprint: normalizedFingerprint,
    row,
    refreshButton: refreshButtons.first(),
  };
}

export async function refreshRegisteredKey(page, fingerprint, {
  dryRun = false,
  timeoutMs = 60000,
  debugDir,
} = {}) {
  const target = await findRefreshTarget(page, fingerprint);
  const previousRowText = await target.row.innerText();

  if (dryRun) {
    return {
      fingerprint: target.fingerprint,
      changed: false,
      dryRun: true,
    };
  }

  await target.refreshButton.click({ timeout: 30000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const changed = await page.waitForFunction(
    ({ expectedFingerprint, previousText }) => {
      const row = Array.from(document.querySelectorAll('tr'))
        .find((candidate) => (candidate.innerText || '').includes(expectedFingerprint));
      return Boolean(row && (row.innerText || '') !== previousText);
    },
    {
      expectedFingerprint: target.fingerprint,
      previousText: previousRowText,
    },
    { timeout: Math.min(timeoutMs, 60000) },
  ).then(() => true).catch(() => false);

  if (!changed) {
    const debug = await writeDebugArtifacts(
      page,
      debugDir,
      `Refresh did not update row for ${target.fingerprint}`,
    );
    throw new Error(`S3DF refresh did not update the matching key row.
Current URL: ${page.url()}
Debug text: ${debug.paths.text}
Debug screenshot: ${debug.paths.screenshot}`);
  }

  return {
    fingerprint: target.fingerprint,
    changed: true,
    dryRun: false,
  };
}

async function main() {
  const { options, flags } = parseArgs(process.argv);
  if (flags.has('help')) {
    usage();
    return;
  }

  const mode = options.get('mode') || 'register';
  if (!['register', 'refresh'].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const user = options.get('user') || os.userInfo().username;
  const defaultPath = mode === 'refresh' ? 'list' : 'register';
  const url = options.get('url')
    || `https://s3df-sshkeys.slac.stanford.edu/${defaultPath}/${encodeURIComponent(user)}`;
  const fingerprint = mode === 'refresh'
    ? normalizeFingerprint(required(options, 'fingerprint'))
    : null;
  const publicKeyFile = mode === 'register' ? required(options, 'public-key-file') : null;
  const publicKey = publicKeyFile ? fs.readFileSync(publicKeyFile, 'utf8').trim() : null;
  const timeoutMs = Number(options.get('timeout-ms') || process.env.S3DF_PLAYWRIGHT_TIMEOUT_MS || 600000);
  const profileDir = options.get('profile-dir')
    || process.env.S3DF_PLAYWRIGHT_PROFILE_DIR
    || path.join(os.homedir(), 'Library', 'Application Support', 's3df-key-refresh', 'chrome-profile');
  const debugDir = options.get('debug-dir')
    || process.env.S3DF_DEBUG_DIR
    || path.join(os.homedir(), '.ssh', 's3df', 'debug');
  const channel = process.env.S3DF_PLAYWRIGHT_CHANNEL || 'chrome';
  const dryRun = flags.has('dry-run');
  const keepOpen = flags.has('keep-open') || process.env.S3DF_PLAYWRIGHT_KEEP_OPEN === '1';

  if (publicKey) {
    validatePublicKey(publicKey);
  }
  fs.mkdirSync(profileDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const context = await launchContext(chromium, profileDir, channel);

  try {
    context.setDefaultTimeout(60000);
    const page = context.pages()[0] || await context.newPage();

    console.error(`Opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (mode === 'refresh') {
      console.error('Waiting for the S3DF key list. Complete SSO/Duo in the browser if prompted.');
      await waitForKeyList(page, timeoutMs);

      if (new URL(page.url()).hostname !== 's3df-sshkeys.slac.stanford.edu') {
        throw new Error(`Refusing to refresh on unexpected host: ${page.url()}`);
      }

      const result = await refreshRegisteredKey(page, fingerprint, {
        dryRun,
        timeoutMs,
        debugDir,
      });

      if (result.dryRun) {
        console.log(`Dry run: found matching S3DF key row for ${result.fingerprint}; did not click Refresh.`);
      } else {
        console.log(`Refreshed S3DF key registration for ${user}.`);
      }
      if (keepOpen) {
        await pauseBeforeClose();
      }
      return;
    }

    console.error('Waiting for the S3DF key registration form. Complete SSO/Duo in the browser if prompted.');

    await page.waitForFunction(() => {
      const expectedHost = 's3df-sshkeys.slac.stanford.edu';
      const hasKeyBox = Array.from(document.querySelectorAll('textarea,input')).some((element) => {
        const placeholder = element.getAttribute('placeholder') || '';
        const ariaLabel = element.getAttribute('aria-label') || '';
        return /BEGIN SSH2 PUBLIC KEY/i.test(placeholder)
          || /public key/i.test(ariaLabel)
          || element.tagName.toLowerCase() === 'textarea';
      });

      return location.hostname === expectedHost
        && /s3df ssh keypair service/i.test(document.title)
        && hasKeyBox;
    }, null, { timeout: timeoutMs });

    if (new URL(page.url()).hostname !== 's3df-sshkeys.slac.stanford.edu') {
      throw new Error(`Refusing to submit on unexpected host: ${page.url()}`);
    }

    let keyBox = page.getByPlaceholder(/BEGIN SSH2 PUBLIC KEY/i).first();
    if (await keyBox.count() === 0) {
      keyBox = page.locator('textarea').first();
    }
    if (await keyBox.count() === 0) {
      keyBox = page.locator('input[type="text"]').first();
    }
    if (await keyBox.count() === 0) {
      throw new Error('Could not find the S3DF public key textbox.');
    }

    await keyBox.fill(publicKey);

    if (dryRun) {
      console.log('Dry run: filled the S3DF public key form but did not click Submit.');
      if (keepOpen) {
        await pauseBeforeClose();
      }
      return;
    }

    const submitButton = page.getByRole('button', { name: /^submit$/i }).first();
    await submitButton.click({ timeout: 30000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await checkSubmissionResult(page, debugDir);

    console.log(`Submitted S3DF key registration for ${user}.`);
    if (keepOpen) {
      await pauseBeforeClose();
    }
  } finally {
    await context.close();
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(error instanceof RefreshTargetNotFoundError ? 3 : 1);
  });
}

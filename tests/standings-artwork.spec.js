import { test, expect } from '@playwright/test';
import { brokenStandings } from './fixtures/standings-roster.js';

const standing = (page, user) => page.locator('[data-rc-standings-body] tr[data-driver-id="' + user + '"]');
const number = (page, user) => standing(page, user).locator('.standings-number');

function entry(data, user) {
  return data.drivers.teams.flatMap(team => team.entries).find(driver => driver.user === user);
}

async function images(page) {
  const files = await page.evaluate(() => {
    const draw = (width, height, x, y, w, h) => {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff'; context.fillRect(x, y, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    };
    return {
      wide: draw(1800, 1000, 650, 440, 500, 100),
      tall: draw(1000, 1800, 450, 650, 100, 500),
      padded: draw(2200, 2200, 900, 900, 400, 400)
    };
  });
  for (const [name, value] of Object.entries(files)) {
    await page.route('**/test-number-' + name + '.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(value, 'base64') }));
  }
  await page.route('**/test-number-broken.png', route => route.fulfill({ status: 404, body: '' }));
}

function artworkLeague() {
  const data = brokenStandings();
  entry(data, 'lancejuly').numberImage = '/test-number-wide.png';
  entry(data, 'JJElliott2004').numberImage = '/test-number-tall.png';
  entry(data, 'GuillermoChase').numberImage = '/test-number-padded.png';
  entry(data, 'pa05').numberImage = '/test-number-broken.png';
  delete entry(data, 'UN88475544').numberImage;
  delete data.drivers.profiles.UN88475544.numberImage;
  return data;
}

async function readyNumber(page, user) {
  const slot = number(page, user);
  await slot.scrollIntoViewIfNeeded();
  await expect(slot).toHaveClass(/is-ready/);
  await slot.locator('.standings-number-image').evaluate(image => image.decode());
  return slot;
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => {
    const shell = document.querySelector('.rc-table-shell');
    return { page: document.documentElement.scrollWidth, viewport: innerWidth, table: shell.scrollWidth, available: shell.clientWidth };
  });
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.table).toBeLessThanOrEqual(sizes.available + 1);
}

test('standings number images share fixed display slots while padded artwork is trimmed and fallback text remains accessible', async ({ page }) => {
  const data = artworkLeague();
  await images(page);
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
  await page.goto('/race-center/');
  const users = ['lancejuly', 'JJElliott2004', 'GuillermoChase'];
  for (const width of [320, 390, 721, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = [];
    for (const user of users) {
      const slot = await readyNumber(page, user);
      geometry.push(await slot.locator('.standings-number-image').evaluate(image => {
        const box = image.getBoundingClientRect();
        return { width: box.width, height: box.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, fit: getComputedStyle(image).objectFit };
      }));
    }
    for (const image of geometry) {
      expect(Math.abs(image.width - geometry[0].width)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(image.height - geometry[0].height)).toBeLessThanOrEqual(0.5);
      expect(image.width).toBeLessThanOrEqual(width <= 720 ? 38 : 64);
      expect(image.height).toBe(width <= 720 ? 28 : 36);
      expect(image.fit).toBe('contain');
    }
    expect(geometry[0].naturalWidth / geometry[0].naturalHeight).toBeGreaterThan(3);
    expect(geometry[1].naturalWidth / geometry[1].naturalHeight).toBeLessThan(0.35);
    expect(geometry[0].naturalWidth).toBeLessThan(900);
    expect(geometry[1].naturalHeight).toBeLessThan(900);
    expect(geometry[2].naturalWidth).toBeLessThan(800);
    await noOverflow(page);
    if (width === 390 || width === 1440) {
      await standing(page, 'lancejuly').evaluate(row => window.scrollTo({ top: row.getBoundingClientRect().top + scrollY - 260, behavior: 'instant' }));
      await page.screenshot({ path: `test-results/standings-artwork-${width}.png` });
    }
  }
  for (const [user, value] of [['lancejuly', '88'], ['JJElliott2004', '84'], ['GuillermoChase', '81']]) {
    await expect(number(page, user).locator('.standings-number-text')).toHaveText(value);
    await expect(number(page, user)).toHaveAttribute('aria-label', 'Car number ' + value);
  }
  await number(page, 'pa05').scrollIntoViewIfNeeded();
  await expect(number(page, 'pa05').locator('.standings-number-image')).toHaveCount(0);
  await expect(number(page, 'pa05').locator('.standings-number-text')).toBeVisible();
  await expect(number(page, 'pa05')).toHaveText('05');
  await expect(number(page, 'UN88475544').locator('.standings-number-image')).toHaveCount(0);
  await expect(number(page, 'UN88475544').locator('.standings-number-text')).toBeVisible();
  await expect(standing(page, 'lancejuly').locator('.rc-points-value')).toHaveText('281');
  await expect(standing(page, '58bbwapache').locator('.rc-cutoff-value')).toHaveText('+8');
  await expect(standing(page, 'Frogboy4783').locator('.rc-gap')).toHaveText('-213');
});

test('series-specific artwork and exact car numbers prevent a manual correction from showing the wrong number image', async ({ page }) => {
  const data = artworkLeague();
  data.drivers.openEntries.find(driver => driver.user === 'JJElliott2004').numberImage = '/test-number-padded.png';
  data.standings.find(driver => driver.username === 'lancejuly').number = '089';
  await images(page);
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: { data } }));
  await page.goto('/race-center/');
  await expect(number(page, 'lancejuly')).toHaveText('089');
  await expect(number(page, 'lancejuly').locator('.standings-number-image')).toHaveCount(0);
  const d1Image = (await readyNumber(page, 'JJElliott2004')).locator('.standings-number-image');
  expect(await d1Image.evaluate(image => image.naturalHeight / image.naturalWidth)).toBeGreaterThan(3);
  await page.locator('[data-rc-division="open"]').click();
  await expect(number(page, 'JJElliott2004')).toHaveText('48');
  const openImage = (await readyNumber(page, 'JJElliott2004')).locator('.standings-number-image');
  expect(await openImage.evaluate(image => image.naturalWidth / image.naturalHeight)).toBeCloseTo(1, 1);
});

test('a large source PNG is resized by the existing uploader and publishes optional number art without changing points', async ({ page }) => {
  test.setTimeout(60000);
  let live = brokenStandings();
  delete entry(live, 'lancejuly').numberImage;
  delete live.drivers.profiles.lancejuly.numberImage;
  const uploads = [], publications = [], stored = new Map();
  await page.context().route('**/.netlify/functions/admin-publish**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.searchParams.has('image')) return route.fulfill({ contentType: 'image/webp', body: stored.get(url.searchParams.get('image')) });
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      if (body.action === 'upload-driver-image') {
        uploads.push(body.image);
        const id = '00000000-0000-0000-0000-' + String(uploads.length).padStart(12, '0');
        stored.set(id, Buffer.from(body.image.split(',')[1], 'base64'));
        return route.fulfill({ json: { url: '/.netlify/functions/admin-publish?image=' + id } });
      }
      expect(body.data).toBeTruthy();
      publications.push(body.data); live = body.data;
      return route.fulfill({ json: { ok: true, revision: 'number-art', message: 'Published live' } });
    }
    return route.fulfill({ json: url.searchParams.has('status') ? { ready: true, user: { id: 'number-owner', displayName: 'Number Owner', role: 'owner' } } : { data: live } });
  });
  await page.goto('/admin/');
  const before = await page.evaluate(async () => JSON.stringify((await window.UARLData.load()).standings));
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  await page.locator('[data-standings-artwork="lancejuly"]').click();
  const input = page.locator('.roster-artwork[open] [data-image-upload][data-image-key="numberImage"]');
  await expect(input).toHaveCount(1);
  const originalImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2200; canvas.height = 1300;
    const context = canvas.getContext('2d'), pixels = context.createImageData(2160, 1260);
    let seed = 123456789;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      pixels.data[i] = seed & 255; pixels.data[i + 1] = seed >>> 8 & 255; pixels.data[i + 2] = seed >>> 16 & 255; pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 20, 20);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const source = Buffer.from(originalImage, 'base64');
  expect(source.length).toBeGreaterThan(2 * 1024 * 1024);
  await input.setInputFiles({ name: 'large-number.png', mimeType: 'image/png', buffer: source });
  await expect.poll(() => uploads.length).toBe(1);
  await expect(page.locator('[data-toast]')).toHaveText('Image saved to draft. Publish when ready.');
  const uploaded = Buffer.from(uploads[0].split(',')[1], 'base64');
  expect(uploads[0]).toMatch(/^data:image\/webp;base64,/);
  expect(uploaded.length).toBeLessThanOrEqual(2 * 1024 * 1024);
  const optimized = await page.evaluate(async source => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return { width: image.naturalWidth, height: image.naturalHeight, alpha: context.getImageData(0, 0, 1, 1).data[3] };
  }, uploads[0]);
  expect(Math.max(optimized.width, optimized.height)).toBeLessThanOrEqual(1600);
  expect(optimized.alpha).toBe(0);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('uarl-admin-draft-v1')));
  expect(JSON.stringify(draft.standings)).toBe(before);
  expect(entry(draft, 'lancejuly').numberImage).toContain('?image=');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  await expect(page.locator('[data-standings-driver="lancejuly"] .standings-number')).toHaveClass(/is-ready/);
  await page.locator('[data-action="publish"]').first().click();
  await page.locator('[data-confirm-publish]').click();
  await expect.poll(() => publications.length).toBe(1);
  await expect(page.locator('[data-save-status]')).toHaveText('Published live');
  await page.goto('/race-center/');
  await readyNumber(page, 'lancejuly');
  await expect(number(page, 'lancejuly')).toHaveText('88');
  await expect(standing(page, 'lancejuly').locator('.rc-points-value')).toHaveText('281');
  await expect(number(page, 'pa05')).toHaveText('05');
});

test('Admins can manage number art from standings while Race Control keeps artwork read-only', async ({ page }) => {
  let role = 'admin';
  const data = brokenStandings();
  await page.route('**/.netlify/functions/admin-publish**', route => route.fulfill({ json: route.request().url().includes('status=1') ? { ready: true, user: { id: 'number-staff', displayName: 'Number Staff', role } } : { data } }));
  await page.goto('/admin/');
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  await expect(page.locator('[data-standings-artwork="lancejuly"]')).toBeVisible();
  role = 'race_control';
  await page.reload();
  await page.locator('.admin-sidebar [data-section="standings"]').click();
  await expect(page.locator('[data-standings-artwork]')).toHaveCount(0);
});

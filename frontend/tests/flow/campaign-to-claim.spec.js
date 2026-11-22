import { expect, test } from '@playwright/test';
import { FLOW_ADMIN_ADDRESS } from '../../playwright.flow.config.js';
import { createSorobanChainMock } from './support/soroban-chain-mock.js';

/**
 * End-to-end browser flow (#1319): an admin connects a wallet and creates a campaign, the campaign
 * page loads, and a participant claims earned rewards with an on-chain transaction that is signed in
 * the (mocked) wallet and submitted to a (mocked) Soroban RPC, after which the points balance shown
 * in the UI drops accordingly.
 *
 * Everything outside the browser is mocked in this file, so the test is deterministic and needs no
 * testnet, backend or wallet extension:
 *   - the Trivela REST API     -> an in-memory campaign store (below)
 *   - Horizon                  -> a fixed XLM balance
 *   - the Soroban RPC          -> support/soroban-chain-mock.js (real XDR, stateful balance)
 *   - the wallet extension     -> a Rabet stub injected before the app loads
 *
 * Run: npm run test:e2e:flow --workspace=frontend
 */

const SOROBAN_RPC = 'https://soroban-testnet.stellar.org/**';
const HORIZON = 'https://horizon-testnet.stellar.org/**';
const JSON_HEADERS = { 'access-control-allow-origin': '*' };

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

const emptyPage = (data) => ({
  data,
  pagination: {
    total: data.length,
    count: data.length,
    page: 1,
    limit: 20,
    offset: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    previousPage: null,
    nextPage: null,
  },
});

/** Installs the mocks and returns handles to inspect what the app sent. */
async function mockBackend(page, { rewardsBalance }) {
  const campaigns = new Map();
  const apiRequests = [];
  const chain = createSorobanChainMock({ balances: { [FLOW_ADMIN_ADDRESS]: rewardsBalance } });

  await page.addInitScript((address) => {
    window.localStorage.setItem('trivela:tour_completed', 'true');
    window.rabet = {
      connect: () => Promise.resolve({ publicKey: address }),
      // The mock RPC does not verify signatures, so returning the XDR unchanged is a valid "signature".
      sign: (xdr) => Promise.resolve({ xdr }),
    };
  }, FLOW_ADMIN_ADDRESS);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, '');
    apiRequests.push({ method: request.method(), path, body: request.postData() });

    if (path === '/campaigns' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}');
      const campaign = {
        id: String(campaigns.size + 1),
        active: true,
        participantCount: 0,
        tasks: [],
        createdAt: new Date().toISOString(),
        ...body,
      };
      campaigns.set(campaign.id, campaign);
      return json(route, campaign, 201);
    }
    if (path === '/campaigns') return json(route, emptyPage([...campaigns.values()]));
    const detail = path.match(/^\/campaigns\/([^/]+)$/);
    if (detail && request.method() === 'GET') {
      const campaign = campaigns.get(detail[1]);
      return campaign ? json(route, campaign) : json(route, { error: 'Not found' }, 404);
    }
    // config, referrals, analytics, ... : empty but well-formed
    return json(route, { data: [], pagination: {} });
  });

  await page.route(HORIZON, (route) =>
    json(route, {
      id: FLOW_ADMIN_ADDRESS,
      balances: [{ asset_type: 'native', balance: '1000.0000000' }],
    }),
  );
  await page.route(SOROBAN_RPC, (route) => chain.handle(route));

  return { campaigns, apiRequests, chain };
}

async function connectRabet(page) {
  await page
    .getByRole('button', { name: /connect wallet/i })
    .first()
    .click();
  await page.getByRole('dialog').getByRole('button', { name: /Rabet/ }).click();
  await expect(page.getByText('Wallet connected')).toBeVisible();
}

test.describe('campaign creation to reward claim', () => {
  test('admin creates a campaign, the campaign page loads, and a participant claims rewards', async ({
    page,
  }) => {
    const { campaigns, apiRequests, chain } = await mockBackend(page, { rewardsBalance: 500 });

    // 1. The admin area is gated until a wallet that is on the admin list is connected.
    await page.goto('/admin/campaigns/new');
    await expect(page.getByRole('heading', { name: /admin access required/i })).toBeVisible();
    await connectRabet(page);
    await expect(page.getByRole('heading', { name: /create new campaign/i })).toBeVisible();

    // 2. Create the campaign through the form.
    await page.getByLabel('Admin API key').fill('test-admin-key');
    await page.getByLabel(/Campaign name/).fill('Spring Referral Drive');
    await page.getByLabel('Description').fill('Invite friends and earn points for every sign-up.');
    await page.getByLabel(/Reward amount per participant/).fill('25');
    await page.getByRole('button', { name: /^create campaign$/i }).click();

    // The form posted the right payload with the admin API key ...
    await expect.poll(() => campaigns.size).toBe(1);
    const created = apiRequests.find((r) => r.method === 'POST' && r.path === '/campaigns');
    expect(JSON.parse(created.body)).toMatchObject({
      name: 'Spring Referral Drive',
      rewardPerAction: 25,
    });

    // 3. ... and the app navigated to the new campaign's page.
    await expect(page).toHaveURL(/\/campaign\/1$/);
    await expect(page.getByRole('heading', { name: 'Spring Referral Drive' })).toBeVisible();
    await expect(page.getByText('Campaign #1')).toBeVisible();

    // 4. Claim rewards on the home page: the on-chain balance is read, then debited by the claim.
    await page.getByRole('link', { name: 'Trivela home' }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await connectRabet(page);
    const points = page.locator('.rewards-balance strong');
    await expect(points).toHaveText('500');

    const claimSection = page.getByRole('region', { name: /claim rewards/i });
    await claimSection.getByLabel('Amount to claim').fill('200');
    await claimSection.getByRole('button', { name: 'Claim', exact: true }).click();

    // The confirmation appears, the contract state changed, and the displayed balance is refreshed.
    await expect(claimSection.getByText('Transaction confirmed')).toBeVisible();
    await expect(points).toHaveText('300');
    await expect.poll(() => chain.state.balances[FLOW_ADMIN_ADDRESS]).toBe(300n);
    expect(chain.state.claimed).toBe(200n);
    expect(chain.state.submitted.size).toBe(1);
  });

  test('claiming more than the balance is rejected with a readable error and changes nothing', async ({
    page,
  }) => {
    const { chain } = await mockBackend(page, { rewardsBalance: 50 });

    await page.goto('/');
    await connectRabet(page);
    await expect(page.locator('.rewards-balance strong')).toHaveText('50');

    const claimSection = page.getByRole('region', { name: /claim rewards/i });
    await claimSection.getByLabel('Amount to claim').fill('80');
    await claimSection.getByRole('button', { name: 'Claim', exact: true }).click();

    await expect(claimSection.getByRole('alert')).toContainText('Insufficient points');
    expect(chain.state.balances[FLOW_ADMIN_ADDRESS]).toBe(50n);
    expect(chain.state.claimed).toBe(0n);
    expect(chain.state.submitted.size).toBe(0);
  });

  test('the claim button stays disabled until a positive whole amount is entered', async ({
    page,
  }) => {
    await mockBackend(page, { rewardsBalance: 500 });

    await page.goto('/');
    await connectRabet(page);

    const claimSection = page.getByRole('region', { name: /claim rewards/i });
    const submit = claimSection.getByRole('button', { name: 'Claim', exact: true });
    const amount = claimSection.getByLabel('Amount to claim');

    await expect(submit).toBeDisabled();
    for (const invalid of ['0', '-5', '1.5']) {
      await amount.fill(invalid);
      await expect(submit).toBeDisabled();
    }
    await amount.fill('10');
    await expect(submit).toBeEnabled();
  });
});

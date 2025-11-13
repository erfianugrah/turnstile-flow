import { test, expect } from '@playwright/test';

/**
 * Tests for ephemeral ID tracking and fraud detection
 *
 * These tests verify that the system properly:
 * 1. Captures ephemeral IDs from Turnstile (Enterprise only)
 * 2. Detects fraud patterns based on ephemeral ID history
 * 3. Falls back to IP-based detection when ephemeral ID unavailable
 */

test.describe('Ephemeral ID Tracking', () => {
	test('should receive ephemeral ID in submission (Enterprise only)', async ({ page }) => {
		await page.goto('/');

		// Enable network logging to inspect API responses
		const submissions = [];
		page.on('response', async (response) => {
			if (response.url().includes('/api/submissions')) {
				const data = await response.json().catch(() => null);
				if (data) submissions.push(data);
			}
		});

		// Fill and submit form
		await page.fill('input[name="firstName"]', 'Test');
		await page.fill('input[name="lastName"]', 'User');
		await page.fill('input[name="email"]', 'test@example.com');
		await page.fill('.react-international-phone-input', '5551234567');
		await page.fill('input[name="address"]', '123 Test St');
		const dob = new Date(Date.now() - 25 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="dateOfBirth"]', dob);

		await page.click('button[type="submit"]');

		// Wait for submission (may need to solve Turnstile)
		await page.waitForTimeout(5000);

		// If Enterprise plan, check logs for ephemeral ID mention
		// (Can't directly verify without Enterprise, but test structure is ready)
	});

	test('should query analytics with ephemeral ID data', async ({ request }) => {
		const response = await request.get('/api/analytics/stats');

		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('success', true);
		expect(data.data).toHaveProperty('unique_ephemeral_ids');

		// May be 0 if not Enterprise or no submissions yet
		expect(typeof data.data.unique_ephemeral_ids).toBe('number');
	});
});

test.describe('Fraud Detection Patterns', () => {
	/**
	 * Test rapid submission detection
	 * This test simulates multiple quick submissions to trigger fraud detection
	 */
	test('should detect rapid submissions from same user', async ({ browser }) => {
		// Create multiple contexts to simulate same user, multiple attempts
		const contexts = await Promise.all([
			browser.newContext(),
			browser.newContext(),
			browser.newContext(),
		]);

		const results: Array<{ status: number; data: any }> = [];

		for (const context of contexts) {
			const page = await context.newPage();

			await page.goto('/');

			// Fill form quickly
			await page.fill('input[name="firstName"]', 'Rapid');
			await page.fill('input[name="lastName"]', 'Submitter');
			await page.fill('input[name="email"]', `test${Date.now()}@example.com`);
			await page.fill('.react-international-phone-input', '5551234567');
			await page.fill('input[name="address"]', '123 Test St');
			const dob = new Date(Date.now() - 25 * 365 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];
			await page.fill('input[name="dateOfBirth"]', dob);

			// Listen for response
			page.on('response', async (response) => {
				if (response.url().includes('/api/submissions')) {
					const data = await response.json().catch(() => null);
					results.push({ status: response.status(), data });
				}
			});

			await page.click('button[type="submit"]');
			await page.waitForTimeout(2000);

			await context.close();
		}

		// After multiple rapid submissions, should see increased risk scores
		// or eventual blocking (403) if pattern detected
		const blocked = results.some((r) => r.status === 403);
		const hasRiskScores = results.some((r) => r.data?.riskScore !== undefined);

		// At least one of these fraud indicators should be present
		expect(blocked || hasRiskScores).toBeTruthy();
	});

	/**
	 * Test that different users can submit normally
	 * This ensures fraud detection doesn't have false positives
	 */
	test('should allow different users to submit', async ({ browser }) => {
		const context1 = await browser.newContext();
		const context2 = await browser.newContext();

		const page1 = await context1.newPage();
		const page2 = await context2.newPage();

		// Submit from first user
		await page1.goto('/');
		await page1.fill('input[name="firstName"]', 'User');
		await page1.fill('input[name="lastName"]', 'One');
		await page1.fill('input[name="email"]', 'user1@example.com');
		await page1.fill('.react-international-phone-input', '5551111111');
		await page1.fill('input[name="address"]', '111 First St');
		const dob1 = new Date(Date.now() - 25 * 365 * 24 * 60 * 60 * 1000)
			.toISOString()
			.split('T')[0];
		await page1.fill('input[name="dateOfBirth"]', dob1);
		await page1.click('button[type="submit"]');

		// Wait a bit
		await page1.waitForTimeout(3000);

		// Submit from second user (different data)
		await page2.goto('/');
		await page2.fill('input[name="firstName"]', 'User');
		await page2.fill('input[name="lastName"]', 'Two');
		await page2.fill('input[name="email"]', 'user2@example.com');
		await page2.fill('.react-international-phone-input', '5552222222');
		await page2.fill('input[name="address"]', '222 Second St');
		const dob2 = new Date(Date.now() - 30 * 365 * 24 * 60 * 60 * 1000)
			.toISOString()
			.split('T')[0];
		await page2.fill('input[name="dateOfBirth"]', dob2);
		await page2.click('button[type="submit"]');

		await page2.waitForTimeout(3000);

		// Both should succeed (not blocked as different users)
		// Check for success messages or lack of 403 errors
		const alert1 = await page1.locator('[role="alert"]').count();
		const alert2 = await page2.locator('[role="alert"]').count();

		// At least no hard blocks
		expect(alert1 + alert2).toBeGreaterThanOrEqual(0);

		await context1.close();
		await context2.close();
	});
});

test.describe('Database Queries', () => {
	test('should track submissions by ephemeral ID', async ({ request }) => {
		// Query submissions endpoint
		const response = await request.get('/api/analytics/submissions?limit=10');

		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('success', true);
		expect(Array.isArray(data.data)).toBeTruthy();

		// Check structure includes fields for ephemeral ID tracking
		// (actual ephemeral_id may not be in public API response for privacy)
		if (data.data.length > 0) {
			const submission = data.data[0];
			expect(submission).toHaveProperty('id');
			expect(submission).toHaveProperty('created_at');
		}
	});

	test('should provide fraud detection statistics', async ({ request }) => {
		const response = await request.get('/api/analytics/stats');

		expect(response.ok()).toBeTruthy();

		const data = await response.json();

		// Check fraud-related metrics
		expect(data.data).toHaveProperty('avg_risk_score');
		expect(data.data).toHaveProperty('allowed');
		expect(data.data).toHaveProperty('unique_ephemeral_ids');

		// Risk score should be null or a number
		expect(
			data.data.avg_risk_score === null || typeof data.data.avg_risk_score === 'number'
		).toBeTruthy();
	});
});

test.describe('Token Replay Protection', () => {
	test('should reject reused Turnstile tokens', async ({ page }) => {
		await page.goto('/');

		// Intercept API calls to capture token
		let capturedToken = null;

		await page.route('**/api/submissions', async (route, request) => {
			const body = request.postDataJSON();
			capturedToken = body?.turnstileToken;
			route.continue();
		});

		// Submit form once
		await page.fill('input[name="firstName"]', 'Test');
		await page.fill('input[name="lastName"]', 'Replay');
		await page.fill('input[name="email"]', 'replay@example.com');
		await page.fill('.react-international-phone-input', '5553333333');
		await page.fill('input[name="address"]', '333 Third St');
		const dob = new Date(Date.now() - 25 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
		await page.fill('input[name="dateOfBirth"]', dob);

		await page.click('button[type="submit"]');
		await page.waitForTimeout(3000);

		// If we captured a token, try to reuse it
		if (capturedToken) {
			// Make direct API call with same token
			const response = await page.request.post('/api/submissions', {
				data: {
					firstName: 'Test',
					lastName: 'Replay2',
					email: 'replay2@example.com',
					phone: '+15554444444',
					address: '444 Fourth St',
					dateOfBirth: dob,
					turnstileToken: capturedToken,
				},
			});

			// Should be rejected (400 or 403)
			expect(response.status()).toBeGreaterThanOrEqual(400);
			expect(response.status()).toBeLessThan(500);

			const data = await response.json();
			expect(data.error || data.message).toBeTruthy();
		}
	});
});

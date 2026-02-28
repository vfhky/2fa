import { describe, it, expect } from 'vitest';
import { createMainPage } from '../../src/ui/page.js';
import { createSetupPage } from '../../src/ui/setupPage.js';
import { createQuickOtpPage } from '../../src/ui/quickOtp.js';

function createRequest(pathname = '/') {
	return new Request(`https://example.com${pathname}`, {
		method: 'GET',
		headers: {
			Origin: 'https://example.com',
		},
	});
}

describe('UI 页面安全头', () => {
	it('主页面应注入安全头', async () => {
		const response = await createMainPage(createRequest('/'));
		expect(response.headers.get('X-Frame-Options')).toBeDefined();
		expect(response.headers.get('Content-Security-Policy')).toBeDefined();
	});

	it('设置页面应注入安全头', async () => {
		const response = await createSetupPage(createRequest('/setup'));
		expect(response.headers.get('X-Frame-Options')).toBeDefined();
		expect(response.headers.get('Content-Security-Policy')).toBeDefined();
	});

	it('快速 OTP 页面应注入安全头', () => {
		const response = createQuickOtpPage('123456', { period: 30, remainingTime: 10 }, createRequest('/otp/test'));
		expect(response.headers.get('X-Frame-Options')).toBeDefined();
		expect(response.headers.get('Content-Security-Policy')).toBeDefined();
	});
});

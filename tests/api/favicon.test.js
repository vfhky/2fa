import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleFaviconProxy } from '../../src/api/favicon.js';

class MockKV {
	constructor() {
		this.store = new Map();
	}

	async get(key, type = 'text') {
		const value = this.store.get(key);
		if (!value) return null;
		if (type === 'json') {
			return JSON.parse(value);
		}
		return value;
	}

	async put(key, value) {
		this.store.set(key, value);
	}
}

function createEnv() {
	return {
		SECRETS_KV: new MockKV(),
		LOG_LEVEL: 'ERROR',
	};
}

function createRequest(url = 'https://example.com/api/favicon/example.com', ip = '203.0.113.1') {
	return new Request(url, {
		method: 'GET',
		headers: {
			'CF-Connecting-IP': ip,
		},
	});
}

function createDnsResponse(ips = []) {
	return new Response(
		JSON.stringify({
			Answer: ips.map((ip) => ({ data: ip })),
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/dns-json',
			},
		},
	);
}

function createImageResponse() {
	return new Response('fake-image-bytes', {
		status: 200,
		headers: {
			'Content-Type': 'image/png',
		},
	});
}

describe('Favicon API', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('应拒绝无效域名', async () => {
		const env = createEnv();
		const request = createRequest('https://example.com/api/favicon/localhost');
		const response = await handleFaviconProxy(request, env, 'localhost');
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('无效域名');
	});

	it('解析到私网地址时应拦截代理', async () => {
		const env = createEnv();
		const request = createRequest();

		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) => {
				if (String(url).startsWith('https://cloudflare-dns.com/dns-query')) {
					return createDnsResponse(['10.0.0.10']);
				}
				return createImageResponse();
			}),
		);

		const response = await handleFaviconProxy(request, env, 'example.com');
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toContain('域名受限');
	});

	it('默认禁用 Direct-HTTP 回源', async () => {
		const env = createEnv();
		const request = createRequest();

		const fetchMock = vi.fn(async (url) => {
			const urlText = String(url);
			if (urlText.startsWith('https://cloudflare-dns.com/dns-query')) {
				return createDnsResponse(['93.184.216.34']);
			}
			if (urlText.startsWith('http://example.com/favicon.ico')) {
				return createImageResponse();
			}
			return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
		});
		vi.stubGlobal('fetch', fetchMock);

		const response = await handleFaviconProxy(request, env, 'example.com');

		expect(response.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalledWith(
			'http://example.com/favicon.ico',
			expect.any(Object),
		);
	});

	it('开启开关后允许 Direct-HTTP 回源', async () => {
		const env = {
			...createEnv(),
			ENABLE_FAVICON_HTTP_FALLBACK: 'true',
		};
		const request = createRequest();

		const fetchMock = vi.fn(async (url) => {
			const urlText = String(url);
			if (urlText.startsWith('https://cloudflare-dns.com/dns-query')) {
				return createDnsResponse(['93.184.216.34']);
			}
			if (urlText === 'http://example.com/favicon.ico') {
				return createImageResponse();
			}
			return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
		});
		vi.stubGlobal('fetch', fetchMock);

		const response = await handleFaviconProxy(request, env, 'example.com');

		expect(response.status).toBe(200);
		expect(response.headers.get('X-Favicon-Source')).toBe('Direct-HTTP');
		expect(fetchMock).toHaveBeenCalledWith(
			'http://example.com/favicon.ico',
			expect.any(Object),
		);
	});

	it('高频请求应触发 favicon 代理限流', async () => {
		const env = createEnv();

		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) => {
				if (String(url).startsWith('https://cloudflare-dns.com/dns-query')) {
					return createDnsResponse(['93.184.216.34']);
				}
				return createImageResponse();
			}),
		);

		let lastResponse = null;
		for (let i = 0; i < 31; i++) {
			const request = createRequest();
			lastResponse = await handleFaviconProxy(request, env, 'example.com');
		}

		const data = await lastResponse.json();
		expect(lastResponse.status).toBe(429);
		expect(data.error).toContain('请求过于频繁');
	});
});

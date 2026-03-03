import { describe, it, expect } from 'vitest';
import { ValidationError, errorToResponse } from '../../src/utils/errors.js';

function createMockRequest() {
	return new Request('https://example.com/api/test', {
		method: 'GET',
		headers: {
			Origin: 'https://example.com',
		},
	});
}

describe('errors', () => {
	it('errorToResponse 默认不返回 details 字段', async () => {
		const request = createMockRequest();
		const error = new ValidationError('参数无效', {
			secretId: 'secret-123',
			backupKey: 'backup_2026-01-01_00-00-00.json',
		});

		const response = errorToResponse(error, request);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('ValidationError');
		expect(body.message).toBe('参数无效');
		expect(body.details).toBeUndefined();
	});

	it('未知异常应返回通用内部错误', async () => {
		const request = createMockRequest();
		const response = errorToResponse(new Error('internal detail'), request);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('InternalServerError');
		expect(body.message).toBe('服务器内部错误');
		expect(body.details).toBeUndefined();
	});
});

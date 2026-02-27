/**
 * 密钥统计处理器
 *
 * 包含功能:
 * - handleGetSecretsStats: 获取密钥统计数据
 */

import { decryptSecrets } from '../../utils/encryption.js';
import { getLogger } from '../../utils/logger.js';
import { validateBase32 } from '../../utils/validation.js';
import { createJsonResponse, createErrorResponse } from '../../utils/response.js';
import { ValidationError, StorageError, CryptoError, errorToResponse, logError } from '../../utils/errors.js';
import { KV_KEYS } from '../../utils/constants.js';

/**
 * 获取密钥统计数据
 *
 * @param {Request} request - HTTP 请求对象
 * @param {Object} env - Cloudflare Workers 环境对象
 * @returns {Response} 统计结果响应
 */
export async function handleGetSecretsStats(request, env) {
	const logger = getLogger(env);

	try {
		const secretsData = await env.SECRETS_KV.get(KV_KEYS.SECRETS, 'text');
		const secrets = await decryptSecrets(secretsData, env);
		const stats = calculateSecretsStats(secrets);

		return createJsonResponse(
			{
				success: true,
				message: '统计数据获取成功',
				data: stats,
				generatedAt: new Date().toISOString(),
			},
			200,
			request,
		);
	} catch (error) {
		// 如果是已知的错误类型，记录并转换
		if (error instanceof ValidationError || error instanceof StorageError || error instanceof CryptoError) {
			logError(error, logger, { operation: 'handleGetSecretsStats' });
			return errorToResponse(error, request);
		}

		// 未知错误
		logger.error(
			'获取密钥统计失败',
			{
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('获取统计失败', `统计密钥数据时发生内部错误：${error.message}`, 500, request);
	}
}

/**
 * 计算密钥统计
 *
 * @param {Array} secrets - 密钥列表
 * @returns {Object} 统计数据
 */
function calculateSecretsStats(secrets) {
	const normalizedSecrets = Array.isArray(secrets) ? secrets : [];

	const typeDistribution = {
		TOTP: 0,
		HOTP: 0,
		UNKNOWN: 0,
	};

	const algorithmDistribution = {
		SHA1: 0,
		SHA256: 0,
		SHA512: 0,
		UNKNOWN: 0,
	};

	const digitsDistribution = {
		6: 0,
		8: 0,
		other: 0,
	};

	const periodDistribution = {
		30: 0,
		60: 0,
		120: 0,
		other: 0,
	};

	let withAccount = 0;
	let withoutAccount = 0;
	let strongSecrets = 0;
	let weakSecrets = 0;
	let invalidSecrets = 0;

	const serviceCountMap = new Map();

	for (const secret of normalizedSecrets) {
		const type = (secret?.type || 'TOTP').toUpperCase();
		if (type === 'TOTP' || type === 'HOTP') {
			typeDistribution[type]++;
		} else {
			typeDistribution.UNKNOWN++;
		}

		const algorithm = (secret?.algorithm || 'SHA1').toUpperCase();
		if (algorithmDistribution[algorithm] !== undefined) {
			algorithmDistribution[algorithm]++;
		} else {
			algorithmDistribution.UNKNOWN++;
		}

		const digits = Number(secret?.digits ?? 6);
		if (digits === 6 || digits === 8) {
			digitsDistribution[String(digits)]++;
		} else {
			digitsDistribution.other++;
		}

		// 仅统计 TOTP 的周期分布
		if (type === 'TOTP') {
			const period = Number(secret?.period ?? 30);
			if (period === 30 || period === 60 || period === 120) {
				periodDistribution[String(period)]++;
			} else {
				periodDistribution.other++;
			}
		}

		if (secret?.account && secret.account.trim()) {
			withAccount++;
		} else {
			withoutAccount++;
		}

		const serviceName = (secret?.name || '未命名服务').trim() || '未命名服务';
		serviceCountMap.set(serviceName, (serviceCountMap.get(serviceName) || 0) + 1);

		const base32Validation = validateBase32(secret?.secret || '');
		if (!base32Validation.valid) {
			invalidSecrets++;
		} else if (base32Validation.warning) {
			weakSecrets++;
		} else {
			strongSecrets++;
		}
	}

	const topServices = Array.from(serviceCountMap.entries())
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => {
			if (b.count !== a.count) {
				return b.count - a.count;
			}
			return a.name.localeCompare(b.name, 'zh-CN');
		})
		.slice(0, 10);

	return {
		overview: {
			totalSecrets: normalizedSecrets.length,
			uniqueServices: serviceCountMap.size,
			withAccount,
			withoutAccount,
		},
		typeDistribution,
		algorithmDistribution,
		digitsDistribution,
		periodDistribution,
		security: {
			strongSecrets,
			weakSecrets,
			invalidSecrets,
		},
		topServices,
	};
}

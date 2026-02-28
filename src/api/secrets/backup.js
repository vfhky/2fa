/**
 * 备份处理器 - 备份创建和获取
 *
 * 包含功能:
 * - handleBackupSecrets: 创建新备份（带 Rate Limiting）
 * - handleGetBackups: 获取备份列表
 * - handleDeleteBackups: 批量删除备份（支持删除全部/按 key 删除）
 * - parseBackupTimeFromKey: 从备份文件名解析时间
 *
 * 注意: 备份使用 encryptData/decryptData（加密整个对象）
 *       与 CRUD 的 encryptSecrets/decryptSecrets（加密数组）不同
 */

import { getAllSecrets } from './shared.js';
import { getLogger } from '../../utils/logger.js';
import { checkRateLimit, getClientIdentifier, createRateLimitResponse, RATE_LIMIT_PRESETS } from '../../utils/rateLimit.js';
import { encryptData, decryptData, ensureEncryptionConfigured } from '../../utils/encryption.js';
import { createJsonResponse, createErrorResponse } from '../../utils/response.js';
import { saveDataHash } from '../../worker.js';
import { buildBackupMetadata, readBackupMetadata } from '../../utils/backupMetadata.js';
import { ValidationError, StorageError, CryptoError, BusinessLogicError, errorToResponse, logError } from '../../utils/errors.js';

const KV_LIST_MAX_LIMIT = 1000;
const DEFAULT_LIST_LIMIT = 50;
const DEFAULT_MAX_DETAIL_ITEMS = 200;
const DEFAULT_DETAIL_CONCURRENCY = 8;
const DEFAULT_MAX_DELETE_KEYS = 200;

function parsePositiveInt(value, fallback, max = KV_LIST_MAX_LIMIT) {
	const parsed = Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, max);
}

function isEnvFlagEnabled(value) {
	return String(value || 'false').toLowerCase() === 'true';
}

async function mapWithConcurrency(items, concurrency, mapper) {
	if (items.length === 0) {
		return [];
	}

	const workerCount = Math.max(1, Math.min(concurrency, items.length));
	const results = new Array(items.length);
	let nextIndex = 0;

	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	});

	await Promise.all(workers);
	return results;
}

function createSummaryEntry(key) {
	const metadataInfo = readBackupMetadata(key.metadata);
	return {
		key: key.name,
		created: metadataInfo?.created || parseBackupTimeFromKey(key.name),
		count: metadataInfo?.count,
		encrypted: metadataInfo?.encrypted,
		size: metadataInfo?.size,
		metadata: key.metadata,
	};
}

function isValidBackupKeyName(value) {
	if (typeof value !== 'string') {
		return false;
	}
	return /^backup_\d{4}-\d{2}-\d{2}(?:_\d{2}-\d{2}-\d{2})?\.json$/.test(value.trim());
}

function parseDeleteLimit(env) {
	return parsePositiveInt(env.BACKUP_DELETE_MAX_KEYS, DEFAULT_MAX_DELETE_KEYS, KV_LIST_MAX_LIMIT);
}

function validateDeletePayload(payload, maxDeleteKeys) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return {
			valid: false,
			message: '请求体必须是 JSON 对象',
		};
	}

	const deleteAll = payload.all === true;
	const hasKeys = Array.isArray(payload.keys);

	if (!deleteAll && !hasKeys) {
		return {
			valid: false,
			message: '请提供删除模式：all=true 或 keys 数组',
		};
	}

	if (deleteAll && hasKeys) {
		return {
			valid: false,
			message: '删除模式冲突：all 和 keys 不能同时提供',
		};
	}

	if (deleteAll) {
		return {
			valid: true,
			mode: 'all',
			keys: [],
		};
	}

	if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
		return {
			valid: false,
			message: 'keys 数组不能为空',
		};
	}

	if (payload.keys.length > maxDeleteKeys) {
		return {
			valid: false,
			message: `单次最多删除 ${maxDeleteKeys} 个备份`,
		};
	}

	const seen = new Set();
	const normalizedKeys = [];

	for (let i = 0; i < payload.keys.length; i++) {
		const rawKey = payload.keys[i];
		if (!isValidBackupKeyName(rawKey)) {
			return {
				valid: false,
				message: `第 ${i + 1} 个备份键格式无效`,
			};
		}

		const key = rawKey.trim();
		if (seen.has(key)) {
			return {
				valid: false,
				message: `检测到重复备份键：${key}`,
			};
		}

		seen.add(key);
		normalizedKeys.push(key);
	}

	return {
		valid: true,
		mode: 'keys',
		keys: normalizedKeys,
	};
}

async function collectAllBackupKeyNames(env) {
	let cursor;
	let hasMore = true;
	const keyNames = [];

	while (hasMore) {
		const listResult = await env.SECRETS_KV.list({
			prefix: 'backup_',
			limit: KV_LIST_MAX_LIMIT,
			...(cursor ? { cursor } : {}),
		});

		const pageNames = listResult.keys.map((item) => item.name).filter((name) => isValidBackupKeyName(name));
		keyNames.push(...pageNames);
		hasMore = !listResult.list_complete;
		cursor = listResult.cursor;
	}

	return keyNames;
}

async function deleteBackupByKeys(keys, env) {
	const deleted = [];
	const failed = [];
	let notFoundCount = 0;

	for (const key of keys) {
		try {
			const existing = await env.SECRETS_KV.get(key, 'text');
			if (!existing) {
				notFoundCount++;
				failed.push({
					key,
					reason: '备份不存在',
				});
				continue;
			}

			await env.SECRETS_KV.delete(key);
			deleted.push(key);
		} catch (error) {
			failed.push({
				key,
				reason: `删除失败: ${error.message}`,
			});
		}
	}

	return {
		deleted,
		failed,
		notFoundCount,
	};
}

async function loadBackupDetail(key, env, logger) {
	const metadataInfo = readBackupMetadata(key.metadata);
	if (metadataInfo) {
		return {
			key: key.name,
			created: metadataInfo.created,
			count: metadataInfo.count,
			encrypted: metadataInfo.encrypted,
			size: metadataInfo.size,
			metadata: key.metadata,
		};
	}

	try {
		const backupContent = await env.SECRETS_KV.get(key.name, 'text');
		const isEncrypted = backupContent?.startsWith('v1:') || false;
		let count = 0;

		if (isEncrypted) {
			try {
				const decryptedData = await decryptData(backupContent, env);
				count = decryptedData?.secrets?.length || decryptedData?.count || 0;
			} catch (error) {
				logger.error(
					'解密备份失败',
					{
						backupKey: key.name,
						errorMessage: error.message,
					},
					error,
				);
				count = -1;
			}
		} else {
			try {
				const backupData = JSON.parse(backupContent || '');
				count = backupData?.secrets?.length || backupData?.count || 0;
			} catch (error) {
				logger.error(
					'解析备份失败',
					{
						backupKey: key.name,
						errorMessage: error.message,
					},
					error,
				);
				count = -1;
			}
		}

		return {
			key: key.name,
			created: parseBackupTimeFromKey(key.name),
			count,
			encrypted: isEncrypted,
			size: backupContent?.length || 0,
			metadata: key.metadata,
		};
	} catch (error) {
		logger.error(
			'获取备份详情失败',
			{
				backupKey: key.name,
				errorMessage: error.message,
			},
			error,
		);
		return {
			key: key.name,
			created: parseBackupTimeFromKey(key.name),
			count: -1,
			encrypted: false,
			size: 0,
			metadata: key.metadata,
		};
	}
}

/**
 * 处理手动备份密钥
 * 🔒 备份数据也会加密存储（使用 encryptData）
 *
 * @param {Request} request - HTTP 请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Response} HTTP响应
 */
export async function handleBackupSecrets(request, env) {
	const logger = getLogger(env);

	try {
		// 🛡️ Rate Limiting: 防止频繁备份滥用
		const clientIP = getClientIdentifier(request, 'ip');
		const rateLimitInfo = await checkRateLimit(clientIP, env, {
			...RATE_LIMIT_PRESETS.sensitive,
			failMode: 'closed',
		});

		if (!rateLimitInfo.allowed) {
			logger.warn('备份操作速率限制超出', {
				clientIP,
				limit: rateLimitInfo.limit,
				resetAt: rateLimitInfo.resetAt,
			});
			return createRateLimitResponse(rateLimitInfo, request);
		}

		logger.info('开始执行手动备份任务', {
			clientIP,
			timestamp: new Date().toISOString(),
		});

		// 获取所有密钥（已解密）
		const secrets = await getAllSecrets(env);
		if (!secrets || secrets.length === 0) {
			throw new BusinessLogicError('没有密钥需要备份', {
				operation: 'backup',
				secretsCount: 0,
			});
		}

		ensureEncryptionConfigured(env);

		// 创建备份数据结构
		const backupData = {
			timestamp: new Date().toISOString(),
			version: '1.0',
			count: secrets.length,
			secrets: secrets,
		};

		// 生成备份文件名（按日期和时间戳）
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0];
		const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
		const backupKey = `backup_${dateStr}_${timeStr}.json`;

		// 🔒 加密备份数据（如果配置了 ENCRYPTION_KEY）
		let backupContent;
		let isEncrypted = false;

		if (env.ENCRYPTION_KEY) {
			backupContent = await encryptData(backupData, env);
			isEncrypted = true;
			logger.info('备份数据已加密', {
				backupKey,
				encrypted: true,
			});
		} else {
			// 向后兼容: 如果没有配置加密密钥，仍然以明文保存
			backupContent = JSON.stringify(backupData, null, 2);
			logger.warn('备份数据以明文保存', {
				backupKey,
				reason: '未配置 ENCRYPTION_KEY',
			});
		}

		const backupMetadata = buildBackupMetadata({
			timestamp: backupData.timestamp,
			count: secrets.length,
			encrypted: isEncrypted,
			size: backupContent.length,
			reason: 'manual',
		});

		// 存储备份到 KV（写入 metadata，供列表页快速读取）
		await env.SECRETS_KV.put(backupKey, backupContent, {
			metadata: backupMetadata,
		});

		logger.info('手动备份完成', {
			backupKey,
			secretCount: secrets.length,
			encrypted: isEncrypted,
		});

		// 更新数据哈希值（手动备份也需要更新哈希值）
		await saveDataHash(env, secrets);

		return createJsonResponse(
			{
				success: true,
				message: `备份完成，共备份 ${secrets.length} 个密钥`,
				backupKey: backupKey,
				count: secrets.length,
				timestamp: backupData.timestamp,
				encrypted: isEncrypted,
			},
			200,
			request,
		);
	} catch (error) {
		// 如果是已知的错误类型，记录并转换
		if (error instanceof BusinessLogicError || error instanceof StorageError || error instanceof CryptoError) {
			logError(error, logger, { operation: 'handleBackupSecrets' });
			return errorToResponse(error, request);
		}

		// 未知错误
		logger.error(
			'手动备份任务执行失败',
			{
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('备份失败', '备份过程中发生内部错误，请稍后重试', 500, request);
	}
}

/**
 * 从备份文件名解析时间
 *
 * @param {string} keyName - 备份文件名，如 backup_2025-09-14_07-52-16.json
 * @returns {string} ISO时间字符串，解析失败时返回 'unknown'
 */
function parseBackupTimeFromKey(keyName) {
	try {
		// 解析 backup_2025-09-14_07-52-16.json 格式
		const match = keyName.match(/backup_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json/);
		if (match) {
			const dateStr = match[1];
			const timeStr = match[2];
			return `${dateStr}T${timeStr.replace(/-/g, ':')}.000Z`;
		}

		// 兼容旧格式 backup_2025-09-14.json
		const oldMatch = keyName.match(/backup_(\d{4}-\d{2}-\d{2})\.json/);
		if (oldMatch) {
			return `${oldMatch[1]}T00:00:00.000Z`;
		}

		return 'unknown';
	} catch {
		// 解析失败时返回默认值（静默处理，避免日志污染）
		return 'unknown';
	}
}

/**
 * 处理获取备份列表
 * 🔒 检测并显示备份的加密状态
 * ⚡ 性能优化：metadata 优先 + 并发受控
 *
 * 查询参数:
 * - limit: 返回的备份数量（默认50，最大1000，或者使用 'all'/'0' 加载所有）
 * - cursor: 分页游标（用于获取下一页，仅在非loadAll模式下有效）
 * - details: 是否获取详细信息（默认true）
 *
 * 环境变量:
 * - ALLOW_ALL_BACKUP_DETAILS: 是否允许 limit=all 且 details=true（默认 false）
 * - BACKUP_DETAILS_MAX_ITEMS: 详情模式最多处理多少条（默认 200）
 * - BACKUP_DETAILS_CONCURRENCY: 详情读取并发度（默认 8）
 *
 * @param {Request} request - HTTP请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Response} HTTP响应
 */
export async function handleGetBackups(request, env) {
	const logger = getLogger(env);

	try {
		const url = new URL(request.url);
		const limitParam = url.searchParams.get('limit') || String(DEFAULT_LIST_LIMIT);
		const cursor = url.searchParams.get('cursor') || undefined;
		let includeDetails = url.searchParams.get('details') !== 'false';
		let loadAll = false;
		let limit;

		if (limitParam.toLowerCase() === 'all' || limitParam === '0') {
			loadAll = true;
			limit = KV_LIST_MAX_LIMIT;
		} else {
			limit = parsePositiveInt(limitParam, DEFAULT_LIST_LIMIT, KV_LIST_MAX_LIMIT);
		}

		const allowAllDetails = isEnvFlagEnabled(env.ALLOW_ALL_BACKUP_DETAILS);
		const maxDetailItems = parsePositiveInt(env.BACKUP_DETAILS_MAX_ITEMS, DEFAULT_MAX_DETAIL_ITEMS, KV_LIST_MAX_LIMIT);
		const detailConcurrency = parsePositiveInt(env.BACKUP_DETAILS_CONCURRENCY, DEFAULT_DETAIL_CONCURRENCY, 32);

		const performanceGuard = {
			triggered: false,
			mode: null,
			reason: null,
		};

		// 性能保护：limit=all 默认不允许 details=true（可通过环境变量显式开启）
		if (loadAll && includeDetails && !allowAllDetails) {
			includeDetails = false;
			performanceGuard.triggered = true;
			performanceGuard.mode = 'all-details-disabled';
			performanceGuard.reason = 'limit=all 场景默认关闭 details，以避免全量解密高开销';
		}

		logger.debug('获取备份列表', {
			limit,
			loadAll,
			cursor,
			includeDetails,
			allowAllDetails,
			maxDetailItems,
			detailConcurrency,
		});

		let allBackupKeys = [];
		let currentCursor = cursor;
		let hasMore = true;

		if (loadAll) {
			// 循环拉取所有分页（仅 key + metadata，避免内容读取）
			while (hasMore) {
				const pageOptions = {
					prefix: 'backup_',
					limit: KV_LIST_MAX_LIMIT,
				};
				if (currentCursor) {
					pageOptions.cursor = currentCursor;
				}

				const pageResult = await env.SECRETS_KV.list(pageOptions);
				allBackupKeys = allBackupKeys.concat(pageResult.keys);
				hasMore = !pageResult.list_complete;
				currentCursor = pageResult.cursor;
			}
		} else {
			const listResult = await env.SECRETS_KV.list({
				prefix: 'backup_',
				limit,
				...(cursor ? { cursor } : {}),
			});
			allBackupKeys = listResult.keys;
			hasMore = !listResult.list_complete;
			currentCursor = listResult.cursor;
		}

		// 备份 key 按字典序可映射时间序，倒序后最新在前
		const backupKeys = [...allBackupKeys].reverse();
		let backups;

		if (!includeDetails) {
			// 简单模式：完全避免读取备份内容
			backups = backupKeys.map((key) => createSummaryEntry(key));
		} else {
			// 详情模式：限制读取条数，避免大规模内容读取/解密
			const detailTargets = backupKeys.slice(0, maxDetailItems);
			const overflowTargets = backupKeys.slice(maxDetailItems);

			if (overflowTargets.length > 0) {
				performanceGuard.triggered = true;
				performanceGuard.mode = 'details-truncated';
				performanceGuard.reason = `详情模式最多处理 ${maxDetailItems} 条，超出部分降级为摘要`;
			}

			const detailedItems = await mapWithConcurrency(detailTargets, detailConcurrency, async (key) => {
				return loadBackupDetail(key, env, logger);
			});

			const overflowItems = overflowTargets.map((key) => ({
				...createSummaryEntry(key),
				detailSkipped: true,
			}));

			backups = [...detailedItems, ...overflowItems];
		}

		const response = {
			success: true,
			backups,
			count: backups.length,
			pagination: {
				limit: loadAll ? backups.length : limit,
				hasMore: loadAll ? false : hasMore,
				cursor: loadAll ? null : currentCursor || null,
				loadedAll: loadAll,
			},
			performanceGuard,
		};

		logger.info('备份列表获取成功', {
			count: backups.length,
			includeDetails,
			loadAll,
			hasMore: loadAll ? false : hasMore,
			guardTriggered: performanceGuard.triggered,
			guardMode: performanceGuard.mode,
		});

		return createJsonResponse(response, 200, request);
	} catch (error) {
		// 如果是已知的错误类型，记录并转换
		if (error instanceof StorageError || error instanceof CryptoError || error instanceof ValidationError) {
			logError(error, logger, { operation: 'handleGetBackups' });
			return errorToResponse(error, request);
		}

		// 未知错误
		logger.error(
			'获取备份列表失败',
			{
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('获取备份列表失败', '获取备份列表时发生内部错误，请稍后重试', 500, request);
	}
}

/**
 * 处理删除备份
 *
 * 请求体模式:
 * - { "all": true }                      删除所有备份
 * - { "keys": ["backup_xxx.json", ...] } 删除指定备份
 *
 * 环境变量:
 * - BACKUP_DELETE_MAX_KEYS: 单次 keys 删除上限（默认 200，最大 1000）
 *
 * @param {Request} request - HTTP请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Response} HTTP响应
 */
export async function handleDeleteBackups(request, env) {
	const logger = getLogger(env);

	try {
		const clientIP = getClientIdentifier(request, 'ip');
		const rateLimitInfo = await checkRateLimit(clientIP, env, {
			...RATE_LIMIT_PRESETS.sensitive,
			failMode: 'closed',
		});

		if (!rateLimitInfo.allowed) {
			logger.warn('备份删除速率限制超出', {
				clientIP,
				limit: rateLimitInfo.limit,
				resetAt: rateLimitInfo.resetAt,
			});
			return createRateLimitResponse(rateLimitInfo, request);
		}

		let payload;
		try {
			payload = await request.json();
		} catch {
			return createErrorResponse('请求格式错误', '请求体必须是合法 JSON', 400, request);
		}

		const maxDeleteKeys = parseDeleteLimit(env);
		const validationResult = validateDeletePayload(payload, maxDeleteKeys);
		if (!validationResult.valid) {
			return createErrorResponse('删除请求无效', validationResult.message, 400, request);
		}

		const { mode } = validationResult;
		const requestedKeys = mode === 'all' ? await collectAllBackupKeyNames(env) : validationResult.keys;

		if (requestedKeys.length === 0) {
			return createJsonResponse(
				{
					success: true,
					message: '没有可删除的备份',
					mode,
					requestedCount: 0,
					deletedCount: 0,
					notFoundCount: 0,
					failedCount: 0,
					deletedKeys: [],
					failed: [],
				},
				200,
				request,
			);
		}

		const deleteResult = await deleteBackupByKeys(requestedKeys, env);
		const deletedCount = deleteResult.deleted.length;
		const failedCount = deleteResult.failed.length;

		logger.info('备份删除操作完成', {
			mode,
			requestedCount: requestedKeys.length,
			deletedCount,
			notFoundCount: deleteResult.notFoundCount,
			failedCount,
		});

		const success = failedCount === 0;
		const status = success ? 200 : 207;

		return createJsonResponse(
			{
				success,
				mode,
				requestedCount: requestedKeys.length,
				deletedCount,
				notFoundCount: deleteResult.notFoundCount,
				failedCount,
				deletedKeys: deleteResult.deleted,
				failed: deleteResult.failed,
				message: success ? `删除完成，共删除 ${deletedCount} 个备份` : `部分删除成功：删除 ${deletedCount} 个，失败 ${failedCount} 个`,
			},
			status,
			request,
		);
	} catch (error) {
		if (error instanceof StorageError || error instanceof ValidationError) {
			logError(error, logger, { operation: 'handleDeleteBackups' });
			return errorToResponse(error, request);
		}

		logger.error(
			'删除备份失败',
			{
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('删除备份失败', '删除备份时发生内部错误，请稍后重试', 500, request);
	}
}

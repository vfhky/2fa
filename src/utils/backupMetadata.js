/**
 * 备份元数据工具
 * 用于在 KV metadata 中保存列表页所需的轻量信息，避免全量读取/解密备份内容。
 */

/**
 * 构建备份 metadata
 * @param {Object} params
 * @param {string} params.timestamp - 备份时间（ISO）
 * @param {number} params.count - 密钥数量
 * @param {boolean} params.encrypted - 是否加密
 * @param {number} params.size - 备份内容大小（字节）
 * @param {string} [params.reason] - 备份原因
 * @returns {Object}
 */
export function buildBackupMetadata({ timestamp, count, encrypted, size, reason = 'manual' }) {
	return {
		version: 1,
		created: timestamp || new Date().toISOString(),
		count: Number.isFinite(count) ? count : 0,
		encrypted: Boolean(encrypted),
		size: Number.isFinite(size) ? size : 0,
		reason,
	};
}

/**
 * 解析备份 metadata
 * @param {Object|null|undefined} metadata
 * @returns {{created: string, count: number, encrypted: boolean, size: number}|null}
 */
export function readBackupMetadata(metadata) {
	if (!metadata || typeof metadata !== 'object') {
		return null;
	}

	if (typeof metadata.created !== 'string') {
		return null;
	}

	return {
		created: metadata.created,
		count: Number.isFinite(metadata.count) ? metadata.count : 0,
		encrypted: Boolean(metadata.encrypted),
		size: Number.isFinite(metadata.size) ? metadata.size : 0,
	};
}

/**
 * OTP 生成处理器
 *
 * 包含功能:
 * - handleGenerateOTP: 生成 OTP（公开 API，支持高级参数）
 *
 * 特点:
 * - 公开访问（无需认证）
 * - 默认同源访问（不开放任意跨域）
 * - 支持 HTML 和 JSON 两种响应格式
 * - 支持高级 OTP 参数（type, digits, period, algorithm, counter）
 */

import { createJsonResponse, createErrorResponse } from '../../utils/response.js';
import { getLogger } from '../../utils/logger.js';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RATE_LIMIT_PRESETS } from '../../utils/rateLimit.js';

const DEFAULT_OTP_API_MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_OTP_SECRET_MAX_LENGTH = 256;

function parsePositiveInt(value, fallback, max = 1024 * 1024) {
	const parsed = parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, max);
}

/**
 * 处理生成OTP（支持高级参数）
 *
 * 公开 API，无需认证，允许跨域访问
 *
 * 支持的查询参数:
 * - type: TOTP|HOTP (默认 TOTP)
 * - digits: 6|8 (默认 6)
 * - period: 30|60|120 (默认 30，仅 TOTP)
 * - algorithm: SHA1|SHA256|SHA512 (默认 SHA1)
 * - counter: 非负整数 (默认 0，仅 HOTP)
 * - format: html|json (默认 html)
 *
 * @param {string} secret - Base32密钥
 * @param {Request} request - HTTP请求对象（可选，用于获取参数）
 * @returns {Response} HTTP响应
 */
export async function handleGenerateOTP(secret, request = null, optionOverrides = null) {
	// 动态导入（减少初始加载）
	const { validateBase32, validateOTPParams } = await import('../../utils/validation.js');
	const { generateOTP } = await import('../../otp/generator.js');
	const { createQuickOtpPage, calculateRemainingTime } = await import('../../ui/quickOtp.js');

	if (!secret) {
		// 如果没有密钥，返回使用说明
		const origin = request ? new URL(request.url).origin : '';
		return new Response(
			`Missing secret parameter!\n\n安全模式（推荐）:\nPOST ${origin}/api/otp/generate\nBody: {"secret":"YOUR_SECRET_KEY","type":"TOTP","digits":6,"period":30,"algorithm":"SHA1"}\n\n兼容模式（默认禁用）:\n${origin}/otp/YOUR_SECRET_KEY?format=json`,
			{
				status: 400,
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-store', // 不缓存错误响应
				},
			},
		);
	}

	const validation = validateBase32(secret);
	if (!validation.valid) {
		return createErrorResponse(
			'密钥格式错误',
			`密钥"${secret}"不是有效的Base32格式。Base32密钥应只包含字母A-Z和数字2-7，且长度至少8位`,
			400,
			request,
		);
	}

	try {
		// 从请求参数中获取高级设置
		let digits = 6;
		let period = 30;
		let algorithm = 'SHA1';
		let type = 'TOTP';
		let counter = 0;
		let format = 'html'; // 默认HTML格式

		if (request) {
			const url = new URL(request.url);
			type = url.searchParams.get('type') || 'TOTP';
			digits = parseInt(url.searchParams.get('digits')) || 6;
			period = parseInt(url.searchParams.get('period')) || 30;
			algorithm = url.searchParams.get('algorithm') || 'SHA1';
			counter = parseInt(url.searchParams.get('counter')) || 0;
			format = url.searchParams.get('format') || 'html'; // 支持 ?format=json

			// 验证OTP参数
		}

		// 请求体参数优先级高于 URL 查询参数
		if (optionOverrides && typeof optionOverrides === 'object') {
			if (optionOverrides.type !== undefined) {
				type = String(optionOverrides.type || 'TOTP');
			}
			if (optionOverrides.digits !== undefined) {
				digits = parseInt(optionOverrides.digits, 10);
			}
			if (optionOverrides.period !== undefined) {
				period = parseInt(optionOverrides.period, 10);
			}
			if (optionOverrides.algorithm !== undefined) {
				algorithm = String(optionOverrides.algorithm || 'SHA1');
			}
			if (optionOverrides.counter !== undefined) {
				counter = parseInt(optionOverrides.counter, 10);
			}
			if (optionOverrides.format !== undefined) {
				format = String(optionOverrides.format || 'json');
			}
		}

		// 验证OTP参数
		const otpValidation = validateOTPParams({ type, digits, period, algorithm, counter });
		if (!otpValidation.valid) {
			return createErrorResponse('OTP参数验证失败', otpValidation.errors.join('; '), 400, request);
		}

		const loadTime = Math.floor(Date.now() / 1000);
		const otp = await generateOTP(secret, loadTime, { type, digits, period, algorithm, counter });

		// 如果请求JSON格式，返回JSON
		if (format === 'json') {
			return createJsonResponse({ token: otp }, 200, request);
		}

		// 默认返回漂亮的HTML页面
		const remainingTime = type === 'TOTP' ? calculateRemainingTime(period) : 0;
		return createQuickOtpPage(
			otp,
			{
				period,
				remainingTime,
				type,
			},
			request,
		);
	} catch (error) {
		const logger = getLogger(null);
		logger.error(
			'OTP生成失败',
			{
				secretLength: secret ? secret.length : 0,
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('OTP生成失败', '生成验证码时发生内部错误，请稍后重试', 500, request);
	}
}

/**
 * 安全模式：通过 POST Body 传入 secret，避免 URL 泄漏
 * @param {Request} request - HTTP 请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Response} JSON 响应
 */
export async function handleGenerateOTPFromBody(request, env = null) {
	const logger = getLogger(env);
	const maxBodyBytes = parsePositiveInt(env?.OTP_API_MAX_BODY_BYTES, DEFAULT_OTP_API_MAX_BODY_BYTES);
	const maxSecretLength = parsePositiveInt(env?.OTP_SECRET_MAX_LENGTH, DEFAULT_OTP_SECRET_MAX_LENGTH, 4096);

	const clientIP = getClientIdentifier(request, 'ip');
	const rateLimitInfo = await checkRateLimit(`otp-public:${clientIP}`, env, {
		...RATE_LIMIT_PRESETS.otpPublic,
		failMode: env?.SECRETS_KV ? 'closed' : 'open',
	});
	if (!rateLimitInfo.allowed) {
		logger.warn('公开 OTP 接口触发限流', {
			clientIP,
			limit: rateLimitInfo.limit,
			resetAt: rateLimitInfo.resetAt,
		});
		return createRateLimitResponse(rateLimitInfo, request);
	}

	const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
	if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
		return createErrorResponse('请求体过大', `请求体超过大小限制（最大 ${maxBodyBytes} 字节）`, 413, request);
	}

	let rawBody = '';
	try {
		rawBody = await request.text();
	} catch {
		return createErrorResponse('请求读取失败', '无法读取请求体，请稍后重试', 400, request);
	}

	const actualBytes = new TextEncoder().encode(rawBody).length;
	if (actualBytes > maxBodyBytes) {
		return createErrorResponse('请求体过大', `请求体超过大小限制（最大 ${maxBodyBytes} 字节）`, 413, request);
	}

	let body;
	try {
		body = JSON.parse(rawBody);
	} catch {
		return createErrorResponse('请求格式错误', '请求体必须是有效的 JSON', 400, request);
	}

	const secret = typeof body?.secret === 'string' ? body.secret.trim() : '';
	if (!secret) {
		return createErrorResponse('缺少密钥', '请在请求体中提供 secret 字段', 400, request);
	}
	if (secret.length > maxSecretLength) {
		return createErrorResponse('密钥长度超限', `secret 长度不能超过 ${maxSecretLength} 个字符`, 400, request);
	}

	return handleGenerateOTP(secret, request, {
		type: body.type,
		digits: body.digits,
		period: body.period,
		algorithm: body.algorithm,
		counter: body.counter,
		format: 'json',
	});
}

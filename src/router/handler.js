/**
 * 路由处理器模块
 * 负责解析请求并分发到对应的处理函数
 */

// API 处理器
import {
	handleGetSecrets,
	handleAddSecret,
	handleUpdateSecret,
	handleDeleteSecret,
	handleGenerateOTP,
	handleGenerateOTPFromBody,
	handleBatchAddSecrets,
	handleBatchDeleteSecrets,
	handleGetSecretsStats,
	handleBackupSecrets,
	handleGetBackups,
	handleDeleteBackups,
	handleRestoreBackup,
	handleExportBackup,
} from '../api/secrets/index.js';
import { handleFaviconProxy } from '../api/favicon.js';

// UI 页面生成器
import { createMainPage } from '../ui/page.js';
import { createSetupPage } from '../ui/setupPage.js';
import { createManifest, createDefaultIcon } from '../ui/manifest.js';
import { createServiceWorker } from '../ui/serviceworker.js';
import { getModuleCode } from '../ui/scripts/index.js';

// 工具函数
import { createErrorResponse } from '../utils/response.js';
import {
	verifyAuthWithDetails,
	requiresAuth,
	createUnauthorizedResponse,
	handleLogin,
	handleRefreshToken,
	handleLogout,
	checkIfSetupRequired,
	handleFirstTimeSetup,
	getAuthSessionPolicy,
} from '../utils/auth.js';
import { createPreflightResponse } from '../utils/security.js';
import { getLogger } from '../utils/logger.js';

/**
 * 处理HTTP请求的主要函数
 * @param {Request} request - HTTP请求对象
 * @param {Object} env - 环境变量对象，包含KV存储
 * @returns {Response} HTTP响应
 */
export async function handleRequest(request, env) {
	const url = new URL(request.url);
	const method = request.method;
	const pathname = url.pathname;
	const logger = getLogger(env);

	try {
		// 🔧 首次设置路由（不需要认证）
		if (pathname === '/setup') {
			// 检查是否需要首次设置
			const setupRequired = await checkIfSetupRequired(env);
			if (!setupRequired) {
				// 已完成设置，重定向到首页
				return Response.redirect(new URL('/', request.url).toString(), 302);
			}
			return await createSetupPage(request);
		}

		// 🔧 首次设置 API（不需要认证）
		if (pathname === '/api/setup' && method === 'POST') {
			return await handleFirstTimeSetup(request, env);
		}

		// 检查是否需要首次设置
		const setupRequired = await checkIfSetupRequired(env);
		if (setupRequired && pathname === '/') {
			// 需要首次设置，重定向到设置页面
			return Response.redirect(new URL('/setup', request.url).toString(), 302);
		}

		// 🔐 检查是否需要身份验证（使用详细验证以支持自动续期）
		let authDetails = null;
		if (requiresAuth(pathname, env)) {
			authDetails = await verifyAuthWithDetails(request, env);

			if (!authDetails || !authDetails.valid) {
				// 检查是否未配置 KV 存储
				if (!env.SECRETS_KV) {
					return createErrorResponse('服务未配置', '服务器未配置 KV 存储。请联系管理员配置 SECRETS_KV。', 503, request);
				}

				// 检查是否未设置密码
				const storedPasswordHash = await env.SECRETS_KV.get('user_password');
				if (!storedPasswordHash) {
					return createErrorResponse('未设置密码', '请访问 /setup 进行首次设置。', 503, request);
				}

				return createUnauthorizedResponse(null, request);
			}

			// 📊 记录认证详情（用于自动续期）
			request.authDetails = authDetails;
		}

		// 静态路由处理
		if (pathname === '/' || pathname === '') {
			const sessionPolicy = getAuthSessionPolicy(env);
			return await createMainPage(request, {
				authIdleTimeoutMinutes: sessionPolicy.idleTimeoutMinutes,
			});
		}

		// PWA Manifest
		if (pathname === '/manifest.json') {
			return createManifest(request);
		}

		// Service Worker
		if (pathname === '/sw.js') {
			return createServiceWorker(env);
		}

		// PWA 图标（使用默认SVG图标）
		if (pathname === '/icon-192.png' || pathname === '/icon-512.png') {
			const size = pathname.includes('512') ? 512 : 192;
			return createDefaultIcon(size);
		}

		// 懒加载模块路由（需要认证）
		if (pathname.startsWith('/modules/')) {
			const moduleName = pathname.substring(9).replace('.js', ''); // 去掉 '/modules/' 和 '.js'
			const allowedModules = ['import', 'export', 'backup', 'qrcode', 'tools', 'googleMigration'];

			if (!allowedModules.includes(moduleName)) {
				return createErrorResponse('模块未找到', `不存在的模块: ${moduleName}`, 404, request);
			}

			try {
				const moduleCode = getModuleCode(moduleName);
				return new Response(moduleCode, {
					headers: {
						'Content-Type': 'application/javascript; charset=utf-8',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
					},
				});
			} catch (error) {
				logger.error(`加载模块 ${moduleName} 失败`, { errorMessage: error.message }, error);
				return createErrorResponse('模块加载失败', '模块加载失败，请稍后重试', 500, request);
			}
		}

		// 登录路由
		if (pathname === '/api/login' && method === 'POST') {
			return await handleLogin(request, env);
		}

		// Token 刷新路由
		if (pathname === '/api/refresh-token' && method === 'POST') {
			return await handleRefreshToken(request, env);
		}

		// 登出路由（受保护）
		if (pathname === '/api/logout' && method === 'POST') {
			return await handleLogout(request, env);
		}

		// API路由处理
		if (pathname.startsWith('/api/')) {
			const response = await handleApiRequest(pathname, method, request, env);

			// 🔄 自动续期：如果 Token 进入续期阈值，在响应头中添加标记
			if (request.authDetails && request.authDetails.needsRefresh) {
				const newResponse = new Response(response.body, response);
				const remainingMinutes = Number.isFinite(request.authDetails.remainingMinutes)
					? request.authDetails.remainingMinutes.toFixed(2)
					: null;
				const remainingDays = Number.isFinite(request.authDetails.remainingDays) ? request.authDetails.remainingDays.toFixed(2) : null;

				newResponse.headers.set('X-Token-Refresh-Needed', 'true');
				if (remainingMinutes !== null) {
					newResponse.headers.set('X-Token-Remaining-Minutes', remainingMinutes);
				}
				// 向后兼容：保留旧字段，后续版本可移除
				if (remainingDays !== null) {
					newResponse.headers.set('X-Token-Remaining-Days', remainingDays);
				}

				logger.info('Token 即将过期，建议客户端刷新', {
					remainingMinutes,
				});

				return newResponse;
			}

			return response;
		}

		// OTP生成路由（支持高级参数）
		// 处理 /otp（显示使用说明）
		if (pathname === '/otp') {
			return await handleGenerateOTP('', request);
		}

		// 处理 /otp/{secret}（生成OTP）
		if (pathname.startsWith('/otp/')) {
			const allowLegacyOtpPath = String(env.ALLOW_LEGACY_OTP_PATH || 'false').toLowerCase() === 'true';
			if (!allowLegacyOtpPath) {
				return createErrorResponse(
					'路径已禁用',
					'为保护密钥安全，/otp/{secret} 已默认禁用。请改用 POST /api/otp/generate，并在请求体中传递 secret。',
					410,
					request,
				);
			}

			const secret = pathname.substring(5); // 去掉 '/otp/'
			return await handleGenerateOTP(secret, request);
		}

		// 404处理
		return createErrorResponse('页面未找到', '请求的页面不存在', 404, request);
	} catch (error) {
		logger.error(
			'请求处理失败',
			{
				method,
				pathname,
				errorMessage: error.message,
			},
			error,
		);
		return createErrorResponse('服务器错误', '请求处理失败，请稍后重试', 500, request);
	}
}

/**
 * 处理API请求
 * @param {string} pathname - 请求路径
 * @param {string} method - HTTP方法
 * @param {Request} request - HTTP请求对象
 * @param {Object} env - 环境变量对象
 * @returns {Response} HTTP响应
 */
async function handleApiRequest(pathname, method, request, env) {
	// 密钥管理API
	if (pathname === '/api/otp/generate') {
		if (method === 'POST') {
			return handleGenerateOTPFromBody(request, env);
		}
		return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
	}

	// 密钥管理API
	if (pathname === '/api/secrets') {
		switch (method) {
			case 'GET':
				return handleGetSecrets(request, env);
			case 'POST':
				return handleAddSecret(request, env);
			default:
				return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
		}
	}

	// 批量导入API（必须在 /api/secrets/{id} 之前匹配）
	if (pathname === '/api/secrets/batch') {
		switch (method) {
			case 'POST':
				return handleBatchAddSecrets(request, env);
			case 'DELETE':
				return handleBatchDeleteSecrets(request, env);
			default:
				return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
		}
	}

	// 统计API（必须在 /api/secrets/{id} 之前匹配）
	if (pathname === '/api/secrets/stats') {
		if (method === 'GET') {
			return handleGetSecretsStats(request, env);
		}
		return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
	}

	// 单个密钥操作API
	if (pathname.startsWith('/api/secrets/')) {
		const secretId = pathname.substring('/api/secrets/'.length);
		if (!secretId) {
			return createErrorResponse('无效路径', '缺少密钥ID', 400, request);
		}

		switch (method) {
			case 'PUT':
				return handleUpdateSecret(request, env);
			case 'DELETE':
				return handleDeleteSecret(request, env);
			default:
				return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
		}
	}

	// 备份管理API
	if (pathname === '/api/backup') {
		switch (method) {
			case 'POST':
				return handleBackupSecrets(request, env);
			case 'GET':
				return handleGetBackups(request, env);
			case 'DELETE':
				return handleDeleteBackups(request, env);
			default:
				return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
		}
	}

	// 恢复备份API
	if (pathname === '/api/backup/restore') {
		if (method === 'POST') {
			return handleRestoreBackup(request, env);
		}
		return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
	}

	// 导出备份API
	if (pathname.startsWith('/api/backup/export/')) {
		if (method === 'GET') {
			const backupKey = pathname.replace('/api/backup/export/', '');
			return handleExportBackup(request, env, backupKey);
		}
		return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
	}

	// Favicon 代理 API（不需要认证，公开访问）
	if (pathname.startsWith('/api/favicon/')) {
		if (method === 'GET') {
			const domain = pathname.replace('/api/favicon/', '');
			return handleFaviconProxy(request, env, domain);
		}
		return createErrorResponse('方法不允许', `不支持的HTTP方法: ${method}`, 405, request);
	}

	// 未知API路径
	return createErrorResponse('API未找到', '请求的API端点不存在', 404, request);
}

/**
 * 处理CORS预检请求
 * @param {Request} request - HTTP请求对象
 * @returns {Response|null} CORS响应或 null
 */
export function handleCORS(request) {
	return createPreflightResponse(request);
}

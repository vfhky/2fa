/**
 * 全局状态模块
 * 全局变量定义
 */

/**
 * 获取 State 相关代码
 * @returns {string} State JavaScript 代码
 */
export function getStateCode() {
	return `    let secrets = [];
    let scanStream = null;
    let scannerCanvas = null;
    let scannerContext = null;
    let isScanning = false;
    let editingId = null;
    let otpIntervals = {};
    let currentOTPAuthURL = '';
    let debugMode = false;
    let currentSearchQuery = '';
    let filteredSecrets = [];
    let secretsGroupedList = []; // 首页按服务分组后的列表
    let secretsCurrentPage = 1; // 首页当前页（按服务分组分页）
    let secretsPageSize = 6; // 首页每页分组数
    let saveQueue = Promise.resolve(); // 保存操作队列，确保串行执行避免并发覆盖
    let batchDeleteSelection = new Set(); // 批量删除选中ID集合
    let batchDeleteFilteredSecrets = []; // 批量删除过滤后的列表
    let batchDeleteGroupedSecrets = []; // 批量删除按服务分组后的列表
    let batchDeleteCurrentPage = 1; // 批量删除当前页
    let batchDeletePageSize = 6; // 批量删除每页分组数
    let statsCache = null; // 统计数据缓存
    // authToken 已移除 - 现在使用 HttpOnly Cookie

`;
}

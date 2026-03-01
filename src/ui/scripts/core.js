/**
 * Core 核心业务逻辑模块
 * 包含密钥管理、OTP生成、二维码、备份等所有核心功能
 */

import { SERVICE_LOGOS } from '../config/serviceLogos.js';

/**
 * 获取 Core 相关代码
 * @returns {string} Core JavaScript 代码
 */
export function getCoreCode() {
	// 将 SERVICE_LOGOS 配置序列化为客户端代码
	const serviceLogosJSON = JSON.stringify(SERVICE_LOGOS, null, 2);

	return `    // ========== Service Logos 配置 ==========
    // 服务名称到域名的映射数据（从 serviceLogos.js 导入）
    const SERVICE_LOGOS = ${serviceLogosJSON};

    // ========== Service Logo 处理逻辑（唯一实现） ==========
    // 注意：逻辑只在客户端实现，服务器端的 serviceLogos.js 只是纯数据配置

    /**
     * 将服务名拆分为单词数组（处理空格、连字符、点号等分隔符）
     * @param {string} text - 文本
     * @returns {string[]} 单词数组
     */
    function splitWords(text) {
      // 将连字符放在字符类最后，避免被解析为范围运算符
      return text.toLowerCase().trim().split(/[\\\\s._-]+/).filter(Boolean);
    }

    /**
     * 检查 keyWords 是否是 serviceWords 的连续子序列
     * 例如：['google', 'drive'] 匹配 ['google', 'drive', 'backup']
     * @param {string[]} serviceWords - 服务名单词数组
     * @param {string[]} keyWords - 键名单词数组
     * @returns {boolean} 是否匹配
     */
    function isWordSequenceMatch(serviceWords, keyWords) {
      if (keyWords.length > serviceWords.length) return false;

      for (let i = 0; i <= serviceWords.length - keyWords.length; i++) {
        let match = true;
        for (let j = 0; j < keyWords.length; j++) {
          if (serviceWords[i + j] !== keyWords[j]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
      return false;
    }

    /**
     * 根据服务名称获取对应的 logo URL
     * @param {string} serviceName - 服务名称
     * @returns {string|null} Logo URL 或 null
     */
    function getServiceLogo(serviceName) {
      if (!serviceName) return null;

      const normalizedName = serviceName.toLowerCase().trim();

      // 1. 精确匹配（最快）
      if (SERVICE_LOGOS[normalizedName]) {
        return \`/api/favicon/\${SERVICE_LOGOS[normalizedName]}\`;
      }

      // 2. 单词序列匹配（处理 "Google Drive Backup" 匹配 "google drive" 等场景）
      const serviceWords = splitWords(serviceName);

      for (const [key, domain] of Object.entries(SERVICE_LOGOS)) {
        const keyWords = splitWords(key);

        // 检查 key 的单词是否作为连续子序列出现在服务名中
        if (isWordSequenceMatch(serviceWords, keyWords)) {
          return \`/api/favicon/\${domain}\`;
        }
      }

      // 3. 未找到匹配，返回 null（将显示首字母图标）
      return null;
    }

    // ========== 原有函数 ==========

    // 客户端验证Base32密钥格式
    function validateBase32(secret) {
      const base32Regex = /^[A-Z2-7]+=*$/;
      return base32Regex.test(secret.toUpperCase()) && secret.length >= 8;
    }

    // 页面加载时获取密钥列表
	    document.addEventListener('DOMContentLoaded', function() {
	        // 安全加固：移除历史版本遗留的明文密钥缓存
	        try {
	          localStorage.removeItem('2fa-secrets-cache');
	        } catch (e) {
	          console.warn('清理历史密钥缓存失败:', e);
	        }

	        // 先检查认证状态
	        if (checkAuth()) {
	          loadSecrets();
	          // Cookie 过期由浏览器自动管理，无需定时检查
        }
        initTheme();
        
        // 恢复用户的排序选择
        restoreSortPreference();

        // 页面加载后立即刷新所有OTP，确保时间同步
        setTimeout(() => {
          if (secrets && secrets.length > 0) {
            secrets.forEach(secret => {
              updateOTP(secret.id);
            });
          }
        }, 500);
      });

	    // 加载密钥列表
	    async function loadSecrets() {
	      try {
	        const response = await authenticatedFetch('/api/secrets');

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          let errorMessage = response.statusText || ('HTTP ' + response.status);
          try {
            const errorData = await response.clone().json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (_) {
            try {
              const errorText = await response.text();
              if (errorText && errorText.trim()) {
                errorMessage = errorText.slice(0, 200);
              }
            } catch (_) {
              // 忽略二次解析错误，保留默认错误信息
            }
          }
          throw new Error('加载失败: ' + errorMessage);
        }

	        secrets = await response.json();
	        statsCache = null; // 数据变更后清空统计缓存

	        await renderSecrets();
	      } catch (error) {
	        console.error('加载密钥失败:', error);
	        showCenterToast('⚠️', (error && error.message) ? error.message : '加载失败，请检查网络后重试');

	        // 网络失败时显示空状态
	        document.getElementById('loading').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
      }
    }

    // 渲染密钥列表
    async function renderSecrets() {
      filteredSecrets = [...secrets];
      const searchInput = document.getElementById('searchInput');
      if (searchInput && searchInput.value.trim()) {
        await filterSecrets(searchInput.value, false);
      } else {
        await renderFilteredSecrets();
      }

      // 如果批量删除弹窗正在显示，同步更新可选列表
      if (document.getElementById('batchDeleteModal')?.classList.contains('show')) {
        const keyword = document.getElementById('batchDeleteSearchInput')?.value || '';
        filterBatchDeleteList(keyword);
      }
    }

    // 获取服务商颜色
    function getServiceColor(serviceName) {
      const colors = [
        '#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8',
        '#6f42c1', '#e83e8c', '#fd7e14', '#20c997', '#6c757d',
        '#343a40', '#007bff', '#28a745', '#dc3545', '#ffc107'
      ];
      
      let hash = 0;
      for (let i = 0; i < serviceName.length; i++) {
        hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      return colors[Math.abs(hash) % colors.length];
    }

    function getServiceInitial(serviceName) {
      const normalizedName = typeof serviceName === 'string' ? serviceName.trim() : '';
      return (normalizedName.charAt(0) || '#').toUpperCase();
    }

    function buildServiceIconMarkup(serviceName, logoUrl, iconClassName = 'group-service-icon') {
      const safeServiceName = escapeHTML(serviceName || '未命名服务');
      const initial = escapeHTML(getServiceInitial(serviceName));

      if (logoUrl) {
        return (
          '<span class="' +
          iconClassName +
          ' has-logo' +
          '">' +
          '<img src="' +
          logoUrl +
          '" alt="' +
          safeServiceName +
          '" onerror="this.style.display=&quot;none&quot;; this.parentElement.classList.remove(&quot;has-logo&quot;); this.nextElementSibling.style.display=&quot;flex&quot;;">' +
          '<span style="display: none;">' +
          initial +
          '</span>' +
          '</span>'
        );
      }

      return '<span class="' + iconClassName + '"><span>' + initial + '</span></span>';
    }

    // 创建密钥卡片
    function createSecretCard(secret) {
      const isHOTP = secret.type && secret.type.toUpperCase() === 'HOTP';
      const accountName = (secret.account || '').trim();
      const accountDisplay = accountName || '未设置账户';
      const counterText = Number.isInteger(Number(secret.counter)) ? Number(secret.counter) : 0;

      return '<div class="secret-card" onclick="copyOTPFromCard(event, &quot;' + secret.id + '&quot;)" title="点击卡片复制验证码">' +
        // TOTP 显示进度条，HOTP 不显示
        (isHOTP ? '' :
          '<div class="progress-top">' +
            '<div class="progress-top-fill" id="progress-' + secret.id + '"></div>' +
          '</div>'
        ) +
        '<div class="card-header">' +
          '<div class="secret-info">' +
            '<div class="secret-text">' +
            '<h3 class="secret-account' +
            (accountName ? '' : ' secret-account-placeholder') +
            '">' +
            escapeHTML(accountDisplay) +
            (isHOTP ? ' <span class="secret-type-tag">HOTP</span>' : '') +
            '</h3>' +
            (isHOTP ? '<p class="secret-counter">计数器: ' + escapeHTML(String(counterText)) + '</p>' : '') +
            '</div>' +
          '</div>' +
          '<div class="card-menu" onclick="event.stopPropagation(); toggleCardMenu(&quot;' + secret.id + '&quot;)">' +
            '<div class="menu-dots">⋮</div>' +
            '<div class="card-menu-dropdown" id="menu-' + secret.id + '">' +
              '<div class="menu-item" onclick="event.stopPropagation(); showQRCode(&quot;' + secret.id + '&quot;); closeAllCardMenus();">二维码</div>' +
              '<div class="menu-item" onclick="event.stopPropagation(); copyOTPAuthURL(&quot;' + secret.id + '&quot;); closeAllCardMenus();">复制链接</div>' +
              '<div class="menu-item" onclick="event.stopPropagation(); editSecret(&quot;' + secret.id + '&quot;); closeAllCardMenus();">编辑</div>' +
              '<div class="menu-item menu-item-danger" onclick="event.stopPropagation(); deleteSecret(&quot;' + secret.id + '&quot;); closeAllCardMenus();">删除</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="otp-preview">' +
          '<div class="otp-main">' +
            '<div class="otp-code-container">' +
              '<div class="otp-code" id="otp-' + secret.id + '" onclick="event.stopPropagation(); copyOTP(&quot;' + secret.id + '&quot;)" title="点击复制验证码">------</div>' +
            '</div>' +
            // HOTP 不显示"下一个"验证码（因为不是时间基准）
            (isHOTP ? '' :
              '<div class="otp-next-container" onclick="event.stopPropagation(); copyNextOTP(&quot;' + secret.id + '&quot;)" title="点击复制下一个验证码">' +
                '<div class="otp-next-label">下一个</div>' +
                '<div class="otp-next-code" id="next-otp-' + secret.id + '">------</div>' +
              '</div>'
            ) +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function getSecretsServiceName(secret) {
      const serviceName = (secret && secret.name) ? secret.name.trim() : '';
      return serviceName || '未命名服务';
    }

    function buildSecretsGroups(secretList) {
      const list = Array.isArray(secretList) ? secretList : [];
      const groupMap = new Map();

      list.forEach((secret, index) => {
        const serviceName = getSecretsServiceName(secret);
        const groupKey = serviceName.toLowerCase();

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            key: groupKey,
            name: serviceName,
            logoUrl: getServiceLogo(serviceName),
            items: [],
            firstIndex: index,
            lastIndex: index,
          });
        }

        const group = groupMap.get(groupKey);
        group.items.push(secret);
        group.lastIndex = index;
      });

      const groups = Array.from(groupMap.values());

      groups.forEach((group) => {
        if (currentSortType === 'newest-first') {
          group.items = group.items.slice().reverse();
          return;
        }

        if (currentSortType === 'account-asc' || currentSortType === 'account-desc') {
          const sortFactor = currentSortType === 'account-desc' ? -1 : 1;
          group.items.sort((a, b) => {
            const accountA = (a.account || '').toLowerCase();
            const accountB = (b.account || '').toLowerCase();
            const accountCompare = accountA.localeCompare(accountB, 'zh-CN');
            if (accountCompare !== 0) {
              return accountCompare * sortFactor;
            }
            return (a.id || '').localeCompare(b.id || '') * sortFactor;
          });
          return;
        }

        if (currentSortType === 'name-asc' || currentSortType === 'name-desc') {
          group.items.sort((a, b) => {
            const accountA = (a.account || '').toLowerCase();
            const accountB = (b.account || '').toLowerCase();
            const accountCompare = accountA.localeCompare(accountB, 'zh-CN');
            if (accountCompare !== 0) {
              return accountCompare;
            }
            return (a.id || '').localeCompare(b.id || '');
          });
        }
      });

      groups.sort((a, b) => {
        switch (currentSortType) {
          case 'newest-first':
            return b.lastIndex - a.lastIndex;
          case 'name-desc':
          case 'account-desc':
            return b.name.localeCompare(a.name, 'zh-CN');
          case 'oldest-first':
            return a.firstIndex - b.firstIndex;
          case 'name-asc':
          case 'account-asc':
          default:
            return a.name.localeCompare(b.name, 'zh-CN');
        }
      });

      return groups;
    }

    function prepareSecretsGroups() {
      secretsGroupedList = buildSecretsGroups(filteredSecrets);
      const totalPages = Math.max(1, Math.ceil(secretsGroupedList.length / secretsPageSize));
      secretsCurrentPage = Math.min(Math.max(1, secretsCurrentPage), totalPages);

      const pageSizeSelect = document.getElementById('mainListPageSizeSelect');
      if (pageSizeSelect) {
        pageSizeSelect.value = String(secretsPageSize);
      }
    }

    function getCurrentPageSecretGroups() {
      if (!secretsGroupedList || secretsGroupedList.length === 0) {
        return [];
      }

      const startIndex = (secretsCurrentPage - 1) * secretsPageSize;
      return secretsGroupedList.slice(startIndex, startIndex + secretsPageSize);
    }

    function updateMainListControls(totalSecrets, totalGroups) {
      const toolbar = document.getElementById('mainListToolbar');
      const summaryElement = document.getElementById('mainListSummary');
      const paginationElement = document.getElementById('secretsPagination');
      const pageInfoElement = document.getElementById('secretsPageInfo');
      const prevButton = document.getElementById('secretsPrevBtn');
      const nextButton = document.getElementById('secretsNextBtn');

      const groupCount = Number.isFinite(totalGroups) ? totalGroups : 0;
      const secretCount = Number.isFinite(totalSecrets) ? totalSecrets : 0;
      const totalPages = Math.max(1, Math.ceil(groupCount / secretsPageSize));
      const hasData = groupCount > 0;

      if (toolbar) {
        toolbar.style.display = hasData ? 'flex' : 'none';
      }

      if (summaryElement) {
        summaryElement.textContent =
          '共 ' +
          secretCount +
          ' 个密钥 · ' +
          groupCount +
          ' 个服务分组 · 第 ' +
          secretsCurrentPage +
          '/' +
          totalPages +
          ' 页';
      }

      if (paginationElement) {
        paginationElement.style.display = hasData ? 'flex' : 'none';
      }

      if (pageInfoElement) {
        pageInfoElement.textContent = '第 ' + secretsCurrentPage + ' / ' + totalPages + ' 页';
      }

      if (prevButton) {
        prevButton.disabled = secretsCurrentPage <= 1;
      }

      if (nextButton) {
        nextButton.disabled = secretsCurrentPage >= totalPages;
      }
    }

    function clearHiddenOTPIntervals(visibleIds = []) {
      const visibleIdSet = new Set(Array.isArray(visibleIds) ? visibleIds : []);
      Object.keys(otpIntervals).forEach((secretId) => {
        if (!visibleIdSet.has(secretId)) {
          if (otpIntervals[secretId]) {
            clearInterval(otpIntervals[secretId]);
            delete otpIntervals[secretId];
          }
        }
      });
    }

    async function changeSecretsPage(delta) {
      const totalPages = Math.max(1, Math.ceil(secretsGroupedList.length / secretsPageSize));
      const targetPage = Math.min(Math.max(1, secretsCurrentPage + delta), totalPages);

      if (targetPage === secretsCurrentPage) {
        return;
      }

      secretsCurrentPage = targetPage;
      await renderFilteredSecrets();
    }

    async function changeSecretsPageSize(size) {
      const parsedSize = parseInt(size, 10);
      if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        return;
      }

      secretsPageSize = parsedSize;
      secretsCurrentPage = 1;
      await renderFilteredSecrets();
    }

    // 渲染过滤后的密钥列表（按服务分组 + 分页）
    async function renderFilteredSecrets() {
      const loading = document.getElementById('loading');
      const secretsList = document.getElementById('secretsList');
      const emptyState = document.getElementById('emptyState');

      if (loading) {
        loading.style.display = 'none';
      }

      if (currentSearchQuery && filteredSecrets.length === 0) {
        secretsList.style.display = 'none';
        emptyState.innerHTML =
          '<div class="icon">🔍</div>' +
          '<h3>未找到匹配的密钥</h3>' +
          '<p>尝试使用不同的关键字搜索</p>' +
          '<button style="margin-top: 15px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer;" onclick="clearSearch()">清除搜索</button>';
        emptyState.style.display = 'block';
        updateMainListControls(0, 0);
        clearHiddenOTPIntervals([]);
        return;
      }

      if (secrets.length === 0) {
        secretsList.style.display = 'none';
        emptyState.innerHTML =
          '<div class="icon">🔑</div>' +
          '<h3>还没有密钥</h3>' +
          '<p>点击上方按钮添加您的第一个2FA密钥</p>' +
          '<div style="margin-top: 20px; font-size: 12px; color: #95a5a6;">' +
          '快捷键：Ctrl+D 调试模式 | Ctrl+R 刷新验证码<br>' +
          '数据存储：Cloudflare Workers KV' +
          '</div>';
        emptyState.style.display = 'block';
        updateMainListControls(0, 0);
        clearHiddenOTPIntervals([]);
        return;
      }

      prepareSecretsGroups();
      const currentPageGroups = getCurrentPageSecretGroups();
      const visibleSecrets = currentPageGroups.flatMap((group) => group.items);

      emptyState.style.display = 'none';
      secretsList.style.display = 'flex';

      secretsList.innerHTML = currentPageGroups
        .map((group) => {
          return (
            '<section class="secrets-group">' +
            '<div class="secrets-group-header">' +
            '<div class="secrets-group-name">' +
            buildServiceIconMarkup(group.name, group.logoUrl, 'group-service-icon') +
            '<span class="group-service-name">' +
            escapeHTML(group.name) +
            '</span>' +
            '</div>' +
            '<div class="secrets-group-count">' +
            group.items.length +
            ' 个账号</div>' +
            '</div>' +
            '<div class="secrets-group-cards">' +
            group.items.map((secret) => createSecretCard(secret)).join('') +
            '</div>' +
            '</section>'
          );
        })
        .join('');

      updateMainListControls(filteredSecrets.length, secretsGroupedList.length);

      // 🚀 性能优化：仅并发计算当前页可见卡片的 OTP
      const perfStart = performance.now();

      await Promise.all(visibleSecrets.map((secret) => updateOTP(secret.id)));

      const perfEnd = performance.now();
      const duration = (perfEnd - perfStart).toFixed(2);

      visibleSecrets.forEach((secret) => {
        startOTPInterval(secret.id);
      });

      clearHiddenOTPIntervals(visibleSecrets.map((secret) => secret.id));
    }

    // 从卡片点击复制OTP验证码
    async function copyOTPFromCard(event, secretId) {
      // 检查点击的目标元素，避免在点击交互元素时触发
      const target = event.target;
      const isInteractiveElement = target.closest('.card-menu') || 
                                   target.closest('.otp-code') || 
                                   target.closest('.otp-next-container') ||
                                   target.closest('.secret-actions') ||
                                   target.closest('.action-btn');
      
      // 如果点击的是交互元素，不执行复制
      if (isInteractiveElement) {
        return;
      }
      
      // 执行复制操作
      await copyOTP(secretId);
    }

    // 复制OTP验证码
    async function copyOTP(secretId) {
      // 关闭所有打开的卡片菜单
      closeAllCardMenus();

      const otpElement = document.getElementById('otp-' + secretId);
      if (!otpElement) return;

      const otpText = otpElement.textContent;
      if (otpText === '------') return;

      try {
        await navigator.clipboard.writeText(otpText);
        showOTPCopyFeedback(secretId, otpText);
      } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = otpText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showOTPCopyFeedback(secretId, otpText);
      }
    }

    function showOTPCopyFeedback(secretId, otpCode) {
      const copiedCode = (otpCode || '').trim();
      const message = copiedCode ? ('验证码 ' + copiedCode + ' 已复制到剪贴板') : '验证码已复制到剪贴板';
      showCenterToast('✅', message);
    }

    async function copyNextOTP(secretId) {
      // 关闭所有打开的卡片菜单
      closeAllCardMenus();

      const nextOtpElement = document.getElementById('next-otp-' + secretId);
      if (!nextOtpElement) return;

      const nextOtpText = nextOtpElement.textContent;
      if (nextOtpText === '------') return;

      try {
        await navigator.clipboard.writeText(nextOtpText);
        showNextOTPCopyFeedback(secretId, nextOtpText);
      } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = nextOtpText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNextOTPCopyFeedback(secretId, nextOtpText);
      }
    }

    function showNextOTPCopyFeedback(secretId, otpCode) {
      const copiedCode = (otpCode || '').trim();
      const message = copiedCode ? ('下一个验证码 ' + copiedCode + ' 已复制到剪贴板') : '下一个验证码已复制到剪贴板';
      showCenterToast('⏭️', message);
    }

    // 复制OTP链接（otpauth://格式）
    async function copyOTPAuthURL(secretId) {
      const secret = secrets.find(s => s.id === secretId);
      if (!secret) {
        showCenterToast('❌', '未找到密钥');
        return;
      }

      try {
        // 构建标签
        const serviceName = secret.name.trim();
        const accountName = secret.account ? secret.account.trim() : '';
        let label;
        if (accountName) {
          label = encodeURIComponent(serviceName) + ':' + encodeURIComponent(accountName);
        } else {
          label = encodeURIComponent(serviceName);
        }

        // 根据类型构建不同的参数
        const type = secret.type || 'TOTP';
        let params;

        switch (type.toUpperCase()) {
          case 'HOTP':
            params = new URLSearchParams({
              secret: secret.secret.toUpperCase(),
              issuer: serviceName,
              algorithm: secret.algorithm || 'SHA1',
              digits: (secret.digits || 6).toString(),
              counter: (secret.counter || 0).toString()
            });
            break;
          case 'TOTP':
          default:
            params = new URLSearchParams({
              secret: secret.secret.toUpperCase(),
              issuer: serviceName,
              algorithm: secret.algorithm || 'SHA1',
              digits: (secret.digits || 6).toString(),
              period: (secret.period || 30).toString()
            });
            break;
        }

        // 根据类型选择正确的scheme
        const scheme = type.toUpperCase() === 'HOTP' ? 'hotp' : 'totp';
        const otpauthURL = 'otpauth://' + scheme + '/' + label + '?' + params.toString();

        // 复制到剪贴板
        await navigator.clipboard.writeText(otpauthURL);
        showCenterToast('🔗', secret.name + ' 链接已复制到剪贴板');
      } catch (err) {
        console.error('复制链接失败:', err);
        showCenterToast('❌', '复制链接失败: ' + err.message);
      }
    }

    // 切换卡片菜单
    function toggleCardMenu(secretId) {
      const dropdown = document.getElementById('menu-' + secretId);
      if (!dropdown) return;

      document.querySelectorAll('.secrets-group.menu-open').forEach(group => {
        group.classList.remove('menu-open');
      });
      
      document.querySelectorAll('.card-menu-dropdown').forEach(menu => {
        if (menu.id !== 'menu-' + secretId) {
          menu.classList.remove('show');
          const parentCard = menu.closest('.secret-card');
          if (parentCard) {
            parentCard.classList.remove('menu-open');
          }
        }
      });

      const shouldShow = !dropdown.classList.contains('show');
      dropdown.classList.toggle('show', shouldShow);

      const currentCard = dropdown.closest('.secret-card');
      if (currentCard) {
        currentCard.classList.toggle('menu-open', shouldShow);
      }

      const currentGroup = dropdown.closest('.secrets-group');
      if (currentGroup && shouldShow) {
        currentGroup.classList.add('menu-open');
      }
    }
    
    function closeAllCardMenus() {
      document.querySelectorAll('.card-menu-dropdown').forEach(menu => {
        menu.classList.remove('show');
        const parentCard = menu.closest('.secret-card');
        if (parentCard) {
          parentCard.classList.remove('menu-open');
        }
      });

      document.querySelectorAll('.secrets-group.menu-open').forEach(group => {
        group.classList.remove('menu-open');
      });
    }

    document.addEventListener('click', function(event) {
      if (!event.target.closest('.card-menu')) {
        closeAllCardMenus();
      }
    });


    // 编辑密钥
    function editSecret(id) {
      const secret = secrets.find(s => s.id === id);
      if (!secret) return;
      
      editingId = id;
      document.getElementById('modalTitle').textContent = '编辑密钥';
      document.getElementById('submitBtn').textContent = '更新';
      document.getElementById('secretId').value = id;
      document.getElementById('secretName').value = secret.name;
      document.getElementById('secretService').value = secret.account || '';
      document.getElementById('secretKey').value = secret.secret;
      
      // 填充高级参数
      document.getElementById('secretType').value = secret.type || 'TOTP';
      document.getElementById('secretDigits').value = secret.digits || 6;
      document.getElementById('secretPeriod').value = secret.period || 30;
      document.getElementById('secretAlgorithm').value = secret.algorithm || 'SHA1';
      document.getElementById('secretCounter').value = secret.counter || 0;
      
      // 如果有非默认的高级参数，显示高级选项
      const hasAdvancedOptions = (secret.type && secret.type !== 'TOTP') ||
                                (secret.digits && secret.digits !== 6) || 
                                (secret.period && secret.period !== 30) || 
                                (secret.algorithm && secret.algorithm !== 'SHA1') ||
                                (secret.counter && secret.counter !== 0);
      
      const checkbox = document.getElementById('showAdvanced');
      if (hasAdvancedOptions) {
        checkbox.checked = true;
        toggleAdvancedOptions();
      } else {
        checkbox.checked = false;
        toggleAdvancedOptions();
      }
      
      const modal = document.getElementById('secretModal');
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('show'), 10);
      disableBodyScroll();
    }
    
    async function deleteSecret(id) {
      const secret = secrets.find(s => s.id === id);
      if (!secret) return;

      if (!confirm('确定要删除 "' + secret.name + '" 吗？')) {
        return;
      }

      // 🔒 删除操作也使用队列，避免与编辑操作产生竞态条件
      saveQueue = saveQueue.then(async () => {
        try {
          console.log('🗑️ [保存队列] 提交删除请求:', secret.name);

          const response = await authenticatedFetch('/api/secrets/' + id, {
            method: 'DELETE'
          });

          if (response.ok) {
            const result = await response.json();

            // 检查是否为离线排队响应
            if (result.queued && result.offline) {
              console.log('📥 [离线模式] 删除操作已排队，等待同步:', result.operationId);
              showCenterToast('📥', result.message || '操作已保存，网络恢复后自动同步');

              // 离线模式下，暂时不更新本地状态，等待同步完成后由 PWA 模块刷新
              return;
            }

            // 正常在线响应，立即删除本地数据
            secrets = secrets.filter(s => s.id !== id);
            statsCache = null;
            await renderSecrets();

            if (document.getElementById('batchDeleteModal')?.classList.contains('show')) {
              const keyword = document.getElementById('batchDeleteSearchInput')?.value || '';
              filterBatchDeleteList(keyword);
            }

            if (document.getElementById('statsModal')?.classList.contains('show')) {
              refreshStatsData();
            }

            if (otpIntervals[id]) {
              clearInterval(otpIntervals[id]);
              delete otpIntervals[id];
            }

            console.log('✅ [保存队列] 删除成功:', secret.name);
          } else {
            showCenterToast('❌', '删除失败，请重试');
          }
        } catch (error) {
          console.error('❌ [保存队列] 删除失败:', error);
          showCenterToast('❌', '删除失败：' + error.message);
        }
      }).catch(err => {
        console.error('❌ [保存队列] 队列执行错误:', err);
      });
    }

    // ========== 批量删除 ==========

    function showBatchDeleteModal() {
      if (!secrets || secrets.length === 0) {
        showCenterToast('ℹ️', '当前没有可删除的密钥');
        return;
      }

      batchDeleteSelection = new Set();
      batchDeleteFilteredSecrets = [...secrets];
      batchDeleteCurrentPage = 1;

      const searchInput = document.getElementById('batchDeleteSearchInput');
      if (searchInput) {
        searchInput.value = '';
      }

      const pageSizeSelect = document.getElementById('batchDeletePageSizeSelect');
      if (pageSizeSelect) {
        pageSizeSelect.value = String(batchDeletePageSize);
      }

      prepareBatchDeleteGroups();
      renderBatchDeleteList();
      showModal('batchDeleteModal');
    }

    function hideBatchDeleteModal() {
      hideModal('batchDeleteModal', () => {
        batchDeleteSelection = new Set();
        batchDeleteFilteredSecrets = [];
        batchDeleteGroupedSecrets = [];
        batchDeleteCurrentPage = 1;
      });
    }

    function getBatchDeleteServiceName(secret) {
      const serviceName = (secret && secret.name) ? secret.name.trim() : '';
      return serviceName || '未命名服务';
    }

    function buildBatchDeleteGroups(secretList) {
      const list = Array.isArray(secretList) ? secretList : [];
      const groupMap = new Map();

      list.forEach((secret, index) => {
        const serviceName = getBatchDeleteServiceName(secret);
        const groupKey = serviceName.toLowerCase();

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            key: groupKey,
            name: serviceName,
            logoUrl: getServiceLogo(serviceName),
            items: [],
            firstIndex: index,
            lastIndex: index,
          });
        }

        const group = groupMap.get(groupKey);
        group.items.push(secret);
        group.lastIndex = index;
      });

      const groups = Array.from(groupMap.values());

      groups.forEach((group) => {
        group.items.sort((a, b) => {
          const accountA = (a.account || '').toLowerCase();
          const accountB = (b.account || '').toLowerCase();
          const accountCompare = accountA.localeCompare(accountB, 'zh-CN');
          if (accountCompare !== 0) {
            return accountCompare;
          }
          return (a.id || '').localeCompare(b.id || '');
        });
      });

      groups.sort((a, b) => {
        switch (currentSortType) {
          case 'newest-first':
            return b.lastIndex - a.lastIndex;
          case 'oldest-first':
            return a.firstIndex - b.firstIndex;
          case 'name-desc':
            return b.name.localeCompare(a.name, 'zh-CN');
          case 'name-asc':
          default:
            return a.name.localeCompare(b.name, 'zh-CN');
        }
      });

      return groups;
    }

    function prepareBatchDeleteGroups() {
      batchDeleteGroupedSecrets = buildBatchDeleteGroups(batchDeleteFilteredSecrets);
      const totalPages = Math.max(1, Math.ceil(batchDeleteGroupedSecrets.length / batchDeletePageSize));
      batchDeleteCurrentPage = Math.min(Math.max(1, batchDeleteCurrentPage), totalPages);
    }

    function getBatchDeleteCurrentPageGroups() {
      if (!batchDeleteGroupedSecrets || batchDeleteGroupedSecrets.length === 0) {
        return [];
      }

      const startIndex = (batchDeleteCurrentPage - 1) * batchDeletePageSize;
      return batchDeleteGroupedSecrets.slice(startIndex, startIndex + batchDeletePageSize);
    }

    function filterBatchDeleteList(query) {
      const keyword = (query || '').trim().toLowerCase();

      if (!keyword) {
        batchDeleteFilteredSecrets = [...secrets];
      } else {
        batchDeleteFilteredSecrets = secrets.filter((secret) => {
          const name = (secret.name || '').toLowerCase();
          const account = (secret.account || '').toLowerCase();
          return name.includes(keyword) || account.includes(keyword);
        });
      }

      batchDeleteCurrentPage = 1;
      prepareBatchDeleteGroups();
      renderBatchDeleteList();
    }

    function changeBatchDeletePage(delta) {
      const totalPages = Math.max(1, Math.ceil(batchDeleteGroupedSecrets.length / batchDeletePageSize));
      const targetPage = Math.min(Math.max(1, batchDeleteCurrentPage + delta), totalPages);

      if (targetPage === batchDeleteCurrentPage) {
        return;
      }

      batchDeleteCurrentPage = targetPage;
      renderBatchDeleteList();
    }

    function changeBatchDeletePageSize(size) {
      const parsedSize = parseInt(size, 10);
      if (!Number.isInteger(parsedSize) || parsedSize <= 0) {
        return;
      }

      batchDeletePageSize = parsedSize;
      batchDeleteCurrentPage = 1;
      prepareBatchDeleteGroups();
      renderBatchDeleteList();
    }

    function toggleBatchDeleteSelection(id) {
      if (!id) return;

      if (batchDeleteSelection.has(id)) {
        batchDeleteSelection.delete(id);
      } else {
        batchDeleteSelection.add(id);
      }

      const listElement = document.getElementById('batchDeleteList');
      const scrollTop = listElement ? listElement.scrollTop : 0;
      renderBatchDeleteList();
      if (listElement) {
        listElement.scrollTop = scrollTop;
      }
    }

    function findBatchDeleteGroupByKey(groupKey) {
      return batchDeleteGroupedSecrets.find((group) => group.key === groupKey) || null;
    }

    function toggleBatchDeleteGroupSelection(encodedGroupKey) {
      const groupKey = decodeURIComponent(encodedGroupKey || '');
      const group = findBatchDeleteGroupByKey(groupKey);
      if (!group) {
        return;
      }

      const groupIds = group.items.map((secret) => secret.id);
      const allSelected = groupIds.length > 0 && groupIds.every((id) => batchDeleteSelection.has(id));

      if (allSelected) {
        groupIds.forEach((id) => batchDeleteSelection.delete(id));
      } else {
        groupIds.forEach((id) => batchDeleteSelection.add(id));
      }

      renderBatchDeleteList();
    }

    function selectOnlyBatchDeleteGroup(encodedGroupKey) {
      const groupKey = decodeURIComponent(encodedGroupKey || '');
      const group = findBatchDeleteGroupByKey(groupKey);
      if (!group) {
        return;
      }

      batchDeleteSelection = new Set(group.items.map((secret) => secret.id));
      renderBatchDeleteList();
    }

    function deleteBatchDeleteGroup(encodedGroupKey) {
      const groupKey = decodeURIComponent(encodedGroupKey || '');
      const group = findBatchDeleteGroupByKey(groupKey);
      if (!group || group.items.length === 0) {
        return;
      }

      const groupIds = group.items.map((secret) => secret.id);
      executeBatchDelete(groupIds, '服务“' + group.name + '”', true);
    }

    function clearBatchDeleteSelection() {
      batchDeleteSelection.clear();
      renderBatchDeleteList();
    }

    function toggleBatchDeleteSelectAll() {
      const currentPageGroups = getBatchDeleteCurrentPageGroups();
      const visibleIds = currentPageGroups.flatMap((group) => group.items.map((secret) => secret.id));
      if (visibleIds.length === 0) {
        return;
      }

      const allSelected = visibleIds.every((id) => batchDeleteSelection.has(id));

      if (allSelected) {
        visibleIds.forEach((id) => batchDeleteSelection.delete(id));
      } else {
        visibleIds.forEach((id) => batchDeleteSelection.add(id));
      }

      renderBatchDeleteList();
    }

    function updateBatchDeletePagination() {
      const paginationElement = document.getElementById('batchDeletePagination');
      const pageInfoElement = document.getElementById('batchDeletePageInfo');
      const prevButton = document.getElementById('batchDeletePrevBtn');
      const nextButton = document.getElementById('batchDeleteNextBtn');

      const totalGroups = batchDeleteGroupedSecrets.length;
      const totalPages = Math.max(1, Math.ceil(totalGroups / batchDeletePageSize));

      if (paginationElement) {
        paginationElement.style.display = totalGroups > 0 ? 'flex' : 'none';
      }

      if (pageInfoElement) {
        pageInfoElement.textContent = '第 ' + batchDeleteCurrentPage + ' / ' + totalPages + ' 页';
      }

      if (prevButton) {
        prevButton.disabled = batchDeleteCurrentPage <= 1;
      }

      if (nextButton) {
        nextButton.disabled = batchDeleteCurrentPage >= totalPages;
      }
    }

    function updateBatchDeleteSummary() {
      const summaryElement = document.getElementById('batchDeleteSummary');
      const confirmButton = document.getElementById('batchDeleteConfirmBtn');
      const selectAllButton = document.getElementById('batchDeleteSelectAllBtn');

      const selectedCount = batchDeleteSelection.size;
      const totalCount = secrets.length;
      const totalGroups = batchDeleteGroupedSecrets.length;
      const currentPageGroups = getBatchDeleteCurrentPageGroups();
      const currentPageIds = currentPageGroups.flatMap((group) => group.items.map((secret) => secret.id));
      const allCurrentPageSelected = currentPageIds.length > 0 && currentPageIds.every((id) => batchDeleteSelection.has(id));
      const totalPages = Math.max(1, Math.ceil(totalGroups / batchDeletePageSize));

      if (summaryElement) {
        summaryElement.textContent =
          '已选择 ' +
          selectedCount +
          ' / ' +
          totalCount +
          ' 个密钥 · ' +
          totalGroups +
          ' 个服务分组 · 第 ' +
          batchDeleteCurrentPage +
          '/' +
          totalPages +
          ' 页';
      }

      if (confirmButton) {
        confirmButton.disabled = selectedCount === 0;
      }

      if (selectAllButton) {
        selectAllButton.textContent = allCurrentPageSelected ? '取消本页全选' : '本页全选';
      }
    }

    function renderBatchDeleteList() {
      const listElement = document.getElementById('batchDeleteList');
      if (!listElement) return;

      if (!batchDeleteGroupedSecrets || batchDeleteGroupedSecrets.length === 0) {
        listElement.innerHTML = '<div class="batch-delete-empty">未找到可删除的密钥</div>';
        updateBatchDeleteSummary();
        updateBatchDeletePagination();
        return;
      }

      const currentPageGroups = getBatchDeleteCurrentPageGroups();
      const pageStartIndex = (batchDeleteCurrentPage - 1) * batchDeletePageSize;

      listElement.innerHTML = currentPageGroups
        .map((group, groupIndex) => {
          const groupIds = group.items.map((secret) => secret.id);
          const selectedInGroup = groupIds.filter((id) => batchDeleteSelection.has(id)).length;
          const groupChecked = selectedInGroup > 0 && selectedInGroup === group.items.length;
          const groupPartial = selectedInGroup > 0 && selectedInGroup < group.items.length;
          const encodedGroupKey = encodeURIComponent(group.key);
          const groupCheckboxId = 'batch-group-' + (pageStartIndex + groupIndex);

          const itemHtml = group.items
            .map((secret) => {
              const checked = batchDeleteSelection.has(secret.id) ? 'checked' : '';
              const accountName = (secret.account || '').trim();
              const accountText = accountName || '（无账户信息）';

              return (
                '<div class="batch-delete-item" onclick="toggleBatchDeleteSelection(&quot;' +
                secret.id +
                '&quot;)">' +
                '<input type="checkbox" ' +
                checked +
                ' onclick="event.stopPropagation(); toggleBatchDeleteSelection(&quot;' +
                secret.id +
                '&quot;);">' +
                '<div class="batch-delete-item-info">' +
                '<div class="batch-delete-item-name' +
                (accountName ? '' : ' batch-delete-item-name-placeholder') +
                '">' +
                escapeHTML(accountText) +
                '</div>' +
                '<div class="batch-delete-item-id">' +
                escapeHTML(secret.id) +
                '</div>' +
                '</div>' +
                '</div>'
              );
            })
            .join('');

          return (
            '<div class="batch-delete-group">' +
            '<div class="batch-delete-group-header">' +
            '<div class="batch-delete-group-title">' +
            '<input id="' +
            groupCheckboxId +
            '" type="checkbox" ' +
            (groupChecked ? 'checked ' : '') +
            (groupPartial ? 'data-indeterminate="true" ' : '') +
            'onclick="event.stopPropagation(); toggleBatchDeleteGroupSelection(&quot;' +
            encodedGroupKey +
            '&quot;);">' +
            '<label for="' +
            groupCheckboxId +
            '" class="batch-delete-group-name">' +
            buildServiceIconMarkup(group.name, group.logoUrl, 'batch-delete-group-icon') +
            '<span>' +
            escapeHTML(group.name) +
            '</span>' +
            '</label>' +
            '<span class="batch-delete-group-count">(' +
            group.items.length +
            ' 个)</span>' +
            '</div>' +
            '<div class="batch-delete-group-actions">' +
            '<button type="button" class="btn btn-outline batch-delete-group-btn" onclick="event.stopPropagation(); selectOnlyBatchDeleteGroup(&quot;' +
            encodedGroupKey +
            '&quot;)">仅选本组</button>' +
            '<button type="button" class="btn btn-outline batch-delete-group-btn batch-delete-group-delete-btn" onclick="event.stopPropagation(); deleteBatchDeleteGroup(&quot;' +
            encodedGroupKey +
            '&quot;)">删除本组</button>' +
            '</div>' +
            '</div>' +
            '<div class="batch-delete-group-items">' +
            itemHtml +
            '</div>' +
            '</div>'
          );
        })
        .join('');

      listElement.querySelectorAll('input[data-indeterminate="true"]').forEach((checkbox) => {
        checkbox.indeterminate = true;
      });

      updateBatchDeleteSummary();
      updateBatchDeletePagination();
    }

    async function executeBatchDelete(customIds = null, customLabel = '', keepModalOpen = false) {
      const ids = Array.isArray(customIds) ? Array.from(new Set(customIds.filter(Boolean))) : Array.from(batchDeleteSelection);

      if (ids.length === 0) {
        showCenterToast('ℹ️', '请先选择要删除的密钥');
        return;
      }

      const deleteTargetText = customLabel ? customLabel + '（共 ' + ids.length + ' 个密钥）' : '选中的 ' + ids.length + ' 个密钥';
      if (!confirm('确定要删除' + deleteTargetText + '吗？\\n\\n⚠️ 删除后无法恢复。')) {
        return;
      }

      const confirmButton = document.getElementById('batchDeleteConfirmBtn');
      const originalText = confirmButton ? confirmButton.textContent : '删除所选';
      if (confirmButton) {
        confirmButton.textContent = '删除中...';
        confirmButton.disabled = true;
      }

      saveQueue = saveQueue
        .then(async () => {
          try {
            const response = await authenticatedFetch('/api/secrets/batch', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids }),
            });

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
              const errorMessage = result.message || result.error || '批量删除失败，请重试';
              showCenterToast('❌', errorMessage);
              return;
            }

            const deletedIds = Array.isArray(result.deletedIds) ? result.deletedIds : [];
            const deletedSet = new Set(deletedIds);

            if (deletedIds.length > 0) {
              deletedIds.forEach((id) => batchDeleteSelection.delete(id));

              secrets = secrets.filter((secret) => !deletedSet.has(secret.id));
              deletedIds.forEach((id) => {
                if (otpIntervals[id]) {
                  clearInterval(otpIntervals[id]);
                  delete otpIntervals[id];
                }
              });
              statsCache = null;
              await renderSecrets();
            }

            const successCount = typeof result.successCount === 'number' ? result.successCount : deletedIds.length;
            const failCount = typeof result.failCount === 'number' ? result.failCount : Math.max(0, ids.length - successCount);

            showCenterToast('✅', '批量删除完成：成功 ' + successCount + ' 个，失败 ' + failCount + ' 个');

            if (keepModalOpen) {
              const keyword = document.getElementById('batchDeleteSearchInput')?.value || '';
              filterBatchDeleteList(keyword);
            } else {
              hideBatchDeleteModal();
            }

            if (document.getElementById('statsModal')?.classList.contains('show')) {
              refreshStatsData();
            }
          } catch (error) {
            console.error('批量删除失败:', error);
            showCenterToast('❌', '批量删除失败：' + error.message);
          } finally {
            if (confirmButton) {
              confirmButton.textContent = originalText;
              confirmButton.disabled = batchDeleteSelection.size === 0;
            }
            updateBatchDeleteSummary();
          }
        })
        .catch((err) => {
          console.error('❌ [保存队列] 批量删除队列执行错误:', err);
          if (confirmButton) {
            confirmButton.textContent = originalText;
            confirmButton.disabled = false;
          }
        });
    }

    // ========== 数据统计 ==========

    function showStatsModal() {
      showModal('statsModal');

      const updatedAtElement = document.getElementById('statsUpdatedAt');
      if (updatedAtElement) {
        updatedAtElement.textContent = '正在加载统计数据...';
      }

      refreshStatsData();
    }

    function hideStatsModal() {
      hideModal('statsModal');
    }

    async function refreshStatsData() {
      try {
        const response = await authenticatedFetch('/api/secrets/stats');

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || result.error || '获取统计数据失败');
        }

        const stats = result.data || {};
        statsCache = stats;
        renderStatsData(stats, result.generatedAt, false);
      } catch (error) {
        console.warn('获取服务端统计失败，回退到本地统计:', error);
        const localStats = calculateLocalStats(secrets);
        statsCache = localStats;
        renderStatsData(localStats, new Date().toISOString(), true);
      }
    }

    function calculateLocalStats(secretList) {
      const list = Array.isArray(secretList) ? secretList : [];

      const typeDistribution = { TOTP: 0, HOTP: 0, UNKNOWN: 0 };
      const algorithmDistribution = { SHA1: 0, SHA256: 0, SHA512: 0, UNKNOWN: 0 };
      const digitsDistribution = { '6': 0, '8': 0, other: 0 };
      const periodDistribution = { '30': 0, '60': 0, '120': 0, other: 0 };

      let withAccount = 0;
      let withoutAccount = 0;
      let strongSecrets = 0;
      let weakSecrets = 0;
      let invalidSecrets = 0;

      const serviceCounter = new Map();

      list.forEach(secret => {
        const type = (secret.type || 'TOTP').toUpperCase();
        if (type === 'TOTP' || type === 'HOTP') {
          typeDistribution[type]++;
        } else {
          typeDistribution.UNKNOWN++;
        }

        const algorithm = (secret.algorithm || 'SHA1').toUpperCase();
        if (algorithmDistribution[algorithm] !== undefined) {
          algorithmDistribution[algorithm]++;
        } else {
          algorithmDistribution.UNKNOWN++;
        }

        const digits = Number(secret.digits || 6);
        if (digits === 6 || digits === 8) {
          digitsDistribution[String(digits)]++;
        } else {
          digitsDistribution.other++;
        }

        if (type === 'TOTP') {
          const period = Number(secret.period || 30);
          if (period === 30 || period === 60 || period === 120) {
            periodDistribution[String(period)]++;
          } else {
            periodDistribution.other++;
          }
        }

        if (secret.account && secret.account.trim()) {
          withAccount++;
        } else {
          withoutAccount++;
        }

        const serviceName = (secret.name || '未命名服务').trim() || '未命名服务';
        serviceCounter.set(serviceName, (serviceCounter.get(serviceName) || 0) + 1);

        const normalizedSecret = (secret.secret || '').toUpperCase().replace(/\\s/g, '');
        if (!validateBase32(normalizedSecret)) {
          invalidSecrets++;
          return;
        }

        const noPadding = normalizedSecret.replace(/=+$/, '');
        const bitLength = Math.floor((noPadding.length * 5) / 8) * 8;
        if (bitLength < 128) {
          weakSecrets++;
        } else {
          strongSecrets++;
        }
      });

      const topServices = Array.from(serviceCounter.entries())
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
          totalSecrets: list.length,
          uniqueServices: serviceCounter.size,
          withAccount,
          withoutAccount
        },
        typeDistribution,
        algorithmDistribution,
        digitsDistribution,
        periodDistribution,
        security: {
          strongSecrets,
          weakSecrets,
          invalidSecrets
        },
        topServices
      };
    }

    function renderStatsData(stats, generatedAt, isLocalFallback) {
      const updatedAtElement = document.getElementById('statsUpdatedAt');
      if (updatedAtElement) {
        let timeText = '';
        if (generatedAt) {
          const date = new Date(generatedAt);
          if (!Number.isNaN(date.getTime())) {
            timeText = date.toLocaleString('zh-CN');
          }
        }

        updatedAtElement.textContent = (timeText ? '更新时间：' + timeText : '更新时间：刚刚') + (isLocalFallback ? '（本地计算）' : '（服务端统计）');
      }

      renderStatsOverview(stats);

      const typeData = stats.typeDistribution || {};
      renderStatsKV('statsTypeGrid', [
        { key: 'TOTP', value: typeData.TOTP || 0 },
        { key: 'HOTP', value: typeData.HOTP || 0 },
        { key: '未知类型', value: typeData.UNKNOWN || 0 }
      ]);

      const algorithmData = stats.algorithmDistribution || {};
      renderStatsKV('statsAlgorithmGrid', [
        { key: 'SHA1', value: algorithmData.SHA1 || 0 },
        { key: 'SHA256', value: algorithmData.SHA256 || 0 },
        { key: 'SHA512', value: algorithmData.SHA512 || 0 },
        { key: '其他算法', value: algorithmData.UNKNOWN || 0 }
      ]);

      const digitsData = stats.digitsDistribution || {};
      renderStatsKV('statsDigitsGrid', [
        { key: '6 位', value: digitsData['6'] || 0 },
        { key: '8 位', value: digitsData['8'] || 0 },
        { key: '其他位数', value: digitsData.other || 0 }
      ]);

      const periodData = stats.periodDistribution || {};
      renderStatsKV('statsPeriodGrid', [
        { key: '30 秒', value: periodData['30'] || 0 },
        { key: '60 秒', value: periodData['60'] || 0 },
        { key: '120 秒', value: periodData['120'] || 0 },
        { key: '其他周期', value: periodData.other || 0 }
      ]);

      const securityData = stats.security || {};
      renderStatsKV('statsSecurityGrid', [
        { key: '强密钥', value: securityData.strongSecrets || 0 },
        { key: '弱密钥', value: securityData.weakSecrets || 0 },
        { key: '无效密钥', value: securityData.invalidSecrets || 0 }
      ]);

      renderTopServices(stats.topServices || []);
    }

    function renderStatsOverview(stats) {
      const grid = document.getElementById('statsOverviewGrid');
      if (!grid) return;

      const overview = stats.overview || {};
      const security = stats.security || {};

      const cards = [
        { label: '密钥总数', value: overview.totalSecrets || 0 },
        { label: '唯一服务', value: overview.uniqueServices || 0 },
        { label: '有账户信息', value: overview.withAccount || 0 },
        { label: '弱密钥占比', value: (overview.totalSecrets > 0 ? Math.round(((security.weakSecrets || 0) / overview.totalSecrets) * 100) : 0) + '%' }
      ];

      grid.innerHTML = cards.map(card => {
        return '<div class="stats-overview-card">' +
          '<div class="stats-overview-label">' + escapeHTML(card.label) + '</div>' +
          '<div class="stats-overview-value">' + escapeHTML(String(card.value)) + '</div>' +
        '</div>';
      }).join('');
    }

    function renderStatsKV(containerId, items) {
      const container = document.getElementById(containerId);
      if (!container) return;

      if (!Array.isArray(items) || items.length === 0) {
        container.innerHTML = '<div class="stats-empty">暂无统计数据</div>';
        return;
      }

      container.innerHTML = items.map(item => {
        return '<div class="stats-kv-item">' +
          '<span class="stats-kv-key">' + escapeHTML(String(item.key)) + '</span>' +
          '<span class="stats-kv-value">' + escapeHTML(String(item.value)) + '</span>' +
        '</div>';
      }).join('');
    }

    function renderTopServices(topServices) {
      const container = document.getElementById('statsTopServices');
      if (!container) return;

      if (!Array.isArray(topServices) || topServices.length === 0) {
        container.innerHTML = '<div class="stats-empty">暂无服务数据</div>';
        return;
      }

      container.innerHTML = topServices.map((item, index) => {
        return '<div class="stats-service-row">' +
          '<span class="stats-service-name">' + (index + 1) + '. ' + escapeHTML(item.name || '未命名服务') + '</span>' +
          '<span class="stats-service-count">' + escapeHTML(String(item.count || 0)) + ' 个</span>' +
        '</div>';
      }).join('');
    }
    
    // 二维码解析工具
    function showQRScanAndDecode() {
      hideToolsModal();
      showQRDecodeModal();
    }
    
    // 二维码生成工具
    function showQRGenerateTool() {
      hideToolsModal();
      showQRGenerateModal();
    }
    
    // Base32编解码工具
    function showBase32Tool() {
      hideToolsModal();
      showBase32Modal();
    }
    
    // 时间戳工具
    function showTimestampTool() {
      hideToolsModal();
      showTimestampModal();
    }
    
    // 密钥检查器
    function showKeyCheckTool() {
      hideToolsModal();
      showKeyCheckModal();
    }
    
    // 密钥生成器
    function showKeyGeneratorTool() {
      hideToolsModal();
      showKeyGeneratorModal();
    }
    
    async function handleSubmit(event) {
      event.preventDefault();

      const name = document.getElementById('secretName').value.trim();
      const account = document.getElementById('secretService').value.trim();
      const secret = document.getElementById('secretKey').value.trim().toUpperCase();

      // 获取高级参数
      const type = document.getElementById('secretType').value || 'TOTP';
      const digits = parseInt(document.getElementById('secretDigits').value) || 6;
      const period = parseInt(document.getElementById('secretPeriod').value) || 30;
      const algorithm = document.getElementById('secretAlgorithm').value || 'SHA1';
      const counter = parseInt(document.getElementById('secretCounter').value) || 0;

      if (!name || !secret) {
        showCenterToast('❌', '请填写服务名称和密钥');
        return;
      }

      const submitBtn = document.getElementById('submitBtn');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = '保存中...';
      submitBtn.disabled = true;

      // 🔒 关键修复：使用队列确保保存操作串行执行，避免并发覆盖
      // 当快速连续编辑多个密钥时，后端的读-修改-写操作会产生race condition
      // 通过Promise链式调用，确保前一个保存完成后再执行下一个
      saveQueue = saveQueue.then(async () => {
        try {
          let response;
          const data = {
            name,
            account: account,
            secret,
            type,
            digits,
            period,
            algorithm,
            counter
          };

          const action = editingId ? '更新' : '新增';
          console.log('🔄 [保存队列] 提交保存请求:', action, name, { period, digits, algorithm });

          if (editingId) {
            response = await authenticatedFetch('/api/secrets/' + editingId, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
          } else {
            response = await authenticatedFetch('/api/secrets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
          }

          if (response.ok) {
            const result = await response.json();

            // 检查是否为离线排队响应
            if (result.queued && result.offline) {
              console.log('📥 [离线模式] 操作已排队，等待同步:', result.operationId);
              showCenterToast('📥', result.message || '操作已保存，网络恢复后自动同步');

              // 离线模式下，暂时不更新本地状态，等待同步完成后由 PWA 模块刷新
              hideSecretModal();
              return;
            }

            // 正常在线响应，更新本地状态
            console.log('✅ [保存队列] 保存成功:', result.data ? result.data.secret.name : result.name, '- period:', result.data ? result.data.secret.period : result.period);

            if (editingId) {
              const index = secrets.findIndex(s => s.id === editingId);
              if (index !== -1) {
                secrets[index] = result.data ? result.data.secret : result;
                console.log('✅ [本地更新] 密钥已更新:', secrets[index].name, '- period:', secrets[index].period);
              }
            } else {
              secrets.push(result.data ? result.data.secret : result);
            }

            statsCache = null;

            await renderSecrets();
            hideSecretModal();

            if (document.getElementById('statsModal')?.classList.contains('show')) {
              refreshStatsData();
            }
          } else {
            const error = await response.json();
            const errorMessage = error.message || error.error || '保存失败，请重试';
            showCenterToast('❌', errorMessage);
          }
        } catch (error) {
          console.error('❌ [保存队列] 保存失败:', error);
          showCenterToast('❌', '保存失败：' + error.message);
        } finally {
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }
      }).catch(err => {
        // 队列执行失败的最终兜底
        console.error('❌ [保存队列] 队列执行错误:', err);
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      });
    }


    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        hideSecretModal();
        hideQRModal();
        hideQRScanner();
        hideImportModal();
        hideBatchDeleteModal();
        hideStatsModal();
      }
      
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        debugMode = !debugMode;
        console.log('Debug mode ' + (debugMode ? 'enabled' : 'disabled'));
        
        const debugInfo = document.createElement('div');
        debugInfo.style.cssText = 
          'position: fixed;' +
          'top: 20px;' +
          'right: 20px;' +
          'background: ' + (debugMode ? '#27ae60' : '#e74c3c') + ';' +
          'color: white;' +
          'padding: 10px 15px;' +
          'border-radius: 6px;' +
          'z-index: 9999;' +
          'font-size: 14px;';
        debugInfo.textContent = '调试模式: ' + (debugMode ? '开启' : '关闭');
        document.body.appendChild(debugInfo);
        
        setTimeout(() => {
          if (debugInfo.parentNode) {
            debugInfo.parentNode.removeChild(debugInfo);
          }
        }, 2000);
      }
      
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        secrets.forEach(secret => {
          updateOTP(secret.id);
        });
        
        const refreshInfo = document.createElement('div');
        refreshInfo.style.cssText = 
          'position: fixed;' +
          'top: 20px;' +
          'right: 20px;' +
          'background: #3498db;' +
          'color: white;' +
          'padding: 10px 15px;' +
          'border-radius: 6px;' +
          'z-index: 9999;' +
          'font-size: 14px;';
        refreshInfo.textContent = '已手动刷新所有验证码';
        document.body.appendChild(refreshInfo);
        
        setTimeout(() => {
          if (refreshInfo.parentNode) {
            refreshInfo.parentNode.removeChild(refreshInfo);
          }
        }, 2000);
      }
    });

    // 模态框外部点击关闭
    document.getElementById('secretModal').addEventListener('click', function(e) {
      if (e.target === this) {
        hideSecretModal();
      }
    });
    
    document.getElementById('qrModal').addEventListener('click', function(e) {
      if (e.target === this) {
        hideQRModal();
      }
    });

    document.getElementById('importModal').addEventListener('click', function(e) {
      if (e.target === this) {
        hideImportModal();
      }
    });

    document.getElementById('batchDeleteModal').addEventListener('click', function(e) {
      if (e.target === this) {
        hideBatchDeleteModal();
      }
    });

    document.getElementById('statsModal').addEventListener('click', function(e) {
      if (e.target === this) {
        hideStatsModal();
      }
    });

    // 页面卸载时清理定时器
    window.addEventListener('beforeunload', function() {
      Object.values(otpIntervals).forEach(interval => {
        clearInterval(interval);
      });
    });

    // 🛡️ 安全机制：定期检查所有验证码是否需要更新
    // 防止定时器失效导致验证码过期
    // 每5秒检查一次（不会影响性能）
    setInterval(() => {
      if (document.hidden) {
        // 如果页面在后台，跳过检查（节省资源）
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      
      secrets.forEach(secret => {
        // 只检查TOTP类型
        if (secret.type && secret.type.toUpperCase() === 'HOTP') {
          return;
        }

        const otpElement = document.getElementById('otp-' + secret.id);
        if (!otpElement) return;

        // 检查验证码是否为默认值（未初始化或更新失败）
        if (otpElement.textContent === '------') {
          updateOTP(secret.id);
          return;
        }

        // 检查当前时间窗口，判断验证码是否应该更新
        const timeStep = secret.period || 30;
        const currentWindow = Math.floor(currentTime / timeStep);
        
        // 在时间窗口刚切换时（前3秒），强制刷新验证码
        const secondsInWindow = currentTime % timeStep;
        if (secondsInWindow <= 2) {
          // 避免重复刷新：检查上次刷新时间
          const lastRefreshKey = 'lastRefresh-' + secret.id;
          const lastRefreshWindow = window[lastRefreshKey];
          
          if (lastRefreshWindow !== currentWindow) {
            updateOTP(secret.id);
            window[lastRefreshKey] = currentWindow;
          }
        }
      });
    }, 5000); // 每5秒检查一次
`;
}

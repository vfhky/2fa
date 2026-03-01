/**
 * 密钥验证码工具模块
 */

/**
 * 获取密钥验证码工具代码
 * @returns {string} 密钥验证码工具 JavaScript 代码
 */
export function getSecretOtpToolCode() {
	return `
    // ==================== 密钥验证码工具 ====================

    let secretOtpCountdownTimer = null;
    let secretOtpCurrentPeriod = 30;

    function showSecretOtpModal() {
      showModal('secretOtpModal', () => {
        const input = document.getElementById('secretOtpInput');
        const digitsSelect = document.getElementById('secretOtpDigits');
        const periodSelect = document.getElementById('secretOtpPeriod');
        const algorithmSelect = document.getElementById('secretOtpAlgorithm');
        const resultSection = document.getElementById('secretOtpResultSection');
        const codeText = document.getElementById('secretOtpCodeText');
        const remaining = document.getElementById('secretOtpRemaining');

        if (input) {
          input.value = '';
          setTimeout(() => input.focus(), 100);
        }
        if (digitsSelect) digitsSelect.value = '6';
        if (periodSelect) periodSelect.value = '30';
        if (algorithmSelect) algorithmSelect.value = 'SHA1';
        if (resultSection) resultSection.style.display = 'none';
        if (codeText) codeText.textContent = '';
        if (remaining) remaining.textContent = '';

        stopSecretOtpCountdown();
      });
    }

    function hideSecretOtpModal() {
      hideModal('secretOtpModal', () => {
        stopSecretOtpCountdown();
      });
    }

    function stopSecretOtpCountdown() {
      if (secretOtpCountdownTimer) {
        clearInterval(secretOtpCountdownTimer);
        secretOtpCountdownTimer = null;
      }
    }

    function normalizeSecretOtpInput(value) {
      return String(value || '')
        .toUpperCase()
        .replace(/\\s+/g, '')
        .trim();
    }

    function validateSecretOtpInput(secret) {
      if (!secret) {
        return '请输入密钥';
      }
      if (secret.length < 8) {
        return '密钥长度至少需要8个字符';
      }
      if (!/^[A-Z2-7]+=*$/.test(secret)) {
        return '密钥必须为 Base32 格式（A-Z 和 2-7）';
      }
      return '';
    }

    function updateSecretOtpCountdown() {
      const remainingEl = document.getElementById('secretOtpRemaining');
      if (!remainingEl) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const remaining = secretOtpCurrentPeriod - (now % secretOtpCurrentPeriod);
      remainingEl.textContent = '剩余有效时间：' + remaining + ' 秒';
    }

    function startSecretOtpCountdown(period) {
      secretOtpCurrentPeriod = period;
      stopSecretOtpCountdown();
      updateSecretOtpCountdown();
      secretOtpCountdownTimer = setInterval(updateSecretOtpCountdown, 1000);
    }

    async function generateSecretOtpCode() {
      const inputEl = document.getElementById('secretOtpInput');
      const digitsEl = document.getElementById('secretOtpDigits');
      const periodEl = document.getElementById('secretOtpPeriod');
      const algorithmEl = document.getElementById('secretOtpAlgorithm');
      const buttonEl = document.getElementById('generateSecretOtpBtn');

      const secret = normalizeSecretOtpInput(inputEl ? inputEl.value : '');
      const validationError = validateSecretOtpInput(secret);
      if (validationError) {
        showCenterToast('❌', validationError);
        return;
      }

      const digits = parseInt(digitsEl ? digitsEl.value : '6', 10) || 6;
      const period = parseInt(periodEl ? periodEl.value : '30', 10) || 30;
      const algorithm = String(algorithmEl ? algorithmEl.value : 'SHA1');

      const originalText = buttonEl ? buttonEl.textContent : '';
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = '生成中...';
      }

      try {
        const response = await authenticatedFetch('/api/otp/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            secret,
            type: 'TOTP',
            digits,
            period,
            algorithm
          })
        });

        if (response.status === 401) {
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          showCenterToast('❌', data.message || data.error || '生成验证码失败');
          return;
        }

        if (!data.token) {
          showCenterToast('❌', '生成验证码失败：返回结果无效');
          return;
        }

        const resultSection = document.getElementById('secretOtpResultSection');
        const codeText = document.getElementById('secretOtpCodeText');
        const configText = document.getElementById('secretOtpConfig');

        if (codeText) {
          codeText.textContent = data.token;
        }
        if (configText) {
          configText.textContent = 'TOTP · ' + digits + '位 · ' + period + '秒 · ' + algorithm;
        }
        if (resultSection) {
          resultSection.style.display = 'block';
        }

        startSecretOtpCountdown(period);
      } catch (error) {
        showCenterToast('❌', '生成验证码失败：' + error.message);
      } finally {
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = originalText || '生成验证码';
        }
      }
    }

    async function copySecretOtpCode() {
      const codeText = document.getElementById('secretOtpCodeText');
      const value = codeText ? codeText.textContent.trim() : '';
      if (!value) {
        showCenterToast('❌', '没有可复制的验证码');
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        showCenterToast('✅', '验证码已复制');
      } catch (error) {
        showCenterToast('❌', '复制失败：' + error.message);
      }
    }

`;
}

/**
 * 二维码模块
 * 包含所有二维码生成、扫描和处理功能
 */

/**
 * 获取二维码相关代码
 * @returns {string} 二维码 JavaScript 代码
 */
export function getQRCodeCode() {
	return `    // ========== 二维码功能模块 ==========

    // 连续扫描模式状态
    let continuousScanMode = false;
    let continuousScanCount = 0;
    let scanFrameCounter = 0;
    let lastScanAttemptAt = 0;
    const decodeAttemptWarningCache = new Set();
    const barcodeDetectorWarningCache = new Set();
    const SCAN_MIN_INTERVAL_MS = 80;
    const DEEP_SCAN_INTERVAL = 4;
    const CENTER_CROP_RATIO = 0.72;
    const UPLOAD_DETECT_MAX_SIDE = 2200;
    const QR_PIPELINE_VERSION = '2026-03-01-r6';

    // 切换连续扫描模式
    function toggleContinuousScan() {
      const toggle = document.getElementById('continuousScanToggle');
      continuousScanMode = toggle.checked;

      // 更新计数器显示
      const counter = document.getElementById('scanCounter');
      if (continuousScanMode) {
        counter.style.display = 'block';
      } else {
        counter.style.display = 'none';
        continuousScanCount = 0;
        document.getElementById('scanCountNum').textContent = '0';
      }

      console.log('连续扫描模式:', continuousScanMode ? '开启' : '关闭');
    }

    // 更新扫描计数
    function updateScanCount() {
      continuousScanCount++;
      document.getElementById('scanCountNum').textContent = continuousScanCount;
    }

    // 显示二维码
    function showQRCode(secretId) {
      console.log('showQRCode called with secretId:', secretId);
      const secret = secrets.find(s => s.id === secretId);
      if (!secret) {
        console.log('Secret not found for id:', secretId);
        return;
      }
      console.log('Found secret:', secret.name);

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
      currentOTPAuthURL = 'otpauth://' + scheme + '/' + label + '?' + params.toString();

      document.getElementById('qrTitle').textContent = secret.name + ' 二维码';
      document.getElementById('qrSubtitle').textContent = secret.account ?
        '账户: ' + secret.account : '扫描此二维码导入到其他2FA应用';

      generateQRCodeForModal(currentOTPAuthURL);
      const modal = document.getElementById('qrModal');
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('show'), 10);
      disableBodyScroll();
    }

    // 为模态框生成二维码
    async function generateQRCodeForModal(text) {
      const container = document.querySelector('.qr-code-container');
      container.innerHTML = '';

      // 显示加载状态
      const loadingDiv = document.createElement('div');
      loadingDiv.textContent = '🔄 生成中...';
      loadingDiv.style.cssText =
        'text-align: center;' +
        'padding: 80px 20px;' +
        'color: #7f8c8d;' +
        'font-size: 14px;';
      container.appendChild(loadingDiv);

      try {
        let qrDataURL = null;
        let generationMethod = 'unknown';

        console.log('开始生成二维码（客户端）...');

        // 使用客户端本地生成二维码（隐私安全）
        qrDataURL = await generateQRCodeDataURL(text, {
          width: 200,
          height: 200
        });
        generationMethod = 'client_local';

        // 创建图片元素
        const img = document.createElement('img');
        img.src = qrDataURL;
        img.alt = '2FA二维码';
        img.className = 'qr-code';
        img.style.cssText =
          'width: 200px;' +
          'height: 200px;' +
          'display: block;' +
          'margin: 0 auto;' +
          'border-radius: 8px;' +
          'background: white;';

        img.onload = function() {
          container.innerHTML = '';
          container.appendChild(img);
          console.log('二维码显示成功 - 生成方式:', generationMethod);
        };

        img.onerror = function() {
          console.error('二维码显示失败');
          container.innerHTML =
            '<div style="width: 200px; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; text-align: center; font-size: 12px; color: #6c757d; line-height: 1.4;">' +
            '<div style="font-size: 24px; margin-bottom: 10px;">❌</div>' +
            '<div style="margin-bottom: 8px; font-weight: bold;">二维码生成失败</div>' +
            '<div style="margin-bottom: 8px;">请检查网络连接</div>' +
            '<div>或稍后重试</div>' +
            '</div>';
        };

	      } catch (error) {
	        console.error('二维码生成过程发生错误:', error);
	        container.innerHTML =
	          '<div style="width: 200px; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; text-align: center; font-size: 12px; color: #6c757d; line-height: 1.4;">' +
	          '<div style="font-size: 24px; margin-bottom: 10px;">⚠️</div>' +
	          '<div style="margin-bottom: 8px; font-weight: bold;">生成失败</div>' +
	          '<div style="margin-bottom: 8px;">发生未知错误</div>' +
	          '<div>' + escapeHTML(error.message || '未知错误') + '</div>' +
	          '</div>';
	      }
	    }

    // 显示二维码扫描器
    function showQRScanner() {
      const modal = document.getElementById('qrScanModal');
      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('show'), 10);

      // 重置连续扫描状态
      continuousScanMode = false;
      continuousScanCount = 0;
      const toggle = document.getElementById('continuousScanToggle');
      if (toggle) toggle.checked = false;
      const counter = document.getElementById('scanCounter');
      if (counter) {
        counter.style.display = 'none';
        document.getElementById('scanCountNum').textContent = '0';
      }

      startQRScanner();
      disableBodyScroll();
    }

    // 隐藏二维码扫描器
    function hideQRScanner() {
      const modal = document.getElementById('qrScanModal');
      modal.classList.remove('show');
      setTimeout(() => modal.style.display = 'none', 300);
      stopQRScanner();
      enableBodyScroll();

      // 重置连续扫描状态
      continuousScanMode = false;
      continuousScanCount = 0;
      const toggle = document.getElementById('continuousScanToggle');
      if (toggle) toggle.checked = false;
      const counter = document.getElementById('scanCounter');
      if (counter) {
        counter.style.display = 'none';
        document.getElementById('scanCountNum').textContent = '0';
      }

      // 重置文件输入框，确保下次可以选择同一个文件
      const fileInput = document.getElementById('qrImageInput');
      if (fileInput) {
        fileInput.value = '';
      }
    }

    // 启动二维码扫描器
    async function startQRScanner() {
      const video = document.getElementById('scannerVideo');
      const status = document.getElementById('scannerStatus');
      const error = document.getElementById('scannerError');

      try {
        error.style.display = 'none';
        status.textContent = '正在启动摄像头...';
        status.style.display = 'block';

        // 检查浏览器支持 - 增强iPad兼容性
        if (!navigator.mediaDevices) {
          // 尝试 polyfill for older browsers
          if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
            // 为旧版浏览器创建 polyfill
            navigator.mediaDevices = {};
            navigator.mediaDevices.getUserMedia = function(constraints) {
              const getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
              if (!getUserMedia) {
                return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
              }
              return new Promise((resolve, reject) => {
                getUserMedia.call(navigator, constraints, resolve, reject);
              });
            };
          } else {
            throw new Error('您的浏览器不支持摄像头功能，请使用现代浏览器');
          }
        }

        if (!navigator.mediaDevices.getUserMedia) {
          throw new Error('您的浏览器不支持摄像头功能，请使用现代浏览器');
        }

        // iPad 特殊处理：检查设备类型和权限
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isIPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        console.log('设备检测:', {
          userAgent: navigator.userAgent,
          isIOS,
          isIPad,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints
        });

        // 停止之前的流（如果存在）
        if (scanStream) {
          scanStream.getTracks().forEach(track => track.stop());
          scanStream = null;
        }

        // 尝试不同的摄像头配置 - iPad 优化
        let configs;

        if (isIPad || isIOS) {
          // iPad/iOS 特殊配置
          configs = [
            {
              video: {
                facingMode: 'environment',
                width: { ideal: 640, max: 1280 },  // 降低分辨率要求
                height: { ideal: 480, max: 720 }
              }
            },
            {
              video: {
                facingMode: 'user',
                width: { ideal: 480, max: 640 },
                height: { ideal: 360, max: 480 }
              }
            },
            {
              video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
              }
            },
            {
              video: true  // 最简单的配置
            }
          ];
        } else {
          // 其他设备的标准配置
          configs = [
            {
              video: {
                facingMode: 'environment', // 后置摄像头
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
              }
            },
            {
              video: {
                facingMode: 'user', // 前置摄像头
                width: { ideal: 640 },
                height: { ideal: 480 }
              }
            },
            {
              video: true // 默认摄像头
            }
          ];
        }

        let stream = null;
        for (let i = 0; i < configs.length; i++) {
          try {
            console.log('尝试摄像头配置:', configs[i]);
            stream = await navigator.mediaDevices.getUserMedia(configs[i]);
            console.log('摄像头配置成功');
            break;
          } catch (e) {
            console.warn('摄像头配置 ' + (i + 1) + ' 失败:', e.message);
            if (i === configs.length - 1) {
              throw e; // 最后一个配置也失败了，抛出错误
            }
          }
        }

        if (!stream) {
          throw new Error('无法获取摄像头访问权限');
        }

        scanStream = stream;
        video.srcObject = scanStream;

        // 等待视频加载并播放
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('摄像头加载超时'));
          }, 10000);

          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            video.play()
              .then(() => {
                console.log('摄像头启动成功，分辨率:', video.videoWidth + 'x' + video.videoHeight);
                resolve();
              })
              .catch(reject);
          };

          video.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('摄像头播放失败'));
          };
        });

        status.textContent = '';
        status.style.display = 'none';
        isScanning = true;
        scanFrameCounter = 0;
        lastScanAttemptAt = 0;

        // 创建画布用于分析图像
        if (!scannerCanvas) {
          scannerCanvas = document.createElement('canvas');
          scannerContext = scannerCanvas.getContext('2d');
          console.log('画布创建成功');
        }

        // 延迟开始扫描，确保视频稳定
        setTimeout(() => {
          if (isScanning) {
            console.log('开始二维码扫描循环');
            scanForQRCode();
          }
        }, 500);

      } catch (err) {
        console.error('启动摄像头失败:', err);
        console.error('错误详情:', {
          name: err.name,
          message: err.message,
          userAgent: navigator.userAgent,
          isSecure: location.protocol === 'https:',
          mediaDevicesSupport: !!navigator.mediaDevices,
          getUserMediaSupport: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        });

        let errorMsg = '摄像头启动失败: ' + err.message;

        // iPad 特殊错误处理
        const isIPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (err.name === 'NotAllowedError') {
          if (isIPad) {
            errorMsg = 'iPad 摄像头权限被拒绝。请在 Safari 设置中允许摄像头访问，或尝试在地址栏点击"aA"图标允许摄像头权限';
          } else {
            errorMsg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
          }
        } else if (err.name === 'NotFoundError') {
          if (isIPad) {
            errorMsg = 'iPad 未找到摄像头设备，请确保在系统设置中允许浏览器访问摄像头';
          } else {
            errorMsg = '未找到摄像头设备，请确保设备连接正常';
          }
        } else if (err.name === 'NotReadableError') {
          if (isIPad) {
            errorMsg = 'iPad 摄像头被其他应用占用，请关闭其他摄像头应用后重试';
          } else {
            errorMsg = '摄像头被其他应用占用，请关闭其他摄像头应用';
          }
        } else if (err.name === 'OverconstrainedError') {
          if (isIPad) {
            errorMsg = 'iPad 摄像头不支持请求的配置，正在尝试兼容模式...';
          } else {
            errorMsg = '摄像头不支持请求的配置，请尝试其他设备';
          }
        } else if (err.message.includes('getUserMedia is not implemented')) {
          errorMsg = '您的浏览器版本过旧，请更新到最新版本的 Safari 或 Chrome';
        } else if (location.protocol !== 'https:') {
          errorMsg = '摄像头功能需要HTTPS协议，请使用 https:// 访问';
        }

        showScannerError(errorMsg);
      }
    }

    // 停止二维码扫描器
    function stopQRScanner() {
      isScanning = false;
      scanFrameCounter = 0;
      lastScanAttemptAt = 0;
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
      if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
      }
    }

    // 重试启动摄像头
    function retryCamera() {
      document.getElementById('scannerError').style.display = 'none';
      startQRScanner();
    }

    // 显示扫描器错误
    function showScannerError(message) {
      const error = document.getElementById('scannerError');
      const errorMessage = document.getElementById('errorMessage');
      const status = document.getElementById('scannerStatus');

      status.style.display = 'none';
      errorMessage.textContent = message;
      error.style.display = 'block';
    }

    // 扫描二维码
    function scanForQRCode() {
      if (!isScanning) return;

      const now = Date.now();
      if (now - lastScanAttemptAt < SCAN_MIN_INTERVAL_MS) {
        requestAnimationFrame(scanForQRCode);
        return;
      }
      lastScanAttemptAt = now;

      const video = document.getElementById('scannerVideo');
      const status = document.getElementById('scannerStatus');

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          if (videoWidth > 0 && videoHeight > 0) {
            scannerCanvas.width = videoWidth;
            scannerCanvas.height = videoHeight;

            scannerContext.drawImage(video, 0, 0, videoWidth, videoHeight);
            const imageData = scannerContext.getImageData(0, 0, videoWidth, videoHeight);

            scanFrameCounter++;
            const deepMode = scanFrameCounter % DEEP_SCAN_INTERVAL === 0;
            const qrCode = decodeQRCode(imageData, { deep: deepMode });

            if (qrCode) {
              console.log('二维码扫描成功');
              processScannedQRCode(qrCode);
              return;
            }
          }
        } catch (error) {
          console.error('扫描过程出错:', error);
        }
      } else {
        status.textContent = '正在加载摄像头...';
      }

      requestAnimationFrame(scanForQRCode);
    }

    function describeImageData(imageData) {
      return imageData.width + 'x' + imageData.height;
    }

    function maskQRCodeDataForLog(data) {
      if (typeof data !== 'string') {
        return '';
      }
      const normalized = data.trim();
      if (!normalized) {
        return '';
      }
      const previewLength = 96;
      const preview = normalized.slice(0, previewLength);
      if (normalized.length <= previewLength) {
        return preview;
      }
      return preview + '...(' + normalized.length + ' chars)';
    }

    function qrDebugLog(enabled, sourceName, message, details) {
      if (!enabled) {
        return;
      }
      const prefix = '[QR调试][' + sourceName + '] ' + message;
      if (typeof details === 'undefined') {
        console.log(prefix);
      } else {
        console.log(prefix, details);
      }
    }

    function runJsQRAttempts(imageData, parseOptions, debugTag = '', stepName = '') {
      const debugEnabled = !!debugTag;
      for (let i = 0; i < parseOptions.length; i++) {
        const option = parseOptions[i];
        try {
          const result = jsQR(imageData.data, imageData.width, imageData.height, option);
          if (result && result.data) {
            qrDebugLog(debugEnabled, debugTag, 'jsQR命中', {
              step: stepName || 'unknown',
              inversionAttempts: option.inversionAttempts || 'unknown',
              size: describeImageData(imageData),
              preview: maskQRCodeDataForLog(result.data)
            });
            return result.data;
          }
          qrDebugLog(debugEnabled, debugTag, 'jsQR未命中', {
            step: stepName || 'unknown',
            inversionAttempts: option.inversionAttempts || 'unknown',
            size: describeImageData(imageData)
          });
        } catch (error) {
          const reason = error && error.message ? error.message : 'unknown';
          const key = (option.inversionAttempts || 'unknown') + '|' + reason;
          if (!decodeAttemptWarningCache.has(key)) {
            decodeAttemptWarningCache.add(key);
            console.warn('二维码解析选项失败:', option, reason);
          }
          qrDebugLog(debugEnabled, debugTag, 'jsQR异常', {
            step: stepName || 'unknown',
            inversionAttempts: option.inversionAttempts || 'unknown',
            size: describeImageData(imageData),
            reason
          });
        }
      }
      return null;
    }

    function buildImageData(pixels, width, height) {
      if (typeof ImageData !== 'undefined') {
        return new ImageData(pixels, width, height);
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      const newImageData = tempCtx.createImageData(width, height);
      newImageData.data.set(pixels);
      return newImageData;
    }

    function extractRegionImageData(imageData, startX, startY, cropWidth, cropHeight) {
      const width = imageData.width;
      const height = imageData.height;
      const safeStartX = Math.max(0, Math.min(width - 1, Math.floor(startX)));
      const safeStartY = Math.max(0, Math.min(height - 1, Math.floor(startY)));
      const safeCropWidth = Math.max(1, Math.min(width - safeStartX, Math.floor(cropWidth)));
      const safeCropHeight = Math.max(1, Math.min(height - safeStartY, Math.floor(cropHeight)));
      const output = new Uint8ClampedArray(safeCropWidth * safeCropHeight * 4);

      for (let y = 0; y < safeCropHeight; y++) {
        for (let x = 0; x < safeCropWidth; x++) {
          const srcIndex = ((safeStartY + y) * width + (safeStartX + x)) * 4;
          const destIndex = (y * safeCropWidth + x) * 4;
          output[destIndex] = imageData.data[srcIndex];
          output[destIndex + 1] = imageData.data[srcIndex + 1];
          output[destIndex + 2] = imageData.data[srcIndex + 2];
          output[destIndex + 3] = imageData.data[srcIndex + 3];
        }
      }

      return buildImageData(output, safeCropWidth, safeCropHeight);
    }

    function extractCenterImageData(imageData, ratio = 0.72) {
      const width = imageData.width;
      const height = imageData.height;
      const cropWidth = Math.max(64, Math.floor(width * ratio));
      const cropHeight = Math.max(64, Math.floor(height * ratio));

      if (cropWidth >= width || cropHeight >= height) {
        return imageData;
      }

      return extractRegionImageData(
        imageData,
        Math.floor((width - cropWidth) / 2),
        Math.floor((height - cropHeight) / 2),
        cropWidth,
        cropHeight
      );
    }

    function resizeImageDataNearest(imageData, targetWidth, targetHeight) {
      const width = imageData.width;
      const height = imageData.height;
      const safeTargetWidth = Math.max(1, Math.floor(targetWidth));
      const safeTargetHeight = Math.max(1, Math.floor(targetHeight));

      if (safeTargetWidth === width && safeTargetHeight === height) {
        return imageData;
      }

      const output = new Uint8ClampedArray(safeTargetWidth * safeTargetHeight * 4);
      const xRatio = width / safeTargetWidth;
      const yRatio = height / safeTargetHeight;

      for (let y = 0; y < safeTargetHeight; y++) {
        const srcY = Math.min(height - 1, Math.floor(y * yRatio));
        for (let x = 0; x < safeTargetWidth; x++) {
          const srcX = Math.min(width - 1, Math.floor(x * xRatio));
          const srcIndex = (srcY * width + srcX) * 4;
          const destIndex = (y * safeTargetWidth + x) * 4;
          output[destIndex] = imageData.data[srcIndex];
          output[destIndex + 1] = imageData.data[srcIndex + 1];
          output[destIndex + 2] = imageData.data[srcIndex + 2];
          output[destIndex + 3] = imageData.data[srcIndex + 3];
        }
      }

      return buildImageData(output, safeTargetWidth, safeTargetHeight);
    }

    function upscaleImageData(imageData, scale = 2, maxSide = 2200) {
      if (!Number.isFinite(scale) || scale <= 1) {
        return imageData;
      }

      const width = imageData.width;
      const height = imageData.height;
      const targetWidth = Math.min(maxSide, Math.max(1, Math.floor(width * scale)));
      const targetHeight = Math.min(maxSide, Math.max(1, Math.floor(height * scale)));

      if (targetWidth === width && targetHeight === height) {
        return imageData;
      }

      return resizeImageDataNearest(imageData, targetWidth, targetHeight);
    }

    function getAggressiveRegionCandidates(imageData) {
      const width = imageData.width;
      const height = imageData.height;
      const ratios = [0.78, 0.64, 0.5, 0.38];
      const anchors = [
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 }
      ];
      const maxCandidates = 20;
      const candidates = [imageData];
      const seen = new Set();

      function addCandidate(startX, startY, cropWidth, cropHeight) {
        if (candidates.length >= maxCandidates) {
          return;
        }
        const x = Math.max(0, Math.min(width - 1, Math.floor(startX)));
        const y = Math.max(0, Math.min(height - 1, Math.floor(startY)));
        const w = Math.max(1, Math.min(width - x, Math.floor(cropWidth)));
        const h = Math.max(1, Math.min(height - y, Math.floor(cropHeight)));
        const key = x + ',' + y + ',' + w + ',' + h;
        if (seen.has(key) || (w === width && h === height)) {
          return;
        }
        seen.add(key);
        candidates.push(extractRegionImageData(imageData, x, y, w, h));
      }

      for (let r = 0; r < ratios.length; r++) {
        if (candidates.length >= maxCandidates) {
          break;
        }
        const ratio = ratios[r];
        const cropWidth = Math.max(80, Math.floor(width * ratio));
        const cropHeight = Math.max(80, Math.floor(height * ratio));
        const maxX = Math.max(0, width - cropWidth);
        const maxY = Math.max(0, height - cropHeight);
        for (let a = 0; a < anchors.length; a++) {
          if (candidates.length >= maxCandidates) {
            break;
          }
          const anchor = anchors[a];
          addCandidate(maxX * anchor.x, maxY * anchor.y, cropWidth, cropHeight);
        }
      }

      return candidates;
    }

    function downscaleImageData(imageData, maxSide = 960) {
      const width = imageData.width;
      const height = imageData.height;
      const largestSide = Math.max(width, height);
      if (largestSide <= maxSide) {
        return imageData;
      }

      const ratio = maxSide / largestSide;
      const targetWidth = Math.max(1, Math.floor(width * ratio));
      const targetHeight = Math.max(1, Math.floor(height * ratio));
      return resizeImageDataNearest(imageData, targetWidth, targetHeight);
    }

    function enhanceImageData(imageData, mode) {
      const width = imageData.width;
      const height = imageData.height;
      const source = imageData.data;
      const output = new Uint8ClampedArray(source.length);

      let averageLuma = 0;
      let thresholdOffset = 0;
      if (mode === 'binary' || mode === 'binaryAdaptive') {
        let lumaSum = 0;
        for (let i = 0; i < source.length; i += 4) {
          lumaSum += source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114;
        }
        averageLuma = lumaSum / (source.length / 4);
        if (mode === 'binaryAdaptive') {
          thresholdOffset = averageLuma < 110 ? -18 : (averageLuma > 180 ? 18 : 0);
        }
      }

      for (let i = 0; i < source.length; i += 4) {
        const luma = source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114;
        let value = luma;

        if (mode === 'contrast') {
          value = (luma - 128) * 1.6 + 128;
        } else if (mode === 'contrastStrong') {
          value = (luma - 128) * 2.0 + 128;
        } else if (mode === 'binary') {
          value = luma > averageLuma ? 255 : 0;
        } else if (mode === 'binaryAdaptive') {
          value = luma > (averageLuma + thresholdOffset) ? 255 : 0;
        }

        value = Math.max(0, Math.min(255, Math.round(value)));
        output[i] = value;
        output[i + 1] = value;
        output[i + 2] = value;
        output[i + 3] = 255;
      }

      return buildImageData(output, width, height);
    }

    function createCanvasFromImageData(imageData) {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    }

    function logBarcodeDetectorWarning(stage, error) {
      const reason = error && error.message ? error.message : 'unknown';
      const key = stage + '|' + reason;
      if (!barcodeDetectorWarningCache.has(key)) {
        barcodeDetectorWarningCache.add(key);
        console.warn('BarcodeDetector失败:', stage, reason);
      }
    }

    function createBarcodeDetectorInstance() {
      if (typeof BarcodeDetector === 'undefined') {
        return null;
      }

      try {
        return new BarcodeDetector({ formats: ['qr_code'] });
      } catch (error) {
        logBarcodeDetectorWarning('init_with_format', error);
      }

      try {
        return new BarcodeDetector();
      } catch (error) {
        logBarcodeDetectorWarning('init_fallback', error);
        return null;
      }
    }

    function pickBarcodeDetectorValue(detections) {
      if (!Array.isArray(detections)) {
        return null;
      }
      for (let i = 0; i < detections.length; i++) {
        const value = detections[i] && typeof detections[i].rawValue === 'string'
          ? detections[i].rawValue.trim()
          : '';
        if (value) {
          return value;
        }
      }
      return null;
    }

    async function decodeQRCodeWithBarcodeDetector(imageData, aggressiveMode = false, debugOptions = null) {
      const debugEnabled = !!(debugOptions && debugOptions.enabled);
      const debugTag = debugOptions && debugOptions.tag ? debugOptions.tag : '图片上传';
      const detector = createBarcodeDetectorInstance();
      if (!detector) {
        qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector不可用，跳过该路径');
        return null;
      }
      qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector初始化成功');

      const candidates = [imageData];
      if (aggressiveMode) {
        const upscaled = upscaleImageData(imageData, 2, 2400);
        if (upscaled !== imageData) {
          candidates.push(upscaled);
        }

        const candidateBase = upscaled !== imageData ? upscaled : imageData;
        const regionCandidates = getAggressiveRegionCandidates(candidateBase);
        for (let i = 0; i < regionCandidates.length && candidates.length < 18; i++) {
          const candidate = regionCandidates[i];
          if (candidate !== candidateBase) {
            candidates.push(candidate);
          }
        }
      }

      const maxSources = aggressiveMode ? 18 : 3;
      qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector候选集准备完成', {
        sourceSize: describeImageData(imageData),
        aggressiveMode,
        candidateTotal: candidates.length,
        maxSources
      });
      for (let i = 0; i < candidates.length && i < maxSources; i++) {
        const candidate = candidates[i];
        const candidateCanvas = createCanvasFromImageData(candidate);
        qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector开始尝试', {
          candidateIndex: i + 1,
          size: describeImageData(candidate)
        });
        try {
          const detections = await detector.detect(candidateCanvas);
          qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector尝试完成', {
            candidateIndex: i + 1,
            detectionCount: Array.isArray(detections) ? detections.length : 0
          });
          const value = pickBarcodeDetectorValue(detections);
          if (value) {
            qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector命中', {
              candidateIndex: i + 1,
              preview: maskQRCodeDataForLog(value)
            });
            return value;
          }
        } catch (error) {
          logBarcodeDetectorWarning('detect', error);
          qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector尝试异常', {
            candidateIndex: i + 1,
            reason: error && error.message ? error.message : 'unknown'
          });
        }
      }

      qrDebugLog(debugEnabled, debugTag, 'BarcodeDetector路径未命中');
      return null;
    }

    async function decodeUploadedQRCode(imageData, options = {}) {
      const aggressiveMode = options.aggressive !== false;
      const sourceName = options.sourceName || '图片上传';
      const debugEnabled = options.debug !== false;

      qrDebugLog(debugEnabled, sourceName, '开始图片二维码解析', {
        pipelineVersion: QR_PIPELINE_VERSION,
        size: describeImageData(imageData),
        aggressiveMode,
        hasBarcodeDetector: typeof BarcodeDetector !== 'undefined',
        hasJsQR: typeof jsQR !== 'undefined'
      });

      const barcodeResult = await decodeQRCodeWithBarcodeDetector(
        imageData,
        aggressiveMode,
        { enabled: debugEnabled, tag: sourceName }
      );
      if (barcodeResult) {
        qrDebugLog(debugEnabled, sourceName, 'BarcodeDetector识别成功', {
          preview: maskQRCodeDataForLog(barcodeResult)
        });
        return barcodeResult;
      }

      qrDebugLog(debugEnabled, sourceName, 'BarcodeDetector未命中，回退jsQR');
      const jsQrResult = decodeQRCode(imageData, {
        deep: true,
        aggressive: aggressiveMode,
        debugTag: sourceName,
        debugEnabled
      });
      if (jsQrResult) {
        qrDebugLog(debugEnabled, sourceName, 'jsQR识别成功', {
          preview: maskQRCodeDataForLog(jsQrResult)
        });
      } else {
        qrDebugLog(debugEnabled, sourceName, 'jsQR路径未命中');
      }
      return jsQrResult;
    }

    async function renderImageDataWithBitmap(file, maxSide, sourceName, debugEnabled) {
      if (typeof createImageBitmap === 'undefined') {
        qrDebugLog(debugEnabled, sourceName, 'createImageBitmap 不可用，跳过备用渲染');
        return null;
      }

      let bitmap = null;
      try {
        bitmap = await createImageBitmap(file, {
          imageOrientation: 'none',
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none'
        });

        let width = bitmap.width;
        let height = bitmap.height;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.max(1, Math.floor(width * ratio));
          height = Math.max(1, Math.floor(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);

        qrDebugLog(debugEnabled, sourceName, 'createImageBitmap 备用渲染成功', {
          originalSize: bitmap.width + 'x' + bitmap.height,
          renderedSize: width + 'x' + height
        });

        return imageData;
      } catch (error) {
        qrDebugLog(debugEnabled, sourceName, 'createImageBitmap 备用渲染失败', {
          reason: error && error.message ? error.message : 'unknown'
        });
        return null;
      } finally {
        if (bitmap && typeof bitmap.close === 'function') {
          bitmap.close();
        }
      }
    }

    async function decodeUploadedQRCodeWithBitmapFallback(file, primaryImageData, options = {}) {
      const aggressiveMode = options.aggressive !== false;
      const sourceName = options.sourceName || '图片上传';
      const debugEnabled = options.debug !== false;

      const primaryResult = await decodeUploadedQRCode(primaryImageData, {
        aggressive: aggressiveMode,
        sourceName,
        debug: debugEnabled
      });
      if (primaryResult) {
        return primaryResult;
      }

      qrDebugLog(debugEnabled, sourceName, '主渲染路径未命中，进入createImageBitmap备用渲染');
      const bitmapImageData = await renderImageDataWithBitmap(file, UPLOAD_DETECT_MAX_SIDE, sourceName, debugEnabled);
      if (!bitmapImageData) {
        qrDebugLog(debugEnabled, sourceName, 'createImageBitmap 备用渲染未产出图像数据，结束');
        return null;
      }

      qrDebugLog(debugEnabled, sourceName, '开始createImageBitmap二次解析', {
        size: describeImageData(bitmapImageData)
      });
      const bitmapSourceName = sourceName + '(bitmap)';
      const bitmapResult = await decodeUploadedQRCode(bitmapImageData, {
        aggressive: aggressiveMode,
        sourceName: bitmapSourceName,
        debug: debugEnabled
      });
      if (bitmapResult) {
        qrDebugLog(debugEnabled, sourceName, 'createImageBitmap二次解析成功', {
          preview: maskQRCodeDataForLog(bitmapResult)
        });
        return bitmapResult;
      }

      qrDebugLog(debugEnabled, sourceName, 'createImageBitmap二次解析未命中');
      return null;
    }

    // 使用 jsQR 进行增强解码（快速路径 + 深度路径）
    function decodeQRCode(imageData, options = {}) {
      try {
        if (typeof jsQR === 'undefined') {
          console.warn('jsQR库未加载，无法解析二维码');
          return null;
        }

        const quickOptions = [
          { inversionAttempts: 'dontInvert' },
          { inversionAttempts: 'invertFirst' },
          { inversionAttempts: 'attemptBoth' }
        ];
        const deepOptions = [
          { inversionAttempts: 'attemptBoth' },
          { inversionAttempts: 'invertFirst' }
        ];
        const debugTag = options.debugEnabled === false ? '' : (options.debugTag || '');

        qrDebugLog(!!debugTag, debugTag, '开始jsQR增强解析', {
          size: describeImageData(imageData),
          deep: !!options.deep,
          aggressive: !!options.aggressive
        });

        // 快速路径：先全图，再中心区域
        let result = runJsQRAttempts(imageData, quickOptions, debugTag, 'quick/full');
        if (result) return result;

        const centerImageData = extractCenterImageData(imageData, CENTER_CROP_RATIO);
        if (centerImageData !== imageData) {
          result = runJsQRAttempts(centerImageData, quickOptions, debugTag, 'quick/center');
          if (result) return result;
        }

        // 深度路径：仅周期性触发，避免实时扫描开销过大
        if (!options.deep) {
          qrDebugLog(!!debugTag, debugTag, '深度解析未启用，结束');
          return null;
        }

        // 上传图片等 aggressive 场景：先尝试原图增强，避免缩放插值带来的信息损失
        if (options.aggressive) {
          const fullContrast = enhanceImageData(imageData, 'contrast');
          result = runJsQRAttempts(fullContrast, deepOptions, debugTag, 'deep/aggressive-full-contrast');
          if (result) return result;

          const fullBinaryAdaptive = enhanceImageData(imageData, 'binaryAdaptive');
          result = runJsQRAttempts(fullBinaryAdaptive, deepOptions, debugTag, 'deep/aggressive-full-binaryAdaptive');
          if (result) return result;
        }

        const optimizedImageData = downscaleImageData(imageData, 960);
        const contrastImageData = enhanceImageData(optimizedImageData, 'contrast');
        result = runJsQRAttempts(contrastImageData, deepOptions, debugTag, 'deep/contrast');
        if (result) return result;

        const binaryImageData = enhanceImageData(optimizedImageData, 'binary');
        result = runJsQRAttempts(binaryImageData, deepOptions, debugTag, 'deep/binary');
        if (result) return result;

        const optimizedCenterImageData = extractCenterImageData(optimizedImageData, CENTER_CROP_RATIO);
        const centerContrast = enhanceImageData(optimizedCenterImageData, 'contrastStrong');
        result = runJsQRAttempts(centerContrast, deepOptions, debugTag, 'deep/center-contrastStrong');
        if (result) return result;

        const centerBinary = enhanceImageData(optimizedCenterImageData, 'binaryAdaptive');
        result = runJsQRAttempts(centerBinary, deepOptions, debugTag, 'deep/center-binaryAdaptive');
        if (result) return result;

        // 静态图片导入时启用更激进策略（高密度/偏位 Google 迁移码）
        if (options.aggressive) {
          const centerFocused = extractCenterImageData(imageData, CENTER_CROP_RATIO);
          if (centerFocused !== imageData) {
            const centerFocusedUpscaled = upscaleImageData(centerFocused, 2, 2200);
            result = runJsQRAttempts(centerFocusedUpscaled, deepOptions, debugTag, 'aggressive/center-upscaled');
            if (result) return result;

            const centerFocusedContrast = enhanceImageData(centerFocusedUpscaled, 'contrastStrong');
            result = runJsQRAttempts(centerFocusedContrast, deepOptions, debugTag, 'aggressive/center-upscaled-contrast');
            if (result) return result;

            const centerFocusedBinary = enhanceImageData(centerFocusedUpscaled, 'binaryAdaptive');
            result = runJsQRAttempts(centerFocusedBinary, deepOptions, debugTag, 'aggressive/center-upscaled-binaryAdaptive');
            if (result) return result;
          }

          const upscaled = upscaleImageData(imageData, 2, 2800);
          if (upscaled !== imageData) {
            result = runJsQRAttempts(upscaled, deepOptions, debugTag, 'aggressive/upscaled');
            if (result) return result;

            const upscaledCenter = extractCenterImageData(upscaled, 0.8);
            result = runJsQRAttempts(upscaledCenter, deepOptions, debugTag, 'aggressive/upscaled-center');
            if (result) return result;
          }

          const aggressiveCandidates = getAggressiveRegionCandidates(upscaled !== imageData ? upscaled : optimizedImageData);
          qrDebugLog(!!debugTag, debugTag, '进入aggressive候选扫描', {
            candidateCount: aggressiveCandidates.length
          });
          for (let i = 0; i < aggressiveCandidates.length; i++) {
            const candidate = aggressiveCandidates[i];
            result = runJsQRAttempts(candidate, deepOptions, debugTag, 'aggressive/candidate-' + (i + 1));
            if (result) return result;

            const candidateContrast = enhanceImageData(candidate, 'contrastStrong');
            result = runJsQRAttempts(candidateContrast, deepOptions, debugTag, 'aggressive/candidate-contrast-' + (i + 1));
            if (result) return result;

            const candidateBinary = enhanceImageData(candidate, 'binaryAdaptive');
            result = runJsQRAttempts(candidateBinary, deepOptions, debugTag, 'aggressive/candidate-binary-' + (i + 1));
            if (result) return result;
          }
        }

        qrDebugLog(!!debugTag, debugTag, 'jsQR增强解析结束，未命中');
        return null;
      } catch (error) {
        console.error('二维码解析失败:', error);
        return null;
      }
    }

    // 处理扫描到的二维码
    function processScannedQRCode(qrCodeData) {
      try {
        console.log('扫描到二维码:', maskQRCodeDataForLog(qrCodeData));

        // 检查是否是 Google Authenticator 迁移格式
        if (qrCodeData.startsWith('otpauth-migration://')) {
          processGoogleMigration(qrCodeData);
          return;
        }

        // 检查是否是有效的 OTP Auth URL
        if (!qrCodeData.startsWith('otpauth://totp/') && !qrCodeData.startsWith('otpauth://hotp/')) {
          showScannerError('这不是有效的2FA二维码');
          return;
        }

        // 解析 OTP Auth URL
        const url = new URL(qrCodeData);
        const pathParts = url.pathname.substring(1).split(':');
        const params = new URLSearchParams(url.search);

        // 对URL编码的部分进行解码
        const issuer = decodeURIComponent(params.get('issuer') || (pathParts.length > 1 ? pathParts[0] : ''));
        const account = decodeURIComponent(pathParts.length > 1 ? pathParts[1] : pathParts[0]);
        const secret = params.get('secret');

        // 解析类型和高级参数
        const urlType = url.protocol.replace(':', '').split('//')[1]; // 提取协议后的类型
        let type = 'TOTP';
        if (urlType === 'hotp') {
          type = 'HOTP';
        }

        const digits = parseInt(params.get('digits')) || 6;
        const period = parseInt(params.get('period')) || 30;
        const algorithm = params.get('algorithm') || 'SHA1';
        const counter = parseInt(params.get('counter')) || 0;

        if (!secret) {
          showScannerError('二维码中缺少密钥信息');
          return;
        }

        // 直接保存密钥（不显示编辑界面）
        // 连续扫描模式下不关闭扫描器，在保存成功后继续扫描
        directSaveFromQR(issuer, account, secret, { type, digits, period, algorithm, counter });

      } catch (error) {
        console.error('解析二维码失败:', error);
        showScannerError('解析二维码失败: ' + error.message);
      }
    }

    // 直接保存扫描到的密钥（不显示编辑界面）
    async function directSaveFromQR(issuer, account, secret, options = {}) {
      const newSecret = {
        name: issuer || account || '未命名',
        account: account || '',
        secret: secret.toUpperCase(),
        type: options.type || 'TOTP',
        digits: options.digits || 6,
        period: options.period || 30,
        algorithm: options.algorithm || 'SHA1',
        counter: options.counter || 0
      };

      try {
        showCenterToast('⏳', '正在保存...');

        const response = await authenticatedFetch('/api/secrets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newSecret)
        });

        if (response.ok) {
          const result = await response.json();
          console.log('密钥保存成功:', result);
          showCenterToast('✅', '密钥添加成功：' + newSecret.name);
          // 刷新密钥列表
          loadSecrets();

          // 连续扫描模式处理
          if (continuousScanMode) {
            // 更新计数
            updateScanCount();
            // 继续扫描（延迟一下让用户看到提示）
            setTimeout(() => {
              if (isScanning && continuousScanMode) {
                console.log('连续扫描模式：继续扫描下一个二维码');
                scanForQRCode();
              }
            }, 800);
          } else {
            // 非连续模式，关闭扫描器
            hideQRScanner();
          }
        } else {
          const errorText = await response.text();
          console.error('保存密钥失败:', response.status, errorText);
          // 解析错误信息，只显示简短提示
          let errorMsg = '保存失败';
          try {
            const errorJson = JSON.parse(errorText);
            if (response.status === 409) {
              errorMsg = '"' + newSecret.name + '"已存在';
            } else {
              errorMsg = errorJson.error || errorJson.message || errorText;
            }
          } catch (e) {
            errorMsg = errorText;
          }
          showCenterToast('❌', errorMsg);
          // 失败时也继续扫描（如果是连续模式）
          if (continuousScanMode && isScanning) {
            setTimeout(() => scanForQRCode(), 1000);
          }
        }
      } catch (error) {
        console.error('保存密钥出错:', error);
        showCenterToast('❌', '保存出错：' + error.message);
        // 出错时也继续扫描（如果是连续模式）
        if (continuousScanMode && isScanning) {
          setTimeout(() => scanForQRCode(), 1000);
        }
      }
    }

    // 上传图片扫描二维码
    function uploadImageForScan() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = async function() {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                throw new Error('无法创建图片绘图上下文');
              }

              canvas.width = img.width;
              canvas.height = img.height;
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(img, 0, 0);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const qrCode = await decodeUploadedQRCodeWithBitmapFallback(file, imageData, {
                aggressive: true,
                sourceName: '主扫码图片导入'
              });

              if (qrCode) {
                hideQRScanner();
                processScannedQRCode(qrCode);
              } else {
                showCenterToast('❌', '未在图片中找到二维码，请尝试其他图片');
              }
            } catch (error) {
              console.error('图片导入解析失败:', error);
              showCenterToast('❌', '图片导入解析失败，请重试');
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }

    // 处理图片上传和解析
    function handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file) {
        console.log('没有选择文件');
        return;
      }

      console.log('选择了文件:', file.name, file.type, file.size);

      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        showScannerError('请选择图片文件（支持 JPG、PNG、GIF、WebP 等格式）');
        return;
      }

      // 检查文件大小（限制为10MB）
      if (file.size > 10 * 1024 * 1024) {
        showScannerError('图片文件过大，请选择小于10MB的图片');
        return;
      }

      // 显示加载状态
      const status = document.getElementById('scannerStatus');
      const error = document.getElementById('scannerError');
      const originalText = status.textContent;

      status.textContent = '正在分析图片...';
      status.style.display = 'block';
      status.style.color = '#17a2b8';
      error.style.display = 'none';

      console.log('开始处理图片文件...');

      // 创建 FileReader
      const reader = new FileReader();

      reader.onload = function(e) {
        console.log('FileReader加载完成');

        try {
          // 创建图片元素
          const img = new Image();

          img.onload = async function() {
            console.log('图片加载成功，尺寸:', img.width + 'x' + img.height);

            try {
              // 创建 canvas 来处理图片
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                throw new Error('无法创建图片绘图上下文');
              }

              // 限制最大尺寸以提高性能
              let { width, height } = img;
              const maxSize = UPLOAD_DETECT_MAX_SIDE;

              if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
                console.log('缩放图片到:', width + 'x' + height);
              } else {
                console.log('保持原始尺寸解析:', width + 'x' + height);
              }

              // 设置 canvas 尺寸
              canvas.width = width;
              canvas.height = height;

              // 将图片绘制到 canvas
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(img, 0, 0, width, height);

              // 获取图像数据
              const imageData = ctx.getImageData(0, 0, width, height);
              console.log('获取图像数据成功，像素数:', imageData.data.length / 4);

              // 尝试解析二维码（增强模式）
              status.textContent = '正在智能解析二维码...';
              const qrCode = await decodeUploadedQRCodeWithBitmapFallback(file, imageData, {
                aggressive: true,
                sourceName: '主扫码图片上传'
              });

              if (qrCode) {
                status.textContent = '二维码解析成功！';
                status.style.color = '#4CAF50';

                console.log('成功解析到二维码:', maskQRCodeDataForLog(qrCode));

                // 处理解析到的二维码
                setTimeout(() => {
                  processScannedQRCode(qrCode);
                }, 1000);
              } else {
                console.log('未找到二维码');
                showScannerError('未在图片中找到有效的二维码' + '\\n\\n' + '请确保：' + '\\n' + '• 图片清晰度足够' + '\\n' + '• 二维码完整可见' + '\\n' + '• 包含有效的2FA二维码');
              }
            } catch (error) {
              console.error('图片处理失败:', error);
              showScannerError('图片处理失败: ' + error.message);
            }
          };

          img.onerror = function() {
            console.error('图片加载失败');
            showScannerError('图片加载失败，请选择有效的图片文件' + '\\n' + '支持格式：JPG、PNG、GIF、WebP');
          };

          // 设置图片源
          img.src = e.target.result;

        } catch (error) {
          console.error('图片读取失败:', error);
          showScannerError('图片读取失败: ' + error.message);
        }
      };

      reader.onerror = function() {
        console.error('FileReader读取失败');
        showScannerError('文件读取失败，请重试');
      };

      reader.onprogress = function(e) {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          status.textContent = '正在加载图片... ' + percent + '%';
        }
      };

      // 读取文件为 data URL
      reader.readAsDataURL(file);

      // 清空文件输入，允许重复选择同一文件
      event.target.value = '';
    }
`;
}

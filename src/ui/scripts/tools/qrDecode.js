/**
 * 二维码解析工具模块
 */

/**
 * 获取二维码解析工具代码
 * @returns {string} 二维码解析工具 JavaScript 代码
 */
export function getQRDecodeToolCode() {
	return `    // ==================== 二维码解析工具 ====================

    let decodeStream = null;
    let isDecodeScanning = false;
    let decodeFrameCounter = 0;
    let lastDecodeAttemptAt = 0;
    let decodeCanvas = null;
    let decodeContext = null;
    let decodeBarcodeDetector = null;
    let decodeBarcodeDetectorPending = false;
    const DECODE_MIN_INTERVAL_MS = 80;
    const DEEP_DECODE_INTERVAL = 4;

    // 确保二维码主模块已加载（摄像头、解码管线等共享函数均在其中）
    async function ensureQRCodeModule() {
      if (typeof loadModule === 'function') {
        await loadModule('qrcode');
      }
    }

    function showQRDecodeModal() {
      showModal('qrDecodeModal', () => {
        document.getElementById('decodeScannerContainer').style.display = 'none';
        document.getElementById('decodeResultSection').style.display = 'none';
        document.getElementById('decodeQRSection').style.display = 'none';
      });
    }

    function hideQRDecodeModal() {
      hideModal('qrDecodeModal', () => {
        stopDecodeScanner();
      });
    }

    function startQRDecodeScanner() {
      const container = document.getElementById('decodeScannerContainer');
      const status = document.getElementById('decodeScannerStatus');
      const error = document.getElementById('decodeScannerError');

      container.style.display = 'block';
      error.style.display = 'none';
      status.textContent = '正在启动摄像头...';
      status.style.display = 'block';

      startDecodeCamera();
    }

    async function startDecodeCamera() {
      const video = document.getElementById('decodeScannerVideo');
      const status = document.getElementById('decodeScannerStatus');
      const error = document.getElementById('decodeScannerError');
      const errorMessage = document.getElementById('decodeErrorMessage');

      try {
        // 加载二维码主模块，获取共享的摄像头和解码函数
        await ensureQRCodeModule();

        // 停止之前的流（如果存在）
        if (decodeStream) {
          decodeStream.getTracks().forEach(track => track.stop());
          decodeStream = null;
        }

        decodeStream = await openCameraStream(video);

        status.textContent = '';
        status.style.display = 'none';
        isDecodeScanning = true;
        decodeFrameCounter = 0;
        lastDecodeAttemptAt = 0;
        if (!decodeCanvas) {
          decodeCanvas = document.createElement('canvas');
          decodeContext = decodeCanvas.getContext('2d', { willReadFrequently: true });
        }

        if (!decodeBarcodeDetector) {
          decodeBarcodeDetector = createBarcodeDetectorInstance();
        }

        setTimeout(() => {
          if (isDecodeScanning) {
            scanForDecodeQRCode();
          }
        }, 500);

      } catch (err) {
        errorMessage.textContent = getCameraErrorMessage(err);
        error.style.display = 'block';
        status.style.display = 'none';
      }
    }

    function stopDecodeScanner() {
      isDecodeScanning = false;
      decodeFrameCounter = 0;
      lastDecodeAttemptAt = 0;
      decodeBarcodeDetectorPending = false;
      if (decodeStream) {
        decodeStream.getTracks().forEach(track => track.stop());
        decodeStream = null;
      }
    }

    function retryDecodeCamera() {
      document.getElementById('decodeScannerError').style.display = 'none';
      startDecodeCamera();
    }

    function scanForDecodeQRCode() {
      if (!isDecodeScanning) return;
      const now = Date.now();
      if (now - lastDecodeAttemptAt < DECODE_MIN_INTERVAL_MS) {
        requestAnimationFrame(scanForDecodeQRCode);
        return;
      }
      lastDecodeAttemptAt = now;

      const video = document.getElementById('decodeScannerVideo');

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          if (videoWidth > 0 && videoHeight > 0 && decodeCanvas && decodeContext) {
            decodeCanvas.width = videoWidth;
            decodeCanvas.height = videoHeight;
            decodeContext.drawImage(video, 0, 0, videoWidth, videoHeight);
            const imageData = decodeContext.getImageData(0, 0, videoWidth, videoHeight);
            decodeFrameCounter++;
            const deepMode = decodeFrameCounter % DEEP_DECODE_INTERVAL === 0;

            // 优先使用 BarcodeDetector（异步，更准确）
            if (decodeBarcodeDetector && !decodeBarcodeDetectorPending) {
              decodeBarcodeDetectorPending = true;
              const candidateCanvas = createCanvasFromImageData(imageData);
              decodeBarcodeDetector.detect(candidateCanvas).then(function(detections) {
                decodeBarcodeDetectorPending = false;
                if (!isDecodeScanning) return;
                const value = pickBarcodeDetectorValue(detections);
                if (value) {
                  console.log('工具BarcodeDetector扫描成功');
                  processDecodeResult(value);
                  return;
                }
              }).catch(function(err) {
                decodeBarcodeDetectorPending = false;
              });
            }

            // paulmillr/qr 同步解码（快速、高精度）
            if (paulmillrDecodeQR) {
              const pmResult = tryPaulmillrDecode(imageData, '');
              if (pmResult) {
                console.log('工具paulmillr/qr扫描成功');
                processDecodeResult(pmResult);
                return;
              }
            }

            // jsQR 同步解码
            const qrCode = decodeQRCode(imageData, { deep: deepMode });

            if (qrCode) {
              console.log('二维码解析成功:', maskQRCodeDataForLog(qrCode));
              processDecodeResult(qrCode);
              return;
            }
          }
        } catch (error) {
          console.error('扫描过程出错:', error);
        }
      }

      requestAnimationFrame(scanForDecodeQRCode);
    }

    function processDecodeResult(qrCodeData) {
      // 停止扫描
      stopDecodeScanner();
      document.getElementById('decodeScannerContainer').style.display = 'none';

      // 显示结果
      const resultContent = document.getElementById('decodeResultContent');
      const resultSection = document.getElementById('decodeResultSection');

      resultContent.textContent = qrCodeData;
      resultSection.style.display = 'block';

      showCenterToast('✅', '二维码解析成功');
    }

    function uploadImageForDecode() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showCenterToast('❌', '请选择图片文件');
          return;
        }

        if (file.size > 10 * 1024 * 1024) {
          showCenterToast('❌', '图片文件过大，请选择小于10MB的图片');
          return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = async function() {
            try {
              // 加载二维码主模块，复用与"导入数据"完全相同的解码管线
              await ensureQRCodeModule();

              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');

              // 限制最大尺寸（与主模块 handleImageUpload 一致）
              let width = img.width;
              let height = img.height;
              const maxSize = typeof UPLOAD_DETECT_MAX_SIDE !== 'undefined' ? UPLOAD_DETECT_MAX_SIDE : 2200;

              if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width = Math.floor(width * ratio);
                height = Math.floor(height * ratio);
              }

              canvas.width = width;
              canvas.height = height;
              ctx.imageSmoothingEnabled = false;
              ctx.drawImage(img, 0, 0, width, height);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

              // 直接调用主模块的完整解码管线（与二维码导入完全一致）
              const qrCode = await decodeUploadedQRCodeWithBitmapFallback(file, imageData, {
                aggressive: true,
                sourceName: '工具二维码图片上传'
              });

              if (qrCode) {
                processDecodeResult(qrCode);
              } else {
                showCenterToast('❌', '未在图片中找到二维码，请尝试其他图片');
              }
            } catch (error) {
              console.error('工具模块图片解析失败:', error);
              showCenterToast('❌', '图片解析失败，请重试');
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }

    async function copyDecodeResult() {
      const content = document.getElementById('decodeResultContent').textContent;
      if (!content) {
        showCenterToast('❌', '没有可复制的内容');
        return;
      }

      try {
        await navigator.clipboard.writeText(content);
        showCenterToast('✅', '内容已复制到剪贴板');
      } catch (error) {
        showCenterToast('❌', '复制失败');
      }
    }

    async function generateDecodeQRCode() {
      const content = document.getElementById('decodeResultContent').textContent;
      if (!content) {
        showCenterToast('❌', '没有可生成二维码的内容');
        return;
      }

      const qrImage = document.getElementById('decodeQRCode');

      try {
        let qrDataURL = null;

        // 使用客户端本地生成二维码（隐私安全）
        qrDataURL = await generateQRCodeDataURL(content, {
          width: 200,
          height: 200
        });

        qrImage.src = qrDataURL;
        qrImage.onload = function() {
          document.getElementById('decodeQRSection').style.display = 'block';
        };
        qrImage.onerror = function() {
          showCenterToast('❌', '二维码生成失败');
        };

      } catch (error) {
        console.error('二维码生成过程发生错误:', error);
        showCenterToast('❌', '二维码生成失败: ' + error.message);
      }
    }

`;
}

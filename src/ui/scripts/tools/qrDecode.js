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

        if (!decodeBarcodeDetector && typeof createBarcodeDetectorInstance === 'function') {
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

    function decodeQRCodeForTool(imageData, deepMode, aggressiveMode = false) {
      return decodeQRCode(imageData, { deep: deepMode, aggressive: aggressiveMode });
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
      const status = document.getElementById('decodeScannerStatus');

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
            if (decodeBarcodeDetector && !decodeBarcodeDetectorPending && typeof createCanvasFromImageData === 'function' && typeof pickBarcodeDetectorValue === 'function') {
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
            const qrCode = decodeQRCodeForTool(imageData, deepMode, false);

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

        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = async function() {
            try {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');

              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const qrCode = typeof decodeUploadedQRCodeWithBitmapFallback === 'function'
                ? await decodeUploadedQRCodeWithBitmapFallback(file, imageData, {
                    aggressive: true,
                    sourceName: '工具二维码图片上传'
                  })
                : (typeof decodeUploadedQRCode === 'function'
                    ? await decodeUploadedQRCode(imageData, {
                        aggressive: true,
                        sourceName: '工具二维码图片上传'
                      })
                    : decodeQRCodeForTool(imageData, true, true));

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

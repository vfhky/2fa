/**
 * 备份模块
 * 包含所有备份/恢复功能，用于管理密钥备份
 */

/**
 * 获取备份相关代码
 * @returns {string} 备份 JavaScript 代码
 */
export function getBackupCode() {
	return `    // ========== 备份恢复功能模块 ==========

    // 还原配置相关函数
    let selectedBackup = null;
    let backupList = [];
    let backupExportFormat = 'txt'; // 备份导出格式

    function setBackupActionStates(hasSelection, hasBackups) {
      const confirmRestoreBtn = document.getElementById('confirmRestoreBtn');
      const exportBackupBtn = document.getElementById('exportBackupBtn');
      const deleteSelectedBackupBtn = document.getElementById('deleteSelectedBackupBtn');
      const deleteAllBackupsBtn = document.getElementById('deleteAllBackupsBtn');

      if (confirmRestoreBtn) {
        confirmRestoreBtn.disabled = !hasSelection;
      }
      if (exportBackupBtn) {
        exportBackupBtn.disabled = !hasSelection;
      }
      if (deleteSelectedBackupBtn) {
        deleteSelectedBackupBtn.disabled = !hasSelection;
      }
      if (deleteAllBackupsBtn) {
        deleteAllBackupsBtn.disabled = !hasBackups;
      }
    }

    function clearBackupSelection() {
      selectedBackup = null;
      const backupSelectElement = document.getElementById('backupSelect');
      const previewElement = document.getElementById('restorePreview');

      if (backupSelectElement) {
        backupSelectElement.value = '';
      }
      if (previewElement) {
        previewElement.style.display = 'none';
      }
    }

    function showRestoreModal() {
      showModal('restoreModal', () => {
        loadBackupList();
      });
    }

    function hideRestoreModal() {
      hideModal('restoreModal', () => {
        clearBackupSelection();
        setBackupActionStates(false, false);
      });
    }

    async function loadBackupList() {
      const backupSelectElement = document.getElementById('backupSelect');
      backupList = [];
      backupSelectElement.innerHTML = '<option value="">正在加载备份列表...</option>';
      backupSelectElement.disabled = true;
      clearBackupSelection();
      setBackupActionStates(false, false);

      try {
	        // 加载所有备份（不限数量，列表页使用轻量模式避免高开销）
	        const response = await authenticatedFetch('/api/backup?limit=all&details=false');
        if (!response.ok) {
          throw new Error('获取备份列表失败');
        }

        const data = await response.json();
        backupList = data.backups || [];

        if (backupList.length === 0) {
          backupSelectElement.innerHTML = '<option value="">暂无备份文件</option>';
          backupSelectElement.disabled = true;
          setBackupActionStates(false, false);
          return;
        }

        // 渲染备份下拉选择框
        renderBackupSelect(backupList);
        backupSelectElement.disabled = false;
        setBackupActionStates(false, true);
	      } catch (error) {
	        backupList = [];
	        console.error('加载备份列表失败:', error);
	        backupSelectElement.innerHTML = '<option value="">加载备份列表失败: ' + escapeHTML(error.message || '未知错误') + '</option>';
	        backupSelectElement.disabled = true;
	        setBackupActionStates(false, false);
	      }
	    }

    function renderBackupSelect(backups) {
      const backupSelectElement = document.getElementById('backupSelect');
      backupSelectElement.innerHTML = '<option value="">请选择备份文件...</option>';

      backups.forEach((backup, index) => {
        // 格式化日期为简洁格式，适配移动设备
        const date = new Date(backup.created);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        // 移动端优化：格式 "年-月-日 时:分 | 数量个"
        // 例如：2025-11-24 19:50 | 117个
        const backupTime = year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
        const countValue = Number.isFinite(backup.count) ? backup.count : null;
        const countText = countValue === null || countValue < 0 ? '未知' : (countValue + '个');
        const optionText = backupTime + ' | ' + countText;

        const option = document.createElement('option');
        option.value = index;
        option.textContent = optionText;
        option.dataset.backupKey = backup.key;
        // 保存完整时间信息在 title 属性中，用于悬停提示
        const titleSuffix = countText === '未知' ? '（条目数未知，旧备份可通过预览获取真实数量）' : '';
        option.title = new Date(backup.created).toLocaleString('zh-CN') + titleSuffix;

        backupSelectElement.appendChild(option);
      });
    }

    function selectBackupFromDropdown() {
      const backupSelectElement = document.getElementById('backupSelect');
      const selectedIndex = backupSelectElement.value;

      if (selectedIndex === '' || selectedIndex === null) {
        clearBackupSelection();
        setBackupActionStates(false, backupList.length > 0);
        return;
      }

      const backup = backupList[parseInt(selectedIndex, 10)];
      if (backup) {
        selectBackup(backup, parseInt(selectedIndex, 10));
      }
    }

    async function selectBackup(backup, index) {
      selectedBackup = backup;
      setBackupActionStates(true, backupList.length > 0);

      // 显示备份预览
      await showBackupPreview(backup);
    }

	    async function showBackupPreview(backup) {
	      const previewElement = document.getElementById('restorePreview');
	      const previewContent = document.getElementById('backupPreviewContent');

      previewElement.style.display = 'block';
      previewContent.innerHTML = '<div class="loading-backup">正在加载备份内容...</div>';

      try {
        const response = await authenticatedFetch('/api/backup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ backupKey: backup.key, preview: true })
        });

        if (!response.ok) {
          throw new Error('获取备份内容失败');
        }

        const responseData = await response.json();
        const data = responseData.data || responseData; // 兼容不同的响应格式

	        if (data.secrets && data.secrets.length > 0) {
	          previewContent.innerHTML =
	            '<div class="backup-table-container">' +
	              '<table class="backup-table">' +
                '<thead>' +
                  '<tr>' +
                    '<th>服务</th>' +
                    '<th>账户</th>' +
                    '<th>类型</th>' +
                    '<th>创建时间</th>' +
                  '</tr>' +
                '</thead>' +
	                '<tbody>' +
	                  data.secrets.map(secret =>
	                    '<tr class="backup-table-row">' +
	                      '<td class="backup-service-name">' + escapeHTML(secret.name || '未命名服务') + '</td>' +
	                      '<td class="backup-account-info">' + escapeHTML(secret.account || secret.service || '未设置账户') + '</td>' +
	                      '<td class="backup-secret-type">' + escapeHTML(((secret.type || 'TOTP') + '').toUpperCase()) + '</td>' +
	                      '<td class="backup-created-time">' + escapeHTML(secret.createdAt ? new Date(secret.createdAt).toLocaleString('zh-CN') : '未知') + '</td>' +
	                    '</tr>'
	                  ).join('') +
	                '</tbody>' +
	              '</table>' +
	            '</div>';
	        } else {
	          previewContent.innerHTML = '<div class="no-backups">此备份中没有密钥</div>';
	        }
	      } catch (error) {
	        console.error('加载备份预览失败:', error);
	        previewContent.innerHTML = '<div class="no-backups">加载备份预览失败: ' + escapeHTML(error.message || '未知错误') + '</div>';
	      }
	    }

    async function confirmRestore() {
      if (!selectedBackup) {
        showCenterToast('❌', '请先选择一个备份文件');
        return;
      }

      const confirmed = confirm('确定要还原备份 "' + selectedBackup.key.replace('backup_', '').replace('.json', '') + '" 吗？\\n\\n⚠️ 此操作将覆盖当前所有密钥，且无法撤销！');

      if (!confirmed) {
        return;
      }

      const confirmBtn = document.getElementById('confirmRestoreBtn');
      const originalText = confirmBtn.textContent;
      confirmBtn.textContent = '还原中...';
      confirmBtn.disabled = true;

      try {
        const response = await authenticatedFetch('/api/backup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ backupKey: selectedBackup.key })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '还原失败');
        }

        const result = await response.json();
        showCenterToast('✅', '还原成功！恢复了 ' + result.count + ' 个密钥');

        // 关闭模态框并刷新页面
        hideRestoreModal();
        setTimeout(() => {
          location.reload();
        }, 1000);

      } catch (error) {
        console.error('还原失败:', error);
        showCenterToast('❌', '还原失败: ' + error.message);
      } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
      }
    }

    async function deleteSelectedBackup() {
      if (!selectedBackup) {
        showCenterToast('❌', '请先选择一个备份文件');
        return;
      }

      const backupLabel = selectedBackup.key.replace('backup_', '').replace('.json', '');
      const confirmed = confirm('确定删除备份 "' + backupLabel + '" 吗？\\n\\n⚠️ 删除后将无法恢复此备份！');
      if (!confirmed) {
        return;
      }

      const deleteBtn = document.getElementById('deleteSelectedBackupBtn');
      const originalText = deleteBtn.textContent;
      deleteBtn.textContent = '删除中...';
      deleteBtn.disabled = true;

      try {
        const response = await authenticatedFetch('/api/backup', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ keys: [selectedBackup.key] })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || result.error || '删除失败');
        }
        if (result.success !== true && (result.failedCount || 0) > 0) {
          throw new Error(result.message || '删除未完成');
        }

        showCenterToast('✅', '备份删除成功');
        clearBackupSelection();
        await loadBackupList();
      } catch (error) {
        console.error('删除备份失败:', error);
        showCenterToast('❌', '删除失败: ' + error.message);
      } finally {
        deleteBtn.textContent = originalText;
        setBackupActionStates(!!selectedBackup, backupList.length > 0);
      }
    }

    async function deleteAllBackups() {
      if (!Array.isArray(backupList) || backupList.length === 0) {
        showCenterToast('ℹ️', '当前没有可删除的备份');
        return;
      }

      const confirmed = confirm(
        '确定删除全部 ' +
        backupList.length +
        ' 个备份吗？\\n\\n⚠️ 该操作不可撤销，建议先导出需要保留的备份。'
      );
      if (!confirmed) {
        return;
      }

      const deleteAllBtn = document.getElementById('deleteAllBackupsBtn');
      const originalText = deleteAllBtn.textContent;
      deleteAllBtn.textContent = '删除中...';
      deleteAllBtn.disabled = true;

      try {
        const response = await authenticatedFetch('/api/backup', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ all: true })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || result.error || '删除失败');
        }
        if (result.success !== true && (result.failedCount || 0) > 0) {
          throw new Error(result.message || '删除未完成');
        }

        showCenterToast('✅', '已删除 ' + (result.deletedCount || 0) + ' 个备份');
        clearBackupSelection();
        await loadBackupList();
      } catch (error) {
        console.error('删除全部备份失败:', error);
        showCenterToast('❌', '删除失败: ' + error.message);
      } finally {
        deleteAllBtn.textContent = originalText;
        setBackupActionStates(!!selectedBackup, backupList.length > 0);
      }
    }

    // 显示备份导出格式选择模态框
    function exportSelectedBackup() {
      if (!selectedBackup) {
        showCenterToast('❌', '请先选择一个备份文件');
        return;
      }

      // 显示格式选择模态框
      showBackupExportFormatModal();
    }

    function showBackupExportFormatModal() {
      showModal('backupExportFormatModal');
    }

    function hideBackupExportFormatModal() {
      hideModal('backupExportFormatModal');
    }

    // 选择备份导出格式并执行导出
    async function selectBackupExportFormat(format) {
      backupExportFormat = format;
      hideBackupExportFormatModal();

      await executeBackupExport(format);
    }

    async function executeBackupExport(format) {
      if (!selectedBackup) {
        showCenterToast('❌', '请先选择一个备份文件');
        return;
      }

      try {
        // HTML 格式需要在前端生成（包含二维码）
        // 复用 export.js 中的通用导出函数
        if (format === 'html') {
          await exportBackupAsHTML();
          return;
        }

        // 其他格式通过后端API导出（更高效）
        showCenterToast('ℹ️', '正在导出备份文件...');

        // 添加format参数到URL
        const exportUrl = '/api/backup/export/' + selectedBackup.key + '?format=' + format;
        const response = await authenticatedFetch(exportUrl);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '导出失败');
        }

        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = selectedBackup.key;
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }

        // 创建下载链接
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        const formatNames = {
          'txt': 'OTPAuth 文本',
          'json': 'JSON 数据',
          'csv': 'CSV 表格'
        };
        const formatName = formatNames[format] || format.toUpperCase();
        showCenterToast('✅', '备份文件已导出为 ' + formatName + ' 格式！');
      } catch (error) {
        console.error('导出备份失败:', error);
        showCenterToast('❌', '导出失败: ' + error.message);
      }
    }

    // 导出备份为 HTML 格式 - 复用 export.js 中的通用函数
    async function exportBackupAsHTML() {
      try {
        showCenterToast('📋', '正在获取备份数据...');

        // 获取备份数据
        const response = await authenticatedFetch('/api/backup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ backupKey: selectedBackup.key, preview: true })
        });

        if (!response.ok) {
          throw new Error('获取备份内容失败');
        }

        const responseData = await response.json();
        const data = responseData.data || responseData;

        if (!data.secrets || data.secrets.length === 0) {
          throw new Error('备份中没有密钥数据');
        }

        // 按服务名称排序
        const sortedSecrets = [...data.secrets].sort((a, b) => {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          if (nameA < nameB) return -1;
          if (nameA > nameB) return 1;
          return 0;
        });

        // 生成文件名前缀（从备份文件名中提取日期）
        const dateMatch = selectedBackup.key.match(/backup_(\\\\d{4}-\\\\d{2}-\\\\d{2})/);
        const dateStr = dateMatch ? dateMatch[1] : '';
        const filenamePrefix = dateStr ? '2FA-backup-' + dateStr : '2FA-backup';

        // 调用 export.js 中的通用导出函数
        await exportSecretsAsFormat(sortedSecrets, 'html', {
          filenamePrefix: filenamePrefix,
          source: 'backup',
          metadata: {
            backupKey: selectedBackup.key,
            backupDate: selectedBackup.created
          }
        });

      } catch (error) {
        console.error('HTML导出失败:', error);
        showCenterToast('❌', 'HTML导出失败: ' + error.message);
      }
    }
`;
}

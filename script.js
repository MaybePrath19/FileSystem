// GitHub File Storage - WITH FALLBACK

const CONFIG = {
    GITHUB_API: 'https://api.github.com',
    CHUNK_SIZE: 20 * 1024 * 1024,
    MAX_FILE_SIZE: 50 * 1024 * 1024 * 1024,
    PARALLEL_BATCH: 5,
    ASSETS_FOLDER: 'files',
    DATA_FILE: 'data.json',
};

const FILE_CATEGORIES = {
    game: { extensions: ['iso', 'exe', 'msi', 'dmg', 'app', 'apk', 'obb', 'xapk', 'gba', 'nes', 'snes', 'zip'], icon: '🎮' },
    archive: { extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'], icon: '📦' },
    video: { extensions: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'webm', 'mpg', 'mpeg', 'm4v'], icon: '🎬' },
    image: { extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico'], icon: '🖼️' },
    document: { extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'], icon: '📄' },
    executable: { extensions: ['exe', 'msi', 'dmg', 'app', 'sh', 'bat', 'cmd'], icon: '⚙️' },
    iso: { extensions: ['iso', 'bin', 'cue'], icon: '💿' },
    apk: { extensions: ['apk', 'xapk', 'obb'], icon: '📱' },
};

let appState = {
    selectedFile: null,
    settings: { token: '', owner: '', repo: '', branch: 'main' },
    isUploading: false,
    isDownloading: false,
    dataJson: { version: '1.0', createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(), files: [] },
};

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();

    // Try to load from GitHub Actions secrets first
    await loadFromGitHubActions();

    // If not loaded, try sessionStorage
    if (!validateSettings()) {
        loadFromSessionStorage();
    }

    // Update UI
    updateSettingsUI();

    if (validateSettings()) {
        addLog('✓ Settings loaded', 'success');
        loadUploadedFiles();
    }
});

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('click', () => document.getElementById('fileInput').click());
    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length) {
            document.getElementById('fileInput').files = files;
            handleFileSelect({ target: { files } });
        }
    });

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('uploadBtn').addEventListener('click', startUpload);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('testSettingsBtn').addEventListener('click', testConnection);
    document.getElementById('clearSettingsBtn').addEventListener('click', clearSettings);
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    document.getElementById('categoryFilter').addEventListener('change', filterFiles);
}

// Try to load from GitHub Actions workflow (if injected)
async function loadFromGitHubActions() {
    try {
        if (typeof window.__GITHUB_SECRETS__ !== 'undefined') {
            const secrets = window.__GITHUB_SECRETS__;
            if (secrets.PAT_TOKEN && secrets.REPO_OWNER && secrets.REPO_NAME) {
                appState.settings = {
                    token: secrets.PAT_TOKEN,
                    owner: secrets.REPO_OWNER,
                    repo: secrets.REPO_NAME,
                    branch: secrets.REPO_BRANCH || 'main',
                };
                addLog('✓ Loaded from GitHub Actions', 'success');
                return true;
            }
        }
        return false;
    } catch (error) {
        console.log('GitHub Actions load error');
        return false;
    }
}

function loadFromSessionStorage() {
    try {
        const saved = sessionStorage.getItem('__SETTINGS__');
        if (saved) {
            appState.settings = JSON.parse(saved);
        }
    } catch (error) {
        console.log('SessionStorage load error');
    }
}

function updateSettingsUI() {
    document.getElementById('patToken').value = appState.settings.token;
    document.getElementById('repoOwner').value = appState.settings.owner;
    document.getElementById('repoName').value = appState.settings.repo;
    document.getElementById('repoBranch').value = appState.settings.branch;
}

function saveSettings() {
    appState.settings.token = document.getElementById('patToken').value;
    appState.settings.owner = document.getElementById('repoOwner').value;
    appState.settings.repo = document.getElementById('repoName').value;
    appState.settings.branch = document.getElementById('repoBranch').value;

    if (!validateSettings()) {
        showStatus('Fill all required fields', 'error');
        return;
    }

    sessionStorage.setItem('__SETTINGS__', JSON.stringify(appState.settings));
    showStatus('Settings saved!', 'success');
    addLog('✓ Settings saved to browser', 'success');
}

function clearSettings() {
    if (!confirm('Clear all settings?')) return;

    appState.settings = { token: '', owner: '', repo: '', branch: 'main' };
    updateSettingsUI();
    sessionStorage.removeItem('__SETTINGS__');
    showStatus('Settings cleared', 'info');
}

async function testConnection() {
    if (!validateSettings()) {
        showStatus('Fill settings first', 'error');
        return;
    }

    try {
        const result = document.getElementById('testResult');
        result.style.display = 'block';
        result.innerHTML = 'Testing connection...';

        const response = await fetch(`${CONFIG.GITHUB_API}/user`, {
            headers: { 'Authorization': `token ${appState.settings.token}` },
        });

        if (response.ok) {
            const data = await response.json();
            result.innerHTML = `✓ Connected! Logged in as: <strong>${data.login}</strong>`;
            result.className = 'info-box success';
            addLog(`✓ Connected as ${data.login}`, 'success');
        } else if (response.status === 401) {
            result.innerHTML = '✗ Invalid token - check GitHub settings';
            result.className = 'info-box error';
        } else {
            result.innerHTML = `✗ Error: HTTP ${response.status}`;
            result.className = 'info-box error';
        }
    } catch (error) {
        document.getElementById('testResult').innerHTML = `✗ Error: ${error.message}`;
        document.getElementById('testResult').className = 'info-box error';
    }
}

function detectFileCategory(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    for (const [category, data] of Object.entries(FILE_CATEGORIES)) {
        if (data.extensions.includes(ext)) return category;
    }
    return 'other';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'files') loadUploadedFiles();
    else if (tabName === 'stats') {
        updateStorageInfo();
        updateStatistics();
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showStatus(`File exceeds 50GB`, 'error');
        return;
    }

    appState.selectedFile = file;
    const category = detectFileCategory(file.name);

    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatBytes(file.size);
    document.getElementById('fileType').textContent = file.type || 'Unknown';

    const badge = document.getElementById('fileCategory');
    badge.textContent = category.toUpperCase();
    badge.className = `category-badge ${category}`;

    document.getElementById('uploadBtn').style.display = 'block';
}

async function startUpload() {
    if (appState.isUploading || !appState.selectedFile) return;

    if (!validateSettings()) {
        showStatus('Configure settings first', 'error');
        switchTab('settings');
        return;
    }

    appState.isUploading = true;
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('uploadLog').style.display = 'block';
    document.getElementById('logContent').innerHTML = '';

    try {
        addLog(`Uploading: ${appState.selectedFile.name}`, 'info');

        addLog('Compressing...', 'info');
        const compressed = await compressFile(appState.selectedFile);
        addLog(`✓ ${formatBytes(compressed.size)}`, 'success');

        const fileFolder = `${CONFIG.ASSETS_FOLDER}/${appState.selectedFile.name.replace(/[/\?*:|"<>]/g, '_')}`;
        addLog(`Folder: ${fileFolder}`, 'info');

        addLog('Chunking...', 'info');
        const chunks = createChunks(compressed);
        addLog(`✓ ${chunks.length} chunks`, 'success');

        addLog('Uploading in parallel batches...', 'info');
        await uploadChunksParallel(chunks, fileFolder);

        addLog('Saving metadata...', 'info');
        await saveMetadata(fileFolder, appState.selectedFile.name, chunks.length, appState.selectedFile.size, compressed.size);

        addLog('Updating registry...', 'info');
        await updateRegistry(appState.selectedFile.name, chunks.length, appState.selectedFile.size, compressed.size, detectFileCategory(appState.selectedFile.name));

        addLog(`✓ Complete!`, 'success');
        showStatus('Upload successful!', 'success');
        loadUploadedFiles();

        setTimeout(() => {
            document.getElementById('fileInput').value = '';
            appState.selectedFile = null;
            document.getElementById('fileInfo').style.display = 'none';
            document.getElementById('progressSection').style.display = 'none';
        }, 2000);

    } catch (error) {
        addLog(`✗ ${error.message}`, 'error');
        showStatus(`Failed: ${error.message}`, 'error');
    } finally {
        appState.isUploading = false;
        document.getElementById('uploadBtn').disabled = false;
    }
}

async function compressFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const compressed = pako.gzip(data);
                resolve(new Blob([compressed], { type: 'application/gzip' }));
            } catch (error) {
                reject(new Error(`Compression failed: ${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error('Read failed'));
        reader.readAsArrayBuffer(file);
    });
}

function createChunks(blob) {
    const chunks = [];
    let offset = 0;
    while (offset < blob.size) {
        chunks.push(blob.slice(offset, offset + CONFIG.CHUNK_SIZE));
        offset += CONFIG.CHUNK_SIZE;
    }
    return chunks;
}

async function uploadChunksParallel(chunks, fileFolder) {
    const total = chunks.length;

    for (let i = 0; i < total; i += CONFIG.PARALLEL_BATCH) {
        const batch = chunks.slice(i, Math.min(i + CONFIG.PARALLEL_BATCH, total));
        const batchNum = Math.floor(i / CONFIG.PARALLEL_BATCH) + 1;
        const totalBatches = Math.ceil(total / CONFIG.PARALLEL_BATCH);

        await Promise.all(
            batch.map((chunk, idx) => 
                uploadChunk(fileFolder, chunk, i + idx, total)
            )
        );

        updateProgress('uploadProgress', ((i + batch.length) / total) * 100);
    }
}

async function uploadChunk(fileFolder, chunkData, chunkIndex, totalChunks) {
    let attempt = 0;

    while (attempt < 3) {
        try {
            const base64 = await blobToBase64(chunkData);
            const chunkName = `chunk_${String(chunkIndex + 1).padStart(5, '0')}.gz`;
            const filePath = `${fileFolder}/${chunkName}`;
            const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${filePath}`;

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${appState.settings.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `${fileFolder.split('/')[1]}: chunk ${chunkIndex + 1}/${totalChunks}`,
                    content: base64,
                    branch: appState.settings.branch,
                }),
            });

            if (response.status === 201 || response.status === 200) {
                addLog(`✓ Chunk ${chunkIndex + 1}/${totalChunks}`, 'success');
                return;
            }

            throw new Error(`HTTP ${response.status}`);
        } catch (error) {
            attempt++;
            if (attempt < 3) {
                await delay(1000 * attempt);
            } else {
                throw new Error(`Chunk ${chunkIndex + 1} failed`);
            }
        }
    }
}

async function saveMetadata(fileFolder, fileName, chunkCount, originalSize, compressedSize) {
    const metadata = {
        fileName: fileName,
        chunkCount: chunkCount,
        originalSize: originalSize,
        compressedSize: compressedSize,
        category: detectFileCategory(fileName),
        uploadDate: new Date().toISOString(),
    };

    const metaPath = `${fileFolder}/metadata.json`;
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${metaPath}`;

    try {
        await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `Metadata for ${fileName}`,
                content: btoa(JSON.stringify(metadata, null, 2)),
                branch: appState.settings.branch,
            }),
        });
    } catch (error) {
        console.log('Metadata error');
    }
}

async function updateRegistry(fileName, chunkCount, originalSize, compressedSize, category) {
    const entry = {
        id: `file_${Date.now()}`,
        name: fileName,
        category: category,
        originalSize: originalSize,
        compressedSize: compressedSize,
        compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(2),
        chunkCount: chunkCount,
        uploadedAt: new Date().toISOString(),
        folder: `${CONFIG.ASSETS_FOLDER}/${fileName.replace(/[/\?*:|"<>]/g, '_')}`,
    };

    appState.dataJson.files.push(entry);
    appState.dataJson.lastUpdated = new Date().toISOString();

    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${CONFIG.DATA_FILE}`;
    const content = btoa(JSON.stringify(appState.dataJson, null, 2));

    try {
        let sha = null;
        try {
            const get = await fetch(url, {
                headers: { 'Authorization': `token ${appState.settings.token}` },
            });
            if (get.ok) {
                const data = await get.json();
                sha = data.sha;
            }
        } catch (e) {}

        await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: 'Update registry',
                content: content,
                sha: sha || undefined,
                branch: appState.settings.branch,
            }),
        });
    } catch (error) {
        console.log('Registry error');
    }
}

async function loadUploadedFiles() {
    const list = document.getElementById('filesList');
    if (!list) return;

    if (!validateSettings()) {
        list.innerHTML = '<p class="empty-state">Configure settings in Settings tab</p>';
        return;
    }

    try {
        await syncRegistry();
        const files = appState.dataJson.files || [];

        if (files.length === 0) {
            list.innerHTML = '<p class="empty-state">No files</p>';
            return;
        }

        list.innerHTML = '';
        files.forEach(file => {
            list.appendChild(createFileItem(file));
        });
        filterFiles();
    } catch (error) {
        list.innerHTML = '<p class="empty-state">Error loading files</p>';
    }
}

function createFileItem(file) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.category = file.category || 'other';
    div.dataset.name = (file.name || '').toLowerCase();

    const icon = FILE_CATEGORIES[file.category]?.icon || '📁';
    const date = new Date(file.uploadedAt).toLocaleDateString();

    div.innerHTML = `
        <div class="file-item-info">
            <h4>${icon} ${file.name}</h4>
            <div class="file-item-meta">
                <p><strong>Size:</strong> ${formatBytes(file.originalSize)} → ${formatBytes(file.compressedSize)} (${file.compressionRatio}% saved)</p>
                <p><strong>Chunks:</strong> ${file.chunkCount} | <strong>Date:</strong> ${date}</p>
            </div>
        </div>
        <div class="file-item-actions">
            <button class="btn btn-download" onclick="downloadFile('${file.name}', '${file.folder}', ${file.chunkCount})">Download</button>
            <button class="btn btn-danger" onclick="deleteFile('${file.name}', '${file.folder}')">Delete</button>
        </div>
    `;

    return div;
}

function filterFiles() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;

    document.querySelectorAll('.file-item').forEach(item => {
        const matchSearch = item.dataset.name.includes(search);
        const matchCat = !category || item.dataset.category === category;
        item.style.display = (matchSearch && matchCat) ? 'flex' : 'none';
    });
}

async function downloadFile(fileName, folderPath, chunkCount) {
    if (appState.isDownloading) return;
    appState.isDownloading = true;

    try {
        addLog(`Downloading: ${fileName}...`, 'info');
        const chunks = [];

        for (let i = 0; i < chunkCount; i += CONFIG.PARALLEL_BATCH) {
            const batch = Array.from(
                { length: Math.min(CONFIG.PARALLEL_BATCH, chunkCount - i) },
                (_, idx) => i + idx + 1
            );

            const batchChunks = await Promise.all(
                batch.map(idx => downloadChunk(folderPath, idx))
            );
            chunks.push(...batchChunks);
            updateProgress('uploadProgress', (chunks.length / chunkCount) * 100);
        }

        addLog(`Combining ${chunkCount} chunks...`, 'info');
        const combined = combineChunks(chunks);

        addLog(`Decompressing...`, 'info');
        const decompressed = pako.ungzip(combined);

        const blob = new Blob([decompressed]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addLog(`✓ Downloaded!`, 'success');
        showStatus('Download complete!', 'success');
    } catch (error) {
        addLog(`✗ ${error.message}`, 'error');
        showStatus(`Download failed`, 'error');
    } finally {
        appState.isDownloading = false;
    }
}

async function downloadChunk(folderPath, chunkNum) {
    const chunkName = `chunk_${String(chunkNum).padStart(5, '0')}.gz`;
    const filePath = `${folderPath}/${chunkName}`;
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${filePath}`;

    const response = await fetch(url, {
        headers: { 'Authorization': `token ${appState.settings.token}` },
    });

    if (!response.ok) throw new Error(`Chunk ${chunkNum} not found`);

    const data = await response.json();
    const binary = atob(data.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function combineChunks(chunks) {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
        combined.set(chunk, offset);
        offset += chunk.length;
    });
    return combined;
}

async function deleteFile(fileName, folderPath) {
    if (!confirm(`Delete ${fileName}?`)) return;

    try {
        await deleteGitHubFile(`${folderPath}/metadata.json`);

        const entry = appState.dataJson.files.find(f => f.name === fileName);
        for (let i = 1; i <= entry.chunkCount; i++) {
            const chunkName = `chunk_${String(i).padStart(5, '0')}.gz`;
            await deleteGitHubFile(`${folderPath}/${chunkName}`);
        }

        appState.dataJson.files = appState.dataJson.files.filter(f => f.name !== fileName);
        await updateRegistry('', 0, 0, 0, '');

        showStatus('Deleted!', 'success');
        loadUploadedFiles();
    } catch (error) {
        showStatus('Delete failed', 'error');
    }
}

async function deleteGitHubFile(filePath) {
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${filePath}`;

    const get = await fetch(url, {
        headers: { 'Authorization': `token ${appState.settings.token}` },
    });

    if (!get.ok) return;

    const data = await get.json();
    await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `token ${appState.settings.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: 'Delete',
            sha: data.sha,
            branch: appState.settings.branch,
        }),
    });
}

async function syncRegistry() {
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${CONFIG.DATA_FILE}`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `token ${appState.settings.token}` },
        });

        if (response.ok) {
            const data = await response.json();
            appState.dataJson = JSON.parse(atob(data.content));
        }
    } catch (error) {
        console.log('Sync error');
    }
}

function updateStorageInfo() {
    const info = document.getElementById('storageInfo');
    if (!info || appState.dataJson.files.length === 0) {
        info.innerHTML = '<p>No files</p>';
        return;
    }

    const totalOrig = appState.dataJson.files.reduce((sum, f) => sum + f.originalSize, 0);
    const totalComp = appState.dataJson.files.reduce((sum, f) => sum + f.compressedSize, 0);
    const saved = totalOrig - totalComp;
    const ratio = ((1 - totalComp / totalOrig) * 100).toFixed(2);

    info.innerHTML = `<p><strong>Files:</strong> ${appState.dataJson.files.length}<br><strong>Original:</strong> ${formatBytes(totalOrig)}<br><strong>Compressed:</strong> ${formatBytes(totalComp)}<br><strong>Saved:</strong> ${formatBytes(saved)} (${ratio}%)</p>`;
}

function updateStatistics() {
    const stats = document.getElementById('statsContainer');
    if (!stats || appState.dataJson.files.length === 0) {
        stats.innerHTML = '<p>No files</p>';
        return;
    }

    const categoryStats = {};
    appState.dataJson.files.forEach(file => {
        const cat = file.category || 'other';
        if (!categoryStats[cat]) categoryStats[cat] = { count: 0, size: 0 };
        categoryStats[cat].count++;
        categoryStats[cat].size += file.compressedSize;
    });

    stats.innerHTML = Object.entries(categoryStats)
        .map(([cat, data]) => {
            const icon = FILE_CATEGORIES[cat]?.icon || '📁';
            return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-value">${data.count}</div><div class="stat-label">${cat.toUpperCase()}</div><div class="stat-label">${formatBytes(data.size)}</div></div>`;
        })
        .join('');
}

function validateSettings() {
    return appState.settings.token && appState.settings.owner && appState.settings.repo;
}

function updateProgress(elementId, percentage) {
    const element = document.getElementById(elementId);
    if (element) element.style.width = percentage + '%';

    const textElement = document.getElementById(elementId.replace('Progress', 'Text'));
    if (textElement) textElement.textContent = Math.round(percentage) + '%';
}

function addLog(message, type = 'info') {
    const log = document.getElementById('logContent');
    if (!log) return;

    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
}

function showStatus(message, type = 'info') {
    const status = document.getElementById('statusMessage');
    if (!status) return;

    status.textContent = message;
    status.className = `status-message ${type}`;
    status.style.display = 'flex';

    if (type === 'success') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Read error'));
        reader.readAsDataURL(blob);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

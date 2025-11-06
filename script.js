// GitHub File System - Enhanced for All File Types

// ============ CONFIG ============
const CONFIG = {
    GITHUB_API: 'https://api.github.com',
    CHUNK_SIZE: 90 * 1024 * 1024, // 90MB
    MAX_FILE_SIZE: 50 * 1024 * 1024 * 1024, // 50GB
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000, // ms
    ASSETS_FOLDER: 'assets',
    DATA_FILE: 'data.json',
};

// File type categories
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

// Compression library detector
let compressionLib = null;

function getCompressionLib() {
    if (!compressionLib) {
        if (typeof fflate !== 'undefined') {
            compressionLib = { type: 'fflate', lib: fflate };
            console.log('Using fflate compression library');
        } else if (typeof pako !== 'undefined') {
            compressionLib = { type: 'pako', lib: pako };
            console.log('Using pako compression library');
        }
    }
    return compressionLib;
}

function waitForCompressionLib() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50;

        const checkLib = setInterval(() => {
            const lib = getCompressionLib();
            if (lib) {
                clearInterval(checkLib);
                resolve(lib);
            } else if (attempts++ > maxAttempts) {
                clearInterval(checkLib);
                reject(new Error('Compression library failed to load'));
            }
        }, 100);
    });
}

// ============ FILE CATEGORY DETECTION ============
function detectFileCategory(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    for (const [category, data] of Object.entries(FILE_CATEGORIES)) {
        if (data.extensions.includes(ext)) {
            return category;
        }
    }

    return 'other';
}

function getFileIcon(category) {
    return FILE_CATEGORIES[category]?.icon || '📁';
}

// ============ STATE ============
let appState = {
    selectedFile: null,
    settings: {
        token: '',
        owner: '',
        repo: '',
        branch: 'main',
    },
    uploadedFiles: [],
    isUploading: false,
    dataJson: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        files: [],
    },
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadSettings();
    loadUploadedFiles();

    waitForCompressionLib()
        .then(lib => {
            console.log(`✓ Compression library ready: ${lib.type}`);
            addLog(`✓ Compression library loaded: ${lib.type}`, 'success');
        })
        .catch(error => {
            console.error('Compression library error:', error);
            addLog(`✗ Compression library error: ${error.message}`, 'error');
        });
});

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });

    // Upload area
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('click', () => document.getElementById('fileInput').click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);

    // File input
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);

    // Upload button
    document.getElementById('uploadBtn').addEventListener('click', startUpload);

    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('clearSettingsBtn').addEventListener('click', clearSettings);

    // Dark mode
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

    // File search and filter
    document.getElementById('searchInput').addEventListener('input', filterFiles);
    document.getElementById('categoryFilter').addEventListener('change', filterFiles);
}

// ============ TAB MANAGEMENT ============
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'files') {
        loadUploadedFiles();
    } else if (tabName === 'data') {
        updateStorageInfo();
        updateStatistics();
    }
}

// ============ FILE HANDLING ============
function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.remove('drag-over');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('uploadArea').classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        document.getElementById('fileInput').files = files;
        handleFileSelect({ target: { files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size
    if (file.size > CONFIG.MAX_FILE_SIZE) {
        showStatus(`File size exceeds 50GB limit`, 'error');
        document.getElementById('fileInput').value = '';
        return;
    }

    appState.selectedFile = file;
    const category = detectFileCategory(file.name);
    const icon = getFileIcon(category);

    // Show file info
    const fileInfoDiv = document.getElementById('fileInfo');
    if (fileInfoDiv) fileInfoDiv.style.display = 'block';

    const fileNameSpan = document.getElementById('fileName');
    if (fileNameSpan) fileNameSpan.textContent = file.name;

    const fileSizeSpan = document.getElementById('fileSize');
    if (fileSizeSpan) fileSizeSpan.textContent = formatBytes(file.size);

    const fileTypeSpan = document.getElementById('fileType');
    if (fileTypeSpan) fileTypeSpan.textContent = file.type || 'Unknown';

    const categoryBadge = document.getElementById('fileCategory');
    if (categoryBadge) {
        categoryBadge.textContent = category.toUpperCase();
        categoryBadge.className = `category-badge ${category}`;
    }

    // Show upload button
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.style.display = 'block';
        uploadBtn.disabled = false;
    }

    // Hide progress sections
    const progressSection = document.getElementById('progressSection');
    if (progressSection) progressSection.style.display = 'none';

    const uploadLog = document.getElementById('uploadLog');
    if (uploadLog) uploadLog.style.display = 'none';

    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) statusMessage.style.display = 'none';
}

// ============ UPLOAD PROCESS ============
async function startUpload() {
    if (!appState.selectedFile) {
        showStatus('No file selected', 'error');
        return;
    }

    if (!validateSettings()) {
        showStatus('Please configure GitHub settings first', 'error');
        switchTab('settings');
        return;
    }

    try {
        await waitForCompressionLib();
    } catch (error) {
        showStatus(`Compression library not available: ${error.message}`, 'error');
        return;
    }

    appState.isUploading = true;
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('uploadLog').style.display = 'block';
    document.getElementById('statusMessage').style.display = 'none';
    document.getElementById('logContent').innerHTML = '';

    try {
        addLog(`Starting upload: ${appState.selectedFile.name}`, 'info');

        const compressed = await compressFile(appState.selectedFile);
        addLog(`✓ Compression complete (${formatBytes(compressed.size)})`, 'success');

        const chunks = createChunks(compressed);
        addLog(`✓ Created ${chunks.length} chunks`, 'success');

        addLog('Uploading chunks to GitHub...', 'info');
        await uploadChunks(chunks, appState.selectedFile.name);

        await saveFileMetadata(appState.selectedFile.name, chunks.length, compressed.size);
        await updateDataJson(appState.selectedFile.name, chunks.length, appState.selectedFile.size, compressed.size);

        addLog(`✓ Upload complete!`, 'success');
        showStatus('File uploaded successfully!', 'success');

        loadUploadedFiles();

        setTimeout(() => {
            document.getElementById('fileInput').value = '';
            appState.selectedFile = null;
            document.getElementById('fileInfo').style.display = 'none';
            document.getElementById('progressSection').style.display = 'none';
        }, 2000);

    } catch (error) {
        addLog(`✗ Error: ${error.message}`, 'error');
        showStatus(`Upload failed: ${error.message}`, 'error');
    } finally {
        appState.isUploading = false;
        document.getElementById('uploadBtn').disabled = false;
    }
}

// ============ COMPRESSION ============
async function compressFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                updateProgress('compressionProgress', 50);

                const data = new Uint8Array(e.target.result);
                const lib = getCompressionLib();
                if (!lib) throw new Error('Compression library not available');

                let compressed;
                if (lib.type === 'fflate') {
                    compressed = lib.lib.gzipSync(data);
                } else if (lib.type === 'pako') {
                    compressed = lib.lib.gzip(data);
                } else {
                    throw new Error('Unknown compression library');
                }

                updateProgress('compressionProgress', 100);

                const blob = new Blob([compressed], { type: 'application/gzip' });
                resolve(blob);
            } catch (error) {
                reject(new Error(`Compression failed: ${error.message}`));
            }
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

function createChunks(blob) {
    const chunks = [];
    let offset = 0;

    while (offset < blob.size) {
        const chunkData = blob.slice(offset, offset + CONFIG.CHUNK_SIZE);
        chunks.push(chunkData);
        offset += CONFIG.CHUNK_SIZE;
    }

    updateProgress('chunkingProgress', 100);
    return chunks;
}

// ============ GITHUB UPLOAD ============
async function uploadChunks(chunks, originalFilename) {
    const totalChunks = chunks.length;

    for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        const chunkName = `${originalFilename}.part${i + 1}.gz`;
        const chunkPath = `${CONFIG.ASSETS_FOLDER}/${chunkName}`;

        addLog(`Uploading chunk ${i + 1}/${totalChunks} (${formatBytes(chunk.size)})...`, 'info');

        try {
            await uploadChunkToGitHub(chunkPath, chunk, i, totalChunks);
            updateProgress('uploadProgress', ((i + 1) / totalChunks) * 100);
        } catch (error) {
            addLog(`✗ Failed to upload chunk ${i + 1}: ${error.message}`, 'error');
            throw error;
        }
    }
}

async function uploadChunkToGitHub(filePath, chunkData, chunkIndex, totalChunks) {
    let attempt = 0;

    while (attempt < CONFIG.RETRY_ATTEMPTS) {
        try {
            const base64 = await blobToBase64(chunkData);
            const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${filePath}`;

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${appState.settings.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json',
                },
                body: JSON.stringify({
                    message: `Upload chunk ${chunkIndex + 1}/${totalChunks}`,
                    content: base64.split(',')[1],
                    branch: appState.settings.branch,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            addLog(`✓ Chunk ${chunkIndex + 1}/${totalChunks} uploaded`, 'success');
            return;

        } catch (error) {
            attempt++;
            if (attempt < CONFIG.RETRY_ATTEMPTS) {
                addLog(`Retry ${attempt}/${CONFIG.RETRY_ATTEMPTS - 1} for chunk ${chunkIndex + 1}...`, 'info');
                await delay(CONFIG.RETRY_DELAY);
            } else {
                throw error;
            }
        }
    }
}

// ============ DATA.JSON MANAGEMENT ============
async function updateDataJson(filename, chunkCount, originalSize, compressedSize) {
    try {
        const category = detectFileCategory(filename);

        const fileEntry = {
            id: `file_${Date.now()}`,
            name: filename,
            category: category,
            originalSize: originalSize,
            compressedSize: compressedSize,
            compressionRatio: ((1 - compressedSize / originalSize) * 100).toFixed(2),
            chunkCount: chunkCount,
            uploadedAt: new Date().toISOString(),
            chunks: Array.from({length: chunkCount}, (_, i) => `${filename}.part${i + 1}.gz`),
            status: 'complete',
        };

        appState.dataJson.files.push(fileEntry);
        appState.dataJson.lastUpdated = new Date().toISOString();

        await uploadDataJsonToGitHub();

        addLog('✓ File registry updated (data.json)', 'success');
    } catch (error) {
        addLog(`Warning: Could not update data.json: ${error.message}`, 'info');
    }
}

async function uploadDataJsonToGitHub() {
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${CONFIG.DATA_FILE}`;

    const jsonContent = JSON.stringify(appState.dataJson, null, 2);
    const base64Content = btoa(jsonContent);

    try {
        const getResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        let sha = null;
        if (getResponse.ok) {
            const data = await getResponse.json();
            sha = data.sha;
        }

        const putResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
            },
            body: JSON.stringify({
                message: 'Update file registry',
                content: base64Content,
                sha: sha || undefined,
                branch: appState.settings.branch,
            }),
        });

        if (!putResponse.ok) {
            throw new Error('Failed to update data.json');
        }
    } catch (error) {
        addLog(`Warning: Could not upload data.json: ${error.message}`, 'info');
    }
}

async function syncDataJsonFromGitHub() {
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${CONFIG.DATA_FILE}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (response.ok) {
            const data = await response.json();
            const content = atob(data.content);
            appState.dataJson = JSON.parse(content);
            addLog('✓ Synced data.json from GitHub', 'success');
            return true;
        }
    } catch (error) {
        addLog(`Could not sync data.json: ${error.message}`, 'info');
    }
    return false;
}

// ============ METADATA ============
async function saveFileMetadata(filename, chunkCount, compressedSize) {
    const metadata = {
        originalName: filename,
        category: detectFileCategory(filename),
        chunkCount: chunkCount,
        compressedSize: compressedSize,
        uploadDate: new Date().toISOString(),
        compressed: true,
    };

    const metadataPath = `${CONFIG.ASSETS_FOLDER}/${filename}.meta.json`;

    try {
        const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${metadataPath}`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json',
            },
            body: JSON.stringify({
                message: `Add metadata for ${filename}`,
                content: btoa(JSON.stringify(metadata, null, 2)),
                branch: appState.settings.branch,
            }),
        });

        if (response.ok) {
            addLog('✓ Metadata saved', 'success');
        }
    } catch (error) {
        addLog(`Warning: Could not save metadata: ${error.message}`, 'info');
    }
}

// ============ FILE MANAGEMENT ============
async function loadUploadedFiles() {
    const filesList = document.getElementById('filesList');
    filesList.innerHTML = '<p class="empty-state">Loading files...</p>';

    if (!validateSettings()) {
        filesList.innerHTML = '<p class="empty-state">Configure GitHub settings to view files</p>';
        return;
    }

    try {
        await syncDataJsonFromGitHub();

        const files = appState.dataJson.files || [];

        if (files.length === 0) {
            filesList.innerHTML = '<p class="empty-state">No files uploaded yet</p>';
            return;
        }

        filesList.innerHTML = '';
        files.forEach(file => {
            const fileItem = createFileItemFromData(file);
            filesList.appendChild(fileItem);
        });

        filterFiles();
    } catch (error) {
        filesList.innerHTML = `<p class="empty-state">Error loading files: ${error.message}</p>`;
    }
}

function createFileItemFromData(fileEntry) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.dataset.category = fileEntry.category || 'other';
    div.dataset.name = (fileEntry.name || '').toLowerCase();

    const uploadDate = new Date(fileEntry.uploadedAt).toLocaleDateString();
    const compression = fileEntry.compressionRatio;
    const icon = getFileIcon(fileEntry.category || 'other');

    div.innerHTML = `
        <div class="file-item-info">
            <h4>${icon} ${fileEntry.name}</h4>
            <div class="file-item-meta">
                <p><strong>Size:</strong> ${formatBytes(fileEntry.originalSize)} → ${formatBytes(fileEntry.compressedSize)} (${compression}% saved)</p>
                <p><strong>Category:</strong> ${(fileEntry.category || 'other').toUpperCase()} | <strong>Chunks:</strong> ${fileEntry.chunkCount} | <strong>Uploaded:</strong> ${uploadDate}</p>
            </div>
        </div>
        <div class="file-item-actions">
            <button class="btn btn-download" onclick="downloadFile('${fileEntry.name}')">Download</button>
            <button class="btn btn-danger" onclick="deleteFile('${fileEntry.name}')">Delete</button>
        </div>
    `;

    return div;
}

function filterFiles() {
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;

    document.querySelectorAll('.file-item').forEach(item => {
        const matchesSearch = item.dataset.name.includes(searchText);
        const matchesCategory = !categoryFilter || item.dataset.category === categoryFilter;

        item.style.display = (matchesSearch && matchesCategory) ? 'flex' : 'none';
    });
}

async function downloadFile(filename) {
    try {
        await waitForCompressionLib();

        const metaPath = `${CONFIG.ASSETS_FOLDER}/${filename}.meta.json`;
        const metaUrl = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${metaPath}`;

        const metaResponse = await fetch(metaUrl, {
            headers: {
                'Authorization': `token ${appState.settings.token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!metaResponse.ok) throw new Error('Could not find metadata');

        const metaData = await metaResponse.json();
        const metadata = JSON.parse(atob(metaData.content));

        const chunks = [];
        for (let i = 1; i <= metadata.chunkCount; i++) {
            const chunkName = `${filename}.part${i}.gz`;
            const chunkPath = `${CONFIG.ASSETS_FOLDER}/${chunkName}`;
            const chunkUrl = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${chunkPath}`;

            const chunkResponse = await fetch(chunkUrl, {
                headers: {
                    'Authorization': `token ${appState.settings.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!chunkResponse.ok) throw new Error(`Could not download chunk ${i}`);

            const chunkData = await chunkResponse.json();
            const binaryString = atob(chunkData.content);
            const bytes = new Uint8Array(binaryString.length);
            for (let j = 0; j < binaryString.length; j++) {
                bytes[j] = binaryString.charCodeAt(j);
            }
            chunks.push(bytes);
        }

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const concatenated = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach(chunk => {
            concatenated.set(chunk, offset);
            offset += chunk.length;
        });

        const lib = getCompressionLib();
        let decompressed;

        if (lib.type === 'fflate') {
            decompressed = lib.lib.gunzipSync(concatenated);
        } else if (lib.type === 'pako') {
            decompressed = lib.lib.ungzip(concatenated);
        }

        const blob = new Blob([decompressed]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.originalName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(`Downloaded: ${metadata.originalName}`, 'success');
    } catch (error) {
        showStatus(`Download failed: ${error.message}`, 'error');
    }
}

async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
        const fileEntry = appState.dataJson.files.find(f => f.name === filename);
        if (!fileEntry) throw new Error('File not found in registry');

        for (let i = 1; i <= fileEntry.chunkCount; i++) {
            const chunkName = `${filename}.part${i}.gz`;
            const chunkPath = `${CONFIG.ASSETS_FOLDER}/${chunkName}`;
            await deleteFileFromGitHub(chunkPath);
        }

        const metaPath = `${CONFIG.ASSETS_FOLDER}/${filename}.meta.json`;
        await deleteFileFromGitHub(metaPath);

        appState.dataJson.files = appState.dataJson.files.filter(f => f.name !== filename);
        appState.dataJson.lastUpdated = new Date().toISOString();
        await uploadDataJsonToGitHub();

        showStatus(`Deleted: ${filename}`, 'success');
        loadUploadedFiles();
    } catch (error) {
        showStatus(`Delete failed: ${error.message}`, 'error');
    }
}

async function deleteFileFromGitHub(filePath) {
    const url = `${CONFIG.GITHUB_API}/repos/${appState.settings.owner}/${appState.settings.repo}/contents/${filePath}`;

    const getResponse = await fetch(url, {
        headers: {
            'Authorization': `token ${appState.settings.token}`,
            'Accept': 'application/vnd.github.v3+json',
        },
    });

    const fileData = await getResponse.json();

    const deleteResponse = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `token ${appState.settings.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
            message: `Delete ${filePath.split('/').pop()}`,
            sha: fileData.sha,
            branch: appState.settings.branch,
        }),
    });

    if (!deleteResponse.ok) {
        throw new Error(`Could not delete file`);
    }
}

// ============ DATA TAB FUNCTIONS ============
function viewDataJson() {
    const dataJsonView = document.getElementById('dataJsonView');
    const dataJsonContent = document.getElementById('dataJsonContent');

    if (dataJsonView.style.display === 'none') {
        dataJsonContent.textContent = JSON.stringify(appState.dataJson, null, 2);
        dataJsonView.style.display = 'block';
    } else {
        dataJsonView.style.display = 'none';
    }
}

function downloadDataJson() {
    const jsonString = JSON.stringify(appState.dataJson, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('Downloaded data.json', 'success');
}

async function syncDataJson() {
    const result = await syncDataJsonFromGitHub();
    if (result) {
        viewDataJson();
    }
}

function updateStorageInfo() {
    const storageInfo = document.getElementById('storageInfo');

    if (appState.dataJson.files.length === 0) {
        storageInfo.innerHTML = '<p>No files uploaded yet. Upload a file to see storage information.</p>';
        return;
    }

    const totalOriginal = appState.dataJson.files.reduce((sum, f) => sum + f.originalSize, 0);
    const totalCompressed = appState.dataJson.files.reduce((sum, f) => sum + f.compressedSize, 0);
    const totalSaved = totalOriginal - totalCompressed;
    const avgCompression = ((1 - totalCompressed / totalOriginal) * 100).toFixed(2);

    storageInfo.innerHTML = `
        <p><strong>Total Files:</strong> ${appState.dataJson.files.length}</p>
        <p><strong>Total Original Size:</strong> ${formatBytes(totalOriginal)}</p>
        <p><strong>Total Compressed Size:</strong> ${formatBytes(totalCompressed)}</p>
        <p><strong>Space Saved:</strong> ${formatBytes(totalSaved)} (${avgCompression}% compression)</p>
        <p><strong>Registry Last Updated:</strong> ${new Date(appState.dataJson.lastUpdated).toLocaleString()}</p>
    `;
}

function updateStatistics() {
    const statsContainer = document.getElementById('statsContainer');

    if (appState.dataJson.files.length === 0) {
        statsContainer.innerHTML = '<p style="grid-column: 1 / -1;">No files yet</p>';
        return;
    }

    const stats = {};

    appState.dataJson.files.forEach(file => {
        const category = file.category || 'other';
        if (!stats[category]) {
            stats[category] = { count: 0, totalSize: 0 };
        }
        stats[category].count++;
        stats[category].totalSize += file.compressedSize;
    });

    statsContainer.innerHTML = Object.entries(stats)
        .map(([category, data]) => `
            <div class="stat-card">
                <div class="stat-icon">${getFileIcon(category)}</div>
                <div class="stat-value">${data.count}</div>
                <div class="stat-label">${category.toUpperCase()}</div>
                <div class="stat-label">${formatBytes(data.totalSize)}</div>
            </div>
        `)
        .join('');
}

// ============ SETTINGS ============
function validateSettings() {
    return appState.settings.token && appState.settings.owner && appState.settings.repo;
}

function saveSettings() {
    appState.settings.token = document.getElementById('githubToken').value;
    appState.settings.owner = document.getElementById('githubOwner').value;
    appState.settings.repo = document.getElementById('githubRepo').value;
    appState.settings.branch = document.getElementById('githubBranch').value;

    if (!validateSettings()) {
        showStatus('Please fill in all required fields', 'error');
        return;
    }

    sessionStorage.setItem('settings', JSON.stringify(appState.settings));
    showStatus('Settings saved successfully!', 'success');
}

function loadSettings() {
    const saved = sessionStorage.getItem('settings');
    if (saved) {
        appState.settings = JSON.parse(saved);
        document.getElementById('githubToken').value = appState.settings.token;
        document.getElementById('githubOwner').value = appState.settings.owner;
        document.getElementById('githubRepo').value = appState.settings.repo;
        document.getElementById('githubBranch').value = appState.settings.branch;
    }
}

function clearSettings() {
    if (confirm('Clear all settings?')) {
        document.getElementById('githubToken').value = '';
        document.getElementById('githubOwner').value = '';
        document.getElementById('githubRepo').value = '';
        document.getElementById('githubBranch').value = 'main';
        sessionStorage.removeItem('settings');
        appState.settings = { token: '', owner: '', repo: '', branch: 'main' };
        showStatus('Settings cleared', 'info');
    }
}

// ============ UI HELPERS ============
function updateProgress(elementId, percentage) {
    const element = document.getElementById(elementId);
    element.style.width = percentage + '%';

    const textId = elementId.replace('Progress', 'Text');
    document.getElementById(textId).textContent = Math.round(percentage) + '%';
}

function addLog(message, type = 'info') {
    const logContent = document.getElementById('logContent');
    if (!logContent) return;

    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContent.appendChild(item);
    logContent.scrollTop = logContent.scrollHeight;
}

function showStatus(message, type = 'info') {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'flex';

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// ============ UTILITIES ============
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

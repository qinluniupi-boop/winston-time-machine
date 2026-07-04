// Winston 时光机 - 线上版（Supabase）
const SUPABASE_URL = 'https://dtnawyqxxqsdrywsdqfd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HlUtreSb45P8JnZU6RgR-w_w827bkiX';
const BUCKET_NAME = 'winston-media';

let client;

// 兼容微信内置浏览器等环境：不直接修改 window.crypto，提供一个稳定 ID 生成器
function generateId() {
  if (window.crypto && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const defaultDays = [
  { name: 'Winston 来的那天', date: '2018-05-12' },
  { name: '他去彩虹桥那天', date: '2025-03-20' }
];

function showInitError(msg) {
  console.error(msg);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:2rem;background:rgba(245,240,227,0.96);z-index:20000;font-family:Georgia,serif;';
  box.innerHTML = `<div style="max-width:400px;text-align:center;line-height:1.7;color:#3d3429;">
    <div style="font-size:2rem;margin-bottom:1rem;">⚠️</div>
    <h2 style="font-weight:400;margin:0 0 0.8rem;">页面没有正常启动</h2>
    <p style="margin:0 0 1.2rem;color:#6b5e4f;">${msg}</p>
    <p style="margin:0;font-size:0.85rem;color:#6b5e4f;">如果一直这样，可以试试用系统浏览器（Safari / Chrome）打开。</p>
  </div>`;
  document.body.appendChild(box);
}

async function initDB() {
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase 客户端没有加载，请检查网络后重试。');
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await ensureDefaultDays();
}

async function ensureDefaultDays() {
  const { data, error } = await client.from('days').select('id').limit(1);
  if (error) {
    console.error('初始化纪念日失败', error);
    return;
  }
  if (!data || data.length === 0) {
    for (const d of defaultDays) {
      await client.from('days').insert(d);
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  target.setFullYear(today.getFullYear());
  target.setHours(0,0,0,0);
  if (target < today) target.setFullYear(today.getFullYear() + 1);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function daysSinceOriginal(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const original = new Date(dateStr);
  original.setHours(0,0,0,0);
  return Math.round((today - original) / (1000 * 60 * 60 * 24));
}

function formatDayCountdown(dateStr) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const original = new Date(dateStr);
  original.setHours(0,0,0,0);
  const diff = Math.round((today - original) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '今天';
  if (diff > 0) {
    const years = Math.floor(diff / 365);
    if (years >= 1) {
      return `第 ${years} 周年 · ${diff} 天`;
    }
    return `第 ${diff} 天`;
  }
  const daysLeft = -diff;
  return `还有 ${daysLeft} 天`;
}

async function fetchMedia() {
  const { data, error } = await client
    .from('media')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchComments(mediaId) {
  const { data, error } = await client
    .from('comments')
    .select('*')
    .eq('media_id', mediaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchDays() {
  const { data, error } = await client
    .from('days')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  console.log('fetchDays 返回数据:', data);
  return data || [];
}

// HEIC 图片 fallback：桌面浏览器不支持 HEIC，需要客户端转换
let heic2anyLoaded = null;
function loadHeic2Any() {
  if (heic2anyLoaded) return heic2anyLoaded;
  heic2anyLoaded = new Promise((resolve, reject) => {
    if (typeof heic2any !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('heic2any 加载失败'));
    document.head.appendChild(s);
  });
  return heic2anyLoaded;
}

function isHeicUrl(url) {
  return /\.heic($|\?)/i.test(url);
}

async function handleHeicImage(imgEl, url) {
  if (!isHeicUrl(url)) return;
  try {
    await loadHeic2Any();
    imgEl.style.opacity = '0.4';
    const resp = await fetch(url);
    const blob = await resp.blob();
    const jpegBlob = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
    const result = Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob;
    imgEl.src = URL.createObjectURL(result);
    imgEl.style.opacity = '1';
  } catch (err) {
    console.error('HEIC 转换失败:', url, err);
    imgEl.alt = '（此照片为 HEIC 格式，请在手机上查看）';
    imgEl.style.opacity = '0.3';
  }
}

async function createPolaroidCard(meta) {
  const comments = await fetchComments(meta.id);

  const card = document.createElement('div');
  card.className = 'polaroid';
  card.dataset.mediaId = meta.id;
  card.onclick = () => openLightbox(meta);

  let mediaHTML = '';
  if (meta.type === 'video') {
    mediaHTML = `<div class="polaroid-video"><video src="${meta.public_url}" muted preload="metadata"></video><span>▶</span></div>`;
  } else {
    const heicAttr = isHeicUrl(meta.public_url) ? ` onerror="handleHeicImage(this,'${meta.public_url}')"` : '';
    mediaHTML = `<img class="polaroid-media" src="${meta.public_url}" alt="${escapeHtml(meta.caption || 'Winston 的回忆')}" loading="lazy"${heicAttr} />`;
  }

  card.innerHTML = `
    ${mediaHTML}
    <div class="select-check" data-media-id="${meta.id}">✓</div>
    <div class="polaroid-caption">${escapeHtml(meta.caption) || '一个没写下什么的瞬间'}</div>
    <div class="polaroid-meta">
      <span>👤 ${escapeHtml(meta.uploader)} · ${meta.date}</span>
      <span>💬 ${comments.length}</span>
    </div>
  `;

  // 选择框点击：阻止冒泡，不打开灯箱
  const check = card.querySelector('.select-check');
  if (check) {
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('selected');
      updateBatchBar();
    });
  }

  return card;
}

async function renderGallery(container, options = {}) {
  const { filter = 'all', limit = null, emptyText = '这里还空着' } = options;
  let metas = await fetchMedia();
  const filtered = metas.filter(m => filter === 'all' || m.type === filter);
  const displayMetas = limit ? filtered.slice(0, limit) : filtered;

  container.innerHTML = '';
  if (displayMetas.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🐕</div>
        <p>${emptyText}</p>
      </div>
    `;
    return;
  }

  for (const meta of displayMetas) {
    const card = await createPolaroidCard(meta);
    if (card) container.appendChild(card);
  }
}

// 灯箱
let currentMeta = null;

function openLightbox(meta) {
  currentMeta = meta;
  const lightbox = document.getElementById('lightbox');
  const mediaWrap = document.getElementById('lightboxMedia');
  const caption = document.getElementById('lightboxCaption');
  const metaText = document.getElementById('lightboxMeta');

  mediaWrap.innerHTML = '';
  if (meta.type === 'video') {
    const v = document.createElement('video');
    v.src = meta.public_url;
    v.controls = true;
    v.autoplay = true;
    mediaWrap.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = meta.public_url;
    img.alt = meta.caption || 'Winston 的回忆';
    if (isHeicUrl(meta.public_url)) {
      img.onerror = () => handleHeicImage(img, meta.public_url);
    }
    mediaWrap.appendChild(img);
  }
  caption.textContent = meta.caption || '一个没写下什么的瞬间';
  metaText.textContent = `来自 ${meta.uploader} · ${meta.date}`;
  document.getElementById('downloadBtn').onclick = () => downloadMedia(meta);
  renderComments(meta.id);
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('lightboxMedia').innerHTML = '';
  currentMeta = null;
}

async function renderComments(mediaId) {
  const comments = await fetchComments(mediaId);
  const container = document.getElementById('commentsList');
  container.innerHTML = '';
  if (comments.length === 0) {
    container.innerHTML = '<div style="color:var(--ink-light);font-size:0.9rem;font-style:italic;">还没人说话，你要先开口吗？</div>';
    return;
  }
  for (const c of comments) {
    const div = document.createElement('div');
    div.className = 'comment';
    div.innerHTML = `
      <div class="comment-author">${escapeHtml(c.author)} · ${formatDate(c.created_at)}</div>
      <div>${escapeHtml(c.text)}</div>
    `;
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

async function submitComment() {
  if (!currentMeta) return;
  const input = document.getElementById('commentInput');
  const text = input.value.trim();
  if (!text) return;
  const author = (document.getElementById('uploaderName')?.value.trim()) || '某个想他的人';

  const { error } = await client.from('comments').insert({
    media_id: currentMeta.id,
    text,
    author
  });
  if (error) {
    alert('评论发送失败：' + error.message);
    return;
  }
  input.value = '';
  await renderComments(currentMeta.id);
}

function downloadMedia(meta) {
  const a = document.createElement('a');
  a.href = meta.public_url;
  a.download = meta.file_name || (meta.type === 'video' ? 'winston-video.mp4' : 'winston-photo.jpg');
  a.click();
}

// 纪念日媒体上传
async function uploadDayMedia(file, dayId) {
  try {
    console.log('开始上传纪念日媒体:', file.name, '大小:', (file.size / 1024 / 1024).toFixed(2), 'MB');
    
    const fileType = file.type || '';
    const isVideo = fileType.startsWith('video') || /\.(mp4|mov|m4v|avi|mkv)$/i.test(file.name);
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_') || 'file';
    const mediaId = dayId || generateId();
    const storagePath = `day-media/${mediaId}/${safeName}`;
    const contentType = fileType || (isVideo ? 'video/mp4' : 'image/jpeg');

    console.log('存储路径:', storagePath);
    console.log('Content-Type:', contentType);

    // 上传到 Storage
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET_NAME}/${storagePath}`;
    console.log('上传 URL:', uploadUrl);
    
    const uploadResp = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: file
    }, 30000);

    console.log('上传响应状态:', uploadResp.status);
    
    if (!uploadResp.ok) {
      const errText = await readTextWithTimeout(uploadResp).catch(() => '');
      console.error('上传失败详情:', errText);
      throw new Error(`Storage 上传失败 (${uploadResp.status}): ${errText}`);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${storagePath}`;
    console.log('上传成功, publicUrl:', publicUrl);
    
    return {
      publicUrl,
      type: isVideo ? 'video' : 'image',
      storagePath
    };
  } catch (err) {
    console.error('纪念日媒体上传失败', err);
    alert('媒体上传失败：' + err.message);
    return null;
  }
}

function fetchWithTimeout(url, options, timeoutMs = 30000) {
  if (typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`请求超时（${timeoutMs / 1000} 秒）`)), timeoutMs))
  ]);
}

function readTextWithTimeout(response, timeoutMs = 5000) {
  return Promise.race([
    response.text(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('读取响应超时')), timeoutMs))
  ]);
}

// 纪念日
async function renderDays(container, options = {}) {
  const { limit = null } = options;
  let days = await fetchDays();
  days.sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const displayDays = limit ? days.slice(0, limit) : days;

  container.innerHTML = '';
  if (displayDays.length === 0) {
    container.innerHTML = '<div style="color:var(--ink-light);font-size:0.9rem;grid-column:1/-1;">还没有要记住的日子</div>';
    return;
  }
  for (const d of displayDays) {
    const countdownText = formatDayCountdown(d.date);
    const div = document.createElement('div');
    div.className = 'day-card';
    div.dataset.dayId = d.id;

    // 媒体区域（只在有媒体时显示）
    let mediaHTML = '';
    if (d.media_url) {
      if (d.media_type === 'video') {
        mediaHTML = `<div class="day-media"><video src="${d.media_url}" muted preload="metadata" controls></video></div>`;
      } else {
        mediaHTML = `<div class="day-media"><img src="${d.media_url}" alt="${escapeHtml(d.name)}" loading="lazy" /></div>`;
      }
    }

    div.innerHTML = `
      ${mediaHTML}
      <div class="day-info">
        <div class="day-name">${escapeHtml(d.name)}</div>
        <div class="day-date">${d.date}</div>
        <div class="day-countdown">${countdownText}</div>
      </div>
      ${!limit ? `
        <div class="day-actions">
          <button class="day-edit-btn" data-day-id="${d.id}">✏️ 编辑</button>
          <button class="day-delete-btn" data-day-id="${d.id}">🗑️ 删除</button>
        </div>
      ` : ''}
    `;

    // 编辑按钮
    const editBtn = div.querySelector('.day-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.openEditDayModal) {
          await window.openEditDayModal(d);
        }
      });
    }

    // 删除按钮
    const deleteBtn = div.querySelector('.day-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const password = prompt('请输入密码以确认删除：');
        if (password !== 'winston') {
          if (password !== null) alert('密码错误');
          return;
        }
        
        // 删除媒体文件
        if (d.media_storage_path) {
          await client.storage.from(BUCKET_NAME).remove([d.media_storage_path]).catch(() => {});
        }
        
        const { error } = await client.from('days').delete().eq('id', d.id);
        if (error) {
          alert('删除失败：' + error.message);
        } else {
          await renderDays(container, options);
        }
      });
    }

    container.appendChild(div);
  }
}

// 关于 Winston 内容管理
async function loadAboutContent() {
  const container = document.getElementById('aboutContent');
  if (!container) return;

  try {
    const { data, error } = await client
      .from('site_content')
      .select('value')
      .eq('key', 'about')
      .single();

    if (error) {
      console.error('加载关于内容失败', error);
      container.innerHTML = '<p style="color: var(--ink-light);">内容加载失败，请刷新重试。</p>';
      return;
    }

    if (data && data.value) {
      // 将纯文本转换为 HTML 段落（按双换行分段）
      const paragraphs = data.value.split(/\n\n+/).filter(p => p.trim());
      container.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
    } else {
      container.innerHTML = '<p style="color: var(--ink-light);">还没有关于 Winston 的内容。</p>';
    }
  } catch (err) {
    console.error('加载关于内容异常', err);
    container.innerHTML = '<p style="color: var(--ink-light);">内容加载失败，请刷新重试。</p>';
  }
}

async function saveAboutContent(content) {
  const { error } = await client
    .from('site_content')
    .upsert({ key: 'about', value: content }, { onConflict: 'key' });

  if (error) throw error;
}

// 删除媒体
async function deleteMedia(mediaId) {
  const password = prompt('请输入密码以确认删除：');
  if (password !== 'winston') {
    alert('密码错误');
    return false;
  }

  try {
    // 1. 获取媒体信息
    const { data: media, error: fetchError } = await client
      .from('media')
      .select('*')
      .eq('id', mediaId)
      .single();

    if (fetchError) throw fetchError;

    // 2. 从 Storage 删除文件
    if (media && media.storage_path) {
      const { error: storageError } = await client.storage
        .from(BUCKET_NAME)
        .remove([media.storage_path]);

      if (storageError) {
        console.error('Storage 删除失败', storageError);
      }
    }

    // 3. 从数据库删除记录
    const { error: dbError } = await client
      .from('media')
      .delete()
      .eq('id', mediaId);

    if (dbError) throw dbError;

    return true;
  } catch (err) {
    console.error('删除失败', err);
    alert('删除失败：' + err.message);
    return false;
  }
}

// ===== 批量下载 =====
function getSelectedCards() {
  return Array.from(document.querySelectorAll('.polaroid.selected'));
}

function updateBatchBar() {
  const bar = document.getElementById('batchBar');
  const countEl = document.getElementById('batchCount');
  const downloadBtn = document.getElementById('batchDownload');
  const selectAllBtn = document.getElementById('batchSelectAll');
  if (!bar) return;

  const selected = getSelectedCards();
  const count = selected.length;
  const total = document.querySelectorAll('.polaroid').length;

  if (countEl) countEl.textContent = `已选 ${count} 个 / 共 ${total} 个`;
  if (downloadBtn) {
    downloadBtn.disabled = count === 0;
    downloadBtn.textContent = count > 0 ? `下载选中 (${count})` : '下载选中';
  }
  if (selectAllBtn) {
    selectAllBtn.textContent = count === total && total > 0 ? '取消全选' : '全选';
  }
}

async function downloadSingleFile(url, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const isVideo = ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'].includes(ext);

  if (isVideo) {
    // 视频用 fetch + blob 下载，避免浏览器直接打开
    const resp = await fetchWithTimeout(url, {}, 60000);
    if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } else {
    // 图片直接用 download 属性
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

async function batchDownloadSelected() {
  const selected = getSelectedCards();
  if (selected.length === 0) return;

  const downloadBtn = document.getElementById('batchDownload');
  const cancelBtn = document.getElementById('batchCancel');
  const countEl = document.getElementById('batchCount');

  if (downloadBtn) { downloadBtn.disabled = true; downloadBtn.textContent = '下载中...'; }
  if (cancelBtn) cancelBtn.disabled = true;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < selected.length; i++) {
    const card = selected[i];
    const metaId = card.dataset.mediaId;
    if (countEl) countEl.textContent = `下载中... (${i + 1}/${selected.length})`;

    try {
      // 从数据库获取文件信息
      const { data: media, error } = await client.from('media').select('*').eq('id', metaId).single();
      if (error || !media) throw new Error('找不到文件信息');

      const fileName = media.file_name || `winston-${metaId.slice(0, 8)}.${media.type === 'video' ? 'mp4' : 'jpg'}`;
      await downloadSingleFile(media.public_url, fileName);
      success++;

      // 每个文件之间稍作间隔，避免浏览器限制
      if (i < selected.length - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (err) {
      console.error(`下载失败: ${metaId}`, err);
      failed++;
    }
  }

  if (countEl) countEl.textContent = `完成：成功 ${success} 个，失败 ${failed} 个`;
  if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.textContent = `下载选中 (${getSelectedCards().length})`; }
  if (cancelBtn) cancelBtn.disabled = false;
}

// 实时订阅
function subscribeToChanges() {
  client
    .channel('public:media')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, () => {
      document.querySelectorAll('.gallery').forEach(g => {
        if (g.id === 'gallery') renderGallery(g, { emptyText: '这里还空着，可以先去放一张照片' });
        if (g.id === 'recentGallery') renderGallery(g, { limit: 6, emptyText: '还没有回忆，去上传第一张吧' });
      });
    })
    .subscribe();

  client
    .channel('public:comments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
      if (currentMeta && payload.new && payload.new.media_id === currentMeta.id) {
        renderComments(currentMeta.id);
      }
      document.querySelectorAll('.gallery').forEach(g => {
        if (g.id === 'gallery') renderGallery(g, { emptyText: '这里还空着，可以先去放一张照片' });
        if (g.id === 'recentGallery') renderGallery(g, { limit: 6, emptyText: '还没有回忆，去上传第一张吧' });
      });
    })
    .subscribe();

  client
    .channel('public:days')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'days' }, () => {
      document.querySelectorAll('.days-list').forEach(d => {
        if (d.id === 'daysList') renderDays(d);
        if (d.id === 'upcomingDays') renderDays(d, { limit: 3 });
      });
    })
    .subscribe();
}

// 背景照片装饰
const BG_PHOTOS = [
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/410ade3f-aac8-4ac3-b3a4-ce90e42dce44/IMG_8362.jpeg', top: '-4%', left: '-6%', w: 420, h: 340, rot: -10, dur: 19, dx: 12, dy: -16 },
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/ec8205f0-7931-4220-b156-c87b57f2aa28/IMG_8361.jpeg', top: '8%', right: '-5%', w: 380, h: 300, rot: 7, dur: 23, dx: -10, dy: 14 },
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/8cb6d543-0fe1-40cd-98da-8ebf92863d55/IMG_8323.jpeg', top: '38%', left: '-8%', w: 360, h: 290, rot: 5, dur: 21, dx: 14, dy: 10 },
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/7f3e6c57-68d1-49ab-9bb2-69c2b8e0e122/IMG_8324.jpeg', top: '32%', right: '-7%', w: 400, h: 320, rot: -6, dur: 25, dx: -14, dy: -12 },
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/8ecc5365-7783-4d3e-b78b-1de1fef4b695/IMG_2021.jpeg', bottom: '2%', left: '12%', w: 440, h: 340, rot: 4, dur: 22, dx: 10, dy: -14 },
  { url: 'https://dtnawyqxxqsdrywsdqfd.supabase.co/storage/v1/object/public/winston-media/aeb3e6ca-2615-4568-8e8a-5dbd90c1ca60/____.png', bottom: '5%', right: '8%', w: 340, h: 280, rot: -8, dur: 20, dx: -12, dy: 16 },
];

function injectBgPhotos() {
  if (document.querySelector('.bg-photos-container')) return;
  const container = document.createElement('div');
  container.className = 'bg-photos-container';
  BG_PHOTOS.forEach(p => {
    const img = document.createElement('img');
    img.className = 'bg-photo';
    img.src = p.url;
    img.alt = '';
    img.loading = 'lazy';
    img.style.cssText = `top:${p.top||'auto'};bottom:${p.bottom||'auto'};left:${p.left||'auto'};right:${p.right||'auto'};width:${p.w}px;height:${p.h}px;--rot:${p.rot}deg;--dx:${p.dx}px;--dy:${p.dy}px;animation-duration:${p.dur}s;`;
    container.appendChild(img);
  });
  document.body.prepend(container);
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  injectBgPhotos();

  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    const closeBtn = document.getElementById('closeLightbox');
    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  }

  const commentInput = document.getElementById('commentInput');
  const commentSubmit = document.getElementById('commentSubmit');
  if (commentInput && commentSubmit) {
    commentSubmit.addEventListener('click', submitComment);
    commentInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitComment(); });
  }
});

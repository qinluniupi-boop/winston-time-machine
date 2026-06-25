// Winston 时光机 - 公共脚本
const DB_NAME = 'WinstonTimeMachine';
const DB_VERSION = 1;
let db;

const defaultDays = [
  { id: 'default-birthday', name: 'Winston 来的那天', date: '2018-05-12' },
  { id: 'default-bridge', name: '他去彩虹桥那天', date: '2025-03-20' }
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('media')) {
        database.createObjectStore('media', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('metadata')) {
        database.createObjectStore('metadata', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('comments')) {
        const cStore = database.createObjectStore('comments', { keyPath: 'id', autoIncrement: true });
        cStore.createIndex('mediaId', 'mediaId', { unique: false });
      }
      if (!database.objectStoreNames.contains('days')) {
        database.createObjectStore('days', { keyPath: 'id' });
      }
    };
  });
}

async function initDB() {
  db = await openDB();
  const existing = await getAll('days');
  if (existing.length === 0) {
    for (const d of defaultDays) await put('days', d);
  }
}

function tx(store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

function put(store, data) {
  return new Promise((resolve, reject) => {
    const r = tx(store, 'readwrite').put(data);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function get(store, id) {
  return new Promise((resolve, reject) => {
    const r = tx(store).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const r = tx(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function del(store, id) {
  return new Promise((resolve, reject) => {
    const r = tx(store, 'readwrite').delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

function getAllByIndex(store, indexName, value) {
  return new Promise((resolve, reject) => {
    const r = tx(store).index(indexName).getAll(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
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

function blobFromMedia(media) {
  return new Blob([media.data], { type: media.type });
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

async function countComments(mediaId) {
  const list = await getAllByIndex('comments', 'mediaId', mediaId);
  return list.length;
}

async function createPolaroidCard(meta) {
  const media = await get('media', meta.id);
  if (!media) return null;
  const url = URL.createObjectURL(blobFromMedia(media));
  const commentCount = await countComments(meta.id);

  const card = document.createElement('div');
  card.className = 'polaroid';
  card.onclick = () => openLightbox(meta, url);

  let mediaHTML = '';
  if (meta.type === 'video') {
    mediaHTML = `<div class="polaroid-video"><video src="${url}" muted preload="metadata"></video><span>▶</span></div>`;
  } else {
    mediaHTML = `<img class="polaroid-media" src="${url}" alt="${escapeHtml(meta.caption || 'Winston 的回忆')}" loading="lazy" />`;
  }

  card.innerHTML = `
    ${mediaHTML}
    <div class="polaroid-caption">${escapeHtml(meta.caption) || '一个没写下什么的瞬间'}</div>
    <div class="polaroid-meta">
      <span>👤 ${escapeHtml(meta.uploader)} · ${meta.date}</span>
      <span>💬 ${commentCount}</span>
    </div>
  `;
  return card;
}

// 渲染照片墙（支持容器、过滤、空状态、限制数量）
async function renderGallery(container, options = {}) {
  const { filter = 'all', limit = null, emptyText = '还没有回忆' } = options;
  let metas = await getAll('metadata');
  metas.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
let currentUrl = null;

function openLightbox(meta, url) {
  currentMeta = meta;
  currentUrl = url;
  const lightbox = document.getElementById('lightbox');
  const mediaWrap = document.getElementById('lightboxMedia');
  const caption = document.getElementById('lightboxCaption');
  const metaText = document.getElementById('lightboxMeta');

  mediaWrap.innerHTML = '';
  if (meta.type === 'video') {
    const v = document.createElement('video');
    v.src = url;
    v.controls = true;
    v.autoplay = true;
    mediaWrap.appendChild(v);
  } else {
    const img = document.createElement('img');
    img.src = url;
    img.alt = meta.caption || 'Winston 的回忆';
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
  currentUrl = null;
}

async function renderComments(mediaId) {
  const list = await getAllByIndex('comments', 'mediaId', mediaId);
  list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const container = document.getElementById('commentsList');
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<div style="color:var(--ink-light);font-size:0.9rem;font-style:italic;">还没人说话，你要先开口吗？</div>';
    return;
  }
  for (const c of list) {
    const div = document.createElement('div');
    div.className = 'comment';
    div.innerHTML = `
      <div class="comment-author">${escapeHtml(c.author)} · ${formatDate(c.createdAt)}</div>
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
  await put('comments', {
    mediaId: currentMeta.id,
    text,
    author,
    createdAt: new Date().toISOString()
  });
  input.value = '';
  await renderComments(currentMeta.id);
}

function downloadMedia(meta) {
  const a = document.createElement('a');
  a.href = currentUrl;
  a.download = meta.fileName || (meta.type === 'video' ? 'winston-video.mp4' : 'winston-photo.jpg');
  a.click();
}

// 纪念日渲染
async function renderDays(container, options = {}) {
  const { limit = null } = options;
  let days = await getAll('days');
  days.sort((a, b) => daysUntil(a.date) - daysUntil(b.date));
  const displayDays = limit ? days.slice(0, limit) : days;

  container.innerHTML = '';
  if (displayDays.length === 0) {
    container.innerHTML = '<div style="color:var(--ink-light);font-size:0.9rem;">还没有要记住的日子</div>';
    return;
  }
  for (const d of displayDays) {
    const daysLeft = daysUntil(d.date);
    const div = document.createElement('div');
    div.className = 'day-item';
    div.innerHTML = `
      <div class="day-name">${escapeHtml(d.name)}</div>
      <div class="day-date">${d.date}</div>
      <div class="day-countdown">${daysLeft === 0 ? '就是今天 💐' : `还有 ${daysLeft} 天`}</div>
    `;
    if (!limit) {
      div.addEventListener('dblclick', async () => {
        if (confirm('确定不要这个日子了吗？')) {
          await del('days', d.id);
          renderDays(container, options);
        }
      });
    }
    container.appendChild(div);
  }
}

// 页面初始化：绑定灯箱关闭事件
document.addEventListener('DOMContentLoaded', () => {
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

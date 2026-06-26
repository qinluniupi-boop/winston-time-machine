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
  return data || [];
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
    mediaHTML = `<img class="polaroid-media" src="${meta.public_url}" alt="${escapeHtml(meta.caption || 'Winston 的回忆')}" loading="lazy" />`;
  }

  card.innerHTML = `
    ${mediaHTML}
    <div class="polaroid-caption">${escapeHtml(meta.caption) || '一个没写下什么的瞬间'}</div>
    <div class="polaroid-meta">
      <span>👤 ${escapeHtml(meta.uploader)} · ${meta.date}</span>
      <span>💬 ${comments.length}</span>
    </div>
  `;
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

// 纪念日
async function renderDays(container, options = {}) {
  const { limit = null } = options;
  let days = await fetchDays();
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
    div.dataset.dayId = d.id;
    div.innerHTML = `
      <div class="day-name">${escapeHtml(d.name)}</div>
      <div class="day-date">${d.date}</div>
      <div class="day-countdown">${daysLeft === 0 ? '今天' : `还有 ${daysLeft} 天`}</div>
    `;
    if (!limit) {
      div.addEventListener('dblclick', async () => {
        if (confirm('确定不要这个日子了吗？')) {
          const { error } = await client.from('days').delete().eq('id', d.id);
          if (error) alert('删除失败：' + error.message);
          else renderDays(container, options);
        }
      });
    }
    container.appendChild(div);
  }
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

// 页面初始化
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

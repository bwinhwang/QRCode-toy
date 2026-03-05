// ========== 音效：用 Web Audio API 生成"嘀"声 ==========
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBeep() {
  const ctx = ensureAudioCtx();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(2400, ctx.currentTime);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

// ========== 价格生成（基于条码内容哈希，同一条码价格固定） ==========
function hashCode(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // djb2
  }
  return Math.abs(hash);
}

function generatePrice(code) {
  // 用条码内容的哈希值生成确定性价格（0.5 ~ 99.9元）
  const hash = hashCode(code);
  const price = (hash % 994 + 5) / 10; // 0.5 ~ 99.9
  return price;
}

function formatPrice(price) {
  return price.toFixed(2);
}

// ========== 语音播报 ==========
function speakPrice(price) {
  if (!('speechSynthesis' in window)) return;

  // 取消之前的播报
  speechSynthesis.cancel();

  const yuan = Math.floor(price);
  const jiao = Math.round((price - yuan) * 10);

  let text;
  if (yuan === 0) {
    text = jiao + '毛';
  } else if (jiao === 0) {
    text = yuan + '块';
  } else {
    text = yuan + '块' + jiao + '毛';
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  utterance.volume = 1;
  speechSynthesis.speak(utterance);
}

// ========== UI 更新 ==========
const priceValueEl = document.getElementById('price-value');
const statusEl = document.getElementById('status');
const scannerContainer = document.getElementById('scanner-container');

function showPrice(price) {
  priceValueEl.textContent = formatPrice(price);
  priceValueEl.classList.add('flash');
  scannerContainer.classList.add('scanned');

  setTimeout(() => {
    priceValueEl.classList.remove('flash');
    scannerContainer.classList.remove('scanned');
  }, 300);
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ========== 扫描逻辑 ==========
let isProcessing = false;
let lastScannedCode = '';
let lastScanTime = 0;

function onScanSuccess(decodedText) {
  const now = Date.now();

  // 防抖：同一个码 3 秒内不重复触发
  if (decodedText === lastScannedCode && now - lastScanTime < 3000) {
    return;
  }

  if (isProcessing) return;
  isProcessing = true;
  lastScannedCode = decodedText;
  lastScanTime = now;

  // 1. 播放嘀声
  playBeep();

  // 2. 根据条码内容生成固定价格
  const price = generatePrice(decodedText);

  // 3. 显示价格
  showPrice(price);
  setStatus('已扫描');

  // 4. 语音播报
  setTimeout(() => speakPrice(price), 200);

  // 5. 2秒后恢复
  setTimeout(() => {
    isProcessing = false;
    setStatus('准备扫描...');
  }, 2000);
}

// ========== 初始化扫描器 ==========
function initScanner() {
  const html5QrCode = new Html5Qrcode('reader');

  const config = {
    fps: 10,
    qrbox: undefined, // 全区域扫描
    formatsToSupport: [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
    ],
  };

  html5QrCode.start(
    { facingMode: 'environment' },
    config,
    onScanSuccess,
    () => {} // 忽略扫描失败
  ).then(() => {
    setStatus('准备扫描...');
    // 隐藏 html5-qrcode 默认UI
    const dashboard = document.getElementById('reader__dashboard');
    if (dashboard) dashboard.style.display = 'none';
  }).catch((err) => {
    setStatus('无法启动摄像头: ' + err);
    console.error('Camera error:', err);
  });
}

// ========== 页面点击激活音频上下文（iOS要求） ==========
document.addEventListener('click', () => {
  ensureAudioCtx();
}, { once: true });

// ========== 注册 Service Worker ==========
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ========== 启动 ==========
window.addEventListener('DOMContentLoaded', initScanner);

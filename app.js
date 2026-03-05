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

// ========== 购物车状态 ==========
let itemCount = 0;
let totalPrice = 0;

// ========== UI 更新 ==========
const priceValueEl = document.getElementById('price-value');
const scannerContainer = document.getElementById('scanner-container');
const itemCountEl = document.getElementById('item-count');
const totalValueEl = document.getElementById('total-value');
const receiptListEl = document.getElementById('receipt-list');
const receiptEl = document.getElementById('receipt');

function showPrice(price) {
  priceValueEl.textContent = formatPrice(price);
  priceValueEl.classList.add('flash');
  scannerContainer.classList.add('scanned');

  setTimeout(() => {
    priceValueEl.classList.remove('flash');
    scannerContainer.classList.remove('scanned');
  }, 300);
}

function addToReceipt(price) {
  itemCount++;
  totalPrice += price;

  itemCountEl.textContent = itemCount;
  totalValueEl.textContent = formatPrice(totalPrice);

  const item = document.createElement('div');
  item.className = 'receipt-item';
  item.innerHTML =
    '<span class="item-no">#' + itemCount + '</span>' +
    '<span class="item-price">¥' + formatPrice(price) + '</span>';
  receiptListEl.appendChild(item);
  receiptEl.scrollTop = receiptEl.scrollHeight;
}

// ========== 扫描逻辑 ==========
let isProcessing = false;
let lastScannedCode = '';
let lastScanTime = 0;

function onScanSuccess(decodedText) {
  const now = Date.now();
  if (decodedText === lastScannedCode && now - lastScanTime < 3000) return;
  if (isProcessing) return;

  isProcessing = true;
  lastScannedCode = decodedText;
  lastScanTime = now;

  playBeep();

  const price = generatePrice(decodedText);
  showPrice(price);
  addToReceipt(price);

  setTimeout(() => speakPrice(price), 200);

  setTimeout(() => {
    isProcessing = false;
  }, 2000);
}

// ========== 初始化扫描器 ==========
function initScanner() {
  const html5QrCode = new Html5Qrcode('reader', {
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
    verbose: false,
  });

  const container = document.getElementById('scanner-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: Math.floor(w * 0.75), height: Math.floor(h * 0.55) },
    },
    onScanSuccess,
    () => {}
  ).then(() => {
    // ok
  }).catch((err) => {
    console.error('Camera error:', err);
    const startBtn = document.getElementById('start-btn');
    startBtn.textContent = '摄像头失败，点击重试';
    startBtn.style.display = '';
    document.getElementById('scan-line').style.display = 'none';
  });
}

// ========== 注册 Service Worker ==========
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ========== 启动 ==========
window.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', () => {
    try { ensureAudioCtx(); } catch (e) { /* ignore */ }
    if (typeof Html5Qrcode === 'undefined') {
      startBtn.textContent = '加载失败，请联网刷新';
      return;
    }
    startBtn.textContent = '正在启动...';
    startBtn.style.display = 'none';
    document.getElementById('scan-line').style.display = '';
    initScanner();
  });
});

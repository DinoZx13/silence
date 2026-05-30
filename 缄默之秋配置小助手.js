// ═══════════════ Trợ lý Mùa Thu Tĩnh Lặng ═══════════════
// Chỉ cần dán dòng sau vào TavernHelper:
//   import 'https://testingcf.jsdelivr.net/gh/DinoZx13/silence@v1.0.7/缄默之秋配置小助手.min.js'
// ═══════════════════════════════════════════════════════════

const JMZQ_VERSION = '1.0.7';
const WORLDBOOK_NAME = 'Mùa Thu Tĩnh Lặng 2.2';
const p = window.parent || window;

// Dọn dẹp instance cũ
{
  const old = ['jmzq-bubble', 'jmzq-panel', 'jmzq-style'];
  for (const id of old) { const el = p.document.getElementById(id); if (el) el.remove(); }
  if (typeof p._jmzqCleanup === 'function') try { p._jmzqCleanup(); } catch(e) {}
  delete p._jmzqCleanup;
  delete p._jmzqLastResult;
}

// ═══════════════ Cốt lõi: Thực thi mã trong ngữ cảnh trang cha ═══════════════
// Lệnh gọi API bất đồng bộ trong iframe (getWorldbook/updateWorldbookWith) sẽ thất bại 
// do vấn đề ngữ cảnh request. Giải pháp: chèn thẻ <script> vào trang cha,
// thực thi các thao tác trong ngữ cảnh gốc của trang cha, kết quả trả về qua CustomEvent.
function runInParent(fnString) {
  return new Promise((resolve, reject) => {
    const token = 'jmzq_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const handler = (e) => {
      if (!e.detail || e.detail.token !== token) return;
      p.document.removeEventListener('jmzq-result', handler);
      if (e.detail.error) reject(new Error(e.detail.error));
      else resolve(e.detail.result);
    };
    p.document.addEventListener('jmzq-result', handler);

    const script = p.document.createElement('script');
    script.textContent = `
(async () => {
  try {
    var _result = await (${fnString});
    document.dispatchEvent(new CustomEvent('jmzq-result', { detail: { token: '${token}', result: _result } }));
  } catch(_e) {
    document.dispatchEvent(new CustomEvent('jmzq-result', { detail: { token: '${token}', error: _e.message || String(_e) } }));
  }
})();
`;
    p.document.body.appendChild(script);
    script.remove();
  });
}

// ═══════════════ Phân tích tên Worldbook ═══════════════
// TavernHelper đã được mount trên cửa sổ iframe, thao tác đọc có thể gọi trực tiếp, không cần chèn runInParent vào trang cha

let _jmzqManualWbName = null;  // Tên Worldbook do người dùng chọn thủ công (Dự phòng khi phát hiện tự động thất bại)

// Chuẩn hóa kiểu: giá trị trả về của getCharWorldbookNames / getWorldbookNames có thể là
// object {primary, additional}, array, hoặc string, thống nhất trích xuất thành mảng chuỗi
function _jmzqNormalizeNameList(raw, callerLabel) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const names = [];
    function collect(v) {
      if (typeof v === 'string') { names.push(v); return; }
      if (Array.isArray(v)) { v.forEach(collect); return; }
      if (v && typeof v === 'object') { Object.values(v).forEach(collect); }
    }
    collect(raw);
    console.warn('[JMZQ] ' + callerLabel + ' trả về đối tượng không phải mảng, đã đệ quy trích xuất giá trị:', names);
    return names;
  }
  if (typeof raw === 'string' && raw) {
    console.warn('[JMZQ] ' + callerLabel + ' trả về chuỗi, đã đóng gói thành mảng:', raw);
    return [raw];
  }
  console.warn('[JMZQ] ' + callerLabel + ' trả về kiểu bất thường (type=' + typeof raw + '), giá trị:', raw);
  return [];
}

// Phân tích tên Worldbook mục tiêu: Người dùng chọn thủ công → Ràng buộc nhân vật → Tìm kiếm toàn cục → Fallback hardcode
// Gọi trực tiếp TavernHelper trên iframe, không qua runInParent
async function api_resolveWorldbookName() {
  // 0. Ưu tiên người dùng chọn thủ công
  if (_jmzqManualWbName) return _jmzqManualWbName;

  // 1. Khớp chính xác từ Worldbook được liên kết với nhân vật hiện tại
  try {
    const raw = TavernHelper.getCharWorldbookNames('current');
    const bound = _jmzqNormalizeNameList(raw, 'getCharWorldbookNames');
    const hit = bound.find(n => n === WORLDBOOK_NAME);
    if (hit) {
      console.log('[JMZQ] Tự động định vị Worldbook của nhân vật:', hit);
      _jmzqOnWbResolved(hit);
      return hit;
    }
    console.warn('[JMZQ] Không tìm thấy "' + WORLDBOOK_NAME + '" trong Worldbook được liên kết với nhân vật hiện tại, danh sách liên kết:', bound);
  } catch(e) {
    console.warn('[JMZQ] getCharWorldbookNames thất bại:', e.message);
  }

  // 2. Tìm kiếm chính xác từ danh sách toàn bộ Worldbook (dự phòng)
  try {
    const raw = TavernHelper.getWorldbookNames();
    const all = _jmzqNormalizeNameList(raw, 'getWorldbookNames');
    const hit = all.find(n => n === WORLDBOOK_NAME);
    if (hit) {
      console.warn('[JMZQ] Nhân vật chưa được liên kết, tìm thấy từ Worldbook toàn cục:', hit, '(Khuyên dùng liên kết Worldbook này vào thẻ nhân vật)');
      _jmzqOnWbResolved(hit);
      return hit;
    }
  } catch(e) {
    console.warn('[JMZQ] getWorldbookNames thất bại:', e.message);
  }

  // 3. Phát hiện tự động thất bại → Hiển thị bảng chọn thủ công
  _jmzqOnWbNotFound();
  console.warn('[JMZQ] Tự động phát hiện thất bại, sử dụng tên hardcode:', WORLDBOOK_NAME);
  return WORLDBOOK_NAME;
}

// Điền danh sách thả xuống Worldbook (Luôn hiển thị, gọi khi khởi tạo/mở bảng)
function _jmzqPopulateWbSelect() {
  if (!manualWbSelect) return;
  const saved = manualWbSelect.value;  // Ghi nhớ giá trị được chọn hiện tại, tránh mất sau khi tạo lại
  try {
    const raw = TavernHelper.getWorldbookNames();
    const all = _jmzqNormalizeNameList(raw, 'getWorldbookNames');
    manualWbSelect.innerHTML = all.map(n =>
      '<option value="' + n.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;') + '">' + n + '</option>'
    ).join('');
  } catch(e) {
    manualWbSelect.innerHTML = '<option value="">-- Tải thất bại --</option>';
  }
  // Khôi phục giá trị trước đó (nếu vẫn còn trong danh sách mới)
  if (saved && [...manualWbSelect.options].some(o => o.value === saved)) manualWbSelect.value = saved;
  else if (_jmzqManualWbName && [...manualWbSelect.options].some(o => o.value === _jmzqManualWbName)) manualWbSelect.value = _jmzqManualWbName;
}

// Tự động phát hiện Worldbook thành công → Cập nhật giá trị đã chọn trong danh sách thả xuống, khôi phục nhãn màu xanh lá
function _jmzqOnWbResolved(name) {
  if (manualWbSelect && name) {
    if ([...manualWbSelect.options].some(o => o.value === name)) manualWbSelect.value = name;
    else { manualWbSelect.appendChild(p.document.createElement('option')); manualWbSelect.lastChild.value = name; manualWbSelect.lastChild.textContent = name; manualWbSelect.value = name; }
  }
  if (manualWbLabel) { manualWbLabel.textContent = 'Worldbook hiện tại'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
}

// Tự động phát hiện Worldbook thất bại → Chớp đỏ, nhãn đổi thành cảnh báo đỏ
function _jmzqOnWbNotFound() {
  if (manualWbLabel) { manualWbLabel.textContent = 'Tự động phát hiện thất bại, vui lòng chọn thủ công'; manualWbLabel.style.color = '#e74c3c'; }
  if (statusText) { statusText.textContent = 'Worldbook chưa được chọn'; statusText.style.color = '#e74c3c'; }
  if (bubble) bubble.classList.add('warn');
}

async function api_getWorldbook(name) {
  return runInParent(`TavernHelper.getWorldbook(${JSON.stringify(name)})`);
}

// Trực tiếp tại trang cha: Lấy entry → Chỉnh sửa → replaceWorldbook để lưu → Trả về entry sau khi làm mới
async function api_replaceWorldbook(name, entriesModifier) {
  return runInParent(
    `(async () => {` +
    `  var _entries = await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `  (${entriesModifier})(_entries);` +
    `  await TavernHelper.replaceWorldbook(${JSON.stringify(name)}, _entries);` +
    `  return await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `})()`
  );
}

// Thao tác Regex (cấp độ nhân vật)
async function api_getTavernRegexes() {
  return runInParent('TavernHelper.getTavernRegexes({ type: "character" })');
}
async function api_updateTavernRegexes(modifier) {
  return runInParent(
    `TavernHelper.updateTavernRegexesWith(${modifier}, { type: "character" })`
  );
}

// Thao tác cây script nhân vật
async function api_getScriptTrees() {
  return runInParent('TavernHelper.getScriptTrees({ type: "character" })');
}
async function api_updateScriptTrees(modifier) {
  return runInParent(
    `TavernHelper.updateScriptTreesWith(${modifier}, { type: "character" })`
  );
}

// --- CSS (Được chèn vào trang cha, hệ màu Mùa Thu Tĩnh Lặng) ---
const CSS = p.document.createElement('style');
CSS.textContent = `
	  #jmzq-bubble {
	    position: fixed; top: 12vh; left: 14px;
	    width: 44px; height: 44px;
	    background: linear-gradient(145deg, #1a1410, #12100c);
	    border: 1px solid rgba(212,175,55,0.35);
	    border-radius: 14px; z-index: 1000000; cursor: pointer;
	    display: flex; align-items: center; justify-content: center;
	    box-shadow: 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
	    transition: box-shadow .25s, border-color .25s, transform .15s;
	    user-select: none; touch-action: none;
	    -webkit-tap-highlight-color: transparent;
	  }
	  #jmzq-bubble span {
	    font-size: 28px; font-weight: 400; line-height: 1;
	    font-family: 'Ma Shan Zheng', cursive;
	    background: linear-gradient(180deg, #f0d060 0%, #d4773b 50%, #b85a20 100%);
	    -webkit-background-clip: text; background-clip: text;
	    -webkit-text-fill-color: transparent;
	    filter: drop-shadow(0 0 6px rgba(212,175,55,0.3));
	  }
	  #jmzq-bubble:hover {
	    border-color: rgba(212,175,55,0.7);
	    box-shadow: 0 0 20px rgba(212,175,55,0.2), 0 6px 24px rgba(0,0,0,0.7);
	    transform: translateY(-1px);
	  }
	  #jmzq-bubble:hover span {
	    filter: drop-shadow(0 0 12px rgba(212,175,55,0.5));
	  }
	  #jmzq-bubble.running { animation: jmzq-spin 1.2s linear infinite; }
	  @keyframes jmzq-spin { 100% { transform: rotate(360deg); } }

	  @keyframes jmzq-pulse-warn {
	    0%, 100% { border-color: rgba(231,76,60,0.35) !important; }
	    50% { border-color: rgba(231,76,60,0.7) !important; }
	  }

	  #jmzq-bubble.warn {
	    border-color: rgba(234,179,8,0.7);
	    box-shadow: 0 0 20px 6px rgba(234,179,8,0.5), 0 6px 24px rgba(0,0,0,0.7);
	    animation: jmzq-bubble-warn 1.8s ease-in-out infinite;
	  }
	  @keyframes jmzq-bubble-warn {
	    0%, 100% { border-color: rgba(234,179,8,0.5); box-shadow: 0 0 20px 6px rgba(234,179,8,0.4), 0 6px 24px rgba(0,0,0,0.7); }
	    50% { border-color: rgba(255,200,30,0.9); box-shadow: 0 0 24px 8px rgba(255,200,30,0.7), 0 6px 24px rgba(0,0,0,0.7); }
	  }
  .jmzq select {
    width: 100%; max-width: 100%; box-sizing: border-box;
    padding: 9px 32px 9px 12px; border-radius: 6px; font-size: 13px;
    font-family: inherit; background: #1a1410 !important;
    border: 1px solid #4a3525 !important; color: #d5c0a0 !important; cursor: pointer;
    -webkit-appearance: none; appearance: none; transition: border-color 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23D4AF37' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center;
    box-shadow: none !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .jmzq select:hover { border-color: #d4773b !important; }
  .jmzq select:focus { border-color: #D4AF37 !important; outline: none; box-shadow: 0 0 0 2px rgba(212,175,55,0.1) !important; }
  .jmzq select option { background: #1a1410 !important; color: #d5c0a0 !important; }
  .jmzq-btn {
    padding: 7px 14px !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important; background: rgba(200,115,60,0.06) !important;
    color: #e0a060 !important; font-size: 12px; font-weight: 500; font-family: inherit !important;
    transition: all 0.2s; letter-spacing: 0.3px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important; min-height: auto !important;
  }
  .jmzq-btn:hover {
    background: rgba(200,115,60,0.15) !important; border-color: #d4773b !important; color: #fff !important;
  }
  .jmzq-btn.primary {
    width: 100% !important; display: block !important;
    background: linear-gradient(160deg, #D4AF37, #b8941f) !important;
    border: 1px solid #D4AF37 !important; color: #080c14 !important;
    margin-top: 6px; padding: 10px !important; font-size: 13px; font-weight: 700 !important;
    letter-spacing: 0.5px; text-shadow: none !important;
    box-shadow: 0 2px 10px rgba(212,175,55,0.15) !important;
    line-height: 1.4 !important; min-height: auto !important;
    text-align: center !important;
  }
  .jmzq-btn.primary:hover {
    background: linear-gradient(160deg, #e0bc50, #c9a52a) !important;
    border-color: #f0d060 !important; box-shadow: 0 4px 16px rgba(212,175,55,0.3) !important;
    color: #080c14 !important;
  }
  .jmzq-btn.primary:disabled {
    opacity: 0.35; cursor: not-allowed; filter: grayscale(30%);
  }
  .jmzq-btn.xs {
    padding: 4px 10px !important; font-size: 11px; width: auto; border-radius: 5px !important;
    background: transparent !important; border-color: rgba(80,50,25,0.3) !important;
    color: #d4773b !important; font-weight: 500 !important;
    display: inline-block !important; box-shadow: none !important;
  }
  .jmzq-btn.xs:hover {
    border-color: #d4773b !important; color: #e0a060 !important;
    background: rgba(200,115,60,0.08) !important;
  }
  .jmzq-birth-btns {
    display: flex; gap: 10px; margin-bottom: 10px;
  }
  .jmzq-birth-btn {
    flex: 1; padding: 10px 0 !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important;
    background: #1a1410 !important; color: #d5c0a0 !important;
    font-size: 13px; font-weight: 500; font-family: inherit !important;
    transition: all 0.25s; text-align: center !important;
    letter-spacing: 0.5px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important;
  }
  .jmzq-birth-btn:hover {
    background: rgba(200,115,60,0.12) !important; border-color: #d4773b !important;
    color: #fff !important;
  }
  .jmzq-birth-btn.active {
    background: #d4773b !important; border-color: #e0a060 !important;
    color: #fff !important;
    box-shadow: 0 0 12px rgba(200,115,60,0.4) !important;
  }
  .jmzq-panel {
    position: fixed; z-index: 1000001;
    width: 320px; max-height: 62vh;
    background: linear-gradient(170deg, #1a1410, #12100c);
    border: 1px solid rgba(212,175,55,0.25);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 16px rgba(212,175,55,0.06);
    display: flex; flex-direction: column;
    font-size: 13px; color: #d5c0a0;
    font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif;
    overflow: hidden; user-select: none;
  }
  .jmzq-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px; border-bottom: 1px solid rgba(80,50,25,0.2);
    cursor: move;
  }
  .jmzq-header-title {
    font-size: 18px; font-weight: 700;
    background: linear-gradient(180deg, #f0d060, #d4773b);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: 2px;
  }
  .jmzq-body {
    padding: 12px 14px; overflow-y: auto; flex: 1;
    scrollbar-width: thin; scrollbar-color: rgba(200,115,60,0.15) transparent;
  }
  .jmzq-body::-webkit-scrollbar { width: 4px; }
  .jmzq-body::-webkit-scrollbar-thumb { background: rgba(200,115,60,0.15); border-radius: 2px; }
  .jmzq-section {
    background: rgba(200,115,60,0.03); border: 1px solid rgba(80,50,25,0.15);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
  }
  .jmzq-section-title {
    font-size: 11px; font-weight: 600; letter-spacing: 1px;
    color: #D4AF37; margin-bottom: 10px;
  }
  .jmzq-config-status {
    text-align: center; padding: 8px 12px; margin-bottom: 10px;
    border-radius: 6px; font-size: 12px; font-weight: 600;
    background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15);
    color: #4ade80;
  }
  .jmzq-config-status.warn {
    background: rgba(234,179,8,0.06); border-color: rgba(234,179,8,0.2);
    color: #eab308;
  }
  .jmzq-panel .jmzq-status-inline {
    display: flex; align-items: center; gap: 8px; font-size: 12px;
  }
  .jmzq-panel .status-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .jmzq-panel .status-dot.on {
    background: #4ade80;
    box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.4);
  }
  .jmzq-panel .status-dot.off {
    background: #e74c3c;
    box-shadow: 0 0 10px #e74c3c, 0 0 20px rgba(231,76,60,0.4);
  }
  .jmzq-panel .status-dot.missing { background: #3a4a5a; box-shadow: none; }
  .jmzq-panel .status-label { color: #c0a880 !important; }
  .jmzq .toast {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(20,16,10,0.97) !important; border: 1px solid rgba(212,175,55,0.35) !important;
    border-radius: 8px !important; padding: 10px 24px !important; color: #D4AF37 !important;
    font-size: 13px; font-weight: 600; z-index: 1000002;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(212,175,55,0.06) !important;
    animation: jmzq-toast-in 0.3s ease, jmzq-toast-out 0.3s ease 2.2s forwards;
    letter-spacing: 0.3px; font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif !important;
    margin: 0 !important;
  }
  @keyframes jmzq-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @keyframes jmzq-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @media (max-width: 768px) {
    .jmzq-panel { width: clamp(260px, 88vw, 340px) !important; font-size: 12px; }
    #jmzq-bubble { width: 36px; height: 36px; } #jmzq-bubble span { font-size: 22px; }
    .jmzq-header { padding: 10px 12px 8px !important; }
    .jmzq-header-title { font-size: 16px; letter-spacing: 1px; }
    .jmzq-body { padding: 10px 10px !important; }
    .jmzq-section { padding: 10px !important; margin-bottom: 8px; }
    .jmzq-section-title { font-size: 10px; margin-bottom: 8px; }
    .jmzq-birth-btn { padding: 8px 0 !important; font-size: 12px; }
    .jmzq-birth-btns { gap: 8px; }
    .jmzq-btn.xs { padding: 6px 12px !important; font-size: 12px; }
    .jmzq-panel .jmzq-status-inline { font-size: 11px; gap: 6px; }
    .jmzq-panel .status-dot { width: 8px; height: 8px; }
    .jmzq-panel select { padding: 7px 28px 7px 10px; font-size: 12px; }
    .jmzq-config-status { padding: 8px 10px !important; font-size: 12px; margin-bottom: 8px; }
    #jmzq-manual-wb select { font-size: 11px; padding: 6px 24px 6px 8px; }
    #jmzq-manual-wb .jmzq-btn.xs { padding: 5px 10px !important; font-size: 11px; white-space: nowrap; }
  }
  .jmzq-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .jmzq-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .jmzq-dot.ok  { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.5); }
  .jmzq-dot.err { background: #e74c3c; box-shadow: 0 0 8px rgba(231,76,60,0.5); }
  .jmzq-dot.idle{ background: #3a4a5a; }
  .jmzq-kv { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .jmzq-tag {
    background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2);
    border-radius: 5px; padding: 2px 7px; font-size: 10px; color: rgba(212,175,55,0.75);
  }
  .jmzq-tag.err { background: rgba(231,76,60,0.08); border-color: rgba(231,76,60,0.25); color: #e74c3c; }
  #jmzq-status-text { color: #4ade80; font-size: 11px; }
`;
p.document.head.appendChild(CSS);

// Bổ sung CSS cho form cấu hình MVU
const MVU_CSS = p.document.createElement('style');
MVU_CSS.textContent = `
  .jmzq-mvu-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .jmzq-mvu-row.col { flex-direction: column; align-items: stretch; gap: 2px; }
  .jmzq-mvu-label { font-size: 13px; color: #c0a880; white-space: nowrap; flex-shrink: 0; min-width: 56px; letter-spacing: 0.3px; }
  .jmzq-mvu-label.wide { min-width: 64px; }
  .jmzq-mvu-input { flex: 1; padding: 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #1a1410 !important; border: 1px solid #4a3525 !important; color: #d5c0a0 !important; transition: border-color 0.2s; min-width: 0; box-shadow: none !important; outline: none !important; }
  .jmzq-mvu-input:focus { border-color: #d4773b !important; }
  .jmzq-mvu-input.num { width: 58px; flex: 0 0 auto; text-align: center; padding: 5px 2px; }
  .jmzq-mvu-select { flex: 1; padding: 5px 26px 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #1a1410 !important; border: 1px solid #4a3525 !important; color: #d5c0a0 !important; cursor: pointer; -webkit-appearance: none; appearance: none; transition: border-color 0.2s; min-width: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23D4AF37' d='M5 7L1 3h8z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 7px center; box-shadow: none !important; outline: none !important; }
  .jmzq-mvu-select:focus { border-color: #d4773b !important; }
  .jmzq-mvu-check-row { display: flex; align-items: center; gap: 4px; margin-bottom: 1px; font-size: 13px; color: #c8b898; cursor: pointer; line-height: 1.4; }
  .jmzq-mvu-check-row input[type="checkbox"] { display: none !important; }
  .jmzq-mvu-check-box { width: 14px; height: 14px; flex-shrink: 0; border: 1.5px solid #4a3a28; border-radius: 3px; background: #1a1410; transition: all 0.15s; display: inline-block; box-sizing: border-box; }
  .jmzq-mvu-check-row input:checked ~ .jmzq-mvu-check-box { background: #d4773b; border-color: #d4773b; }
  .jmzq-mvu-check-row:hover .jmzq-mvu-check-box { border-color: #d4773b; }
  .jmzq-mvu-hint { font-size: 11px; color: #d5c0a0; line-height: 1.4; margin-top: 1px; }
  .jmzq-mvu-subtitle { font-size: 10px; color: #D4AF37; letter-spacing: 0.8px; margin: 5px 0 2px; padding-top: 4px; border-top: 1px solid rgba(80,50,25,0.2); }
  .jmzq-mvu-collapse-header { display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px; color: #d4773b; padding: 3px 0; user-select: none; }
  .jmzq-mvu-collapse-header:hover { color: #e0a060; }
  .jmzq-mvu-collapse-arrow { display: inline-block; font-size: 8px; transition: transform 0.2s; }
  .jmzq-mvu-collapse-arrow.open { transform: rotate(90deg); }
  .jmzq-mvu-collapse-body { padding-left: 4px; }
  .jmzq-mvu-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
  #jmzq-mvu-section { padding: 10px 12px !important; }
  #jmzq-mvu-section .jmzq-mvu-subtitle:first-of-type { margin-top: 2px; }
  #jmzq-mvu-section::-webkit-scrollbar { width: 3px; }
  #jmzq-mvu-section::-webkit-scrollbar-thumb { background: rgba(200,115,60,0.15); border-radius: 2px; }
  #jmzq-confirm-dialog { overflow: hidden !important; }
  #jmzq-confirm-body { overflow: hidden; }
  #jmzq-confirm-body .jmzq-mvu-select { max-width: 100%; width: 0; }
  #jmzq-confirm-body .jmzq-mvu-input { max-width: 100%; }
  #jmzq-confirm-body .jmzq-mvu-row { overflow: hidden; }
`;
p.document.head.appendChild(MVU_CSS);


// --- HTML (Được chèn vào trang cha) ---
p.document.body.insertAdjacentHTML('beforeend', `
  <div id="jmzq-bubble" style="top: 40vh; left: 60px;" title="Trợ lý cấu hình Mùa Thu Tĩnh Lặng"><span>Thu</span></div>
  <div id="jmzq-panel" class="jmzq-panel" style="display:none; left: 110px; top: 35vh;">
    <div class="jmzq-header" id="jmzq-drag">
      <span class="jmzq-header-title">Trợ lý cấu hình Mùa Thu Tĩnh Lặng</span>
      <button class="jmzq-btn xs" id="jmzq-refresh" title="Làm mới">Làm mới</button>
    </div>
    <div class="jmzq-body">
      <div class="jmzq-config-status" id="jmzq-config-status">Cấu hình hoạt động bình thường</div>
      <div id="jmzq-backend-code" style="text-align:center;margin-bottom:10px;font-size:10px;color:#6a5a42;line-height:1.6;word-break:break-all;"></div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">Trạng thái Worldbook</div>
        <div class="jmzq-row">
          <div class="jmzq-dot idle" id="jmzq-status-dot"></div>
          <span id="jmzq-status-text">Đã sẵn sàng, chờ tin nhắn kích hoạt…</span>
        </div>
        <div id="jmzq-stat-tags" class="jmzq-kv"></div>
        <div id="jmzq-manual-wb" style="margin-top:8px;">
          <div style="font-size:11px;color:#c0a880;margin-bottom:4px;" id="jmzq-manual-wb-label">Chuyển đổi Worldbook</div>
          <div style="display:flex;gap:6px;">
            <select class="jmzq-mvu-select" id="jmzq-manual-wb-select" style="flex:1;font-size:12px;"></select>
            <button class="jmzq-btn xs" id="jmzq-manual-wb-apply">Chuyển đổi</button>
          </div>
        </div>
      </div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">Mẫu Prompt</div>
        <button class="jmzq-btn primary" id="jmzq-ejs-optimize" style="margin-bottom:4px;">Cấu hình tối ưu 1-click</button>
        <div id="jmzq-ejs-status" style="font-size:11px;color:#c0a880;margin-top:6px;text-align:center;line-height:1.5;"></div>
      </div>
      <div class="jmzq-section" id="jmzq-mvu-section">
        <div class="jmzq-section-title">Cấu hình Plugin MVU</div>
        <button class="jmzq-btn primary" id="jmzq-mvu-optimize" style="margin-bottom:8px;">Cấu hình tối ưu 1-click</button>
        <div class="jmzq-mvu-collapse-header" id="jmzq-mvu-manual-toggle" style="font-size:13px;justify-content:center;">
          <span class="jmzq-mvu-collapse-arrow" id="jmzq-mvu-manual-arrow">▶</span><span>Cấu hình thủ công</span>
        </div>
        <div class="jmzq-mvu-collapse-body" id="jmzq-mvu-manual-panel" style="display:none;">
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label">Phương thức cập nhật</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-update-mode">
            <option value="Theo đầu ra AI">Theo đầu ra AI</option>
            <option value="Phân tích mô hình bổ sung">Phân tích mô hình bổ sung</option>
          </select>
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label">Nguồn mô hình</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-model-source">
            <option value="Giống với API">Giống với API</option>
            <option value="Tùy chỉnh">Tùy chỉnh</option>
          </select>
        </div>
        <div id="jmzq-mvu-custom-api">
        <div class="jmzq-mvu-subtitle" style="margin-top:8px;">Kết nối mô hình</div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">Địa chỉ API</label>
          <input class="jmzq-mvu-input" id="jmzq-mvu-api-url" placeholder="https://...">
          <button class="jmzq-btn xs" id="jmzq-mvu-fetch-models" style="flex-shrink:0;">Lấy mô hình</button>
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">Khóa API</label>
          <input class="jmzq-mvu-input" id="jmzq-mvu-api-key" type="password" placeholder="sk-...">
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">Tên mô hình</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-model-name">
            <option value="">-- Vui lòng lấy mô hình trước --</option>
          </select>
        </div>
        <div class="jmzq-mvu-hint">Mô hình fake stream sẽ tự động bật tương thích fake stream</div>
        <div class="jmzq-mvu-hint">Khuyên dùng các mô hình gemini 2.5p / 3.1p / 3.5f</div>
        </div><div id="jmzq-mvu-extra-panel" style="display:none;">
          <div class="jmzq-mvu-subtitle">Phân tích mô hình bổ sung</div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">Phương án vượt rào</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-jailbreak">
              <option value="Sử dụng vượt rào tích hợp">Sử dụng vượt rào tích hợp</option>
              <option value="Sử dụng preset hiện tại">Sử dụng preset hiện tại</option>
              <option value="Sử dụng preset khác">Sử dụng preset khác</option>
            </select>
          </div>
          <div class="jmzq-mvu-hint">Preset Thần Mèo nhỏ vui lòng chọn preset vượt rào</div>
          <div class="jmzq-mvu-row" id="jmzq-mvu-preset-row" style="display:none;">
            <label class="jmzq-mvu-label">Chọn preset</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-preset-name">
              <option value="">-- Đang tải... --</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">Định dạng phản hồi</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-resp-format">
              <option value="Tin nhắn trò chuyện">Tin nhắn trò chuyện</option>
              <option value="Gọi công cụ">Gọi công cụ</option>
              <option value="Đầu ra định dạng">Đầu ra định dạng</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">Phương thức yêu cầu</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-request-mode">
              <option value="Yêu cầu lần lượt, thử lại nếu thất bại">Yêu cầu lần lượt, thử lại nếu thất bại</option>
              <option value="Chỉ yêu cầu một lần">Chỉ yêu cầu một lần</option>
              <option value="Yêu cầu đồng thời">Yêu cầu đồng thời</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">Số lần yêu cầu</label>
            <input class="jmzq-mvu-input num" id="jmzq-mvu-request-count" type="number" min="1" max="10">
          </div>
          <label class="jmzq-mvu-check-row">
            <input type="checkbox" id="jmzq-mvu-auto-request"><span class="jmzq-mvu-check-box"></span><span>Bật yêu cầu tự động</span>
          </label>
          <div class="jmzq-mvu-collapse-header" id="jmzq-mvu-adv-toggle">
            <span class="jmzq-mvu-collapse-arrow" id="jmzq-mvu-adv-arrow">▶</span><span>Tham số nâng cao</span>
          </div>
          <div class="jmzq-mvu-collapse-body" id="jmzq-mvu-adv-panel" style="display:none;">
            <div class="jmzq-mvu-grid-2">
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Token phản hồi tối đa</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-max-tokens" type="number" min="1" max="1048576" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Nhiệt độ</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-temperature" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Hình phạt tần suất</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-freq-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Hình phạt hiện diện</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-pres-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Top P</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-top-p" type="number" min="0" max="1" step="0.01" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">Top K</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-top-k" type="number" min="0" max="100" style="width:100%;">
              </div>
            </div>
          </div>
        </div>
        <div class="jmzq-mvu-subtitle">Tự động dọn dẹp biến</div>
        <label class="jmzq-mvu-check-row">
          <input type="checkbox" id="jmzq-mvu-auto-clean-enable"><span class="jmzq-mvu-check-box"></span><span>Bật tự động dọn dẹp biến</span>
        </label>
        <div id="jmzq-mvu-clean-panel" style="display:none;">
          <div class="jmzq-mvu-grid-2">
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">Khoảng thời gian lưu ảnh chụp</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-interval" type="number" min="5" max="500" style="width:100%;">
            </div>
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">Số tầng gần đây cần giữ lại biến</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-recent" type="number" min="1" max="200" style="width:100%;">
            </div>
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">Số tầng gần đây kích hoạt khôi phục biến</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-trigger" type="number" min="1" max="200" style="width:100%;">
            </div>
          </div>
        </div>
        <div class="jmzq-mvu-subtitle">Khả năng tương thích</div>
        <div id="jmzq-mvu-compat-checks"></div>
        <button class="jmzq-btn primary" id="jmzq-mvu-apply" style="background:linear-gradient(160deg, #d4773b, #a0522d) !important;border-color:#d4773b !important;">Áp dụng cấu hình (Làm mới trang)</button>
        </div><div id="jmzq-mvu-status" style="font-size:11px;color:#c0a880;margin-top:6px;text-align:center;line-height:1.6;"></div>
      </div>
      <div id="jmzq-confirm-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000003;align-items:center;justify-content:center;">
        <div id="jmzq-confirm-dialog" style="background:#1a1410;border:1px solid #D4AF37;border-radius:10px;padding:20px 24px;max-width:380px;width:90vw;text-align:left;color:#d5c0a0;font-size:13px;line-height:1.6;box-shadow:0 8px 32px rgba(0,0,0,0.7);">
          <div id="jmzq-confirm-msg" style="margin-bottom:12px;text-align:center;"></div>
          <div id="jmzq-confirm-body" style="display:none;margin-bottom:12px;"></div>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="jmzq-btn xs" id="jmzq-confirm-cancel" style="min-width:64px;">Hủy</button>
            <button class="jmzq-btn primary" id="jmzq-confirm-ok" style="min-width:64px;margin-top:0;">Xác nhận</button>
          </div>
        </div>
      </div>
      <div style="text-align:center;padding:12px 16px 14px;border-top:1px solid rgba(80,50,25,0.2);margin-top:4px;">
        <div style="font-size:14px;color:#d4773b;letter-spacing:0.5px;margin-bottom:4px;">DISCORD · Cộng đồng Liên Não · NLKASHEI</div>
        <div style="font-size:12px;color:#6a5a42;">Hoàn toàn miễn phí, cẩn thận bị lừa</div>
        <div style="font-size:12px;color:#7a5030;">v${JMZQ_VERSION}</div>
      </div>
    </div>
  </div>
`);

// --- Tham chiếu DOM ---
const bubble = p.document.getElementById('jmzq-bubble');
const panel = p.document.getElementById('jmzq-panel');
const statusDot = p.document.getElementById('jmzq-status-dot');
const statusText = p.document.getElementById('jmzq-status-text');
const statTags = p.document.getElementById('jmzq-stat-tags');
const manualWbDiv = p.document.getElementById('jmzq-manual-wb');
const manualWbLabel = p.document.getElementById('jmzq-manual-wb-label');
const manualWbSelect = p.document.getElementById('jmzq-manual-wb-select');
const manualWbApply = p.document.getElementById('jmzq-manual-wb-apply');
const refreshBtn = p.document.getElementById('jmzq-refresh');
const configStatus = p.document.getElementById('jmzq-config-status');
const backendCode = p.document.getElementById('jmzq-backend-code');
const mvuSection = p.document.getElementById('jmzq-mvu-section');
const mvuUpdateMode = p.document.getElementById('jmzq-mvu-update-mode');
const mvuModelSource = p.document.getElementById('jmzq-mvu-model-source');
const mvuCustomApi = p.document.getElementById('jmzq-mvu-custom-api');
const mvuExtraPanel = p.document.getElementById('jmzq-mvu-extra-panel');
const mvuJailbreak = p.document.getElementById('jmzq-mvu-jailbreak');
const mvuPresetRow = p.document.getElementById('jmzq-mvu-preset-row');
const mvuPresetName = p.document.getElementById('jmzq-mvu-preset-name');
const mvuRespFormat = p.document.getElementById('jmzq-mvu-resp-format');
const mvuRequestMode = p.document.getElementById('jmzq-mvu-request-mode');
const mvuRequestCount = p.document.getElementById('jmzq-mvu-request-count');
const mvuAutoRequest = p.document.getElementById('jmzq-mvu-auto-request');
const mvuApiUrl = p.document.getElementById('jmzq-mvu-api-url');
const mvuApiKey = p.document.getElementById('jmzq-mvu-api-key');
const mvuFetchModelsBtn = p.document.getElementById('jmzq-mvu-fetch-models');
const mvuModelName = p.document.getElementById('jmzq-mvu-model-name');
const mvuManualToggle = p.document.getElementById('jmzq-mvu-manual-toggle');
const mvuManualArrow = p.document.getElementById('jmzq-mvu-manual-arrow');
const mvuManualPanel = p.document.getElementById('jmzq-mvu-manual-panel');
const mvuAdvToggle = p.document.getElementById('jmzq-mvu-adv-toggle');
const mvuAdvArrow = p.document.getElementById('jmzq-mvu-adv-arrow');
const mvuAdvPanel = p.document.getElementById('jmzq-mvu-adv-panel');
const mvuMaxTokens = p.document.getElementById('jmzq-mvu-max-tokens');
const mvuTemperature = p.document.getElementById('jmzq-mvu-temperature');
const mvuFreqPenalty = p.document.getElementById('jmzq-mvu-freq-penalty');
const mvuPresPenalty = p.document.getElementById('jmzq-mvu-pres-penalty');
const mvuTopP = p.document.getElementById('jmzq-mvu-top-p');
const mvuTopK = p.document.getElementById('jmzq-mvu-top-k');
const mvuAutoCleanEnable = p.document.getElementById('jmzq-mvu-auto-clean-enable');
const mvuCleanPanel = p.document.getElementById('jmzq-mvu-clean-panel');
const mvuCleanInterval = p.document.getElementById('jmzq-mvu-clean-interval');
const mvuCleanRecent = p.document.getElementById('jmzq-mvu-clean-recent');
const mvuCleanTrigger = p.document.getElementById('jmzq-mvu-clean-trigger');
const mvuCompatChecks = p.document.getElementById('jmzq-mvu-compat-checks');
const mvuOptimizeBtn = p.document.getElementById('jmzq-mvu-optimize');
const mvuApplyBtn = p.document.getElementById('jmzq-mvu-apply');
const mvuStatus = p.document.getElementById('jmzq-mvu-status');
const ejsOptimizeBtn = p.document.getElementById('jmzq-ejs-optimize');
const ejsStatus = p.document.getElementById('jmzq-ejs-status');
const jmzqConfirmOverlay = p.document.getElementById('jmzq-confirm-overlay');
const jmzqConfirmMsg = p.document.getElementById('jmzq-confirm-msg');
const jmzqConfirmBody = p.document.getElementById('jmzq-confirm-body');
const jmzqConfirmOk = p.document.getElementById('jmzq-confirm-ok');
const jmzqConfirmCancel = p.document.getElementById('jmzq-confirm-cancel');

// --- Toast ---
function showToast(msg) {
  const t = p.document.createElement('div');
  t.className = 'jmzq toast';
  t.textContent = msg;
  p.document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}


// --- Kiểm tra cấu hình: Kiểm tra tên mô hình ---
const CONFIG_BLACKLIST = ['lần','máu','đặc biệt','ưu đãi','phúc','lợi','hươu','lượng','plus','Plus','PLUS','chuyển','quan','0','auto','AUTO','Auto','+'];
const CONFIG_URL_WHITELIST = ['siliconflow', 'openrouter', 'ark.cn', 'edgefn', 'qnaigc', 'nvidia', 'baidubce', 'ananbdhdh'];
const CONFIG_URL_BLACKLIST = ['gemai','sta1n','chr1','iisbo','xqiqix','chatnewai','qingjiu','lemonapi'];

function checkConfig() {
  try {
    updateBackendCode();

    // Phát hiện cắt đứt thầm lặng: URL/danh sách đen mô hình → Chỉ kiểm soát đánh chặn fetch, không thông báo cho người dùng
    const apiUrl = getMainApiUrl().toLowerCase();
    if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return;
    let model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    if (!model) {
      const cs = SillyTavern.chatCompletionSettings || {};
      model = inferModelFromSettings(cs);
    }

    // Kiểm tra cấu hình mà người dùng có thể thấy
    const issues = [];

    const cfg = getMvuCfg();
    if (cfg) {
      if (cfg.Phương thức cập nhật !== 'Phân tích mô hình bổ sung') issues.push('Phương thức cập nhật MVU chưa tối ưu');
      const n = cfg.Thông báo || {};
      if (!(n['Khung MVU tải thành công'] && n['Khởi tạo biến thành công'] && n['Lỗi cập nhật biến'] && n['Đang phân tích mô hình bổ sung'])) {
        issues.push('Chưa bật đủ 4 thông báo MVU');
      }
    }

    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (!ejs) {
      issues.push('Mẫu Prompt chưa được cài đặt');
    } else if (disabled.includes('third-party/ST-Prompt-Template')) {
      issues.push('Mẫu Prompt đã bị vô hiệu hóa');
    } else {
      for (const [k, v] of Object.entries(EJS_OPTIMAL)) {
        if (ejs[k] !== v) { issues.push('Cấu hình Mẫu Prompt có sai lệch'); break; }
      }
    }

    if (issues.length === 0) {
      configStatus.textContent = 'Cấu hình hoạt động bình thường';
      configStatus.classList.remove('warn');
      bubble.classList.remove('warn');
    } else {
      configStatus.innerHTML = '⚠ Lỗi cấu hình: ' + issues.join('；');
      configStatus.classList.add('warn');
      bubble.classList.add('warn');
    }
  } catch (e) {
    configStatus.textContent = 'Phát hiện thất bại';
  }
}

function getMvuCfg() { return SillyTavern.extensionSettings.mvu_settings; }

// Suy luận tên mô hình từ chatCompletionSettings (fallback khi getChatCompletionModel không khả dụng)
function inferModelFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';
  const sourceMap = {
    claude: 'claude_model', openai: 'openai_model', makersuite: 'google_model',
    google: 'google_model', vertexai: 'vertexai_model', openrouter: 'openrouter_model',
    ai21: 'ai21_model', mistralai: 'mistralai_model', custom: 'custom_model',
    cohere: 'cohere_model', perplexity: 'perplexity_model', groq: 'groq_model',
    siliconflow: 'siliconflow_model', electronhub: 'electronhub_model',
    chutes: 'chutes_model', nanogpt: 'nanogpt_model', deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model', xai: 'xai_model', pollinations: 'pollinations_model',
    cometapi: 'cometapi_model', moonshot: 'moonshot_model', fireworks: 'fireworks_model',
    azure_openai: 'azure_openai_model', zai: 'zai_model',
  };
  const key = sourceMap[settings.chat_completion_source];
  if (key && settings[key]) return settings[key];
  const fallbackKeys = ['model', 'custom_model', 'openai_model', 'claude_model',
    'google_model', 'openrouter_model', 'mistralai_model', 'deepseek_model', 'zai_model'];
  for (const k of fallbackKeys) { if (settings[k]) return settings[k]; }
  return '';
}

function getMainApiUrl() {
  try {
    // 1. Khóa URL của chatCompletionSettings (Cài đặt mô hình chính, sẽ không bị lẫn mô hình bổ sung)
    const cs = SillyTavern.chatCompletionSettings || {};
    const urlKeys = ['server_url', 'reverse_proxy', 'custom_url', 'api_url',
      'openai_server_url', 'openai_reverse_proxy', 'custom_server_url', 'base_url'];
    for (const k of urlKeys) {
      if (cs[k] && typeof cs[k] === 'string' && cs[k].startsWith('http')) return cs[k];
    }
    // 2. Các profile của connectionManager (Loại trừ địa chỉ API của mô hình MVU bổ sung)
    const cm = SillyTavern.extensionSettings.connectionManager;
    if (cm) {
      const profiles = cm.profiles || [];
      // Đọc địa chỉ API của mô hình MVU bổ sung để dùng cho loại trừ
      let extraUrl = '';
      try {
        const mvuCfg = SillyTavern.extensionSettings.mvu_settings;
        if (mvuCfg && mvuCfg.Cấu hình phân tích mô hình bổ sung && mvuCfg.Cấu hình phân tích mô hình bổ sung.Địa chỉ API) {
          extraUrl = mvuCfg.Cấu hình phân tích mô hình bổ sung.Địa chỉ API.replace(/\/+$/, '').toLowerCase();
        }
      } catch(e) {}
      // Ưu tiên trả về profile không khớp với URL của mô hình bổ sung
      for (const prof of profiles) {
        const profUrl = (prof['api-url'] || '').replace(/\/+$/, '').toLowerCase();
        if (profUrl && profUrl !== extraUrl) return prof['api-url'];
      }
      // Tất cả profile đều khớp với mô hình bổ sung (hoặc chỉ có một profile), sử dụng selectedProfile
      const pid = cm.selectedProfile;
      if (pid) {
        const prof = profiles.find(p => p.id === pid);
        if (prof && prof['api-url']) return prof['api-url'];
      }
    }
    return '';
  } catch(e) { return ''; }
}

// Lưu cài đặt (Thử đa đường dẫn, tương thích với các phiên bản Tavern khác nhau)
// Quan trọng: SillyTavern là getter, mỗi lần truy cập sẽ tạo snapshot ngữ cảnh mới,
// saveSettingsDebounced của nó cũng thay đổi thành các instance closure khác nhau (mỗi instance có timer riêng).
// Nếu tính năng tự động lưu và nút áp dụng nhận các instance khác nhau, debounce sẽ không tương tác, gây lỗi ghi đè.
// Do đó, bắt buộc phải lưu cache tham chiếu khi khởi tạo, đảm bảo tất cả lệnh gọi cùng sử dụng một wrapper debounced.
const _saveSettingsFn = (() => {
  return SillyTavern.saveSettingsDebounced
    || (p.SillyTavern && p.SillyTavern.saveSettingsDebounced)
    || (typeof p.saveSettingsDebounced === 'function' ? p.saveSettingsDebounced : null);
})();

function saveSettings() {
  if (_saveSettingsFn) return _saveSettingsFn();
  throw new Error('saveSettingsDebounced không khả dụng');
}

const _BK = 'ZODMVUKY';

// ═══════════════ Triển khai DES bằng Pure JS (Dự phòng khi CryptoJS không khả dụng) ═══════════════
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_ROT = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];

function desPermute(bits, table) { return table.map(i => bits[i - 1]); }
function desLeftShift(bits, count) { return bits.slice(count).concat(bits.slice(0, count)); }
function desXor(a, b) { return a.map((v, i) => v ^ b[i]); }
function desBytesToBits(bytes) {
  const bits = [];
  for (const byte of bytes) { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1); }
  return bits;
}
function desBitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  return bytes;
}
function desCreateSubkeys(keyBytes) {
  const keyBits = desPermute(desBytesToBits(keyBytes), DES_PC1);
  let c = keyBits.slice(0, 28), d = keyBits.slice(28);
  const subkeys = [];
  for (const shift of DES_ROT) {
    c = desLeftShift(c, shift); d = desLeftShift(d, shift);
    subkeys.push(desPermute(c.concat(d), DES_PC2));
  }
  return subkeys;
}
function desFeistel(right, subkey) {
  const expanded = desXor(desPermute(right, DES_E), subkey);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const chunk = expanded.slice(i * 6, i * 6 + 6);
    const row = (chunk[0] << 1) | chunk[5];
    const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
    const val = DES_SBOX[i][row * 16 + col];
    out.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
  }
  return desPermute(out, DES_P);
}
function desEncryptBlock(block, subkeys) {
  const bits = desPermute(desBytesToBits(block), DES_IP);
  let left = bits.slice(0, 32), right = bits.slice(32);
  for (let i = 0; i < 16; i++) {
    const nextLeft = right;
    const nextRight = desXor(left, desFeistel(right, subkeys[i]));
    left = nextLeft; right = nextRight;
  }
  return desBitsToBytes(desPermute(right.concat(left), DES_FP));
}
function stringToUtf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  const encoded = unescape(encodeURIComponent(text));
  return Array.from(encoded, ch => ch.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Base64 encoding không khả dụng');
}
function desEcbPkcs7EncryptBase64(plainText, key) {
  const keyBytes = stringToUtf8Bytes(key);
  if (keyBytes.length !== 8) throw new Error('Khóa DES phải là 8 byte');
  const plainBytes = stringToUtf8Bytes(plainText);
  const pad = 8 - (plainBytes.length % 8) || 8;
  for (let i = 0; i < pad; i++) plainBytes.push(pad);
  const subkeys = desCreateSubkeys(keyBytes);
  let encrypted = [];
  for (let i = 0; i < plainBytes.length; i += 8)
    encrypted = encrypted.concat(desEncryptBlock(plainBytes.slice(i, i + 8), subkeys));
  return bytesToBase64(encrypted);
}

function encryptPayload(payload) {
  // Ưu tiên CryptoJS (môi trường tệp chính), nếu không khả dụng, sử dụng Pure JS DES (Tavern phiên bản cũ không có CryptoJS)
  const C = (p && p.CryptoJS) || (typeof CryptoJS !== 'undefined' ? CryptoJS : null);
  if (C && C.DES && C.enc && C.enc.Utf8 && C.mode && C.mode.ECB && C.pad && C.pad.Pkcs7) {
    return C.DES.encrypt(C.enc.Utf8.parse(payload), C.enc.Utf8.parse(_BK), {
      mode: C.mode.ECB, padding: C.pad.Pkcs7
    }).toString();
  }
  return desEcbPkcs7EncryptBase64(payload, _BK);
}

function updateBackendCode() {
  try {
    const model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    const apiUrl = getMainApiUrl();
    const localHref = (p && p.location && p.location.href) || '';
    const payload = (model ? model : '') + (apiUrl ? '|' + apiUrl : '') + (localHref ? '|' + localHref : '');
    if (!payload) { backendCode.innerHTML = ''; return; }
    const encrypted = encryptPayload(payload);
    backendCode.innerHTML = '<span style="font-size:10px;color:#6a5a42;">Mã cấu hình nền</span> <code style="font-size:10px;font-family:Consolas,Monaco,monospace;background:#080c14;color:#c0a880;padding:2px 6px;border-radius:3px;border:1px solid #1c3d5e;white-space:nowrap;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;cursor:pointer;" title="Nhấp để sao chép" onclick="navigator.clipboard.writeText(this.textContent);var b=this.nextElementSibling;b.textContent=\'Đã sao chép\';setTimeout(()=>b.textContent=\'Sao chép\',1500);">' + encrypted + '</code> <button class="jmzq-btn xs" style="vertical-align:middle;" onclick="navigator.clipboard.writeText(\'' + encrypted + '\');this.textContent=\'Đã sao chép\';setTimeout(()=>this.textContent=\'Sao chép\',1500);">Sao chép</button>';
  } catch (e) {
    backendCode.innerHTML = '';
  }
}

// Đọc cấu hình MVU - Dùng iframe proxy trực tiếp (Script dò đường đã xác minh SillyTavern.extensionSettings.mvu_settings có thể đọc bình thường)
// Lưu ý: Không dùng runInParent đọc window.SillyTavern.extensionSettings ở trang cha, trang cha không có đường dẫn này
function readMvuCfgFromParent() {
  return getMvuCfg();
}

// Xây dựng hộp kiểm tương thích (Đọc động tên key)
function buildCompatChecks() {
  const cfg = getMvuCfg();
  const compat = cfg && cfg.Khả năng tương thích ? cfg.Khả năng tương thích : {};
  const keys = Object.keys(compat);
  mvuCompatChecks.innerHTML = keys.map(k => {
    const checked = compat[k] ? ' checked' : '';
    return '<label class="jmzq-mvu-check-row"><input type="checkbox" class="jmzq-mvu-compat-check" data-key="' + k + '"' + checked + '><span class="jmzq-mvu-check-box"></span><span>' + k + '</span></label>';
  }).join('');
}

// Đồng bộ từ config vào form
function syncMvuToForm(cfg) {
  if (!cfg) cfg = getMvuCfg();
  if (!cfg) return;

  const bu = ewcGetEwcYH();

  // Phương thức cập nhật
  mvuUpdateMode.value = cfg.Phương thức cập nhật || bu.Phương thức cập nhật || 'Theo đầu ra AI';
  mvuModelSource.value = (cfg.Cấu hình phân tích mô hình bổ sung?.Nguồn mô hình) || bu.Nguồn mô hình || 'Giống với API';
  const isExtra = cfg.Phương thức cập nhật === 'Phân tích mô hình bổ sung';
  mvuExtraPanel.style.display = isExtra ? '' : 'none';

  // Cấu hình phân tích mô hình bổ sung — em ưu tiên, _ewcYH dự phòng
  const em = cfg.Cấu hình phân tích mô hình bổ sung || {};
  mvuJailbreak.value = em.Phương án vượt rào || bu.Phương án vượt rào || 'Sử dụng vượt rào tích hợp';
  mvuPresetRow.style.display = (mvuJailbreak.value === 'Sử dụng preset khác') ? '' : 'none';
  if (mvuJailbreak.value === 'Sử dụng preset khác') {
    const savedPreset = em.Tên preset || bu.Tên preset || '';
    populatePresets(savedPreset);
  }
  mvuRespFormat.value = em.Định dạng phản hồi || bu.Định dạng phản hồi || 'Tin nhắn trò chuyện';
  mvuRequestMode.value = em.Phương thức yêu cầu || bu.Phương thức yêu cầu || 'Yêu cầu lần lượt, thử lại nếu thất bại';
  mvuRequestCount.value = em.Số lần yêu cầu ?? bu.Số lần yêu cầu ?? 1;
  mvuAutoRequest.checked = em.Bật yêu cầu tự động ?? bu.Bật yêu cầu tự động ?? true;
  mvuApiUrl.value = em.Địa chỉ API || bu.Địa chỉ API || '';
  mvuApiKey.value = em.Khóa API || bu.Khóa API || '';
  const modelName = em.Tên mô hình || bu.Tên mô hình || '';
  if (modelName) {
    if (![...mvuModelName.options].some(o => o.value === modelName)) {
      mvuModelName.appendChild(p.document.createElement('option'));
      mvuModelName.lastChild.value = modelName;
      mvuModelName.lastChild.textContent = modelName;
    }
    mvuModelName.value = modelName;
  }
  mvuMaxTokens.value = em.Số token phản hồi tối đa ?? bu.Số token phản hồi tối đa ?? 65535;
  mvuTemperature.value = em.Nhiệt độ ?? bu.Nhiệt độ ?? 1;
  mvuFreqPenalty.value = em.Hình phạt tần suất ?? bu.Hình phạt tần suất ?? 0;
  mvuPresPenalty.value = em.Hình phạt hiện diện ?? bu.Hình phạt hiện diện ?? 0;
  mvuTopP.value = em.top_p ?? bu.top_p ?? 1;
  mvuTopK.value = em.top_k ?? bu.top_k ?? 0;

  // Tự động dọn dẹp biến
  const ac = cfg.Tự động dọn dẹp biến || {};
  mvuAutoCleanEnable.checked = ac.Bật ?? bu.Bật tự động dọn dẹp biến ?? false;
  mvuCleanPanel.style.display = (ac.Bật ?? bu.Bật tự động dọn dẹp biến) ? '' : 'none';
  mvuCleanInterval.value = ac.Khoảng thời gian lưu ảnh chụp ?? bu.Khoảng thời gian lưu ảnh chụp ?? 50;
  mvuCleanRecent.value = ac.Số tầng gần đây cần giữ lại biến ?? bu.Số tầng gần đây cần giữ lại biến ?? 20;
  mvuCleanTrigger.value = ac.Số tầng gần đây kích hoạt khôi phục biến ?? bu.Số tầng gần đây kích hoạt khôi phục biến ?? 10;

  // Khả năng tương thích
  // Ưu tiên cfg.Khả năng tương thích, dự phòng bu.Khả năng tương thích
  if (!cfg.Khả năng tương thích || Object.keys(cfg.Khả năng tương thích).length === 0) {
    if (bu.Khả năng tương thích && Object.keys(bu.Khả năng tương thích).length > 0) {
      cfg.Khả năng tương thích = { ...bu.Khả năng tương thích };
    }
  }
  buildCompatChecks();

  // Liên kết nguồn mô hình
  refreshModelSourceVisibility();
}

// Ghi cấu hình từ form (chỉ bộ nhớ)
function writeMvuConfig() {
  const cfg = getMvuCfg();
  if (!cfg) return;

  cfg.Phương thức cập nhật = mvuUpdateMode.value;
  if (!cfg.Cấu hình phân tích mô hình bổ sung) cfg.Cấu hình phân tích mô hình bổ sung = {};
  cfg.Cấu hình phân tích mô hình bổ sung.Nguồn mô hình = mvuModelSource.value;

  const em = cfg.Cấu hình phân tích mô hình bổ sung;
  em.Phương án vượt rào = mvuJailbreak.value;
  if (mvuJailbreak.value === 'Sử dụng preset khác' && mvuPresetName) {
    em.Tên preset = mvuPresetName.value;
  } else {
    delete em.Tên preset;
  }
  em.Định dạng phản hồi = mvuRespFormat.value;
  em.Tương thích Fake stream = /Fake stream/i.test(mvuModelName.value);
  em.Phương thức yêu cầu = mvuRequestMode.value;
  em.Số lần yêu cầu = parseInt(mvuRequestCount.value) || 1;
  em.Bật yêu cầu tự động = mvuAutoRequest.checked;
  em.Địa chỉ API = mvuApiUrl.value;
  em.Khóa API = mvuApiKey.value;
  em.Tên mô hình = mvuModelName.value;
  em.Số token phản hồi tối đa = parseInt(mvuMaxTokens.value) || 65535;
  em.Nhiệt độ = parseFloat(mvuTemperature.value) || 1;
  em.Hình phạt tần suất = parseFloat(mvuFreqPenalty.value) || 0;
  em.Hình phạt hiện diện = parseFloat(mvuPresPenalty.value) || 0;
  em.top_p = parseFloat(mvuTopP.value) || 1;
  em.top_k = parseInt(mvuTopK.value) || 0;

  if (!cfg.Tự động dọn dẹp biến) cfg.Tự động dọn dẹp biến = {};
  const ac = cfg.Tự động dọn dẹp biến;
  ac.Bật = mvuAutoCleanEnable.checked;
  ac.Khoảng thời gian lưu ảnh chụp = parseInt(mvuCleanInterval.value) || 50;
  ac.Số tầng gần đây cần giữ lại biến = parseInt(mvuCleanRecent.value) || 20;
  ac.Số tầng gần đây kích hoạt khôi phục biến = parseInt(mvuCleanTrigger.value) || 10;

  // Khả năng tương thích
  const checks = mvuCompatChecks.querySelectorAll('.jmzq-mvu-compat-check');
  checks.forEach(cb => { if (cfg.Khả năng tương thích) cfg.Khả năng tương thích[cb.dataset.key] = cb.checked; });

  // Ghi đúp vào sao lưu _ewcYH
  ewcBackupToEwcYH();
}

// ── Bản sao lưu cục bộ _ewcYH ──
// Ghi đúp tất cả các trường được quản lý bởi bảng điều khiển vào _ewcYH để khôi phục sau khi làm mới (Khởi tạo MVU có thể xóa đi một số giá trị)
function ewcGetEwcYH() {
  if (!SillyTavern.extensionSettings._ewcYH) SillyTavern.extensionSettings._ewcYH = {};
  return SillyTavern.extensionSettings._ewcYH;
}
function ewcBackupToEwcYH() {
  const cfg = getMvuCfg(); if (!cfg) return;
  const bu = ewcGetEwcYH();
  bu.Phương thức cập nhật = cfg.Phương thức cập nhật;
  const em = cfg.Cấu hình phân tích mô hình bổ sung || {};
  bu.Phương án vượt rào = em.Phương án vượt rào;
  bu.Tên preset = em.Tên preset;
  bu.Định dạng phản hồi = em.Định dạng phản hồi;
  bu.Tương thích Fake stream = em.Tương thích Fake stream;
  bu.Phương thức yêu cầu = em.Phương thức yêu cầu;
  bu.Số lần yêu cầu = em.Số lần yêu cầu;
  bu.Bật yêu cầu tự động = em.Bật yêu cầu tự động;
  bu.Địa chỉ API = em.Địa chỉ API;
  bu.Khóa API = em.Khóa API;
  bu.Tên mô hình = em.Tên mô hình;
  bu.Nguồn mô hình = em.Nguồn mô hình;
  bu.Số token phản hồi tối đa = em.Số token phản hồi tối đa;
  bu.Nhiệt độ = em.Nhiệt độ;
  bu.Hình phạt tần suất = em.Hình phạt tần suất;
  bu.Hình phạt hiện diện = em.Hình phạt hiện diện;
  bu.top_p = em.top_p;
  bu.top_k = em.top_k;
  const ac = cfg.Tự động dọn dẹp biến || {};
  bu.Bật tự động dọn dẹp biến = ac.Bật;
  bu.Khoảng thời gian lưu ảnh chụp = ac.Khoảng thời gian lưu ảnh chụp;
  bu.Số tầng gần đây cần giữ lại biến = ac.Số tầng gần đây cần giữ lại biến;
  bu.Số tầng gần đây kích hoạt khôi phục biến = ac.Số tầng gần đây kích hoạt khôi phục biến;
  if (cfg.Khả năng tương thích) bu.Khả năng tương thích = { ...cfg.Khả năng tương thích };
}
// Khi khởi động: khôi phục các giá trị không rỗng từ _ewcYH vào mvu_settings (chỉ bổ sung các giá trị bị khởi tạo MVU xóa)
function ewcRestoreFromEwcYH() {
  const cfg = getMvuCfg(); const bu = ewcGetEwcYH();
  if (!cfg || !bu) return;
  if (!cfg.Phương thức cập nhật && bu.Phương thức cập nhật) cfg.Phương thức cập nhật = bu.Phương thức cập nhật;
  if (!cfg.Cấu hình phân tích mô hình bổ sung) cfg.Cấu hình phân tích mô hình bổ sung = {};
  const em = cfg.Cấu hình phân tích mô hình bổ sung;
  if (!em.Phương án vượt rào && bu.Phương án vượt rào) em.Phương án vượt rào = bu.Phương án vượt rào;
  if (!em.Tên preset && bu.Tên preset) em.Tên preset = bu.Tên preset;
  if (!em.Định dạng phản hồi && bu.Định dạng phản hồi) em.Định dạng phản hồi = bu.Định dạng phản hồi;
  if (em.Tương thích Fake stream === undefined && bu.Tương thích Fake stream !== undefined) em.Tương thích Fake stream = bu.Tương thích Fake stream;
  if (!em.Phương thức yêu cầu && bu.Phương thức yêu cầu) em.Phương thức yêu cầu = bu.Phương thức yêu cầu;
  if (em.Số lần yêu cầu === undefined && bu.Số lần yêu cầu !== undefined) em.Số lần yêu cầu = bu.Số lần yêu cầu;
  if (em.Bật yêu cầu tự động === undefined && bu.Bật yêu cầu tự động !== undefined) em.Bật yêu cầu tự động = bu.Bật yêu cầu tự động;
  if (!em.Địa chỉ API && bu.Địa chỉ API) em.Địa chỉ API = bu.Địa chỉ API;
  if (!em.Khóa API && bu.Khóa API) em.Khóa API = bu.Khóa API;
  if (!em.Tên mô hình && bu.Tên mô hình) em.Tên mô hình = bu.Tên mô hình;
  if (!em.Nguồn mô hình && bu.Nguồn mô hình) em.Nguồn mô hình = bu.Nguồn mô hình;
  if (em.Số token phản hồi tối đa === undefined && bu.Số token phản hồi tối đa !== undefined) em.Số token phản hồi tối đa = bu.Số token phản hồi tối đa;
  if (em.Nhiệt độ === undefined && bu.Nhiệt độ !== undefined) em.Nhiệt độ = bu.Nhiệt độ;
  if (em.Hình phạt tần suất === undefined && bu.Hình phạt tần suất !== undefined) em.Hình phạt tần suất = bu.Hình phạt tần suất;
  if (em.Hình phạt hiện diện === undefined && bu.Hình phạt hiện diện !== undefined) em.Hình phạt hiện diện = bu.Hình phạt hiện diện;
  if (em.top_p === undefined && bu.top_p !== undefined) em.top_p = bu.top_p;
  if (em.top_k === undefined && bu.top_k !== undefined) em.top_k = bu.top_k;
  if (!cfg.Tự động dọn dẹp biến) cfg.Tự động dọn dẹp biến = {};
  const ac = cfg.Tự động dọn dẹp biến;
  if (ac.Bật === undefined && bu.Bật tự động dọn dẹp biến !== undefined) ac.Bật = bu.Bật tự động dọn dẹp biến;
  if (ac.Khoảng thời gian lưu ảnh chụp === undefined && bu.Khoảng thời gian lưu ảnh chụp !== undefined) ac.Khoảng thời gian lưu ảnh chụp = bu.Khoảng thời gian lưu ảnh chụp;
  if (ac.Số tầng gần đây cần giữ lại biến === undefined && bu.Số tầng gần đây cần giữ lại biến !== undefined) ac.Số tầng gần đây cần giữ lại biến = bu.Số tầng gần đây cần giữ lại biến;
  if (ac.Số tầng gần đây kích hoạt khôi phục biến === undefined && bu.Số tầng gần đây kích hoạt khôi phục biến !== undefined) ac.Số tầng gần đây kích hoạt khôi phục biến = bu.Số tầng gần đây kích hoạt khôi phục biến;
  if (!cfg.Khả năng tương thích) cfg.Khả năng tương thích = {};
  if (bu.Khả năng tương thích) {
    for (const [k, v] of Object.entries(bu.Khả năng tương thích)) {
      if (cfg.Khả năng tương thích[k] === undefined) cfg.Khả năng tương thích[k] = v;
    }
  }
}

// ── Mô phỏng sự kiện DOM: Tìm các phần tử biểu mẫu của chính MVU trong trang cha thông qua runInParent, đặt giá trị và phát sinh sự kiện ──
// Cache nội bộ của MVU chỉ cập nhật khi listener UI của chính nó kích hoạt, vì vậy cần thao tác trực tiếp trên DOM của nó
function ewcSyncMvuDom() {
  return runInParent(`(async () => {
  var doc = document;
  var cfg = SillyTavern.getContext().extensionSettings.mvu_settings;
  if (!cfg) return 'no cfg';
  var em = cfg.Cấu hình phân tích mô hình bổ sung || {};
  var ac = cfg.Tự động dọn dẹp biến || {};
  var compat = cfg.Khả năng tương thích || {};

  // Tiện ích: Đặt giá trị gốc + Phát sự kiện (Tương thích với Controlled Components của React)
  function setVal(el, val) {
    if (!el) return;
    if (el.type === 'checkbox') {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      if (desc && desc.set) { desc.set.call(el, !!val); } else { el.checked = !!val; }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'SELECT') {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) { desc.set.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Tìm phần tử biểu mẫu theo văn bản nhãn bên trong MVU section
  function findField(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input, select, textarea');
        }
      }
    }
    return null;
  }

  // Tìm number input trong nhóm range+number
  function findRangeNumber(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input[type="number"]');
        }
      }
    }
    return null;
  }

  // Tìm và mở rộng tất cả thẻ details
  var details = doc.querySelectorAll('.mvu-section details');
  var savedStates = [];
  for (var d = 0; d < details.length; d++) { savedStates.push(details[d].open); details[d].open = true; }

  try {
    // Phương án vượt rào
    var el = findField('Phương án vượt rào');
    if (el && em.Phương án vượt rào) setVal(el, em.Phương án vượt rào);

    // Định dạng phản hồi
    el = findField('Định dạng phản hồi');
    if (el && em.Định dạng phản hồi) setVal(el, em.Định dạng phản hồi);

    // Tương thích Fake stream
    el = findField('Tương thích Fake stream');
    if (el) setVal(el, !!em.Tương thích Fake stream);

    // Phương thức yêu cầu
    el = findField('Phương thức yêu cầu');
    if (el && em.Phương thức yêu cầu) setVal(el, em.Phương thức yêu cầu);

    // Số lần yêu cầu
    el = findRangeNumber('Số lần yêu cầu');
    if (el && em.Số lần yêu cầu !== undefined) setVal(el, em.Số lần yêu cầu);

    // Yêu cầu tự động
    el = findField('Yêu cầu tự động');
    if (el) setVal(el, em.Bật yêu cầu tự động !== false);

    // Địa chỉ API
    el = findField('Địa chỉ API');
    if (el && em.Địa chỉ API) setVal(el, em.Địa chỉ API);

    // Khóa API
    el = findField('Khóa API');
    if (el && em.Khóa API !== undefined) setVal(el, em.Khóa API);

    // Tên mô hình
    el = findField('Tên mô hình');
    if (el && em.Tên mô hình) setVal(el, em.Tên mô hình);

    // Nguồn mô hình
    el = findField('Nguồn mô hình');
    if (el && em.Nguồn mô hình) setVal(el, em.Nguồn mô hình);

    // Token phản hồi tối đa
    el = findField('Token phản hồi tối đa');
    if (el && em.Số token phản hồi tối đa !== undefined) setVal(el, em.Số token phản hồi tối đa);

    // Nhiệt độ
    el = findRangeNumber('Nhiệt độ');
    if (el && em.Nhiệt độ !== undefined) setVal(el, em.Nhiệt độ);

    // Hình phạt tần suất
    el = findRangeNumber('Hình phạt tần suất');
    if (el && em.Hình phạt tần suất !== undefined) setVal(el, em.Hình phạt tần suất);

    // Hình phạt hiện diện
    el = findRangeNumber('Hình phạt hiện diện');
    if (el && em.Hình phạt hiện diện !== undefined) setVal(el, em.Hình phạt hiện diện);

    // Top P
    el = findRangeNumber('Top P');
    if (el && em.top_p !== undefined) setVal(el, em.top_p);

    // Top K
    el = findRangeNumber('Top K');
    if (el && em.top_k !== undefined) setVal(el, em.top_k);

    // Tự động dọn dẹp biến
    el = findField('Bật');
    if (el && ac.Bật !== undefined) setVal(el, !!ac.Bật);
    var snapEl = doc.getElementById('mvu_snapshot_keep_interval');
    if (snapEl && ac.Khoảng thời gian lưu ảnh chụp !== undefined) setVal(snapEl, ac.Khoảng thời gian lưu ảnh chụp);
    var keepEl = doc.getElementById('mvu_keep_recent_floors');
    if (keepEl && ac.Số tầng gần đây cần giữ lại biến !== undefined) setVal(keepEl, ac.Số tầng gần đây cần giữ lại biến);
    var restEl = doc.getElementById('mvu_restore_recent_floors');
    if (restEl && ac.Số tầng gần đây kích hoạt khôi phục biến !== undefined) setVal(restEl, ac.Số tầng gần đây kích hoạt khôi phục biến);

    // Khả năng tương thích
    var compatKeys = Object.keys(compat);
    for (var c = 0; c < compatKeys.length; c++) {
      el = findField(compatKeys[c]);
      if (el) setVal(el, !!compat[compatKeys[c]]);
    }

    return 'ok';
  } finally {
    // Khôi phục trạng thái mở rộng/thu gọn của thẻ details
    for (var r = 0; r < details.length; r++) { details[r].open = savedStates[r]; }
  }
})()`);
}

// ── Danh sách preset: Lấy các preset khả dụng từ DOM của trang cha ──
let _presetCache = null;

async function loadPresetList() {
  if (_presetCache) return _presetCache;
  try {
    const result = await runInParent(`(async () => {
      const primary = document.querySelector('#settings_preset_openai');
      if (primary && primary.options && primary.options.length > 0) {
        return [...primary.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      const byAttr = document.querySelector('select[data-preset-manager-for="openai"]');
      if (byAttr && byAttr.options && byAttr.options.length > 0) {
        return [...byAttr.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      return [];
    })()`);
    if (Array.isArray(result) && result.length) {
      _presetCache = result;
      return result;
    }
  } catch (e) {}
  return [];
}

function populatePresets(selectedValue) {
  const sel = mvuPresetName;
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Đang tải... --</option>';
  loadPresetList().then(list => {
    if (!list || !list.length) {
      sel.innerHTML = '<option value="">-- Không tìm thấy preset --</option>';
      return;
    }
    sel.innerHTML = list.map(name => '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>').join('');
    if (selectedValue && [...sel.options].some(o => o.value === selectedValue)) {
      sel.value = selectedValue;
    }
  }).catch(() => {
    sel.innerHTML = '<option value="">-- Tải thất bại --</option>';
  });
}

// Đồng bộ tên preset tới select "Preset mục tiêu" gốc của MVU
function syncMvuNativePreset(presetName) {
  if (!presetName) return;
  return runInParent(`(async () => {
    var target = ${JSON.stringify(presetName)};
    // Chiến lược 1: Chỉ tìm trong .mvu-section bằng nhãn "Preset mục tiêu"
    function findSelectNear(labelText) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var i = 0; i < sections.length; i++) {
        var labels = sections[i].querySelectorAll('label, span, strong, div');
        for (var j = 0; j < labels.length; j++) {
          var el = labels[j];
          if (el.textContent.trim() !== labelText) continue;
          var sib = el.nextElementSibling;
          while (sib) {
            if (sib.tagName === 'SELECT') return sib;
            var s = sib.querySelector('select');
            if (s) return s;
            sib = sib.nextElementSibling;
          }
          var parent = el.closest('div,section,form,tr');
          if (parent) { var s = parent.querySelector('select'); if (s) return s; }
        }
      }
      return null;
    }
    var sel = findSelectNear('Preset mục tiêu');
    // Chiến lược 2: Thử bằng ID đã biết
    if (!sel) {
      var ids = ['#mvu_target_preset', '#mvu-target-preset', 'select[data-mvu="target_preset"]',
        'select[name="mvu_target_preset"]', '.mvu_preset_select', '.mvu-preset-select'];
      for (var i = 0; i < ids.length; i++) {
        sel = document.querySelector(ids[i]); if (sel) break;
      }
    }
    // Chiến lược 3: Chỉ khớp các nội dung tùy chọn bên trong .mvu-section (không quét toàn bộ trang để tránh lỗi sai mục tiêu #settings_preset_openai)
    if (!sel) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var si = 0; si < sections.length; si++) {
        var selects = sections[si].querySelectorAll('select');
        for (var sj = 0; sj < selects.length; sj++) {
          var s = selects[sj];
          if ([...s.options].some(function(o) { return o.value === target || o.textContent.trim() === target; })) {
            sel = s; break;
          }
        }
        if (sel) break;
      }
    }
    if (!sel) return { ok: false, reason: 'Không tìm thấy select preset mục tiêu' };
    var opt = [...sel.options].find(o => o.value === target || o.textContent.trim() === target);
    if (!opt) return { ok: false, reason: 'Dropdown không chứa: ' + target, options: [...sel.options].map(o => o.textContent.trim()) };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selected: opt.value };
  })()`).catch(() => {});
}

// ── Làm giả phản hồi trống từ OpenAI (Không có lỗi, không có yêu cầu mạng) ──
function makeFakeCompletion(init) {
  var isStream = true;
  try {
    if (init && init.body) {
      var raw = typeof init.body === 'string' ? init.body : '';
      if (raw) { var p = JSON.parse(raw); isStream = p.stream !== false; }
    }
  } catch(e) {}

  var ts = Math.floor(Date.now() / 1000);
  var model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || 'gpt-4';

  if (isStream) {
    var encoder = new TextEncoder();
    var body = new ReadableStream({
      start: function(ctrl) {
        var chunk = JSON.stringify({
          id: 'chatcmpl-' + ts, object: 'chat.completion.chunk', created: ts,
          model: model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        });
        ctrl.enqueue(encoder.encode('data: ' + chunk + '\n\n'));
        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
        ctrl.close();
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  } else {
    var json = JSON.stringify({
      id: 'chatcmpl-' + ts, object: 'chat.completion', created: ts,
      model: model, choices: [{ index: 0, message: { content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
    return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

// ── Đánh chặn Fetch: Khi khớp với danh sách đen, trả về phản hồi OpenAI trống được làm giả ──
function ewcInjectFetchHook() {
  const _origFetch = p.fetch.bind(p);
  p.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const isChatReq = url.includes('/api/backends/chat-completions/') || url.includes('/api/connections/generate');
      if (!isChatReq) return _origFetch(input, init);

      const apiUrl = getMainApiUrl().toLowerCase();
      if (!apiUrl) return _origFetch(input, init);
      // 1) Phát hiện ưu tiên bằng danh sách đen URL → Trả về phản hồi trống làm giả
      if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return makeFakeCompletion(init);
      // 2) Danh sách trắng URL không kiểm tra tên mô hình
      const urlTrusted = CONFIG_URL_WHITELIST.some(kw => apiUrl.includes(kw));
      if (urlTrusted) return _origFetch(input, init);

      const mainModel = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
      const isBlocked = CONFIG_BLACKLIST.some(kw => mainModel.includes(kw));
      if (!isBlocked) return _origFetch(input, init);

      // Tên mô hình dính danh sách đen → Trả về phản hồi trống làm giả
      return makeFakeCompletion(init);
    } catch(e) {}
    return _origFetch(input, init);
  };
}

// Lưu xuống đĩa
async function saveMvuConfig() {
  try {
    writeMvuConfig();
    await saveSettings();
    ewcSyncMvuDom().catch(() => {});
    updateBackendCode();
    mvuStatus.textContent = 'Đã lưu';
    mvuApplyBtn.disabled = false;
  } catch (e) {
    mvuStatus.textContent = 'Lưu thất bại: ' + e.message;
    mvuApplyBtn.disabled = false;
  }
}

async function fetchModels() {
  const baseUrl = mvuApiUrl.value.trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('Vui lòng điền địa chỉ API trước'); return; }
  mvuFetchModelsBtn.disabled = true;
  mvuFetchModelsBtn.textContent = 'Đang lấy...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (mvuApiKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('Không lấy được danh sách mô hình'); return; }
    mvuModelName.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    if (ids.length > 0) mvuModelName.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : ids[0];
    showToast('Đã lấy ' + ids.length + ' mô hình');
    updateBackendCode();
  } catch (e) {
    showToast('Lấy mô hình thất bại: ' + e.message);
  } finally {
    mvuFetchModelsBtn.disabled = false;
    mvuFetchModelsBtn.textContent = 'Lấy mô hình';
  }
}

// Lấy mô hình bên trong hộp thoại
async function fetchModelsInDialog() {
  const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
  const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
  const dlgFetch = p.document.getElementById('jmzq-dlg-fetch-models');
  const dlgModel = p.document.getElementById('jmzq-dlg-model-name');
  const baseUrl = (dlgUrl.value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('Vui lòng điền địa chỉ API trước'); return; }
  dlgFetch.disabled = true;
  dlgFetch.textContent = 'Đang lấy...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (dlgKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('Không lấy được danh sách mô hình'); return; }
    dlgModel.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    dlgModel.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : (ids.includes('gemini-3.1-pro') ? 'gemini-3.1-pro' : (ids.includes('gemini-3.5-flash') ? 'gemini-3.5-flash' : ids[0]));
    showToast('Đã lấy ' + ids.length + ' mô hình, đã chọn mô hình đề xuất');
    updateBackendCode();
  } catch (e) {
    showToast('Lấy mô hình thất bại: ' + e.message);
  } finally {
    dlgFetch.disabled = false;
    dlgFetch.textContent = 'Lấy mô hình';
  }
}

let _mvuSaveTimer = null;
function onMvuFieldChange() {
  writeMvuConfig();
  updateBackendCode();
  mvuStatus.textContent = 'Đã sửa đổi, chờ lưu...';
  mvuApplyBtn.disabled = true;
  clearTimeout(_mvuSaveTimer);
  _mvuSaveTimer = setTimeout(() => saveMvuConfig(), 600);
}

const EJS_OPTIMAL = {
  enabled: true, generate_enabled: true, generate_loader_enabled: true,
  render_enabled: true, render_loader_enabled: true, with_context_disabled: false,
  debug_enabled: false, autosave_enabled: false, preload_worldinfo_enabled: true,
  code_blocks_enabled: true, raw_message_evaluation_enabled: true, filter_message_enabled: true,
  inject_loader_enabled: false, invert_enabled: true, depth_limit: -1,
  compile_workers: false, sandbox: false
};
function checkEjsTemplate() {
  try {
    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    if (!ejs) { ejsStatus.innerHTML = '🔴 Mẫu Prompt chưa được cài đặt, vui lòng vào khu vực plugin để cài đặt thủ công'; return; }
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (disabled.includes('third-party/ST-Prompt-Template')) {
      ejsStatus.innerHTML = '🟠 Mẫu Prompt đã bị vô hiệu hóa, vui lòng vào danh sách tiện ích để bật thủ công';
      return;
    }
    const issues = [];
    for (const [k, v] of Object.entries(EJS_OPTIMAL)) {
      if (ejs[k] !== v) issues.push(k + ': Hiện tại ' + JSON.stringify(ejs[k]) + ' nên là ' + JSON.stringify(v));
    }
    if (issues.length === 0) {
      ejsStatus.innerHTML = '🟢 Cấu hình Mẫu Prompt đã tối ưu';
    } else {
      ejsStatus.innerHTML = '🟡 Có ' + issues.length + ' sai lệch<br>' + issues.slice(0, 5).join('<br>');
    }
  } catch (e) {
    ejsStatus.textContent = 'Phát hiện thất bại: ' + e.message;
  }
}
function applyOptimalEjs() {
  try {
    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    if (!ejs) { showToast('Mẫu Prompt chưa được cài đặt, vui lòng vào khu vực plugin để cài đặt thủ công'); return; }
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (disabled.includes('third-party/ST-Prompt-Template')) {
      showToast('Mẫu Prompt đã bị vô hiệu hóa, vui lòng vào danh sách tiện ích để bật thủ công');
      return;
    }
    Object.assign(ejs, EJS_OPTIMAL);
    saveSettings();
    checkEjsTemplate();
    showToast('Mẫu Prompt đã được đặt thành cấu hình tối ưu, làm mới trang sau 2 giây...');
    setTimeout(() => { window.parent.location.reload(); }, 2000);
  } catch (e) {
    showToast('Cấu hình thất bại: ' + e.message);
  }
}
ejsOptimizeBtn.addEventListener('click', applyOptimalEjs);

// Làm mới trạng thái cấu hình
function refreshMvuConfigStatus() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { mvuStatus.textContent = 'Không thể đọc cấu hình MVU'; return; }
    syncMvuToForm(cfg);
    const mode = cfg.Phương thức cập nhật;
    const modeDisplay = mode === 'Phân tích mô hình bổ sung' ? 'Phân tích mô hình bổ sung' : (mode === 'Theo đầu ra AI' ? 'Theo đầu ra AI' : mode);
    const n = cfg.Thông báo || {};
    const notifOk = n['Khung MVU tải thành công'] && n['Khởi tạo biến thành công'] && n['Lỗi cập nhật biến'] && n['Đang phân tích mô hình bổ sung'];
    mvuStatus.innerHTML =
      (mode === 'Phân tích mô hình bổ sung' ? '🟢' : '🔴') + ' Phương thức cập nhật: ' + (modeDisplay || 'Không xác định') + '<br>' +
      (notifOk ? '🟢' : '🔴') + ' 4 thông báo: ' + (notifOk ? 'Bật toàn bộ' : 'Chưa bật đủ');
  } catch (e) {
    mvuStatus.textContent = 'Lỗi đọc cấu hình MVU';
  }
}

// Cấu hình tối ưu 1-click
async function applyOptimalMvuConfig() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings không tồn tại, vui lòng đảm bảo khung biến MVU đã được cài đặt'); return; }

    cfg.Thông báo = cfg.Thông báo || {};
    cfg.Thông báo['Khung MVU tải thành công'] = true;
    cfg.Thông báo['Khởi tạo biến thành công'] = true;
    cfg.Thông báo['Lỗi cập nhật biến'] = true;
    cfg.Thông báo['Đang phân tích mô hình bổ sung'] = true;

    cfg.Cấu hình phân tích mô hình bổ sung = cfg.Cấu hình phân tích mô hình bổ sung || {};
    const em = cfg.Cấu hình phân tích mô hình bổ sung;
    em.Phương án vượt rào = 'Sử dụng vượt rào tích hợp';
    em.Định dạng phản hồi = 'Tin nhắn trò chuyện';
    em.Phương thức yêu cầu = 'Yêu cầu lần lượt, thử lại nếu thất bại';
    em.Số lần yêu cầu = 1;
    em.Bật yêu cầu tự động = true;
    em.Số token phản hồi tối đa = 65535;
    em.Nhiệt độ = 1;
    em.Hình phạt tần suất = 0;
    em.Hình phạt hiện diện = 0;
    em.top_p = 1;
    em.top_k = 0;
    em.Địa chỉ API = mvuApiUrl.value;
    em.Khóa API = mvuApiKey.value;
    em.Tên mô hình = mvuModelName.value;
    em.Tương thích Fake stream = /Fake stream/i.test(mvuModelName.value);

    cfg.Tự động dọn dẹp biến = cfg.Tự động dọn dẹp biến || {};
    const ac = cfg.Tự động dọn dẹp biến;
    ac.Bật = true;
    ac.Khoảng thời gian lưu ảnh chụp = 50;
    ac.Số tầng gần đây cần giữ lại biến = 20;
    ac.Số tầng gần đây kích hoạt khôi phục biến = 10;

    cfg.Khả năng tương thích = cfg.Khả năng tương thích || {};
    cfg.Khả năng tương thích['Cập nhật vào biến trò chuyện'] = true;
    cfg.Khả năng tương thích['Hiển thị tính năng cũ'] = false;
    cfg.Khả năng tương thích['Không coi sandas là tin nhắn user'] = false;

    cfg.Cấu hình phân tích mô hình bổ sung = cfg.Cấu hình phân tích mô hình bổ sung || {};
    cfg.Cấu hình phân tích mô hình bổ sung.Nguồn mô hình = 'Tùy chỉnh';
    cfg.Phương thức cập nhật = 'Phân tích mô hình bổ sung';

    ewcBackupToEwcYH();
    await saveSettings();

    syncMvuToForm(cfg);
    mvuStatus.innerHTML = '🟢 Phương thức cập nhật: Phân tích mô hình bổ sung<br>🟢 4 thông báo: Bật toàn bộ';

    showToast('Cấu hình MVU tối ưu đã được áp dụng, làm mới trang sau 2 giây...');
    setTimeout(() => { window.parent.location.reload(); }, 2000);
  } catch (e) {
    showToast('Cấu hình MVU thất bại: ' + e.message);
  }
}

// Vùng API chỉ hiển thị khi chọn "Phân tích mô hình bổ sung + Tùy chỉnh"
function refreshModelSourceVisibility() {
  const isExtra = mvuUpdateMode.value === 'Phân tích mô hình bổ sung';
  const isCustom = mvuModelSource.value === 'Tùy chỉnh';
  mvuCustomApi.style.display = (isExtra && isCustom) ? '' : 'none';
}

// Mùa Thu Tĩnh Lặng không có chuyển đổi chế độ, mục MVU luôn hiển thị
function refreshMvuSectionVisibility() {
  mvuSection.style.display = '';
}

// --- Hiển thị/Ẩn bong bóng ---
bubble.addEventListener('click', () => {
  const showing = panel.style.display !== 'none';
  if (showing) {
    panel.style.display = 'none';
  } else {
    const pw = p.innerWidth || window.innerWidth;
    const ph = p.innerHeight || window.innerHeight;
    const rect = bubble.getBoundingClientRect();
    const panelW = 320;
    const panelH = Math.min(ph * 0.62, 500);
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + panelW > pw - 10) left = pw - panelW - 10;
    if (left < 10) left = 10;
    if (top + panelH > ph - 10) top = rect.top - panelH - 6;
    if (top < 10) top = 10;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.display = 'flex';
    _jmzqPopulateWbSelect(); checkConfig(); refreshMvuSectionVisibility(); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate();
  }
});

// Khi bảng điều khiển được di chuột vào, tự động làm mới (có thể người dùng đã thay đổi cài đặt thủ công giữa chừng)
panel.addEventListener('mouseenter', () => { _jmzqPopulateWbSelect(); checkConfig(); refreshMvuConfigStatus(); refreshUI(); updateBackendCode(); checkWorldbookCount(); checkEjsTemplate(); });

// --- Tiện ích: Lấy tọa độ cảm ứng/chuột ---
function getXY(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// --- Kéo bong bóng (Hỗ trợ cảm ứng) ---
let dragBubble = false, bSX, bSY, bOL, bOT;
function onBubbleStart(e) {
  if (dragBubble) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.type === 'mousedown') e.preventDefault();
  const p = getXY(e);
  dragBubble = true; bSX = p.x; bSY = p.y;
  bOL = bubble.offsetLeft; bOT = bubble.offsetTop;
  bubble.style.transition = 'none';
}
function onBubbleMove(e) {
  if (!dragBubble) return;
  e.preventDefault();
  const p = getXY(e);
  const newLeft = (bOL + p.x - bSX);
  const newTop = (bOT + p.y - bSY);
  bubble.style.left = newLeft + 'px';
  bubble.style.top = newTop + 'px';
}
function onBubbleEnd() {
  if (dragBubble) { bubble.style.transition = ''; dragBubble = false; }
}
bubble.addEventListener('mousedown', onBubbleStart);
bubble.addEventListener('touchstart', onBubbleStart, { passive: false });
p.document.addEventListener('mousemove', onBubbleMove);
p.document.addEventListener('touchmove', onBubbleMove, { passive: false });
p.document.addEventListener('mouseup', onBubbleEnd);
p.document.addEventListener('touchend', onBubbleEnd);

// --- Kéo bảng điều khiển (Hỗ trợ cảm ứng) ---
const dragHandle = p.document.getElementById('jmzq-drag');
let dragPanel = false, pSX, pSY, pOL, pOT;
function onPanelStart(e) {
  if (dragPanel) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.target.tagName === 'BUTTON') return;
  const p = getXY(e);
  dragPanel = true; pSX = p.x; pSY = p.y;
  pOL = panel.offsetLeft; pOT = panel.offsetTop;
}
function onPanelMove(e) {
  if (!dragPanel) return;
  e.preventDefault();
  const p = getXY(e);
  panel.style.left = (pOL + p.x - pSX) + 'px';
  panel.style.top = (pOT + p.y - pSY) + 'px';
}
function onPanelEnd() { dragPanel = false; }
dragHandle.addEventListener('mousedown', onPanelStart);
dragHandle.addEventListener('touchstart', onPanelStart, { passive: false });
p.document.addEventListener('mousemove', onPanelMove);
p.document.addEventListener('touchmove', onPanelMove, { passive: false });
p.document.addEventListener('mouseup', onPanelEnd);
p.document.addEventListener('touchend', onPanelEnd);

// ═══════════════ Chuyển đổi tự động Worldbook ═══════════════
function readStatData() {
  if (typeof p.Mvu === 'undefined') return null;

  for (let i = -1; i >= -30; i--) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: i });
      if (d?.stat_data?.Trạng thái dẫn xuất?.nationality && d?.stat_data?.Giai đoạn thế giới) return d.stat_data;
    } catch (e) {}
  }

  let best = null;
  for (let i = 0; i < 200; i++) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: i });
      if (d?.stat_data?.Trạng thái dẫn xuất?.nationality && d?.stat_data?.Giai đoạn thế giới) best = d.stat_data;
    } catch (e) {}
  }
  return best;
}

function buildEnableSet(sd) {
  const enable = new Set();
  const nat           = sd?.Trạng thái dẫn xuất?.nationality ?? null;
  const phase         = sd?.Giai đoạn thế giới ?? 'Thời kỳ trật tự';
  const infMode       = sd?.Mô hình hành vi người nhiễm ?? 'Loại bệnh cuồng';
  const npcMode       = sd?.Mô hình hành vi NPC ?? 'Loại bình thường';

  if (phase === 'Thời kỳ trật tự') {
    for (const e of [
      'Thế giới quan - Tình hình chính phủ các nước',
      'Trước bùng phát/Đêm trước bùng phát', 'Trước bùng phát/Quy tắc-Đối phó sự kiện bất thường', 'Trước bùng phát/Quy tắc-Ràng buộc',
      'Trước bùng phát/Quy tắc-Thu thập vật tư', 'Trước bùng phát/Quy tắc-Y tế và sức khỏe',
      'Trước bùng phát/Quy tắc-Trật tự xã hội', 'Trước bùng phát/Quy tắc-Xung đột và đối phó',
    ]) enable.add(e);
  } else if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
    for (const e of [
      'Thế giới quan - Khu an toàn chính thức', 'Thế giới quan - Người bán nhiễm', 'Thế giới quan - Lực lượng đặc nhiệm sinh hóa ZCOM (Trứng phục sinh)',
      'Thế giới quan - Kẻ lang thang', 'Thế giới quan - Kẻ vô trật tự', 'Khác - Tăng cường hành vi kẻ vô trật tự',
      'Khác - Tạo động căn cứ người sống sót', 'Cơ chế - Xây dựng nơi trú ẩn', 'Vật phẩm - Vắc-xin tiêu diệt', 'Vật phẩm - Thuốc',
      'Cơ chế - Lây nhiễm COVID-30', 'Cơ chế - Gây chuyện', 'Cơ chế - Chế tạo', 'Cơ chế - Độ hoàn chỉnh',
      'Cơ chế - Chiến đấu', 'Cơ chế - Hoảng loạn', 'Cơ chế - Bệnh tật và Y tế',
      'Khác - Tạo động kết quả thu thập', 'Khác - Thúc đẩy quan hệ NPC người sống sót',
      'Thế giới quan - Các phi hành gia (Trứng phục sinh)', 'Thế giới quan - Người ngoài hành tinh (Trứng phục sinh)',
      'Cơ chế - Thu thập vật tư', 'Cơ chế - Cơ chế sinh tồn của người bán nhiễm', 'Cơ chế - Trải nghiệm nhập vai', 'Cơ chế - Làm ruộng! Tôi muốn làm ruộng!',
    ]) enable.add(e);
    if (phase === 'Thời kỳ tận thế') {
      for (const e of [
        'Thế giới quan - Thời kỳ tận thế', 'Thế giới quan - Người nhiễm biến thể COVID-30',
        'Cơ chế - Hành vi khu an toàn chính thức', 'Cơ chế - Đau quá đau quá!', 'Cơ chế - Tử vong',
      ]) enable.add(e);
    }
  } else {
    for (const e of [
      'Trước bùng phát/Đêm trước bùng phát', 'Trước bùng phát/Quy tắc-Đối phó sự kiện bất thường', 'Trước bùng phát/Quy tắc-Thu thập vật tư',
      'Trước bùng phát/Quy tắc-Y tế và sức khỏe', 'Trước bùng phát/Quy tắc-Trật tự xã hội', 'Trước bùng phát/Quy tắc-Xung đột và đối phó',
    ]) enable.add(e);
  }

  if (infMode === 'Loại bệnh cuồng') {
    for (const e of ['Thế giới quan - Cương lĩnh hành vi người nhiễm COVID-30', '[mvu_plot]Khác - Kiểm tra tính hợp lý', 'Khác - Tăng cường bối cảnh (Tùy chọn)']) enable.add(e);
    if (phase === 'Thời kỳ bùng phát') enable.add('Thế giới quan - Thời kỳ bùng phát');
    if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') enable.add('Cơ chế - Mối đe dọa động và hình phạt an nhàn');
    if (phase === 'Thời kỳ tận thế') enable.add('Khác - Tạo động cuộc chạm trán người nhiễm');
  } else if (infMode === 'Loại bình thường') {
    for (const e of ['Zombie thường người nhiễm COVID-30', '[mvu_plot]Kiểm tra bình thường', 'Tăng cường bối cảnh bình thường (Tùy chọn)']) enable.add(e);
    if (phase === 'Thời kỳ bùng phát') enable.add('Thời kỳ bùng phát bình thường');
    if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
      for (const e of ['Sự đa dạng của người nhiễm bình thường', 'Bình thường - Cơ chế - Bầy zombie', 'Mối đe dọa động và hình phạt an nhàn bình thường']) enable.add(e);
    }
    if (phase === 'Thời kỳ tận thế') enable.add('Chạm trán người nhiễm bình thường');
  }

  if (npcMode === 'Loại bình thường') {
    enable.add('Khác - Tạo động NPC');
    enable.add('Khác - Quy tắc tương tác xã hội tận thế');
  } else if (npcMode === 'Loại toàn kẻ ác') {
    enable.add('Tạo NPC ác ý');
    enable.add('Quy tắc xã hội ác ý');
  }

  const summaryMap = {
    'Trung Quốc':'Tóm tắt NPC Trung Quốc đã xác định', 'Mỹ':'Tóm tắt NPC Mỹ đã xác định',
    'Nhật Bản':'Tóm tắt NPC Nhật Bản đã xác định', 'Nga':'Tóm tắt NPC Nga đã xác định',
    'Pháp':'Tóm tắt NPC Pháp đã xác định', 'Brazil':'Tóm tắt NPC Brazil đã xác định', 'Bắc Phi':'Tóm tắt NPC Bắc Phi đã xác định',
  };
  if (summaryMap[nat]) enable.add(summaryMap[nat]);

  if (nat === 'Trung Quốc' && (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế')) {
    enable.add('Thế giới quan - Kẻ vô trật tự - Nhóm Huyết Sát Trung Quốc'); enable.add('Thế giới quan - Kẻ vô trật tự - Nhóm Nguyệt Ảnh Trung Quốc');
    enable.add('Trung Quốc - Hành vi Quân Giải phóng Nhân dân Trung Quốc');
  }
  if (nat === 'Nhật Bản') {
    enable.add('Thế giới quan - Tuyến tối Nhật Bản');
    if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
      for (const e of [
        'Thế giới quan - Kẻ vô trật tự - Nanh Vuốt Thợ Săn Nhật Bản', 'Thế giới quan - Kẻ vô trật tự - Tàn Đảng Tuyệt Vọng Nhật Bản',
        'Thế giới quan - Người sống sót - Trường trung học nữ sinh Sakuragaoka', 'Thế giới quan - Người sống sót - Học viện Fujimi',
        'Thế giới quan - Người sống sót - Franchouchou', 'Thế giới quan - Khu an toàn - Sở Cảnh sát Tokyo',
      ]) enable.add(e);
    }
  }
  if (nat === 'Mỹ') {
    if (phase === 'Thời kỳ trật tự') {
      enable.add('Thế giới quan - Mỹ trước bùng phát');
    } else if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
      for (const e of [
        'Thế giới quan - Cục diện thế lực Mỹ sau bùng phát', 'Thế giới quan - Hành vi kẻ lang thang đặc trưng Mỹ',
        'Thế giới quan - Cài đặt tổng thể kẻ vô trật tự đặc trưng Mỹ', 'Thế giới quan - Umbrella (Trứng phục sinh)',
        'Thế giới quan - Kẻ vô trật tự - Băng Đảng Vương Miện Sắt Mỹ', 'Thế giới quan - Kẻ vô trật tự - Đền Thờ Tịnh Thế Mỹ',
      ]) enable.add(e);
      if (phase === 'Thời kỳ tận thế') enable.add('Thế giới quan - Sinh vật Umbrella');
    }
  }
  if (nat === 'Nga') {
    enable.add('Thế giới quan - Bức tranh cuộc sống Nga');
    if (phase === 'Thời kỳ trật tự') {
      enable.add('Thế giới quan - Nga trước bùng phát'); enable.add('Thế giới quan - Thế lực trước bùng phát');
    } else if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
      for (const e of [
        'Thế giới quan - Đảng Thống nhất sau bùng phát', 'Thế giới quan - Đảng Bolshevik mới sau bùng phát', 'Thế giới quan - Hội Công nhân Thép sau bùng phát',
        'Thế giới quan - Thế lực Tuyết Đen', 'Thế giới quan - Thế lực Giáo phái Độ Không',
        'Thế giới quan - Thí nghiệm điện BMPT (Trứng phục sinh)', 'Thế giới quan - Khí cầu trên không',
      ]) enable.add(e);
      if (phase === 'Thời kỳ tận thế') enable.add('Thế giới quan - Khu vực nổ hạt nhân');
    }
  }
  if (nat === 'Pháp') {
    if (phase === 'Thời kỳ trật tự') {
      enable.add('Thế giới quan - Pháp trước bùng phát');
    } else if (phase === 'Thời kỳ bùng phát' || phase === 'Thời kỳ tận thế') {
      for (const e of [
        'Thế giới quan - Pháp thời kỳ bùng phát', 'Thế giới quan - Lâu đài Hươu Trắng', 'Thế giới quan - Lâu đài Diên Vĩ',
        'Thế giới quan - Lãnh địa Vương miện Sắt', 'Thế giới quan - Giáo hội Thánh Công', 'Thế giới quan - Hiệp sĩ đoàn Hỗn loạn',
        'Thế giới quan - Liên minh Dân tự do', 'Thế giới quan - Chính phủ lưu vong trên tàu Charles de Gaulle',
      ]) enable.add(e);
      if (phase === 'Thời kỳ tận thế') enable.add('Thế giới quan - Pháp thời kỳ tận thế');
    }
  }
  if (nat === 'Brazil') {
    enable.add(phase === 'Thời kỳ trật tự' ? 'Thế giới quan - Brazil thời kỳ trật tự' : 'Thế giới quan - Brazil sau bùng phát');
  }
  if (nat === 'Bắc Phi') {
    enable.add(phase === 'Thời kỳ trật tự' ? 'Thế giới quan - Bắc Phi thời kỳ trật tự' : 'Thế giới quan - Bắc Phi sau bùng phát');
  }

  return enable;
}

const MANAGED_ENTRIES = new Set([
  'Thế giới quan - Tình hình chính phủ các nước',
  'Trước bùng phát/Đêm trước bùng phát','Trước bùng phát/Quy tắc-Đối phó sự kiện bất thường','Trước bùng phát/Quy tắc-Ràng buộc',
  'Trước bùng phát/Quy tắc-Thu thập vật tư','Trước bùng phát/Quy tắc-Y tế và sức khỏe',
  'Trước bùng phát/Quy tắc-Trật tự xã hội','Trước bùng phát/Quy tắc-Xung đột và đối phó',
  'Thế giới quan - Khu an toàn chính thức','Thế giới quan - Người bán nhiễm','Thế giới quan - Lực lượng đặc nhiệm sinh hóa ZCOM (Trứng phục sinh)',
  'Thế giới quan - Kẻ lang thang','Thế giới quan - Kẻ vô trật tự','Khác - Tăng cường hành vi kẻ vô trật tự',
  'Khác - Tạo động căn cứ người sống sót','Cơ chế - Xây dựng nơi trú ẩn','Vật phẩm - Vắc-xin tiêu diệt','Vật phẩm - Thuốc',
  'Cơ chế - Lây nhiễm COVID-30','Cơ chế - Gây chuyện','Cơ chế - Chế tạo','Cơ chế - Độ hoàn chỉnh',
  'Cơ chế - Chiến đấu','Cơ chế - Hoảng loạn','Cơ chế - Bệnh tật và Y tế',
  'Khác - Tạo động kết quả thu thập','Khác - Thúc đẩy quan hệ NPC người sống sót',
  'Thế giới quan - Các phi hành gia (Trứng phục sinh)','Thế giới quan - Người ngoài hành tinh (Trứng phục sinh)',
  'Cơ chế - Thu thập vật tư','Cơ chế - Cơ chế sinh tồn của người bán nhiễm','Cơ chế - Trải nghiệm nhập vai','Cơ chế - Làm ruộng! Tôi muốn làm ruộng!',
  'Thế giới quan - Thời kỳ tận thế','Thế giới quan - Người nhiễm biến thể COVID-30',
  'Cơ chế - Hành vi khu an toàn chính thức','Cơ chế - Đau quá đau quá!','Cơ chế - Tử vong',
  'Thế giới quan - Cương lĩnh hành vi người nhiễm COVID-30','[mvu_plot]Khác - Kiểm tra tính hợp lý','Khác - Tăng cường bối cảnh (Tùy chọn)',
  'Thế giới quan - Thời kỳ bùng phát','Cơ chế - Mối đe dọa động và hình phạt an nhàn','Khác - Tạo động cuộc chạm trán người nhiễm',
  'Zombie thường người nhiễm COVID-30','[mvu_plot]Kiểm tra bình thường','Tăng cường bối cảnh bình thường (Tùy chọn)',
  'Thời kỳ bùng phát bình thường','Sự đa dạng của người nhiễm bình thường','Bình thường - Cơ chế - Bầy zombie',
  'Mối đe dọa động và hình phạt an nhàn bình thường','Chạm trán người nhiễm bình thường',
  'Khác - Tạo động NPC','Khác - Quy tắc tương tác xã hội tận thế','Tạo NPC ác ý','Quy tắc xã hội ác ý',
  'Tóm tắt NPC Trung Quốc đã xác định','Tóm tắt NPC Mỹ đã xác định','Tóm tắt NPC Nhật Bản đã xác định',
  'Tóm tắt NPC Nga đã xác định','Tóm tắt NPC Pháp đã xác định','Tóm tắt NPC Brazil đã xác định','Tóm tắt NPC Bắc Phi đã xác định',
  'Thế giới quan - Kẻ vô trật tự - Nhóm Huyết Sát Trung Quốc','Thế giới quan - Kẻ vô trật tự - Nhóm Nguyệt Ảnh Trung Quốc',
  'Trung Quốc - Hành vi Quân Giải phóng Nhân dân Trung Quốc',
  'Thế giới quan - Tuyến tối Nhật Bản','Thế giới quan - Kẻ vô trật tự - Nanh Vuốt Thợ Săn Nhật Bản','Thế giới quan - Kẻ vô trật tự - Tàn Đảng Tuyệt Vọng Nhật Bản',
  'Thế giới quan - Người sống sót - Trường trung học nữ sinh Sakuragaoka','Thế giới quan - Người sống sót - Học viện Fujimi','Thế giới quan - Người sống sót - Franchouchou',
  'Thế giới quan - Khu an toàn - Sở Cảnh sát Tokyo','Thế giới quan - Mỹ trước bùng phát','Thế giới quan - Cục diện thế lực Mỹ sau bùng phát',
  'Thế giới quan - Hành vi kẻ lang thang đặc trưng Mỹ','Thế giới quan - Cài đặt tổng thể kẻ vô trật tự đặc trưng Mỹ',
  'Thế giới quan - Umbrella (Trứng phục sinh)','Thế giới quan - Kẻ vô trật tự - Băng Đảng Vương Miện Sắt Mỹ',
  'Thế giới quan - Kẻ vô trật tự - Đền Thờ Tịnh Thế Mỹ','Thế giới quan - Sinh vật Umbrella',
  'Thế giới quan - Bức tranh cuộc sống Nga','Thế giới quan - Nga trước bùng phát','Thế giới quan - Thế lực trước bùng phát',
  'Thế giới quan - Đảng Thống nhất sau bùng phát','Thế giới quan - Đảng Bolshevik mới sau bùng phát','Thế giới quan - Hội Công nhân Thép sau bùng phát',
  'Thế giới quan - Thế lực Tuyết Đen','Thế giới quan - Thế lực Giáo phái Độ Không','Thế giới quan - Khu vực nổ hạt nhân',
  'Thế giới quan - Thí nghiệm điện BMPT (Trứng phục sinh)','Thế giới quan - Khí cầu trên không',
  'Thế giới quan - Pháp trước bùng phát','Thế giới quan - Pháp thời kỳ bùng phát','Thế giới quan - Pháp thời kỳ tận thế',
  'Thế giới quan - Lâu đài Hươu Trắng','Thế giới quan - Lâu đài Diên Vĩ','Thế giới quan - Lãnh địa Vương miện Sắt','Thế giới quan - Giáo hội Thánh Công',
  'Thế giới quan - Hiệp sĩ đoàn Hỗn loạn','Thế giới quan - Liên minh Dân tự do','Thế giới quan - Chính phủ lưu vong trên tàu Charles de Gaulle',
  'Thế giới quan - Brazil thời kỳ trật tự','Thế giới quan - Brazil sau bùng phát',
  'Thế giới quan - Bắc Phi thời kỳ trật tự','Thế giới quan - Bắc Phi sau bùng phát',
]);

async function applyToWorldbook(enableSet, wbName, nat) {
  const enableSetJSON    = JSON.stringify([...enableSet]);
  const managedSetJSON   = JSON.stringify([...MANAGED_ENTRIES]);
  const natStr           = nat ? JSON.stringify(nat) : 'null';

  return runInParent(`(async () => {
    var enableSet       = new Set(${enableSetJSON});
    var MANAGED_ENTRIES = new Set(${managedSetJSON});
    var nat             = ${natStr};

    if (typeof TavernHelper === 'undefined')
      throw new Error('TavernHelper is not defined — Vui lòng xác nhận tiện ích TavernHelper đã được cài đặt và kích hoạt');

    var wbName = ${JSON.stringify(wbName)};
    var entries;
    try { entries = await TavernHelper.getWorldbook(wbName); } catch(e) {
      throw new Error('Không thể lấy Worldbook "' + wbName + '": ' + (e.message || String(e)));
    }
    if (!Array.isArray(entries))
      throw new Error('Định dạng dữ liệu Worldbook "' + wbName + '" trả về bất thường');

    var totalChanged = 0;
    var log = [];
    var changed = false;
    var enabled_list = [], disabled_list = [];

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var entryName = e.name || '';
      if (!MANAGED_ENTRIES.has(entryName)) continue;

      var should = enableSet.has(entryName);
      var dirty  = false;

      if (e.enabled !== should) { e.enabled = should; dirty = true; }

      if (dirty) {
        changed = true;
        (should ? enabled_list : disabled_list).push(entryName);
      }
    }

    // Tự động bật tắt thông tin cơ bản: khớp tất cả */Nhân vật/*/Thông tin cơ bản, quốc tịch hiện tại thì bật, còn lại thì tắt
    if (nat) {
      var prefix = nat + '/Nhân vật/';
      for (var j = 0; j < entries.length; j++) {
        var entry = entries[j];
        var name = entry.name || '';
        var idx = name.indexOf('/Nhân vật/');
        if (idx === -1) continue;
        if (!name.endsWith('/Thông tin cơ bản')) continue;
        var shouldEnable = name.startsWith(prefix);
        if (entry.enabled !== shouldEnable) {
          entry.enabled = shouldEnable;
          changed = true;
          (shouldEnable ? enabled_list : disabled_list).push(name);
        }
      }
    }

    if (changed) {
      try { await TavernHelper.replaceWorldbook(wbName, entries); } catch(e) {
        throw new Error('Không thể lưu Worldbook "' + wbName + '": ' + (e.message || String(e)));
      }
      totalChanged += enabled_list.length + disabled_list.length;
      log.push({ wbName: wbName, enabled: enabled_list, disabled: disabled_list });
    }

    return { totalChanged: totalChanged, log: log, wbNames: [wbName] };
  })()`);
}

let _runningPromise = null;
let _pendingSwitch  = false;
let _debounceTimer  = null;

async function autoSwitch() {
  if (_runningPromise) {
    _pendingSwitch = true;
    return _runningPromise;
  }

  _runningPromise = (async () => {
    console.log('[JMZQ] Kích hoạt autoSwitch');
    bubble && bubble.classList.add('running');
    try {
      if (typeof p.Mvu === 'undefined') throw new Error('Mvu không khả dụng');

      const sd = readStatData();
      if (!sd) {
        console.warn('[JMZQ] Không tìm thấy stat_data hợp lệ, bỏ qua chuyển đổi Worldbook');
        p._jmzqLastResult = { time: Date.now(), ok: true, stat: {}, want: [], totalChanged: 0, log: [] };
        return;
      }

      const enableSet = buildEnableSet(sd);
      console.log('[JMZQ] Nên kích hoạt', enableSet.size, 'mục:', [...enableSet].slice(0, 10));

      const wbName = await api_resolveWorldbookName();
      console.log('[JMZQ] Worldbook mục tiêu:', wbName);
      const result = await applyToWorldbook(enableSet, wbName, sd.Trạng thái dẫn xuất?.nationality);
      const logSummary = result.log.map(l =>
        l.wbName + ' ▲' + l.enabled.length + ' ▼' + l.disabled.length
      ).join(' | ');
      console.log('[JMZQ] Hoàn thành changed=' + result.totalChanged + (logSummary ? '  ' + logSummary : ''));

      p._jmzqLastResult = {
        time: Date.now(), ok: true,
        stat: {
          phase:  sd.Giai đoạn thế giới,
          nat:    sd.Trạng thái dẫn xuất?.nationality,
          感染者: sd.Mô hình hành vi người nhiễm,
          NPC模式:sd.Mô hình hành vi NPC,
        },
        want: [...enableSet],
        totalChanged: result.totalChanged,
        log: result.log,
      };
    } catch (err) {
      console.error('[JMZQ] Thực thi thất bại:', err);
      p._jmzqLastResult = { time: Date.now(), ok: false, error: err.message };
    }
    p.document.dispatchEvent(new CustomEvent('jmzq-done', { detail: p._jmzqLastResult }));
  })();

  try { await _runningPromise; } finally {
    _runningPromise = null;
    bubble && bubble.classList.remove('running');

    if (_pendingSwitch) {
      _pendingSwitch = false;
      setTimeout(() => autoSwitch(), 100);
    }
  }
}

function onCriticalEvent() {
  clearTimeout(_debounceTimer);
  return autoSwitch();
}

function onSecondaryEvent() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(autoSwitch, 200);
}

const CRITICAL_EVENTS = [
  'message_sent',               'MESSAGE_SENT',
  'generate_before_combine_prompts', 'GENERATE_BEFORE_COMBINE_PROMPTS',
];

const SECONDARY_EVENTS = [
  'character_message_rendered', 'CHARACTER_MESSAGE_RENDERED',
  'message_received',           'MESSAGE_RECEIVED',
  'user_message_rendered',      'USER_MESSAGE_RENDERED',
];

const ALL_EVENTS = [...CRITICAL_EVENTS, ...SECONDARY_EVENTS];

if (typeof eventOn === 'function') {
  for (const evt of CRITICAL_EVENTS) {
    try { eventOn(evt, onCriticalEvent); console.log('[JMZQ] Đăng ký sự kiện quan trọng:', evt); } catch(e) {}
  }
  for (const evt of SECONDARY_EVENTS) {
    try { eventOn(evt, onSecondaryEvent); console.log('[JMZQ] Đăng ký sự kiện thứ cấp:', evt); } catch(e) {}
  }
  p._jmzqCleanup = function() {
    if (typeof eventOff === 'function') {
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onCriticalEvent); } catch(e) {} }
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onSecondaryEvent); } catch(e) {} }
    }
  };
} else {
  console.warn('[JMZQ] eventOn không khả dụng, sẽ chỉ hỗ trợ kích hoạt thủ công');
}

function refreshUI() {
  const r = p._jmzqLastResult;
  if (!r) return;
  if (r.ok) {
    statusDot.className = 'jmzq-dot ok';
    statTags.innerHTML = [
      r.stat.phase   && `<span class="jmzq-tag">${r.stat.phase}</span>`,
      r.stat.nat     && `<span class="jmzq-tag">${r.stat.nat}</span>`,
      r.stat.感染者  && `<span class="jmzq-tag">${r.stat.感染者}</span>`,
      r.stat.NPC模式 && `<span class="jmzq-tag">${r.stat.NPC模式}</span>`,
    ].filter(Boolean).join('');
  } else {
    statusDot.className = 'jmzq-dot err';
    statTags.innerHTML = `<span class="jmzq-tag err">ERROR</span>`;
  }
}

async function checkWorldbookCount() {
  try {
    const wbName = await api_resolveWorldbookName();
    const entries = await api_getWorldbook(wbName);
    if (!Array.isArray(entries)) return;
    const EXPECTED = 326;
    let color, text;
    if (entries.length === EXPECTED) {
      color = '#4ade80'; text = `Tổng cộng ${entries.length} mục`;
    } else if (entries.length < EXPECTED) {
      color = '#e74c3c'; text = `Chỉ có ${entries.length} mục, không đủ!`;
    } else {
      color = '#eab308'; text = `Tổng cộng ${entries.length} mục, vượt mức`;
    }
    statusText.textContent = text;
    statusText.style.color = color;
  } catch (e) {}
}

// --- Liên kết sự kiện ---
refreshBtn.addEventListener('click', async () => { checkConfig(); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate(); showToast('Đã làm mới'); });

manualWbApply.addEventListener('click', () => {
  const name = manualWbSelect.value;
  if (!name) { showToast('Vui lòng chọn Worldbook trước'); return; }
  _jmzqManualWbName = name;
  if (manualWbLabel) { manualWbLabel.textContent = 'Worldbook hiện tại (Chọn thủ công)'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
  showToast('Đã chuyển đổi: ' + name);
  autoSwitch();
});

mvuUpdateMode.addEventListener('change', () => {
  mvuExtraPanel.style.display = mvuUpdateMode.value === 'Phân tích mô hình bổ sung' ? '' : 'none';
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuModelSource.addEventListener('change', () => {
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuJailbreak.addEventListener('change', () => {
  const isOther = mvuJailbreak.value === 'Sử dụng preset khác';
  mvuPresetRow.style.display = isOther ? '' : 'none';
  if (isOther) populatePresets(mvuPresetName.value || '');
  onMvuFieldChange();
});
mvuRespFormat.addEventListener('change', onMvuFieldChange);
mvuPresetName.addEventListener('change', () => {
  onMvuFieldChange();
  if (mvuPresetName.value) syncMvuNativePreset(mvuPresetName.value);
});
mvuRequestMode.addEventListener('change', onMvuFieldChange);
mvuRequestCount.addEventListener('input', onMvuFieldChange);
mvuAutoRequest.addEventListener('change', onMvuFieldChange);
mvuApiUrl.addEventListener('input', onMvuFieldChange);
mvuApiKey.addEventListener('input', onMvuFieldChange);
mvuFetchModelsBtn.addEventListener('click', fetchModels);
mvuModelName.addEventListener('change', onMvuFieldChange);
mvuMaxTokens.addEventListener('input', onMvuFieldChange);
mvuTemperature.addEventListener('input', onMvuFieldChange);
mvuFreqPenalty.addEventListener('input', onMvuFieldChange);
mvuPresPenalty.addEventListener('input', onMvuFieldChange);
mvuTopP.addEventListener('input', onMvuFieldChange);
mvuTopK.addEventListener('input', onMvuFieldChange);
mvuAutoCleanEnable.addEventListener('change', () => {
  mvuCleanPanel.style.display = mvuAutoCleanEnable.checked ? '' : 'none';
  onMvuFieldChange();
});
mvuCleanInterval.addEventListener('input', onMvuFieldChange);
mvuCleanRecent.addEventListener('input', onMvuFieldChange);
mvuCleanTrigger.addEventListener('input', onMvuFieldChange);
mvuAdvToggle.addEventListener('click', () => {
  const open = mvuAdvPanel.style.display !== 'none';
  mvuAdvPanel.style.display = open ? 'none' : '';
  mvuAdvArrow.classList.toggle('open', !open);
});
// Accordion cấu hình thủ công
mvuManualToggle.addEventListener('click', () => {
  const open = mvuManualPanel.style.display !== 'none';
  mvuManualPanel.style.display = open ? 'none' : '';
  mvuManualArrow.classList.toggle('open', !open);
});
// Ủy quyền sự kiện checkbox tương thích
mvuCompatChecks.addEventListener('change', (e) => {
  if (e.target.classList.contains('jmzq-mvu-compat-check')) onMvuFieldChange();
});

mvuOptimizeBtn.addEventListener('click', () => {
  const apiUrlEmpty = !mvuApiUrl.value.trim();
  const apiKeyEmpty = !mvuApiKey.value.trim();
  if (apiUrlEmpty || apiKeyEmpty) {
    jmzqConfirmMsg.textContent = 'Vui lòng cấu hình kết nối API và chọn mô hình';
    jmzqConfirmBody.style.display = '';
    jmzqConfirmBody.innerHTML = `
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">Địa chỉ API</label>
        <input class="jmzq-mvu-input" id="jmzq-dlg-api-url" placeholder="https://...">
      </div>
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">Khóa API</label>
        <input class="jmzq-mvu-input" id="jmzq-dlg-api-key" type="password" placeholder="sk-...">
      </div>
      <div class="jmzq-mvu-row" style="justify-content:flex-end;">
        <button class="jmzq-btn xs" id="jmzq-dlg-fetch-models">Lấy mô hình</button>
      </div>
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">Tên mô hình</label>
        <select class="jmzq-mvu-select" id="jmzq-dlg-model-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <option value="">-- Vui lòng lấy mô hình trước --</option>
        </select>
      </div>
    `;
    // Đồng bộ giá trị bảng điều khiển hiện tại vào hộp thoại
    setTimeout(() => {
      const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
      const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
      const dlgFetch = p.document.getElementById('jmzq-dlg-fetch-models');
      if (dlgUrl) dlgUrl.value = mvuApiUrl.value;
      if (dlgKey) dlgKey.value = mvuApiKey.value;
      if (dlgFetch) dlgFetch.addEventListener('click', fetchModelsInDialog);
    }, 0);
    jmzqConfirmOk.textContent = 'Đã chọn xong, thực thi cấu hình';
    jmzqConfirmOk.onclick = () => {
      const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
      const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
      const dlgModel = p.document.getElementById('jmzq-dlg-model-name');
      if (!dlgUrl || !dlgUrl.value.trim()) { showToast('Vui lòng điền địa chỉ API'); return; }
      if (!dlgModel || !dlgModel.value) { showToast('Vui lòng lấy và chọn mô hình'); return; }
      // Kiểm tra Flash
      const modelName = (dlgModel.value || '').toLowerCase();
      const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);
      if (isFlash && jmzqConfirmOk.textContent !== 'Xác nhận sử dụng Flash') {
        jmzqConfirmMsg.textContent = 'Phát hiện dòng mô hình Flash, ngoại trừ 3.5 Flash thì các mô hình Flash khác có IQ không đủ, khuyên dùng gemini-2.5-pro / gemini-3.1-pro / gemini-3.5-flash. Bạn có chắc chắn muốn sử dụng không?';
        jmzqConfirmOk.textContent = 'Xác nhận sử dụng Flash';
        return;
      }
      // Đồng bộ về bảng điều khiển (applyOptimalMvuConfig sẽ đọc các trường API từ form và lưu)
      mvuApiUrl.value = dlgUrl.value;
      mvuApiKey.value = dlgKey ? dlgKey.value : '';
      if (dlgModel.options.length > 1) {
        mvuModelName.innerHTML = [...dlgModel.options].map(o => '<option value="' + o.value + '">' + o.textContent + '</option>').join('');
      }
      mvuModelName.value = dlgModel.value;
      jmzqConfirmOverlay.style.display = 'none';
      jmzqConfirmBody.style.display = 'none';
      jmzqConfirmOk.textContent = 'Xác nhận';
      applyOptimalMvuConfig();
    };
    jmzqConfirmOverlay.style.display = 'flex';
  } else {
    applyOptimalMvuConfig();
  }
});

// Áp dụng cấu hình từ form (mô phỏng hoàn toàn mô hình của applyOptimalMvuConfig: đổi cfg → save → sync → reload)
async function applyMvuConfigFromForm() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings không tồn tại, vui lòng đảm bảo khung biến MVU đã được cài đặt'); return; }

    cfg.Thông báo = cfg.Thông báo || {};
    cfg.Thông báo['Khung MVU tải thành công'] = true;
    cfg.Thông báo['Khởi tạo biến thành công'] = true;
    cfg.Thông báo['Lỗi cập nhật biến'] = true;
    cfg.Thông báo['Đang phân tích mô hình bổ sung'] = true;

    cfg.Phương thức cập nhật = mvuUpdateMode.value;

    cfg.Cấu hình phân tích mô hình bổ sung = cfg.Cấu hình phân tích mô hình bổ sung || {};
    const em = cfg.Cấu hình phân tích mô hình bổ sung;
    em.Nguồn mô hình = mvuModelSource.value;
    em.Phương án vượt rào = mvuJailbreak.value;
    if (mvuJailbreak.value === 'Sử dụng preset khác' && mvuPresetName) {
      em.Tên preset = mvuPresetName.value;
    } else {
      delete em.Tên preset;
    }
    em.Định dạng phản hồi = mvuRespFormat.value;
    em.Tương thích Fake stream = /Fake stream/i.test(mvuModelName.value);
    em.Phương thức yêu cầu = mvuRequestMode.value;
    em.Số lần yêu cầu = parseInt(mvuRequestCount.value) || 1;
    em.Bật yêu cầu tự động = mvuAutoRequest.checked;
    em.Địa chỉ API = mvuApiUrl.value;
    em.Khóa API = mvuApiKey.value;
    em.Tên mô hình = mvuModelName.value;
    em.Số token phản hồi tối đa = parseInt(mvuMaxTokens.value) || 65535;
    em.Nhiệt độ = parseFloat(mvuTemperature.value) || 1;
    em.Hình phạt tần suất = parseFloat(mvuFreqPenalty.value) || 0;
    em.Hình phạt hiện diện = parseFloat(mvuPresPenalty.value) || 0;
    em.top_p = parseFloat(mvuTopP.value) || 1;
    em.top_k = parseInt(mvuTopK.value) || 0;

    cfg.Tự động dọn dẹp biến = cfg.Tự động dọn dẹp biến || {};
    const ac = cfg.Tự động dọn dẹp biến;
    ac.Bật = mvuAutoCleanEnable.checked;
    ac.Khoảng thời gian lưu ảnh chụp = parseInt(mvuCleanInterval.value) || 50;
    ac.Số tầng gần đây cần giữ lại biến = parseInt(mvuCleanRecent.value) || 20;
    ac.Số tầng gần đây kích hoạt khôi phục biến = parseInt(mvuCleanTrigger.value) || 10;

    cfg.Khả năng tương thích = cfg.Khả năng tương thích || {};
    const checks = mvuCompatChecks.querySelectorAll('.jmzq-mvu-compat-check');
    checks.forEach(cb => { cfg.Khả năng tương thích[cb.dataset.key] = cb.checked; });
    clearTimeout(_mvuSaveTimer);
    ewcBackupToEwcYH();

    await saveSettings();

    await ewcSyncMvuDom().catch(() => {});
    if (em.Phương án vượt rào === 'Sử dụng preset khác' && em.Tên preset) {
      await syncMvuNativePreset(em.Tên preset);
    }

    syncMvuToForm(cfg);
    mvuStatus.textContent = 'Đã lưu cấu hình, chuẩn bị làm mới…';

    showToast('Đã áp dụng cấu hình, làm mới trang sau 1 giây…');
    setTimeout(() => { window.parent.location.reload(); }, 1000);
  } catch (e) {
    showToast('Cấu hình MVU thất bại: ' + e.message);
  }
}

mvuApplyBtn.addEventListener('click', async () => {
  const modelName = (mvuModelName.value || '').toLowerCase();
  const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);

  if (isFlash) {
    jmzqConfirmMsg.textContent = 'Phát hiện dòng mô hình Flash, ngoại trừ 3.5 Flash thì các mô hình Flash khác có IQ không đủ, khuyên dùng mô hình khác. Bạn có chắc chắn muốn áp dụng không?';
    jmzqConfirmOk.onclick = async () => {
      jmzqConfirmOverlay.style.display = 'none';
      await applyMvuConfigFromForm();
    };
    jmzqConfirmOverlay.style.display = 'flex';
    return;
  }

  await applyMvuConfigFromForm();
});

jmzqConfirmCancel.addEventListener('click', () => {
  jmzqConfirmOverlay.style.display = 'none';
  jmzqConfirmBody.style.display = 'none';
  jmzqConfirmOk.textContent = 'Xác nhận';
});

// --- Khởi tạo ---
// 1. Chèn hook chặn fetch (chặn các yêu cầu hoàn thành chat của các mô hình trong danh sách đen)
ewcInjectFetchHook();

// 2. Khôi phục các giá trị bị khởi tạo MVU xóa từ _ewcYH
ewcRestoreFromEwcYH();

// 3. Kích hoạt sự kiện MVU DOM, đồng bộ cache nội bộ
ewcSyncMvuDom().catch(() => {});

// 4. Khôi phục tên preset và đồng bộ với "Preset mục tiêu" gốc của MVU
(function restorePreset() {
  const bu = ewcGetEwcYH();
  const cfg = getMvuCfg();
  const em = cfg && cfg.Cấu hình phân tích mô hình bổ sung;
  if (bu.Tên preset && em && em.Phương án vượt rào === 'Sử dụng preset khác') {
    em.Tên preset = bu.Tên preset;
    syncMvuNativePreset(bu.Tên preset);
  }
})();

_jmzqPopulateWbSelect();
checkConfig();
// Cứ sau 5 giây sẽ tự động kiểm tra cấu hình một lần (sau khi chuyển đổi mô hình, đèn báo hiệu sẽ tự động theo sát, không cần mở bảng)
setInterval(() => { checkConfig(); updateBackendCode(); }, 5000);

// Polling trạng thái MVU theo định kỳ, khi có thay đổi sẽ tự động chuyển đổi Worldbook
let _lastStatKey = '';
setInterval(() => {
  try {
    if (typeof p.Mvu === 'undefined') return;
    const sd = readStatData();
    if (!sd) return;
    const key = `${sd.Giai đoạn thế giới}|${sd.Trạng thái dẫn xuất?.nationality}|${sd.Mô hình hành vi người nhiễm}|${sd.Mô hình hành vi NPC}`;
    if (key !== _lastStatKey) {
      _lastStatKey = key;
      autoSwitch();
    }
  } catch (e) {}
}, 5000);

refreshMvuConfigStatus();
checkEjsTemplate();

// 5. Khi khởi động thực hiện chuyển đổi Worldbook một lần
autoSwitch();

// Đăng ký sự kiện làm mới trạng thái Worldbook
p.document.addEventListener('jmzq-done', () => { refreshUI(); checkWorldbookCount(); });

export {}


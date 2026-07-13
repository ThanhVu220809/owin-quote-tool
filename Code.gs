/**
 * BACKEND TÍ HON CHO OWIN QUOTE TOOL (Google Apps Script Web App)
 * Vai trò DUY NHẤT: giữ client_secret, đổi auth code -> token, refresh token.
 * KHÔNG đụng tới dữ liệu báo giá. Dữ liệu sync nằm ở Drive appdata do front-end lo.
 *
 * Deploy: Execute as = Me (chủ tài khoản xưởng), Who has access = Anyone.
 * Sau khi deploy, copy URL /exec dán vào front-end.
 *
 * Cấu hình bí mật: vào Project Settings > Script Properties, thêm:
 *   GOOGLE_CLIENT_ID      = <client id của anh>
 *   GOOGLE_CLIENT_SECRET  = <client secret của anh>
 *   SHARED_SECRET         = <chuỗi ngẫu nhiên anh tự đặt, ví dụ 32 ký tự>
 *   REDIRECT_URI          = <đúng redirect uri đã khai trong Google Cloud Console>
 * KHÔNG hardcode secret vào code này.
 */

var TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function doPost(e) {
  // Lưu ý CORS: front-end gửi Content-Type text/plain để né preflight.
  // Body là chuỗi JSON, ta tự parse.
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();

    // Chặn người lạ: front-end phải gửi đúng shared secret.
    if (body.shared_secret !== props.getProperty('SHARED_SECRET')) {
      return jsonOut({ error: 'unauthorized' });
    }

    if (body.action === 'exchange') {
      return handleExchange(body.code, props);
    } else if (body.action === 'refresh') {
      return handleRefresh(props);
    } else if (body.action === 'mirror') {
      return handleMirror(body, props);
    } else {
      return jsonOut({ error: 'unknown_action' });
    }
  } catch (err) {
    return jsonOut({ error: 'server_error', detail: String(err) });
  }
}

/** Đổi authorization code (lần đầu đăng nhập) lấy access + refresh token. */
function handleExchange(code, props) {
  var payload = {
    code: code,
    client_id: props.getProperty('GOOGLE_CLIENT_ID'),
    client_secret: props.getProperty('GOOGLE_CLIENT_SECRET'),
    redirect_uri: props.getProperty('REDIRECT_URI'),
    grant_type: 'authorization_code'
  };
  var res = postForm(TOKEN_ENDPOINT, payload);
  var data = JSON.parse(res.getContentText());

  // refresh_token CHỈ xuất hiện ở lần đổi đầu tiên (cần prompt=consent + access_type=offline).
  // Lưu lại để dùng cho các lần refresh sau. KHÔNG trả refresh_token về front-end.
  if (data.refresh_token) {
    props.setProperty('REFRESH_TOKEN', data.refresh_token);
  }
  // Chỉ trả access_token (ngắn hạn) + thời hạn về cho tablet dùng.
  return jsonOut({
    access_token: data.access_token || null,
    expires_in: data.expires_in || null,
    error: data.error || null
  });
}

/** Dùng refresh_token đã lưu để xin access_token mới. */
function handleRefresh(props) {
  var refreshToken = props.getProperty('REFRESH_TOKEN');
  if (!refreshToken) {
    // Chưa từng đăng nhập, hoặc refresh token đã bị xóa -> bắt front-end đăng nhập lại.
    return jsonOut({ error: 'no_refresh_token', need_relogin: true });
  }
  var payload = {
    refresh_token: refreshToken,
    client_id: props.getProperty('GOOGLE_CLIENT_ID'),
    client_secret: props.getProperty('GOOGLE_CLIENT_SECRET'),
    grant_type: 'refresh_token'
  };
  var res = postForm(TOKEN_ENDPOINT, payload);
  var data = JSON.parse(res.getContentText());

  // Refresh token CÓ THỂ chết (đổi mật khẩu, thu hồi quyền, 6 tháng không dùng...).
  // Khi đó Google trả invalid_grant -> dọn token cũ, bắt đăng nhập lại.
  if (data.error === 'invalid_grant') {
    props.deleteProperty('REFRESH_TOKEN');
    return jsonOut({ error: 'invalid_grant', need_relogin: true });
  }
  return jsonOut({
    access_token: data.access_token || null,
    expires_in: data.expires_in || null,
    error: data.error || null
  });
}

/**
 * MIRROR: chiếu products + quotes (client gửi sẵn dạng lưới) ra 1 Google Sheet
 * trong Drive tài khoản xưởng. Sheet này = backup dễ tìm, dễ xem/sửa, chia sẻ link.
 * Chạy bằng tài khoản chủ (Execute as = Me) nên KHÔNG cần scope Sheet phía client.
 */
function handleMirror(body, props) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // Chống 2 thiết bị ghi Sheet cùng lúc.
  } catch (e) {
    return jsonOut({ error: 'busy' });
  }
  try {
    var ss = getOrCreateMirrorSheet(props);
    writeGrid(ss, 'Sản phẩm', body.products);
    writeGrid(ss, 'Báo giá', body.quotes);
    // Xoá tab mặc định 'Sheet1' còn sót sau khi tạo mới.
    var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Trang tính1');
    if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
    return jsonOut({ url: ss.getUrl() });
  } catch (err) {
    return jsonOut({ error: 'mirror_failed', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Mở Sheet mirror theo ID đã lưu; nếu chưa có / bị xoá thì tạo mới và nhớ ID. */
function getOrCreateMirrorSheet(props) {
  var id = props.getProperty('MIRROR_SHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // Sheet bị xoá/không mở được → rơi xuống tạo mới.
    }
  }
  var ss = SpreadsheetApp.create('OWIN - Dữ liệu (backup)');
  props.setProperty('MIRROR_SHEET_ID', ss.getId());
  return ss;
}

/** Ghi 1 lưới (mảng 2 chiều) vào tab tên `name`, ghi đè sạch nội dung cũ. */
function writeGrid(ss, name, grid) {
  if (!grid || !grid.length) grid = [['(trống)']];
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  // Chuẩn hoá: mọi hàng cùng số cột để setValues không ném lỗi.
  var cols = 0;
  for (var i = 0; i < grid.length; i++) {
    if (grid[i].length > cols) cols = grid[i].length;
  }
  for (var j = 0; j < grid.length; j++) {
    while (grid[j].length < cols) grid[j].push('');
  }
  sheet.getRange(1, 1, grid.length, cols).setValues(grid);
  sheet.setFrozenRows(1);
}

function postForm(url, payloadObj) {
  return UrlFetchApp.fetch(url, {
    method: 'post',
    payload: payloadObj,            // form-urlencoded, đúng yêu cầu token endpoint
    muteHttpExceptions: true
  });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

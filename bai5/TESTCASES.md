# Bộ testcase – Bài 5: Hàng rào giới hạn tần suất ShopFast

Tài liệu đặc tả **57 testcase**, chia thành 5 nhóm. Mỗi testcase có một test tự động mang **đúng mã ID** trong tên test, nên tra từ tài liệu sang code bằng cách tìm mã ID (ví dụ `TC-FS-02`).

| Nhóm | Phạm vi | Số TC | File test |
|---|---|---|---|
| **BUG** | Tái hiện lỗi trên cấu hình gốc | 9 | [test/buggy.e2e-spec.ts](test/buggy.e2e-spec.ts) |
| **FS** | `POST /orders/flash-sale` – bản đã sửa | 14 | [test/flash-sale.e2e-spec.ts](test/flash-sale.e2e-spec.ts) |
| **OTP** | `POST /auth/send-otp` – bản đã sửa | 15 | [test/send-otp.e2e-spec.ts](test/send-otp.e2e-spec.ts) |
| **UNIT** | Hàm chọn khoá đếm, chuẩn hoá số điện thoại | 15 | [test/trackers.spec.ts](test/trackers.spec.ts) |
| **CFG** | Kiểm tra cấu hình tĩnh, chặn hồi quy | 4 | [test/config.spec.ts](test/config.spec.ts) |

Hai testcase ứng với **tiêu chí chấm điểm** của đề:

- **TC-FS-02**: lần đặt đơn flash sale thứ 4 trong 60 giây trả về `429`.
- **TC-OTP-02**: lần gửi OTP thứ 4 trong 5 phút trả về `429`.

---

## 0. Quy ước chung

**Tiền điều kiện áp dụng cho mọi testcase e2e:**

- Mỗi testcase chạy trên một app mới khởi động, nên bộ đếm luôn bắt đầu từ rỗng.
- Đồng hồ được giả lập bằng cách mock `Date.now()`. "Đợi 61 s" nghĩa là tua đồng hồ thêm 61 000 ms, không phải chờ thật.
- Mọi request đi ra từ cùng một IP là `127.0.0.1`. Riêng các TC có ghi **[trust proxy]** thì app bật `trust proxy`, và IP được giả lập bằng header `X-Forwarded-For: 10.0.0.<i>`.

**Dữ liệu mặc định:**

| Endpoint | Header | Body |
|---|---|---|
| `POST /orders/flash-sale` | `x-user-id: user-1` | `{"productId":"iphone-17","quantity":1}` |
| `POST /auth/send-otp` | (không có) | `{"phone":"0912345678"}` |

**Ký hiệu:** `201 ×3` nghĩa là 3 lần liên tiếp đều trả về 201. Cột *KQ* là kết quả lần chạy gần nhất: ✅ = Đạt.

---

## 1. Nhóm BUG – Tái hiện lỗi trên cấu hình gốc

App dùng [src/buggy/buggy-app.module.ts](src/buggy/buggy-app.module.ts), giữ nguyên cấu hình đang chạy trên production. Test **đạt** nghĩa là **lỗi được tái hiện**: cột "Thực tế" đúng là hành vi sai đang xảy ra.

Một số TC chạy trên một **biến thể vá dở**, để chứng minh từng lỗi tồn tại độc lập với nhau:

- *Gốc*: cấu hình nguyên bản.
- *Gốc + Guard*: thêm `APP_GUARD`, vẫn giữ `@SkipThrottle()`.
- *Vá dở*: có guard, đã bỏ `@SkipThrottle()`, nhưng OTP vẫn dùng `ttl` 60 s của `forRoot`.

| ID | Lỗi | Cấu hình | Bước thực hiện | Thực tế (bản gốc) | Đúng phải là | KQ |
|---|---|---|---|---|---|---|
| TC-BUG-01 | 1 | Gốc | Gọi `POST /orders/flash-sale` 10 lần liên tiếp trong < 60 s | `201 ×10` | `201 ×3`, sau đó `429 ×7` | ✅ |
| TC-BUG-02 | 1 | Gốc | Tài khoản `bot` gọi flash-sale 180 lần trong < 60 s (tái hiện sự cố) | 180 đơn thành công, 0 lần 429 | 3 đơn thành công, 177 lần 429 | ✅ |
| TC-BUG-03 | 1 | Gốc | Gọi flash-sale 1 lần, xem response header | Không có `X-RateLimit-Limit` / `X-RateLimit-Remaining`, chứng tỏ guard không chạy | Có header, `X-RateLimit-Limit: 3` | ✅ |
| TC-BUG-04 | 1+2 | Gốc | Gọi `POST /auth/send-otp` 10 lần với cùng số `0912345678` | `201 ×10`, tức 10 SMS bị tính phí | `201 ×3`, sau đó `429 ×7` | ✅ |
| TC-BUG-05 | 2 | Gốc + Guard | (1) Gọi flash-sale 4 lần. (2) Gọi send-otp 10 lần | (1) `201 201 201 429`: guard đã chạy. (2) `201 ×10`: riêng OTP vẫn bị bỏ qua | (2) `201 ×3`, sau đó `429 ×7` | ✅ |
| TC-BUG-06 | 3 | Vá dở | Gọi send-otp 4 lần (lần 4 nhận 429), tua 60 s, gọi lần 5 | Lần 5 trả `201` | `429` (chưa hết 5 phút) | ✅ |
| TC-BUG-07 | 3 | Vá dở | Lặp 5 lần: gửi OTP 3 lần rồi tua 60 s. Đếm số SMS gửi thành công | **15 SMS** / 5 phút | Tối đa **3 SMS** / 5 phút | ✅ |
| TC-BUG-08 | 4 | Gốc + Guard | `user-A` đặt 3 đơn, sau đó `user-B` (cùng IP) đặt đơn đầu tiên | B nhận `429` oan | B nhận `201` | ✅ |
| TC-BUG-09 | 4 | Gốc + Guard **[trust proxy]** | Tài khoản `bot` đặt 10 đơn, mỗi đơn từ một IP khác nhau | `201 ×10`: đổi IP là lách được | `201 ×3`, sau đó `429 ×7` | ✅ |

---

## 2. Nhóm FS – `POST /orders/flash-sale` (3 đơn / 60 s / tài khoản)

App dùng bản đã sửa [src/app.module.ts](src/app.module.ts).

### 2.1 Ngưỡng cơ bản

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-01 | 3 đơn đầu được chấp nhận | `user-1` đặt 3 đơn liên tiếp | `201 ×3`. Body lần 1 chứa `{"status":"created","userId":"user-1","productId":"iphone-17"}` | ✅ |
| **TC-FS-02** | **Lần thứ 4 bị chặn** (tiêu chí chấm) | `user-1` đặt 3 đơn, rồi đặt đơn thứ 4 ngay | Lần 4: `429`, body `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}` | ✅ |
| TC-FS-03 | Tái hiện sự cố đã được chặn | `bot` gọi 180 lần trong < 60 s | Đúng 3 lần `201` (3 lần đầu), 177 lần `429` | ✅ |

### 2.2 Header phản hồi

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-04 | Client biết hạn mức còn lại | Đặt 3 đơn, đọc header của từng response | `X-RateLimit-Limit: 3` ở cả 3 lần. `X-RateLimit-Remaining` lần lượt là `2`, `1`, `0` | ✅ |
| TC-FS-05 | Client biết khi nào được thử lại | Đặt 3 đơn, lần 4 bị 429, đọc header | Có `Retry-After`, giá trị trong khoảng 0 < x ≤ 60 (giây) | ✅ |

### 2.3 Cửa sổ thời gian

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-06 | Biên dưới: chưa hết 60 s thì vẫn bị chặn | Đặt 3 đơn lúc t = 0, tua đến t = 59 s, đặt đơn thứ 4 | `429` | ✅ |
| TC-FS-07 | Biên trên: hết cửa sổ thì được đặt lại | Đặt 4 đơn lúc t = 0 (lần 4 nhận 429), tua 60 s + 1 ms, đặt tiếp | `201` | ✅ |
| TC-FS-08 | Cửa sổ trượt: đơn nào hết hạn thì trả lại đúng 1 lượt | t = 0: đặt 1 đơn. t = 30 s: đặt 2 đơn. t = 61 s: đặt 2 đơn | t = 0 s: `201`. t = 30 s: `201 201`. t = 61 s: `201 429` (đơn lúc 0 s đã hết hạn, 2 đơn lúc 30 s vẫn còn tính) | ✅ |

### 2.4 Đối tượng bị đếm (tracker)

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-09 | Đếm riêng từng tài khoản, không chặn oan người dùng chung IP (vá Lỗi 4) | (1) `user-A` đặt 4 đơn. (2) `user-B`, cùng IP, đặt 3 đơn. (3) `user-A` đặt thêm 1 đơn | (1) Lần 4 nhận `429`. (2) `201 ×3`. (3) `429` | ✅ |
| TC-FS-10 | Đổi IP không lách được giới hạn (vá Lỗi 4) **[trust proxy]** | `bot` đặt 10 đơn từ 10 IP khác nhau (`10.0.0.1` → `10.0.0.10`) | `201 ×3`, sau đó `429 ×7` | ✅ |

### 2.5 Xác thực

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-11 | Bắt buộc đăng nhập | Gọi flash-sale **không có** header `x-user-id` | `401 Unauthorized` | ✅ |
| TC-FS-12 | Spam ẩn danh vẫn bị chặn theo IP, vì throttler chạy trước bước kiểm tra đăng nhập | Gọi 5 lần không có `x-user-id` | `401 401 401 429 429` | ✅ |

### 2.6 Đồng thời và độc lập

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-FS-13 | Không có race condition khi bot bắn song song | `bot` bắn **20 request cùng lúc** (`Promise.all`) | Đúng 3 lần `201`, 17 lần `429` | ✅ |
| TC-FS-14 | Hạn mức flash-sale tách biệt với OTP | `user-1` đặt 4 đơn (bị chặn), sau đó gửi OTP | OTP trả về `201` | ✅ |

---

## 3. Nhóm OTP – `POST /auth/send-otp` (3 lần / 5 phút / số điện thoại)

### 3.1 Ngưỡng cơ bản

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-OTP-01 | 3 lần đầu được gửi | Gửi OTP 3 lần cho `0912345678` | `201 ×3`. Body lần 1 là `{"status":"sent","phone":"0912345678"}` | ✅ |
| **TC-OTP-02** | **Lần thứ 4 bị chặn** (tiêu chí chấm) | Gửi 3 lần, rồi gửi lần thứ 4 ngay | Lần 4: `429`, body `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}` | ✅ |
| TC-OTP-03 | Header phản hồi đúng ngưỡng 5 phút | Gửi 4 lần, đọc header lần 1 và lần 4 | Lần 1: `X-RateLimit-Limit: 3`, `X-RateLimit-Remaining: 2`. Lần 4: `Retry-After: 300` | ✅ |

### 3.2 Cửa sổ thời gian 5 phút

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-OTP-04 | Không còn dùng ttl 60 s (vá Lỗi 3) | Gửi 3 lần lúc t = 0, tua đến t = 61 s, gửi lần 4 | `429` (bản gốc trả `201`, xem TC-BUG-06) | ✅ |
| TC-OTP-05 | Biên dưới | Gửi 3 lần lúc t = 0, tua đến t = 299 s, gửi lần 4 | `429` | ✅ |
| TC-OTP-06 | Biên trên: không gửi thừa lần nào thì sau 5 phút được gửi lại | Gửi 3 lần lúc t = 0, **không gửi thêm**, tua đến t = 300 s + 1 ms, gửi tiếp | `201` | ✅ |
| TC-OTP-07 | Đã vượt ngưỡng thì bị khoá trọn 5 phút **tính từ lúc vượt ngưỡng** (`blockDuration` mặc định bằng `ttl`) | Gửi 3 lần lúc t = 0. t = 61 s: gửi (nhận 429, bắt đầu khoá). t = 301 s: gửi. t = 361 s + 1 ms: gửi | t = 61 s: `429`. t = 301 s: `429` (dù đã quá 5 phút kể từ lần đầu). t = 361 s: `201` | ✅ |
| TC-OTP-08 | Thử đều đặn cũng không vượt quota (đối chứng với 15 SMS của TC-BUG-07) | Gửi 1 lần mỗi 30 s, tổng cộng 10 lần trong 5 phút | Chỉ đúng 3 lần `201` (3 lần đầu), còn lại `429` | ✅ |

### 3.3 Đối tượng bị đếm (tracker)

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-OTP-09 | Đổi định dạng số không lách được giới hạn | Gửi lần lượt: `0912345678`, `+84 912 345 678`, `84912345678`, `0912-345-678`, `(091) 234.5678` | `201 201 201 429 429` (cả 5 cách viết dùng chung một bộ đếm) | ✅ |
| TC-OTP-10 | Mỗi số có bộ đếm riêng | Gửi 4 lần cho `0912345678` (bị chặn), rồi gửi 3 lần cho `0987654321` | Số thứ hai nhận `201 ×3` | ✅ |
| TC-OTP-11 | Đổi IP không lách được giới hạn **[trust proxy]** | Gửi 10 lần cho `0912345678`, mỗi lần từ một IP khác nhau | `201 ×3`, sau đó `429 ×7` | ✅ |

### 3.4 Dữ liệu không hợp lệ

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-OTP-12 | Thiếu số điện thoại | Body `{}` | `400`, `message: "phone is required"` | ✅ |
| TC-OTP-13 | Spam dữ liệu rác vẫn bị chặn (không có số hợp lệ thì đếm theo IP) | Gửi 5 lần với `{"phone":"abc"}` | `400 400 400 429 429` | ✅ |

### 3.5 Đồng thời và độc lập

| ID | Mục đích | Bước thực hiện / Dữ liệu | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| TC-OTP-14 | Không có race condition | Bắn **20 request cùng lúc** cho cùng một số | Đúng 3 lần `201`, 17 lần `429` | ✅ |
| TC-OTP-15 | Hạn mức OTP tách biệt với flash-sale | Gửi OTP 4 lần (bị chặn), sau đó `user-1` đặt đơn flash-sale | Flash-sale trả về `201` | ✅ |

---

## 4. Nhóm UNIT – Hàm chọn khoá đếm ([src/common/trackers.ts](src/common/trackers.ts))

### 4.1 `normalizePhone(input)`

| ID | Input | Output mong đợi | KQ |
|---|---|---|---|
| TC-UNIT-01 | `"0912345678"` | `"0912345678"` | ✅ |
| TC-UNIT-02 | `"+84912345678"` | `"0912345678"` | ✅ |
| TC-UNIT-03 | `"84912345678"` | `"0912345678"` | ✅ |
| TC-UNIT-04 | `"+84 912 345 678"` | `"0912345678"` | ✅ |
| TC-UNIT-05 | `"0912-345-678"` | `"0912345678"` | ✅ |
| TC-UNIT-06 | `"(091) 234.5678"` | `"0912345678"` | ✅ |
| TC-UNIT-07 | `""` | `""` | ✅ |
| TC-UNIT-08 | `"abc"` | `""` | ✅ |
| TC-UNIT-09 | `undefined` | `""` | ✅ |
| TC-UNIT-10 | `null` | `""` | ✅ |

### 4.2 `trackByAccount(req)` và `trackByPhone(req)`

| ID | Input (`req`) | Output mong đợi | KQ |
|---|---|---|---|
| TC-UNIT-11 | `{ user: { id: "u1" }, ip: "1.2.3.4" }` | `"user:u1"` | ✅ |
| TC-UNIT-12 | `{ ip: "1.2.3.4" }` (chưa đăng nhập) | `"ip:1.2.3.4"` | ✅ |
| TC-UNIT-13 | So sánh `{ user: { id: "1.2.3.4" } }` với `{ ip: "1.2.3.4" }` | Hai khoá **khác nhau** (`user:` ≠ `ip:`), không dùng chung bộ đếm | ✅ |
| TC-UNIT-14 | `{ body: { phone: "+84 912 345 678" } }` | `"phone:0912345678"` | ✅ |
| TC-UNIT-15 | `{ body: {} }`, `{ body: { phone: "abc" } }`, không có `body` (cùng `ip: "1.2.3.4"`) | Cả 3 trường hợp đều ra `"ip:1.2.3.4"` | ✅ |

---

## 5. Nhóm CFG – Kiểm tra cấu hình tĩnh

Nhóm này đọc metadata của decorator thay vì gọi HTTP. Mục đích là chặn hồi quy: nếu sau này có người vô tình xoá guard hoặc thêm lại `@SkipThrottle()`, test sẽ báo ngay.

| ID | Kiểm tra | Kết quả mong đợi | KQ |
|---|---|---|---|
| TC-CFG-01 | `providers` của `AppModule` | Có `{ provide: APP_GUARD, useClass: ThrottlerGuard }` | ✅ |
| TC-CFG-02 | Metadata của `OrderController.createFlashSaleOrder` | `limit = 3`, `ttl = 60000`, `tracker = trackByAccount`, không có skip | ✅ |
| TC-CFG-03 | Metadata của `AuthController.sendOtp` và của class `AuthController` | `limit = 3`, `ttl = 300000`, `tracker = trackByPhone`, **không có `@SkipThrottle`** ở cả method lẫn class | ✅ |
| TC-CFG-04 | Đối chứng với bản gốc | `BuggyAppModule` **không** có `APP_GUARD`. `BuggyAuthController.sendOtp` có skip = `true` | ✅ |

---

## 6. Cách chạy

```bash
npm install
npm test                                   # chạy toàn bộ 57 TC
npx jest -t "TC-FS-02"                     # chạy 1 TC theo mã ID
npx jest test/send-otp.e2e-spec.ts         # chạy 1 nhóm
npx jest --verbose                         # liệt kê từng TC kèm kết quả
```

Kết quả lần chạy gần nhất:

```
Test Suites: 5 passed, 5 total
Tests:       57 passed, 57 total
```

### Kiểm chứng bộ test bắt được lỗi (mutation test)

Mình cố ý phá bản sửa rồi chạy lại toàn bộ test, để chắc rằng bộ test thật sự phát hiện được lỗi:

| Thay đổi cố ý | Kết quả | Kết luận |
|---|---|---|
| Xoá dòng `{ provide: APP_GUARD, useClass: ThrottlerGuard }` | **21 TC thất bại** (gồm TC-FS-02, TC-OTP-02, TC-CFG-01) | Bộ test bắt được Lỗi 1 |
| Thêm lại `@SkipThrottle()` vào `sendOtp` | **11 TC thất bại** (gồm TC-OTP-02, TC-CFG-03) | Bộ test bắt được Lỗi 2 |
| Khôi phục code | 57/57 đạt | |

### Kiểm thử thủ công (server thật, không cần tua giờ)

Các TC sau kiểm được ngay bằng curl hoặc [scripts/manual-test.ps1](scripts/manual-test.ps1), vì không cần chờ thời gian:

- **TC-FS-02, FS-04, FS-05, FS-09, FS-11**
- **TC-OTP-02, OTP-03, OTP-09, OTP-10, OTP-12**

Các TC về cửa sổ thời gian (FS-06 → FS-08, OTP-04 → OTP-08) cần chờ thật từ 60 giây đến 6 phút, nên nên kiểm bằng test tự động. Lệnh curl mẫu có trong [README.md](README.md#kiểm-thử-thủ-công-trên-server-thật).

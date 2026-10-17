# Bài 5 – Vá lỗi hàng rào giới hạn tần suất bị bot vượt qua

NestJS 11 + `@nestjs/throttler` 6.

| Quy tắc nghiệp vụ | Endpoint | Ngưỡng |
|---|---|---|
| Mỗi **tài khoản** tối đa 3 đơn flash sale / 60 giây | `POST /orders/flash-sale` | 3 / 60 000 ms |
| Mỗi **số điện thoại** tối đa 3 lần gửi OTP / 5 phút | `POST /auth/send-otp` | 3 / 300 000 ms |

```
src/
├── buggy/buggy-app.module.ts   # cấu hình GỐC (giữ nguyên lỗi) – chỉ dùng để tái hiện lỗi
├── app.module.ts               # đã sửa: đăng ký ThrottlerGuard toàn cục
├── common/
│   ├── throttle-policies.ts    # tất cả ngưỡng ở một chỗ
│   ├── trackers.ts             # khoá đếm: theo tài khoản / theo số điện thoại
│   ├── mock-auth.middleware.ts # xác thực giả lập qua header x-user-id
│   └── require-user.guard.ts
├── order/order.controller.ts   # @Throttle 3/60s theo tài khoản
└── auth/auth.controller.ts     # bỏ @SkipThrottle, @Throttle 3/5 phút theo số điện thoại
test/                           # 57 testcase, đặc tả chi tiết trong TESTCASES.md
├── buggy.e2e-spec.ts           # TC-BUG-*  Phần 1: tái hiện lỗi trên cấu hình gốc
├── flash-sale.e2e-spec.ts      # TC-FS-*   Phần 2: kiểm chứng flash sale
├── send-otp.e2e-spec.ts        # TC-OTP-*  Phần 2: kiểm chứng gửi OTP
├── trackers.spec.ts            # TC-UNIT-* khoá đếm, chuẩn hoá số điện thoại
└── config.spec.ts              # TC-CFG-*  kiểm tra cấu hình tĩnh, chặn hồi quy
```

---

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

### Luồng thực thi của bản gốc

```
Request ─► Middleware ─► Guards (KHÔNG có ThrottlerGuard nào) ─► Controller ─► 201
                              ▲
ThrottlerModule.forRoot(...) chỉ đăng ký cấu hình + storage, KHÔNG tự chặn request.
```

### Lỗi 1 – `ThrottlerGuard` chưa được kích hoạt ⇒ cả hệ thống không có giới hạn

`ThrottlerModule.forRoot([{ ttl: 60000, limit: 3 }])` chỉ khai báo cấu hình và kho đếm. Việc đếm và chặn do `ThrottlerGuard` làm, mà guard này chưa được đăng ký ở đâu cả: không có `APP_GUARD`, cũng không có `@UseGuards(ThrottlerGuard)`. Vì vậy không request nào bị đếm.

| Kịch bản | Thực tế | Đúng phải là |
|---|---|---|
| Cùng tài khoản gọi `POST /orders/flash-sale` **10 lần trong < 60 s** | `201 ×10` | `201 201 201 429 429 …` |
| Bot gọi 180 lần / phút (sự cố thật) | 180 đơn thành công | 3 đơn thành công, 177 lần `429` |

Test: TC-BUG-01 → 03 trong [test/buggy.e2e-spec.ts](test/buggy.e2e-spec.ts).

### Lỗi 2 – `@SkipThrottle()` trên `send-otp` tắt hàng rào ở đúng endpoint tốn tiền nhất

Kể cả khi đã vá Lỗi 1, guard đọc metadata `@SkipThrottle()` và **bỏ qua** endpoint gửi OTP. Mỗi lần gọi là một tin SMS phải trả phí, nên hoá đơn SMS mới tăng gấp 12 lần.

| Kịch bản | Thực tế | Đúng phải là |
|---|---|---|
| Đã thêm `APP_GUARD`, gọi `POST /auth/send-otp` với cùng số **10 lần trong < 5 phút** | `201 ×10` (10 SMS bị tính phí) | `201 201 201 429 …` |
| Đối chứng trong cùng app: `POST /orders/flash-sale` 4 lần | `201 201 201 429` | (đã đúng) |

Test: TC-BUG-04, 05.

### Lỗi 3 – OTP dùng chung `ttl` 60 giây của `forRoot` (sai cửa sổ thời gian)

`forRoot` chỉ có **một** ngưỡng là 3 lần / 60 000 ms. Nếu chỉ thêm guard và bỏ `@SkipThrottle()` thì OTP vẫn bị tính theo cửa sổ 60 giây, chứ không phải 5 phút.

| Kịch bản | Thực tế | Đúng phải là |
|---|---|---|
| Gửi OTP 3 lần → đợi **61 giây** → gửi lần 4 | Lần 4 trả `201` | `429` (chưa hết 5 phút) |
| Gửi liên tục trong 5 phút | **15 SMS** (3 × 5 cửa sổ) | tối đa 3 SMS |

Test: TC-BUG-06, 07.

### Lỗi 4 (bổ sung) – Đếm theo IP thay vì theo tài khoản / số điện thoại

Mặc định `ThrottlerGuard.getTracker()` trả về `req.ip`, trong khi quy tắc là **mỗi tài khoản** và **mỗi số điện thoại**:

- Bot xoay vòng IP qua proxy: mỗi IP lại có 3 lượt mới, nên một tài khoản đặt được không giới hạn.
- Người dùng thật ngồi chung NAT, Wi-Fi công ty hoặc 4G CGNAT bị chặn oan.

| Kịch bản | Thực tế | Đúng phải là |
|---|---|---|
| Cùng IP: tài khoản A đặt 3 đơn, sau đó tài khoản B đặt đơn đầu tiên | B nhận `429` | B nhận `201` |

Test: TC-BUG-08, 09.

---

## Phần 2 – Bản đã sửa

**[src/app.module.ts](src/app.module.ts)**: kích hoạt guard cho toàn ứng dụng (vá Lỗi 1)

```ts
ThrottlerModule.forRoot([{ name: 'default', ...GENERAL_LIMIT }]),   // 100 req/phút cho route thường
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```

**[src/order/order.controller.ts](src/order/order.controller.ts)**: 3 đơn / 60 s, đếm theo tài khoản (vá Lỗi 4)

```ts
@Throttle({ default: { ...FLASH_SALE_LIMIT, getTracker: trackByAccount } })
@Post('flash-sale')
```

**[src/auth/auth.controller.ts](src/auth/auth.controller.ts)**: bỏ `@SkipThrottle()`, đặt ngưỡng riêng 3 lần / 5 phút, đếm theo số điện thoại đã chuẩn hoá (vá Lỗi 2, 3, 4)

```ts
@Throttle({ default: { ...SEND_OTP_LIMIT, getTracker: trackByPhone } })
@Post('send-otp')
```

`trackByPhone` chuẩn hoá `+84 912 345 678`, `84912345678` và `0912-345-678` về cùng một giá trị `0912345678`. Nhờ vậy bot không lách được giới hạn bằng cách đổi định dạng số.

Lưu ý hành vi: khi vượt ngưỡng, request bị khoá thêm `blockDuration` (mặc định bằng `ttl`) **tính từ lúc vượt ngưỡng**. Ví dụ: bị chặn OTP ở giây 61 thì đến giây 361 mới gửi lại được.

---

## Cách chạy và kiểm thử

```bash
npm install
npm test            # chạy toàn bộ 57 testcase (khoảng 5 giây)
npx jest -t "TC-FS-02"   # chạy 1 testcase theo mã ID
```

Kết quả mong đợi: `Tests: 57 passed`. Danh sách đầy đủ, gồm bước thực hiện, dữ liệu và kết quả mong đợi của từng testcase, nằm trong **[TESTCASES.md](TESTCASES.md)**.

- Nhóm **BUG** (9 TC): test **pass** nghĩa là lỗi **được tái hiện** trên cấu hình gốc.
- Nhóm **FS / OTP / UNIT / CFG** (48 TC): kiểm chứng bản sửa, trong đó có hai tiêu chí chấm điểm:
  - **TC-FS-02**: lần đặt đơn flash sale thứ 4 trong 60 giây trả về 429.
  - **TC-OTP-02**: lần gửi OTP thứ 4 trong 5 phút trả về 429.

Test dùng đồng hồ giả (mock `Date.now()`) để "tua" 60 giây hoặc 5 phút ngay lập tức, nên không phải chờ thật.

### Kiểm thử thủ công trên server thật

```bash
npm run build
npm start                       # http://localhost:3000
```

Ở một terminal khác (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/manual-test.ps1
```

Hoặc gọi bằng curl (Git Bash / Linux / macOS):

```bash
# Flash sale: kỳ vọng 201 201 201 429
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "lan $i -> %{http_code}\n" -X POST localhost:3000/orders/flash-sale \
    -H "x-user-id: u1" -H "Content-Type: application/json" -d '{"productId":"p1","quantity":1}'
done

# OTP: kỳ vọng 201 201 201 429
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "lan $i -> %{http_code}\n" -X POST localhost:3000/auth/send-otp \
    -H "Content-Type: application/json" -d '{"phone":"0912345678"}'
done

# Xem chi tiết phản hồi 429 (có header Retry-After: 300)
curl -i -X POST localhost:3000/auth/send-otp -H "Content-Type: application/json" -d '{"phone":"0912345678"}'
```

Bộ đếm nằm trong RAM, nên muốn test lại từ đầu thì khởi động lại server hoặc đổi `x-user-id` / số điện thoại.

---

## Hướng gia cố thêm (ngoài phạm vi bài)

- **Chạy nhiều instance**: storage mặc định nằm trong RAM của từng instance. Với N instance, giới hạn thực tế thành N × 3. Cần chuyển sang storage dùng chung qua Redis (ví dụ `@nest-lab/throttler-storage-redis`).
- **Sau reverse proxy**: bật `app.set('trust proxy', <số proxy tin cậy>)` để `req.ip` là IP thật. Không đặt `true`, vì client có thể giả mạo `X-Forwarded-For`.
- **SMS pumping** (bot gửi OTP tới hàng nghìn số khác nhau): thêm một throttler thứ hai đếm theo IP hoặc thiết bị, kèm CAPTCHA và hạn mức chi phí SMS theo ngày.

# Bài 6 – Điền khuyết bộ đếm cửa sổ trượt

**Quy tắc nghiệp vụ:** trong **bất kỳ** khoảng 60 giây liên tiếp nào, mỗi tài khoản chỉ được gọi tối đa **100 lần**.

```
src/
├── limiter/
│   ├── sliding-window.limiter.ts   # ★ lời giải: điền đủ 5 chỗ khuyết
│   ├── fixed-window.limiter.ts     # thuật toán cũ (có lỗi), giữ lại để đối chứng
│   └── rate-limiter.ts             # interface chung
├── rate-limit.guard.ts             # áp limiter cho từng tài khoản (header x-user-id)
├── clock.service.ts                # đồng hồ thật / đồng hồ giả lập để demo
├── app.controller.ts               # GET /api/products
└── main.ts
test/
├── sliding-window.limiter.spec.ts  # 15 test cho thuật toán
└── app.e2e-spec.ts                 # 5 test qua HTTP
```

## 1. Vì sao cửa sổ cố định bị lách

Cửa sổ cố định chia thời gian thành các ô `[0s, 60s)`, `[60s, 120s)`, … và **xoá bộ đếm về 0** mỗi khi sang ô mới.

```
           ô 1: [0s, 60s)            │         ô 2: [60s, 120s)
                          100 req ▲  │  ▲ 100 req
                              giây 59│giây 61
                                     └─ bộ đếm reset về 0 ở đây
```

Kẻ tấn công gửi 100 request ở giây 59 (ô 1 còn trống, nên lọt hết), rồi gửi thêm 100 request ở giây 61 (ô 2 mới, bộ đếm vừa về 0, nên lại lọt hết). Kết quả là **200 request trong 2 giây**, gấp đôi hạn mức, mà không bị chặn lần nào.

## 2. Ý tưởng cửa sổ trượt

Câu hỏi đúng là: *"60 giây vừa qua đã có bao nhiêu request?"*, chứ không phải *"ô hiện tại đã có bao nhiêu request?"*.

Khoảng 60 giây vừa qua luôn gồm hai phần: một phần cuối của ô trước, và phần đã trôi qua của ô hiện tại. Bộ đếm chỉ giữ 2 con số cho mỗi tài khoản (`prev` cho ô trước, `curr` cho ô hiện tại), và ước lượng:

```
ước lượng = curr + prev × (phần thời gian của ô trước còn nằm trong 60 giây vừa qua)
          = curr + prev × (60 − số giây đã trôi qua trong ô hiện tại) / 60
```

Công thức này giả định các request của ô trước rải đều theo thời gian.

## 3. Năm chỗ khuyết ([sliding-window.limiter.ts](src/limiter/sliding-window.limiter.ts))

| # | Việc cần làm | Cách làm | Vì sao |
|---|---|---|---|
| (1) | Xoay vòng khi sang ô mới | Nếu vừa sang **đúng ô kế tiếp**: `prev = curr`. Nếu đã **bỏ trống từ 2 ô trở lên**: `prev = 0`. Sau đó `curr = 0` | Bỏ trống 10 phút nghĩa là ô ngay trước đó không có request nào. Nếu cứ gán `prev = curr` thì số đếm cũ bị cộng dồn và người dùng bị chặn oan |
| (2) | Tính tỉ lệ còn lại của ô trước | `(60s − elapsed) / 60s` | Ví dụ ở giây 15 của ô mới thì 45/60 = 75% ô trước vẫn nằm trong 60 giây vừa qua |
| (3) | Ước lượng tổng | `curr + prev × tỉ lệ` | Công thức ở mục 2 |
| (4) | So sánh với hạn mức | `ước lượng >= 100` thì **chặn** | Dùng `>=` vì request đang xét sẽ là request thứ `ước lượng + 1` |
| (5) | Tăng bộ đếm | `curr += 1`, **chỉ khi cho qua** | Request bị chặn không tiêu hạn mức. Nếu đếm cả request bị chặn, kẻ spam tự kéo dài thời gian bị khoá, nhưng một người dùng lỡ bấm vội cũng bị khoá lâu |

So với khung đề bài, bộ đếm phải lưu thêm trường **`windowStart`**. Không biết `curr` đang đếm cho ô nào thì không làm được bước (1), cũng không biết khoá đã bị bỏ trống bao lâu.

## 4. Chạy kịch bản tấn công bằng tay

| Thời điểm | `prev` | `curr` | Tỉ lệ ô trước | Ước lượng | Kết quả |
|---|---|---|---|---|---|
| Giây 59, request 1 → 100 | 0 | 0 → 99 | – | 0 → 99 | ✅ cho qua cả 100 |
| Giây 61 (sang ô mới), request 1 | 100 | 0 | 59/60 | 98.33 | ✅ |
| Giây 61, request 2 | 100 | 1 | 59/60 | 99.33 | ✅ |
| Giây 61, request 3 → 100 | 100 | 2 | 59/60 | 100.33 | ⛔ chặn 98 request |

Tổng cộng trong 2 giây: **102 request** thay vì 200.

**Vì sao là 102 chứ không phải đúng 100:** công thức giả định 100 request ở ô trước rải đều trong 60 giây. Thực tế chúng dồn hết vào giây 59, nên công thức "quên" mất khoảng 1,67 request. Đây là sai số của phương pháp ước lượng, đổi lại mỗi tài khoản chỉ tốn 2 con số trong bộ nhớ. Nếu nghiệp vụ đòi đúng tuyệt đối, phải dùng **sliding log**: lưu mốc thời gian của từng request, tốn tới 100 phần tử cho mỗi tài khoản.

## 5. Chạy và kiểm thử

```bash
npm install
npm test                       # 20 test
npm run start:dev              # server tại http://localhost:3000, dùng đồng hồ thật
```

Biến môi trường dùng để demo:

| Biến | Tác dụng |
|---|---|
| `ALLOW_FAKE_CLOCK=true` | Cho phép header `x-fake-now: <số giây>` giả lập thời điểm request, để tái hiện giây 59 / 61 mà không phải canh đồng hồ. **Không bật trên production**, vì client sẽ tự chọn được thời gian để lách hạn mức |
| `LIMITER=fixed` | Chạy thuật toán cũ (cửa sổ cố định) để tái hiện lỗi |

Tiêu chí chấm điểm và test tương ứng trong [test/sliding-window.limiter.spec.ts](test/sliding-window.limiter.spec.ts):

| Tiêu chí | Test |
|---|---|
| Tấn công biên bị chặn | `Cua so truot: 100 request o giay 59 qua het, dot thu hai o giay 61 bi chan 98/100`. Đối chứng: cửa sổ cố định cho lọt cả 200 |
| 90 request/phút đều đặn không bị chặn oan | `Deu dan 90 request/phut lien tuc 10 phut -> khong request nao bi chan` (thêm các biến thể lệch pha và 99/phút) |
| Khoá mới không ném lỗi | `Khoa chua tung xuat hien -> xu ly binh thuong, khong nem loi` |
| Khoá đã 10 phút không dùng | `Khoa xuat hien lan cuoi cach day 10 phut -> so dem cu het han, duoc goi lai du 100 lan` |

Bộ test đã được kiểm chứng bằng cách cố ý viết sai từng chỗ khuyết (1), (3), (4), (5). Mỗi lần như vậy đều có từ 2 đến 13 test thất bại.

## 6. Hướng gia cố thêm (ngoài phạm vi bài)

- **Dọn bộ nhớ:** `Map` giữ khoá mãi mãi. Nên định kỳ xoá các khoá có `windowStart` cũ hơn 2 cửa sổ, vì những khoá đó chắc chắn có `prev = curr = 0`.
- **Chạy nhiều instance:** chuyển bộ đếm sang Redis. Gộp các bước đọc, xoay vòng và tăng bộ đếm thành một thao tác nguyên tử, ví dụ bằng một Lua script.

# AI Ecotourism Assistant

Chatbot du lịch Núi Bà Đen với frontend React/Vite, backend FastAPI, dữ liệu Supabase/Excel và RAG bằng ChromaDB.

## Bật tìm kiếm web

Chatbot ưu tiên dữ liệu nội bộ và nguồn chính thức Sun World. Với mọi câu hỏi tư
vấn có nội dung, chatbot tự tìm thêm trên web, tổng hợp câu trả lời và dẫn nguồn;
người dùng không cần yêu cầu tìm kiếm. Các lượt xã giao ngắn như chào hỏi hoặc cảm
ơn được bỏ qua để giảm độ trễ. Để bật chế độ này, thêm khóa Tavily vào
`backend/.env`:

```env
WEB_SEARCH_ENABLED=true
WEB_SEARCH_PROVIDER=tavily
WEB_SEARCH_API_KEY=tvly-...
```

Khởi động lại backend rồi kiểm tra `GET /api/status`. Khi
`web_search.configured` là `true`, câu trả lời dùng dữ liệu web sẽ có ký hiệu
`[1]`, `[2]` và các đường dẫn tương ứng trong phần **Nguồn tham khảo**.

### Kho kiến thức web

Khi `DATABASE_URL` được cấu hình, các nguồn chatbot tìm thấy được tự động lưu vào
bảng `web_knowledge` trong PostgreSQL. Những câu hỏi sau sẽ dùng đồng thời nguồn
mới tìm, nguồn liên quan đã lưu và dữ liệu RAG nội bộ. Nguồn mới luôn được ưu tiên
cho thông tin dễ thay đổi.

Mặc định hệ thống giữ nguồn đã lưu trong phạm vi truy xuất 90 ngày và lấy tối đa
4 nguồn cũ cho mỗi câu hỏi. Có thể điều chỉnh bằng:

```env
WEB_KNOWLEDGE_RETENTION_DAYS=90
WEB_KNOWLEDGE_MAX_CONTEXTS=4
```

`GET /api/status` trả về `web_knowledge.documents` để theo dõi số nguồn đã lưu.


## Deploy lên Vercel (không cần backend riêng)

Thư mục `frontend/` tự chứa mọi thứ: giao diện React và các API dưới `frontend/api/`
(Vercel Serverless Functions, Node). API trả lời bằng engine luật `frontend/lib/engine.js` trên dữ liệu
`frontend/lib/data.json` xuất từ file Excel, nên không cần Python, database hay API key.

1. Đẩy code lên GitHub.
2. Vào vercel.com → **Add New Project** → Import repo.
3. **Root Directory** chọn `frontend` (Framework Preset: Vite, tự nhận). Không cần biến môi trường.
4. **Deploy**. Link dạng `https://<tên-dự-án>.vercel.app`. Mã QR mẫu trên màn hình đầu trỏ tới
   `https://ai-ecotourism-assistant.vercel.app`; nếu tên dự án khác, đặt biến `VITE_PUBLIC_APP_URL`.

Mỗi lần `git push` Vercel tự deploy lại.

### Khi sửa file Excel
```bash
cd frontend
XLSX="/đường/dẫn/Database NBĐ_v2_2026-10-31.xlsx" npm run data   # cần python3 + openpyxl
git add lib/data.json && git commit -m "data: cập nhật từ Excel" && git push
```

### Chạy local không cần Python
```bash
cd frontend
npm install
npm run dev:api   # API Node ở cổng 8003
npm run dev       # giao diện ở http://localhost:5173, tự proxy /api sang 8003
```
Backend Python (RAG + LLM + tìm web) vẫn còn trong `backend/` cho ai muốn bật LLM; Vercel không dùng tới.

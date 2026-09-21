# BÁO CÁO BÀI TẬP CÁ NHÂN

## DEVOPS CHO ỨNG DỤNG WEB NODE.JS

**Họ và tên:** ........................................................  
**Mã số học viên:** ....................................................  
**Lớp:** ...............................................................  
**Giảng viên:** ........................................................  
**Thời gian thực hiện:** ...............................................  

---

## 1. Mục tiêu và phạm vi bài làm

### 1.1. Mục tiêu

Bài tập xây dựng một quy trình DevOps hoàn chỉnh cho một ứng dụng web Node.js đơn giản. Quy trình bao gồm phát triển ứng dụng, quản lý mã nguồn, kiểm thử tự động, đóng gói bằng Docker, triển khai lên cloud và bổ sung các cơ chế monitoring, security scan và rollback.

Mục tiêu cụ thể:

- Xây dựng REST API quản lý Todo bằng Express.js.
- Kết nối và lưu dữ liệu bằng SQLite.
- Đóng gói ứng dụng thành Docker image nhỏ gọn.
- Chạy ứng dụng và các dịch vụ phụ trợ bằng Docker Compose.
- Thiết lập CI với GitHub Actions.
- Thiết lập CD để build image, push lên GitHub Container Registry và deploy Render.
- Quản lý biến môi trường và secrets an toàn.
- Bổ sung health check, logging, Prometheus metrics, Grafana, security scan và rollback workflow.

### 1.2. Phạm vi

Ứng dụng trong bài là Todo REST API, không có giao diện người dùng. Người dùng tương tác với hệ thống thông qua HTTP API. Các chức năng chính gồm tạo, xem, sửa và xóa Todo.

Database sử dụng SQLite thông qua thư viện `sql.js`. Lựa chọn này giúp ứng dụng chạy được trên Windows, Docker và môi trường CI mà không cần trình biên dịch native C++.

Môi trường production được triển khai trên Render. Nhánh `main` dùng cho production, nhánh `develop` được chuẩn bị cho staging.

---

## 2. Kiến trúc hệ thống

### 2.1. Kiến trúc tổng quan

```mermaid
flowchart LR
    Dev[Developer] --> GitHub[GitHub Repository]
    GitHub --> CI[GitHub Actions CI]
    CI --> Lint[ESLint]
    CI --> Test[Jest Unit Test]
    CI --> Security[npm audit + Trivy]
    CI --> CD[GitHub Actions CD]
    CD --> GHCR[GitHub Container Registry]
    CD --> Render[Render Cloud]
    Render --> API[Express Todo API]
    API --> DB[(SQLite)]
    API --> Health[/health]
    API --> Metrics[/metrics]
    Metrics --> Prometheus[Prometheus]
    Prometheus --> Grafana[Grafana]
```

### 2.2. Các thành phần

**Developer:** viết code, chạy kiểm thử local và push code lên GitHub.

**GitHub Repository:** lưu source code, Dockerfile, Docker Compose, tài liệu và workflow GitHub Actions.

**Express API:** cung cấp các endpoint CRUD cho Todo và endpoint health check/metrics.

**SQLite:** lưu danh sách Todo trong file database. Khi chạy Docker, file database nằm trong named volume `todo-data`.

**Docker:** đóng gói ứng dụng cùng runtime Node.js 20 Alpine. Container chạy bằng user `node`, không chạy root.

**GitHub Actions:** CI cài dependencies, chạy audit, lint, test và Trivy. CD được thiết kế để build/push image và kích hoạt Render deploy sau khi CI thành công.

**Render:** cung cấp môi trường cloud production với health check `/health`.

**Prometheus và Grafana:** Prometheus lấy dữ liệu từ endpoint `/metrics`; Grafana được provision datasource Prometheus tự động trong Docker Compose.

### 2.3. Luồng CI/CD

1. Developer push code hoặc tạo Pull Request.
2. Workflow CI được kích hoạt.
3. GitHub Actions chạy `npm ci`.
4. Chạy `npm audit --audit-level=high`.
5. Chạy ESLint.
6. Chạy Jest với coverage.
7. Chạy Trivy filesystem scan.
8. Khi CI thành công trên `main`, CD build Docker image.
9. Image được push lên GitHub Container Registry.
10. CD gọi Render Deploy Hook nếu secret đã được cấu hình.

---

## 3. Xây dựng ứng dụng Node.js

### 3.1. Công nghệ sử dụng

- Node.js 20
- Express.js 4
- SQLite thông qua `sql.js`
- Morgan để ghi log HTTP request
- Jest và Supertest để kiểm thử
- ESLint để kiểm tra chất lượng code
- Prom-client để xuất Prometheus metrics

### 3.2. Các endpoint

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra trạng thái ứng dụng |
| GET | `/api/todos` | Lấy toàn bộ Todo |
| GET | `/api/todos/:id` | Lấy một Todo theo ID |
| POST | `/api/todos` | Tạo Todo mới |
| PUT | `/api/todos/:id` | Cập nhật Todo |
| DELETE | `/api/todos/:id` | Xóa Todo |
| GET | `/metrics` | Xuất metrics cho Prometheus |

Ví dụ tạo Todo:

```json
{
  "title": "Learn CI/CD"
}
```

API trả mã HTTP phù hợp: `201` khi tạo mới, `200` khi đọc/cập nhật thành công, `204` khi xóa thành công, `400` khi dữ liệu không hợp lệ và `404` khi không tìm thấy Todo.

### 3.3. Kiểm thử

Bộ test hiện có các trường hợp:

- Health check trả trạng thái `ok`.
- Endpoint metrics hoạt động.
- Hoàn thành luồng CRUD: create, update, list và delete.
- Từ chối Todo có title rỗng.

Kết quả kiểm thử local cuối cùng: **4 test passed, 0 failed**.

---

## 4. Dockerize ứng dụng

### 4.1. Dockerfile

Dockerfile sử dụng multi-stage build với `node:20-alpine`.

Stage dependencies chỉ cài production dependencies bằng:

```bash
npm ci --omit=dev
```

Stage runtime chỉ copy `node_modules`, `package.json` và thư mục `src`. Cách này giúp image không chứa test, coverage và dev dependencies không cần thiết.

Các biện pháp tối ưu và bảo mật:

- Dùng Alpine image.
- Dùng `npm ci` để cài chính xác theo lockfile.
- Chạy app bằng user `node` thay vì root.
- Có Docker `HEALTHCHECK` gọi `/health`.
- Chỉ expose port `3000`.
- Dùng `.dockerignore` để loại `node_modules`, `.git`, `.env` và coverage.

### 4.2. Docker Compose

Docker Compose chạy các service:

- `app`: Todo API tại port `3000`.
- `prometheus`: monitoring server tại port `9090`.
- `grafana`: dashboard tại port `3001`.

SQLite được lưu trong named volume `todo-data`. Prometheus và Grafana cũng có volume riêng để giữ dữ liệu khi container restart.

Lệnh chạy:

```bash
docker compose up --build
```

Kiểm tra API:

```text
http://localhost:3000/health
```

Grafana:

```text
http://localhost:3001
```

Prometheus:

```text
http://localhost:9090
```

---

## 5. CI/CD và quản lý secrets

### 5.1. CI pipeline

File `.github/workflows/ci.yml` được cấu hình chạy khi có push hoặc Pull Request. Các bước gồm:

1. Checkout source code.
2. Setup Node.js 20.
3. Cài dependency bằng `npm ci`.
4. Chạy `npm audit`.
5. Chạy ESLint.
6. Chạy Jest và coverage.
7. Chạy Trivy security scan.

Nếu bất kỳ bước nào trả mã lỗi khác `0`, job dừng và workflow chuyển sang trạng thái failed.

Các lệnh tương đương khi chạy local:

```bash
npm ci
npm run lint
npm test
npm audit --audit-level=high
```

### 5.2. CD pipeline

File `.github/workflows/cd.yml` sử dụng `workflow_run` để chờ CI hoàn thành. Job deploy chỉ chạy khi kết quả CI là `success` và workflow thuộc nhánh `main`.

CD thực hiện:

- Login vào GitHub Container Registry bằng `GITHUB_TOKEN`.
- Build Docker image.
- Push image với tag `latest`.
- Gọi Render Deploy Hook nếu secret `RENDER_DEPLOY_HOOK` tồn tại.

Workflow rollback thủ công nằm ở `.github/workflows/rollback.yml`. Workflow nhận deploy ID và sử dụng `RENDER_API_KEY`, `RENDER_SERVICE_ID` được lưu trong GitHub Secrets.

### 5.3. Secrets management

Repository không commit `.env`, password, API key hoặc Deploy Hook. File `.env.example` chỉ chứa tên biến và giá trị mẫu không nhạy cảm.

Các secrets cần cấu hình trong GitHub:

- `RENDER_DEPLOY_HOOK`
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

`GITHUB_TOKEN` do GitHub tự cấp cho workflow để push lên GHCR.

Trong Render, các biến môi trường production được cấu hình bằng `render.yaml`. Database production demo dùng `DB_FILE=/tmp/todos.db`.

### 5.4. Trạng thái kiểm thử CI/CD

Ứng dụng đã được kiểm chứng local bằng lint, Jest, npm audit và Docker. Render production đã deploy thành công và endpoint `/health` trả `200 OK`.

Tại thời điểm viết báo cáo, GitHub Actions không thể thực thi do tài khoản GitHub bị khóa bởi vấn đề billing. Đây là giới hạn tài khoản, không phải lỗi source code. Khi tài khoản được mở lại, có thể bấm Re-run jobs để xác nhận pipeline trên GitHub.

**Ảnh cần chèn vào báo cáo:**

- Ảnh cấu trúc repository.
- Ảnh `npm test` pass.
- Ảnh Docker build và container running.
- Ảnh Render deploy trạng thái Live.
- Ảnh endpoint `/health` trả JSON.
- Ảnh GitHub Actions CI/CD (nếu tài khoản được mở lại).
- Ảnh Grafana/Prometheus (nếu chạy được Docker monitoring stack).

---

## 6. Khó khăn và cách giải quyết

### 6.1. Native SQLite không cài được trên Windows

Ban đầu dự án sử dụng `better-sqlite3`. Package này cần native binary hoặc Visual C++ build tool. Môi trường hiện tại dùng Node.js 24 và không có toolset phù hợp nên `npm install` thất bại.

Giải pháp là chuyển sang `sql.js`, một thư viện SQLite chạy bằng WebAssembly. Cách này không cần compile native và vẫn sử dụng database SQLite.

### 6.2. Docker Desktop chưa sẵn sàng

Lần chạy Docker đầu tiên thất bại vì Docker Desktop engine chưa khởi động. Sau khi khởi động Docker Desktop, app đã build và chạy thành công.

Khi bổ sung Prometheus/Grafana, Docker gặp lỗi tạm thời `unexpected EOF` khi tải image Prometheus. Compose configuration vẫn hợp lệ; lỗi thuộc quá trình tải image/daemon Docker.

### 6.3. GitHub Actions bị khóa billing

GitHub Actions không khởi động job vì tài khoản bị khóa do billing. Source workflow vẫn được cấu hình đầy đủ, còn lint/test/security scan đã kiểm thử local.

Giải pháp là xử lý billing hoặc liên hệ GitHub Support, sau đó chạy lại workflow. Không đưa secret vào source code để bypass vấn đề này.

### 6.4. Xung đột Git history

Repository GitHub có một commit ban đầu riêng, trong khi local project cũng được khởi tạo với history riêng. Hai history được merge bằng `--allow-unrelated-histories`, giữ lại README đầy đủ của project và push thành công.

---

## 7. Lessons learned

- DevOps nên được triển khai ngay từ đầu thay vì chờ đến cuối dự án.
- Lockfile giúp môi trường local và CI cài dependency nhất quán.
- Multi-stage Docker build giúp giảm nội dung không cần thiết trong production image.
- Health check rất hữu ích cho Docker và nền tảng cloud.
- Secrets không nên lưu trong source code, README hoặc ảnh chụp màn hình.
- Test tự động giúp phát hiện lỗi trước khi deploy.
- CI và CD cần tách biệt rõ ràng: CI kiểm tra chất lượng, CD triển khai artifact đã được kiểm tra.
- Dịch vụ cloud free tier có thể sleep hoặc mất dữ liệu tạm thời; SQLite `/tmp` phù hợp demo nhưng không phù hợp production lâu dài.
- Monitoring giúp quan sát trạng thái ứng dụng thay vì chỉ dựa vào log lỗi.
- Khi pipeline bị chặn bởi tài khoản hoặc billing, cần phân biệt rõ lỗi môi trường với lỗi code.

---

## 8. Hướng phát triển tiếp theo

- Chuyển SQLite sang PostgreSQL managed database để dữ liệu bền vững.
- Tạo dashboard Grafana có biểu đồ request rate, latency và error rate.
- Thêm authentication và authorization cho API.
- Thêm rate limiting, helmet và schema validation.
- Tách staging và production bằng database riêng.
- Thêm Docker image signing và SBOM.
- Thiết lập branch protection, bắt buộc Pull Request và CI pass trước khi merge.
- Bổ sung integration test và kiểm thử tải.
- Thiết lập rollback tự động khi health check sau deploy thất bại.
- Dùng log aggregation như Loki hoặc một dịch vụ logging tập trung.

---

## 9. Links và thông tin nộp bài

- **GitHub repository:** https://github.com/anday06/Intro-to-DevOps
- **Production app:** https://intro-to-devops.onrender.com
- **Health check:** https://intro-to-devops.onrender.com/health
- **Todo API:** https://intro-to-devops.onrender.com/api/todos
- **Video demo:** ........................................................

**Họ tên người thực hiện:** .............................................  
**Mã số học viên:** ......................................................  
**Lớp:** .................................................................

---

## Phụ lục: Kịch bản video demo

1. Mở repository GitHub và giới thiệu cấu trúc project.
2. Mở `src/app.js` và giới thiệu các endpoint CRUD.
3. Chạy `npm run lint` và `npm test`.
4. Chạy `docker compose up --build`.
5. Mở `http://localhost:3000/health`.
6. Gọi thử `POST /api/todos` và `GET /api/todos`.
7. Mở Render và giới thiệu service đang ở trạng thái Live.
8. Mở URL production `/health`.
9. Giới thiệu Dockerfile, CI workflow, CD workflow và `.env.example`.
10. Kết luận về kết quả, khó khăn billing GitHub và hướng phát triển.

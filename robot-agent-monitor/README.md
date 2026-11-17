# Robot Agent Monitor Frontend

Next.js 16.4, React 19, TypeScript, Three.js và urdf-loader. Giao diện theo ba file Claude Design trong `../design_figma`: Overview, Robots, Joints. Font IBM Plex đóng gói local.

## Chạy

Dùng Node.js 20.19+ hoặc 22.13+.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Mở http://localhost:3000. Sửa `appsettings.json` để đặt địa chỉ Rust cho proxy Next.js, đường dẫn API browser, origin dùng khi dev và giới hạn upload URDF. Biến môi trường cùng tên ghi đè `BACKEND_URL`, `NEXT_PUBLIC_API_BASE_URL` và `NEXT_PUBLIC_URDF_MAX_BYTES`. Giới hạn upload cần khớp với backend.

Production dùng `npm run build` rồi `npm start`. Build lại khi đổi cấu hình proxy hoặc các giá trị browser. Launcher dùng `FRONTEND_HOST` và `FRONTEND_PORT` trong JSON, có thể ghi đè bằng biến môi trường.

Deploy lên Jetson (backend lẫn frontend) hiện làm theo `deploy/jetson-home/README.md` trong repo backend Rust; launcher frontend là `start-frontend.sh` ở đó.

## Chức năng

- Shell: navigation, configuration selector lưu localStorage, trạng thái kết nối, retry/toast.
- Overview: readiness, viewer URDF, trạng thái interface/sensor, diagnostics, recent episodes.
- Robots: profile CRUD; wizard 5 bước import files/folder/ZIP; chọn main URDF, validate XML/link/joint; lưu configuration và assets; rename/reload/delete với xác nhận và chặn episode reference.
- Viewer: model URDF thật, mesh theo khả năng loader, package:// qua asset manifest; orbit/pan/zoom/reset/fullscreen; visual/collision/frames/grid; chọn joint; đồng bộ JointState; báo lỗi asset.
- Joints: live position/velocity/effort/limits, search/filter group, stale/missing; position chart 120 samples với pause/resume; interface CRUD; group CRUD, member CRUD/reorder và thứ tự group.
- Sensors: sensor/stream CRUD, trạng thái nhận dữ liệu cho type đã hỗ trợ. Chưa có image/depth/IMU widgets hay WebRTC player.
- Teleoperation: bounded joint targets qua default JointState publisher đã active, clamp theo URDF, disable khi offline/stale/interface không hỗ trợ.
- Data: list/filter/review result và operator note của episode hiện có. MCAP recording/replay chưa có runtime API; UI không giả lập recording.

Backend hiện chưa cung cấp action goal hoặc pose playback. Chat VLA hỗ trợ Stop để dừng chuỗi lệnh đang chạy.

## Robot Chat

Trang `/chat` lấy checkpoint từ `GET /api/vla/models`, gửi `{profileId, task}` tới
`POST /api/vla/commands` và hiển thị số bước đã publish. Nút gửi bị khóa khi ROS
offline hoặc đang chạy lệnh. Stop gọi `POST /api/vla/stop` và hiển thị trạng thái
Stopping cho tới khi lệnh kết thúc. Lỗi backend `{message}` được hiển thị trong chat.

Backend phải cấu hình profile và inference server riêng, theo tài liệu
`deploy/yellowarm-sim/VLA.md` trong repo Rust. Backend mặc định giới hạn toàn lệnh
600000 ms; `BACKEND_PROXY_TIMEOUT_MS` trong `appsettings.json` là 750000 ms và cũng
đặt deadline request phía browser. Giữ timeout proxy/browser lớn hơn deadline
backend và build lại frontend sau khi đổi cấu hình.

## Realtime

WebSocket `/api/ros/ws` carries status and ROS messages without per-request authentication. Reconnect after 3 seconds; samples become stale after 3 seconds. Health poll: 5 seconds; metadata refresh: 15 seconds.

Write operations and WebSocket connections check Origin against the backend configuration.

Monitor hiện hỗ trợ DiagnosticArray/DiagnosticStatus, JointState, Odometry, TFMessage. Sensor type khác mới lưu cấu hình, chưa có runtime decoder. ROS thật cần backend feature ros2 và môi trường ROS theo README Rust.

## Backend bổ sung

Giữ nguyên các route CRUD cũ:

- GET /api/health: database health (200 hoặc 503).
- GET /api/v1/{resource}/list?limit=200&offset=0: mảng records, tối đa 500/trang. Client tải tiếp và lọc theo configuration.
- GET /api/v1/robot-configurations/{id}/manifest: file paths tương đối.
- GET /api/v1/robot-configurations/{id}/assets/{path}: file trong package; kiểm tra canonical root/path và extension.
- Multipart create configuration nhận thêm nhiều AssetFiles có filename tương đối; AttachFiles vẫn là main URDF. Tổng byte theo URDF_MAX_BYTES, tối đa 500 file. Configuration import rollback khi lỗi. Nếu wizard vừa tạo profile, profile có thể còn lại để retry.

Không đổi thiết kế bảng; không lưu ROS samples vào SQLite.

## Kiểm thử

```powershell
npm run lint
npm run build
npx playwright install chromium
# Build backend trước: cargo build -p robot-agent --locked
# Từ frontend, dùng Python có sẵn trong workspace:
python tests/run_e2e.py
```

Runner chỉ cần Python standard library. Dùng SQLite tạm, backend 127.0.0.1:18080 và frontend 3100 (hai port phải trống); tự dừng process do nó tạo. Không mở DB triển khai. Schema runner là fixture theo entities, không phải migration production.

9 bài Playwright: CRUD/URDF thật; pagination/file isolation/episode reference; WebSocket live/stale/offline; publish payload/clamp; ZIP/package mesh; chat trả số bước; Stop; khóa gửi khi ROS offline; hiển thị lỗi 503 từ backend thật. Các bài chat thành công và Stop mock VLA/ROS status tường minh; bài lỗi dùng backend Rust thật với ROS tắt. Chưa chứng minh ROS transport thật. Screenshot/trace ở test-results; server logs và kết quả ở .e2e-logs.

Audit production không còn vulnerability tại thời điểm kiểm tra. Audit tổng còn 8 moderate thuộc minimatch/toolchain ESLint; không áp dụng đề xuất hạ major ESLint của audit.

# RobotAgentMonitor — Frontend Modules

Next.js + three.js. Chạy trên UI do agent tự serve. Mọi dữ liệu đi qua agent C#, không nói trực tiếp với ROS.

---

## Module

| # | Module | Route | Phụ thuộc |
|---|---|---|---|
| 1 | Robot | `/robots`, `/robots/new` | — |
| 2 | Viewer | `/` | robot active |
| 3 | Topics | `/topics` | robot active |
| 4 | Control | `/control` | robot active |
| 5 | Status | `/status` | — |

```text
Robot (chọn robot active)
  ├─→ Viewer    URDF + /joint_states
  ├─→ Topics    danh sách topic của robot đó
  └─→ Control   joint list từ URDF + pose đã lưu
Status          độc lập, luôn hiện
```

Chưa chọn robot thì Viewer, Topics, Control không có dữ liệu.

---

## 1. Robot

### `/robots` — danh sách

Hiển thị: tên, đường dẫn URDF, số joint, cờ active, ngày thêm.

Hành động: chọn active, sửa tên, xoá, thêm mới, chạy detect.

Detect: agent so URDF đang chạy trên ROS với robot đã lưu. Khớp thì set active. Không khớp thì hiện danh sách cho chọn tay.

### `/robots/new` — wizard thêm robot

| Bước | Nội dung |
|---|---|
| 1 | Chọn nguồn URDF: đọc từ `/robot_description`, upload file, hoặc trỏ đường dẫn có sẵn |
| 2 | Agent parse URDF, trả về tên robot, base frame, danh sách joint, danh sách link. Parse lỗi thì dừng và báo lỗi |
| 3 | Khai báo đường dẫn mesh cho từng ROS package xuất hiện trong URDF |
| 4 | Nhập topic sensor. Agent gợi ý từ ROS graph đang chạy, người dùng xác nhận hoặc gõ tay |
| 5 | Lưu |

Bước 3 bắt buộc: URDF trỏ mesh bằng `package://`, browser không resolve được.

Bước 4 thủ công: URDF trên robot thật không chứa tên topic của sensor.

---

## 2. Viewer

### `/` — màn hình chính

Bố cục: khung 3D bên trái, panel topic bên phải.

Khung 3D:

- Dựng scene từ URDF của robot active
- Nhận joint state qua WebSocket, cập nhật góc khớp theo thời gian thực
- Xoay, zoom, pan
- Bật/tắt: mesh, wireframe, trục frame, cây TF, lưới sàn
- Chọn góc nhìn dựng sẵn

Panel topic: hiển thị các topic đã bật ở module Topics, xếp theo `sort_order`.

Render loop tách khỏi luồng nhận message: message ghi vào biến, `requestAnimationFrame` đọc giá trị mới nhất.

---

## 3. Topics

### `/topics` — cấu hình

Hai danh sách:

- Topic đang có trên ROS graph (đọc live từ agent), kèm message type
- Topic đã cấu hình cho robot này

Mỗi topic đã cấu hình đặt được: nhãn hiển thị, kiểu render, throttle, thứ tự, bật/tắt.

Kiểu render theo message type:

| Message type | Kiểu render |
|---|---|
| `sensor_msgs/Image` | ảnh |
| `sensor_msgs/Image` (depth) | ảnh phủ màu theo độ sâu |
| `sensor_msgs/PointCloud2` | point cloud trong scene 3D |
| mảng số (tactile) | heatmap |
| số vô hướng | đồ thị theo thời gian |
| còn lại | text |

Point cloud có thêm: voxel size, số điểm tối đa, khoảng cách min/max.

Throttle cần cho topic tần số cao — tactile và `/joint_states` publish nhanh hơn browser cần.

---

## 4. Control

### `/control` — điều khiển tay

Slider joint:

- Một slider cho mỗi joint không phải `fixed`, đọc từ URDF
- Giới hạn slider lấy từ joint limit trong URDF
- Hiển thị đồng thời giá trị lệnh và giá trị thực đo được
- Gộp nhóm theo ngón, mỗi nhóm có một slider tổng

Pose:

- Danh sách pose đã lưu của robot active
- Áp dụng pose, lưu pose từ trạng thái hiện tại, đổi tên, xoá

Nút lệnh: gửi, về vị trí gốc, dừng khẩn cấp.

Dừng khẩn cấp hiện ở mọi trang, không riêng trang này.

---

## 5. Status

### `/status`

- Trạng thái kết nối tới agent
- Trạng thái kết nối agent ↔ ROS
- Danh sách topic đang subscribe kèm tần số thực tế nhận được
- Log lệnh đã gửi và kết quả
- Log lỗi

---

## Thành phần dùng chung

| Thành phần | Nhiệm vụ |
|---|---|
| API client | REST tới agent cho CRUD robot, topic, pose |
| WebSocket client | nhận joint state và dữ liệu topic, tự kết nối lại |
| URDF scene | khởi tạo three.js, load URDF, expose `setJointValue` |
| Robot context | robot active, joint list đã parse, chia sẻ cho Viewer/Topics/Control |
| Layout | thanh điều hướng, chỉ báo kết nối, nút dừng khẩn cấp |

---

## Thứ tự làm

1. Robot — chưa có robot thì không test được gì
2. Viewer — xác nhận URDF và joint state chạy đúng
3. Control — kiểm tra chiều lệnh đi xuống
4. Topics — thêm sensor
5. Status — sau cùng

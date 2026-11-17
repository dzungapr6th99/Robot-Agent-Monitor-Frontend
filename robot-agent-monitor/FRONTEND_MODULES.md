# RobotAgentMonitor — Frontend Modules

## 1. Mục tiêu frontend

Frontend là giao diện local để người dùng:

- import và chọn robot configuration;
- quan sát robot 3D và trạng thái joint;
- cấu hình ROS topic/action dùng cho joint;
- cấu hình và xem dữ liệu sensor;
- teleoperate robot thông qua backend;
- record, xem lại và đánh dấu episode;
- chuẩn bị dataset và training ở giai đoạn sau.

Frontend không quản lý ROS node parameters, domain ID, namespace, QoS hoặc cách kết nối ROS. Những phần đó thuộc C++ wrapper và cấu hình deploy.

Người dùng không nhập JSON. Mọi cấu hình được nhập bằng form có field cụ thể.

---

## 2. Điều hướng chính

```text
RobotAgentMonitor
|-- Overview
|-- Robots
|-- Joints
|-- Sensors
|-- Teleoperation
|-- Data
|-- Training
`-- Application Settings
```

Route đề xuất:

| Route | Module |
|---|---|
| `/` | Overview |
| `/robots` | Robot Management |
| `/joints` | Joint Monitor & Configuration |
| `/sensors` | Sensor Monitor & Configuration |
| `/teleoperation` | Teleoperation |
| `/data` | Data Collection & Replay |
| `/training` | Dataset, Training & Models |
| `/settings` | Application Settings |

Sidebar luôn hiển thị robot configuration đang được chọn. Lựa chọn hiện tại có thể lưu bằng browser local storage; không cần lưu trạng thái `selected` trong database.

---

## 3. App Shell và trạng thái chung

### Thành phần dùng chung

- Sidebar điều hướng.
- Robot configuration selector.
- Backend connection indicator.
- ROS runtime indicator do backend trả về.
- Recording indicator.
- Global notification/toast.
- Confirmation dialog cho thao tác gửi lệnh quan trọng.
- Emergency stop control nếu C++ wrapper cung cấp endpoint tương ứng.

### Trạng thái kết nối tối thiểu

```text
Backend: connected | disconnected
ROS:     available | unavailable
Robot:   state_received | no_state
Command: available | unavailable | type_mismatch
Record:  idle | recording | stopping | failed
```

Frontend chỉ hiển thị trạng thái do backend tổng hợp. Frontend không trực tiếp tạo ROS node hoặc kết nối ROS.

---

## 4. Overview

Màn hình tổng quan giúp người dùng biết hệ thống đã sẵn sàng hay chưa.

### Nội dung

- Robot profile và configuration đang chọn.
- URDF load status.
- Thời điểm nhận joint state gần nhất.
- Số joint đang có dữ liệu.
- Số sensor available/total.
- Command interface đang được chọn.
- Episode đang record, nếu có.
- Các lỗi gần nhất từ backend/C++ wrapper.

### Quick actions

- Import robot.
- Open Joint Monitor.
- Open Sensor Monitor.
- Start Teleoperation.
- Start Recording.

Overview không phải điều kiện bắt buộc để hoàn thành MVP. Có thể triển khai sau các màn hình chức năng chính.

---

## 5. Robot Management

### 5.1 Robot Profiles

Hiển thị danh sách robot do người dùng đã import, ví dụ:

```text
Unitree G1
Unitree H1
```

Thao tác:

- tạo profile;
- đổi tên profile;
- sửa mô tả;
- xóa profile khi không bị episode tham chiếu;
- mở danh sách configurations.

Không có thư viện robot built-in trong MVP.

### 5.2 Robot Configurations

Một configuration đại diện cho một bộ URDF hoàn chỉnh:

```text
Unitree G1
|-- Stock
|-- Head RGB-D Camera
`-- Wrist RGB-D Camera
```

Thao tác:

- upload gói URDF hoàn chỉnh cùng mesh/STL;
- đặt tên configuration;
- chọn file URDF chính nếu gói có nhiều file `.urdf`;
- xem đường dẫn URDF đã lưu;
- load configuration;
- xóa configuration khi chưa bị episode tham chiếu.

### 5.3 URDF Viewer

- Hiển thị robot 3D.
- Orbit, pan, zoom và reset camera.
- Bật/tắt visual, collision và frame axes nếu viewer hỗ trợ.
- Chọn link/joint trực tiếp trên model.
- Đồng bộ pose 3D với joint state live.
- Hiển thị lỗi load URDF hoặc lỗi mesh rõ ràng.

Frontend không chỉnh sửa nội dung URDF trong MVP.

---

## 6. Joint Monitor & Configuration

Module này có hai phần: cấu hình ROS interface và quan sát joint runtime.

### 6.1 Joint Interface Configuration

Người dùng được chọn từ danh sách backend/C++ phát hiện hoặc nhập thủ công.

Form joint interface:

| Field | Ý nghĩa |
|---|---|
| Name | Tên hiển thị |
| Operation | `subscribe`, `publish` hoặc `action_client` |
| ROS endpoint | Topic/action name |
| Data type | ROS message/action type |
| Enabled | Có sử dụng không |
| Default command | Command interface mặc định |

Ví dụ state interface:

```text
Name:         Joint States
Operation:    subscribe
ROS endpoint: /joint_states
Data type:    sensor_msgs/msg/JointState
```

Ví dụ command interface:

```text
Name:         Joint Trajectory Controller
Operation:    action_client
ROS endpoint: /joint_trajectory_controller/follow_joint_trajectory
Data type:    control_msgs/action/FollowJointTrajectory
```

Ý nghĩa operation:

| Operation | Hành vi C++ |
|---|---|
| `subscribe` | Đọc joint state từ topic |
| `publish` | Gửi command lên topic |
| `action_client` | Gửi goal và nhận feedback/result từ action |

Frontend hiển thị kết quả runtime validation:

```text
available
unavailable
type_mismatch
no_state_received
```

### 6.2 Joint List

Danh sách joint được parse từ URDF và kết hợp với dữ liệu live:

- joint name;
- joint type;
- position;
- velocity;
- effort;
- lower/upper limit từ URDF;
- last update time;
- trạng thái stale/missing.

### 6.3 Joint Groups

Người dùng có thể tạo group:

```text
left_arm
right_arm
left_leg
right_leg
waist
head
```

Thao tác:

- tạo/đổi tên/xóa group;
- thêm joint vào group;
- sắp xếp joint;
- lọc Joint Monitor theo group;
- dùng group trong teleoperation.

Joint group không thuộc một joint interface cố định. Khi người dùng điều khiển một group, frontend/backend lấy danh sách thành viên của group và gửi command qua interface đang được chọn. C++ wrapper chịu trách nhiệm đóng gói danh sách joint vào đúng ROS data type.

### 6.4 Joint Charts

- Plot position theo thời gian.
- Tùy chọn plot velocity và effort.
- Chọn một hoặc nhiều joint.
- Pause/resume biểu đồ phía frontend.
- Cảnh báo khi state quá cũ.

Dữ liệu chart nằm trong memory buffer của frontend/backend, không ghi từng sample vào SQLite.

---

## 7. Sensor Monitor & Configuration

### 7.1 Sensor List

Các loại sensor ban đầu:

```text
camera_rgb
camera_depth
camera_rgbd
point_cloud
imu
tactile
force_torque
temperature
other
```

Form sensor:

| Field | Ý nghĩa |
|---|---|
| Code | Định danh trong robot configuration |
| Display name | Tên hiển thị |
| Sensor type | Loại sensor |
| Enabled | Có sử dụng sensor không |

### 7.2 Sensor Streams

Một sensor có thể chứa nhiều ROS topics.

Form stream:

| Field | Ý nghĩa |
|---|---|
| Role | Vai trò của stream trong sensor |
| Topic | ROS topic name |
| Data type | ROS message type |
| Enabled | Có đọc stream không |

Ví dụ RGB-D camera:

```text
Sensor: Head Camera
Type:   camera_rgbd

Streams:
color        /camera/color/image_raw   sensor_msgs/msg/Image
depth        /camera/depth/image_raw   sensor_msgs/msg/Image
camera_info  /camera/camera_info       sensor_msgs/msg/CameraInfo
```

### 7.3 Runtime Status

Mỗi sensor/stream hiển thị:

```text
available
partial
unavailable
type_mismatch
stale
```

Ngoài trạng thái, hiển thị message rate và last message time nếu backend cung cấp.

### 7.4 Sensor Widgets

| Sensor type | Widget mặc định |
|---|---|
| RGB camera | Image viewer |
| Depth camera | Depth image/colormap |
| RGB-D camera | RGB và depth panels |
| Point cloud | 3D point viewer |
| IMU | Orientation + line charts |
| Tactile | Pressure heatmap |
| Force/torque | Force/torque charts |
| Temperature | Numeric value + chart |
| Other | Raw summary hoặc plugin widget |

MVP đầu tiên chỉ cần triển khai widget cho những sensor thực tế đang dùng với Unitree simulation.

---

## 8. Teleoperation

Teleoperation chỉ được bật khi:

- backend connected;
- ROS runtime available;
- đã nhận joint state;
- có command interface hợp lệ;
- robot configuration đang load;
- không có trạng thái stop/fault do backend báo.

### 8.1 Joint Control

- Chọn joint hoặc joint group.
- Slider/input cho target position.
- Hiển thị measured position và commanded position.
- Clamp target theo joint limit từ URDF.
- Send command qua command interface đang chọn.
- Stop/cancel action đang chạy.

### 8.2 Pose Presets

- Tạo pose từ joint positions hiện tại.
- Đặt tên pose.
- Xem danh sách joint/value của pose.
- Apply pose.
- Sửa hoặc xóa pose.

Các pose cơ bản có thể là:

```text
Home
Stand
Crouch
Arms Down
```

### 8.3 Teleop mở rộng

Để sau MVP:

- keyboard mapping;
- gamepad;
- Cartesian/end-effector control;
- inverse kinematics;
- trajectory editor;
- SpaceMouse hoặc thiết bị master.

Frontend không tự quyết định safety cuối cùng. Backend/C++/ROS controller phải tiếp tục validate trước khi gửi lệnh tới simulator hoặc robot.

---

## 9. Data Collection & Replay

### 9.1 Record Episode

Form bắt đầu recording:

| Field | Ý nghĩa |
|---|---|
| Name | Tên episode |
| Task | Nhiệm vụ |
| Operator note | Ghi chú tùy chọn |

Các thao tác:

- Start recording.
- Stop recording.
- Hiển thị elapsed time.
- Hiển thị file/recorder error.
- Không cho bắt đầu hai episode đồng thời.

Dữ liệu ROS và command được ghi vào MCAP. SQLite chỉ lưu episode metadata và đường dẫn MCAP.

### 9.2 Episode List

Hiển thị:

- name;
- robot configuration;
- task;
- start time;
- duration;
- status;
- result;
- recording path.

Cho phép filter theo robot configuration, task, status và result.

### 9.3 Episode Detail & Replay

- Timeline chung.
- Play/pause/seek.
- Replay joint state trên robot 3D.
- Replay các sensor streams được hỗ trợ.
- Hiển thị command events.
- Đánh dấu result: success/failure.
- Sửa operator note.

### 9.4 Annotation

- Tạo annotation tại một timestamp.
- Tạo annotation cho một time range.
- Nhập label và note.
- Chọn annotation để seek timeline.

Annotation UI có thể triển khai sau khi record/replay cơ bản hoạt động.

---

## 10. Training

Training là module định hướng sau MVP. Không để việc chưa có training backend chặn các module monitor và data collection.

### 10.1 Dataset

- Tạo dataset từ các episode.
- Lọc episode theo robot/task/result.
- Thêm hoặc bỏ episode.
- Hiển thị số episode và tổng duration.

### 10.2 Training Runs

- Tạo training job.
- Xem trạng thái queued/running/completed/failed.
- Xem log và metrics.
- Xem checkpoint.

### 10.3 Models

- Danh sách model artifact.
- Model version.
- Dataset và training run nguồn.
- Evaluation result.

Trong MVP, route `/training` có thể chỉ hiển thị trạng thái `Planned` hoặc chưa được đưa vào navigation.

---

## 11. Application Settings

Chỉ chứa setting thuộc frontend/application, ví dụ:

- backend API URL;
- WebSocket/SignalR URL nếu không suy ra từ API URL;
- theme;
- chart history duration;
- 3D viewer preferences.

Không đưa ROS domain, namespace, QoS hoặc ROS node parameters vào màn hình này.

---

## 12. Thứ tự triển khai MVP

### Phase 1 — Robot và live state

1. App shell và navigation.
2. Robot profile/configuration list.
3. Upload gói URDF.
4. URDF 3D viewer.
5. Joint state interface form.
6. Joint list và live values.

### Phase 2 — Sensors

1. Sensor CRUD.
2. Sensor stream CRUD.
3. RGB camera widget.
4. IMU widget.
5. Các widget Unitree simulation thực sự cung cấp.

### Phase 3 — Control

1. Command interface form.
2. Joint group CRUD.
3. Joint position control.
4. Pose presets.
5. Stop/cancel control.

### Phase 4 — Data collection

1. Start/stop MCAP recording.
2. Episode list/detail.
3. Joint replay.
4. Sensor replay.
5. Result và annotation.

### Sau MVP

- Advanced teleoperation.
- Dataset management.
- Training jobs.
- Model registry/evaluation.

---

## 13. Luồng MVP hoàn chỉnh

```text
Upload Unitree URDF package
        |
        v
Load robot configuration và model 3D
        |
        v
Chọn topic + data type cho joint state
        |
        v
Xem live joint state
        |
        v
Thêm sensor + topic + data type
        |
        v
Xem live sensor data
        |
        v
Chọn operation + endpoint + data type để command
        |
        v
Teleoperate robot trong simulation
        |
        v
Record và replay một episode
```

Khi luồng này hoạt động ổn định, RobotAgentMonitor đã đạt MVP có giá trị sử dụng thực tế.

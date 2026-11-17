# Claude Design / Figma Brief — Robot Agent Monitor

> Thiết kế frontend Figma cho một công cụ local dùng để cấu hình, quan sát, điều khiển và thu thập dữ liệu robot qua ROS 2. Đây phải là thiết kế sản phẩm có thể triển khai thật, không phải concept dashboard.

## 1. Kết quả cần tạo

Thiết kế một ứng dụng desktop-first tên **Robot Agent Monitor** dành cho robotics engineer làm việc với Unitree simulation trước, sau đó có thể deploy lên máy robot.

Người dùng cần hoàn thành được luồng chính:

```text
Create robot profile
        ↓
Upload a complete URDF package
        ↓
Load and inspect the 3D robot
        ↓
Configure joint ROS interfaces
        ↓
Configure and monitor sensors
        ↓
Group and teleoperate joints
        ↓
Record an episode to MCAP
        ↓
Replay and annotate the episode
```

Thiết kế phải có đầy đủ form, state, validation, empty state và destructive confirmation để frontend developer có thể triển khai mà không phải tự đoán nghiệp vụ.

UI copy trong Figma dùng **English**.

---

## 2. Các module sản phẩm — đọc phần này trước

Robot Agent Monitor gồm sáu module chính. Thiết kế phải thể hiện chúng như một sản phẩm thống nhất, không phải các CRUD pages rời rạc.

| Module | Mục đích | Màn hình/chức năng chính | Backend domain | Phạm vi |
|---|---|---|---|---|
| **Overview** | Cho biết hệ thống và robot hiện tại đã sẵn sàng hay chưa | Health summary, active robot, joint/sensor/runtime status, recent episodes, warnings | Tổng hợp nhiều resource + runtime | MVP |
| **Robots** | Quản lý robot và các cách lắp/URDF khác nhau | Profiles, configurations, package upload, parse result, 3D viewer | `RobotProfile`, `RobotConfiguration` | MVP |
| **Joints** | Đọc joint state, cấu hình ROS interface và tổ chức joint | Live state table, charts, interface CRUD, joint groups | `JointInteface`, `JointGroup`, `JointGroupMembers` + URDF runtime model | MVP |
| **Sensors** | Khai báo sensor logic, ánh xạ stream và xem dữ liệu live | Sensor CRUD, stream CRUD, camera/depth/IMU/tactile widgets | `Sensor`, `SensorStream` + runtime streams | MVP |
| **Teleoperation** | Điều khiển joint/group và sử dụng pose an toàn | Joint controls, group controls, command status, pose library/editor | `JointInteface`, `JointGroup`, `PosePreset`, `PosePresetJoint` + runtime commands | MVP sau live monitoring |
| **Data** | Thu thập, quản lý, replay và annotate episode | Recording session, episode list, review timeline, annotations | `Episode`, `EpisodeAnnotation` + MCAP runtime | MVP sau teleoperation |

### 2.1 Quan hệ giữa các module

```text
Robots
  |
  | provides URDF, links, joints and limits
  v
Joints -------------------- Sensors
  |                            |
  | configured commands       | configured streams
  +-------------+--------------+
                v
          Teleoperation
                |
                | commands + live observations
                v
              Data
        record / replay / annotate

Overview reads status from every module.
```

### 2.2 Module boundaries

#### Overview

- Là read-only operational summary, không phải nơi cấu hình chi tiết.
- Dẫn người dùng tới vấn đề cần xử lý bằng actionable warning/link.
- Không hiển thị fake analytics hoặc decorative charts.

#### Robots

- Là nền tảng của toàn ứng dụng.
- Một `Robot Profile` đại diện cho robot ở mức người dùng nhận biết, ví dụ `Unitree G1`.
- Một `Robot Configuration` đại diện cho một bộ URDF/cách lắp cụ thể, ví dụ `Stock` hoặc `Head RGB-D Camera`.
- Joint/link/limit được lấy từ URDF configuration đang mở.

#### Joints

- Gồm ba phần trong cùng workspace: live joint state, ROS joint interfaces và joint groups.
- `joint_interfaces` chỉ mô tả cách C++ giao tiếp: operation, endpoint, data type.
- `joint_groups` chỉ tổ chức joint cho hiển thị/teleop; không gắn cố định vào interface.
- Không có `joint_interface_joints`.

#### Sensors

- `Sensor` là một sensor logic, ví dụ Head RGB-D Camera.
- `Sensor Stream` là từng ROS topic cấu thành sensor, ví dụ color/depth/camera_info.
- Persisted configuration và live preview/status phải được phân biệt rõ.

#### Teleoperation

- Dùng joint state, joint groups, default command interface và pose presets từ các module trước.
- Không tự quản lý ROS node/controller internals.
- Mọi control phải có disabled reason, limit feedback và command state rõ ràng.

#### Data

- Một episode chứa metadata trong SQLite và payload realtime trong MCAP.
- `status` mô tả recorder workflow; `result` mô tả đánh giá nội dung sau review.
- Replay và annotation dùng chung một timeline đồng bộ.

### 2.3 Module tương lai

`Training` gồm dataset builder, training runs, metrics và model registry. Đây không phải MVP và không đưa vào primary navigation. Chỉ thể hiện trong roadmap frame nếu cần.

---

## 3. Nguồn sự thật và ranh giới

### Nguồn sự thật

Khi có mâu thuẫn, ưu tiên theo thứ tự:

1. Domain và phạm vi sản phẩm trong brief này.
2. `Architecture.md` và code C# hiện tại.
3. `03_robotagent_local_database_codex.md` cho schema mục tiêu.
4. `FRONTEND_MODULES.md` trong project frontend cho module roadmap.

Không dùng `03_robotagent_local_database.sql` cũ làm nguồn thiết kế. File đó thuộc hướng thiết kế cũ, quản lý sâu xuống dưới ROS và không còn đúng phạm vi.

File/class `JointInterfaceJoints` còn tồn tại trong working tree là phần dư của thiết kế cũ. Không tạo màn hình hoặc dữ liệu cho `joint_interface_joints`.

### Ranh giới hệ thống

```text
Next.js Frontend
       ↓ HTTP; realtime channel pending
C# ASP.NET Core Backend
       ↓ wrapper calls
C++ ROS 2 Wrapper
       ↓
ROS 2 topics / actions
       ↓
Simulator hoặc robot driver
```

- Chỉ có một người dùng local; không thiết kế login, account, role hoặc permission.
- C# và frontend chỉ làm việc ở tầng ROS.
- Không thiết kế motor driver, encoder, firmware, USB, CAN/EtherCAT hoặc bus phần cứng.
- ROS node parameters, domain ID, namespace, QoS và khác biệt ROS build thuộc C++/deploy configuration; không đưa vào database hoặc form frontend.
- C# chỉ cần chuyển cho C++: `operation`, ROS endpoint và ROS data type.
- SQLite lưu cấu hình và metadata; không lưu JSON trong các cột.
- URDF assets và MCAP là file; database chỉ lưu đường dẫn.
- Joint/link/frame được parse từ URDF vào memory, không có bảng riêng.
- Joint state, camera frame, IMU và tactile sample là realtime data, không insert từng sample vào SQLite.

---

## 4. Backend architecture đã có

Backend tuân theo convention của repository, không đề xuất frontend-driven backend redesign:

```text
Controller
    ↓
Business
    ↓
Infrastructure
    ↓
Entities
```

### Controller

- ASP.NET Core REST entry points.
- Validate format cơ bản qua validators.
- Map request/response và gọi Business.
- Không truy cập database trực tiếp.

### Business

- Chứa workflow và business validation.
- Orchestrate database, child records và file storage.
- `RobotConfigurationBL` hiện parse/validate/store URDF.

### Infrastructure

- Dapper + SQLite.
- Generic `BaseDA<T>` cùng các DA theo module.
- File URDF được lưu dưới data root cấu hình trong `appsettings.json`.

### Entities/contracts

- `DbObjects` chứa database entities.
- `ApiObject/CRUD` chứa create/update/delete/query contracts.
- Các entity cha có thể trả nested child collection khi query theo ID.

Thiết kế Figma chỉ cần phản ánh hành vi API và domain; không hiển thị các layer này cho người dùng.

---

## 5. Trạng thái triển khai: phân biệt rõ

### Đã có trong backend cơ bản

- Generic CRUD controllers.
- Robot Profile CRUD.
- Robot Configuration create bằng multipart upload.
- Parse và validate URDF XML cơ bản.
- Lưu đường dẫn URDF tương đối.
- Entities/controllers/business/data access cho:
  - joint interfaces;
  - sensors và sensor streams;
  - joint groups và members;
  - pose presets và pose joints;
  - episodes và annotations.

### Chưa có contract hoàn chỉnh hoặc còn đang phát triển

- ROS graph discovery.
- C++ runtime integration trong ASP.NET startup.
- WebSocket/SignalR realtime streams.
- 3D viewer data API.
- Teleoperation command API.
- MCAP record/replay API.
- List-all, filter, search và pagination API.
- Complete URDF package upload gồm mesh/STL.
- Dataset/training/model APIs.

Figma vẫn phải thiết kế các flow sản phẩm cần thiết, nhưng đặt annotation **`Runtime/API pending`** ở nơi backend contract chưa có. Không tự bịa URL, payload hoặc response cho phần pending.

---

## 6. Người dùng và phong cách

### Người dùng

Robotics engineer/operator kỹ thuật đã hiểu:

- URDF, link, joint, TF và joint limit;
- ROS topic, action và data type;
- RGB-D, point cloud, IMU, tactile và force/torque;
- teleoperation, pose, episode và MCAP.

Không cần dạy ROS căn bản. UI cần giúp họ nhập nhanh, khó nhập sai và luôn thấy runtime state.

### Visual direction

- Desktop engineering tool, technical, precise, calm.
- Dark theme là primary; chuẩn bị tokens cho light theme nhưng không bắt buộc dựng toàn bộ light screens.
- Mật độ thông tin trung bình đến cao.
- Tránh sci-fi cockpit, neon glow, glassmorphism nặng và decorative charts.
- Dùng monospace cho topic, action, data type, joint name và file path.
- Desktop frame chính `1440 × 1024`; có behavior hợp lý ở `1024px`; không cần mobile.

### Status colors

| Color | Meaning |
|---|---|
| Green | available, connected, completed, success |
| Amber | warning, stale, partial, unreviewed |
| Red | unavailable, type mismatch, failed, destructive |
| Blue | selected, active control, recording action |
| Gray | disabled, offline, cancelled, unknown |

Không dùng màu làm tín hiệu duy nhất; luôn kèm icon/label.

---

## 7. Information architecture

### Primary navigation

```text
Overview
Robots
Joints
Sensors
Teleoperation
Data
```

`Training` là future module, không đưa vào primary MVP navigation. Có thể tạo một roadmap frame riêng.

### App shell

Sidebar:

- Logo/product name.
- Primary navigation.
- Compact backend/runtime status ở cuối sidebar.

Top bar:

- Robot Profile selector.
- Robot Configuration selector.
- Backend status.
- ROS/runtime status.
- Recording indicator nếu đang record.
- Notifications/errors entry.

Robot/configuration đang chọn là frontend state, lưu bằng browser local storage. Không thiết kế `is_selected` hoặc API lưu selection.

### Data hierarchy

```text
Robot Profile
└── Robot Configuration
    ├── Joint Interfaces
    ├── Sensors
    │   └── Sensor Streams
    ├── Joint Groups
    │   └── Joint Group Members
    ├── Pose Presets
    │   └── Pose Preset Joints
    └── Episodes
        └── Episode Annotations
```

Mọi màn hình con phải làm rõ configuration đang thao tác. Không để dữ liệu của hai configurations trộn nhau.

---

## 8. Domain fields cần thể hiện

Không thiết kế raw database editor. Foreign keys lấy từ context/selector, không cho người dùng nhập ID thô.

### Robot Profile

| Field | User-facing behavior |
|---|---|
| `name` | Required, unique; ví dụ `Unitree G1` |
| `description` | Optional notes |
| `createdAt`, `updatedAt` | Read-only metadata |

### Robot Configuration

| Field | User-facing behavior |
|---|---|
| `robotProfileId` | Lấy từ profile đang chọn |
| `name` | Required, unique trong profile; ví dụ `Stock`, `Head RGB-D Camera` |
| `urdfPath` | Read-only; backend tạo sau upload |
| `createdAt` | Read-only |

Một configuration là một cách lắp/URDF cụ thể, không phải ROS connection profile. Thay đổi vị trí lắp camera làm đổi URDF/TF thì tạo configuration khác; chỉ đổi endpoint ROS thì sửa interface/stream, không tạo configuration mới.

### Joint Interface

| Field | User-facing behavior |
|---|---|
| `name` | Human-readable label |
| `operation` | `subscribe`, `publish`, `action_client` |
| `rosEndpoint` | Exact topic/action name |
| `dataType` | Full ROS message/action type |
| `isEnabled` | Persist config nhưng có thể tạm không dùng |
| `isDefaultCommand` | Chỉ cho `publish`/`action_client`; tối đa một default |

Operation mapping:

| Operation | C++ behavior | Example |
|---|---|---|
| `subscribe` | Create subscriber | `/joint_states` |
| `publish` | Create publisher | `/joint_group_position_controller/commands` |
| `action_client` | Create action client | `/joint_trajectory_controller/follow_joint_trajectory` |

Không có mapping `joint_interface_joints`. Cách encode/decode và thứ tự joint trong ROS message thuộc C++ wrapper.

### Sensor

| Field | User-facing behavior |
|---|---|
| `code` | Stable machine key, ví dụ `head_camera` |
| `displayName` | Editable label |
| `sensorType` | Quyết định widget frontend |
| `isEnabled` | Tắt toàn bộ sensor và các stream runtime |

Sensor types ban đầu:

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

### Sensor Stream

| Field | User-facing behavior |
|---|---|
| `role` | Vai trò trong sensor: `color`, `depth`, `camera_info`, `imu`, `pressure_array`... |
| `topic` | Exact ROS topic |
| `dataType` | Full ROS message type |
| `isEnabled` | Tắt riêng stream |

Ví dụ:

```text
Head Camera · camera_rgbd
├── color        /camera/color/image_raw   sensor_msgs/msg/Image
├── depth        /camera/depth/image_raw   sensor_msgs/msg/Image
└── camera_info  /camera/camera_info       sensor_msgs/msg/CameraInfo
```

### Joint Group

| Field | User-facing behavior |
|---|---|
| `name` | Stable key, ví dụ `left_arm` |
| `displayName` | Editable label, ví dụ `Left Arm` |
| `sortOrder` | Điều khiển thứ tự group trên UI |

Members lấy từ joint list parse từ URDF:

- `jointName` phải khớp URDF.
- `sortOrder` điều khiển thứ tự slider/row.
- Một joint có thể thuộc nhiều groups.
- Group không gắn cố định với joint interface.

### Pose Preset

| Field | User-facing behavior |
|---|---|
| `name` | Required, unique trong configuration |
| pose joints | `jointName` + target `position` |

- Revolute/continuous dùng radian.
- Prismatic dùng meter.
- Joint không có trong pose được giữ nguyên.
- Frontend hiển thị current value, target và limit từ URDF.

### Episode

| Field | User-facing behavior |
|---|---|
| `name` | Episode label |
| `task` | Optional filterable task label |
| `status` | Technical recorder status |
| `result` | Human review result, độc lập với status |
| `recordingPath` | Read-only relative MCAP path |
| `operatorNote` | Editable note |
| `startedAt`, `endedAt` | Recorder timestamps |
| `durationNs` | Timeline duration |

Status:

```text
recording | completed | failed | cancelled
```

Result:

```text
unreviewed | success | failure
```

### Episode Annotation

| Field | User-facing behavior |
|---|---|
| `startTimeNs` | Offset từ đầu MCAP timeline, không phải Unix time |
| `endTimeNs` | Optional; null nghĩa là point event |
| `label` | Filterable annotation label |
| `note` | Optional note |

---

## 9. Màn hình bắt buộc

### 9.1 First run / no robot

- Không hiển thị fake metrics.
- Giải thích ngắn rằng người dùng cần tạo profile và upload robot configuration.
- Primary CTA: `Import Robot`.
- Secondary CTA: `Create Empty Profile`.

### 9.2 Import Robot flow

Thiết kế wizard hoặc focused modal:

1. **Profile**
   - chọn profile có sẵn hoặc tạo mới;
   - required unique name;
   - optional description.
2. **Configuration**
   - required name;
   - ví dụ `Stock`, `Head RGB-D Camera`.
3. **Upload complete robot package**
   - target UX nhận một package đầy đủ gồm URDF, mesh, STL và texture;
   - hỗ trợ package archive hoặc folder-style upload trong thiết kế;
   - hiển thị file tree/summary;
   - nếu có nhiều `.urdf`, yêu cầu chọn main URDF;
   - không cho sửa internal storage path.
4. **Parse & validate**
   - parsing progress;
   - robot name, link count, joint count;
   - lỗi cụ thể và recovery action.
5. **Complete**
   - summary;
   - CTA `Open Robot` và `Configure Joint Interfaces`.

Backend hiện chỉ dùng `AttachFiles[0]`, chấp nhận một `.urdf`/`.xml` tối đa 10 MB. Complete-package upload là target product requirement và phải được chú thích **`API extension pending`** trong Figma handoff; không hạ thiết kế mục tiêu xuống chỉ còn một file trần.

Internal storage hiện theo dạng:

```text
data/robots/{robotProfileId}/{robotConfigurationId}/...
```

### 9.3 Overview

- Robot/configuration identity.
- URDF load/parse summary.
- Backend/runtime health.
- Last joint state time và joint count.
- Joint interface status summary.
- Enabled/available sensor summary.
- Recording status.
- Recent episodes.
- Actionable warnings.

Không dùng biểu đồ trang trí không có dữ liệu thật.

### 9.4 Robots workspace

Desktop master-detail:

- Profile list.
- Configurations của profile.
- Configuration detail.
- Embedded hoặc adjacent URDF 3D viewer.

Actions:

- create/edit/delete profile;
- upload configuration;
- rename/delete/open configuration;
- inspect stored URDF path;
- reload model.

URDF viewer:

- orbit, pan, zoom, reset;
- show visual geometry;
- optional collision/frame toggles;
- select link/joint;
- synchronize model pose với live joint state;
- clear error surface cho missing mesh/load failure.

Delete confirmation phải mô tả child data bị ảnh hưởng. Configuration có episode tham chiếu phải hiển thị blocked state thay vì để người dùng thử rồi chỉ nhận toast lỗi.

### 9.5 Joints workspace

Chia thành các vùng hoặc tabs rõ ràng:

1. **Live State**
   - joint name/type;
   - position, velocity, effort;
   - lower/upper limit từ URDF;
   - last update/stale state;
   - select joint để highlight trên 3D model;
   - compact time-series plot.
2. **ROS Interfaces**
   - CRUD table cho joint interfaces;
   - operation, endpoint, data type, enabled/default;
   - discovered/manual entry modes;
   - live validation status.
3. **Joint Groups**
   - group list;
   - searchable URDF joint picker;
   - add/remove/reorder members;
   - một joint có thể nằm trong nhiều groups.

Interface form rules:

- `isDefaultCommand` disabled với `subscribe`.
- Tối đa một default command.
- Endpoint unique trong configuration.
- Topic/action và data type dùng monospace.
- Runtime statuses: `available`, `unavailable`, `type_mismatch`, `no_state_received`.

### 9.6 Sensors workspace

Thiết kế master-detail hoặc sensor cards + detail drawer:

- Sensor list/count/type/status.
- Sensor CRUD form.
- Nested stream CRUD table.
- ROS topic/data type autocomplete hoặc manual entry.
- Preview area theo sensor type.

Widget targets:

| Sensor | Default surface |
|---|---|
| RGB | Image viewer |
| Depth | Depth colormap |
| RGB-D | Split RGB/depth |
| Point cloud | 3D points |
| IMU | Orientation + charts |
| Tactile | Pressure heatmap |
| Force/torque | Vector/numeric + charts |
| Temperature | Numeric + small chart |
| Other | Generic stream status |

Runtime statuses: `available`, `partial`, `unavailable`, `type_mismatch`, `stale`. Message rate và last message time chỉ là live data.

### 9.7 Teleoperation workspace

Chỉ enable control khi:

- backend/runtime available;
- robot configuration loaded;
- joint state đã nhận;
- default command interface hợp lệ;
- không có stop/fault state.

Thiết kế:

- group selector;
- joint sliders/number inputs;
- measured vs target position;
- URDF limit visualization;
- send/cancel controls;
- active command feedback;
- pose library và pose editor;
- `Save Current Pose`;
- `Apply Pose` với safety confirmation;
- global stop/E-stop surface chỉ khi runtime cung cấp capability.

Không thiết kế keyboard/gamepad/Cartesian IK như chức năng MVP hoàn chỉnh. Có thể ghi roadmap note.

### 9.8 Data workspace — episode list

- Table/list với name, task, status, result, configuration, start, duration và note.
- Filter theo task/status/result/date.
- Empty/loading/error states.
- Actions: open, edit metadata, delete.
- Status và result phải phân biệt trực quan; không nhập chung thành một badge.

### 9.9 Recording session

- Episode name.
- Task.
- Selected streams summary.
- Elapsed timer.
- Prominent recording indicator.
- Recorder warning/error surface.
- Operator note.
- `Start Recording`, `Stop & Save`, `Cancel`.
- Không cho hai recordings đồng thời.

Flow:

```text
Create episode: recording
        ↓
Write ROS streams + commands to MCAP
        ↓
Stop and flush
        ↓
completed / failed / cancelled
```

Đánh dấu toàn bộ recorder controls là **`Runtime/API pending`**.

### 9.10 Episode review

- Shared timeline.
- Play/pause/seek/speed.
- 3D joint replay.
- Synchronized sensor panels.
- Command/event markers.
- Result review controls.
- Metadata/note panel.
- Create point/range annotation bằng click hoặc drag.

Review/replay là post-record target; annotate **`Runtime/API pending`**.

---

## 10. API contract hiện tại

### Resources

```text
/api/v1/robot-profiles
/api/v1/robot-configurations
/api/v1/joint-interfaces
/api/v1/sensors
/api/v1/sensor-streams
/api/v1/joint-groups
/api/v1/joint-group-members
/api/v1/pose-presets
/api/v1/pose-preset-joints
/api/v1/episodes
/api/v1/episode-annotations
```

### Generic CRUD paths

```text
POST   {resource}/create
PUT    {resource}/update
GET    {resource}/query?ids=1&ids=2
DELETE {resource}/delete
```

Current query API lấy theo IDs. Chưa có list-all/filter/search/pagination contract. Mọi màn hình collection trong Figma phải annotate **`List/query API pending`** thay vì tự bịa query parameters.

### Generic create/update/delete envelope

Create JSON request, ngoại trừ Robot Configuration:

```json
{
  "requestId": "client-generated-id",
  "data": {}
}
```

Create response:

```json
{
  "requestId": "client-generated-id",
  "message": ["Success"],
  "code": [1],
  "recordId": 12
}
```

Update/delete response có `requestId`, `message[]`, `code[]`. Một response có thể chứa nhiều codes/messages; error UI phải hỗ trợ error summary, không chỉ một chuỗi.

Successful query hiện trả raw array của entity. Query failure trả error object; frontend integration cần normalize hai shape này.

API sử dụng JSON cho HTTP transport. Điều này không có nghĩa database lưu JSON trong cột.

### Robot Configuration create

Current endpoint:

```text
POST /api/v1/robot-configurations/create
Content-Type: multipart/form-data
```

Current form model:

```text
RequestId
Data.RobotProfileId
Data.Name
AttachFiles[0]
```

Backend hiện dùng file đầu tiên, validate `.urdf`/`.xml`, size tối đa mặc định 10 MB, parse XML/link/joint và tạo `urdfPath`. Package upload contract cần được mở rộng sau.

### Nested reads đã có trong Business layer

Query parent theo ID có thể hydrate child collection:

```text
RobotProfile       → RobotConfigurations
RobotConfiguration → JointInterfaces
Sensor             → SensorStreams
JointGroup         → JointGroupMembers
PosePreset         → PosePresetJoints
Episode            → EpisodeAnnotations
```

Không giả định RobotConfiguration query trả toàn bộ sensors/groups/poses/episodes; các resource đó hiện được query riêng.

---

## 11. Error và edge states bắt buộc

### URDF/package

- missing upload;
- empty file/package;
- unsupported extension;
- size limit;
- invalid XML;
- root không phải `<robot>`;
- missing robot name;
- invalid/duplicate link;
- invalid/duplicate joint;
- missing parent/child link reference;
- missing mesh/STL;
- multiple URDF files but no main file selected;
- profile not found;
- store path unavailable;
- file save failure;
- database save failure.

Lỗi field/file phải xuất hiện gần input liên quan. Dùng error summary khi có nhiều lỗi. Không dùng toast làm nơi duy nhất hiển thị lỗi.

### Runtime

- backend disconnected;
- ROS runtime unavailable;
- endpoint unavailable;
- data type mismatch;
- no joint state received;
- stale joint/sensor data;
- partial sensor;
- command rejected/failed;
- recording write/flush failure.

### CRUD/destructive

- empty collection;
- loading/skeleton;
- save pending;
- multi-message validation error;
- delete confirmation;
- delete blocked do child/episode reference;
- optimistic action rollback hoặc refresh guidance.

---

## 12. Component set

Tạo reusable components với variants và auto layout:

- sidebar, top bar, breadcrumbs;
- robot/configuration selector;
- backend/runtime/recording indicators;
- buttons: primary, secondary, ghost, destructive, icon;
- text field, textarea, number input, select, combobox;
- monospace endpoint/data-type input;
- endpoint autocomplete với manual-entry mode;
- package dropzone và file tree;
- checkbox, switch, radio;
- tabs;
- cards;
- dense data table, sortable header, pagination placeholder;
- status badge/icon;
- alert banner, inline error, error summary, toast;
- modal, drawer, destructive confirmation;
- loading skeleton và empty state;
- 3D viewport shell;
- joint state row, slider và measured/target control;
- sensor preview shells;
- pose editor row;
- recording timer/control;
- timeline, marker và range annotation.

Mỗi màn hình chính cần ít nhất các variants phù hợp:

```text
loading
empty
populated
validation error
backend error
runtime offline
disabled/read-only
destructive confirmation
```

---

## 13. Sample data

```text
Robot Profile
  Unitree G1
  Humanoid robot for ROS 2 simulation

Configurations
  Stock
  Head RGB-D Camera

Joint Interfaces
  Joint States
    subscribe
    /joint_states
    sensor_msgs/msg/JointState

  Trajectory Controller
    action_client
    /joint_trajectory_controller/follow_joint_trajectory
    control_msgs/action/FollowJointTrajectory
    default command = true

Sensors
  Head Camera
    code = head_camera
    type = camera_rgbd

  Torso IMU
    code = torso_imu
    type = imu

Joint Groups
  Left Arm
  Right Arm
  Legs
  Waist

Pose Presets
  Home
  Stand Ready
  Arms Forward

Episodes
  Walk Forward 01     completed  success
  Pick Box 03         completed  unreviewed
  Camera Calibration  failed     unreviewed
```

Không dùng lorem ipsum hoặc fake financial/business analytics.

---

## 14. Không đưa vào MVP

- Authentication/account/cloud workspace.
- Fleet/multi-robot simultaneous operations.
- Direct motor/firmware/bus configuration.
- ROS domain/namespace/QoS/node parameter forms.
- Raw database editor hoặc raw SQL.
- `joint_interface_joints`.
- Trajectory editor.
- Keyboard/gamepad/SpaceMouse mapping.
- Cartesian IK.
- Dataset builder.
- Training metrics/runs.
- Model registry/deployment.

Các mục tương lai chỉ xuất hiện trong roadmap frame, không chiếm primary navigation MVP.

---

## 15. Figma deliverables

Tạo Figma file với pages:

1. `00 — Foundations`
   - color, typography, spacing, radius, elevation, icons, status semantics.
2. `01 — Components`
   - reusable components, variants và states.
3. `02 — User Flows`
   - first run/import;
   - configure/read joint state;
   - add sensor/streams;
   - teleoperate/apply pose;
   - record/review episode.
4. `03 — Desktop Screens`
   - toàn bộ screens tại mục 9.
5. `04 — Edge States`
   - loading, empty, validation, backend error, runtime offline, blocked delete.
6. `05 — Prototype`
   - clickable import happy path;
   - clickable joints/sensor setup;
   - clickable teleop pose flow;
   - clickable record → stop → review flow.
7. `06 — Handoff Notes`
   - API-backed vs `Runtime/API pending` annotations;
   - responsive behavior;
   - interaction/validation notes.

Yêu cầu:

- Auto layout trên mọi component/screen chính.
- Variables/tokens cho color, spacing và typography.
- Naming layer/component có hệ thống.
- Không flatten component trước handoff.
- Không tự thêm database field hoặc API contract.
- Runtime chưa có API phải ghi `Runtime/API pending`.
- Package upload phải ghi `API extension pending` nhưng vẫn thiết kế theo target complete-package UX.

---

## 16. Tiêu chí đánh giá

Thiết kế đạt yêu cầu khi:

- Người dùng luôn biết profile/configuration đang thao tác.
- Phân biệt rõ persisted configuration và live runtime state.
- Import package và lỗi URDF có recovery rõ ràng.
- ROS endpoint/data type nhanh nhập nhưng khó nhập sai.
- `operation` được hiểu trực tiếp là subscribe/publish/action client.
- Sensor và stream relationship trực quan.
- Joint group không bị gắn nhầm vào interface.
- Teleop và recording có guard, disabled state và failure state rõ ràng.
- Status và review result của episode không bị trộn.
- Figma đủ chi tiết để frontend developer triển khai mà không đoán nghiệp vụ.
- Những gì backend chưa hỗ trợ được đánh dấu pending, không bị trình bày như API đã tồn tại.

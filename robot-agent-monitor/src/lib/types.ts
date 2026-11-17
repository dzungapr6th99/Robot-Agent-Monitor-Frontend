export interface Entity {
  id: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface RobotProfile extends Entity {
  name: string;
  description?: string;
}
export interface RobotConfiguration extends Entity {
  robotProfileId: number;
  name: string;
  urdfPath: string;
}
export interface JointInterface extends Entity {
  robotConfigurationId: number;
  name: string;
  operation: string;
  rosEndpoint: string;
  dataType: string;
  isEnabled: boolean;
  isDefaultCommand: boolean;
}
export interface JointGroup extends Entity {
  robotConfigurationId: number;
  name: string;
  displayName: string;
  sortOrder: number;
}
export interface GroupMember extends Entity {
  jointGroupId: number;
  jointName: string;
  sortOrder: number;
}
export interface Sensor extends Entity {
  robotConfigurationId: number;
  code: string;
  displayName: string;
  sensorType: string;
  isEnabled: boolean;
}
export interface SensorStream extends Entity {
  sensorId: number;
  role: string;
  topic: string;
  dataType: string;
  isEnabled: boolean;
}
export interface Episode extends Entity {
  robotConfigurationId: number;
  name: string;
  task?: string;
  status?: string;
  result?: string;
  startedAt?: string;
  durationNs?: number;
  operatorNote?: string;
  recordingPath?: string;
}
export interface Topic {
  name: string;
  messageType: string;
  direction: string;
  bestEffort: boolean;
  transientLocal: boolean;
}
export interface RosStatus {
  running: boolean;
  subscriptions: Topic[];
  publishers: Topic[];
}
export interface RosMessage {
  topic: string;
  messageType: string;
  data: Record<string, unknown>;
}
export interface JointState {
  name: string[];
  position: number[];
  velocity: number[];
  effort: number[];
}
export interface Joint {
  name: string;
  type: string;
  lower: number | null;
  upper: number | null;
  parent: string;
  child: string;
}
export interface RobotModel {
  name: string;
  links: string[];
  joints: Joint[];
  assets: string[];
  xml: string;
  url: string;
}
export interface Resources {
  "robot-profiles": RobotProfile[];
  "robot-configurations": RobotConfiguration[];
  "joint-interfaces": JointInterface[];
  "joint-groups": JointGroup[];
  "joint-group-members": GroupMember[];
  sensors: Sensor[];
  "sensor-streams": SensorStream[];
  episodes: Episode[];
}

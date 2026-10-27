# OmniHive 3D 智慧工廠模擬器 (Prototype 2)

基於 **Vue 3 + Babylon.js**、**Go (Golang)**、**Eclipse Mosquitto (MQTT)** 與 **VDA 5050 v2.1.0 國際車隊通訊標準** 的 3D 智慧工廠 AGV 數位分身與場域編輯系統。

> 本專案完全向下相容並繼承 Prototype 1 的所有架構與基礎功能，並全面升級為 Prototype 2 (Iteration 4)。

---

## 系統架構一覽

```
+---------------------------------------------------------------------------------------+
|                                    Vue 3 前端                                         |
|  +--------------------+   +---------------------------------+   +------------------+  |
|  | 派發面板 (Dispatch)|   |  Babylon.js 3D 視覺與場域編輯器   |   | 儀表板 (Dash)    |  |
|  | (動態拓撲節點清單) |   | (.glb 車體 / 零件綁定 / Gizmo)  |   | (倍率 / 電池/速度) | |
|  +---------+----------+   +----------------^----------------+   +--------^---------+  |
|            |                               |                             |            |
|    (dispatch_order)                        |                      (state_update)      |
|    (set_time_scale)                        | (60FPS Lerp)                | (10Hz)     |
|            | (WebSocket)                   |                             |            |
+------------|-------------------------------|-----------------------------|------------+
             v                               |                             |
+---------------------------------------------------------------------------------------+
|                                    Go 後端                                            |
|  +------------------------------------+    +---------------------------------------+  |
|  |       WebSocket Hub 伺服器         |--->| 虛擬 AGV 擬真運動學與分級電池引擎     |  |
|  +-----------------+------------------+    | (TimeScale, 加減速, CC/CV, 動態路徑)  |  |
|                    | (訂單轉換)            +-------------------+-------------------+  |
|                    v                                           | (1Hz VDA 5050 State) |
|  +------------------------------------+                        v                      |
|  |   場域持久化 API (/api/layout)      |    +---------------------------------------+  |
|  |   (JSON 儲存與圖論最短路徑 BFS)    |    | MQTT Bridge (VDA 5050 v2.1.0 標準協定)|  |
|  +------------------------------------+    +-------------------+-------------------+  |
+----------------------------------------------------------------|----------------------+
                                                                 |
                                       (vda5050/.../order)       | (vda5050/.../state)
                                                                 v
+---------------------------------------------------------------------------------------+
|                          Eclipse Mosquitto (MQTT Broker :1883)                        |
+---------------------------------------------------------------------------------------+
```

---

## Prototype 2 核心新功能與規格定義

### 1. VDA 5050 動態路徑視覺化 (Dynamic Path Rendering)
* **狀態即時對齊**: Go 後端嚴格遵循 VDA 5050 規範，隨著 AGV 的行進，動態將已通過的節點與邊從 `state.nodeStates` 與 `state.edgeStates` 陣列中移除。
* **三態發光渲染**: Babylon.js 根據接收到的動態邊狀態呈現三種材質：
  1. **背景路網 (Background)**: 灰色細線/管道 (未在當前任務中)。
  2. **待行經路線 (Pending)**: 霓虹亮青色 (Cyan) 高光發光材質 (即時存在於 `edgeStates` 中)。
  3. **已行經路線 (Passed)**: 當邊自狀態中移除後，即時轉為暗色或半透明。

### 2. 運動學與分級電池擬真模型 (Kinematics & Battery Engine)
* **擬真運動學**:
  * 全域比例尺：$1\text{ Babylon Unit} = 1\text{ m}$。
  * 最大速度上限限制為 $15\text{ km/hr}$ ($4.17\text{ m/s}$)。
  * 加入梯形加減速過渡（加速度 $1.8\text{ m/s}^2$、減速度 $2.5\text{ m/s}^2$），在轉彎處及抵達目標站點前平滑減速。
* **分級耗電模型 (Battery Engine)**:
  * **Idle**: 基礎微量待機耗電 ($0.005\%/\text{s}$)。
  * **Moving**: 依當前速度動態耗電，載貨時自動切換耗電率 $\times 1.4$。
  * **Acting**: 執行 `pick`/`drop` 作動期間採高功率瞬時耗電 ($0.35\%/\text{s}$)。
  * **Charging (CC/CV 擬真曲線)**: 於充電站執行 `charge` 時，於 $<80\%$ 採定電流快速充電 (CC Phase, $3.5\%/\text{s}$)，於 $>80\%$ 採定電壓涓流充電 (CV Phase)，平滑漸進收斂至 $100\%$。

### 3. 模擬倍率控制 (Time Scale Control)
* 在 Vue Dashboard 提供 **「模擬倍率」** 按鈕群組：$1\times$, $5\times$, $10\times$, $20\times$。
* 切換倍率時，透過 WebSocket 即時通知 Go 後端 (`set_time_scale`)，套用於：
  1. 座標移動的運算步長 ($\Delta t = \text{baseDt} \times \text{timeScale}$)。
  2. 電池充放電的速率。
  3. 動作執行 (Action) 的等待時間 (例如 $10\times$ 倍率下，$3$ 秒的 `pick` 動作只需等待 $0.3$ 秒)。

### 4. `.glb` 模型載入與程式化零件動作 (Procedural Animation)
* **模型載入**: 支援於 3D 場景中載入真實 `agv.glb` 車體與貨架模型。
* **開發者專用零件綁定工具 (Dev Tool UI)**:
  * 點擊相機工具列上的「🛠️ 零件綁定工具」展開浮動面板。
  * 系統自動解析並列出 `.glb` 內部所有的 `TransformNode` 與 `Mesh` 名稱（共 29 個零件）。
  * 允許開發者自選指定特定 Node 作為取卸貨動作的控制對象（預設記憶於 `localStorage`）。
  * 提供「測試升降 (+0.15m)」按鈕即時檢驗平滑升降作動。
* **取卸貨作動聯動**: 執行 `pick`/`drop` 時，程式化控制上述指定的 Node 沿 Y 軸平滑升降 $0.15\text{ m}$，貨箱同步裝載/移出。

### 5. 3D 場域編輯器與持久化 (Layout Editor & Persistence)
* **雙模式切換**: 頂部導覽列提供 `[模擬模式 (Simulation)]` 與 `[編輯模式 (Layout Editor)]` 切換開關。
* **編輯模式功能 (Babylon.js)**:
  1. **選取拖曳 (Select & Move)**: 整合 `GizmoManager`，點選站點或貨架物件顯示水平移動與 Y 軸旋轉軸心，即時拖曳更新座標。
  2. **新增節點 (Add Node)**: 滑鼠點擊地面任意位置新增站點節點。
  3. **連接路徑 (Add Edge)**: 依序點擊兩個站點建立單向/雙向拓撲連線。
  4. **放置貨架 (Place Prop)**: 於場域中擺放貨架或工作站物件。
  5. **刪除物件 (Delete)**: 點選節點或路徑即時刪除。
* **持久化**:
  * 點擊「儲存場域 (Save)」按鈕，透過 `POST /api/layout` 存入後端 `factory_layout.json`。
  * 系統重啟或重整時自動透過 `GET /api/layout` 恢復場景。
  * 後端 AGV 引擎內建圖論 BFS 最短路徑搜尋，自動適應任何自訂拓撲。

---

## 快速啟動指南 (Quick Start)

### 步驟 1: 啟動 MQTT Broker (Eclipse Mosquitto)

在專案根目錄執行：

```bash
docker compose up -d
```

---

### 步驟 2: 啟動 Go 後端

進入 `backend/` 目錄並啟動：

```bash
cd backend
go run ./cmd/server
```

*(或執行預先編譯好的 `./server`)*

伺服器將在 `http://localhost:8080/ws` 開放 WebSocket 服務，並提供 `/api/layout` RESTful 端點。

---

### 步驟 3: 啟動 Vue 3 前端

另開終端機，進入 `frontend/` 目錄：

```bash
cd frontend
npm run dev
```

開啟瀏覽器前往：**`http://localhost:5173/`**

---

## 通訊協定規格

### 1. MQTT Topics (VDA 5050 v2.1.0)
- **訂單接收**: `vda5050/v2.1.0/agv-001/order`
- **狀態發布**: `vda5050/v2.1.0/agv-001/state`

### 2. WebSocket 內部通訊格式
- **後端推播 (`state_update`)**:
  ```json
  {
    "type": "state_update",
    "agv_id": "AGV-001",
    "position": { "x": 10.0, "y": 0.0, "z": 10.0, "theta": 1.571 },
    "velocity": 3.85,
    "battery": {
      "level": 94.2,
      "charging": false,
      "mode": "MOVING",
      "drain_rate": 0.104
    },
    "task_info": {
      "status": "DRIVING",
      "target_node": "Node-03",
      "action": "pick",
      "display_message": "[行駛中] 前往 Node-03 -> 預計執行: 取貨",
      "current_node": "Node-02",
      "previous_node": "Node-01",
      "has_cargo": false
    },
    "time_scale": 5.0,
    "node_states": ["Node-03"],
    "edge_states": ["Edge-02-03"],
    "passed_edges": ["Edge-01-02"],
    "visual_event": ""
  }
  ```
- **倍率設定 (`set_time_scale`)**:
  ```json
  {
    "type": "set_time_scale",
    "time_scale": 10.0
  }
  ```
- **前端派發 (`dispatch_order`)**:
  ```json
  {
    "type": "dispatch_order",
    "agv_id": "AGV-001",
    "target_node": "Node-03",
    "action": "pick"
  }
  ```

### 3. RESTful API
- `GET /api/layout`: 取得當前場域配置 (節點、路徑、擺設物)
- `POST /api/layout`: 儲存場域配置至 `factory_layout.json`
- `GET /api/health`: 取得伺服器與 AGV 運作健康狀態

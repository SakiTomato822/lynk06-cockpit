# 座舱项目拆分记录

新项目：`SakiTomato822/lynk06-cockpit`，Android 包名 `com.lynk.cockpit`。
原项目：`SakiTomato822/autoenergy-fuel-mod`，Android 包名 `com.lynk.autoenergyfuel`。

以原项目提交 `a2cb9b4` 为共同祖先，保留该提交之前的完整祖先历史。原项目
未提交的座舱实现、高德桥接、环境模块和最新浏览器 Demo 复制到新项目并单独提交。
没有重写、移动或删除原项目中的文件，也没有把原项目远程改为新仓库。

新项目独立从 `0.1.0`（versionCode 1）开始。调试包 `com.lynk.cockpit.debug`
可与油耗 App 并排安装，存储目录独立，不会自动迁移旧应用的行程和油耗记录。
源码 namespace 暂时沿用 `com.lynk.dvrprobe`，减少本次拆分引入的变化。

## 当前结构与下一步

- `DesktopDemoActivity` / `DesktopCockpitView`：Android 桌面入口和原生界面。
- `DesktopEnvironment`：雨量有效信号优先、天气回退的场景决策。
- `AmapNavigationWidgetBridge`：原厂 `com.geely.map` 导航卡片只读订阅。
- `app/src/main/assets/cockpit`：本地车模渲染层和环境图片。
- `demos/cockpit`：浏览器交互参考，独立于 Android 原生界面。
- 油耗读取、曲线、行程存储、地图：目前仍在 `app` 内，是继承的内部功能。

后续再将车辆读取、导航订阅、行程/油耗存储抽成内部模块；本次没有宣称完成
跨仓库共享 SDK。旧油耗项目仍可独立构建和维护，原说明保存在
`docs/fuel-module-history.md`，其中包名、版本和发布链接属于旧项目。

## 高德协议核对

组件：`com.geely.map/com.ecarx.navi.widget.NaviWidgetService`。
事务 1 注册、4 读取导航状态、5 查询路线条件、6 注销、7 读取能源类型。
事务 4 返回 103 表示路线引导中，102 表示未引导；没有单独的巡航状态字段。
当前代码解析道路名、当前/下一转向距离、剩余时间/距离和到达时间；车道等额外
载荷尚未完成展示。绑定权限、协议版本及回调仍需实车验证。

## 资源与发布

保留的历史包含原油耗项目已提交的资源。此次不新增提交展厅模型、贴图、着色器
缓存或引擎文件；开发者使用自己已有的本地缓存导入。环境图为项目生成场景图。
公开 CI 生成的 source-only APK 包含原生 UI 和场景图，但没有本地 3D 车模缓存；
完整车模构建需要先运行 README 的资源准备步骤。

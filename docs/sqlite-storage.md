# 原生离线存储

Android 和 iOS 运行时使用 `lime-sqlite` 插件打开应用私有的 `qarma_offline.db`，不再将验货记录写入 `uniStorage`。四张业务表为 `qcm_inspection_plan`、`qcm_inspection_report`、`qcm_inspection_item_result`、`qcm_inspection_defect_record`；`photo`、`request_queue`、登录会话与设置仍作为 App 离线设施单独保存。照片 JPEG 本体保存在应用私有的持久目录；SQLite `photo.localPath` 保存路径及上传状态，而不是将几千张 JPEG 塞进 JSON 或数据库 BLOB。

验货计划以 `qcm_inspection_plan.planId` 为本地主键，后端业务字段以 snake_case 分列保存（例如 `id`、`parent_plan_id`、`factory_name`、`inspect_type`），`status` 使用已有数字列。合并计划的 `groupPlanId` 等于 `parentPlanId`，普通计划则等于自身 `planId`；同组计划关联唯一的 `qcm_inspection_report.planId` 和多条 `qcm_inspection_item_result.planId`。结果表的 `itemResultId` 直接等于后端 `itemResults[].id`，不是模板 `standardItemId`，后者与结果原始字段从 `jsonData` 读取；已安装版本启动时迁移旧的计划前缀主键，历史清单占位保留兼容。报告和疵点业务字段同样分列保存；检查点数据、清单以及疵点的 `file_list`/`comments` 可以使用 JSON。计划和疵点的 `jsonData` 仅保留额外字段，报告的 `jsonData` 只保存 `report` 对象；离线草稿等共享扩展保存在 `app_setting`。`sonPlanId` 只标识子检查点；疵点、照片以共享计划 ID 关联，疵点的检查点 ID 可以为空。最终报告成功后，同一事务更新报告及所有成员状态。新安装不再创建 `report_group`、`report_member` 或单独的 `checklist` 表。

“本地下载”页以 `qcm_inspection_plan` 为列表来源，逐条展示 `inspectionPlans` 的 SQLite 原始行；同一组合并验货也逐个显示计划，而不是合并成一条报告。查看、复制和分享均使用当前计划行。报告、检查项、疵点和图片仍按共享计划 ID 关联，数据库调试页可按真实物理表名分别查看原始行。

验货详情的“本地数据”页按需展示完整诊断 JSON：先列出每个原始结果的 `resultStatus`、`remarks` 与页面实际绑定的 `result`、`comment`，再附上 SQLite 原始检查结果、组装后的本地详情及页面当前详情。屏幕分段渲染以免大报告卡顿，“复制完整数据”复制的是全部 JSON，而非当前段；打开诊断页不会清理或改写本地检查结果。

列表卡片按计划主表 `LEFT JOIN` 报告表和共享状态设置读取摘要，不扫描检查项、疵点和照片；只有进入详情或实际执行待同步草稿时才组装完整数据。切换列表页签只切换已加载摘要及远程页缓存，手动刷新或页面重新显示时再查询。数据库事务按变化表和主键生成写入 SQL；跨表状态（例如最终报告和同组合并成员）仍在同一事务中更新。接口只读请求与写操作使用独立的串行通道，避免搜索被长时间的写请求排队阻塞。

图片不直接存入计划行：下载时线上检查项、疵点的 `fileList` 和汇总照片保存为 `photo` 表的文件 ID、远端路径、归属及上传状态，原始 `fileList` 仍在对应检查项或疵点中。此步骤只落地线上图片的元数据，**不会下载远端图片文件本体**，所以离线无法打开未缓存的线上图。手机拍摄或选择的文件则由 `photo.localPath` 记录应用私有持久路径；`ownerType=checklist` 配合 `ownerId`/`dataKey` 绑定检查项，`ownerType=defect` 配合 `ownerId` 绑定疵点。`photo.reportId` 使用共享计划 ID，使合并成员看到同一份图片。

`qcm_inspection_report.jsonData` 只保存服务端 `report` 对象。清单定义、同步草稿等非报告字段按共享计划 ID 存入现有 `app_setting`，避免污染报告 JSON；升级时会把旧报告 JSON 中的共享字段迁移出来，同时保留报告业务列。

首次启动会把旧键 `__QCM_APP_DATABASE__` 及语言、疵点字典、最近分类、登录偏好迁移到 SQLite；旧相机缓存文件若仍存在，也会复制到持久目录。已有 SQLite 主键优先，迁移全部成功后才删除旧键；迁移失败则保留旧数据并阻止应用进入空白本地库。业务事务串行执行，原生事务提交成功后才更新进程内的只读镜像。镜像不是另一份持久存储，重启时始终从 SQLite 重新加载。

现有的按成员复制的 `report` 或旧 `report_group/report_member` 会在启动时迁移到计划主表，已有照片路径、待上传状态及未同步草稿跟随共享计划 ID 转移。旧 `checklist` 数据迁入检查项表的 JSON，迁移完成后删除这些旧表。旧成员存在不同且未同步的草稿时，不自动选择覆盖其中一份，旧记录保持可读，等待人工处理；有冲突的旧组表因此暂不删除。

已安装的旧版 SQLite 会先将业务表改为后端名称并补齐业务列，再从归一化行的旧 `plan`、`report`、疵点 JSON 回填空列，并移除 JSON 中重复的后端业务字段；已有非空列优先。该转换不清理照片或草稿同步信息，升级后离线重启仍可继续编辑和上传。

Android 使用系统 `SQLiteDatabase` 和应用私有数据库/文件目录；iOS 使用 `SQLite3` 和 Documents。相机直接写持久目录；相册临时文件只有 `saveFile` 成功后才入库。照片路径对应的文件若已经被系统清理，SQLite 只能恢复记录，无法凭路径重建丢失的 JPEG。

运行 `npm test` 验证迁移、并发事务、重启恢复以及 2000 条照片元数据。原生插件仍需在 HBuilderX 中分别构建 Android 和 iOS 自定义基座并真机验证拍照、重启及旧版本升级。已经由系统清理的旧临时 JPEG 无法从 SQLite 路径重新生成，应重拍或从已上传的服务端文件恢复。

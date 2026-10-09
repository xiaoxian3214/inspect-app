# 原生离线存储

Android 和 iOS 运行时使用 `lime-sqlite` 插件打开应用私有的 `qarma_offline.db`，不再将验货记录写入 `uniStorage`。`report`、`checklist`、`defect`、`photo`、`request_queue`、登录会话与设置都按表写入 SQLite。照片 JPEG 本体保存在应用私有的持久目录；SQLite `photo.localPath` 保存路径及上传状态，而不是将几千张 JPEG 塞进 JSON 或数据库 BLOB。

首次启动会把旧键 `__QCM_APP_DATABASE__` 及语言、疵点字典、最近分类、登录偏好迁移到 SQLite；旧相机缓存文件若仍存在，也会复制到持久目录。已有 SQLite 主键优先，迁移全部成功后才删除旧键；迁移失败则保留旧数据并阻止应用进入空白本地库。业务事务串行执行，原生事务提交成功后才更新进程内的只读镜像。镜像不是另一份持久存储，重启时始终从 SQLite 重新加载。

Android 使用系统 `SQLiteDatabase` 和应用私有数据库/文件目录；iOS 使用 `SQLite3` 和 Documents。相机直接写持久目录；相册临时文件只有 `saveFile` 成功后才入库。照片路径对应的文件若已经被系统清理，SQLite 只能恢复记录，无法凭路径重建丢失的 JPEG。

运行 `npm test` 验证迁移、并发事务、重启恢复以及 2000 条照片元数据。原生插件仍需在 HBuilderX 中分别构建 Android 和 iOS 自定义基座并真机验证拍照、重启及旧版本升级。已经由系统清理的旧临时 JPEG 无法从 SQLite 路径重新生成，应重拍或从已上传的服务端文件恢复。

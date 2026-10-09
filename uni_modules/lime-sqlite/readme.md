# lime-sqlite SQLite数据库组件
一个参考 plus.sqlite API 实现的 SQLite UTS API 组件，兼容 UniAppX（安卓、iOS、鸿蒙Next）平台。提供了数据库的打开、关闭、查询、执行SQL语句等功能，可用于本地数据存储、缓存、配置管理等多种应用场景。组件提供了简单易用的接口，使开发者能够方便地在应用中使用SQLite数据库。

## 文档链接
📚 组件详细文档请访问以下站点：
- [SQLite数据库组件文档 - 站点1](https://limex.qcoon.cn/native/sqlite.html)
- [SQLite数据库组件文档 - 站点2](https://limeui.netlify.app/native/sqlite.html)
- [SQLite数据库组件文档 - 站点3](https://limeui.familyzone.top/native/sqlite.html)

## 安装方法
1. 在uni-app插件市场中搜索并导入`lime-sqlite`
2. 导入后在页面引入相关方法
3. iOS平台如果是Windows开发环境需要自定义基座

## 代码演示

### 打开数据库
创建或打开一个SQLite数据库：

```js
import { openDatabase, type DatabaseOptions } from '@/uni_modules/lime-sqlite'

openDatabase({
  // 支持路径，例如 '/static/db/test.db'
  // 鸿蒙不支持路径
  // web支持路径，是通过下载的方式，但数据并不存在路径文件里
  name: 'text',
  success(res) {
    console.log('openDatabase', res)
  },
  fail(err) {
    console.log('openDatabase', err)
  }
} as DatabaseOptions)
```

### 判断数据库是否打开
检查指定的数据库是否已经打开：

```js
import { isOpenDatabase, type DatabaseOptions } from '@/uni_modules/lime-sqlite'

isOpenDatabase({
  name: 'text',
  success(res) {
    console.log('isOpenDatabase', res)
  },
  fail(err) {
    console.log('isOpenDatabase', err)
  }
} as DatabaseOptions)
```

### 关闭数据库
关闭已打开的数据库：

```js
import { closeDatabase, type DatabaseOptions } from '@/uni_modules/lime-sqlite'

closeDatabase({
  name: 'text',
  success(res) {
    console.log('closeDatabase', res)
  },
  fail(err) {
    console.log('closeDatabase', err)
  }
} as DatabaseOptions)
```

### 执行事务
开始、提交或回滚数据库事务：

```js
import { transaction,type SqlTransactionOptions } from '@/uni_modules/lime-sqlite'

transaction({
  name: 'text',
  operation: 'begin', // 'begin'、'commit'或'rollback'
  success(res) {
    console.log('transaction', res)
  },
  fail(err) {
    console.log('transaction', err)
  }
} as SqlTransactionOptions)
```

### 执行增删改等操作的SQL语句
执行不返回结果集的SQL语句，如CREATE、INSERT、UPDATE、DELETE等：

```js
import { executeSql, type SqlOperationOptions } from '@/uni_modules/lime-sqlite'

executeSql({
  name: 'text',
  sql: [
    "CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER)",
    "INSERT INTO test (name, age) VALUES ('Alice', 30)",
    "INSERT INTO test (name, age) VALUES ('Bob', 25)",
    "INSERT INTO test (name, age) VALUES ('Charlie', 35)"
  ],
  success(res) {
    console.log('executeSql', res)
  },
  fail(err) {
    console.log('executeSql', err)
  }
} as SqlOperationOptions)
```

### 执行查询的SQL语句
执行返回结果集的SQL语句，如SELECT：

```js
import { selectSql,type SqlOperationOptions } from '@/uni_modules/lime-sqlite'

selectSql({
  name: 'text',
  sql: ['select * from test'],
  success(res) {
    console.log('selectSql', res)
  },
  fail(err) {
    console.log('selectSql', err)
  }
} as SqlOperationOptions)
```

### 获取数据库路径
获取数据库文件在本地存储中的路径：

```js
import { getDatabasePath } from '@/uni_modules/lime-sqlite'

const url = getDatabasePath('text');
// web 返回的是blob
```



## 快速预览
导入插件后，可以直接使用以下标签查看演示效果：

```html
<!-- 代码位于 uni_modules/lime-sqlite/components/lime-sqlite -->
<lime-sqlite />
```

## 插件标签说明

| 标签名 | 说明 | 
| --- | --- | 
| `l-sqlite` | 组件标签 |
| `lime-sqlite` | 演示标签 |



详细配置请参考官方文档：[Vue Composition API](https://uniapp.dcloud.net.cn/tutorial/vue-composition-api.html)

## API文档

### 数据库操作函数

| 函数名 | 说明 | 参数 |
| --- | --- | --- |
| openDatabase | 打开数据库 | _options: DatabaseOptions_ |
| isOpenDatabase | 判断数据库是否打开 | _options: DatabaseOptions_ |
| closeDatabase | 关闭数据库 | _options: DatabaseOptions_ |
| transaction | 执行事务 | _options: SqlTransactionOptions_ |
| executeSql | 执行增删改等操作的SQL语句 | _options: SqlOperationOptions_ |
| selectSql | 执行查询的SQL语句 | _options: SqlOperationOptions_ |
| getDatabasePath | 获取数据库路径 | _name: string_ |

### DatabaseOptions 选项

| 参数 | 说明 | 类型 | 必填 |
| --- | --- | --- | --- |
| name | 数据库名称 | _string_ | 是 |
| success | 成功回调函数 | _(res: any) => void_ | 否 |
| fail | 失败回调函数 | _(err: any) => void_ | 否 |

### SqlTransactionOptions 选项

| 参数 | 说明 | 类型 | 必填 |
| --- | --- | --- | --- |
| name | 数据库名称 | _string_ | 是 |
| operation | 事务操作类型 | _'begin' \| 'commit' \| 'rollback'_ | 是 |
| success | 成功回调函数 | _(res: any) => void_ | 否 |
| fail | 失败回调函数 | _(err: any) => void_ | 否 |

### SqlOperationOptions 选项

| 参数 | 说明 | 类型 | 必填 |
| --- | --- | --- | --- |
| name | 数据库名称 | _string_ | 是 |
| sql | SQL语句数组 | _string[]_ | 是 |
| success | 成功回调函数 | _(res: any) => void_ | 否 |
| fail | 失败回调函数 | _(err: any) => void_ | 否 |

## 功能特点

- 兼容UniAppX（安卓、iOS、鸿蒙Next）平台
- 参考plus.sqlite API实现，使用方式类似
- 支持数据库的基本操作：打开、关闭、查询、执行SQL语句等
- 支持事务处理
- 支持批量执行SQL语句
- 提供简单易用的接口，降低使用SQLite的门槛

## 常见问题

- iOS平台在Windows开发环境下需要自定义基座
- 鸿蒙平台不支持通过路径方式打开数据库
- Web平台支持路径方式，但数据并不实际存储在文件中
- 使用完数据库后应及时关闭，避免资源泄漏
- 大量数据操作建议使用事务提高性能
- 可以参考[plus.sqlite文档](https://www.html5plus.org/doc/zh_cn/sqlite.html#plus.sqlite)了解更多用法

## 支持与赞赏

如果你觉得本插件解决了你的问题，可以考虑支持作者：

| 支付宝赞助 | 微信赞助 |
|------------|------------|
| ![](https://testingcf.jsdelivr.net/gh/liangei/image@1.9/alipay.png) | ![](https://testingcf.jsdelivr.net/gh/liangei/image@1.9/wpay.png) |
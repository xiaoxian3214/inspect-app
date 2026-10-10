export const schemaSqlList = [
  `CREATE TABLE IF NOT EXISTS user (userId TEXT PRIMARY KEY, userName TEXT, token TEXT, role TEXT, expireAt TEXT, encryptedPassword TEXT, autoLogin INTEGER, rememberPwd INTEGER);`,
  `CREATE TABLE IF NOT EXISTS report (reportId TEXT PRIMARY KEY, orderNo TEXT, productName TEXT, jsonData TEXT, downloadAt TEXT, lockExpireAt TEXT, status INTEGER, lockStatus TEXT, lockerId TEXT, syncRetry INTEGER DEFAULT 0);`,
  `CREATE TABLE IF NOT EXISTS checklist (itemId TEXT PRIMARY KEY, reportId TEXT, skuNo TEXT, qty INTEGER, checkedQty INTEGER, passQty INTEGER, defectQty INTEGER, updatedAt TEXT);`,
  `CREATE TABLE IF NOT EXISTS defect (defectId TEXT PRIMARY KEY, reportId TEXT, itemId TEXT, defectType TEXT, desc TEXT, photoPaths TEXT, createAt TEXT);`,
  `CREATE TABLE IF NOT EXISTS photo (photoId TEXT PRIMARY KEY, defectId TEXT, reportId TEXT, localPath TEXT, uploadStatus TEXT, md5 TEXT);`,
  `CREATE TABLE IF NOT EXISTS sync_log (id TEXT PRIMARY KEY, reportId TEXT, action TEXT, errorMessage TEXT, retryCount INTEGER, createdAt TEXT);`
]

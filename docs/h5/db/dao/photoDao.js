import { transaction } from '../sqlite'

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

export async function savePhoto(photo) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      const idx = ctx.db.photo.findIndex((x) => x.photoId === photo.photoId)
      if (idx >= 0) ctx.db.photo[idx] = { ...ctx.db.photo[idx], ...photo }
      else ctx.db.photo.push(photo)
      return
    }
    const sql = `REPLACE INTO photo (photoId, defectId, reportId, localPath, uploadStatus, md5)
      VALUES ('${esc(photo.photoId)}', '${esc(photo.defectId)}', '${esc(photo.reportId)}', '${esc(photo.localPath)}', '${esc(photo.uploadStatus)}', '${esc(photo.md5)}');`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

export async function listPhotosByReport(reportId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.photo.filter((x) => x.reportId === reportId)
    return plus.sqlite.selectSql({ name: ctx.name, sql: `SELECT * FROM photo WHERE reportId='${esc(reportId)}';` })
  })
}

export async function updatePhotoUploadStatus(photoId, uploadStatus) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      const idx = ctx.db.photo.findIndex((x) => x.photoId === photoId)
      if (idx >= 0) ctx.db.photo[idx].uploadStatus = uploadStatus
      return
    }
    const sql = `UPDATE photo SET uploadStatus='${esc(uploadStatus)}' WHERE photoId='${esc(photoId)}';`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

export async function removePhotosByReport(reportId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      ctx.db.photo = ctx.db.photo.filter((x) => x.reportId !== reportId)
      return
    }
    const sql = `DELETE FROM photo WHERE reportId='${esc(reportId)}';`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

export async function listAllPhotos() {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') return ctx.db.photo || []
    return plus.sqlite.selectSql({ name: ctx.name, sql: 'SELECT * FROM photo;' })
  })
}

export async function removePhotoById(photoId) {
  return transaction(async (ctx) => {
    if (ctx.type === 'memory') {
      ctx.db.photo = ctx.db.photo.filter((x) => x.photoId !== photoId)
      return
    }
    const sql = `DELETE FROM photo WHERE photoId='${esc(photoId)}';`
    plus.sqlite.executeSql({ name: ctx.name, sql })
  })
}

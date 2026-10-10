import { t } from './i18n.js'

export function validateForSubmit({ checklist = [], defects = [] }) {
  const totalChecked = checklist.reduce((sum, item) => sum + Number(item.checkedQty || 0), 0)
  if (totalChecked < 1) {
    return { valid: false, message: t('清单抽检总和必须大于等于 1') }
  }

  const defectWithMissingPhoto = defects.find((item) => !item.photoPaths || item.photoPaths.length < 1)
  if (defectWithMissingPhoto) {
    return { valid: false, message: t('每条瑕疵至少需要 1 张照片') }
  }

  return { valid: true }
}

<template>
  <view class="pc-page">
    <view class="page-head">
      <view class="page-head-main">
        <view class="page-sub">
          <template v-if="hasMergedInspectionPlans">
            <text class="inspection-type-chip">{{ headerInspectionType }}</text>
            <text class="meta-value">{{ mergeChildOrderNosText || '-' }}</text>
            <text class="meta-sep">·</text>
            <text class="meta-label">{{ t('日期') }}</text>
            <text class="meta-value">{{ reportInfo.inspectionDate || '-' }}</text>
          </template>
          <template v-else>
            {{ nonMergedHeaderOrderNo }}
          </template>
        </view>
        <view class="page-title-row">
          <view class="page-title">
            {{ hasMergedInspectionPlans ? t('合并验货') : t('验货报告') }}
          </view>
          <view class="page-head-right">
            <button class="download-btn" disabled :title="t('导出地址待提供')">
              <Icon name="share-o" size="14" />
              <text>{{ t('导出') }}</text>
            </button>
            <button class="download-btn" :disabled="downloadPdfDisabled" @click="downloadReportPdf">
              <Icon name="down" size="14" />
              <text>{{ pdfDownloading ? t('下载中...') : t('下载报告') }}</text>
            </button>
            <!-- <view class="status-pill" :class="statusClass(parseResultStatus(reportOverallResult))">
              {{ reportOverallResult ? resultLabel(parseResultStatus(reportOverallResult)) : t('未提交') }}
            </view> -->
          </view>
        </view>
      </view>
    </view>

    <section v-if="!loading && !loadError" class="panel top-status-panel">
      <view class="top-status-row">
        <text class="k">{{ t('状态') }}</text>
        <text class="head-status-text" :class="statusClass(parseResultStatus(reportOverallResult))">
          {{ reportOverallResult ? `${resultLabel(parseResultStatus(reportOverallResult))} ${reportOverallResult}` : t('未提交') }}
        </text>
      </view>
      <view class="top-status-row">
        <text class="k">{{ t('验货员结论') }}</text>
        <view class="top-status-inspector">
          <text class="inspector-info">
            {{ reportInfo.inspectorName || '-' }}
            <text class="inspector-id" v-if="reportInfo.inspectorId">({{ reportInfo.inspectorId }})</text>
          </text>
          <text v-if="reportOverallResult" class="conclusion-pill" :class="statusClass(parseResultStatus(reportOverallResult))">
            {{ resultLabel(parseResultStatus(reportOverallResult)) }}
          </text>
        </view>
      </view>
    </section>

    <view v-if="loading" class="panel">{{ t('加载中...') }}</view>
    <view v-else-if="loadError" class="panel error">{{ loadError }}</view>
    <template v-else>
      <view class="report-layout">
        <main class="report-main">
          <section class="panel section-order">
            <view class="panel-title">{{ t('订单信息') }}</view>
            <template v-if="hasMergedInspectionPlans">
              <view class="sub-title">{{ t('订单详情信息') }}</view>
              <view class="kv-grid">
                <view class="kv-item"><text class="k">{{ t('订单数量') }}</text><text class="v">{{ totalRequiredQuantity }}</text></view>
                <view class="kv-item"><text class="k">{{ t('验货员') }}</text><text class="v">{{ planValue(orderDetailSource, 'inspectorName') || currentPlan.inspectorName || '-' }}</text></view>
                <view class="kv-item"><text class="k">{{ t('样品数量') }}</text><text class="v">{{ totalSampleQuantity }}</text></view>
                <view class="kv-item"><text class="k">{{ t('验货日期') }}</text><text class="v">{{ (reportInfo.createDate || '').split(' ')[0] || '-' }}</text></view>
                <view class="kv-item"><text class="k">{{ t('清单') }}</text><text class="v">{{ planValue(orderDetailSource, 'goodsClass', 'goodsName') || currentPlan.goodsName || '-' }}</text></view>
                <view class="kv-item"><text class="k">{{ t('持续时间') }}</text><text class="v">{{ reportDurationText }}</text></view>
                <view class="kv-item"><text class="k">{{ t('供应商') }}</text><text class="v">{{ planValue(orderDetailSource, 'factoryName', 'supplierName') || currentPlan.factoryName || '-' }}</text></view>
                <!-- <view class="kv-item"><text class="k">位置</text><text class="v">{{ planValue(orderDetailSource, 'address', 'location', 'geoLocation') || '-' }}</text></view> -->
                <view class="kv-item"><text class="k">{{ t('生产单位') }}</text><text class="v">{{ planValue(orderDetailSource, 'productionUnit', 'producerName') || '-' }}</text></view>
                <!-- <view class="kv-item"><text class="k">验货状态</text><text class="v">{{ reportStatusText }}</text></view> -->
              </view>
            </template>

            <view v-else class="merge-block merge-block-compact">
              <view class="merge-expand-grid">
                <view class="merge-expand-item"><text class="k">{{ t('订单号') }}</text><text class="v">{{ planValue(orderDetailSource, 'clientOrderNo', 'planNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('产品号码') }}</text><text class="v">{{ planValue(orderDetailSource, 'subGoodsNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('产品名称') }}</text><text class="v">{{ planValue(orderDetailSource, 'goodsName', 'goodsCname') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('订单数量') }}</text><text class="v">{{ numberValue(orderDetailSource, 'requiredQuantity', 'orderQuantity') }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('样品数量') }}</text><text class="v">{{ numberValue(orderDetailSource, 'sampleQuantity', 'sampleSize') }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('验货日期') }}</text><text class="v">{{ planValue(orderDetailSource, 'deliveryDate', 'inspectionDate') || headerInspectionDate }}</text></view>
                <!-- <view class="merge-expand-item"><text class="k">地址</text><text class="v">{{ planValue(orderDetailSource, 'address', 'location', 'geoLocation') || '-' }}</text></view> -->
                <view class="merge-expand-item"><text class="k">{{ t('已备好数量') }}</text><text class="v">{{ numberValue(orderDetailSource, 'readyQuantity', 'preparedQuantity') }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('持续时间') }}</text><text class="v">{{ reportDurationText }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('抽样法') }}</text><text class="v">{{ buildSamplingText(orderDetailSource) }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('预计离港时间') }}</text><text class="v">{{ planValue(orderDetailSource, 'estimatedDepartureDate', 'etd', 'expectedShipmentDate') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('原始订单数量') }}</text><text class="v">{{ numberValue(orderDetailSource, 'originalRequiredQuantity') }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('供应代码') }}</text><text class="v">{{ planValue(orderDetailSource, 'factoryNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('客户代码') }}</text><text class="v">{{ planValue(orderDetailSource, 'clientNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('品类') }}</text><text class="v">{{ planValue(orderDetailSource, 'goodsClass') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('是否为新品') }}</text><text class="v">{{ formatYesNo(orderDetailSource.goodsFlag) }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('是否为成品') }}</text><text class="v">{{ formatYesNo(orderDetailSource.goodsFlag) }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('批次') }}</text><text class="v">{{ planValue(orderDetailSource, 'batchNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('采购合同号') }}</text><text class="v">{{ planValue(orderDetailSource, 'domeNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('入库凭证') }}</text><text class="v">{{ planValue(orderDetailSource, 'storageCertificate', 'warehousingVoucher') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('制造令号') }}</text><text class="v">{{ planValue(orderDetailSource, 'manufactureOrderNo', 'productionOrderNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('送货单号') }}</text><text class="v">{{ planValue(orderDetailSource, 'deliveryNoteNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('模具色卡号') }}</text><text class="v">{{ planValue(orderDetailSource, 'colorCardNo', 'moldColorCardNo') || '-' }}</text></view>
                <view class="merge-expand-item"><text class="k">{{ t('物料组') }}</text><text class="v">{{ planValue(orderDetailSource, 'materialGroup') || '-' }}</text></view>
                <!-- <view class="merge-expand-item"><text class="k">firstParty</text><text class="v">{{ planValue(orderDetailSource, 'firstParty') || '-' }}</text></view> -->
                <!-- <view class="merge-expand-item"><text class="k">抽样标准</text><text class="v">{{ planValue(orderDetailSource, 'inspectionLevel') || '-' }}</text></view> -->
                <!-- <view class="merge-expand-item full-row"><text class="k">附件</text><text class="v">{{ orderDetailSource.attachments?.length ? `${orderDetailSource.attachments.length} 个附件` : '没有附件' }}</text></view> -->
              </view>
            </view>

            <view v-if="hasMergedInspectionPlans" class="merge-block">
              <view class="sub-title">{{ t('订单列表') }}</view>
              <table class="table">
                <thead>
                  <tr>
                    <th>{{ t('订单号') }}</th>
                    <th>{{ t('产品号码') }}</th>
                    <th>{{ t('产品名称') }}</th>
                    <th>{{ t('订单数量') }}</th>
                    <th>{{ t('已备好数量') }}</th>
                    <th>{{ t('操作') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in inspectionPlanRows" :key="inspectionPlanKey(row)">
                    <tr class="merge-row">
                      <td>{{ row.clientOrderNo || '-' }}</td>
                      <td>{{ row.subGoodsNo || '-' }}</td>
                      <td>{{ row.goodsName || '-' }}</td>
                      <td>{{ row.requiredQuantity ?? '-' }}</td>
                      <td>{{ row.readyQuantity ?? '-' }}</td>
                      <td>
                        <button class="expand-btn" @click="toggleInspectionPlanExpand(row)">
                          {{ isInspectionPlanExpanded(row) ? t('收起') : t('展开') }}
                        </button>
                      </td>
                    </tr>
                    <tr v-if="isInspectionPlanExpanded(row)" class="merge-expand-row">
                      <td colspan="6">
                        <view class="merge-expand-grid">
                          <view class="merge-expand-item"><text class="k">{{ t('订单号') }}</text><text class="v">{{ planValue(row, 'clientOrderNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('产品号码') }}</text><text class="v">{{ planValue(row, 'subGoodsNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('产品名称') }}</text><text class="v">{{ planValue(row, 'goodsName', 'goodsCname') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('订单数量') }}</text><text class="v">{{ numberValue(row, 'requiredQuantity', 'orderQuantity') }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('样品数量') }}</text><text class="v">{{ numberValue(row, 'sampleQuantity', 'sampleSize') }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('已备好数量') }}</text><text class="v">{{ numberValue(row, 'readyQuantity', 'preparedQuantity') }}</text></view>
                          <!-- <view class="merge-expand-item"><text class="k">地址</text><text class="v">{{ planValue(row, 'address', 'location', 'geoLocation') || '-' }}</text></view> -->
                          <view class="merge-expand-item"><text class="k">{{ t('供应商') }}</text><text class="v">{{ planValue(row, 'factoryName', 'supplierName') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('抽样法') }}</text><text class="v">{{ buildSamplingText(row) }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('预计离港时间') }}</text><text class="v">{{ planValue(row, 'estimatedDepartureDate', 'etd', 'expectedShipmentDate') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('原始订单数量') }}</text><text class="v">{{ numberValue(row, 'originalRequiredQuantity') }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('供应代码') }}</text><text class="v">{{ planValue(row, 'factoryNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('客户代码') }}</text><text class="v">{{ planValue(row, 'clientNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('品类') }}</text><text class="v">{{ planValue(row, 'goodsClass') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('是否为新品') }}</text><text class="v">{{ formatYesNo(row.goodsFlag) }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('是否为成品') }}</text><text class="v">{{ formatYesNo(row.goodsFlag) }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('批次') }}</text><text class="v">{{ planValue(row, 'batchNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('采购合同号') }}</text><text class="v">{{ planValue(row, 'domeNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">subGoodsNo</text><text class="v">{{ planValue(row, 'subGoodsNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('入库凭证') }}</text><text class="v">{{ planValue(row, 'storageCertificate', 'warehousingVoucher') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('制造令号') }}</text><text class="v">{{ planValue(row, 'manufactureOrderNo', 'productionOrderNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('送货单号') }}</text><text class="v">{{ planValue(row, 'deliveryNoteNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('模具色卡号') }}</text><text class="v">{{ planValue(row, 'colorCardNo', 'moldColorCardNo') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('物料组') }}</text><text class="v">{{ planValue(row, 'materialGroup') || '-' }}</text></view>
                          <!-- <view class="merge-expand-item"><text class="k">firstParty</text><text class="v">{{ planValue(row, 'firstParty') || '-' }}</text></view> -->
                          <view class="merge-expand-item"><text class="k">{{ t('验货员') }}</text><text class="v">{{ planValue(row, 'inspectorName') || '-' }}</text></view>
                          <view class="merge-expand-item"><text class="k">{{ t('验货日期') }}</text><text class="v">{{ planValue(row, 'deliveryDate', 'inspectionDate') || '-' }}</text></view>
                          <!-- <view class="merge-expand-item"><text class="k">抽样标准</text><text class="v">{{ planValue(row, 'inspectionLevel') || '-' }}</text></view> -->
                          <!-- <view class="merge-expand-item full-row"><text class="k">附件</text><text class="v">{{ row.attachments?.length ? `${row.attachments.length} 个附件` : '没有附件' }}</text></view> -->
                        </view>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </view>
          </section>

          <section class="panel section-summary">
            <view class="panel-title">{{ t('总结') }}</view>
           
            <view class="summary-grid">
              <view class="summary-left">
                <view class="sub-title">{{ t('疵点统计') }}</view>
                <view class="defect-summary-list">
                  <view v-if="visibleDefectSummaryRows.length === 0" class="defect-summary-empty summary-empty">{{ t('暂无疵点') }}</view>
                  <view v-for="group in visibleDefectSummaryRows" :key="group.key" class="defect-summary-block">
                    <view class="defect-summary-head">
                      <text class="defect-dot" :class="`dot-${group.key}`"></text>
                      <text class="defect-summary-title">{{ group.label }}</text>
                    </view>
                    <view v-if="group.items.length" class="defect-summary-items">
                      <view v-for="item in group.items" :key="item.key" class="defect-summary-item">
                        <text class="defect-item-name">{{ item.name }}</text>
                        <text class="defect-item-count">x {{ item.qty }}</text>
                      </view>
                    </view>
                    <view v-else class="defect-summary-empty">{{ t('无{label}疵点', { label: group.label }) }}</view>
                    <view class="defect-summary-foot">
                      <text>{{ t('AQL最大值{value}', { value: group.maxAc }) }}</text>
                      <text>{{ t('总共：{count}', { count: group.total }) }}</text>
                    </view>
                  </view>
                </view>
                <view class="common-defect-block">
                  <view class="common-defect-title">{{ t('普遍性疵点') }}</view>
                  <view v-if="commonDefectRows.length === 0" class="defect-summary-empty common-empty">{{ t('无普遍性疵点') }}</view>
                  <view v-else class="common-defect-list">
                    <view v-for="item in commonDefectRows" :key="item.key" class="common-defect-item">
                      <text class="common-defect-tag" :class="`tag-${item.levelClass}`">{{ item.levelLabel }}</text>
                      <text class="common-defect-name">{{ item.name }}</text>
                    </view>
                  </view>
                </view>
              </view>
              <view class="summary-right">
                <view class="sub-title">{{ t('检查点备注') }}</view>
                <view v-if="sectionProgressRows.length === 0" class="empty">{{ t('暂无检查点') }}</view>
                <view v-for="row in sectionProgressRows" :key="row.key" class="checkpoint-summary-row">
                  <view class="checkpoint-summary-head" @click="toggleSectionVisibility(row)">
                    <view class="checkpoint-title-wrap">
                      <text class="checkpoint-arrow">
                        <Icon :name="isSectionVisible(row) ? 'arrow-down' : 'arrow'" size="14" color="#111827" />
                      </text>
                      <text class="checkpoint-title">{{ row.name }}</text>
                    </view>
                    <view class="section-progress-track">
                      <text
                        v-for="segment in row.segments"
                        :key="segment.key"
                        class="section-progress-segment"
                        :class="`segment-${segment.status}`"
                        :style="{ width: `${segment.width}%` }"
                      />
                    </view>
                  </view>

                  <!-- 内容区域：根据标题箭头状态显示/隐藏 -->
                  <view v-if="isSectionVisible(row)" class="checkpoint-section-content">
                    <!-- 显示检查项 (不合格或全部) -->
                    <view class="checkpoint-items-list">
                      <view v-for="item in getFilteredSectionItems(row)" :key="item.id" class="checkpoint-item-row">
                        <text class="checkpoint-item-name">{{ item.itemName }}</text>
                        <text class="checkpoint-item-status-dot" :class="`dot-${item.status}`"></text>
                      </view>
                    </view>

                    <view class="checkpoint-remark-text" v-if="row.remarkText">{{ row.remarkText }}</view>
                    <view class="checkpoint-show-all" @click="toggleSectionShowAll(row)">
                      {{ isSectionShowingAll(row) ? t('只展示备注项') : t('显示所有检查点') }}
                    </view>
                  </view>
                </view>
              </view>
            </view>
             <view class="summary-remarks-row">
              <view class="k remarks-title">{{ t('总结性评语') }}</view>
              <view class="v-remarks">{{ reportInfo.overallRemarks || '-' }}</view>
            </view>
          </section>

          <section class="panel section-defects">
            <view class="panel-title">{{ t('疵点') }}</view>
            <view v-if="defects.length === 0" class="empty">{{ t('暂无疵点记录') }}</view>
            <view v-for="defect in defects" :key="defect.id" class="defect-card">
              <view class="defect-head">
                <text class="badge" :class="severityClass(defect.type)">{{ severityLabel(defect.type) }}</text>
                <text class="defect-title">{{ defectDisplayName(defect) || t('未分类疵点') }}</text>

              </view>
              <view class="defect-desc">{{ Number(defect.commonFlag || 0) === 1 ? t('普遍性疵点') : t('影响：{count} 件', { count: defect.quantity }) }}</view>
              <view class="photo-list">
                <template v-for="(photo, idx) in getMediaPhotos(defect.photos)" :key="`${defect.id}_${idx}`">
                  <video
                    v-if="isVideoMedia(photo)"
                    :src="getPhotoDisplayUrl(photo, 'preview')"
                    class="photo"
                    muted
                    playsinline
                    preload="metadata"
                    @click="openPreview(getMediaPhotos(defect.photos), idx)"
                  />
                  <img
                    v-else
                    :src="getPhotoDisplayUrl(photo, 'preview')"
                    :loading="imageLoadingMode"
                    class="photo"
                    alt="defect-photo"
                    @click="openPreview(getMediaPhotos(defect.photos), idx)"
                  />
                </template>
              </view>
            </view>
          </section>

          <section class="panel section-checkpoints">
            <view class="panel-title">{{ t('检查点') }}</view>
            <view v-for="section in standardItems" :key="section.id || section.itemName" class="check-section">
              <view class="check-section-title">{{ section.itemName || t('未命名检查分组') }}</view>
              <view
                v-for="item in section.children || []"
                :key="String(item.id)"
                class="check-item-container"
              >
                <view class="check-item" :class="{ 'has-sub-items': hasMergedInspectionPlans }">
                  <view class="check-head">
                    <view class="check-name-wrap">
                      <button
                        v-if="hasMergedInspectionPlans"
                        class="sub-expand-btn"
                        @click="toggleItemExpand(item.id)"
                      >
                        <Icon :name="isItemExpanded(item.id) ? 'arrow-down' : 'arrow'" size="14" color="#64748b" />
                      </button>
                      <view class="check-name">{{ item.itemName || '-' }}</view>
                      <view v-if="item.localizedItemDescription" class="item-desc-tip">
                        <Icon name="question-o" size="14" color="#94a3b8" />
                        <view class="tip-content">{{ item.localizedItemDescription }}</view>
                      </view>
                      <text class="item-type-tag" :class="item.itemType">{{ itemTypeLabel(item.itemType) }}</text>
                    </view>
                  </view>

                  <view class="check-result-row">
                    <text class="status-block" :class="statusClass(itemMainResult(item).result)"></text>
                    <text class="status-text" :class="statusClass(itemMainResult(item).result)">
                      {{ resultLabel(itemMainResult(item).result) }}
                    </text>
                  </view>

                  <view v-if="item.itemType === 'Measurements' && itemMainResult(item).measurements?.length" class="type-block">
                    <table class="measurement-table">
                      <thead>
                        <tr>
                          <th>{{ t('规格') }}</th>
                          <th v-for="(_, idx) in itemMainResult(item).measurements" :key="idx">{{ idx + 1 }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="attr in item.specAttributes || []" :key="attr.attrId">
                          <td>{{ attr.attrName || attr.attrId }}</td>
                          <td v-for="(row, idx) in itemMainResult(item).measurements" :key="idx">
                            {{ row[attr.attrId] || '-' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </view>

                  <view v-else-if="item.itemType === 'Text' && itemMainResult(item).textGroups?.length" class="type-block">
                    <view v-for="(row, idx) in itemMainResult(item).textGroups" :key="idx" class="row-block text-card">
                      <view class="card-head">{{ t('组次 {index}', { index: idx + 1 }) }}</view>
                      <view v-for="attr in item.specAttributes || []" :key="attr.attrId" class="line">
                        <text>{{ attr.attrName || attr.attrId }}</text>
                        <text>{{ row[attr.attrId] || '-' }}</text>
                      </view>
                    </view>
                  </view>

                  <view v-else-if="item.itemType === 'Barcodes'" class="type-block">
                    <view v-for="(barcode, bIdx) in (itemMainResult(item).barcodeItems || [])" :key="bIdx" class="row-block">
                      <view v-if="barcode.name" class="barcode-item-title">{{ barcode.name }}</view>
                      <view class="line">
                        <text>{{ t('条码信息') }}</text>
                        <text>{{ barcode.code || '-' }}</text>
                      </view>
                      <view class="line">
                        <text>{{ t('扫码格式') }}</text>
                        <text>{{ barcode.format || '-' }}</text>
                      </view>
                    </view>
                    <view v-if="!(itemMainResult(item).barcodeItems?.length)" class="line">
                      <text>{{ t('条码信息') }}</text>
                      <text>-</text>
                    </view>
                  </view>

                  <view class="photo-list">
                    <template v-for="(photo, idx) in getMediaPhotos(itemMainResult(item).photos)" :key="`${item.id}_photo_${idx}`">
                      <video
                        v-if="isVideoMedia(photo)"
                        :src="getPhotoDisplayUrl(photo, 'preview')"
                        class="photo"
                        muted
                        playsinline
                        preload="metadata"
                        @click="openPreview(getMediaPhotos(itemMainResult(item).photos), idx)"
                      />
                      <img
                        v-else
                        :src="getPhotoDisplayUrl(photo, 'preview')"
                        :loading="imageLoadingMode"
                        class="photo"
                        alt="check-photo"
                        @click="openPreview(getMediaPhotos(itemMainResult(item).photos), idx)"
                      />
                    </template>
                  </view>
                  <view v-if="itemMainResult(item).comment" class="item-comment-box">
                    <view class="comment-label">{{ t('备注') }}</view>
                    <view class="comment-content">{{ itemMainResult(item).comment }}</view>
                  </view>
                </view>

                <!-- 合并验货子计划结果 -->
                <view v-if="hasMergedInspectionPlans && isItemExpanded(item.id)" class="sub-plans-list">
                  <view v-for="plan in inspectionPlanRows" :key="inspectionPlanKey(plan)" class="sub-plan-item">
                    <view class="sub-plan-head">
                      <view class="sub-plan-info">
                        <text class="sub-plan-order">{{ plan.clientOrderNo || '-' }}</text>
                        <text class="sub-plan-sep">:</text>
                        <text class="sub-plan-goods">{{ plan.subGoodsNo || '-' }}#{{ plan.batchNo || '-' }}</text>
                      </view>
                    </view>
                    
                    <view class="check-result-row">
                      <text class="status-block" :class="statusClass(itemMainResult(item, plan.id).result)"></text>
                      <text class="status-text" :class="statusClass(itemMainResult(item, plan.id).result)">
                        {{ resultLabel(itemMainResult(item, plan.id).result) }}
                      </text>
                    </view>

                    <view v-if="item.itemType === 'Measurements' && itemMainResult(item, plan.id).measurements?.length" class="type-block">
                      <table class="measurement-table">
                        <thead>
                          <tr>
                            <th>{{ t('规格') }}</th>
                            <th v-for="(_, idx) in itemMainResult(item, plan.id).measurements" :key="idx">{{ idx + 1 }}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="attr in item.specAttributes || []" :key="attr.attrId">
                            <td>{{ attr.attrName || attr.attrId }}</td>
                            <td v-for="(row, idx) in itemMainResult(item, plan.id).measurements" :key="idx">
                              {{ row[attr.attrId] || '-' }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </view>

                    <view v-else-if="item.itemType === 'Text' && itemMainResult(item, plan.id).textGroups?.length" class="type-block">
                      <view v-for="(row, idx) in itemMainResult(item, plan.id).textGroups" :key="idx" class="row-block text-card">
                        <view class="card-head">{{ t('组次 {index}', { index: idx + 1 }) }}</view>
                        <view v-for="attr in item.specAttributes || []" :key="attr.attrId" class="line">
                          <text>{{ attr.attrName || attr.attrId }}</text>
                          <text>{{ row[attr.attrId] || '-' }}</text>
                        </view>
                      </view>
                    </view>

                    <view v-else-if="item.itemType === 'Barcodes'" class="type-block">
                      <view v-for="(barcode, bIdx) in (itemMainResult(item, plan.id).barcodeItems || [])" :key="bIdx" class="row-block">
                        <view v-if="barcode.name" class="barcode-item-title">{{ barcode.name }}</view>
                        <view class="line">
                          <text>{{ t('条码信息') }}</text>
                          <text>{{ barcode.code || '-' }}</text>
                        </view>
                        <view class="line">
                          <text>{{ t('扫码格式') }}</text>
                          <text>{{ barcode.format || '-' }}</text>
                        </view>
                      </view>
                    </view>

                    <view class="photo-list" v-if="getMediaPhotos(itemMainResult(item, plan.id).photos).length">
                      <template v-for="(photo, idx) in getMediaPhotos(itemMainResult(item, plan.id).photos)" :key="`${item.id}_${plan.id}_photo_${idx}`">
                        <video
                          v-if="isVideoMedia(photo)"
                          :src="getPhotoDisplayUrl(photo, 'preview')"
                          class="photo"
                          muted
                          playsinline
                          preload="metadata"
                          @click="openPreview(getMediaPhotos(itemMainResult(item, plan.id).photos), idx)"
                        />
                        <img
                          v-else
                          :src="getPhotoDisplayUrl(photo, 'preview')"
                          :loading="imageLoadingMode"
                          class="photo"
                          alt="check-photo"
                          @click="openPreview(getMediaPhotos(itemMainResult(item, plan.id).photos), idx)"
                        />
                      </template>
                    </view>
                    <view v-if="itemMainResult(item, plan.id).comment" class="item-comment-box">
                      <view class="comment-label">{{ t('备注') }}</view>
                      <view class="comment-content">{{ itemMainResult(item, plan.id).comment }}</view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </section>

          <ReportInteractiveUploadPanel
            v-if="showInteractiveUploadPanel"
            :page-query="pageQuery"
            :report-id="downloadReportId"
            :standard-items="standardItems"
            :inspection-plan-rows="inspectionPlanRows"
            :item-results="planData.itemResults || []"
            :checklist-data="checklistData"
            :defects="defects"
            :has-merged-inspection-plans="hasMergedInspectionPlans"
            @uploaded="handleInteractiveUploaded"
          />

          <ReportCommentsPanel v-if="showReportCommentsPanel" :report-id="downloadReportId" />
        </main>

      </view>
    </template>

    <view v-if="previewVisible" class="image-preview-overlay" @click="closePreview">
      <view class="image-preview-toolbar">
        <text class="image-preview-counter">{{ previewIndex + 1 }} / {{ previewList.length }}</text>
        <text class="image-preview-close" @click.stop="closePreview">✕</text>
      </view>
      <view class="image-preview-body" @click.stop="closePreview">
        <view v-if="previewList.length > 1" class="image-preview-arrow arrow-left" @click.stop="prevPreview">‹</view>
        <video
          v-if="currentPreview?.isVideo"
          :src="currentPreview.url"
          class="image-preview-video"
          controls
          playsinline
          preload="metadata"
          @click.stop
        />
        <img
          v-else
          :src="currentPreview?.url"
          class="image-preview-img"
          @click.stop
        />
        <view v-if="previewList.length > 1" class="image-preview-arrow arrow-right" @click.stop="nextPreview">›</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { Icon } from 'vant'
import 'vant/lib/icon/style'
import { useI18n } from '../../utils/i18n.js'
import { useAuthStore } from '../../store/auth.js'
import { getPlanDetail, getReportDetail, getLocalPlans } from '../../api/plan.js'
import { fetchReportPdfBlob } from '../../api/report.js'
import { getApiBase } from '../../utils/constants.js'
import { getPhotoDisplayUrl, isVideoMedia } from '../../utils/photoUpload.js'
import { getMediaPhotos, toChecklistPhotos } from './utils/checkPointMedia.js'
import { buildStandardItemsFromItemResults } from './utils/itemTree.js'
import ReportInteractiveUploadPanel from './components/ReportInteractiveUploadPanel.vue'
import ReportCommentsPanel from './components/ReportCommentsPanel.vue'
import {
  canShowInteractiveUploadPanel,
  canShowReportCommentsPanel
} from './utils/detailPcInteractive.mjs'
import {
  collectReportImageUrls,
  getReportImageLoadingMode,
  isPdfImagePreloadEnabled,
  preloadImageUrls
} from './utils/reportPdfImagePreload.js'

const { t } = useI18n()
const authStore = useAuthStore()

const pageQuery = ref({})

const loading = ref(false)
const loadError = ref('')
const planData = ref({})
const checklistData = ref({})
const defects = ref([])
const expandedInspectionPlanKeys = ref([])
const expandedSectionKeys = ref([]) // 用于底部“显示所有检查点”的展开状态
const sectionVisibleKeys = ref([])  // 用于标题行箭头控制的“内容区域”显示/隐藏状态
const expandedItems = ref([])
const previewVisible = ref(false)
const previewList = ref([])
const previewIndex = ref(0)
const currentPreview = computed(() => previewList.value?.[previewIndex.value] || null)
const pdfDownloading = ref(false)
const imageLoadingMode = computed(() => getReportImageLoadingMode(pageQuery.value))

const rawPlan = computed(() => {
  const source = planData.value || {}
  return source.plan && typeof source.plan === 'object' ? source.plan : source
})

const reportInfo = computed(() => {
  const report = planData.value?.report
  return report && typeof report === 'object' ? report : {}
})

const reportOverallResult = computed(() => {
  return String(reportInfo.value?.overallResult || currentPlan.value?.overallResult || '').trim().toUpperCase()
})

const inspectionPlanRows = computed(() => {
  if (Array.isArray(planData.value?.inspectionPlans) && planData.value.inspectionPlans.length) {
    return planData.value.inspectionPlans
  }
  return rawPlan.value ? [rawPlan.value] : []
})

const hasMergedInspectionPlans = computed(() => inspectionPlanRows.value.length > 1)

const currentPlan = computed(() => {
  if (!hasMergedInspectionPlans.value) {
    return inspectionPlanRows.value?.[0] || rawPlan.value || {}
  }
  return rawPlan.value || {}
})

const reportPlanId = computed(() => {
  return String(reportInfo.value?.planId || currentPlan.value?.planId || currentPlan.value?.id || '').trim()
})

const primaryInspectionPlan = computed(() => {
  const targetId = reportPlanId.value
  const rows = inspectionPlanRows.value
  if (!rows.length) return null
  if (targetId) {
    const matched = rows.find((row) => String(row?.id || row?.planId || '').trim() === targetId)
    if (matched) return matched
  }
  return rows[0] || null
})

const currentInspectorId = computed(() => {
  return String(
    reportInfo.value?.inspectorId
      || primaryInspectionPlan.value?.inspectorId
      || currentPlan.value?.inspectorId
      || ''
  ).trim()
})

const currentUserId = computed(() => {
  return String(authStore.user?.userId || authStore.user?.id || '').trim()
})

const showReportCommentsPanel = computed(() => {
  return canShowReportCommentsPanel({ pageQuery: pageQuery.value })
})

const showInteractiveUploadPanel = computed(() => {
  return canShowInteractiveUploadPanel({
    pageQuery: pageQuery.value,
    inspectorId: currentInspectorId.value,
    currentUserId: currentUserId.value
  })
})

const orderDetailSource = computed(() => primaryInspectionPlan.value || currentPlan.value || {})

const mergeChildOrderNosText = computed(() => {
  if (!hasMergedInspectionPlans.value) return ''
  const list = inspectionPlanRows.value
    .map((row) => String(row?.clientOrderNo || row?.planNo || '-').trim() || '-')
  return list.join(' + ')
})

const headerInspectionType = computed(() => {
  return planValue(orderDetailSource.value, 'inspectType', 'inspectionType') || '-'
})

const headerInspectionDate = computed(() => {
  const raw = firstDefinedValue(orderDetailSource.value, ['deliveryDate', 'inspectionDate'])
    || firstDefinedValue(reportInfo.value, ['inspectionDate', 'createDate', 'updateDate'])
  return formatHeaderDate(raw)
  return 
})

const nonMergedHeaderOrderNo = computed(() => {
  const firstRow = inspectionPlanRows.value?.[0] || {}
  return firstRow.clientOrderNo || firstRow.planNo || currentPlan.value.clientOrderNo || currentPlan.value.planNo || '-'
})

const browserTitle = computed(() => {
  const mergedTitle = String(mergeChildOrderNosText.value || '').trim()
  const singleTitle = String(nonMergedHeaderOrderNo.value || '').trim()
  return hasMergedInspectionPlans.value ? (mergedTitle || t('验货报告')) : (singleTitle || t('验货报告'))
})

const downloadReportId = computed(() => {
  const fromReport = String(reportInfo.value?.id || planData.value?.reportId || '').trim()
  if (fromReport) return fromReport
  return String(pageQuery.value?.reportId || '').trim()
})

const downloadPdfDisabled = computed(() => {
  return loading.value || !!loadError.value || pdfDownloading.value || !downloadReportId.value
})

const totalRequiredQuantity = computed(() => {
  const rows = inspectionPlanRows.value
  if (!rows.length) return '-'
  const total = rows.reduce((sum, row) => sum + normalizeNumber(row?.requiredQuantity), 0)
  if (total > 0) return total
  const fallback = normalizeNumber(currentPlan.value?.requiredQuantity)
  return fallback > 0 ? fallback : '-'
})

const totalSampleQuantity = computed(() => {
  const rows = inspectionPlanRows.value
  if (!rows.length) return '-'
  const total = rows.reduce((sum, row) => sum + normalizeNumber(firstDefinedValue(row, ['sampleQuantity', 'sampleSize'])), 0)
  if (total > 0) return total
  const fallback = normalizeNumber(firstDefinedValue(currentPlan.value, ['sampleQuantity', 'sampleSize']))
  return fallback > 0 ? fallback : '-'
})

const reportDurationText = computed(() => {
  const start = firstDefinedValue(reportInfo.value, ['createDate'])
  const end = firstDefinedValue(reportInfo.value, ['updateDate'])
  const computedText = formatDurationByDateRange(start, end)
  if (computedText) return computedText
  return planValue(orderDetailSource.value, 'inspectionDuration', 'duration') || currentPlan.value?.inspectionDuration || '-'
})

const standardItems = computed(() => {
  if (Array.isArray(planData.value?.standardItems) && planData.value.standardItems.length) {
    return planData.value.standardItems
  }
  if (Array.isArray(planData.value?.itemResults) && planData.value.itemResults.length) {
    return buildStandardItemsFromItemResults(planData.value.itemResults)
  }
  return []
})

const defectSummaryRows = computed(() => {
  const acSource = orderDetailSource.value || currentPlan.value || {}
  const rows = [
    { key: 'critical', label: t('极严重'), severity: 'CRITICAL', maxAc: Number(acSource?.criticalAc || 0) },
    { key: 'major', label: t('大'), severity: 'MAJOR', maxAc: Number(acSource?.majorAc || 0) },
    { key: 'minor', label: t('小'), severity: 'MINOR', maxAc: Number(acSource?.minorAc || 0) }
  ]
  return rows.map((row) => {
    const items = defects.value
      .filter((d) => Number(d?.commonFlag || 0) !== 1)
      .filter((d) => normalizeSeverity(d?.type, d?.typeLabel) === row.severity)
      .map((d, idx) => ({
        key: `${row.key}_${d?.id || idx}`,
        name: defectDisplayName(d) || t('未命名疵点'),
        qty: Number(d?.quantity || 0)
      }))
    const total = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    return { ...row, items, total }
  })
})

const visibleDefectSummaryRows = computed(() => {
  return defectSummaryRows.value.filter((row) => Number(row?.total || 0) > 0)
})

const commonDefectRows = computed(() => {
  return defects.value
    .filter((d) => Number(d?.commonFlag || 0) === 1)
    .map((d, idx) => {
      const severity = normalizeSeverity(d?.type, d?.typeLabel)
      const levelClass = severity.toLowerCase()
      return {
        key: `common_${d?.id || idx}`,
        name: defectDisplayName(d) || t('未命名疵点'),
        levelClass,
        levelLabel: severityLabel(severity)
      }
    })
})

const sectionProgressRows = computed(() => {
  const sections = Array.isArray(standardItems.value) ? standardItems.value : []
  return sections
    .map((section, sectionIndex) => {
      const children = Array.isArray(section?.children) ? section.children : []
      if (!children.length) return null

      const segments = children.map((child, childIndex) => {
        const rawResult = itemMainResult(child)?.result
        const normalized = normalizeResultForProgress(rawResult)
        return {
          key: `${sectionIndex}_${childIndex}_${child?.id || ''}`,
          status: normalized,
          width: 100 / children.length
        }
      })

      const doneCount = segments.filter((s) => s.status !== 'empty').length
      const firstRemark = children
        .map((child) => String(itemMainResult(child)?.comment || '').trim())
        .find((text) => !!text)

      const items = children.map(child => ({
        id: child.id,
        itemName: child.itemName,
        result: itemMainResult(child).result,
        status: normalizeResultForProgress(itemMainResult(child).result)
      }))

      return {
        key: String(section?.id || section?.itemName || sectionIndex),
        name: section?.itemName || t('检查分组 {index}', { index: sectionIndex + 1 }),
        totalCount: children.length,
        doneCount,
        segments,
        remarkText: firstRemark || '',
        items
      }
    })
    .filter(Boolean)
})

const reportStatusText = computed(() => {
  const status = String(planData.value?.status || currentPlan.value?.status || '').toUpperCase()
  if (status === 'COMPLETED' || status === '3') return t('已完成')
  if (status === 'IN_PROGRESS' || status === '2' || status === '1') return t('进行中')
  if (status === 'DOWNLOADED' || status === '0') return t('已下载')
  return status || '-'
})

onMounted(async () => {
  await loadReportDetail()
  // 默认展开所有包含不合格项的检查分组
  if (sectionProgressRows.value.length) {
    sectionProgressRows.value.forEach(row => {
      const hasFail = row.items?.some(item => item.result === 'fail')
      if (hasFail) {
        sectionVisibleKeys.value.push(row.key)
      }
    })
  }

  // 默认展开所有包含已填写子项结果的检查项
  if (hasMergedInspectionPlans.value) {
    standardItems.value.forEach(section => {
      section.children?.forEach(item => {
        const hasSubFilled = inspectionPlanRows.value.some(plan => {
          const res = itemMainResult(item, plan.id)
          return !!(res.result || res.photos?.length || res.comment?.trim() || 
                    hasAnyFilledValue(res.measurements) || hasAnyFilledValue(res.textGroups))
        })
        if (hasSubFilled) {
          expandedItems.value.push(String(item.id))
        }
      })
    })
  }
})

watch(
  browserTitle,
  (value) => {
    if (typeof document !== 'undefined') {
      document.title = value || t('验货报告')
    }
  },
  { immediate: true }
)

onLoad((options = {}) => {
  pageQuery.value = options || {}
})

async function loadReportDetail() {
  loading.value = true
  loadError.value = ''
  try {
    const reportId = String(pageQuery.value?.reportId || '').trim()
    const planId = String(pageQuery.value?.planId || '').trim()
    if (!reportId && !planId) throw new Error(t('缺少 planId/reportId 参数'))

    let data = null
    try {
      if (reportId) {
        data = await getReportDetail(reportId)
      } else {
        data = await getPlanDetail(planId)
      }
    } catch {
      const id = reportId || planId
      const localPlans = await getLocalPlans()
      data = localPlans.find((row) => String(row?.id || row?.planId || row?.reportId || '') === id) || null
    }

    if (!data) throw new Error(t('未找到验货报告数据'))

    const nextChecklistData = resolveChecklistData(data)
    const nextDefects = resolveDefects(data)
    planData.value = data
    checklistData.value = nextChecklistData
    defects.value = nextDefects

    if (isPdfImagePreloadEnabled(pageQuery.value)) {
      const imageUrls = collectReportImageUrls(
        { defects: nextDefects, checklistData: nextChecklistData },
        {
          getUrl: (photo) => getPhotoDisplayUrl(photo, 'preview'),
          isVideo: isVideoMedia
        }
      )
      await preloadImageUrls(imageUrls)
    }
  } catch (error) {
    loadError.value = error?.message || t('加载报告失败')
  } finally {
    loading.value = false
  }
}

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

function showDownloadToast(message) {
  const title = String(message || t('下载失败'))
  if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') {
    uni.showToast({ title, icon: 'none' })
    return
  }
  if (typeof globalThis.alert === 'function') {
    globalThis.alert(title)
    return
  }
  console.error(title)
}

function getAccessToken() {
  try {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('access_token')
      if (token) return token
    }
  } catch {}
  try {
    if (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function') {
      return uni.getStorageSync('access_token') || ''
    }
  } catch {}
  return ''
}

function getDownloadFileName(reportId) {
  const title = sanitizeFileName(browserTitle.value) || 'report'
  const firstRow = inspectionPlanRows.value?.[0] || {}
  const productNo = sanitizeFileName(
    firstRow.subGoodsNo || currentPlan.value?.subGoodsNo || planValue(orderDetailSource.value, 'subGoodsNo') || ''
  )
  const productName = sanitizeFileName(
    firstRow.goodsName
      || firstRow.goodsCname
      || currentPlan.value?.goodsName
      || currentPlan.value?.goodsCname
      || planValue(orderDetailSource.value, 'goodsName', 'goodsCname')
      || ''
  )
  const parts = [title, reportId, productNo, productName].filter(Boolean)
  return `${parts.join('_')}.pdf`
}

function getReportPdfDownloadUrl(reportId) {
  return `${getApiBase()}/api/reports/${encodeURIComponent(String(reportId))}/pdf`
}

function isMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '')
}

function triggerBrowserDownload(url, fileName) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error(t('当前环境不支持下载'))
  }
  const a = document.createElement('a')
  a.href = url
  if (isMobileBrowser()) {
    a.target = '_blank'
    a.rel = 'noopener'
  } else {
    a.download = fileName
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function sharePdfInMobileBrowser(blob, fileName) {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  const file = new File([blob], fileName, { type: blob?.type || 'application/pdf' })
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: fileName })
    return true
  } catch (error) {
    if (error?.name === 'AbortError') return true
    return false
  }
}

async function downloadReportPdfInBrowser(reportId, fileName) {
  const isDingTalk = navigator.userAgent.includes('DingTalk')
  const isAndroid = navigator.userAgent.includes('Android')
  
  if (isDingTalk && isAndroid) {
    const pdfUrl = getReportPdfDownloadUrl(reportId)
    const token = getAccessToken()
    const fullUrl = token ? `${pdfUrl}?access_token=${encodeURIComponent(token)}&download=${encodeURIComponent(fileName)}` : `${pdfUrl}?download=${encodeURIComponent(fileName)}`
    
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(fullUrl)}&showmenu=true`
    document.body.appendChild(iframe)
    
    setTimeout(() => {
      document.body.removeChild(iframe)
    }, 1000)
    return
  }
  
  const blob = await fetchReportPdfBlob(reportId)
  if (isMobileBrowser()) {
    const shared = await sharePdfInMobileBrowser(blob, fileName)
    if (shared) return
  }
  const url = window.URL.createObjectURL(blob)
  try {
    triggerBrowserDownload(url, fileName)
  } finally {
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
  }
}

function downloadReportPdfByUni(reportId) {
  return new Promise((resolve, reject) => {
    if (typeof uni === 'undefined' || typeof uni.downloadFile !== 'function') {
      reject(new Error(t('当前环境不支持下载')))
      return
    }
    const token = getAccessToken()
    const header = { Accept: 'application/pdf' }
    if (token) header.Authorization = `Bearer ${token}`
    uni.downloadFile({
      url: getReportPdfDownloadUrl(reportId),
      header,
      success: async (res) => {
        if (!(res.statusCode >= 200 && res.statusCode < 300) || !res.tempFilePath) {
          reject(new Error(`${t('下载报告失败')}: ${res.statusCode || ''}`.replace(/:\s*$/, '')))
          return
        }
        try {
          if (typeof uni.openDocument === 'function') {
            await new Promise((openResolve, openReject) => {
              uni.openDocument({
                filePath: res.tempFilePath,
                fileType: 'pdf',
                showMenu: true,
                success: openResolve,
                fail: openReject
              })
            })
          } else {
            showDownloadToast(t('下载完成'))
          }
          resolve(res.tempFilePath)
        } catch (error) {
          reject(new Error(error?.errMsg || error?.message || t('打开文件失败')))
        }
      },
      fail: (error) => {
        reject(new Error(error?.errMsg || error?.message || t('下载失败')))
      }
    })
  })
}

function shouldUseUniDownload() {
  if (typeof plus !== 'undefined') return true
  try {
    if (typeof uni !== 'undefined' && typeof uni.getSystemInfoSync === 'function') {
      const platform = String(uni.getSystemInfoSync()?.uniPlatform || '').toLowerCase()
      if (platform && platform !== 'web' && platform !== 'h5') return true
    }
  } catch {}
  return typeof window === 'undefined' || typeof document === 'undefined'
}

async function downloadReportPdf() {
  if (downloadPdfDisabled.value) return
  pdfDownloading.value = true
  try {
    const reportId = downloadReportId.value
    const fileName = getDownloadFileName(reportId)
    if (shouldUseUniDownload()) {
      await downloadReportPdfByUni(reportId)
    } else {
      await downloadReportPdfInBrowser(reportId, fileName)
    }
  } catch (error) {
    showDownloadToast(error?.message || t('下载失败'))
  } finally {
    pdfDownloading.value = false
  }
}

function resolveChecklistData(data) {
  const source = data?.checklistData
  if (source && typeof source === 'object' && Object.keys(source).length) return source
  return buildChecklistDataFromItemResults(data?.itemResults || [])
}

function resolveDefects(data) {
  if (Array.isArray(data?.defects)) return data.defects
  if (Array.isArray(data?.defectRecords)) {
    return data.defectRecords.map((row, idx) => ({
      id: String(row?.id || row?.defectId || idx),
      type: String(row?.defectLevel || row?.defectType || 'MINOR').toUpperCase(),
      defectCode: row?.defectCode || '',
      defectDesc: row?.defectDesc || '',
      description: row?.defectDesc || '',
      quantity: Number(row?.quantity ?? row?.defectCount ?? 0),
      commonFlag: Number(row?.commonFlag ?? 0),
      photos: toChecklistPhotos(row?.fileList)
    }))
  }
  return []
}

function normalizeSeverity(rawValue, rawLabel) {
  const text = `${String(rawValue || '').toLowerCase()} ${String(rawLabel || '').toLowerCase()}`
  if (text.includes('critical') || text.includes('致命') || text.includes('极严重')) return 'CRITICAL'
  if (text.includes('major') || text.includes('主要') || text.includes('严重') || text.includes('大')) return 'MAJOR'
  if (text.includes('minor') || text.includes('次要') || text.includes('轻微') || text.includes('小')) return 'MINOR'
  return String(rawValue || 'MINOR').toUpperCase()
}

function severityLabel(type) {
  const value = normalizeSeverity(type, type)
  if (value === 'CRITICAL') return t('极严重')
  if (value === 'MAJOR') return t('大')
  return t('小')
}

function severityClass(type) {
  const value = normalizeSeverity(type, type)
  if (value === 'CRITICAL') return 'critical'
  if (value === 'MAJOR') return 'major'
  return 'minor'
}

function defectDisplayName(defect) {
  const code = String(defect?.defectCode || '').trim()
  const desc = String(defect?.defectDesc || '').trim()
  if (code && desc) return `${code} ${desc}`
  return code || desc || ''
}

function parseResultStatus(status) {
  const text = String(status || '').toUpperCase()
  if (text === 'APPROVED' || text === 'PASS') return 'pass'
  if (text === 'REJECTED' || text === 'FAIL') return 'fail'
  if (text === 'PENDING') return 'pending'
  if (text === 'NA' || text === 'N/A') return 'na'
  return ''
}

function normalizeResultForProgress(status) {
  const parsed = parseResultStatus(status)
  if (parsed === 'pass') return 'pass'
  if (parsed === 'fail') return 'fail'
  if (parsed === 'pending') return 'pending'
  if (parsed === 'na') return 'na'
  return 'empty'
}

function parseTextRows(textContent) {
  if (!textContent) return []
  if (Array.isArray(textContent)) return textContent
  if (typeof textContent === 'object') return [textContent]
  try {
    const parsed = JSON.parse(textContent)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
  } catch {}
  return []
}

function toMeasurementRows(specResult) {
  if (!specResult) return []
  if (Array.isArray(specResult)) return specResult
  if (typeof specResult === 'object') return [specResult]
  if (typeof specResult === 'string') {
    try {
      const parsed = JSON.parse(specResult)
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') return [parsed]
      return []
    } catch {
      return []
    }
  }
  return []
}

function normalizeBarcodeItems(rawItems) {
  const rows = Array.isArray(rawItems) ? rawItems : []
  return rows
    .map((item) => {
      if (typeof item === 'string') {
        const code = String(item || '').trim()
        return code ? { name: '', code, format: '' } : null
      }
      if (!item || typeof item !== 'object') return null
      const code = String(item.code ?? item.value ?? item.barcode ?? '').trim()
      const name = String(item.name ?? item.label ?? '').trim()
      const format = String(item.format ?? item.scanType ?? '').trim()
      if (!code && !name && !format) return null
      return { name, code, format }
    })
    .filter(Boolean)
}

function parseBarcodeItems(rawBarcodeValue, fallbackBarcodeList = []) {
  if (Array.isArray(rawBarcodeValue)) {
    return normalizeBarcodeItems(rawBarcodeValue)
  }
  const text = String(rawBarcodeValue || '').trim()
  if (text) {
    try {
      const parsed = JSON.parse(text)
      const parsedItems = normalizeBarcodeItems(parsed)
      if (parsedItems.length) return parsedItems
    } catch {
      return [{ name: '', code: text, format: '' }]
    }
  }
  const fallbackItems = (Array.isArray(fallbackBarcodeList) ? fallbackBarcodeList : [])
    .map(code => String(code || '').trim())
    .filter(Boolean)
    .map(code => ({ name: '', code, format: '' }))
  return fallbackItems
}

function buildChecklistDataFromItemResults(itemResults = []) {
  const rows = Array.isArray(itemResults) ? itemResults : []
  const data = {}
  rows.forEach((row) => {
    const rowId = String(row?.id || row?.itemResultId || '').trim()
    if (!rowId) return
    const sonPlanId = String(row?.sonPlanId || '').trim()
    let baseItemId = rowId
    if (sonPlanId && rowId.endsWith(`_${sonPlanId}`)) {
      baseItemId = rowId.slice(0, -(`_${sonPlanId}`.length))
    }
    const key = getItemResultKey(baseItemId, sonPlanId)
    const barcodeItems = parseBarcodeItems(row?.barcodeValue)
    const barcodeList = barcodeItems.map(item => String(item.code || '').trim()).filter(Boolean)
    data[key] = {
      result: parseResultStatus(row?.resultStatus),
      comment: row?.remarks || '',
      barcodeList,
      barcodeItems,
      measurements: toMeasurementRows(row?.specResult),
      textGroups: parseTextRows(row?.textContent),
      photos: toChecklistPhotos(row?.fileList)
    }
  })
  return data
}

function getItemResultKey(itemId, sonPlanId = '') {
  const base = String(itemId || '')
  const son = String(sonPlanId || '').trim()
  return son ? `${base}__${son}` : base
}

function itemMainResult(item, sonPlanId = '') {
  return checklistData.value[getItemResultKey(item?.id, sonPlanId)] || {}
}

function isItemExpanded(itemId) {
  return expandedItems.value.includes(String(itemId))
}

function toggleItemExpand(itemId) {
  const idStr = String(itemId)
  if (expandedItems.value.includes(idStr)) {
    expandedItems.value = expandedItems.value.filter(id => id !== idStr)
  } else {
    expandedItems.value.push(idStr)
  }
}

function hasAnyFilledValue(rows) {
  return (Array.isArray(rows) ? rows : []).some(
    row => row && typeof row === 'object' && Object.values(row).some(v => String(v || '').trim())
  )
}

function normalizeMeasurements(rawRows, attrs = []) {
  if (Array.isArray(rawRows) && rawRows.length) return rawRows
  const attrIds = (attrs || []).map((a) => a.attrId)
  if (!attrIds.length) return []
  return [Object.fromEntries(attrIds.map((id) => [id, '']))]
}

function normalizeTextRows(rawRows, attrs = []) {
  if (Array.isArray(rawRows) && rawRows.length) return rawRows
  const attrIds = (attrs || []).map((a) => a.attrId)
  if (!attrIds.length) return []
  return [Object.fromEntries(attrIds.map((id) => [id, '']))]
}

function statusClass(result) {
  if (result === 'pass') return 'pass'
  if (result === 'fail') return 'fail'
  if (result === 'pending') return 'pending'
  return 'na'
}

function resultLabel(result) {
  if (result === 'pass') return t('合格')
  if (result === 'fail') return t('不合格')
  if (result === 'pending') return t('待定')
  if (result === 'na') return t('不适用')
  return t('未填写')
}

function itemTypeLabel(itemType) {
  if (itemType === 'Measurements') return t('规格类型')
  if (itemType === 'Text') return t('文本类型')
  if (itemType === 'Barcodes') return t('二维码类型')
  return t('普通类型')
}

function normalizeNumber(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function firstDefinedValue(source, keys = []) {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    const value = source[key]
    if (value === 0 || value === false) return value
    if (value !== null && value !== undefined && String(value).trim() !== '') return value
  }
  return undefined
}

function planValue(row, ...keys) {
  const value = firstDefinedValue(row, keys)
  if (value === undefined) return ''
  return String(value)
}

function numberValue(row, ...keys) {
  const value = firstDefinedValue(row, keys)
  if (value === undefined) return '-'
  const n = Number(value)
  return Number.isFinite(n) ? n : '-'
}

function formatHeaderDate(value) {
  if (value === null || value === undefined) return '-'
  const text = String(value).trim()
  if (!text) return '-'
  const spaceIdx = text.indexOf(' ')
  return spaceIdx > 0 ? text.slice(0, spaceIdx) : text
}

function parseDateMs(value) {
  if (value === null || value === undefined) return NaN
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const text = String(value).trim()
  if (!text) return NaN
  const normalized = text.replace('T', ' ').replace(/-/g, '/')
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

function formatDurationByDateRange(startValue, endValue) {
  const startMs = parseDateMs(startValue)
  const endMs = parseDateMs(endValue)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return ''
  const totalMinutes = Math.floor((endMs - startMs) / 60000)
  const days = Math.floor(totalMinutes / (24 * 60))
  const remainMinutes = totalMinutes % (24 * 60)
  const hours = Math.floor(remainMinutes / 60)
  const minutes = remainMinutes % 60
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  return parts.join(' ')
}

function inspectionPlanKey(row) {
  return String(
    row?.id
      || row?.planId
      || row?.reportId
      || `${row?.clientOrderNo || ''}_${row?.subGoodsNo || ''}_${row?.goodsName || ''}`
  )
}

function isInspectionPlanExpanded(row) {
  return expandedInspectionPlanKeys.value.includes(inspectionPlanKey(row))
}

function toggleInspectionPlanExpand(row) {
  const key = inspectionPlanKey(row)
  if (!key) return
  if (expandedInspectionPlanKeys.value.includes(key)) {
    expandedInspectionPlanKeys.value = expandedInspectionPlanKeys.value.filter((k) => k !== key)
    return
  }
  expandedInspectionPlanKeys.value = [...expandedInspectionPlanKeys.value, key]
}

function buildSamplingText(row) {
  const level = String(row?.inspectionLevel || '').trim()
  const sampleCode = String(row?.sampleCode || '').trim()
  const base = level && sampleCode ? `${level} / ${sampleCode}` : (level || sampleCode || '-')
  const critical = String(row?.criticalAql ?? '-').trim() || '-'
  const major = String(row?.majorAql ?? '-').trim() || '-'
  const minor = String(row?.minorAql ?? '-').trim() || '-'
  return `${base} ${critical}/${major}/${minor}`
}

function formatYesNo(value) {
  if (value === 1 || value === '1' || value === true || value === 'true') return t('是')
  if (value === 0 || value === '0' || value === false || value === 'false') return t('否')
  return '-'
}

function sectionKey(section) {
  return String(section?.id || section?.itemName || section?.key || '')
}

// 标题行箭头控制：显示或隐藏整个内容区
function isSectionVisible(section) {
  return sectionVisibleKeys.value.includes(sectionKey(section))
}

function toggleSectionVisibility(section) {
  const key = sectionKey(section)
  if (!key) return
  if (sectionVisibleKeys.value.includes(key)) {
    sectionVisibleKeys.value = sectionVisibleKeys.value.filter((k) => k !== key)
  } else {
    sectionVisibleKeys.value.push(key)
  }
}

// 底部按钮控制：显示所有或仅显示不合格
function isSectionShowingAll(section) {
  return expandedSectionKeys.value.includes(sectionKey(section))
}

function toggleSectionShowAll(section) {
  const key = sectionKey(section)
  if (!key) return
  if (expandedSectionKeys.value.includes(key)) {
    expandedSectionKeys.value = expandedSectionKeys.value.filter((k) => k !== key)
  } else {
    expandedSectionKeys.value.push(key)
    // 展开所有时，确保内容区也是可见的
    if (!sectionVisibleKeys.value.includes(key)) {
      sectionVisibleKeys.value.push(key)
    }
  }
}

function getFilteredSectionItems(row) {
  if (isSectionShowingAll(row)) {
    return row.items || []
  }
  return (row.items || []).filter(item => item.result === 'fail')
}

function openPreview(photos, index) {
  const mapped = (Array.isArray(photos) ? photos : []).map((photo, srcIndex) => ({
    url: getPhotoDisplayUrl(photo, 'preview'),
    isVideo: isVideoMedia(photo),
    srcIndex
  }))
  const items = mapped.filter((item) => !!item.url)
  if (!items.length) return
  const targetIndex = items.findIndex((item) => item.srcIndex === index)
  previewList.value = items.map(({ url, isVideo }) => ({ url, isVideo }))
  previewIndex.value = Math.min(Math.max(0, targetIndex >= 0 ? targetIndex : 0), previewList.value.length - 1)
  previewVisible.value = true
}

function closePreview() {
  previewVisible.value = false
  previewIndex.value = 0
  previewList.value = []
}

function prevPreview() {
  if (previewIndex.value > 0) {
    previewIndex.value--
  } else {
    previewIndex.value = previewList.value.length - 1
  }
}

function nextPreview() {
  if (previewIndex.value < previewList.value.length - 1) {
    previewIndex.value++
  } else {
    previewIndex.value = 0
  }
}

function handleInteractiveUploaded() {
  previewList.value = [...previewList.value]
}
</script>

<style scoped lang="scss">
.pc-page {
  min-height: 100vh;
  padding: 24px;
  background: #f7f9fb;
  color: #0f172a;
  width: 100%;
  max-width: 1060px;
  margin: 0 auto;
}
.remarks-title {
  margin-bottom: 24rpx;
}
.page-head {
  display: flex;
  align-items: stretch;
  margin-bottom: 18px;
  gap: 12px;
}

.page-head-main {
  min-width: 0;
  flex: 1;
}

.page-title-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.download-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 700;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.download-btn:hover {
  background: #f1f5f9;
}

.download-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.page-sub {
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.15;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.meta-label {
  color: #64748b;
  font-size: 12px;
}

.inspection-type-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid #94a3b8;
  background: #64748b;
  color: #fff;
  border-radius: 999px;
  height: 22px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.meta-value {
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.meta-sep {
  color: #94a3b8;
  margin: 0 2px;
}

.status-pill {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  white-space: nowrap;
}

.report-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  align-items: start;
}


.report-main {
  min-width: 0;
}

.report-side {
  position: sticky;
  top: 8px;
  align-self: start;
}

.panel {
  margin-bottom: 18px;
  padding: 18px 20px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.top-status-panel {
  margin-bottom: 12px;
  padding: 12px 16px;
}

.top-status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px dashed #e2e8f0;
}

.top-status-row:last-child {
  border-bottom: none;
}

.top-status-inspector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel.error {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}

.panel-title {
  margin-bottom: 14px;
  font-size: 22px;
  font-weight: 600;
  color: #0f172a;
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 10px;
}

.sub-title {
  margin: 14px 0 10px;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.2;
}

.merge-block {
  margin-top: 18px;
}

.merge-block-compact {
  margin-top: 8px;
}

.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  font-size: 13px;
}

.table td:last-child,
.table th:last-child {
  text-align: center;
  width: 86px;
}

.table th {
  background: #f9fbfd;
  color: #4b5563;
  font-weight: 600;
  font-size: 12px;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table tbody tr:nth-child(2n) td {
  background: #fcfdff;
}

.merge-row td {
  vertical-align: middle;
}

.expand-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}

.expand-btn:hover {
  background: #f1f5f9;
}

.merge-expand-row td {
  background: #f8fbff !important;
  border-bottom: 1px solid #dbe6f3;
}

.merge-expand-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 16px;
  padding: 10px 4px;
}

.merge-expand-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed #dbe6f3;
}

.merge-expand-item .v {
  font-weight: 500;
}

.merge-expand-item.full-row {
  grid-column: 1 / -1;
}

.kv-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

.kv-item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px dashed #e2e8f0;
  min-width: 0;
}

.k {
  color: #64748b;
  font-size: 13px;
  flex-shrink: 0;
}

.v {
  font-weight: 600;
  font-size: 13px;
  line-height: 1.4;
  color: #0f172a;
  text-align: right;
  word-break: break-word;
}

.section-order .sub-title {
  font-size: 28px;
  margin-top: 4px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.summary-remarks-row {
  margin: 24rpx 0;
}

.summary-left,
.summary-right {
  min-width: 0;
  padding: 10px 14px 12px;
}

.summary-left {
  border-right: 1px solid #e2e8f0;
}

.defect-summary-list {
  padding-top: 4px;
}

.defect-summary-block {
  padding: 8px 0 10px;
  border-bottom: 1px solid #e2e8f0;
}

.defect-summary-block:last-child {
  border-bottom: none;
}

.defect-summary-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.defect-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.defect-dot.dot-critical {
  background: #ff4d4f;
}

.defect-dot.dot-major {
  background: #f5a623;
}

.defect-dot.dot-minor {
  background: #2ea8ff;
}

.defect-summary-title {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.defect-summary-items {
  display: grid;
  gap: 6px;
  margin-left: 24px;
}

.defect-summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #111827;
}

.defect-item-count {
  color: #6b7280;
  font-size: 12px;
}

.defect-summary-empty {
  margin-left: 24px;
  color: #374151;
  font-size: 13px;
}

.summary-empty {
  margin-left: 0;
  padding: 8px 0;
}

.defect-summary-foot {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eef2f7;
  display: flex;
  justify-content: space-between;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
}

.common-defect-block {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.common-defect-title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
}

.common-empty {
  margin-left: 0;
}

.common-defect-list {
  display: grid;
  gap: 8px;
}

.common-defect-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.common-defect-tag {
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  padding: 4px 8px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.common-defect-tag.tag-critical {
  background: #ef4444;
}

.common-defect-tag.tag-major {
  background: #f59e0b;
}

.common-defect-tag.tag-minor {
  background: #3b82f6;
}

.common-defect-name {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  min-width: 0;
  word-break: break-word;
}

.checkpoint-summary-row {
  padding: 8px 0 10px;
  border-bottom: 1px solid #e2e8f0;
}

.checkpoint-summary-row:last-child {
  border-bottom: none;
}

.checkpoint-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  padding: 4px 0;
}

.checkpoint-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.checkpoint-title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.checkpoint-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  margin-right: 4px;
}

/* 如果用户明确要求“右侧图标”，可以将箭头移到右侧，或者保持在标题文字右侧 */
.checkpoint-title-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}

.checkpoint-items-list {
  padding-left: 24px;
  margin-top: 8px;
}

.checkpoint-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.checkpoint-item-name {
  font-size: 14px;
  color: #334155;
}

.checkpoint-item-status-dot {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.checkpoint-item-status-dot.dot-pass {
  background: #22c55e;
}

.checkpoint-item-status-dot.dot-fail {
  background: #ef4444;
}

.checkpoint-item-status-dot.dot-pending {
  background: #f59e0b;
}

.checkpoint-item-status-dot.dot-na {
  background: #94a3b8;
}

.checkpoint-item-status-dot.dot-empty {
  background: #e2e8f0;
}

.checkpoint-remark-text {
  margin-top: 8px;
  padding-left: 24px;
  color: #64748b;
  font-size: 13px;
  font-weight: 400;
}

.checkpoint-show-all {
  margin-top: 12px;
  padding-left: 24px;
  color: #94a3b8;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}

.checkpoint-show-all:hover {
  color: #64748b;
}

.empty {
  color: #94a3b8;
  font-size: 13px;
}

.side-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px dashed #e2e8f0;
}

.side-row:last-child {
  border-bottom: none;
}

.side-row.align-start {
  align-items: flex-start;
}

.side-row.vertical {
  flex-direction: column;
  gap: 6px;
}

.v-remarks {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  font-size: 13px;
  line-height: 1.6;
  color: #334155;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.v-group {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.inspector-info {
  font-weight: 600;
  font-size: 13px;
  color: #0f172a;
}

.inspector-id {
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
  margin-left: 4px;
}

.conclusion-btn-wrap {
  margin-top: 2px;
}

.conclusion-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
}

.conclusion-pill.pass {
  background: #22c55e;
  color: #fff;
}

.conclusion-pill.fail {
  background: #ef4444;
  color: #fff;
}

.conclusion-pill.pending {
  background: #f59e0b;
  color: #fff;
}

.conclusion-pill.na {
  background: #94a3b8;
  color: #fff;
}

.tag {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

.side-status-panel {
  padding: 0;
  overflow: hidden;
}

.side-status-head {
  background: #64748b;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  padding: 12px 16px;
  transition: background-color 0.3s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head-status-text {
  font-size: 18px;
  font-weight: 600;
  opacity: 0.95;
}

.side-status-head.pass {
  background: #22c55e;
}

.side-status-head.fail {
  background: #ef4444;
}

.side-status-head.pending {
  background: #f59e0b;
}

.side-status-head.na {
  background: #94a3b8;
}

.side-status-body {
  padding: 12px 16px 16px;
}

.side-status-panel .side-row {
  padding: 12px 0;
}

.section-progress-row {
  margin-bottom: 0;
  max-width: none;
}

.section-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}

.section-progress-name {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.section-progress-meta {
  font-size: 11px;
  color: #64748b;
}

.section-progress-track {
  display: flex;
  gap: 0;
  height: 12px;
  width: 240px;
  min-width: 240px;
  max-width: 240px;
  border-radius: 2px;
  overflow: hidden;
  background: #eef2f7;
}

.section-progress-segment {
  height: 100%;
  min-width: 2px;
}

.section-progress-segment.segment-pass {
  background: #22c55e;
}

.section-progress-segment.segment-fail {
  background: #ef4444;
}

.section-progress-segment.segment-pending {
  background: #f59e0b;
}

.section-progress-segment.segment-na {
  background: #94a3b8;
}

.section-progress-segment.segment-empty {
  background: #e2e8f0;
}

.remark-row {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed #e2e8f0;
  align-items: center;
  min-width: 0;
}

.remark-name {
  min-width: 180px;
  font-weight: 600;
  color: #0f172a;
}

.remark-status {
  min-width: 64px;
  text-align: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid transparent;
}

.remark-value {
  color: #334155;
  line-height: 1.5;
  word-break: break-word;
}

.defect-card {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-left: 5px solid #e2b84a;
  border-radius: 10px;
  margin-bottom: 12px;
  background: #fff;
}

.defect-head {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.defect-count {
  margin-left: auto;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.badge {
  display: inline-block;
  width: 60px;
  text-align: center;
  padding: 3px 0;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.badge.critical {
  background: #fee2e2;
  color: #b91c1c;
}

.badge.major {
  background: #fef3c7;
  color: #b45309;
}

.badge.minor {
  background: #dbeafe;
  color: #1d4ed8;
}

.defect-title {
  font-weight: 700;
  color: #0f172a;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.defect-desc {
  margin-top: 10px;
  color: #334155;
  line-height: 1.55;
  margin-left: 70px;
}

.photo-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.photo {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid #dbe3ef;
  background: #f8fafc;
}

.check-section {
  margin-bottom: 18px;
}

.check-section-title {
  margin-bottom: 10px;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  border-bottom: 1px solid #eef2f7;
  padding-bottom: 8px;
}

.check-item-container {
  margin-bottom: 12px;
}

.check-item {
  padding: 20px 14px 14px;
  border: none;
  border-top: 1px solid #eef2f7;
  border-radius: 10px;
  background: #fff;
}

.check-item.has-sub-items {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.check-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.check-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.check-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-desc-tip {
  position: relative;
  display: flex;
  align-items: center;
  cursor: help;
}

.item-desc-tip .tip-content {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  background: #1e293b;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  width: 280px;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s;
  z-index: 100;
  pointer-events: none;
}

.item-desc-tip .tip-content::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #1e293b;
}

.item-desc-tip:hover .tip-content {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(-12px);
}

.sub-expand-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.sub-expand-btn:hover {
  background: #f1f5f9;
}

.check-status {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid transparent;
}

.check-status.small {
  font-size: 11px;
  padding: 2px 8px;
}

.check-status.pass {
  background: #dcfce7;
  color: #166534;
}

.check-status.fail {
  background: #fee2e2;
  color: #991b1b;
}

.check-status.pending {
  background: #fef3c7;
  color: #92400e;
}

.check-status.na {
  background: #f3f4f6;
  color: #4b5563;
}

.item-comment-box {
  margin-top: 10px;
  background: #f8fafc;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.comment-label {
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
  font-weight: 600;
}

.comment-content {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.sub-plans-list {
  margin: -6px 14px 12px 34px;
  border-left: 2px solid #e2e8f0;
  padding-left: 16px;
}

.sub-plan-item {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px dashed #e2e8f0;
}

.sub-plan-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.sub-plan-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.sub-plan-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.sub-plan-order {
  color: #1e293b;
}

.sub-plan-sep {
  color: #94a3b8;
}

.sub-plan-goods {
  color: #64748b;
}

.status-pill.pass,
.tag.pass,
.remark-status.pass {
  background: #dcfce7;
  color: #166534;
  border-color: #86efac;
}

.status-pill.fail,
.tag.fail,
.remark-status.fail {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fecaca;
}

.status-pill.pending,
.tag.pending,
.remark-status.pending {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

.status-pill.na,
.tag.na,
.remark-status.na {
  background: #f3f4f6;
  color: #4b5563;
  border-color: #e5e7eb;
}

.check-type {
  margin-top: 8px;
  color: #111827;
  font-size: 14px;
  font-weight: 700;
}

.item-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  background: #f1f5f9;
  color: #64748b;
}

.item-type-tag.Measurements {
  background: #e0f2fe;
  color: #0369a1;
}

.item-type-tag.Text {
  background: #f0fdf4;
  color: #15803d;
}

.item-type-tag.Barcodes {
  background: #fef2f2;
  color: #b91c1c;
}

.check-result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.has-sub-items .check-result-row {
  margin-left: 30px;
}

.status-block {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

.status-block.pass {
  background: #22c55e;
}

.status-block.fail {
  background: #ef4444;
}

.status-block.pending {
  background: #f59e0b;
}

.status-block.na {
  background: #94a3b8;
}

.status-text {
  font-size: 13px;
  font-weight: 600;
}

.status-text.pass {
  color: #16a34a;
}

.status-text.fail {
  color: #dc2626;
}

.status-text.pending {
  color: #d97706;
}

.status-text.na {
  color: #4b5563;
}

.type-block {
  margin-top: 10px;
}

.barcode-item-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f1f5f9;
}

.measurement-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 13px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.measurement-table th,
.measurement-table td {
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  text-align: left;
}

.measurement-table th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
  white-space: nowrap;
}

.measurement-table td {
  color: #334155;
}

.measurement-table td:first-child {
  background: #fcfdfe;
  color: #64748b;
  width: 120px;
}

.text-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
}

.text-card:last-child {
  margin-bottom: 0;
}

.text-card .card-head {
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e2e8f0;
}

.row-block {
  margin-top: 8px;
  border: 1px solid #e8edf5;
  border-radius: 8px;
  padding: 9px 10px;
  background: #fff;
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 5px 0;
  color: #334155;
}

.line span:first-child {
  color: #64748b;
}

.sub-label {
  font-size: 12px;
  opacity: 0.8;
}

.section-summary .panel-title,
.section-defects .panel-title,
.section-checkpoints .panel-title {
  font-size: 28px;
}

.photo {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.photo:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
}

.image-preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  flex-shrink: 0;
}

.image-preview-counter {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 600;
}

.image-preview-close {
  color: #fff;
  font-size: 28px;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.image-preview-close:hover {
  background: rgba(255, 255, 255, 0.15);
}

.image-preview-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0 60px;
  min-height: 0;
}

.image-preview-img {
  max-width: 90%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 6px;
  user-select: none;
  -webkit-user-drag: none;
}

.image-preview-video {
  max-width: 90%;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 6px;
  background: #000;
}

.image-preview-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32px;
  cursor: pointer;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.2s;
  user-select: none;
}

.image-preview-arrow:hover {
  background: rgba(255, 255, 255, 0.25);
}

.arrow-left {
  left: 12px;
}

.arrow-right {
  right: 12px;
}

@media (max-width: 768px) {
  .pc-page {
    padding: 12px;
    max-width: 100%;
  }

  .page-title {
    font-size: 20px;
  }

  .page-head {
    gap: 8px;
  }

  .page-title-row {
    align-items: flex-start;
    gap: 10px;
  }

  .page-head-right {
    margin-left: auto;
  }

  .download-btn {
    padding: 7px 12px;
    font-size: 12px;
  }

  .panel {
    padding: 14px 12px;
    border-radius: 8px;
  }

  .panel-title {
    font-size: 18px;
  }

  .sub-title {
    font-size: 15px;
  }

  .section-order .sub-title {
    font-size: 20px;
  }

  .section-summary .panel-title,
  .section-defects .panel-title,
  .section-checkpoints .panel-title {
    font-size: 20px;
  }

  .kv-grid {
    grid-template-columns: 1fr;
  }

  .merge-expand-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .summary-left {
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
  }

  .defect-summary-title {
    font-size: 18px;
  }

  .photo-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .defect-desc {
    margin-left: 0;
  }

  .table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .table thead,
  .table tbody,
  .table tr,
  .table th,
  .table td {
    min-width: 80px;
  }

  .measurement-table {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .section-progress-track {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
  }

  .check-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .sub-plans-list {
    margin-left: 12px;
    padding-left: 12px;
  }

  .image-preview-body {
    padding: 0 12px;
  }

  .image-preview-img {
    max-width: 100%;
    max-height: 80vh;
  }

  .image-preview-arrow {
    width: 36px;
    height: 36px;
    font-size: 24px;
  }

  .arrow-left {
    left: 4px;
  }

  .arrow-right {
    right: 4px;
  }
}

@media (max-width: 480px) {
  .pc-page {
    padding: 8px;
  }

  .photo-list {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .check-name-wrap {
    flex-wrap: wrap;
  }

  .top-status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .top-status-inspector {
    flex-wrap: wrap;
  }
}

@media print {
  .pc-page {
    max-width: 920px;
    padding: 10px 12px;
    background: #fff;
  }

  .report-layout {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .report-side {
    position: static;
  }

  .panel {
    box-shadow: none;
    break-inside: avoid;
  }

  .image-preview-overlay {
    display: none;
  }
}
</style>

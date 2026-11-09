const DATE_FIELDS = /Date$/;

export function validateLabData(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('資料必須是 JSON 物件');
  if (!Array.isArray(data?.optBone)) errors.push('缺少 optBone 陣列');
  if (!Array.isArray(data?.music40)) errors.push('缺少 music40 陣列');
  if (data?.members !== undefined && !Array.isArray(data.members)) errors.push('members 必須是陣列');
  if (data?.customStudies !== undefined && !Array.isArray(data.customStudies)) errors.push('customStudies 必須是陣列');

  const checkRows = (rows, label) => (rows || []).forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) errors.push(`${label} 第 ${index + 1} 筆格式錯誤`);
    if (row && !String(row.id || '').trim()) errors.push(`${label} 第 ${index + 1} 筆缺少個案編號`);
    Object.entries(row || {}).forEach(([key, value]) => {
      if (DATE_FIELDS.test(key) && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(`${label} 第 ${index + 1} 筆 ${key} 日期格式錯誤`);
      }
    });
  });
  checkRows(data?.optBone, 'OPT_Bone');
  checkRows(data?.music40, 'music40');

  (data?.customStudies || []).forEach((study, index) => {
    if (!study || !String(study.code || '').trim()) errors.push(`自訂研究案第 ${index + 1} 筆缺少研究案代碼`);
    if (!Array.isArray(study?.milestones)) errors.push(`自訂研究案第 ${index + 1} 筆 milestones 格式錯誤`);
    if (!Array.isArray(study?.subjects)) errors.push(`自訂研究案第 ${index + 1} 筆 subjects 格式錯誤`);
  });
  return errors;
}

export function summarizeLabData(data, source = '未命名') {
  const customStudies = data?.customStudies || [];
  const customSubjects = customStudies.reduce((n, study) => n + (study.subjects || []).length, 0);
  const milestones = customStudies.reduce((n, study) => n + (study.milestones || []).length, 0);
  const doneInRows = rows => (rows || []).reduce((n, row) => n + Object.entries(row).filter(([key, value]) => /Done$/.test(key) && value).length, 0);
  const customDone = customStudies.reduce((n, study) => n + (study.subjects || []).reduce((m, subject) => m + Object.values(subject.items || {}).filter(item => item.done).length, 0), 0);
  return {
    source,
    schemaVersion: data?.schemaVersion ?? null,
    revision: data?.revision ?? null,
    optBoneSubjects: data?.optBone?.length || 0,
    music40Subjects: data?.music40?.length || 0,
    customStudies: customStudies.length,
    customSubjects,
    milestones,
    completedItems: doneInRows(data?.optBone) + doneInRows(data?.music40) + customDone
  };
}

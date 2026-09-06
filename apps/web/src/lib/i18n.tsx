import React, { createContext, useContext, useEffect, useState } from "react";

export type Locale = "zh" | "en";

export const dictionaries = {
  zh: {
    brand: {
      title: "myQSL",
      badge: "HAM Core",
      subtitle: "业余无线电电子 QSL 卡片与通联系统"
    },
    nav: {
      qsos: "QSO 日志",
      cards: "卡片管理",
      templates: "模板设计",
      import: "ADIF 导入",
      stations: "台站设置",
      trash: "回收站",
      lookup: "索卡查验",
      print: "矢量打印",
      deliveries: "QRZ 发卡",
      integrations: "设备集成"
    },
    theme: {
      title: "主题色调",
      blue: "经典蓝",
      white: "纯净白",
      claude: "典雅黄"
    },
    lang: {
      title: "语言",
      zh: "中文",
      en: "English"
    },
    common: {
      save: "保存",
      saved: "已保存",
      cancel: "取消",
      edit: "编辑",
      delete: "删除",
      restore: "恢复",
      loading: "加载中...",
      empty: "暂无数据",
      actions: "操作",
      filter: "筛选",
      search: "查询",
      reset: "重置",
      all: "全部",
      status: "状态",
      confirm: "确认"
    },
    qsos: {
      title: "QSO 日志",
      filterTitle: "🔍 日志筛选",
      createTitle: "✍️ 录入新通联",
      editTitle: "编辑 QSO",
      cancelEdit: "取消编辑",
      call: "对方呼号 (CALL)",
      stationCallsign: "本台呼号 (STATION)",
      date: "通联日期 (UTC)",
      time: "通联时间 (UTC)",
      band: "波段 (BAND)",
      freq: "工作频率 (FREQ)",
      freqSelect: "选择常用/历史频率",
      freqPlaceholder: "例如 14.270 或 438.500",
      mode: "模式 (MODE)",
      rstSent: "发信 RST",
      rstRcvd: "收信 RST",
      comment: "备注信息",
      addBtn: "添加记录",
      saveBtn: "保存修改",
      exportAdif: "导出 ADIF",
      deleteConfirm: "确定要将此记录移入回收站吗？",
      empty: "暂无通联记录",
      dateFrom: "起始日期 (YYYYMMDD)",
      dateTo: "截止日期 (YYYYMMDD)",
      filterBtn: "应用筛选",
      resetBtn: "重置"
    },
    cards: {
      title: "已生成卡片",
      subtitle: "管理草稿、已就绪、已发布和已作废卡片。",
      create: "+ 生成新卡片",
      createNew: "生成新卡片",
      cardNo: "卡片",
      selectQso: "选择通联记录 (QSO)",
      selectTemplate: "选择卡片模板",
      generateBtn: "生成卡片预览",
      publishBtn: "发布卡片",
      voidBtn: "作废",
      voidConfirm: "确定要作废此卡片吗？作废后不可恢复。",
      empty: "暂无卡片记录",
      statusDraft: "草稿",
      statusReady: "就绪",
      statusPublished: "已发布",
      statusVoid: "已作废",
      publicView: "公开查验地址",
      viewCard: "查看卡片"
    },
    templates: {
      title: "卡片模板",
      subtitle: "设计与管理 QSL 卡片排版与背景图。",
      create: "+ 新建模板",
      editor: "模板设计器",
      name: "模板名称",
      dimensions: "画布尺寸",
      bgImage: "背景图片",
      uploadBg: "上传背景图",
      saveTemplate: "保存模板",
      empty: "暂无模板配置"
    },
    import: {
      title: "📥 ADIF 日志批量导入",
      subtitle: "支持标准 ADIF 3.x 格式日志文件（.adi / .adif），自动无损保留全部自定义扩展标签，支持千万级通联分块导入。",
      prompt: "请选择 ADIF 文件",
      parsing: "正在解析与上传 ADIF 日志...",
      success: "导入成功！",
      cancelled: "导入已取消",
      failed: "导入失败",
      cancelBtn: "取消导入",
      progress: "上传进度",
      chunks: "分块",
      records: "条通联",
      bucketReady: "就绪入库",
      bucketWarning: "软重复(警告)",
      bucketDuplicate: "完全重复(忽略)",
      bucketRejected: "格式错误(拒绝)"
    },
    stations: {
      title: "台站设置",
      subtitle: "管理默认台站和操作员信息。",
      callsign: "本台呼号",
      operator: "操作员呼号",
      grid: "网格坐标",
      isDefault: "设为默认台站",
      addBtn: "添加台站",
      saved: "台站已保存",
      existing: "现有台站",
      empty: "暂无台站配置",
      defaultBadge: "(默认)"
    },
    trash: {
      title: "回收站",
      subtitle: "查看和恢复已软删除的 QSO 记录。",
      empty: "回收站为空",
      restoreBtn: "恢复记录",
      restored: "记录已成功恢复"
    },
    lookup: {
      title: "🔍 索卡查验",
      subtitle: "输入对方呼号与通联日期（UTC）查验并下载已发布的 QSL 卡片。",
      call: "呼号 (Callsign)",
      date: "通联日期 (UTC, 格式 YYYYMMDD)",
      searchBtn: "查询卡片",
      searching: "正在查询...",
      results: "查验结果",
      notFound: "未查验到匹配的已发布 QSL 卡片",
      viewBtn: "查看卡片"
    },
    publicCard: {
      title: "电子 QSL 卡片",
      voidTitle: "卡片已作废",
      voidDesc: "此 QSL 卡片已被发卡方作废，不再有效。",
      download: "下载高清卡片 (PNG)",
      qsoDetails: "通联核验详情"
    },
    footer: {
      text: "myQSL — 业余无线电电子 QSL 卡片与通联系统",
      lookup: "公开查验",
      docs: "官方文档",
      qrz: "QRZ.com",
      eqsl: "eQSL.cc"
    }
  },
  en: {
    brand: {
      title: "myQSL",
      badge: "HAM Core",
      subtitle: "Amateur Radio Electronic QSL & Logbook System"
    },
    nav: {
      qsos: "QSO Logs",
      cards: "QSL Cards",
      templates: "Templates",
      import: "ADIF Import",
      stations: "Stations",
      trash: "Trash",
      lookup: "Card Lookup",
      print: "Vector Print",
      deliveries: "QRZ Delivery",
      integrations: "Integrations"
    },
    theme: {
      title: "Theme Tone",
      blue: "Tech Blue",
      white: "Minimal White",
      claude: "Elegant Amber"
    },
    lang: {
      title: "Language",
      zh: "中文",
      en: "English"
    },
    common: {
      save: "Save",
      saved: "Saved",
      cancel: "Cancel",
      edit: "Edit",
      delete: "Delete",
      restore: "Restore",
      loading: "Loading...",
      empty: "No data available",
      actions: "Actions",
      filter: "Filter",
      search: "Search",
      reset: "Reset",
      all: "All",
      status: "Status",
      confirm: "Confirm"
    },
    qsos: {
      title: "QSO Logbook",
      filterTitle: "🔍 Filter Logs",
      createTitle: "✍️ Log New QSO",
      editTitle: "Edit QSO",
      cancelEdit: "Cancel Edit",
      call: "Callsign (CALL)",
      stationCallsign: "Station Callsign",
      date: "QSO Date (UTC)",
      time: "Time On (UTC)",
      band: "Band (BAND)",
      freq: "Frequency (FREQ)",
      freqSelect: "Select Common / History Frequency",
      freqPlaceholder: "e.g. 14.270 or 438.500",
      mode: "Mode (MODE)",
      rstSent: "RST Sent",
      rstRcvd: "RST Received",
      comment: "Comments",
      addBtn: "Add Record",
      saveBtn: "Save Changes",
      exportAdif: "Export ADIF",
      deleteConfirm: "Move this QSO record to trash?",
      empty: "No QSO records found",
      dateFrom: "Date From (YYYYMMDD)",
      dateTo: "Date To (YYYYMMDD)",
      filterBtn: "Apply Filter",
      resetBtn: "Reset"
    },
    cards: {
      title: "Generated Cards",
      subtitle: "Manage draft, ready, published, and voided cards.",
      create: "+ New Card",
      createNew: "Generate New Card",
      cardNo: "Card",
      selectQso: "Select QSO Record",
      selectTemplate: "Select Template",
      generateBtn: "Generate Preview",
      publishBtn: "Publish Card",
      voidBtn: "Void",
      voidConfirm: "Void this card? This action cannot be undone.",
      empty: "No card records found",
      statusDraft: "Draft",
      statusReady: "Ready",
      statusPublished: "Published",
      statusVoid: "Voided",
      publicView: "Public URL",
      viewCard: "View Card"
    },
    templates: {
      title: "Card Templates",
      subtitle: "Design and manage card layouts and backgrounds.",
      create: "+ New Template",
      editor: "Template Designer",
      name: "Template Name",
      dimensions: "Dimensions",
      bgImage: "Background Image",
      uploadBg: "Upload Background",
      saveTemplate: "Save Template",
      empty: "No templates configured"
    },
    import: {
      title: "📥 ADIF Batch Log Import",
      subtitle: "Supports standard ADIF 3.x files (.adi / .adif), preserving all custom tags with chunked streaming.",
      prompt: "Please choose an ADIF file",
      parsing: "Parsing and uploading ADIF logs...",
      success: "Import successful!",
      cancelled: "Import cancelled",
      failed: "Import failed",
      cancelBtn: "Cancel Import",
      progress: "Upload Progress",
      chunks: "chunks",
      records: "records",
      bucketReady: "Ready",
      bucketWarning: "Soft Duplicate (Warning)",
      bucketDuplicate: "Duplicate (Skipped)",
      bucketRejected: "Rejected"
    },
    stations: {
      title: "Station Settings",
      subtitle: "Manage default station profiles and operators.",
      callsign: "Station Callsign",
      operator: "Operator Callsign",
      grid: "Grid Square",
      isDefault: "Set as default station",
      addBtn: "Add Station",
      saved: "Station saved",
      existing: "Configured Stations",
      empty: "No stations configured",
      defaultBadge: "(Default)"
    },
    trash: {
      title: "Trash Bin",
      subtitle: "View and restore soft-deleted QSO records.",
      empty: "Trash is empty",
      restoreBtn: "Restore",
      restored: "Record restored successfully"
    },
    lookup: {
      title: "🔍 QSL Card Lookup",
      subtitle: "Enter callsign and UTC date to verify and download published QSL cards.",
      call: "Callsign",
      date: "QSO Date (UTC, YYYYMMDD)",
      searchBtn: "Search Card",
      searching: "Searching...",
      results: "Lookup Results",
      notFound: "No matching published QSL cards found",
      viewBtn: "View Card"
    },
    publicCard: {
      title: "Electronic QSL Card",
      voidTitle: "Card Voided",
      voidDesc: "This QSL card has been voided by the issuer and is no longer valid.",
      download: "Download Card (PNG)",
      qsoDetails: "QSO Verification Details"
    },
    footer: {
      text: "myQSL — Amateur Radio Electronic QSL & Logbook System",
      lookup: "Public Lookup",
      docs: "Documentation",
      qrz: "QRZ.com",
      eqsl: "eQSL.cc"
    }
  }
} as const;

export type TranslationDictionary = typeof dictionaries.zh;

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationDictionary>;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = "myqsl_locale";

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {}
}

export function lookupKey(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const keys = key.split(".");
  let current: any = dictionaries[locale] || dictionaries.zh;
  for (const k of keys) {
    if (current && typeof current === "object" && k in current) {
      current = current[k];
    } else {
      let fallback: any = dictionaries.zh;
      for (const fk of keys) {
        if (fallback && typeof fallback === "object" && fk in fallback) {
          fallback = fallback[fk];
        } else {
          return key;
        }
      }
      current = fallback;
      break;
    }
  }

  if (typeof current !== "string") {
    return key;
  }

  if (!params) return current;

  let text = current;
  for (const [pKey, pVal] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
  }
  return text;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = getStorageItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      return saved;
    }
    return "zh";
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    setStorageItem(STORAGE_KEY, newLocale);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", newLocale);
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", locale);
    }
  }, [locale]);

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    return lookupKey(locale, key, params);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    return {
      locale: "zh",
      setLocale: () => {},
      t: (key: TranslationKey, params?: Record<string, string | number>) => lookupKey("zh", key, params)
    };
  }
  return context;
}

// IndexedDB 封装：本地存储报告数据、图片、签名与编号计数器
// IndexedDB wrapper: local storage for reports, images, signatures, numbering counters

const DB_NAME = "service_report_db";
const DB_VERSION = 1;
const STORE_REPORTS = "reports";
const STORE_COUNTERS = "counters";

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const store = db.createObjectStore(STORE_REPORTS, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("companyId", "companyId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_COUNTERS)) {
        db.createObjectStore(STORE_COUNTERS, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

// 获取某公司当天下一个序号（从1开始，2位数补零）
// Get next sequence number for a company on a given date (1-based, zero-padded to 2 digits)
async function getNextSequence(companyId, dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_COUNTERS, "readwrite");
    const store = t.objectStore(STORE_COUNTERS);
    const key = `${companyId}_${dateStr}`;
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      const current = getReq.result ? getReq.result.value : 0;
      const next = current + 1;
      store.put({ key, value: next });
      t.oncomplete = () => resolve(next);
      t.onerror = (e) => reject(e.target.error);
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

async function saveReport(report) {
  const store = await tx(STORE_REPORTS, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(report);
    req.onsuccess = () => resolve(report);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getReport(id) {
  const store = await tx(STORE_REPORTS, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function getAllReports() {
  const store = await tx(STORE_REPORTS, "readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      resolve(list);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteReport(id) {
  const store = await tx(STORE_REPORTS, "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

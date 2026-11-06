// 公司与工程师基础数据 / Company & Engineer master data
// 仅本地使用，无需网络请求 / Local-only, no network calls

const COMPANIES = [
  {
    id: "STD",
    nameCn: "赛斯太德（成都）科技有限公司",
    nameEn: "Sestrad (Chengdu) Technology Co., Ltd.",
    addressCn: "中国·四川·成都 锦华路三段88号汇融广场F座310",
    addressEn: "F-310, Huirong Plaza, No.88 Sec.3 Jinhua Rd, Chengdu, Sichuan, China",
    postalCode: "610041",
    phone: "028-67872705",
    fax: "028-83430477",
    hotline: "400-6060-798",
    logo: "icons/logos/logo-STD.png",
    bank: {
      accountName: "赛斯太德（成都）科技有限公司",
      bankName: "中国民生银行成都分行营业部",
      accountNo: "634380975",
      bankCode: "305651000108"
    }
  },
  {
    id: "ZKPY",
    nameCn: "中科谱研（成都）科技有限公司",
    nameEn: "Zhongke Puyan (Chengdu) Technology Co., Ltd.",
    addressCn: "中国·四川·成都 锦华路三段88号汇融广场F座310",
    addressEn: "F-310, Huirong Plaza, No.88 Sec.3 Jinhua Rd, Chengdu, Sichuan, China",
    postalCode: "610041",
    phone: "028-67872705",
    fax: "028-83430477",
    hotline: "400-6060-798",
    logo: "icons/logos/logo-ZKPY.png",
    bank: {
      accountName: "中科谱研（成都）科技有限公司",
      bankName: "中国民生银行股份有限公司成都分行",
      accountNo: "607395660",
      bankCode: "305651000108"
    }
  },
  {
    id: "SSTD",
    nameCn: "成都赛斯泰得科技有限公司",
    nameEn: "Chengdu Sestrad Technology Co., Ltd.",
    addressCn: "中国·四川·成都 锦华路三段88号汇融广场F座310",
    addressEn: "F-310, Huirong Plaza, No.88 Sec.3 Jinhua Rd, Chengdu, Sichuan, China",
    postalCode: "610041",
    phone: "028-67872705",
    fax: "028-83430477",
    hotline: "400-6060-798",
    logo: "icons/logos/logo-SSTD.png",
    bank: {
      accountName: "成都赛斯泰得科技有限公司",
      bankName: "中国民生银行股份有限公司成都天府支行",
      accountNo: "640401612",
      bankCode: "305651000884"
    }
  },
  {
    id: "YJC",
    nameCn: "成都市温江区源璟诚商贸部",
    nameEn: "Chengdu Wenjiang Yuanjingcheng Trading Firm",
    addressCn: "四川省成都市温江区天府街道科兴路西段199号",
    addressEn: "No.199 West Kexing Rd, Tianfu Subdistrict, Wenjiang District, Chengdu, Sichuan, China",
    phone: "13551226530",
    // 该公司没有提供邮编/传真/服务热线，留空即可，报告里对应几行会自动显示为空白
    // No postal code / fax / hotline were provided for this company — left blank;
    // the corresponding lines on the report render empty automatically.
    logo: "",
    bank: {
      accountName: "成都市温江区源璟诚商贸部（个体工商户）",
      bankName: "中国民生银行股份有限公司成都科华支行",
      accountNo: "644953432"
      // 未提供行号/Bank Code，留空即可，报告里这一行会自动不显示
      // No bank routing code was provided — left out; that line is omitted automatically on the report.
    }
  }
];

const ENGINEERS = [
  { name: "罗天", initials: "LT" },
  { name: "尹文宣", initials: "YWX" },
  { name: "何键", initials: "HJ" },
  { name: "李松涛", initials: "LST" },
  { name: "郭峰", initials: "GF" },
  { name: "黄正胜", initials: "HZS" }
];

const TAX_RATES = [0, 0.01, 0.06, 0.13];

function getCompanyById(id) {
  return COMPANIES.find((c) => c.id === id) || null;
}

function getEngineerByName(name) {
  return ENGINEERS.find((e) => e.name === name) || null;
}

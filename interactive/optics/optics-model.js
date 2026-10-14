(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OpticsModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SOURCES = {
    Cisco: 'https://www.cisco.com/c/en/us/products/collateral/interfaces-modules/transceiver-modules/data_sheet_c78-455693.html',
    Huawei: 'https://ekit.huawei.com/brand/en/product/sme-network/network-components/1620567648923877866',
    H3C: 'https://www.h3c.com/en/Support/Resource_Center/EN/Transceiver_Modules/Catalog/TM/TM/Technical_Documents/Install___Upgrade/Transceiver_Modules/H3C_UG-9681/202603/2792227_294551_0.htm',
    Juniper: 'https://www.juniper.net/documentation/us/en/hardware/lwc-hardware-guide/lwc/topics/topic-map/lwc-cable-transceiver-planning.html'
  };
  const COMPAT = {
    Cisco: 'https://www.cisco.com/c/en/us/support/interfaces-modules/transceiver-modules/series.html',
    Huawei: 'https://info.support.huawei.com/info-finder/',
    H3C: 'https://www.h3c.com/en/Support/Resource_Center/EN/Home/Public/00-Public/Technical_Documents/Install___Upgrade/Transceiver_Modules/H3C_S6800_S6860_Switch_Series_T-17986/',
    Juniper: 'https://apps.juniper.net/hct/'
  };
  const FIBERS = {
    OM3: {mode:'MMF', dbPerKm:3, label:'OM3 · 多模'},
    OM4: {mode:'MMF', dbPerKm:3, label:'OM4 · 多模'},
    OS2: {mode:'SMF', dbPerKm:0.35, label:'OS2 · 单模'}
  };
  function preset(id, vendor, model, kind, reach, power) {
    const base = {id,vendor,model,rate:10,form:'SFP+',kind,mode:kind==='SR'?'MMF':'SMF',connector:'LC',strands:kind.startsWith('BX')?1:2,
      tx:kind==='SR'?850:kind==='LR'?1310:kind==='BXD'?1330:1270,
      rx:kind==='SR'?850:kind==='LR'?1310:kind==='BXD'?1270:1330,reach,source:SOURCES[vendor]};
    return Object.assign(base,power || {txMin:null,txMax:null,rxMin:null,rxMax:null});
  }
  const srReach={OM3:300,OM4:400};
  const lrReach={OS2:10000};
  const C_SR={txMin:-7.3,txMax:-1.2,rxMin:-9.9,rxMax:-1};
  const C_LR={txMin:-8.2,txMax:0.5,rxMin:-14.4,rxMax:0.5};
  const CATALOG=[
    preset('c-sr','Cisco','SFP-10G-SR','SR',srReach,C_SR),
    preset('c-lr','Cisco','SFP-10G-LR','LR',lrReach,C_LR),
    preset('c-bxd','Cisco','SFP-10G-BXD-I','BXD',lrReach,C_LR),
    preset('c-bxu','Cisco','SFP-10G-BXU-I','BXU',lrReach,C_LR),
    Object.assign(preset('h-sr','Huawei','SFP-10G-SR','SR',{OM3:300}),{source:'https://info.support.huawei.com/info-finder/vue/en/enterprise/openSearch?area=recommend&keyword=S5755-H24UTM4X4Y2C+supported+Optical+Module'}),
    Object.assign(preset('h-lr','Huawei','SFP-10G-LR-I','LR',lrReach,C_LR),{source:'https://ekit.huawei.com/brand/en/product/sme-network/network-components/1620565693468705256'}),
    Object.assign(preset('h-bxd','Huawei','SFP-10G-BXD1','BXD',lrReach,C_LR),{source:'https://ekit.huawei.com/brand/en/product/sme-network/network-components/1620567648923877866'}),
    Object.assign(preset('h-bxu','Huawei','SFP-10G-BXU1','BXU',lrReach,C_LR),{source:'https://ekit.huawei.com/ekit/front/ssr/en/product/1620548447389942267'}),
    preset('h3-sr','H3C','SFP-XG-SX-MM850-A','SR',srReach),
    preset('h3-lr','H3C','SFP-XG-LX-SM1310','LR',lrReach,C_LR),
    preset('j-sr','Juniper','EX-SFP-10GE-SR','SR',srReach,{txMin:-7.3,txMax:-1,rxMin:-9.9,rxMax:-1}),
    preset('j-lr','Juniper','EX-SFP-10GE-LR','LR',lrReach,{txMin:-8.2,txMax:0.5,rxMin:-18,rxMax:0.5})
  ];
  const byId=Object.fromEntries(CATALOG.map(item=>[item.id,item]));
  function number(value, fallback) { const n=Number(value); return value==='' || value===null || value===undefined || !Number.isFinite(n)?fallback:n; }
  function moduleOf(endpoint) { return endpoint && (endpoint.moduleId==='custom'?endpoint.custom:byId[endpoint.moduleId]); }
  function evaluate(plan) {
    const a=moduleOf(plan.a), b=moduleOf(plan.b), grade=plan.fiberGrade, fiber=FIBERS[grade];
    const problems=[], cautions=[], passes=[];let incomplete=false;
    if (!a || !b) return {status:'unknown',problems:['请选择两端模块。'],cautions,passes,directions:[]};
    if (!fiber) return {status:'unknown',problems:['请选择光纤类型。'],cautions,passes,directions:[]};
    const length=number(plan.lengthM,NaN), connectors=number(plan.connectors,NaN), splices=number(plan.splices,NaN), connectorLoss=number(plan.connectorLoss,NaN), spliceLoss=number(plan.spliceLoss,NaN), reserve=number(plan.reserve,NaN);
    if (![length,connectors,splices,connectorLoss,spliceLoss,reserve].every(n=>Number.isFinite(n)&&n>=0)) return {status:'unknown',problems:['距离、接头/熔接数量和损耗都必须为非负数。'],cautions,passes,directions:[]};
    if (length===0) {cautions.push('请填写实际链路距离；0 米仅适合检查模块参数。');incomplete=true;}
    const aRate=number(a.rate,NaN), bRate=number(b.rate,NaN);
    if (!Number.isFinite(aRate)||!Number.isFinite(bRate)) {cautions.push('模块速率未填完整，无法核对。');incomplete=true;}
    else if(aRate!==bRate) problems.push('两端线路速率不一致。'); else passes.push(`线路速率一致：${aRate}G。`);
    for (const [label,m,endpoint] of [['A',a,plan.a],['B',b,plan.b]]) {
      if (!m.mode) {cautions.push(`${label} 端缺少单模/多模参数。`);incomplete=true;}
      else if (m.mode!==fiber.mode) problems.push(`${label} 端模块需要${m.mode==='MMF'?'多模':'单模'}光纤，与 ${grade} 不符。`);
      if (!m.form) {cautions.push(`${label} 端缺少模块外形参数。`);incomplete=true;}
      else if (endpoint.portForm && endpoint.portForm!==m.form) problems.push(`${label} 端设备端口为 ${endpoint.portForm}，模块为 ${m.form}，外形不匹配。`);
      if (!endpoint.hostModel || !endpoint.hostModel.trim()) cautions.push(`${label} 端未填写设备型号，无法核对设备支持列表。`);
      else cautions.push(`${label} 端 ${endpoint.hostModel.trim()} 的端口、固件及模块白名单须查官方兼容矩阵；本页不自动认证。`);
      const reach=number(m.reach&&m.reach[grade],NaN);
      if (!Number.isFinite(reach)||reach<=0) {cautions.push(`${label} 端模块没有 ${grade} 的标称距离数据，需查手册。`);incomplete=true;}
      else if (length>reach) problems.push(`${label} 端在 ${grade} 的标称最远距离为 ${reach} 米，当前为 ${length} 米。`);
    }
    if(!Number.isFinite(number(a.strands,NaN))||!Number.isFinite(number(b.strands,NaN))) {cautions.push('单纤/双纤参数未填完整。');incomplete=true;}
    else if(a.strands!==b.strands) problems.push('两端单纤/双纤类型不一致。');
    if(!a.connector||!b.connector) {cautions.push('模块光接口类型未填完整。');incomplete=true;}
    else if(a.connector!==b.connector) problems.push('两端模块接口类型不同，需要确认跳线适配方案。');
    const waves=[a.tx,a.rx,b.tx,b.rx].map(v=>number(v,NaN));
    if(!waves.every(Number.isFinite)) {cautions.push('两端收发波长未填完整，无法判断是否配对。');incomplete=true;}
    else if(waves[0]!==waves[3]||waves[2]!==waves[1]) problems.push('两端发送/接收波长没有交叉配对；单纤 BiDi 必须一上一下成对。');
    else passes.push(`波长配对：A 发 ${a.tx}/收 ${a.rx} nm，B 发 ${b.tx}/收 ${b.rx} nm。`);
    const attenuation=number(plan.attenuation, fiber.dbPerKm);
    if(!Number.isFinite(attenuation)||attenuation<0) return {status:'unknown',problems:['光纤每公里衰减必须为非负数。'],cautions,passes,directions:[]};
    const baseLoss=length/1000*attenuation+connectors*connectorLoss+splices*spliceLoss;
    const designLoss=baseLoss+reserve;
    const directions=[['A → B',a,b],['B → A',b,a]].map(([label,tx,rx])=>{
      const txMin=number(tx.txMin,NaN),txMax=number(tx.txMax,NaN),rxMin=number(rx.rxMin,NaN),rxMax=number(rx.rxMax,NaN);
      if (![txMin,txMax,rxMin,rxMax].every(Number.isFinite)) {cautions.push(`${label} 缺少光功率上下限；请补齐后再判断功率预算。`);incomplete=true;return {label,margin:null,overload:null};}
      const margin=txMin-designLoss-rxMin, overload=txMax-baseLoss-rxMax;
      if(margin<0) problems.push(`${label} 最差情况功率预算不足 ${Math.abs(margin).toFixed(2)} dB。`);
      if(overload>0) problems.push(`${label} 最大收光可能超出接收上限 ${overload.toFixed(2)} dB（短链路尤其需注意）。`);
      return {label,margin,overload};
    });
    const status=problems.length?'bad':incomplete?'incomplete':'pass';
    return {status,problems,cautions,passes,directions,baseLoss,designLoss,length,grade,attenuation};
  }
  return {CATALOG,FIBERS,SOURCES,COMPAT,byId,evaluate,moduleOf};
});

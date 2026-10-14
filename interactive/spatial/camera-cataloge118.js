/* Offline reference optics. Verify the exact suffix and regional revision before buying. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CameraCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MODELS = Object.freeze({
    custom: { name: '通用 / 自定义', kind: '自定义', url: '', lenses: [] },
    'hik-2cd2t46': {
      name: '海康 DS-2CD2T46G2-4IY', kind: '筒型枪机 · 4 MP',
      url: 'https://assets.hikvision.com/prd/public/all/doc/sm000058979/DS-2CD2T46G2-4IY-C_Datasheet_V5.7.2_20230218.pdf',
      lenses: [
        { id: '2.8', label: '2.8 mm · 广角', hFov: 103, vFov: 55, identifyM: 6 },
        { id: '4', label: '4 mm · 标准', hFov: 83, vFov: 45, identifyM: 8 },
        { id: '6', label: '6 mm · 较窄', hFov: 53, vFov: 28, identifyM: 12 }
      ]
    },
    'hik-2cd2146': {
      name: '海康 DS-2CD2146G2-I(SU)', kind: '半球 · 4 MP',
      url: 'https://www.hikvision.com/uk/products/IP-Products/Network-Cameras/Pro-Series-EasyIP-/ds-2cd2146g2-i-su-/',
      lenses: [
        { id: '2.8', label: '2.8 mm · 广角', hFov: 103, vFov: 55, identifyM: 6 },
        { id: '4', label: '4 mm · 标准', hFov: 83, vFov: 45, identifyM: 8 },
        { id: '6', label: '6 mm · 较窄', hFov: 53, vFov: 28, identifyM: 12 }
      ]
    },
    'hik-2cd2t86': {
      name: '海康 DS-2CD2T86G2-2I/4I', kind: '筒型枪机 · 8 MP',
      url: 'https://assets.hikvision.com/prd/public/all/doc/m000008196/DS-2CD2T86G2-2I_4I-C_Datasheet_20240806.pdf',
      lenses: [
        { id: '2.8', label: '2.8 mm · 广角', hFov: 111, vFov: 59, identifyM: 8.9 },
        { id: '4', label: '4 mm · 标准', hFov: 87, vFov: 47, identifyM: 9.9 },
        { id: '6', label: '6 mm · 较窄', hFov: 51, vFov: 28, identifyM: 14 }
      ]
    },
    'hik-2cd2646': {
      name: '海康 DS-2CD2646G2-IZS', kind: '电动变焦筒机 · 4 MP',
      url: 'https://assets.hikvision.com/prd/public/all/doc/sm000059181/DS-2CD2646G2-IZSC_Datasheet_20240422.pdf',
      lenses: [
        { id: '2.8', label: '2.8 mm · 广角端', hFov: 108, vFov: 56, identifyM: 6.4 },
        { id: '12', label: '12 mm · 长焦端', hFov: 30, vFov: 17, identifyM: 19 }
      ]
    }
  });
  const model = id => Object.hasOwn(MODELS, id) ? MODELS[id] : MODELS.custom;
  const lens = (modelId, lensId) => model(modelId).lenses.find(item => item.id === lensId) || null;
  const optics = (modelId, lensId) => {
    const selected = lens(modelId, lensId);
    return selected ? { modelId, lensId, fov: selected.hFov, vFov: selected.vFov, identifyRange: selected.identifyM } : null;
  };
  return { MODELS, model, lens, optics };
});

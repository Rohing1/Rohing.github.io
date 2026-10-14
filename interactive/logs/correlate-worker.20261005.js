importScripts('../ops-models.js');
self.onmessage = ({ data }) => {
  try {
    const result = OpsModels.timeline(data.records, data.shifts, data.request, data.order);
    const aggregates = OpsModels.aggregate(result, data.shifts);
    self.postMessage({ rows: result.map(r => ({ index: r.index, adjustedAt: r.adjustedAt, requestId: r.requestId })), clusters: aggregates.clusters.map(c => ({ key: c.key, count: c.count, sources: c.sources.size, sample: c.sample.index })), minutes: aggregates.minutes });
  } catch (error) { self.postMessage({ error: error.message }); }
};

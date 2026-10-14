importScripts('pcap-core.js');
self.onmessage = (event) => {
  try {
    const result = self.PcapCore.parseCapture(event.data.buffer, {maxPackets: 75000});
    self.postMessage({ok: true, result});
  } catch (error) {
    self.postMessage({ok: false, error: error instanceof Error ? error.message : '无法解析文件。'});
  }
};

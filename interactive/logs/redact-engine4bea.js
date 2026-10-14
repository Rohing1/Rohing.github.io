export const DEFAULT_RULES = Object.freeze({
  credentials: true, bearer: true, jwt: true, privateKey: true,
  email: true, ipv4: true, phone: true, literals: true
});

const patterns = {
  credentials: /((?:["']?)(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|session[_-]?id|access[_-]?key|client[_-]?secret)(?:["']?)\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
  bearer: /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi,
  jwt: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g,
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
  phone: /\b1[3-9]\d{9}\b/g
};

export function parseLiterals(text) {
  const phrases = [...new Set(String(text || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
  if (phrases.length > 20 || phrases.some(item => item.length < 2 || item.length > 100)) throw Error('自定义词最多 20 条，每条 2—100 个字符。');
  return phrases.sort((a, b) => b.length - a.length);
}

export function createSanitizer(rules = DEFAULT_RULES, phrases = []) {
  const enabled = { ...DEFAULT_RULES, ...rules };
  const custom = Array.isArray(phrases) ? phrases : parseLiterals(phrases);
  if (custom.length > 20 || custom.some(item => typeof item !== 'string' || item.length < 2 || item.length > 100)) throw Error('自定义词无效。');
  const counts = Object.fromEntries([...Object.keys(DEFAULT_RULES)].map(key => [key, 0]));
  let insideKey = false;
  const replace = (text, type, callback) => {
    if (!enabled[type]) return text;
    return text.replace(patterns[type], (...args) => { counts[type]++; return callback(...args); });
  };
  return {
    counts,
    line(input) {
      if (input.length > 200000) throw Error('存在超过 20 万字符的单行；为避免漏脱敏，未生成分享副本。请先拆分日志。');
      if (enabled.privateKey && (insideKey || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(input))) {
        const wasInside = insideKey;
        if (!wasInside) counts.privateKey++;
        insideKey = !/-----END [A-Z ]*PRIVATE KEY-----/.test(input);
        return wasInside ? '' : '[PRIVATE KEY BLOCK REDACTED]';
      }
      let output = input;
      if (enabled.credentials && /^\s*(?:Authorization|Cookie|Set-Cookie)\s*:/i.test(output)) {
        counts.credentials++;
        return output.replace(/^(\s*(?:Authorization|Cookie|Set-Cookie)\s*:).*$/i, '$1 [REDACTED]');
      }
      output = replace(output, 'bearer', (match, prefix) => prefix + '[REDACTED]');
      if (enabled.credentials) output = output.replace(/\b(Basic\s+)[A-Za-z0-9+/=]+/gi, (match, prefix) => { counts.credentials++; return prefix + '[REDACTED]'; });
      output = replace(output, 'credentials', (match, prefix, value) => prefix + (value.startsWith('"') ? '"[REDACTED]"' : value.startsWith("'") ? "'[REDACTED]'" : '[REDACTED]'));
      output = replace(output, 'jwt', () => '[JWT REDACTED]');
      output = replace(output, 'email', () => '[EMAIL]');
      output = replace(output, 'ipv4', () => '[IP]');
      output = replace(output, 'phone', () => '[PHONE]');
      if (enabled.literals) for (const phrase of custom) {
        let at = output.indexOf(phrase);
        if (at < 0) continue;
        const pieces = [];
        let start = 0;
        while (at >= 0) {
          pieces.push(output.slice(start, at), '[CUSTOM]');
          counts.literals++;
          start = at + phrase.length;
          at = output.indexOf(phrase, start);
        }
        pieces.push(output.slice(start));
        output = pieces.join('');
      }
      return output;
    },
    finish() {
      if (insideKey) throw Error('检测到未闭合的私钥块；为避免漏脱敏，未生成分享副本。');
      return { ...counts };
    }
  };
}

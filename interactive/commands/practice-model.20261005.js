const sources = {
  linux: 'https://man7.org/linux/man-pages/man8/ip.8.html',
  cisco: 'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9600/software/release/17-8/command_reference/b_178_9600_cr/interface_and_hardware_commands.html',
  ciscoVlan: 'https://www.cisco.com/c/en/us/td/docs/ios/lanswitch/command/reference/lsw_book/lsw_s2.html',
  huawei: 'https://info.support.huawei.com/hedex/api/pages/EDOC1100277644/AEM10221/04/resources/vrp/feature_0003997841.html',
  h3c: 'https://www.h3c.com/en/Support/Resource_Center/EN/Home/Security/00-Public/Reference_Guides/Command_References/H3C_IPS_Comware_7_CR%28R8560_R8660%29/09/202205/1607628_294551_0.htm'
};
const row = (platform, title, command, parameters, observe, output, source, scope) => ({ platform, title, command, parameters, observe, output, source, scope, mode: platform === 'Linux' ? '普通 shell；部分进程信息需要授权' : platform.startsWith('Cisco') ? 'EXEC；必要时特权 EXEC（#）' : '用户视图；权限依设备授权' });
export const GUIDES = [
  row('Linux','接口地址与状态','ip -br address show dev {{interface}}',{interface:['网络接口','eth0','token']},'先看接口是否 UP，再看地址和前缀。UP 不代表网关或业务可达。','eth0 UP 192.0.2.10/24',sources.linux,'iproute2；Linux，字段依版本变化'),
  row('Linux','查看到目标的选路','ip route get {{ip}}',{ip:['目标 IPv4','192.0.2.20','ip']},'核对 via 网关、dev 出接口、src 源地址。没有 via 可能是直连。此结果不证明整条路径可达。','192.0.2.20 dev eth0 src 192.0.2.10 uid 1000\n    cache',sources.linux,'iproute2；Linux'),
  row('Linux','查看邻居缓存','ip neigh show dev {{interface}}',{interface:['网络接口','eth0','token']},'STALE 不等于断网；INCOMPLETE / FAILED 需要结合二层链路和目标状态排查。','192.0.2.1 dev eth0 lladdr 02:00:00:00:00:01 STALE',sources.linux,'iproute2；Linux'),
  row('Linux','查询 TCP 监听端口','ss -ltnp sport = :{{port}}',{port:['端口','443','port']},'确认监听地址是 127.0.0.1 还是所有接口，以及对应进程。无输出可能是没监听或筛选不符。','LISTEN 0 511 0.0.0.0:443 0.0.0.0:* users:(("nginx",pid=1234,fd=6))','https://man7.org/linux/man-pages/man8/ss.8.html','iproute2 ss；查看其他用户进程通常需 root'),
  row('Linux','查看服务最近日志','journalctl -u {{service}} -n {{lines}} --no-pager',{service:['服务名','nginx','token'],lines:['行数','100','count']},'先定位首次错误，再关联重试与启动时间。日志可能包含业务信息，分享前脱敏。','Jan 01 09:00:00 demo nginx[1234]: service started','https://www.freedesktop.org/software/systemd/man/latest/journalctl.html','使用 systemd 的发行版；读取权限依日志配置'),
  row('Linux','查询 DNS A 记录','dig {{domain}} A',{domain:['域名','example.com','host']},'核对状态、ANSWER、TTL 和 SERVER。NXDOMAIN 与超时含义不同；缓存可能导致结果延迟。','example.com. 300 IN A 192.0.2.10','https://bind9.readthedocs.io/en/latest/manpages.html#dig-dns-lookup-utility','BIND dig；可能需安装 dnsutils / bind-utils'),
  row('Linux','查看文件系统容量','df -h {{path}}',{path:['目录 / 挂载点','/var/log','path']},'看 Use% 和可用量；容量充足仍可能 inode 耗尽，可配合 df -i。','Filesystem%20Size%20Used%20Avail%20Use%25%20Mounted%20on.html\n/dev/demo 100G 60G 40G 60% /','https://www.gnu.org/software/coreutils/manual/html_node/df-invocation.html','GNU coreutils；BSD 参数可能不同'),
  row('Linux','查看服务状态','systemctl status {{service}} --no-pager',{service:['服务名','nginx','token']},'核对 Active、退出码和最近日志。active 不代表业务接口健康。','nginx.service - demo service\n Active: active (running)','https://www.freedesktop.org/software/systemd/man/latest/systemctl.html','使用 systemd 的发行版'),
  row('Cisco IOS/IOS XE','查看三层接口摘要','show ip interface brief',{},'核对 IP、Status 与 Protocol；administratively down 表示管理关闭，不应未经授权直接启用。','Interface IP-Address OK? Method Status Protocol\nVlan10 192.0.2.1 YES manual up up',sources.cisco,'IOS XE 17.8 Catalyst 示例；不适用于所有 NX-OS / ASA 设备'),
  row('Cisco IOS/IOS XE','查看接口错误与流量','show interfaces {{interface}}',{interface:['接口','GigabitEthernet1/0/1','interface']},'核对链路、速率、双工和 CRC / input errors。计数通常自启动或清零累积，须比较时间差。','GigabitEthernet1/0/1 is up, line protocol is up\n Full-duplex, 1000Mb/s\n 0 input errors, 0 CRC',sources.cisco,'IOS XE 17.8 Catalyst 示例'),
  row('Cisco IOS/IOS XE','查看指定 VLAN','show vlan id {{vlan}}',{vlan:['VLAN ID','10','vlan']},'确认 VLAN 存在、状态与接入口；trunk 允许列表需另查接口，不以此表单独判断。','VLAN Name Status Ports\n10 DEMO active Gi1/0/1',sources.ciscoVlan,'IOS / IOS XE 交换机；具体命令能力依机型'),
  row('Cisco IOS/IOS XE','查看接口 VLAN 模式','show interfaces {{interface}} switchport',{interface:['接口','GigabitEthernet1/0/1','interface']},'区分 Administrative Mode 与 Operational Mode，核对 access VLAN、native VLAN 与 trunk 允许列表。','Administrative Mode: static access\nOperational Mode: static access\nAccess Mode VLAN: 10 (DEMO)',sources.cisco,'Catalyst 二层 switchport；路由接口不一定支持'),
  row('Huawei VRP','查看路由表','display ip routing-table',{},'核对 Destination/Mask、Proto、NextHop 和 Interface；只显示活动路由时，未入选路由需查询协议信息。','Destination/Mask Proto Pre Cost NextHop Interface\n192.0.2.0/24 Direct 0 0 192.0.2.1 Vlanif10',sources.huawei,'VRP 示例；参考 NetEngine 文档，交换机显示字段依型号变化'),
  row('Huawei VRP','查看目标路由','display ip routing-table {{ip}}',{ip:['目标 IPv4','192.0.2.20','ip']},'核对最长前缀匹配与出接口；有路由不代表 ACL、安全策略和回程路由均正确。','Destination/Mask Proto Pre Cost NextHop Interface\n192.0.2.0/24 Direct 0 0 192.0.2.1 Vlanif10','https://info.support.huawei.com/network/ptmngsys/Web/tsrev_s/en/content/s/10_edesk_Ping_Fail/edesk_Ping_Fail_edesk004.html','VRP；命令形式依软件版本核对'),
  row('H3C Comware','查看接口摘要','display interface brief',{},'分别看物理状态和协议状态。路由接口与桥接接口可能分表展示，不应把空表判断为设备故障。','Interface Link Protocol Main IP\nVlan-interface10 UP UP 192.0.2.1',sources.h3c,'Comware 7 R8560/R8660 示例；其他设备核对同系列手册'),
  row('H3C Comware','查看接口详细信息','display interface {{interface}}',{interface:['接口（带类型和编号）','GigabitEthernet1/0/1','interface']},'比较输入 / 输出错误、丢包、速率与链路状态。计数为累计值，不等同于当前每秒故障。','GigabitEthernet1/0/1\nCurrent state: UP\nLine protocol state: UP\nSpeed: 1000Mbps, Duplex: FULL',sources.h3c,'Comware 7；接口类型 / 编号形式依设备变化'),
  row('H3C Comware','查看活动 IPv4 路由','display ip routing-table',{},'核对路由来源、优先级、下一跳和出接口，并确认目的侧回程路由。','Destination/Mask Proto Pre Cost NextHop Interface\n192.0.2.0/24 Direct 0 0 192.0.2.1 Vlan-interface10','https://www.h3c.com/en/d_200706/205761_294551_0.htm','Comware 基础命令；链接为历史基础参考，使用前核对目标软件手册')
];
export function parameterValue(raw, type) {
  const s = String(raw).trim(); if (!s || s.length > 160) throw Error('参数不能为空或超过 160 字');
  if (!/^[A-Za-z0-9_.\/:@%+,-]+$/.test(s) || s.startsWith('-') || s.includes('..')) throw Error('参数仅允许安全字符，不能带空格、换行、引号、通配符或 shell 操作符');
  if (['port','count','vlan'].includes(type)) { const max = { port:65535, count:10000, vlan:4094 }[type]; if (!/^\d+$/.test(s) || +s < 1 || +s > max) throw Error(`数值应为 1～${max}`); }
  if (type === 'ip' && (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s) || s.split('.').some(x => +x > 255))) throw Error('IPv4 地址无效');
  if (type === 'path' && !s.startsWith('/')) throw Error('请输入绝对路径'); return s;
}
export function fillTemplate(template, values, specs = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (_, name) => parameterValue(values[name], specs[name]?.[2] || 'token'));
}
export const RUNBOOKS = {
  'Linux 业务端口不通': [0,1,2,3,7,4],
  'Linux 域名访问失败': [5,1,3,4],
  'Cisco 接口与 VLAN 排障': [8,9,10,11],
  '华为目标路由核对': [12,13],
  'H3C 链路与路由排障': [14,15,16]
};

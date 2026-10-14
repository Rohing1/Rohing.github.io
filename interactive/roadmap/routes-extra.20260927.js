'use strict';
// 只加载路线元数据；详细课程和练习在打开对应节点时按需加载。
(()=>{const parse=(id,rows,start=0)=>rows.trim().split('\n').map((line,i)=>{const[title,goals,practice,question,answer,lab]=line.split('|');return{id:id+'-'+(start+i+1),title,goals:goals.split('；'),practice,question,answer,lab,deep:true,pack:'extra'}});
for(const id of ['network','linux']){const r=LEARNING_ROUTES.find(x=>x.id===id);r.steps.forEach(s=>s.deep=true);r.steps.push(...parse(id,id==='network'?`
路由选择与路径设计|计算最长前缀匹配；检查双向路径；避免只改默认路由|在纸面拓扑中逐项匹配路由，注明请求与响应走向。|为什么默认网关正确仍可能绕路？|更具体路由、策略路由和回程可能改变实际路径。|route-specific
IPv6 与双栈排障|区分地址与路由；分别核对 A 与 AAAA；理解必要控制消息|在授权双栈测试环境分别记录 IPv4、IPv6 地址、路由和请求。|IPv4 正常能否证明双栈网站没有问题？|不能，IPv6 解析、路由、策略和服务需要分别验证。|dns-aaaa
链路质量与连接容量|读计数器增量；区分吞吐与时延；识别连接和端口资源上限|在模拟记录中计算丢包、错误增量和容量余量，写排障结论。|接口 up 是否足以证明网络健康？|不够，还需错误、丢包、时延、重传和业务结果。|link-errors
`:`
资源压力与进程边界|区分 CPU 与负载；理解内存和 I/O 压力；核对进程资源限制|用预设指标判断 CPU、交换、I/O 与句柄瓶颈，再选择对应证据。|CPU 低但负载高，为什么不能只扩 CPU？|负载也可能体现不可中断等待，应关联进程状态和 I/O 指标。|load-io
可靠调度与日志轮转|明确路径和环境；管理时区与退出码；验收日志重新打开|在测试目录比较交互运行与调度运行，记录实际环境和失败出口。|脚本手动运行正常能否保证定时运行成功？|不能，身份、环境、工作目录、时区和输入可能不同。|cron-env
变更安全与恢复验收|定义范围与回退；检查版本和依赖；按业务结果验收|为模拟配置变更编写小批验证、停止条件和回退检查表。|回退脚本执行成功是否等于业务恢复？|不是，还需验证配置、依赖、数据与实际业务指标。|systemd-env
`,6))}
LEARNING_ROUTES.push(
{id:'virtualization',name:'虚拟化与存储',icon:'▣',level:'进阶',intro:'把宿主、客体、网络、磁盘和恢复链串起来，理解“虚拟机还在线”之外的真实风险。',before:'先掌握 Linux 或 Windows 与网络基础；所有操作只在可还原测试环境。',resources:[['Microsoft · Hyper-V 文档','https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/overview','平台示例 / 官方文档'],['Microsoft · 检查点与差异链','https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/checkpoints','检查点行为 / 按实际版本核对']],steps:parse('virtualization',`
宿主与客体的责任边界|区分虚拟化层与操作系统；解释共享资源；关联两侧证据|画出两台虚拟机到宿主资源的依赖图。|客体正常是否说明宿主所有依赖正常？|不能，客体未必看到宿主容量、调度、物理网络与存储风险。|cpu-steal
资源分配与容量规划|理解承诺与实际用量；计算余量；识别 CPU 争用|按预设负载表计算容量预算，比较平均负载与峰值需求。|分配更多 vCPU 是否必然提高性能？|不一定，需评估宿主争用、调度与应用并行能力。|cpu-steal
虚拟磁盘与存储可靠性|区分逻辑和物理容量；理解精简分配；辨认 RAID 与备份|计算存储池余量与承诺量，制定容量和独立备份监控。|RAID 冗余能否替代历史备份？|不能，它不能解决误删除、历史版本与共因故障。|thin-overcommit
快照、检查点与备份|理解差异链依赖；评估一致性；规划合并风险|把基础盘和差异盘画成依赖链，为受控合并写检查表。|直接删除差异盘文件是清理快照的正确方式吗？|不是，必须使用平台受控流程并验证链与备份。|snapshot-growth
虚拟网络与迁移条件|区分虚拟交换机与物理上联；检查 VLAN；验证目标宿主依赖|比较迁移前后网络与存储条件，识别缺失 VLAN 的目标宿主。|迁移任务成功是否证明业务网络正常？|不是，目标网络、存储、策略和应用都需验收。|trunk-allowed
隔离恢复与可用性验收|核对恢复依赖；控制外发副作用；测量恢复目标|设计一个禁止生产写入的恢复网络，列出密钥、日志和外部依赖。|恢复副本启动就能证明达到业务 RTO 吗？|不能，RTO 验收须包含完整业务与依赖恢复。|restore-contamination
`)},
{id:'cloud',name:'云平台基础',icon:'☁',level:'进阶',intro:'用厂商中立的思路理解云资源、私网、安全边界、存储、负载均衡和成本治理。',before:'先掌握 IP、路由与基本系统管理；练习为本地模拟，不创建或购买任何云资源。',resources:[['AWS · VPC 安全组','https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html','平台示例，不代表所有云语义相同'],['Microsoft · 云计算基础','https://learn.microsoft.com/en-us/training/paths/microsoft-azure-fundamentals-describe-cloud-concepts/','概念阅读 / 可切换中文']],steps:parse('cloud',`
区域、可用区与故障域|区分资源归属与故障域；识别共享依赖；设计可用性目标|画出跨可用区服务依赖图，找出仍然单点的数据库。|分散应用副本是否消除了所有单点？|没有，数据库、入口、存储、身份和区域级依赖仍需评估。|lb-unhealthy
VPC、子网与出口|区分路由与访问控制；理解私网出站；核对双向通路|沿私网实例到出口逐跳检查路由、关联与最小规则。|创建 NAT 网关后所有子网会自动出网吗？|不是，关联、路由、安全控制和外部通路需共同成立。|cloud-nat-route
对象、块与文件存储|按访问语义选存储；理解版本与保留；核对恢复依赖|为静态资源、系统盘与共享目录选择合适存储语义。|对象当前可读是否说明旧版本能恢复？|不能，需要当时的版本、留存或独立历史副本。|object-version
负载均衡与健康检查|区分监听与后端就绪；配置检查条件；核对访问来源|从预设探测记录判断路径、状态与后端流量资格。|TCP 可连接是否一定意味着应用可处理业务？|不一定，健康语义要符合业务依赖和可用性要求。|lb-unhealthy
身份、权限与秘密|核对主体动作资源条件；理解有效拒绝；管理凭据轮换|根据模拟权限记录判断允许范围，不记录真实 AK 或口令。|一条 Allow 能否保证最终允许？|不能，还需结合平台有效策略、显式拒绝和其他边界。|iam-deny
配额、费用与资源治理|区分余额与配额；计算预算；防止重复创建和遗留资源|给测试资源加用途与负责人标签，计算虚构月度预算和余量。|预算告警是否一定自动阻止继续计费？|不一定，取决于平台与配套动作，需确认实际机制。|quota-api
`)});
window.EXTRA_DEEP_IDS=LEARNING_ROUTES.flatMap(r=>r.steps.filter(s=>s.pack==='extra').map(s=>s.id));
})();

'use strict';
const action=(id,label,command,output,required=false,risk=false)=>({id,label,command,output,required,risk});
window.LAB_SCENARIOS=[
{id:'dns',title:'域名打不开，IP 却能访问',topic:'网络',level:'入门',story:'测试门户刚迁移到新地址 192.0.2.20。用户访问 portal.example.test 失败，但带正确 Host 的新地址测试正常。',goal:'找出域名访问与新服务器直连结果不同的原因。',hint:'先比较解析结果与迁移后的目标地址。',actions:[
action('resolve','查询域名解析','nslookup portal.example.test','Name: portal.example.test\nAddress: 192.0.2.10\n迁移记录要求目标为 192.0.2.20',true),
action('direct','固定解析访问新服务器','curl%20--resolve%20portal.example.test_80_192.0.2.20%20http_/portal.example.test/index.html','HTTP/1.1 200 OK\nX-Backend: new-server\n测试首页内容正常。',true),
action('authoritative','核对权威记录','查看测试 DNS 控制台（模拟）','A 记录仍为 192.0.2.10；TTL 300；权威记录尚未更新。',true),
action('cpu','查看新服务器 CPU','top -b -n 1','CPU idle: 93%；内存可用；服务进程正常。'),
action('unsafe','清空全部防火墙规则','高风险操作（仅模拟）','风险提示：会扩大服务暴露范围，且没有证据表明防火墙是根因。',false,true)],diagnoses:[['权威 DNS A 记录仍指向旧地址',true,'权威记录和客户端解析一致地指向旧地址，新目标带正确 Host 可正常响应。'],['新服务器 CPU 满载',false,'CPU 有余量，且固定解析请求正常。'],['必须关闭客户端证书检查',false,'本场景是 HTTP 与地址解析问题，没有证书故障证据。']],fixes:[['核对变更后更新目标 A 记录，并按 TTL 检查解析与访问',true,'在测试 DNS 中修正单条记录，考虑缓存收敛并做请求验证。'],['重装新服务器系统',false,'影响很大且没有针对地址记录这个根因。'],['删除所有 DNS 区域',false,'会破坏其他域名解析，远超所需变更范围。']],verify:'权威 A → 192.0.2.20；缓存收敛后客户端解析一致；域名请求返回 200。',lesson:'对比域名路径和固定目标路径，再核对权威记录。刷新浏览器不等于修正权威 DNS。',route:'network-3'},
{id:'listen',title:'服务运行中，但远程连接被拒绝',topic:'系统',level:'入门',story:'测试 Linux 主机上新部署了 8080 服务。systemd 显示 running，远程电脑连接却被拒绝。',goal:'区分进程存活、监听地址与远程可达性。',hint:'观察监听地址，而不只是进程是否存在。',actions:[
action('status','查看服务状态','systemctl status demo-web','Active: active (running)\nMain PID: 2408'),
action('socket','查看 8080 监听','ss -lntp | grep :8080','LISTEN 127.0.0.1:8080 users:(demo-web,pid=2408)',true),
action('local','从本机回环发请求','curl%20http_/127.0.0.1_8080/index.html','HTTP 200；测试内容正常。',true),
action('policy','核对网络接口和入站策略','检查测试接口与 8080 入站规则（模拟）','测试网卡：192.0.2.30\n允许来源：192.0.2.0/24\n规则已启用；目标接口没有 8080 监听。',true),
action('unsafe','直接关闭整个防火墙','高风险操作（仅模拟）','服务只监听回环，关闭防火墙不能把它变成外部接口监听，反而增加风险。',false,true)],diagnoses:[['服务只绑定到 127.0.0.1',true,'回环响应正常，而外部接口没有监听，说明绑定范围不符合访问需求。'],['服务进程完全没有启动',false,'状态与回环 HTTP 请求都证明服务正在运行。'],['客户端浏览器字体错误',false,'字体不会解释 TCP 连接拒绝。']],fixes:[['将监听绑定到所需测试接口，保留来源限制并验证配置后重启服务',true,'只调整必要绑定与访问范围，实际环境应按授权和回退流程操作。'],['开放全部来源和全部端口',false,'既没解决绑定问题，也扩大暴露范围。'],['反复刷新浏览器但不改监听',false,'不能改变服务端监听地址。']],verify:'192.0.2.30:8080 出现监听；允许来源远程请求 200；非允许来源仍受限制。',lesson:'running 不等于远程可用。依次验证进程、监听、策略与实际请求。',route:'linux-4'},
{id:'inode',title:'磁盘有空闲，却无法创建文件',topic:'存储',level:'入门',story:'测试服务器创建文件时报 No space left on device，但容量监控显示磁盘只用了 48%。',goal:'识别字节容量以外的文件系统资源。',hint:'df 和 df -i 衡量的不是同一种资源。',actions:[
action('bytes','查看字节容量','df -h /var','/dev/vda2  Size 40G  Used 19G  Avail 19G  Use% 48%',true),
action('inodes','查看 inode','df -i /var','Inodes 2621440  IUsed 2621440  IFree 0  IUse% 100%',true),
action('count','定位小文件来源','检查文件数量与生命周期（模拟统计）','/var/cache/demo：约 260 万个小文件\n缓存过期回收任务已停用一周。',true),
action('memory','检查内存','free -h','Mem available: 3.2 GiB；没有明显内存压力。'),
action('unsafe','递归删除整个 /var','高风险操作（仅模拟）','会破坏日志、服务数据和包管理等内容，不能把广泛删除当作定位手段。',false,true)],diagnoses:[['缓存小文件耗尽 inode',true,'inode 用尽且小文件集中在缓存目录，字节剩余不解决 inode 不足。'],['物理磁盘容量已经全部写满',false,'df 显示仍有可用字节，关键限制是 inode。'],['需要给用户授予 777 权限',false,'权限不会增加 inode 资源，也会扩大访问范围。']],fixes:[['确认缓存可再生后清理过期对象，恢复回收任务并监控 inode',true,'核对范围和保留需求，避免删除业务文件；处理产生原因。'],['删除根目录全部文件',false,'严重破坏系统，超出任务范围。'],['仅增加浏览器缓存',false,'不能缓解服务端 inode 耗尽。']],verify:'过期缓存按保留策略清理后，inode 占用降至 38%；新文件创建成功；定时回收恢复。',lesson:'容量排查要同时看字节、inode、配额、权限和具体报错；清理必须限制范围。',route:'linux-5'},
{id:'tls',title:'HTTPS 出现主机名证书警告',topic:'网站',level:'入门',story:'新发布的测试网站使用 https://portal.example.test/，浏览器提示证书名称不匹配。',goal:'理解加密连接中的服务器身份验证。',hint:'比较 URL 的主机名与证书 SAN。',actions:[
action('name','查看请求主机名','检查浏览器地址与开发者工具（模拟）','请求主机名：portal.example.test\n错误：CERT_COMMON_NAME_INVALID',true),
action('cert','核对证书与 SNI','openssl s_client -connect 192.0.2.40:443 -servername portal.example.test','当前站点返回证书 SAN：old.example.test\n证书有效期未过；测试信任链验证正常。',true),
action('binding','查看 HTTPS 绑定配置','查看测试 Web 站点绑定（模拟）','portal.example.test 的 443 绑定引用了旧站点证书。',true),
action('time','检查时间','date -u','UTC 时间同步正常。'),
action('unsafe','关闭所有证书校验','高风险操作（仅模拟）','会弱化服务器身份验证，不应作为正式修复。',false,true)],diagnoses:[['站点绑定使用了不匹配主机名的证书',true,'主机名不在返回证书 SAN 中，且绑定指向旧证书。'],['必然是服务器时间错误',false,'模拟时间与有效期正常，错误明确指向名称。'],['需要永久改为明文 HTTP',false,'不解决正确部署证书的需求，并降低传输保护。']],fixes:[['给正确站点绑定覆盖目标主机名的可信证书，并验证完整链和 SNI',true,'同时检查有效期与实际响应的证书，避免只看磁盘上的证书文件。'],['让用户长期忽略证书警告',false,'绕过身份验证不是根因修复。'],['只换网页字体',false,'字体与证书身份不相关。']],verify:'返回证书 SAN 含 portal.example.test；信任链、有效期和主机名验证通过；HTTPS 请求正常。',lesson:'证书文件存在不等于站点实际返回正确证书。校验主机名、信任链、有效期与绑定。',route:'web-4'},
{id:'firewall',title:'公网映射已配，访问仍然超时',topic:'网络',level:'进阶',story:'测试边界映射 198.51.100.20:8443 到 192.0.2.50:443。内网请求正常，授权外部测试来源访问超时。',goal:'按实际链路定位规则、映射与应用问题。',hint:'有 NAT 映射不表示入站安全规则已经允许。',actions:[
action('internal','内网带主机名访问','curl%20--resolve%20portal.example.test_443_192.0.2.50%20https_/portal.example.test/index.html','HTTP 200；应用正常；目标接口监听 443。',true),
action('nat','核对映射与目标','查看测试 DNAT 配置（模拟）','198.51.100.20:8443 → 192.0.2.50:443\n映射目标与服务一致。',true),
action('logs','查看边界访问日志','检查授权测试源的规则命中（模拟）','来源 203.0.113.25 → 公网 8443\n最终动作：DENY；命中默认拒绝\n当前设备先按公网目标匹配入站策略，再执行 DNAT。',true),
action('route','核对服务器回程','ip route','默认回程网关为同一测试边界；没有非对称路径证据。'),
action('unsafe','设置任意到任意允许','高风险操作（仅模拟）','会开放无关访问，应按照设备处理顺序精确匹配来源与目标。',false,true)],diagnoses:[['授权来源没有匹配到对应入站允许规则',true,'模拟设备明确记录默认拒绝，内部服务与映射均正常。'],['所有 NAT 技术都无法承载 HTTPS',false,'HTTPS 可以通过合适映射和规则访问。'],['必须关闭应用身份认证',false,'连接尚未通过边界，关闭认证与此根因无关。']],fixes:[['按设备实际处理顺序添加授权来源到目标 8443 的限定允许规则，再检查命中与回程',true,'不同设备的 NAT 前后匹配口径不同，需要按实际产品与日志验证。'],['直接允许任意来源到所有内部主机',false,'扩大暴露范围，缺少最小权限。'],['仅重启用户电脑',false,'不会修正边界拒绝规则。']],verify:'授权来源命中限定允许规则；映射目标正确；HTTPS 请求 200；其他来源继续拒绝。',lesson:'映射与安全规则是不同环节，地址匹配口径依设备处理顺序，不能套用一个万能规则。',route:'network-5'},
{id:'deleted',title:'日志删了，磁盘空间却没回来',topic:'存储',level:'进阶',story:'测试服务日志占用很大。运维误删当前日志后，du 看起来很小，df 仍然显示 96% 使用率。',goal:'解释文件名已删除与打开引用之间的区别。',hint:'比较 df、du，再查被进程持有的 deleted 文件。',actions:[
action('usage','对比 df 与 du','df -h /var; du -sh /var/log','df：40G 中使用 38G；du：/var/log 只有 700M',true),
action('open','检查已删除但打开的文件','lsof +L1','demo-web  PID 3201  FD 5w  SIZE 31G\n/var/log/demo/current.log (deleted)',true),
action('lifecycle','核对应用日志机制','查阅测试服务日志重开配置（模拟）','服务支持受控日志重新打开；当前日志轮转任务未配置。',true),
action('inode','检查 inode','df -i /var','inode 使用 12%，不是本场景瓶颈。'),
action('unsafe','不检查就强制杀死全部进程','高风险操作（仅模拟）','可能中断其他服务和写入，应优先按应用支持的方式处理引用。',false,true)],diagnoses:[['已删除日志仍被进程打开，空间尚未释放',true,'lsof 的 deleted 引用和大小解释了 df 与 du 的差异。'],['浏览器缩放比例导致磁盘满',false,'显示设置不会造成文件系统空间占用。'],['inode 已全部耗尽',false,'inode 使用仅 12%。']],fixes:[['按该服务支持的方式受控重新打开日志，必要时维护窗口重启，并配置轮转',true,'避免猜测通用信号；先核对具体应用文档和业务影响。'],['继续删除无关目录直到 df 下降',false,'可能破坏业务，且未处理打开引用。'],['永久禁用所有日志',false,'会丧失故障和安全证据，应设置合理轮转与保留。']],verify:'旧 deleted 引用关闭；df 使用率降至 19%；新日志继续正常写入；轮转策略生效。',lesson:'df 看文件系统分配，du 遍历可见路径。删除名称后，最后的打开引用关闭前可能仍占空间。',route:'linux-5'},
{id:'pool',title:'请求变慢，但 CPU 很空闲',topic:'应用',level:'进阶',story:'测试应用高峰时大量请求等待，CPU 只有 18%。用户反馈超时，应用没有明显崩溃。',goal:'避免只看 CPU，分析排队与依赖等待。',hint:'看等待队列和连接占用的生命周期。',actions:[
action('metrics','查看请求与连接池指标','读取测试应用指标（模拟）','池上限 20；active 20；idle 0；等待请求 160\nCPU 18%；P95 延迟 12 秒',true),
action('trace','查看慢请求调用链','检查请求追踪（模拟）','约 11 秒耗在等待数据库连接；实际查询约 45 ms。',true),
action('code','核对近期变更与连接释放','查看测试变更记录（模拟）','异常分支漏掉连接归还；复现实验多次异常后池内借出连接不回落。',true),
action('dns','检查 DNS','nslookup db.example.test','解析稳定，连接建立时延约 2 ms。'),
action('unsafe','把连接池无限增大','高风险操作（仅模拟）','泄漏会继续消耗资源，可能压垮数据库；不是根因修复。',false,true)],diagnoses:[['异常路径连接未释放，导致池耗尽和等待',true,'指标、追踪和可复现的连接不归还形成完整证据链。'],['必然因为 CPU 核数太少',false,'等待连接是主要耗时，CPU 有余量。'],['查询本身都需要 12 秒',false,'实际查询约 45 ms，主要时间在取连接前排队。']],fixes:[['修复所有路径的连接释放，回归异常场景，并按数据库容量设置池与超时',true,'先解决泄漏，再根据实际容量调优并监控等待。'],['只永久提高用户请求超时',false,'可能让等待堆积更大，没有修复连接泄漏。'],['删除数据库全部索引',false,'无相关证据，且可能严重降低查询效率。']],verify:'异常回归后借出连接能归还；池等待回落；查询与 P95 延迟恢复；数据库连接数在安全范围。',lesson:'低 CPU 也可能严重超时。分析等待、队列和资源生命周期，而不是只增加硬件。',route:'database-4'},
{id:'readiness',title:'Pod 在运行，Service 却无可用后端',topic:'容器',level:'挑战',story:'测试集群新版本发布后，Pod 显示 Running，但 Service 无可用 endpoint，访问失败。',goal:'区分容器运行状态和流量就绪。',hint:'Running 与 Ready 不同；核对探针实际访问的路径。',actions:[
action('pod','查看 Pod 就绪状态','kubectl get pods','NAME demo-web  READY 0/1  STATUS Running  RESTARTS 0',true),
action('events','查看事件与探针','kubectl describe pod demo-web','Readiness probe failed: HTTP 404\n探针路径：/readyz\n端口：8080',true),
action('app','核对版本健康接口','查看测试应用健康端点（模拟）','新版本就绪接口为 /health/ready → 200\n/readyz → 404；依赖检查正常。',true),
action('selector','核对 selector 与标签','检查 Service 标签选择器（模拟）','selector app=demo-web；Pod 标签匹配；空端点原因是未就绪。'),
action('unsafe','永久移除所有健康检查','高风险操作（仅模拟）','可能把真正未就绪实例送入流量，应该修正探针而非去掉全部保护。',false,true)],diagnoses:[['Readiness 路径与新版本接口不一致',true,'探针 404、实际健康端点 200 和未就绪状态共同指向路径错误。'],['Running 表示所有请求肯定正常',false,'进程运行不代表就绪或依赖可用。'],['Service selector 一定不匹配',false,'已检查标签匹配，不应忽略探针明确报错。']],fixes:[['在声明配置中修正就绪路径，验证新版本后进行受控滚动更新',true,'保留真正的依赖就绪判断，核对路径、端口与阈值。'],['只把所有 Pod 状态文字改成 Ready',false,'状态由控制机制决定，不能靠修改显示文字解决。'],['删除所有节点',false,'严重扩大影响，不针对探针配置。']],verify:'探针响应 200；Ready 1/1；Service 端点恢复；通过 Service 的业务请求成功。',lesson:'看 READY、事件与端点，不只看 STATUS。就绪探针与存活探针的处理不同。',route:'container-5'},
{id:'upstream',title:'反向代理返回 502',topic:'网站',level:'进阶',story:'测试 Nginx 配置更新后入口返回 502。后端应用刚从 8000 改到 9000 端口。',goal:'把入口错误与上游连接证据关联起来。',hint:'比较实际监听端口与代理配置目标。',actions:[
action('response','观察入口响应','curl%20-I%20http_/portal.example.test/index.html','HTTP/1.1 502 Bad Gateway\nServer: nginx'),
action('error','查看代理错误日志','读取测试 Nginx error.log（模拟）','connect()%20failed%20(111_%20Connection%20refused).html\nupstream: http://127.0.0.1:8000/',true),
action('socket','核对后端监听','ss -lntp','demo-api LISTEN 127.0.0.1:9000\n8000 无监听；curl 9000 /health → 200',true),
action('config','核对 upstream 配置','查看生效的测试代理配置（模拟）','upstream backend { server 127.0.0.1:8000; }',true),
action('unsafe','删掉所有代理配置直接上线','高风险操作（仅模拟）','会破坏其他站点和路由，应只改目标配置并验证与回退。',false,true)],diagnoses:[['代理仍指向旧的 8000 端口',true,'错误日志、实际监听与生效配置形成一致证据。'],['所有用户密码同时错误',false,'没有认证失败证据，代理无法连接上游。'],['CSS 字体资源过大',false,'不能解释上游 TCP 连接拒绝。']],fixes:[['按变更记录修正 upstream 端口，检查配置后受控 reload 并验证入口',true,'保留备份，验证配置语法和业务请求，异常时回退。'],['永久关闭服务器所有安全控制',false,'与端口不一致无关，也增加风险。'],['只延长浏览器等待时间',false,'拒绝连接不会因浏览器多等待而恢复正确端口。']],verify:'代理目标改为 9000；配置检查通过；入口和健康请求 200；错误日志无新增同类连接失败。',lesson:'502 的原因不能只靠状态码猜测，结合代理日志、上游监听与生效配置。',route:'web-6'},
{id:'assets',title:'页面首开慢，但服务器响应很快',topic:'网站',level:'挑战',story:'测试首页第一次打开需要很久。首个 HTML 的响应只用 110 ms，用户仍等数秒才能看到主要内容。',goal:'区分响应等待、资源下载和渲染阻塞。',hint:'首个文档快不等于首屏快；看网络瀑布与关键资源。',actions:[
action('document','查看文档时间','读取测试浏览器 Network（模拟）','HTML：TTFB 110 ms；大小 24 KB；状态 200',true),
action('waterfall','查看关键资源瀑布','检查首屏请求链（模拟）','同步 main.js：3.8 MB；下载 4.2 s\n首屏背景 PNG：9.6 MB；下载 5.1 s\n脚本执行前主要内容保持隐藏。',true),
action('profile','分析脚本用途与执行','读取性能记录与模块清单（模拟）','脚本捆绑了不在首页使用的 PDF、图像编辑库；主要内容等待全部初始化。',true),
action('server','检查服务器 CPU','查看测试服务器指标（模拟）','CPU 12%，后端无队列；HTML 响应稳定。'),
action('unsafe','不测量就要求用户购买更高带宽','无证据决策（仅模拟）','先定位关键资源和初始化，不应把成本推给用户或凭空升级基础设施。',false,true)],diagnoses:[['重资源与同步初始化阻塞首屏',true,'文档快，关键大文件与等待初始化解释了首次加载慢。'],['一定是数据库慢查询',false,'HTML TTFB 稳定且没有后端等待证据。'],['必须取消所有网站图片',false,'可以有针对性编码、按需加载与调整阻塞，不需要全删。']],fixes:[['按页面加载非首屏功能库，优化首屏图并让正文独立于重模块显示，再复测',true,'对比冷缓存与热缓存的实际指标，保持功能和图片可读性。'],['仅反复刷新直到缓存命中',false,'不能解决首次访问体验。'],['给每篇文章预加载全部功能库',false,'会扩大下载和执行成本。']],verify:'首页只载必要资源；主要内容无需等重模块；同条件冷缓存首屏时间显著下降；功能页按需加载仍正常。',lesson:'速度要分冷缓存和热缓存，分析 TTFB、关键路径、下载与主线程，不靠单一指标判断。',route:'web-5'},
].map(s=>({...s,diagnoses:s.diagnoses.map(([text,correct,why],i)=>({id:'d'+i,text,correct,why})),fixes:s.fixes.map(([text,correct,why],i)=>({id:'f'+i,text,correct,why}))}));

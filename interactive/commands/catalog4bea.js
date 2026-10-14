// Short original descriptions, not a copy of vendor manuals. Each row is an executable
// example or syntax pattern; distinct-command counts are calculated separately.
const GROUPS = [
  ['Linux', '文件与目录', 'read', 'https://www.gnu.org/software/coreutils/manual/coreutils.html', `pwd|显示当前目录
ls|列出目录内容
ls -lah|按易读大小显示含隐藏文件的详细列表
ls -lt|按修改时间排序
cd /path/to/dir|切换工作目录
find /var/log -type f -name '*.log'|按名称查找日志文件
find . -type f -mtime -1|查找近一天修改的文件
find . -maxdepth 2 -type d|限定深度查找目录
stat file.txt|查看文件元数据和时间戳
file archive.tar.gz|判断文件类型
du -sh /var/log|统计目录占用
du -h --max-depth=1 .|查看当前目录各子目录占用
df -h|查看文件系统剩余空间
df -i|查看 inode 使用情况
realpath file.txt|解析为绝对路径
readlink -f link|解析符号链接最终目标
basename /path/to/file.txt|取路径末尾文件名
dirname /path/to/file.txt|取路径的父目录
tree -L 2|树状展示两级目录（需安装 tree）
locate filename|用索引查找文件（需安装 locate）
which python3|查看 PATH 中命令位置
type cd|判断命令是内建、别名还是程序`],
  ['Linux', '文件内容与文本', 'read', 'https://www.gnu.org/software/coreutils/manual/coreutils.html', `cat file.txt|输出文件内容
less file.txt|分页阅读文件
head -n 30 file.txt|查看前 30 行
tail -n 30 file.txt|查看后 30 行
tail -F /var/log/syslog|按文件名持续追踪日志
wc -l file.txt|统计行数
sort file.txt|逐行排序
sort -u file.txt|排序并去重
uniq -c file.txt|统计相邻重复行，先排序
cut -d: -f1 /etc/passwd|提取冒号分隔的第一列
paste file1 file2|逐行横向合并文件
tr '[:upper:]' '[:lower:]'|把标准输入转成小写
grep -n 'ERROR' app.log|带行号搜索文本
grep -Rin 'listen' /etc/nginx|递归忽略大小写搜索
grep -E 'ERROR|WARN' app.log|扩展正则搜索多种关键字
sed -n '10,30p' file.txt|打印第 10 到 30 行
awk -F, '{print $1}' data.csv|按逗号分列取第一列
awk '{sum+=$1} END {print sum}' data.txt|累加第一列数值
jq '.items[] | .name' data.json|提取 JSON 字段（需安装 jq）
diff -u old.txt new.txt|以统一格式对比文件
cmp file1 file2|逐字节比较文件
comm -12 sorted1 sorted2|找两个已排序文件共有行
nl -ba file.txt|显示所有行号
strings binary|提取二进制中的可打印文本`],
  ['Linux', '文件操作', 'change', 'https://www.gnu.org/software/coreutils/manual/coreutils.html', `cp -a source/ target/|保留属性复制目录
cp -i file.txt backup.txt|覆盖前交互确认
mv -i old.txt new.txt|移动或重命名并确认覆盖
mkdir -p /tmp/demo/sub|递归创建目录
touch file.txt|新建空文件或更新时间戳
ln -s /path/to/target shortcut|创建符号链接
install -m 644 source.conf /etc/example.conf|按指定权限复制文件
chmod 640 file.txt|设置文件权限
chmod u+x script.sh|给所有者增加执行权限
chown user:group file.txt|更改属主和属组
chgrp operators file.txt|更改属组
truncate -s 0 file.log|将文件截断为空，原内容会丢失
rm -i file.txt|删除前逐项确认
rm -rI directory/|递归删除前总确认，仍需核对路径
shred -u file.txt|覆写并移除文件；SSD 上不保证擦除
sync|将待写入数据刷新到存储设备`],
  ['Linux', '压缩与传输', 'change', 'https://www.gnu.org/software/tar/manual/tar.html', `tar -tf archive.tar.gz|查看 tar 归档内容
tar -czf backup.tar.gz directory/|压缩目录为 tar.gz
tar -xzf backup.tar.gz -C /safe/path|解压到指定目录，先检查归档路径
gzip -k file.txt|压缩并保留原文件
gunzip -k file.gz|解压并保留压缩包
zip -r archive.zip directory/|创建 zip 压缩包
unzip -l archive.zip|列出 zip 内容
unzip archive.zip -d /safe/path|解压 zip 到指定目录
rsync -avh source/ target/|增量复制并保留常用属性
rsync -avhn source/ target/|先演练同步，不真正写入
rsync -avh --delete source/ target/|同步并删除目标多余文件，先演练
scp file.txt user@host:/tmp/|通过 SSH 复制文件到远端
sftp user@host|打开 SFTP 会话
curl -I https://example.com|仅获取 HTTP 响应头
curl -L -o file.bin https://example.com/file.bin|跟随跳转下载文件
wget -O file.bin https://example.com/file.bin|下载到指定文件`],
  ['Linux', '进程与资源', 'read', 'https://man7.org/linux/man-pages/man1/ps.1.html', `ps aux|查看进程快照
ps -ef --forest|树状查看进程关系
pgrep -af nginx|按名称查找进程及命令行
top|动态查看 CPU 与内存
htop|交互进程查看器（需安装）
free -h|查看内存与交换空间
uptime|查看运行时长与负载
vmstat 1 5|每秒采集一次，共五次
iostat -xz 1 5|查看磁盘 I/O 指标（需 sysstat）
mpstat -P ALL 1 3|查看各 CPU 使用率（需 sysstat）
pidstat -p ALL 1 3|查看进程资源指标（需 sysstat）
lsof -p 1234|查看指定进程打开的文件
lsof +D /path|查找占用目录的进程，目录大时较慢
fuser -v /mount/point|查看占用挂载点的进程
ulimit -a|查看当前 shell 资源限制
time command|测量命令运行耗时
kill -TERM 1234|请求进程优雅退出
kill -KILL 1234|强制终止进程，可能丢失未保存数据
renice -n 10 -p 1234|调整进程优先级
nohup command >app.log 2>&1 &|在后台持续运行并记录输出`],
  ['Linux', '系统与服务', 'read', 'https://man7.org/linux/man-pages/man1/systemctl.1.html', `uname -a|查看内核与架构
hostnamectl|查看主机名和系统信息
date -Is|以 ISO 格式查看本地时间
timedatectl|查看时区与时钟同步状态
systemctl status nginx|查看服务状态
systemctl list-units --failed|列出失败的单元
systemctl list-unit-files --type=service|列出服务单元文件
systemctl show nginx -p MainPID|查询服务主进程 PID
systemctl is-enabled nginx|确认服务是否开机启用
systemctl restart nginx|重启服务，会造成短时中断
systemctl reload nginx|请求服务重载配置，需服务支持
systemctl enable --now nginx|启用并立即启动服务
systemctl disable --now nginx|停用并立即停止服务
systemctl daemon-reload|修改单元文件后重载 systemd 配置
journalctl -u nginx -n 100 --no-pager|读取服务近期日志
journalctl -u nginx -f|实时追踪服务日志
journalctl -b -p warning|查看本次启动的警告及以上日志
dmesg -T|以可读时间查看内核日志
last -n 20|查看最近登录记录
who -a|查看当前登录会话`],
  ['Linux', '网络诊断', 'read', 'https://man7.org/linux/man-pages/man8/ip.8.html', `ip -br address|简要查看接口 IP
ip link show|查看网络接口状态
ip route show|查看路由表
ip route get 8.8.8.8|查看到目标的选路结果
ip neigh show|查看邻居/ARP 表
ss -tulpen|查看 TCP/UDP 监听端口和进程
ss -tn state established|查看已建立 TCP 连接
ping -c 4 192.0.2.1|发送四次 ICMP 回显
tracepath example.com|追踪路径与 MTU（需安装）
traceroute example.com|追踪网络路径（需安装）
mtr -rwzc 20 example.com|采样路径丢包（需安装）
dig example.com A|查询 A 记录
dig @1.1.1.1 example.com A|指定 DNS 服务器查询
dig -x 192.0.2.1|查询反向 DNS
resolvectl status|查看 systemd-resolved DNS 状态
getent hosts example.com|通过系统解析链查询主机
curl -v https://example.com|查看 HTTP/TLS 连接细节
curl -w '%{http_code} %{time_total}' -o /dev/null -s https://example.com|输出 HTTP 状态和总耗时
openssl s_client -connect example.com:443 -servername example.com|检查 TLS 握手与证书链
nc -vz example.com 443|测试 TCP 端口连通性（需安装）
tcpdump -ni eth0 'tcp port 443'|抓取指定接口 HTTPS 流量，注意敏感数据
ethtool eth0|查看网卡链路协商信息`],
  ['Linux', '网络配置', 'change', 'https://man7.org/linux/man-pages/man8/ip-route.8.html', `ip address add 192.0.2.10/24 dev eth0|临时添加接口地址，远程操作可能断连
ip address del 192.0.2.10/24 dev eth0|临时删除接口地址，远程操作可能断连
ip link set eth0 up|启用网络接口
ip link set eth0 down|停用接口，远程会话可能中断
ip route add 198.51.100.0/24 via 192.0.2.1|临时添加静态路由
ip route del 198.51.100.0/24|删除静态路由
nmcli device status|查看 NetworkManager 设备状态
nmcli connection show|列出 NetworkManager 连接
nmcli connection up 'connection-name'|启用连接，可能改变当前网络
ufw status verbose|查看 UFW 防火墙状态
ufw allow 443/tcp|放行 TCP 443，需确认现网策略
firewall-cmd --list-all|查看 firewalld 当前区域规则
firewall-cmd --add-service=https|临时允许 HTTPS 服务
nft list ruleset|查看 nftables 规则集
iptables -S|查看 iptables 规则概要`],
  ['Linux', '存储与文件系统', 'read', 'https://man7.org/linux/man-pages/man8/lsblk.8.html', `lsblk -f|查看块设备、文件系统与挂载
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS|自定义块设备列
blkid|查看块设备 UUID 和类型
findmnt|查看挂载树
findmnt /var|查看指定路径所在挂载点
mount |查看挂载记录
df -Th|查看容量和文件系统类型
du -xhd1 /var|同一文件系统内统计目录占用
swapon --show|查看交换设备
ls -l /dev/disk/by-id/|按稳定设备标识列磁盘
smartctl -a /dev/sda|查看 SMART 信息（需 smartmontools）
nvme smart-log /dev/nvme0|查看 NVMe 健康日志（需 nvme-cli）
pvs|查看 LVM 物理卷
vgs|查看 LVM 卷组
lvs -a -o +devices|查看逻辑卷及底层设备
mdadm --detail /dev/md0|查看 Linux 软件 RAID 状态
fsck -N /dev/sdb1|仅显示拟执行检查，不修改文件系统
badblocks -sv /dev/sdb|只读扫描坏块，耗时较长`],
  ['Linux', '账户与权限', 'read', 'https://www.gnu.org/software/coreutils/manual/coreutils.html', `id|查看当前用户 UID 与组
id alice|查看指定用户身份
groups alice|查看用户所属组
getent passwd alice|从 NSS 查询用户
getent group operators|从 NSS 查询组
sudo -l|查看当前用户被允许的 sudo 操作
namei -l /path/to/file|逐级查看路径权限
getfacl file.txt|查看 POSIX ACL（需安装）
ls -ld /path/to/dir|查看目录本身权限
umask|查看默认权限掩码
whoami|查看当前有效用户名
passwd|修改当前用户密码
sudo useradd -m alice|创建本地用户，需核对组织流程
sudo usermod -aG operators alice|将用户追加到组
sudo userdel alice|删除本地用户，先核对账户归属
sudo setfacl -m u:alice:r file.txt|给用户设置文件 ACL`],
  ['Linux', '容器与虚拟化', 'read', 'https://docs.docker.com/reference/cli/docker/', `docker ps|查看运行中的容器
docker ps -a|查看全部容器
docker images|查看本地镜像
docker logs --tail 100 container|查看容器近期日志
docker inspect container|查看容器详细元数据
docker stats --no-stream|查看一次性资源统计
docker exec -it container sh|进入容器交互 shell
docker compose ps|查看 Compose 项目容器
docker compose logs -f service|追踪服务日志
docker compose config|检查合成后的配置
docker compose up -d|创建或更新 Compose 服务
docker compose down|停止并移除项目容器及网络`],
  ['Linux', 'Kubernetes 集群', 'read', 'https://kubernetes.io/docs/reference/kubectl/quick-reference/', `kubectl get pods -A|查看所有命名空间 Pod
kubectl get nodes -o wide|查看节点状态
kubectl describe pod pod-name -n namespace|查看 Pod 事件与详情
kubectl logs pod-name -n namespace --tail=100|查看 Pod 日志
kubectl top pods -A|查看 Pod 资源使用（需 metrics-server）
kubectl get events -A --sort-by=.metadata.creationTimestamp|按时间查看事件
kubectl rollout status deployment/app -n namespace|检查发布进度
kubectl apply --dry-run=client -f manifest.yaml|客户端演练清单解析`],
  ['Linux', '计划任务与包管理', 'read', 'https://man7.org/linux/man-pages/man1/crontab.1.html', `crontab -l|查看当前用户定时任务
systemctl list-timers --all|查看 systemd 定时器
apt list --installed|查看 Debian 系已安装包
apt-cache policy nginx|查看 APT 候选版本与来源
dpkg -l|查看 dpkg 包列表
dpkg -S /usr/bin/curl|查询文件所属包
dnf list installed|查看 DNF 已安装包
dnf info nginx|查看 RPM 包信息
rpm -qa|列出 RPM 包
rpm -qf /usr/bin/curl|查询文件所属 RPM 包
pip list|查看当前 Python 环境包
python3 -m pip show requests|查看指定 Python 包详情
crontab -e|编辑当前用户定时任务
apt update|更新 APT 包索引
apt install nginx|安装 Debian 系软件包
dnf install nginx|安装 RPM 系软件包`],
  ['Linux', 'Shell 与脚本', 'read', 'https://www.gnu.org/software/bash/manual/bash.html', `help|查看 Bash 内建命令帮助
help test|查看 test 条件表达式帮助
bash -n script.sh|只检查 Bash 脚本语法
bash -x script.sh|跟踪脚本执行，输出可能含敏感数据
shellcheck script.sh|静态检查 Shell 脚本（需安装）
printenv|列出进程环境变量，可能含敏感数据
env | sort|排序查看环境变量，可能含敏感数据
export VAR=value|设置当前 shell 与子进程环境变量
unset VAR|删除当前 shell 的变量
alias|列出当前 shell 别名
history 20|查看最近 20 条历史，可能含敏感命令
set -o pipefail|让管道返回失败命令的非零状态
printf '%s\\n' hello|按指定格式输出文本
seq 1 10|生成数字序列
xargs -0 -n 1 command|处理零分隔输入，适合文件名
tee output.txt|同时写文件与标准输出
timeout 10s command|限制命令最长运行时间
watch -n 2 command|每两秒刷新命令结果
test -f file.txt|判断文件是否存在且为普通文件
command -v python3|查找命令是否可用
source .env|在当前 shell 加载文件，执行前审查内容`],
  ['Linux', 'SSH 与证书', 'read', 'https://www.openssh.com/manual.html', `ssh -V|查看 SSH 客户端版本
ssh -v user@host|打印 SSH 连接诊断信息
ssh -G host|展开最终 SSH 客户端配置
ssh -Q kex|列出支持的密钥交换算法
ssh-keygen -lf id_ed25519.pub|查看公钥指纹
ssh-add -l|列出代理中的密钥指纹
ssh-keyscan host|读取主机公钥；必须独立核验指纹
openssl version -a|查看 OpenSSL 版本与编译信息
openssl x509 -in cert.pem -noout -text|查看证书详细字段
openssl x509 -in cert.pem -noout -dates|查看证书有效期
openssl x509 -in cert.pem -noout -subject -issuer|查看证书主体和签发者
openssl verify -CAfile ca.pem cert.pem|用指定 CA 验证证书
openssl s_client -connect example.com:443 -servername example.com -brief|检查 TLS 握手摘要
openssl pkey -in key.pem -pubout|导出私钥对应公钥，注意保护私钥
openssl rand -hex 32|生成 32 字节随机值的十六进制表示
sha256sum file.bin|计算 SHA-256 校验值
sha512sum file.bin|计算 SHA-512 校验值
gpg --verify release.sig release.tar.gz|验证签名（需先验证公钥）`],
  ['Linux', '硬件与性能', 'read', 'https://man7.org/linux/man-pages/man1/lscpu.1.html', `lscpu|查看 CPU 拓扑与架构
lsmem|查看内存分布（平台可能不支持）
lsusb|查看 USB 设备（需 usbutils）
lspci -nn|查看 PCI 设备及数值 ID（需 pciutils）
dmidecode -t system|查看 DMI 系统信息，可能需管理员权限
dmidecode -t memory|查看内存条信息，可能需管理员权限
cat /proc/cpuinfo|读取 CPU 信息
cat /proc/meminfo|读取内存统计
cat /proc/loadavg|读取负载平均值
cat /proc/pressure/cpu|查看 CPU 压力指标（内核需支持）
cat /proc/pressure/memory|查看内存压力指标（内核需支持）
cat /proc/pressure/io|查看 I/O 压力指标（内核需支持）
sar -u 1 5|查看 CPU 历史采样（需 sysstat）
sar -n DEV 1 5|查看网卡吞吐采样（需 sysstat）
perf stat command|统计命令硬件性能计数（需权限）
systemd-analyze blame|分析启动单元耗时
systemd-analyze critical-chain|查看启动关键路径
loginctl list-sessions|列出登录会话`],
  ['Linux', 'Web 与 DNS 排障', 'read', 'https://curl.se/docs/manpage.html', `curl -sS -o /dev/null -w '%{http_code}' https://example.com|只输出 HTTP 状态码
curl --resolve example.com:443:192.0.2.10 https://example.com|将域名临时指向指定 IP 测试
curl --connect-timeout 3 --max-time 10 https://example.com|限制连接及总超时
curl -H 'Accept: application/json' https://example.com/api|设置请求头并访问 API
curl -X OPTIONS -i https://example.com/api|查看 OPTIONS 响应头
curl --compressed -I https://example.com|请求压缩编码并获取响应头
curl -4 -I https://example.com|强制通过 IPv4 访问
curl -6 -I https://example.com|强制通过 IPv6 访问
dig example.com MX|查询邮件交换记录
dig example.com TXT|查询 TXT 记录
dig +trace example.com|逐级追踪 DNS 委派
dig +short example.com A|只显示简短 DNS 答案
host example.com|查看主机 DNS 解析
nginx -t|检查 Nginx 配置语法
nginx -T|输出全部 Nginx 配置，可能含敏感信息
apachectl configtest|检查 Apache 配置语法
apachectl -M|列出已加载 Apache 模块
getent ahosts example.com|通过系统解析链查看地址列表`],
  ['Linux', '数据库客户端', 'read', 'https://www.postgresql.org/docs/current/app-psql.html', `pg_isready|检查 PostgreSQL 是否接受连接
psql -c 'SELECT version();'|查询 PostgreSQL 版本，连接信息从环境取得
psql -l|列出可访问的 PostgreSQL 数据库
psql -c 'SHOW server_version;'|查询 PostgreSQL 服务端版本
psql -c 'SELECT current_database();'|确认当前数据库
mysqladmin ping|检测 MySQL 服务响应
mysql -e 'SELECT VERSION();'|查询 MySQL 版本
mysql -e 'SHOW DATABASES;'|列出可访问的 MySQL 数据库
redis-cli ping|探测 Redis 服务；可能要求认证
redis-cli info server|查看 Redis 服务端信息
redis-cli dbsize|查看当前 Redis 库键数量
sqlite3 existing.db '.schema'|查看 SQLite 表结构，文件不存在时可能新建
sqlite3 existing.db '.tables'|列出 SQLite 表，文件不存在时可能新建
mongosh --eval 'db.runCommand({ping:1})'|检查 MongoDB 服务响应（需 mongosh）
mongosh --eval 'db.version()'|查询 MongoDB 版本（需 mongosh）`],
  ['Linux', 'Git 与版本检查', 'read', 'https://git-scm.com/docs', `git status --short|简洁查看工作区状态
git diff --stat|查看未暂存改动统计
git diff --cached|查看已暂存改动
git log --oneline -10|查看最近十次提交
git show --stat HEAD|查看最新提交摘要
git blame -L 1,40 file.txt|查看指定行的提交归属
git branch -a|列出本地及远程跟踪分支
git remote -v|查看远程仓库地址
git rev-parse --show-toplevel|查看仓库根目录
git ls-files|列出被 Git 跟踪的文件
git grep -n 'pattern'|在被跟踪文件中搜索
git check-ignore -v file.txt|解释文件被忽略的原因
git diff --check|检查空白字符问题
git fetch --dry-run|预览将获取的引用
git fsck --no-reflogs|检查对象库完整性
git tag --list|列出标签
git config --show-origin --list|查看配置值及来源，可能含敏感信息`],
  ['Cisco IOS/IOS XE', '设备状态', 'read', 'https://www.cisco.com/c/en/us/td/docs/routers/sdwan/command/iosxe/qualified-cli-command-reference-guide.pdf', `show version|查看系统版本与运行信息
show inventory|查看硬件清单
show running-config|查看当前运行配置，可能含敏感信息
show startup-config|查看启动配置，可能含敏感信息
show interfaces status|查看交换端口状态，平台支持有差异
show interfaces|查看接口详情与错误计数
show ip interface brief|查看 IPv4 接口与状态
show ipv6 interface brief|查看 IPv6 接口简表
show ip route|查看 IPv4 路由表
show ip arp|查看 ARP 表
show mac address-table|查看交换机 MAC 地址表
show vlan brief|查看 VLAN 简表
show spanning-tree|查看生成树状态
show cdp neighbors detail|查看 CDP 邻居详情
show lldp neighbors detail|查看 LLDP 邻居详情
show etherchannel summary|查看链路聚合概要
show logging|查看设备日志
show processes cpu|查看 CPU 进程占用
show memory statistics|查看内存统计
show access-lists|查看 ACL 条目与命中计数
show ip bgp summary|查看 BGP 邻居概要（若启用）
show ip ospf neighbor|查看 OSPF 邻居
show ip nat translations|查看 NAT 转换表（若启用）
ping 192.0.2.1|测试到目标地址连通性
traceroute 192.0.2.1|追踪到目标的路径`],
  ['Huawei VRP', '设备状态', 'read', 'https://info.support.huawei.com/enterprise/en/doc/EDOC1100335692/c1ebaf03/basic-ip-routing-configuration', `display version|查看系统版本
display device|查看设备板卡状态
display current-configuration|查看当前配置，可能含敏感信息
display saved-configuration|查看保存配置，可能含敏感信息
display interface brief|查看接口状态简表
display ip interface brief|查看 IPv4 接口简表
display interface GigabitEthernet 0/0/1|查看指定接口详情，编号须按设备修改
display ip routing-table|查看 IPv4 路由表
display arp|查看 ARP 表
display mac-address|查看 MAC 地址表
display vlan|查看 VLAN 信息
display stp brief|查看生成树简表
display lldp neighbor brief|查看 LLDP 邻居简表
display eth-trunk|查看 Eth-Trunk 聚合状态
display logbuffer|查看日志缓冲区
display cpu-usage|查看 CPU 使用率
display memory-usage|查看内存使用率
display acl all|查看 ACL 配置，支持范围依型号而异
display bgp peer|查看 BGP 邻居（若启用）
display ospf peer|查看 OSPF 邻居（若启用）
display ip pool|查看地址池（若启用）
ping 192.0.2.1|测试连通性
tracert 192.0.2.1|追踪路径`],
  ['H3C Comware', '设备状态', 'read', 'https://www.h3c.com/en/Support/Resource_Center/HK/Switches/H3C_S7500E/S7500E/Technical_Documents/Reference_Guides/Command_References/S7500E_CM(6300_V1.03)/03-IP_Routing_Volume/200912/658749_294551_0.htm', `display version|查看系统版本
display device|查看设备硬件状态
display current-configuration|查看当前配置，可能含敏感信息
display saved-configuration|查看已保存配置，可能含敏感信息
display interface brief|查看接口简表
display ip interface brief|查看 IPv4 接口简表
display interface GigabitEthernet 1/0/1|查看接口详情，编号须按设备修改
display ip routing-table|查看 IPv4 路由表
display arp|查看 ARP 表
display mac-address|查看 MAC 地址表
display vlan|查看 VLAN 列表
display stp brief|查看生成树简表
display lldp neighbor-information brief|查看 LLDP 邻居简表
display link-aggregation summary|查看链路聚合概要
display logbuffer|查看日志缓冲区
display cpu-usage|查看 CPU 使用率
display memory|查看内存状态
display acl all|查看 ACL 信息，支持范围依版本而异
display bgp peer|查看 BGP 邻居（若启用）
display ospf peer|查看 OSPF 邻居（若启用）
ping 192.0.2.1|测试连通性
tracert 192.0.2.1|追踪路径`],
  ['Juniper Junos', '设备状态', 'read', 'https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/command/show-interfaces-terse.html', `show version|查看 Junos 版本
show chassis hardware|查看机箱硬件清单
show configuration|查看候选/已提交配置，可能含敏感信息
show interfaces terse|查看接口状态简表
show interfaces extensive|查看接口详细计数器
show route|查看路由表
show route summary|查看路由表概要
show arp|查看 ARP 表
show ethernet-switching table|查看交换 MAC 表（交换型设备）
show vlans|查看 VLAN 信息（交换型设备）
show lldp neighbors|查看 LLDP 邻居
show log messages|查看系统日志
show system processes extensive|查看详细进程资源
show system uptime|查看运行时间与负载
show chassis alarms|查看机箱告警
show system alarms|查看系统告警
show security policies|查看安全策略（SRX 平台）
show security flow session summary|查看会话概要（SRX 平台）
show bgp summary|查看 BGP 邻居概要
show ospf neighbor|查看 OSPF 邻居
ping 192.0.2.1 count 4|测试连通性
traceroute 192.0.2.1|追踪路径
show configuration | display set|按 set 形式查看配置`]
];

const danger = /^(?:rm |shred|truncate|kill -KILL|ip link set .* down|rsync .*--delete|systemctl disable|docker compose down|sudo userdel)/;
const mutating = /^(?:systemctl (?:restart|reload|enable|daemon-reload)|kill |renice |nohup |docker (?:exec|compose (?:up|down))|kubectl apply|passwd$|sudo (?:useradd|usermod|setfacl)|crontab -e|apt (?:update|install)|dnf install|bash -x|export |unset |tee |source |sqlite3 )/;
const readOnly = /^(?:tar -tf|unzip -l|rsync -avhn|curl -I|nmcli device status|nmcli connection show|ufw status|firewall-cmd --list-all|nft list ruleset|iptables -S)/;
function referenceFor(command, fallback) {
  if (/^openssl /.test(command)) return 'https://docs.openssl.org/';
  if (/^(?:sha256sum|sha512sum) /.test(command)) return 'https://www.gnu.org/software/coreutils/manual/coreutils.html';
  if (/^gpg /.test(command)) return 'https://www.gnupg.org/documentation/manuals/gnupg/';
  if (/^shellcheck /.test(command)) return 'https://www.shellcheck.net/';
  if (/^nginx /.test(command)) return 'https://nginx.org/en/docs/';
  if (/^apachectl /.test(command)) return 'https://httpd.apache.org/docs/';
  if (/^mysql/.test(command)) return 'https://dev.mysql.com/doc/';
  if (/^redis-cli /.test(command)) return 'https://redis.io/docs/latest/commands/';
  if (/^sqlite3 /.test(command)) return 'https://www.sqlite.org/cli.html';
  if (/^mongosh /.test(command)) return 'https://www.mongodb.com/docs/mongodb-shell/';
  return fallback;
}
function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619) >>> 0;
  return result.toString(36);
}
export const BUILTIN = Object.freeze(GROUPS.flatMap(([platform, category, level, source], group) => sourceText(group).map(([command, title]) => ({ id: `b-${hash(`${platform}\u0000${command}`)}-${hash(`${command}\u0000${platform}`)}`, platform, category, command, title, safety: danger.test(command) ? 'high' : mutating.test(command) ? 'change' : readOnly.test(command) ? 'read' : level, source: referenceFor(command, source), note: '' }))));

function sourceText(group) {
  return GROUPS[group][4].trim().split('\n').map(line => {
    const divider = line.lastIndexOf('|');
    if (divider < 1) throw Error(`内置命令格式错误：${line}`);
    return [line.slice(0, divider).trim(), line.slice(divider + 1).trim()];
  });
}

export function distinctCount(items = BUILTIN) {
  return new Set(items.map(item => item.command.trim().split(/\s+/)[0])).size;
}

export function validateCustom(raw) {
  if (!raw || typeof raw !== 'object') throw Error('命令条目不是对象');
  const result = {};
  for (const [key, limit] of [['platform', 60], ['category', 60], ['command', 500], ['title', 160], ['note', 600]]) {
    if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > limit) {
      if (key === 'note' && (raw[key] === undefined || raw[key] === '')) { result[key] = ''; continue; }
      throw Error(`${key} 字段缺失或过长`);
    }
    result[key] = raw[key].trim();
  }
  if (!['read', 'change', 'high'].includes(raw.safety)) throw Error('safety 只能为 read、change、high');
  result.safety = raw.safety;
  if (raw.source !== undefined && (typeof raw.source !== 'string' || raw.source.length > 300 || (raw.source && !/^https:\/\//i.test(raw.source)))) throw Error('source 须为 HTTPS 地址');
  result.source = raw.source || '';
  result.id = typeof raw.id === 'string' && /^u-[a-zA-Z0-9-]{1,100}$/.test(raw.id) ? raw.id : `u-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  return result;
}

const searchTextCache = new WeakMap();
function searchText(item) {
  let value = searchTextCache.get(item);
  if (!value) {
    value = `${item.command} ${item.title} ${item.category} ${item.platform} ${item.note || ''} ${item.version || ''} ${item.family || ''} ${item.mode || ''}`.toLocaleLowerCase();
    searchTextCache.set(item, value);
  }
  return value;
}

export function searchCatalog(items, { query = '', platform = '', category = '', safety = '', favorites = null } = {}) {
  const parts = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(item => (!platform || item.platform === platform) && (!category || item.category === category) && (!safety || item.safety === safety) && (!favorites || favorites.has(item.id)) && parts.every(part => searchText(item).includes(part)));
}

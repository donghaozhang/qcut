# vm0 沙箱架构

vm0 怎么把一个任务的执行隔离起来。源码：`crates/sandbox-fc/`、`crates/nbd-cow/`、`crates/vsock-*/`、`crates/guest-init/`。

## 一句话

vm0 用四个机制叠加，在 ~125 ms 内为每个任务起一台全新的 Firecracker microVM：

1. **预构建 rootfs 镜像**——busybox、runtime、mock CLI 全打进去。
2. **Firecracker snapshot 恢复**——从预热池里恢复，省掉内核/用户态启动开销。
3. **NBD 写时复制（COW）**——每台 VM 在共享 base 之上拿一层自己的可写层。
4. **网络命名空间池**——每台 VM 挂进隔离的 `netns`，自带 NAT + DNS 重写。

四个机制紧耦合。少一个（比如不要 COW）冷启动爆炸；少两个，模型就退化成"跑容器"。

## Crate 关系图

```
host ─────────────────────────────────────────────
  runner（编排器）
    │
    ├─ uses ─▶ sandbox     （trait + 类型，跨语言接口）
    │
    └─ uses ─▶ sandbox-fc  （Firecracker 实现）
                  │
                  ├─ cow_pool.rs     （预分配 NBD COW 设备，1.7k 行）
                  ├─ network/        （每 VM netns + tap 池）
                  ├─ balloon.rs      （内存 ballooning 回收）
                  ├─ factory/        （原子 VM 创建，可回滚）
                  ├─ leaked_resources.rs  （清理跟踪）
                  └─ control.rs      （VM 生命周期：起/停/snapshot/kill）

  vsock-host  ───▶ vsock-proto（线协议）  ◀─── vsock-guest

VM ──────────────────────────────────────────────
  guest-init（PID 1）
    ├─ fork vsock-guest（处理宿主 RPC）
    └─ fork guest-agent
                  │
                  ├─ 执行实际 CLI（Claude / Codex / 等）
                  ├─ 发心跳 / telemetry
                  └─ 创建 checkpoint
```

## 四个机制详细

### 1. 预构建 rootfs

`runner build` 产出统一镜像：rootfs + kernel + 启动后立即拍的 Firecracker snapshot。入口在 `crates/runner/src/cmd/build.rs`。工具链来自 `docker/toolchain/`，rootfs 是 bit 级可复现的。

**对我们的意义**：容器世界的等价物就是缓存好的 Docker 镜像。Daytona 镜像仓库免费给你，我们 `container-setup.md` 的双阶段 Dockerfile 已经是这个思路——只是没那么花哨。

### 2. Firecracker snapshot 恢复

`sandbox-fc/src/factory/create_transaction.rs` 创建新 VM 的方式是**恢复 snapshot**，不是冷启。Snapshot 在 `runner build` 时拍一次，`guest-init` 一稳定就拍下来。每次恢复的 VM：

- 继承同一份内存镜像（通过 COW 只读）。
- 重新喂熵（`crates/guest-reseed/`），免得多台 VM 共享 RNG。
- 通过 vsock 热补丁打入 per-job 配置（env vars、runId）。

这就是那 ~125 ms 的关键。容器没有直接等价物——Docker 的 CRIU 检查点恢复脆弱、生产上几乎没人用。

**我们的取舍**：接受 1–2 s 冷启动。任务都是分钟级（图生、视频生）能接受。亚秒级任务才痛——QCut 现在没有。

### 3. NBD 写时复制

`crates/nbd-cow/` 是个用户态 NBD 服务器，暴露一个块设备，背后挂：

- 只读 base 文件（来自步骤 1 的 rootfs）。
- 每 VM 一份 overlay 文件（稀疏，通过 NBD 协议写入）。
- 内存里一张位图，记哪些块写过。

`sandbox-fc/src/cow_pool.rs`（1.7k 行，项目里最大单文件）维护预分配 NBD 设备池——从池里拿是 O(1)，从零创建要跟 `nbd-client` 走 netlink 那一套。

**为什么这套**：`dm-snapshot` 和 loop 设备要 root、慢、有块大小约束。用户态 NBD 可移植、能 pool。

**我们的对应**：没有——Daytona 容器靠 overlayfs 共享 base 镜像，不需要块级 COW。这一块我们已经是容器能做到的最高效形态。

### 4. 网络命名空间池

`sandbox-fc/src/network/pool.rs` 预分配 Linux netns，每个挂：

- `tap` 设备接到 VM 的 virtio-net。
- 预配置的网桥连到宿主。
- iptables 规则把所有出站强制走 mitmproxy。

`crates/runner/src/dns.rs` 在每个 netns 里跑 DNS，把已知 provider 域名解析到代理 IP。所以 guest `curl https://api.openai.com` 实际打到 mitmproxy，由它代为请求真实 API。

**为什么 pool**：建 netns 大概 50 ms；放热路径冷启动就翻倍。

**我们的对应**：同一个 Daytona pod 里放个 mitmproxy 旁车，靠 `/etc/hosts` 重写 DNS。同样结果，更少内核接触面。详见 `vm0-secrets-proxy.zh.md`。

## VM 生命周期（单任务）

```
runner.start
  ├─ 从 provider 认领任务
  ├─ sandbox_fc.create()             （factory/create_transaction.rs）
  │    ├─ 从池里拿 VM 槽
  │    ├─ 从池里拿 netns
  │    ├─ 从 cow_pool 拿 NBD COW
  │    ├─ 起 firecracker
  │    └─ 恢复 snapshot               （~125 ms）
  ├─ vsock_host.exec(job.command)    （vsock 投递给 VM 内 guest-agent）
  │    │
  │    │  ──── guest-agent 跑 CLI，stdout/stderr 走 vsock 回宿主
  │    │       mitmproxy 看到出站 HTTPS，注入 auth、记日志
  │    │       guest-agent 每 N 秒发一次心跳
  │    │
  │    └─ guest-agent 返回 exit code + 最终输出
  └─ sandbox_fc.kill()
       ├─ firecracker SIGKILL
       ├─ netns 还回池（清洗后）
       ├─ NBD COW 还回池（擦完后）
       └─ leaked_resources.collect()
```

`create_transaction.rs` 这个原子事务很有意思：任一步失败（比如 NBD 分配成功但 firecracker 起不来），事务回滚之前所有获取。高负载下不会漏资源。

## 资源核算

`runner/src/resource_budget.rs` 跟踪每任务的：

- vCPU pin（firecracker `cpu_template` + cgroup）。
- RAM 预算（初始 + ballooning 上限）。
- 墙钟预算（超时直接 kill）。

`balloon.rs` 让宿主在 guest 闲置时（等远端 API 回包）回收其 RAM——一台宿主跑 50+ 并发 VM 时收益巨大。容器没这个，`--memory` 申请多少占多少。

**我们的对应**：Daytona 每容器限额 + worker 端 timeout。Ballooning 没有对应物；只能 over-provision。

## 清理纪律

`crates/sandbox-fc/src/leaked_resources.rs` 和 `factory/leak_cleaner.rs` 给每个外部资源（netns、tap、fd、mount、NBD 设备）打 ID 跟踪。VM kill 时——哪怕是强杀/崩溃——一次清扫保证全部释放。`runner doctor` 报告泄漏。

我们应该照抄概念，但落到任务层：每次容器退出往 `agent_jobs.cleanup` 写一行该释放什么；每天扫一遍找孤儿（比如 `succeeded` 但 `finished_at` 为空）。

## 我们方案上的决策

| 问题                                  | 决定                                                          |
|--------------------------------------|---------------------------------------------------------------|
| 上 Firecracker 吗？                   | 不。容器简单 10×，我们任务 1+ 分钟。                          |
| 上 snapshot / COW 吗？                | 不。Daytona warm pool 够。                                    |
| 上网络命名空间 + DNS 重写吗？          | 上（Phase 2，配 mitmproxy）。见 `vm0-secrets-proxy.zh.md`。   |
| 上资源预算抽象吗？                     | 上轻量版：每任务 CPU/RAM/墙钟一行。                           |
| 上显式资源泄漏跟踪吗？                 | 上，但落到任务层（非 OS 资源层）。                            |
| 给 agent CLI 加 `doctor` / `gc` 子命令？ | 上——工作量小，诊断收益大。                                   |

## 相关文档

- [`vm0-overview.zh.md`](vm0-overview.zh.md) —— 全景
- [`vm0-job-pipeline.zh.md`](vm0-job-pipeline.zh.md) —— 任务怎么走到这个 VM 生命周期
- [`vm0-secrets-proxy.zh.md`](vm0-secrets-proxy.zh.md) —— 网络命名空间的下文
- `vm0/crates/README.md` —— vm0 自家架构总结
- `vm0/crates/sandbox-fc/src/cow_pool.rs` —— 预热池实现的核心

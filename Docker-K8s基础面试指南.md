---
tags:
  - interview
  - java
  - docker
  - kubernetes
created: 2026-06-23
source: Codex 结合 Docker / Kubernetes 官方文档与 interview 知识库生成
---

# Docker / Kubernetes 基础面试指南

这份材料面向 Java 后端面试中的容器和 K8s 基础题，重点覆盖镜像、容器、Dockerfile、数据卷、网络、Pod、Deployment、Service、Ingress、ConfigMap、Secret、滚动发布、资源限制和排障。目标不是背运维命令，而是能讲清楚应用如何容器化、如何发布、如何定位问题。

## 0. 高频知识地图

| 主题 | 高频问题 | 回答关键词 |
| --- | --- | --- |
| Docker | 镜像和容器区别、Dockerfile 优化 | image、container、layer、volume、network |
| 镜像构建 | Java 应用如何写 Dockerfile | 多阶段构建、非 root、健康检查、JVM 参数 |
| K8s 对象 | Pod、Deployment、Service、Ingress | 最小调度单元、副本、服务发现、入口流量 |
| 配置 | ConfigMap、Secret | 配置外置、敏感信息、环境变量、挂载 |
| 发布 | 滚动发布、回滚、探针 | readiness、liveness、rolling update |
| 资源 | request/limit、HPA | CPU、memory、OOMKilled、扩缩容 |
| 排障 | Pod 起不来、服务不通、频繁重启 | describe、logs、events、exec、probe |

## 1. Docker 是什么？解决什么问题？

**一句话回答**：Docker 是容器化平台，把应用和依赖打包成镜像，并以容器方式运行，解决环境不一致、部署复杂和交付不可重复的问题。

**核心价值**：

- 一次构建，多环境运行。
- 应用和依赖打包，减少环境差异。
- 启动快，资源隔离比虚拟机更轻。
- 便于 CI/CD 和弹性部署。

**面试表达**：

> Docker 解决的是应用交付一致性。以前 Java 应用依赖 JDK、字体、时区、系统库和启动脚本，环境差异容易出问题；容器化后，把这些依赖固化到镜像里，发布时运行同一个镜像，稳定性更好。

## 2. 镜像和容器有什么区别？

**一句话回答**：镜像是只读模板，容器是镜像运行起来后的进程实例；一个镜像可以启动多个容器。

| 概念 | 含义 |
| --- | --- |
| Image | 只读模板，包含应用和依赖 |
| Container | 镜像运行实例，本质是隔离的进程 |
| Layer | 镜像分层，便于复用和缓存 |
| Volume | 持久化数据或挂载配置 |

**面试表达**：

> 镜像像应用安装包，容器像运行中的进程。镜像是不可变交付物，容器可以创建、停止、销毁。日志和业务数据不能只放容器可写层，重要数据要挂载卷或外部存储。

## 3. Dockerfile 怎么优化？

**常见优化**：

- 使用合适基础镜像，减少体积和漏洞面。
- 多阶段构建，构建环境和运行环境分离。
- 先复制依赖描述文件，再复制源码，提高缓存命中。
- 不把密码、密钥写进镜像。
- 使用非 root 用户运行应用。
- 配置健康检查和合理 JVM 参数。
- `.dockerignore` 排除 target、日志、临时文件。

**面试表达**：

> Dockerfile 优化不只是让镜像小，还要安全、可缓存、可运维。Java 应用可以多阶段构建，只把最终 jar 和运行时依赖放进运行镜像；敏感配置用环境变量或 Secret，不写死进镜像。

## 4. Java 应用容器化要注意什么？

**关键点**：

- JVM 要感知容器内存限制。
- 设置合理 `-Xmx`，避免超过容器 memory limit。
- 日志输出到 stdout/stderr，由平台采集。
- 优雅停机处理 SIGTERM。
- 健康检查区分启动、存活和就绪。
- 时区、字体、证书、临时目录要明确。

**面试表达**：

> Java 容器化最容易出问题的是内存。容器 memory limit 不是宿主机内存，JVM 堆、元空间、线程栈、直接内存都要算进去。线上要设置合理 JVM 参数，并通过 readiness probe 控制流量进入时机。

## 5. Kubernetes 是什么？

**一句话回答**：Kubernetes 是容器编排平台，负责容器应用的部署、调度、服务发现、扩缩容、滚动发布、自愈和资源管理。

**核心能力**：

- 声明式部署。
- 自动调度 Pod 到节点。
- 副本数保持和故障自愈。
- Service 提供稳定访问入口。
- ConfigMap/Secret 管理配置。
- 滚动发布和回滚。

**面试表达**：

> Docker 解决单机容器运行，Kubernetes 解决集群里大量容器怎么部署、发现、扩缩容和自愈。我们声明期望状态，K8s 控制器持续让实际状态接近期望状态。

## 6. Pod 是什么？为什么不是直接调度容器？

**一句话回答**：Pod 是 K8s 最小调度单元，里面可以有一个或多个容器，共享网络命名空间和部分存储卷。

**关键点**：

- 一个 Pod 内容器共享 IP 和端口空间。
- 常见一个业务容器一个 Pod。
- Sidecar 模式会在同一 Pod 放日志、代理或监控容器。
- Pod 是短生命周期对象，随时可能被重建。

**面试表达**：

> K8s 调度的是 Pod，不是单个容器。Pod 可以承载一个主业务容器和配套 sidecar，它们共享网络和存储。业务上不能依赖 Pod IP 永久不变，要通过 Service 访问。

## 7. Deployment 解决什么问题？

**一句话回答**：Deployment 管理无状态应用的副本、滚动更新和回滚，通过 ReplicaSet 保证期望数量的 Pod 持续运行。

**面试表达**：

> Deployment 适合部署无状态 Java 服务。它描述镜像版本、副本数、滚动策略和探针。发布新版本时，Deployment 会逐步创建新 Pod、下线旧 Pod，异常时可以回滚。

## 8. Service 是什么？有哪些类型？

**一句话回答**：Service 为一组 Pod 提供稳定访问入口和负载均衡，屏蔽 Pod IP 变化。

| 类型 | 用途 |
| --- | --- |
| ClusterIP | 集群内部访问 |
| NodePort | 通过节点端口暴露 |
| LoadBalancer | 云厂商负载均衡入口 |
| ExternalName | 映射外部域名 |

**面试表达**：

> Pod 会重建，IP 会变，所以不能直接依赖 Pod IP。Service 用 selector 找到一组 Pod，给调用方一个稳定入口，内部再负载均衡到具体 Pod。

## 9. Ingress 和 Service 有什么区别？

**一句话回答**：Service 解决集群内服务稳定访问，Ingress 解决 HTTP/HTTPS 外部入口、域名、路径路由和 TLS 终止。

**面试表达**：

> Service 像服务内部入口，Ingress 像七层网关规则。外部用户访问域名后，Ingress Controller 根据 host/path 路由到不同 Service，再由 Service 转发到 Pod。

## 10. ConfigMap 和 Secret 有什么区别？

**一句话回答**：ConfigMap 存普通配置，Secret 存敏感配置；二者都能以环境变量或文件挂载方式注入 Pod。

**注意点**：

- 镜像不要包含环境配置。
- 配置变更不一定自动让应用热更新。
- Secret 也要注意权限和加密，不等于绝对安全。
- Java 应用要明确配置刷新方式。

**面试表达**：

> 镜像应该和环境无关，配置通过 ConfigMap 或 Secret 注入。普通开关、地址用 ConfigMap，密码、token、证书用 Secret。但配置变更后应用是否生效，还要看应用是否支持热加载。

## 11. readinessProbe 和 livenessProbe 有什么区别？

**一句话回答**：readinessProbe 判断 Pod 是否可以接收流量，livenessProbe 判断容器是否还活着，失败后会重启容器。

| 探针 | 作用 | 失败后果 |
| --- | --- | --- |
| readiness | 是否就绪接流量 | 从 Service Endpoints 摘除 |
| liveness | 是否存活 | 重启容器 |
| startup | 是否启动完成 | 保护慢启动应用 |

**面试表达**：

> Java 应用启动慢时不能乱配 liveness，否则还没启动完就被反复杀。readiness 控制能不能接流量，liveness 控制是不是需要重启，startup 适合保护慢启动过程。

## 12. 滚动发布怎么保证平滑？

**关键点**：

- 配置合理 `maxSurge` 和 `maxUnavailable`。
- 新 Pod readiness 通过后再接流量。
- 旧 Pod 收到 SIGTERM 后优雅停机。
- 设置 preStop 和 terminationGracePeriod。
- 保证接口和数据库结构向前兼容。

**面试表达**：

> 平滑发布不是 K8s 自动就万无一失。新 Pod 要 readiness 通过再接流量，旧 Pod 要优雅停机处理存量请求；数据库字段和接口协议要兼容，否则新旧版本共存期间会出问题。

## 13. request 和 limit 有什么区别？

**一句话回答**：request 是调度时需要的资源，limit 是运行时最大可用资源；CPU 超 limit 会被限制，内存超 limit 通常会 OOMKilled。

**面试表达**：

> request 决定 Pod 能调度到哪里，limit 决定最多能用多少。Java 服务如果 memory limit 太小，JVM 堆外、线程栈和 metaspace 加起来超过限制，就可能 OOMKilled。

## 14. HPA 是什么？怎么扩容？

**一句话回答**：HPA 根据 CPU、内存或自定义指标自动调整 Pod 副本数，适合无状态应用弹性扩缩容。

**注意点**：

- 扩容不是瞬时完成，Pod 启动和预热需要时间。
- 指标要选对，CPU 不一定代表业务压力。
- 下游 DB/Redis/MQ 也要能承受扩容后的流量。
- 有状态任务和定时任务不能盲目 HPA。

**面试表达**：

> HPA 只能扩应用实例，不能凭空扩下游容量。如果应用扩容后 DB 连接数、Redis 热 key、MQ 消费端都撑不住，反而会把下游打挂。所以扩容要和限流、连接池、下游容量一起设计。

## 15. Pod 一直重启怎么排查？

**排查路径**：

1. `kubectl describe pod` 看 events 和退出原因。
2. `kubectl logs --previous` 看上一次崩溃日志。
3. 看是否 OOMKilled。
4. 看探针是否配置错误。
5. 看配置、环境变量、Secret 是否缺失。
6. 看镜像启动命令、端口、权限。
7. Java 应用看 JVM 参数、启动依赖和外部连接。

**面试表达**：

> Pod 重启先看 describe 和 previous logs。很多问题不是 K8s 本身，而是应用启动失败、探针打错路径、内存 limit 太小或配置缺失。

## 16. Service 访问不通怎么排查？

**排查路径**：

- Service selector 是否能选到 Pod。
- Endpoints 是否为空。
- Pod readiness 是否通过。
- 目标端口和容器端口是否对应。
- NetworkPolicy 是否拦截。
- DNS 是否解析正常。
- 应用是否监听 `0.0.0.0` 而不是 `127.0.0.1`。

**面试表达**：

> Service 不通先看 Endpoints，如果为空，多半是 selector 不匹配或 Pod 没 ready。如果 Endpoints 有，再看端口、DNS、网络策略和应用监听地址。

## 17. K8s 中 Java 应用如何做优雅停机？

**关键步骤**：

1. 收到 SIGTERM 后停止接新请求。
2. readiness 失败，从 Service 摘流。
3. 等待已有请求处理完成。
4. 关闭线程池、MQ Consumer、连接池。
5. 在 grace period 内退出。

**面试表达**：

> 优雅停机的重点是先摘流，再处理完存量请求。Java 服务要响应 SIGTERM，关闭 MQ 消费和线程池，避免发布时请求处理一半被杀。

## 18. 如何结合项目讲 Docker/K8s？

**回答结构**：

1. Java 应用打包成镜像，配置外置。
2. Deployment 管理副本和发布。
3. Service 提供服务发现。
4. readiness/liveness 保证流量和自愈。
5. request/limit 控制资源。
6. 日志、指标、Trace 接入可观测平台。

**面试表达**：

> 我会把容器化讲成交付链路：应用构建成镜像，配置通过 ConfigMap/Secret 注入，Deployment 做滚动发布，Service 提供稳定访问，探针保证就绪后再接流量，资源限制防止互相影响，日志和指标统一采集便于排障。

## 高频追问速记

| 问题 | 速答 |
| --- | --- |
| 镜像和容器区别？ | 镜像是模板，容器是运行实例。 |
| Pod 是什么？ | K8s 最小调度单元，可包含一个或多个容器。 |
| Service 解决什么？ | 给动态 Pod 提供稳定访问入口。 |
| Ingress 解决什么？ | HTTP/HTTPS 外部入口和七层路由。 |
| readiness 和 liveness 区别？ | readiness 控制接流量，liveness 控制是否重启。 |
| OOMKilled 怎么看？ | describe pod 看退出原因，再看 limit/JVM 参数。 |
| 滚动发布风险？ | 新旧版本兼容、探针、优雅停机、数据库变更。 |

## 参考资料

- Docker Overview：`https://docs.docker.com/get-started/docker-overview/`
- Kubernetes Overview：`https://kubernetes.io/docs/concepts/overview/`

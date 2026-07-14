# RocketMQ 大厂高频面试题与答案

这份材料用于准备互联网大厂 Java 后端面试中的 RocketMQ 专题。回答时不要只背“异步、削峰、解耦”这几个词，最好按“业务场景 -> RocketMQ 能力 -> 风险点 -> 兜底方案 -> 项目表达”来讲。尤其可以结合到家服务履约、工单状态 MQ、库存 token 补偿、订单关单、支付回调这类项目经验回答。

---

## 1. RocketMQ 适合解决什么问题？

**常见问法**

- 为什么系统要引入 MQ？
- RocketMQ 在业务系统里主要解决什么问题？
- MQ 是不是一定能提升性能？

**答案**

RocketMQ 主要解决四类问题：

1. **异步化**：主流程只做核心事务，非核心动作异步处理。例如下单成功后异步通知库存、履约、积分、优惠券、财务。
2. **削峰填谷**：流量高峰时先把请求写入 MQ，消费者按自身能力处理，避免数据库或下游服务被瞬间打爆。
3. **系统解耦**：生产者只发布业务事件，不需要强依赖所有下游系统。新增下游只要订阅对应 Topic/Tag。
4. **最终一致性**：本地事务完成后，通过消息驱动其他服务完成后续动作，并配合幂等、重试和补偿达到最终一致。

但 MQ 不是银弹。引入 MQ 后，系统会从同步调用变成异步链路，需要额外处理消息丢失、重复消费、乱序、积压、延迟、死信、排查复杂度等问题。

**关键细节**

- MQ 适合非强实时、可重试、可最终一致的业务。
- 如果业务要求调用方立刻拿到下游强一致结果，纯 MQ 不一定适合。
- MQ 提高的是系统削峰和解耦能力，不是无条件提高单次业务的响应可靠性。
- 关键链路要有 traceId、业务主键、状态表、补偿任务和告警。

**面试表达**

> 我理解 MQ 的核心价值不是简单“加快接口”，而是把核心事务和后续副作用拆开。像工单状态变更、库存缓存刷新、履约通知这类动作，可以通过 RocketMQ 异步驱动，下游失败后重试或补偿。代价是必须处理至少一次投递带来的重复消费、乱序和积压问题。

---

## 2. RocketMQ 的整体架构是什么？

**常见问法**

- RocketMQ 有哪些核心组件？
- NameServer、Broker、Producer、Consumer 分别负责什么？
- RocketMQ 为什么不依赖 ZooKeeper？

**答案**

RocketMQ 的核心组件包括：

- **Producer**：消息生产者，负责把消息发送到 Broker。
- **Consumer**：消息消费者，从 Broker 拉取或接收消息并执行业务逻辑。
- **Broker**：消息存储和投递节点，负责消息写入、持久化、查询、消费进度管理、重试和死信。
- **NameServer**：轻量级路由中心，保存 Topic 到 Broker 的路由信息。Producer 和 Consumer 从 NameServer 获取路由，再直接和 Broker 通信。
- **Topic**：消息主题，用于按业务领域区分消息。
- **MessageQueue**：Topic 下的队列，是消息并发、顺序和负载均衡的基本单位。
- **ConsumerGroup**：消费者组，同一个组内多个消费者共同消费一份消息。

RocketMQ 的 NameServer 是轻量级、无状态的路由注册中心，Broker 定期向 NameServer 上报路由，客户端定期拉取路由。多个 NameServer 之间不做强一致同步，因此部署简单，也避免了强依赖 ZooKeeper 带来的复杂性。

**关键细节**

- Producer 不是把消息发给 NameServer，而是从 NameServer 获取路由后发给 Broker。
- Broker 是真正存储消息的节点。
- Topic 下有多个 MessageQueue，消费者组内的实例按队列维度负载均衡。
- 同一个 ConsumerGroup 内，一条普通消息通常只会被一个消费者实例消费；不同 ConsumerGroup 会各自消费一份。

**面试表达**

> RocketMQ 可以理解为 NameServer 管路由，Broker 管存储和投递，Producer 负责发送，Consumer 负责消费。客户端先从 NameServer 拿 Topic 路由，再直接和 Broker 交互。真正决定并发度和顺序性的不是 Topic 本身，而是 Topic 下面的 MessageQueue。

---

## 3. RocketMQ 的消息发送流程是什么？

**常见问法**

- Producer 发送一条消息经历哪些步骤？
- 同步发送、异步发送、单向发送有什么区别？
- 发送失败怎么办？

**答案**

Producer 发送消息的大致流程：

1. Producer 启动后连接 NameServer，获取 Topic 路由信息。
2. 根据路由选择一个 Broker 和 MessageQueue。
3. 把消息发送给对应 Broker。
4. Broker 写入 CommitLog，并构建 ConsumeQueue 索引。
5. Broker 返回发送结果。
6. Consumer 后续根据消费进度从 Broker 拉取消息。

RocketMQ 常见发送方式：

- **同步发送**：Producer 等待 Broker 返回结果，适合订单创建、支付成功、状态变更等重要消息。
- **异步发送**：Producer 不阻塞等待结果，通过回调处理成功或失败，适合吞吐要求更高但仍需知道结果的场景。
- **单向发送**：Producer 只管发送，不等待结果，吞吐高但可靠性弱，适合日志、埋点等允许丢失的消息。

**关键细节**

- 关键业务消息优先同步发送或可靠异步发送。
- 发送失败要区分网络失败、Broker 不可用、超时和业务参数错误。
- 对关键消息，最好配合本地消息表或事务消息兜底。
- 发送结果成功只代表消息到达 Broker 并写入成功，不代表消费者已经处理成功。

**面试表达**

> 对业务关键消息，我不会用单向发送。一般会同步发送，失败后重试；如果本地事务成功但消息发送失败风险很高，就引入本地消息表或 RocketMQ 事务消息，保证消息投递这件事可恢复、可追踪。

---

## 4. RocketMQ 如何保证消息不丢？

**常见问法**

- RocketMQ 怎么保证消息可靠性？
- 消息丢失可能发生在哪些环节？
- 生产者成功发送后，消息一定不会丢吗？

**答案**

消息可靠性要分三段看：生产端、Broker 端、消费端。

### 生产端

- 关键消息使用同步发送或可靠异步发送。
- 发送失败要重试，并记录失败原因。
- 本地事务与消息发送之间有一致性要求时，可以用本地消息表或事务消息。
- 消息体要带业务主键、事件类型、traceId，便于补偿和排查。

### Broker 端

- Broker 要开启持久化，消息写入磁盘。
- 对可靠性要求高的场景使用同步刷盘，降低机器宕机导致消息丢失的概率。
- 主从部署时使用同步复制可以进一步提高可靠性，但会牺牲吞吐和延迟。
- 关注 Broker 磁盘、PageCache、刷盘延迟、主从同步延迟。

### 消费端

- 消费逻辑成功后再返回成功。
- 消费失败要返回失败或抛异常，让 RocketMQ 触发重试。
- 消费端必须幂等，因为重试可能带来重复消费。
- 重试多次仍失败的消息进入死信队列，后续人工或任务补偿。

**关键细节**

- “发送成功”不等于“业务处理成功”。
- “消费成功返回”之前，业务事务必须已经真正提交。
- 如果消费者先返回成功再执行业务，业务失败后 RocketMQ 不会自动重投。
- 可靠性越高，通常吞吐和延迟成本越高，需要结合业务等级选择。

**面试表达**

> 我会从生产端、Broker 和消费端三段讲可靠性。生产端要能重试或落本地消息表，Broker 端要关注刷盘和主从复制，消费端要在业务成功后再 ack，并做好失败重试、死信和补偿。关键是不要把“消息发送成功”误认为“整条业务链路成功”。

---

## 5. RocketMQ 为什么会重复消费？怎么处理？

**常见问法**

- RocketMQ 能保证消息只消费一次吗？
- 重复消费有哪些原因？
- 消费端幂等怎么做？

**答案**

RocketMQ 通常提供至少一次投递语义，不能依赖“消息只来一次”。重复消费常见原因：

- 消费者处理成功，但返回 ack 前宕机或网络异常。
- 消费者处理超时，Broker 认为消费失败后重新投递。
- 消费者主动返回失败，消息进入重试。
- Rebalance 过程中，消费进度提交不及时。
- 生产者因为超时重试，导致同一业务消息被发送多次。

处理重复消费的核心是消费者幂等。常见方案：

1. **唯一索引幂等**：用订单号、支付流水号、工单号、消息事件 ID 建唯一索引，插入成功才处理，插入失败说明已处理。
2. **消费记录表**：记录 `message_key + consumer_group + event_type`，消费前先判断是否处理过。
3. **状态机幂等**：只允许合法状态流转，例如工单只能从 `CREATED` 流转到 `ASSIGNED`，已完成状态不能被重复完成。
4. **条件更新**：SQL 加当前状态条件，例如 `WHERE order_status = 'WAIT_PAY'`，影响行数为 0 说明已被处理。
5. **分布式锁辅助**：对并发重复消费做短时间互斥，但不能只依赖锁，最终仍要靠数据库唯一约束或状态条件兜底。

**关键细节**

- 幂等 key 必须来自业务唯一标识，不能只用 RocketMQ 的 msgId。
- 消费端幂等要覆盖“重复消息”和“并发重复处理”。
- 幂等记录和业务更新最好在同一个本地事务里提交。
- 对可重试异常返回失败，对不可重试异常要记录告警或进入死信处理。

**面试表达**

> 我默认 MQ 一定可能重复投递，所以消费端必须按业务主键幂等。比如支付回调用支付流水号，工单状态事件用工单号加事件类型，库存扣减用订单号或 token 做唯一约束。真正防重复的不是 MQ，而是消费端的唯一索引、状态机和条件更新。

---

## 6. RocketMQ 顺序消息怎么实现？

**常见问法**

- RocketMQ 如何保证消息顺序？
- 全局顺序和局部顺序有什么区别？
- 顺序消息会不会影响性能？

**答案**

RocketMQ 的顺序消息核心是：同一业务 key 的消息发送到同一个 MessageQueue，并由消费者按队列顺序消费。

常见做法：

1. 生产端根据业务 key 选择队列，例如 `orderId % queueCount`，保证同一订单的创建、支付、发货、完成消息进入同一个队列。
2. 消费端使用顺序消费模式，同一个队列同一时间只被一个消费者线程顺序处理。
3. 消费逻辑里做状态校验，防止乱序消息或重复消息导致状态倒退。

全局顺序是整个 Topic 只有一个队列，所有消息严格按发送顺序消费；局部顺序是同一业务 key 内有序，不同 key 之间并发消费。生产上通常使用局部顺序，因为全局顺序会严重限制吞吐。

**关键细节**

- RocketMQ 顺序消息通常只能保证同一个队列内顺序。
- 要保证同一业务 key 进入同一个队列。
- 顺序消费遇到一条消息失败，可能阻塞该队列后续消息。
- 不要为了全局有序把 Topic 队列数设成 1，除非业务吞吐非常低且确实需要。
- 状态机仍然要做兜底，因为上游重复发送、补偿消息或不同 Topic 事件仍可能造成业务层乱序。

**面试表达**

> 我一般不会追求全局顺序，而是保证同一个订单或同一个工单内部有序。生产端按业务 ID 选择同一个队列，消费端顺序消费，再用状态机防止状态倒退。这样既能保证关键对象内部的顺序，又不会牺牲整个 Topic 的并发能力。

## 6.1. Java 结合 Spring Boot 如何实现 RocketMQ 顺序消息？

**常见问法**

- Spring Boot 项目里怎么发送 RocketMQ 顺序消息？
- `syncSendOrderly` 的 `hashKey` 应该传什么？
- 消费端怎么配置顺序消费？

**解决方案**

Spring Boot 里最常见的落地方式是：生产端使用 `RocketMQTemplate.syncSendOrderly(destination, payload, hashKey)`，把同一个业务对象的消息按同一个 `hashKey` 路由到同一个 MessageQueue；消费端使用 `consumeMode = ConsumeMode.ORDERLY`，让 RocketMQ 按队列顺序消费。

Maven 依赖示例：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>${rocketmq-spring-boot.version}</version>
</dependency>
```

配置示例：

```yaml
rocketmq:
  name-server: 127.0.0.1:9876
  producer:
    group: order-event-producer-group
```

消息 DTO 示例：

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderEventMessage {
    private Long orderId;
    private String eventType;
    private Integer status;
    private Long version;
    private Long eventTime;
}
```

生产者示例：

```java
@Service
@RequiredArgsConstructor
public class OrderEventProducer {

    private static final String TOPIC = "order_event_topic";
    private static final String TAG = "ORDER_STATUS";

    private final RocketMQTemplate rocketMQTemplate;

    public void sendOrderEvent(OrderEventMessage message) {
        String destination = TOPIC + ":" + TAG;

        // 核心：同一个 orderId 作为 hashKey，会路由到同一个 MessageQueue。
        String hashKey = String.valueOf(message.getOrderId());

        rocketMQTemplate.syncSendOrderly(destination, message, hashKey);
    }
}
```

同一个订单按顺序发送：

```java
producer.sendOrderEvent(build(orderId, "CREATED", 10, 1L));
producer.sendOrderEvent(build(orderId, "PAID", 20, 2L));
producer.sendOrderEvent(build(orderId, "DELIVERED", 30, 3L));
producer.sendOrderEvent(build(orderId, "FINISHED", 40, 4L));
```

消费者示例：

```java
@Slf4j
@Service
@RocketMQMessageListener(
        topic = "order_event_topic",
        selectorExpression = "ORDER_STATUS",
        consumerGroup = "order-status-consumer-group",
        consumeMode = ConsumeMode.ORDERLY
)
public class OrderEventConsumer implements RocketMQListener<OrderEventMessage> {

    @Override
    public void onMessage(OrderEventMessage message) {
        log.info("receive order event: orderId={}, eventType={}, version={}",
                message.getOrderId(), message.getEventType(), message.getVersion());

        // 顺序消费里不要再把同一个业务 key 的消息丢到线程池异步处理。
        handleOrderStatus(message);
    }

    private void handleOrderStatus(OrderEventMessage message) {
        // 建议使用状态机、版本号或条件更新兜底，防重复、乱序和状态倒退。
        // UPDATE order_info
        // SET status = ?, version = ?
        // WHERE order_id = ?
        //   AND version < ?
    }
}
```

**关键细节**

- `hashKey` 要选业务维度，例如 `orderId`、`workOrderId`、`userId`，不要随便用随机值。
- 同一个业务 key 的消息要尽量由同一个业务流程串行发送；如果多个线程同时发送同一个 key，发送顺序本身就可能乱。
- 消费端使用 `ConsumeMode.ORDERLY` 后，`onMessage` 内部不要再异步并发处理同一个业务 key。
- 即使使用顺序消息，业务侧仍然要用状态机、版本号、幂等表或条件更新兜底。

**面试表达**

> Spring Boot 里我会用 `RocketMQTemplate.syncSendOrderly` 发送顺序消息，把 `orderId` 或 `workOrderId` 作为 `hashKey`，保证同一个业务对象的消息进入同一个 MessageQueue。消费端通过 `@RocketMQMessageListener(consumeMode = ConsumeMode.ORDERLY)` 做顺序消费。业务上再用状态机或版本号防止重复消费、状态倒退和补偿消息晚到。

## 6.2. 消费端部署多台会不会影响顺序？

**常见问法**

- 如果消费端部署了多台，还能保证顺序吗？
- 多台消费者会不会同时消费同一个队列？
- 消费者扩容后顺序消息有什么坑？

**答案**

同一个 ConsumerGroup 下，消费端部署多台不会破坏同一个业务 key 的顺序，前提是顺序消息配置正确。

核心机制可以这样理解：

```text
Topic 有多个 MessageQueue
同一个 orderId -> 固定路由到同一个 MessageQueue
同一个 ConsumerGroup 下，一个 MessageQueue 同一时刻只会分配给一台消费者实例消费
```

也就是完整链路必须同时满足三件事：

1. **生产端按同一个业务 key 路由**：例如 Spring Boot 使用 `syncSendOrderly(destination, message, orderId)`，保证同一个订单的创建、支付、发货消息进入同一个 MessageQueue。
2. **消费端使用顺序消费模式**：监听器配置 `consumeMode = ConsumeMode.ORDERLY`，让 RocketMQ 按队列维度串行拉取和处理。
3. **集群消费按队列负载均衡**：同一个 ConsumerGroup 下，一条 MessageQueue 同一时刻只归属于一个消费者实例，因此不会出现两台机器同时消费同一个队列里的同一批顺序消息。

部署多台消费者后，队列会被分配到不同消费者实例：

```text
queue0 -> consumerA
queue1 -> consumerB
queue2 -> consumerA
queue3 -> consumerC
```

如果同一个 `orderId` 的消息都在 `queue1`，那么这些消息会由当前持有 `queue1` 的消费者实例顺序处理。多台机器提升的是不同队列之间的并发能力，不是同一个业务 key 内部的并发能力。

消费端配置示例：

```java
@RocketMQMessageListener(
        topic = "order_event_topic",
        consumerGroup = "order-status-consumer-group",
        consumeMode = ConsumeMode.ORDERLY
)
public class OrderEventConsumer implements RocketMQListener<OrderEventMessage> {

    @Override
    public void onMessage(OrderEventMessage message) {
        // 顺序消费里不要再把同一个 orderId 的消息丢到异步线程池并发处理。
        handleOrderStatus(message);
    }
}
```

**关键细节**

- **消费者实例数不要超过队列数太多**：如果 Topic 只有 4 个队列，同一个 ConsumerGroup 部署 10 台消费者，最多也只有 4 台真正消费，其余实例可能空闲。
- **不要在消费端再异步丢线程池**：如果 `onMessage` 里直接 `executor.submit(() -> handle(message))`，就可能破坏同一个业务 key 的处理顺序。
- **消费失败会阻塞当前队列**：顺序消费为了保证队列内顺序，某条消息失败后，后续消息可能等待重试，所以消费逻辑要短、幂等、可重试。
- **扩缩容会触发 Rebalance**：消费者重启、扩容、缩容时，MessageQueue 可能从一台机器迁移到另一台机器。RocketMQ 顺序消费会尽量通过队列锁避免同一个队列被多台机器同时消费，但业务上仍要用状态机、版本号和幂等表兜底。
- **不同 ConsumerGroup 会各自消费一份**：如果 `order-status-consumer-group` 和 `order-log-consumer-group` 都订阅同一个 Topic，它们各自消费一份消息，不是互相抢消息。

错误示例：

```java
@Override
public void onMessage(OrderEventMessage message) {
    // 不推荐：顺序消息里继续丢线程池，可能打乱同一个业务 key 的处理顺序。
    executor.submit(() -> handleOrderStatus(message));
}
```

**面试表达**

> 消费端部署多台不会破坏顺序，因为 RocketMQ 的顺序是基于 MessageQueue 的。生产端用 `orderId` 这类业务 key 把同一对象的消息路由到同一个队列，消费端使用 `ORDERLY` 顺序消费；在同一个 ConsumerGroup 下，一个队列同一时刻只会被一个消费者实例消费。多台消费者提升的是不同队列之间的并发能力，不是同一个业务 key 内部的并发能力。但要注意队列数决定最大并发度，消费失败会阻塞当前队列，消费者扩缩容会触发 Rebalance，所以业务上还要用幂等、状态机和版本号兜底。

---

## 7. RocketMQ 事务消息原理是什么？

**常见问法**

- RocketMQ 事务消息怎么实现？
- 半消息是什么？
- 事务消息能不能替代分布式事务？

**答案**

RocketMQ 事务消息用于解决“本地事务成功后，消息必须可靠发送”的问题。它不是强分布式事务，而是本地事务和消息投递之间的最终一致方案。

基本流程：

1. Producer 先向 Broker 发送半消息。半消息对消费者不可见。
2. Broker 保存半消息成功后，Producer 执行本地事务。
3. 本地事务成功，Producer 向 Broker 提交半消息，消息对消费者可见。
4. 本地事务失败，Producer 回滚半消息，消息被丢弃。
5. 如果 Producer 提交/回滚结果丢失，Broker 会回查 Producer 的本地事务状态。
6. Producer 根据本地事务表或业务表状态返回提交、回滚或未知。

适用场景：

- 订单创建成功后必须通知库存扣减。
- 支付成功落库后必须通知履约、积分或财务。
- 工单状态更新成功后必须发送状态变更事件。

**关键细节**

- 事务消息保证的是“本地事务与消息发送”的一致，不保证消费者处理一定成功。
- 消费者仍然要幂等、重试和补偿。
- 本地事务状态必须可查询，否则 Broker 回查时无法判断提交还是回滚。
- 事务回查不能依赖内存状态，要查本地事务表或业务表。
- 如果业务链路更复杂，仍需要状态机、补偿任务和对账。

**面试表达**

> RocketMQ 事务消息解决的是本地事务成功后消息必须发出去的问题。它通过半消息、本地事务执行、提交/回滚和事务回查保证生产端最终一致。但它不是完整分布式事务，下游消费失败、重复消费和业务补偿仍然要由消费者和业务系统兜底。

---

## 8. RocketMQ 延迟消息怎么用？一定准时吗？

**常见问法**

- 订单超时关单怎么设计？
- RocketMQ 延迟消息是否严格准时？
- 延迟消息丢了怎么办？

**答案**

延迟消息适合做“到期触发器”，例如：

- 订单 15 分钟未支付自动关单。
- 工单预约后超过指定时间未确认，触发提醒或释放资源。
- 库存空预占后延迟重试。
- 优惠券锁定后超时释放。

典型关单流程：

1. 创建订单成功后发送延迟消息，延迟时间为支付超时时间。
2. 延迟消息到期后消费者收到消息。
3. 消费者查询订单当前状态。
4. 如果仍是待支付，执行关单，并幂等释放库存、优惠券、积分占用。
5. 如果订单已支付或已关闭，直接忽略。
6. 定时任务兜底扫描超时未支付订单，防止延迟消息丢失或消费失败。

RocketMQ 延迟消息不是绝对准时。Broker 负载、消息积压、消费端处理慢、系统调度都可能导致延迟。因此业务不能把延迟消息当成精确定时器，而要把它当成触发检查的一种方式。

**关键细节**

- 收到延迟消息后必须查业务状态，不能直接关单。
- 延迟消息可能重复投递，关单逻辑要幂等。
- 延迟消息可能晚到，业务要接受一定误差。
- 关键场景要配合定时任务兜底。
- 不同 RocketMQ 版本的延迟消息能力不同，面试时可以说“以公司使用版本为准”，避免死背某个版本的细节。

**面试表达**

> 我会把延迟消息当成触发器，不当成精确定时器。比如超时关单，消费延迟消息时先查订单状态，只有待支付才关闭，并幂等释放库存和优惠券。同时用 XXL-Job 定时扫描兜底，防止消息晚到、丢失或消费失败。

## 8.1. Java 结合 Spring Boot 如何实现 RocketMQ 延时消息？

**常见问法**

- Spring Boot 项目里怎么发送 RocketMQ 延时消息？
- `delayLevel` 怎么设置？
- 订单超时关单用延时消息怎么落地？

**解决方案**

Java + Spring Boot 项目里，RocketMQ 延时消息最常见的用法是：生产者发送消息时指定 `delayLevel`，Broker 到时间后再投递给消费者。典型场景包括订单 15 分钟未支付自动关单、库存 token 超时释放、优惠券锁定超时回滚等。

Maven 依赖示例：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>${rocketmq-spring-boot.version}</version>
</dependency>
```

配置示例：

```yaml
rocketmq:
  name-server: 127.0.0.1:9876
  producer:
    group: order-delay-producer-group
```

RocketMQ 4.x 常见延时等级是固定的：

```text
1s 5s 10s 30s 1m 2m 3m 4m 5m 6m 7m 8m 9m 10m 20m 30m 1h 2h
```

常见等级关系：

```text
1  -> 1s
2  -> 5s
3  -> 10s
4  -> 30s
5  -> 1m
6  -> 2m
14 -> 10m
15 -> 20m
16 -> 30m
17 -> 1h
18 -> 2h
```

消息 DTO 示例：

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderCloseDelayMessage {
    private String orderNo;
    private Long orderId;
    private Long createTime;
}
```

生产者示例：

```java
@Service
@RequiredArgsConstructor
public class OrderDelayProducer {

    private static final String TOPIC = "order_delay_topic";
    private static final String TAG = "ORDER_CLOSE";
    private static final long SEND_TIMEOUT = 3000L;

    private final RocketMQTemplate rocketMQTemplate;

    public void sendCloseOrderDelayMessage(OrderCloseDelayMessage message) {
        String destination = TOPIC + ":" + TAG;

        // delayLevel = 15 表示约 20 分钟后投递。
        int delayLevel = 15;

        rocketMQTemplate.syncSend(destination, message, SEND_TIMEOUT, delayLevel);
    }
}
```

消费者示例：

```java
@Slf4j
@Service
@RocketMQMessageListener(
        topic = "order_delay_topic",
        selectorExpression = "ORDER_CLOSE",
        consumerGroup = "order-close-delay-consumer-group"
)
public class OrderCloseDelayConsumer implements RocketMQListener<OrderCloseDelayMessage> {

    private final OrderService orderService;

    public OrderCloseDelayConsumer(OrderService orderService) {
        this.orderService = orderService;
    }

    @Override
    public void onMessage(OrderCloseDelayMessage message) {
        log.info("receive close order delay message, orderNo={}", message.getOrderNo());

        orderService.closeTimeoutOrder(message.getOrderNo());
    }
}
```

关单逻辑示例：

```java
@Transactional(rollbackFor = Exception.class)
public void closeTimeoutOrder(String orderNo) {
    Order order = orderRepository.findByOrderNo(orderNo);
    if (order == null) {
        return;
    }

    if (!OrderStatus.WAIT_PAY.equals(order.getStatus())) {
        return;
    }

    int updated = orderRepository.closeOrderIfWaitPay(orderNo);
    if (updated == 0) {
        return;
    }

    // 关单成功后，再幂等释放库存、优惠券、积分等资源。
    inventoryService.releaseByOrderNo(orderNo);
    couponService.releaseByOrderNo(orderNo);
}
```

SQL 最好带状态条件，避免支付成功和超时关单并发冲突：

```sql
UPDATE order_info
SET order_status = 'CLOSED'
WHERE order_no = #{orderNo}
  AND order_status = 'WAIT_PAY';
```

**关键细节**

- RocketMQ 4.x 常见延迟消息是固定 `delayLevel`，不是任意时间精确定时。
- RocketMQ 5.x 支持更灵活的定时/延时能力，例如按秒或指定时间戳投递，具体要看公司使用版本。
- 延时消息不是绝对准时，只能当触发器。
- 消费时必须查询订单当前状态，不能直接关单。
- 消费端要幂等，因为延时消息也可能重复投递。
- 支付成功和超时关单可能并发，必须用状态条件更新兜底。
- 关键业务建议加 XXL-Job 定时扫描兜底，防止消息晚到、丢失或消费失败。
- 如果业务要求 15 分钟精确关单，而默认等级只有 10 分钟和 20 分钟，可以选择更接近的等级配合状态判断，或用定时任务/时间轮/5.x 定时消息能力补充。

**面试表达**

> RocketMQ 延时消息我一般用于超时关单、库存释放这类场景。生产端发送消息时设置 `delayLevel`，Broker 到期后再投递。消费端收到消息后不能直接执行业务，而是先查订单状态，只有仍然是待支付才关单，并通过状态条件更新、幂等释放库存和定时任务兜底保证最终一致。

---

## 9. RocketMQ 消息积压怎么排查和处理？

**常见问法**

- 线上 RocketMQ 积压了怎么办？
- Consumer 消费变慢怎么定位？
- 如何快速恢复积压？

**答案**

消息积压先定位原因，再决定扩容或治理方式。

### 排查方向

1. **看生产端是否突增**：大促、批处理、补偿任务、导入导出是否突然大量发消息。
2. **看消费者是否异常**：是否有异常重试、线程池打满、应用频繁重启、消费实例下线。
3. **看单条消息耗时**：消费逻辑是否调用慢 SQL、慢 RPC、外部接口、复杂计算。
4. **看下游瓶颈**：DB 连接池、Redis、RPC 服务是否慢。
5. **看失败消息**：是否少量 poison message 一直重试，拖慢整体消费。
6. **看队列分配**：Topic 队列数是否过少，消费者实例数是否大于队列数导致扩容无效。

### 处理方案

- 短期：扩容消费者实例，但前提是队列数足够。
- 短期：提高消费者线程数，但要确认下游 DB/RPC 扛得住。
- 短期：隔离异常消息，避免少量失败消息阻塞整个队列。
- 中期：优化消费逻辑，减少同步 RPC、慢 SQL 和大事务。
- 中期：批量处理、批量写库、异步化下游调用。
- 长期：拆 Topic、拆 Tag、拆消费者组，把不同耗时和优先级的消息隔离。
- 长期：建立积压量、消费耗时、失败率、重试次数、死信数量告警。

**关键细节**

- 消费者实例数超过队列数后，继续加实例不一定提升消费能力。
- 顺序消息积压时，单队列失败会阻塞该队列后续消息。
- 不要盲目提高线程数，否则可能把压力转移到 DB 或下游服务。
- 先止血，再治理根因。

**面试表达**

> 我排查积压会先看是生产突增还是消费变慢，再看消费者线程、失败重试、慢 SQL、下游 RPC 和队列分配。扩容消费者不是万能的，如果 Topic 队列数太少或下游 DB 已经是瓶颈，加机器也解决不了，反而会把下游打垮。

---

## 10. RocketMQ 消息重试和死信队列是什么？

**常见问法**

- 消费失败后 RocketMQ 怎么处理？
- 什么情况下会进入死信队列？
- 死信消息怎么处理？

**答案**

消费者处理消息失败后，可以返回失败或抛异常，RocketMQ 会按重试策略重新投递。重试多次仍失败后，消息会进入死信队列。死信队列表示这条消息已经无法通过普通自动重试完成，需要人工介入或补偿任务处理。

可以把死信队列理解为“异常消息隔离区”：它不是垃圾桶，而是 RocketMQ 为了避免异常消息一直重试、一直拖慢主消费链路，把多次失败的消息转移到一个特殊队列中。

RocketMQ 里死信队列通常按 ConsumerGroup 维度生成，常见形式类似：

```text
%DLQ%consumerGroup
```

例如消费组是：

```text
order-close-consumer-group
```

对应死信队列可能是：

```text
%DLQ%order-close-consumer-group
```

所以死信队列不是“所有异常消息共用一个全局队列”，也不是“每个消费者实例一个死信队列”，而是按消费组隔离。

例如下面两个消费者组都订阅了 `order_event_topic`：

```text
order-close-consumer-group
coupon-release-consumer-group
```

如果它们各自消费失败，死信会分别进入：

```text
%DLQ%order-close-consumer-group
%DLQ%coupon-release-consumer-group
```

反过来，如果同一个 `order-close-consumer-group` 同时消费多个 Topic，这些 Topic 中超过最大重试次数的异常消息，可能都会汇总到这个消费组对应的死信队列里。排查时再通过原始 Topic、Tag、MessageId、业务 Key、traceId、异常日志区分具体来源。

阿里云 RocketMQ 也是这个口径：死信队列对应的是 Group ID，不对应单个 Consumer 实例；同一个 Group ID 下不同 Topic 的死信消息会进入该 Group 对应的死信队列。阿里云 4.x 文档里还提到死信消息有效期和正常消息相同，默认 3 天，超过后会自动删除，所以死信队列不能当长期归档使用。参考：[阿里云 RocketMQ 死信队列](https://help.aliyun.com/zh/apsaramq-for-rocketmq/cloud-message-queue-rocketmq-4-x-series/user-guide/dead-letter-queues)。

消息进入死信队列的典型路径：

```text
正常 Topic -> Consumer 消费失败 -> 重试队列 -> 多次重试仍失败 -> 死信队列
```

常见消费失败原因：

- **下游服务一直不可用**：例如库存服务、优惠券服务、履约服务持续超时。
- **数据库异常**：例如死锁、连接池耗尽、SQL 报错、事务提交失败。
- **消息数据有问题**：例如字段缺失、格式不兼容、枚举值不认识。
- **业务状态不满足**：例如订单不存在、订单已删除、库存 token 不存在，怎么重试都不会成功。
- **消费代码 bug**：例如空指针、类型转换异常、状态判断错误。
- **消费端一直返回失败或抛异常**：RocketMQ 会认为消息没有被成功处理，持续触发重试。

死信处理方式：

1. **先告警**：核心业务只要死信数量大于 0 就应该告警，因为这说明自动重试已经解决不了问题。
2. **查原因**：按 `topic`、`tag`、`messageId`、业务 key、traceId、异常日志定位到底是下游故障、消息格式问题、业务数据问题还是代码 bug。
3. **分类处理**：下游临时故障、数据库短暂异常、接口超时属于可重试问题；消息字段缺失、业务主键不存在、历史脏数据通常属于不可重试问题。
4. **重新消费或补偿**：可重试问题修复后，可以通过 RocketMQ 控制台重新投递，或者用补偿任务按业务主键重新执行。
5. **修数据或修代码**：不可重试问题不要无脑重投，要修数据、修代码，或者记录审计后人工关闭。
6. **修复根因**：死信处理完不代表结束，还要补监控、补幂等、补数据校验、补异常分类，避免同类消息继续进入死信。

**关键细节**

- 不要对所有异常无脑返回失败，业务参数错误可能会无限重试直到死信。
- 可预期的幂等冲突可以直接返回成功。
- 不可重试异常要记录清楚，避免消息反复重试拖垮系统。
- 死信不是终点，关键业务必须有人工或任务补偿入口。
- 死信队列按 ConsumerGroup 维度隔离，不是全局一个队列；同一消费组下不同 Topic 的死信消息可能进入同一个死信队列。
- 阿里云 RocketMQ 死信消息不是永久保留，默认有效期和普通消息一致，线上要在过期前导出、重投或补偿。
- 死信消息重新投递前，要先确认消费代码、下游依赖或业务数据已经修复。
- 对订单、库存、支付、履约这类核心链路，建议建立死信数量、重试次数和消费失败率告警。

**面试表达**

> 死信队列是 RocketMQ 对消费失败消息的兜底隔离机制。消息消费失败后会先进入重试队列，按策略多次重投；如果超过最大重试次数仍然失败，就会进入对应 ConsumerGroup 的死信队列。它不是全局一个队列，也不是按单个消费者实例区分，而是按消费组隔离；同一个消费组下不同 Topic 的异常消息可能进入同一个死信队列。处理时不能简单丢弃，要先告警，再根据原始 Topic、业务 key、traceId 和异常日志定位原因。临时故障修复后可以重新投递或跑补偿任务；如果是消息格式错误、业务数据不存在这类不可重试问题，就要修数据、修代码或人工确认后关闭。

---

## 11. RocketMQ 的 ConsumerGroup 怎么理解？

**常见问法**

- ConsumerGroup 有什么作用？
- 集群消费和广播消费有什么区别？
- 多个系统都要消费同一条消息怎么办？

**答案**

ConsumerGroup 表示一组消费者实例。RocketMQ 通过 ConsumerGroup 管理消费进度、负载均衡、重试和死信。

常见消费模式：

- **集群消费**：同一个 ConsumerGroup 内，多台消费者共同消费一份消息。一条消息通常只会被组内一个实例处理，适合业务服务水平扩展。
- **广播消费**：同一个 ConsumerGroup 内，每个消费者实例都消费一遍消息，适合本地缓存刷新、配置通知等场景，但可靠性和重试语义通常要特别谨慎。

如果多个业务系统都要消费同一类事件，应该使用不同的 ConsumerGroup。例如订单状态事件，履约、财务、客服各自一个 ConsumerGroup，各自维护消费进度，互不影响。

**关键细节**

- 同一个 ConsumerGroup 的消费逻辑应该保持一致。
- 不同业务系统不要共用同一个 ConsumerGroup，否则会互相抢消息。
- 新增下游订阅通常新建 ConsumerGroup，而不是复用已有组。
- 消费进度按 ConsumerGroup 维度管理。

**面试表达**

> ConsumerGroup 可以理解为一类消费者的逻辑身份。同一个组内是负载均衡消费，不同组之间各自消费一份。比如工单状态变更事件，履约、财务、客服如果都要处理，就应该用不同 ConsumerGroup，避免互相抢消息。

## 11.1. 一个 Spring Boot 项目只能有一个 ConsumerGroup 吗？

**常见问法**

- 一个 Spring Boot 项目能不能配置多个 ConsumerGroup？
- 同一个项目里多个 `@RocketMQMessageListener` 可以用不同消费组吗？
- 多个 Listener 能不能共用同一个 ConsumerGroup？

**答案**

一个 Spring Boot 项目可以有多个 ConsumerGroup。ConsumerGroup 不是“项目级别只能有一个”的配置，而是 RocketMQ 用来区分一类消费者的逻辑身份。它决定消费进度、负载均衡、重试、死信和消息归属。

同一个项目里可以有多个 Listener，每个 Listener 根据业务语义配置自己的 ConsumerGroup。例如同一条订单支付成功消息，库存逻辑和优惠券逻辑都要处理，就应该使用不同 ConsumerGroup，让它们各自消费一份消息。

库存消费者示例：

```java
@Service
@RocketMQMessageListener(
        topic = "order_event_topic",
        selectorExpression = "ORDER_PAID",
        consumerGroup = "order-paid-inventory-consumer-group"
)
public class OrderPaidInventoryConsumer implements RocketMQListener<OrderPaidMessage> {

    @Override
    public void onMessage(OrderPaidMessage message) {
        // 扣减库存或确认库存预占。
    }
}
```

优惠券消费者示例：

```java
@Service
@RocketMQMessageListener(
        topic = "order_event_topic",
        selectorExpression = "ORDER_PAID",
        consumerGroup = "order-paid-coupon-consumer-group"
)
public class OrderPaidCouponConsumer implements RocketMQListener<OrderPaidMessage> {

    @Override
    public void onMessage(OrderPaidMessage message) {
        // 核销优惠券或释放优惠券锁定状态。
    }
}
```

这两个 ConsumerGroup 不一样，所以它们都会各自消费一份 `ORDER_PAID` 消息，互不抢消息，也各自维护消费进度。

**什么时候用同一个 ConsumerGroup？**

同一个业务消费者部署多台实例时，用同一个 ConsumerGroup 做集群消费和负载均衡：

```text
order-close-consumer-group
  -> app-1
  -> app-2
  -> app-3
```

这表示 3 台机器共同消费同一批关单消息，一条消息通常只会被其中一台处理。

**什么时候用不同 ConsumerGroup？**

多个业务逻辑都要消费同一条消息时，要用不同 ConsumerGroup：

```text
订单支付成功消息
  -> 库存消费组
  -> 优惠券消费组
  -> 积分消费组
  -> 履约消费组
```

它们各自消费一份消息，并且任何一个消费组失败、重试或积压，都不应该影响其他消费组。

**不要这样做**

不要在同一个 Spring Boot 项目里写多个业务语义不同的 Listener，却随意使用同一个 ConsumerGroup：

```java
@RocketMQMessageListener(
        topic = "order_event_topic",
        consumerGroup = "order-consumer-group"
)
public class InventoryConsumer implements RocketMQListener<OrderPaidMessage> {
}
```

```java
@RocketMQMessageListener(
        topic = "coupon_event_topic",
        consumerGroup = "order-consumer-group"
)
public class CouponConsumer implements RocketMQListener<CouponMessage> {
}
```

这种写法语义混乱，容易产生订阅关系冲突、启动失败或消费进度互相影响。更好的做法是按业务消费逻辑命名 ConsumerGroup，例如 `order-paid-inventory-consumer-group`、`coupon-release-consumer-group`。

**关键细节**

- ConsumerGroup 是消费逻辑的身份，不是 Spring Boot 应用的数量限制。
- 同一个业务消费者多实例部署时，使用同一个 ConsumerGroup。
- 多个业务都要消费同一条消息时，使用不同 ConsumerGroup。
- 不同 Topic、不同业务语义的 Listener 不建议共用同一个 ConsumerGroup。
- ConsumerGroup 名称要稳定，不要频繁变更，否则消费进度会按新组重新计算。
- 新增 ConsumerGroup 时，要注意默认从最新消息还是最早消息开始消费，避免漏消费历史消息或重复处理存量消息。

**面试表达**

> 一个 Spring Boot 项目可以有多个 ConsumerGroup。ConsumerGroup 是消费逻辑的身份，不是项目数量限制。同一个业务消费者多实例部署时使用同一个 ConsumerGroup 做负载均衡；如果多个业务都要消费同一条消息，就应该使用不同 ConsumerGroup，各自维护消费进度。不同 Topic、不同业务逻辑的 Listener 不建议共用同一个 ConsumerGroup。

---

## 12. Topic、Tag、Key 应该怎么设计？

**常见问法**

- Topic 和 Tag 怎么划分？
- Message Key 有什么用？
- 一个系统是不是一个 Topic 就够了？

**答案**

设计原则：

- **Topic 按业务领域或事件大类划分**，例如 `order_event_topic`、`workorder_status_topic`、`inventory_event_topic`。
- **Tag 按事件类型划分**，例如 `ORDER_CREATED`、`ORDER_PAID`、`WORKORDER_ASSIGNED`、`TOKEN_RELEASED`。
- **Key 放业务主键**，例如订单号、工单号、支付流水号、库存 token，用于查询、排查和幂等。
- **消息体包含事件版本、发生时间、traceId、业务快照或必要字段**。

不建议把所有消息都放到一个大 Topic，否则权限、监控、积压、消费隔离都会变差。也不建议每个小事件都新建 Topic，否则 Topic 过多会增加管理成本。

**关键细节**

- 高频和低频消息最好隔离。
- 关键链路和非关键链路最好隔离。
- 耗时差异很大的消费逻辑最好隔离。
- 消息体要考虑兼容性，新增字段尽量向后兼容。
- Key 不要只放 msgId，业务排查时最需要的是业务单号。

**面试表达**

> 我会按业务域设计 Topic，按事件类型设计 Tag，Key 放业务唯一标识。比如工单状态事件用工单号作为 Key，Tag 区分已分配、服务开始、服务完成。这样排查时可以按工单号追消息，下游也能按 Tag 订阅自己关心的事件。

---

## 13. RocketMQ 如何处理消息乱序？

**常见问法**

- MQ 消息乱序怎么办？
- 为什么明明按顺序发送，消费时还是乱序？
- 工单状态事件乱序怎么防止状态倒退？

**答案**

消息乱序常见原因：

- 同一业务对象的消息被发送到不同队列。
- 多个消费者实例并发消费。
- 某条消息失败重试，后续消息先被处理。
- 生产者并发发送，业务顺序和发送成功顺序不一致。
- 补偿消息晚于正常消息到达。

处理方案：

1. **局部顺序消息**：同一业务 key 进入同一个队列，消费者顺序消费。
2. **状态机保护**：只允许合法状态流转，不允许从更晚状态倒退到更早状态。
3. **版本号保护**：消息带状态版本或更新时间，只处理版本更新的事件。
4. **条件更新**：SQL 带当前状态条件，影响行数为 0 时忽略或进入补偿。
5. **延迟重试**：收到前置状态未满足的消息，可以短暂延迟重试。

**关键细节**

- 顺序消息解决的是队列内顺序，不解决所有业务乱序。
- 状态机是最终保护，尤其适合订单、工单、库存 token 这种生命周期对象。
- 补偿任务可能产生晚到消息，因此下游不能盲目覆盖状态。

**面试表达**

> 工单状态事件我会用状态机兜底。MQ 可以尽量保证同一工单进入同一个队列，但真正防止状态倒退的是消费端状态校验。比如已服务完成的工单，再收到已分配消息，不能覆盖状态，只能忽略、记录或进入补偿检查。

---

## 14. RocketMQ 的存储机制怎么理解？

**常见问法**

- RocketMQ 消息是怎么存储的？
- CommitLog 和 ConsumeQueue 是什么关系？
- 为什么 RocketMQ 写入性能比较好？

**答案**

RocketMQ 的消息主要存储在 CommitLog 中。CommitLog 是顺序追加写文件，所有 Topic 的消息都会写入 CommitLog。为了让消费者按 Topic 和队列维度消费，RocketMQ 会构建 ConsumeQueue 作为逻辑消费队列索引。ConsumeQueue 里保存消息在 CommitLog 中的位置、大小和 Tag 哈希等信息。

可以简单理解：

- **CommitLog**：消息真实数据存储，顺序写，适合高吞吐。
- **ConsumeQueue**：按 Topic + Queue 组织的消费索引，消费者通过它找到消息位置。
- **IndexFile**：支持按 Key 查询消息，方便排查和运维。

RocketMQ 写入性能好，主要因为 Broker 写 CommitLog 是顺序追加写，配合 PageCache 和刷盘机制，减少随机 IO。

**关键细节**

- Broker 存储不是每个 Topic 一个独立文件，而是统一写 CommitLog。
- ConsumeQueue 是逻辑队列索引，不存完整消息体。
- PageCache 能提高性能，但宕机时是否丢消息取决于刷盘和复制策略。
- 消息查询要依赖 Key，所以业务消息一定要设置有意义的 Key。

**面试表达**

> RocketMQ 的核心存储可以概括为 CommitLog 存真实消息，ConsumeQueue 存消费索引。写入时顺序追加 CommitLog，消费时通过 ConsumeQueue 找到 CommitLog 偏移量再读取消息。顺序写加 PageCache 是它吞吐高的重要原因。

---

## 15. 同步刷盘、异步刷盘、同步复制、异步复制怎么选？

**常见问法**

- RocketMQ 如何权衡性能和可靠性？
- 同步刷盘和异步刷盘有什么区别？
- 主从复制如何影响消息可靠性？

**答案**

刷盘决定消息写入磁盘的时机：

- **同步刷盘**：Broker 收到消息后，等待消息刷入磁盘再返回成功。可靠性高，延迟更高。
- **异步刷盘**：Broker 写入 PageCache 后就返回成功，后台异步刷盘。吞吐高，但机器宕机时可能丢失未刷盘消息。

复制决定主从之间同步方式：

- **同步复制**：主 Broker 写入后等待从 Broker 复制成功再返回。可靠性高，延迟更高。
- **异步复制**：主 Broker 返回更快，从 Broker 异步追数据。吞吐高，但主节点宕机时可能丢失未同步消息。

选择建议：

- 金融、支付、核心交易状态：同步刷盘 + 同步复制，或者至少对关键消息做本地消息表兜底。
- 普通业务事件：异步刷盘 + 主从异步复制，配合重试和补偿。
- 日志、埋点：可以更偏吞吐，允许少量丢失。

**关键细节**

- 可靠性策略越强，延迟和吞吐成本越高。
- 即使 Broker 可靠，消费端业务失败仍然需要幂等和重试。
- 对关键业务，不要只依赖 MQ 配置，还要有业务补偿和对账。

**面试表达**

> 我会按业务等级选择。支付成功、订单状态这类关键消息会更偏可靠性，必要时同步刷盘、同步复制，并配合本地消息表或补偿任务；日志埋点则更偏吞吐。MQ 配置只能降低丢失概率，业务最终还要有对账和补偿。

---

## 16. RocketMQ 和 Kafka 怎么区别？

**常见问法**

- RocketMQ 和 Kafka 有什么区别？
- 为什么业务系统常用 RocketMQ？
- Kafka 更适合什么场景？

**答案**

可以从定位、特性和场景讲：

- **RocketMQ**：更偏业务消息，天然支持事务消息、延迟消息、顺序消息、重试、死信等能力，适合订单、支付、履约、库存、状态事件等 Java 业务系统。
- **Kafka**：更偏日志流、数据管道和大数据生态，吞吐非常强，适合日志采集、用户行为、埋点、流式计算、数据同步等场景。

常见区别：

| 维度 | RocketMQ | Kafka |
| --- | --- | --- |
| 典型定位 | 业务消息 | 日志流、数据流 |
| 事务消息 | 支持业务事务消息 | 支持事务语义，但使用方式偏流式/生产消费一致性 |
| 延迟消息 | 原生支持，版本能力有差异 | 通常需要额外方案 |
| 重试/死信 | 业务消息语义更直接 | 通常需要业务自建或框架支持 |
| 顺序消息 | 支持局部顺序消息 | 分区内有序 |
| 生态 | Java 业务系统常见 | 大数据和流处理生态强 |

**关键细节**

- 不要绝对说谁更好，要结合场景。
- Kafka 分区和 RocketMQ MessageQueue 都能支撑局部顺序。
- RocketMQ 的事务消息、延迟消息、重试和死信对业务系统更友好。
- Kafka 在日志吞吐、流式处理、生态集成上优势明显。

**面试表达**

> 我不会简单说 RocketMQ 比 Kafka 好。RocketMQ 更适合订单、支付、履约这类业务消息，因为事务消息、延迟消息、重试和死信语义比较完整；Kafka 更适合日志、埋点、数据同步和流式计算。选型要看业务消息可靠性还是数据流吞吐生态。

---

## 17. 本地消息表和 RocketMQ 事务消息怎么选？

**常见问法**

- 本地事务提交后 MQ 发送失败怎么办？
- 本地消息表和事务消息哪个更好？
- 最终一致性怎么设计？

**答案**

本地消息表和 RocketMQ 事务消息都用于解决“本地事务与消息发送一致性”的问题。

### 本地消息表

流程：

1. 业务数据和消息记录在同一个数据库事务里提交。
2. 后台任务扫描待发送消息。
3. 投递 MQ 成功后更新消息状态。
4. 失败则继续重试，超过阈值告警。

优点：

- 方案通用，不绑定某个 MQ 特性。
- 消息状态可查询、可审计、可人工补偿。
- 对复杂业务可控性强。

缺点：

- 需要额外表、任务和状态管理。
- 消息投递可能有一定延迟。

### RocketMQ 事务消息

流程：

1. 先发半消息。
2. 执行本地事务。
3. 根据本地事务结果提交或回滚半消息。
4. Broker 不确定时回查事务状态。

优点：

- 生产端一致性能力由 RocketMQ 原生支持。
- 不需要额外扫描投递任务。

缺点：

- 依赖 RocketMQ 事务消息机制。
- 本地事务状态必须可查询。
- 对复杂补偿和审计仍可能需要业务表辅助。

**选择建议**

- 简单“本地事务成功必须发消息”：可以用 RocketMQ 事务消息。
- 需要审计、人工补偿、多渠道投递、复杂状态管理：本地消息表更可控。
- 核心链路也可以组合使用：事务消息负责投递一致性，业务状态表负责回查和补偿。

**面试表达**

> 我会按可控性和复杂度选择。RocketMQ 事务消息适合本地事务和单条消息强绑定的场景；本地消息表更通用，适合需要审计、补偿和多次投递治理的核心业务。无论哪种方案，消费者幂等和状态补偿都不能省。

## 17.1. 本地消息表怎么实现？

**常见问法**

- 本地消息表具体怎么落地？
- 业务事务提交成功但 MQ 发送失败怎么办？
- 多台机器同时扫描消息表会不会重复发送？
- 本地消息表能不能保证消息只发送一次？

**答案**

本地消息表的核心思想是：业务数据和“待发送消息”在同一个本地事务里落库，然后由后台任务异步把消息投递到 RocketMQ，投递成功后更新消息状态。

它解决的是这个问题：

```text
业务事务提交成功了，但 MQ 发送失败了怎么办？
```

不用本地消息表时，可能出现：

```text
创建订单成功 -> 发送 MQ 失败 -> 下游库存/履约永远不知道
```

使用本地消息表后，链路变成：

```text
创建订单 + 插入消息表 在同一个事务提交
后台任务扫描消息表 -> 发送 MQ -> 成功后标记已发送
失败继续重试
```

表结构示例：

```sql
CREATE TABLE local_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    tag VARCHAR(128) DEFAULT NULL,
    message_key VARCHAR(128) NOT NULL,
    body TEXT NOT NULL,
    status TINYINT NOT NULL DEFAULT 0,
    retry_count INT NOT NULL DEFAULT 0,
    max_retry_count INT NOT NULL DEFAULT 10,
    next_retry_time DATETIME NOT NULL,
    last_error VARCHAR(1024) DEFAULT NULL,
    create_time DATETIME NOT NULL,
    update_time DATETIME NOT NULL,
    UNIQUE KEY uk_message_id (message_id),
    KEY idx_status_next_retry_time (status, next_retry_time),
    KEY idx_message_key (message_key)
);
```

状态可以这样定义：

```text
0 INIT      待发送
1 SENDING   发送中
2 SUCCESS   发送成功
3 FAILED    发送失败，等待重试
4 DEAD      超过最大重试次数，人工处理
```

业务事务里写消息表：

```java
@Transactional(rollbackFor = Exception.class)
public void createOrder(CreateOrderCommand command) {
    Order order = orderService.createOrder(command);

    OrderCreatedMessage message = OrderCreatedMessage.builder()
            .orderNo(order.getOrderNo())
            .userId(order.getUserId())
            .amount(order.getAmount())
            .build();

    LocalMessage localMessage = LocalMessage.builder()
            .messageId(UUID.randomUUID().toString())
            .topic("order_event_topic")
            .tag("ORDER_CREATED")
            .messageKey(order.getOrderNo())
            .body(JsonUtils.toJson(message))
            .status(LocalMessageStatus.INIT)
            .retryCount(0)
            .maxRetryCount(10)
            .nextRetryTime(LocalDateTime.now())
            .createTime(LocalDateTime.now())
            .updateTime(LocalDateTime.now())
            .build();

    localMessageRepository.save(localMessage);
}
```

关键是订单表和消息表在同一个数据库事务里提交。这样不会出现“订单成功了，但消息记录没了”的问题。

后台任务扫描并发送 MQ，可以用 XXL-Job、Spring `@Scheduled` 或其他分布式任务框架：

```java
@Scheduled(fixedDelay = 3000)
public void publishLocalMessages() {
    List<LocalMessage> messages = localMessageRepository.findPendingMessages(
            LocalMessageStatus.INIT,
            LocalMessageStatus.FAILED,
            LocalDateTime.now(),
            100
    );

    for (LocalMessage message : messages) {
        publishOne(message);
    }
}
```

发送单条消息：

```java
public void publishOne(LocalMessage message) {
    boolean locked = localMessageRepository.markSending(message.getId());
    if (!locked) {
        return;
    }

    try {
        String destination = message.getTopic() + ":" + message.getTag();

        rocketMQTemplate.syncSend(destination, message.getBody());

        localMessageRepository.markSuccess(message.getId());
    } catch (Exception e) {
        int nextRetryCount = message.getRetryCount() + 1;

        if (nextRetryCount >= message.getMaxRetryCount()) {
            localMessageRepository.markDead(message.getId(), e.getMessage());
            return;
        }

        LocalDateTime nextRetryTime = LocalDateTime.now().plusSeconds(
                calculateRetryDelaySeconds(nextRetryCount)
        );

        localMessageRepository.markFailed(
                message.getId(),
                nextRetryCount,
                nextRetryTime,
                e.getMessage()
        );
    }
}
```

多实例扫描时，要避免同一条消息被多台机器同时发送。常见做法是用状态条件更新抢占：

```sql
UPDATE local_message
SET status = 1,
    update_time = NOW()
WHERE id = #{id}
  AND status IN (0, 3);
```

如果影响行数是 1，说明抢占成功；如果是 0，说明这条消息已经被其他实例抢走。

重试策略不要失败后立刻疯狂重试，可以做退避：

```java
private long calculateRetryDelaySeconds(int retryCount) {
    return Math.min(60L * retryCount, 1800L);
}
```

例如：

```text
第 1 次失败 -> 1 分钟后重试
第 2 次失败 -> 2 分钟后重试
第 3 次失败 -> 3 分钟后重试
最多延迟 30 分钟
```

超过最大次数后标记为 `DEAD`，进入人工处理或专门补偿任务。

**消费端仍然要幂等**

本地消息表只能保证“消息最终能发出去”，不能保证消息只发一次。因为可能发生：

```text
MQ 发送成功了
应用还没来得及把消息表标记 SUCCESS 就宕机
任务重启后又发送一次
```

所以消费者必须幂等。比如库存扣减消费者可以设计扣减流水表：

```sql
CREATE TABLE inventory_deduct_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(64) NOT NULL,
    create_time DATETIME NOT NULL,
    UNIQUE KEY uk_order_no (order_no)
);
```

消费时先插入流水，插入成功才执行扣减：

```java
@Transactional(rollbackFor = Exception.class)
public void consume(OrderCreatedMessage message) {
    boolean inserted = inventoryDeductRecordRepository.insertIgnore(message.getOrderNo());
    if (!inserted) {
        return;
    }

    inventoryRepository.deductByOrderNo(message.getOrderNo());
}
```

整体流程：

```text
1. 业务方法开启本地事务
2. 写订单表
3. 写 local_message 表
4. 本地事务提交
5. 后台任务扫描待发送消息
6. 调 RocketMQ 发送
7. 发送成功，标记 SUCCESS
8. 发送失败，记录失败原因和下次重试时间
9. 超过最大重试次数，标记 DEAD
10. 消费端按业务主键幂等处理
```

**关键细节**

- 业务表和消息表必须在同一个本地事务中提交。
- 消息表要有状态、重试次数、下次重试时间、错误信息、业务 key。
- 多实例扫描要用状态条件更新或分布式锁抢占消息。
- 发送成功但标记成功前宕机，可能导致重复发送，所以消费端必须幂等。
- 消息体要带业务主键、事件类型、版本、traceId，方便排查和补偿。
- 超过最大重试次数要进入 `DEAD` 状态，并建立告警和人工补偿入口。
- 本地消息表通常会有一定投递延迟，适合最终一致，不适合强实时同步返回。

**面试表达**

> 本地消息表是为了解决本地事务和 MQ 发送之间的一致性问题。我的做法是在业务事务里同时写业务表和消息表，事务提交后由后台任务扫描消息表投递 MQ。发送成功标记成功，发送失败记录失败原因并按退避策略重试，超过最大次数进入人工补偿。因为发送成功但标记成功前宕机可能导致重复投递，所以消费端必须用业务唯一键、状态机或唯一索引做幂等。

---

## 18. RocketMQ 在秒杀系统里怎么用？

**常见问法**

- 秒杀为什么要用 MQ？
- Redis 扣减成功后，MQ 消费失败怎么办？
- 如何保证秒杀库存最终一致？

**答案**

秒杀系统中 RocketMQ 主要用于削峰和最终一致。

典型链路：

1. 活动开始前把库存预热到 Redis。
2. 用户请求经过限流、防刷、一人一单校验。
3. Redis Lua 原子预扣库存。
4. 预扣成功后创建秒杀资格或订单。
5. 通过 RocketMQ 发送订单创建、库存落库、支付超时关单等消息。
6. 消费端异步扣减 MySQL 库存、生成订单后续数据或通知下游。
7. 用户超时未支付，通过延迟消息触发关单和库存回补。
8. 定时任务对账 Redis、MySQL、订单状态和库存流水。

**关键细节**

- Redis 是高并发扣减的第一边界，防止超卖。
- MQ 用于削峰落库，不应该让所有请求直接打数据库。
- 消费端用订单号或流水号唯一索引防重复扣减。
- 关单时必须先查订单状态，已支付不能释放库存。
- 对账任务用于最终校准。

**面试表达**

> 秒杀里 RocketMQ 不是用来防超卖的第一手段，防超卖靠 Redis Lua 或数据库条件更新。MQ 的作用是削峰异步落库和驱动后续流程。为了保证最终一致，下游扣减要有流水唯一索引，超时关单要幂等回补，最后用定时对账兜底。

---

## 19. RocketMQ 在订单超时关单里怎么设计？

**常见问法**

- 订单 15 分钟未支付自动关闭怎么做？
- 延迟消息和定时任务怎么配合？
- 支付成功和关单并发怎么办？

**答案**

订单创建成功后发送延迟消息。延迟消息到期后，消费者查询订单状态：

- 如果订单仍是 `WAIT_PAY`，执行关单。
- 如果订单已支付，直接忽略。
- 如果订单已关闭，直接返回成功。

关单和支付成功可能并发，因此数据库更新必须带状态条件：

```sql
UPDATE order_info
SET order_status = 'CLOSED'
WHERE order_no = #{orderNo}
  AND order_status = 'WAIT_PAY';
```

支付成功也要带状态条件：

```sql
UPDATE order_info
SET order_status = 'PAID'
WHERE order_no = #{orderNo}
  AND order_status = 'WAIT_PAY';
```

谁先更新成功，谁获得状态流转权。另一个影响行数为 0，就查询当前状态并按幂等处理。

**关键细节**

- 延迟消息只负责触发，不能不查状态就关单。
- 关单成功后再释放库存、优惠券和锁定资源。
- 支付回调和关单都要幂等。
- 延迟消息失败时，用定时任务扫描超时未支付订单兜底。
- 库存释放也要按订单号或库存流水防重复。

**面试表达**

> 关单最关键的是防止和支付成功并发冲突。我会让支付和关单都走状态条件更新，只有 `WAIT_PAY` 才能变成 `PAID` 或 `CLOSED`。延迟消息到期后先查状态，再幂等关单；如果消息漏了，定时任务兜底扫描。

---

## 20. RocketMQ 在分布式事务里怎么落地？

**常见问法**

- 下单、扣库存、发优惠券如何保证一致？
- 为什么不用强分布式事务？
- MQ 最终一致怎么设计？

**答案**

互联网业务里，跨服务链路通常不使用强分布式事务把所有服务绑在一个大事务里，因为会带来锁时间长、接口超时、吞吐下降、服务耦合严重等问题。更常见的是“本地事务 + MQ 事件 + 幂等消费 + 状态补偿 + 对账”的最终一致方案。

例如下单链路：

1. 订单服务本地事务创建订单，记录订单状态。
2. 通过事务消息或本地消息表发送订单创建事件。
3. 库存服务消费消息，按订单号幂等扣减库存或确认预占。
4. 优惠券服务消费消息，锁定或核销优惠券。
5. 履约服务消费消息，创建履约任务。
6. 任一服务失败，消息重试；重试失败进入死信或补偿任务。
7. 定时任务对账订单、库存、优惠券、履约状态。

**关键细节**

- 每个服务只保证自己的本地事务。
- 跨服务通过业务状态和消息事件驱动。
- 消费端必须幂等，否则重试会导致重复扣减或重复发放。
- 状态机能防止乱序消息造成状态倒退。
- 最终一致必须配套监控、告警和人工修复入口。

**面试表达**

> 我不会为了所有链路强一致就上 XA。订单、库存、履约这类链路更适合本地事务加 MQ 最终一致。每个服务守住自己的本地事务，通过消息驱动下游，消费端做幂等和状态校验，失败后重试、死信、补偿和对账。

---

## 21. 生产者发送成功，但消费者一直收不到怎么办？

**常见问法**

- 消息发送成功但消费不到怎么排查？
- Topic、Tag、ConsumerGroup 会导致消费不到吗？
- 怎么定位 RocketMQ 链路问题？

**答案**

排查思路：

1. **确认发送结果**：Producer 是否真的发送成功，是否发到了预期 Topic。
2. **查消息 Key**：通过业务 Key 或 msgId 查 Broker 上是否存在消息。
3. **确认 Topic 和 Tag**：消费者订阅的 Topic/Tag 是否和生产者一致。
4. **确认 ConsumerGroup**：是否使用了错误的消费者组，是否和其他应用共用组导致消息被抢。
5. **确认消费模式**：集群消费还是广播消费，是否符合预期。
6. **看消费进度**：是否有积压、是否已经被消费、是否进入重试或死信。
7. **看消费者日志**：是否消费后异常、是否过滤掉、是否幂等判断为已处理。
8. **看部署环境**：NameServer、Broker 地址、环境隔离、权限配置是否正确。

**关键细节**

- 不同 ConsumerGroup 会各消费一份，同一个 ConsumerGroup 内会负载均衡消费。
- Tag 过滤配置错误很常见。
- 消费过但业务没生效，通常要查消费者日志和业务幂等表。
- 生产者成功只代表 Broker 收到，不代表目标消费者已处理。

**面试表达**

> 我会先用业务 Key 查消息是否在 Broker，再看 Topic、Tag、ConsumerGroup 和消费进度。如果消息已被消费但业务没变化，就继续查消费者日志、幂等表、状态条件更新和死信队列，而不是只盯着生产端。

---

## 22. 消费端如何设计得更稳定？

**常见问法**

- 写 RocketMQ Consumer 要注意什么？
- 消费逻辑里面能不能做很重的业务？
- 如何避免消费者拖垮下游？

**答案**

稳定的 Consumer 要遵循几个原则：

1. **短事务**：消费逻辑尽量短，避免大事务和长时间持锁。
2. **可幂等**：先设计幂等，再写业务逻辑。
3. **可重试**：区分可重试和不可重试异常。
4. **可降级**：下游不可用时不要无限压测下游，可以限流、熔断或进入补偿。
5. **可观测**：记录业务 key、traceId、消费耗时、失败原因。
6. **可隔离**：不同业务、不同耗时、不同优先级的消息拆开。
7. **可补偿**：失败后有死信处理、补偿任务或人工修复入口。

**关键细节**

- 消费成功后再返回成功。
- 不要在消费者里做无法控制耗时的大批量操作。
- 外部 RPC 要设置超时，避免线程长期挂住。
- 消费线程数不是越大越好，要看 DB、Redis、RPC 下游承载能力。
- 对热点业务 key，可以做单 key 限流或拆分。

**面试表达**

> 我写 Consumer 会先考虑幂等和失败语义。业务成功提交后才返回成功；下游超时可重试，业务参数错误要记录并进入补偿；同时打好 traceId、业务 key 和耗时日志。消费者稳定性差，MQ 积压和下游雪崩很快就会一起出现。

---

## 23. RocketMQ 如何结合项目经验来讲？

**常见问法**

- 你项目里 RocketMQ 用在哪些地方？
- 遇到过 MQ 相关线上问题吗？
- 你如何保证 MQ 链路最终一致？

**答案**

可以结合“到家服务履约与库存协同平台”这样表达：

### 工单状态事件

服务单或工单状态发生变化后，通过 RocketMQ 发送状态事件，下游合同、财务、客服、运营看板按不同 ConsumerGroup 消费。消费者根据工单号和状态版本做幂等，状态机防止重复消息或乱序消息造成状态倒退。

### 库存 token 预占和释放

工单预约成功后，库存侧生成或确认服务库存 token；取消、改约、迁站时通过 MQ 或补偿任务触发库存释放、重预占或缓存刷新。消息体带 token、工单号、库存组、traceId，便于排查跨服务一致性。

### 延迟重试和补偿

如果库存瞬时不足、下游 RPC 超时或状态事件漏发，可以通过延迟消息或 XXL-Job 补偿任务重新触发。补偿任务按业务主键幂等执行，避免重复释放、重复扣减或重复发送。

### 消息排查闭环

线上排查时不只看消息是否发送成功，还会沿着业务主键追：

1. 生产端是否发送成功。
2. Broker 是否存在消息。
3. ConsumerGroup 是否消费。
4. 消费端是否业务成功。
5. DB 状态、库存 token、缓存、下游系统是否一致。
6. 是否需要补发消息或执行人工修复任务。

**面试表达**

> 我项目里 MQ 主要用于工单状态事件、库存变更事件和补偿任务。我的理解是，MQ 链路不能只看“发出去没有”，而要看下游是否幂等消费、状态是否正确流转、库存 token 和工单展示是否一致。如果某一环失败，就通过重试、死信、XXL-Job 或人工修复把链路拉回最终一致。

---

## 24. RocketMQ 面试高频追问速答

| 问题 | 快速回答 |
| --- | --- |
| RocketMQ 能保证消息只消费一次吗？ | 不能依赖只消费一次，通常按至少一次投递理解，消费端必须幂等。 |
| 消息发送成功代表业务成功吗？ | 不代表，只说明 Broker 收到消息；消费者是否成功要另看消费结果和业务状态。 |
| 顺序消息怎么保证？ | 同一业务 key 进入同一个 MessageQueue，消费者顺序消费，再用状态机兜底。 |
| Spring Boot 怎么发顺序消息？ | 用 `RocketMQTemplate.syncSendOrderly(destination, message, hashKey)`，`hashKey` 传 `orderId`、`workOrderId` 等业务 key。 |
| 消费端多台会影响顺序吗？ | 不会破坏同一业务 key 的队列内顺序；前提是生产端按业务 key 路由到同一 MessageQueue，消费端使用 `ORDERLY`，且同一 ConsumerGroup 下一个 MessageQueue 同一时刻只分配给一台消费者实例。 |
| 全局顺序建议用吗？ | 除非吞吐很低且强要求，否则不建议，全局顺序会严重牺牲并发。 |
| 延迟消息一定准时吗？ | 不一定，只能当触发器，到期后必须查业务状态，并用定时任务兜底。 |
| Spring Boot 怎么发延时消息？ | 用 `RocketMQTemplate.syncSend(destination, message, timeout, delayLevel)`，消费端收到后先查业务状态再处理。 |
| 消息积压先做什么？ | 先定位生产突增还是消费变慢，再看消费者异常、慢 SQL、下游 RPC、队列数和重试。 |
| 消费者扩容一定有效吗？ | 不一定，消费者实例数超过队列数后可能无效，下游瓶颈也会限制吞吐。 |
| 一个项目只能有一个 ConsumerGroup 吗？ | 不是，一个 Spring Boot 项目可以有多个 ConsumerGroup；同业务多实例共用组，不同业务逻辑需要各自消费同一消息时用不同组。 |
| 事务消息能替代分布式事务吗？ | 不能，它只解决生产端本地事务和消息发送一致，下游仍需幂等、重试、补偿。 |
| 消费失败怎么办？ | 可重试异常返回失败，不可重试异常记录并进入死信或补偿。 |
| 死信队列是什么？ | 消息多次消费失败后进入的异常消息隔离队列，通常按 ConsumerGroup 维度生成，处理时要告警、定位原因、分类重投或补偿。 |
| 死信队列按什么区分？ | 按 ConsumerGroup 区分，不是全局一个队列；同一消费组下不同 Topic 的死信消息可能进入同一个死信队列，再按原始 Topic、Key、MessageId 和日志排查。 |
| 本地消息表怎么实现？ | 业务表和消息表同事务落库，后台任务扫描投递 MQ，成功标记 SUCCESS，失败退避重试，超过上限转 DEAD，消费端仍要幂等。 |
| Topic 和 Tag 怎么分？ | Topic 按业务域或事件大类，Tag 按事件类型，Key 放业务主键。 |
| RocketMQ 和 Kafka 怎么选？ | RocketMQ 偏业务消息，Kafka 偏日志流和数据管道；按场景选，不绝对比较。 |
| 如何查一条消息？ | 用业务 Key、msgId、Topic、ConsumerGroup、traceId 查发送、存储、消费和业务落库。 |

---

## 25. RocketMQ 回答模板

### 模板一：消息可靠性

> 消息可靠性我会分三段看。生产端要同步发送或可靠异步发送，关键消息用事务消息或本地消息表兜底；Broker 端关注持久化、刷盘和主从复制；消费端要业务成功后再 ack，失败触发重试，消费逻辑用业务主键幂等。最后还要有死信、告警、补偿任务和对账。

### 模板二：重复消费

> RocketMQ 我默认按至少一次投递理解，所以消费端必须幂等。幂等不靠 MQ，而靠业务唯一键、消费记录表、数据库唯一索引、状态机和条件更新。比如订单扣库存用订单号做唯一流水，工单状态事件用工单号和状态版本防止重复或状态倒退。

### 模板三：消息积压

> 积压我会先判断生产端是否突然放量，还是消费端变慢。消费端重点看线程池、异常重试、慢 SQL、下游 RPC 和队列分配。短期可以扩容消费者、提高线程数、隔离异常消息；长期要优化消费逻辑、拆 Topic/Tag、拆不同优先级消费者，并加积压和失败告警。

### 模板四：事务消息

> RocketMQ 事务消息通过半消息、本地事务、提交/回滚和事务回查，解决本地事务和消息发送的一致性。它不是完整分布式事务，下游消费失败仍要靠消费端幂等、重试、死信、补偿和对账。

### 模板五：项目结合

> 在履约系统里，我会把工单状态变更、库存 token 释放、缓存刷新和补偿动作做成 MQ 事件。消息体带工单号、token、事件类型、traceId，消费者按业务主键幂等处理，并用状态机防止乱序。线上排查时沿生产端、Broker、ConsumerGroup、业务落库和补偿任务逐层确认。

---

## 26. 面试时不要这样答

- 不要只说“MQ 可以异步、削峰、解耦”，要继续讲可靠性和代价。
- 不要说 RocketMQ 能保证消息绝对不丢、不重复。
- 不要把延迟消息说成严格准时。
- 不要把事务消息说成强分布式事务。
- 不要只讲 Producer 发送成功，要讲消费者处理结果和业务状态。
- 不要只说“加消费者扩容”，要先看队列数和下游瓶颈。
- 不要只依赖分布式锁做幂等，最终要靠数据库唯一约束或状态条件。
- 不要把所有消息塞进一个 Topic，也不要每个小事件都建一个 Topic。

---

## 27. 参考资料

- Apache RocketMQ 官方文档：<https://rocketmq.apache.org/docs/>
- Transaction Message：<https://rocketmq.apache.org/docs/featureBehavior/04transactionmessage/>
- Delay Message：<https://rocketmq.apache.org/docs/featureBehavior/02delaymessage/>
- Ordered Message：<https://rocketmq.apache.org/docs/featureBehavior/03fifomessage/>
- Consumption Retry：<https://rocketmq.apache.org/docs/featureBehavior/10consumerretrypolicy/>
- 实际面试回答时，版本特性要结合公司使用的 RocketMQ 版本，不要死背某一个版本的细节。

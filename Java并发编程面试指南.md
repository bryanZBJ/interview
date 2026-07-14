# Java 并发核心知识点面试指南与解决方案

本指南整理了 Java 并发编程中最核心的知识点，涵盖锁机制、CAS、内存模型、线程池、并发容器及常用异步工具。针对每个模块，提供“核心概念 -> 底层原理 -> 关键细节 -> 面试追问”的体系化讲解，帮助你应对中高级 Java 面试中对并发底层原理的深度考察。

---

## 1. 乐观锁和悲观锁详解

### 核心概念
* **悲观锁（Pessimistic Lock）**：
  * **思想**：总是假设最坏的情况。每次去拿数据的时候都认为别人会修改，所以在每次拿数据的时候都会上锁，这样别人想拿这个数据就会阻塞直到它拿到锁。
  * **代表**：Java 中的 `synchronized` 关键字、`ReentrantLock`。
  * **场景**：写操作频繁、竞争激烈的场景。
* **乐观锁（Optimistic Lock）**：
  * **思想**：总是假设最好的情况。每次去拿数据的时候都认为别人不会修改，所以不会上锁，只在最后更新提交的时候去判断在此期间别人有没有去更新这个数据。如果冲突了，一般会进行重试（自旋）或报错。
  * **代表**：Java 的 `java.util.concurrent.atomic` 包下的原子类（基于 CAS 实现）。
  * **场景**：读多写少、冲突较少的场景。

### 底层原理
* **悲观锁**：依赖操作系统底层的互斥锁（Mutex Lock）。当一个线程获取锁失败时，会被挂起，从用户态切换到内核态，导致上下文切换（Context Switch），开销较大。
* **乐观锁**：通常基于 **CAS（Compare-And-Swap）** 算法实现。它是无锁（Lock-Free）编程，依赖 CPU 的原子指令在硬件层面保证一次“比较并交换”操作的原子性，不涉及线程状态的挂起和唤醒。

### 关键细节
* **版本号机制（Version）**：乐观锁除了 CAS 之外，在数据库层面常通过在表中设计一个 `version` 字段来实现。更新时对比版本号，如果一致则 `version + 1` 提交，否则更新失败。
* **锁升级**：Java 中的 `synchronized` 经过 JDK 6 优化后，也引入了乐观锁的思想（偏向锁、轻量级锁/自旋锁），只有在竞争激烈时才会升级为真正的重量级悲观锁。

### 面试高频追问
> **问：乐观锁一定比悲观锁性能好吗？**
> **答**：不一定。在高并发、写冲突极其严重的场景下，乐观锁因为不断冲突会引发高频的“自旋重试”，导致 CPU 利用率极高却做无用功。此时，悲观锁将线程直接挂起，不占用 CPU，反而开销更小。因此：**读多写少用乐观锁，写多读少/竞争激烈用悲观锁**。

---

## 1.1. synchronized 详解与大厂面试问答

> 本节从并发锁语义讲 `synchronized`、Monitor、对象头和锁优化。对象头 Mark Word 的 JVM 视角可结合 [[Java JVM高频面试题与线上排障指南#2. 对象创建、对象头与内存分配|JVM 主文档：对象创建、对象头与内存分配]] 一起看。

### 核心概念

`synchronized` 是 Java 内置锁，用来保护多线程访问共享资源时的临界区。它可以同时保证：

1. **原子性**：同一时刻只有一个线程能进入同一把锁保护的代码块。
2. **可见性**：线程释放锁前对共享变量的修改，对后续获取同一把锁的线程可见。
3. **有序性**：JVM 不能把锁内关键读写重排序到锁外，破坏同步语义。

一句话：

> `synchronized` 通过 JVM 对象监视器 Monitor 实现互斥，同一时刻只有一个线程能持有同一个锁对象；释放锁和后续获取同一把锁之间存在 happens-before 关系。

### 三种用法

#### 1. 修饰实例方法

```java
public synchronized void add() {
    count++;
}
```

等价于：

```java
public void add() {
    synchronized (this) {
        count++;
    }
}
```

锁对象是当前实例 `this`。同一个对象上的多个 `synchronized` 实例方法会互斥，不同对象之间不会互斥。

#### 2. 修饰静态方法

```java
public static synchronized void addGlobal() {
    total++;
}
```

等价于：

```java
public static void addGlobal() {
    synchronized (Demo.class) {
        total++;
    }
}
```

锁对象是当前类的 `Class` 对象，例如 `Demo.class`。静态同步方法锁的是类级别，不是某个实例。

#### 3. 同步代码块

```java
private final Object lock = new Object();

public void add() {
    synchronized (lock) {
        count++;
    }
}
```

同步代码块可以更精确地控制锁范围，实际开发中通常比直接锁整个方法更灵活。

### 锁对象要共享

`synchronized` 锁的是对象，不是代码。多个线程只有竞争同一个锁对象时才会互斥。

错误示例：

```java
public void method() {
    synchronized (new Object()) {
        // 每次都是新对象，锁不共享，无法保护并发
    }
}
```

正确示例：

```java
private final Object lock = new Object();

public void method() {
    synchronized (lock) {
        // 多个线程竞争同一把 lock
    }
}
```

### 底层原理

同步代码块在字节码层面主要对应：

```text
monitorenter
monitorexit
```

每个 Java 对象都可以关联一个 Monitor。线程进入同步块时，需要先获取锁对象关联的 Monitor；执行完同步块或异常退出时释放 Monitor。

可以简化理解为：

```text
对象 -> Monitor -> Owner 线程 -> 重入次数
```

同步方法不是通过显式 `monitorenter/monitorexit` 包住方法体，而是通过方法访问标志 `ACC_SYNCHRONIZED` 表示该方法需要同步，JVM 调用方法时自动获取对应锁对象。

### JDK 后续对 synchronized 做了哪些优化？

早期 `synchronized` 被认为比较重，因为重量级锁需要依赖操作系统互斥量，竞争失败的线程会被阻塞和唤醒，涉及用户态和内核态切换。

JDK 6 之后，JVM 对 `synchronized` 做了大量锁优化，核心目标是：**不要一开始就进入重量级锁，尽量在无竞争或轻度竞争场景下降低加锁成本**。

可以按这条链路理解：

```text
无锁 -> 偏向锁 -> 轻量级锁 -> 重量级锁
```

注意：偏向锁在 JDK 15 后默认关闭并被废弃。面试时可以作为历史优化讲，但不要说新版本一定还在生效。

#### 1. 偏向锁

适合场景：一把锁长期只有一个线程使用。

很多对象虽然使用了 `synchronized`，但实际运行时没有多线程竞争。偏向锁会让对象头 Mark Word 记录第一个获取锁的线程 ID，让锁“偏向”这个线程。

```text
线程 A 第一次获取锁
对象头记录：偏向线程 A

线程 A 下次再次进入同步块
发现对象头偏向自己
直接进入，不需要 CAS 或真正加锁
```

优点是降低无竞争场景下的加锁成本；缺点是如果后续出现其他线程竞争，需要撤销偏向锁，撤销本身有成本。

#### 2. 轻量级锁

适合场景：多个线程偶尔竞争，但竞争不激烈，锁持有时间很短。

线程进入同步块时，会在当前线程栈帧中创建锁记录，然后尝试用 CAS 把对象头 Mark Word 替换为指向锁记录的指针。

```text
线程 A CAS 修改对象头成功 -> 获得轻量级锁
线程 B CAS 失败 -> 说明出现竞争，可能进入自旋或膨胀
```

轻量级锁的目标不是消除竞争，而是在竞争不激烈时避免线程立刻阻塞，减少上下文切换。

#### 3. 自旋锁和适应性自旋

如果线程发现锁已经被占用，不一定马上挂起，而是先循环尝试一小段时间。

原因是很多同步块执行很短，持锁线程可能马上释放锁。如果等待线程立刻阻塞，再由操作系统唤醒，成本可能比短暂自旋更高。

```text
锁很快释放：自旋划算
锁长时间不释放：自旋浪费 CPU
```

适应性自旋会根据同一把锁之前的竞争情况动态调整是否自旋、以及自旋多久。

#### 4. 锁消除

JVM 通过逃逸分析发现某个对象不会被多个线程共享时，可以把锁去掉。

```java
public String concat(String a, String b) {
    StringBuffer sb = new StringBuffer();
    sb.append(a);
    sb.append(b);
    return sb.toString();
}
```

`StringBuffer` 的方法是同步的，但 `sb` 是方法内部局部变量，不会逃逸到其他线程。JVM 可以消除这些同步锁。

#### 5. 锁粗化

如果代码里对同一把锁连续加锁和释放，JVM 可能扩大锁范围，减少频繁加锁/解锁的开销。

优化前：

```java
synchronized (lock) { a(); }
synchronized (lock) { b(); }
synchronized (lock) { c(); }
```

可能被优化成：

```java
synchronized (lock) {
    a();
    b();
    c();
}
```

锁粗化不是让锁越大越好，而是针对连续、碎片化的同一把锁操作，减少重复进入和退出 Monitor 的成本。

#### 6. 重量级锁

如果竞争激烈，自旋也不划算，锁会膨胀成重量级锁。重量级锁依赖操作系统互斥量，竞争失败的线程会被挂起，等待后续唤醒，成本最高。

**面试表达**

> `synchronized` 早期比较重，但 JDK 6 以后做了大量优化，包括偏向锁、轻量级锁、自旋锁、适应性自旋、锁消除和锁粗化。无竞争时尽量降低加锁成本，短时间竞争时先自旋，竞争激烈才膨胀为重量级锁。JVM 还会通过逃逸分析做锁消除，通过合并连续同步块做锁粗化。不过新版本里偏向锁已经默认关闭并废弃，所以更应该理解整体优化思路：`synchronized` 不再等同于一上来就是重量级互斥锁。

### 可重入性

`synchronized` 是可重入锁。同一个线程已经持有某把锁时，可以再次进入同一把锁保护的代码。

```java
public synchronized void methodA() {
    methodB();
}

public synchronized void methodB() {
    // 同一线程可以再次获得 this 锁
}
```

Monitor 会记录当前持有锁的线程和重入次数。同一线程再次进入时计数加一，退出一次计数减一，计数归零才真正释放锁。

### synchronized 和 volatile 区别

| 对比   | synchronized | volatile    |
| :--- | :----------- | :---------- |
| 原子性  | 可以保证临界区原子性   | 不能保证复合操作原子性 |
| 可见性  | 可以保证         | 可以保证        |
| 互斥   | 有            | 没有          |
| 阻塞   | 竞争失败可能阻塞     | 不阻塞         |
| 适合场景 | 复合操作、共享资源修改  | 状态标记、配置开关   |

例如：

```java
volatile int count = 0;
count++;
```

`count++` 包含读、加一、写回三个步骤，不是原子操作，只用 `volatile` 仍然会有并发安全问题。

### synchronized 和 ReentrantLock 区别

| 对比 | synchronized | ReentrantLock |
| :--- | :--- | :--- |
| 实现层面 | JVM 内置锁 | JUC API，基于 AQS |
| 释放方式 | 自动释放 | 必须手动 `unlock()` |
| 可重入 | 支持 | 支持 |
| 公平锁 | 不支持手动指定 | 支持公平/非公平 |
| 可中断 | 等锁过程不支持中断退出 | 支持 `lockInterruptibly()` |
| 尝试加锁 | 不支持 | 支持 `tryLock()` |
| 条件队列 | 一个 wait set | 多个 `Condition` |

普通互斥同步优先使用 `synchronized`，代码更简单，异常时自动释放锁；需要超时获取锁、可中断、公平锁或多个条件队列时，再考虑 `ReentrantLock`。

### 大厂面试问答

#### Q1：synchronized 锁的是什么？

看具体用法：

```text
实例方法：锁 this
静态方法：锁当前类的 Class 对象
同步代码块：锁括号里的对象
```

面试表达：

> `synchronized` 锁的不是代码，而是对象。多个线程只有竞争同一个锁对象时才会互斥。

#### Q2：synchronized 能保证可见性吗？

能。一个线程释放锁之前对共享变量的修改，对后续获取同一把锁的线程可见。

面试表达：

> `synchronized` 不只保证互斥，也保证可见性。释放锁和后续获取同一把锁之间存在 happens-before 关系。

#### Q3：synchronized 为什么是可重入的？

因为 Monitor 内部会记录当前持有锁的线程和重入次数。同一个线程再次进入同一把锁时，重入次数加一；退出一次减一；计数归零才真正释放锁。

#### Q4：synchronized 会不会造成死锁？

会。如果多个线程以不同顺序获取多把锁，就可能死锁。

```text
线程 A：lock1 -> lock2
线程 B：lock2 -> lock1
```

避免方式：

1. 固定加锁顺序。
2. 减少锁嵌套。
3. 缩小锁粒度。
4. 避免锁内 RPC、IO、慢 SQL。
5. 必要时用 `tryLock` 超时退出。

#### Q5：synchronized 和 Lock 怎么选？

面试表达：

> 普通互斥同步用 `synchronized`，语义清晰，异常时 JVM 会自动释放锁。需要可中断、超时获取锁、公平锁、多个条件队列时，用 `ReentrantLock` 更灵活。

#### Q6：static synchronized 和普通 synchronized 方法互斥吗？

默认不互斥。

```java
public synchronized void a() {}
public static synchronized void b() {}
```

`a()` 锁的是当前实例 `this`，`b()` 锁的是当前类的 `Class` 对象。锁对象不同，所以默认不互斥。

#### Q7：synchronized 锁粒度怎么优化？

常见优化方向：

1. 锁代码块，不锁整个方法。
2. 只锁共享变量访问部分。
3. 锁内不放 RPC、IO、慢 SQL 或长事务。
4. 减少锁嵌套，避免死锁。
5. 能用局部变量就不用共享变量。
6. 高并发计数场景可考虑 `LongAdder`。

### 面试总结版

> `synchronized` 是 Java 内置锁，底层通过对象 Monitor 实现。同步代码块对应 `monitorenter` 和 `monitorexit`，同步方法通过 `ACC_SYNCHRONIZED` 标志实现。它锁的是对象，不是代码；实例方法锁 `this`，静态方法锁 `Class` 对象，代码块锁指定对象。它可以保证互斥、可见性和有序性，并且是可重入锁。实际使用时要注意锁对象是否共享、锁粒度是否过大、锁内不要放慢 RPC 或长事务。普通同步场景用 `synchronized` 就够了，需要可中断、超时、公平锁或多个条件队列时再考虑 `ReentrantLock`。

---

## 1.2. yield / sleep / join / wait 的概念和区别

`yield`、`sleep`、`join`、`wait` 都会让当前线程暂时不继续向下执行，但它们的语义和锁行为不同。

### 1. 核心对比

| 方法 | 是否必须在 `synchronized` 中调用 | 线程状态 | 是否释放锁 | 核心含义 |
| :--- | :--- | :--- | :--- | :--- |
| `Thread.yield()` | 不需要 | 仍然是 `RUNNABLE` | 不释放 | 提示调度器：当前线程愿意让出 CPU |
| `Thread.sleep(ms)` | 不需要 | `TIMED_WAITING` | 不释放 | 当前线程睡眠指定时间 |
| `thread.join()` | 不需要 | `WAITING` 或 `TIMED_WAITING` | 不释放当前线程已持有的锁 | 当前线程等待另一个线程执行结束 |
| `lock.wait()` | 必须 | `WAITING` 或 `TIMED_WAITING` | 释放当前对象锁 | 当前线程进入对象等待队列，等待通知 |
| `lock.notify()` / `notifyAll()` | 必须 | 不适用 | 不立即释放锁 | 唤醒等待在该对象上的线程 |

### 2. yield 是什么？

```java
Thread.yield();
```

`yield` 表示当前线程提示调度器：

```text
我可以先让一下，看看有没有同优先级或更高优先级线程要运行。
```

但它只是一个调度提示，不保证一定让出 CPU，也不保证其他线程一定执行。甚至可能刚 `yield` 完，当前线程又被调度回来继续执行。

### 3. sleep 是什么？

```java
Thread.sleep(1000);
```

`sleep` 表示当前线程进入睡眠，至少等待约 1 秒后才重新进入可运行状态。

注意：时间到了以后，线程不是立刻执行，而是重新参与 CPU 调度。

### 4. join 是什么？

```java
thread.join();
```

`join` 表示当前线程等待另一个线程执行结束。

例如：

```java
Thread worker = new Thread(() -> doWork());
worker.start();
worker.join();
System.out.println("worker 执行完后，主线程才继续");
```

`join` 常用于主线程等待子线程执行完毕，再继续做汇总、收尾等操作。

### 5. wait / notify 是什么？

`wait` / `notify` 是基于对象 Monitor 的等待/通知机制，必须先持有该对象锁。

```java
synchronized (lock) {
    lock.wait();
}
```

线程调用 `wait()` 后，会释放当前对象锁，并进入该对象的等待队列。

另一个线程需要先拿到同一把锁，才能调用：

```java
synchronized (lock) {
    lock.notify();
}
```

`notify()` 只是唤醒等待队列中的线程，被唤醒线程不会立刻执行，它还要等当前线程退出 `synchronized` 并释放锁后，重新竞争锁。

### 6. “不释放锁”到底是什么意思？

“不释放锁”只有在线程当前已经持有锁时才有讨论意义。

如果代码本来就不在 `synchronized` 里，也没有持有任何对象锁：

```java
Thread.sleep(1000);
```

这时只是让当前线程睡眠 1 秒，谈不上释放不释放锁，因为它本来没有锁可释放。

如果在同步块里调用：

```java
synchronized (lock) {
    Thread.sleep(1000);
}
```

当前线程虽然睡眠了，但 `lock` 仍然被它持有，其他线程仍然进不来同一个 `synchronized(lock)` 代码块。

`yield` 和 `join` 也是同理：

```java
synchronized (lock) {
    Thread.yield(); // 可能让出 CPU，但不释放 lock
}

synchronized (lock) {
    otherThread.join(); // 等待 otherThread 结束，但不释放 lock
}
```

所以准确表达是：

```text
sleep / yield / join 不要求在 synchronized 中调用；
如果当前线程没有持有锁，就不存在释放锁的问题；
如果当前线程已经持有 synchronized 对象锁，它们也不会主动释放这把锁。
```

真正会释放当前对象锁的是 `wait()`：

```java
synchronized (lock) {
    lock.wait(); // 释放 lock，进入等待队列
}
```

### 7. 是否都要结合 synchronized 使用？

不是。

| 方法                         | 是否必须结合 `synchronized` | 原因                                                 |
| :------------------------- | :-------------------- | :------------------------------------------------- |
| `sleep()`                  | 不需要                   | 它是 `Thread` 的静态方法，只让当前线程睡眠                         |
| `yield()`                  | 不需要                   | 它是 `Thread` 的静态方法，只提示调度器让出 CPU                     |
| `join()`                   | 不需要                   | 调用某个线程对象的 `join()`，等待它执行结束                         |
| `wait()`                   | 必须                    | 必须先持有对象 Monitor，否则抛 `IllegalMonitorStateException` |
| `notify()` / `notifyAll()` | 必须                    | 必须先持有对象 Monitor，否则抛 `IllegalMonitorStateException` |

### 8. 和 CAS 自旋退避的关系

CAS 自旋失败后，有时会用 `yield`、`sleep` 或 `parkNanos` 做退避：

```java
while (!atomic.compareAndSet(expect, update)) {
    Thread.yield();
}
```

`yield` 是轻量退避，但不可靠，只是调度提示。

如果想更明确地降低 CPU 消耗，可以用：

```java
LockSupport.parkNanos(1_000_000);
```

或者短暂：

```java
Thread.sleep(1);
```

但 `sleep` 会让线程真正进入超时等待，延迟更明显。

### 面试表达

> `yield` 是提示调度器让出 CPU，但不保证一定让出，线程状态仍然是 `RUNNABLE`；`sleep` 是让当前线程睡眠指定时间，进入 `TIMED_WAITING`；`join` 是当前线程等待另一个线程执行完；`wait` 是当前线程进入对象等待队列。`sleep`、`yield`、`join` 不要求在 `synchronized` 中调用，也不会主动释放当前线程已经持有的对象锁；如果当前线程本来没有持有锁，就不存在释放锁的问题。`wait` 和 `notify/notifyAll` 必须在 `synchronized` 中调用，因为它们操作的是对象 Monitor 的等待队列；其中 `wait` 会释放当前对象锁，而 `notify` 只是唤醒等待线程，不会立刻释放锁。

---

## 2. CAS 详解

### 核心概念
**CAS（Compare And Swap，比较并交换）** 是一种无锁算法。它涉及三个操作数：
1. **内存地址（V）**
2. **预期原值（A）**
3. **拟写入的新值（B）**

当且仅当内存地址 V 的值等于预期原值 A 时，才将内存地址 V 的值修改为 B，否则什么都不做。整个“比较并替换”是一个原子操作。

### 底层原理
在 Java 中，CAS 主要通过 `sun.misc.Unsafe` 类中的 native 方法提供支持：
* **native 方法**：如 `compareAndSwapInt`、`compareAndSwapLong`。
* **硬件级支持**：在 x86 架构的 CPU 下，底层对应的汇编指令是 `lock cmpxchg`。`lock` 前缀指令会锁定北桥信号或通过缓存一致性协议（MESI）锁定对应的缓存行，从而保证“读-改-写”整个操作在多核 CPU 下的绝对原子性。

### 关键细节：CAS 的三大缺陷与解决方案

#### 1. ABA 问题：CAS 是原子的，为什么还会有 ABA？

CAS 本身是原子操作，它保证的是这一瞬间的“比较 + 更新”不可被打断：

```text
if 当前值 == 期望值:
    更新为新值
```

但 CAS 只比较“当前值是否还是期望值”，不关心这个值在两次读取之间有没有被改过。

典型 ABA 流程：

```text
线程 1：读取到值 A，准备 CAS(A -> C)，但还没执行
线程 2：把 A 改成 B
线程 2：又把 B 改回 A
线程 1：继续 CAS，发现当前值还是 A，于是 CAS 成功
```

从线程 1 看，值还是 A，像是没变过；但真实变化是：

```text
A -> B -> A
```

所以：

```text
CAS 的原子性：保证一次 compare-and-swap 不被打断
ABA 的问题：CAS 无法感知值的历史变化
```

二者并不矛盾。

ABA 在普通计数场景影响不大，但在无锁栈、无锁队列这类依赖节点关系的数据结构中可能破坏结构。

例如无锁栈：

```text
原始栈：A -> B -> C

线程 1：读到 head = A，next = B，准备 CAS(head, A, B)
线程 2：pop A，pop B，又 push A
当前栈：A -> C
线程 1：发现 head 还是 A，CAS 成功，把 head 改成旧的 B
```

此时 `B` 可能已经被弹出或复用，栈结构就可能被破坏。

**解法**：引入版本号或标记，让 CAS 比较的不只是值，而是“值 + 版本号”：

```text
A_1 -> B_2 -> A_3
```

虽然值又回到 A，但版本号已经变了，CAS 就能识别出中间发生过修改。

Java 中常用：

| 工具 | 作用 |
| :--- | :--- |
| `AtomicStampedReference` | 引用 + stamp 版本号，常用于解决 ABA |
| `AtomicMarkableReference` | 引用 + boolean 标记，适合只关心是否被标记删除等场景 |

**面试表达**：
> CAS 是原子的，但它只保证一次比较交换操作的原子性，不保证能感知变量的历史变化。ABA 指的是线程读取到 A 后，其他线程把 A 改成 B 又改回 A，当前线程再 CAS 时发现还是 A，于是误以为没有变化而更新成功。这个问题在普通计数场景影响不大，但在无锁栈、无锁队列等依赖节点关系的数据结构中，可能导致链表结构错误、节点被重复使用。解决方式一般是加版本号，比如使用 `AtomicStampedReference`。

#### 2. 自旋时间过长导致 CPU 消耗大

CAS 本身只尝试一次，不等于自旋。真正导致自旋的是外层代码在 CAS 失败后用 `while` 或 `for(;;)` 不断重试：

```java
while (true) {
    int current = atomic.get();
    int next = current + 1;

    if (atomic.compareAndSet(current, next)) {
        break;
    }

    // CAS 失败后不阻塞，继续下一轮 while
}
```

或者：

```java
while (!atomic.compareAndSet(expect, update)) {
    // 一直重试
}
```

如果只是单次调用：

```java
boolean success = atomic.compareAndSet(oldValue, newValue);
```

这不是自旋，只是尝试一次。只有失败后继续循环重试，才会形成自旋。

并发竞争很激烈时，很多线程同时读到同一个旧值，只有一个线程能 CAS 成功，其他线程失败后继续读取、计算、CAS，CPU 就会被大量空转消耗。

常见解法：

| 解法 | 说明 |
| :--- | :--- |
| 限制自旋次数 | 自旋 N 次仍失败，就降级为加锁、进入队列或返回失败 |
| 退避策略 | CAS 失败后短暂 `yield`、`parkNanos` 或指数退避，避免所有线程同时重试 |
| 分段降低竞争 | 高并发计数用 `LongAdder` 替代 `AtomicLong`，把热点拆到多个 Cell |
| 使用锁替代 | 高竞争场景下，`synchronized` / `ReentrantLock` 让线程阻塞等待，可能比一直自旋更稳定 |
| 队列化请求 | 把热点并发更新改成队列串行消费 |
| 批量更新 | 多次小更新合并成一次更新，减少 CAS 次数 |

示例：限制自旋次数。

```java
int retry = 0;
while (!atomic.compareAndSet(expect, update)) {
    if (++retry > 10) {
        // 降级处理：加锁、入队、返回失败等
        break;
    }
}
```

示例：退避。

```java
while (!atomic.compareAndSet(expect, update)) {
    LockSupport.parkNanos(1_000_000);
}
```

**面试表达**：
> CAS 自旋时间过长会导致 CPU 消耗大，因为线程失败后不会阻塞，而是在用户态循环重试。CAS 本身只是一次原子比较交换，真正的自旋来自外层 `while` 或 `for(;;)` 重试逻辑。解决思路是减少无效重试：可以限制自旋次数，失败后降级为锁、队列或返回；也可以加退避策略，比如 `yield`、`parkNanos` 或指数退避；还可以降低共享热点，比如高并发计数用 `LongAdder` 替代 `AtomicLong`。在高竞争场景下，CAS 不一定比锁好，使用锁让线程阻塞等待反而更稳定。

#### 3. 只能保证一个共享变量的原子操作

CAS 只能针对单个内存地址做原子比较和更新，无法直接同时原子更新多个变量。

如果多个字段必须整体一致，常见解法是把多个字段封装成一个不可变对象，再用 `AtomicReference` 原子替换整个引用：

```java
record AccountState(int balance, int frozen) {}

AtomicReference<AccountState> ref =
        new AtomicReference<>(new AccountState(100, 0));
```

更新时 CAS 替换整个 `AccountState` 引用，避免多个字段分别更新导致中间状态不一致。

#### 4. 业务中常见的 CAS 使用场景

业务里不一定直接手写底层 CAS，更多是使用 `AtomicInteger`、`AtomicLong`、`AtomicReference`，或者使用数据库乐观锁表达同样的“比较后更新”思想。

**接口并发数控制**

```java
private final AtomicInteger running = new AtomicInteger(0);
private final int max = 100;

public boolean tryAcquire() {
    while (true) {
        int current = running.get();
        if (current >= max) {
            return false;
        }
        if (running.compareAndSet(current, current + 1)) {
            return true;
        }
    }
}

public void release() {
    running.decrementAndGet();
}
```

**防止重复初始化**

```java
private final AtomicReference<Config> configRef = new AtomicReference<>();

public Config getConfig() {
    Config config = configRef.get();
    if (config != null) {
        return config;
    }

    Config newConfig = loadConfig();
    if (configRef.compareAndSet(null, newConfig)) {
        return newConfig;
    }
    return configRef.get();
}
```

**任务抢占 / 状态流转**

```sql
UPDATE task
SET status = 'PROCESSING'
WHERE id = #{id}
  AND status = 'INIT';
```

影响行数为 1 表示抢占成功；影响行数为 0 表示任务已经被其他线程处理。

**数据库乐观锁扣库存**

```sql
UPDATE product
SET stock = stock - 1,
    version = version + 1
WHERE id = #{id}
  AND stock > 0
  AND version = #{oldVersion};
```

这里的思想就是：

```text
compare: version = oldVersion
swap: stock - 1, version + 1
```

**面试表达**：
> 业务中 CAS 常用于接口并发数控制、本地缓存懒加载、订单或任务状态流转、库存扣减和乐观锁更新。例如用 `AtomicInteger` 控制接口同时执行的请求数，用 `AtomicReference` 保证多个线程同时初始化缓存时只有一个成功；数据库层面也常用 `version` 或 `status` 条件做乐观锁更新，本质都是“当前值还是期望值时才允许更新”。

---

## 3. JMM（Java 内存模型）详解

> JMM 是并发专题的核心，不等同于 JVM 运行时内存区域。运行时内存、GC、OOM、排障统一看 [[Java JVM高频面试题与线上排障指南|JVM 高频面试与线上排障]]。

### 核心概念
**JMM（Java Memory Model，Java 内存模型）** 是一种抽象的概念和规范。它定义了 Java 虚拟机（JVM）如何与计算机主内存（RAM）协同工作，规定了多个线程之间共享变量的可见性、有序性和原子性，屏蔽了各种硬件和操作系统的内存访问差异。

### 运行机制
JMM 将内存划分为**主内存（Main Memory）和工作内存（Working Memory）**：
* **主内存**：保存了所有共享变量的实例，所有线程共享。
* **工作内存**：每个线程独有。保存了该线程所使用到的变量的主内存副本拷贝。线程对变量的所有读写操作必须在自己的工作内存中进行，不能直接读写主内存，也不能访问其他线程的工作内存。

```text
+-------------------+       +-------------------+
|   线程 A 工作内存  |       |   线程 B 工作内存  |
|  (寄存器/L1/L2缓存) |       |  (寄存器/L1/L2缓存) |
+---------+---------+       +---------+---------+
          |                           |
          +-------------+-------------+
                        | (JMM 控制主网数据交互)
                        v
              +-------------------+
              |      主内存       |
              |     (物理内存)     |
              +-------------------+
```

### JMM 的三大特性

1. **可见性（Visibility）**：
   * 当一个线程修改了共享变量的值，其他线程能够立即感知到这个修改。
   * **实现方式**：`volatile`、`synchronized`、`Lock`。
2. **原子性（Atomicity）**：
   * 一个或多个操作，要么全部执行成功，要么全部执行失败，执行过程中不可被中断。
   * **实现方式**：`synchronized`、各类锁、Atomic原子类。
3. **有序性（Ordering）**：
   * 编译器和处理器为了提高性能，会对输入代码进行**指令重排（Instruction Reordering）**。单线程下重排能保证执行结果一致（as-if-serial语义），但多线程下重排会破坏程序的正确性。
   * **实现方式**：`volatile`（通过插入**内存屏障**禁止指令重排）、`synchronized`。

### 关键细节：Happens-Before 规则
Happens-Before 是 JMM 中定义两项操作之间偏序关系的规则。如果 A Happens-Before B，则 A 的执行结果对 B 是可见的。
* **程序次序规则**：在一个线程内，书写在前面的代码操作先行发生于后面的代码操作。
* **管程锁定规则**：一个 unlock 操作先行发生于后面对同一个锁的 lock 操作。
* **volatile 变量规则**：对一个 volatile 变量的写操作先行发生于后面对这个变量的读操作。
* **线程启动规则**：Thread 对象的 `start()` 方法先行发生于该线程的每一个动作。

---

## 4. 线程池详解与最佳实践

> 线程池导致 OOM、CPU 飙高、接口超时的时候，要和 JVM 排障一起回答。完整排查链路见 [[Java JVM高频面试题与线上排障指南#7. CPU 100%、死锁、接口超时与 Full GC 排查|JVM 主文档：CPU / OOM / 接口超时排查]]。

### 核心概念
Java 线程池用于管理和复用线程，避免频繁创建和销毁线程带来的系统开销。主类是 `java.util.concurrent.ThreadPoolExecutor`。

### ThreadPoolExecutor 的 7 大核心参数

```java
public ThreadPoolExecutor(
    int corePoolSize,               // 1. 核心线程数
    int maximumPoolSize,            // 2. 最大线程数
    long keepAliveTime,             // 3. 空闲线程存活时间
    TimeUnit unit,                  // 4. 时间单位
    BlockingQueue<Runnable> workQueue, // 5. 任务阻塞队列
    ThreadFactory threadFactory,     // 6. 线程工厂 (定制线程名字等)
    RejectedExecutionHandler handler // 7. 拒绝策略
)
```

### 线程池工作流程（四大步）

1. **核心线程未满**：当提交一个任务时，如果当前运行的线程数小于 `corePoolSize`，直接创建一个新线程执行任务（即使其他核心线程处于空闲状态）。
2. **队列未满**：如果当前线程数已达到 `corePoolSize`，新提交的任务会被放入 `workQueue` 中等待。
3. **最大线程未满**：如果 `workQueue` 已满，且当前线程数小于 `maximumPoolSize`，则创建一个非核心线程（应急线程）来执行任务。
4. **拒绝策略**：如果 `workQueue` 已满，且线程数已达到 `maximumPoolSize`，则触发指定的 `RejectedExecutionHandler` 拒绝策略。

```text
提交任务 -> (当前线程数 < corePoolSize?) 
              |-- 是 --> 创建核心线程执行
              |-- 否 --> (workQueue 已满?)
                            |-- 否 --> 放入队列等待
                            |-- 是 --> (当前线程数 < maximumPoolSize?)
                                          |-- 是 --> 创建非核心线程执行
                                          |-- 否 --> 执行拒绝策略
```

### 四大拒绝策略
* **AbortPolicy（默认）**：丢弃任务并抛出 `RejectedExecutionException` 异常。
* **CallerRunsPolicy**：由提交任务的线程（调用者线程，如 Main 线程）来执行该任务。这样可以降低任务提交速度，起到限流削峰的作用。
* **DiscardPolicy**：直接丢弃任务，不抛出任何异常。
* **DiscardOldestPolicy**：丢弃队列中最老的一个任务（即即将被执行的任务），然后尝试重新提交当前任务。

### 拒绝策略怎么选？有没有更好的实现？

**一句话回答**：拒绝策略没有绝对最优，核心要看任务能不能丢。普通业务任务不建议静默丢弃，常用 `CallerRunsPolicy` 做反压；生产系统更推荐自定义拒绝策略，把日志、监控、告警、降级和补偿接进去。

| 策略 | 特点 | 适合场景 | 风险 |
| --- | --- | --- | --- |
| `AbortPolicy` | 直接抛异常 | 希望快速暴露容量问题 | 调用方必须处理异常，否则影响请求 |
| `CallerRunsPolicy` | 提交任务的线程自己执行 | 批处理、MQ 消费、允许反压的异步任务 | 如果调用线程是 Tomcat 业务线程，可能拖慢入口请求 |
| `DiscardPolicy` | 静默丢弃 | 极少数完全可丢的非核心任务 | 无日志无感知，排障困难 |
| `DiscardOldestPolicy` | 丢弃队列最老任务 | 很少使用 | 可能破坏任务顺序和业务完整性 |

**更推荐的生产实现**：自定义 `RejectedExecutionHandler`，至少记录拒绝日志和监控指标；核心任务不能直接丢，必要时落库、投递 MQ、进入补偿表或触发告警；非核心任务可以降级丢弃，但必须可观测。

```java
RejectedExecutionHandler handler = (task, executor) -> {
    // 1. 记录线程池名称、活跃线程数、队列长度、拒绝任务数
    // 2. 上报监控和告警
    // 3. 根据任务类型决定抛异常、降级、落库补偿或投递 MQ
    throw new RejectedExecutionException("task rejected, active="
            + executor.getActiveCount() + ", queueSize="
            + executor.getQueue().size());
};
```

**面试表达**

> 线程池拒绝策略不能脱离业务场景选。`DiscardPolicy` 和 `DiscardOldestPolicy` 风险比较大，一般不建议用于核心业务，因为会造成任务静默丢失或破坏顺序。`CallerRunsPolicy` 常用来做反压，线程池满了以后由提交线程自己执行，能降低提交速度，但如果提交线程是 Tomcat 请求线程，也可能把入口拖慢。线上我更倾向自定义拒绝策略，把日志、监控、告警、降级和补偿接进去：核心任务不丢，必要时落库或发 MQ；非核心任务可以降级，但拒绝次数必须可观测。

### 线程池最佳实践与防坑指南

#### 1. 严禁使用 `Executors` 快捷创建线程池
* **原因**：
  * `Executors.newFixedThreadPool()` 和 `newSingleThreadExecutor()` 的底层队列使用的是无界的 `LinkedBlockingQueue`（容量为 `Integer.MAX_VALUE`），高并发下积压的任务会撑爆 JVM 堆内存，导致 **OOM**。
  * `Executors.newCachedThreadPool()` 允许的最大线程数为 `Integer.MAX_VALUE`，高并发下会创建海量线程，导致 CPU 暴满或 OOM。
* **正确做法**：一律使用 `new ThreadPoolExecutor(...)` 手动创建，并显式指定队列长度和拒绝策略。

#### 2. 合理配置线程数（CPU 密集型 vs IO 密集型）
* **CPU 密集型（计算多，如加解密、音视频转码）**：
  * **公式**：`CPU 核心数 + 1`。
  * **原理**：多一个线程是为了防止偶尔的页中断或线程暂停导致 CPU 空闲，最大化利用 CPU。
* **IO 密集型（等待多，如 RPC 调用、数据库读写、文件读写）**：
  * **公式**：`CPU 核心数 * 2` 或 `CPU 核心数 / (1 - 阻塞系数)`（阻塞系数通常在 0.8~0.9 之间）。
  * **原理**：IO 操作时线程会被挂起等待，此时 CPU 处于空闲状态，可以分配更多的线程去并发处理其他任务。具体数值应通过压测调整。

#### 3. 线程池的异常捕获防遗漏
* **坑点**：如果线程池中的任务抛出了未捕获异常，默认情况下它只会打印在 standard error 里，或者被默默吞掉（比如使用 `submit` 提交且不获取 `Future.get()`）。
* **解法**：
  * 在任务的 `run()` 方法最外层使用 `try-catch` 包裹。
  * 使用自定义 `ThreadFactory`，为线程设置 `UncaughtExceptionHandler`。
  * 重写 `ThreadPoolExecutor` 的 `afterExecute(Runnable r, Throwable t)` 方法。

### 面试高频追问与通关话术

#### Q1：线程池的核心线程在创建后，是如何保持活跃（不被回收）的？而非核心线程又是如何被回收的？
* **通关话术**：
  > “线程池底层是通过工作线程 `Worker` 内部的 `runWorker(Worker w)` 方法中的一个 `while` 循环来不断获取并执行任务的。
  > 
  > 其核心在于循环条件中调用的 `getTask()` 方法：
  > 1. 如果当前运行的线程数小于等于核心线程数 `corePoolSize`（且未开启 `allowCoreThreadTimeOut`），`getTask()` 内部会调用阻塞队列的 **`workQueue.take()`** 方法。该方法会使当前线程处于**无限期阻塞挂起**状态，直到队列中有新任务进入被唤醒，因此核心线程得以常驻并保持活跃。
  > 2. 如果当前线程数大于 `corePoolSize`（或者开启了核心线程超时），`getTask()` 会改用带有超时机制的 **`workQueue.poll(keepAliveTime, unit)`** 方法。如果非核心线程在 `keepAliveTime` 时间内没有获取到任务，`poll()` 会超时返回 `null`，从而导致 `runWorker` 循环退出，线程自然消亡被回收。”

#### Q2：核心线程满且队列满时，再来新任务，新创建的非核心线程是执行这个新任务还是队列里的旧任务？
* **通关话术**：
  > “新创建的非核心线程会**直接执行这个最新提交的任务**，而不是去执行队列里的旧任务。
  > 
  > 线程池在执行 `execute()` 方法时，如果核心线程满且队列满，会调用 `addWorker(firstTask, false)` 创建非核心线程。这里的 `firstTask` 就是当前新提交的任务。工作线程 `Worker` 在启动后，它的 `runWorker` 方法会**优先执行其持有的 `firstTask`**。只有当首个任务执行完毕后，它才会进入循环去调用 `getTask()` 从阻塞队列中拉取旧任务。
  > 
  > 这也导致了在高并发且队列积压时，后提交的任务可能会比先提交（但积压在队列中）的任务更早被非核心线程执行，在严格意义上打破了 FIFO 的顺序。”

#### Q3：线程池是如何判断一个线程空闲超时的？自身有定时器吗？
* **通关话术**：
  > “线程池内部**没有任何定时器**去轮询计算线程的空闲时间。它完全依赖于 JDK 阻塞队列自身的限时阻塞等待机制。
  > 
  > 线程池通过 `getTask()` 方法从队列获取任务。如前所述，当需要回收超时的线程时，会使用 `BlockingQueue` 的 `poll(keepAliveTime, unit)` 方法。如果队列中没有任务，当前工作线程就会在这个 `poll` 方法上阻塞等待。一旦等待时间超过了 `keepAliveTime`，`poll` 方法会超时返回 `null`。
  > 
  > 线程池一旦收到 `null`，就会将该线程从内部的 `workers` 集合中移除，并退出线程的运行，实现了优雅回收。这种利用阻塞队列实现超时控制的设计非常高效，避免了维护定时器带来的 CPU 开销。”

#### Q4：如何设计一个可以动态调整参数（核心/最大线程、队列大小）的线程池？
* **通关话术**：
  > “要实现动态调整参数，主要利用 `ThreadPoolExecutor` 提供的 `public` setter 方法，并配合分布式配置中心（如 Nacos、Apollo）：
  > 
  > 1. **动态调整线程数**：通过在配置变更监听器中调用 `setCorePoolSize(int)` 和 `setMaximumPoolSize(int)`。如果调大核心线程，线程池会立刻检测并创建新线程；如果调小核心线程，多余的线程在下次获取任务 `getTask()` 时会因为超时而自动被回收。
  > 2. **动态调整队列容量**：这是个难点。因为 JDK 自带的 `LinkedBlockingQueue` 的容量 `capacity` 字段是用 `final` 修饰的，无法直接修改。我们可以参考美团技术沙龙的方案，**自定义一个可动态调整大小的 `ResizableBlockingQueue`**（去掉 `capacity` 的 `final` 关键字并提供其 Setter 方法），在配置变更时动态修改该队列的容量，从而实现队列大小的动态变更。”

---

## 5. ThreadLocal 详解

> 本节重点讲 ThreadLocal 在线程池中的隔离、泄漏和脏数据问题。弱引用、GC Roots 和引用链的 JVM 视角可结合 [[Java JVM高频面试题与线上排障指南#4. GC Roots、引用类型与对象存活判断|JVM 主文档：GC Roots 与引用类型]] 一起复习。

### 5.1. 核心概念与设计初衷
**ThreadLocal（线程本地变量）** 为每个线程提供了一个独立的变量副本，实现了线程间的数据隔离。在多线程并发场景下，通过将变量绑定在当前线程，避免了多线程之间的资源竞争，同时也避免了频繁传递参数的繁琐。

### 5.2. 底层实现原理
ThreadLocal 的核心是由每个线程持有的 `ThreadLocalMap` 实现的：
* 每个 `Thread` 类中，都有一个名为 `threadLocals` 的成员变量，其类型为 `ThreadLocal.ThreadLocalMap`。
* `ThreadLocalMap` 是一个定制化的 Hash 表，其内部的 `Entry` 数组存储了键值对。
* **重点**：`Entry` 的 **Key 是对 ThreadLocal 对象的弱引用（WeakReference）**，而 **Value 是强引用**（存储的用户真实数据）。

```text
Thread (Thread 实例，GC Root 根节点)
   | (强引用)
   v
threadLocals (ThreadLocalMap)
   |
   v
Entry[] (散列表数组)
   |
   +---> Key: WeakReference<ThreadLocal> (弱引用，指向 ThreadLocal 对象)
   +---> Value: Object (强引用，指向实际存储的业务对象数据)
```

### 5.3. 弱引用与强引用基础回顾
在理解 ThreadLocalMap 的设计前，需明确 Java 中强弱引用的 GC 回收机制：
* **强引用 (Strong Reference)**：如 `Object obj = new Object();`。只要强引用存在，垃圾回收器（GC）**死都不回收**它，内存不足时宁愿抛出 `OutOfMemoryError`。
* **弱引用 (Weak Reference)**：如 `WeakReference<Object> wr = new WeakReference<>(new Object());`。当发生垃圾回收时，**只要对象只被弱引用关联（没有强引用指向它），无论内存是否足够，该对象一律会被回收**。

### 5.4. 深度剖析：为什么 Key 设计为弱引用，而 Value 是强引用？

#### ① 为什么 Key 是弱引用？
如果 Key 是**强引用**，那么只要当前线程还在运行，`Thread -> ThreadLocalMap -> Entry -> Key(ThreadLocal)` 这条强引用链就一直存在，即使我们在业务代码中执行了 `threadLocal = null`，`ThreadLocal` 对象也永远无法被 GC 回收，从而导致 **Key 的内存泄漏**。
设计为**弱引用**后，一旦业务代码中的 `threadLocal` 强引用断开，下一次 GC 就会自动把这个 `ThreadLocal` 对象回收，使 Entry 的 Key 变为 `null`。

**关键结论：Key 设计成弱引用，本质是提高容错率，不是替代 `remove()`。**

- 如果外部没有强引用指向 `ThreadLocal`，并且发生 GC，弱引用 Key 会被回收，Entry 的 Key 变成 `null`。
- 这只能避免 `ThreadLocal` 这个 Key 对象被线程长期强行持有，不能保证 Value 一定释放。
- 因为 Value 仍然是强引用，线程池线程又可能长期存活，所以仍然存在 `Thread -> ThreadLocalMap -> Entry -> Value` 的引用链。
- 后续调用 `get()`、`set()`、`remove()` 时，`ThreadLocalMap` 有机会清理 `key == null` 的脏 Entry，但这是惰性清理，不能作为可靠方案。
- 真正可靠的做法仍然是在 `finally` 中调用 `remove()`，主动删除 Entry，断开 Key 和 Value 的引用链。

所以可以这样理解：**弱引用 Key 是一种兜底容错，`remove()` 才是根治手段。**

如果是常见写法：

```java
private static final ThreadLocal<User> USER_CONTEXT = new ThreadLocal<>();
```

由于 `USER_CONTEXT` 被类的静态字段强引用，`ThreadLocal` 这个 Key 通常会随类生命周期存在，不会因为 Entry 的 Key 是弱引用就被回收。这种场景下更要关注 Value 是否清理：请求结束后如果不 `remove()`，线程池线程可能一直持有上一个请求的 `User`，导致内存泄漏或用户上下文串号。

#### ② 为什么 Value 必须是强引用？
如果 Value 也设计为**弱引用**，由于业务代码在运行期间通常只持有对 `ThreadLocal` 的强引用，而**不会持有内部 Value 对象的强引用**（我们通常是通过 `threadLocal.get()` 临时获取的）。
一旦发生垃圾回收，**Value 会因为没有外部强引用而被 GC 误杀抹去，变为 `null`**。这会导致业务上刚 `set` 进去的数据，因为一次 background GC 而莫名其妙消失，因此 Value 必须是**强引用**。

### 5.5. 内存泄漏成因、线程终止影响与终极防范

#### ① Value 内存泄漏的成因
由于 Key 是弱引用而被 GC 回收（变为 `null`），但 Value 是强引用，此时存在引用链：`Thread -> ThreadLocalMap -> Entry -> Value`。只要线程不退出，这部分业务数据就永远无法被回收，这就是 **Value 内存泄漏**。

#### ② 线程终止（Terminated）对内存泄漏的影响
* **如果是单次运行并终止的线程**：当线程死亡退出时，该线程对象从 JVM 活跃线程列表中被移除。由于失去了 GC Root，整个 `Thread` 对象、其内部的 `ThreadLocalMap` 数组、以及所有的 `Value` 强引用对象**都会在下一次 GC 时被自动打包回收，因此绝对不会产生永久内存泄漏**。
* **如果是线程池（Thread Pool）常驻线程**：由于线程池中的工作线程会被循环复用且**永远不会终止**，这意味着强引用链 `Thread (GC Root) -> ThreadLocalMap` 永久存在。如果之前的任务结束时没有清理，Value 将一直滞留在内存中，造成严重的**永久内存泄漏**。

#### ③ 解决与防范机制
* **AQS/ThreadLocalMap 内部的惰性清理（Lazy Cleanup）**：
  在调用 `ThreadLocal` 的 `get()`、`set()` 或 `remove()` 方法时，Map 内部会顺便遍历哈希表，一旦检测到 `key == null` 的 Entry，就会顺手将其 `value = null`，断开强引用链进行“被动防守”清理。
* **终极根治方案（手动清理最佳实践）**：
  在线程池等高频场景下，每次使用完 ThreadLocal 之后，**务必在 `finally` 块中显式调用 `remove()` 方法**，这是最安全、最彻底的根治手段。

```java
try {
    threadLocal.set(userInfo);
    // 执行业务逻辑
} finally {
    threadLocal.remove(); // 预防内存泄露的终极武器，彻底清除 Key 和 Value
}
```

#### ④ 重新 set(newValue) 的回收行为与潜在陷阱
* **旧值的回收机制**：
  当调用 `threadLocal.set(newValue)` 时，`ThreadLocalMap` 底层会执行 `tab[i].value = newValue;` 的覆盖操作。这会**切断指向 OldValue 对象的强引用链**。如果该 `OldValue` 对象在系统其他地方没有被任何强引用指向，那么它就变成了不可达对象，会在下一次 GC 中被垃圾回收机制回收。
* **为什么“重新 set”依然无法完全预防内存泄露？**
  即使重新 `set` 会覆盖旧值，以下**三个致命场景**依然会导致内存泄漏或业务 Bug：
  1. **闲置线程挂死**：线程池有 20 个核心线程，某一高并发波峰下全部被使用且均执行了 `set(10MB)`。波峰过去后，仅有 2 个线程工作，剩下的 18 个线程无限闲置，其内部的 180MB 数据将因永远不执行下一次 `set()` 而发生永久泄露。
  2. **后继任务未使用**：线程被复用执行任务 2，但任务 2 根本不使用这个 `ThreadLocal`。因为没有执行 `set()`，前驱任务留下的数据会一直驻留在内存中。
  3. **脏数据污染业务逻辑 (跨用户数据安全事故)**：如果不调用 `remove()` 彻底清理，后继被复用的线程去 `get()` 数据时，会拿到前驱任务留下的脏数据，这极易引发“跨用户数据越权/数据混淆”等严重生产 Bug。


## 6. Java 并发容器总结

在多线程环境下，传统的 `HashMap`、`ArrayList` 等容器不是线程安全的。Java 提供了 `java.util.concurrent` (JUC) 包下的并发容器：

### 1. ConcurrentHashMap（并发安全 Map）
* **JDK 1.7 实现**：
  * **机制**：采用 **Segment 分段锁**（继承自 `ReentrantLock`）。
  * **原理**：将整个 Map 拆分为 16 个 Segment（默认并发度为 16），每个 Segment 下管辖着一个 HashEntry 数组。每次写操作只锁住对应的 Segment，不同的 Segment 互不影响。
* **JDK 1.8 实现**：
  * **机制**：抛弃分段锁，改用 **Node 数组 + 链表/红黑树**，通过 **CAS + synchronized** 保证并发安全。
  * **原理**：锁的粒度细化到具体的 Node 数组的头节点（桶的第一个元素）。在初始化头节点或发生 Hash 碰撞写入时，采用 CAS 尝试写入；若失败或需要挂链，则对头节点执行 `synchronized` 加锁，极大地降低了锁冲突概率。

### 2. CopyOnWriteArrayList（写时复制列表）
* **机制**：读写分离，写时复制（Copy On Write）。
* **原理**：
  * **读操作**：完全不需要加锁，直接读取原数组，性能极高。
  * **写操作**：使用 `ReentrantLock` 锁住。在写入时，先拷贝（Copy）出一个长度 `len + 1` 的新数组，在新数组上修改数据，修改完毕后将原数组的引用指向新数组。
* **适用场景**：**读多写极少**的场景（如白名单、配置字典）。写操作非常消耗内存和时间（因为每次写都要全量拷贝数组）。

### 3. ConcurrentLinkedQueue（无锁队列）
* **原理**：基于链表结构的无锁队列，内部使用 CAS 算法保证入队出队的原子性，适合超高并发的队列读写。

### 4. BlockingQueue 系列（阻塞队列）
常用于生产消费者模式和线程池底层：
* **ArrayBlockingQueue**：基于数组的有界阻塞队列。内部使用一把 `ReentrantLock` 和两个 `Condition`（notEmpty 和 notFull）控制并发，入队和出队竞争同一把锁。
* **LinkedBlockingQueue**：基于链表的有界（默认无界）阻塞队列。内部使用**两把锁**（`takeLock` 和 `putLock`）分别控制出队和入队，读写并发互不干扰，吞吐量优于 ArrayBlockingQueue。
* **SynchronousQueue**：不存储元素的阻塞队列。每个 insert 操作必须等待另一个线程的 remove 操作，适合做任务的直接传递。

---

## 7. Atomic 原子类总结

JUC 中的 `java.util.concurrent.atomic` 包提供了丰富的原子类，用于无锁保证单个变量的操作安全。

### 核心分类
1. **基本类型**：`AtomicInteger`、`AtomicLong`、`AtomicBoolean`。
2. **数组类型**：`AtomicIntegerArray`、`AtomicLongArray`、`AtomicReferenceArray`。
3. **引用类型**：`AtomicReference`、`AtomicStampedReference`（带版本号防 ABA）、`AtomicMarkableReference`（带布尔标记防 ABA）。
4. **对象属性更新器**：`AtomicIntegerFieldUpdater`、`AtomicLongFieldUpdater`、`AtomicReferenceFieldUpdater`（用于原子更新已有类的非 private 被 volatile 修饰的字段）。

### 关键细节：LongAdder 对高并发 CAS 的优化（JDK 8）

* **AtomicLong 的瓶颈**：
  * 在多线程高频累加的场景下，所有的线程都会对 `AtomicLong` 的单个 Value 进行 CAS 更新。一旦失败就会陷入死循环自旋，导致严重的 **CPU 资源浪费和竞争瓶颈**。
* **LongAdder 的解决思路（热点分摊/分段锁）**：
  * `LongAdder` 引入了分段累加的设计。其内部维护了一个 `base` 变量和一个 `Cell[]` 数组。
  * **低并发**：直接通过 CAS 更新 `base`。
  * **高并发（冲突激烈）**：线程会根据自身的 Hash 值被路由到 `Cell[]` 数组中的某一个 `Cell` 对象上，只对该 `Cell` 内部的 `value` 进行 CAS 累加。
  * **求和**：最终获取总和时，调用 `sum()` 方法将 `base` 的值和所有 `Cell` 的值累加返回。
  * **结论**：**高并发计数累加场景下，一律优先选用 `LongAdder` 代替 `AtomicLong`。**

---

## 8. AQS 详解

### 8.1. 核心概念与设计初衷
**AQS（AbstractQueuedSynchronizer，抽象队列同步器）** 是整个 Java 并发包（JUC）的基石。`ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 等并发工具全部基于 AQS 构建。

* **为什么需要 AQS？**
  实现一把高并发安全的独占锁或共享锁极其复杂，需要解决原子性抢锁、排队队列的线程安全高并发尾插、线程的安全挂起与精准唤醒、中断与超时机制等通用痛点。AQS 作为一个并发底座，将这些复杂的底层并发细节完全封装，仅暴露简单的“同步状态修改”钩子方法给子类实现，极大地简化了同步组件的开发。
* **模版方法设计模式**：
  AQS 帮我们写好了所有复杂的队列管理和阻塞唤醒逻辑。子类只需要通过继承 AQS 并重写几个核心“钩子”方法即可实现自定义同步器：
  * `tryAcquire(int)` / `tryRelease(int)`（独占模式锁，如 `ReentrantLock`）
  * `tryAcquireShared(int)` / `tryReleaseShared(int)`（共享模式锁，如 `Semaphore`、`CountDownLatch`）
  * `isHeldExclusively()`（判断锁是否被当前线程独占）

### 8.2. 底层三大核心支柱

```text
       AQS 内部的变体 CLH 双向队列结构示意图：
       
       +--------+   prev   +--------+   prev   +--------+
 Head  |  Node  | <------- |  Node  | <------- |  Node  |  Tail
 (Dummy| (Dummy)| -------> | (Thread| -------> | (Thread|
哨兵节点|  null  |   next   |   A)   |   next   |   B)   |
       +--------+          +--------+          +--------+
            |                   |                   |
        waitStatus          waitStatus          waitStatus
        (SIGNAL -1)         (SIGNAL -1)            (0)
```

1. **State 同步状态（volatile int state）**：
   * 采用 `volatile` 保证多线程可见性。在不同同步器中代表不同含义：
     * `ReentrantLock`：表示锁的状态和重入次数（0为空闲，1为占用，>1为重入次数）。
     * `Semaphore`：表示当前可用的信号量许可证数。
     * `CountDownLatch`：表示倒数计数器的初始值。
2. **CLH 双向队列（FIFO 等待队列）**：
   * 抢锁失败的线程会被包装成 `Node` 节点，通过 CAS 安全地插入到队列尾部。
   * **哨兵节点（Dummy Head）**：队列的头节点 `head` 不保存任何线程（`thread = null`），它仅仅作为一个占位节点，代表“当前持有锁或已经执行完毕的那个线程”。
   * **Node 节点的等待状态（volatile int waitStatus）**：
     * `0`：默认初始状态。
     * `SIGNAL` (-1)：**最重要的状态**。表示当前节点的后继节点已经被挂起或即将挂起，因此当前节点在释放锁或取消排队时，**有义务主动唤醒它的后继节点**。
     * `CANCELLED` (1)：代表线程因中断或获取锁超时而取消了排队，这些节点后续会被移出队列。
     * `CONDITION` (-2)：节点目前处于 Condition 条件队列中。
     * `PROPAGATE` (-3)：在共享模式下，下一次共享锁的获取将被无条件传播。
3. **CAS 原子操作**：
   * AQS 基于 JVM 底层 `Unsafe` 类的 CAS 汇编指令，实现对 `state`、`head`、`tail` 变量的安全修改，确保在高并发情况下的线程安全性。

### 8.3. AQS 哨兵节点的作用

**一句话回答**：AQS 的哨兵节点就是同步队列里的 `head` 节点，它不代表真实等待线程，主要用于稳定队列边界，简化入队、出队和唤醒后继节点的逻辑。

```text
head(dummy) -> node1 -> node2 -> node3
```

其中 `head` 是占位节点，真正等待锁的线程通常从 `head.next` 开始。

**核心作用**

1. **简化队列边界判断**：有了固定的 `head`，AQS 不需要在每次入队、出队、唤醒时都特殊处理空队列和首节点，队列操作更统一。
2. **标识第一个有资格抢锁的节点**：在 `acquireQueued()` 中，只有当前节点的前驱是 `head`，才说明自己是队列中的第一个真实等待节点，才有资格再次尝试 `tryAcquire`。
3. **作为释放锁后的唤醒起点**：释放锁时，AQS 会从 `head` 出发调用 `unparkSuccessor(head)`，唤醒后继节点。
4. **配合 `waitStatus` 避免丢失唤醒**：后继节点挂起前，会把前驱节点的 `waitStatus` 改成 `SIGNAL`，表示前驱释放时有义务唤醒自己。这个前驱很多时候就是哨兵 `head`。

**关键源码理解**

```java
if (p == head && tryAcquire(arg)) {
    setHead(node);
    p.next = null;
    return interrupted;
}
```

这段逻辑说明：当前驱节点是 `head` 时，当前节点才会尝试获取锁；获取成功后，当前节点会被设置成新的 `head`，原来的 `head` 断开引用，帮助 GC。

**面试表达**

> AQS 的哨兵节点主要是同步队列里的 `head` 节点，它不保存真实等待线程，而是一个占位节点。它的作用是让 CLH 队列有稳定的头部边界，简化入队、出队和唤醒逻辑。真正排队的线程从 `head.next` 开始，当前驱是 `head` 时，说明自己是第一个等待节点，可以尝试抢锁。释放锁时也会从 `head` 开始唤醒后继节点。另外，`head.waitStatus` 通常配合 `SIGNAL` 状态，保证后继线程挂起后能够被前驱释放时正确唤醒，避免丢失唤醒。

---

## 9. ReentrantLock 底层实现原理

`ReentrantLock` 是基于 AQS 独占模式实现的可重入锁。

### 9.1. 底层实现三大核心属性
1. **`volatile int state`**：在 `ReentrantLock` 中，`state = 0` 代表锁空闲；`state >= 1` 代表锁已被占及锁的重入次数。
2. **`Thread exclusiveOwnerThread`**：记录当前独占这把锁的线程，用于重入锁的校验。
3. **CLH 队列双向链表**：用于管理排队抢锁的被挂起线程。

---

### 9.2. 加锁与排队挂起底层剖析（`lock()`）
非公平锁模式下，加锁流程如下：

```text
线程 A 抢锁 ──> 执行 CAS 修改 state (0 -> 1)
                     |-- 成功 --> 设置拥有者为 A，抢锁成功返回
                     |-- 失败 --> 触发 tryAcquire(1) 锁重入判定
                                       |-- 是重入 --> state++，返回成功
                                       |-- 非重入 --> 封装为 Node 插入 CLH 队列尾部
                                                        └──> 自旋 + LockSupport.park() 挂起
```

1. **第一步：CAS 强抢锁**：
   * 非公平锁直接调用 `compareAndSetState(0, 1)`，抢占成功则设置 `exclusiveOwnerThread = Thread.currentThread()` 并返回。
2. **第二步：锁重入判定（`tryAcquire(1)`）**：
   * 抢占失败时，调用 `acquire(1)`，内部首先通过 `tryAcquire` 尝试获取锁：如果 `state = 0`，再次 CAS 强抢；如果 `state != 0` 且当前线程就是持有锁 the 线程，则直接进行状态累加 `state = state + 1`，这就是**可重入性**的底层实现。
3. **第三步：并发安全入队（`addWaiter()`）**：
   * 抢锁失败且非自己重入，则线程会被包装成 `Node.EXCLUSIVE` 独占节点。使用“自旋死循环 + CAS”的 `enq(Node)` 尾插法，安全地加入 CLH 队列尾部。
4. **第四步：自旋与挂起（`acquireQueued()`）**：
   * 节点入队后进入死循环自旋。
   * 如果前驱节点是 `head`，说明自己是排队的第一个节点，会再次调用 `tryAcquire(1)` 尝试抢锁（优化机制，减少不必要的挂起上下文切换）。
   * 抢锁再次失败后，调用 `shouldParkAfterFailedAcquire(p, node)` 校验前驱节点的状态。
     * **核心机制（红绿灯标志）**：只有当自己前驱节点的 `waitStatus` 为 `SIGNAL` (-1) 时，当前线程才会被允许挂起。若前驱节点状态为 `0`，则当前线程会利用 CAS 将前驱状态改为 `SIGNAL` (-1)，然后回到循环顶部**再试一次**。
     * 一旦前驱节点状态被确认改为 `SIGNAL`，当前线程即可安全调用 **`LockSupport.park(this)`** 挂起，释放 CPU 资源。

---

### 9.3. 解锁与唤醒底层剖析（`unlock()`）
解锁是加锁的逆向操作，由于只有锁持有者能解锁，因此流程**不需要 CAS**：

1. **扣减状态位**：
   * 首先将 `state` 减 1（`state = state - 1`）。
   * 校验当前线程是否为 `exclusiveOwnerThread`，不是则抛出 `IllegalMonitorStateException`（防止误解锁）。
2. **锁完全释放判定**：
   * 若减 1 后 `state != 0`，说明只是退出了某一层锁重入，锁仍被占用，直接返回 `false`。
   * 若减 1 后 `state == 0`，说明锁已完全释放，清空 `exclusiveOwnerThread = null`，返回 `true`。
3. **精准唤醒判定（重要细节）**：
   AQS 的 `release` 方法包含如下代码：
   ```java
   public final boolean release(int arg) {
       if (tryRelease(arg)) {
           Node h = head;
           // 如果头节点不为空，且状态不为 0（代表有后继节点在排队并需要唤醒）
           if (h != null && h.waitStatus != 0) 
               unparkSuccessor(h); // 唤醒后继
           return true;
       }
       return false;
   }
   ```
   * **为什么判断条件是 `h.waitStatus != 0`？**
     因为如果后继节点没有将前驱（即 `head` 节点）的状态修改为 `SIGNAL` (-1)，`head.waitStatus` 会保持默认值 `0`。这意味着后继节点还没有被挂起，或者队列中根本没有人在排队。此时释放锁的线程无需进行 `unparkSuccessor` 系统调用，直接执行结束。
   * **唤醒后继**：如果状态满足，调用 `LockSupport.unpark(successorThread)` 唤醒后继节点的线程，使其从 `park()` 挂起处苏醒，重新去抢锁。

---

### 9.4. 核心并发时序问题：如何防止“丢失唤醒（Lost Wakeup）”？
并发环境下，可能会出现“前置节点释放锁并执行解锁，而后置节点刚好准备将前置状态修改为 `SIGNAL` 并挂起”的极端时序问题。AQS 依靠以下**两道防线**彻底规避了该问题：

* **防线一：`shouldParkAfterFailedAcquire` 的“双重检验与再试一次”机制**
  当后置线程检测到前置节点状态为 `0` 时，它不会直接挂起。而是先用 CAS 将前置状态改为 `SIGNAL` (-1)，然后**退出当前方法并返回 `false`**。这强迫线程返回死循环顶部，**再次尝试获取锁**。如果在改状态的极短时间内前置锁已经释放，本次循环中后置线程将直接获取锁成功，从而根本不会挂起。
* **防线二：`LockSupport.park/unpark` 的“许可（Permit）”机制**
  如果后置线程在第二轮循环中抢锁依然失败，准备调用 `LockSupport.park()`。但在它即将被挂起的瞬间，前置线程抢先释放了锁并看到了 `SIGNAL` 状态，触发了 `LockSupport.unpark(后置线程)`。
  * `LockSupport` 的 `park/unpark` 具有**类似于 0/1 状态的“许可”机制**。
  * 即使 `unpark()` 先于 `park()` 执行，系统也会给线程发放一个“许可”。
  * 当后置线程随后执行 `park()` 时，会**直接消费掉这个许可并瞬间返回，而不会发生真正的阻塞**。随后重新进入死循环将锁拿走。

这极具艺术感的双重设计，使得 AQS 彻底终结了丢失唤醒问题。

---

### 9.5. 公平锁与非公平锁在底层的实现差异
我们在建锁时，可以通过构造参数指定公平性：`new ReentrantLock(true)`（公平锁）或 `new ReentrantLock(false)`（默认非公平锁）。它们在底层的实现有两大核心区别：

1. **加锁抢占时机不同**：
   * **非公平锁（NonfairSync）**：当线程调用 `lock()` 时，会**直接抢先执行一次 CAS 尝试夺锁**。如果此时锁刚好被释放而 `state` b 变为 0，该线程就会直接“插队”抢走锁，不管 CLH 队列里有没有其他线程排队。只有当这次 CAS 失败后，它才会老老实实去排队。
   * **公平锁（FairSync）**：当线程调用 `lock()` 时，**绝对不会先尝试 CAS 强夺**，而是直接调用 `acquire(1)` 走排队流程。
2. **排队判定逻辑不同（hasQueuedPredecessors）**：
   * 在 AQS 的 `tryAcquire`（尝试获取锁）方法中，公平锁在用 CAS 修改 `state` 之前，会先调用 **`hasQueuedPredecessors()`** 方法，检查 CLH 队列中是否有比自己排队更久的线程。
   * 如果队列中有其他线程在排队，公平锁会直接返回 `false`（放弃抢锁并进入队列尾部排队）；而非公平锁则不管队列，直接尝试 CAS 争夺。

> [!TIP]
> **性能对比**：
> 非公平锁的并发吞吐性能要**远高于**公平锁。因为公平锁强制排队会导致频繁的“线程挂起与上下文切换”开销；而非公平锁允许新来的线程直接在 CPU 缓存中通过 CAS 抢占并执行，极大减少了线程挂起带来的上下文切换损耗。所以，默认情况下我们一律使用非公平锁。


## 10. CompletableFuture 详解

### 核心概念
`CompletableFuture` 实现了 `Future` 和 `CompletionStage` 接口。它改变了传统 `Future` 只能通过阻塞 `get()` 或轮询 `isDone()` 获取异步结果的缺陷，支持**声明式链式调用、异步回调、多任务组合与编排**。

### 核心 API 归纳

#### 1. 异步任务创建
* `runAsync(Runnable)`：异步执行，**无**返回值，默认使用 ForkJoinPool。
* `supplyAsync(Supplier<U>)`：异步执行，**有**返回值。

#### 2. 链式回调（结果转换）
* `thenApply(Function)`：获取上一步的结果，转换后返回新值（类似于 Stream 的 map）。
* `thenAccept(Consumer)`：获取上一步结果进行消费，**无**返回值。
* `thenRun(Runnable)`：上一步执行完就触发，不关心上一步的结果，**无**返回值。
* **Async 结尾的方法**（如 `thenApplyAsync`）：表示将下一步的回调任务也提交到线程池中异步执行，而不是由上一步执行完毕的同一个线程顺带执行。

#### 3. 任务编排组合
* **AND 组合（两者都完成）**：
  * `thenCombine(other, BiFunction)`：当两个任务都完成时，将它们的结果合并加工并返回新值。
* **OR 组合（任意一者完成）**：
  * `acceptEither(other, Consumer)`：两个任务谁先完成，就消费谁的结果。
* **多任务聚合**：
  * `CompletableFuture.allOf(cfs...)`：等待**所有**异步任务执行完毕（常用于并发批量处理）。
  * `CompletableFuture.anyOf(cfs...)`：只要**任意一个**任务执行完就返回。

### 关键细节：默认线程池的 OOM 隐患与最佳实践
* **坑点**：如果我们使用不带 Executor 参数的异步方法（如 `supplyAsync(Supplier)`），CompletableFuture 会默认使用 JVM 的 **`ForkJoinPool.commonPool()`** 线程池。
  * **后果**：这个默认线程池是**所有 CompletableFuture 共享的**。如果其中某个异步任务执行了慢 SQL、第三方 RPC 发生阻塞且没有设置超时，就会导致默认池中的所有线程被占满，从而**拖垮整个系统中所有使用默认池的异步业务**。
* **最佳实践**：**生产环境一律禁止使用默认池。执行异步操作时，必须显式传入自定义线程池**。

```java
// 显式指定自定义线程池
CompletableFuture.supplyAsync(() -> {
    return queryUserInfo(userId);
}, myThreadPoolExecutor)
.thenApplyAsync(userInfo -> {
    return buildReport(userInfo);
}, myThreadPoolExecutor)
.exceptionally(throwable -> {
    log.error("并发处理失败", throwable);
    return defaultReport;
});
```

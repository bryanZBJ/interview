---
tags:
  - interview
  - java
  - io
  - nio
created: 2026-06-28
source: Codex
---

# Java IO 面试指南

> 本文聚焦 Java 后端常见 IO 面试题：字节流 / 字符流、编码乱码、缓冲区、BIO / NIO / AIO、零拷贝、Netty、文件上传下载和线上问题。更深入的 Reactor 模型可后续放到独立网络编程专题中展开。

## 1. Java IO 体系怎么分？

**一句话回答**：Java IO 可以按“数据单位”和“访问方式”来分，字节流处理二进制，字符流处理文本；节点流直接连数据源，处理流在外层增强能力。

| 维度 | 类型 | 代表类 | 适合场景 |
|---|---|---|---|
| 字节流 | `InputStream` / `OutputStream` | `FileInputStream`、`BufferedInputStream` | 图片、视频、文件、网络传输、加密压缩 |
| 字符流 | `Reader` / `Writer` | `FileReader`、`BufferedReader` | 文本、日志、配置文件 |
| 节点流 | 直接连接数据源 | `FileInputStream`、`SocketInputStream` | 直接读文件、网络 |
| 处理流 | 包装其他流 | `BufferedInputStream`、`PrintStream`、`ObjectInputStream` | 缓冲、打印、序列化、转换 |

**关键细节**

- 字节流最终处理的是 `byte`，不关心字符编码。
- 字符流处理的是 `char`，内部需要把字节按字符集解码。
- `InputStreamReader` / `OutputStreamWriter` 是字节流和字符流之间的桥梁。
- 面向文件或网络传输，底层一定是字节；面向文本处理，可以用字符流。

**面试表达**

> Java IO 我会先按字节流和字符流区分。字节流处理二进制数据，比如文件上传下载、图片、网络传输；字符流处理文本，会涉及字符集编码。然后再按节点流和处理流区分，节点流直接连接文件或 socket，处理流在外层提供缓冲、打印、序列化等能力。

## 2. `byte` 和 `char` 有什么区别？

**一句话回答**：`byte` 是 8 位有符号整数，主要表示原始字节；`char` 是 16 位无符号字符单元，主要表示 UTF-16 的一个代码单元。

| 对比项 | `byte` | `char` |
|---|---|---|
| 位数 | 8 位 | 16 位 |
| 字节数 | 1 字节 | 2 字节 |
| 范围 | `-128 ~ 127` | `0 ~ 65535` |
| 是否有符号 | 有符号 | 无符号 |
| 常见用途 | IO、网络、文件、加密、二进制 | 字符、字符串处理 |
| 对应 IO | `InputStream` / `OutputStream` | `Reader` / `Writer` |

**关键细节**

- `char c = 65` 输出是 `A`，因为 65 对应 Unicode 字符 `A`。
- 一个 `char` 不一定等于一个完整字符，emoji 和部分生僻字可能需要两个 `char` 表示。
- 网络和文件本质传输的是字节，字符必须先编码成字节再写出。

**面试表达**

> `byte` 面向原始二进制数据，适合文件、网络和字节流；`char` 面向字符，是 UTF-16 的一个代码单元。Java 里字符串内部以字符为视角处理，但真正写入文件或网络时，还是要按字符集编码成字节。

## 3. 字节流和字符流什么时候用？

**一句话回答**：不确定是不是文本时优先用字节流；明确处理文本并且要按行读取、字符编码转换时用字符流。

| 场景 | 推荐 |
|---|---|
| 图片、PDF、Excel、压缩包、视频 | 字节流 |
| 文件上传下载 | 字节流 |
| Socket 原始数据 | 字节流 |
| 文本配置、日志、小文本文件 | 字符流 |
| 按行读取文本 | `BufferedReader` |
| 写文本并指定编码 | `OutputStreamWriter` / `PrintWriter` |

**关键细节**

- 不要用字符流处理图片、压缩包等二进制文件，否则可能因为编码转换破坏内容。
- 文本文件如果用字节流也可以，但要自己处理编码和换行。
- `FileReader` 使用平台默认编码，生产中更建议显式指定 `Charset`。

**面试表达**

> 二进制数据必须用字节流，文本数据可以用字符流。字符流的优势是能按字符集解码，并提供按行读取等能力。但在生产代码里我会尽量显式指定 UTF-8，避免依赖平台默认编码。

## 4. 为什么会出现中文乱码？

**一句话回答**：乱码的根因是编码和解码使用的字符集不一致，或者用字符流错误处理了二进制数据。

典型流程：

```text
字符串 "你好"
-> 按 UTF-8 编码成 byte[]
-> 写入文件或网络
-> 读取端如果按 GBK 解码
-> 乱码
```

**常见原因**

- 写入时 UTF-8，读取时 GBK。
- 本地正常，服务器默认编码不同。
- `new String(bytes)` 没指定编码，依赖平台默认字符集。
- `FileReader` / `FileWriter` 使用默认编码。
- 把图片、PDF 这类二进制文件当文本读写。

**推荐写法**

```java
String text = new String(bytes, StandardCharsets.UTF_8);
byte[] data = text.getBytes(StandardCharsets.UTF_8);
```

```java
try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
    String line = reader.readLine();
}
```

**面试表达**

> 乱码不是中文的问题，而是编码和解码不一致。字符串写出去前必须按字符集编码成字节，读回来时必须用同一种字符集解码。生产中不要依赖平台默认编码，建议统一 UTF-8，并且用字节流处理二进制文件。

## 5. `PrintStream` 是字节流，为什么打印中文不一定乱码？

**一句话回答**：`PrintStream` 底层写的是字节，但 `print(String)` 会先按字符集把字符串编码成字节，只要输出端按同样字符集解码，就不会乱码。

流程：

```text
System.out.println("你好")
-> String 按字符集编码成 byte[]
-> 写到 OutputStream
-> 控制台按相同字符集解码显示
```

**关键细节**

- `PrintStream` 继承自 `FilterOutputStream`，最终面向字节流。
- 它提供了 `print(String)`、`println(String)` 这种高级方法，内部会做字符到字节的转换。
- 控制台不乱码，是因为 Java 输出编码和终端解码基本一致。
- 写文件时建议显式指定编码。

```java
try (PrintStream ps = new PrintStream("a.txt", StandardCharsets.UTF_8)) {
    ps.println("你好");
}
```

**面试表达**

> `PrintStream` 是字节流，因为它最终写到 `OutputStream`。但它的打印方法支持字符串，会先把字符串按默认或指定字符集编码成字节。只要写出编码和控制台或文件读取编码一致，中文就不会乱码。

## 6. `read()` 和 `read(byte[] b)` 性能差很多吗？

**一句话回答**：通常差很多，`read()` 一次读一个字节，`read(byte[])` 一次批量读取，能明显减少循环次数、方法调用和系统调用。

不推荐：

```java
int data;
while ((data = in.read()) != -1) {
    // 一次处理一个字节
}
```

推荐：

```java
byte[] buffer = new byte[8192];
int len;
while ((len = in.read(buffer)) != -1) {
    out.write(buffer, 0, len);
}
```

**关键细节**

- `read()` 适合逐字节解析协议的少数场景。
- 大文件、网络流、上传下载都应使用 `read(byte[])`。
- 最后一次读取可能没有填满数组，必须按 `len` 处理。
- 即使外层套了 `BufferedInputStream`，批量读取通常也更好。

**面试表达**

> `read()` 是单字节读取，循环次数和调用次数很多；`read(byte[])` 是批量读取，更适合文件和网络 IO。实际开发一般配合 8KB 或 16KB 的 buffer 循环读取，并且只处理返回的 `len` 范围。

## 7. buffer 数组设置多大合理？

**一句话回答**：普通 IO 用 8KB 或 16KB 就比较合理，大文件顺序读写可以尝试 32KB / 64KB，高并发场景不能盲目调大。

| 场景 | 建议 |
|---|---|
| 普通文件读写 | 8KB / 16KB |
| 网络流 | 8KB / 16KB |
| 大文件顺序读写 | 32KB / 64KB 可压测 |
| 高并发上传下载 | 优先 8KB / 16KB，控制总内存 |
| 极致吞吐优化 | 用压测决定 |

**关键细节**

- `BufferedInputStream` 默认缓冲区就是 8192 字节。
- buffer 不是越大越好，超过一定大小后收益递减。
- 高并发时要算总内存：`buffer 大小 * 并发数`。
- 例如 `1MB * 1000` 个并发就可能额外占用约 1GB 内存。

**面试表达**

> buffer 大小要平衡系统调用次数和内存占用。普通场景我会用 8KB 或 16KB，大文件可以试 32KB 或 64KB，但最终看压测。高并发上传下载不能盲目调大，因为 buffer 乘以并发数就是额外内存。

## 8. `BufferedInputStream` 为什么能提升性能？

**一句话回答**：它在 Java 层维护一个缓冲区，把多次小读合并成少量底层读，减少频繁访问文件或网络的成本。

没有缓冲：

```text
应用 read()
-> 每次都可能触发底层读
```

有缓冲：

```text
应用 read()
-> 先从内存 buffer 拿
-> buffer 不够时再批量从底层读取
```

**关键细节**

- 缓冲流适合大量小读小写。
- 如果业务已经自己用大数组批量读取，缓冲流收益会变小。
- 输出流要注意 `flush()`，否则数据可能还停留在缓冲区。
- `close()` 通常会触发 `flush()`，但网络协议交互中可能需要提前 `flush()`。

**面试表达**

> 缓冲流不是改变磁盘或网络本身，而是在 Java 层减少频繁小 IO。它把数据先读到内存缓冲区，后续小读可以直接从内存拿；写出时也可以先攒一批再写到底层，从而减少底层 IO 次数。

## 9. `flush()` 和 `close()` 有什么区别？

**一句话回答**：`flush()` 是把缓冲区数据刷出去，流还能继续用；`close()` 是关闭资源，通常会先 `flush()`，之后不能再使用。

| 方法 | 作用 | 调用后能否继续使用 |
|---|---|---|
| `flush()` | 刷新缓冲区 | 可以 |
| `close()` | 刷新并关闭资源 | 不可以 |

**关键细节**

- `BufferedOutputStream`、`PrintWriter` 等有缓冲，写完不刷可能对端暂时收不到。
- 网络长连接或交互式协议，写完一段响应后可能需要主动 `flush()`。
- 文件写完一般用 `try-with-resources` 自动 `close()`。
- 关闭外层处理流通常会连带关闭内部节点流。

**面试表达**

> `flush` 解决的是缓冲区数据还没真正写出去的问题，`close` 解决的是资源释放问题。关闭前通常会自动 flush，但如果是网络交互或需要立即让对端看到数据，就要主动 flush。

## 10. 为什么建议用 `try-with-resources`？

**一句话回答**：它能自动关闭实现了 `AutoCloseable` 的资源，避免忘记关闭文件、socket、数据库连接导致资源泄漏。

推荐写法：

```java
try (InputStream in = new FileInputStream(src);
     OutputStream out = new FileOutputStream(dest)) {
    byte[] buffer = new byte[8192];
    int len;
    while ((len = in.read(buffer)) != -1) {
        out.write(buffer, 0, len);
    }
}
```

**关键细节**

- IO 流、Socket、数据库连接都属于外部资源。
- 只等 GC 不可靠，因为 GC 回收对象不等于及时释放文件句柄。
- `try-with-resources` 会按声明的逆序关闭资源。
- 关闭外层流一般即可，外层会关闭内层。

**面试表达**

> IO 操作一定要关注资源释放，文件句柄和 socket 不是普通堆对象。`try-with-resources` 能保证异常场景也自动 close，比手写 finally 更安全，也更符合现代 Java 写法。

## 11. BIO、NIO、AIO 有什么区别？

**一句话回答**：BIO 是同步阻塞，NIO 是同步非阻塞加多路复用，AIO 是异步非阻塞。

**NIO 是什么**

NIO 可以理解为 Java 提供的一套面向高并发网络和文件 IO 的新 IO 模型，核心不是“完全不阻塞”，而是通过 **非阻塞 Channel + Buffer + Selector 多路复用**，让少量线程管理大量连接。

传统 BIO 模型里，一个连接在读数据时如果没有数据到达，线程会一直阻塞：

```text
一个连接 -> 一个线程 -> read 阻塞等待
```

NIO 模型里，Channel 可以设置为非阻塞，多个 Channel 注册到同一个 Selector 上，由 Selector 统一监听哪些连接已经就绪：

```text
多个 Channel -> 注册到 Selector
Selector 监听 read/write/accept/connect 事件
某个连接就绪后，线程再去处理对应 Channel
```

所以 NIO 的核心价值是：

- **非阻塞**：Channel 没有数据时，不必让业务线程一直卡死等待。
- **多路复用**：一个 Selector 线程可以监听多个连接的就绪事件。
- **面向 Buffer**：数据读写通过 Buffer 完成，而不是像传统 IO 一样直接面向 Stream。
- **适合高并发连接**：比如网关、RPC、长连接、IM、Netty 底层网络通信。

但要注意：Java NIO 通常说的是 **同步非阻塞 IO**。应用线程仍然要通过 Selector 轮询就绪事件，并在事件就绪后自己执行读写；它不是 AIO 那种操作系统完成后再回调通知的异步模型。

| 模型 | 特点 | 线程模型 | 适合场景 |
|---|---|---|---|
| BIO | 一个连接通常占一个线程，读写阻塞 | 连接多时线程多 | 连接少、实现简单 |
| NIO | Channel 非阻塞，Selector 监听多个连接 | 少量线程处理大量连接 | 高并发连接、网关、RPC、Redis 类模型 |
| AIO | 操作系统完成后回调通知 | 异步回调 | 平台支持好且异步模型成熟的场景 |

**关键细节**

- BIO 代码简单，但连接数大时线程资源压力大。
- NIO 的核心是 `Channel + Buffer + Selector`。
- NIO 不是异步 IO，它通常还是同步非阻塞，应用线程需要主动轮询就绪事件。
- Java AIO 使用 `AsynchronousSocketChannel`，实际后端开发中不如 NIO / Netty 常见。

**面试表达**

> NIO 是 Java 提供的同步非阻塞 IO 模型，核心是 Channel、Buffer 和 Selector。相比 BIO 一个连接占一个线程，NIO 可以把多个 Channel 注册到 Selector 上，由少量线程监听大量连接的就绪事件，等连接可读可写时再处理，所以更适合高并发网络服务。AIO 则是异步 IO，操作完成后回调通知。Java 后端实际生产中，NIO 和基于 NIO 封装的 Netty 更常见。

## 12. NIO 的 Channel、Buffer、Selector 分别做什么？

**一句话回答**：Channel 是数据通道，Buffer 是读写缓冲区，Selector 是多路复用器，用一个线程监听多个 Channel 的就绪事件。

| 组件 | 作用 | 类比 |
|---|---|---|
| `Channel` | 连接文件或网络的数据通道 | 管道 |
| `Buffer` | 数据读写的内存区域 | 水桶 |
| `Selector` | 监听多个 Channel 事件 | 调度员 |

典型流程：

```text
Channel 注册到 Selector
Selector 阻塞等待事件
有连接可读 / 可写 / 可接收
应用线程处理对应 Channel
数据通过 Buffer 读写
```

**关键细节**

- Channel 可以设置非阻塞。
- Buffer 有 `position`、`limit`、`capacity` 三个核心指针。
- Selector 监听的是就绪事件，不是直接帮你读写数据。
- NIO 编程复杂，所以实际项目常用 Netty 封装。

**面试表达**

> NIO 三件套里，Channel 负责连接数据源，Buffer 负责承载数据，Selector 负责多路复用。Selector 可以让一个线程监听多个连接的读写事件，事件就绪后再通过 Channel 和 Buffer 完成真正读写。

## 13. `ByteBuffer` 的 `flip()`、`clear()`、`compact()` 有什么区别？

**一句话回答**：`flip()` 是写完切到读模式，`clear()` 是清空指针准备重新写，`compact()` 是保留未读数据后继续写。

| 方法 | 作用 | 是否清除数据 |
|---|---|---|
| `flip()` | 写模式切换到读模式 | 不清除 |
| `clear()` | 准备重新写，position 归零 | 不真正擦除，只是重置指针 |
| `compact()` | 保留未读数据并移动到前面 | 丢弃已读部分 |

典型读写：

```java
ByteBuffer buffer = ByteBuffer.allocate(1024);
channel.read(buffer); // 写入 buffer
buffer.flip();        // 切换为读模式
while (buffer.hasRemaining()) {
    byte b = buffer.get();
}
buffer.clear();       // 准备下次写入
```

**关键细节**

- `clear()` 不会把数组内容清零，只是重置 `position/limit`。
- 忘记 `flip()` 是 NIO 新手常见 bug。
- 半包数据没读完时，用 `compact()` 比 `clear()` 更安全。

**面试表达**

> ByteBuffer 的难点是读写共用一套指针。写完要 `flip` 才能读；读完如果不要剩余数据，用 `clear` 准备重新写；如果还有半包数据没读完，用 `compact` 保留剩余数据再继续写。

## 14. 堆内存 Buffer 和直接内存 Buffer 有什么区别？

**一句话回答**：堆内 Buffer 在 JVM 堆里，创建和回收便宜；直接内存 Buffer 在堆外，适合减少 native IO 拷贝，但分配和释放成本更高。

| 对比项 | HeapByteBuffer | DirectByteBuffer |
|---|---|---|
| 位置 | JVM 堆内 | 堆外直接内存 |
| 创建成本 | 低 | 较高 |
| GC 管理 | 普通 GC 管理 | 通过 Cleaner 间接释放 |
| IO 性能 | 可能需要额外拷贝 | 更适合 native IO |
| 风险 | 占用堆 | 可能出现 `Direct buffer memory` |

**关键细节**

- 普通业务小对象优先堆内 Buffer。
- 高性能网络 IO、Netty 常用直接内存。
- 直接内存不受 `-Xmx` 直接限制，但受 `MaxDirectMemorySize` 等影响。
- 直接内存泄漏要结合 JVM、Netty allocator、堆外内存监控排查。

**面试表达**

> 堆内 Buffer 创建便宜，适合普通场景；直接内存 Buffer 在堆外，和操作系统 IO 交互时可以减少一次拷贝，更适合高性能网络 IO。但直接内存释放依赖 Cleaner 或框架管理，使用不当会出现 Direct buffer memory 问题。

## 15. 什么是零拷贝？

**一句话回答**：零拷贝不是完全没有拷贝，而是减少数据在用户态和内核态之间的来回拷贝，降低 CPU 消耗。

传统文件发送：

```text
磁盘 -> 内核缓冲区 -> 用户缓冲区 -> Socket 缓冲区 -> 网卡
```

零拷贝优化：

```text
磁盘 -> 内核缓冲区 -> Socket 缓冲区 / 网卡
```

Java 常见方式：

```java
FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ);
fileChannel.transferTo(0, fileChannel.size(), socketChannel);
```

**关键细节**

- Kafka、RocketMQ 等中间件常用顺序写、Page Cache、零拷贝提升吞吐。
- `FileChannel.transferTo/transferFrom` 可以利用操作系统能力减少拷贝。
- `mmap` 通过内存映射减少用户态读写系统调用，但也有内存管理复杂度。
- 零拷贝主要优化大文件传输、消息日志读取等场景。

**面试表达**

> 零拷贝的重点是减少用户态和内核态之间的数据复制，不是字面上一次拷贝都没有。Java 里常见的是 `FileChannel.transferTo`，底层可能利用操作系统 `sendfile`。像 Kafka 这类高吞吐中间件，就会结合顺序写、Page Cache 和零拷贝提升性能。

## 16. 文件上传下载怎么设计更稳？

**一句话回答**：上传下载要流式处理、限制大小、校验类型、避免一次性读入内存，并做好超时、断点和清理。

**上传关键点**

- 使用流式读取，不要 `readAllBytes()` 读大文件。
- 限制文件大小、类型、扩展名和 MIME。
- 生成服务端文件名，避免用户文件名路径穿越。
- 大文件可分片上传，记录分片状态，最后合并。
- 上传后做病毒扫描、内容校验或异步处理。

**下载关键点**

- 大文件用流式输出，边读边写。
- 设置 `Content-Type`、`Content-Disposition`。
- 支持 Range 请求可做断点续传。
- 注意下载权限校验，不能只靠文件 URL。
- 高并发下载可交给对象存储或 CDN。

**面试表达**

> 文件上传下载最怕一次性把大文件加载到内存。我的做法是流式读写，控制 buffer，限制文件大小和类型，服务端重新生成文件名，避免路径穿越。大文件可以分片上传和断点续传，高并发下载尽量走对象存储或 CDN。

## 17. Java 序列化为什么线上慎用？

**一句话回答**：Java 原生序列化性能一般、体积较大、兼容性和安全风险多，线上跨服务通信通常更倾向 JSON、Protobuf、Hessian 等方案。

**常见问题**

- 序列化结果体积偏大，性能一般。
- `serialVersionUID` 不一致可能导致反序列化失败。
- 类结构变更兼容性差。
- 反序列化历史上出现过很多安全漏洞。
- 跨语言不友好。

**适合场景**

- 本地临时对象持久化。
- 简单 Demo 或内部工具。
- 对性能、安全和跨语言要求不高的场景。

**面试表达**

> Java 原生序列化能用，但生产跨服务通信要谨慎。它性能和体积都不占优，版本兼容和反序列化安全风险也比较明显。RPC 或消息体通常会选择 JSON、Protobuf、Avro、Hessian 这类更可控的序列化协议。

## 18. IO 密集型任务线程数怎么估算？

**一句话回答**：IO 密集型任务等待时间多，线程数通常可以大于 CPU 核数，但必须结合下游连接池、RT 和压测调优。

常见估算：

```text
线程数 = CPU 核数 * (1 + 等待时间 / 计算时间)
```

经验值：

```text
CPU 密集型：接近 CPU 核数
IO 密集型：可以是 CPU 核数的 2 倍、4 倍或更多，但要压测
```

**关键细节**

- IO 等待期间线程阻塞，CPU 可以切给其他线程。
- 线程不是越多越好，过多会导致上下文切换、内存占用和调度开销。
- 线程池大小还受 DB 连接池、Redis 连接池、HTTP 连接池限制。
- 如果下游只能承受 100 并发，上游线程开 1000 没有意义。

**面试表达**

> IO 密集型任务线程数可以比 CPU 核数多，因为线程大部分时间在等文件、网络或数据库。但线程数不能拍脑袋，要结合等待时间、计算时间、下游连接池和压测结果。否则只是把压力堆到线程上下文切换和下游服务上。

## 19. IO 相关线上问题怎么排查？

**一句话回答**：先判断是 CPU、线程、磁盘 IO、网络 IO、文件句柄还是内存问题，再结合系统指标、JVM 工具和应用日志定位。

| 现象 | 可能原因 | 排查方向 |
|---|---|---|
| 文件上传慢 | 磁盘慢、网络慢、buffer 太小、同步处理太多 | 监控磁盘 IO、网络、接口耗时 |
| 下载大文件 OOM | 一次性读入内存 | 看 heap dump、代码是否 `readAllBytes()` |
| `Too many open files` | 流、socket 未关闭 | `lsof`、文件句柄限制、代码 close |
| 线程大量阻塞 | BIO 阻塞、下游慢 | `jstack`、线程池队列、下游 RT |
| Direct memory OOM | NIO / Netty 直接内存泄漏 | direct memory、Netty allocator、JVM 参数 |
| 响应写不出去 | 客户端慢、网络拥塞、未 flush | 网卡、连接状态、超时配置 |

**面试表达**

> IO 问题我不会只看代码，会先分层判断：磁盘、网络、线程、文件句柄、堆内存、堆外内存。比如大文件下载 OOM 要看是不是一次性读入内存；Too many open files 要看资源是否关闭；Direct buffer memory 要看 NIO 或 Netty 堆外内存；线程阻塞则用 jstack 看是否卡在文件、socket 或下游调用。

## 20. Netty 是什么？为什么不用原生 NIO？

**一句话回答**：Netty 是基于 NIO 的高性能网络通信框架，它封装了 Selector、Channel、Buffer、线程模型和编解码，让我们不用直接写复杂且容易出错的原生 NIO。

| 对比项 | 原生 NIO | Netty |
|---|---|---|
| 编程复杂度 | 需要手写 Selector、事件循环、半包处理 | 框架封装好线程模型和事件分发 |
| 粘包拆包 | 需要自己处理 | 提供多种 Decoder |
| 内存管理 | 主要用 ByteBuffer | 提供 ByteBuf、池化和直接内存管理 |
| 扩展能力 | 代码容易混在一起 | Pipeline + Handler 责任链 |
| 生产能力 | 需要自己补很多细节 | 内置心跳、超时、编解码、流量控制等能力 |

**常见使用场景**

- RPC 框架，例如 Dubbo 底层网络通信。
- 网关、长连接、IM、推送、游戏服务。
- 自定义 TCP 协议。
- 高并发网络通信组件。

**面试表达**

> Netty 本质是对 Java NIO 的工程化封装。原生 NIO 要自己处理 Selector 轮询、连接事件、读写事件、ByteBuffer 指针、粘包拆包和线程模型，代码复杂且容易出 bug。Netty 用 EventLoop、ChannelPipeline、ByteBuf 和各种编解码器把这些能力封装起来，所以更适合生产级高并发网络通信。

## 21. Netty 的线程模型是什么？

**一句话回答**：Netty 常见是主从 Reactor 模型，BossGroup 负责接收连接，WorkerGroup 负责处理连接上的读写事件，每个 Channel 通常绑定到一个 EventLoop。

典型结构：

```text
BossGroup
  -> 监听端口，accept 新连接
  -> 把 SocketChannel 注册给 WorkerGroup

WorkerGroup
  -> 多个 EventLoop
  -> 每个 EventLoop 维护一个 Selector
  -> 处理多个 Channel 的 read/write 事件
```

**关键细节**

- `BossGroup` 主要负责连接接入，通常线程数不需要太多。
- `WorkerGroup` 负责 IO 读写、事件传播和 Handler 调用。
- 一个 `EventLoop` 本质上是一个单线程事件循环。
- 一个 `Channel` 注册到某个 `EventLoop` 后，后续 IO 事件通常都由同一个 EventLoop 处理，减少并发锁竞争。
- 不要在 EventLoop 里执行耗时任务，否则会阻塞同一个 EventLoop 上的其他连接。

**面试表达**

> Netty 典型使用 BossGroup 和 WorkerGroup。BossGroup 负责 accept 新连接，WorkerGroup 负责已建立连接的读写事件。WorkerGroup 里有多个 EventLoop，每个 EventLoop 是单线程事件循环，可以管理多个 Channel。Channel 绑定到某个 EventLoop 后，事件基本在同一个线程内串行处理，减少锁竞争。

## 22. 为什么不能在 EventLoop 里执行耗时任务？

**一句话回答**：EventLoop 是 IO 线程，同一个 EventLoop 会处理多个连接，如果在里面执行慢 SQL、RPC、复杂计算，会拖慢这个 EventLoop 上所有连接的读写。

错误做法：

```text
channelRead()
  -> 查询数据库
  -> 调远程接口
  -> 复杂 JSON 解析
```

推荐做法：

```text
channelRead()
  -> 快速解码和校验
  -> 把业务任务提交到业务线程池
  -> 业务处理完成后再回写结果
```

**关键细节**

- EventLoop 线程要尽量只做 IO、编解码和轻量逻辑。
- 慢任务应丢到独立业务线程池。
- 业务线程回写时可以通过 `channel.writeAndFlush()`，Netty 会把写事件调度回对应 EventLoop。
- 如果 EventLoop 被阻塞，会出现连接读写延迟、心跳超时、堆积和大量超时。

**面试表达**

> EventLoop 是 Netty 的 IO 线程，一个线程可能负责很多连接。如果在 EventLoop 里执行慢 SQL、RPC 或复杂计算，会导致同一个 EventLoop 上的其他连接也处理不及时。所以 Handler 里要快进快出，耗时业务放到业务线程池，IO 线程只做网络读写和轻量编解码。

## 23. ChannelPipeline 和 ChannelHandler 怎么理解？

**一句话回答**：`ChannelPipeline` 是围绕一个 Channel 的处理链，`ChannelHandler` 是链上的处理节点，入站事件从头往后走，出站事件通常从尾往前走。

典型配置：

```java
pipeline.addLast(new IdleStateHandler(60, 0, 0));
pipeline.addLast(new LengthFieldBasedFrameDecoder(1024 * 1024, 0, 4, 0, 4));
pipeline.addLast(new MessageDecoder());
pipeline.addLast(new MessageEncoder());
pipeline.addLast(new BizHandler());
```

**关键细节**

- 入站事件：连接建立、读数据、读完成、异常等，常用 `ChannelInboundHandler`。
- 出站事件：写数据、flush、close 等，常用 `ChannelOutboundHandler`。
- Pipeline 让网络处理逻辑按责任链拆开，例如心跳、拆包、解码、鉴权、业务处理、编码。
- Handler 顺序很重要，拆包通常在业务解码前，编码通常在写出时处理。

**面试表达**

> Pipeline 可以理解成 Channel 的责任链。入站数据会经过拆包、解码、鉴权、业务处理等 Handler；出站数据会经过编码、写出等 Handler。这样网络协议处理和业务处理可以拆开，扩展性比原生 NIO 里一坨代码更好。

## 24. Netty 的 ByteBuf 相比 ByteBuffer 好在哪里？

**一句话回答**：`ByteBuf` 把读指针和写指针分开，支持动态扩容、引用计数、池化、直接内存和更方便的零拷贝操作，比原生 `ByteBuffer` 更适合网络编程。

| 对比项 | ByteBuffer | ByteBuf |
|---|---|---|
| 指针模型 | 一个 position，需要 `flip()` 切换读写 | `readerIndex` 和 `writerIndex` 分离 |
| 扩容 | 容量固定 | 可按需扩容 |
| 池化 | 原生不突出 | 支持池化分配 |
| 直接内存 | 支持 DirectByteBuffer | 支持池化直接内存 |
| 零拷贝能力 | 相对弱 | `slice`、`duplicate`、`CompositeByteBuf` |
| 释放 | 依赖 GC / Cleaner | 引用计数，需要正确 release |

**关键细节**

- `readerIndex` 表示读到哪里，`writerIndex` 表示写到哪里。
- `readableBytes()` 表示可读字节数。
- `ByteBuf` 使用引用计数，释放不当可能导致内存泄漏。
- Netty 提供 `ResourceLeakDetector` 帮助排查 ByteBuf 泄漏。

**面试表达**

> ByteBuffer 最大的问题是读写共用 position，写完要 flip，半包处理也比较别扭。Netty 的 ByteBuf 分离了 readerIndex 和 writerIndex，更适合网络流式读写，还支持池化、直接内存、引用计数和零拷贝操作。但也因为引用计数，使用时要注意 release，避免直接内存泄漏。

## 25. TCP 粘包和拆包是什么？Netty 怎么解决？

**一句话回答**：TCP 是字节流协议，没有消息边界，多条消息可能粘在一起，一条消息也可能被拆成多次到达；Netty 通常通过固定长度、分隔符或长度字段解码器解决。

**为什么会发生**

- TCP 面向字节流，不保留应用层消息边界。
- Nagle 算法、缓冲区、网络拥塞都会影响发送和接收粒度。
- 发送端一次写多条消息，接收端可能一次读到一批。
- 发送端一条大消息，接收端可能分多次读到。

**常见解决方案**

| 方案 | Netty 解码器 | 适合场景 |
|---|---|---|
| 固定长度 | `FixedLengthFrameDecoder` | 每条消息长度固定 |
| 分隔符 | `DelimiterBasedFrameDecoder`、`LineBasedFrameDecoder` | 文本协议、行协议 |
| 长度字段 | `LengthFieldBasedFrameDecoder` | 自定义二进制协议 |
| 应用层协议 | HTTP/WebSocket 等 | 直接使用成熟协议 |

**面试表达**

> TCP 只保证字节有序可靠，不保证一次 write 对应一次 read，所以会有粘包和拆包。解决思路是自己定义应用层消息边界，常见有固定长度、分隔符和长度字段。Netty 已经提供了对应 Decoder，生产里自定义协议最常用的是 LengthFieldBasedFrameDecoder。

## 26. `LengthFieldBasedFrameDecoder` 怎么用？

**一句话回答**：它通过消息里的长度字段判断一帧消息的边界，是自定义二进制协议里最常见的拆包方案。

例如协议：

```text
4 字节 length + body
```

配置：

```java
new LengthFieldBasedFrameDecoder(
        1024 * 1024, // maxFrameLength
        0,           // lengthFieldOffset
        4,           // lengthFieldLength
        0,           // lengthAdjustment
        4            // initialBytesToStrip
)
```

含义：

- `maxFrameLength`：单帧最大长度，防止超大包攻击或 OOM。
- `lengthFieldOffset`：长度字段起始位置。
- `lengthFieldLength`：长度字段占几个字节。
- `lengthAdjustment`：长度字段表示的长度是否需要修正。
- `initialBytesToStrip`：解码后丢弃前面几个字节，例如丢弃 length 头。

**面试表达**

> 自定义协议里我会优先用长度字段解决拆包。比如前 4 个字节表示 body 长度，Netty 用 LengthFieldBasedFrameDecoder 读取长度字段，再等完整 body 到达后才交给业务 Decoder。这里一定要设置 maxFrameLength，避免恶意大包把内存打爆。

## 27. Netty 里的零拷贝体现在哪里？

**一句话回答**：Netty 的零拷贝主要是减少内存复制，包括组合 Buffer、切片、共享视图、直接内存和文件传输，不是完全没有任何拷贝。

常见体现：

- `CompositeByteBuf`：把多个 ByteBuf 组合成逻辑上的一个 Buffer，避免合并复制。
- `slice()`：基于原 Buffer 生成切片视图，避免复制子数组。
- `duplicate()`：共享底层数据，只复制读写指针视图。
- `DirectByteBuf`：使用直接内存，减少和 native IO 交互时的复制。
- `DefaultFileRegion` / `FileChannel.transferTo`：文件传输时利用操作系统零拷贝能力。

**关键细节**

- `slice()`、`duplicate()` 共享底层内存，修改内容会互相影响。
- 共享 Buffer 要注意引用计数和生命周期。
- 文件传输的零拷贝通常适合明文传输；如果经过 SSL/TLS，加密过程可能导致无法直接使用 sendfile。

**面试表达**

> Netty 里的零拷贝不是一次拷贝都没有，而是尽量减少不必要的数据复制。比如 CompositeByteBuf 可以组合多个 Buffer，slice 可以切出一段视图，DirectByteBuf 减少堆内到堆外复制，文件传输可以利用 transferTo。使用时要注意共享内存和引用计数。

## 28. Netty 如何做心跳和空闲检测？

**一句话回答**：Netty 通常用 `IdleStateHandler` 检测读空闲、写空闲或读写空闲，再在 `userEventTriggered` 中发送心跳或关闭连接。

典型流程：

```text
一段时间没读到数据
-> IdleStateHandler 触发 IdleStateEvent
-> Handler 发送 ping 或关闭连接
-> 对端返回 pong
-> 连接保持存活
```

示例：

```java
pipeline.addLast(new IdleStateHandler(60, 0, 0));
pipeline.addLast(new HeartbeatHandler());
```

**关键细节**

- 服务端常用读空闲检测客户端是否掉线。
- 客户端常用写空闲定期发送 ping。
- 心跳超时要有次数阈值，不能一次超时就立即关闭。
- 心跳只是应用层保活，TCP keepalive 是传输层机制，粒度和控制能力不同。

**面试表达**

> Netty 里心跳一般用 IdleStateHandler。它可以检测读空闲、写空闲和读写空闲，触发 IdleStateEvent 后在 userEventTriggered 里发送 ping、统计超时次数或关闭连接。长连接服务必须做心跳，否则客户端异常断开时服务端可能长时间感知不到。

## 29. Netty 高并发调优要关注什么？

**一句话回答**：核心关注线程模型、连接参数、内存分配、业务线程池、写缓冲水位、心跳超时和压测结果。

常见方向：

| 方向 | 说明 |
|---|---|
| 线程模型 | Boss 负责接入，Worker 负责 IO，耗时业务丢业务线程池 |
| TCP 参数 | `SO_BACKLOG`、`TCP_NODELAY`、`SO_KEEPALIVE` 等 |
| 内存 | 使用池化 ByteBuf、直接内存，监控 direct memory |
| 背压 | 关注 `Channel.isWritable()` 和写缓冲高低水位 |
| 写出策略 | 批量写、合适时机 flush，避免每条消息都 flush |
| 心跳 | 合理设置 idle 时间和超时次数 |
| 监控 | 连接数、EventLoop 延迟、队列积压、GC、直接内存 |

**关键细节**

- `TCP_NODELAY=true` 可以降低小包延迟，但可能牺牲部分吞吐。
- 写太快时要看 `ChannelOutboundBuffer` 是否堆积。
- `WriteBufferWaterMark` 可以控制高低水位，避免无限写入撑爆内存。
- EventLoop 线程数通常接近 CPU 核数或略调优，不是越多越好。

**面试表达**

> Netty 调优不是只调线程数。首先要保证 EventLoop 不被阻塞，耗时任务放业务线程池；其次关注 ByteBuf 池化和直接内存；写出侧要看 Channel 是否可写、写缓冲水位和 flush 策略；连接侧关注 backlog、keepalive、心跳和超时。最终还是要结合连接数、RT、吞吐、GC 和 direct memory 压测调优。

## 30. Netty 线上问题怎么排查？

**一句话回答**：Netty 线上问题通常从 EventLoop 是否阻塞、连接数、写缓冲堆积、ByteBuf 泄漏、直接内存和异常日志几个方向排查。

| 现象 | 可能原因 | 排查方向 |
|---|---|---|
| 大量连接超时 | EventLoop 被阻塞、下游慢、心跳配置不合理 | `jstack` 看 EventLoop 线程、监控 RT |
| direct memory OOM | ByteBuf 泄漏、池化配置不当、写缓冲堆积 | direct memory、Netty leak detector |
| 写延迟高 | 对端慢、网络拥塞、写缓冲堆积 | `Channel.isWritable()`、水位、网卡 |
| CPU 高 | 编解码复杂、空轮询、业务逻辑跑在 IO 线程 | top、jstack、火焰图 |
| 内存持续涨 | ByteBuf 未 release、队列积压 | heap dump、direct memory、引用链 |
| 连接数打满 | 未关闭无效连接、心跳失效、恶意连接 | 连接数、accept 队列、防刷限流 |

**关键细节**

- 先看是不是 EventLoop 线程被业务代码阻塞。
- 再看直接内存和 ByteBuf 泄漏，必要时打开 Netty 泄漏检测。
- 写侧问题重点看写缓冲堆积和对端消费速度。
- 大量长连接要结合心跳、连接清理、防刷和限流。

**面试表达**

> Netty 线上排查我会先看 EventLoop 线程有没有被阻塞，因为 IO 线程一阻塞会影响一批连接。然后看连接数、写缓冲堆积、direct memory、ByteBuf 泄漏和异常日志。如果是 direct memory OOM，要重点检查 ByteBuf 是否正确释放、是否有写队列堆积，以及池化直接内存配置是否合理。

## 31. 高频追问速记

| 问题 | 速记答案 |
|---|---|
| `byte` 和 `char` 区别？ | `byte` 是 8 位有符号字节，`char` 是 16 位无符号 UTF-16 代码单元。 |
| 字节流和字符流区别？ | 字节流处理二进制，字符流处理文本并涉及编码解码。 |
| 为什么中文乱码？ | 编码和解码字符集不一致，或错误用字符流处理二进制。 |
| `PrintStream` 为什么能打印中文？ | 底层写字节，但 `print(String)` 会先按字符集编码。 |
| `read()` 和 `read(byte[])` 区别？ | 单字节 vs 批量读取，批量读取性能更好。 |
| buffer 多大合适？ | 普通场景 8KB / 16KB，大文件可压测 32KB / 64KB。 |
| `flush()` 和 `close()` 区别？ | `flush` 刷缓冲，`close` 关闭资源并通常先刷缓冲。 |
| BIO / NIO / AIO 区别？ | BIO 阻塞，NIO 同步非阻塞多路复用，AIO 异步回调。 |
| NIO 三件套？ | Channel、Buffer、Selector。 |
| `flip()` 做什么？ | 写模式切读模式。 |
| 直接内存有什么风险？ | 堆外内存泄漏或超限，可能出现 `Direct buffer memory`。 |
| 零拷贝是什么？ | 减少用户态和内核态之间的数据复制。 |
| 文件上传怎么防 OOM？ | 流式读写，限制大小，不一次性读入内存。 |
| IO 密集型线程数？ | 可大于 CPU 核数，但要结合等待时间、连接池和压测。 |
| Netty 为什么比原生 NIO 好用？ | 封装线程模型、Pipeline、ByteBuf、编解码和粘包拆包。 |
| Netty 线程模型？ | BossGroup 接收连接，WorkerGroup 的 EventLoop 处理读写事件。 |
| EventLoop 能做耗时任务吗？ | 不建议，耗时任务会阻塞同一个 EventLoop 上的其他连接。 |
| Pipeline 是什么？ | Channel 上的 Handler 责任链，拆分编解码、心跳、鉴权和业务处理。 |
| ByteBuf 优势？ | 读写指针分离、可扩容、池化、直接内存、引用计数和零拷贝能力。 |
| TCP 粘包拆包怎么解决？ | 固定长度、分隔符、长度字段，Netty 常用 LengthFieldBasedFrameDecoder。 |
| Netty 心跳怎么做？ | IdleStateHandler 检测空闲，在 userEventTriggered 里发心跳或关闭连接。 |
| Netty 线上问题看什么？ | EventLoop 阻塞、连接数、写缓冲堆积、ByteBuf 泄漏、direct memory。 |

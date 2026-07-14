# Java JVM 高频面试题与线上排障指南

这份材料用于准备互联网大厂 Java 后端面试中的 JVM 专题。回答时不要只背“堆、栈、GC”这些名词，最好按“内存区域 -> 对象生命周期 -> 类加载 -> GC 机制 -> 线上排障”的链路来讲。线上问题要能落到具体命令、具体指标和具体判断依据。

---

## 1. JVM 运行时内存区域

### Q1：JVM 运行时内存区域怎么划分？

**答案**

JVM 运行时内存可以分为线程私有和线程共享两类：

| 区域        | 线程是否共享  | 存放内容                       | 常见异常                                    |
| :-------- | :------ | :------------------------- | :-------------------------------------- |
| 程序计数器     | 线程私有    | 当前线程执行的字节码行号指示器            | 通常不会 OOM                                |
| Java 虚拟机栈 | 线程私有    | 栈帧、局部变量表、操作数栈、方法返回地址       | `StackOverflowError`、`OutOfMemoryError` |
| 本地方法栈     | 线程私有    | Native 方法调用栈               | `StackOverflowError`、`OutOfMemoryError` |
| Java 堆    | 线程共享    | 对象实例、数组，GC 主要管理区域          | `Java heap space`                       |
| 方法区 / 元空间 | 线程共享    | 类元信息、运行时常量池、方法元数据；类变量逻辑上与方法区关联 | `Metaspace`                             |
| 直接内存      | JVM 外内存 | NIO、Netty、DirectByteBuffer | `Direct buffer memory`                  |

JDK 8 以后，永久代被移除，类元信息主要存放在本地内存中的元空间（Metaspace）。

**三点总结**

1. 线程私有区域主要是程序计数器、虚拟机栈、本地方法栈。
2. 线程共享区域主要是堆和方法区 / 元空间。
3. 线上 OOM 不一定只看堆，还要看元空间、直接内存和线程数。

**面试表达**

> JVM 内存区域可以按线程私有和线程共享来讲。线程私有包括程序计数器、虚拟机栈和本地方法栈；线程共享包括堆和方法区，JDK 8 以后方法区的实现主要是元空间。线上排查 OOM 时不能只盯 Java 堆，还要结合是否类加载过多、是否使用了 DirectByteBuffer、Netty 堆外内存，以及线程数量是否异常。

### Q2：堆、栈、方法区分别存什么？

**答案**

| 区域        | 核心内容               | 面试重点                             |
| :-------- | :----------------- | :------------------------------- |
| 堆         | 对象实例、数组            | GC 主战场，内存泄漏、大对象、缓存膨胀主要看这里        |
| 栈         | 方法调用栈帧、局部变量、操作数栈   | 递归过深、栈帧过大可能导致栈溢出                 |
| 方法区 / 元空间 | 类元信息、方法元数据、运行时常量池等 | 动态代理、CGLIB、热部署、类加载器泄漏可能导致元空间 OOM |

局部变量如果是对象引用，引用本身在栈帧中，对象实例仍在堆上。

**面试表达**

> 堆主要放对象实例，是 GC 关注的核心区域；栈主要跟方法调用有关，每次方法调用都会创建栈帧，里面有局部变量表、操作数栈等；方法区或元空间主要放类相关元数据。需要注意对象引用可能在栈上，但对象本体通常在堆上。

### Q2 追问：什么是 Java 内存模型（JMM）？它和 JVM 内存区域有什么区别？

**答案**

Java 内存模型（Java Memory Model，JMM）是一套并发编程规范，规定多个线程如何读取和写入共享变量，以及 `volatile`、`synchronized`、`final` 等机制如何保证线程安全。它关注的是**可见性、有序性和原子性**，不是 JVM 真实划分出来的堆、栈、方法区。

为了描述线程间的数据交互，JMM 抽象出两类概念：

| 概念 | 作用 |
| :--- | :--- |
| 主内存 | 共享变量的规范层面存放位置，所有线程最终以它为准 |
| 工作内存 | 每个线程对共享变量的本地副本、寄存器或 CPU 缓存等抽象 |

线程读取共享变量时，可能先读到自己的工作内存；一个线程修改变量后，另一个线程不一定立刻可见。因此 JMM 定义 `happens-before` 规则，约束哪些写入必须对后续读取可见，例如：

1. 同一线程内，前面的操作先于后面的操作。
2. 对同一把锁，`synchronized` 解锁先于后续加锁。
3. 对同一个 `volatile` 变量，写操作先于后续读操作。
4. `Thread.start()` 先于新线程中的操作；线程内操作先于其他线程从 `join()` 成功返回。
5. `happens-before` 具有传递性。

**和 JVM 运行时内存区域的区别**

| 对比项 | JMM | JVM 运行时内存区域 |
| :--- | :--- | :--- |
| 本质 | 并发读写规则和可见性模型 | JVM 实际运行时的数据区域划分 |
| 解决问题 | 多线程数据为什么会看不见、乱序或竞争 | 对象、栈帧、类元信息分别存在哪里 |
| 典型关键词 | 主内存、工作内存、`volatile`、`synchronized`、happens-before | 堆、虚拟机栈、元空间、直接内存、GC |
| 是否是物理内存分区 | 不是，是规范层面的抽象 | 是 JVM 运行时的逻辑内存区域 |

例如下面的 `running` 没有 `volatile` 时，工作线程可能一直读取到旧值；加上 `volatile` 后，主线程的写入对工作线程可见，并禁止相关读写重排序：

```java
private volatile boolean running = true;

public void stop() {
    running = false;
}

public void run() {
    while (running) {
        // 执行业务逻辑
    }
}
```

需要注意，`volatile` 不能保证 `count++` 这类复合操作的原子性；这类场景仍要用 `synchronized`、`Lock` 或 `AtomicInteger`。

**三点总结**

1. JMM 解决多线程共享变量的可见性、有序性和原子性问题。
2. 主内存、工作内存是 JMM 的抽象，不等于堆、栈、方法区。
3. `volatile` 主要保证可见性和有序性，`synchronized` 还能保证临界区复合操作的原子性。

**面试表达**

> JMM 是 Java 并发的内存访问规范，不是 JVM 的堆栈划分。它用主内存和工作内存描述线程间如何读写共享变量，核心解决可见性、有序性和原子性问题。JMM 通过 happens-before 规则定义可见性边界，例如 volatile 写先于后续读、解锁先于后续加锁。实际开发里，状态开关可用 volatile；像库存扣减、count++ 这类读改写操作，还需要 synchronized、Lock 或原子类保证原子性。

深入学习 `volatile`、`synchronized`、内存屏障和 happens-before 规则，可继续看 [[Java并发编程面试指南#3. JMM（Java 内存模型）详解|Java 并发编程中的 JMM 详解]]。

### Q2 追问：方法区中的类元信息指的是什么？

**答案**

类元信息可以理解为 JVM 加载 `.class` 文件后，为了运行这个类而保存的一套“类结构说明书”。它不是某个 `new` 出来的对象实例，而是描述这个类本身的结构、继承关系、字段、方法和运行时访问入口。

常见类元信息包括：

| 类元信息            | 说明                                  |
| :-------------- | :---------------------------------- |
| 类的全限定名          | 例如 `com.example.UserService`        |
| 父类信息            | 继承了哪个类，例如 `extends BaseService`     |
| 接口信息            | 实现了哪些接口，例如 `implements Runnable`    |
| 访问修饰符           | `public`、`abstract`、`final` 等       |
| 字段信息            | 字段名、字段类型、访问修饰符，例如 `private Long id` |
| 方法信息            | 方法名、参数、返回值、访问修饰符、方法字节码等             |
| 构造方法信息          | 构造器签名和构造器字节码                        |
| 运行时常量池          | 字符串字面量、类符号引用、字段符号引用、方法符号引用等         |
| 注解和泛型签名         | 类、字段、方法上的注解，以及泛型签名等附加信息             |
| 类加载器关联          | 这个类由哪个 `ClassLoader` 加载             |
| `Class<?>` 对象关联 | 反射访问类结构时的运行时入口                      |

这几个容易混淆的概念，可以按“类的说明书、说明书里的两个部分、类共享的数据”来区分：

| 概念     | 和类元信息的关系      | 保存什么                             | 关键理解                                    |
| :----- | :------------ | :------------------------------- | :-------------------------------------- |
| 类元信息   | 总称            | 类名、父类、接口、字段和方法定义、注解、泛型、常量池、类加载器等 | JVM 运行一个类需要的结构说明书                       |
| 运行时常量池 | 类元信息的一部分      | 字面量、类 / 字段 / 方法的符号引用等            | 执行字节码时，可将符号引用解析为实际可访问的目标                |
| 方法元数据  | 类元信息的一部分      | 方法名、参数、返回值、修饰符、异常声明、注解、方法字节码等    | 描述“这个方法如何被调用、如何执行”                      |
| 静态变量   | 类共享状态，不等同于元数据 | `static` 字段当前保存的值                | 字段的定义属于类元信息；字段当前值属于类变量状态，同一个类加载器下通常共享一份 |

静态变量要特别注意：JVM 规范把类变量和方法区联系在一起，但具体物理存储取决于 JVM 实现和版本，不能简单说“所有静态变量都放在元空间”。JDK 8 以后，元空间主要保存类元数据；面试中更稳妥的说法是“`static` 变量属于类级共享数据，生命周期通常随类和类加载器而存在”。

举个例子：

```java
public class User {
    private static int count = 0;

    private Long id;
    private String name;

    public String getName() {
        return name;
    }
}
```

方法区 / 元空间里存的是：

```text
类名：User
父类：Object
字段：id: Long, name: String
静态字段定义：count: int
方法：getName(): String
访问修饰符：public
常量池信息
方法字节码
```

其中 `count` 的字段定义属于类元信息，而 `count = 0` 这个会变化的值属于类级共享状态；`getName()` 的方法名、参数、返回值和字节码属于方法元数据；字符串字面量、类名和方法名的符号引用等属于运行时常量池。

而下面这些具体对象实例在堆中：

```java
new User(1L, "张三")
new User(2L, "李四")
```

**面试表达**

> 类元信息是类的结构说明书，里面包括运行时常量池和方法元数据；前者保存常量和符号引用，后者保存方法签名和字节码。静态变量的字段定义也属于类信息，但它当前保存的值是类级共享状态，不要和元数据混为一谈。对象实例通常在堆里，JDK 8 以后类元数据主要由元空间承载。

---

## 2. 对象创建、对象头与内存分配

### Q3：Java 对象是怎么创建出来的？

**答案**

对象创建通常经过五步：

1. **类加载检查**：检查对象所属类是否已经加载、解析、初始化。
2. **分配内存**：在堆上为对象分配空间。
3. **初始化零值**：将对象字段设置为默认零值。
4. **设置对象头**：写入 Mark Word、类型指针、数组长度等。
5. **执行构造方法**：调用 `<init>`，执行业务层面的初始化逻辑。

内存分配方式主要有两种：

| 分配方式 | 适用场景 |
| :--- | :--- |
| 指针碰撞 | 堆内存规整，分配时移动指针 |
| 空闲列表 | 堆内存不规整，需要维护可用块列表 |

为了保证并发分配安全，JVM 通常会使用 CAS 或 TLAB。

**面试表达**

> 对象创建不是简单 new 一下，JVM 会先做类加载检查，然后在堆里分配内存，给字段初始化默认零值，设置对象头，最后执行构造方法。分配内存时如果堆规整可以用指针碰撞，如果不规整就用空闲列表；并发分配时可以通过 CAS 或线程本地分配缓冲 TLAB 降低竞争。

### Q4：对象头里有什么？和锁有什么关系？

**答案**

普通对象头主要包括：

| 内容            | 说明                        |
| :------------ | :------------------------ |
| Mark Word     | 哈希码、GC 年龄、锁标志位、偏向锁线程 ID 等 |
| Klass Pointer | 指向类元数据的类型指针               |
| 数组长度          | 只有数组对象才有                  |

`synchronized` 的锁状态会体现在对象头的 Mark Word 中，例如无锁、轻量级锁、重量级锁等状态。JDK 6 以后 JVM 对 `synchronized` 做了偏向锁、轻量级锁、自旋、锁消除、锁粗化等优化。

**面试表达**

> 对象头里最重要的是 Mark Word 和类型指针。Mark Word 会存对象哈希码、GC 年龄、锁标志等信息，所以 synchronized 锁升级和对象头关系很密切。线程进入同步块时，JVM 会围绕对象头 Mark Word 做 CAS 或膨胀为 Monitor。

---

## 3. 类加载机制与双亲委派

### Q5：类加载生命周期有哪些阶段？

**答案**

类加载过程一般分为：

```text
加载 -> 验证 -> 准备 -> 解析 -> 初始化 -> 使用 -> 卸载
```

| 阶段 | 作用 |
| :--- | :--- |
| 加载 | 读取 class 字节码，生成 `Class` 对象 |
| 验证 | 校验字节码安全性和格式正确性 |
| 准备 | 给类变量分配内存并设置默认值 |
| 解析 | 将符号引用转换为直接引用 |
| 初始化 | 执行类构造器 `<clinit>`，给静态变量赋业务初始值 |

注意准备阶段只是默认值，例如 `static int a = 10` 在准备阶段是 `0`，初始化阶段才变成 `10`。

**面试表达**

> 类加载不是一步完成的，核心流程是加载、验证、准备、解析、初始化。准备阶段只是给静态变量分配内存并设置默认零值，初始化阶段才执行静态变量赋值和静态代码块。这个点经常被问来区分默认值和业务初始值。

### Q5 追问：为什么类加载阶段也有初始化？和 new 对象的初始化一样吗？

**答案**

不一样。这里有两个“初始化”，名字相似，但初始化的对象不同：

| 对比项 | 类加载初始化 | new 对象初始化 |
| :--- | :--- | :--- |
| 初始化谁 | 类本身 | 对象实例 |
| 对应方法 | `<clinit>` | `<init>` |
| 执行内容 | 静态变量赋值、静态代码块 | 实例变量赋值、实例代码块、构造方法 |
| 执行次数 | 一个类通常只初始化一次 | 每次 `new` 都会执行 |
| 触发时机 | 首次主动使用类，例如 `new`、访问静态变量、调用静态方法 | 对象内存分配和零值初始化之后 |

类加载的初始化阶段，是执行类构造器 `<clinit>`，处理的是 `static` 相关逻辑：

```java
class User {
    static int count = 10;

    static {
        System.out.println("类初始化");
    }
}
```

对象创建里的初始化，是执行实例构造器 `<init>`，处理的是对象实例自己的字段和构造方法：

```java
class User {
    private String name = "zhang";

    {
        System.out.println("实例代码块");
    }

    public User() {
        System.out.println("构造方法");
    }
}
```

如果第一次执行：

```java
User user = new User();
```

大致顺序是：

```text
1. 先做类加载检查，如果 User 类还没初始化，先执行类初始化
   -> static 变量赋值
   -> static 代码块

2. 在堆上给 User 对象分配内存

3. 对对象字段做零值初始化
   -> name = null

4. 执行对象初始化
   -> name = "zhang"
   -> 实例代码块
   -> 构造方法
```

所以，`new` 一个对象时可能会先触发类初始化，但类初始化只在类首次主动使用时执行；对象初始化是每次创建实例都会执行。

**面试表达**

> 类加载阶段的初始化和 new 对象时的初始化不是一回事。类初始化是类级别的，执行 `<clinit>`，主要处理静态变量赋值和静态代码块，通常一个类只执行一次；对象初始化是实例级别的，执行 `<init>`，包括实例变量赋值、实例代码块和构造方法，每 new 一次都会执行一次。所以第一次 new 某个类时，可能先触发类初始化，再进行对象内存分配和构造方法执行。

### Q5 追问：每次 new 同一个类都会触发类加载和双亲委派吗？

**答案**

不会。对“同一个 ClassLoader + 同一个类全限定名”来说，一个类通常只会被加载一次。

第一次执行：

```java
User user = new User();
```

如果 `User` 还没有被加载过，JVM 会先做类加载检查：

```text
类加载检查
  -> ClassLoader.loadClass("com.xxx.User")
  -> 按双亲委派向上委托
  -> 父加载器加载不了，再逐级向下尝试
  -> 找到 User.class
  -> 加载、验证、准备、解析、初始化
  -> 创建 User 对象
```

第二次、第三次再执行：

```java
User user2 = new User();
User user3 = new User();
```

JVM 会发现 `User` 已经被当前类加载器加载过，不会重新读取 `User.class`，也不会重新走完整的双亲委派加载流程，而是复用方法区 / 元空间里的类元信息，只执行对象创建流程：

```text
分配对象内存
  -> 零值初始化
  -> 设置对象头
  -> 执行实例初始化 <init>
```

需要注意两点：

1. **类加载和类初始化通常只发生一次**：同一个 ClassLoader 加载同一个类后，后续直接复用类元信息；`static` 变量赋值和静态代码块也不会每次 `new` 都执行。
2. **对象初始化每次都会执行**：每次 `new` 都会创建新的对象实例，并执行实例变量赋值、实例代码块和构造方法。

特殊情况是不同 ClassLoader 加载同名类，例如插件化、热部署、容器隔离场景。此时 JVM 会认为它们是不同的类，可能分别加载和初始化。

**面试表达**

> 每次 new 同一个类，不会都重新触发类加载和双亲委派。第一次 new 时，如果类还没加载，JVM 会通过类加载器加载 class，并在首次主动使用时完成类初始化；后续再 new，同一个 ClassLoader 下会直接复用已经加载好的类元信息，只进行对象内存分配、对象头设置和 `<init>` 构造方法执行。类加载和 static 初始化通常只做一次，对象初始化每次 new 都会做。

### Q6：什么是双亲委派？为什么要这样设计？

**答案**

双亲委派是指类加载器收到加载请求后，先不自己加载，而是委托父加载器加载；父加载器加载不了，子加载器才尝试自己加载。

常见类加载器层级：

```text
Bootstrap ClassLoader
        ^
Platform / Extension ClassLoader
        ^
Application ClassLoader
        ^
Custom ClassLoader
```

设计目的：

1. **保证核心类安全**：避免用户自定义 `java.lang.String` 替换 JDK 核心类。
2. **避免重复加载**：同一个类优先由上层统一加载。
3. **保证类型一致性**：同一个类由不同加载器加载，会被 JVM 视为不同类型。

**追问：为什么说双亲委派能防止同一个类被重复加载？同一个类不是只会加载一次吗？**

这句话要加一个前提：**同一个类在同一个 ClassLoader 下通常只会加载一次**。JVM 判断两个类是不是同一个类，不只看全限定类名，还要看定义它的类加载器。

```text
类唯一性 = 类全限定名 + 定义它的 ClassLoader
```

比如都是 `com.xxx.User`：

```text
AppClassLoader 加载 com.xxx.User -> 一个 Class
CustomClassLoader 加载 com.xxx.User -> 另一个 Class
```

即使这两个 `User` 的包名、类名、字节码完全一样，JVM 也会认为它们是两个不同的类。

所以“双亲委派避免重复加载”主要解决的是**类加载器层级之间的重复定义问题**：

```text
子加载器收到加载请求
  -> 先委托父加载器
  -> 父加载器如果已经加载过，直接返回同一个 Class
  -> 子加载器不再自己重新 defineClass
```

如果没有双亲委派，多个子加载器都可能各自加载同一个公共类，导致 JVM 中出现多份“类名相同但 ClassLoader 不同”的 `Class` 对象。这样不仅浪费元空间，还可能出现类型不兼容问题，例如强转失败、`instanceof` 判断为 false。

因此可以这么理解：

1. **同一个 ClassLoader 内部**：靠已加载类缓存，避免同一个类重复加载。
2. **不同 ClassLoader 层级之间**：靠双亲委派，优先复用父加载器已经加载的类，避免公共类、核心类被子加载器重复定义。

**面试表达**

> 双亲委派的核心是先向上委托，再向下加载。这样可以保证 JDK 核心类优先由启动类加载器加载，避免核心 API 被篡改，也能让子加载器优先复用父加载器已经加载过的公共类。需要注意，同一个类只加载一次的前提是同一个 ClassLoader；JVM 判断类是否相同，不仅看全限定类名，还要看定义它的 ClassLoader。

### Q7：哪些场景会打破双亲委派？

**答案**

常见场景：

| 场景 | 为什么打破 |
| :--- | :--- |
| Tomcat | 不同 Web 应用需要隔离各自依赖，WebAppClassLoader 会优先加载应用自己的类 |
| SPI / JDBC | JDK 核心类需要加载第三方实现，使用线程上下文类加载器 |
| OSGi / 插件化 | 模块之间需要独立加载和动态卸载 |
| 自定义热部署 | 需要重新加载同名类 |

**什么是 SPI？**

SPI 是 `Service Provider Interface`，也就是服务提供者接口。它的核心思想是：**接口由 JDK 或框架定义，实现由第三方提供，运行时再通过配置自动发现和加载实现类**。

可以按四个角色理解：

| 角色 | JDBC 例子 |
| :--- | :--- |
| 接口规范 | `java.sql.Driver` |
| 厂商实现 | `com.mysql.cj.jdbc.Driver` |
| 配置文件 | `META-INF/services/java.sql.Driver` |
| 加载机制 | `ServiceLoader` |

MySQL 驱动 jar 里通常会有这样一个 SPI 配置文件：

```text
META-INF/services/java.sql.Driver
```

文件内容是具体实现类：

```text
com.mysql.cj.jdbc.Driver
```

JDK 通过 `ServiceLoader` 扫描这个文件后，就知道 `java.sql.Driver` 这个接口有一个厂商实现类 `com.mysql.cj.jdbc.Driver`，然后再把它加载进 JVM。

**面试表达**：

> SPI 是一种服务发现和插件化扩展机制。JDK 或框架只定义接口，第三方提供实现，并在 `META-INF/services/接口全限定名` 文件里声明实现类。运行时通过 `ServiceLoader` 扫描配置并加载实现。JDBC 就是典型例子，JDK 定义 `java.sql.Driver`，MySQL 提供 `com.mysql.cj.jdbc.Driver`，`DriverManager` 通过 SPI 自动发现驱动实现。

**JDBC SPI 是怎么打破双亲委派的？**

JDBC 的典型问题是：`DriverManager` 是 JDK 核心类，由高层类加载器加载；但 MySQL、PostgreSQL 这类数据库驱动在业务应用的 classpath 下，通常只能由 `AppClassLoader` 加载。高层加载器按正常双亲委派是看不到应用 classpath 里的厂商驱动 jar 的。

所以 JDK 通过 `ServiceLoader` 和线程上下文类加载器反向加载厂商实现。

**1. DriverManager 初始化时触发驱动加载**：

```java
static {
    loadInitialDrivers();
}
```

`loadInitialDrivers()` 里会通过 SPI 加载 `java.sql.Driver` 的实现：

```java
ServiceLoader<Driver> loadedDrivers = ServiceLoader.load(Driver.class);
Iterator<Driver> driversIterator = loadedDrivers.iterator();

while (driversIterator.hasNext()) {
    driversIterator.next();
}
```

**2. ServiceLoader 使用线程上下文类加载器**：

```java
public static <S> ServiceLoader<S> load(Class<S> service) {
    ClassLoader cl = Thread.currentThread().getContextClassLoader();
    return ServiceLoader.load(service, cl);
}
```

这里没有使用 `DriverManager` 自己的类加载器，而是使用当前线程的 ContextClassLoader。业务线程的上下文类加载器通常是 `AppClassLoader`，它能看到应用 classpath 下的驱动 jar。

**3. ServiceLoader 扫描 SPI 配置文件**：

```text
META-INF/services/java.sql.Driver
```

MySQL 驱动 jar 中这个文件通常会声明：

```text
com.mysql.cj.jdbc.Driver
```

然后 `ServiceLoader` 用上下文类加载器加载这个实现类：

```java
Class<?> c = Class.forName(className, false, loader);
Driver driver = (Driver) c.newInstance();
```

这里的 `loader` 就是线程上下文类加载器。

**4. 厂商 Driver 注册到 DriverManager**：

驱动类加载后，通常会在静态代码块里注册自己：

```java
public class Driver extends NonRegisteringDriver {
    static {
        DriverManager.registerDriver(new Driver());
    }
}
```

后续业务调用：

```java
Connection conn = DriverManager.getConnection(url, username, password);
```

`DriverManager` 会遍历已注册的驱动，找到能处理当前 JDBC URL 的驱动并创建连接。

**为什么这叫打破双亲委派？**

正常双亲委派方向是：

```text
子加载器 -> 父加载器 -> 更上层父加载器
```

JDBC SPI 的关键方向是：

```text
高层加载器加载的 DriverManager
  -> 调用 Thread Context ClassLoader
  -> 反向让 AppClassLoader 加载业务 classpath 下的厂商 Driver
```

所以它不是彻底不用双亲委派，而是通过线程上下文类加载器，让父层核心类有能力“反向”发现和加载子层 classpath 里的服务实现。

**面试表达**

> 双亲委派不是绝对不能破坏。Tomcat 为了做到不同 Web 应用的 jar 包隔离，会让 WebAppClassLoader 优先加载自己应用下的类；JDBC SPI 则是通过线程上下文类加载器解决父加载器看不到子加载器 classpath 的问题。比如 `DriverManager` 是 JDK 核心类，但 MySQL Driver 在业务 classpath 下，JDK 会通过 `ServiceLoader` 使用 `Thread.currentThread().getContextClassLoader()` 扫描 `META-INF/services/java.sql.Driver`，再加载 `com.mysql.cj.jdbc.Driver` 这类厂商实现。

---

## 4. GC Roots、引用类型与对象存活判断

### Q8：JVM 如何判断对象是否可以回收？

**答案**

主流 JVM 使用可达性分析。GC 从 GC Roots 出发向下搜索，能被找到的对象是存活对象，找不到的对象可以被回收。

常见 GC Roots 可以按“正在运行的线程、已加载的类、Native 调用、JVM 内部结构”来理解：

| GC Roots 类型 | 说明 | 典型例子 |
| :--- | :--- | :--- |
| 虚拟机栈中的引用 | 当前线程正在执行的方法里，局部变量表、方法参数、临时变量引用的对象 | 方法中的 `User user = userMapper.selectById(id)` |
| 本地方法栈中的 JNI 引用 | Native 方法中持有的 Java 对象引用 | JNI 调用里保存的对象引用 |
| 类静态变量引用的对象 | 已加载类的 `static` 字段引用的对象 | `private static Map<String, Object> CACHE` |
| 常量引用的对象 | 运行时常量池、字符串常量等引用的对象 | 字符串字面量、常量引用解析后的对象 |
| 被 `synchronized` 持有的对象 | 正在作为 Monitor 锁对象使用的对象 | `synchronized (lock)` 中的 `lock` |
| 活跃线程对象 | 正在运行的 Java 线程及其可达对象 | `Thread`、线程持有的任务对象、`ThreadLocalMap` |
| 类加载器相关引用 | 类加载器、`Class<?>` 对象、类元信息及其静态字段可达对象 | `ClassLoader`、`Class<?>`、动态代理类 |
| JVM 内部引用 | JVM 自身运行需要持有的对象 | 系统类加载器、基础运行时对象、异常对象等 |

**典型例子 1：虚拟机栈局部变量**

```java
public void queryUser() {
    User user = userMapper.selectById(1L);
    System.out.println(user.getName());
}
```

`queryUser()` 正在执行时，`user` 在当前线程栈帧的局部变量表中，`user` 指向的 `User` 对象从 GC Roots 可达，不能被回收。方法执行结束后，栈帧销毁，如果没有其他引用指向这个对象，它就可以被回收。

**典型例子 2：静态集合导致对象长期可达**

```java
public class CacheHolder {
    private static final Map<String, Object> CACHE = new HashMap<>();
}
```

只要 `CacheHolder` 这个类还被加载，`CACHE` 就会通过类静态变量这条链路可达：

```text
GC Roots -> Class -> static field -> HashMap -> value objects
```

如果持续往静态集合里放数据又不清理，就可能导致堆内存持续上涨，Full GC 后也降不下来。

**典型例子 3：ThreadLocal 在线程池中泄漏**

线程池中的工作线程长期存活，线程本身可以作为可达性分析的起点。典型引用链是：

```text
GC Roots -> Thread -> ThreadLocalMap -> Entry -> value
```

即使 `ThreadLocalMap.Entry` 的 key 是弱引用，key 被 GC 回收后，如果 value 没有被清理，value 仍然可能沿着 `Thread` 这条链路可达。因此线程池中使用 `ThreadLocal` 后要在 `finally` 中调用 `remove()`。

**典型例子 4：类加载器泄漏**

热部署、插件化、脚本引擎、频繁生成动态代理时，如果旧的 `ClassLoader` 没有释放，它加载过的类元信息、`Class<?>` 对象以及静态字段引用的对象都可能继续存活：

```text
GC Roots -> ClassLoader -> Class 元信息 -> static field -> object
```

这类问题可能表现为 Metaspace 持续上涨，也可能因为静态字段引用业务对象导致堆持续上涨。

**注意**

对象之间互相引用不代表一定不会被回收。比如 `A` 引用 `B`，`B` 又引用 `A`，但如果从 GC Roots 出发找不到它们，这组循环引用仍然可以被回收。所以 Java 主流 JVM 不是靠引用计数判断对象存活，而是靠可达性分析。

**面试表达**

> Java 不是靠引用计数判断对象是否存活，而是靠可达性分析。从 GC Roots 出发能找到的对象就是存活对象，找不到的对象才可能被回收。常见 GC Roots 包括线程栈中的局部变量和方法参数、Native 方法中的 JNI 引用、类静态变量、常量引用、被 synchronized 持有的对象、活跃线程、类加载器以及 JVM 内部引用。像静态集合、ThreadLocal、ClassLoader 泄漏，本质都是对象通过某条 GC Roots 引用链一直可达。

### Q9：强引用、软引用、弱引用、虚引用有什么区别？

**答案**

| 引用类型 | 回收时机            | 常见用途                          |
| :--- | :-------------- | :---------------------------- |
| 强引用  | 只要强引用存在就不会回收    | 普通对象引用                        |
| 软引用  | 内存不足时可能回收       | 缓存                            |
| 弱引用  | 下次 GC 时直接回收     | `WeakHashMap`、ThreadLocal key |
| 虚引用  | 不影响生命周期，只用于回收通知 | 堆外内存清理、对象回收跟踪                 |

**ThreadLocal 追问**

`ThreadLocalMap.Entry` 的 key 是弱引用，value 是强引用。如果线程池线程长期存活，key 被 GC 后 value 仍可能通过 `Thread -> ThreadLocalMap -> Entry -> value` 被引用，导致内存泄漏。因此线程池场景必须 `remove()`。

**面试表达**

> 强引用最常见，只要存在就不会回收；软引用适合缓存，内存不足时回收；弱引用只要发生 GC 就会回收；虚引用主要用于回收通知。ThreadLocal 的 key 是弱引用，但 value 是强引用，所以线程池里用完一定要 remove，否则可能内存泄漏和脏数据串用。

---

## 5. 垃圾回收算法与垃圾收集器

### Q10：常见垃圾回收算法有哪些？

**答案**

| 算法 | 思路 | 优点 | 缺点 |
| :--- | :--- | :--- | :--- |
| 标记-清除 | 标记存活对象，清理未标记对象 | 简单 | 产生内存碎片 |
| 复制算法 | 将存活对象复制到另一块内存 | 没有碎片，适合存活少 | 浪费一部分空间 |
| 标记-整理 | 标记后移动存活对象，整理空间 | 无碎片 | 移动对象成本高 |
| 分代收集 | 按对象生命周期分代使用不同算法 | 符合大多数对象朝生夕死特点 | 跨代引用需要额外处理 |

新生代对象大多朝生夕死，适合复制算法；老年代对象存活率高，通常使用标记-清除或标记-整理思想。

**面试表达**

> 常见 GC 算法有标记清除、复制、标记整理和分代收集。新生代对象大多存活时间短，所以适合复制算法；老年代对象存活率高，复制成本大，更适合标记清除或标记整理。实际收集器通常会组合使用这些算法。

### Q10.1：Eden 区的复制算法是怎么做的？

**一句话回答**

Eden 区的复制算法发生在 Young GC / Minor GC 时：把 Eden 和当前 From Survivor 中还活着的对象复制到空的 To Survivor，复制完成后直接清空 Eden 和 From Survivor，然后 From / To 角色互换。

**新生代结构**

```text
新生代 = Eden + Survivor0 + Survivor1
```

两个 Survivor 区在一次 GC 中分别扮演：

| 区域 | 作用 |
| :--- | :--- |
| Eden | 新对象主要分配的位置 |
| From Survivor | 上一次 Young GC 后存活对象所在的位置 |
| To Survivor | 本次 Young GC 用来接收存活对象的空区域 |

**复制流程**

1. 新对象优先分配到 Eden 区。
2. Eden 空间不足时触发 Young GC。
3. GC 从 GC Roots 出发，找出 Eden 和 From Survivor 中仍然存活的对象。
4. 存活对象被复制到 To Survivor，对象年龄加 1。
5. Eden 和 From Survivor 中没有被复制的对象视为垃圾，直接整块清空。
6. GC 结束后，From Survivor 和 To Survivor 交换角色。

示意：

```text
GC 前：
Eden: A B C D E
From: F G
To:   空

假设 A、C、F 存活：
To: A C F

GC 后：
Eden 清空
From 清空
To 保存 A C F

然后 From / To 交换角色
```

**什么时候进入老年代？**

| 情况 | 结果 |
| :--- | :--- |
| 对象年龄达到晋升阈值 | 晋升到老年代 |
| To Survivor 放不下 | 部分对象提前晋升到老年代 |
| 动态年龄判断触发 | 一批年龄较小的对象也可能提前晋升 |
| 大对象分配策略命中 | 可能直接进入老年代 |

**为什么新生代适合复制算法？**

因为新生代对象大多数“朝生夕死”，一次 Young GC 后真正存活的对象通常很少。复制算法只移动存活对象，垃圾对象不用逐个清理，直接清空整块 Eden 和 From Survivor，所以速度快、碎片少。

**面试表达**

> Eden 区的复制算法主要发生在 Young GC。对象优先分配到 Eden，Eden 空间不足时，会把 Eden 和 From Survivor 中仍然存活的对象复制到空的 To Survivor，并让对象年龄加 1；没有被复制的对象直接随着 Eden 和 From Survivor 整块清空。GC 结束后 From 和 To 交换角色。如果对象年龄达到阈值、Survivor 放不下，或者触发动态年龄判断，就会晋升到老年代。新生代适合复制算法，是因为大多数对象生命周期很短，真正需要复制的存活对象少。

### Q10.2：为什么标记-复制算法通常需要 STW？

**一句话回答**

传统标记-复制需要 STW，不是因为对象逻辑上“不能用”，而是因为复制过程中对象地址会变化，所有指向旧地址的引用都要更新到新地址，必须保证对象引用关系稳定。

复制算法大概会做几件事：

1. 从 GC Roots 找到存活对象。
2. 把存活对象从 Eden / From Survivor 复制到 To Survivor。
3. 给对象分配新地址。
4. 把所有指向旧对象地址的引用，改成新对象地址。
5. 清空旧区域。

问题主要出在第 2 到第 4 步。如果业务线程同时运行，可能出现：

| 问题 | 说明 |
| :--- | :--- |
| 引用更新不一致 | 有的引用指向旧地址，有的引用指向新地址 |
| 对象图变化 | GC 刚扫描完，业务线程又修改引用，可能导致漏标 |
| 访问旧地址 | 旧区域后续会被清空，继续访问旧对象会出问题 |
| 并发写入冲突 | 业务线程正在改字段，GC 同时搬迁对象，状态不好维护 |

示意：

```text
复制前：
userRef -> 0x1000 User

复制后：
旧地址 0x1000
新地址 0x8000

引用需要修正为：
userRef -> 0x8000 User
```

如果这个修正过程和业务线程并发执行，就需要非常复杂的屏障和转发表机制。传统 Young GC 为了实现简单和安全，会暂停业务线程，完成复制和引用修正后再恢复。

**补充：并发复制是不是做不到？**

不是。ZGC、Shenandoah 这类低延迟收集器也会移动对象，但它们通过读屏障、写屏障、转发表、colored pointer 或 Brooks pointer 等机制，让业务线程和 GC 可以并发完成一部分对象转移。

所以更准确的说法是：**传统复制收集通常 STW；并发复制可以做，但实现复杂度更高。**

**面试表达**

> 标记-复制通常需要 STW，是因为复制过程中对象会从旧地址搬到新地址，所有引用都要被修正。如果业务线程同时运行，可能出现引用一部分指向旧地址、一部分指向新地址，或者业务线程新增引用导致 GC 漏标。传统 Young GC 会暂停业务线程，保证对象图稳定，完成对象复制和引用更新后再恢复。并发复制不是不能做，但需要读写屏障和转发表，典型代表是 ZGC、Shenandoah。

### Q10.3：Young GC 的 STW 一般不长，为什么还说它有严重问题？

**一句话回答**

Young GC 单次 STW 通常不长，但它会暂停整个 JVM 的业务线程；在高 QPS、对象分配密集、存活对象偏多的场景下，会造成 P99 抖动、请求排队和服务毛刺。

| 放大因素 | 为什么会变严重 |
| :--- | :--- |
| 触发频率高 | Eden 太小或对象创建太快时，Young GC 可能频繁发生 |
| 存活对象变多 | 复制成本取决于存活对象数量，存活越多，停顿越长 |
| Survivor 放不下 | 对象提前晋升老年代，增加后续老年代 GC 压力 |
| 高并发低延迟 | 几十毫秒 STW 也可能放大成请求排队、超时和重试 |
| STW 是全应用暂停 | 不是某个请求慢，而是整个进程里的 Java 线程都暂停 |

典型场景：

- 大批量查询结果保存在内存中。
- MQ 批量消费一次拉取太多消息。
- 大 JSON 解析产生大量临时对象。
- 线程池队列堆积，导致请求对象活过多次 Young GC。
- 本地缓存或请求上下文对象生命周期偏长。

所以 Young GC 的问题不只是“单次停顿多长”，还要看：

```text
停顿时间 * 发生频率 * 是否命中核心请求链路
```

**面试表达**

> Young GC 单次 STW 通常不会特别长，因为新生代大多数对象朝生夕死，真正需要复制的存活对象少。但它的问题在于会暂停整个 JVM 的业务线程，而且可能高频发生。如果对象分配速度很快、Eden 较小、存活对象偏多，Young GC 会变慢或变频繁；Survivor 放不下还会导致对象提前晋升，进一步增加老年代压力。在线上高 QPS 服务里，这类短暂停顿会表现为 P99 抖动、请求排队和 RT 毛刺。

### Q11：Minor GC、Major GC、Full GC 有什么区别？

**答案**

**一句话区分**：Minor GC / Young GC 主要回收新生代；Major GC 通常指老年代回收，但不同资料和收集器口径不完全统一；Full GC 通常指对整个堆做一次完整回收，可能还包含元空间和类卸载，停顿风险最大。

| 类型 | 回收范围 | 常见触发时机 | 线上关注点 |
| :--- | :--- | :--- | :--- |
| Minor GC / Young GC | 新生代，主要是 Eden + Survivor | Eden 空间不足，新对象分配失败，触发新生代回收 | 频率高、单次通常较短，但高 QPS 下会造成 RT 毛刺 |
| Major GC | 老年代，具体语义依收集器而异 | 老年代使用率达到阈值，或收集器开始老年代回收周期 | 口径不统一，面试时要说明“我一般按老年代 GC 理解” |
| Full GC | 整个堆，通常包含新生代、老年代，可能包含元空间 / 类卸载 | 老年代空间不足、晋升失败、元空间达到阈值、显式 `System.gc()`、并发回收失败等 | STW 更长，线上重点看触发原因和回收后内存是否下降 |

**触发时机展开**

1. **Minor GC / Young GC 什么时候触发？**
   - 大部分对象先分配到 Eden。
   - Eden 空间不够，新对象无法继续分配时，会触发 Young GC。
   - Young GC 后仍存活的对象会进入 Survivor，年龄增长；Survivor 放不下或年龄达到阈值时，会晋升到老年代。
2. **Major GC 什么时候触发？**
   - 通常和老年代使用率有关，例如老年代达到某个阈值后，收集器开始老年代回收。
   - 但 Major GC 这个词不够严格：有的资料把老年代 GC 叫 Major GC，有的会把 Full GC 也叫 Major GC。面试时最好主动说明口径，避免概念打架。
3. **Full GC 什么时候触发？**
   - 老年代空间不足，或者 Young GC 后对象晋升到老年代失败。
   - 大对象直接进入老年代，导致老年代很快被打满。
   - 元空间达到触发阈值，需要回收类元数据或卸载类。
   - 代码或第三方库显式调用 `System.gc()`。
   - CMS 出现 `Concurrent Mode Failure`，G1 出现回收跟不上、Humongous 对象分配失败等情况，也可能退化为 Full GC。

**三点总结**

1. Young GC 看新生代分配压力，常见原因是 Eden 不够。
2. Major GC 这个词要谨慎，最好解释为老年代 GC，并说明不同资料口径不同。
3. Full GC 是线上重点，关键不是只看次数，而是看触发原因、停顿时间、回收后老年代是否下降。

**面试表达**

> Minor GC 也叫 Young GC，主要回收新生代，通常在 Eden 空间不足、新对象分配失败时触发；Major GC 一般指老年代回收，但这个词在不同资料和收集器里口径不完全统一，所以我会先说明按老年代 GC 来理解；Full GC 通常会回收整个堆，可能还包含元空间和类卸载，常见触发原因包括老年代空间不足、对象晋升失败、大对象分配、元空间膨胀、显式 System.gc 或并发回收失败。线上排查时，我最关注 Full GC 的触发原因、停顿时间，以及 Full GC 后老年代是否明显下降。

### Q11.1：Full GC 也会 STW 吗？为什么通常更严重？

**一句话回答**

Full GC 通常也会 STW，而且一般比 Young GC 更严重，因为它往往要处理整个堆，甚至包含元空间；老年代对象存活率高，扫描、标记、整理和引用修正成本都更高。

| 对比项 | Young GC | Full GC |
| :--- | :--- | :--- |
| 回收范围 | 主要是新生代 | 通常是整个堆，可能包含元空间 |
| 对象特点 | 大多数朝生夕死 | 老年代对象存活率高 |
| 处理成本 | 复制少量存活对象 | 标记大量对象，可能还要整理和移动 |
| 停顿时间 | 通常较短 | 可能几百毫秒、几秒，严重时更久 |
| 线上影响 | RT 毛刺 | 请求超时、线程堆积、服务假死 |

Full GC 更重的原因：

1. **回收范围大**：可能涉及新生代、老年代、元空间、类卸载、引用处理等。
2. **老年代存活对象多**：需要扫描和标记的对象更多，引用链更复杂。
3. **可能做压缩整理**：为了解决内存碎片，对象可能被移动，引用地址也要修正。
4. **回收收益不确定**：如果是内存泄漏，Full GC 停很久也回收不了多少空间。

线上表现通常是：

```text
接口 RT 突然飙高
大量请求超时
线程池队列堆积
Dubbo / HTTP 调用超时
注册中心心跳异常
应用日志出现短暂空窗
```

**面试表达**

> Full GC 通常也会 STW，而且比 Young GC 更严重。Young GC 主要处理新生代，而 Full GC 往往要处理整个堆，甚至包含元空间；老年代对象存活率高，需要扫描和标记的对象更多，有些收集器还会做压缩整理和对象移动，所以停顿时间可能从几百毫秒到几秒甚至更久。线上频繁 Full GC 会导致接口超时、线程堆积、服务假死，是 JVM 调优里最需要重点关注的问题。

### Q12：CMS 和 G1 有什么区别？

**答案**

| 对比项 | CMS | G1 |
| :--- | :--- | :--- |
| 目标 | 低停顿老年代收集器 | 面向服务端大堆，追求可预测停顿 |
| 内存模型 | 新生代 + 老年代连续分区 | Region 化堆布局 |
| 主要算法 | 标记-清除 | 标记-整理 + 复制 |
| 碎片问题 | 有碎片，可能触发 Full GC | 通过 Region 回收和整理降低碎片 |
| 停顿控制 | 并发标记降低停顿 | `MaxGCPauseMillis` 目标停顿 |
| 状态 | 新版本已逐步废弃 | JDK 9 以后默认收集器 |

CMS 的核心问题是浮动垃圾和内存碎片；G1 将堆划分为多个 Region，优先回收收益高的 Region。

**面试表达**

> CMS 是老年代低停顿收集器，主要通过并发标记减少停顿，但基于标记清除，容易产生内存碎片。G1 把堆拆成多个 Region，不再固定连续的新生代和老年代，可以按回收收益优先选择 Region，并通过目标停顿时间控制回收节奏，更适合大内存服务。

### Q13：G1 为什么适合大内存服务？

**答案**

G1 的核心是 Region 化和可预测停顿。

G1 不把堆固定切成连续的新生代和老年代，而是拆成多个大小相等的 Region。每个 Region 可以扮演 Eden、Survivor、Old 或 Humongous 区。G1 会根据 Region 的垃圾比例和回收成本，优先回收收益最高的 Region。

关键点：

- Region 化管理，适合大堆。
- 通过 Remembered Set 处理跨 Region 引用。
- 可通过 `-XX:MaxGCPauseMillis` 设置目标停顿时间。
- Mixed GC 可以同时回收部分新生代和老年代 Region。
- 大对象会进入 Humongous Region。

**追问：G1 是否还有新生代和老年代？**

有。G1 仍然保留分代思想，逻辑上还是有 Eden、Survivor、Old；但它不再像 CMS / Parallel GC 那样把新生代和老年代划成物理连续的大块内存，而是把整个堆切成多个大小相等的 Region。

```text
传统分代：
[ 新生代连续区域 ][ 老年代连续区域 ]

G1：
[Region][Region][Region][Region][Region][Region]
   E       O       S       H       E       O
```

每个 Region 在某个时刻可以扮演不同角色：

| Region 类型 | 说明 |
| :--- | :--- |
| Eden Region | 新对象优先分配的区域 |
| Survivor Region | Young GC 后存活对象进入这里 |
| Old Region | 存活时间较长、晋升后的对象 |
| Humongous Region | 超大对象区域，通常用于超过 Region 一半大小的大对象 |

G1 仍然有 Young GC 和 Mixed GC：

| GC 类型 | 回收范围 | 说明 |
| :--- | :--- | :--- |
| Young GC | Eden + Survivor Region | 存活对象复制到 Survivor 或晋升到 Old Region |
| Mixed GC | 全部 Young Region + 部分 Old Region | 选择垃圾比例高、回收收益大的 Old Region 一起回收 |

所以，准确表达是：**G1 逻辑上仍然分代，但物理上不再是连续的新生代和老年代，而是由多个 Region 组成。**

**追问：Remembered Set 和 MaxGCPauseMillis 分别解决什么？**

G1 的 Region 化带来两个核心问题：

1. 回收某个 Region 时，怎么知道别的 Region 有没有引用它里面的对象？
2. 一次 GC 到底选多少 Region 回收，才能尽量不超过目标停顿时间？

`Remembered Set` 解决第一个问题，`MaxGCPauseMillis` 解决第二个问题。

**1. Remembered Set：解决跨 Region 引用**

G1 每次不一定回收整个堆，而是选择部分 Region 回收。假设这次只回收 Region B：

```text
Region A        Region B
对象 a  ----->  对象 b
```

如果 Region A 中的对象 `a` 引用了 Region B 中的对象 `b`，那么 `b` 仍然是存活对象，不能被回收。

问题是：如果每次回收 Region B 都要扫描整个堆，G1 的 Region 化收益就会大幅下降。

所以 G1 给每个 Region 维护一份 Remembered Set，可以理解为“外部引用登记表”。例如 Region B 的 Remembered Set 会记录：

```text
Region B
  Remembered Set:
    Region A 的某些 card 里有对象引用了 Region B
    Region C 的某些 card 里有对象引用了 Region B
```

这样回收 Region B 时，GC 不需要扫描整个堆，只需要扫描：

```text
Region B 自己
+
Region B 的 Remembered Set 记录的外部引用位置
```

Remembered Set 主要通过写屏障维护。比如执行：

```java
a.field = b;
```

如果 `a` 在 Region A，`b` 在 Region B，这就是一次跨 Region 引用。JVM 会在引用写入时通过写屏障记录这类关系，后续更新到目标 Region 的 Remembered Set 中。

**2. MaxGCPauseMillis：尽量控制单次 STW 停顿**

`-XX:MaxGCPauseMillis` 是 G1 的目标停顿时间参数。例如：

```bash
-XX:MaxGCPauseMillis=200
```

它的含义不是“每次 GC 一定不超过 200ms”，而是 JVM 会尽量把每次 STW 停顿控制在 200ms 左右。它是软目标，不是硬保证。

G1 会估算每个 Region 的回收成本和回收收益：

| 维度 | 含义 |
| :--- | :--- |
| 回收成本 | 回收这个 Region 预计要花多长时间 |
| 回收收益 | 回收这个 Region 大概能释放多少垃圾 |

然后在一次 GC 中选择一组 Region：

```text
在尽量不超过 MaxGCPauseMillis 目标的前提下，
优先选择垃圾多、收益高、成本可控的 Region。
```

这就是 Garbage First 的含义：优先回收最值得回收的垃圾区域。

示例：

| Region | 预计耗时 | 可回收垃圾 | G1 倾向 |
| :--- | :--- | :--- | :--- |
| Region A | 30ms | 500MB | 优先 |
| Region B | 20ms | 300MB | 优先 |
| Region C | 150ms | 50MB | 不优先 |

如果目标停顿是 200ms，G1 更可能优先选择 A、B，而不是选择耗时高但收益低的 C。

**面试表达**

> G1 适合大内存服务，是因为它把堆拆成 Region，按垃圾比例和回收收益优先回收，而不是每次处理连续大块内存。G1 逻辑上仍然有 Eden、Survivor、Old 的分代概念，但物理上不要求新生代和老年代连续。Young GC 回收年轻代 Region，Mixed GC 会在回收年轻代的同时选择部分垃圾比例高的 Old Region 一起回收。G1 通过 Remembered Set 记录其他 Region 对当前 Region 的引用，避免回收某个 Region 时扫描整个堆；通过 MaxGCPauseMillis 设定目标停顿时间，并根据每个 Region 的回收成本和收益选择回收集合。这个目标不是硬保证，但能让停顿更可预测。

### Q14：ZGC 的核心特点是什么？

**答案**

ZGC 是面向超低延迟和大内存场景的垃圾收集器。它的目标是将停顿时间控制在非常短的范围内，即使堆很大也尽量避免长时间 STW。

核心特点：

- 大部分 GC 工作并发执行。
- 使用染色指针和读屏障。
- 支持并发标记、并发转移、并发重定位。
- 适合低延迟、大堆服务。

**面试表达**

> ZGC 的核心目标是低延迟，大部分标记、转移、重定位工作都和应用线程并发执行，通过染色指针和读屏障降低 STW 时间。它适合大内存、低延迟服务，但吞吐、资源占用和版本成熟度也要结合业务场景评估。

---

## 6. OOM 类型与排查

### Q15：常见 OOM 类型有哪些？

**答案**

| OOM 类型 | 常见原因 | 排查重点 |
| :--- | :--- | :--- |
| `Java heap space` | 堆对象过多、大对象、缓存无界 | heap dump、MAT、对象引用链 |
| `GC overhead limit exceeded` | GC 频繁但回收很少 | GC 日志、堆趋势、泄漏对象 |
| `Metaspace` | 类加载过多、动态代理、热部署泄漏 | 类加载数量、ClassLoader 引用 |
| `Direct buffer memory` | NIO / Netty 堆外内存超限或泄漏 | direct memory、Netty allocator |
| `unable to create new native thread` | 线程数过多、栈内存过大、系统限制 | 线程数、`ulimit`、线程池配置 |

**面试表达**

> OOM 不能只理解成堆内存不足。堆 OOM 要看对象数量和引用链；Metaspace OOM 要看类加载和 ClassLoader 泄漏；Direct buffer memory 要看 NIO 或 Netty 堆外内存；unable to create new native thread 通常是线程数过多或系统资源限制。

### Q16：线上 OOM 怎么一步步定位？

**答案**

先保现场，不要一上来就重启。

常用命令：

```bash
jps -l
jstat -gcutil <pid> 1000 10
jmap -histo:live <pid> | head -50
jmap -dump:format=b,file=heap.hprof <pid>
```

排查步骤：

1. 看日志确认 OOM 类型。
2. 看 GC 情况：Full GC 是否频繁，Full GC 后内存是否下降。
3. 导出 heap dump。
4. 用 MAT / VisualVM 分析大对象、支配树、引用链。
5. 判断是缓存无界、集合未清理、ThreadLocal 未 remove、队列积压、批量查询过大，还是类加载 / 堆外内存问题。
6. 短期止血可以扩容、限流、重启、降级；长期要修复引用链和容量模型。

**面试表达**

> 线上 OOM 我会先保现场，确认具体 OOM 类型，再结合 GC 日志和 jstat 看内存是否持续上涨。堆 OOM 会导出 heap dump，用 MAT 看大对象和引用链，重点排查无界缓存、静态集合、ThreadLocal、线程池队列积压和一次性大批量加载。修复时不能只加内存，要找到对象为什么一直可达。

### Q16.1：MAT 怎么查看大对象和 GC Roots？能举真实案例吗？

**一句话回答**：MAT 排查 OOM 的核心是先用 Dominator Tree 找 Retained Heap 最大的对象，再用 Path to GC Roots 看它为什么还被引用。

**常用视图**

| MAT 功能 | 作用 | 排查重点 |
| :--- | :--- | :--- |
| Leak Suspects Report | 自动生成泄漏嫌疑报告 | 先快速看方向，但不能只信自动结论 |
| Histogram | 按类统计对象数量和内存 | 哪些类数量异常、`byte[]` / `char[]` / DTO 是否暴涨 |
| Dominator Tree | 按支配关系看内存占用 | 重点看 `Retained Heap` 最大的对象 |
| Path to GC Roots | 查看对象到 GC Roots 的引用链 | 判断是谁持有对象，为什么不能回收 |
| Retained Set | 查看某对象支配的一组对象 | 判断释放该对象能带走多少内存 |

**关键概念**

| 概念 | 含义 | 面试重点 |
| :--- | :--- | :--- |
| Shallow Heap | 对象自身占用内存 | 一个对象本体有多大 |
| Retained Heap | 如果该对象被回收，连带能释放的总内存 | OOM 排查更关注这个 |
| GC Roots | 可达性分析的起点 | 判断对象为什么还活着 |

MAT 实操步骤：

1. 打开 `heap.hprof`。
2. 先看 `Leak Suspects Report`，快速了解嫌疑对象。
3. 打开 `Dominator Tree`，按 `Retained Heap` 倒序看大对象。
4. 选中大对象，右键 `Path To GC Roots -> exclude weak/soft references`。
5. 看引用链来自哪里：`static`、`ThreadLocal`、线程栈、ClassLoader、JNI。
6. 判断是长期泄漏，还是一次性大对象导致瞬时 OOM。

**案例 1：静态 Map 缓存导致堆 OOM**

现象：

```text
java.lang.OutOfMemoryError: Java heap space
Full GC 后老年代下降不明显
```

MAT 里 `Dominator Tree` 看到：

```text
com.xxx.UserCache
  -> static ConcurrentHashMap
      -> Node[]
          -> 500w 个 UserDTO
```

`ConcurrentHashMap` 的 `Retained Heap` 很大。继续查看 `Path to GC Roots`：

```text
System Class
  -> com.xxx.UserCache
      -> static userMap
          -> ConcurrentHashMap
              -> UserDTO
```

对应代码通常类似：

```java
public class UserCache {
    private static final Map<Long, UserDTO> USER_MAP = new ConcurrentHashMap<>();

    public static void put(UserDTO user) {
        USER_MAP.put(user.getId(), user);
    }
}
```

结论：

- 对象不是“没人引用”，而是被类静态变量一直引用。
- 静态 Map 跟着 Class 生命周期走，Full GC 也回收不了里面的对象。
- 根因一般是本地缓存无容量上限、无过期时间、只 put 不 remove。

修复：

- 改成 Caffeine / Redis。
- 设置最大容量和过期时间。
- 缓存 key/value 做大小监控。
- 不把无限增长的数据结构放在静态变量里。

面试可以这样说：

> 我在 MAT 里先看 Dominator Tree，发现一个 `ConcurrentHashMap` 的 Retained Heap 非常大，再看 Path to GC Roots，发现它是被 `UserCache` 的 static 字段持有。说明这是静态缓存没有淘汰策略导致的泄漏，不是单纯堆太小。修复时要加容量上限、过期策略，或者改用 Caffeine/Redis。

**案例 2：ThreadLocal 没有 remove**

现象：

```text
堆内存持续上涨
Full GC 后下降不明显
线程池线程长期存活
```

MAT 中看到大量 `LoginUser`、`UserContext` 或业务上下文对象。查看 GC Roots：

```text
Thread
  -> threadLocals
      -> ThreadLocalMap
          -> Entry
              -> value: LoginUser
```

典型问题代码：

```java
private static final ThreadLocal<User> USER_CONTEXT = new ThreadLocal<>();

public void handle(Request request) {
    USER_CONTEXT.set(parseUser(request));
    doBusiness();
}
```

线程池线程不会请求结束就销毁，`ThreadLocalMap` 跟着线程长期存在。如果没有清理 value，业务对象就会一直从活跃线程可达。

正确写法：

```java
try {
    USER_CONTEXT.set(user);
    doBusiness();
} finally {
    USER_CONTEXT.remove();
}
```

面试可以这样说：

> 如果 MAT 里看到引用链是 `Thread -> threadLocals -> ThreadLocalMap -> Entry -> value`，就要怀疑线程池里的 ThreadLocal 没有 remove。因为线程池线程长期存活，value 会一直被线程引用，Full GC 也回收不了。

**案例 3：导出接口一次性查询大 List**

现象：

```text
某个导出接口请求后内存暴涨
偶发 OOM，但重启后不一定马上复现
```

MAT 里看到：

```text
java.util.ArrayList
  -> Object[]
      -> OrderExportDTO 几百万个
```

`Path to GC Roots` 可能是：

```text
http-nio-8080-exec-42
  -> OrderExportService.export()
      -> ArrayList result
```

典型问题代码：

```java
List<OrderExportDTO> list = orderMapper.selectAll(condition);
excelWriter.write(list);
```

结论：

- 这不一定是长期内存泄漏。
- 如果 GC Root 是请求线程栈，说明对象被当前正在执行的方法局部变量引用。
- 本质是一次性加载太多数据，瞬时大对象把堆打爆。

修复：

- 分页查询。
- 流式写 Excel。
- 限制导出条数。
- 大导出改异步任务。
- 文件生成后落 OSS / 文件服务器，再通知用户下载。

面试可以这样说：

> 如果大对象的 GC Root 是某个请求线程栈，我不会直接判断成内存泄漏，而会看是不是大查询、大导出或大文件处理。比如导出接口一次性查几百万行放进 List，就会造成瞬时 OOM。修复思路是分页、流式、异步和限流。

**MAT 排查口诀**

```text
Dominator Tree 看谁占得多
Retained Heap 看释放价值
Path to GC Roots 看谁还持有
static 多半是静态缓存
ThreadLocal 看是否 remove
Thread 栈多半是瞬时大对象
ClassLoader 看类加载器泄漏
```

**面试表达**

> MAT 不只是看哪个对象大，更关键是看这个对象为什么还活着。我会先看 Dominator Tree 找 Retained Heap 最大的对象，再看 Path to GC Roots。静态字段引用通常是缓存或单例持有，ThreadLocal 链路通常是线程池没清理，线程栈引用可能是大查询或大导出。判断清楚是长期泄漏还是瞬时大对象后，再决定是修引用链、加淘汰策略，还是改成分页流式处理。

### Q17：内存泄漏和内存溢出有什么区别？

**答案**

| 概念 | 含义 |
| :--- | :--- |
| 内存泄漏 | 对象已经不再需要，但仍被引用，无法被 GC 回收 |
| 内存溢出 | 可用内存不足，无法继续分配对象，最终抛 OOM |

内存泄漏可能最终导致内存溢出，但内存溢出不一定都是泄漏，也可能是瞬时流量、大对象、批处理或配置太小。

**面试表达**

> 内存泄漏是对象不该活着但还被引用，内存溢出是内存不够用了。泄漏可能最终导致 OOM，但 OOM 不一定都是泄漏，也可能是导入导出一次性加载过多数据、线程池队列堆积、大对象直接进入老年代，或者 JVM 参数配置不合理。

---

## 7. CPU 100%、死锁、接口超时与 Full GC 排查

### Q18：线上 CPU 100% 怎么定位？

**答案**

常用流程：

```bash
top
top -Hp <pid>
printf "%x\n" <tid>
jstack <pid> > jstack.log
```

步骤：

1. `top` 找到 CPU 高的 Java 进程。
2. `top -Hp <pid>` 找到进程中 CPU 高的线程。
3. 将线程 ID 转成 16 进制。
4. 在 `jstack` 中搜索 `nid=0x...`。
5. 看线程栈是在业务死循环、正则、JSON 序列化、锁竞争、频繁 GC，还是 JNI / 系统调用。

Arthas：

```bash
thread -n 5
```

可以直接查看最忙的几个线程。

**面试表达**

> CPU 100% 我会先定位进程，再定位线程。用 top 找 Java 进程，用 top -Hp 找高 CPU 线程，把线程 ID 转成 16 进制后去 jstack 里找 nid，看它具体卡在哪段代码。如果是 GC 线程高，要继续看 GC 日志；如果是业务线程高，要看是不是死循环、复杂计算、锁竞争或热点方法。

### Q19：死锁怎么定位？

**答案**

使用：

```bash
jstack <pid> > jstack.log
```

如果是 Java 级别死锁，`jstack` 通常会输出：

```text
Found one Java-level deadlock
```

重点看：

- 哪些线程互相等待。
- 每个线程持有哪些锁。
- 每个线程又在等待哪些锁。
- 代码里是否存在锁顺序不一致。

**面试表达**

> 死锁排查优先看 jstack。Java 级别死锁通常会直接提示 Found one Java-level deadlock。然后看线程 A 持有什么锁、等待什么锁，线程 B 是否反过来持有 B 锁等待 A 锁。解决一般是统一加锁顺序、减少锁嵌套、使用 tryLock 超时退出，或缩小锁粒度。

### Q20：接口突然超时，怎么判断是不是 JVM 问题？

**答案**

先分层排查：

```text
客户端 -> 网关/Nginx -> 应用线程池 -> JVM/GC -> DB/Redis/MQ/RPC
```

判断 JVM 方向的信号：

- 同一实例所有接口都慢。
- 监控显示 JVM GC 次数或停顿时间异常。
- `jstat` 看到 Full GC 频繁。
- 线程池活跃线程满、队列堆积。
- `jstack` 大量线程处于 `BLOCKED`、`WAITING`、等待连接池或等待锁。

常用命令：

```bash
jstat -gcutil <pid> 1000 10
jstack <pid> > jstack.log
```

**面试表达**

> 接口超时我不会只盯接口代码，而是先按链路分层。若所有接口都慢，优先看机器资源、GC、线程池、连接池和下游依赖；如果只有单接口慢，再看慢 SQL、RPC、Redis 或业务锁。判断是不是 JVM 问题，重点看 GC 停顿、线程池是否耗尽、jstack 是否大量阻塞，以及 Full GC 后内存是否下降。

### Q21：频繁 Full GC 怎么排查？

**答案**

排查步骤：

1. 看 GC 日志，确认 Full GC 触发原因。
2. 看 Full GC 后老年代使用率是否明显下降。
3. 如果下降明显，可能是瞬时大对象、晋升过快或堆参数不合理。
4. 如果下降不明显，重点怀疑内存泄漏。
5. 导出 heap dump，分析大对象、引用链和 GC Roots。
6. 看是否有 `System.gc()`、元空间压力、直接内存压力。

常见原因：

| 原因 | 现象 |
| :--- | :--- |
| 大对象 | 老年代快速上涨 |
| 晋升过快 | 新生代太小或对象存活时间较长 |
| 内存泄漏 | Full GC 后老年代降不下来 |
| 元空间膨胀 | 类加载数量持续增长 |
| 显式 GC | 日志中可见 `System.gc()` 相关触发 |

**面试表达**

> 频繁 Full GC 要先看 Full GC 后内存是否能降下来。如果能降，可能是瞬时大对象、晋升过快或参数不合理；如果降不下来，基本要怀疑内存泄漏。接着通过 GC 日志、jstat 和 heap dump 找到大对象和引用链，而不是简单把堆调大。

---

## 8. JVM 参数、GC 日志与工具

### Q22：常见 JVM 参数有哪些？

**答案**

| 参数 | 作用 |
| :--- | :--- |
| `-Xms` | 初始堆大小 |
| `-Xmx` | 最大堆大小 |
| `-Xss` | 每个线程栈大小 |
| `-XX:MetaspaceSize` | 元空间初始触发 GC 阈值 |
| `-XX:MaxMetaspaceSize` | 最大元空间 |
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时自动 dump |
| `-XX:HeapDumpPath` | dump 文件路径 |
| `-XX:+UseG1GC` | 使用 G1 收集器 |
| `-XX:MaxGCPauseMillis` | G1 目标停顿时间 |
| `-Xlog:gc*` | JDK 9+ GC 日志配置 |

生产建议：

- `-Xms` 和 `-Xmx` 通常设置一致，避免运行时扩缩容抖动。
- 开启 OOM 自动 dump，但要保证磁盘空间和路径可写。
- GC 日志要滚动，避免日志文件过大。

**面试表达**

> 常见 JVM 参数主要分堆、栈、元空间、GC 收集器和诊断参数。生产上我会关注 Xms、Xmx、Xss、Metaspace、GC 日志和 OOM 自动 dump。一般服务会把 Xms 和 Xmx 设置一致，减少堆动态调整带来的抖动。

### Q23：jps、jstack、jmap、jstat 分别用来干什么？

**答案**

| 工具 | 作用 | 常见场景 |
| :--- | :--- | :--- |
| `jps` | 查看 Java 进程 | 找 PID |
| `jstack` | 导出线程栈 | CPU 高、死锁、线程阻塞 |
| `jmap` | 查看堆对象 / dump 堆 | OOM、内存泄漏 |
| `jstat` | 查看 GC 指标 | GC 频率、堆使用趋势 |
| MAT | 分析 heap dump | 大对象、引用链、泄漏嫌疑 |
| Arthas | 在线诊断 | thread、dashboard、trace、watch、heapdump |
| JFR | 低开销运行时事件记录 | 生产问题复盘、性能分析 |

**面试表达**

> JVM 排查工具要按问题选。找进程用 jps，CPU 高和死锁用 jstack，GC 趋势用 jstat，内存泄漏用 jmap dump 后结合 MAT 分析。生产上如果可以用 Arthas，会更方便地看最忙线程、方法耗时、参数返回值和生成 heap dump。

### Q24：GC 日志重点看什么？

**答案**

重点看：

1. GC 类型：Young GC、Mixed GC、Full GC。
2. 触发原因：Allocation Failure、Metadata GC Threshold、Humongous Allocation 等。
3. GC 前后内存变化。
4. 停顿时间。
5. Full GC 是否频繁。
6. 老年代 / 元空间是否持续上涨。
7. G1 下是否有 Humongous 对象、Mixed GC 是否有效。

**面试表达**

> GC 日志不是只看有没有 Full GC，而是看触发原因、回收前后内存变化和停顿时间。如果 Full GC 后老年代明显下降，可能是瞬时压力；如果下降不明显，要怀疑泄漏。G1 还要关注 Humongous 对象和 Mixed GC 回收效果。

---

## 9. 大厂 JVM 高频连环追问

### Q25：为什么不建议随便调用 System.gc()？

**答案**

`System.gc()` 只是建议 JVM 执行 GC，不保证一定执行。但在很多配置下，它可能触发 Full GC，造成明显 STW 停顿。

生产中不建议业务代码主动调用。若第三方库调用导致问题，可以考虑：

```text
-XX:+DisableExplicitGC
```

但要确认是否影响依赖显式 GC 做资源回收的组件。

**面试表达**

> System.gc 只是建议 JVM 回收，但可能触发 Full GC，导致长时间 STW。业务代码不应该依赖它释放资源，资源释放应该通过 close、池化管理和生命周期管理完成。生产如果被第三方库影响，可以评估 DisableExplicitGC。

### Q26：什么对象会进入老年代？

**答案**

常见情况：

- 新生代对象多次 GC 后仍存活，年龄达到阈值。
- 大对象直接分配到老年代。
- 动态年龄判断导致部分对象提前晋升。
- Survivor 空间不足，对象提前进入老年代。

**面试表达**

> 对象进入老年代不只是年龄到了。大对象可能直接进老年代，Survivor 放不下也会提前晋升，动态年龄判断也可能让一批对象提前进入老年代。频繁老年代增长要结合对象大小、存活时间和新生代参数一起看。

### Q27：为什么线程太多也会 OOM？

**答案**

每个线程都需要自己的栈空间，线程创建还会消耗 native 内存和操作系统资源。线程太多时可能出现：

```text
unable to create new native thread
```

常见原因：

- 线程池最大线程数设置过大。
- 使用 `newCachedThreadPool` 导致线程无限增长。
- 任务阻塞导致线程无法释放。
- `-Xss` 设置过大。
- 系统 `ulimit` 或容器限制太小。

**面试表达**

> 线程太多不一定表现为堆 OOM，而可能是无法创建 native thread。每个线程都有栈空间和系统资源开销，线程池配置过大、任务阻塞、Xss 过大或系统线程数限制都可能导致这个问题。

### Q28：大对象为什么危险？

**答案**

大对象可能带来：

- 直接进入老年代，增加 Full GC 压力。
- 复制和整理成本高。
- 容易造成内存碎片。
- 在 G1 中可能成为 Humongous 对象，影响回收节奏。

常见大对象来源：

- 一次性查询大量数据。
- 大 Excel 导入导出。
- 大 JSON / 大字符串。
- 无限制文件读取到内存。
- MQ 或线程池队列积压大量任务对象。

**面试表达**

> 大对象危险在于它可能直接进入老年代，回收和整理成本高，也容易触发 Full GC。业务上常见原因是一次性查太多数据、大文件导入导出、大 JSON 或队列积压。解决思路是分页、流式处理、限制批大小和异步化。

### Q29：线上 JVM 问题排查时，为什么要先保现场？

**答案**

因为重启会丢失关键证据：

- 线程栈没了。
- 堆现场没了。
- GC 状态被重置。
- 临时热点线程消失。
- 复现成本可能很高。

建议先采集：

```bash
top
free -m
jps -l
jstack <pid> > jstack.log
jstat -gcutil <pid> 1000 10
jmap -histo:live <pid> > histo.log
```

如果确认 OOM 或泄漏，再导出 heap dump。

**面试表达**

> 线上 JVM 问题不要一上来就重启，除非已经影响核心业务且有止血预案。重启会丢失线程栈、堆、GC 状态等现场。我会先保留 jstack、jstat、对象直方图、必要时 heap dump，再根据影响面决定扩容、摘流、重启或降级。

---

## 10. JVM 回答模板

### 模板 1：解释 JVM 原理题

```text
先定义概念 -> 再讲 JVM 怎么做 -> 再讲为什么这么设计 -> 最后补线上影响。
```

例如回答 G1：

> G1 是面向服务端大堆的垃圾收集器，它把堆拆成多个 Region，通过收益优先选择回收目标，并用 MaxGCPauseMillis 尽量控制停顿。它不是完全无停顿，而是把回收粒度拆小，让停顿更可控。线上如果 G1 频繁 Full GC，我会看 Humongous 对象、Mixed GC 效果、老年代增长和 GC 日志触发原因。

### 模板 2：解释线上排障题

```text
先保现场 -> 分层定位 -> 用命令找证据 -> 判断根因 -> 短期止血 -> 长期修复。
```

例如回答 OOM：

> 我会先确认 OOM 类型并保留现场，用 jstat 看 GC 趋势，用 jmap 或 Arthas dump 堆，再用 MAT 看大对象和引用链。短期可以摘流、扩容、重启止血，长期要修复无界缓存、ThreadLocal 未清理、批量加载过大或队列积压等根因。

### 模板 3：不要这样答

| 问题 | 不推荐回答 | 更好的回答 |
| :--- | :--- | :--- |
| CPU 高怎么办 | 重启 | 先 `top -Hp` 找线程，再 `jstack` 定位代码栈 |
| OOM 怎么办 | 加内存 | 先确认 OOM 类型和引用链，再决定扩容或修代码 |
| G1 优点 | 没有停顿 | 停顿更可控，不是没有 STW |
| Full GC 原因 | 内存不够 | 要区分大对象、晋升过快、泄漏、元空间、显式 GC |
| 双亲委派作用 | 防止重复加载 | 还要讲核心类安全和类型一致性 |

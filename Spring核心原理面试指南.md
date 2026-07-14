# Spring 核心原理与大厂高频面试指南

本指南面向中高级 Java 岗位面试，系统整理了 Spring 框架的核心高频问题。内容涵盖 IoC/Bean 生命周期、三级缓存与循环依赖、AOP 核心机制与失效规避、Spring 事务（Propagation/Isolation）及 12 种失效场景、Spring Boot 自动装配原理（含 Starter 编写）、Spring Boot 启动流程以及 Spring MVC 的核心工作流程。

---

## 1. Spring IoC 与 Bean 生命周期深度剖析

### 1.1. IoC（控制反转）与 DI（依赖注入）的关系
* **IoC（Inversion of Control，控制反转）**：是一种**设计思想**。原本程序中对象的创建、销毁和依赖关系管理都由程序员手动通过 `new` 来控制，控制反转后，这些控制权全部交给 Spring IoC 容器。对象的生命周期由容器管理，程序不再负责具体对象的创建。
* **DI（Dependency Injection，依赖注入）**：是实现 IoC 的**具体技术手段**。即在容器运行期间，动态地将某种依赖关系注入到对象之中（如通过 Setter 方法或构造器注入）。

### 1.2. Bean 作用域（Scopes）
Spring 容器中的 Bean 支持以下 5 种主要作用域：
1. **singleton（单例）**：**默认作用域**。整个 IoC 容器中只存在一个 Bean 实例，所有请求都共享该实例。
2. **prototype（多例）**：每次获取（如调用 `getBean()`）都会创建一个全新的 Bean 实例。
3. **request**：针对 Web 应用，每次 HTTP 请求都会创建一个新的 Bean 实例，请求结束后销毁。
4. **session**：针对 Web 应用，每个 HTTP Session 会话共享一个 Bean 实例。
5. **application**：针对 Web 应用，整个 ServletContext 上下文共享一个 Bean 实例。

> [!WARNING]
> **单例 Bean 的线程安全问题**：
> Spring 容器中的单例 Bean **并不是线程安全的**。如果 Bean 内部定义了可变的成员变量（有状态 Bean，如全局计数器），在并发访问下会出现线程安全问题。
> **最佳实践**：尽量将单例 Bean 设计为无状态 Bean（只包含业务逻辑，无成员变量，或成员变量是只读的/线程安全的 Bean）。若必须有状态，可使用 `ThreadLocal` 隔离线程变量，或将作用域改为 `prototype`。

---

### 1.3. BeanFactory 和 FactoryBean 的概念和差异

一句话区分：

```text
BeanFactory 是 Spring 容器本身，负责管理 Bean；
FactoryBean 是容器里的一个特殊 Bean，负责自定义某个 Bean 的创建逻辑。
```

| 对比项 | BeanFactory | FactoryBean |
| :--- | :--- | :--- |
| 本质 | Spring IoC 容器的顶层接口 | 一个特殊的 Bean 接口 |
| 角色 | 管理 Bean 的工厂 | 生产 Bean 的 Bean |
| 作用 | 创建、装配、管理 Bean 生命周期 | 自定义复杂对象的创建过程 |
| 常见实现/子接口 | `ApplicationContext` | `SqlSessionFactoryBean`、`ProxyFactoryBean` |
| 获取方式 | `beanFactory.getBean("xxx")` | `getBean("xxx")` 返回的是 `getObject()` 生成的对象 |
| 获取 FactoryBean 本身 | 不涉及 | `getBean("&xxx")` |

`FactoryBean` 通常有三个核心方法：

```java
public interface FactoryBean<T> {
    T getObject() throws Exception;      // 返回真正要放进容器的对象
    Class<?> getObjectType();            // 返回对象类型
    boolean isSingleton();               // 是否单例
}
```

例如定义了一个 `UserFactoryBean`：

```java
@Component("user")
public class UserFactoryBean implements FactoryBean<User> {
    @Override
    public User getObject() {
        return new User();
    }

    @Override
    public Class<?> getObjectType() {
        return User.class;
    }
}
```

那么：

```java
context.getBean("user");
```

拿到的是 `UserFactoryBean#getObject()` 返回的 `User` 对象。

如果想拿 `UserFactoryBean` 本身，要加 `&`：

```java
context.getBean("&user");
```

**三点总结**

1. `BeanFactory` 是容器接口，负责管理 Bean 的创建、依赖注入和生命周期。
2. `FactoryBean` 是特殊 Bean，负责把复杂对象的创建过程封装起来。
3. `getBean("xxx")` 默认拿到的是 `FactoryBean#getObject()` 返回的对象；`getBean("&xxx")` 才是拿 `FactoryBean` 本身。

**面试表达**：
> BeanFactory 是 Spring IoC 容器的顶层接口，负责 Bean 的创建、依赖注入和生命周期管理，可以理解为“管理 Bean 的工厂”。FactoryBean 是 Spring 提供的一个特殊 Bean 接口，它本身也是 Bean，但它的作用是自定义复杂 Bean 的创建逻辑。普通情况下通过 `getBean("xxx")` 获取到的是 `FactoryBean#getObject()` 返回的对象，而不是 FactoryBean 本身；如果要获取 FactoryBean 本身，需要使用 `&xxx`。典型例子是 MyBatis 的 `SqlSessionFactoryBean`。

---

### 1.4. Bean 生命周期的四大核心阶段与执行顺序
Spring 容器在初始化 Bean 时，其生命周期的完整执行流程如下：

```text
  1. 实例化 (Instantiation) → 2. 属性赋值 (Populate Properties)
                                     ↓
  4. 销毁 (Destruction)    ← 3. 初始化 (Initialization)
```

#### 详细执行步骤：
1. **实例化（Instantiation）**：
   * JVM 根据 BeanDefinition 通过反射调用构造方法，在内存中创建 Bean 实例。此时对象仅是个“空壳”（半成品）。
2. **属性赋值（Populate Properties）**：
   * 容器解析 Bean 的依赖关系，执行依赖注入（如 `@Autowired`、`@Value` 或 XML 中的 `<property>`），为属性赋值。
3. **初始化阶段（Initialization）**：
   * **Aware 接口回调**：如果 Bean 实现了各类 Aware 接口，会依次注入相关组件：
     * `BeanNameAware`（注入 Bean 的名称）
     * `BeanFactoryAware`（注入当前的 BeanFactory 容器引用）
     * `ApplicationContextAware`（注入当前的 ApplicationContext 上下文引用）
   * **BeanPostProcessor 前置处理器**：执行所有已注册的 `BeanPostProcessor.postProcessBeforeInitialization()` 方法。
   * **生命周期初始化回调**：
     * 执行标注了 `@PostConstruct` 注解的方法。
     * 如果实现了 `InitializingBean` 接口，执行 `afterPropertiesSet()` 方法。
     * 执行 XML 中配置的自定义 `init-method` 方法。
   * **BeanPostProcessor 后置处理器**：执行所有已注册的 `BeanPostProcessor.postProcessAfterInitialization()` 方法。**（AOP 代理对象在此处生成）**
4. **使用阶段**：
   * Bean 已经完全初始化完毕，应用程序可以正常调用该 Bean。
5. **销毁阶段（Destruction）**：
   * 当容器关闭时，触发销毁流程：
     * 执行标注了 `@PreDestroy` 注解的方法。
     * 如果实现了 `DisposableBean` 接口，执行 `destroy()` 方法。
     * 执行 XML 中配置的自定义 `destroy-method` 方法。

---

### 1.5. 经典避坑：单例 Bean 注入多例 Bean 失效问题
* **场景**：单例 Bean `OrderService` 中使用 `@Autowired` 注入多例 Bean `PrototypeHelper`。由于 `OrderService` 只会被初始化一次，其依赖的 `PrototypeHelper` 也只会在 `OrderService` 创建时被注入一次。后续每次调用 `OrderService` 时，访问的 `PrototypeHelper` 都是同一个实例，**多例属性直接失效**。
* **解决方案**：
  1. **使用 `@Lookup` 注解（推荐，优雅）**：
     在单例 Bean 中声明一个抽象方法，标注 `@Lookup`，Spring 会动态生成字节码重写该方法，每次调用时自动去容器中获取最新实例。
     ```java
     @Component
     public class OrderService {
         public void process() {
             PrototypeHelper helper = getHelper(); // 每次调用都会获取全新实例
             helper.doSomething();
         }
         @Lookup
         protected PrototypeHelper getHelper() {
             return null; // Spring 会重写此方法
         }
     }
     ```
  2. **使用 `ObjectFactory` 或 `Provider`**：
     ```java
     @Autowired
     private ObjectFactory<PrototypeHelper> helperFactory;
     public void process() {
         PrototypeHelper helper = helperFactory.getObject(); // 动态获取
     }
     ```
     `ObjectFactory` 注入的不是 `PrototypeHelper` 实例本身，而是一个延迟获取对象的工厂。每次调用 `getObject()` 时，都会重新向 Spring 容器请求目标 Bean。

     它的接口非常简单：

     ```java
     public interface ObjectFactory<T> {
         T getObject() throws BeansException;
     }
     ```

     核心作用不是自己 `new` 对象，而是把“从容器获取目标 Bean”这个动作延迟到真正使用时。

     但是否每次都是新对象，仍然取决于目标 Bean 的作用域：

     | 目标 Bean 作用域 | `helperFactory.getObject()` 结果 |
     | :--- | :--- |
     | `singleton` | 每次返回同一个对象 |
     | `prototype` | 每次创建并返回一个新对象 |
     | `request` | 同一次 HTTP 请求内同一个对象，不同请求不同对象 |

     所以 `ObjectFactory` 解决的是“单例 Bean 初始化时就把多例 Bean 固定住”的问题。它把获取动作延迟到业务方法执行时；只要目标 Bean 是 `prototype`，每次 `getObject()` 就能拿到新实例。

     与 `ApplicationContextAware + getBean()` 相比，`ObjectFactory` 的依赖更小，不需要把整个 Spring 容器暴露给业务类，代码耦合更低。`ObjectProvider` 可以看作 `ObjectFactory` 的增强版，额外支持可选获取、懒加载、遍历等能力。

     | 获取方式 | 特点 |
     | :--- | :--- |
     | `ApplicationContext.getBean()` | 能力最全，但业务类直接依赖 Spring 容器，侵入性较强 |
     | `ObjectFactory.getObject()` | 只暴露获取目标对象的能力，适合按需获取 Bean |
     | `ObjectProvider` | `ObjectFactory` 增强版，支持 `getIfAvailable()`、`getIfUnique()`、`stream()` 等 |
  3. **通过实现 `ApplicationContextAware` 手动 `getBean`**（代码侵入性较高，不推荐）。

**面试表达**：
> ObjectFactory 常用于解决单例 Bean 依赖多例 Bean 时，多例对象只在单例初始化阶段注入一次的问题。Spring 注入的是一个对象工厂，不是目标对象本身；每次调用 `getObject()` 时才去容器里获取 Bean。如果目标 Bean 是 prototype，每次都会创建新实例；如果目标 Bean 是 singleton，每次仍然返回同一个实例。相比 ApplicationContextAware 手动 getBean，ObjectFactory 只暴露获取目标对象的能力，对 Spring 容器的耦合更低。

---

## 2. Spring 循环依赖解决机制（三级缓存）

### 2.1. 什么是循环依赖？
循环依赖是指两个或多个 Bean 之间互相持有对方的引用。例如：
`AService` 依赖 `BService`，而 `BService` 同时依赖 `AService`。

---

### 2.2. Spring 三级缓存的定义与分工
Spring 内部通过 `DefaultSingletonBeanRegistry` 类中的三张 Map（即三级缓存）来打破这种死锁状态：

| 缓存级别 | 变量名称 | 存储内容 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **第一级缓存** | `singletonObjects` | 完全初始化好的、可直接使用的 Bean 单例。 | 外部获取 Bean 的主单例池。 |
| **第二级缓存** | `earlySingletonObjects` | **半成品**的早期 Bean（已实例化，但属性未填充、未初始化）。 | 解决循环依赖中的代理对象和原始对象的**单例唯一性**。 |
| **第三级缓存** | `singletonFactories` | 单例工厂对象 `ObjectFactory<?>`（其实是一个 lambda 表达式包装的回调）。 | 发生循环依赖时，**提前触发 AOP 代理对象的创建**。 |

#### 追问：一级缓存 `singletonObjects` 存的是原始对象还是代理对象？
一级缓存存的是**完全初始化完成、最终对外暴露的单例 Bean**，但这个最终对象不一定都是代理对象，要分情况：

| 场景 | 一级缓存最终存放内容 | 说明 |
| :--- | :--- | :--- |
| 普通 Bean，没有 AOP | 原始对象 | 不需要事务、切面等增强，最终对外暴露的就是原始 Bean |
| 有 AOP 代理，如事务、切面 | 代理对象 | Spring 对外暴露的是增强后的 Bean，否则事务、切面等功能会失效 |
| 循环依赖 + AOP | 最终代理对象 | 代理对象可能先通过三级缓存提前生成并进入二级缓存，Bean 完成初始化后再进入一级缓存 |

可以这样记：

```text
一级缓存 singletonObjects：成品对象，最终对外暴露；可能是原始对象，也可能是代理对象
二级缓存 earlySingletonObjects：早期引用，循环依赖场景使用；可能是原始对象，也可能是提前代理对象
三级缓存 singletonFactories：ObjectFactory，按需生成早期引用/提前代理对象
```

**面试表达**：
> Spring 一级缓存 `singletonObjects` 存的是完全初始化完成、最终对外暴露的单例 Bean。如果这个 Bean 不需要 AOP，那就是原始对象；如果需要 AOP，比如事务代理，那一级缓存里最终存的就是代理对象。二级缓存存的是循环依赖场景下提前暴露的早期引用，可能是原始对象，也可能是提前创建的代理对象；三级缓存存的是 `ObjectFactory`，用来延迟决定是否创建代理。

---

### 2.3. 三级缓存解决循环依赖的底层流程
以 A、B 互相循环依赖且需要进行 AOP 代理增强为例：

```text
  1. A 实例化 (半成品) ── 放入三级缓存 ──> 2. 注入 B ──> 创建 B
                                                          │
  4. A 移入二级缓存，B 完成创建 <── B 注入 A (从三级获取代理) <──┘
```

1. **创建 A**：
   * A 开始创建，首先调用构造器完成**实例化**（得到原始半成品 A）。
   * A 将自己包装的 `ObjectFactory` 放入**第三级缓存** `singletonFactories` 中。
   * A 开始执行**属性赋值**，发现自己依赖 B，于是触发对 B 的加载。
2. **创建 B**：
   * B 开始创建，同样完成实例化后，将包装的 `ObjectFactory` 放入**第三级缓存**。
   * B 执行属性赋值，发现依赖 A，触发对 A 的加载。
3. **B 注入 A**：
   * B 去容器中寻找 A，依次查询一级、二级、三级缓存。
   * 在**第三级缓存**中找到 A 的 `ObjectFactory`。调用其 `getObject()` 方法，生成 A 的**早期代理对象（AOP 代理）**。
   * A 的早期代理对象被放入**第二级缓存** `earlySingletonObjects` 中，并从第三级缓存中移除。
   * B 成功获取到 A 的早期代理对象并完成注入。
4. **完成 B 与 A 的初始化**：
   * B 继续完成后续属性赋值和初始化，放入**第一级缓存** `singletonObjects`。
   * B 返回，A 拿到 B 的实例，完成属性注入。
   * A 继续后续初始化（由于 A 已经提前创建了 AOP 代理，在初始化后置处理器中不再重复创建，直接返回二级缓存中的 AOP 代理对象）。
   * A 放入**第一级缓存**。循环依赖圆满解决。

---

### 2.4. 核心追问

#### 追问 1：为什么不能只用两级缓存？必须引入第三级缓存？
* **答案**：如果**不使用 AOP**，二级缓存完全足够解决循环依赖。但如果要支持 **AOP（或者其他代理生成）**，就必须引入第三级缓存。
* **原因剖析**：
  * Spring 的设计原则是：**AOP 代理对象的创建应当发生在 Bean 初始化完成后的正常生命周期中（即由 `BeanPostProcessor.postProcessAfterInitialization` 执行）**。
  * 如果没有第三级缓存，直接将实例化后的原始对象放入第二级缓存，那么当存在 AOP 且发生循环依赖时，B 从二级缓存中只能拿到 A 的**原始对象**，而不是 AOP 代理对象，这会导致依赖注入发生类型或行为错误。
  * 如果为了解决这个问题，在实例化后立刻无条件为所有 Bean 创建 AOP 代理放入二级缓存，那么即使没有循环依赖，所有的 Bean 也会在属性注入前提前生成 AOP 代理，这**严重违背了 Spring 正常的生命周期设计规范**。
  * **第三级缓存 `singletonFactories` 的核心作用就是延迟创建 AOP 代理**。在正常的生命周期下，三级缓存中的 `ObjectFactory` 根本不会被调用，代理依然在初始化后创建。只有当**真正发生循环依赖**时，B 才会去触发三级缓存，提前为 A 创建 AOP 代理并转移到二级缓存，完美地做到了“只有按需才提前创建代理”。

#### 追问 2：哪些情况下的循环依赖是 Spring 无法解决的？
1. **构造器注入的循环依赖**：
   * **原因**：构造器是 Bean 实例化的第一步，而暴露三级缓存发生在实例化**之后**。如果 A 和 B 在构造器中互相引用，A 还在实例化阶段就去获取 B，此时 A 甚至还没有被创建出来，更无法向三级缓存注册自己，因此直接报错 `BeanCurrentlyInCreationException`。
   * **解决方案**：改为 Setter 注入，或在构造器依赖的参数上标注 `@Lazy` 注解（Spring 会为该参数生成一个懒加载代理，推迟其实际创建时机）。
2. **`prototype` 作用域 Bean 的循环依赖**：
   * **原因**：Spring 不会对多例（Prototype）Bean 进行缓存管理，每次获取都是全新创建，所以无法使用三级缓存机制，直接报错。

---

## 3. Spring AOP 核心机制与代理选择

### 3.1. AOP 核心概念速览
* **Aspect（切面）**：切面是关注点的模块化（如日志、事务、安全检查），它将横切关注点与业务逻辑解耦。
* **JoinPoint（连接点）**：程序执行过程中的某个特定点（如方法的调用、异常的抛出）。在 Spring AOP 中，连接点只支持**方法执行**。
* **Pointcut（切点）**：匹配连接点的表达式。定义了切面要在哪些方法上织入增强。
* **Advice（通知/增强）**：在切点匹配的连接点上执行的具体动作。包括 `Before`（前置通知）、`After`（后置通知）、`Around`（环绕通知）、`AfterReturning`（返回通知）、`AfterThrowing`（异常通知）。
* **Target（目标对象）**：被代理的原始业务对象。
* **Weaving（织入）**：将切面应用到目标对象并创建代理对象的过程。Spring AOP 是在**运行期**通过动态代理技术完成织入的。

---

### 3.2. Spring AOP 代理选择机制
Spring AOP 的底层实现基于动态代理，它在运行时会根据目标对象的类型自动选择代理方式：

```text
                  [ 目标对象是否实现了接口? ]
                       /           \
                     是             否
                     /               \
        [ 使用 JDK 动态代理 ]     [ 使用 CGLIB 动态代理 ]
```

* **JDK 动态代理**：如果目标对象实现了至少一个接口，Spring 默认使用 JDK 动态代理。生成代理类 `$ProxyXX`，该类实现与目标对象相同的接口。
* **CGLIB 动态代理**：如果目标对象没有实现任何接口，Spring 会使用 CGLIB。CGLIB 是一个强大的高性能代码生成包，它在运行期通过修改字节码（ASM 框架）生成目标类的**子类**作为代理。
* **强制指定 CGLIB**：通过 `@EnableAspectJAutoProxy(proxyTargetClass = true)`，可以强制 Spring 统一采用 CGLIB 代理。

---

### 3.3. AOP 自调用失效问题及 bypass 方案
* **场景描述**：同一个类中，`methodA()`（无事务/无 AOP 增强）内部调用了 `methodB()`（带有 `@Transactional` 或其他 AOP 注解）。当外部客户端调用 `methodA()` 时，`methodB()` 的切面增强**直接失效**。
* **失效根本原因**：
  * AOP 是基于**代理对象**工作的。外部调用 `methodA()` 时，走的是代理对象。
  * 但是，`methodA()` 内部调用 `methodB()` 实际上等价于 `this.methodB()`，这里的 `this` 是目标原始对象，而不是代理对象。由于没有走代理，切面逻辑（如拦截器 `TransactionInterceptor`）根本无法触发。
* **规避解决方案**：
  1. **注入自身代理（Spring 推荐）**：
     通过 `@Autowired` 配合 `@Lazy`（防止自身循环依赖报错）在类内部注入自身，然后通过注入的代理对象调用 `methodB()`。
     ```java
     @Service
     public class OrderService {
         @Autowired
         @Lazy
         private OrderService self; // 注入自身的代理对象

         public void methodA() {
             self.methodB(); // 通过代理调用，AOP 正常生效
         }

         @Transactional
         public void methodB() {
             // 事务逻辑
         }
     }
     ```
  2. **使用 `AopContext.currentProxy()`**：
     * **配置开启**：必须在配置类上手动开启暴露代理：`@EnableAspectJAutoProxy(exposeProxy = true)`。
     * **代码调用**：
       ```java
       public void methodA() {
           ((OrderService) AopContext.currentProxy()).methodB(); // 获取当前线程的代理对象
       }
       ```
  3. **重构代码（架构设计推荐）**：
     将 `methodB()` 的逻辑拆分到另一个独立的 Service 类中，由外部正常注入并调用。

---

## 4. Spring 事务管理与失效场景深挖

### 4.1. Spring 事务传播行为（Propagation）
事务传播行为定义了当一个事务方法被另一个事务方法调用时，内部方法应该加入外部事务、创建新事务，还是以非事务方式运行。

Spring 提供了 7 种传播行为：

| 传播行为 | 定义 | 行为表现 |
| :--- | :--- | :--- |
| **`PROPAGATION_REQUIRED`** | **默认值**。支持当前事务。 | 如果当前有事务，则加入该事务；如果当前没有事务，则自己新建一个事务。 |
| **`PROPAGATION_REQUIRES_NEW`** | 新建事务。 | 挂起当前事务，并自己新建一个独立的事务执行。新旧事务完全隔离，互不影响。 |
| **`PROPAGATION_NESTED`** | 嵌套事务。 | 如果当前存在事务，则在当前事务中创建一个**保存点（Savepoint）**进行嵌套执行；若无当前事务，行为等价于 `REQUIRED`。 |
| `PROPAGATION_SUPPORTS` | 支持当前事务。 | 如果当前有事务，则加入事务；如果当前没有事务，则以非事务方式执行。 |
| `PROPAGATION_NOT_SUPPORTED` | 不支持事务。 | 如果当前有事务，则挂起当前事务，以非事务方式执行。 |
| `PROPAGATION_MANDATORY` | 强制要求事务。 | 必须在已有事务中执行；如果当前没有事务，则抛出异常。 |
| `PROPAGATION_NEVER` | 强制要求无事务。 | 必须在无事务环境中执行；如果当前存在事务，则抛出异常。 |

最常用的是前三个：`REQUIRED`、`REQUIRES_NEW`、`NESTED`。

**三点总结**

1. `REQUIRED` 是默认值，有事务就加入，没有事务就新建。
2. `REQUIRES_NEW` 会挂起外层事务，自己开启一个独立事务，内外事务提交和回滚相对独立。
3. `NESTED` 是嵌套事务，依赖数据库保存点，内层可以回滚到保存点，但外层整体回滚时内层也会一起回滚。

> [!NOTE]
> **REQUIRES_NEW 与 NESTED 的核心区别**：
> * `REQUIRES_NEW`：创建独立的新事务。如果外层事务回滚，**不影响** `REQUIRES_NEW` 内已经提交的事务；反之，`REQUIRES_NEW` 事务回滚，如果不被外层 catch，外层也会跟着回滚。
> * `NESTED`：外层事务回滚时，整个嵌套事务**全部回滚**；但嵌套事务自身回滚时，可以只回滚到 Savepoint，不影响外层事务的继续提交（外层需要用 `try-catch` 包裹嵌套方法的调用）。

**面试表达**：
> Spring 事务传播机制有 7 种，最常用的是 REQUIRED、REQUIRES_NEW 和 NESTED。REQUIRED 是默认传播行为，有事务就加入，没有事务就新建；REQUIRES_NEW 会挂起外层事务，创建一个独立新事务；NESTED 是嵌套事务，基于数据库保存点实现，内层可以局部回滚，但外层整体回滚时内层也会回滚。其他几种 SUPPORTS、NOT_SUPPORTED、MANDATORY、NEVER 主要用于控制方法是否必须在事务中或必须不在事务中执行。

---

### 4.2. Spring 事务隔离级别（Isolation）

事务隔离级别定义了多个并发事务在同时操作相同数据时的隔离程度，旨在解决并发事务引发的**脏读、不可重复读、幻读**问题。

#### 1. 并发事务引发的三个经典问题：
* **脏读（Dirty Read）**：事务 A 读取了事务 B **尚未提交**的修改数据。随后事务 B 发生回滚，事务 A 读取到的数据就是无效的脏数据。
* **不可重复读（Non-repeatable Read）**：事务 A 在事务执行期间多次读取同一行数据。在多次读取之间，事务 B **修改并提交**了该数据，导致事务 A 多次读取到的结果不一致（侧重于数据的**更新/修改**）。
* **幻读（Phantom Read）**：事务 A 根据相同的查询条件多次读取数据集。在多次读取之间，事务 B **插入或删除了数据行并提交**，导致事务 A 后续查询看到了之前没有的数据行（侧重于数据集的**新增/删除**）。

#### 2. Spring 支持的 5 种事务隔离级别：
在 `@Transactional(isolation = Isolation.xxx)` 中可以配置以下级别：

| 隔离级别名称 | 描述与底层实现 | 脏读 | 不可重复读 | 幻读 |
| :--- | :--- | :--- | :--- | :--- |
| **`ISOLATION_DEFAULT`** | **默认值**。使用底层数据库默认的隔离级别。如 MySQL InnoDB 默认为 `RR`，Oracle / SQL Server 默认为 `RC`。 | - | - | - |
| **`ISOLATION_READ_UNCOMMITTED`** | **读未提交**。允许读取并发事务尚未提交的数据。并发性能最高，安全性最低。 | 允许 | 允许 | 允许 |
| **`ISOLATION_READ_COMMITTED`** | **读已提交**。只允许读取已经提交的事务修改的数据。能避免脏读。 | 避免 | 允许 | 允许 |
| **`ISOLATION_REPEATABLE_READ`** | **可重复读**。确保同一个事务多次读取同一条记录的结果相同。能避免脏读和不可重复读。 | 避免 | 避免 | 允许（理论上） |
| **`ISOLATION_SERIALIZABLE`** | **可串行化**。最高隔离级别，强制事务串行执行（加锁阻塞），能完美解决所有并发问题，但并发效率极低。 | 避免 | 避免 | 避免 |

> [!TIP]
> **MySQL InnoDB 级别的幻读优化**：
> 按照 ANSI SQL 规范，`REPEATABLE_READ` 级别是允许发生幻读的。但 MySQL 的 **InnoDB 存储引擎** 在 `REPEATABLE_READ` 隔离级别下，通过 **MVCC（多版本并发控制）** 和 **Next-Key Locks（临键锁，即 Gap Lock + Record Lock）** 机制，已经在很大程度上**避免了幻读**的发生，因此在实际开发中很少需要升级到并发性能低下的 `SERIALIZABLE`。

---

### 4.3. 大厂面试终极考点：导致 Spring 事务失效的 12 种原因
在实际生产中，由于使用不当导致 `@Transactional` 事务未按预期回滚（事务失效），是极其危险的事情。以下是业界总结的 12 种失效场景：

#### 1. 事务方法处于非 public 修饰的方法上
* **原因**：Spring 事务底层基于 AOP 代理。Spring 在解析 `@Transactional` 时，默认会调用 `computeTransactionAttribute` 方法，其中明确规定：如果目标方法不是 `public` 修饰的，直接忽略，不会进行事务增强。

#### 2. 方法同类内部自调用
* **原因**：方法自调用走的是 `this` 引用，绕过了 Spring AOP 代理拦截（详见第 3.3 节），导致事务拦截器 `TransactionInterceptor` 未执行。

#### 3. 事务所在对象未被注册为 Spring Bean
* **原因**：如果类没有标注 `@Service`、`@Component` 等注解，或者没有通过配置类声明，Spring 就无法将其纳入 IoC 容器，自然无法生成代理对象并织入事务增强逻辑。

#### 4. 数据库引擎本身不支持事务
* **原因**：Spring 事务最终必须依赖数据库自身的事务底座。如果 MySQL 数据库使用的是 **MyISAM** 存储引擎（不支持事务），那么即使 Spring 代码配置得完美无瑕，数据库执行时依然是单条语句直接提交，无法回滚。必须确保使用 **InnoDB** 引擎。

#### 5. 事务方法内的异常被异常捕获吞掉
* **原因**：Spring 的声明式事务回滚完全依赖于 AOP 切面捕获方法抛出的异常。如果我们在方法内部写了 `try-catch` 且没有将异常再次往外抛出，`TransactionInterceptor` 会认为方法正常执行完毕，进而触发 `commit`，导致无法回滚。
  ```java
  @Transactional
  public void saveOrder() {
      try {
          orderDao.insert();
          throw new RuntimeException("DB error");
      } catch (Exception e) {
          // 吞掉了异常，Spring 事务无法感知，照常提交
          log.error("Error saved", e); 
      }
  }
  ```

#### 6. 抛出了未匹配的异常类型（默认只回滚 RuntimeException）
* **原因**：Spring 默认只在捕获到 **`RuntimeException`**（运行时异常）和 **`Error`** 时才会触发回滚。如果你的方法抛出的是 **受检异常（Checked Exception，如 `IOException`、`SQLException`、自定义的 `Exception`）**，Spring 默认是**不会**回滚事务的。
* **防范方案**：必须显式配置 `rollbackFor` 属性：`@Transactional(rollbackFor = Exception.class)`。

#### 7. 错误的事务传播行为（Propagation）设置
* **原因**：如果将传播行为误设为 `NOT_SUPPORTED`（以无事务方式运行，挂起当前事务）或 `NEVER`（以无事务方式运行，若当前有事务则报错），则会导致事务无法开启或失效。

#### 8. 数据源（DataSource）未配置事务管理器
* **原因**：如果项目中没有配置 `PlatformTransactionManager`（如 `DataSourceTransactionManager`），或者有多个数据源但未给 `@Transactional` 指定具体的 `transactionManager`，会导致 Spring 找不到匹配的事务管理器而失效。

#### 9. 事务方法处于不同的线程（多线程事务失效）
* **原因**：Spring 事务管理器底层管理连接对象，是将 Connection 绑定在 `ThreadLocal`（线程局部变量）中的。如果主线程的方法 A 开启了事务，然后开启新子线程去执行方法 B，子线程无法获取主线程 Connection，它们使用的是不同的数据库连接，方法 B 发生的任何异常都无法使方法 A 的事务回滚。

#### 10. 类被声明为 final 导致 CGLIB 无法代理
* **原因**：如果目标类或方法被声明为 `final`，由于 CGLIB 是通过生成目标类的**子类**并重写方法来实现代理的，Java 中 final 类无法被继承，final 方法无法被重写，这会导致 CGLIB 无法为该类生成代理，事务失效。

#### 11. 单例 Bean 内部开启嵌套事务，但未配置保存点机制
* **原因**：使用 `NESTED` 传播行为时，底层数据库驱动必须支持保存点（Savepoint）。如果使用的数据库（如某些非主流关系型数据库）或驱动不支持保存点，则嵌套事务直接退化或失效。

#### 12. Bean 的初始化方法中使用事务
* **原因**：如果在 `@PostConstruct` 修饰的初始化方法中调用带有 `@Transactional` 的方法，因为此时 Bean 还处于初始化阶段（正在被 `BeanPostProcessor` 加工，代理尚未完全生成并返回），调用的依然是原始对象，因此事务不会生效。

---

## 5. Spring Boot 自动装配原理（Auto-configuration）

### 5.1. `@SpringBootApplication` 的核心注解结构
Spring Boot 项目的启动类上都标注了 `@SpringBootApplication`。它其实是一个复合注解，其核心由以下 3 个注解组成：

```java
@SpringBootConfiguration // 1. 标识为配置类
@EnableAutoConfiguration  // 2. 开启自动配置（核心）
@ComponentScan           // 3. 开启包扫描
public @interface SpringBootApplication { ... }
```

1. **`@SpringBootConfiguration`**：继承自 `@Configuration`，标明当前启动类本身就是一个 Spring 配置类，可以通过 `@Bean` 注入组件。
2. **`@ComponentScan`**：自动扫描与当前启动类同级包及子包下的 `@Component`、`@Service`、`@Repository`、`@Controller` 等注解，将它们注册为 Spring 容器中的 Bean。
3. **`@EnableAutoConfiguration`**：自动装配的核心入口。

---

### 5.2. 自动装配底层工作原理
自动装配的本质是：**引入第三方 jar 包的 starter 时，Spring Boot 会自动将该 jar 包中预先定义好的 Bean 注册到我们的 Spring 容器中，免去了手动写配置类的麻烦**。

其底层的核心执行流程如下：

```text
  @EnableAutoConfiguration
            ↓
  @Import(AutoConfigurationImportSelector.class)
            ↓
  读取 META-INF/spring.factories (或 3.x 中的 imports 文件)
            ↓
  利用 @Conditional条件注解过滤 ──> 注入符合条件的 AutoConfiguration 配置类
```

1. **加载 Import 选择器**：
   * `@EnableAutoConfiguration` 内部使用 `@Import(AutoConfigurationImportSelector.class)`。
   * 该类实现了 `DeferredImportSelector` 接口，Spring 容器启动时会回调它的 `selectImports()` 方法。
2. **扫描配置文件**：
   * 在 `selectImports()` 方法内部，通过 `SpringFactoriesLoader`（或者在 Spring Boot 3.x 中通过全新的 SPI 机制）扫描 ClassPath 类路径下所有 jar 包中的配置文件：
     * **Spring Boot 2.x**：寻找 `META-INF/spring.factories` 中 Key 为 `org.springframework.boot.autoconfigure.EnableAutoConfiguration` 的所有配置类全类名。
     * **Spring Boot 3.x**：寻找 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 配置文件（每行代表一个配置类全限定名）。
3. **条件过滤（Conditional Evaluation）**：
   * 扫描出来的自动配置类并不会无条件全量加载。这些配置类上都标注了大量的 **`@Conditional`** 派生条件注解，如：
     * `@ConditionalOnClass(Name.class)`：类路径下存在 `Name.class` 时，该配置类才生效。
     * `@ConditionalOnMissingBean(Name.class)`：容器中不存在 `Name` 类型的 Bean 时，该配置类才生效（方便用户自定义覆盖）。
     * `@ConditionalOnProperty(prefix = "...", name = "...")`：配置文件中配置了指定的属性且值为 true 时生效。
4. **注入容器**：
   * 过滤后，符合当前运行环境条件的自动配置类被正式加载，并通过内部的 `@Bean` 方法将对应组件（如 `SqlSessionFactory`、`RedisTemplate`）实例化并注册到 IoC 容器中。

#### 追问：`@Import(AutoConfigurationImportSelector.class)` 和直接在类上加 `@Component` 有什么区别？
两者不是一类机制，不能互相替代。

| 写法 | 核心作用 | 注册/导入的内容 |
| :--- | :--- | :--- |
| `@Component` | 组件扫描机制，把当前类注册成 Spring Bean | 当前类本身 |
| `@Import(SomeClass.class)` | 配置类导入机制，把指定类导入 Spring 容器 | `SomeClass` 本身，或它进一步选择出来的类 |
| `@Import(AutoConfigurationImportSelector.class)` | 自动配置导入机制，触发 `ImportSelector` 选择自动配置类 | 一批符合条件的自动配置类 |

`@Component` 的前提是当前类能被 `@ComponentScan` 扫描到，作用只是把这个类本身变成一个普通 Bean。例如：

```java
@Component
public class MyConfig {
}
```

这只会让容器中多一个 `MyConfig` Bean，不会触发自动装配选择流程。

而 `@Import(AutoConfigurationImportSelector.class)` 的重点不是让 `AutoConfigurationImportSelector` 成为普通业务 Bean，而是让 Spring 在**配置类解析阶段**识别到它实现了 `DeferredImportSelector`，然后回调它的 `selectImports()` 方法：

```text
解析 @EnableAutoConfiguration
        ↓
发现 @Import(AutoConfigurationImportSelector.class)
        ↓
识别到 DeferredImportSelector
        ↓
调用 selectImports()
        ↓
读取 spring.factories / AutoConfiguration.imports
        ↓
筛选并导入一批自动配置类
```

如果只是给 `AutoConfigurationImportSelector` 加 `@Component`，即使它被扫描成 Bean，也不会自动调用 `selectImports()`，因此不会导入那些自动配置类。

**面试表达**：
> `@Component` 是组件扫描机制，作用是把当前类注册成 Bean；而 `@Import(AutoConfigurationImportSelector.class)` 是配置类导入机制，它会在 Spring 解析配置类时识别到 `DeferredImportSelector`，调用 `selectImports()`，再批量导入自动配置类。`AutoConfigurationImportSelector` 的重点不是自己成为一个普通 Bean，而是作为自动配置选择器参与配置类解析。所以不能用 `@Component` 替代 `@Import(AutoConfigurationImportSelector.class)`。

---

### 5.3. 面试加分项：如何手写一个自定义 Spring Boot Starter？
手写 Starter 的核心是定义自动配置类并将其暴露给 SPI。步骤如下：

#### 步骤 1：新建 Maven 项目
* 命名规范：第三方自定义的 Starter 推荐命名为 `xxx-spring-boot-starter`（Spring 官方的命名为 `spring-boot-starter-xxx`）。
* 引入依赖：引入 `spring-boot-autoconfigure` 核心依赖。

#### 步骤 2：编写业务逻辑服务类
```java
public class WeatherService {
    private final String defaultCity;
    public WeatherService(String defaultCity) { this.defaultCity = defaultCity; }
    public String getWeather() { return defaultCity + " 的天气为：晴转多云"; }
}
```

#### 步骤 3：编写自动配置类（Configuration）
```java
@Configuration
@EnableConfigurationProperties(WeatherProperties.class) // 绑定配置属性类
@ConditionalOnClass(WeatherService.class)               // 类路径下存在该类时生效
public class WeatherAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean // 只有容器中没有这个 Bean 时才创建
    public WeatherService weatherService(WeatherProperties properties) {
        return new WeatherService(properties.getCity());
    }
}
```

**补充：`@EnableConfigurationProperties(WeatherProperties.class)` 的作用**

`@ConfigurationProperties` 负责声明“配置文件中的属性如何绑定到 Java 对象上”，但这个属性类还需要进入 Spring 容器，才能被自动配置类注入使用。`@EnableConfigurationProperties(WeatherProperties.class)` 的作用就是：**把 `WeatherProperties` 注册为 Spring Bean，并启用配置属性绑定**。

例如：

```java
@ConfigurationProperties(prefix = "weather")
public class WeatherProperties {
    private String city;
    private String apiKey;
}
```

配置文件：

```yaml
weather:
  city: Beijing
  api-key: xxx
```

此时 `WeatherProperties` 会绑定 `weather.city` 和 `weather.api-key`，然后可以在自动配置类中直接注入：

```java
@Bean
public WeatherService weatherService(WeatherProperties properties) {
    return new WeatherService(properties.getCity());
}
```

几种常见用法对比：

| 用法 | 适合场景 | 说明 |
| :--- | :--- | :--- |
| `@EnableConfigurationProperties(WeatherProperties.class)` | 自定义 Starter、自动配置类 | 最推荐，属性类不依赖业务项目的组件扫描路径 |
| `@Component + @ConfigurationProperties` | 业务项目内部配置类 | 属性类能被 `@ComponentScan` 扫描到时可用 |
| `@ConfigurationPropertiesScan` | 业务项目中批量扫描属性类 | 通常加在启动类或配置类上，批量扫描 `@ConfigurationProperties` 类 |
| `@Bean + @ConfigurationProperties` | 绑定第三方类或无法直接加注解的类 | 在 `@Bean` 方法上声明绑定规则 |

**面试表达**：
> `@ConfigurationProperties` 只是声明配置属性的绑定规则，`@EnableConfigurationProperties` 负责把这个配置属性类注册进 Spring 容器并启用绑定。在自定义 Starter 或自动配置类里，通常使用 `@EnableConfigurationProperties(XXXProperties.class)`，因为属性类在第三方 jar 中，不一定能被业务项目的组件扫描扫到；业务项目内部也可以用 `@Component + @ConfigurationProperties`，或者用 `@ConfigurationPropertiesScan` 批量扫描。

#### 步骤 4：在 resources 目录下配置暴露入口
在 `src/main/resources` 目录下创建目录与文件：
* **如果是 Spring Boot 2.x**，创建 `META-INF/spring.factories`，内容为：
  ```properties
  org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
  com.example.weather.WeatherAutoConfiguration
  ```
* **如果是 Spring Boot 3.x**，创建 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，内容直接为配置类全路径：
  ```text
  com.example.weather.WeatherAutoConfiguration
  ```

---

### 5.4. Spring Boot 启动流程高频面试题

#### Q1：`SpringApplication.run()` 启动流程整体做了什么？

**一句话回答**：`SpringApplication.run()` 本质是准备运行环境、创建应用上下文、刷新容器、启动 Web 服务器、完成 Bean 初始化，最后回调 Runner 并发布启动完成事件。

核心流程可以概括为：

```text
创建 SpringApplication
        ↓
推断应用类型 WebApplicationType
        ↓
加载 ApplicationContextInitializer / ApplicationListener
        ↓
准备 Environment
        ↓
打印 Banner
        ↓
创建 ApplicationContext
        ↓
prepareContext：准备上下文、加载 BeanDefinition
        ↓
refreshContext：刷新容器，完成 Bean 创建和内嵌 Web 容器启动
        ↓
afterRefresh：刷新后扩展
        ↓
调用 ApplicationRunner / CommandLineRunner
        ↓
发布 ApplicationReadyEvent
```

**三点总结**

1. `run()` 不只是执行 `main` 方法，而是完整驱动 Spring 容器启动。
2. 真正创建 Bean、触发生命周期、启动内嵌 Tomcat 的关键在 `refresh()`。
3. `ApplicationRunner` / `CommandLineRunner` 在容器刷新完成后执行，适合做启动后初始化任务。

**面试表达**

> Spring Boot 启动可以分成三段：第一段是准备阶段，创建 SpringApplication，推断应用类型，加载监听器和初始化器，准备 Environment；第二段是容器阶段，创建 ApplicationContext，加载 BeanDefinition，然后调用 refresh 完成 BeanFactory 后置处理器、BeanPostProcessor 注册、单例 Bean 初始化和内嵌 Web 容器启动；第三段是启动完成阶段，调用 ApplicationRunner、CommandLineRunner，并发布 ApplicationReadyEvent。

---

#### Q2：`SpringApplication` 创建时会做哪些初始化？

**一句话回答**：它会保存启动类、推断当前应用类型，加载初始化器和监听器，为后续启动流程准备元数据。

典型动作：

1. 保存 primarySources，也就是启动类。
2. 推断 `WebApplicationType`：普通应用、Servlet Web 应用或 Reactive Web 应用。
3. 从约定配置中加载 `ApplicationContextInitializer`。
4. 从约定配置中加载 `ApplicationListener`。
5. 推断 main 方法所在类。

这些动作本身还没有真正创建业务 Bean，只是在准备启动所需的配置和扩展点。

**面试表达**

> `SpringApplication` 构造阶段主要做启动元数据准备，比如保存启动类、判断当前是不是 Web 应用、加载 ApplicationContextInitializer 和 ApplicationListener，并推断 main 方法所在类。真正的容器创建、Bean 加载和 Web 服务启动，是后面的 `run()` 流程完成的。

---

#### Q3：`Environment` 在启动过程中有什么作用？

**一句话回答**：`Environment` 负责管理配置属性和 Profile，是自动装配条件判断、配置绑定和属性解析的基础。

`Environment` 中通常包含：

1. JVM 系统属性。
2. 操作系统环境变量。
3. `application.yml` / `application.properties`。
4. 命令行参数。
5. 激活的 Profile 配置。

启动早期会准备 `Environment`，后续很多能力都依赖它：

1. `@Value` 解析配置。
2. `@ConfigurationProperties` 绑定配置。
3. `@ConditionalOnProperty` 判断自动配置是否生效。
4. 根据 `spring.profiles.active` 加载不同环境配置。

**面试表达**

> Environment 是 Spring Boot 启动时的配置上下文，里面包含命令行参数、系统属性、环境变量和配置文件。它会在容器刷新前准备好，因为后续自动装配条件判断、`@Value`、`@ConfigurationProperties`、Profile 激活都依赖 Environment。

---

#### Q4：`ApplicationContext` 是什么时候创建的？不同应用类型有什么区别？

**一句话回答**：Spring Boot 会根据应用类型创建不同的 `ApplicationContext`，Web 项目通常创建 Servlet Web 上下文，非 Web 项目创建普通注解上下文。

常见类型：

| 应用类型 | 常见 ApplicationContext |
| :--- | :--- |
| 普通 Java 应用 | `AnnotationConfigApplicationContext` |
| Servlet Web 应用 | `AnnotationConfigServletWebServerApplicationContext` |
| Reactive Web 应用 | `AnnotationConfigReactiveWebServerApplicationContext` |

Servlet Web 项目中，`ApplicationContext` 不仅管理 Spring Bean，还会在刷新过程中创建并启动内嵌 WebServer，例如 Tomcat、Jetty、Undertow。

**面试表达**

> Spring Boot 会先推断应用类型，再创建对应的 ApplicationContext。普通应用一般是注解上下文；Servlet Web 应用会创建 ServletWebServerApplicationContext，它除了管理 Bean，还负责在 refresh 阶段创建和启动内嵌 Tomcat 这类 WebServer。

---

#### Q5：`refresh()` 是 Spring Boot 启动中最核心的一步，它主要做了什么？

**一句话回答**：`refresh()` 是 Spring 容器真正启动的核心，会完成 BeanFactory 准备、后置处理器执行、Bean 初始化、事件广播器初始化和 Web 容器启动。

关键步骤：

1. 准备 BeanFactory。
2. 执行 `BeanFactoryPostProcessor`，例如解析配置类、扫描 Bean、处理自动配置类。
3. 注册 `BeanPostProcessor`，为后续 Bean 初始化和 AOP 代理做准备。
4. 初始化消息源、事件广播器。
5. Web 应用创建并启动内嵌 WebServer。
6. 初始化所有非懒加载单例 Bean。
7. 完成事件发布和生命周期回调。

其中最容易被追问的是：

1. BeanDefinition 主要在配置类解析、扫描、自动装配导入阶段产生。
2. AOP 代理通常通过 BeanPostProcessor 在 Bean 初始化后生成。
3. 内嵌 Tomcat 通常在 WebApplicationContext 的刷新过程中创建和启动。

**面试表达**

> Spring Boot 启动真正的核心在 `refresh()`。它会准备 BeanFactory，执行 BeanFactoryPostProcessor 解析配置类和自动配置，注册 BeanPostProcessor，然后初始化事件广播器、消息源和所有非懒加载单例 Bean。对于 Web 应用，内嵌 Tomcat 也是在上下文刷新过程中创建并启动的。可以理解为 run 方法负责串流程，refresh 方法负责真正把 Spring 容器跑起来。

---

#### Q6：Spring Boot 自动装配发生在启动流程的哪个阶段？

**一句话回答**：自动装配发生在容器刷新过程中配置类解析阶段，本质是通过 `@EnableAutoConfiguration` 导入一批符合条件的自动配置类。

关键链路：

```text
@SpringBootApplication
        ↓
@EnableAutoConfiguration
        ↓
@Import(AutoConfigurationImportSelector.class)
        ↓
读取 spring.factories / AutoConfiguration.imports
        ↓
按 Conditional 条件过滤
        ↓
导入自动配置类
        ↓
注册自动配置类中的 BeanDefinition / Bean
```

自动装配不是在 `main` 方法里直接 new 对象，而是在 Spring 解析配置类、导入配置类、注册 BeanDefinition 的过程中完成。

**面试表达**

> 自动装配属于 Spring Boot 启动流程里的配置类解析阶段。`@SpringBootApplication` 里的 `@EnableAutoConfiguration` 会通过 `AutoConfigurationImportSelector` 读取自动配置类列表，再根据 Conditional 条件筛选，最后把符合条件的自动配置类导入容器。后续 refresh 初始化 Bean 时，这些自动配置类里的 Bean 才会真正创建。

---

#### Q7：内嵌 Tomcat 是什么时候启动的？

**一句话回答**：Servlet Web 应用中，内嵌 Tomcat 通常在 `ApplicationContext.refresh()` 阶段创建并启动，早于 `ApplicationRunner` 和 `CommandLineRunner`。

大致流程：

1. Spring Boot 判断当前是 Servlet Web 应用。
2. 创建 `ServletWebServerApplicationContext`。
3. `refresh()` 过程中创建 WebServer。
4. 根据自动配置注册 DispatcherServlet、Filter、Servlet、Listener 等组件。
5. 启动 Tomcat 并监听端口。
6. 容器启动完成后，再执行 Runner 回调。

**面试表达**

> 内嵌 Tomcat 不是 main 方法里手动启动的，而是在 ServletWebServerApplicationContext 的 refresh 阶段由 Spring Boot 创建和启动。自动配置会准备 Tomcat 工厂、DispatcherServlet、Filter 等组件，refresh 时启动 WebServer 并监听端口。Runner 回调是在容器刷新完成之后执行的，所以一般晚于 Tomcat 启动。

---

#### Q8：`ApplicationRunner` 和 `CommandLineRunner` 有什么区别？什么时候执行？

**一句话回答**：它们都在 Spring 容器启动完成后执行，区别是参数封装形式不同。

| 对比项 | CommandLineRunner | ApplicationRunner |
| :--- | :--- | :--- |
| 方法 | `run(String... args)` | `run(ApplicationArguments args)` |
| 参数 | 原始命令行参数数组 | 封装后的参数对象 |
| 执行时机 | 容器刷新完成后 | 容器刷新完成后 |
| 典型场景 | 简单启动任务 | 需要解析 option/non-option 参数 |

常见用途：

1. 启动后预热缓存。
2. 注册本地任务。
3. 检查关键配置。
4. 打印启动状态。

注意事项：

1. 不要放耗时过长的阻塞任务，否则会拖慢应用启动。
2. 不要在这里做不可控远程调用，避免启动失败或卡死。
3. 多个 Runner 可以通过 `@Order` 控制顺序。

**面试表达**

> ApplicationRunner 和 CommandLineRunner 都是在 Spring Boot 容器启动完成后执行的回调，适合做启动后的轻量初始化。区别是 CommandLineRunner 拿到原始字符串参数，ApplicationRunner 拿到封装后的 ApplicationArguments。生产上不建议在 Runner 里放长时间阻塞任务或不稳定远程调用，否则会拖慢甚至阻塞应用启动。

---

#### Q9：Spring Boot 启动失败一般怎么排查？

**一句话回答**：先看启动异常栈，再按配置、Bean 创建、自动装配条件、端口占用、依赖冲突和外部资源连接分层排查。

常见原因：

1. 配置文件错误：属性名写错、Profile 未激活、配置缺失。
2. Bean 创建失败：构造器异常、依赖注入失败、循环依赖、`@ConfigurationProperties` 绑定失败。
3. 自动装配条件不满足：缺少 class、缺少 Bean、条件配置未开启。
4. 端口占用：WebServer 启动失败。
5. 依赖冲突：版本不兼容、类找不到、方法签名不一致。
6. 外部资源不可用：数据库、Redis、MQ、配置中心连接失败。

排查顺序：

```text
看第一段 Caused by
        ↓
定位失败 Bean / 配置项 / 端口 / 依赖
        ↓
结合 Condition Evaluation Report 看自动配置为什么生效或没生效
        ↓
确认 Profile、依赖版本、外部资源可用性
```

**面试表达**

> Spring Boot 启动失败我会先看异常栈最底层的 Caused by，确认是配置绑定、Bean 创建、端口占用、依赖冲突还是外部资源连接问题。自动装配相关问题可以看 Condition Evaluation Report，判断某个自动配置为什么生效或没生效。排查时不要只看最外层 SpringApplication run failed，要找到真正导致失败的 Bean 或配置项。

---

## 6. Spring MVC 核心工作流程

Spring MVC 是基于 **Servlet** 规范实现的经典 MVC 框架，其接收 HTTP 请求并响应的工作流程包含 11 个步骤：

```text
  [Browser] ─1.Request─> [DispatcherServlet] ──11.Response─> [Browser]
                            │            ▲
                      2.Map │            │ 9.Resolve
                            ▼            │
                      [HandlerMapping]   [ViewResolver]
                            │            ▲
                     3.Chain│            │ 8.View Name
                            ▼            │
                      [HandlerAdapter] ──7.ModelAndView ──> [DispatcherServlet]
                            │            ▲
                   4.Adapt  │            │ 6.Return
                            ▼            │
                        [Controller] ────┘
```

1. **客户端发起请求**：浏览器发送 HTTP 请求，被前端控制器 `DispatcherServlet` 拦截。
2. **寻找处理器（Handler）**：`DispatcherServlet` 收到请求后，调用 `HandlerMapping`（处理器映射器）。
3. **返回执行链**：`HandlerMapping` 根据请求的 URL，匹配对应的 Controller 方法，并构建一个 `HandlerExecutionChain`（处理器执行链，包含具体的处理器对象以及配置的 `HandlerInterceptor` 拦截器列表）返回给 `DispatcherServlet`。
4. **寻找适配器**：`DispatcherServlet` 根据返回的处理器，调用并寻找合适的 `HandlerAdapter`（处理器适配器）。
5. **执行 Handler（Controller）**：`HandlerAdapter` 根据 Handler（Controller）的类型，适配并调用其具体方法执行业务逻辑。
6. **返回 ModelAndView**：Controller 执行完毕后，向 `HandlerAdapter` 返回一个 `ModelAndView` 对象（包含 Model 模型数据和 View 视图逻辑名）。
7. **传送结果**：`HandlerAdapter` 将 `ModelAndView` 传回给 `DispatcherServlet`。
8. **解析视图**：`DispatcherServlet` 将逻辑视图名传给 `ViewResolver`（视图解析器）进行解析。
9. **返回真实视图**：`ViewResolver` 根据逻辑视图名解析出物理上的 `View` 视图对象（如 Thymeleaf、JSP 或 HTML 模板）并返回给 `DispatcherServlet`。
10. **渲染视图**：`DispatcherServlet` 将 `ModelAndView` 中的 Model 模型数据传入 `View` 对象进行数据填充与渲染。
11. **响应客户端**：`DispatcherServlet` 将渲染后的 HTML 页面响应给浏览器客户端（如果是 `@ResponseBody` 或 `@RestController` 请求，会直接绕过 8-10 步，通过 `HttpMessageConverter` 将数据转为 JSON 字符串直接写入 HTTP 响应体返回）。
---

## 7. 模拟面试连环对答通关话术（精选）

### Q1：面试官问：“Spring 是怎么解决循环依赖的？三级缓存的核心机制是什么？”
* **通关话术**：
  > “Spring 解决循环依赖的核心在于**提前暴露半成品的 Bean 早期引用**。底层设计了三张缓存 Map：一级缓存 `singletonObjects` 存放完全初始化好的单例 Bean；二级缓存 `earlySingletonObjects` 存放实例化但尚未进行属性赋值的半成品早期引用；三级缓存 `singletonFactories` 存放 Bean 单例工厂。
  > 
  > 以 A、B 循环依赖为例，A 实例化后将对应的 `ObjectFactory` 放入三级缓存，接着去注入 B。B 在创建时去注入 A，依次在一二级缓存找不到，最后去三级缓存触发 A 的 `ObjectFactory.getObject()`。
  > 
  > 如果 A 需要进行 AOP 代理，这个工厂会提前为 A 创建其早期 AOP 代理对象并放入二级缓存；如果不需要，就直接返回原始早期对象。然后 B 注入 A 并完成创建，放入一级缓存。最终 A 拿到 B 完成注入和自身初始化。这套机制利用三级缓存延迟了 AOP 代理的创建时机，做到了**只有真正发生循环依赖时才提前触发代理，不违背 Spring 常规的 Bean 生命周期**。”

### Q2：面试官追问：“为什么 `@Transactional` 在方法自调用时会失效？怎么解决？”
* **通关话术**：
  > “失效的原因在于 **Spring 声明式事务底层是基于动态代理切面拦截实现的**。当我们外部客户端调用 Service 时，调用的是 Spring 为该类生成的代理对象，代理对象会通过拦截器 `TransactionInterceptor` 开启事务。
  > 
  > 但是，当我们在没有事务的方法 A 内部直接调用方法 B 时，它本质上是通过 `this.methodB()` 执行的，这个 `this` 指向的是目标业务类本身（原始对象），而不是代理对象。由于没有经过代理层，事务切面逻辑不会被执行，因此事务直接失效。
  > 
  > 解决办法最推荐的是**注入自身代理**。可以通过 `@Autowired` 配合 `@Lazy` 延迟加载将当前的 Service 代理对象作为成员变量注入到类内部，然后通过 `self.methodB()` 来调用；或者将方法 B 的逻辑拆分到另一个独立的 Service 类中，由外部注入调用，从架构层实现彻底解耦。”

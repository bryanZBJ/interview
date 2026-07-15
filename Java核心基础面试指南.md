# Java 核心基础高频面试指南与深度解析

本指南面向中高级 Java 岗位面试，整理了 Java 核心基础（面向对象、集合框架、JVM、类加载机制、异常、泛型、反射与动态代理）中大厂最常考察的底层原理和核心问题。

---

## 1. 接口与抽象类的深度区别与应用场景

### 常见问法
* 接口和抽象类有什么区别？
* 什么时候用接口？什么时候用抽象类？
* JDK 8 接口引入 default 默认方法的目的是什么？

### 核心对比
* **语法层面**：
  * **构造方法**：抽象类可以定义构造方法（供子类初始化父类状态）；接口绝对不能有构造方法。
  * **成员变量**：抽象类可以定义任意修饰符和类型的成员变量；接口中的变量默认且强制为 `public static final` 的常量。
  * **继承性**：Java 支持单继承、多实现。一个类只能继承（`extends`）一个抽象类，但可以实现（`implements`）多个接口。
  * **JDK 8 及以后的变化**：JDK 8 允许接口定义带有方法体的 `default` 方法和 `static` 方法；JDK 9 允许接口定义 `private` 私有方法。
* **设计理念（本质区别）**：
  * **抽象类（Is-a 关系）**：是对**事物本质的抽象**，定义了“你是什么（What you are）”。例如：`Dog extends Animal`。主要用于**代码复用**。
  * **接口（Like-a / Can-do 关系）**：是对**行为契约的抽象**，定义了“你能做什么（What you can do）”。例如：`Dog implements Flyable`。主要用于**系统解耦和规范制定**。

### 应用场景
* **使用抽象类的场景**：适合采用**模板方法模式**的场景。在父类中定义好算法的核心流程骨架，将具体差异化的步骤声明为 `protected abstract` 留给子类去实现。
* **使用接口的场景**：当不同的、不相关的类需要共享某种行为规范时（如 `Serializable` 或 `Comparable`）；或在制定高层模块调用规范（面向接口编程）进行架构解耦时。

---

## 2. Java 集合框架深度剖析

### 2.1. ArrayList 扩容机制

* **初始化**：JDK 8 以后，`new ArrayList()` 默认初始化为空数组 `DEFAULTCAPACITY_EMPTY_ELEMENTDATA`。只有在**第一次添加元素**时，才会真正分配内存空间，默认初始容量为 **10**（懒加载机制）。
* **扩容倍数**：当容量不足时，触发自动扩容，新容量为原容量的 **1.5 倍**。
  * **核心源码**：`int newCapacity = oldCapacity + (oldCapacity >> 1);`
* **拷贝机制**：确定新容量后，通过 `Arrays.copyOf(elementData, newCapacity)` 申请一个新数组，内部利用底层 native 方法 `System.arraycopy()` 将老数据全量拷贝到新数组中。因此频繁扩容会有严重的性能损耗，高并发或大数据量下建议**预估容量并提前指定**。
* **触发场景**：扩容发生在添加元素前的容量检查阶段，核心条件是新增后所需容量 `minCapacity` 大于当前底层数组长度 `elementData.length`，也就是 `size + 新增元素个数 > elementData.length`。
  * **第一次 `add`**：`new ArrayList()` 本身不会分配容量，第一次添加元素时才会从空数组扩到默认容量 `10`。
  * **普通 `add(E e)`**：如果 `size + 1` 超过当前数组容量，就触发扩容；比如默认容量 `10` 时，第 11 次添加会扩到 `15`。
  * **指定位置插入 `add(index, element)`**：同样先判断容量是否足够，容量不够会扩容；容量够时也需要移动插入位置之后的元素。
  * **批量添加 `addAll(Collection c)`**：如果 `size + c.size()` 超过当前容量，会触发扩容，并且可能直接扩到能容纳这批元素的容量，不一定只扩 1.5 倍。
  * **手动 `ensureCapacity(int minCapacity)`**：如果指定的最小容量大于当前数组容量，会提前扩容，适合已知数据量时减少多次自动扩容。
* **不会触发扩容的操作**：`new ArrayList()`、`get`、`set`、`remove` 都不会触发扩容；`remove` 也不会自动缩容。
* **面试表达**：`ArrayList` 的扩容本质发生在添加元素前的容量检查，只要新增后所需容量超过底层数组长度，就会扩容。默认构造是懒加载，第一次 `add` 才初始化为 10，后续容量不够时按 1.5 倍扩容，并通过 `Arrays.copyOf` 复制旧数组。所以如果能预估元素数量，最好在构造时指定初始容量或调用 `ensureCapacity`，减少扩容和数组拷贝开销。

---

### 2.2. ArrayList 和 LinkedList 的区别与选型

`ArrayList` 和 `LinkedList` 都实现了 `List` 接口，核心区别是底层数据结构不同：`ArrayList` 使用动态数组，`LinkedList` 使用双向链表。

#### 1. 核心对比

| 对比项 | ArrayList | LinkedList |
| :--- | :--- | :--- |
| 底层结构 | 动态数组 | 双向链表 |
| `get(index)` 随机访问 | O(1) | O(n)，需要遍历节点 |
| 尾部添加 | 均摊 O(1)，扩容时 O(n) | O(1) |
| 指定位置添加 | O(n)，需要移动后续元素 | 查找位置 O(n)，找到节点后插入 O(1) |
| 指定位置删除 | O(n)，需要移动后续元素 | 查找位置 O(n)，找到节点后删除 O(1) |
| 头尾操作 | 头部 O(n)，尾部均摊 O(1) | 头尾都是 O(1) |
| 内存占用 | 较低，但可能预留空闲容量 | 较高，每个节点还保存 `prev`、`next` 引用 |
| CPU 缓存友好性 | 较好，元素引用连续存放 | 较差，节点在堆内存中比较分散 |
| 线程安全 | 不安全 | 不安全 |

#### 2. ArrayList 的优势和劣势

**优势：**

1. 可以根据下标直接定位元素，随机访问是 O(1)。
2. 元素引用在数组中连续存放，对 CPU Cache 更友好，实际遍历性能通常更好。
3. 每个元素不需要额外的前后指针，内存占用通常更低。
4. 容量足够时，尾部 `add()` 是 O(1)，整体为均摊 O(1)。

**劣势：**

1. 在头部或中间插入、删除时，需要通过数组复制移动后续元素，时间复杂度是 O(n)。
2. 容量不足时需要创建更大的数组并复制旧元素，因此已知数据量时最好指定初始容量。

```java
List<User> users = new ArrayList<>(10_000);
```

#### 3. LinkedList 的优势和劣势

**优势：**

1. 已经定位到节点后，插入和删除只需要修改前后指针，操作本身是 O(1)。
2. 同时实现了 `Deque` 和 `Queue`，`addFirst()`、`addLast()`、`removeFirst()`、`removeLast()` 等头尾操作是 O(1)。
3. 不需要像动态数组一样进行扩容和全量复制。

**劣势：**

1. `get(index)` 需要从头部或尾部遍历，时间复杂度是 O(n)。
2. 每个元素都要包装成节点，并额外保存前后引用，内存开销更大。
3. 节点分散在堆内存中，指针跳转较多，对 CPU Cache 不友好，遍历通常慢于 ArrayList。

不要使用下标循环遍历 LinkedList：

```java
for (int i = 0; i < list.size(); i++) {
    System.out.println(list.get(i)); // 整体可能退化为 O(n²)
}
```

应该使用迭代器或增强 `for`：

```java
for (String value : list) {
    System.out.println(value);
}
```

#### 4. 高频追问：LinkedList 插入删除一定比 ArrayList 快吗？

不一定。例如执行：

```java
list.add(5000, value);
```

LinkedList 必须先遍历找到第 5000 个节点，这一步是 O(n)，找到节点后插入才是 O(1)，所以通过下标插入的整体复杂度仍然是 O(n)。

ArrayList 虽然要移动元素，但底层的 `System.arraycopy()` 是经过 JVM 优化的连续数组复制。在很多真实场景中，ArrayList 反而可能更快。

因此不能简单地说“插入删除多就使用 LinkedList”，更准确的说法是：

> 已经拿到目标节点，或者频繁操作队列头尾时，LinkedList 的插入删除才更有优势；如果需要按下标定位，查找节点本身仍然是 O(n)。

#### 5. 如何选型？

大部分业务场景优先选择 `ArrayList`：

- 查询、遍历操作较多。
- 需要根据下标随机访问。
- 主要在尾部添加元素。
- 更关注实际性能和内存占用。

以下场景才考虑 `LinkedList`：

- 频繁进行链表头尾操作。
- 需要同时使用 `Deque` 或 `Queue` 接口。
- 几乎不需要按下标随机访问。

如果只是实现队列或栈，通常更推荐使用 `ArrayDeque`，它的内存占用和实际性能一般比 LinkedList 更好。

#### 6. 面试口述版

> ArrayList 底层是动态数组，随机访问是 O(1)，遍历速度快、内存占用较低、CPU 缓存友好，尾部添加是均摊 O(1)，所以大多数业务场景优先使用 ArrayList。LinkedList 底层是双向链表，随机访问需要遍历，是 O(n)，每个节点还要保存前后指针，内存开销更大。它的优势主要是已经定位节点后的插入删除，以及头尾操作都是 O(1)。但如果通过下标插入，仍然要先遍历，所以不能简单认为插入删除多就一定使用 LinkedList。

---

### 2.3. HashMap 底层结构与扩容机制

#### 1. 底层数据结构
* **JDK 1.7**：数组 + 单链表（发生 Hash 碰撞时采用**头插法**，在高并发扩容时会导致链表死循环成环状，导致 CPU 100%）。
* **JDK 1.8**：数组 + 单链表 / 红黑树（发生冲突时采用**尾插法**，避免了死循环）。
  * **红黑树树化条件**：当链表长度 >= 8 且数组总容量 >= 64 时，链表才会转化为红黑树。若链表长度 >= 8 但数组容量 < 64，只会触发数组扩容，不会树化。
  * **退化条件**：当红黑树节点数 <= 6 时，红黑树退化为普通单链表。

#### 2. Hash 函数设计与寻址
* **Hash 计算**：`(h = key.hashCode()) ^ (h >>> 16)`
  * **原理**：将 key 的 hashCode 高 16 位与低 16 位进行**异或操作**。这能让高位信息也参与到后面的寻址计算中，在数组长度较小时，有效减少 Hash 碰撞。
  * **`hashCode()` 位数**：`hashCode()` 返回值是 Java 的 `int` 类型，因此固定是 **32 位有符号整数**。`h >>> 16` 表示将高 16 位无符号右移到低 16 位，再与原始 `h` 异或，相当于把高位信息混入低位。
  * **为什么要混入低位**：HashMap 定位数组下标使用 `(n - 1) & hash`。由于数组长度 `n` 是 2 的幂，`n - 1` 的二进制低位全是 1，高位通常是 0，所以实际参与寻址的主要是 hash 的低位。如果只依赖低位，容易发生碰撞；扰动函数可以让高 16 位也参与寻址，降低冲突概率。
* **寻址定位**：`(n - 1) & hash` （`n` 为数组长度）。
  * **原理**：因为 HashMap 数组长度必须是 2 的幂，所以 `(n-1) & hash` 的效果等价于 `hash % n`（取模），但按位与操作的性能要远高于 CPU 取模指令。
* **面试表达**：`hashCode()` 返回的是 32 位 `int`。HashMap 的 `(h = key.hashCode()) ^ (h >>> 16)` 是扰动函数，把 hash 的高 16 位信息混入低 16 位。因为 HashMap 通过 `(n - 1) & hash` 定位数组下标，数组长度又是 2 的幂，主要看低位，所以需要让高位也参与寻址，减少哈希冲突。

#### 3. 扩容（Resize）触发与节点搬迁
* **触发阈值**：当元素个数超过 `capacity * loadFactor`（默认 `loadFactor` 是 `0.75`）时触发扩容，每次扩容为原来的 **2 倍**。
* **节点搬迁（低 16 位定位）**：
  * 扩容时，节点不需要重新进行 hash 计算。
  * 数组翻倍后，原节点的索引要么在“原位置”，要么在“原位置 + 老数组容量”。
  * **判定依据**：通过 `(hash & oldCap) == 0` 判断。如果为 0，依然存放在低位链表（位置不变）；如果不为 0，则移动到高位链表（`index + oldCap`），避免了重新计算 hash 的性能开销。

#### 4. HashMap 1.8 源码高频面试题

##### Q1：`put` 方法的源码流程是什么？

JDK 1.8 中 `HashMap.put(k, v)` 的核心入口是 `putVal(hash(key), key, value, false, true)`。

整体流程可以概括为：

```text
1. 计算 key 的 hash 值
2. 如果 table 为空，先 resize 初始化数组
3. 根据 (n - 1) & hash 计算桶下标
4. 如果桶为空，直接新建 Node 放进去
5. 如果桶不为空：
   5.1 判断桶头节点 key 是否相同，相同则覆盖 value
   5.2 如果桶头是红黑树节点，走 putTreeVal 插入
   5.3 否则遍历链表：
       - 找到相同 key：覆盖 value
       - 找不到：尾插新节点
       - 链表长度达到树化阈值后尝试 treeifyBin
6. size + 1
7. 如果 size > threshold，触发 resize 扩容
```

**面试表达**：
> HashMap 1.8 的 put 流程是先扰动 hash，再通过 `(n - 1) & hash` 定位桶。如果桶为空直接放新节点；如果桶不为空，先比较桶头，再判断是红黑树还是链表。链表中如果找到相同 key 就覆盖 value，找不到就尾插。插入后如果链表长度达到阈值，会尝试树化；最后如果 size 超过 threshold，就触发扩容。

##### Q2：`get` 方法的源码流程是什么？

`get(key)` 的核心是 `getNode(hash(key), key)`。

流程如下：

```text
1. 计算 key 的 hash
2. 根据 (n - 1) & hash 定位桶
3. 如果桶为空，返回 null
4. 先判断桶头节点是否匹配
5. 如果桶头匹配，直接返回
6. 如果是红黑树，走 getTreeNode 查找
7. 如果是链表，遍历链表逐个比较 hash 和 key
8. 找到返回 value，找不到返回 null
```

比较 key 是否相等时，并不是只比较 `hash`，还会比较：

```java
(k = p.key) == key || (key != null && key.equals(k))
```

也就是说，先比较引用地址，再比较 `equals`。

**面试表达**：
> HashMap 的 get 不是全表扫描，而是先计算 hash 定位桶，然后优先判断桶头节点。桶内如果是链表就遍历链表，如果是红黑树就走树查找。真正判断 key 相等时，既看 hash，也会用 `==` 和 `equals` 比较 key。

##### Q3：HashMap 为什么允许 key 为 null？

HashMap 对 `null` key 做了特殊处理：

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

当 key 为 `null` 时，hash 直接返回 `0`，因此 `null` key 会放在数组下标 `0` 对应的桶中。

注意：

1. HashMap 允许一个 `null` key。
2. HashMap 允许多个 `null` value。
3. ConcurrentHashMap 不允许 key 或 value 为 null，主要是为了避免并发场景下 `get(key) == null` 时无法区分“key 不存在”还是“value 本身为 null”。

**面试表达**：
> HashMap 允许 null key，因为它在 hash 方法里对 null 做了特殊处理，null key 的 hash 固定为 0，最终会落到 0 号桶。HashMap 也允许 null value；但 ConcurrentHashMap 不允许 null，是为了避免并发环境下语义歧义。

##### Q4：HashMap 如何处理 key 重复？

HashMap 判断 key 重复的条件是：

```text
hash 相同，并且 key 地址相同或 equals 相等
```

如果重复：

```text
不会新增节点，而是覆盖旧 value，并返回旧 value
```

所以面试中要注意：

1. `hashCode` 决定先落到哪个桶。
2. `equals` 决定桶内是否是同一个 key。
3. 只重写 `equals` 不重写 `hashCode`，可能导致逻辑相等的对象落到不同桶里，Map 中出现重复逻辑 key。

**面试表达**：
> HashMap 不是只靠 hashCode 判断 key 是否重复。hashCode 只是用于定位桶，桶内还要通过 `==` 或 `equals` 判断 key 是否相同。如果 key 相同，新的 value 会覆盖旧 value；如果只重写 equals 不重写 hashCode，就可能破坏 Map 的语义。

##### Q5：为什么重写 equals 时必须重写 hashCode？

核心规则：

```text
如果 a.equals(b) == true，那么 a.hashCode() 必须等于 b.hashCode()
```

因为 `HashMap`、`HashSet`、`ConcurrentHashMap` 这类哈希集合判断两个对象是不是同一个 key，通常分两步：

1. 先根据 `hashCode()` 计算 hash，定位数组桶。
2. 再在桶内用 `==` 或 `equals()` 判断 key 是否真正相等。

简化逻辑类似：

```java
if (node.hash == hash &&
    (node.key == key || key.equals(node.key))) {
    // 认为是同一个 key，覆盖 value
}
```

**只重写 equals，不重写 hashCode 的问题**

假设两个 `User` 对象业务上按 `id` 判断相等：

```java
User u1 = new User(1L);
User u2 = new User(1L);
```

如果只重写 `equals()`，那么：

```text
u1.equals(u2) == true
```

但没有重写 `hashCode()` 时，会继承 `Object.hashCode()`，通常和对象地址有关：

```text
u1.hashCode() != u2.hashCode()
```

放入 `HashSet` 或作为 `HashMap` key 时，两个对象可能落到不同桶，后续根本不会走到 `equals()` 比较，结果就是逻辑相等的对象重复插入，或者用另一个等价对象查询不到旧数据。

**只重写 hashCode，不重写 equals 的问题**

如果两个对象 hash 一样，但 `equals()` 仍然使用 `Object.equals()`，默认比较引用地址：

```text
u1.equals(u2) == false
```

即使它们落到同一个桶，集合遍历桶内节点时也会认为不是同一个 key，仍然可能重复插入。

**面试表达**：
> `equals` 表示两个对象在业务语义上是否相等，`hashCode` 用于哈希集合定位桶。`HashMap`、`HashSet` 会先根据 `hashCode` 找桶，再用 `equals` 判断桶内 key 是否相同。如果只重写 `equals` 不重写 `hashCode`，业务相等的对象可能落到不同桶，导致重复插入或查询不到；如果只重写 `hashCode` 不重写 `equals`，即使落到同一个桶，也会因为引用不同被当成不同对象。所以重写 `equals` 时必须同时重写 `hashCode`，保证 `equals` 为 true 的对象 hashCode 一定相同。

##### Q6：为什么数组长度必须是 2 的幂？

HashMap 使用 `(n - 1) & hash` 定位数组下标。这个写法只有在 `n` 是 2 的幂时，才等价于 `hash % n`。

| 点 | 说明 |
| :--- | :--- |
| 位运算效率更高 | 当长度是 2 的幂时，`hash % length` 等价于 `hash & (length - 1)`，位运算比取模更轻量 |
| 哈希分布更均匀 | `length - 1` 的低位全是 `1`，能更完整地利用 hash 低位；如果不是 2 的幂，部分桶很难命中 |
| 扩容机制更简单高效 | 扩容翻倍后只多看 hash 的一位，元素只会留在原位置或移动到 `原位置 + oldCap` |
| `tableSizeFor` | 把传入容量调整为大于等于它的最小 2 的幂，如 `10 -> 16`、`17 -> 32` |

**例子：`n = 16` 时怎么计算**

数组长度 `n = 16` 时，`n - 1 = 15 = 0000 1111`：

```text
hash = 27 = 0001 1011

27 % 16 = 11

0001 1011
0000 1111
---------
0000 1011 = 11
```

如果数组长度是 `10`，`n - 1 = 9 = 0000 1001`，用 `hash & 9` 会让结果集中在少数桶上，例如 `0、1、8、9`，而 `2、3、4、5、6、7` 很难命中，冲突会变多。所以 HashMap 会把容量调整成 2 的幂。

**最后总结：为什么 HashMap 长度要是 2 的幂？**

1. **位运算效率更高**：当数组长度是 2 的幂时，`hash % length` 等价于 `hash & (length - 1)`，可以用按位与替代取模。
2. **哈希分布更均匀**：`length - 1` 的低位全是 `1`，配合扰动后的 hash，可以更充分利用低位信息。如果旧数组中 hash 分布比较均匀，扩容后也更容易均匀拆分，理想情况下原桶节点大约一半留在前半部分，一半移动到后半部分。
3. **扩容机制更简单高效**：HashMap 每次扩容都是容量翻倍，比如 `16 -> 32`。新下标只比旧下标多看 hash 的一位，这一位是 `0` 就留在原位置，是 `1` 就移动到 `原位置 + oldCap`，不需要重新计算 hash。

**面试表达**：
> HashMap 数组长度是 2 的幂，主要有三个原因。第一，`hash % length` 可以等价转换成 `hash & (length - 1)`，位运算效率更高；第二，`length - 1` 的低位全是 1，可以更好地利用 hash 低位，让元素分布更均匀；第三，扩容时容量翻倍，只需要检查 hash 新参与寻址的那一位，元素要么留在原位置，要么移动到 `原位置 + oldCap`，迁移逻辑简单高效。

##### Q6：链表什么时候树化？为什么不是一达到 8 就一定树化？

树化相关阈值：

```text
TREEIFY_THRESHOLD = 8
UNTREEIFY_THRESHOLD = 6
MIN_TREEIFY_CAPACITY = 64
```

当桶内链表长度达到 8 时，会调用 `treeifyBin`，但它会先判断数组容量：

```text
如果 table.length < 64，优先扩容
如果 table.length >= 64，才树化
```

原因是：如果数组容量太小，冲突可能是数组太短导致的，此时扩容比分裂成红黑树更划算。

**面试表达**：
> HashMap 1.8 并不是链表长度到 8 就一定树化。它还要求数组容量至少达到 64。如果容量小于 64，会优先扩容，因为冲突可能只是数组太小导致的。只有容量足够大、链表仍然很长，才说明 hash 冲突比较严重，适合转红黑树。

##### Q7：为什么 HashMap 1.8 要引入红黑树？什么是红黑树？有什么好处？

JDK 1.8 引入红黑树，核心是为了避免**哈希冲突严重时，桶内链表过长导致查询性能退化**。

JDK 1.7 的 HashMap 底层主要是：

```text
数组 + 链表
```

如果大量 key 落到同一个桶里，桶内链表会越来越长，查找时可能要从头遍历到尾，时间复杂度会从平均 `O(1)` 退化成 `O(n)`。

JDK 1.8 改成：

```text
数组 + 链表 + 红黑树
```

当桶内链表长度达到 `8`，并且数组长度至少为 `64` 时，链表会树化为红黑树。红黑树可以把极端冲突下的查询复杂度从 `O(n)` 降低到 `O(log n)`。

**红黑树是什么？**

红黑树是一种**近似平衡的二叉搜索树**。它通过颜色和旋转规则，保证树不会严重倾斜。

可以简单记住几个关键点：

| 特点 | 作用 |
| :--- | :--- |
| 节点分红色和黑色 | 用颜色规则约束树的高度 |
| 根节点是黑色 | 保持规则统一 |
| 红色节点不能连续出现 | 避免局部过长 |
| 从任意节点到叶子节点的黑色节点数相同 | 保证左右路径不会差距过大 |

这些规则的目的不是为了“绝对平衡”，而是为了保证树**大致平衡**，让查询、插入、删除都能保持在 `O(log n)` 级别。

**`O(log n)` 是怎么来的？**

对于一棵近似平衡的二叉搜索树，每往下一层，最多能容纳的节点数大约翻倍：

```text
第 1 层：1 个节点
第 2 层：2 个节点
第 3 层：4 个节点
第 4 层：8 个节点
```

如果树高是 `h`，能容纳的节点数大约是 `2^h`。反过来，有 `n` 个节点时，树高大约就是：

```text
h = log2(n)
```

查找时最多从根节点走到叶子节点，路径长度约等于树高，所以复杂度是 `O(log n)`。

几个直观例子：

| 节点数 n | 大约查找次数 log2(n) |
| :--- | :--- |
| 8 | 3 次 |
| 16 | 4 次 |
| 1024 | 10 次 |
| 100 万 | 约 20 次 |

所以 HashMap 桶内链表如果很长，最坏要查 `n` 次；树化成红黑树后，查找次数会接近树高，也就是 `log n` 级别。

**为什么不一开始就用红黑树？**

因为红黑树也有成本：

- 节点结构更复杂，要维护父节点、左右子节点和颜色；
- 插入、删除时可能需要旋转和变色；
- 节点数量少时，链表遍历反而更简单；
- 如果数组容量太小，优先扩容通常比树化更有效。

所以 HashMap 只有在“数组容量够大，并且单个桶冲突仍然严重”时才树化。

**面试表达**：
> HashMap 1.8 引入红黑树，是为了解决哈希冲突严重时链表过长导致查询性能从 `O(1)` 退化到 `O(n)` 的问题。当桶内链表长度达到 8，并且数组容量至少为 64 时，链表会树化为红黑树，把极端情况下的查询复杂度优化到 `O(log n)`。不过红黑树维护成本更高，所以 HashMap 不会一开始就使用红黑树，而是在冲突严重时才转换。

##### Q8：HashMap 扩容时原位置会变吗？为什么不用重新计算 hash？

会有两种情况：**可能还在原数组下标，也可能移动到 `原下标 + oldCap`**。

JDK 1.8 扩容时容量翻倍，例如 `16 -> 32`。因为新容量只是比旧容量多看了 hash 的一位，所以节点新位置只有两种可能：

| 判断 | 新位置 |
| :--- | :--- |
| `(hash & oldCap) == 0` | 原位置 |
| `(hash & oldCap) != 0` | 原位置 + `oldCap` |

例如原数组长度是 `16`，某个元素原来在下标 `5`，扩容到 `32` 后，它只可能在：

```text
5
或者 5 + 16 = 21
```

**例子：`16 -> 32` 扩容时怎么移动**

旧容量 `oldCap = 16`，新容量 `newCap = 32`：

```text
旧掩码：15 = 0 1111
新掩码：31 = 1 1111
```

扩容后只多看最左边这一位：

```text
hash 低 5 位 = 0 1011 -> oldIndex = 11，newIndex = 11
hash 低 5 位 = 1 1011 -> oldIndex = 11，newIndex = 27 = 11 + 16
```

这就是为什么用 `(hash & oldCap)` 判断即可。

这样做的好处：

1. 不需要重新计算 hash。
2. 不需要重新逐个取模。
3. 链表拆分更高效。
4. JDK 1.8 使用尾插法，避免 JDK 1.7 头插法在并发扩容时可能形成环的问题。

**面试表达**：
> HashMap 1.8 扩容时，元素扩容后的新位置可能和原位置一样，也可能移动到 `原位置 + oldCap`。这是因为 HashMap 每次扩容都是容量翻倍，新数组计算下标时只比旧数组多看了 hash 的一位。源码通过 `(hash & oldCap)` 判断，如果结果为 0，节点留在原位置；否则移动到 `原位置 + oldCap`，不需要重新计算 hash。

##### Q9：HashMap 1.7 和 1.8 有哪些关键区别？

| 对比项 | JDK 1.7 | JDK 1.8 |
| :--- | :--- | :--- |
| 底层结构 | 数组 + 链表 | 数组 + 链表 + 红黑树 |
| 插入方式 | 头插法 | 尾插法 |
| 扩容迁移 | 重新 hash / 头插迁移 | 高低位拆分，原位置或原位置 + oldCap |
| 并发问题 | 扩容时可能形成链表环 | 避免了 1.7 头插成环问题，但仍然线程不安全 |
| 查询性能 | 冲突严重时链表 O(n) | 冲突严重且树化后 O(log n) |

**面试表达**：
> JDK 1.8 的 HashMap 相比 1.7 最大变化是引入红黑树、链表尾插法和扩容高低位拆分。红黑树降低极端冲突下的查询复杂度，尾插法避免 1.7 扩容头插可能导致链表成环，高低位拆分减少了扩容时重新计算 hash 的成本。但 HashMap 1.8 仍然不是线程安全的。

##### Q10：HashMap 1.8 为什么是线程不安全的？什么场景下会出问题？

`HashMap` 1.8 线程不安全的根因是：`put`、`get`、`resize` 都没有加锁，内部的 `table`、链表/红黑树节点、`size`、`modCount` 等共享状态也不是按并发容器设计的。

JDK 1.8 改成尾插法后，确实避免或缓解了 JDK 1.7 扩容头插法可能导致的链表成环问题，但这不代表它线程安全。并发读写时仍然可能出现：

| 问题 | 说明 |
| :--- | :--- |
| 数据丢失 | 两个线程同时 `put` 到同一个空桶，都判断桶为空，后写入的节点可能覆盖先写入的节点 |
| `size` 不准确 | `++size` 不是原子操作，多线程同时写入可能导致计数丢失 |
| 扩容期间状态不一致 | 一个线程正在 `resize`，另一个线程同时 `get` 或 `put`，可能读到旧表、新表迁移中的中间状态 |
| 遍历时并发修改 | 一个线程遍历，另一个线程修改，可能抛 `ConcurrentModificationException`，而且 fail-fast 只是尽力检测，不是线程安全保证 |

典型危险场景：

```java
private static final Map<String, Object> CACHE = new HashMap<>();
```

如果把 `HashMap` 当作全局缓存、静态 Map、单例对象字段，在 Web 请求线程、线程池任务、定时任务中同时读写，尤其是并发写入、边读边写、写入触发扩容时，就容易出问题。

**三点总结**

1. `HashMap` 1.8 没有并发控制，内部数组、节点、`size` 等共享状态都可能被多个线程同时修改。
2. JDK 1.8 解决的是 1.7 头插法扩容可能成环的问题，不等于解决线程安全问题。
3. 多线程读写场景应该使用 `ConcurrentHashMap`，或者外部加锁；如果初始化完成后只读，并且对象被安全发布，通常可以并发读。

**面试表达**：
> HashMap 1.8 不是线程安全的，因为它没有任何并发控制。多线程同时 put 时，可能在同一个桶位发生覆盖，导致数据丢失；size 自增也不是原子操作；如果并发写入触发 resize，还可能读到迁移过程中的中间状态，出现数据不可见、查不到或结构不一致等问题。JDK 1.8 虽然避免了 JDK 1.7 头插法扩容可能导致的链表成环问题，但它仍然不是并发容器。多线程场景应该用 ConcurrentHashMap，或者外部加锁。

##### Q11：HashSet 底层是不是使用 HashMap 的 key？

是的。`HashSet` 底层就是基于 `HashMap` 实现的，`HashSet` 中的元素实际存放在 `HashMap` 的 **key** 上。

源码思路可以简化理解成：

```java
public class HashSet<E> {
    private transient HashMap<E, Object> map;

    private static final Object PRESENT = new Object();

    public boolean add(E e) {
        return map.put(e, PRESENT) == null;
    }
}
```

也就是说：

| HashSet | HashMap |
| :--- | :--- |
| set 中的元素 | map 的 key |
| 固定占位对象 `PRESENT` | map 的 value |

例如：

```java
Set<String> set = new HashSet<>();
set.add("A");
set.add("B");
```

底层可以理解成：

```java
map.put("A", PRESENT);
map.put("B", PRESENT);
```

所以 `HashSet` 不允许重复元素，本质上是依赖 `HashMap` 的 key 唯一性。再次添加相同元素时，会调用 `map.put(e, PRESENT)`，如果 key 已经存在，只会覆盖 value，不会新增一个 key。

**面试表达**：
> HashSet 底层基于 HashMap 实现，HashSet 中的元素实际存放在 HashMap 的 key 上，value 使用一个固定的 Object 常量 `PRESENT` 作为占位对象。HashSet 不允许重复元素，本质上是依赖 HashMap 的 key 唯一性，通过 `hashCode` 和 `equals` 判断元素是否重复。

##### Q12：JDK 1.8 的 ConcurrentHashMap 相比 HashMap 只是加了 synchronized 吗？Segment 是否只是为了兼容旧版本？

不是。JDK 1.8 的 `ConcurrentHashMap` 不是简单地在 `HashMap` 外面套一层 `synchronized`。

更准确地说，JDK 1.8 的 `ConcurrentHashMap` 主要依赖：

```text
数组 + 链表 + 红黑树 + CAS + volatile + synchronized 桶级锁 + 协助扩容
```

它确实用了 `synchronized`，但不是锁整个 Map，而是**只锁当前桶的头节点**。比如桶内发生冲突，需要链表插入或红黑树插入时，才会进入类似下面的逻辑：

```java
synchronized (f) {
    // f 是当前桶的头节点
    // 只锁当前桶，其他桶仍然可以并发读写
}
```

所以它和 `Hashtable` 或 `Collections.synchronizedMap` 最大区别是：锁粒度更小，并发能力更强。

**JDK 1.8 ConcurrentHashMap 的核心点**

| 能力 | 说明 |
| :--- | :--- |
| CAS | 空桶插入时优先使用 CAS，不加锁 |
| volatile | `table`、节点 `val`、`next` 等字段通过 volatile 保证可见性 |
| synchronized 桶级锁 | 发生哈希冲突时，只锁当前桶头节点，不锁整个 Map |
| 红黑树 | 冲突严重时树化，降低桶内查询复杂度 |
| 协助扩容 | 扩容时多个线程可以一起迁移数据 |
| 不允许 null | 避免并发场景下无法区分“key 不存在”和“value 本身为 null” |

**线程安全具体怎么保证？**

可以按读、写、初始化、扩容四个阶段理解：

1. **读操作基本无锁**：`get` 根据 hash 定位桶，再遍历链表或红黑树。`table`、`Node.val`、`Node.next` 等关键字段配合 `volatile` 保证可见性，所以读线程不需要锁住整个 Map。
2. **空桶写入用 CAS**：如果目标桶为空，直接通过 CAS 把新节点放到数组对应位置，成功就不需要加锁。
3. **非空桶写入锁桶头**：如果目标桶已有节点，说明发生 hash 冲突，此时对桶头节点 `synchronized` 加锁，在锁内完成链表追加、覆盖 value 或红黑树插入。
4. **扩容支持协助迁移**：扩容时不是一个线程搬完整张表，多个写线程发现正在扩容后可以一起迁移桶数据，降低单线程扩容带来的阻塞。

所以 JDK 1.8 的核心不是“所有操作都加锁”，而是：

```text
读尽量无锁 + 空桶 CAS + 冲突桶 synchronized + volatile 可见性 + 协助扩容
```

**Segment 还在吗？**

JDK 1.7 的 `ConcurrentHashMap` 使用的是：

```text
Segment 数组 + HashEntry 数组 + 链表
```

`Segment` 本质上是一把分段锁，不同 Segment 可以并发操作。

JDK 1.8 中，主流程已经不再使用 `Segment` 做并发控制，而是改成：

```text
CAS + synchronized 锁桶头节点
```

源码里保留 `Segment`，主要是为了**兼容 JDK 1.7 的序列化结构**，不是核心并发控制结构。

**JDK 1.7 和 JDK 1.8 关键区别**

| 对比项 | JDK 1.7 及之前 | JDK 1.8 之后 |
| :--- | :--- | :--- |
| 底层结构 | `Segment[] + HashEntry[] + 链表` | `Node[] + 链表 + 红黑树` |
| 加锁方式 | `Segment` 分段锁，基于 `ReentrantLock` | CAS + `synchronized` 锁桶头节点 |
| 锁粒度 | 一个 `Segment` | 一个 hash 桶 |
| 并发度 | 主要受 `Segment` 数量限制，默认并发级别 16 | 冲突少时并发度更高，按桶竞争 |
| 查询优化 | 桶内链表 | 链表过长可树化为红黑树 |
| 扩容方式 | 每个 `Segment` 内部单独扩容 | 多线程协助迁移整张表 |

**数组初始化时 CAS 怎么保证只有一个线程执行？**

JDK 1.8 的 `ConcurrentHashMap` 延迟初始化数组，第一次 `put` 时如果发现 `table` 为空，会进入 `initTable()`。它不是用 `synchronized` 锁住整个初始化方法，而是用 `sizeCtl` 这个控制字段配合 CAS。

`sizeCtl` 的典型含义：

```text
sizeCtl = 0      默认状态，数组还没初始化
sizeCtl > 0      初始化容量，或下一次扩容阈值
sizeCtl = -1     当前有线程正在初始化 table
sizeCtl < -1     当前正在扩容，并记录协助扩容线程信息
```

初始化流程可以简化成：

```java
while ((tab = table) == null || tab.length == 0) {
    if ((sc = sizeCtl) < 0) {
        Thread.yield();
    } else if (CAS(sizeCtl, sc, -1)) {
        try {
            if ((tab = table) == null || tab.length == 0) {
                int n = (sc > 0) ? sc : DEFAULT_CAPACITY;
                Node<K,V>[] nt = new Node[n];
                table = nt;
                sc = n - (n >>> 2);
            }
        } finally {
            sizeCtl = sc;
        }
        break;
    }
}
```

关键点：

- 多个线程同时发现 `table` 为空时，都会尝试 CAS 修改 `sizeCtl`。
- 只有一个线程能把 `sizeCtl` 从非负数改成 `-1`，CAS 成功的线程负责创建数组。
- 其他线程看到 `sizeCtl < 0`，说明有人正在初始化，会让出 CPU 或循环等待。
- 初始化线程创建 `Node[]` 后，把数组赋值给 `volatile table`，其他线程能看到初始化结果。
- 最后把 `sizeCtl` 设置为扩容阈值，例如默认容量 16 时，阈值大约是 12。

**JDK 1.8 到底在哪里加 synchronized？**

`synchronized` 主要加在 `putVal()` 中桶不为空的分支，锁的是当前桶的头节点 `f`，不是整个 `ConcurrentHashMap`。

简化流程：

```java
for (Node<K,V>[] tab = table;;) {
    if (tab == null || tab.length == 0) {
        tab = initTable();
    } else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
        if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null))) {
            break;
        }
    } else if ((fh = f.hash) == MOVED) {
        tab = helpTransfer(tab, f);
    } else {
        synchronized (f) {
            if (tabAt(tab, i) == f) {
                if (fh >= 0) {
                    // 链表：遍历、覆盖 value 或尾插新节点
                } else if (f instanceof TreeBin) {
                    // 红黑树：插入或更新树节点
                }
            }
        }
    }
}
```

这段逻辑可以拆成三种情况：

- **桶为空**：直接 CAS 插入新节点，不加锁。
- **桶头是 `MOVED`**：说明正在扩容，当前线程去协助迁移。
- **桶不为空且不是迁移节点**：说明要修改链表或红黑树结构，此时 `synchronized(f)` 锁住当前桶头节点。

锁内还会做一次：

```java
if (tabAt(tab, i) == f)
```

原因是线程等待锁期间，当前桶可能已经被其他线程修改，或者被扩容迁移。如果不二次校验，就可能拿着旧桶头去修改已经过期的结构。

**面试追问表达**

> JDK 1.8 的 ConcurrentHashMap 在 `putVal` 中桶不为空时加 `synchronized`，锁的是当前桶头节点 `f`。空桶插入直接 CAS；如果桶头 hash 是 `MOVED`，说明正在扩容，会协助迁移；只有发生 hash 冲突、需要修改链表或红黑树结构时，才 `synchronized(f)`。锁内还会校验 `tabAt(tab, i) == f`，确保锁住的仍是当前桶头，所以它是桶级锁，不是整表锁。

**面试表达**：
> JDK 1.8 的 ConcurrentHashMap 不是简单给 HashMap 加 synchronized。它采用 CAS + synchronized 的组合，空桶插入时用 CAS，发生哈希冲突时只对当前桶头节点加 synchronized，锁粒度是桶级别。同时 table、Node 的 value、next 等字段配合 volatile 保证可见性，并支持多线程协助扩容。JDK 1.8 中 Segment 已经不再作为分段锁使用，主要是为了兼容 JDK 1.7 的序列化结构。

如果面试官继续追问数组初始化，可以补一句：

> ConcurrentHashMap 初始化数组时靠 `sizeCtl` 控制状态。线程发现 `table` 为空后，会 CAS 把 `sizeCtl` 从非负数改成 `-1`，CAS 成功者负责创建数组；其他线程看到 `sizeCtl < 0` 就知道有人正在初始化，只需要等待。数组创建完成后写入 `volatile table`，再把 `sizeCtl` 改成扩容阈值，所以并发情况下只有一个线程真正初始化 table。

---

### 2.4. TreeMap / LinkedHashMap / WeakHashMap

* **TreeMap**：基于**红黑树**实现的有序 Map。它支持按照 Key 的自然顺序（Comparable）或自定义比较器（Comparator）进行排序，适用于有顺序遍历需求的场景。
* **LinkedHashMap**：继承自 `HashMap`，其内部维护了一个**双向链表**，记录了元素的插入顺序或访问顺序（支持 LRU 算法）。可以作为构建局部 **LRU（最近最少使用）缓存** 的基石。
* **WeakHashMap**：内部的 Entry 的 Key 是**弱引用（WeakReference）**。当该 Key 对象的外部强引用失效后，下一次垃圾回收（GC）时，即使该 Entry 还在 WeakHashMap 中，Key 也会被回收，随后对应的 Entry 会被自动清理。适用于**临时元数据缓存**。

### 2.5. LRU 缓存是什么？如何实现 get 和 put 都是 O(1)？

#### Q1：什么是 LRU？

LRU 是 **Least Recently Used**，意思是最近最少使用。它是一种缓存淘汰策略：当缓存容量满了，需要淘汰一个数据时，优先淘汰**最久没有被访问过的数据**。

例如缓存容量是 3，访问顺序是：

```text
A -> B -> C
```

此时如果再访问 `D`，缓存满了，LRU 会淘汰最久没有访问的 `A`：

```text
B -> C -> D
```

LRU 的核心假设是：最近被访问过的数据，未来更可能再次被访问；很久没访问的数据，未来被访问的概率更低。

#### Q2：什么是 LRU 缓存？

LRU 缓存就是基于 LRU 淘汰策略实现的缓存结构，通常提供两个操作：

```java
get(key)
put(key, value)
```

规则：

1. `get(key)`：如果 key 存在，返回 value，并把该 key 标记为最近使用。
2. `put(key, value)`：如果 key 已存在，更新 value，并标记为最近使用。
3. 如果插入新 key 后容量超限，淘汰最近最少使用的 key。

容量为 2 的例子：

```text
put(1, 10)  -> [1]
put(2, 20)  -> [2, 1]
get(1)      -> 返回 10，缓存变为 [1, 2]
put(3, 30)  -> 淘汰 2，缓存变为 [3, 1]
get(2)      -> 返回 -1
```

这里约定左边是最近使用，右边是最久未使用。

#### Q3：要求 get 和 put 都是 O(1)，怎么实现？

经典方案是：

```text
HashMap + 双向链表
```

职责拆分：

| 结构 | 作用 |
| :--- | :--- |
| `HashMap` | 根据 key 在 O(1) 时间内定位节点 |
| 双向链表 | 在 O(1) 时间内移动节点、删除尾节点 |

链表约定：

```text
head 后面是最近使用节点
tail 前面是最久未使用节点
```

为什么不能只用一种结构？

- 只用链表：能维护访问顺序，但查找 key 是 O(n)。
- 只用 HashMap：查找是 O(1)，但不知道谁最久没用。
- HashMap + 双向链表：既能快速查找，又能快速调整访问顺序。

Java 实现：

```java
import java.util.HashMap;
import java.util.Map;

public class LRUCache {

    private static class Node {
        int key;
        int value;
        Node prev;
        Node next;

        Node() {
        }

        Node(int key, int value) {
            this.key = key;
            this.value = value;
        }
    }

    private final int capacity;
    private final Map<Integer, Node> map;
    private final Node head;
    private final Node tail;

    public LRUCache(int capacity) {
        if (capacity <= 0) {
            throw new IllegalArgumentException("capacity must be positive");
        }
        this.capacity = capacity;
        this.map = new HashMap<>();
        this.head = new Node();
        this.tail = new Node();
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        Node node = map.get(key);
        if (node == null) {
            return -1;
        }
        moveToHead(node);
        return node.value;
    }

    public void put(int key, int value) {
        Node node = map.get(key);
        if (node != null) {
            node.value = value;
            moveToHead(node);
            return;
        }

        Node newNode = new Node(key, value);
        map.put(key, newNode);
        addToHead(newNode);

        if (map.size() > capacity) {
            Node removed = removeTail();
            map.remove(removed.key);
        }
    }

    private void moveToHead(Node node) {
        removeNode(node);
        addToHead(node);
    }

    private void addToHead(Node node) {
        node.prev = head;
        node.next = head.next;
        head.next.prev = node;
        head.next = node;
    }

    private void removeNode(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    private Node removeTail() {
        Node node = tail.prev;
        removeNode(node);
        return node;
    }
}
```

#### Q4：为什么 get 和 put 都是 O(1)？

`get(key)`：

1. `map.get(key)` 平均 O(1) 找到节点。
2. 命中后通过 `prev`、`next` 指针把节点移动到头部，O(1)。

`put(key, value)`：

1. key 已存在：O(1) 找到节点，更新 value，移动到头部。
2. key 不存在：O(1) 插入 HashMap，O(1) 加到链表头。
3. 超容量：删除 `tail.prev`，O(1) 找到最久未使用节点，再从 HashMap 删除。

所以整体平均时间复杂度是 O(1)。

#### Q5：用 LinkedHashMap 能不能实现 LRU？

可以。`LinkedHashMap` 支持按访问顺序维护链表，只要开启 `accessOrder = true`，再重写 `removeEldestEntry` 即可。

`LinkedHashMap` 继承自 `HashMap`，底层仍然用哈希表存 key/value，但它额外维护了一条双向链表。这条链表可以按两种顺序维护：

```text
插入顺序：insertion-order
访问顺序：access-order
```

默认是插入顺序。如果要支持 LRU，需要使用构造方法的第三个参数：

```java
new LinkedHashMap<>(capacity, 0.75f, true);
```

这里的 `true` 表示 `accessOrder = true`。开启后，每次 `get` 或更新已有 key 时，都会把该节点移动到链表尾部。

例如：

```java
LinkedHashMap<Integer, Integer> map =
        new LinkedHashMap<>(16, 0.75f, true);

map.put(1, 10);
map.put(2, 20);
map.put(3, 30);
```

初始顺序：

```text
1 -> 2 -> 3
```

访问 `1`：

```java
map.get(1);
```

顺序变成：

```text
2 -> 3 -> 1
```

此时链表头部是最久未使用，链表尾部是最近使用。

淘汰由 `removeEldestEntry` 控制：

```java
protected boolean removeEldestEntry(Map.Entry<K,V> eldest)
```

每次 `put` 新元素后，`LinkedHashMap` 会调用这个方法。如果返回 `true`，就删除链表头部最老的节点。

```java
import java.util.LinkedHashMap;
import java.util.Map;

public class LRUCacheByLinkedHashMap extends LinkedHashMap<Integer, Integer> {

    private final int capacity;

    public LRUCacheByLinkedHashMap(int capacity) {
        super(capacity, 0.75f, true);
        this.capacity = capacity;
    }

    public int getValue(int key) {
        return super.getOrDefault(key, -1);
    }

    public void putValue(int key, int value) {
        super.put(key, value);
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
        return size() > capacity;
    }
}
```

为什么这就是 LRU？

```text
get / put 已存在 key -> 节点移动到链表尾部
链表头部 -> 最久未使用
链表尾部 -> 最近使用
size() > capacity -> 删除链表头部节点
```

注意：

- `removeEldestEntry` 只会在 `put` 后触发，不会因为单纯 `get` 触发淘汰。
- `LinkedHashMap` 本身不是线程安全的，多线程环境需要外部加锁，或者使用 Caffeine 这类成熟本地缓存框架。
- 手写 LRU 更适合考察数据结构能力，`LinkedHashMap` 更适合说明 Java 标准库已经内置了类似能力。

**面试表达**：

> LRU 是最近最少使用，缓存满时淘汰最久没访问的数据。要让 `get` 和 `put` 都是 O(1)，一般用 HashMap + 双向链表。HashMap 负责 O(1) 定位节点，双向链表负责维护访问顺序。每次 `get` 命中或 `put` 更新，都把节点移动到链表头；容量超限时删除尾节点，也就是最久未使用节点。因为查找、移动、删除都是 O(1)，所以整体平均 O(1)。如果不要求手写，也可以用 `LinkedHashMap` 实现：构造时设置 `accessOrder = true`，让链表按访问顺序维护；再重写 `removeEldestEntry`，当 `size() > capacity` 时返回 `true`，自动删除链表头部最老节点。需要注意 `LinkedHashMap` 不是线程安全的。

---

## 3. Java 中的深拷贝与浅拷贝

### 核心概念
* **浅拷贝（Shallow Copy）**：新建一个对象，拷贝其基本数据类型字段的值；若字段是引用类型，则仅拷贝其引用地址。此时，新旧对象依然指向同一个子对象，修改子对象内容会相互影响。
  * **代表**：默认的 `Object.clone()` 方法。
* **深拷贝（Deep Copy）**：新建一个对象，递归克隆其所有引用类型字段指向的子对象，新旧对象在内存中彻底隔离。

```text
浅拷贝:
[原对象] --(childRef)--> [子对象]
                          ^
[新对象] --(childRef)-----+ (指向同一个子对象)

深拷贝:
[原对象] --(childRef)--> [子对象 A]
[新对象] --(childRef)--> [子对象 B] (完全隔离副本)
```

### 两种主流的深拷贝实现方案

1. **重写 clone 方法（不推荐）**：
   * 让链条上的所有类都实现 `Cloneable` 接口并重写 `clone()`，在 `clone()` 中显式地手动调用子对象的 `clone()` 进行重新赋值。
   * **缺点**：嵌套层级深时开发成本极高，容易遗漏，维护困难。
2. **基于序列化/反序列化（推荐 ⭐⭐⭐⭐⭐）**：
   * **原理**：将对象写入字节流（流式持久化），再从字节流中读出（反序列化）。在这个过程中，JVM 会在堆中重新生成一套结构完全相同的全新对象树。
   * **Java 核心代码**：
     ```java
     public static <T extends Serializable> T deepCopy(T obj) {
         try {
             ByteArrayOutputStream bos = new ByteArrayOutputStream();
             ObjectOutputStream oos = new ObjectOutputStream(bos);
             oos.writeObject(obj);
             
             ByteArrayInputStream bis = new ByteArrayInputStream(bos.toByteArray());
             ObjectInputStream ois = new ObjectInputStream(bis);
             return (T) ois.readObject();
         } catch (Exception e) {
             throw new RuntimeException("深拷贝失败", e);
         }
     }
     ```
   * **注意**：使用此方案时，链上的所有对象必须实现 `java.io.Serializable` 接口。生产中也常用 JSON 工具（Gson / Jackson）的序列化来实现深拷贝。

---

## 4. Java 异常体系与 try-catch-finally 陷阱

### 4.1. 异常分类

```text
               +-----------------+
               |    Throwable    |
               +--------+--------+
                        |
           +------------+------------+
           v                         v
     +-----------+             +-----------+
     |   Error   |             | Exception |
     +-----------+             +-----+-----+
                                     |
                       +-------------+-------------+
                       v                           v
             +-------------------+       +-------------------+
             | Checked Exception |       | Runtime Exception |
             |   (受检异常)      |       |   (运行时异常)     |
             +-------------------+       +-------------------+
```

* **Error（错误）**：通常为 JVM 级别发生的严重系统问题，程序无法处理，如 `OutOfMemoryError`（OOM）、`StackOverflowError`（栈溢出）。业务代码不应该通过 `catch` 捕获它们。
* **Exception（异常）**：可以且应该被程序处理的异常：
  * **Unchecked / Runtime Exception（运行时异常）**：继承自 `RuntimeException`。编译阶段无需强制处理，通常由业务逻辑漏洞引起，如 `NullPointerException`（空指针）、`ArrayIndexOutOfBoundsException`（数组越界）、`ClassCastException`（类型转换异常）。
  * **Checked Exception（受检/编译期异常）**：除 RuntimeException 外的 Exception。编译阶段**强制要求**必须进行 `try-catch` 捕获或者在方法签名中 `throws` 声明，如 `IOException`、`SQLException`。

---

### 4.2. try-catch-finally 执行顺序与 return 陷阱

在 `try-catch-finally` 中存在经典 return 规则：
1. **finally 块中的 return 会覆盖 try/catch 中的 return**。
2. 如果 `try` 中有 `return` 语句，会先计算 `return` 表达式的值并将其**暂存在局部变量表（栈帧）的临时变量中**，随后执行 `finally` 块。
   * **基本数据类型**：在 `finally` 中修改 `try` 中即将返回的变量，**不会**影响最终返回的值。
   * **引用数据类型**：在 `finally` 中修改该变量指向的对象的属性，**会**影响最终返回的值，因为临时变量暂存的是对象的**引用地址**。

#### 经典面试代码剖析：
```java
// 场景一：基本数据类型
public int testInt() {
    int x = 1;
    try {
        return x; // 此时把 x=1 计算出来并暂存，返回值锁死为 1
    } finally {
        x = 2;    // 修改 x 不会影响已经暂存的临时变量
    }
} // 返回结果：1

// 场景二：引用数据类型
public User testUser() {
    User user = new User("张三");
    try {
        return user; // 暂存 user 的引用地址
    } finally {
        user.setName("李四"); // 修改暂存地址指向的堆中对象的属性
    }
} // 返回结果：李四
```

---

## 5. Java 泛型与擦除机制

### 核心概念
Java 泛型是 JDK 5 引入的特性，它提供了编译期的类型安全检测。但在底层运行阶段，Java 泛型是**伪泛型**。

### 类型擦除（Type Erasure）
Java 编译器在完成编译后，会将所有的泛型信息擦除掉：
* `List<String>` 和 `List<Integer>` 在编译成 `.class` 文件后，都会变成原始的 `List`。它们在运行期共享同一个 `Class` 对象：`List.class`。
* 泛型类型参数会被替换为它的**上限类型**（如果没有指定上限，则替换为 `Object`），同时在读取值的位置自动插入强制类型转换代码。
* **原因**：为了兼容 JDK 1.4 及以前的非泛型字节码文件。

---

### PECS 法则（Producer Extends, Consumer Super）
泛型通配符 `?` 用于限定类型范围，PECS 是通配符选型的核心指导法则：

1. **Producer Extends（生产者限制）**：
   * **用法**：`<? extends T>`。限制类型的上限，表示只能接受 `T` 及其子类。
   * **特性**：只能从中**读取（Read）**数据，不能向其中**写入（Write）**数据（除了写入 `null`）。因为你无法确定里面装的到底是 `T` 的哪一个具体子类。
   * **别名**：只读不可写。
2. **Consumer Super（消费者限制）**：
   * **用法**：`<? super T>`。限制类型的下限，表示只能接受 `T` 及其父类。
   * **特性**：只能向其中**写入（Write）**数据（只能存入 `T` 及其子类），不能从中**读取（Read）**出具体类型（读取出来只能是 `Object`）。因为你无法确定读出来的是哪一个层级的父类。
   * **别名**：只写不可读。

---

## 6. JVM 类加载机制与双亲委派

> 本节保留在 Java 基础里，重点用于回答“类加载 / 双亲委派 / SPI”这类语言基础追问。完整 JVM 专题入口见 [[Java JVM高频面试题与线上排障指南#3. 类加载机制与双亲委派|JVM 主文档：类加载机制与双亲委派]]。

### 6.1. 类加载生命周期

```text
+--------------------------------------------------------+
|                      类加载过程                        |
+--------------------------------------------------------+
| 1. 加载 (Loading)                                      |
|    - 通过全类名读取二进制字节流                          |
|    - 将静态存储结构转化为方法区运行时数据                |
|    - 在内存生成 Class 对象                             |
+--------------------------+-----------------------------+
|                          | (连接 Connection)
                           v
| 2. 验证 (Verification)   | -> 校验字节流是否符合 JVM 规范
| 3. 准备 (Preparation)    | -> 为类变量 (static) 分配内存并初始化为默认零值
| 4. 解析 (Resolution)     | -> 将符号引用替换为直接引用
+--------------------------+-----------------------------+
                           |
                           v
| 5. 初始化 (Initialization)                             |
|    - 执行类构造器 <clinit>() 方法，执行 static 块和赋值逻辑 |
+--------------------------------------------------------+
```

* **准备阶段的零值陷阱**：在准备阶段，`public static int value = 123;` 变量 `value` 的初始值是 **`0`**，而不是 `123`。赋值为 `123` 的动作会在**初始化阶段**执行 `<clinit>()` 时才发生。但如果是 `public static final int value = 123;`（常量），在编译期就会放入常量池，准备阶段就会被初始化为 `123`。

---

### 6.2. 双亲委派模型（Parents Delegation Model）

#### 1. 类加载器层级

```text
      +-----------------------------+
      |    Bootstrap ClassLoader    | (启动类加载器，加载 rt.jar)
      +--------------+--------------+
                     ^
                     | (向上委托)
      +--------------+--------------+
      |    Extension ClassLoader    | (扩展类加载器，加载 ext 目录)
      +--------------+--------------+
                     ^
                     | (向上委托)
      +--------------+--------------+
      |      App ClassLoader        | (系统类加载器，加载 ClassPath 路径)
      +--------------+--------------+
                     ^
                     | (向上委托)
      +--------------+--------------+
      |     Custom ClassLoader      | (自定义类加载器)
      +-----------------------------+
```

#### 2. 工作原理
1. 当一个类加载器接收到类加载请求时，它首先不会自己尝试去加载这个类，而是把这个请求**委托给父类加载器**去执行。
2. 每一个层级的类加载器都是如此，因此所有的加载请求最终都应该传送到顶层的启动类加载器（Bootstrap ClassLoader）中。
3. 只有当父加载器反馈自己无法完成这个加载请求（在它的搜索范围内没有找到所需的类）时，子加载器才会尝试自己去加载。

#### 3. 核心目的
* **沙箱安全机制，防范核心 API 被篡改**：例如用户自己写了一个 `java.lang.String` 类，通过双亲委派，请求最终会由顶层的 Bootstrap ClassLoader 去加载 JDK 原生的 String，而用户自定义的 String 无法被加载，保证了 Java 核心 API 的安全和一致性。

#### 4. 如何打破双亲委派机制？
* **重写 `loadClass` 方法**：自定义类加载器时，不要重写 `findClass`（重写 `findClass` 依然遵循双亲委派），而是重写 `loadClass(String name, boolean resolve)`，将委托父类加载器的逻辑删掉，自己直接读取字节码。
* **应用案例（Tomcat WebAppClassLoader）**：
  * Tomcat 中为了实现同一个容器下不同 Web 应用的 jar 包版本隔离（例如应用 A 用 Spring 4，应用 B 用 Spring 5），每个 Web 应用拥有独立的 `WebAppClassLoader`。它会**优先加载自己 WebApp 下的类**，加载不到才委派给父类（SharedClassLoader），打破了双亲委派。
* **SPI 机制与线程上下文类加载器（JDBC）**：
  * 在核心 Java 包（如 rt.jar 中的 `java.sql.DriverManager`，由 Bootstrap 加载）需要调用第三方厂商实现的 JDBC 驱动时。由于 Bootstrap 无法加载 ClassPath 下的厂商实现类，JDK 引入了 **线程上下文类加载器（Thread Context ClassLoader）**，强行利用子类加载器（AppClassLoader）去加载实现类，打破了委派顺序。

#### 5. SPI 机制与 Dubbo 扩展机制有什么区别？

SPI（Service Provider Interface）可以理解为：**框架定义接口，第三方通过配置文件提供实现，框架在运行时发现并加载这些实现**。

##### 1. JDK SPI

JDK 原生 SPI 主要依赖 `ServiceLoader` 和 `META-INF/services` 目录。

假设定义一个支付接口：

```java
public interface PayService {
    void pay();
}
```

第三方实现：

```java
public class AliPayService implements PayService {
    public void pay() {
        System.out.println("支付宝支付");
    }
}
```

配置文件路径：

```text
META-INF/services/com.demo.PayService
```

文件内容：

```text
com.demo.AliPayService
com.demo.WechatPayService
```

加载方式：

```java
ServiceLoader<PayService> loader = ServiceLoader.load(PayService.class);
for (PayService service : loader) {
    service.pay();
}
```

JDK SPI 的优点是简单、标准，适合基础插件发现，比如 JDBC 驱动。但它也有明显缺点：

1. 不方便按名称获取某一个实现。
2. 通常要遍历所有实现类。
3. 不支持默认扩展。
4. 不支持按条件自动激活。
5. 不支持依赖注入、包装增强和运行时自适应选择。

##### 2. JDBC / MySQL 是怎么用 SPI 的？

JDBC 是 JDK SPI 最典型的应用之一。MySQL Connector/J 驱动包里会提供 `java.sql.Driver` 的实现类：

Maven 依赖一般写法如下：

```xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <version>8.4.0</version>
</dependency>
```

如果是 Spring Boot 项目，通常由 Spring Boot BOM 统一管理版本，可以不显式写 `version`：

```xml
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
</dependency>
```

旧版本依赖里也常见过 `mysql:mysql-connector-java`，但新项目更推荐使用 `com.mysql:mysql-connector-j`。

```text
com.mysql.cj.jdbc.Driver
```

驱动 jar 包中会有类似下面的 SPI 配置文件：

```text
META-INF/services/java.sql.Driver
```

文件内容包含 MySQL 驱动实现类：

```text
com.mysql.cj.jdbc.Driver
```

当应用代码调用：

```java
Connection conn = DriverManager.getConnection(
    "jdbc:mysql://localhost:3306/test",
    "root",
    "123456"
);
```

整体流程可以理解为：

```text
DriverManager 初始化
  -> 通过 SPI 加载 classpath 下的 java.sql.Driver 实现
  -> MySQL Driver 被发现并注册到 DriverManager
  -> getConnection 时遍历已注册的 Driver
  -> 逐个判断是否能处理当前 JDBC URL
  -> MySQL Driver 识别 jdbc:mysql:// 前缀
  -> 创建真正的 MySQL 数据库连接
```

如果 classpath 中同时存在多个数据库驱动：

```text
MySQL Driver
PostgreSQL Driver
Oracle Driver
```

并不是所有驱动都会真正连接数据库。`DriverManager` 会根据 URL 选择能处理当前协议的驱动：

| JDBC URL | 真正处理的 Driver |
| :--- | :--- |
| `jdbc:mysql://localhost:3306/test` | MySQL Driver |
| `jdbc:postgresql://localhost:5432/test` | PostgreSQL Driver |
| `jdbc:oracle:thin:@localhost:1521:orcl` | Oracle Driver |

所以多个 SPI 实现类可能都会被发现和注册，但具体业务逻辑是否执行，要看调用方的选择逻辑。JDBC 场景中，这个选择逻辑就是 `DriverManager` 根据 URL 前缀判断哪个 Driver 能处理。

早期常见写法：

```java
Class.forName("com.mysql.cj.jdbc.Driver");
```

这是手动加载 MySQL Driver，让它注册到 `DriverManager`。JDBC 4 以后，只要 MySQL Connector/J 在 classpath 下，通常可以通过 SPI 自动发现，不需要手写 `Class.forName`。

**面试表达**：
> MySQL JDBC 驱动通过 JDBC SPI 暴露 `java.sql.Driver` 实现，驱动类是 `com.mysql.cj.jdbc.Driver`。应用调用 `DriverManager.getConnection("jdbc:mysql://...")` 时，`DriverManager` 会加载并维护一组已注册的 Driver，然后根据 JDBC URL 选择能处理该 URL 的驱动。classpath 里可以有多个数据库驱动，但真正建立连接的是匹配 `jdbc:mysql` 协议的 MySQL Driver，其他 Driver 会跳过。

##### 3. Dubbo SPI

Dubbo SPI 是对 JDK SPI 思想的增强版，核心类是 `ExtensionLoader`。Dubbo 中很多核心能力都是扩展点，例如：

1. `Protocol`：协议扩展，如 dubbo、injvm。
2. `Registry`：注册中心扩展。
3. `LoadBalance`：负载均衡扩展。
4. `Cluster`：集群容错扩展。
5. `Filter`：过滤器扩展。
6. `Serialization`：序列化扩展。

Dubbo 扩展点通常用 `@SPI` 标记：

```java
@SPI("random")
public interface LoadBalance {
}
```

配置文件通常位于：

```text
META-INF/dubbo/
META-INF/dubbo/internal/
META-INF/services/
```

文件内容采用 `name=实现类` 的格式：

```properties
random=org.apache.dubbo.rpc.cluster.loadbalance.RandomLoadBalance
roundrobin=org.apache.dubbo.rpc.cluster.loadbalance.RoundRobinLoadBalance
leastactive=org.apache.dubbo.rpc.cluster.loadbalance.LeastActiveLoadBalance
```

按名称获取扩展：

```java
LoadBalance loadBalance = ExtensionLoader
    .getExtensionLoader(LoadBalance.class)
    .getExtension("roundrobin");
```

##### 4. Dubbo SPI 的关键增强点

| 能力 | JDK SPI | Dubbo SPI |
| :--- | :--- | :--- |
| 配置格式 | 只写实现类全限定名 | `name=实现类` |
| 获取方式 | 通过 `ServiceLoader` 遍历 | 通过 `ExtensionLoader` 按名称获取 |
| 默认实现 | 不方便 | `@SPI("默认扩展名")` |
| 自适应扩展 | 不支持 | `@Adaptive`，可根据 URL 参数动态选择实现 |
| 条件激活 | 不支持 | `@Activate`，可按 group、URL 参数自动激活 |
| 依赖注入 | 不支持 | 支持扩展之间 setter 注入 |
| 包装增强 | 不支持 | 支持 Wrapper 包装类，类似 AOP |

##### 5. `@Adaptive` 是什么？

`@Adaptive` 用来做**自适应扩展**。它可以根据运行时 URL 参数动态选择具体实现。

例如配置了：

```text
loadbalance=roundrobin
```

Dubbo 在调用时就可以根据参数选择 `roundrobin` 对应的 `LoadBalance` 实现。

可以理解成：

```text
不是编译期写死用哪个实现，而是运行时根据配置选择实现
```

##### 6. `@Activate` 是什么？

`@Activate` 用来做**条件自动激活**，常见于 Dubbo Filter。

例如：

```java
@Activate(group = "provider")
public class MetricsProviderFilter implements Filter {
}
```

表示这个 Filter 在 provider 端满足条件时自动加入调用链。它适合日志、监控、鉴权、限流这类框架扩展。

##### 7. 为什么 Dubbo 不直接用 JDK SPI？

因为 RPC 框架需要更复杂的扩展能力。比如负载均衡有 `random`、`roundrobin`、`leastactive` 等多种实现，业务希望通过配置动态选择，而不是加载所有实现再手动遍历。

再比如 Filter 可能只在 consumer 端生效，也可能只在 provider 端生效，还可能根据 URL 参数自动启用。JDK SPI 做不到这么细，Dubbo SPI 的 `@Activate` 更适合这种场景。

**面试表达**：
> JDK SPI 是 Java 原生的服务发现机制，通过 `META-INF/services` 和 `ServiceLoader` 加载接口实现，适合简单插件扩展。但它能力比较弱，不方便按名称获取实现，也不支持默认扩展、条件激活、依赖注入和包装增强。Dubbo SPI 是在 JDK SPI 思想上的增强版，核心是 `ExtensionLoader`，配置格式是 `name=实现类`，可以按名称获取扩展，并支持 `@SPI` 默认扩展、`@Adaptive` 自适应扩展、`@Activate` 条件激活、扩展注入和 Wrapper 包装。所以 Dubbo 的协议、注册中心、负载均衡、Filter、序列化等核心能力都建立在 Dubbo SPI 之上。

---

## 7. Java 反射与动态代理

### 7.1. 什么是静态代理与致命缺陷

* **定义**：静态代理（Static Proxy）是指**在程序运行前，代理类的 `.class` 文件就已经被程序员手动编写好并编译出来的代理方式**。代理类和目标类实现相同的接口，代理类通过持有目标类引用进行功能拦截。
* **代码实现**：
  ```java
  // 1. 定义接口
  public interface SmsService {
      void send(String msg);
  }
  // 2. 真实目标实现类
  public class SmsServiceImpl implements SmsService {
      @Override
      public void send(String msg) { 
          System.out.println("【真实类】发送短信: " + msg); 
      }
  }
  // 3. 手动编写静态代理类
  public class SmsStaticProxy implements SmsService {
      private final SmsService target; // 持有真实目标类的引用
      public SmsStaticProxy(SmsService target) { 
          this.target = target; 
      }
      @Override
      public void send(String msg) {
          System.out.println("【静态代理】前置增强...");
          target.send(msg); // 委托目标类执行真实业务
          System.out.println("【静态代理】后置增强...");
      }
  }
  // 4. 调用静态代理
  public class StaticProxyDemo {
      public static void main(String[] args) {
          SmsService target = new SmsServiceImpl();
          SmsService proxy = new SmsStaticProxy(target);
          proxy.send("hello");
      }
  }
  ```
* **为什么叫“静态”？**：
  因为**代理关系在编译期就已经确定死并写在代码里了**。在程序运行前，对应的 `.class` 字节码文件就已经真实存在。
* **三大致命缺陷**：
  1. **代码冗余度极高**：接口每增加一个方法，代理类就必须重写一遍并手动织入相同的增强逻辑（即使这些逻辑完全一致）。
  2. **维护成本极高**：接口一旦变动（例如增加或删除方法），实现类和所有代理类都必须被迫同步修改。
  3. **缺乏通用性**：静态代理与特定接口强绑定，无法编写一个通用的代理类服务于系统中的所有接口（如事务、日志拦截）。

---

### 7.2. 动态代理如何解决静态代理的痛点？

**动态代理（Dynamic Proxy）** 在运行期利用**字节码技术直接在内存中生成代理类**，无需程序员手写代理类代码，并通过单一拦截接口服务于所有方法。它完美地解决了静态代理的所有痛点：
1. **不需要手动写代理类代码**：字节码在内存中即时生成并加载，没有磁盘上的 `.class` 源码文件，极大提高了生产力。
2. **一套增强逻辑服务所有接口（通用性极高）**：
   无论代理什么接口，在 JDK 中都只需编写一个 `InvocationHandler`，在 CGLIB 中都只需编写一个 `MethodInterceptor`。它们的单一拦截入口（如 `invoke` 或 `intercept`）会拦截被代理接口或类下的**所有方法**。这也是 Spring AOP 能够通用的核心底座。

---

### 7.3. JDK 动态代理与 CGLIB 动态代理对比

| 维度 | JDK 动态代理 | CGLIB 动态代理 |
| :--- | :--- | :--- |
| **核心原理** | 基于 **接口（Interface）** 实现。 | 基于 **继承（Inheritance）** 实现。 |
| **实现技术** | Java 反射机制（在运行期生成代理类 `$Proxy0` 的字节码并加载）。 | ASM 字节码生成框架（在运行期直接修改字节码生成被代理类的**子类**）。 |
| **局限性** | 被代理的类**必须实现至少一个接口**。 | 被代理的类**不能是 final 类**，且被代理的方法不能是 `final` 或 `private`（因为子类无法重写它们）。 |
| **调用效率** | 在 JDK 8 以后优化了反射调用，效率与 CGLIB 基本持平。 | 不需要反射，直接通过子类调用父类方法，效率高，但生成代理类的开销稍大。 |
| **生成类名字** | 类名中通常包含 `$Proxy` 字符。 | 类名中通常包含 `$$EnhancerByCGLIB$$` 字符。 |

---

### 7.4. 动态代理的核心代码实现

#### 1. JDK 动态代理模板
```java
// 增强处理器实现 InvocationHandler
public class SmsInvocationHandler implements InvocationHandler {
    private final Object target; // 真实对象
    public SmsInvocationHandler(Object target) { this.target = target; }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println("【JDK 动态代理】前置通知...");
        Object result = method.invoke(target, args); // 反射调用目标方法
        System.out.println("【JDK 动态代理】后置通知...");
        return result;
    }
}
// 实例化代理对象
SmsService target = new SmsServiceImpl();
SmsService proxy = (SmsService) Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    new SmsInvocationHandler(target)
);
proxy.send("hello");
```

#### 2. CGLIB 动态代理模板
```java
// 拦截器实现 MethodInterceptor
public class SmsMethodInterceptor implements MethodInterceptor {
    @Override
    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
        System.out.println("【CGLIB 动态代理】前置处理...");
        Object result = proxy.invokeSuper(obj, args); // 调用子类代理对象的父类方法
        System.out.println("【CGLIB 动态代理】后置处理...");
        return result;
    }
}
// 实例化代理对象
Enhancer enhancer = new Enhancer();
enhancer.setClassLoader(AliSmsService.class.getClassLoader());
enhancer.setSuperclass(AliSmsService.class); // 设置目标类为父类
enhancer.setCallback(new SmsMethodInterceptor());
AliSmsService proxy = (AliSmsService) enhancer.create();
proxy.send("hello");
```

---

### 7.5. 深度剖析：为什么 JDK 动态代理必须实现接口？

* **根本原因**：JDK 动态代理在运行期动态生成的代理类（如 `$Proxy0`），**默认且强制继承了 `java.lang.reflect.Proxy` 类**。
* **单继承限制**：由于 Java 语言只支持单继承，`$Proxy0` 既然已经继承了 `Proxy`，就绝对无法再通过继承目标类的方式进行代理。因此，它只能通过**实现与目标类相同的接口**来保证类型兼容和方法一致。
* **生成的代理类 `$Proxy0` 结构伪代码**：
  ```java
  public final class $Proxy0 extends Proxy implements SmsService {
      private static Method m3; // 对应 SmsService.send() 方法
      public $Proxy0(InvocationHandler h) { super(h); } // 传入增强处理器

      @Override
      public final void send(String msg) {
          try {
              // 关键：将调用分发给父类中的 InvocationHandler 的 invoke 方法
              super.h.invoke(this, m3, new Object[]{msg});
          } catch (Throwable e) {
              throw new UndeclaredThrowableException(e);
          }
      }
  }
  ```

---

### 7.6. Spring AOP 选择动态代理的逻辑

```text
                [ 是否实现了接口? ]
                   /         \
                 是           否
                 /             \
        [ 使用 JDK 动态代理 ]   [ 使用 CGLIB 动态代理 ]
```

* **Spring 选型规则**：
  * 如果目标对象实现了接口，默认采用 JDK 动态代理。
  * 如果目标对象没有实现任何接口，采用 CGLIB 动态代理。
  * **强制指定 CGLIB**：可以通过配置 `@EnableAspectJAutoProxy(proxyTargetClass = true)` 强行指令 Spring AOP 统一使用 CGLIB 代理。

---

## 8. String 常用常量池与可变性

> 本节从 Java 语言基础角度讲 String、常量池和 `intern()`。如果面试官继续追问 JVM 运行时常量池、GC 回收和 OOM 排查，可跳到 [[Java JVM高频面试题与线上排障指南#1. JVM 运行时内存区域|JVM 主文档：运行时内存区域]] 和 [[Java JVM高频面试题与线上排障指南#7. CPU 100%、死锁、接口超时与 Full GC 排查|JVM 主文档：线上排障]]。

### 8.1. String、StringBuilder、StringBuffer 的区别
* **String**：**不可变（Immutable）**的字符序列（底层在 JDK 8 是 `final char[]`，JDK 9 及以后是 `final byte[]`）。
  * **特性**：线程安全、可缓存哈希值（常用于 HashMap Key）。每次拼接会生成新的对象（如果不是常量编译期优化），产生内存垃圾。
* **StringBuilder**：**可变**的字符序列。
  * **特性**：**非线程安全**。适用于单线程下的大量字符串拼接，性能极高。
* **StringBuffer**：**可变**的字符序列。
  * **特性**：**线程安全**（其内部核心方法如 `append()` 都加了 `synchronized` 锁）。性能略低于 StringBuilder，适用于多线程高并发下的拼接。

#### 1. 经典面试题：字面量拼接 vs 变量拼接（常量折叠机制）
```java
String str1 = "str";
String str2 = "ing";
String str3 = "str" + "ing";
String str4 = str1 + str2;
String str5 = "string";
System.out.println(str3 == str4); // false
System.out.println(str3 == str5); // true
System.out.println(str4 == str5); // false
```
* **剖析 `str3 == str5 (true)`**：
  * 因为 `"str"` 和 `"ing"` 都是**字符串字面量（常量表达式）**。
  * 编译器在编译期会进行**常量折叠（Constant Folding）**优化，直接在编译期将其拼接为 `"string"` 并放入常量池。因此，`str3` 和 `str5` 指向常量池中的同一个对象，返回 `true`。
* **剖析 `str4 == str5 (false)`**：
  * 因为 `str1` 和 `str2` 是**变量**，编译期无法做常量折叠，必须在运行期动态拼接。
  * 在 JDK 8 中，变量拼接的底层被编译为 `new StringBuilder().append(str1).append(str2).toString()`，而 `toString()` 底层会 `new String(...)` 在**堆内存中生成一个全新对象**。
  * 由于 `str4` 指向堆，而 `str5` 指向常量池，内存地址不同，返回 `false`。
* **延伸（加 `final` 关键字）**：
  如果将 `str1` 和 `str2` 声明为 `final String`，由于它们变成了**编译期常量**，编译器确信其值不会改变，因此 `str1 + str2` 依然会在编译期进行常量折叠折叠为 `"string"`。此时，`str4 == str5` 会输出 `true`。
* **延伸（改用 `equals()` 比较）**：
  如果将所有的 `==` 替换为 `equals()` 方法进行比较，**所有的输出结果都将是 `true`**。
  * **原理解析**：`==` 比较的是对象的内存地址（引用地址），而 `equals()` 在 `String` 类中被**重写（Override）**过，改为**比较字符串的字符内容**。由于这三个变量持有的字符序列都是 `"string"`，内容完全相同，因此 `equals()` 比较均为 `true`。
  * **`String.equals()` 源码精简版逻辑**：
    ```java
    public boolean equals(Object anObject) {
        if (this == anObject) return true; // 1. 地址相同直接返回 true
        if (anObject instanceof String) { // 2. 类型必须是 String
            String anotherString = (String)anObject;
            int n = value.length;
            if (n == anotherString.value.length) { // 3. 长度相同才继续比
                char v1[] = value;
                char v2[] = anotherString.value;
                int i = 0;
                while (n-- != 0) { // 4. 逐位字符比对
                    if (v1[i] != v2[i]) return false;
                    i++;
                }
                return true;
            }
        }
        return false;
    }
    ```

---

### 8.2. 为什么 String 要设计成不可变？

#### 1. 什么叫 String 不可变？

`String` 不可变是指：一个 `String` 对象创建完成后，它表示的字符内容不能再被修改。所谓字符串拼接、替换和截取，实际上都会返回一个新的 `String` 对象，原对象保持不变。

```java
String value = "Java";
value.concat(" Agent");

System.out.println(value); // Java
```

`concat()` 没有修改原来的 `value`，只有接收返回值才会得到新字符串：

```java
value = value.concat(" Agent");
```

#### 2. String 如何保证不可变？

主要依靠以下设计：

1. `String` 类使用 `final` 修饰，不能被继承，避免子类破坏不可变语义。
2. 底层字符存储数组不会直接暴露给外部。JDK 8 使用 `final char[]`，JDK 9 以后主要使用 `final byte[]`。
3. `String` 不提供修改内部字符内容的公开方法；`substring()`、`replace()`、`concat()` 等操作都返回新对象。
4. 构造和转换过程中会控制可变数据的访问，外部代码不能通过数组引用直接修改 String 内部内容。

> `final` 数组引用只能保证引用不能重新指向其他数组，并不代表数组元素天然不能修改。String 真正不可变，还依赖类不能被继承、内部数组不对外暴露以及不提供修改入口。

#### 3. 设计成不可变有什么好处？

##### 好处一：天然线程安全

String 创建后状态不会变化，多个线程可以直接共享同一个对象，不需要额外加锁，也不会发生一个线程修改后影响其他线程的问题。

##### 好处二：可以安全使用字符串常量池

相同字面量可以复用同一个 String 对象：

```java
String a = "hello";
String b = "hello";

System.out.println(a == b); // true
```

如果 String 可以被修改，修改 `a` 可能同时改变 `b` 看到的内容，字符串常量池就无法安全共享对象。

##### 好处三：hashCode 稳定，适合作为 HashMap 的 key

String 内容不变，因此它的 `hashCode` 也不会变化，可以缓存哈希计算结果，并安全地作为 `HashMap`、`HashSet` 的 key。

可变对象作为 key 的风险如下：

```java
List<String> key = new ArrayList<>();
key.add("A");

Map<List<String>, String> map = new HashMap<>();
map.put(key, "value");

key.add("B"); // key 内容变化，hashCode 也发生变化
System.out.println(map.get(key)); // 可能取不到原来的值
```

对象放入 HashMap 后，如果参与 `hashCode` 计算的内容发生变化，重新计算出的桶位置可能与写入时不同，导致查询异常。String 不可变可以避免这个问题。

##### 好处四：提高安全性

String 经常表示类名、文件路径、URL、数据库连接地址、用户名和权限参数。不可变可以避免参数校验通过后，又被其他代码修改，降低“校验后篡改”的风险。

##### 好处五：便于共享、缓存和推理

不可变对象状态稳定，可以放心地在方法之间传递、在多个模块中共享和放入缓存。调用方不需要担心其他代码偷偷修改对象，代码更容易理解和排查。

#### 4. 面试口述版

> String 不可变主要有五个好处：第一，状态不会变化，所以天然线程安全；第二，相同字符串可以在常量池中安全复用；第三，hashCode 稳定并且可以缓存，适合作为 HashMap 的 key；第四，可以防止路径、URL、类名等参数在校验后被篡改；第五，便于在不同线程和模块之间安全共享。它的不可变性主要由 final 类、内部数组不暴露以及所有修改操作返回新对象共同保证。

---

### 8.3. String 常量池（String Table）与内存优化

#### 1. 经典面试题：`String s = new String("abc")` 创建了几个对象？
* **答案**：创建了 **1 个或 2 个** 对象。
* **剖析**：
  * 如果常量池中**原本没有** `"abc"`：会先在字符串常量池中创建一个 `"abc"` 对象，然后在 Java 堆中创建一个 `String` 对象指向池中的地址。此时共创建了 **2 个** 对象。
  * 如果常量池中**已经有** `"abc"`：则只会在 Java 堆中创建一个 `String` 对象。此时共创建了 **1 个** 对象。

#### 2. `intern()` 方法的底层运作机制与作用
* **定义**：`intern()` 是 String 类中的一个 native 方法，用于对堆中的字符串进行“去重并合并”，从而节省堆空间。
* **运作原理**：当调用 `s.intern()` 时，JVM 检查字符串常量池（`StringTable`）中是否有等于 `s` 的字符串：
  * **已存在**：直接返回常量池中该已存在对象的引用地址。
  * **不存在**：
    * **JDK 6 及以前**：在常量池（永久代）中复制一份该字符串对象并返回其引用。
    * **JDK 7 及以后**：将堆中该字符串对象 `s` 的引用地址直接拷贝并记录到常量池（堆）中，并返回该地址，避免了重复创建对象的空间开销。
* **经典面试代码分析（JDK 7+）**：
  ```java
  public static void main(String[] args) {
      // 示例一
      String s1 = new StringBuilder("go").append("od").toString(); // 堆中生成 "good"
      System.out.println(s1.intern() == s1); 
      // 输出：true
      // 剖析：常量池原本无 "good"，调用 intern() 后将 s1 的堆地址存入常量池并返回，所以地址完全等价。

      // 示例二
      String s2 = new StringBuilder("ja").append("va").toString(); // 堆中生成 "java"
      System.out.println(s2.intern() == s2); 
      // 输出：false
      // 剖析："java" 在 JVM 启动类加载时已由内部类加载器载入常量池，s2.intern() 返回的是 JVM 预加载的池地址，不等于 s2 的堆地址。
  }
  ```

#### 3. 字符串常量池会存在大量无用字符串吗？（GC 机制与哈希碰撞）
* **会存在无用字符串**：如果动态生成了大量不重复的字符串并调用 `intern()`，常量池会积累无用数据。
* **垃圾回收（GC）机制**：
  * **JDK 6**：常量池位于**方法区（永久代）**，只有在发生 Full GC 时才会被回收，极易引发 `OOM: PermGen space`。
  * **JDK 7 及以后**：常量池移动到了 **Java 堆（Heap）** 中，它们能够像普通堆对象一样被 YGC / Minor GC 回收。只要外部强引用消失，垃圾收集器就会自动将其清出常量池（StringTable）。
* **隐形性能瓶颈：哈希碰撞与 CPU 飙升**：
  * 常量池在 JVM 内部是一个类似 HashMap 的哈希结构（`StringTable`），其大小是有限的（可通过 `-XX:StringTableSize` 配置）。
  * 如果短时间内有几百万个不同的字符串调用了 `intern()`，会导致**极高的哈希冲突**，哈希表中的链表会变得非常长。
* 后续再执行 `intern()` 检查时，需要遍历超长链表，时间复杂度从 O(1) 退化到 O(N)，**这会导致系统 CPU 使用率飙升到 100%**。
  * **防范**：绝对不能盲目将外部不确定的输入（如用户聊天信息、动态 URL）直接调用 `intern()`，防止遭受 String.intern DoS 攻击。

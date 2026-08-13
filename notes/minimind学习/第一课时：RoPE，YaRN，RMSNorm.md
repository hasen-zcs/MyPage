---
title: RoPE, YaRN, RMSNorm学习
date: 2026-08-13
tags: [minimind]
summary: minimind学习第一课时
color: green
---
## RoPE定义：
旋转位置编码，相较于**原始transformer**使用的绝对位置编码（[[Positional Encoding]]），其创新点在于：它不直接在词向量上加上位置信息，而是通过在词向量维度上（dim或head_dim）上面划分从高频到低频的连续旋转速度，通过不同位置间因旋转速度差异而产生的角度差，来表示位置信息。
我们可以类比时钟，在时钟上就有秒针，分针，时针三种频率由高到低的针，我们可以通过不同时间上时针分针秒针的角度差来判断两时间谁在高谁再低，
## 公式推导
### 旋转公式
对于一个二维的向量$(x, y)$我们在复平面上可以表示为 $x+iy$, 我们在复平面上将它选装 `θ` 度相当于将 $x+iy$ 乘以一个$e^{iθ}$,而$e^{iθ}=cos(θ)+i\ sin(θ)$ ，所以上述公式满足一下推导
$$
\begin{aligned}
	(x',y')&=(x+i\ y)e^{iθ}\\
	&=(x+i\ y)(\cos(θ)+i\sin(θ) \\ 
	&=x\cos(θ)-y\sin(θ)+i(x\sin(θ)+y\cos(θ))\\
	&=(x\cos(\theta)-y\sin(\theta), x\sin(\theta)+y\cos(\theta))\\
	&=(x\cos(\theta), y\cos(\theta))+(-y\sin(\theta), x\sin(\theta))\\
	&=(x,y)\cos(\theta)+(-y,x)\sin(\theta)
\end{aligned}
$$
所以我们可以得出二维向量的旋转可以通过将向量(x,y)进行重构的带(-y,x)，然后分别将$(x,y)、(-y,x)$乘以$cos(\theta),sin(\theta)$，最后相加得到旋转后的向量$(x',y')$
我们之后将此公式推到dim维，我们将dim维的张量分为两组，一组大小为dim/2，然后将这两组视为x,y带入上面所推导的公式，就能得出旋转后的向量。其实我们是将张量两两一分组，然后将每组都视为一对(x,y),然后将x的一组放在一起，将y的一组放在一起，然后进行计算，两者在实践中等效
### 频率计算
我们频率的计算用的公式和绝对位置编码[[Positional Encoding]]用的一样
$$freqs=\frac{1}{base^\frac{2i}{dim}},i = 0,1,2……\frac{dim}{2}-1$$
$freqs$在函数平面上是一个从1指数级下降直到无限接近于零，前面下降快速，后面下降缓慢的曲线，这个函数是在指数空间中线性衰减的，既在对数坐标平面是线性下降的，这个公式里面的base值的取值决定了$freqs$函数在标准坐标系里面的低频的占比，趋势为base越大，在低频的占比就会越大，曲线会越缓，形象一点说就是当base取得越大时，时针的数量就越多，模型对长文本的位置信息的理解会变好好，但是如果过高就会导致高频部分过短，使得模型无法良好的分辨短距离上的位置信息。
我们真实的计算过程中要用的其实是$\theta$，而$\theta=k*freqs$ 其中的k为该token在句子中的位置（从零开始的）在具体的实现中，我们直接使用广播机制，生成对应的$\theta_{ij}=k_i*freqs_j$表，为了代码安全，我们使用torch.outer(k, freqs)来广播

### 代码
接下来我们来学习代码
代码我们接下来要做的事情要分为以下几步
1.求cos，sin，(-y,x)，freqs，len，
2.计算公式$(x',y')=(x,y)\cos(\theta)+(-y,x)\sin(\theta)$
代码如下
```python
def get_sin_cos(dim=512, seq_len=2048, rope_base=1e6):
	"""
    预计算 RoPE 的 sin 和 cos 值
    
    Returns:
        freqs_sin: [seq_len, dim] 所有位置的 sin 值
        freqs_cos: [seq_len, dim] 所有位置的 cos 值
    """
	freqs = 1.0 / (rope_base**(torch.arange(0, dim, 2)[:(dim//2)].float()/ dim))
	t = torch.arange(seq_len, device=freqs.device)
	freqs = torch.outer(t, freqs).float()
	freqs_cos = torch.cat([torch.cos(freqs), torch.cos(freqs)], dim=-1)
	freqs_sin = torch.cat([torch.sin(freqs), torch.sin(freqs)], dim=-1)
	return freqs_sin, freqs_cos
	
def rotate_half(x):
	"""将(x,y)变成(-y,x)"""
	b = torch.cat([-x[:,x.shape[-1]//2:], x[:, :x.shape[-1]//2]], dim=-1)
	return b
	
def RoPE(q, k, sin, cos, unsqueeze_dim=1):
	"""
		我们通过旋转Q，K使得注意力内积带上相对位置信息
	"""
	q_R = (q * cos.unsqueeze(unsqueeze_dim)) + (rotate_half(q) * sin.unsqueeze(unsqueeze_dim))
	k_R = (k * cos.unsqueeze(unsqueeze_dim)) + (rotate_half(k) * sin.unsqueeze(unsqueeze_dim))
	return q_R, k_R
```

## YaRN长度外推
长度外推的本质就是将之前计算的频率进行降低压缩（拉伸波长），使得在模型在RoPE最大词向量旋转角度不变的情况下，在旋转角度内能容纳下更多的向量，这样子就能让模型理解更长的文本。
我举个很形象的例子，钟表他有时针分针秒针，每个针都有自己的频率来旋转，所有的针合在一起可以用来表示12个小时内的任意时间精确到秒的信息，合起来就是能表示0~43200秒之间的任意一秒，而这个区间内任意两秒的位置信息，都能通过两秒之间时针分针秒针的旋转差值来表示，但是当秒数超过43200秒时，那么时钟就不知道怎么表示了，相对应的就是超过了模型上下文的理解范围，但是如果想要表示更多的信息，我们能通过压缩时针分针秒针的频率来让钟表在一圈内能表示的更多的秒数，可以扩展到100000甚至更多的秒，而且第一秒和最后一秒的距离信息还是一样的，只不过就是中间加入了更多的描述，相当于将一秒所走的步长变短了，在一个表盘上能表示更多的信息，相对应的就是模型的上下文被扩充了，更长的句长也能理解上面的位置信息。
而且值得说明的是，他只压缩了频率，所以假如一个模型最长上下文支持2K，要是位置编码用上了YaRN技术，哪怕模型没经过任何长文本训练和微调，模型也能扩展上下文，但是会出现精细信息丢失的情况
	`我们训练时关注的其实是相对位置信息，不是绝对位置信息，这就是为什么在代码里面我们虽然训练的文本都是2048token大小的但是我们还是使用了YaRN技术。因为我们的目的是为了让模型适应这种拓展后的相对位置表示形式。`

### YaRN实现
首先我们来看一下我们需要做些什么，首先我们要压缩，我们肯定是要对频率进行操作的，但是我们在实现YaRN的时候，其实我们是将一个embed_dim内的维度划分为高频，过度频率，低频的，所以我们在进行压缩操作之前，我们需要区分出高频和低频，所以我们需要low和high两个参数来区分高低频，所以low表示高频与过度频率的分界线，high表示低频和过度频率之间的分界线。
	`为什么low表示高频，high表示低频：这个low，high表示的是两个分界线在[0,dim-1]这个数轴上的先后位置的，low在high的前面（左边）`
我们一般在配置文件中就将要用的信息都写好，这样子方便我们同意调度，修改
```python
    # 从rope_scaling中取信息
    # 要取出：orig_max（原始长度）,factor（扩展倍数）,beta_fast（高频波长）,beta_slow（低频波长）
    if rope_scaling is not None:
    """
	    rope_scaling: 配置文件中的提供的，里面有原始最大长度，外推因子，高频截止边界，低频截止边界
		外推最大长度 = 原始长度 * 外推因子：2048 * 16 = 32768
	"""
        orig_max = rope_scaling.get("original_max_position_embeddings", 2048)  # 原始最大长度
        factor = rope_scaling.get("factor", 16)  # 外推因子
        beta_fast = rope_scaling.get("beta_fast", 32.0)  # 高频截止边界
        beta_slow = rope_scaling.get("beta_slow", 1.0)   # 低频截止边界
```
而因为我们都是用波长来区别高低频，所以我们先需要一个通过波长来到推出时第几个维度的工具
```python
	# 输入波长b，返回对应的频率
	inv_dim = lambda b : (dim * math.log(orig_max/(b * 2 * math.pi))) / (2 * math.log(rope_base))
```
之后我们求得高频，低频分界线
```python
        # 低频边界 high：波长接近 orig_max 的维度
        low = max(math.floor(inv_dim(beta_fast)), 0)   # 约在维度 8-12
        high = min(math.ceil(inv_dim(beta_slow)), dim // 2 - 1)  # 约在维度 22-26
```
**直观理解**：
- 维度 0~low（高频）：不压缩，保留精细位置区分能力
- 维度 low~high（过渡）：线性插值，逐步增加压缩比例
- 维度 high~end（低频）：完全压缩，将 2048 的覆盖范围拉伸到 32768

最后我们对频率进行压缩
```python
        # 平滑过渡的斜坡函数
        ramp = torch.clamp((torch.arange(dim // 2, device=freqs.device).float() - low) / max(high - low, 0.001), 0, 1)
        # ramp[k] = 0 → 维度 k 不压缩（高频）
        # ramp[k] = 1 → 维度 k 完全压缩（低频）
        
        freqs = freqs * (1 - ramp + ramp / factor)
        # 新频率 = 原频率 · (1 - ramp + ramp/16)
        # ramp=0: 频率不变
        # ramp=1: 频率变为 1/16
        
```
## RMSNorm 深度分析

### LayerNorm 的计算流程

```
给定 x = [x_1, x_2, ..., x_d]

LayerNorm：
1. 计算均值: μ = (1/d) · Σx_i
2. 计算方差: σ² = (1/d) · Σ(x_i - μ)²
3. 归一化: y_i = (x_i - μ) / √(σ² + ε)
4. 缩放平移: z_i = γ · y_i + β

参数量: 2d (γ + β)
计算量: 3·d (均值 + 方差 + 归一化)
```

### RMSNorm 的简化
好的，我把你给的 RMSNorm 公式转换成更标准的 Markdown 数学公式写法。为了方便你直接复制使用，我会同时给出行内公式和独立公式两种格式。


### 1.计算 RMS 值

**行内公式：** $\text{RMS}(x) = \sqrt{\frac{1}{d} \sum_{i=1}^{d} x_i^2}$`

**独立公式：**

$$
\text{RMS}(x) = \sqrt{\frac{1}{d} \sum_{i=1}^{d} x_i^2}
$$


### 2. 归一化

**行内公式：** $y_i = \frac{x_i}{\sqrt{\text{RMS}(x)^2 + \epsilon}}$`

**独立公式：**

$$
y_i = \frac{x_i}{\sqrt{\text{RMS}(x)^2 + \epsilon}}
$$


### 3. 缩放（可学习参数）

**行内公式：** $z_i = \gamma \cdot y_i$`

**独立公式：**

$$
z_i = \gamma \cdot y_i
$$


### 完整流程串联（可选）

如果你需要把三步写在一起，可以这样：

$$
z_i = \gamma \cdot \frac{x_i}{\sqrt{\frac{1}{d} \sum_{i=1}^{d} x_i^2 + \epsilon}}
$$


**去掉均值偏移的原因**：

在 Transformer 中，每个 sublayer 的输出经过残差连接 `x + Sublayer(LN(x))`。残差连接的存在使得均值偏移可以被后续层吸收。实验表明，去掉均值偏移对表达能力几乎没有影响。

### 完整的 RMSNorm 代码

```python
class RMSNorm(torch.nn.Module):
    def __init__(self, dim: int, eps: float = 1e-5):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))  # 可学习缩放参数 γ

    def forward(self, x):
        # x: [batch, seq_len, dim] 或 [batch, seq_len, num_heads, head_dim]
        
        # 1. 计算 RMS: sqrt(mean(x²) + eps)
        # x.pow(2): 逐元素平方
        # mean(-1): 对最后一个维度求均值
        # 加 eps 防止除零
        rms = torch.sqrt(x.pow(2).mean(-1, keepdim=True) + self.eps)
        
        # 2. 归一化 + 缩放
        # 广播乘法：weight [dim] × normalized [batch, seq, dim]
        normalized = x / rms
        return normalized * self.weight
```

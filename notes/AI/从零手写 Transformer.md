---
title: 从零手写 Transformer
date: 2026-07-28
tags: [AI, Transformer, PyTorch]
summary: 拆解编码器、解码器与注意力机制，记录一份可以照着敲的完整实现。
color: blue
---

手写 Transformer 最好的方式，不是一次写出完整模型，而是先把每个小模块单独想清楚，再拼起来。

## 1. 注意力机制

注意力要解决的问题是：当我们要理解一个词时，应该从句子其他位置借多少信息。

```python
def scaled_dot_product_attention(query, key, value, mask=None):
    d_k = query.size(-1)
    scores = torch.matmul(query, key.transpose(-2, -1)) / math.sqrt(d_k)
    if mask is not None:
        scores = scores.masked_fill(~mask, float("-inf"))
    weights = torch.softmax(scores, dim=-1)
    return torch.matmul(weights, value)
```

缩放因子 `sqrt(d_k)` 很关键。当维度变大时，点积的数值也会变大，softmax 容易进入梯度饱和区，缩放能让分布更稳定。

## 2. 多头注意力

多头不是真的复制多个独立注意力网络，而是把最后一维拆开，让不同头关注不同的关系模式。比如一个头关注语法位置，另一个头关注语义相似度。

```python
class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, num_heads):
        super().__init__()
        self.num_heads = num_heads
        self.d_k = d_model // num_heads
        self.w_q = nn.Linear(d_model, d_model)
        self.w_k = nn.Linear(d_model, d_model)
        self.w_v = nn.Linear(d_model, d_model)
        self.w_o = nn.Linear(d_model, d_model)

    def forward(self, query, key, value, mask=None):
        batch_size, seq_len, _ = query.shape
        q = self.w_q(query).view(batch_size, -1, self.num_heads, self.d_k)
        k = self.w_k(key).view(batch_size, -1, self.num_heads, self.d_k)
        v = self.w_v(value).view(batch_size, -1, self.num_heads, self.d_k)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        attn = scaled_dot_product_attention(q, k, v, mask)
        attn = attn.transpose(1, 2).contiguous().view(batch_size, seq_len, -1)
        return self.w_o(attn)
```

## 3. 前馈网络

注意力负责在序列内部交换信息，前馈网络则对每个位置的表示做一次独立的非线性变换。

```python
class PositionWiseFFN(nn.Module):
    def __init__(self, d_model, d_ffn, dropout=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, d_ffn),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(d_ffn, d_model),
        )

    def forward(self, x):
        return self.net(x)
```

## 4. 把模块拼起来

编码器由多头注意力和前馈网络交替组成，每一层外面都套着残差连接与 LayerNorm。残差让深层网络更容易训练，LayerNorm 则稳定每一层输出的分布。

学习这类模型时，我习惯在纸上画出每个张量的形状变化。形状对上了，代码通常也就对了。
